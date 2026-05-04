/**
 * Centralised string-id constants for the `fdpm.spec-authoring` profile.
 *
 * The profile primitives (in `primitives/*.ts`) and relations (in
 * `relations.ts`) declare their `id` fields as raw string literals. Build
 * scripts under `fdpm-cli/scripts/build-spec-*.ts` previously re-stated
 * those same strings as `type: "spec:Document"` literals at every use
 * site — a manual mirror with no compile-time link back to the schema.
 *
 * This module is the single source of truth for those id strings. Build
 * scripts import the named constants here; if a primitive or relation id
 * is renamed in the schema and not updated here, TypeScript surfaces the
 * mismatch at compile time. Drift becomes loud.
 *
 * Naming convention:
 *   - `SPEC_<TypeName>` for primitive type ids (e.g. `SPEC_DOCUMENT`).
 *   - `SPEC_REL_<RelationName>` for relation type ids (e.g. `SPEC_REL_HAS_SECTION`).
 *
 * All values are typed `as const` so they are accepted as string-literal
 * types where the schema demands a specific id.
 */

// ── Primitive type ids ─────────────────────────────────────────────────────

// document.ts
export const SPEC_DOCUMENT = "spec:Document" as const;
export const SPEC_SECTION = "spec:Section" as const;
export const SPEC_TERM = "spec:Term" as const;

// framing.ts
export const SPEC_STAKEHOLDER = "spec:Stakeholder" as const;
export const SPEC_CONCERN = "spec:Concern" as const;
export const SPEC_QUALITY_ATTRIBUTE = "spec:QualityAttribute" as const;

// architecture.ts
export const SPEC_PRINCIPLE = "spec:Principle" as const;
export const SPEC_OPTION = "spec:Option" as const;
export const SPEC_ADR = "spec:ADR" as const;
export const SPEC_TRADEOFF_AXIS = "spec:TradeoffAxis" as const;
export const SPEC_QA_SCENARIO = "spec:QAScenario" as const;

// requirements.ts
export const SPEC_REQUIREMENT = "spec:Requirement" as const;
export const SPEC_ACCEPTANCE_CRITERION = "spec:AcceptanceCriterion" as const;
export const SPEC_CONFORMANCE_ITEM = "spec:ConformanceItem" as const;
export const SPEC_INVARIANT = "spec:Invariant" as const;

// capability.ts
export const SPEC_TOOL = "spec:Tool" as const;
export const SPEC_ENDPOINT = "spec:Endpoint" as const;
export const SPEC_CAPABILITY = "spec:Capability" as const;
export const SPEC_CONFIG_ENTRY = "spec:ConfigEntry" as const;
export const SPEC_SCHEMA_DEFINITION = "spec:SchemaDefinition" as const;
export const SPEC_ERROR_CATEGORY = "spec:ErrorCategory" as const;

// risk.ts
export const SPEC_RISK = "spec:Risk" as const;
export const SPEC_MITIGATION = "spec:Mitigation" as const;
export const SPEC_OPEN_QUESTION = "spec:OpenQuestion" as const;
export const SPEC_FUTURE_WORK = "spec:FutureWork" as const;

// provenance.ts
export const SPEC_REFERENCE = "spec:Reference" as const;
export const SPEC_REVISION = "spec:Revision" as const;
export const SPEC_MIGRATION_STEP = "spec:MigrationStep" as const;
export const SPEC_IMPLEMENTATION_CHANGE = "spec:ImplementationChange" as const;

// ── Relation type ids ──────────────────────────────────────────────────────

export const SPEC_REL_HAS_SECTION = "spec:HasSection" as const;
export const SPEC_REL_DEFINES = "spec:Defines" as const;
export const SPEC_REL_HOLDS_CONCERN = "spec:HoldsConcern" as const;
export const SPEC_REL_TENSIONS = "spec:Tensions" as const;
export const SPEC_REL_CONSIDERS = "spec:Considers" as const;
export const SPEC_REL_CHOSE = "spec:Chose" as const;
export const SPEC_REL_HAS_TRADEOFF = "spec:HasTradeoff" as const;
export const SPEC_REL_TARGETS = "spec:Targets" as const;
export const SPEC_REL_SUPERSEDES = "spec:Supersedes" as const;
export const SPEC_REL_RESOLVES = "spec:Resolves" as const;
export const SPEC_REL_DEPENDS_ON = "spec:DependsOn" as const;
export const SPEC_REL_VERIFIES = "spec:Verifies" as const;
export const SPEC_REL_CONSTRAINS = "spec:Constrains" as const;
export const SPEC_REL_MITIGATES = "spec:Mitigates" as const;
export const SPEC_REL_CITES = "spec:Cites" as const;
export const SPEC_REL_REQUIRED_READ = "spec:RequiredRead" as const;
export const SPEC_REL_IMPLEMENTS = "spec:Implements" as const;
export const SPEC_REL_REVISED_IN = "spec:RevisedIn" as const;
