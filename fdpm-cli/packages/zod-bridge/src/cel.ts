import type { z } from "zod";
import type { Constraint } from "./types.js";
import { BridgeError, getArrayElement, getChecks, unwrap } from "./walker.js";

/**
 * The 23-rule Zod-to-CEL translation table. See the workbook
 * howto-zod-to-fdpm-plugin §6, type:ZodToCelTranslationTable.
 *
 * `path` is the dotted CEL accessor against the workbook's `self` binding,
 * e.g. `self.field_values.name`. Callers pass `field_values.<field>` for a
 * top-level primitive field, with composition for nested struct/list members.
 */
export interface CelEmitContext {
  /** Dotted accessor on `self` for the value under check, e.g. `self.field_values.name`. */
  selfPath: string;
  /** Constraint id prefix, e.g. `acme.customer.name`. */
  namePrefix: string;
  /** Error level for emitted constraints. */
  level?: "error" | "warning";
}

export function zodSchemaToCelConstraints(
  schema: z.ZodType,
  ctx: CelEmitContext,
): Constraint[] {
  const out: Constraint[] = [];
  const u = unwrap(schema);
  const path = ctx.selfPath;
  const level = ctx.level ?? "error";

  // Modifier 22: nullable composes with inner constraints.
  // We emit `path == null || (<inner>)` only when nullable AND inner constraints exist.
  // For simplicity we emit inner constraints unconditionally; the host's CEL
  // evaluator coerces a null `self.x` to false on `.matches(...)` etc., so
  // strict-nullable + min(1) is a degenerate case. We document the limitation
  // and let .nullable() compose at the field level (required:false handles absence).

  const literalValue = (() => {
    const def = (u.inner as unknown as { _def?: { type?: string; values?: unknown[] } })._def;
    if (def?.type !== "literal") return undefined;
    return def.values?.[0];
  })();

  // Rule 23: literal
  if (literalValue !== undefined) {
    const lit = JSON.stringify(literalValue);
    out.push({
      name: `${ctx.namePrefix}.literal`,
      expression: `${path} == ${lit}`,
      level,
    });
    return out;
  }

  // Rule 16: enum
  if (u.type === "enum") {
    const def = (u.inner as unknown as { _def?: { entries?: Record<string, string> } })._def;
    const values = def?.entries ? Object.values(def.entries) : [];
    const list = values.map((v) => JSON.stringify(v)).join(", ");
    out.push({
      name: `${ctx.namePrefix}.enum`,
      expression: `${path} in [${list}]`,
      level,
    });
    return out;
  }

  if (u.type === "string") {
    for (const c of getChecks(u.inner)) {
      const checkKind = c.check;
      if (checkKind === "min_length") {
        out.push({
          name: `${ctx.namePrefix}.min_length`,
          expression: `size(${path}) >= ${c.minimum as number}`,
          level,
        });
      } else if (checkKind === "max_length") {
        out.push({
          name: `${ctx.namePrefix}.max_length`,
          expression: `size(${path}) <= ${c.maximum as number}`,
          level,
        });
      } else if (checkKind === "length_equals") {
        out.push({
          name: `${ctx.namePrefix}.length`,
          expression: `size(${path}) == ${c.length as number}`,
          level,
        });
      } else if (checkKind === "string_format") {
        const format = c.format as string;
        if (format === "regex") {
          const pattern = c.pattern as RegExp;
          if (pattern.flags && pattern.flags.length > 0) {
            // Rule 4 with flags: fall back to validator (lim:zod-regex-flags).
            continue;
          }
          out.push({
            name: `${ctx.namePrefix}.regex`,
            expression: `${path}.matches(${JSON.stringify(pattern.source)})`,
            level,
          });
        } else if (format === "starts_with") {
          out.push({
            name: `${ctx.namePrefix}.startsWith`,
            expression: `${path}.startsWith(${JSON.stringify(c.prefix as string)})`,
            level,
          });
        } else if (format === "ends_with") {
          out.push({
            name: `${ctx.namePrefix}.endsWith`,
            expression: `${path}.endsWith(${JSON.stringify(c.suffix as string)})`,
            level,
          });
        } else if (format === "includes") {
          out.push({
            name: `${ctx.namePrefix}.includes`,
            expression: `${path}.contains(${JSON.stringify(c.includes as string)})`,
            level,
          });
        } else if (format === "datetime" || format === "date" || format === "iso_datetime") {
          // cel-js does not allow `timestamp(x) != null`; force parse via a
          // tautology on the parsed value's year. Throws on invalid input,
          // satisfying the iso_datetime contract.
          out.push({
            name: `${ctx.namePrefix}.iso_datetime`,
            expression: `timestamp(${path}).getFullYear() > 0`,
            level,
          });
        }
        // Other string formats (email, url, uuid) fall back to validator.
      }
    }
    return out;
  }

  if (u.type === "number" || u.type === "int" || u.type === "bigint") {
    let isInt = false;
    for (const c of getChecks(u.inner)) {
      const checkKind = c.check;
      if (checkKind === "greater_than") {
        const inclusive = c.inclusive as boolean;
        const op = inclusive ? ">=" : ">";
        out.push({
          name: `${ctx.namePrefix}.gt`,
          expression: `${path} ${op} ${c.value as number}`,
          level,
        });
      } else if (checkKind === "less_than") {
        const inclusive = c.inclusive as boolean;
        const op = inclusive ? "<=" : "<";
        out.push({
          name: `${ctx.namePrefix}.lt`,
          expression: `${path} ${op} ${c.value as number}`,
          level,
        });
      } else if (checkKind === "multiple_of") {
        out.push({
          name: `${ctx.namePrefix}.multiple_of`,
          expression: `${path} % ${c.value as number} == 0`,
          level,
        });
      } else if (checkKind === "number_format") {
        const fmt = c.format as string;
        if (fmt === "safeint" || fmt === "int" || fmt === "int32" || fmt === "int64") {
          isInt = true;
        }
      }
    }
    if (isInt) {
      out.push({
        name: `${ctx.namePrefix}.int`,
        expression: `int(${path}) == ${path}`,
        level,
      });
    }
    return out;
  }

  if (u.type === "array") {
    for (const c of getChecks(u.inner)) {
      const checkKind = c.check;
      if (checkKind === "min_length") {
        out.push({
          name: `${ctx.namePrefix}.min_items`,
          expression: `size(${path}) >= ${c.minimum as number}`,
          level,
        });
      } else if (checkKind === "max_length") {
        out.push({
          name: `${ctx.namePrefix}.max_items`,
          expression: `size(${path}) <= ${c.maximum as number}`,
          level,
        });
      } else if (checkKind === "length_equals") {
        out.push({
          name: `${ctx.namePrefix}.length`,
          expression: `size(${path}) == ${c.length as number}`,
          level,
        });
      }
    }
    // Item-level constraints composed via .all(t, <inner>).
    const element = getArrayElement(u.inner);
    if (element) {
      const itemConstraints = zodSchemaToCelConstraints(element, {
        selfPath: "t",
        namePrefix: `${ctx.namePrefix}.item`,
        level,
      });
      for (const ic of itemConstraints) {
        out.push({
          name: ic.name,
          expression: `${path}.all(t, ${ic.expression})`,
          level: ic.level,
        });
      }
    }
    return out;
  }

  // Other types (object/struct, never, unknown) emit no top-level constraint;
  // their fields recurse separately when the struct is mapped.
  return out;
}

/** Re-exports for tests that want to assert per-rule emission. */
export { BridgeError };
