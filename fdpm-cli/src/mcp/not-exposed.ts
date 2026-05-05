/**
 * Public `Host` methods that are intentionally NOT exposed over MCP in
 * the current manifest revision (slice B-prelim).
 *
 * SPEC-MCP-SERVER §8.4 / Compliance: every public Host method must be
 * either present in MANIFEST (with a declared tier) OR explicitly
 * listed here. The CI gate (tests/mcp-classification.test.ts) asserts
 * the union covers `Object.getOwnPropertyNames(Host.prototype)`. New
 * unclassified methods break the build.
 *
 * Each entry below has a stable rationale recorded in this file's
 * comments — never delete an entry without either moving it into the
 * manifest or documenting why it was removed from the public surface.
 *
 * The list is conservative for slice B-prelim: every public Host
 * method that is not directly wrapped by the five Tier-1 tools is
 * listed here, including all writes (Tier 2/3 territory, deferred
 * to slice B-final / slice C) and read methods deferred for paged /
 * search-shaped surfaces.
 */

export const NOT_EXPOSED: ReadonlyArray<string> = [
  // -- Lifecycle ------------------------------------------------------
  // `load` is the constructor-companion init; not callable over MCP.
  "load",
  // `reload` is a SPEC-REPL §13 lifecycle method invoked by the
  // operator (SIGHUP / process restart). LLM clients MUST NOT trigger
  // a Host rebuild; staleness is surfaced to the LLM as
  // `permission`+`evidence.reason: "stale_state"` instead.
  "reload",
  // `statProjectLog` is the freshness-check primitive consumed by
  // dispatcher middleware (slice B-final). It is not a tool — it is a
  // building block.
  "statProjectLog",
  // `reloadProjectTail` is the per-project lenient-replay primitive
  // (SPEC-REPL §13). Like `reload` it is operator-triggered, not LLM-
  // facing. Slice B-final's dispatcher will call it from the
  // freshness check, but it is never advertised as a tool.
  "reloadProjectTail",
  // `reloadPlugins` re-runs plugin discovery + activation only
  // (SPEC-REPL §10.3 `:reload plugins`). Operator-triggered via SIGHUP
  // / `:reload plugins` meta-command; never an MCP tool because LLMs
  // shouldn't be able to mutate the host's capability surface.
  "reloadPlugins",

  // -- Registry mutations ---------------------------------------------
  // Profile registration is operator-only; an LLM should not contribute
  // profiles via MCP without a destructive-tier classification.
  "registerProfile",

  // -- Project lifecycle (Tier 2/3 territory; deferred to slice C) ----
  "createProject",
  "deleteProject",

  // -- Primitive writes (Tier 2/3) ------------------------------------
  "createPrimitive",
  "replacePrimitive",
  "patchPrimitive",
  "deletePrimitive",
  "fieldPatchPrimitive",

  // -- Relation writes (Tier 2/3) -------------------------------------
  "createRelation",
  "replaceRelation",
  "patchRelation",
  "deleteRelation",

  // -- Structure writes (Tier 2/3) ------------------------------------
  "reorder",
  "reparent",

  // -- Read surfaces deferred to slice B-final ------------------------
  // Operation-log streaming wants paging + filtering ergonomics that
  // the slice-B-prelim manifest does not yet model.
  "getLog",
  // Resolved-profile read; deferred until a `fdpm.profile.resolved.get`
  // tool exists. Profile reads in this slice return the raw form.
  "requireResolvedProfile",
  // Cross-project uid lookups — useful but not yet on the surface.
  "lookupUid",
  "resolvePrimitiveByUid",
  "resolveRelationByUid",
  // Project-wide read surfaces deferred to slice B-final.
  "diffProject",
  "searchPrimitives",
  "searchRelations",
  "validateProject",

  // -- Internal append helpers ----------------------------------------
  // Per SPEC-MCP-SERVER §8.4 these MUST NEVER be exposed: they take
  // raw operations / batches and bypass tier classification entirely.
  "appendAndPersist",
  "appendBatch",
  "appendBatchWithCausation",

  // -- Migration (Tier 3 — destructive, deferred) ---------------------
  "migrateNormalizeMetadata",

  // -- TS-private prototype methods -----------------------------------
  // These carry the TypeScript `private` modifier on Host but remain
  // enumerable on Host.prototype at runtime (TS private is not a JS
  // access-control feature). They are internal helpers — never to be
  // exposed over MCP. Listing them here is the SPEC-compliant way to
  // assert that decision instead of widening the classification gate.
  "validationContext",
  "runWithValidation",
  "projectFingerprint",
];
