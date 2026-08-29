/**
 * UIXO plugin sidecar — the single source of truth for the bridge
 * derivation, shared by activate() at runtime and scripts/run-bridge.ts at
 * build time.
 *
 * WHAT THE BRIDGE SEES. 712 ontology classes as entities, each holding
 * intrinsic attributes only: `id`, the `type` discriminator, the seven
 * universal controlled-vocabulary enums, `label`, `orderIndex`, and the
 * `extensions` open-world record.
 *
 * WHAT THE BRIDGE DOES NOT SEE, AND WHY. Every graph edge. The source
 * models them as `z.array(UixoEntityIdSchema)`, which the bridge maps to
 * `kind: "list"` of plain strings — storage the host cannot check. ../derive.ts
 * lifts all 1,653 of them into 210 RelationTypeDefs whose `target_types`
 * come from the ontology's own `CLASS_PARENT` hierarchy, and the sidecar's
 * `ReferenceSpec` cannot express those: it emits a single
 * `target_type_id` (packages/zod-bridge/src/sidecar-orchestrator.ts,
 * pass D) where `uixo:rel.hasChildComponent` needs 272. The host can —
 * `RelationTypeDef.target_types` accepts a list (src/core/models/meta.ts)
 * — so the relation types are merged into the generated profile by
 * finalizeProfile() and covered by the same drift gate.
 *
 * NO AGGREGATES. The source states the rule directly: "Relationships are
 * associations: no entity owns another's lifecycle, and deleting a
 * referenced entity makes the document invalid rather than cascading."
 * Declaring an aggregate here would contradict it.
 */

import type { z } from "zod";
import { defineDomain } from "@fdpm/zod-bridge";
import {
  ENTITY_QNAMES,
  buildEntitySchemas,
  collectEdgeFields,
  deriveRelationTypes,
  entityName,
  primitiveTypeId,
  rangeConflicts,
  type RelationTypeSpec,
} from "./derive.js";
import {
  UIXO_NATIVE_VERSION,
  UIXO_SOURCE_SHA256,
} from "./schemas/uixo-native.js";

export const PROFILE_ID = "profile:uixo:1.2" as const;
export const PLUGIN_ID = "fdpm.uixo" as const;
export const PLUGIN_VERSION = "0.1.0" as const;
export const HOST_COMPATIBILITY = ">=1.2,<2" as const;
export const VENDOR = "uixo" as const;

export { UIXO_NATIVE_VERSION, UIXO_SOURCE_SHA256 };
export { ENTITY_QNAMES, entityName, primitiveTypeId, qnameOf, relationTypeId } from "./derive.js";

/** The 712 entity schemas with their edge fields lifted out. */
export const ENTITY_SCHEMAS: Record<string, z.ZodObject<z.ZodRawShape>> = buildEntitySchemas();
export type EntityName = keyof typeof ENTITY_SCHEMAS & string;
export const ENTITY_NAMES: string[] = Object.keys(ENTITY_SCHEMAS).sort();

/** The 210 derived relation types. */
export const RELATION_TYPES: readonly RelationTypeSpec[] = deriveRelationTypes();

/** `uixo:<Entity>:<slug>` — matches the bridge's `{slug}` id template. */
export function primitiveId(entity: string, slug: string): string {
  return `${VENDOR}:${entity}:${slug}`;
}

export const PROFILE_NAME = "UIXO" as const;
export const PROFILE_LABEL = "UIXO v11 interaction ontology (native 1.2.0)" as const;
export const PROFILE_DESCRIPTION =
  `Bridge-generated from schemas/uixo-native.ts ${UIXO_NATIVE_VERSION} (source ontology uixo_tbox_full_v11, sha256 ${UIXO_SOURCE_SHA256}). ` +
  `${ENTITY_QNAMES.length} ontology classes as primitive types and ${RELATION_TYPES.length} relation types derived from the 1,653 graph-edge fields, ` +
  `with target sets expanded through the ontology's CLASS_PARENT hierarchy so the host enforces referential integrity on every write.`;

/**
 * The bridge emits id / primitive_types / relation_types (+ extras). This
 * adds the profile identity the host lists by, and merges the derived
 * relation types. Applied by BOTH scripts/run-bridge.ts (into
 * generated/profile.json) and activate(), so the drift test proves the
 * runtime profile is the file on disk.
 */
export function finalizeProfile<T extends { id: string; relation_types?: readonly unknown[] }>(
  profile: T,
): T & { version: string; name: string; label: string; description: string } {
  const clean = JSON.parse(JSON.stringify(profile)) as T;
  const generated = Array.isArray(clean.relation_types) ? clean.relation_types : [];
  return {
    ...clean,
    relation_types: [...generated, ...JSON.parse(JSON.stringify(RELATION_TYPES))],
    version: UIXO_NATIVE_VERSION,
    name: PROFILE_NAME,
    label: PROFILE_LABEL,
    description: PROFILE_DESCRIPTION,
  };
}

export function buildUixoSidecar() {
  const entities = Object.fromEntries(
    ENTITY_NAMES.map((name) => [
      name,
      {
        schema: ENTITY_SCHEMAS[name]!,
        identityKind: "id-field" as const,
        idField: "id",
        doc: `Ontology class ${ENTITY_QNAMES.find((q) => entityName(q) === name) ?? name}.`,
      },
    ]),
  );

  const conflicts = rangeConflicts();
  const edges = collectEdgeFields();

  return defineDomain({
    __sidecarSpec: "0.1",
    entities,
    declaredLoss: [
      {
        feature: "uixo.edges-as-relations",
        kind: "completeness-loss" as const,
        classification: "sound-but-not-complete" as const,
        reason:
          `All ${edges.length} graph-edge fields are lifted out of the entity schemas into ${RELATION_TYPES.length} relation types. This is what makes the ontology's referential integrity a host invariant instead of a document-level batch check, but it means a consumer reading one primitive in isolation sees none of its edges — it must traverse the relations. An exporter reconstructing a source-shaped UixoDocument must read both, and must re-materialise each edge under its original camelCase property name (uixo:rel.hasChildComponent -> hasChildComponent).`,
      },
      {
        feature: "uixo.entity-name-mangling",
        kind: "soundness-loss" as const,
        classification: "complete-but-not-sound" as const,
        reason:
          "Thirty-one RDF prefixes share one profile and local names collide across them (Article exists in uixoarticle: and uixowiki:), so every class id carries its prefix: uixo:Button becomes the entity Uixo_Button and the type id uixo:Uixo_Button. The mapping is mechanical and reversible via qnameOf(); the entity's own `type` field still carries the true QName, so nothing is lost at the data layer.",
      },
      {
        feature: "uixo.open-world-ranges",
        kind: "soundness-loss" as const,
        classification: "complete-but-not-sound" as const,
        reason:
          `Ten of the ${RELATION_TYPES.length} relation types are declared with the range owl:Thing, which names no storable class. Narrowing them to the empty set would make them unusable, so they open to all ${ENTITY_QNAMES.length} classes. Those ten edges are therefore endpoint-checked for EXISTENCE but not for range conformance; the ontology asserts no range for them either.`,
      },
      {
        feature: "uixo.range-widening",
        kind: "soundness-loss" as const,
        classification: "complete-but-not-sound" as const,
        reason:
          conflicts.length === 0
            ? "No edge property is declared with more than one range."
            : `${conflicts.length} edge propert(y|ies) are declared with different ranges on different classes (${conflicts
                .map((c) => `${c.field}: ${c.ranges.join(" | ")}`)
                .join("; ")}). One relation type per property means the target set is the UNION of those ranges, so the relation accepts a target the narrower declaring class would not. Splitting per source class would restore soundness at the cost of one relation type per (class, property) pair.`,
      },
      {
        feature: "uixo.extensions-untyped",
        kind: "completeness-loss",
        classification: "sound-but-not-complete",
        reason:
          "Every class carries 'extensions', a z.record. The bridge maps a record to the host's `json` field kind, so the value is stored as an object and the generated Zod validator checks its keys and values — it is no longer the opaque string it was, which had made every document carrying extensions un-ingestable (the profile demanded a string, the validator a record). What is still lost is structure: the ontology's soft links live inside extensions as free-form keys, so they are not typed relations and the host cannot enforce their endpoints. invariants.ts reads them back when it walks reachability, exactly as the source oracle does.",
      },
      {
        feature: "uixo.document-oracle-gate-at-ingest",
        kind: "completeness-loss",
        classification: "sound-but-not-complete",
        reason:
          "The source's oracle (validateUixoDocument — 41 coded checks across structural, referential, semantic and policy tiers) now runs as the FIRST control in ingest.ts, so a document entering the workbook is judged by the ontology's own authority and rejected in its own E-code vocabulary. What remains a loss is the WRITE path: the host validates one primitive or relation at a time and cannot see the document, so edits made after ingest through the CLI or MCP are judged by the field validators, the 210 typed relation endpoints and the graph invariants in invariants.ts — not by the full 41. Re-running the oracle over a projected workbook would need the projection inverted; that is not implemented.",
      },
      {
        feature: "uixo.single-type-per-entity",
        kind: "completeness-loss" as const,
        classification: "sound-but-not-complete" as const,
        reason:
          "Inherited from the source, which states it directly: the `type` discriminator holds the entity's most specific class and RDF multi-typing is not representable. A primitive is an instance of exactly one class here.",
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
