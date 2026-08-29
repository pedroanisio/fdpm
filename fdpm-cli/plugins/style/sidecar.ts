/**
 * Style plugin sidecar — the single source of truth for the bridge
 * derivation, shared by activate() at runtime and scripts/run-bridge.ts at
 * build time.
 *
 * WHAT THE BRIDGE SEES. Fifteen entities, each identified by its own id
 * field. Every entity holds intrinsic values only.
 *
 * WHAT THE BRIDGE DOES NOT SEE, AND WHY. The source schema's
 * cross-references are polymorphic in one direction and cyclic in another:
 * `style:DeclaresRule` originates from any of ten grammar sections, and
 * `style:InfluencesStyle` is explicitly cycle-permitting
 * (style-schema.ts GRAPH_TOPOLOGY:3409). The sidecar's `ReferenceSpec`
 * emits one relation with a single `target_type_id`
 * (packages/zod-bridge/src/sidecar-orchestrator.ts, pass D), which cannot
 * express a ten-member source set. The host can — `RelationTypeDef
 * .source_types` / `target_types` accept a list (src/core/models/meta.ts)
 * — so the ten relation types are author-declared here and merged into the
 * generated profile by finalizeProfile(). They are covered by the same
 * drift gate as everything the bridge writes.
 *
 * WHY RELATIONS RATHER THAN FIELDS. The source resolves every cross-
 * reference against a closed-world StyleRegistry and enumerates the
 * resolution failures as validator errors. As relations, the same
 * guarantee is a host invariant: the §7 pipeline rejects a relation whose
 * source or target primitive does not exist
 * (src/core/validation/pipeline.ts:682-690). The registry's closed world
 * becomes the workbook's closed world, checked on every write rather than
 * on demand.
 */

import { z } from "zod";
import { defineDomain } from "@fdpm/zod-bridge";
import {
  GRAMMAR_SECTIONS,
  Schemas,
  StyleId,
  MovementId,
  ReferenceId,
  RuleId,
  CheckId,
  ReferenceRole,
  STYLE_SCHEMA_VERSION,
  type StyleEntityName,
} from "./schemas/style.js";

export const PROFILE_ID = "profile:style:3.1" as const;
export const PLUGIN_ID = "fdpm.style" as const;
/**
 * 0.2.0 — additive: three document views (text/html, image/svg+xml,
 * image/png) joined the markdown outline. The profile is unchanged, so
 * `PROFILE_ID` stays at 3.1: no primitive type, relation type or field
 * moved, and a 0.1.0 workbook renders under 0.2.0 without migration.
 */
export const PLUGIN_VERSION = "0.2.0" as const;
export const HOST_COMPATIBILITY = ">=1.2,<2" as const;
export const VENDOR = "style" as const;

export const ENTITY_SCHEMAS = Schemas;
export type EntityName = StyleEntityName;
export const ENTITY_NAMES = Object.keys(ENTITY_SCHEMAS) as EntityName[];

/** `style:<Entity>` — the PrimitiveTypeDef id the bridge emits. */
export function primitiveTypeId(name: EntityName): string {
  return `${VENDOR}:${name}`;
}

/** `style:<Entity>:<slug>` — matches the bridge's `{slug}` id template. */
export function primitiveId(name: EntityName, slug: string): string {
  return `${VENDOR}:${name}:${slug}`;
}

/** The ten grammar-section entities, in the source's declaration order. */
export const GRAMMAR_ENTITIES = [
  "LineGrammar",
  "ColorGrammar",
  "FormGrammar",
  "SpatialGrammar",
  "SurfaceGrammar",
  "TypographyGrammar",
  "CompositionGrammar",
  "ContrastGrammar",
  "IconographyGrammar",
  "MotionGrammar",
] as const satisfies readonly EntityName[];

export const GRAMMAR_TYPE_IDS = GRAMMAR_ENTITIES.map((n) => primitiveTypeId(n));

export const REL = {
  HasGrammar: "style:HasGrammar",
  DeclaresRule: "style:DeclaresRule",
  DeclaresCheck: "style:DeclaresCheck",
  TestsRule: "style:TestsRule",
  CitesExemplar: "style:CitesExemplar",
  HasReference: "style:HasReference",
  BelongsToMovement: "style:BelongsToMovement",
  NegatesMovement: "style:NegatesMovement",
  InfluencesStyle: "style:InfluencesStyle",
  ParentMovement: "style:ParentMovement",
} as const;

export type RelationName = keyof typeof REL;

interface RelationTypeSpec {
  id: string;
  name: string;
  description: string;
  source_types: readonly string[];
  target_types: readonly string[];
  cardinality: "one-to-one" | "one-to-many" | "many-to-one" | "many-to-many";
  fields: ReadonlyArray<Record<string, unknown>>;
}

/**
 * The ten typed edges. Each names the source construct it replaces,
 * because that field is gone from the entity schema and this is the only
 * place the correspondence is written down.
 */
export const RELATION_TYPES: readonly RelationTypeSpec[] = [
  {
    id: REL.HasGrammar,
    name: "has_grammar",
    description:
      "StyleDefinition.grammar.<section> — the ten grammar sections the style is composed of. Exactly one edge per section; ../invariants.ts enforces completeness.",
    source_types: [primitiveTypeId("Style")],
    target_types: GRAMMAR_TYPE_IDS,
    cardinality: "one-to-many",
    fields: [
      {
        name: "section",
        kind: "enum",
        required: true,
        description: "Which of the ten grammar sections this edge carries.",
        enum_values: [...GRAMMAR_SECTIONS],
        validations: [],
      },
    ],
  },
  {
    id: REL.DeclaresRule,
    name: "declares_rule",
    description:
      "The `rules` and `prohibitions` arrays of the source's `Ruled` base. The Rule's own `kind` distinguishes the two, so one edge type serves both buckets.",
    source_types: GRAMMAR_TYPE_IDS,
    target_types: [primitiveTypeId("Rule")],
    cardinality: "one-to-many",
    fields: [],
  },
  {
    id: REL.DeclaresCheck,
    name: "declares_check",
    description: "ComplianceSpec.checks — the falsifiable criteria the style is judged by.",
    source_types: [primitiveTypeId("Style")],
    target_types: [primitiveTypeId("ComplianceCheck")],
    cardinality: "one-to-many",
    fields: [],
  },
  {
    id: REL.TestsRule,
    name: "tests_rule",
    description:
      "ComplianceCheck.testsRule — the rule this check operationalises. Exactly one per check; the check's weight must equal the rule's.",
    source_types: [primitiveTypeId("ComplianceCheck")],
    target_types: [primitiveTypeId("Rule")],
    cardinality: "many-to-one",
    fields: [],
  },
  {
    id: REL.CitesExemplar,
    name: "cites_exemplar",
    description:
      "Rule.exemplars — canonical references demonstrating the rule. A rule of weight `defining` must have at least one.",
    source_types: [primitiveTypeId("Rule")],
    target_types: [primitiveTypeId("CanonicalReference")],
    cardinality: "many-to-many",
    fields: [],
  },
  {
    id: REL.HasReference,
    name: "has_reference",
    description:
      "CanonicalReferences.primary / .secondary / .counterExamples. The bucket is an edge field, not a reference field, because the same work can be primary for one style and a counter-example for another.",
    source_types: [primitiveTypeId("Style")],
    target_types: [primitiveTypeId("CanonicalReference")],
    cardinality: "one-to-many",
    fields: [
      {
        name: "role",
        kind: "enum",
        required: true,
        description: "Which reference bucket this work occupies for this style.",
        enum_values: [...ReferenceRole.options],
        validations: [],
      },
    ],
  },
  {
    id: REL.BelongsToMovement,
    name: "belongs_to_movement",
    description: "StyleIdentity.parentMovement — the movement or school the style belongs to. Absent edge = no parent.",
    source_types: [primitiveTypeId("Style")],
    target_types: [primitiveTypeId("Movement")],
    cardinality: "many-to-one",
    fields: [],
  },
  {
    id: REL.NegatesMovement,
    name: "negates_movement",
    description: "StyleIdentity.negatedMovements — movements this style directly reacted against.",
    source_types: [primitiveTypeId("Style")],
    target_types: [primitiveTypeId("Movement")],
    cardinality: "many-to-many",
    fields: [],
  },
  {
    id: REL.InfluencesStyle,
    name: "influences_style",
    description:
      "StyleIdentity.influencedStyles. GRAPH_TOPOLOGY declares cycles PERMITTED here — reciprocal avant-garde exchange is historically attested — so traversals must maintain a visited set. Self-loops are rejected by ../invariants.ts.",
    source_types: [primitiveTypeId("Style")],
    target_types: [primitiveTypeId("Style")],
    cardinality: "many-to-many",
    fields: [],
  },
  {
    id: REL.ParentMovement,
    name: "parent_movement",
    description:
      "MovementEntry.parentMovement. GRAPH_TOPOLOGY declares cycles FORBIDDEN here: the movement graph is a forest, enforced by ../invariants.ts.",
    source_types: [primitiveTypeId("Movement")],
    target_types: [primitiveTypeId("Movement")],
    cardinality: "many-to-one",
    fields: [],
  },
];

export const PROFILE_NAME = "Style" as const;
export const PROFILE_LABEL = "Visual Style Definition 3.1.0" as const;
export const PROFILE_DESCRIPTION =
  "Bridge-generated from schemas/style.ts — a normalisation of _ingest_bin/style-schema.ts v3.1.0. Fifteen entities as primitives (Style, Movement, the ten grammar sections, Rule, ComplianceCheck, CanonicalReference) and ten typed edges for grammar composition, rule declaration, compliance linkage, exemplar citation, reference buckets and movement lineage. A workbook is one StyleRegistry: the closed world against which every cross-reference resolves." as const;

/**
 * The bridge emits id / primitive_types / relation_types (+ extras). This
 * adds the profile identity the host lists by, and merges the
 * author-declared relation types. Applied by BOTH scripts/run-bridge.ts
 * (into generated/profile.json) and activate(), so the drift test proves
 * the runtime profile is the file on disk.
 */
export function finalizeProfile<T extends { id: string; relation_types?: readonly unknown[] }>(
  profile: T,
): T & { version: string; name: string; label: string; description: string } {
  const clean = JSON.parse(JSON.stringify(profile)) as T;
  const generated = Array.isArray(clean.relation_types) ? clean.relation_types : [];
  return {
    ...clean,
    relation_types: [...generated, ...JSON.parse(JSON.stringify(RELATION_TYPES))],
    version: STYLE_SCHEMA_VERSION,
    name: PROFILE_NAME,
    label: PROFILE_LABEL,
    description: PROFILE_DESCRIPTION,
  };
}

function asEntity(schema: unknown): z.ZodObject<z.ZodRawShape> {
  return schema as z.ZodObject<z.ZodRawShape>;
}

/** The id field and its carrier schema, per entity. */
const IDENTITY: Record<EntityName, { field: string; schema: z.ZodType }> = {
  Style: { field: "style_id", schema: StyleId },
  Movement: { field: "movement_id", schema: MovementId },
  LineGrammar: { field: "grammar_id", schema: z.string() },
  ColorGrammar: { field: "grammar_id", schema: z.string() },
  FormGrammar: { field: "grammar_id", schema: z.string() },
  SpatialGrammar: { field: "grammar_id", schema: z.string() },
  SurfaceGrammar: { field: "grammar_id", schema: z.string() },
  TypographyGrammar: { field: "grammar_id", schema: z.string() },
  CompositionGrammar: { field: "grammar_id", schema: z.string() },
  ContrastGrammar: { field: "grammar_id", schema: z.string() },
  IconographyGrammar: { field: "grammar_id", schema: z.string() },
  MotionGrammar: { field: "grammar_id", schema: z.string() },
  Rule: { field: "rule_id", schema: RuleId },
  ComplianceCheck: { field: "check_id", schema: CheckId },
  CanonicalReference: { field: "reference_id", schema: ReferenceId },
};

const DOC: Record<EntityName, string> = {
  Style:
    "A style's document head: identity, philosophy, provenance and the production token layer. Grammar, rules, checks, references and lineage hang off it as relations.",
  Movement:
    "A movement or school. Intentionally thin — identity and lineage only. A movement with its own full grammar is a Style, not a Movement.",
  LineGrammar:
    "Whether lines exist at all and, when they do, their weight profile, roles, quality and contour hierarchy.",
  ColorGrammar:
    "Palette, forbidden colours, application technique, colour relationships and the single source of truth for light and shadow depiction.",
  FormGrammar: "The shape primitives, proportion system, symmetry, edge treatment and structural exposure.",
  SpatialGrammar: "Perspective system, depth encoding and how the composition treats its frame.",
  SurfaceGrammar: "Rendering methods, material honesty and dominant texture.",
  TypographyGrammar: "Typeface assignments per role, type-image relation, baseline grid and letter spacing.",
  CompositionGrammar: "Layout system, hierarchy methods, negative space and bleed intent.",
  ContrastGrammar: "Tonal range and the functional roles tonal contrast plays.",
  IconographyGrammar: "Recurring motifs and how the human figure is treated, including per-subgenre variation.",
  MotionGrammar: "Whether the style has motion grammar and, when it does, its abstract character.",
  Rule: "A requirement or a prohibition — the falsifiable claims that define the style's boundary.",
  ComplianceCheck:
    "A falsifiable criterion operationalising exactly one Rule: binary, threshold or qualitative.",
  CanonicalReference:
    "A named artifact from which the grammar can be reverse-engineered, or against which its boundary is drawn.",
};

export function buildStyleSidecar() {
  const entities = Object.fromEntries(
    ENTITY_NAMES.map((name) => [
      name,
      {
        schema: asEntity(ENTITY_SCHEMAS[name]),
        identityKind: "id-field" as const,
        idField: IDENTITY[name].field,
        doc: DOC[name],
      },
    ]),
  );

  return defineDomain({
    __sidecarSpec: "0.1",
    entities,
    aggregates: [
      {
        root: "Style",
        parts: [...GRAMMAR_ENTITIES, "Rule", "ComplianceCheck"],
        doc: "A style owns its ten grammar sections, its rules and its compliance checks; deleting the style deletes them. Rule is owned by the Style rather than by the declaring grammar section because a rule id is unique per style, not per section (source: 'Rule IDs must be globally unique within a style'), and because the sidecar spec admits exactly one aggregate root per part. Which section declares a rule is carried by style:DeclaresRule. CanonicalReference and Movement are shared across styles and are NOT parts.",
      },
    ],
    declaredLoss: [
      {
        feature: "style.type-layer-transcription",
        kind: "soundness-loss" as const,
        classification: "complete-but-not-sound" as const,
        reason:
          "The source is type-level TypeScript: eleven branded scalar types and twelve smart constructors that are erased at runtime (style-schema.ts PIPELINE NOTE:96-107). Each brand is re-expressed as a Zod schema carrying the same regex or numeric bound, so every value is still checked — but nominal distinctness is gone. A RuleId and a ReferenceId are both strings at the host boundary, and nothing stops one being written where the other belongs except the relation endpoints' type constraints.",
      },
      {
        feature: "style.field-name-normalisation",
        kind: "soundness-loss" as const,
        classification: "complete-but-not-sound" as const,
        reason:
          "FieldDef.name must match ^[a-z][a-z0-9_]*$ (src/core/models/meta.ts), so every camelCase source field is snake_cased: paletteDerivationRule becomes palette_derivation_rule, figureTreatmentsBySubgenre becomes figure_treatments_by_subgenre. The mapping is mechanical and reversible; an exporter back to the source shape must apply the inverse.",
      },
      {
        feature: "style.union-flattening",
        kind: "soundness-loss" as const,
        classification: "complete-but-not-sound" as const,
        reason:
          "The source carries 47 discriminated unions; a field-level union reaches the host as an opaque json-union string (packages/zod-bridge/src/field-mapping.ts:66-77), which is untyped and unqueryable. Each union is flattened to its `kind` discriminant plus optional arm fields, so the emitted PrimitiveTypeDef alone would accept a LineGrammar with kind=\"no-lines\" carrying a stroke_weight. The entity's superRefine rejects exactly those combinations, so nothing invalid is ever stored — but a consumer reading the profile's FieldDefs without running the validator sees a wider type than the source declares.",
      },
      {
        feature: "style.record-to-entry-list",
        kind: "soundness-loss" as const,
        classification: "complete-but-not-sound" as const,
        reason:
          "z.record reaches the host as an opaque json-record string (field-mapping.ts:187-192). Every Record and Partial<Record> in the token layer (colour tokens, type scale, letter spacing, weight map, timing map, font stacks, typefaces) becomes an array of key-bearing entry structs. A Record and a key-unique entry list are isomorphic, but the FieldDef layer cannot express key uniqueness; the entity's superRefine enforces it.",
      },
      {
        feature: "style.references-as-relations",
        kind: "completeness-loss" as const,
        classification: "sound-but-not-complete" as const,
        reason:
          "StyleIdentity.parentMovement / negatedMovements / influencedStyles, Rule.exemplars, ComplianceCheck.testsRule and the three CanonicalReferences buckets are relations, not fields. This buys host-enforced referential integrity, but a consumer reading a Style primitive in isolation sees none of its lineage, exemplars or references — it must traverse the relations. An exporter reconstructing a source-shaped StyleDefinition must read both.",
      },
      {
        feature: "style.cross-entity-invariants",
        kind: "completeness-loss" as const,
        classification: "sound-but-not-complete" as const,
        reason:
          "The source's validateStyleDefinition/validateStyleRegistry implement 991 lines of invariants. Those confined to one entity are ported into that entity's superRefine and run on every host write. Those spanning entities — rule/check weight alignment, defining-rule exemplar coverage, non-advisory check coverage, grammar-to-token kind agreement, the stroke-weight derivation, the WCAG contrast arithmetic, forbidden-colour prohibition linkage, rule-id namespace agreement, grammar-section completeness and the movement-forest acyclicity — CANNOT run in a per-primitive validator, because ValidatorFn receives one instance and the relations, never the sibling primitives (src/plugin/types.ts ValidatorContext). They live in ../invariants.ts and run at ingest time and on demand. A workbook assembled by direct primitive writes rather than through buildStyleWorkbook() is field-valid but NOT invariant-checked until validateStyleWorkbook() is run against it.",
      },
      {
        feature: "style.rendered-artifacts-absent",
        kind: "completeness-loss" as const,
        classification: "sound-but-not-complete" as const,
        reason:
          "RenderedStyle and CssArtifacts are not modelled. The source keeps them out of StyleDefinition behind a sha256-jcs content hash precisely because they are a renderer's output rather than stored truth, and the same reasoning keeps them out of the profile. A consumer needing CSS derives it from the token layer.",
      },
      {
        feature: "style.declared-rule-id-set-incomplete",
        kind: "completeness-loss" as const,
        classification: "sound-but-not-complete" as const,
        reason:
          "The bridge enumerates a closed rule_id set by walking the schema, emitting one `custom` id at the path each refinement is attached to (packages/zod-bridge/src/validator.ts:130-135). Every superRefine here attaches at the entity root but raises issues at nested field paths, so the ids actually emitted are more specific than the enumerated set. Nothing in the host checks findings against the declared set — it is audit metadata (src/mcp/dispatch.ts:570) — so this costs discoverability, not correctness.",
      },
    ],
    fdpm: {
      pluginId: PLUGIN_ID,
      vendor: VENDOR,
      profileId: PROFILE_ID,
      pluginVersion: PLUGIN_VERSION,
      hostCompatibility: HOST_COMPATIBILITY,
    },
  });
}
