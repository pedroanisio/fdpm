/**
 * Sidecar-driven orchestrator — SPEC-FDPM-BRIDGE §2.2 (seven artefacts)
 * + §11 (output contracts).
 *
 * Consumes a defineDomain() result; emits the seven artefacts:
 *
 *   1. DomainProfile          §11.1
 *   2. ValidatorFn per Entity §7
 *   3. ViewPageDescriptor     §11.2
 *   4. ProductPageBundle      §11.3
 *   5. MigrationHints         §11.4
 *   6. AuditLog               §11.5
 *   7. usl-ng-core.json       §11.6 (companion; standard sections only)
 *
 * The contract: failure aborts with no partial output. Success runs
 * deterministically (same inputs in -> byte-equal outputs).
 *
 * SPEC-FDPM-BRIDGE §8.1: when a sidecar is present, references emit
 * EXCLUSIVELY from `references[]`. Walker-inferred references from
 * the legacy v0.2.0 path are suppressed via opts.entities=[] and a
 * post-process that strips relations the per-primitive walker added.
 */

import { z } from "zod";
import { classifySchemas } from "./classifier.js";
import { zodSchemaToPrimitiveType } from "./primitive.js";
import {
  buildProductPageBundle,
  DEFAULT_FEATURE_FLAG_STATES,
} from "./product-page.js";
import { buildViewPageDescriptor } from "./view-page.js";
import { zodSchemaToValidator } from "./validator.js";
import { hashSchemaSource, recomputeSchemaHashes } from "./sidecar-hash.js";
import {
  emptyAudit,
  type SidecarAuditLog,
  type DivergenceEntry,
  type LossEntry,
} from "./sidecar-audit.js";
import {
  generateVariantNames,
  SidecarError,
  unwrap,
  validateDomain,
  getObjectShape,
} from "./sidecar-validator.js";
import type {
  Domain,
  DnisManagedField,
  EntitySpec,
  ReferenceSpec,
  VariantSpec,
} from "./sidecar-types.js";
import type {
  Constraint,
  DomainProfile,
  EnumDef,
  FieldDef,
  MigrationHints,
  PrimitiveTypeDef,
  ProductPageBundle,
  RelationTypeDef,
  ViewPageDescriptor,
} from "./types.js";

// Re-export the hash helper so tests can compute expected manifest values.
export { hashSchemaSource };

const REALIZATION_VERSION = "0.3.0";

/** Subset of the sidecar that the USL-NG companion serializes. */
export interface UslNgCompanion {
  __sidecarSpec: "0.1";
  entities: Record<string, { identityKind: string; idField?: string; naturalKey?: ReadonlyArray<string> }>;
  references?: ReadonlyArray<{
    from: string;
    field: string;
    to: string;
    cardinality: string;
    cascade?: string;
    inverse?: { on: string; field: string };
    acyclic?: boolean;
  }>;
  aggregates?: ReadonlyArray<{ root: string; parts: ReadonlyArray<string> }>;
  variants?: ReadonlyArray<{
    from: string;
    field: string;
    discriminator?: string;
    strategy: string;
  }>;
  liftOverrides?: Record<string, string>;
  declaredLoss?: ReadonlyArray<{
    feature: string;
    kind: string;
    classification: string;
    reason: string;
  }>;
}

export interface SidecarBridgeArgs {
  domain: Domain;
  /** Override the build-time clock for determinism in tests. */
  generatedAt?: string;
  /**
   * File contents keyed by the sidecar-relative path. Used to verify
   * `__schemaHash` and to populate ProductPageBundle.schemas.source_path.
   * Optional when no `__schemaHash` is declared.
   */
  schemaSources?: Record<string, string>;
}

export interface SidecarBridgeResult {
  profile: DomainProfile;
  viewPage: ViewPageDescriptor;
  productPage: ProductPageBundle;
  migrationHints: MigrationHints;
  audit: SidecarAuditLog;
  /** Per-Entity validator rule-id closed sets. */
  ruleIdsByType: Record<string, readonly string[]>;
  /** USL-NG Core JSON companion (standard sections only; §11.6). */
  uslNgCompanion: UslNgCompanion;
}

export function assembleDomainProfileFromSidecar(
  args: SidecarBridgeArgs,
): SidecarBridgeResult {
  const { entityNames } = validateDomain(args.domain);
  const domain = args.domain;
  const generatedAt = args.generatedAt ?? new Date(0).toISOString();

  // §4.4 — hash binding obligation. SPEC-FDPM-BRIDGE §14.1 defines
  // `sidecar:hash-drift` as the failure code.
  if (domain.__schemaHash) {
    const drift = recomputeSchemaHashes({
      manifestFiles: domain.__schemaHash.files,
      sources: args.schemaSources ?? {},
    });
    if (drift.length > 0) {
      const summary = drift
        .map((d) =>
          d.reason === "missing-source"
            ? `${d.file}: source not provided to bridge (declared ${d.declared})`
            : `${d.file}: declared ${d.declared}, computed ${d.computed}`,
        )
        .join("; ");
      throw new SidecarError(
        "sidecar:hash-drift",
        `__schemaHash recomputation found ${drift.length} drift entry/entries — ${summary}`,
        { drift },
      );
    }
  }

  // ---------------------------------------------------------------------
  // Pass A — emit base primitives and validators per entity. Use the
  // existing per-schema emitter; suppress its walker-inferred relations
  // (we emit references from the sidecar instead, per §8.1).
  // ---------------------------------------------------------------------

  const fdpm = domain.fdpm;
  const variantSchemasByEntityField = collectVariantArmSchemas(domain);
  const dnisFieldsByEntity = collectDnisFieldsByEntity(domain.fdpm.dnis);

  const primitives: PrimitiveTypeDef[] = [];
  const enums: EnumDef[] = [];
  const constraints: Constraint[] = [];
  const ruleIdsByType: Record<string, readonly string[]> = {};
  const allRuleIds = new Set<string>();
  const productSchemaSources: Record<string, string> = {};

  // Iterate in declared key order for determinism.
  for (const [name, entity] of Object.entries(domain.entities)) {
    // Build a possibly-modified schema if (a) the entity has variants
    // requiring split (we drop the variant field from the parent) or
    // (b) DNIS managed fields apply (we drop those fields from the
    // parent's emitted shape — the bridge promotes them to siblings
    // but never mutates the source schema; this drop is local).
    const variantFieldsToDrop = new Set<string>();
    for (const v of domain.variants ?? []) {
      if (v.from === name && v.strategy === "variant-per-primitive") {
        variantFieldsToDrop.add(v.field);
      }
    }
    const dnisFieldsToDrop = new Set<string>(
      dnisFieldsByEntity.get(name)?.map((m) => m.field) ?? [],
    );
    const schemaForEmission =
      variantFieldsToDrop.size + dnisFieldsToDrop.size === 0
        ? entity.schema
        : omitFields(entity.schema, [...variantFieldsToDrop, ...dnisFieldsToDrop]);

    const result = zodSchemaToPrimitiveType(name, schemaForEmission, {
      vendor: fdpm.vendor,
      profileId: fdpm.profileId,
      pluginVersion: fdpm.pluginVersion,
      hostCompatibility: fdpm.hostCompatibility,
      // Pass an empty entities[] so the v0.2.0 hybrid lift in the
      // walker behaves as ValueObject-by-default; sidecar entities[]
      // is the source of truth in this orchestrator.
      entities: [],
    });
    primitives.push(result.primitive);
    // §8.1 — DROP walker-inferred relations.
    enums.push(...result.enums);
    constraints.push(...result.constraints);

    const validatorResult = zodSchemaToValidator(schemaForEmission, {
      pluginId: fdpm.pluginId,
      typeName: name.toLowerCase(),
    });
    ruleIdsByType[result.primitive.id] = validatorResult.ruleIds;
    for (const rid of validatorResult.ruleIds) allRuleIds.add(rid);

    productSchemaSources[name] = `domain.entities.${name}.schema`;
  }

  // ---------------------------------------------------------------------
  // Pass B — variant splitting (variant-per-primitive only).
  // For each variant, emit one PrimitiveTypeDef per arm and a parent
  // -> arm relation per arm.
  // ---------------------------------------------------------------------

  const variantRelations: RelationTypeDef[] = [];
  for (const v of domain.variants ?? []) {
    if (v.strategy !== "variant-per-primitive") continue;
    const armSchemas = variantSchemasByEntityField.get(`${v.from}.${v.field}`);
    if (!armSchemas) continue;
    const armNames = generateVariantNames(v, armSchemas);
    armSchemas.forEach((armSchema, idx) => {
      const armName = armNames[idx];
      if (!armName) return;
      const armResult = zodSchemaToPrimitiveType(armName, armSchema, {
        vendor: fdpm.vendor,
        profileId: fdpm.profileId,
        pluginVersion: fdpm.pluginVersion,
        hostCompatibility: fdpm.hostCompatibility,
        entities: [],
      });
      primitives.push(armResult.primitive);
      enums.push(...armResult.enums);
      constraints.push(...armResult.constraints);

      const armValidatorResult = zodSchemaToValidator(armSchema, {
        pluginId: fdpm.pluginId,
        typeName: armName.toLowerCase(),
      });
      ruleIdsByType[armResult.primitive.id] = armValidatorResult.ruleIds;
      for (const rid of armValidatorResult.ruleIds) allRuleIds.add(rid);

      // Parent -> arm relation. Cardinality is many-to-one (every
      // parent picks at most one arm).
      const armSuffix = armName.slice(`${v.from}_`.length); // tag (e.g., "Plain")
      variantRelations.push({
        id: `${fdpm.vendor}:${v.from}${capitalize(v.field)}${armSuffix}`,
        source_type_id: `${fdpm.vendor}:${v.from}`,
        target_type_id: `${fdpm.vendor}:${armName}`,
        cardinality: "many-to-one",
        fields: [],
      });
    });
  }

  // ---------------------------------------------------------------------
  // Pass C — DNIS managed-field sibling emission.
  // For each managed field, emit a dnis:Node primitive + a
  // <vendor>:<Entity>Has<FieldPascal> relation. The dnis:Document is
  // host-managed; we record divergences for every promoted field.
  // ---------------------------------------------------------------------

  const dnisRelations: RelationTypeDef[] = [];
  const dnisDivergences: DivergenceEntry[] = [];
  if (domain.fdpm.dnis) {
    for (const m of domain.fdpm.dnis.managedFields) {
      const sibId = `${fdpm.vendor}:${m.entity}${capitalize(m.field)}Node`;
      primitives.push({
        id: sibId,
        fields: [
          { name: "kind", kind: "string", required: true },
          { name: "content", kind: "string", required: true },
        ],
      });
      dnisRelations.push({
        id: `${fdpm.vendor}:${m.entity}Has${capitalize(m.field)}`,
        source_type_id: `${fdpm.vendor}:${m.entity}`,
        target_type_id: sibId,
        cardinality: "one-to-one",
        fields: [],
      });
      dnisDivergences.push({
        feature: "dnis.field-promoted",
        reason: `field "${m.entity}.${m.field}" promoted to dnis:Node sibling (kind=${m.nodeKind}, lineage=${m.lineage ?? "none"})`,
        evidence: { entity: m.entity, field: m.field, nodeKind: m.nodeKind },
      });
    }
  }

  // ---------------------------------------------------------------------
  // Pass D — references emission (§8.1, §8.2, §8.3, §8.4, §8.5).
  // ---------------------------------------------------------------------

  const sidecarRelations: RelationTypeDef[] = [];
  const cascadeDivergences: DivergenceEntry[] = [];
  const aggregateRoots = aggregateRootsByPart(domain);
  for (const ref of domain.references ?? []) {
    const cardinality = mapCardinality(ref.cardinality);
    const id = `${fdpm.vendor}:${ref.from}${capitalize(ref.field)}`;
    sidecarRelations.push({
      id,
      source_type_id: `${fdpm.vendor}:${ref.from}`,
      target_type_id: `${fdpm.vendor}:${ref.to}`,
      cardinality,
      fields: [],
    });
    // Effective cascade: explicit > aggregate-default > "set-null".
    const aggRoot = aggregateRoots.get(ref.from);
    const isOwnership = aggRoot === ref.to;
    const explicit = ref.cascade;
    if (!explicit && isOwnership) {
      cascadeDivergences.push({
        feature: "aggregate.cascade-default",
        reason: `reference ${ref.from}.${ref.field} -> ${ref.to} defaults to cascade because ${ref.to} owns ${ref.from} via aggregate`,
        evidence: { reference: ref, effectiveCascade: "cascade" },
      });
    }
    // §8.5 — acyclic CEL constraint.
    if (ref.acyclic && ref.from === ref.to) {
      constraints.push({
        name: `${fdpm.vendor}.${ref.from.toLowerCase()}.acyclic-${ref.field}`,
        expression: `graph.acyclic("${id}")`,
        level: "error",
      });
    }
  }

  // ---------------------------------------------------------------------
  // Pass E — assemble DomainProfile + downstream artefacts.
  // ---------------------------------------------------------------------

  const relations: RelationTypeDef[] = [
    ...sidecarRelations,
    ...variantRelations,
    ...dnisRelations,
  ];

  const profile: DomainProfile = {
    id: fdpm.profileId,
    primitive_types: primitives,
    relation_types: relations,
    ...(enums.length ? { enum_defs: dedupeEnums(enums) } : {}),
    ...(constraints.length ? { constraints } : {}),
  };

  const viewPage = buildViewPageDescriptor(
    fdpm.pluginId,
    primitives,
    {
      vendor: fdpm.vendor,
      profileId: fdpm.profileId,
      ...(fdpm.viewPageOverrides
        ? { viewPageOverrides: fdpm.viewPageOverrides as Record<string, never> }
        : {}),
    },
    generatedAt,
  );

  // declaredLoss flows through ProductPageBundle as feature flags.
  const lossFlags = (domain.declaredLoss ?? []).map((l) => ({
    flag: `declared-loss:${l.feature}`,
    state: "behind-flag" as const,
    reason: `${l.kind} (${l.classification}): ${l.reason}`,
  }));

  const productPage = buildProductPageBundle({
    pluginId: fdpm.pluginId,
    pluginVersion: fdpm.pluginVersion,
    profileId: fdpm.profileId,
    hostCompatibility: fdpm.hostCompatibility,
    primitives,
    relations,
    schemaSources: productSchemaSources,
    validatorRuleIds: Array.from(allRuleIds).sort(),
    featureFlagStates: [...DEFAULT_FEATURE_FLAG_STATES, ...lossFlags],
  });

  const migrationHints: MigrationHints = {
    profile_id: fdpm.profileId,
    generated_at: generatedAt,
    steps: [],
  };

  // ---------------------------------------------------------------------
  // Pass F — AuditLog.
  // ---------------------------------------------------------------------

  // Run the same classifier the v0.2.0 path uses, with the sidecar's
  // entities map as the explicit-entities list.
  const classifierAudit = classifySchemas({
    schemas: Object.fromEntries(
      Object.entries(domain.entities).map(([n, e]) => [n, e.schema]),
    ),
    explicitEntities: Object.keys(domain.entities),
  }).audit;

  const audit = emptyAudit({
    realizationVersion: REALIZATION_VERSION,
    generatedAt,
    sidecarSpecVersion: domain.__sidecarSpec,
    classifierAudit,
  });
  audit.divergences.push(...cascadeDivergences, ...dnisDivergences);
  for (const l of domain.declaredLoss ?? []) {
    const entry: LossEntry = {
      feature: l.feature,
      kind: l.kind,
      classification: l.classification,
      reason: l.reason,
    };
    audit.losses.push(entry);
  }

  // ---------------------------------------------------------------------
  // Pass G — usl-ng-core.json companion (standard sections only).
  // §12 of SPEC-DOMAIN-SIDECAR + §11.6 of SPEC-FDPM-BRIDGE.
  // ---------------------------------------------------------------------

  const uslNgCompanion: UslNgCompanion = {
    __sidecarSpec: "0.1",
    entities: Object.fromEntries(
      Object.entries(domain.entities).map(([name, e]) => {
        const entry: { identityKind: string; idField?: string; naturalKey?: ReadonlyArray<string> } = {
          identityKind: e.identityKind,
        };
        if (e.idField) entry.idField = e.idField;
        if (e.naturalKey) entry.naturalKey = [...e.naturalKey];
        return [name, entry];
      }),
    ),
    ...(domain.references
      ? {
          references: domain.references.map((r) => {
            const entry: {
              from: string;
              field: string;
              to: string;
              cardinality: string;
              cascade?: string;
              inverse?: { on: string; field: string };
              acyclic?: boolean;
            } = {
              from: r.from,
              field: r.field,
              to: r.to,
              cardinality: r.cardinality,
            };
            if (r.cascade !== undefined) entry.cascade = r.cascade;
            if (r.inverse !== undefined) entry.inverse = { ...r.inverse };
            if (r.acyclic !== undefined) entry.acyclic = r.acyclic;
            return entry;
          }),
        }
      : {}),
    ...(domain.aggregates
      ? {
          aggregates: domain.aggregates.map((a) => ({
            root: a.root,
            parts: [...a.parts],
          })),
        }
      : {}),
    ...(domain.variants
      ? {
          variants: domain.variants.map((v) => {
            const entry: {
              from: string;
              field: string;
              discriminator?: string;
              strategy: string;
            } = {
              from: v.from,
              field: v.field,
              strategy: v.strategy,
            };
            if (v.discriminator !== undefined) entry.discriminator = v.discriminator;
            return entry;
          }),
        }
      : {}),
    ...(domain.liftOverrides
      ? { liftOverrides: { ...domain.liftOverrides } }
      : {}),
    ...(domain.declaredLoss
      ? {
          declaredLoss: domain.declaredLoss.map((l) => ({
            feature: l.feature,
            kind: l.kind,
            classification: l.classification,
            reason: l.reason,
          })),
        }
      : {}),
  };

  return {
    profile,
    viewPage,
    productPage,
    migrationHints,
    audit,
    ruleIdsByType,
    uslNgCompanion,
  };
}

// ===========================================================================
// Helpers
// ===========================================================================

function mapCardinality(c: ReferenceSpec["cardinality"]): RelationTypeDef["cardinality"] {
  // FDPM RelationTypeDef supports a subset of the four sidecar values.
  // many-to-one and one-to-many both map to many-to-one in FDPM since
  // RelationTypeDef carries a single direction; the inverse is
  // implicit in the source/target ordering.
  if (c === "one-to-one") return "one-to-one";
  if (c === "many-to-many") return "many-to-many";
  // many-to-one + one-to-many both flatten to many-to-one in FDPM.
  return "many-to-one";
}

function capitalize(s: string): string {
  if (!s) return s;
  return s[0]!.toUpperCase() + s.slice(1);
}

function dedupeEnums(enums: EnumDef[]): EnumDef[] {
  const byId = new Map<string, EnumDef>();
  for (const e of enums) {
    if (!byId.has(e.id)) byId.set(e.id, e);
  }
  return Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id));
}

function aggregateRootsByPart(domain: Domain): Map<string, string> {
  const m = new Map<string, string>();
  for (const a of domain.aggregates ?? []) {
    for (const p of a.parts) m.set(p, a.root);
  }
  return m;
}

function collectVariantArmSchemas(
  domain: Domain,
): Map<string, z.ZodObject<z.ZodRawShape>[]> {
  const out = new Map<string, z.ZodObject<z.ZodRawShape>[]>();
  for (const v of domain.variants ?? []) {
    if (v.strategy !== "variant-per-primitive") continue;
    const parent = domain.entities[v.from] as EntitySpec | undefined;
    if (!parent) continue;
    const shape = getObjectShape(parent.schema);
    const fieldNode = shape ? shape[v.field] : undefined;
    if (!fieldNode) continue;
    const u = unwrap(fieldNode);
    const def = (u.inner as unknown as { _def?: { options?: unknown; discriminator?: unknown } })._def;
    if (!def || !Array.isArray(def.options)) continue;
    if (typeof def.discriminator !== "string") continue;
    out.set(`${v.from}.${v.field}`, def.options as z.ZodObject<z.ZodRawShape>[]);
  }
  return out;
}

function collectDnisFieldsByEntity(
  dnis: Domain["fdpm"]["dnis"],
): Map<string, DnisManagedField[]> {
  const out = new Map<string, DnisManagedField[]>();
  if (!dnis) return out;
  for (const m of dnis.managedFields) {
    const list = out.get(m.entity) ?? [];
    list.push(m);
    out.set(m.entity, list);
  }
  return out;
}

/**
 * Return a copy of `schema` with the named top-level fields omitted.
 * Used so the per-entity primitive emitter doesn't see fields that
 * have been split into variants or promoted to DNIS siblings.
 *
 * Implementation detail: we rebuild a fresh z.object() from the
 * filtered shape rather than calling .omit() — Zod v4's .omit signature
 * takes a Record<keyof, true>; spreading a programmatically-built one
 * is awkward to type, and the round trip via z.object() preserves
 * the per-field Zod nodes by reference, so anything downstream that
 * uses `===` to detect field types still works.
 */
function omitFields(
  schema: z.ZodObject<z.ZodRawShape>,
  fields: string[],
): z.ZodObject<z.ZodRawShape> {
  const drop = new Set(fields);
  const shape = getObjectShape(schema);
  if (!shape) return schema;
  const next: Record<string, z.ZodType> = {};
  for (const [k, v] of Object.entries(shape) as [string, z.ZodType][]) {
    if (!drop.has(k)) next[k] = v;
  }
  return z.object(next as z.ZodRawShape);
}

// Re-export for downstream consumers.
export type { SidecarAuditLog } from "./sidecar-audit.js";
