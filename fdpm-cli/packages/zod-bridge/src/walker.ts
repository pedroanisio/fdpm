import type { z } from "zod";

export interface ZodCheck {
  check: string;
  [key: string]: unknown;
}

export interface UnwrappedSchema {
  inner: z.ZodType;
  type: string;
  optional: boolean;
  nullable: boolean;
  defaulted: boolean;
  defaultValue?: unknown;
  brand: boolean;
}

const UNSUPPORTED_WRAPPERS = new Set([
  "promise",
  "function",
  "pipe",
]);

export class BridgeError extends Error {
  constructor(
    message: string,
    public readonly flag: string,
    public readonly evidence?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "BridgeError";
  }
}

export function unwrap(schema: z.ZodType): UnwrappedSchema {
  let cursor: z.ZodType = schema;
  let optional = false;
  let nullable = false;
  let defaulted = false;
  let defaultValue: unknown = undefined;
  let brand = false;

  for (let depth = 0; depth < 16; depth += 1) {
    const def = (cursor as unknown as { _def?: { type?: string; innerType?: z.ZodType; defaultValue?: unknown } })._def;
    if (!def) break;
    const type = def.type;

    if (type === "optional") {
      optional = true;
      cursor = def.innerType as z.ZodType;
      continue;
    }
    if (type === "nullable") {
      nullable = true;
      cursor = def.innerType as z.ZodType;
      continue;
    }
    if (type === "default") {
      defaulted = true;
      defaultValue = def.defaultValue;
      cursor = def.innerType as z.ZodType;
      continue;
    }
    if (type === "readonly") {
      cursor = def.innerType as z.ZodType;
      continue;
    }
    if (type === "branded" || type === "brand") {
      brand = true;
      cursor = def.innerType as z.ZodType;
      continue;
    }
    if (type && UNSUPPORTED_WRAPPERS.has(type)) {
      throw new BridgeError(
        `Zod node type \`${type}\` is not supported by the bridge.`,
        type === "function" || type === "promise"
          ? "flag:zod-function-promise"
          : "flag:zod-pipe-transform",
        { node_type: type },
      );
    }
    break;
  }

  const innerDef = (cursor as unknown as { _def?: { type?: string } })._def;
  return {
    inner: cursor,
    type: innerDef?.type ?? "unknown",
    optional,
    nullable,
    defaulted,
    defaultValue,
    brand,
  };
}

export function getChecks(schema: z.ZodType): ZodCheck[] {
  const def = (schema as unknown as {
    _def?: {
      checks?: Array<{ _zod?: { def?: ZodCheck } }>;
      check?: string;
      format?: string;
      [key: string]: unknown;
    };
  })._def;
  if (!def) return [];
  const out: ZodCheck[] = [];
  if (def.checks) {
    for (const c of def.checks) {
      const inner = c._zod?.def;
      if (inner) out.push(inner);
    }
  }
  // Top-level inline check (Zod v4 puts string_format on _def itself for
  // format-bound string types like z.iso.datetime()).
  if (def.check && typeof def.check === "string") {
    const inline: ZodCheck = { check: def.check };
    for (const [k, v] of Object.entries(def)) {
      if (k === "type" || k === "checks" || k === "innerType") continue;
      if (k === "check") continue;
      inline[k] = v;
    }
    out.push(inline);
  }
  return out;
}

export function getEnumValues(schema: z.ZodType): readonly string[] | undefined {
  const def = (schema as unknown as { _def?: { type?: string; entries?: Record<string, string> } })._def;
  if (def?.type !== "enum" || !def.entries) return undefined;
  return Object.values(def.entries);
}

export function getArrayElement(schema: z.ZodType): z.ZodType | undefined {
  const def = (schema as unknown as { _def?: { type?: string; element?: z.ZodType } })._def;
  if (def?.type !== "array") return undefined;
  return def.element;
}

export function getObjectShape(schema: z.ZodType): Record<string, z.ZodType> | undefined {
  const def = (schema as unknown as { _def?: { type?: string; shape?: Record<string, z.ZodType> } })._def;
  if (def?.type !== "object") return undefined;
  return def.shape;
}

export function getLiteralValue(schema: z.ZodType): unknown {
  const def = (schema as unknown as { _def?: { type?: string; values?: unknown[] } })._def;
  if (def?.type !== "literal") return undefined;
  return def.values?.[0];
}

export function isRecursive(schema: z.ZodType): boolean {
  const def = (schema as unknown as { _def?: { type?: string } })._def;
  return def?.type === "lazy";
}
