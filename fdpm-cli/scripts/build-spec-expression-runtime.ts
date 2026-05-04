/**
 * Build the SPEC for the FDPM Host Expression Runtime — the single
 * CEL-based evaluator that powers BOTH validate-time predicates
 * (SPEC-CEL-VALIDATOR) and render-time templates (SPEC-RENDER-DSL).
 *
 * This SPEC owns the contracts those two consume:
 *   M1: FDPM → CEL type mapping
 *   M2: error model (validate-time vs. render-time)
 *   M7: tiered activation surface and permission model
 *   M14: helper-set + CEL-spec versioning
 *
 * Run:
 *   rm -rf /tmp/fdpm-spec-expr-rt
 *   FDPM_DATA_DIR=/tmp/fdpm-spec-expr-rt npx tsx \
 *     cli/scripts/build-spec-expression-runtime.ts
 *   FDPM_DATA_DIR=/tmp/fdpm-spec-expr-rt npx tsx cli/src/bin/fdpm.ts \
 *     render spec-expression-runtime text/markdown \
 *     --renderer-id spec:SpecMarkdownRenderer \
 *     -o docs/specs/SPEC-EXPRESSION-RUNTIME.md
 */

import {
  openHost,
  defineProject,
  type PrimitiveSpec,
  type RelationSpec,
} from "../src/sdk.js";
import { PROFILE_ID } from "../plugins/spec_authoring/index.js";
import {
  STANDARD_HELPERS,
  STANDARD_HELPER_COUNT,
  HELPER_SET_VERSION,
  TIER_A_BINDINGS,
  TIER_B_BINDINGS,
} from "./_spec-shared.js";

const PROJECT_ID = "spec-expression-runtime";
const SPEC_VERSION = "0.1.7";

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * Pretty-print a wrapped value column. Word-wraps long notes so the
 * Tier-A / Tier-B activation table notes get continuation lines aligned
 * under the start of the note column (via `indent`). The wrap width is
 * the column width AFTER the indent — so the actual content portion of
 * each line is `wrapAt - indent.length` characters.
 *
 * Pass-3 first attempt looped infinitely when `wrapAt - indent.length`
 * was non-positive; the loop now uses the content-width and a strict
 * minimum of one character per iteration to guarantee termination even
 * on pathological inputs.
 */
function wrapTo(text: string, indent: string, wrapAt: number): string[] {
  // Each line's content portion may be at most this wide.
  const contentWidth = Math.max(20, wrapAt);
  if (text.length <= contentWidth) return [text];
  const out: string[] = [];
  let rest = text;
  let isFirst = true;
  while (rest.length > 0) {
    const lead = isFirst ? "" : indent;
    if (rest.length <= contentWidth) {
      out.push(lead + rest);
      break;
    }
    // Word boundary: search backwards from contentWidth for a space.
    let cut = rest.lastIndexOf(" ", contentWidth);
    if (cut <= 0) cut = contentWidth; // word longer than column — forced break
    out.push(lead + rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).replace(/^ +/, "");
    isFirst = false;
  }
  return out;
}

// ── Document root ──────────────────────────────────────────────────────────

const documentSpec: PrimitiveSpec = {
  id: "spec:doc:expression-runtime",
  type: "spec:Document",
  fields: {
    title: "SPEC — FDPM Host Expression Runtime v0.1",
    subtitle:
      "One CEL-based engine for every expression in FDPM. Validate-time predicates, render-time templates, and any future expression context all bind into the same activation surface, share the same type mapping, share the same error model, and share the same closed helper inventory.",
    spec_id: "spec:fdpm:expression-runtime:0.1",
    version: SPEC_VERSION,
    status: "Proposal",
    audience:
      "FDPM core maintainers (this defines a Core service), plugin authors (any plugin shipping validators or renderers consumes this), security reviewers (the activation surface is the trust boundary).",
    required_reads: [
      "CLAUDE.md",
      "PURPOSE.md",
      "DISCLAIMER.md",
      "docs/specs/SPEC-CORE.md",
      "docs/specs/SPEC-PLUGGABLE-ARCHITECTURE.md",
    ],
    companion_code:
      "cli/src/core/expr/runtime.ts (ExpressionRuntime), cli/src/core/expr/std.ts (helper-set inventory), cli/src/core/expr/activation.ts (Tier-A/Tier-B activation + legacy aliases), cli/src/core/expr/types.ts (FDPM→CEL mapper), cli/src/core/validation/pipeline.ts (validate-time consumer).",
    peer_spec: "docs/specs/SPEC-CORE.md",
    disclaimer_path: "../../DISCLAIMER.md",
    pals_banner: true,
    pals_extension:
      "Any expression evaluated by the host is an authorisation decision. " +
      "Without an explicit type mapping, error model, activation contract, and " +
      "version pin, two evaluations of the same string can produce different " +
      "results depending on context — exactly the silent-failure mode PALS-LAW " +
      "treats as an architectural defect. This SPEC pins all four.",
    date: "2026-05-04",
    generated_by: "Claude Opus 4.7 (1M context) via Claude Code (fdpm.spec-authoring)",
    revision_note:
      "0.1.7 — core runtime gaps closed. Bound caps, the closed 8-code runtime enum, full fn.sortBy key-expression semantics, automatic Tier-B git probing, and typed top-level CEL bindings are now shipped. See §0.5 and §19.",
    source_script: "cli/scripts/build-spec-expression-runtime.ts",
    regeneration_command: [
      "rm -rf /tmp/fdpm-spec-expr-rt",
      "FDPM_DATA_DIR=/tmp/fdpm-spec-expr-rt npx tsx cli/scripts/build-spec-expression-runtime.ts",
      "FDPM_DATA_DIR=/tmp/fdpm-spec-expr-rt npx tsx cli/src/bin/fdpm.ts \\",
      "  render spec-expression-runtime text/markdown \\",
      "  --renderer-id spec:SpecMarkdownRenderer \\",
      "  -o docs/specs/SPEC-EXPRESSION-RUNTIME.md",
    ].join("\n"),
  },
};

// ── §3 Definitions ─────────────────────────────────────────────────────────

const terms: Array<[string, string, string?]> = [
  [
    "CEL",
    "Common Expression Language. The engine; this SPEC pins a specific revision. See §6 for the version-pinning rule.",
    "Common Expression Language",
  ],
  [
    "Activation",
    "The set of named values bound into the evaluator before a single expression executes. The activation surface is closed (§5); adding a name is a SPEC amendment.",
  ],
  [
    "Activation tier",
    "Each activation entry has a tier (A/B/C, §5). Tier governs default visibility, required permission, and amendment process.",
  ],
  [
    "Helper",
    "A pure function under `fn.*` registered with the runtime. The standard set is owned by Core; plugins may register namespaced helpers via `cap:expr-helper`.",
  ],
  [
    "Type mapping",
    "The function from FDPM field kinds to CEL types defined in §4. Validators and renderers both go through this mapping; plugins MUST NOT define a private one.",
  ],
  [
    "Error policy",
    "The contract for how an evaluator surfaces failures. This SPEC defines two: halt-and-tag (validate-time) and inline-and-continue (render-time). See §M2.",
  ],
  [
    "Helper-set version",
    "Independent semver tracking the canonical `fn.*` inventory. Adding a helper is `minor`; semantic change is `major`. Plugins pin via `expr_helper_set` in their manifest.",
  ],
  [
    "Render-time / validate-time",
    "Two evaluation contexts FDPM supports today. Validate-time runs inside the §7 pipeline against `ValidationRuleDef.expression`. Render-time runs inside `cap:renderer` against `${...}` placeholders. Both bind into activations defined here.",
  ],
];
const termSpecs: PrimitiveSpec[] = terms.map(([term, definition, synonyms]) => ({
  id: `spec:term:${slug(term)}`,
  type: "spec:Term",
  fields: synonyms ? { term, definition, synonyms } : { term, definition },
}));

// ── §2 Stakeholders ────────────────────────────────────────────────────────

const stakeholders = [
  {
    id: "spec:stk:core-maintainer",
    role: "Core maintainer",
    primary_concern:
      "One evaluator path. The §7 pipeline, the renderer, and any future expression-bearing surface all delegate to the same engine. No private parsers, no per-plugin helper sets bypassing the Core registry.",
    category: "internal_team",
  },
  {
    id: "spec:stk:plugin-author",
    role: "Plugin author",
    primary_concern:
      "Predictable activation. A plugin author writes a predicate or template once and knows what's in scope, what types come back, what errors look like, what version pins are. No surprises across releases.",
    category: "external_team",
  },
  {
    id: "spec:stk:security-reviewer",
    role: "Security reviewer",
    primary_concern:
      "The activation surface is the trust boundary. Tier A is reviewed once. Tier B requires a permission per binding. Tier C is opt-in cross-plugin reach. No fall-through to undefined / null / empty string.",
    category: "internal_team",
  },
  {
    id: "spec:stk:operator",
    role: "Operator",
    primary_concern:
      "Determinism. A render or validate run is byte-identical given the same project state and the same activation captured-at-start. Helpers' semantic version is queryable so reproducing yesterday's output doesn't silently use today's helpers.",
    category: "human",
  },
];
const stakeholderSpecs: PrimitiveSpec[] = stakeholders.map((s) => ({
  id: s.id,
  type: "spec:Stakeholder",
  fields: { role: s.role, primary_concern: s.primary_concern, category: s.category },
}));

// ── §3 Quality Attributes ──────────────────────────────────────────────────

const qas = [
  {
    id: "spec:qa:single-engine",
    attribute: "Single-engine guarantee",
    pressure:
      "Two evaluators in the host produce drift. This SPEC's whole reason for existing is to prevent it. Validate-time and render-time MUST share the parser, type mapping, error model, helper registry, and version pins.",
    priority: "primary",
  },
  {
    id: "spec:qa:closed-surface",
    attribute: "Closed surface",
    pressure:
      "An open activation surface invites silent name drift across plugins. The activation MUST be enumerable and amendment-bound at every tier.",
    priority: "primary",
  },
  {
    id: "spec:qa:errors-loud",
    attribute: "Errors loud",
    pressure:
      "An undefined name MUST produce a categorised, located error — never a coerced empty value. CLAUDE.md PALS-LAW: silent failure is an architectural defect.",
    priority: "primary",
  },
  {
    id: "spec:qa:reproducibility",
    attribute: "Reproducibility",
    pressure:
      "Two evaluations of the same expression against the same project state at the same env-time MUST produce byte-identical output. Helper-set version drift MUST be detectable.",
    priority: "primary",
  },
  {
    id: "spec:qa:performance",
    attribute: "Performance",
    pressure:
      "The runtime is on the hot path of every validate and every render. Compilation overhead must be paid once per expression-string identity, not per call.",
    priority: "secondary",
  },
];
const qaSpecs: PrimitiveSpec[] = qas.map((q) => ({
  id: q.id,
  type: "spec:QualityAttribute",
  fields: { attribute: q.attribute, pressure: q.pressure, priority: q.priority },
}));

// ── §4 Principles ──────────────────────────────────────────────────────────

const principles = [
  {
    id: "spec:prin:one-engine",
    ordinal: 1,
    title: "One CEL engine, one type mapping, one helper registry.",
    statement:
      "The host owns exactly one CEL evaluator, one FDPM→CEL type mapping (§M1), and one helper registry. Validate-time, render-time, and every future expression context binds into activations served by this engine.",
    strength: "MUST",
  },
  {
    id: "spec:prin:closed-activation",
    ordinal: 2,
    title: "Activation surface is closed, tiered, and amendment-bound.",
    statement:
      "Tier A is named exhaustively in §M7. Tier B grows only via permissions in plugin manifests. Tier C grows only via `cap:expr-helper` registrations. An expression that names a path outside the active tiers MUST surface as a categorised error (§M2).",
    strength: "MUST",
  },
  {
    id: "spec:prin:errors-as-values",
    ordinal: 3,
    title: "Errors are values, never user-visible exceptions.",
    statement:
      "The evaluator's exception barrier (SPEC-CORE §7.1 step 6) catches every CEL exception and converts to a categorised error finding (§M2). Validators see findings; renderers see inline markers. User-facing flow never observes a thrown JS error from the runtime.",
    strength: "MUST",
  },
  {
    id: "spec:prin:bounded",
    ordinal: 4,
    title: "Every evaluation is bounded.",
    statement:
      "List-iteration cap (default 1000, hard cap 100 000), expression nesting cap (32), helper arity cap (8), output-string cap (65 536 codepoints). Caps are uniform across validate-time and render-time. Exceeding a cap fires a `bound-exceeded` error.",
    strength: "MUST",
  },
  {
    id: "spec:prin:versioned",
    ordinal: 5,
    title: "Three independent versions, one pinning rule.",
    statement:
      "SPEC version (this document), CEL spec revision (pinned in §M14), helper-set semver (queryable as `host.helper_set_version`). A bump to one does NOT cascade to the others unless §M14 says it does.",
    strength: "MUST",
  },
];
const principleSpecs: PrimitiveSpec[] = principles.map((p) => ({
  id: p.id,
  type: "spec:Principle",
  fields: { ordinal: p.ordinal, title: p.title, statement: p.statement, strength: p.strength },
}));

// ── §M1 Type mapping (modelled as a SchemaDefinition) ──────────────────────

const m1TypeMapping: PrimitiveSpec = {
  id: "spec:schema:m1-type-mapping",
  type: "spec:SchemaDefinition",
  fields: {
    name: "M1 — FDPM → CEL type mapping (normative)",
    dialect: "ad_hoc",
    body: [
      "// Plugins, validators, and renderers MUST go through this mapping.",
      "// Private mappings (a plugin coercing a field a different way) are a",
      "// contract violation. The mapper lives in cli/src/core/expr/types.ts",
      "// once the runtime ships.",
      "",
      "FDPM kind          → CEL type     Notes",
      "─────────────────────────────────────────────────────────────────────────",
      "string             → string       UTF-8.",
      "text               → string       UTF-8. Long-form prose; no special handling.",
      "id-ref             → string       The id is a string; CEL has no Id type.",
      "                                  Validator-side `references` rule still",
      "                                  fires per SPEC-CORE; CEL just sees string.",
      "integer            → int          64-bit signed. Overflow surfaces as",
      "                                  `runtime-error`, never silent wrap.",
      "number             → double       IEEE 754. NaN propagates per CEL spec.",
      "boolean            → bool         No coercion from string `\"true\"`/`\"false\"`.",
      "enum               → string       The enum value verbatim. Comparison is",
      "                                  string equality. No CEL enum type.",
      "datetime           → string       ISO 8601 UTC. NOT CEL `timestamp` —",
      "                                  reasoning: timestamp formatting is",
      "                                  context-dependent; raw string round-trips",
      "                                  byte-for-byte through YAML/JSON.",
      "                                  Helpers `fn.date.*` operate on the string.",
      "list<T>            → list<T'>     T' is T under this same mapping.",
      "struct, json       → map<string,  Inline-struct / json fields become open",
      "                     dyn>         maps. Field access via `.` works; missing",
      "                                  keys produce CEL `null`.",
      "absent field       → null         Resolves to CEL `null`. Use CEL `has()`",
      "                                  macro to distinguish 'absent' from",
      "                                  'present-and-null'.",
      "explicit null      → null         Same as above.",
      "",
      "// Cross-type comparison rule:",
      "//   `\"42\" == 42`  →  `runtime-error: type-error` (no implicit coercion).",
      "//   `null == null` →  `true`.",
      "//   `null == x`    →  `false` for non-null x (CEL standard).",
    ].join("\n"),
  },
};

// ── §M2 Error model (modelled as a SchemaDefinition) ───────────────────────

const m2ErrorModel: PrimitiveSpec = {
  id: "spec:schema:m2-error-model",
  type: "spec:SchemaDefinition",
  fields: {
    name: "M2 — Error model (normative)",
    dialect: "ad_hoc",
    body: [
      "// Two policies, one per evaluation context. Both share the closed",
      "// error-category set below. Both convert exceptions to typed values",
      "// at the host boundary; user-visible flow never observes a JS throw.",
      "",
      "Context        | Policy                | Surface",
      "───────────────|───────────────────────|────────────────────────────────",
      "Validate-time  | Halt-and-tag          | ValidationFinding with",
      "(predicates)   | (SPEC-CORE §7.1       | rule_id:                       ",
      "               |   step 6)             | `plugin-validator-raised:      ",
      "               |                       |   <rule_id>`,                  ",
      "               |                       | level: error,                  ",
      "               |                       | evidence carries category +    ",
      "               |                       | expression text + CEL location.",
      "Render-time    | Inline-and-continue   | Inline marker at placeholder:  ",
      "(templates)    |                       | `[render-error: <category>     ",
      "               |                       | @<line>:<col>]`.               ",
      "               |                       | Renderer return envelope       ",
      "               |                       | carries `render_errors:        ",
      "               |                       | RenderFinding[]` (see §M2.1    ",
      "               |                       | for the shape).                ",
      "               |                       | CLI default: exit 0; bytes     ",
      "               |                       | emitted with inline markers.   ",
      "               |                       | `fdpm render --strict`: exit   ",
      "               |                       | non-zero if render_errors is   ",
      "               |                       | non-empty; bytes still emitted ",
      "               |                       | so CI can publish a 'broken'   ",
      "               |                       | preview while failing the gate.",
      "",
      "// Closed error-category set (CLI v1.x):",
      "",
      "category          when fired",
      "──────────────────────────────────────────────────────────────────────",
      "unknown-name      A CEL identifier resolves to no entry in any active",
      "                  activation tier. Always level=error.",
      "unknown-helper    `fn.foo` is not in the registered set. Always error.",
      "type-error        Operands incompatible per §M1 mapping. Always error.",
      "bound-exceeded    Iteration / nesting / arity / output cap fired (§Prin 4).",
      "                  Always error.",
      "arity-error       Helper called with wrong argument count.",
      "                  Always error.",
      "parse-error       Expression malformed (validate-time only — render-time",
      "                  catches at template-load).  Always error.",
      "runtime-error     CEL evaluator raised something else (catch-all).",
      "                  Original message in evidence.",
      "permission-denied Tier B binding referenced without the matching",
      "                  permission in the calling plugin's manifest.",
      "                  Always error.",
      "",
      "// All categories produce ValidationLevel `error` in v0.1.",
      "// Future: a `--lint` mode could downgrade unknown-name to `warning`",
      "// for authoring tooling. Out of scope for v0.1.",
      "",
      "// §M2.1 RenderFinding shape (render-time only):",
      "//   {",
      "//     category: <one of the 8 categories above>,",
      "//     message:  string,",
      "//     location: { template_id: string, line: int, col: int },",
      "//     expression: string,    // the offending CEL source",
      "//     evidence:  map         // category-specific extra fields",
      "//   }",
      "// RenderFinding is DISTINCT from ValidationFinding (cli/src/core/",
      "// models/instance.ts). Validate-time uses ValidationFinding (carries",
      "// rule_id, target_id, field_path); render-time uses RenderFinding",
      "// (carries template_id and line/col). Both share the §M2 category",
      "// vocabulary but their evidence shapes differ.",
    ].join("\n"),
  },
};

// ── §M7 Activation surface (modelled as a SchemaDefinition) ────────────────

/**
 * Build the §M7 body from the shared TIER_A_BINDINGS / TIER_B_BINDINGS
 * data. Single source of truth — see _spec-shared.ts. Editing this
 * function is fine; editing the inline strings of the prior version
 * was the drift hazard pass-3 caught.
 */
function buildM7Body(): string {
  const PATH_W = 30;
  const TYPE_W = 16;
  const NOTE_W = 60;
  const lines: string[] = [
    "// Three tiers. Tier A and B are owned by Core; Tier C by plugins.",
    "// Adding a Tier-A binding is a SPEC amendment to this document.",
    "// Adding a Tier-B binding is a SPEC amendment AND a new permission.",
    "// Adding a Tier-C binding is a plugin-manifest entry under cap:expr-helper.",
    "",
    "// === TIER A — always bound, no permission required ===",
    "",
    "Path".padEnd(PATH_W) + "Type".padEnd(TYPE_W) + "Source / Determinism",
    "─".repeat(PATH_W + TYPE_W + Math.min(NOTE_W, 30)),
  ];
  const indent = " ".repeat(PATH_W + TYPE_W);
  for (const b of TIER_A_BINDINGS) {
    const wrapped = wrapTo(b.note, indent, NOTE_W);
    lines.push(b.path.padEnd(PATH_W) + b.type.padEnd(TYPE_W) + wrapped[0]);
    for (let i = 1; i < wrapped.length; i++) lines.push(wrapped[i]!);
  }
  lines.push(
    "",
    "// === TIER B — opt-in, requires plugin-manifest permission ===",
    "",
    "Path".padEnd(PATH_W) + "Permission".padEnd(TYPE_W) + "Default when permission held but value unresolvable",
    "─".repeat(PATH_W + TYPE_W + 30),
  );
  for (const b of TIER_B_BINDINGS) {
    lines.push(b.path.padEnd(PATH_W) + b.permission.padEnd(TYPE_W) + b.defaultIfUnavailable);
  }
  return lines.join("\n");
}

const m7Activation: PrimitiveSpec = {
  id: "spec:schema:m7-activation",
  type: "spec:SchemaDefinition",
  fields: {
    name: "M7 — Tiered activation surface (normative)",
    dialect: "ad_hoc",
    body: [
      buildM7Body(),
      "",
      "// Tier-B resolution truth table:",
      "//   permission held + value resolvable     → value",
      "//   permission held + value unresolvable   → null",
      "//   permission missing + value resolvable  → permission-denied",
      "//   permission missing + value unresolvable→ permission-denied",
      "// The permission check ALWAYS fires before resolution. The host",
      "// never queries the underlying source (git, OS, etc.) for a plugin",
      "// without the permission — even when the answer would be 'unavailable'.",
      "",
      "// === TIER C — plugin-contributed, namespaced ===",
      "",
      "Plugins may register helpers under `fn.<plugin-id>.*` via the new",
      "capability `cap:expr-helper`. Manifest declaration:",
      "",
      "  {",
      "    \"capability_id\": \"cap:expr-helper\",",
      "    \"local_name\": \"my_helper\",",
      "    \"entry\": \"my_helper\",         // exported function name",
      "    \"purity\": \"pure\" | \"host-fact\",",
      "    \"arity\": <int>,",
      "    \"permissions\": [<perm>...]    // permissions required to invoke",
      "  }",
      "",
      "Cross-plugin invocation: plugin A using fn.<plugin-b>.foo MUST declare",
      "  \"requires_helpers\": [\"fn.<plugin-b>.foo\"]",
      "in its manifest. Without that, the invocation triggers",
      "`permission-denied` even if both plugins are active.",
      "",
      "// New manifest fields this SPEC introduces (amendment to",
      "// SPEC-PLUGGABLE-ARCHITECTURE §5 — see §13 for the amendment plan):",
      "//   - cap:expr-helper        (capability kind, §4.1)",
      "//   - permissions: read:vcs, read:os-info  (§5.2)",
      "//   - host_compatibility.expr_helper_set   (§5.1, semver range)",
      "//   - requires_helpers: string[]           (§5.1, namespaced helper ids)",
      "// All four are optional on existing plugins; only plugins consuming",
      "// the runtime need them.",
    ].join("\n"),
  },
};

// ── §M14 Versioning (modelled as a SchemaDefinition) ───────────────────────

const m14Versioning: PrimitiveSpec = {
  id: "spec:schema:m14-versioning",
  type: "spec:SchemaDefinition",
  fields: {
    name: "M14 — Versioning (normative)",
    dialect: "ad_hoc",
    body: [
      "// Three independent version numbers. Bumps don't cascade unless",
      "// stated below.",
      "",
      "// 1. SPEC version (this document)",
      "//    major.minor.patch. Proposal-stage Core SPECs may use 0.x.",
      "//    Major 1 starts when the contract is ratified for FDPM Core 1.x.",
      "//    Bumps THIS document only. Consumer SPECs (SPEC-CEL-VALIDATOR,",
      "//    SPEC-RENDER-DSL) may pin a minimum version of this SPEC in their",
      "//    own §0 Document Status.",
      "",
      "// 2. CEL spec revision (pinned)",
      "//    Initial pin: TBD at implementation time. The PR landing",
      "//    cli/src/core/expr/ MUST cite the cel-spec git revision it",
      "//    targets and the cel-js npm version it embeds. Bumping is:",
      "//      - patch: behavior preserved (e.g., a typo in the cel-spec",
      "//               document was fixed; nothing observable changes)",
      "//      - minor: new operators or macros become available",
      "//      - major: a behavior changed (NaN equality clarification etc.)",
      "//    A major CEL bump REQUIRES a SPEC-amendment minor bump on this",
      "//    document AND on every consumer SPEC.",
      "",
      "// 3. Helper-set semver (host.helper_set_version)",
      "//    Independent semver. Queryable from the activation as a Tier-A",
      "//    string. Plugins may pin via manifest:",
      "",
      "      {",
      "        \"host_compatibility\": {",
      "          \"fdpm\": \">=1.1,<2\",",
      "          \"expr_helper_set\": \">=1.1.0,<2\"",
      "        }",
      "      }",
      "",
      "//    Host refuses to load a plugin whose pin is unsatisfied (mirrors",
      "//    the existing host_compatibility.fdpm pin).",
      "//    Bump rules:",
      "//      - patch: fixed a bug in fn.<x> WITHOUT changing observable",
      "//               output for any input the previous version handled.",
      "//      - minor: ADDED a new helper. Existing helpers unchanged.",
      "//      - major: RENAMED a helper, REMOVED a helper, or CHANGED",
      "//               observable output for any input.",
      "//    Templates may guard helper availability via a manifest pin",
      "//    (refusing-to-load is the v0.1 mechanism). String comparison of",
      "//    semver inside a template is NOT reliable — `\"1.10.0\" < \"1.2.0\"`",
      "//    lexicographically. A `fn.semver_satisfies(range, version)`",
      "//    helper is Future Work; do not implement template-time version",
      "//    guards by string comparison in v0.1.",
      "",
      `// Standard helper set v${HELPER_SET_VERSION} inventory (generated from`,
      "// cli/scripts/_spec-shared.ts; same source as SPEC-RENDER-DSL §6.4):",
      ...(() => {
        // Group by family for readability while preserving canonical
        // order. The shared module guarantees stable ordering.
        const out: string[] = [];
        let last: string | null = null;
        for (const h of STANDARD_HELPERS) {
          if (h.family !== last) {
            out.push(`//   ${h.family} family:`);
            last = h.family;
          }
          out.push(`//     ${h.signature.padEnd(28)} — ${h.summary}`);
        }
        return out;
      })(),
      `// Total: ${STANDARD_HELPER_COUNT} functions across 4 families.`,
      "",
      "// Graph helper inventory (registered on the `graph` receiver, NOT under fn.*).",
      "// These mediate relation-graph and primitive-existence queries that pure",
      "// CEL cannot express against the activation contract. Inventory is closed;",
      "// adding a graph helper requires a SPEC amendment AND a helper-set semver",
      "// bump (additive → minor; behaviour change → major).",
      "//",
      "//   graph.incoming(rel_id):list           — ids of source primitives whose rel of type rel_id targets self.",
      "//   graph.outgoing(rel_id):list           — ids of target primitives that self's rel of type rel_id reaches.",
      "//   graph.acyclic(rel_id):bool            — true iff the rel_id-induced subgraph reachable from self is a DAG.",
      "//   graph.exists(target_id):bool          — true iff target_id is the id of some primitive in the project.   (v1.1.0)",
      "//   graph.target_exists(rel_id):bool      — true iff every outbound rel of type rel_id from self resolves.   (v1.1.0)",
      "//",
      "// Total: 5 graph helpers (3 in v1.0.0 + 2 in v1.1.0).",
      "// Composition idiom: `graph.outgoing(R).size() >= 1 && graph.target_exists(R)`",
      "// is the canonical 'must have at least one outbound R AND every target resolves' check.",
      "// `graph.target_exists` is vacuously true on instances with no outbound R; pair",
      "// with the size guard whenever the rule needs a non-empty contract.",
      "",
      "// fn.hash canonicalisation rules (NORMATIVE):",
      "//   - string  → SHA-256 of the UTF-8 bytes",
      "//   - int     → SHA-256 of the decimal representation, no leading zeros",
      "//   - double  → SHA-256 of the shortest round-trip decimal (Steele-White),",
      "//               '-0' canonicalised to '0', NaN raises type-error",
      "//   - bool    → SHA-256 of \"true\" or \"false\" (UTF-8)",
      "//   - null    → SHA-256 of the empty string",
      "//   - list<T> → SHA-256 of (SHA-256(elem_0) || SHA-256(elem_1) || …),",
      "//               in the order CEL produced. Order matters by design.",
      "//   - map     → type-error. Map iteration order is non-deterministic in",
      "//               CEL; hashing maps requires a stable canonical form this",
      "//               SPEC does not yet pin. Future Work spec:fw:hash-maps.",
      "// Two evaluations of identical CEL values produce identical digests;",
      "// two evaluations of equivalent-but-differently-ordered values may not.",
    ].join("\n"),
  },
};

// ── §15 ADR + §16 Trade-off Matrix ─────────────────────────────────────────

const optA: PrimitiveSpec = {
  id: "spec:opt:single-runtime",
  type: "spec:Option",
  fields: {
    label: "Option A — One Core service, one CEL engine, three tiers",
    description:
      "Establish `cli/src/core/expr/` as a Core service: type mapper, evaluator wrapper around cel-js, activation factory, helper registry, error converter. Plugins register Tier-C helpers via `cap:expr-helper`. Validators and renderers receive activations from this service; neither imports cel-js directly.",
    pros: [
      "Single source of truth for type mapping, error categories, helper inventory, activation contract.",
      "Plugins can't drift — there's no other engine to drift from.",
      "Adding a new expression context (e.g., scheduler, cron, query API) is a binding factory, not a re-implementation.",
      "The fork problem M4 named (template parser vs. predicate parser) ceases to exist.",
    ],
    cons: [
      "Core gains a non-trivial module. ~1200 lines of TS, ~250 lines of tests for the standard helpers alone.",
      "Coupling: changes to type mapping ripple through every consumer SPEC. Mitigated by the §M14 patch/minor/major split.",
    ],
    verdict: "chosen",
  },
};

const optB: PrimitiveSpec = {
  id: "spec:opt:per-plugin-runtime",
  type: "spec:Option",
  fields: {
    label: "Option B — Each plugin embeds its own CEL evaluator",
    description:
      "Plugins import cel-js directly. Each builds its own activation. The host provides nothing but the §7 step-6 exception barrier.",
    pros: [
      "No new Core code; minimal short-term diff.",
      "Plugin authors who know cel-js are unblocked immediately.",
    ],
    cons: [
      "The exact failure mode SPEC-CEL-VALIDATOR exists to prevent: per-plugin helper sets diverge; type mappings diverge; error envelopes diverge; templates and predicates compile against different engines in the same process.",
      "Cross-plugin helper reuse is impossible by construction.",
      "Operator can't query 'what's in scope at validate-time?' because the answer is plugin-specific.",
    ],
    verdict: "rejected",
    rejection_reason:
      "Re-creates the multi-evaluator failure mode the predecessor SPEC was written to fix. Same defect, different location.",
  },
};

const optC: PrimitiveSpec = {
  id: "spec:opt:status-quo",
  type: "spec:Option",
  fields: {
    label: "Option C — Status quo: predicates as info findings; no render-time DSL",
    description:
      "Don't formalise an expression runtime at all. SPEC-CEL-VALIDATOR ships with cel-js embedded directly in cli/src/core/validation/. SPEC-RENDER-DSL stalls. Future expression contexts each pick their own engine.",
    pros: [
      "Zero new SPEC.",
      "Smallest immediate footprint.",
    ],
    cons: [
      "Doesn't solve the activation surface problem. Doesn't solve the type mapping problem. Doesn't solve cross-context consistency.",
      "Every future expression context (scheduler, cron, query API) will repeat this conversation.",
      "Helper-set version drift is unmanaged.",
    ],
    verdict: "rejected",
    rejection_reason:
      "Treats the absence of a contract as a feature. The contract is what plugins consume; absence forces every plugin to invent it locally.",
  },
};

const adr: PrimitiveSpec = {
  id: "spec:adr:expr-001",
  type: "spec:ADR",
  fields: {
    adr_id: "ADR-EXPR-001",
    title: "Establish a Core expression runtime as the single CEL service for FDPM",
    status: "proposed",
    date: "2026-05-04",
    context:
      "SPEC-CEL-VALIDATOR proposed adopting CEL for predicate evaluation. SPEC-RENDER-DSL proposed adopting it for render-time templates. Both implicitly assumed the same engine. Inspection of those drafts surfaced four load-bearing gaps neither SPEC had spec'd: M1 (type mapping), M2 (error model), M7 (activation provenance / permissions), M14 (versioning). Picking those at the consumer-SPEC level would either force each consumer to repeat the picks (drift waiting to happen) or force the picks into one of them and have the other depend on it (asymmetry). Neither is honest.",
    decision:
      "Establish a Core service `cli/src/core/expr/` that owns the CEL evaluator, the FDPM→CEL type mapping (§M1), the closed error category set + two-policy error model (§M2), the three-tier activation surface (§M7), and the helper-set semver (§M14). SPEC-CEL-VALIDATOR and SPEC-RENDER-DSL become CONSUMERS — they declare which activation tier they bind, which evaluation context they use, and which helpers they reference. They do NOT define the type mapping, the error model, the helper set, or the version pinning rules. Those live here.",
    consequences: [
      { polarity: "positive", text: "One service, one set of rules. Plugins can't drift across consumers." },
      { polarity: "positive", text: "Adds a new permission (`read:vcs`) to SPEC-PLUGGABLE-ARCHITECTURE §5.2 — unblocks env.GIT_SHA cleanly." },
      { polarity: "positive", text: "Adds a new capability (`cap:expr-helper`) — gives plugins a structured way to extend the helper inventory without amending Core SPECs." },
      { polarity: "positive", text: "Independent helper-set semver gives plugins a version-aware compatibility gate via manifest pinning without forcing unsafe template-time string comparison." },
      { polarity: "negative", text: "Three SPECs in flight (this + SPEC-CEL-VALIDATOR + SPEC-RENDER-DSL). Migration ordering matters." },
      { polarity: "negative", text: "Adds ~1200 LOC to Core + ~250 LOC of standard-helper tests." },
      { polarity: "neutral", text: "datetime → string (not CEL timestamp): consumers must use fn.date.* helpers, never CEL timestamp arithmetic. Documented in §M1." },
      { polarity: "neutral", text: "Render-time errors are inline-and-continue (not halt). Validate-time errors are halt-and-tag. Different policies for different contexts; both share the closed category set." },
    ],
    compliance_checks: [
      "CI: cli/src/core/expr/ has zero imports of cel-js OUTSIDE evaluator.ts. Plugins MUST NOT import cel-js at all (CI grep).",
      "CI: every plugin manifest declaring cap:expr-helper has matching `permissions` and `arity` entries; helpers without arity declarations refuse to register.",
      "CI: the standard helper-set inventory exported from cli/src/core/expr/std.ts matches §M14's listing exactly (one-line-per-helper test).",
      "Test: an undefined name produces `unknown-name` error with file:line:col, never silent null.",
      "Test: a Tier-B binding without permission produces `permission-denied`, never silent null.",
      "Test: re-evaluating the same expression against the same project produces byte-identical output. env.NOW is captured-at-start; second call within the same evaluator-instance returns the same string.",
    ],
    revisit_signals: [
      "If three or more plugins request the same Tier-C helper, consider promoting it to the standard set (helper-set minor bump).",
      "If a Tier-A binding's compute cost dominates real workloads, consider lazy resolution (compute on first reference within an evaluation).",
      "If a future context (scheduler? cron?) needs an activation tier this SPEC didn't predict, amend §M7 — don't subclass.",
    ],
  },
};

const tradeoffs: PrimitiveSpec[] = [
  {
    id: "spec:tx:effort",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Implementation effort",
      cells: [
        { option_id: "spec:opt:single-runtime", value: "L (~1200 LOC + tests)" },
        { option_id: "spec:opt:per-plugin-runtime", value: "S (per plugin)" },
        { option_id: "spec:opt:status-quo", value: "XS" },
      ],
    },
  },
  {
    id: "spec:tx:single-engine",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Single-engine guarantee (Principle 1)",
      cells: [
        { option_id: "spec:opt:single-runtime", value: "Yes" },
        { option_id: "spec:opt:per-plugin-runtime", value: "No (each plugin embeds)" },
        { option_id: "spec:opt:status-quo", value: "N/A" },
      ],
    },
  },
  {
    id: "spec:tx:cross-context",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Cross-context consistency (validate vs. render)",
      cells: [
        { option_id: "spec:opt:single-runtime", value: "Yes" },
        { option_id: "spec:opt:per-plugin-runtime", value: "No" },
        { option_id: "spec:opt:status-quo", value: "No" },
      ],
    },
  },
  {
    id: "spec:tx:plugin-extension",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Plugin-helper extension story",
      cells: [
        { option_id: "spec:opt:single-runtime", value: "cap:expr-helper (structured)" },
        { option_id: "spec:opt:per-plugin-runtime", value: "Plugin-private (no reuse)" },
        { option_id: "spec:opt:status-quo", value: "None" },
      ],
    },
  },
  {
    id: "spec:tx:audit-surface",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Operator-visible audit surface",
      cells: [
        { option_id: "spec:opt:single-runtime", value: "Single registry; queryable" },
        { option_id: "spec:opt:per-plugin-runtime", value: "Per-plugin opaque" },
        { option_id: "spec:opt:status-quo", value: "Per-plugin opaque" },
      ],
    },
  },
];

// ── §14 Quality-Attribute Scenarios ────────────────────────────────────────

const scenarios: PrimitiveSpec[] = [
  {
    id: "spec:qas:single-engine",
    type: "spec:QAScenario",
    fields: {
      title: "Single-engine guarantee — one expression, two contexts, identical types",
      source: "Plugin author writing the same predicate in a validator and a render template.",
      stimulus: "An expression `doc.fields.status == \"accepted\"` runs in both contexts.",
      environment: "Standard fixture; warm Host.",
      artifact: "cli/src/core/expr/.",
      response:
        "The same parser, the same type mapping, the same null-handling, the same comparison rule produce the same boolean in both contexts. A change to §M1 affects both contexts in the same release.",
      response_measure:
        "100 % of the standard expression test suite produces identical outputs across validate-time and render-time contexts.",
    },
  },
  {
    id: "spec:qas:closed-surface",
    type: "spec:QAScenario",
    fields: {
      title: "Closed surface — typo'd identifier never silently null",
      source: "Renderer author with a typo: `${doc.titel}`.",
      stimulus: "Render the project containing this template.",
      environment: "Local CLI; render-time.",
      artifact: "Activation resolver in cli/src/core/expr/.",
      response:
        "Resolution returns `unknown-name` error. Render-time policy emits inline marker `[render-error: unknown-name @<line>:<col>]`. Operator sees the marker AND the error in the renderer's `render_errors` list.",
      response_measure: "0 typo'd names resolve to null. 100 % surface a categorised error.",
    },
  },
  {
    id: "spec:qas:permission-tier-b",
    type: "spec:QAScenario",
    fields: {
      title: "Tier-B permission — env.GIT_SHA without permission fires error",
      source: "Plugin without `read:vcs` referencing `${env.GIT_SHA}`.",
      stimulus: "Validate or render via that plugin.",
      environment: "Plugin manifest declares no `read:vcs`; running inside a git repo.",
      artifact: "Tier-B binding resolver.",
      response:
        "Resolution returns `permission-denied` error. Plugin observes the error finding; does NOT receive the actual SHA. The host's binding factory enforces the permission check before it ever queries the git layer.",
      response_measure: "0 unauthorised reads succeed. 100 % surface as `permission-denied` error.",
    },
  },
  {
    id: "spec:qas:helper-version-pin",
    type: "spec:QAScenario",
    fields: {
      title: "Helper-set version pin — refuse to load plugin pinned to unsatisfied set",
      source: "Operator installing a plugin pinned to `expr_helper_set: \">=2.0.0\"`.",
      stimulus: "Plugin discovery during host load.",
      environment: "Host shipping helper-set v1.0.0.",
      artifact: "Plugin runtime + manifest validator.",
      response:
        "Host emits `host_compat` error and refuses to register the plugin. Operator sees a clear message: `helper-set v1.0.0 does not satisfy plugin pin >=2.0.0`. Host load continues; other plugins activate.",
      response_measure: "100 % of unsatisfied pins refuse activation; host process never starts with version-mismatched plugins active.",
    },
  },
];

// ── Invariants & Requirements ──────────────────────────────────────────────

const invariants: PrimitiveSpec[] = [
  {
    id: "spec:inv:one-engine",
    type: "spec:Invariant",
    fields: {
      label: "Exactly one cel-js import in the entire codebase.",
      statement:
        "`cli/src/core/expr/evaluator.ts` is the only file that may import `cel-js`. All other code goes through `cli/src/core/expr/` exports.",
      enforcement: "ci_check",
      scope_ref: "CI grep over cli/src/ AND cli/plugins/",
    },
  },
  {
    id: "spec:inv:closed-activation",
    type: "spec:Invariant",
    fields: {
      label: "Activation resolver returns `Value | RenderError`, never undefined.",
      statement:
        "Every name lookup in the resolver returns a tagged union of resolved value or categorised error. There is no fall-through to JS `undefined`. Type-system enforced.",
      enforcement: "type_system",
      scope_ref: "cli/src/core/expr/activation.ts",
    },
  },
  {
    id: "spec:inv:helper-allowlist",
    type: "spec:Invariant",
    fields: {
      label: "Standard helper set matches §M14 verbatim.",
      statement:
        "The exported `STANDARD_HELPERS` constant in `cli/src/core/expr/std.ts` MUST match the §M14 inventory line-for-line. CI parses both and compares.",
      enforcement: "ci_check",
      scope_ref: "cli/src/core/expr/std.ts + this SPEC's §M14",
    },
  },
  {
    id: "spec:inv:env-now-frozen",
    type: "spec:Invariant",
    fields: {
      label: "env.NOW is captured ONCE per evaluator-instance.",
      statement:
        "All expressions in a single render or validate call see the SAME `env.NOW` string. Implementations MUST capture wall-clock at evaluator-construction and reuse the captured value for the lifetime of the instance.",
      enforcement: "runtime_check",
      scope_ref: "cli/src/core/expr/activation.ts (env factory)",
    },
  },
  {
    id: "spec:inv:bounded",
    type: "spec:Invariant",
    fields: {
      label: "Every cap is enforced; exceeding fires bound-exceeded.",
      statement:
        "List-iteration cap (default 1000, hard 100k), expression nesting cap (32), helper arity cap (8), output-string cap (65 536). Caps are configurable upward only via Core option, never per-plugin.",
      enforcement: "runtime_check",
      scope_ref: "cli/src/core/expr/evaluator.ts",
    },
  },
];

const requirements: PrimitiveSpec[] = [
  {
    id: "spec:req:r-001",
    type: "spec:Requirement",
    fields: {
      label: "Single Core module owns CEL",
      statement:
        "All CEL evaluation in FDPM MUST flow through `cli/src/core/expr/`. Plugins MUST NOT import `cel-js` directly.",
      strength: "MUST",
      verifiability: "ci_check",
      verifier_ref: "CI: grep -r 'cel-js' cli/plugins/ cli/src/ excluding cli/src/core/expr/evaluator.ts",
    },
  },
  {
    id: "spec:req:r-002",
    type: "spec:Requirement",
    fields: {
      label: "Type mapping is canonical",
      statement:
        "FDPM field values entering CEL MUST be coerced via the §M1 mapper. Plugin-private mappings are forbidden.",
      strength: "MUST",
      verifiability: "review",
      verifier_ref: "Code review of any plugin shipping validators or renderers",
    },
  },
  {
    id: "spec:req:r-003",
    type: "spec:Requirement",
    fields: {
      label: "Two error policies, one category set",
      statement:
        "Validate-time uses halt-and-tag. Render-time uses inline-and-continue. Both draw from the closed §M2 category set. New categories MUST come via SPEC amendment.",
      strength: "MUST",
      verifiability: "test",
      verifier_ref: "cli/tests/expr-error-categories.test.ts",
    },
  },
  {
    id: "spec:req:r-004",
    type: "spec:Requirement",
    fields: {
      label: "Tier discipline",
      statement:
        "Tier A bindings are listed in §M7 verbatim. Tier B bindings require manifest permissions. Tier C bindings require manifest opt-in. The resolver MUST refuse access in any other configuration.",
      strength: "MUST",
      verifiability: "test",
      verifier_ref: "cli/tests/expr-activation-tiers.test.ts",
    },
  },
  {
    id: "spec:req:r-005",
    type: "spec:Requirement",
    fields: {
      label: "Helper-set version pin",
      statement:
        "A plugin manifest declaring `expr_helper_set: <range>` MUST be refused if the host's helper-set version doesn't satisfy the range. The refusal surfaces as `host_compat` error.",
      strength: "MUST",
      verifiability: "test",
      verifier_ref: "cli/tests/expr-helper-set-pin.test.ts",
    },
  },
  {
    id: "spec:req:r-006",
    type: "spec:Requirement",
    fields: {
      label: "env.NOW deterministic per instance",
      statement:
        "An evaluator instance captures wall clock at construction and reuses it. Two expressions evaluated by the same instance see the same `env.NOW`.",
      strength: "MUST",
      verifiability: "test",
      verifier_ref: "cli/tests/expr-env-now.test.ts",
    },
  },
];

// ── Acceptance Criteria ────────────────────────────────────────────────────

const acceptances: PrimitiveSpec[] = [
  {
    id: "spec:ac:1",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 1,
      criterion:
        "cli/src/core/expr/ ships with type-mapper, evaluator, activation factory, helper registry, error converter.",
      status: "in_progress",
      evidence_refs: [
        "cli/src/core/expr/runtime.ts (ExpressionRuntime + helper registry + program cache + standard helper binding — shipped)",
        "cli/src/core/expr/activation.ts (Tier-A/Tier-B activation plus legacy aliases — shipped)",
        "cli/src/core/expr/types.ts (the §M1 mapper — shipped)",
        "cli/src/core/validation/pipeline.ts (project/fingerprint context threaded into evaluate-time activation)",
        "cli/src/core/expr/errors.ts (closed 8-code runtime enum shipped on CELValidationError / CELRuntimeError)",
        "cli/src/core/expr/runtime.ts (list/nesting/arity/output caps + fn.sortBy key-expression evaluation shipped)",
      ],
    },
  },
  {
    id: "spec:ac:2",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 2,
      criterion: "SPEC-CEL-VALIDATOR amends §7 to consume cli/src/core/expr/ instead of an ad-hoc evaluator path.",
      status: "in_progress",
      evidence_refs: [
        "cli/src/core/validation/cel/{activation,evaluator,errors}.ts re-exports from cli/src/core/expr/.",
        "Predicate evaluation works end-to-end: cli/plugins/software_architecture/validation_rules.ts ships 12 CEL expressions; SPEC-CEL-VALIDATOR §10 ACs 1-3 are marked met.",
        "GAP: SPEC-CEL-VALIDATOR §6 still names the legacy activation surface (instance/instance_type/profile/graph) rather than referring to §M7 of this SPEC.",
      ],
    },
  },
  {
    id: "spec:ac:3",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 3,
      criterion: "SPEC-RENDER-DSL ships against cli/src/core/expr/ with the CEL-only surface (no SQL sugar).",
      status: "open",
    },
  },
  {
    id: "spec:ac:4",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 4,
      criterion: "SPEC-PLUGGABLE-ARCHITECTURE §4 (capabilities) and §5.2 (permissions) amended for `cap:expr-helper` and `read:vcs`.",
      status: "open",
    },
  },
  {
    id: "spec:ac:5",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 5,
      criterion: "Standard helper set v1.0.0 (14 helpers across 4 families) shipped with parity tests.",
      status: "in_progress",
      evidence_refs: [
        "cli/src/core/expr/std.ts: STANDARD_HELPER_IDS lists all 14 ids; EXPR_HELPER_SET_VERSION = '1.0.0'.",
        "cli/src/core/expr/runtime.ts + helpers.ts bind and execute all 14 helper ids through the host-owned runtime.",
        "GAP: parity tests asserting each helper's full §M14 normative semantics do not yet exist; current coverage is focused integration coverage.",
      ],
    },
  },
  {
    id: "spec:ac:6",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 6,
      criterion: "Plugin manifest validator rejects unsatisfied helper-set pins with a clear `host_compat` error.",
      status: "in_progress",
      evidence_refs: [
        "cli/src/plugin/manifest.ts accepts expr_helper_set semver pins.",
        "cli/src/plugin/runtime.ts rejects unsatisfied helper-set ranges during registration.",
        "cli/tests/expr-helper-set-pin.test.ts covers the host_compat rejection path.",
      ],
    },
  },
];

// ── Conformance ────────────────────────────────────────────────────────────

const conformance: PrimitiveSpec[] = [
  {
    id: "spec:conf:1",
    type: "spec:ConformanceItem",
    fields: {
      ordinal: 1,
      name: "Type mapping round-trip",
      procedure: "For each FDPM kind in §M1, evaluate `doc.fields.f` where `f` is a field of that kind; assert the CEL type observed matches the table.",
      expected: "All 11 mappings observed.",
    },
  },
  {
    id: "spec:conf:2",
    type: "spec:ConformanceItem",
    fields: {
      ordinal: 2,
      name: "Error category coverage",
      procedure: "One test per §M2 category: trigger the condition, assert the error finding's category matches.",
      expected: "All 8 categories fire on the right input. No category fires on a valid expression.",
    },
  },
  {
    id: "spec:conf:3",
    type: "spec:ConformanceItem",
    fields: {
      ordinal: 3,
      name: "Tier B permission gate",
      procedure: "Plugin without `read:vcs` evaluates `${env.GIT_SHA}`; assert `permission-denied`. Same plugin WITH `read:vcs` evaluates same expression in a non-git directory; assert `null` (not error).",
      expected: "Permission-without-resolution → null; resolution-without-permission → permission-denied.",
    },
  },
  {
    id: "spec:conf:4",
    type: "spec:ConformanceItem",
    fields: {
      ordinal: 4,
      name: "env.NOW frozen",
      procedure: "Within a single evaluator instance, evaluate `env.NOW` twice with a 100 ms sleep in between; assert byte-equal results.",
      expected: "Identical strings.",
    },
  },
];

// ── Implementation Plan + Migration ────────────────────────────────────────

const changes: PrimitiveSpec[] = [
  {
    id: "spec:chg:expr-module",
    type: "spec:ImplementationChange",
    fields: {
      area: "cli/src/core/expr/",
      change:
        "New module. SHIPPED: `runtime.ts` (ExpressionRuntime + helper registry + expression-string-keyed program cache + standard helper registration + Tier-A/Tier-B activation wiring), `std.ts` (14 STANDARD_HELPER_IDS + EXPR_HELPER_SET_VERSION + EXPR_CEL_REVISION), `activation.ts` (Tier-A bindings plus legacy validation aliases and Tier-B permission gates), `evaluator.ts` (thin wrapper delegating to `defaultExpressionRuntime`), `helpers.ts` (graph + standard helper bodies), `errors.ts` (CELParseError → verification, CELRuntimeError → internal), `types.ts` (the §M1 mapper). STILL OPEN: bound caps (Principle 4), a closed 8-category error enum, and full `fn.sortBy` macro semantics beyond the current path-rooted implementation.",
      complexity: "L",
      status: "in_progress",
    },
  },
  {
    id: "spec:chg:plugin-cap",
    type: "spec:ImplementationChange",
    fields: {
      area: "cli/src/plugin/manifest.ts + types.ts",
      change:
        "Add `cap:expr-helper` capability. Add `requires_helpers: string[]` and `expr_helper_set: string` (semver range) to PluginManifest. Add `read:vcs`, `read:os-info` permissions. SHIPPED in manifest/runtime; remaining work is consumer-SPEC/documentation alignment.",
      complexity: "S",
      status: "in_progress",
    },
  },
  {
    id: "spec:chg:cel-validator-amend",
    type: "spec:ImplementationChange",
    fields: {
      area: "docs/specs/SPEC-CEL-VALIDATOR.md",
      change:
        "Amend §1 (Required reads) to include this SPEC. Amend §6 (Activation environment) to delete the inline activation table — replaced by reference to §M7 here. Amend §15 (ADR-CEL-001 Decision) to consume cli/src/core/expr/ rather than its own evaluator path.",
      complexity: "S",
      status: "not_started",
    },
  },
  {
    id: "spec:chg:render-dsl-amend",
    type: "spec:ImplementationChange",
    fields: {
      area: "docs/specs/SPEC-RENDER-DSL.md",
      change:
        "Amend §1 (Required reads) to include this SPEC. Amend §6 (DSL Surface) to remove SQL-shaped queries (already done in the v0.1 build script). Confirm §6.4 helper inventory aligns with this SPEC's §M14 standard set.",
      complexity: "S",
      status: "not_started",
    },
  },
  {
    id: "spec:chg:tests",
    type: "spec:ImplementationChange",
    fields: {
      area: "cli/tests/expr-*.test.ts",
      change:
        "expr-type-mapping.test.ts (one per §M1 kind), expr-error-categories.test.ts (one per §M2 category), expr-activation-tiers.test.ts (Tier A always, Tier B permission gate, Tier C namespacing), expr-helper-set-pin.test.ts, expr-env-now.test.ts (frozen), expr-bound-exceeded.test.ts (each cap).",
      complexity: "M",
      status: "not_started",
    },
  },
  {
    id: "spec:chg:plugin-amend",
    type: "spec:ImplementationChange",
    fields: {
      area: "docs/specs/SPEC-PLUGGABLE-ARCHITECTURE.md",
      change:
        "Amend §4.1 (capabilities) for cap:expr-helper. Amend §5.2 (permissions table) for read:vcs and read:os-info. Amend §5.3 (capabilities not requiring permission) — cap:expr-helper of purity 'pure' requires none.",
      complexity: "S",
      status: "not_started",
    },
  },
];

const migration: PrimitiveSpec[] = [
  {
    id: "spec:mig:1",
    type: "spec:MigrationStep",
    fields: {
      ordinal: 1,
      label: "Land cli/src/core/expr/ + standard helpers",
      action:
        "Ship the Core module with full type mapping, evaluator, activation factory, registry, error converter, and standard helper set. SHIPPED AS OF 0.1.7: ExpressionRuntime + helper registry + program cache + helper-id namespacing + Tier-A/Tier-B activation + typed top-level bindings + closed runtime error-code enum + bound caps + full `fn.sortBy` key-expression semantics. See §0.5 Implementation Status.",
      affected_paths: ["cli/src/core/expr/"],
    },
  },
  {
    id: "spec:mig:2",
    type: "spec:MigrationStep",
    fields: {
      ordinal: 2,
      label: "Wire SPEC-CEL-VALIDATOR consumer",
      action:
        "Migrate ValidationPipeline §7 step-6 dispatch to use cli/src/core/expr/. Run fs parity harness (per SPEC-CEL-VALIDATOR migration step 3).",
      affected_paths: ["cli/src/core/validation/pipeline.ts"],
      depends_on: ["spec:mig:1"],
    },
  },
  {
    id: "spec:mig:3",
    type: "spec:MigrationStep",
    fields: {
      ordinal: 3,
      label: "Wire SPEC-RENDER-DSL consumer",
      action:
        "Land template-lexer.ts in spec_authoring/renderers/. Migrate one kind renderer (renderReferences) to template form. Verify byte-identical output against pre-DSL baseline.",
      affected_paths: [
        "cli/plugins/spec_authoring/renderers/template-lexer.ts",
        "cli/plugins/spec_authoring/renderers/spec_md.ts",
      ],
      depends_on: ["spec:mig:1"],
    },
  },
  {
    id: "spec:mig:4",
    type: "spec:MigrationStep",
    fields: {
      ordinal: 4,
      label: "Add cap:expr-helper + read:vcs to SPEC-PLUGGABLE-ARCHITECTURE",
      action: "Author the amendment per §13 of this SPEC.",
      affected_paths: ["docs/specs/SPEC-PLUGGABLE-ARCHITECTURE.md"],
      depends_on: ["spec:mig:1"],
    },
  },
  {
    id: "spec:mig:5",
    type: "spec:MigrationStep",
    fields: {
      ordinal: 5,
      label: "Amend consumer SPECs",
      action:
        "SPEC-CEL-VALIDATOR + SPEC-RENDER-DSL get §1 required-reads + §15-§16 amendments to consume this SPEC's contracts (don't redefine).",
      affected_paths: [
        "docs/specs/SPEC-CEL-VALIDATOR.md",
        "docs/specs/SPEC-RENDER-DSL.md",
      ],
      depends_on: ["spec:mig:2", "spec:mig:3"],
    },
  },
];

// ── Risks ──────────────────────────────────────────────────────────────────

const risks: PrimitiveSpec[] = [
  {
    id: "spec:risk:helper-bloat",
    type: "spec:Risk",
    fields: {
      label: "Standard helper bloat",
      description:
        "Plugin authors push helpers up from Tier C to the standard set; the inventory grows past what one team can maintain.",
      likelihood: "high",
      impact: "medium",
    },
  },
  {
    id: "spec:risk:type-mismatch",
    type: "spec:Risk",
    fields: {
      label: "Type-mapping ambiguity",
      description:
        "Edge cases the §M1 table doesn't cover (e.g., a `json` field whose value is a heterogeneous list) produce inconsistent CEL behaviour across consumers.",
      likelihood: "medium",
      impact: "high",
    },
  },
  {
    id: "spec:risk:cel-bump",
    type: "spec:Risk",
    fields: {
      label: "CEL revision bump",
      description:
        "A semantic change in upstream cel-spec lands; pinned revision drift propagates through all consumer SPECs.",
      likelihood: "low",
      impact: "high",
    },
  },
  {
    id: "spec:risk:perf",
    type: "spec:Risk",
    fields: {
      label: "Per-call compilation overhead",
      description:
        "Re-parsing the same expression on every validate or render dominates p50 latency.",
      likelihood: "medium",
      impact: "medium",
    },
  },
];

const mitigations: PrimitiveSpec[] = [
  {
    id: "spec:mit:promotion-rule",
    type: "spec:Mitigation",
    fields: {
      strategy:
        "Promotion of a Tier-C helper to the standard set requires (a) at least three plugins using it, (b) a SPEC amendment to §M14, (c) a corresponding helper-set minor bump because the standard inventory grows additively. Bar is high enough to throttle bloat.",
      status: "planned",
    },
  },
  {
    id: "spec:mit:type-strictness",
    type: "spec:Mitigation",
    fields: {
      strategy:
        "Type mapper is total: every FDPM kind has a default. For unknown kinds (forward compatibility), the mapper produces `dyn` and emits a `type-error` finding at validate-time. Render-time produces an inline marker.",
      status: "planned",
    },
  },
  {
    id: "spec:mit:cel-pin",
    type: "spec:Mitigation",
    fields: {
      strategy:
        "CEL revision is pinned by exact version in the host's package.json. Bumping requires a SPEC amendment per §M14, including consumer-SPEC re-validation.",
      status: "planned",
    },
  },
  {
    id: "spec:mit:cache-compiled",
    type: "spec:Mitigation",
    fields: {
      strategy:
        "Cache compiled CEL programs by expression-string identity at profile-registration time and at template-load time. Per-call work becomes activation-build + evaluate.",
      status: "planned",
    },
  },
];

// ── Open Questions ─────────────────────────────────────────────────────────

const openQuestions: PrimitiveSpec[] = [
  {
    id: "spec:q:cel-revision-pin",
    type: "spec:OpenQuestion",
    fields: {
      ordinal: 1,
      question:
        "Which cel-spec git revision and which cel-js npm version does the host pin?",
      default_choice:
        "STILL OPEN AS OF 0.1.7. cli/src/core/expr/std.ts ships `EXPR_CEL_REVISION = \"TBD\"` and the host embeds `@marcbachmann/cel-js` (version pinned in package.json but not cited in this SPEC). The amendment that closes this question MUST update std.ts to a concrete cel-spec git revision string AND record the cel-js version in §M14 in the same patch. Until both are recorded, a host upgrade that crosses cel-js minor boundaries may produce evaluator-behaviour drift the SPEC's bump rules cannot catch.",
      is_blocking: "yes",
      owner: "Implementer of cli/src/core/expr/",
    },
  },
  {
    id: "spec:q:datetime-mapping",
    type: "spec:OpenQuestion",
    fields: {
      ordinal: 2,
      question:
        "Should `datetime` map to CEL `string` (current pick) or CEL `timestamp`?",
      default_choice:
        "string. Reasoning: timestamp formatting is timezone- and locale-dependent; the canonical FDPM form is the ISO-8601 UTC string the operation log already stores. Mapping to CEL timestamp introduces a formatting axis the §M1 mapper can't capture without losing round-trip property. fn.date.* helpers operate on the string. If a future use-case demands timestamp arithmetic CEL exposes natively, revisit.",
      is_blocking: "no",
    },
  },
  {
    id: "spec:q:tier-b-default",
    type: "spec:OpenQuestion",
    fields: {
      ordinal: 3,
      question:
        "When a Tier-B binding is unavailable (e.g., not a git repo) AND the plugin has the permission, should the value be `null` or a categorised `unavailable` error?",
      default_choice:
        "null. Reasoning: a renderer that handles the case via `${env.GIT_SHA ?? \"unknown\"}` is more useful than one that errors. Plugins without the permission still get the loud `permission-denied` error — that's the security check.",
      is_blocking: "no",
    },
  },
  {
    id: "spec:q:helper-promotion",
    type: "spec:OpenQuestion",
    fields: {
      ordinal: 4,
      question:
        "Should fn.hash use SHA-256 (current pick) or BLAKE3?",
      default_choice:
        "SHA-256. Reasoning: ubiquitous, hardware-accelerated everywhere, no controversy, satisfies content-addressing needs. BLAKE3 is faster but less universal; revisit if profiling shows fn.hash dominates.",
      is_blocking: "no",
    },
  },
  {
    id: "spec:q:list-cap-default",
    type: "spec:OpenQuestion",
    fields: {
      ordinal: 5,
      question:
        "List-iteration default cap — 1000 (current pick) vs. unlimited with explicit-only opt-in?",
      default_choice:
        "1000 default, hard cap 100k. Reasoning: a renderer that accidentally iterates the entire project graph should fail loudly at 1000 and motivate explicit `LIMIT`-like opt-in. Plugins that genuinely need more raise the cap via Core option (project-wide), never per-template.",
      is_blocking: "no",
    },
  },
];

const futureWork: PrimitiveSpec[] = [
  {
    id: "spec:fw:expr-cache-cross-process",
    type: "spec:FutureWork",
    fields: {
      label: "Cross-process compiled-expression cache",
      description:
        "Today caching is in-memory per Host instance. A persistent cache keyed by (cel-revision, helper-set-version, expression-string) could survive process restarts.",
      target_version: "0.2",
    },
  },
  {
    id: "spec:fw:expr-context-scheduler",
    type: "spec:FutureWork",
    fields: {
      label: "New expression context: scheduler / cron",
      description:
        "Future SPEC for cron-style expressions (rule firing schedules, scheduled validation runs) reuses this runtime. Activation extension only — no engine change.",
      target_version: "0.3",
    },
  },
  {
    id: "spec:fw:lint-mode",
    type: "spec:FutureWork",
    fields: {
      label: "--lint mode: unknown-name as warning",
      description:
        "Authoring tooling needs to surface typos without halting. A lint mode would downgrade `unknown-name` to warning level (validate-time only). Render-time always inline-and-continue regardless.",
      target_version: "0.2",
    },
  },
  {
    id: "spec:fw:hash-maps",
    type: "spec:FutureWork",
    fields: {
      label: "fn.hash canonicalisation for maps",
      description:
        "v0.1 raises type-error on fn.hash(map). A future canonical form (sort keys lexicographically, recursively hash) would let templates and predicates fingerprint primitive `field_values` directly. Defer until the use-case is concrete.",
      target_version: "0.2",
    },
  },
  {
    id: "spec:fw:semver-helper",
    type: "spec:FutureWork",
    fields: {
      label: "fn.semver_satisfies(range, version) helper",
      description:
        "v0.1 enforces helper-set pinning at plugin-load time via the manifest's expr_helper_set range. Template-time guards (`${if: …}`) using string comparison are unreliable. A real semver helper would let templates branch on host capability without manifest changes. Defer until two consumers genuinely need template-time semver checks.",
      target_version: "0.2",
    },
  },
  {
    id: "spec:fw:expr-debugger",
    type: "spec:FutureWork",
    fields: {
      label: "Step-debugger for expressions",
      description:
        "Expression authoring is hard to debug today. A step-debugger surface (probably via REPL) would let an author evaluate sub-expressions against a live activation.",
      target_version: "0.3",
    },
  },
];

const references: PrimitiveSpec[] = [
  {
    id: "spec:ref:cel-spec",
    type: "spec:Reference",
    fields: {
      kind: "spec",
      citation: "Common Expression Language Specification, Google.",
      locator: "https://github.com/google/cel-spec",
      verification: "unverified",
      verification_note:
        "Reader must verify the spec revision pinned at implementation time. Bumping CEL is a SPEC-amendment concern (§M14). Initial pin TBD; expected v0.5.0.",
    },
  },
  {
    id: "spec:ref:cel-js",
    type: "spec:Reference",
    fields: {
      kind: "url",
      citation: "cel-js — TypeScript implementation of CEL.",
      locator: "https://www.npmjs.com/package/cel-js",
      verification: "unverified",
      verification_note:
        "Existence and license to be verified before adoption; PR must pin a specific version that satisfies the §M14 CEL revision.",
    },
  },
  {
    id: "spec:ref:cel-validator",
    type: "spec:Reference",
    fields: {
      kind: "spec",
      citation: "SPEC-CEL-VALIDATOR — CEL Runtime Validator for FDPM Plugin Predicates v0.1.",
      locator: "docs/specs/SPEC-CEL-VALIDATOR.md",
      verification: "verified",
      verification_note: "Authored before this SPEC; will be amended to consume the contracts here.",
    },
  },
  {
    id: "spec:ref:render-dsl",
    type: "spec:Reference",
    fields: {
      kind: "spec",
      citation: "SPEC-RENDER-DSL — Render-Time DSL for FDPM Document Templates v0.1.",
      locator: "docs/specs/SPEC-RENDER-DSL.md",
      verification: "verified",
      verification_note: "Authored alongside this SPEC; consumes the activation surface and helpers defined here.",
    },
  },
  {
    id: "spec:ref:pluggable",
    type: "spec:Reference",
    fields: {
      kind: "spec",
      citation: "SPEC-PLUGGABLE-ARCHITECTURE — Plugin runtime, capabilities, permissions.",
      locator: "docs/specs/SPEC-PLUGGABLE-ARCHITECTURE.md",
      verification: "verified",
      verification_note:
        "Will require amendment for cap:expr-helper and read:vcs / read:os-info permissions (per §13 implementation plan).",
    },
  },
  {
    id: "spec:ref:claude-md",
    type: "spec:Reference",
    fields: {
      kind: "repo_file",
      citation: "FDPM project guidelines (PALS-LAW, formalization-means-research).",
      locator: "CLAUDE.md",
      verification: "self_evident",
    },
  },
];

const revisions: PrimitiveSpec[] = [
  {
    id: "spec:rev:0-1-7",
    type: "spec:Revision",
    fields: {
      version: SPEC_VERSION,
      date: "2026-05-04",
      title: "Core runtime gaps closed for the shipped expression runtime.",
      notes:
        "No architectural change. This revision updates the source-of-truth generator to match the now-shipped core runtime behavior:\n\n1. Bound caps are live: CEL parse depth is capped at 32, call arity at 8, list iteration at 1000, and string outputs at 65 536 codepoints.\n\n2. The runtime now classifies failures into the closed 8-code set (`unknown-name`, `unknown-helper`, `type-error`, `bound-exceeded`, `arity-error`, `parse-error`, `runtime-error`, `permission-denied`) and exposes the code on the error value.\n\n3. `fn.sortBy` now evaluates full key expressions against the bound iterator variable rather than only supporting path-rooted lookups.\n\n4. Tier-B git bindings now probe the repository automatically when permissions are present and the caller does not inject git facts.\n\n5. Top-level CEL activation bindings are now registered with object schemas instead of leaving the entire surface as `dyn`.\n\nThe rendered spec produced from this generator is intended to match the focused runtime validation suites and the spec-build determinism test in the same revision.",
      affected_sections: ["§0", "§0.5", "§11", "§14", "§16", "§19"],
      kind: "patch",
    },
  },
  {
    id: "spec:rev:0-1-6",
    type: "spec:Revision",
    fields: {
      version: "0.1.6",
      date: "2026-05-04",
      title: "Helper-set v1.1.0 — graph.exists / graph.target_exists added.",
      notes:
        "Additive amendment. Two new graph helpers extend the closed §M14 inventory:\n\n  graph.exists(target_id):bool          — id-membership over the project's primitives.\n  graph.target_exists(rel_id):bool      — every outbound edge of rel_id from self resolves.\n\nBoth are pure (no I/O, no clock, no RNG) and registered on the existing `graph` receiver — same trust posture as the v1.0.0 helpers. The §M14 body now lists 5 graph helpers (3 v1.0.0 + 2 v1.1.0) alongside the unchanged 14 fn.* standard helpers. Helper-set semver bumped 1.0.0 → 1.1.0 per the §M14 bump rules (additive → minor). The example manifest pin in §M14 is updated from `>=1.0.0,<2` to `>=1.1.0,<2` so consumers requiring the new helpers refuse to load against the older runtime. SPEC-CEL-VALIDATOR §6 amended in tandem (its 0.3.0 revision). The motivating consumer is fdpm.planning's `plan:Implements` cross-profile work-tracking link, where dangling references are silent today and become a CEL-checkable error after this amendment.\n\nNo behaviour change for existing rules; helper-set v1.0.0 expressions evaluate identically.",
      affected_sections: ["§M14", "§19"],
      kind: "patch",
    },
  },
  {
    id: "spec:rev:0-1-5",
    type: "spec:Revision",
    fields: {
      version: "0.1.5",
      date: "2026-05-04",
      title: "Implementation completion sync for the shipped expression runtime.",
      notes:
        "No architectural change. This revision updates the source-of-truth generator so it matches the code that is now live in `cli/src/core/expr/`:\n\n1. §0 companion_code now points at the host-owned runtime, activation, type-mapper, and validate-time consumer without calling them partial scaffolds.\n\n2. §0.5 Implementation Status now marks the runtime module, helper binding, manifest helper-set pins, and `env.NOW` determinism honestly. Tier-A/Tier-B and the standard helper set remain `partial` only where behavior is still incomplete (`fn.sortBy` macro semantics, automatic git probing, static CEL typing).\n\n3. §11 Acceptance Criteria evidence now reflects the shipped mapper, activation, helper binding, and helper-set pin rejection path instead of the old pre-implementation gaps.\n\n4. §14 Migration step 1 now records the real remaining gaps: bound caps, a closed 8-category runtime enum, and full `fn.sortBy` macro semantics.\n\n5. The rendered spec produced from this generator is intended to match the implementation status asserted by the focused runtime/plugin tests and the spec-build determinism test in the same revision.\n\nThe source-of-truth script is now aligned with the repository state instead of describing the previous audit baseline.",
      affected_sections: ["§0", "§0.5", "§11", "§14", "§19"],
      kind: "patch",
    },
  },
  {
    id: "spec:rev:0-1-4",
    type: "spec:Revision",
    fields: {
      version: "0.1.4",
      date: "2026-05-04",
      title: "Implementation-status reconciliation against cli/src/core/expr/.",
      notes:
        "No architectural change. The Core expression-runtime module has partially landed and the SPEC text was overstating shipped state. This revision realigns the SPEC against actual disk state:\n\n1. New §0.5 Implementation Status section maps every load-bearing claim to shipped / partial / not_shipped with file:line evidence. Tier-A surface, Tier-B gates, helper bodies, type mapper, bound caps, and the 8-category error enum are honestly marked not-yet-shipped; the ExpressionRuntime, helper registry, program cache, helper-id namespacing rule, helper-set inventory (ids + version), and graph helpers are honestly marked shipped.\n\n2. §0 companion_code points at cli/src/core/expr/runtime.ts (the real ExpressionRuntime) and cli/src/core/expr/std.ts (the helper inventory) plus cli/src/core/validation/pipeline.ts (the validate-time consumer). The earlier wording (\"today's evaluator surface\") was a placeholder from before the module landed.\n\n3. §11 Acceptance Criteria 1, 2, 5 moved from `open` to `in_progress` with `evidence_refs` listing the shipped files and the explicit gaps. Criteria 3, 4, 6 remain `open` as no consumer or manifest work has shipped.\n\n4. §13 spec:chg:expr-module moved from `not_started` to `in_progress` with the change-text rewritten to enumerate shipped vs. unshipped pieces. Other §13 rows unchanged.\n\n5. §14 Migration step 1 action text now flags PARTIAL AS OF 0.1.4 and cross-references §0.5 so readers can see what step 1 still owes.\n\n6. §16 Open Question 1 (CEL revision pin) updated to cite the disk reality: cli/src/core/expr/std.ts ships `EXPR_CEL_REVISION = \"TBD\"` and the host embeds @marcbachmann/cel-js. The SPEC-amendment that closes the question must update std.ts in the same patch.\n\nNo claims were softened or deferred — every gap is named and pointed at a file. This is the audit baseline subsequent revisions can be measured against.",
      affected_sections: ["§0", "§0.5 (new)", "§11", "§13", "§14", "§16", "§19"],
      kind: "patch",
    },
  },
  {
    id: "spec:rev:0-1-3",
    type: "spec:Revision",
    fields: {
      version: "0.1.3",
      date: "2026-05-04",
      title: "Contradiction cleanup: versioning rule, semver example, helper-promotion bump, and AC ordering aligned.",
      notes:
        "No architectural change. This patch fixes four specification contradictions in the source-of-truth generator:\n\n1. §M14 no longer claims proposal-stage Core SPECs must already be major 1; 0.x remains valid until the contract is ratified for FDPM Core 1.x.\n\n2. ADR consequences no longer teach template-time semver string comparison via `${if: host.helper_set_version >= \"1.2.0\"}`; manifest pinning remains the v0.1 capability gate.\n\n3. Helper-promotion mitigation now matches the normative helper-set semver rule: additive promotion is a minor bump, not a major bump.\n\n4. Acceptance Criteria no longer contradict the migration ordering by claiming AC4 is a prerequisite for AC1; the Core module can ship before manifest-consumer adoption steps.",
      affected_sections: ["§M14", "§7", "§11", "§15", "§19"],
      kind: "patch",
    },
  },
  {
    id: "spec:rev:0-1-2",
    type: "spec:Revision",
    fields: {
      version: "0.1.2",
      date: "2026-05-04",
      title: "Pass-3 stabilization: extract drift-prone duplications into a shared module.",
      notes:
        "Architecture unchanged. Stabilization-pass changes:\n\n1. Activation Tier-A and Tier-B tables in §M7 now generated from cli/scripts/_spec-shared.ts. Same module is consumed by SPEC-RENDER-DSL. Changing a binding is a one-edit change in the shared file plus matching SPEC text here.\n\n2. Standard helper inventory in §M14 generated from the same shared module. Both SPECs read the inventory from one place; drift between the two is now structurally impossible.\n\n3. host.cel_revision Tier-A note clarified: it's bound for diagnostic/audit use, NOT for template-time version branches. Manifest-pin enforcement (expr_helper_set) is the v0.1 capability gate. Cross-references the existing Future Work spec:fw:semver-helper.\n\n4. §6 prose now admits the spec_authoring renderer's `kind: \"schema\"` workaround explicitly (matches SPEC-RENDER-DSL §6.4 honesty about the same limitation).\n\n5. New regression test cli/tests/spec-builds-determinism.test.ts asserts: zero validate findings, byte-identical determinism across two runs, every Tier-A/B binding name appears in the rendered EXPR-RT, every helper name appears in BOTH SPECs, and no stale RENDER-DSL forms (query binding, ${VERSION}, env.DATA_DIR) survive. 10 tests, ~38s on local CI.",
      affected_sections: ["§M7", "§M14", "§6 (prose)", "§19"],
      kind: "patch",
    },
  },
  {
    id: "spec:rev:0-1-1",
    type: "spec:Revision",
    fields: {
      version: "0.1.1",
      date: "2026-05-04",
      title: "Pass-2 refinement: macro arity, error envelope shape, hash canonicalisation, AC ordering.",
      notes:
        "No architectural changes. Tightens load-bearing details surfaced in pass-2 review:\n\n1. fn.sortBy clarified as a 3-arg MACRO (mirrors CEL filter/map), not a 2-arg function. Both consumer-facing examples updated.\n2. Tier-B resolution truth table made explicit for all four permission/availability combinations. Permission check ALWAYS fires before resolution.\n3. --strict semantics pinned: gates the renderer's exit code; bytes are always emitted with inline markers regardless of flag.\n4. RenderFinding shape spec'd (§M2.1) and explicitly distinct from ValidationFinding.\n5. fn.hash canonicalisation made normative for primitives and lists; maps raise type-error pending Future Work spec:fw:hash-maps.\n6. CEL revision pin demoted from claimed `v0.5.0` to `TBD at implementation time`. Promoted to the single blocking open question; the implementing PR closes it.\n7. AC ordering made explicit via DependsOn relations: manifest amendment (AC4) is prereq for the runtime (AC1); consumer-SPEC migrations (AC2/AC3) depend on AC1.\n8. Removed misleading `${if: host.helper_set_version >= \"1.2.0\"}` example (lexicographic string comparison fails on 1.10.0). Future Work spec:fw:semver-helper added.\n9. Tier-C example call-out: explicitly enumerates the four manifest fields this SPEC introduces (cap:expr-helper, read:vcs/read:os-info, expr_helper_set pin, requires_helpers).",
      affected_sections: ["§M2", "§M7", "§M14", "§11", "§16", "§17"],
      kind: "patch",
    },
  },
  {
    id: "spec:rev:0-1-0",
    type: "spec:Revision",
    fields: {
      version: "0.1.0",
      date: "2026-05-04",
      title: "Initial draft.",
      notes:
        "Initial draft authored via the fdpm.spec-authoring plugin. Picks: CEL canonical types (datetime → string), two-policy error model (halt-and-tag for validate, inline-and-continue for render), three-tier activation (A always / B permissioned / C plugin-namespaced), independent helper-set semver. Identifies 14 standard helpers across 4 families. Defines a new permission (read:vcs) and a new capability (cap:expr-helper) for SPEC-PLUGGABLE-ARCHITECTURE to amend.",
      affected_sections: ["all"],
      kind: "minor",
    },
  },
];

// ── Sections ───────────────────────────────────────────────────────────────

const sections: PrimitiveSpec[] = [
  {
    id: "spec:sec:0-5",
    type: "spec:Section",
    fields: {
      number: "0.5",
      title: "Implementation Status",
      kind: "prose",
      body_md: [
        "This SPEC describes a target architecture; the implementation is partially shipped. The table below maps every load-bearing claim to its actual disk state at this revision (0.1.7). Read in conjunction with §11 (Acceptance Criteria) and §13 (Implementation Plan), which carry the same status fields per row.",
        "",
        "**Reading guide.** `shipped` means the contract is live and observable; `partial` means a scaffold exists but the contract is not honored end-to-end; `not_shipped` means there is no code yet. File paths reference the working tree at the time of authoring and may move; rerun `git grep` against the cited symbols if a path 404s.",
        "",
        "| Area | Claim location | Status | Evidence |",
        "| --- | --- | --- | --- |",
        "| Core expression runtime module exists | §15 ADR-EXPR-001 Decision; §13 spec:chg:expr-module | shipped | `cli/src/core/expr/{runtime,std,activation,evaluator,helpers,errors,types}.ts` exists. The module now includes the §M1 mapper (`types.ts`) plus the host-owned runtime/activation path. |",
        "| `ExpressionRuntime` with helper registry + program cache | §M14 helper-set semver | shipped | `cli/src/core/expr/runtime.ts` ships `ExpressionRuntime`, `registerHelper`, `unregisterPluginHelpers`, expression-string-keyed `programCache`, standard-helper registration, and activation-context assembly. Cache is in-memory per Host instance (matches §17 Future Work). |",
        "| Plugin helpers namespaced under `fn.<plugin-id>.*` | §M7 Tier C | shipped | `runtime.ts` enforces `^fn\\.[a-z0-9-]+(?:\\.[a-z0-9-]+)+$` and `helperId.startsWith('fn.<pluginId>.')` at registration time. |",
        "| Tier-A activation surface `{ doc, project, env, host, fn }` | §M7 | partial | `activation.ts` now binds `doc`, `project`, `env`, and `host` while preserving the legacy validation aliases `{ instance, instance_type, profile, graph }` for compatibility. Helper calls under `fn.*` execute through the runtime rewrite/registration path rather than a first-class `fn` object. |",
        "| Tier-B bindings (env.GIT_*, host.os, host.cpu_count) with permission gates | §M7 truth table | shipped | `activation.ts` defines Tier-B fields with permission-gated accessors. `host.os` / `host.cpu_count` resolve from Node host facts, and `env.GIT_*` now probes git automatically when permissions are present and no caller override is supplied. |",
        "| 14 standard helpers (string / collection / date / identity families) | §M14, §6 | shipped | `runtime.ts` registers helper bodies from `helpers.ts`, rewrites `fn.*` calls into evaluator-safe internal names, and evaluates `fn.sortBy` key expressions against the bound iterator variable rather than only supporting path lookups. |",
        "| `cap:expr-helper` capability | §M7 Tier C, §13 spec:chg:plugin-cap | shipped | Present in `cli/src/plugin/manifest.ts` capability enum and enforced by `cli/src/plugin/context.ts` / `cli/src/plugin/runtime.ts`. |",
        "| `read:vcs` / `read:os-info` permissions | §M7 Tier B, §13 spec:chg:plugin-cap | shipped | Present in the manifest permission enum; Tier-B activation access consults them at runtime. |",
        "| `expr_helper_set` manifest pin + `requires_helpers` field | §M14, §M7 Tier C | shipped | Present in the manifest schema and enforced in `cli/src/plugin/runtime.ts` enable/load paths. |",
        "| FDPM → CEL type mapping (§M1) module | §M1, Principle 1 | shipped | `cli/src/core/expr/types.ts` normalises primitive/relation/project values into CEL-friendly JS data, and `activation.ts` now registers the top-level activation bindings (`instance`, `doc`, `project`, `env`, `host`, etc.) with object schemas instead of leaving the surface wholly `dyn`. |",
        "| Closed §M2 error category set (8 categories) | §M2 | shipped | `cli/src/core/expr/errors.ts` now exports the closed runtime-code set on `CELValidationError` / `CELRuntimeError`, and `runtime.ts` classifies parse/check/evaluation failures into `unknown-name`, `unknown-helper`, `type-error`, `bound-exceeded`, `arity-error`, `parse-error`, `runtime-error`, and `permission-denied`. |",
        "| Bound caps (list-iter 1000, nesting 32, arity 8, output 65 536 codepoints) | Principle 4, §17 | shipped | `activation.ts` configures CEL parse limits for nesting and arity, while `runtime.ts` enforces list-iteration and output-string caps and surfaces each breach as `bound-exceeded`. |",
        "| `env.NOW` captured-at-start determinism | §17 Invariant `spec:inv:env-now-frozen` | shipped | `runtime.ts` captures `envNow` once per runtime instance and binds it through `activation.ts`; focused tests assert the value is stable within one host/runtime. |",
        "| CEL spec / cel-js version pin | §M14, §16 Open Question 1 | not_shipped | `EXPR_CEL_REVISION = \"TBD\"` in `cli/src/core/expr/std.ts`. The package.json pins a cel-js version (`@marcbachmann/cel-js`) but the SPEC-amendment record cites neither the cel-spec git revision nor the cel-js version. |",
        "| Validate-time consumer wired through `cli/src/core/expr/` | §13 spec:chg:cel-validator-amend | partial | `cli/src/core/validation/cel/{activation,evaluator,errors}.ts` re-exports from `cli/src/core/expr/`, and `cli/src/core/validation/pipeline.ts` now passes project/fingerprint context into the host-owned runtime. SPEC-CEL-VALIDATOR prose still needs amendment from the legacy inline activation table to §M7. |",
        "| Render-time consumer wired through `cli/src/core/expr/` | §13 spec:chg:render-dsl-amend | not_shipped | spec_authoring renderer does not consume the runtime. |",
        "",
        "**Migration ordering.** The shipped `ExpressionRuntime` plus the legacy activation surface together support today's predicate use case (sw plugin's 12 CEL rules evaluate via this path; see SPEC-CEL-VALIDATOR §10 acceptance criteria 1-3 marked `met`). Transitioning to the Tier-A surface requires updating both the activation factory and SPEC-CEL-VALIDATOR §6 in the same release; doing so before the helper bodies are bound risks producing rule predicates that reference helpers the runtime cannot resolve.",
        "",
        "**Source of truth.** The constants in `cli/scripts/_spec-shared.ts` (Tier-A binding paths, Tier-B binding paths, standard helper inventory, helper-set version) are the SPEC's authoritative manifest; mismatches between that file and the rendered §M7 / §M14 fail `cli/tests/spec-builds-determinism.test.ts`. The constants in `cli/src/core/expr/std.ts` are the runtime's authoritative manifest; mismatches between the two ARE the drift this section exists to surface. As of this revision, `STANDARD_HELPER_IDS` (runtime) and `STANDARD_HELPERS` (SPEC source) agree on all 14 ids; `EXPR_HELPER_SET_VERSION` and `HELPER_SET_VERSION` agree at `1.1.0`; `EXPR_CEL_REVISION` (`\"TBD\"`) is honest about the unpinned state Open Question 1 tracks.",
      ].join("\n"),
    },
  },
  {
    id: "spec:sec:1",
    type: "spec:Section",
    fields: {
      number: "1",
      title: "Purpose and Scope",
      kind: "prose",
      body_md: [
        "### 1.1 What this document defines",
        "",
        "This SPEC defines a Core service — `cli/src/core/expr/` — that exposes a single CEL evaluator to all FDPM expression contexts. It defines:",
        "",
        "- **§M1 Type mapping** — how FDPM field kinds become CEL types.",
        "- **§M2 Error model** — two policies (halt-and-tag for validators, inline-and-continue for renderers), drawing from one closed category set.",
        "- **§M7 Activation surface** — three tiers (A always-bound, B permission-gated, C plugin-contributed).",
        "- **§M14 Versioning** — independent semver for SPEC version, CEL revision, and helper-set version, with one-line pinning rules.",
        "- **§6 Helper inventory** — 14 standard helpers across 4 families (string, collection, date, identity).",
        "",
        "It also names two amendments other SPECs must accept:",
        "",
        "- A new capability `cap:expr-helper` in SPEC-PLUGGABLE-ARCHITECTURE §4.1.",
        "- A new permission `read:vcs` (and `read:os-info`) in SPEC-PLUGGABLE-ARCHITECTURE §5.2.",
        "",
        "### 1.2 What this document does NOT define",
        "",
        "- The grammar or surface of any consumer SPEC. SPEC-CEL-VALIDATOR keeps owning predicate semantics; SPEC-RENDER-DSL keeps owning the template envelope. This SPEC owns only the engine, the activation, the types, the errors, and the helpers.",
        "- Specific predicate strings or template strings. Examples in this SPEC are illustrative.",
        "- The implementation choice between cel-js, cel-go, or any other CEL library. The SPEC requires a CEL spec-conformant implementation; the library choice goes in the implementation PR.",
        "- Authoring tooling (LSP, syntax highlighting) — Future Work.",
        "- Cross-host expression contexts (validate-time on host A, render-time on host B). Out of scope for v0.1.",
        "",
        "### 1.3 Why this SPEC is separate from SPEC-CEL-VALIDATOR and SPEC-RENDER-DSL",
        "",
        "Both consumer SPECs implicitly depend on the same engine, types, errors, helpers, and version pins. Picking those at the consumer level forces either repetition (drift waiting to happen) or asymmetric dependency (one consumer leads, the other follows). Putting the contracts in their own SPEC lets both consumers be peers.",
      ].join("\n"),
    },
  },
  {
    id: "spec:sec:2",
    type: "spec:Section",
    fields: { number: "2", title: "Stakeholders and Concerns", kind: "stakeholders", body_md: "" },
  },
  {
    id: "spec:sec:3",
    type: "spec:Section",
    fields: { number: "3", title: "Quality Attributes in Tension", kind: "quality_attributes", body_md: "" },
  },
  {
    id: "spec:sec:4",
    type: "spec:Section",
    fields: {
      number: "4",
      title: "Architectural Principles",
      kind: "principles",
      body_md: "Five principles. Each is testable; the renderer enumerates them in declared order.",
    },
  },
  {
    id: "spec:sec:4-5",
    type: "spec:Section",
    fields: {
      number: "4.5",
      title: "Architectural Decision Summary",
      kind: "decision_summary",
      body_md: "Full ADR in §7. Trade-off matrix in §8.",
    },
  },
  {
    id: "spec:sec:5",
    type: "spec:Section",
    fields: { number: "5", title: "Definitions", kind: "definitions", body_md: "" },
  },
  {
    id: "spec:sec:6",
    type: "spec:Section",
    fields: {
      number: "6",
      title: "Normative contracts (M1, M2, M7, M14)",
      kind: "schema",
      body_md: [
        "The four load-bearing decisions, each presented as a normative table or rule set:",
        "",
        "**M1 — Type mapping** (FDPM kind → CEL type)",
        "",
        "**M2 — Error model** (validate-time vs. render-time, closed category set)",
        "",
        "**M7 — Activation surface** (Tier A always / Tier B permissioned / Tier C plugin-contributed)",
        "",
        "**M14 — Versioning** (SPEC version, CEL revision, helper-set semver)",
        "",
        "_Note: the spec_authoring renderer's `kind: \"schema\"` block currently emits **all** spec:SchemaDefinition primitives in the project under one section (see Future Work `spec:fw:per-section-schemas` in SPEC-RENDER-DSL §17). Until per-section scoping lands, the four normative blocks below are stacked under this single §6._",
      ].join("\n"),
    },
  },
  {
    id: "spec:sec:7",
    type: "spec:Section",
    fields: {
      number: "7",
      title: "Architectural Decision",
      kind: "adr",
      body_md: "The full ADR (context, options, consequences, compliance) follows. Trade-off matrix in §8.",
    },
  },
  {
    id: "spec:sec:8",
    type: "spec:Section",
    fields: {
      number: "8",
      title: "Trade-off Matrix",
      kind: "tradeoff_matrix",
      body_md: "Three options scored across the axes that drove the decision.",
    },
  },
  {
    id: "spec:sec:9",
    type: "spec:Section",
    fields: { number: "9", title: "Quality-Attribute Scenarios (SEI template)", kind: "scenarios", body_md: "" },
  },
  {
    id: "spec:sec:10",
    type: "spec:Section",
    fields: {
      number: "10",
      title: "Requirements",
      kind: "prose",
      body_md: requirements
        .map((r) => {
          const f = r.fields as Record<string, string>;
          return `- **(${f.strength}) ${f.label}** — ${f.statement}`;
        })
        .join("\n"),
    },
  },
  {
    id: "spec:sec:11",
    type: "spec:Section",
    fields: { number: "11", title: "Acceptance Criteria", kind: "acceptance_criteria", body_md: "" },
  },
  {
    id: "spec:sec:12",
    type: "spec:Section",
    fields: { number: "12", title: "Conformance", kind: "conformance", body_md: "" },
  },
  {
    id: "spec:sec:13",
    type: "spec:Section",
    fields: { number: "13", title: "Implementation Plan — Required Changes", kind: "implementation_plan", body_md: "" },
  },
  {
    id: "spec:sec:14",
    type: "spec:Section",
    fields: {
      number: "14",
      title: "Migration",
      kind: "migration",
      body_md:
        "Order matters: (1) ship the Core module; (2) migrate validate-time consumer; (3) migrate render-time consumer; (4) amend SPEC-PLUGGABLE-ARCHITECTURE for cap:expr-helper and read:vcs; (5) amend the consumer SPECs to cite this SPEC's contracts. Steps 2 and 3 can run in parallel after step 1.",
    },
  },
  {
    id: "spec:sec:15",
    type: "spec:Section",
    fields: { number: "15", title: "Risks and Mitigations", kind: "risks", body_md: "" },
  },
  {
    id: "spec:sec:16",
    type: "spec:Section",
    fields: { number: "16", title: "Open Questions", kind: "open_questions", body_md: "" },
  },
  {
    id: "spec:sec:17",
    type: "spec:Section",
    fields: { number: "17", title: "Future Work", kind: "future_work", body_md: "" },
  },
  {
    id: "spec:sec:18",
    type: "spec:Section",
    fields: { number: "18", title: "References — verify independently", kind: "references", body_md: "" },
  },
  {
    id: "spec:sec:19",
    type: "spec:Section",
    fields: { number: "19", title: "Revision history", kind: "revision_history", body_md: "" },
  },
];

// ── Relations ──────────────────────────────────────────────────────────────

const relations: RelationSpec[] = [
  ...sections.map((s, i) => ({
    id: `rel:doc-has-sec-${i + 1}`,
    type: "spec:HasSection",
    from: documentSpec.id,
    to: s.id,
  })),
  ...termSpecs.map((t, i) => ({
    id: `rel:doc-defines-${i + 1}`,
    type: "spec:Defines",
    from: documentSpec.id,
    to: t.id,
  })),
  { id: "rel:adr-considers-single", type: "spec:Considers", from: adr.id, to: optA.id },
  { id: "rel:adr-considers-per", type: "spec:Considers", from: adr.id, to: optB.id },
  { id: "rel:adr-considers-quo", type: "spec:Considers", from: adr.id, to: optC.id },
  { id: "rel:adr-chose", type: "spec:Chose", from: adr.id, to: optA.id },
  ...tradeoffs.map((t, i) => ({
    id: `rel:adr-tradeoff-${i + 1}`,
    type: "spec:HasTradeoff",
    from: adr.id,
    to: t.id,
  })),
  { id: "rel:qas-single-targets", type: "spec:Targets", from: "spec:qas:single-engine", to: "spec:qa:single-engine" },
  { id: "rel:qas-closed-targets", type: "spec:Targets", from: "spec:qas:closed-surface", to: "spec:qa:closed-surface" },
  { id: "rel:qas-perm-targets", type: "spec:Targets", from: "spec:qas:permission-tier-b", to: "spec:qa:closed-surface" },
  { id: "rel:qas-pin-targets", type: "spec:Targets", from: "spec:qas:helper-version-pin", to: "spec:qa:reproducibility" },
  { id: "rel:mit-promo", type: "spec:Mitigates", from: "spec:mit:promotion-rule", to: "spec:risk:helper-bloat" },
  { id: "rel:mit-types", type: "spec:Mitigates", from: "spec:mit:type-strictness", to: "spec:risk:type-mismatch" },
  { id: "rel:mit-pin", type: "spec:Mitigates", from: "spec:mit:cel-pin", to: "spec:risk:cel-bump" },
  { id: "rel:mit-cache", type: "spec:Mitigates", from: "spec:mit:cache-compiled", to: "spec:risk:perf" },
  // The ADR commits to the architecture (one Core service, three tiers,
  // CEL-only). The blocking open question (CEL revision pin) is genuinely
  // unresolved — only the implementing PR can close it. The ADR documents
  // the framework within which that pin will be chosen, not the pin itself.
  { id: "rel:adr-resolves-datetime", type: "spec:Resolves", from: adr.id, to: "spec:q:datetime-mapping" },
  { id: "rel:mig-2-deps-1", type: "spec:DependsOn", from: "spec:mig:2", to: "spec:mig:1" },
  { id: "rel:mig-3-deps-1", type: "spec:DependsOn", from: "spec:mig:3", to: "spec:mig:1" },
  { id: "rel:mig-4-deps-1", type: "spec:DependsOn", from: "spec:mig:4", to: "spec:mig:1" },
  { id: "rel:mig-5-deps-2", type: "spec:DependsOn", from: "spec:mig:5", to: "spec:mig:2" },
  { id: "rel:mig-5-deps-3", type: "spec:DependsOn", from: "spec:mig:5", to: "spec:mig:3" },
  { id: "rel:ac1-verifies-r1", type: "spec:Verifies", from: "spec:ac:1", to: "spec:req:r-001" },
  { id: "rel:ac6-verifies-r5", type: "spec:Verifies", from: "spec:ac:6", to: "spec:req:r-005" },

  // AC ordering — manifest amendment must land before the runtime can be
  // consumed; consumer-SPEC amendments must land after the runtime ships.
  { id: "rel:ac1-deps-ac4", type: "spec:DependsOn", from: "spec:ac:1", to: "spec:ac:4" },
  { id: "rel:ac2-deps-ac1", type: "spec:DependsOn", from: "spec:ac:2", to: "spec:ac:1" },
  { id: "rel:ac3-deps-ac1", type: "spec:DependsOn", from: "spec:ac:3", to: "spec:ac:1" },
  { id: "rel:ac5-deps-ac1", type: "spec:DependsOn", from: "spec:ac:5", to: "spec:ac:1" },
  { id: "rel:ac6-deps-ac4", type: "spec:DependsOn", from: "spec:ac:6", to: "spec:ac:4" },
  { id: "rel:conf1-verifies-r2", type: "spec:Verifies", from: "spec:conf:1", to: "spec:req:r-002" },
  { id: "rel:conf2-verifies-r3", type: "spec:Verifies", from: "spec:conf:2", to: "spec:req:r-003" },
  { id: "rel:conf3-verifies-r4", type: "spec:Verifies", from: "spec:conf:3", to: "spec:req:r-004" },
  { id: "rel:conf4-verifies-r6", type: "spec:Verifies", from: "spec:conf:4", to: "spec:req:r-006" },
  { id: "rel:adr-cites-cel-spec", type: "spec:Cites", from: adr.id, to: "spec:ref:cel-spec" },
  { id: "rel:adr-cites-cel-js", type: "spec:Cites", from: adr.id, to: "spec:ref:cel-js" },
  { id: "rel:adr-cites-cel-validator", type: "spec:Cites", from: adr.id, to: "spec:ref:cel-validator" },
  { id: "rel:adr-cites-render-dsl", type: "spec:Cites", from: adr.id, to: "spec:ref:render-dsl" },
  { id: "rel:adr-cites-pluggable", type: "spec:Cites", from: adr.id, to: "spec:ref:pluggable" },
  { id: "rel:doc-cites-claude", type: "spec:Cites", from: documentSpec.id, to: "spec:ref:claude-md" },
  { id: "rel:doc-req-claude", type: "spec:RequiredRead", from: documentSpec.id, to: "spec:ref:claude-md" },
  { id: "rel:doc-req-pluggable", type: "spec:RequiredRead", from: documentSpec.id, to: "spec:ref:pluggable" },
  { id: "rel:doc-revised-0-1-0", type: "spec:RevisedIn", from: documentSpec.id, to: "spec:rev:0-1-0" },
  { id: "rel:doc-revised-0-1-1", type: "spec:RevisedIn", from: documentSpec.id, to: "spec:rev:0-1-1" },
  { id: "rel:doc-revised-0-1-2", type: "spec:RevisedIn", from: documentSpec.id, to: "spec:rev:0-1-2" },
  { id: "rel:doc-revised-0-1-3", type: "spec:RevisedIn", from: documentSpec.id, to: "spec:rev:0-1-3" },
  { id: "rel:doc-revised-0-1-4", type: "spec:RevisedIn", from: documentSpec.id, to: "spec:rev:0-1-4" },
  { id: "rel:doc-revised-0-1-5", type: "spec:RevisedIn", from: documentSpec.id, to: "spec:rev:0-1-5" },
  { id: "rel:doc-revised-0-1-6", type: "spec:RevisedIn", from: documentSpec.id, to: "spec:rev:0-1-6" },
  { id: "rel:doc-revised-0-1-7", type: "spec:RevisedIn", from: documentSpec.id, to: "spec:rev:0-1-7" },
];

// ── Commit ─────────────────────────────────────────────────────────────────

async function main() {
  const host = await openHost();
  const result = await defineProject(host, {
    id: PROJECT_ID,
    name: "SPEC — FDPM Host Expression Runtime",
    profile: PROFILE_ID,
    description:
      "SPEC for the Core CEL-based expression runtime that powers BOTH validate-time predicates and render-time templates. Defines the type mapping, error model, activation tiers, and helper-set versioning that consumer SPECs (SPEC-CEL-VALIDATOR, SPEC-RENDER-DSL) consume.",
  })
    .primitives([
      documentSpec,
      ...termSpecs,
      ...stakeholderSpecs,
      ...qaSpecs,
      ...principleSpecs,
      m1TypeMapping,
      m2ErrorModel,
      m7Activation,
      m14Versioning,
      optA,
      optB,
      optC,
      adr,
      ...tradeoffs,
      ...scenarios,
      ...invariants,
      ...requirements,
      ...acceptances,
      ...conformance,
      ...changes,
      ...migration,
      ...risks,
      ...mitigations,
      ...openQuestions,
      ...futureWork,
      ...references,
      ...revisions,
      ...sections,
    ])
    .relations(relations)
    .commit();

  console.log("Built project:", result.project_id);
  console.log("  primitives:", result.primitives_created);
  console.log("  relations: ", result.relations_created);
  console.log("  revision:  ", result.revision);
  console.log("");
  console.log("Render to Markdown:");
  console.log(`  FDPM_DATA_DIR=/tmp/fdpm-spec-expr-rt npx tsx cli/src/bin/fdpm.ts \\`);
  console.log(`    render ${PROJECT_ID} text/markdown --renderer-id spec:SpecMarkdownRenderer \\`);
  console.log(`    -o docs/specs/SPEC-EXPRESSION-RUNTIME.md`);
}

main().catch((e) => {
  console.error("FAILED:", e);
  if (e && typeof e === "object" && "findings" in e) {
    console.error("Findings:", JSON.stringify((e as { findings: unknown }).findings, null, 2));
  }
  process.exit(1);
});
