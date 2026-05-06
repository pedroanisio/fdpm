/**
 * Sidecar parse-time validator — SPEC-DOMAIN-SIDECAR §11.3.
 *
 * Runs the eight ordered passes plus the §2.3 pre-pass shape gates
 * and the §2.4 hash-manifest gates. On the first violation, throws a
 * SidecarError carrying a stable `code` and a structured `entry`
 * pointer to the offending sidecar entry.
 *
 * Contract: failure here aborts before emission. No partial output.
 *
 * The validator is referentially transparent: same domain in, same
 * decision out, no clock or network reads.
 */

import type { ZodObject, ZodRawShape, ZodType } from "zod";
import { getObjectShape, unwrap } from "./walker.js";
import type {
  Domain,
  EntitySpec,
  ReferenceSpec,
  VariantSpec,
} from "./sidecar-types.js";

/**
 * Algorithms this realization recognises in `__schemaHash.algorithm`.
 * Per SPEC-FDPM-BRIDGE-ZOD §7.1 the canonical algorithm is
 * `zod-ast-canonical-v1`. Realizations may extend this set.
 */
const SUPPORTED_HASH_ALGORITHMS = new Set<string>(["zod-ast-canonical-v1"]);

export type SidecarErrorCode =
  | "sidecar:missing-version"
  | "sidecar:incompatible-version"
  | "sidecar:missing-entities"
  | "sidecar:missing-fdpm"
  | "sidecar:hash-manifest-malformed"
  | "sidecar:hash-algorithm-unsupported"
  | "sidecar:hash-drift"
  | "sidecar:unknown-entity"
  | "sidecar:path-unresolved"
  | "sidecar:cross-aggregate-ownership"
  | "sidecar:self-aggregation"
  | "sidecar:inverse-target-mismatch"
  | "sidecar:inverse-field-missing"
  | "sidecar:variant-discriminator-mismatch"
  | "sidecar:variant-not-discriminated-union"
  | "sidecar:identity-field-missing"
  | "sidecar:identity-schema-mismatch"
  | "sidecar:natural-key-missing"
  | "sidecar:natural-key-forbidden"
  | "sidecar:natural-key-empty"
  | "sidecar:natural-key-optional"
  | "sidecar:natural-key-duplicate"
  | "sidecar:natural-key-non-scalar"
  | "sidecar:variant-local-from"
  | "sidecar:dnis-field-invalid";

export class SidecarError extends Error {
  constructor(
    public readonly code: SidecarErrorCode,
    message: string,
    public readonly entry?: Record<string, unknown>,
  ) {
    super(`${code}: ${message}`);
    this.name = "SidecarError";
  }
}

export interface ValidateResult {
  domain: Domain;
  /** Set of legal entity names (post-validation). */
  entityNames: ReadonlySet<string>;
}

export function validateDomain(domain: unknown): ValidateResult {
  if (!domain || typeof domain !== "object") {
    throw new SidecarError(
      "sidecar:missing-version",
      "domain must be an object produced by defineDomain()",
    );
  }
  const d = domain as Domain;

  // §2.3 — required-section gates.
  if (typeof d.__sidecarSpec !== "string") {
    throw new SidecarError(
      "sidecar:missing-version",
      "__sidecarSpec is required (declare \"0.1\")",
    );
  }
  if (d.__sidecarSpec !== "0.1") {
    throw new SidecarError(
      "sidecar:incompatible-version",
      `unsupported __sidecarSpec "${d.__sidecarSpec}"; this realization accepts "0.1"`,
    );
  }
  if (
    !d.entities ||
    typeof d.entities !== "object" ||
    Object.keys(d.entities).length === 0
  ) {
    throw new SidecarError(
      "sidecar:missing-entities",
      "entities map is required and must contain at least one entity",
    );
  }
  if (!d.fdpm || typeof d.fdpm !== "object") {
    throw new SidecarError(
      "sidecar:missing-fdpm",
      "fdpm section is required (pluginId, vendor, profileId, pluginVersion, hostCompatibility)",
    );
  }

  // §2.4 — hash manifest gates (only when present).
  if (d.__schemaHash !== undefined) {
    const h = d.__schemaHash as unknown;
    if (!h || typeof h !== "object") {
      throw new SidecarError(
        "sidecar:hash-manifest-malformed",
        "__schemaHash must be an object",
      );
    }
    const hh = h as { algorithm?: unknown; files?: unknown };
    if (typeof hh.algorithm !== "string" || hh.algorithm.length === 0) {
      throw new SidecarError(
        "sidecar:hash-manifest-malformed",
        "__schemaHash.algorithm must be a non-empty string",
      );
    }
    if (
      !hh.files ||
      typeof hh.files !== "object" ||
      Array.isArray(hh.files) ||
      Object.keys(hh.files as Record<string, unknown>).length === 0
    ) {
      throw new SidecarError(
        "sidecar:hash-manifest-malformed",
        "__schemaHash.files must be a non-empty Record<string,string>",
      );
    }
    if (!SUPPORTED_HASH_ALGORITHMS.has(hh.algorithm)) {
      throw new SidecarError(
        "sidecar:hash-algorithm-unsupported",
        `unknown hash algorithm "${hh.algorithm}"; this realization supports: ${Array.from(SUPPORTED_HASH_ALGORITHMS).join(", ")}`,
      );
    }
  }

  const entityNames = new Set(Object.keys(d.entities));

  // Pass 1 — schema-name resolution (references + aggregates).
  for (const ref of d.references ?? []) {
    if (!entityNames.has(ref.from)) {
      throw new SidecarError(
        "sidecar:unknown-entity",
        `references[].from "${ref.from}" is not in entities map`,
        { reference: ref },
      );
    }
    if (!entityNames.has(ref.to)) {
      throw new SidecarError(
        "sidecar:unknown-entity",
        `references[].to "${ref.to}" is not in entities map`,
        { reference: ref },
      );
    }
  }
  for (const agg of d.aggregates ?? []) {
    if (!entityNames.has(agg.root)) {
      throw new SidecarError(
        "sidecar:unknown-entity",
        `aggregates[].root "${agg.root}" is not in entities map`,
        { aggregate: agg },
      );
    }
    for (const part of agg.parts) {
      if (!entityNames.has(part)) {
        throw new SidecarError(
          "sidecar:unknown-entity",
          `aggregates[].parts contains "${part}" which is not in entities map`,
          { aggregate: agg, part },
        );
      }
    }
  }
  for (const v of d.variants ?? []) {
    if (!entityNames.has(v.from)) {
      throw new SidecarError(
        "sidecar:unknown-entity",
        `variants[].from "${v.from}" is not in entities map`,
        { variant: v },
      );
    }
  }

  // Pass 2 — path resolution (references-level only; variant-local
  // refs resolve in pass 7).
  for (const ref of d.references ?? []) {
    const sourceEntity = d.entities[ref.from] as EntitySpec;
    if (!resolveTopLevelPath(sourceEntity.schema, ref.field)) {
      throw new SidecarError(
        "sidecar:path-unresolved",
        `references[].field "${ref.field}" does not resolve on entity "${ref.from}"`,
        { reference: ref },
      );
    }
  }

  // Pass 3 — aggregate consistency.
  const partsClaimedBy = new Map<string, string>();
  for (const agg of d.aggregates ?? []) {
    if (agg.parts.includes(agg.root)) {
      throw new SidecarError(
        "sidecar:self-aggregation",
        `aggregates[].root "${agg.root}" appears in its own parts list`,
        { aggregate: agg },
      );
    }
    for (const part of agg.parts) {
      const prevRoot = partsClaimedBy.get(part);
      if (prevRoot && prevRoot !== agg.root) {
        throw new SidecarError(
          "sidecar:cross-aggregate-ownership",
          `part "${part}" is claimed by both "${prevRoot}" and "${agg.root}"`,
          { aggregate: agg, part, otherRoot: prevRoot },
        );
      }
      partsClaimedBy.set(part, agg.root);
    }
  }

  // Pass 4 — inverse pairing.
  for (const ref of d.references ?? []) {
    if (!ref.inverse) continue;
    if (!entityNames.has(ref.inverse.on)) {
      throw new SidecarError(
        "sidecar:unknown-entity",
        `inverse.on "${ref.inverse.on}" is not in entities map`,
        { reference: ref },
      );
    }
    if (ref.inverse.on !== ref.to) {
      throw new SidecarError(
        "sidecar:inverse-target-mismatch",
        `inverse.on "${ref.inverse.on}" must equal references[].to "${ref.to}"`,
        { reference: ref },
      );
    }
    const targetEntity = d.entities[ref.to] as EntitySpec;
    if (!resolveTopLevelPath(targetEntity.schema, ref.inverse.field)) {
      throw new SidecarError(
        "sidecar:inverse-field-missing",
        `inverse.field "${ref.inverse.field}" does not resolve on target entity "${ref.to}"`,
        { reference: ref },
      );
    }
  }

  // Pass 5 — variant consistency.
  for (const v of d.variants ?? []) {
    if (v.strategy !== "variant-per-primitive") continue;
    const parent = d.entities[v.from] as EntitySpec;
    const fieldType = topLevelFieldType(parent.schema, v.field);
    if (!fieldType) {
      throw new SidecarError(
        "sidecar:path-unresolved",
        `variants[].field "${v.field}" does not resolve on entity "${v.from}"`,
        { variant: v },
      );
    }
    const sourceDiscriminator = discriminatedUnionKey(fieldType);
    if (!sourceDiscriminator) {
      throw new SidecarError(
        "sidecar:variant-not-discriminated-union",
        `variants[].field "${v.from}.${v.field}" is not a discriminated union (variant-per-primitive requires z.discriminatedUnion)`,
        { variant: v },
      );
    }
    if (v.discriminator !== sourceDiscriminator) {
      throw new SidecarError(
        "sidecar:variant-discriminator-mismatch",
        `variants[].discriminator "${v.discriminator ?? "<absent>"}" does not match the source z.discriminatedUnion's key "${sourceDiscriminator}"`,
        { variant: v, sourceDiscriminator },
      );
    }
  }

  // Pass 6 — identity consistency.
  for (const [name, entity] of Object.entries(d.entities)) {
    validateIdentity(name, entity as EntitySpec);
  }

  // Pass 7 — variant-local references.
  for (const v of d.variants ?? []) {
    if (!v.references || v.references.length === 0) continue;
    if (v.strategy !== "variant-per-primitive") {
      // The only variant-local references that make sense are those
      // attached to per-variant primitives. payload-blob variants
      // can't carry per-arm references because they're stored as
      // opaque JSON.
      throw new SidecarError(
        "sidecar:variant-local-from",
        `variants[].references requires strategy "variant-per-primitive" (got "${v.strategy}")`,
        { variant: v },
      );
    }
    const parent = d.entities[v.from] as EntitySpec;
    const fieldType = topLevelFieldType(parent.schema, v.field);
    const arms = fieldType ? discriminatedUnionArms(fieldType) : null;
    if (!arms) {
      throw new SidecarError(
        "sidecar:variant-not-discriminated-union",
        `variants[].field "${v.from}.${v.field}" is not a discriminated union`,
        { variant: v },
      );
    }
    const generatedNames = new Set(generateVariantNames(v, arms));
    for (const vref of v.references) {
      if (!generatedNames.has(vref.from)) {
        throw new SidecarError(
          "sidecar:variant-local-from",
          `variants[].references[].from "${vref.from}" is not one of the generated per-variant primitive names: ${Array.from(generatedNames).join(", ")}`,
          { variant: v, variantReference: vref },
        );
      }
      if (!entityNames.has(vref.to)) {
        throw new SidecarError(
          "sidecar:unknown-entity",
          `variants[].references[].to "${vref.to}" is not in entities map`,
          { variant: v, variantReference: vref },
        );
      }
    }
  }

  // Pass 8 — DNIS field consistency.
  if (d.fdpm.dnis) {
    for (const m of d.fdpm.dnis.managedFields) {
      if (!entityNames.has(m.entity)) {
        throw new SidecarError(
          "sidecar:dnis-field-invalid",
          `dnis.managedFields[].entity "${m.entity}" is not in entities map`,
          { managedField: m },
        );
      }
      const entity = d.entities[m.entity] as EntitySpec;
      const fieldType = topLevelFieldType(entity.schema, m.field);
      if (!fieldType) {
        throw new SidecarError(
          "sidecar:dnis-field-invalid",
          `dnis.managedFields[].field "${m.entity}.${m.field}" does not resolve on the entity's schema`,
          { managedField: m },
        );
      }
      const u = unwrap(fieldType);
      if (u.type !== "string") {
        throw new SidecarError(
          "sidecar:dnis-field-invalid",
          `dnis.managedFields[].field "${m.entity}.${m.field}" must be z.string() (post-unwrap); got "${u.type}"`,
          { managedField: m, unwrappedType: u.type },
        );
      }
      if (!m.nodeKind || m.nodeKind.length === 0) {
        throw new SidecarError(
          "sidecar:dnis-field-invalid",
          `dnis.managedFields[].nodeKind must be a non-empty string`,
          { managedField: m },
        );
      }
      if (m.lineage !== undefined && m.lineage !== "track" && m.lineage !== "none") {
        throw new SidecarError(
          "sidecar:dnis-field-invalid",
          `dnis.managedFields[].lineage must be "track" or "none" when present; got "${m.lineage}"`,
          { managedField: m },
        );
      }
    }
  }

  return { domain: d, entityNames };
}

// ---------------------------------------------------------------------------
// Helpers — small, single-purpose, no side effects.
// ---------------------------------------------------------------------------

function validateIdentity(name: string, entity: EntitySpec): void {
  switch (entity.identityKind) {
    case "id-field": {
      if (!entity.idField) {
        throw new SidecarError(
          "sidecar:identity-field-missing",
          `entity "${name}" has identityKind "id-field" but no idField`,
          { entity: name },
        );
      }
      const ft = topLevelFieldType(entity.schema, entity.idField);
      if (!ft) {
        throw new SidecarError(
          "sidecar:identity-field-missing",
          `entity "${name}".idField "${entity.idField}" is not on the schema`,
          { entity: name },
        );
      }
      if (entity.idSchema) {
        const u = unwrap(ft);
        // Per SPEC-DOMAIN-SIDECAR §3.3: reference equality on the
        // Zod definition the idField points at. In Zod v4, `.describe()`
        // returns a fresh wrapper instance whose `_def` is the SAME
        // reference as the underlying schema — schema metadata, not a
        // new schema. The check therefore matches on `_def` identity
        // (or the wrapper itself, post-unwrap). This admits common
        // `.describe()` chains while still catching genuinely
        // independent z.string() / z.number() calls.
        const ftDef = (ft as unknown as { _def?: unknown })._def;
        const idDef = (entity.idSchema as unknown as { _def?: unknown })._def;
        const innerDef = (u.inner as unknown as { _def?: unknown })._def;
        const matches =
          u.inner === entity.idSchema ||
          ft === entity.idSchema ||
          (ftDef !== undefined && ftDef === idDef) ||
          (innerDef !== undefined && innerDef === idDef);
        if (!matches) {
          throw new SidecarError(
            "sidecar:identity-schema-mismatch",
            `entity "${name}".idSchema is not reference-equal to the type of field "${entity.idField}"`,
            { entity: name },
          );
        }
      }
      if (entity.naturalKey !== undefined) {
        throw new SidecarError(
          "sidecar:natural-key-forbidden",
          `entity "${name}" has identityKind "id-field" but declares naturalKey (only allowed when identityKind === "natural-key")`,
          { entity: name },
        );
      }
      return;
    }
    case "singleton": {
      if (entity.naturalKey !== undefined) {
        throw new SidecarError(
          "sidecar:natural-key-forbidden",
          `entity "${name}" has identityKind "singleton" but declares naturalKey`,
          { entity: name },
        );
      }
      return;
    }
    case "opaque": {
      if (entity.naturalKey !== undefined) {
        throw new SidecarError(
          "sidecar:natural-key-forbidden",
          `entity "${name}" has identityKind "opaque" but declares naturalKey`,
          { entity: name },
        );
      }
      return;
    }
    case "natural-key": {
      if (!entity.naturalKey || entity.naturalKey.length === 0) {
        throw new SidecarError(
          entity.naturalKey === undefined
            ? "sidecar:natural-key-missing"
            : "sidecar:natural-key-empty",
          `entity "${name}" has identityKind "natural-key" but naturalKey is ${entity.naturalKey === undefined ? "absent" : "empty"}`,
          { entity: name },
        );
      }
      const seen = new Set<string>();
      for (const k of entity.naturalKey) {
        if (seen.has(k)) {
          throw new SidecarError(
            "sidecar:natural-key-duplicate",
            `entity "${name}".naturalKey contains "${k}" twice`,
            { entity: name, key: k },
          );
        }
        seen.add(k);
        const ft = topLevelFieldType(entity.schema, k);
        if (!ft) {
          throw new SidecarError(
            "sidecar:identity-field-missing",
            `entity "${name}".naturalKey contains "${k}" but the schema has no such field`,
            { entity: name, key: k },
          );
        }
        const u = unwrap(ft);
        if (u.optional || u.nullable) {
          throw new SidecarError(
            "sidecar:natural-key-optional",
            `entity "${name}".naturalKey field "${k}" is optional or nullable; natural-key fields must be required`,
            { entity: name, key: k },
          );
        }
        // §3.4 — scalar primitives only.
        if (
          u.type !== "string" &&
          u.type !== "number" &&
          u.type !== "bigint" &&
          u.type !== "boolean" &&
          u.type !== "iso.datetime" &&
          u.type !== "iso.date" &&
          u.type !== "literal" &&
          u.type !== "enum"
        ) {
          throw new SidecarError(
            "sidecar:natural-key-non-scalar",
            `entity "${name}".naturalKey field "${k}" has non-scalar type "${u.type}"; only scalar primitives supported in v0.1`,
            { entity: name, key: k, type: u.type },
          );
        }
      }
      return;
    }
  }
}

/** Returns true iff `path` is a top-level field on the schema. */
function resolveTopLevelPath(
  schema: ZodObject<ZodRawShape>,
  path: string,
): boolean {
  return topLevelFieldType(schema, path) !== null;
}

/** Returns the Zod type of `path` on `schema`, or null if not present. */
function topLevelFieldType(
  schema: ZodObject<ZodRawShape>,
  path: string,
): ZodType | null {
  const shape = getObjectShape(schema);
  if (!shape) return null;
  const node = shape[path];
  return node ?? null;
}

/**
 * Returns the discriminator key of a discriminatedUnion, or null.
 *
 * Zod v4 reports `_def.type === "union"` for both z.union and
 * z.discriminatedUnion; the latter is identified by a non-null
 * `_def.discriminator` string.
 */
function discriminatedUnionKey(node: ZodType): string | null {
  const u = unwrap(node);
  if (u.type !== "union") return null;
  const def = (u.inner as unknown as { _def?: { discriminator?: unknown } })._def;
  if (!def) return null;
  return typeof def.discriminator === "string" ? def.discriminator : null;
}

/** Returns the option schemas of a discriminatedUnion, or null. */
function discriminatedUnionArms(node: ZodType): ZodType[] | null {
  const u = unwrap(node);
  if (u.type !== "union") return null;
  const def = (u.inner as unknown as { _def?: { options?: unknown; discriminator?: unknown } })._def;
  if (!def || !Array.isArray(def.options)) return null;
  if (typeof def.discriminator !== "string") return null;
  return def.options as ZodType[];
}

/** Compute the per-arm primitive names a variant emission would produce. */
export function generateVariantNames(
  v: VariantSpec,
  arms: ReadonlyArray<ZodType>,
): string[] {
  const pattern = v.primitiveNamePattern ?? "<from>_<variantTag>";
  const names: string[] = [];
  for (const arm of arms) {
    const tag = literalDiscriminatorTag(arm, v.discriminator ?? "");
    if (!tag) continue;
    names.push(
      pattern
        .replaceAll("<from>", v.from)
        .replaceAll("<field>", v.field)
        .replaceAll("<variantTag>", pascalCase(tag)),
    );
  }
  return names;
}

function literalDiscriminatorTag(
  arm: ZodType,
  discriminator: string,
): string | null {
  const shape = getObjectShape(arm);
  if (!shape || !discriminator) return null;
  const disc = shape[discriminator];
  if (!disc) return null;
  const def = (disc as unknown as { _def?: { type?: string; values?: unknown } })
    ._def;
  if (!def || def.type !== "literal") return null;
  const values = (def.values as unknown[]) ?? [];
  const v = values[0];
  return typeof v === "string" ? v : v == null ? null : String(v);
}

function pascalCase(s: string): string {
  return s
    .split(/[^A-Za-z0-9]+/)
    .filter((p) => p.length > 0)
    .map((p) => p[0]!.toUpperCase() + p.slice(1))
    .join("");
}

/** Re-export for downstream consumers that need the same walker primitives. */
export { unwrap, getObjectShape };

/** A reference-spec helper, exported because the orchestrator reuses it. */
export function isInverseDeclared(ref: ReferenceSpec): boolean {
  return ref.inverse !== undefined;
}
