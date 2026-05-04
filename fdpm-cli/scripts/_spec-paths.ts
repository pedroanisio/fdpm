/**
 * Centralised filesystem paths for the rendered SPEC corpus.
 *
 * Build scripts under `fdpm-cli/scripts/build-spec-*.ts` previously
 * embedded `"docs/specs/SPEC-*.md"` literals at every site that needed to
 * reference a peer SPEC, a required-read locator, or an emitted output
 * target. Each script restated the same paths independently — a manual
 * mirror with no shared source of truth and no automated check that the
 * referenced files exist.
 *
 * This module is the single source of truth for those paths. Build
 * scripts import the named constants here. Renaming a SPEC file requires
 * one edit, not N.
 *
 * The constants below are typed `as const` so they are accepted as
 * string-literal types where the schema demands a specific path.
 *
 * `SPEC_PATHS` is an additional indexed map for callers that prefer
 * bracket-style access (e.g., when the key is computed). It carries the
 * exact same values.
 */

const SPEC_DIR = "docs/specs" as const;

export const SPEC_CORE_PATH = `${SPEC_DIR}/SPEC-CORE.md` as const;
export const SPEC_PLUGGABLE_ARCHITECTURE_PATH =
  `${SPEC_DIR}/SPEC-PLUGGABLE-ARCHITECTURE.md` as const;
export const SPEC_CEL_VALIDATOR_PATH =
  `${SPEC_DIR}/SPEC-CEL-VALIDATOR.md` as const;
export const SPEC_DNIS_PATH = `${SPEC_DIR}/SPEC-DNIS.md` as const;
export const SPEC_EXPRESSION_RUNTIME_PATH =
  `${SPEC_DIR}/SPEC-EXPRESSION-RUNTIME.md` as const;
export const SPEC_RENDER_DSL_PATH = `${SPEC_DIR}/SPEC-RENDER-DSL.md` as const;
export const SPEC_SECTIONS_TREE_PATH =
  `${SPEC_DIR}/SPEC-SECTIONS-TREE.md` as const;
export const SPEC_UID_PATH = `${SPEC_DIR}/SPEC-UID.md` as const;
export const SPEC_MCP_SERVER_PATH =
  `${SPEC_DIR}/SPEC-MCP-SERVER.md` as const;
export const SPEC_REPL_PATH = `${SPEC_DIR}/SPEC-REPL.md` as const;

export const SPEC_PATHS = {
  CORE: SPEC_CORE_PATH,
  PLUGGABLE_ARCHITECTURE: SPEC_PLUGGABLE_ARCHITECTURE_PATH,
  CEL_VALIDATOR: SPEC_CEL_VALIDATOR_PATH,
  DNIS: SPEC_DNIS_PATH,
  EXPRESSION_RUNTIME: SPEC_EXPRESSION_RUNTIME_PATH,
  RENDER_DSL: SPEC_RENDER_DSL_PATH,
  SECTIONS_TREE: SPEC_SECTIONS_TREE_PATH,
  UID: SPEC_UID_PATH,
  MCP_SERVER: SPEC_MCP_SERVER_PATH,
  REPL: SPEC_REPL_PATH,
} as const;

// ── Build-script paths ─────────────────────────────────────────────────────
//
// One `build-spec-<slug>.ts` per regenerable SPEC. Useful as
// `evidence_refs` in plan/spec primitives that point at the source of
// truth rather than the rendered artifact. SPEC-PLUGGABLE-ARCHITECTURE
// has no build script and is intentionally absent.

const BUILD_SPEC_DIR = "fdpm-cli/scripts" as const;

export const BUILD_SPEC_CORE_PATH =
  `${BUILD_SPEC_DIR}/build-spec-core.ts` as const;
export const BUILD_SPEC_CEL_VALIDATOR_PATH =
  `${BUILD_SPEC_DIR}/build-spec-cel-validator.ts` as const;
export const BUILD_SPEC_DNIS_PATH =
  `${BUILD_SPEC_DIR}/build-spec-dnis.ts` as const;
export const BUILD_SPEC_EXPRESSION_RUNTIME_PATH =
  `${BUILD_SPEC_DIR}/build-spec-expression-runtime.ts` as const;
export const BUILD_SPEC_RENDER_DSL_PATH =
  `${BUILD_SPEC_DIR}/build-spec-render-dsl.ts` as const;
export const BUILD_SPEC_SECTIONS_TREE_PATH =
  `${BUILD_SPEC_DIR}/build-spec-sections-tree.ts` as const;
export const BUILD_SPEC_UID_PATH =
  `${BUILD_SPEC_DIR}/build-spec-uid.ts` as const;
export const BUILD_SPEC_MCP_SERVER_PATH =
  `${BUILD_SPEC_DIR}/build-spec-mcp-server.ts` as const;
export const BUILD_SPEC_REPL_PATH =
  `${BUILD_SPEC_DIR}/build-spec-repl.ts` as const;

/** All existing `build-spec-*.ts` scripts (no PLUGGABLE_ARCHITECTURE). */
export const ALL_BUILD_SPEC_PATHS: readonly string[] = [
  BUILD_SPEC_CORE_PATH,
  BUILD_SPEC_CEL_VALIDATOR_PATH,
  BUILD_SPEC_DNIS_PATH,
  BUILD_SPEC_EXPRESSION_RUNTIME_PATH,
  BUILD_SPEC_RENDER_DSL_PATH,
  BUILD_SPEC_SECTIONS_TREE_PATH,
  BUILD_SPEC_UID_PATH,
  BUILD_SPEC_MCP_SERVER_PATH,
  BUILD_SPEC_REPL_PATH,
] as const;
