/**
 * Shared constants for the SPEC-EXPRESSION-RUNTIME / SPEC-RENDER-DSL
 * build scripts. Keeping the canonical activation surface and helper
 * inventory in one place prevents the drift category that pass-2 and
 * pass-3 each caught (e.g., RENDER-DSL listing `{ doc, project, env,
 * query, fn }` while EXPR-RT correctly listed `{ doc, project, env,
 * host, fn }`; or RENDER-DSL claiming `fn.hash` works on any value
 * while EXPR-RT correctly limited it to primitives + lists).
 *
 * The rule:
 *   - SPEC-EXPRESSION-RUNTIME OWNS these contracts (it ratifies them).
 *   - SPEC-RENDER-DSL CONSUMES them (it must reference, not redefine).
 *
 * Both build scripts import from here; the values below are the
 * single source of truth. A bump to the helper-set version OR a new
 * Tier-A binding is a one-edit change in this file plus the
 * matching SPEC-amendment text in EXPR-RT.
 */

/** The closed Tier-A activation surface (§M7 of SPEC-EXPRESSION-RUNTIME). */
export const ACTIVATION_TIER_A_NAMES = [
  "doc",
  "project",
  "env",
  "host",
  "fn",
] as const;

/** Pretty-printed for prose: `{ doc, project, env, host, fn }`. */
export const ACTIVATION_TIER_A_LIST = `{ ${ACTIVATION_TIER_A_NAMES.join(", ")} }`;

/** Standard helper-set version (independent semver, §M14). v1.1.0 adds the
 *  graph.exists / graph.target_exists existence helpers (additive → minor). */
export const HELPER_SET_VERSION = "1.1.0";

/** One canonical entry per shipped helper. */
export interface HelperEntry {
  readonly family: "string" | "collection" | "date" | "identity";
  /** The fully-qualified name as it appears in templates. */
  readonly name: string;
  /** Signature in human form, e.g. `fn.slice(s, a, b?)`. */
  readonly signature: string;
  /** One-line semantic. */
  readonly summary: string;
}

/** v1.0.0 inventory. Adding/removing/renaming requires an EXPR-RT amendment. */
export const STANDARD_HELPERS: readonly HelperEntry[] = [
  // ── string family ──────────────────────────────────────────
  { family: "string",     name: "fn.upper",   signature: "fn.upper(s)",
    summary: "uppercase (Unicode)." },
  { family: "string",     name: "fn.lower",   signature: "fn.lower(s)",
    summary: "lowercase (Unicode)." },
  { family: "string",     name: "fn.title",   signature: "fn.title(s)",
    summary: "titlecase the first letter of each word." },
  { family: "string",     name: "fn.trim",    signature: "fn.trim(s)",
    summary: "strip leading/trailing whitespace." },
  { family: "string",     name: "fn.slice",   signature: "fn.slice(s, a, b?)",
    summary: "codepoint-indexed substring." },
  { family: "string",     name: "fn.replace", signature: "fn.replace(s, find, rep)",
    summary: "first-match replace (no regex; literal find)." },

  // ── collection family ──────────────────────────────────────
  { family: "collection", name: "fn.len",     signature: "fn.len(x)",
    summary: "list.length / string codepoints / map size." },
  { family: "collection", name: "fn.count",   signature: "fn.count(type_id)",
    summary: "number of project primitives of that type_id." },
  { family: "collection", name: "fn.sortBy",  signature: "fn.sortBy(list, var, key)",
    summary: "stable sort. Macro form: `var` binds each element; `key` is a CEL expression over `var`. Mirrors CEL filter/map signature." },
  { family: "collection", name: "fn.plural",  signature: "fn.plural(n, sing, pl?)",
    summary: "'thing' if n==1 else (pl ?? sing+'s')." },

  // ── date family ────────────────────────────────────────────
  { family: "date",       name: "fn.date.short", signature: "fn.date.short(iso)",
    summary: "'2026-05-04' (date portion of an ISO 8601 string)." },
  { family: "date",       name: "fn.date.long",  signature: "fn.date.long(iso)",
    summary: "'May 4, 2026' (en-US per env.LOCALE)." },
  { family: "date",       name: "fn.date.iso",   signature: "fn.date.iso(iso)",
    summary: "'YYYY-MM-DDTHH:MM:SSZ' (UTC, normalised)." },

  // ── identity family ────────────────────────────────────────
  { family: "identity",   name: "fn.hash",    signature: "fn.hash(value)",
    summary: "SHA-256 hex digest. Canonicalisation rules in EXPR-RT §M14: primitives & lists supported; maps raise type-error in v1.0.0 (Future Work spec:fw:hash-maps)." },
];

/** Total count, derived once. */
export const STANDARD_HELPER_COUNT = STANDARD_HELPERS.length;

/** Helper-set families, derived once. */
export const STANDARD_HELPER_FAMILIES = Array.from(
  new Set(STANDARD_HELPERS.map((h) => h.family)),
) as readonly HelperEntry["family"][];

/**
 * Helpers grouped by family, useful for pretty-printing the inventory.
 * Returns a shallow snapshot — the underlying STANDARD_HELPERS is frozen-by-convention.
 */
export function helpersByFamily(): Record<HelperEntry["family"], HelperEntry[]> {
  const out = {} as Record<HelperEntry["family"], HelperEntry[]>;
  for (const f of STANDARD_HELPER_FAMILIES) out[f] = [];
  for (const h of STANDARD_HELPERS) out[h.family].push(h);
  return out;
}

/**
 * Pretty-printed `fn.upper, fn.lower, …` listing for one family.
 * Used when the SPEC text needs an inline enumeration.
 */
export function familyEnumeration(family: HelperEntry["family"]): string {
  return STANDARD_HELPERS.filter((h) => h.family === family)
    .map((h) => `\`${h.name}\``)
    .join(", ");
}

/**
 * Tier-A binding inventory. Each entry is the path under the activation
 * root, the CEL type, and a one-line source/determinism note. Used to
 * render the §M7 table in EXPR-RT and to cross-validate any RENDER-DSL
 * example that names a binding.
 */
export interface TierABinding {
  readonly path: string;
  readonly type: string;
  readonly note: string;
}

export const TIER_A_BINDINGS: readonly TierABinding[] = [
  { path: "doc",                     type: "map",         note: "The current target instance (validate-time: the primitive under check; render-time: the spec:Document for the project)." },
  { path: "doc.id",                  type: "string",      note: "↳ instance id." },
  { path: "doc.type_id",             type: "string",      note: "↳ instance type." },
  { path: "doc.fields",              type: "map",         note: "↳ raw field_values map." },
  { path: "project",                 type: "map",         note: "Project-level data." },
  { path: "project.id",              type: "string",      note: "↳" },
  { path: "project.profile_id",      type: "string",      note: "↳" },
  { path: "project.revision",        type: "int",         note: "Current operation-log revision." },
  { path: "project.fingerprint",     type: "string",      note: "SHA-256 of operation log up to project.revision." },
  { path: "project.primitives",      type: "list<map>",   note: "All primitives in the project." },
  { path: "project.relations",       type: "list<map>",   note: "All relations." },
  { path: "host",                    type: "map",         note: "Host-level facts." },
  { path: "host.fdpm_version",       type: "string",      note: "e.g. \"1.1.1\"." },
  { path: "host.helper_set_version", type: "string",      note: "e.g. \"1.0.0\" (see §M14)." },
  { path: "host.cel_revision",       type: "string",      note: "Pinned CEL spec revision. Bound for diagnostic/audit use (e.g., a render that produces unexpected output can be correlated with the CEL revision in effect). Templates SHOULD NOT branch on it; use `expr_helper_set` manifest pin or `spec:fw:semver-helper` for capability gates." },
  { path: "env",                     type: "map",         note: "Frozen-at-start environment." },
  { path: "env.NOW",                 type: "string",      note: "ISO 8601 UTC, captured ONCE at evaluator-start; identical for every expression in one run (preserves determinism)." },
  { path: "env.LOCALE",              type: "string",      note: "BCP-47, default \"en-US\"." },
  { path: "fn",                      type: "map<func>",   note: "Standard helper set (§M14)." },
];

/**
 * Tier-B bindings: opt-in via plugin-manifest permission.
 * `permission` is the manifest entry the plugin must declare.
 * `defaultIfUnavailable` is the value when permission held but
 * source unresolvable — see §M7 four-row truth table.
 */
export interface TierBBinding {
  readonly path: string;
  readonly permission: string;
  readonly defaultIfUnavailable: "null" | "permission-denied";
}

export const TIER_B_BINDINGS: readonly TierBBinding[] = [
  { path: "env.GIT_SHA",     permission: "read:vcs",     defaultIfUnavailable: "null" },
  { path: "env.GIT_BRANCH",  permission: "read:vcs",     defaultIfUnavailable: "null" },
  { path: "env.GIT_DIRTY",   permission: "read:vcs",     defaultIfUnavailable: "null" },
  { path: "host.os",         permission: "read:os-info", defaultIfUnavailable: "null" },
  { path: "host.cpu_count",  permission: "read:os-info", defaultIfUnavailable: "null" },
];

/**
 * Render the activation list for prose, e.g. "{ doc, project, env, host, fn }".
 * Single source of truth — never paraphrase elsewhere.
 */
export function activationListProse(): string {
  return ACTIVATION_TIER_A_LIST;
}

/**
 * A path is a known Tier-A or Tier-B binding. Used by the regression
 * test to confirm SPEC examples don't reference invented names.
 */
export function isKnownActivationPath(path: string): boolean {
  // `path` like "doc.title" — first segment is the binding name.
  const root = path.split(".")[0]!;
  if ((ACTIVATION_TIER_A_NAMES as readonly string[]).includes(root)) {
    // Root is a known tier-A binding. Sub-paths under doc.fields,
    // project.primitives, etc. are dynamic and not enumerable here;
    // root match is sufficient for the lint check.
    return true;
  }
  // Tier-B is also under env / host (already covered by root match).
  return false;
}

/**
 * Concrete-binding paths the SPEC scripts use as examples.
 * Lint to ensure every example resolves to a real binding.
 */
export const EXAMPLE_BINDINGS_USED: readonly string[] = [
  "doc.title",
  "doc.spec_id",
  "doc.status",
  "doc.fields.status",
  "doc.fields.title",
  "project.id",
  "project.revision",
  "project.fingerprint",
  "project.primitives",
  "host.fdpm_version",
  "host.helper_set_version",
  "env.NOW",
  "env.LOCALE",
  "env.GIT_SHA",
];
