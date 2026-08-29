/**
 * Document-plan plugin sidecar — single source of truth for the bridge
 * derivation, shared by activate() at runtime and scripts/run-bridge.ts
 * at build time (the acme.pitch-deck pattern, howto-zod-to-fdpm-plugin §4).
 *
 * What the bridge sees, and what it does not:
 *
 *   - Six Entities: the DocumentPlan *header* (the root object minus its
 *     section tree and its registries) and the five registries the root
 *     owns — ContentSource, Concept, Asset, Thread, Person. Each is
 *     identified by its `id` field (RFC 4122 UUID, `Uuid`).
 *   - The section tree (`structure.front_matter / sections / back_matter`)
 *     is NOT a bridge entity. Nodes carry identity over revisions, move,
 *     split and merge — exactly SPEC-DNIS's contract — so the companion
 *     plugin fdpm.document-plan-dnis materialises every SectionNode as a
 *     `dnis:Node` primitive (SPEC-CORE §5.6) and declares the typed
 *     relations between nodes and the registries. See
 *     plugins/document_plan_dnis/build.ts.
 *   - No bridge `references`: every foreign key in this domain has a
 *     dnis:Node on one side, so the relation types live in the
 *     composition profile where both endpoints are known.
 *
 * Declared losses (recorded in generated/audit.json and
 * product-page-bundle.json) name the constructs the bridge cannot carry
 * and where they are enforced instead.
 */

import { z } from "zod";
import { defineDomain } from "@fdpm/zod-bridge";
import {
  ContentSource,
  DocumentPlanObject,
  Schemas,
  SCHEMA_VERSION,
} from "./schemas/document-plan.js";

export const PROFILE_ID = "profile:document-plan:3.1" as const;
export const PLUGIN_ID = "fdpm.document-plan" as const;
export const PLUGIN_VERSION = "0.1.0" as const;
export const HOST_COMPATIBILITY = ">=1.2,<2" as const;
export const VENDOR = "docplan" as const;
/** Pinned DocumentPlan schema version this plugin realises. */
export const SCHEMA_VERSION_PINNED = SCHEMA_VERSION;

/** Root fields materialised as dnis:Node primitives by the companion plugin. */
export const TREE_FIELDS = ["structure"] as const;
/** Root fields materialised as registry Entities (top level). */
export const REGISTRY_FIELDS = ["threads", "people"] as const;
/** `content.*` fields materialised as registry Entities. */
export const CONTENT_REGISTRY_FIELDS = ["sources", "concepts", "assets"] as const;

type Shape = z.ZodRawShape;

function omitKeys(shape: Shape, keys: readonly string[]): Shape {
  const drop = new Set<string>(keys);
  const out: Record<string, z.ZodType> = {};
  for (const [k, v] of Object.entries(shape)) {
    if (!drop.has(k)) out[k] = v as z.ZodType;
  }
  return out as Shape;
}

/**
 * `content` minus the three registries — what remains is `examples`, a
 * list of value objects with no identity of their own.
 */
const contentRemainder = z
  .object(omitKeys(DocumentPlanObject.shape.content.shape, CONTENT_REGISTRY_FIELDS))
  .describe(
    "Registry-free remainder of `content` (examples only). Sources, concepts and assets are docplan:ContentSource / docplan:Concept / docplan:Asset primitives in the same workbook.",
  );

/**
 * The DocumentPlan header: every root field except the section tree and
 * the registries. One workbook holds exactly one header primitive.
 */
export const DocumentPlanHeader = z.object({
  ...omitKeys(DocumentPlanObject.shape, [...TREE_FIELDS, ...REGISTRY_FIELDS, "content"]),
  content: contentRemainder,
});

/**
 * `SourceIdentifier` is a discriminated union in the source schema. The
 * bridge stores a field-level union as an opaque JSON string
 * (format=json-union), which the host's per-field kind check and the
 * bridge's own safeParse validator cannot both accept at once. The
 * stored shape is therefore the flat `{kind, value}` pair; the per-arm
 * regexes (DOI, ISBN, ISSN, …) are enforced at ingest time by
 * DocumentPlanSchema.safeParse in build.ts. Declared as a loss below.
 */
export const SOURCE_IDENTIFIER_KINDS = [
  "doi",
  "isbn",
  "issn",
  "arxiv",
  "url",
  "archive",
  "internal",
] as const;

export const SourceIdentifierFlat = z
  .object({
    kind: z.enum(SOURCE_IDENTIFIER_KINDS),
    value: z.string().min(1).max(300),
  })
  .describe(
    "Flattened SourceIdentifier: which registry the source lives in and the locator inside it. Per-kind formats are validated when the plan is ingested.",
  );

export const ContentSourceEntity = ContentSource.extend({
  identifier: SourceIdentifierFlat.optional(),
});

export const ENTITY_SCHEMAS = {
  DocumentPlan: DocumentPlanHeader,
  ContentSource: ContentSourceEntity,
  Concept: Schemas.Concept,
  Asset: Schemas.Asset,
  Thread: Schemas.Thread,
  Person: Schemas.Person,
} as const;

export type EntityName = keyof typeof ENTITY_SCHEMAS;
export const ENTITY_NAMES = Object.keys(ENTITY_SCHEMAS) as EntityName[];

/** `docplan:<Entity>` — the PrimitiveTypeDef id the bridge emits. */
export function primitiveTypeId(name: EntityName): string {
  return `${VENDOR}:${name}`;
}

/** `docplan:<Entity>:<uuid>` — matches the bridge's `{slug}` id template. */
export function primitiveId(name: EntityName, id: string): string {
  return `${VENDOR}:${name}:${id}`;
}

export const PROFILE_NAME = "Document Plan" as const;
export const PROFILE_LABEL = "Document Plan (v3.1.0)" as const;
export const PROFILE_DESCRIPTION =
  "Bridge-generated from schemas/document-plan.ts (DocumentPlan v3.1.0): the plan header and its registries (ContentSource, Concept, Asset, Thread, Person). The section tree lives as dnis:Node primitives under profile:document-plan-dnis:3.1." as const;

/**
 * The bridge emits a profile with only id / primitive_types / relation_types
 * (+ bridge extras). The host lists profiles by version and label, so both
 * scripts/run-bridge.ts (generated/profile.json) and activate() apply this
 * one function — the drift test compares finalized output to disk.
 */
export function finalizeProfile<T extends { id: string }>(
  profile: T,
): T & { version: string; name: string; label: string; description: string } {
  const clean = JSON.parse(JSON.stringify(profile)) as T;
  return {
    ...clean,
    version: SCHEMA_VERSION_PINNED,
    name: PROFILE_NAME,
    label: PROFILE_LABEL,
    description: PROFILE_DESCRIPTION,
  };
}

function asEntity(schema: z.ZodObject<Shape>): z.ZodObject<z.ZodRawShape> {
  return schema as unknown as z.ZodObject<z.ZodRawShape>;
}

export function buildDocumentPlanSidecar() {
  return defineDomain({
    __sidecarSpec: "0.1",
    entities: {
      DocumentPlan: {
        schema: asEntity(DocumentPlanHeader),
        identityKind: "id-field",
        idField: "id",
        idSchema: Schemas.Uuid,
        doc: "The plan header: identity, work type, audience, thesis, purpose, style, constraints, milestones, review gates, dependencies and provenance. The section tree and the registries live in sibling primitives.",
      },
      ContentSource: {
        schema: asEntity(ContentSourceEntity),
        identityKind: "id-field",
        idField: "id",
        idSchema: Schemas.Uuid,
        doc: "Evidence registry entry. Cited from nodes via docplan:NodeCites (composition profile).",
      },
      Concept: {
        schema: asEntity(Schemas.Concept),
        identityKind: "id-field",
        idField: "id",
        idSchema: Schemas.Uuid,
        doc: "Term registry entry. `introduced_in` names the node slug that defines it; the composition profile carries the typed edge.",
      },
      Asset: {
        schema: asEntity(Schemas.Asset),
        identityKind: "id-field",
        idField: "id",
        idSchema: Schemas.Uuid,
        doc: "Non-prose material with placement and rights clearance.",
      },
      Thread: {
        schema: asEntity(Schemas.Thread),
        identityKind: "id-field",
        idField: "id",
        idSchema: Schemas.Uuid,
        doc: "A through-line advanced by two or more nodes.",
      },
      Person: {
        schema: asEntity(Schemas.Person),
        identityKind: "id-field",
        idField: "id",
        idSchema: Schemas.Uuid,
        doc: "A named human involved in the work (PII-low). Referenced by id from node ownership and review assignments.",
      },
    },
    aggregates: [
      {
        root: "DocumentPlan",
        parts: ["ContentSource", "Concept", "Asset", "Thread", "Person"],
        doc: "One workbook is one plan; the registries are owned by the header and deleted with it.",
      },
    ],
    declaredLoss: [
      {
        feature: "structure.section-tree",
        kind: "completeness-loss",
        classification: "sound-but-not-complete",
        reason:
          "The recursive SectionNode tree is not emitted as docplan primitives. fdpm.document-plan-dnis materialises each node as a dnis:Node (SPEC-CORE §5.6) via plugins/document_plan_dnis/build.ts, preserving reading order as SPEC-DNIS positions.",
      },
      {
        feature: "superrefine.cross-references",
        kind: "completeness-loss",
        classification: "sound-but-not-complete",
        reason:
          "Reference resolution, concept introduction order, thread continuity, word budgets, milestone deadlines and the dependency DAG (DocumentPlanSchema.superRefine) are enforced by DocumentPlanSchema.safeParse at ingest (build.ts); the host's relation pipeline enforces endpoint existence afterwards. No CEL is emitted for them.",
      },
      {
        feature: "assertion-text.self-referential-refine",
        kind: "completeness-loss",
        classification: "sound-but-not-complete",
        reason:
          "The AssertionText .refine (rejects plan text written in the voice of the document) has no CEL translation; it is enforced by the per-entity Zod validator for header fields and by ingest-time safeParse for node content.",
      },
      {
        feature: "content-source.identifier.discriminated-union",
        kind: "soundness-loss",
        classification: "complete-but-not-sound",
        reason:
          "SourceIdentifier is stored as the flat {kind, value} struct (SourceIdentifierFlat); per-kind value formats are checked only at ingest time by DocumentPlanSchema.safeParse, not on later primitive patches.",
      },
    ],
    fdpm: {
      pluginId: PLUGIN_ID,
      vendor: VENDOR,
      profileId: PROFILE_ID,
      pluginVersion: PLUGIN_VERSION,
      hostCompatibility: HOST_COMPATIBILITY,
      recursionDepth: 1,
    },
  });
}
