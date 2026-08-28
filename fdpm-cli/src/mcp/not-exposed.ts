/**
 * Public `Host` methods that are intentionally NOT exposed over MCP in
 * the current manifest revision (slice B-final + Phase C).
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
  // dispatcher middleware. It is not a tool — it is a building block.
  "statProjectLog",
  // `reloadProjectTail` is the per-workbook lenient-replay primitive
  // (SPEC-REPL §13). Like `reload` it is operator-triggered, not LLM-
  // facing. The dispatcher's freshness check calls it from Tier-1
  // lenient mode, but it is never advertised as a tool.
  "reloadProjectTail",
  // `reloadPlugins` re-runs plugin discovery + activation only
  // (SPEC-REPL §10.3 `:reload plugins`). Operator-triggered via SIGHUP
  // / `:reload plugins` meta-command; never an MCP tool because LLMs
  // shouldn't be able to mutate the host's capability surface.
  "reloadPlugins",
  // `registerPluginProfile` is the plugin-activation path for shipping a
  // plugin's own profile (idempotent: "already-present" on re-activation).
  // It bypasses persistence and the `extends` parent check that
  // `fdpm.profile.register` enforces, because plugins own their activation
  // order. Never LLM-facing: an agent registering profiles goes through
  // `fdpm.profile.register` and `fdpm://schema/profile`.
  "registerPluginProfile",

  // -- Read surfaces deferred -----------------------------------------
  // Resolved-profile read; deferred until a `fdpm.profile.resolved.get`
  // tool exists. Profile reads in this slice return the raw form.
  "requireResolvedProfile",
  // Cross-workbook uid lookups — useful but not yet on the surface.
  "lookupUid",
  "resolvePrimitiveByUid",
  "resolveRelationByUid",
  // Workbook-wide read surfaces deferred. `diffProject` and
  // `validateProject` produce non-trivial response shapes; defer until
  // a stable wire format is agreed.
  "diffProject",
  "validateProject",

  // -- Internal append helpers ----------------------------------------
  // Per SPEC-MCP-SERVER §8.4 these MUST NEVER be exposed: they take
  // raw operations and bypass tier classification entirely. The third
  // sibling, `appendBatchWithCausation`, is intentionally NOT in this
  // list as of v0.1.1 — it is now reached via `fdpm.primitive.create_batch`
  // and `fdpm.relation.create_batch`, which accept typed intents (NOT
  // raw operations) and run under the standard Tier-2 classification.
  // SPEC §8.4's prohibition targets "raw operation / raw JSONL" inputs,
  // not the batch path itself.
  "appendAndPersist",
  "appendBatch",

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
