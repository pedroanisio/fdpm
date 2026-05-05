// Helper-set semver. Bumped to 1.1.0 for the §M14 graph.exists /
// graph.target_exists addition. Bumped to 1.2.0 for `fn.section_of`,
// the SPEC-SECTIONS-TREE v0.2 NodeId → §N.M.K resolver. Both bumps are
// additive (minor per the §M14 bump rules); no existing helper changed.
export const EXPR_HELPER_SET_VERSION = "1.2.0" as const;
export const EXPR_CEL_REVISION = "TBD" as const;

export const STANDARD_HELPER_IDS = [
  "fn.upper",
  "fn.lower",
  "fn.title",
  "fn.trim",
  "fn.slice",
  "fn.replace",
  "fn.len",
  "fn.count",
  "fn.sortBy",
  "fn.plural",
  "fn.date.short",
  "fn.date.long",
  "fn.date.iso",
  "fn.hash",
  "fn.section_of", // helper-set v1.2.0 — SPEC-SECTIONS-TREE v0.2 NodeId resolver
] as const;

export type StandardHelperId = (typeof STANDARD_HELPER_IDS)[number];

/**
 * Graph helpers — registered on the `graph` receiver (not under `fn.*`) per
 * SPEC-EXPRESSION-RUNTIME §M14 / SPEC-CEL-VALIDATOR §6. These mediate
 * relation-graph and primitive-existence queries that pure CEL cannot
 * express against the activation contract.
 *
 * Inventory is closed; adding a graph helper requires a SPEC amendment.
 */
export const STANDARD_GRAPH_HELPER_IDS = [
  "graph.incoming",
  "graph.outgoing",
  "graph.acyclic",
  "graph.exists",         // helper-set v1.1.0
  "graph.target_exists",  // helper-set v1.1.0
] as const;

export type StandardGraphHelperId = (typeof STANDARD_GRAPH_HELPER_IDS)[number];
