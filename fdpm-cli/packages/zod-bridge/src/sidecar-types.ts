/**
 * Sidecar manifest types per SPEC-DOMAIN-SIDECAR v0.1.3.
 *
 * The shapes here mirror the spec's §2-§9 surface verbatim.
 * defineDomain() is an identity passthrough at runtime; static type
 * checking comes for free via `Domain` and the per-section types.
 *
 * Bridge implementation note: this module declares the public input
 * surface only. Validation is in sidecar-validator.ts; emission is in
 * sidecar-orchestrator.ts.
 */

import type { z } from "zod";

/** §13 — sidecar spec version the manifest declares conformance to. */
export type SidecarSpecVersion = "0.1";

/** §3.2 — identity kinds. */
export type IdentityKind = "id-field" | "singleton" | "natural-key" | "opaque";

/** §3.1 — entity declarations. */
export interface EntitySpec {
  schema: z.ZodObject<z.ZodRawShape>;
  identityKind: IdentityKind;
  /** Required when identityKind === "id-field". §3.3. */
  idField?: string;
  /**
   * Optional companion to idField. When provided, the bridge enforces
   * reference equality with the field's actual Zod type. §3.3.
   */
  idSchema?: z.ZodType;
  /** Required when identityKind === "natural-key"; forbidden otherwise. §3.4. */
  naturalKey?: ReadonlyArray<string>;
  doc?: string;
}

/** §4.4 — reference cardinality. */
export type ReferenceCardinality =
  | "one-to-one"
  | "one-to-many"
  | "many-to-one"
  | "many-to-many";

/** §4.6 — cascade semantics. */
export type CascadeKind = "deny" | "set-null" | "cascade";

/** §4.5 — inverse pairing pointer. */
export interface ReferenceInverse {
  on: string;
  field: string;
}

/** §4.1 — top-level reference declaration. */
export interface ReferenceSpec {
  from: string;
  field: string;
  to: string;
  cardinality: ReferenceCardinality;
  inverse?: ReferenceInverse;
  cascade?: CascadeKind;
  acyclic?: boolean;
  doc?: string;
}

/** §5.1 — aggregate declaration. */
export interface AggregateSpec {
  root: string;
  parts: ReadonlyArray<string>;
  doc?: string;
}

/** §6.2 — variant strategies. */
export type VariantStrategy = "payload-blob" | "variant-per-primitive";

/** §6.5 / §6.1 — references scoped to a variant arm. */
export interface VariantReferenceSpec {
  from: string;
  field: string;
  to: string;
  cardinality: ReferenceCardinality;
  cascade?: CascadeKind;
  doc?: string;
}

/** §6.1 — variant declaration. */
export interface VariantSpec {
  from: string;
  field: string;
  /** Required when strategy === "variant-per-primitive". §6.3. */
  discriminator?: string;
  strategy: VariantStrategy;
  /** Default "<from>_<variantTag>". §6.4. */
  primitiveNamePattern?: string;
  references?: ReadonlyArray<VariantReferenceSpec>;
}

/** §7.1 — per-path lift overrides. */
export type LiftOverrideKind = "inline" | "lift";
export type LiftOverrides = Readonly<Record<string, LiftOverrideKind>>;

/** §8.2 — loss declaration. */
export type LossKind = "soundness-loss" | "completeness-loss";
export type LossClassification =
  | "sound-but-not-complete"
  | "complete-but-not-sound"
  | "neither-sound-nor-complete";

export interface DeclaredLossSpec {
  feature: string;
  kind: LossKind;
  classification: LossClassification;
  reason: string;
}

/** §9.4 — DNIS managed-fields subsection. */
export type DnisLineage = "track" | "none";

export interface DnisManagedField {
  entity: string;
  field: string;
  nodeKind: string;
  lineage?: DnisLineage;
  doc?: string;
}

export interface DnisSection {
  /** Currently the only legal value per §9.4.3. */
  documentScope: "per-plugin-workbook";
  managedFields: ReadonlyArray<DnisManagedField>;
}

/** §9.1 — FDPM-specific extension. */
export interface FdpmSection {
  pluginId: string;
  vendor: string;
  profileId: string;
  pluginVersion: string;
  hostCompatibility: string;
  /**
   * Profile identity. `DomainProfile.version` is REQUIRED by the host
   * (^\d+\.\d+\.\d+$) and `label` is what `fdpm profile list` shows, so
   * the bridge emits both: `profileVersion` when the domain has a version
   * of its own (a schema version, say), otherwise `pluginVersion`.
   * Without this a bridge plugin registers a profile with no version at
   * all — which is what shipped, because the plugin registration path
   * used to skip validation.
   */
  profileVersion?: string;
  profileName?: string;
  profileLabel?: string;
  profileDescription?: string;
  capabilities?: ReadonlyArray<string>;
  viewPageOverrides?: Record<string, unknown>;
  recursionDepth?: number;
  unionStrategy?: VariantStrategy;
  celConstraints?: ReadonlyArray<{
    name: string;
    expression: string;
    level?: "error" | "warning";
    appliesToType?: string;
  }>;
  dnis?: DnisSection;
}

/** §2.4 — optional schema-hash manifest. */
export interface SchemaHashManifest {
  algorithm: string;
  files: Record<string, string>;
}

/** §2.1 — root sidecar shape. */
export interface Domain {
  __sidecarSpec: SidecarSpecVersion;
  __schemaHash?: SchemaHashManifest;
  entities: Readonly<Record<string, EntitySpec>>;
  references?: ReadonlyArray<ReferenceSpec>;
  aggregates?: ReadonlyArray<AggregateSpec>;
  variants?: ReadonlyArray<VariantSpec>;
  liftOverrides?: LiftOverrides;
  declaredLoss?: ReadonlyArray<DeclaredLossSpec>;
  fdpm: FdpmSection;
}

/**
 * §2.1 — identity passthrough for editor autocomplete + compile-time
 * type-checking. No runtime behavior beyond returning its argument.
 *
 * The narrow generic preserves the user's literal types so downstream
 * tooling can refer to specific entity names without losing strings.
 */
export function defineDomain<T extends Domain>(spec: T): T {
  return spec;
}
