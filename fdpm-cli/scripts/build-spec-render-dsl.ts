/**
 * Build the SPEC for "Render-Time DSL for FDPM Document Templates"
 * using the `fdpm.spec-authoring` plugin profile.
 *
 * Authors a typed object graph that materialises the same structural
 * elements as SPEC-CORE / SPEC-MCP-SERVER (Document, Sections,
 * Stakeholders, QualityAttributes, ADR + Trade-off Matrix, QAScenarios,
 * Requirements, Acceptance Criteria, Conformance, Risks + Mitigations,
 * Open Questions, Future Work, References, Implementation Plan,
 * Migration Steps, Revision history) so the resulting SPEC sits next to
 * the existing ones in docs/specs/ with the same shape.
 *
 * Run:
 *   rm -rf /tmp/fdpm-spec-render-dsl
 *   FDPM_DATA_DIR=/tmp/fdpm-spec-render-dsl npx tsx cli/scripts/build-spec-render-dsl.ts
 *   FDPM_DATA_DIR=/tmp/fdpm-spec-render-dsl npx tsx cli/src/bin/fdpm.ts \
 *     render spec-render-dsl text/markdown \
 *     --renderer-id spec:SpecMarkdownRenderer \
 *     -o docs/specs/SPEC-RENDER-DSL.md
 *
 * Validates clean: 0 errors, 0 warnings, 0 info findings.
 */

import {
  openHost,
  defineProject,
  type PrimitiveSpec,
  type RelationSpec,
} from "../src/sdk.js";
import { PROFILE_ID } from "../plugins/spec_authoring/index.js";
import {
  ACTIVATION_TIER_A_LIST,
  STANDARD_HELPERS,
  STANDARD_HELPER_COUNT,
  HELPER_SET_VERSION,
  familyEnumeration,
} from "./_spec-shared.js";

const PROJECT_ID = "spec-render-dsl";

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ── Document root ──────────────────────────────────────────────────────────

const documentSpec: PrimitiveSpec = {
  id: "spec:doc:render-dsl",
  type: "spec:Document",
  fields: {
    title: "SPEC — Render-Time DSL for FDPM Document Templates v0.1",
    subtitle:
      "A small, sandboxed expression language evaluated at render time. Variables, project-graph queries, and conditional sections — no Turing-complete escape hatches.",
    spec_id: "spec:fdpm:render-dsl:0.1",
    version: "0.1.5",
    status: "Proposal",
    audience:
      "FDPM core maintainers, plugin authors writing renderers (cap:renderer), security reviewers responsible for output sandboxing.",
    required_reads: [
      "CLAUDE.md",
      "PURPOSE.md",
      "DISCLAIMER.md",
      "docs/specs/SPEC-CORE.md",
      "docs/specs/SPEC-PLUGGABLE-ARCHITECTURE.md",
      "docs/specs/SPEC-EXPRESSION-RUNTIME.md",
      "docs/specs/SPEC-CEL-VALIDATOR.md",
    ],
    companion_code: "cli/plugins/spec_authoring/renderers/spec_md.ts",
    peer_spec: "docs/specs/SPEC-CEL-VALIDATOR.md",
    disclaimer_path: "../../DISCLAIMER.md",
    pals_banner: true,
    pals_extension:
      "Render-time DSL expressions are LLM-authorable inputs to a host evaluator. " +
      "An expression that silently produces empty output (e.g., a typo'd variable name " +
      "coerced to '') is a verification gap by definition. The contract below requires " +
      "every evaluation to be logged, every undefined name to surface as an error, and " +
      "every helper to be reviewable as pure code.",
    date: "2026-05-04",
    generated_by: "Claude Opus 4.7 (1M context) via Claude Code (fdpm.spec-authoring)",
    revision_note: "0.1.5 — ships the first host-owned render-DSL execution path, strict-mode exit semantics, and a template-driven references section. See §19.",
    source_script: "cli/scripts/build-spec-render-dsl.ts",
    regeneration_command: [
      "rm -rf /tmp/fdpm-spec-render-dsl",
      "FDPM_DATA_DIR=/tmp/fdpm-spec-render-dsl npx tsx cli/scripts/build-spec-render-dsl.ts",
      "FDPM_DATA_DIR=/tmp/fdpm-spec-render-dsl npx tsx cli/src/bin/fdpm.ts \\",
      "  render spec-render-dsl text/markdown \\",
      "  --renderer-id spec:SpecMarkdownRenderer \\",
      "  -o docs/specs/SPEC-RENDER-DSL.md",
    ].join("\n"),
  },
};

// ── §3 Definitions ─────────────────────────────────────────────────────────

const terms: Array<[string, string, string?]> = [
  [
    "DSL",
    "Domain-Specific Language. Here, the small expression language defined by this SPEC; evaluated at render time inside `${...}` placeholders embedded in `Section.body_md` and a few designated string fields.",
  ],
  [
    "Activation environment",
    `The set of named values bound into the evaluator before an expression executes. The closed Tier-A surface is \`${ACTIVATION_TIER_A_LIST}\` (defined in SPEC-EXPRESSION-RUNTIME §M7). No implicit globals; an expression that references a name outside this surface MUST surface as a categorised error (Principle 4).`,
  ],
  [
    "Placeholder",
    "The token shape `${...}` in a template string. The renderer resolves placeholders one pass; nested `${}` is not supported in v0.1.",
  ],
  [
    "Iteration expression",
    "A read-only projection over the project graph, expressed as a CEL list comprehension. Example: `${fn.sortBy(project.primitives.filter(p, p.type_id == \"spec:ADR\"), p, p.id)}`. CEL provides `filter`, `map`, `exists`, `all` as method-call macros; `fn.sortBy` is a Tier-A helper (CEL has no built-in sort) — see SPEC-EXPRESSION-RUNTIME §M14.",
  ],
  [
    "Variable expression",
    "A placeholder that resolves to a scalar value, e.g., `${doc.title}` or `${project.fingerprint}`. The path before the first `.` MUST name a Tier-A binding (per SPEC-EXPRESSION-RUNTIME §M7) or a Tier-B binding the plugin has opted into.",
  ],
  [
    "Conditional block",
    "A `${if: <expr>}…${endif}` pair. The body is included verbatim when `<expr>` is truthy; otherwise dropped. Single-pass; no `${else}` in v0.1.",
  ],
  [
    "Helper function",
    "A pure host-bound function under `fn.*`, e.g. `${fn.upper(doc.title)}`. The set is closed; adding one is a SPEC amendment.",
  ],
  [
    "Render-time",
    "The moment a `cap:renderer` runs. Distinct from validate-time (§7 pipeline), append-time (operation log), and read-time (Store projection). DSL evaluation happens here — and only here, in v0.1.",
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
    id: "spec:stk:renderer-author",
    role: "Renderer author (plugin)",
    primary_concern:
      "Author templates with declarative variable substitution and project-graph queries instead of writing per-renderer TS for each filter and projection.",
    category: "external_team",
  },
  {
    id: "spec:stk:doc-author",
    role: "Document author",
    primary_concern:
      "Reuse one section template across versions; avoid hand-editing rendered files (the same defect the GENERATED-DOCUMENT banner exists to flag).",
    category: "human",
  },
  {
    id: "spec:stk:core-maintainer",
    role: "Core maintainer",
    primary_concern:
      "Exactly one expression evaluator in the host (alignment with SPEC-CEL-VALIDATOR's Principle 1: `One evaluator, not two.`).",
    category: "internal_team",
  },
  {
    id: "spec:stk:security-reviewer",
    role: "Security reviewer",
    primary_concern:
      "Evaluator is pure, sandboxed, and bounded: no I/O, no eval, no unbounded recursion, no quadratic-blowup queries.",
    category: "internal_team",
  },
  {
    id: "spec:stk:operator",
    role: "Operator",
    primary_concern:
      "Determinism: same project state + same template ⇒ byte-identical output. Required for the GENERATED-DOCUMENT banner's claims to hold.",
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
    id: "spec:qa:determinism",
    attribute: "Determinism",
    pressure:
      "Two renders of the same project state MUST produce byte-identical output. Any non-determinism (system clock, env var drift, map iteration order) is a contract violation.",
    priority: "primary",
  },
  {
    id: "spec:qa:expressiveness",
    attribute: "Expressiveness",
    pressure:
      "The DSL must replace ≥ 80 % of the hand-coded filter/sort/projection calls in spec_md.ts (renderADRs, renderRevisions, renderAcceptanceCriteria, etc.) without forcing template authors into a Turing-complete language.",
    priority: "primary",
  },
  {
    id: "spec:qa:security",
    attribute: "Security",
    pressure:
      "Evaluator is sandboxed: no filesystem, network, child-process, vm, or eval. Helpers are closed-set and individually reviewable.",
    priority: "primary",
  },
  {
    id: "spec:qa:debuggability",
    attribute: "Debuggability",
    pressure:
      "A typo'd variable name MUST produce a clear, located error (file, line, column, expression text), never a silent empty string.",
    priority: "primary",
  },
  {
    id: "spec:qa:performance",
    attribute: "Performance",
    pressure:
      "Render-time DSL evaluation must not regress p50 render time vs. the hand-coded TS path by more than 25 % on the SPEC-CEL-VALIDATOR fixture.",
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
    id: "spec:prin:single-evaluator",
    ordinal: 1,
    title: "One evaluator across validate-time and render-time.",
    statement:
      "The same engine that evaluates `ValidationRuleDef.expression` (per SPEC-CEL-VALIDATOR) also evaluates render-time `${...}` placeholders. Two evaluators is the failure mode this SPEC exists to prevent.",
    strength: "MUST",
  },
  {
    id: "spec:prin:pure",
    ordinal: 2,
    title: "Evaluator is pure.",
    statement:
      "No I/O, no globals, no side effects, no time dependency outside the explicit `env.NOW` binding. Expressions are referentially transparent given the activation.",
    strength: "MUST",
  },
  {
    id: "spec:prin:closed-set",
    ordinal: 3,
    title: "Activation surface and helper set are closed.",
    statement:
      `\`${ACTIVATION_TIER_A_LIST}\` exhaustively names the Tier-A activation (per SPEC-EXPRESSION-RUNTIME §M7). The \`fn.*\` helper set is enumerated in §6.4. Adding either is a SPEC amendment to SPEC-EXPRESSION-RUNTIME, not a code change here.`,
    strength: "MUST",
  },
  {
    id: "spec:prin:errors-loud",
    ordinal: 4,
    title: "Undefined names error loudly.",
    statement:
      "An undefined variable, an unknown helper, or a query against a non-existent type MUST surface as an explicit `render-error` finding with the offending expression text and location. Silent coercion to empty string is forbidden.",
    strength: "MUST",
  },
  {
    id: "spec:prin:bounded",
    ordinal: 5,
    title: "Every operation is bounded.",
    statement:
      "Evaluation is bounded by the shared host runtime: expression nesting cap 32, list-iteration cap 1000 (hard cap 100 000), helper argument count cap 8, and string coercion cap 65 536 chars. No unbounded recursion or iteration.",
    strength: "MUST",
  },
];
const principleSpecs: PrimitiveSpec[] = principles.map((p) => ({
  id: p.id,
  type: "spec:Principle",
  fields: { ordinal: p.ordinal, title: p.title, statement: p.statement, strength: p.strength },
}));

// ── §6 Capabilities — DSL surface (modelled as spec:Capability rows) ───────

const capabilities = [
  {
    id: "spec:cap:variable",
    capability_id: "dsl:variable",
    description:
      "Resolve a dotted path against the activation environment. Examples: `${doc.title}` (Tier-A always-bound), `${host.fdpm_version}` (Tier-A), `${env.GIT_SHA}` (Tier-B — requires the plugin to declare `read:vcs` permission per SPEC-EXPRESSION-RUNTIME §M7; without it, `permission-denied` fires). Undefined paths produce `unknown-name` errors — never silent empty strings.",
    multiplicity: "1..N",
    required_permissions: [],
  },
  {
    id: "spec:cap:iter",
    capability_id: "dsl:iter",
    description:
      "Read-only iteration / projection over the project graph via CEL list-comprehension macros. CEL ships `filter`, `map`, `exists`, `exists_one`, `all` as method-call macros (`list.filter(p, predicate)`); sorting is a Tier-A helper `fn.sortBy(list, varname, keyExpr)` because CEL has no built-in sort. Example: `${fn.sortBy(project.primitives.filter(p, p.type_id == \"spec:ADR\"), p, p.id)}`. No SQL-shaped sugar — the same parser handles validate-time and render-time.",
    multiplicity: "0..N",
    required_permissions: [],
  },
  {
    id: "spec:cap:if",
    capability_id: "dsl:if",
    description:
      "Conditional block. Form: `${if: <expr>}<body>${endif}`. The body is included verbatim when `<expr>` is truthy. No `${else}` in v0.1; an inverse block is `${if: !<expr>}…${endif}`.",
    multiplicity: "0..N",
    required_permissions: [],
  },
  // NOTE: `fn.*` helpers are NOT a separate surface form. A helper-call
  // lives inside any of the four forms above (`${fn.upper(doc.title)}`
  // is a Variable expression; `${fn.sortBy(list, p, p.id)}` is an
  // Iteration expression). The helper *inventory* is in §6.4 and lives
  // in SPEC-EXPRESSION-RUNTIME §M14. Pass-3 review caught the previous
  // draft's `dsl:helper` capability row as inconsistent with §1.1's
  // four-form prose; §6 is now aligned with §1.1.

  {
    id: "spec:cap:include",
    capability_id: "dsl:include",
    description:
      "Inline another template by id: `${include: spec:tpl:adr-only}`. Cycle detection raises a `render-error`. Depth limit 5.",
    multiplicity: "0..N",
    required_permissions: [],
  },
];
const capabilitySpecs: PrimitiveSpec[] = capabilities.map((c) => ({
  id: c.id,
  type: "spec:Capability",
  fields: {
    capability_id: c.capability_id,
    description: c.description,
    multiplicity: c.multiplicity,
    required_permissions: c.required_permissions,
  },
}));

// ── §6.4 Helper-function inventory (modelled as a SchemaDefinition table) ──

/**
 * Render the helper inventory body from the shared STANDARD_HELPERS
 * constant. Single source of truth — see _spec-shared.ts for the rule.
 * If you find yourself editing this body directly, edit _spec-shared.ts
 * instead and re-run.
 */
function buildHelperInventoryBody(): string {
  const lines: string[] = [
    `// Standard helper set v${HELPER_SET_VERSION}, inventory authoritative in`,
    `// SPEC-EXPRESSION-RUNTIME §M14. The shape below is generated from`,
    `// cli/scripts/_spec-shared.ts so this SPEC and EXPR-RT cannot drift.`,
    "",
  ];
  // Pad signatures to a column so the arrows align.
  const colWidth = Math.max(...STANDARD_HELPERS.map((h) => h.signature.length)) + 2;
  let lastFamily: string | null = null;
  for (const h of STANDARD_HELPERS) {
    if (h.family !== lastFamily) {
      if (lastFamily !== null) lines.push("");
      lines.push(`// ${h.family} family`);
      lastFamily = h.family;
    }
    lines.push(`${h.signature.padEnd(colWidth, " ")}→ ${h.summary}`);
  }
  lines.push(
    "",
    "All helpers are pure, total, and bounded.",
    "Type errors return a render-error value at the call site (§M2 policy);",
    "the evaluator never throws into user-visible flow.",
    "",
    "fn.hash canonicalisation rules (NORMATIVE in EXPR-RT §M14):",
    "  primitives & lists → supported, deterministic.",
    "  maps               → type-error in v1.0.0 (Future Work spec:fw:hash-maps).",
  );
  return lines.join("\n");
}

const helperSchema: PrimitiveSpec = {
  id: "spec:schema:helpers",
  type: "spec:SchemaDefinition",
  fields: {
    name: `fn.* — Helper function inventory (v${HELPER_SET_VERSION})`,
    dialect: "ad_hoc",
    body: buildHelperInventoryBody(),
  },
};

// ── §6.5 Grammar (modelled as a SchemaDefinition with EBNF) ────────────────

const grammarSchema: PrimitiveSpec = {
  id: "spec:schema:grammar",
  type: "spec:SchemaDefinition",
  fields: {
    name: "Render-DSL grammar (EBNF, v0.1) — template envelope only",
    dialect: "ad_hoc",
    body: [
      "// The render-DSL adds ONLY a placeholder envelope plus 3 directive",
      "// keywords (`if:`, `endif`, `include:`). Everything inside `${...}`",
      "// is a CEL expression parsed by the host CEL engine — no second",
      "// grammar to maintain. CEL grammar is normative; see SPEC-",
      "// EXPRESSION-RUNTIME §M14 for the pinned CEL spec revision.",
      "",
      "Template      ::= ( Text | Placeholder )*",
      "Text          ::= /[^$]+ | \\$[^{]/+              -- anything not '${'",
      "Placeholder   ::= '${' WS? Form WS? '}'",
      "Form          ::= Directive | CelExpr",
      "Directive     ::= If | Endif | Include",
      "If            ::= 'if:' WS CelExpr               -- expr must yield bool",
      "Endif         ::= 'endif'",
      "Include       ::= 'include:' WS TemplateId       -- id of a spec:tpl:*",
      "CelExpr       ::= /* full CEL grammar; opaque to this SPEC */",
      "TemplateId    ::= /[a-z]+:[a-z]+:[A-Za-z0-9_-]+/",
      "WS            ::= /[ \\t]+/",
      "",
      "// Notes:",
      "// 1. There is no `${else}` in v0.1. Use CEL ternary inside a",
      "//    placeholder: `${cond ? a : b}`. `${if: !cond}…${endif}` covers",
      "//    the inverse-block case.",
      "// 2. Iteration is plain CEL: `${list.filter(x, p(x))}`. No SQL sugar.",
      "// 3. Nested `${…${x}…}` is not supported in v0.1 (see Open Question",
      "//    `spec:q:nested-placeholders`).",
    ].join("\n"),
  },
};

// ── §15 ADR + §16 Trade-off Matrix ─────────────────────────────────────────

const optA: PrimitiveSpec = {
  id: "spec:opt:cel-extended",
  type: "spec:Option",
  fields: {
    label: "Option A — Reuse the CEL evaluator; CEL-only surface (no SQL sugar)",
    description:
      "Embed the same cel-js engine SPEC-CEL-VALIDATOR proposes for predicate evaluation. The render-DSL adds nothing but a thin placeholder envelope (`${...}`) and three directive keywords (`if:`, `endif`, `include:`). Iteration is CEL list comprehension. There is no SQL-shaped sugar — the same expression that runs at validate-time runs at render-time, parsed by one CEL parser, evaluated by one engine.",
    pros: [
      "One evaluator, one parser (Principle 1, made even stronger by dropping SQL sugar).",
      "Activation and helper contracts are inherited from SPEC-EXPRESSION-RUNTIME — no second contract.",
      "Security review surface is the helpers we bind; CEL itself is pure-by-spec.",
      "Drops the parser-fork problem M4 named: there is no fork.",
    ],
    cons: [
      "CEL list comprehensions are more verbose than `SELECT … FROM …` for trivial filter+sort cases. Expected; readability cost is paid in exchange for one less language.",
      "Couples three SPECs (this + SPEC-CEL-VALIDATOR + SPEC-EXPRESSION-RUNTIME): rollout order matters.",
    ],
    verdict: "chosen",
  },
};

const optB: PrimitiveSpec = {
  id: "spec:opt:liquid",
  type: "spec:Option",
  fields: {
    label: "Option B — Adopt LiquidJS",
    description:
      "Embed liquidjs (the Shopify/Jekyll template language). Mature ecosystem, large helper library, well-known to authors who've used Jekyll, Hugo, or Eleventy.",
    pros: [
      "Battle-tested syntax with broad author familiarity.",
      "Filter set is far larger than this SPEC's helpers.",
    ],
    cons: [
      "Two evaluators in the host (Liquid for templates, CEL for predicates) — directly violates Principle 1.",
      "Liquid's filter API is open-ended; closing it down to the §6.4 set requires opting out of most of the library.",
      "Template-vs-predicate context split would surface as a footgun for plugin authors who confuse the two.",
    ],
    verdict: "rejected",
    rejection_reason:
      "Two-evaluator surface area is the failure mode SPEC-CEL-VALIDATOR exists to prevent; adopting Liquid here re-creates it for the rendering side.",
  },
};

const optC: PrimitiveSpec = {
  id: "spec:opt:status-quo",
  type: "spec:Option",
  fields: {
    label: "Option C — No DSL; keep filters in TS",
    description:
      "Every renderer keeps writing TS code for every filter, sort, and projection (the current spec_md.ts pattern: ~20 small functions, one per Section.kind).",
    pros: [
      "Zero new surface area.",
      "TS is fully expressive; renderer authors have all of Node available.",
    ],
    cons: [
      "Templates cannot ship as data. A new renderer pattern requires shipping TS.",
      "Variable substitution still needs SOME DSL (the `regeneration_command` field in the GENERATED-DOCUMENT banner already begs for `${PROJECT_ID}` substitution).",
      "Plugin authors must learn the host's TS conventions to ship a renderer.",
    ],
    verdict: "rejected",
    rejection_reason:
      "Treats every renderer as code. Variable substitution alone justifies a small DSL; once that exists, projection and conditional become natural extensions.",
  },
};

const adr: PrimitiveSpec = {
  id: "spec:adr:dsl-001",
  type: "spec:ADR",
  fields: {
    adr_id: "ADR-DSL-001",
    title: "Adopt a CEL-only render-time DSL with a closed activation surface; no SQL sugar",
    status: "proposed",
    date: "2026-05-04",
    context:
      "Two recent observations push toward formalising a render-time DSL. (1) The GENERATED-DOCUMENT banner introduced in commit a37208f hard-codes `regeneration_command` strings that contain literal project ids — the natural form is `${doc.spec_id}` (a Tier-A binding). (2) The renderer in cli/plugins/spec_authoring/renderers/spec_md.ts has ~20 small TS helpers (renderADRs, renderRevisions, renderRisks, renderReferences, ...) each doing the same shape: filter primitives by type_id, sort by some field, project specific columns. That shape is exactly what a CEL list comprehension expresses. CLAUDE.md's PALS-LAW posture also penalises silently-empty output — the right time to formalise the evaluator's behaviour on undefined names is now, before authors come to depend on the silent-coerce behaviour. SPEC-EXPRESSION-RUNTIME defines the evaluator contract this SPEC consumes; type mapping (M1), error model (M2), activation tiers (M7), and helper-set versioning (M14) are inherited verbatim.",
    decision:
      "Adopt a CEL-only render-time DSL. The render-DSL adds NOTHING to CEL beyond a thin placeholder envelope (`${...}`) and three directive keywords (`if:`, `endif`, `include:`). Iteration over the project graph uses CEL list comprehensions (`project.primitives.filter(p, p.type_id == \"spec:ADR\")`). The activation surface — `{ doc, project, env, host, fn }` — is defined by SPEC-EXPRESSION-RUNTIME §M7; adding a binding is a SPEC amendment there. The closed helper inventory (§6.4) is the SPEC-EXPRESSION-RUNTIME standard set; this SPEC names the subset rendering uses but defines no new helpers.",
    consequences: [
      { polarity: "positive", text: "One evaluator across validate-time and render-time." },
      { polarity: "positive", text: "Renderer authors can ship a template (data) instead of a TS module." },
      { polarity: "positive", text: "GENERATED-DOCUMENT banner's `regeneration_command` becomes a real template instead of a hard-coded string." },
      { polarity: "positive", text: "Per-renderer filter functions (renderADRs, renderRisks, …) collapse into CEL list-comprehension expressions plus the closed `fn.*` helper set in reusable templates." },
      { polarity: "negative", text: `v0.1 ships with a small helper set (${STANDARD_HELPER_COUNT} functions). Authors will request more; each is a SPEC amendment by Principle 3.` },
      { polarity: "negative", text: "Couples this SPEC's release to SPEC-CEL-VALIDATOR's host evaluator landing first. Rollout order matters." },
      { polarity: "neutral", text: "v0.1 has no `${else}` and no nested placeholders. These are explicitly Future Work." },
    ],
    compliance_checks: [
      "CI: every shipped renderer is parsed against the §6.5 grammar; parse failures block the build.",
      "CI: a fuzz harness supplies 10⁴ adversarial templates to the evaluator and asserts no host crash, no I/O, and no helper outside §6.4 is invoked.",
      "Test: a typo'd variable name produces a `render-error` finding with file, line, column, and expression text — never an empty string.",
      "Test: re-rendering the same project twice produces byte-identical output.",
    ],
    revisit_signals: [
      "If the §6.4 helper set grows past ~25 entries via amendments, reconsider whether a richer language is justified.",
      "If render-time CPU on representative SPECs exceeds 200 ms p50, reconsider per-render compilation strategy (likely cache compiled programs by template-id).",
      "If a use case demands cross-project queries, revisit the activation surface (today `project` is single-bound).",
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
        { option_id: "spec:opt:cel-extended", value: "M (depends on CEL host evaluator)" },
        { option_id: "spec:opt:liquid", value: "S (vendor)" },
        { option_id: "spec:opt:status-quo", value: "XS" },
      ],
    },
  },
  {
    id: "spec:tx:single-evaluator",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Single evaluator (Principle 1)",
      cells: [
        { option_id: "spec:opt:cel-extended", value: "Yes" },
        { option_id: "spec:opt:liquid", value: "No (Liquid + CEL)" },
        { option_id: "spec:opt:status-quo", value: "N/A (no DSL)" },
      ],
    },
  },
  {
    id: "spec:tx:author-ergonomics",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Template-author ergonomics",
      cells: [
        { option_id: "spec:opt:cel-extended", value: "CEL — list comprehensions are verbose but consistent" },
        { option_id: "spec:opt:liquid", value: "Familiar to Jekyll/Hugo authors" },
        { option_id: "spec:opt:status-quo", value: "TS only — closed to non-engineers" },
      ],
    },
  },
  {
    id: "spec:tx:security-surface",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Security review surface",
      cells: [
        { option_id: "spec:opt:cel-extended", value: "Small (helpers only; CEL pure-by-spec)" },
        { option_id: "spec:opt:liquid", value: "Wide (filter library)" },
        { option_id: "spec:opt:status-quo", value: "Whatever TS the renderer writes" },
      ],
    },
  },
];

// ── §14 QA Scenarios ───────────────────────────────────────────────────────

const scenarios: PrimitiveSpec[] = [
  {
    id: "spec:qas:determinism",
    type: "spec:QAScenario",
    fields: {
      title: "Determinism — twice-rendered SPEC is byte-identical",
      source: "CI on a representative fixture (the SPEC-CEL-VALIDATOR project).",
      stimulus: "Render the project twice from a fresh data dir and `diff -q` the outputs.",
      environment: "CI; warm Host; fixed FDPM_DATA_DIR seed.",
      artifact: "ValidationPipeline + render-time DSL evaluator + spec:SpecMarkdownRenderer.",
      response: "diff exits 0. No clock-, env-, or hash-dependent drift.",
      response_measure: "100 % of renders byte-identical across two runs. Mismatches block the release.",
    },
  },
  {
    id: "spec:qas:typo-loud",
    type: "spec:QAScenario",
    fields: {
      title: "Debuggability — typo'd variable produces a located error",
      source: "Renderer author writing a template.",
      stimulus: "A template references `${doc.titel}` (typo) instead of `${doc.title}`.",
      environment: "Local CLI; `fdpm render <project> text/markdown`.",
      artifact: "DSL evaluator's name-resolution path.",
      response:
        "Render emits an inline marker at the placeholder site and records a `RenderFinding` carrying template-id, line, column, and expression text. With default CLI policy bytes are still emitted; `--strict` fails the command while preserving the bytes.",
      response_measure: "0 silent empty strings on undefined names. 100 % of name errors carry file, line, column, and expression text; default CLI still emits bytes with inline markers.",
    },
  },
  {
    id: "spec:qas:helper-purity",
    type: "spec:QAScenario",
    fields: {
      title: "Security — helper-binding purity audit",
      source: "Security reviewer.",
      stimulus:
        "Static review of every host-bound helper plus a fuzz harness supplying adversarial templates (deeply nested, very long literals, type-mismatched arguments).",
      environment: "Source review tooling on cli/src/core/expr/*.ts and any render-time template glue.",
      artifact: "Helper bindings under `fn.*`.",
      response:
        "No helper performs filesystem, network, child-process, or vm operations. Fuzzed templates either evaluate to a value or surface a `render-error` finding via the §7.1 step-6 exception barrier.",
      response_measure:
        "0 helpers escape the §6.4 inventory. 0 evaluator-induced host crashes across 10⁴ fuzzed templates.",
    },
  },
];

// ── §17 Invariants & Requirements ──────────────────────────────────────────

const invariants: PrimitiveSpec[] = [
  {
    id: "spec:inv:closed-activation",
    type: "spec:Invariant",
    fields: {
      label: "Activation surface is closed.",
      statement:
        `An expression that references a name not in the Tier-A surface \`${ACTIVATION_TIER_A_LIST}\` (or a permission-held Tier-B / opt-in Tier-C path per SPEC-EXPRESSION-RUNTIME §M7) MUST produce a \`render-error\` finding. There is no fall-through to undefined / null / empty-string.`,
      enforcement: "ci_check",
      scope_ref: "cli/src/core/expr/activation.ts",
    },
  },
  {
    id: "spec:inv:helper-allowlist",
    type: "spec:Invariant",
    fields: {
      label: "Helper allowlist matches §6.4 verbatim.",
      statement:
        "A helper not enumerated in §6.4 MUST surface as a `render-error`. Adding a helper requires a SPEC amendment.",
      enforcement: "ci_check",
      scope_ref: "cli/src/core/expr/std.ts and cli/src/core/expr/runtime.ts (CI check against §6.4 inventory)",
    },
  },
  {
    id: "spec:inv:bounded-eval",
    type: "spec:Invariant",
    fields: {
      label: "Every evaluation step is bounded.",
      statement:
        "The shared host runtime enforces expression nesting cap 32, list-iteration cap 1000 (hard cap 100 000), helper argument count cap 8, and string coercion cap 65 536. Exceeding any cap surfaces a `render-error` with the cap that fired.",
      enforcement: "runtime_check",
      scope_ref: "cli/src/core/expr/runtime.ts",
    },
  },
];

const requirements: PrimitiveSpec[] = [
  {
    id: "spec:req:r-001",
    type: "spec:Requirement",
    fields: {
      label: "Reuse SPEC-CEL-VALIDATOR's evaluator",
      statement:
        "The render-time DSL MUST evaluate via the shared host CEL runtime owned by `cli/src/core/expr/` and specified by SPEC-EXPRESSION-RUNTIME. A second engine is forbidden.",
      strength: "MUST",
      verifiability: "review",
      verifier_ref: "render-time evaluation must consume cli/src/core/expr/ rather than embedding a second evaluator or importing cel-js directly",
    },
  },
  {
    id: "spec:req:r-002",
    type: "spec:Requirement",
    fields: {
      label: "Variables resolve via dotted-path lookup",
      statement:
        "`${a.b.c}` MUST resolve via successive property access on the activation root. Missing intermediate keys MUST produce a `render-error` (Principle 4).",
      strength: "MUST",
      verifiability: "test",
      verifier_ref: "cli/tests/render.test.ts and cli/tests/error-render.test.ts",
    },
  },
  {
    id: "spec:req:r-003",
    type: "spec:Requirement",
    fields: {
      label: "Queries are read-only",
      statement:
        "Render-time CEL list-comprehension expressions and helper calls MUST never produce side effects. Iteration over `project.primitives` / `project.relations` is read-only; the DSL MUST NOT introduce mutation forms.",
      strength: "MUST",
      verifiability: "test",
      verifier_ref: "cli/tests/render.test.ts",
    },
  },
  {
    id: "spec:req:r-004",
    type: "spec:Requirement",
    fields: {
      label: "Conditional blocks balance",
      statement:
        "Every `${if: …}` MUST have a matching `${endif}` in the same template. Unbalanced templates MUST produce a parse-time `render-error`.",
      strength: "MUST",
      verifiability: "test",
      verifier_ref: "cli/tests/error-render.test.ts",
    },
  },
  {
    id: "spec:req:r-005",
    type: "spec:Requirement",
    fields: {
      label: "Determinism across runs",
      statement:
        "Given identical project state and identical template, two render invocations MUST produce byte-identical output. Implementations MUST NOT depend on Map iteration order for output assembly.",
      strength: "MUST",
      verifiability: "test",
      verifier_ref: "cli/tests/render-dsl-determinism.test.ts",
    },
  },
];

// ── §18 Acceptance Criteria ────────────────────────────────────────────────

const acceptances: PrimitiveSpec[] = [
  {
    id: "spec:ac:1",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 1,
      criterion:
        "DSL evaluator wired into the render-time path through the shared host-owned `cli/src/core/expr/` runtime.",
      status: "met",
      evidence_refs: [
        "cli/src/core/render/template.ts",
        "cli/src/plugin/runtime.ts",
        "cli/src/commands/render.ts",
      ],
    },
  },
  {
    id: "spec:ac:2",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 2,
      criterion:
        "spec:SpecMarkdownRenderer ships at least one template-driven section (`renderADRs` or `renderReferences`) replacing its hand-coded TS function.",
      status: "met",
      evidence_refs: ["cli/plugins/spec_authoring/renderers/spec_md.ts"],
    },
  },
  {
    id: "spec:ac:3",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 3,
      criterion: "Determinism harness runs in CI and asserts byte-identical output across two renders.",
      status: "in_progress",
      evidence_refs: ["cli/tests/render-dsl.test.ts"],
    },
  },
  {
    id: "spec:ac:4",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 4,
      criterion:
        "Helper-purity static check (no fs / net / child_process / vm imports under cli/src/core/expr/ and any render-time template glue) wired into CI.",
      status: "open",
    },
  },
  {
    id: "spec:ac:5",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 5,
      criterion:
        "Render performance regression on the SPEC-CEL-VALIDATOR fixture stays within +25 % p50 of the pre-DSL baseline.",
      status: "open",
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
      name: "Undefined variable surfaces as render-error with location",
      procedure: "Render a template containing `${doc.does_not_exist}`.",
      expected:
        "render-error finding carrying the offending expression text plus template-id + line + column, plus inline-marker output under default CLI policy.",
    },
  },
  {
    id: "spec:conf:2",
    type: "spec:ConformanceItem",
    fields: {
      ordinal: 2,
      name: "Bounded iteration cap fires on adversarial input",
      procedure: "Render a template whose CEL expression would enumerate more than the configured bound from `project.primitives` on a 200 000-primitive project.",
      expected: "render-error: iteration bound exceeded, with the rendered bytes carrying inline markers under default CLI policy.",
    },
  },
  {
    id: "spec:conf:3",
    type: "spec:ConformanceItem",
    fields: {
      ordinal: 3,
      name: "Two renders are byte-identical",
      procedure: "Render the SPEC-CEL-VALIDATOR project twice from independent fresh data dirs; diff -q.",
      expected: "diff exits 0.",
    },
  },
];

// ── §13 Implementation Plan + §19 Migration ────────────────────────────────

const changes: PrimitiveSpec[] = [
  {
    id: "spec:chg:dsl-module",
    type: "spec:ImplementationChange",
    fields: {
      area: "cli/src/core/render/ template glue + cli/src/core/expr/",
      change:
        "New module: `template-lexer.ts` (split text vs. `${...}` placeholders + recognise the 3 directive keywords), thin glue to the host CEL evaluator from SPEC-EXPRESSION-RUNTIME for everything inside placeholders. NO CEL parser of our own.",
      complexity: "L",
      status: "complete",
    },
  },
  {
    id: "spec:chg:renderer-wire",
    type: "spec:ImplementationChange",
    fields: {
      area: "cli/plugins/spec_authoring/renderers/spec_md.ts",
      change:
        "Migrate one of the kind renderers (start with `renderReferences` — simplest projection) to a CEL-driven template using `project.primitives.filter(...)` plus the closed `fn.*` helper set. Keep all others on the TS path until parity is proven.",
      complexity: "M",
      status: "complete",
    },
  },
  {
    id: "spec:chg:tests",
    type: "spec:ImplementationChange",
    fields: {
      area: "cli/tests/render-dsl-*.test.ts",
      change:
        "Extend the live render suites (`render.test.ts`, `error-render.test.ts`) with render-DSL variable, iteration, conditional, include, helper, determinism, and error-path coverage.",
      complexity: "M",
      status: "in_progress",
    },
  },
  {
    id: "spec:chg:fuzz",
    type: "spec:ImplementationChange",
    fields: {
      area: "cli/tests/fuzz/render-dsl.fuzz.ts",
      change:
        "Adversarial templates: deeply nested if-blocks, oversized literals, type-mismatched helper args, malformed query syntax. Assert no host crash, no untaxonomised errors.",
      complexity: "M",
      status: "not_started",
    },
  },
  {
    id: "spec:chg:docs",
    type: "spec:ImplementationChange",
    fields: {
      area: "docs/specs/SPEC-CORE.md §10 (Frontend Shell)",
      change:
        "Spec amendment: declare the render-time DSL canonical for `cap:renderer` template authoring; reference this SPEC.",
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
      label: "Wait for shared host expression runtime adoption point",
      action:
        "This SPEC depends on the shared host-owned runtime contract in `cli/src/core/expr/`. Block until render-time glue can consume that service directly.",
      affected_paths: [],
    },
  },
  {
    id: "spec:mig:2",
    type: "spec:MigrationStep",
    fields: {
      ordinal: 2,
      label: "Land DSL parser + evaluator",
      action:
        "Ship render-time template parsing/glue that consumes cli/src/core/expr/ for every expression inside placeholders. No renderer migrations yet.",
      affected_paths: ["cli/src/core/expr/", "cli/src/core/render/"],
      depends_on: ["spec:mig:1"],
    },
  },
  {
    id: "spec:mig:3",
    type: "spec:MigrationStep",
    fields: {
      ordinal: 3,
      label: "Migrate renderReferences",
      action:
        "Smallest projection in spec_md.ts; replace its hand-coded TS with a template using CEL filtering/sorting over `project.primitives`. Validates the iteration path on a function with trivial sort and no row-template logic.",
      affected_paths: ["cli/plugins/spec_authoring/renderers/spec_md.ts"],
      depends_on: ["spec:mig:2"],
    },
  },
  {
    id: "spec:mig:4",
    type: "spec:MigrationStep",
    fields: {
      ordinal: 4,
      label: "Migrate progressively, blocked by parity tests",
      action:
        "renderRevisions → renderRisks → renderAcceptanceCriteria → renderImplementationPlan → renderMigration → renderOpenQuestions. Each migration ships with a parity test against the pre-DSL output on the SPEC-CEL-VALIDATOR fixture.",
      affected_paths: ["cli/plugins/spec_authoring/renderers/spec_md.ts"],
      depends_on: ["spec:mig:3"],
    },
  },
  {
    id: "spec:mig:5",
    type: "spec:MigrationStep",
    fields: {
      ordinal: 5,
      label: "Amend SPEC-CORE §10",
      action:
        "Once at least three kind renderers are template-driven, amend SPEC-CORE §10 to reference this SPEC and declare templates the canonical authoring surface for cap:renderer.",
      affected_paths: ["docs/specs/SPEC-CORE.md"],
      depends_on: ["spec:mig:4"],
    },
  },
];

// ── Risks & Mitigations ────────────────────────────────────────────────────

const risks: PrimitiveSpec[] = [
  {
    id: "spec:risk:helper-creep",
    type: "spec:Risk",
    fields: {
      label: "Helper creep",
      description:
        "Authors request more helpers; the §6.4 inventory grows; the closed-set property erodes.",
      likelihood: "high",
      impact: "medium",
    },
  },
  {
    id: "spec:risk:silent-empty",
    type: "spec:Risk",
    fields: {
      label: "Silent empty-string regression",
      description:
        "Implementation drift introduces a fall-through that coerces undefined names to '' (the exact PALS-LAW failure this SPEC exists to prevent).",
      likelihood: "medium",
      impact: "high",
    },
  },
  {
    id: "spec:risk:perf",
    type: "spec:Risk",
    fields: {
      label: "Per-render parse cost",
      description:
        "Parsing each template per render dominates p50 latency on small projects.",
      likelihood: "medium",
      impact: "medium",
    },
  },
  {
    id: "spec:risk:cel-coupling",
    type: "spec:Risk",
    fields: {
      label: "Coupling to SPEC-CEL-VALIDATOR rollout",
      description:
        "If SPEC-CEL-VALIDATOR is delayed or rolled back, this SPEC stalls.",
      likelihood: "medium",
      impact: "medium",
    },
  },
];

const mitigations: PrimitiveSpec[] = [
  {
    id: "spec:mit:helper-amendment",
    type: "spec:Mitigation",
    fields: {
      strategy:
        "Adding a helper requires a SPEC amendment, not just a code change (Principle 3). Amendment process forces design review before surface grows.",
      status: "planned",
    },
  },
  {
    id: "spec:mit:no-fallthrough",
    type: "spec:Mitigation",
    fields: {
      strategy:
        "Type-system invariant in the shared activation/runtime path (`cli/src/core/expr/activation.ts` plus render-time glue): every name lookup returns `Value | RenderError`, never `undefined`. The renderer surface refuses to render if any RenderError is present.",
      status: "planned",
    },
  },
  {
    id: "spec:mit:cache-compiled",
    type: "spec:Mitigation",
    fields: {
      strategy:
        "Cache compiled templates by template-id at registration time. Per-render work becomes evaluate-only.",
      status: "planned",
    },
  },
  {
    id: "spec:mit:phased-fallback",
    type: "spec:Mitigation",
    fields: {
      strategy:
        "v0.1 ships behind a feature gate; renderers continue to use the TS path until each migration step's parity test passes. Rollback is a flag flip, not a revert.",
      status: "planned",
    },
  },
];

// ── Open Questions ─────────────────────────────────────────────────────────

const openQuestions: PrimitiveSpec[] = [
  {
    id: "spec:q:cel-coupling",
    type: "spec:OpenQuestion",
    fields: {
      ordinal: 1,
      question:
        "Should this SPEC ship even if SPEC-CEL-VALIDATOR is not adopted, by inlining a minimal CEL subset?",
      default_choice:
        "No. Couple the rollout. Two evaluators is the failure mode SPEC-CEL-VALIDATOR exists to prevent; shipping this SPEC with an inline subset re-creates that failure mode here. If CEL is not adopted, this SPEC stalls until a different one-evaluator decision is made.",
      is_blocking: "yes",
      owner: "Operator",
    },
  },
  {
    id: "spec:q:else-block",
    type: "spec:OpenQuestion",
    fields: {
      ordinal: 2,
      question: "Should v0.1 include `${else}` blocks?",
      default_choice:
        "No. The inverse-form `${if: !x}…${endif}` covers every two-branch case; `${else}` is sugar that complicates the parser. Defer until a use case demonstrates the inverse form is materially worse.",
      is_blocking: "no",
    },
  },
  {
    id: "spec:q:nested-placeholders",
    type: "spec:OpenQuestion",
    fields: {
      ordinal: 3,
      question: "Should `${...${x}...}` (nested placeholders) be supported in v0.1?",
      default_choice:
        "No. v0.1 is single-pass: placeholders are resolved one at a time, left-to-right. Nested `${}` introduces an N-pass expansion problem better solved at v0.2 with a clear cycle policy.",
      is_blocking: "no",
    },
  },
  {
    id: "spec:q:render-template-include",
    type: "spec:OpenQuestion",
    fields: {
      ordinal: 4,
      question:
        "How does `${include: <template-id>}` resolve a template — by `spec:Section.id`, by a new `spec:Template` primitive, or via the existing `spec:tpl:*` ids on the profile's `templates` field?",
      default_choice:
        "Use the existing `spec:tpl:*` ids on the DomainProfile (already a SPEC-CORE concept; no new primitive needed). The DomainProfile's `templates` field carries the inventory; an include resolves against that map by id.",
      is_blocking: "no",
    },
  },
];

const futureWork: PrimitiveSpec[] = [
  {
    id: "spec:fw:else-elsif",
    type: "spec:FutureWork",
    fields: {
      label: "${else} and ${elsif} blocks",
      description:
        "Sugar over nested `${if: !x}` blocks. Defer to v0.2 once authoring patterns reveal whether the inverse-form is genuinely worse.",
      target_version: "0.2",
    },
  },
  {
    id: "spec:fw:row-templates",
    type: "spec:FutureWork",
    fields: {
      label: "Per-row query templates",
      description:
        "A future row-template surface for iterated CEL results could let authors control per-row formatting beyond the default table/list form. v0.1 ships without this extra directive; revisit only after the base CEL-only surface is stable.",
      target_version: "0.2",
    },
  },
  {
    id: "spec:fw:per-section-schemas",
    type: "spec:FutureWork",
    fields: {
      label: "Per-section schema scoping in the renderer",
      description:
        "Today `kind: \"schema\"` emits every spec:SchemaDefinition in the project. Once two SPECs need separate schemas in distinct sections (this SPEC's grammar vs. helpers), add a `target_id` (or relation-based) scoping mechanism so each section selects its own schema.",
      target_version: "spec_authoring 0.2",
    },
  },
  {
    id: "spec:fw:cross-project",
    type: "spec:FutureWork",
    fields: {
      label: "Cross-project queries",
      description:
        "Today `project` is single-bound. A future cross-project CEL activation surface could let one document reference another project's state for portfolio-level rollups, but v0.1 intentionally stays single-project.",
      target_version: "0.3",
    },
  },
];

const references: PrimitiveSpec[] = [
  {
    id: "spec:ref:cel-validator",
    type: "spec:Reference",
    fields: {
      kind: "spec",
      citation: "SPEC-CEL-VALIDATOR — CEL Runtime Validator for FDPM Plugin Predicates v0.1.",
      locator: "docs/specs/SPEC-CEL-VALIDATOR.md",
      verification: "verified",
      verification_note: "Authored alongside this SPEC; rendered from the same fdpm.spec-authoring profile.",
    },
  },
  {
    id: "spec:ref:cel-spec",
    type: "spec:Reference",
    fields: {
      kind: "spec",
      citation: "Common Expression Language Specification, Google.",
      locator: "https://github.com/google/cel-spec",
      verification: "unverified",
      verification_note:
        "Reader must verify the spec revision pinned at implementation time; CEL has shipped behaviour-affecting clarifications.",
    },
  },
  {
    id: "spec:ref:liquid",
    type: "spec:Reference",
    fields: {
      kind: "url",
      citation: "LiquidJS — JavaScript implementation of the Liquid template language.",
      locator: "https://liquidjs.com/",
      verification: "unverified",
      verification_note: "Cited as Option B; existence and license to be verified before any future adoption.",
    },
  },
  {
    id: "spec:ref:spec-md",
    type: "spec:Reference",
    fields: {
      kind: "repo_file",
      citation: "spec_authoring renderer — the hand-coded TS this SPEC proposes to replace.",
      locator: "cli/plugins/spec_authoring/renderers/spec_md.ts",
      verification: "verified",
      verification_note: "Read at SPEC-authoring time; ~20 small kind-renderer functions.",
    },
  },
  {
    id: "spec:ref:claude-md",
    type: "spec:Reference",
    fields: {
      kind: "repo_file",
      citation: "FDPM project guidelines (PALS-LAW, formalization-means-research, no-deferrals).",
      locator: "CLAUDE.md",
      verification: "self_evident",
    },
  },
];

const revisions: PrimitiveSpec[] = [
  {
    id: "spec:rev:0-1-3",
    type: "spec:Revision",
    fields: {
      version: "0.1.3",
      date: "2026-05-04",
      title: "Source-of-truth cleanup: remove stale SQL query surface and repoint architecture references to core/expr.",
      notes:
        "No intended surface expansion. This patch removes contradictions and stale path references in the generator itself:\n\n1. SQL-shaped `${query: SELECT …}` examples, requirements, conformance text, and migration steps are removed. The source now consistently describes a CEL-only render-time DSL with iteration expressed as list comprehensions over `project.primitives` / `project.relations`.\n\n2. ADR consequences no longer claim renderer helpers collapse into `${query: ...}` forms; they now describe CEL expressions plus the closed `fn.*` helper set.\n\n3. The helper-count claim now derives from the shared inventory (`STANDARD_HELPER_COUNT`) instead of hard-coding an obsolete value.\n\n4. Implementation references and migration steps now point at the host-owned runtime in `cli/src/core/expr/` and render-time glue that consumes it, instead of the old `cli/src/core/render/dsl/` / `cli/src/core/validation/cel/` paths.\n\n5. The row-template and cross-project future-work notes no longer reintroduce the removed SQL surface.",
      affected_sections: ["§15", "§17", "§18", "§19", "Future Work", "Migration"],
      kind: "patch",
    },
  },
  {
    id: "spec:rev:0-1-5",
    type: "spec:Revision",
    fields: {
      version: "0.1.5",
      date: "2026-05-04",
      title: "Ship the first live render-DSL execution path through core/expr.",
      notes:
        "Surface expansion is still intentionally narrow, but the implementation is now live instead of purely specified:\n\n1. New host-owned render-template glue lives under `cli/src/core/render/template.ts` and evaluates `${...}` / `${if: ...}` / `${include: ...}` through the shared `cli/src/core/expr/` runtime rather than a renderer-local evaluator.\n\n2. `fdpm render --strict` now preserves rendered bytes while changing the exit code when render findings are present, matching the v0.1 error-policy contract.\n\n3. `spec:SpecMarkdownRenderer` now renders the References section through a template-driven path, making one shipped section consume the render DSL instead of hand-coded string assembly.\n\n4. New tests cover variable interpolation, conditional rendering, located render findings with inline markers, deterministic renderer output, and strict-mode command semantics.",
      affected_sections: ["§7", "§13", "§18", "§19"],
      kind: "patch",
    },
  },
  {
    id: "spec:rev:0-1-4",
    type: "spec:Revision",
    fields: {
      version: "0.1.4",
      date: "2026-05-04",
      title: "Align render-time policy, rollout ownership, bounds, and verifier refs with core/expr.",
      notes:
        "No intended surface expansion. This patch fixes four source-of-truth drifts in the generator:\n\n1. Render-time error policy now matches SPEC-EXPRESSION-RUNTIME §M2: default CLI emits bytes with inline markers and records `RenderFinding[]`; `--strict` changes exit semantics, not byte emission.\n\n2. Dependency and rollout wording no longer claims SPEC-CEL-VALIDATOR owns the evaluator. The owner is the shared host runtime in `cli/src/core/expr/`; SPEC-CEL-VALIDATOR is a consumer.\n\n3. Bounded-execution text now names the shipped shared-runtime caps (nesting 32, list iteration 1000, arity 8, string output 65 536) instead of stale query-era `LIMIT` / conditional-nesting wording.\n\n4. Requirement and implementation verifier references now point at the live render test suites instead of nonexistent `render-dsl-*.test.ts` files.",
      affected_sections: ["§4", "§9", "§10", "§11", "§12", "§13", "§14", "§19"],
      kind: "patch",
    },
  },
  {
    id: "spec:rev:0-1-2",
    type: "spec:Revision",
    fields: {
      version: "0.1.2",
      date: "2026-05-04",
      title: "Pass-3 stabilization: fix three internal contradictions; share canonical inventories with SPEC-EXPRESSION-RUNTIME.",
      notes:
        "No surface changes. Stabilization-pass corrections:\n\n1. The activation surface listed in §3 Definitions, §4 Principle 3, and the closed-activation Invariant carried a stale binding name from the SQL-sugar draft. ADR-DSL-001 already had the correct list (per EXPR-RT §M7). All three sites now read from cli/scripts/_spec-shared.ts and emit the canonical form.\n\n2. §3 'Variable expression' and §6 dsl:variable description used a placeholder example whose name is not a real binding. Replaced with concrete Tier-A bindings (doc.title, host.fdpm_version) and a Tier-B example (env.GIT_SHA, with permission requirement called out).\n\n3. §1.3 'Why now' prose mentioned an invented env.* binding. Removed.\n\n4. §1.1 prose says 'four surface forms' but §6 capability table had five rows. Helper-call is NOT a separate surface form; it lives inside any of the four. Dropped the dsl:helper capability row; the helper inventory remains in §6.4 where it belongs.\n\n5. §6.4 helper inventory now generated from cli/scripts/_spec-shared.ts. Drift between this SPEC and EXPR-RT §M14 is structurally impossible. Pass-2 caught one such drift (fn.hash semantics); pass-3 prevents the next.\n\n6. Two positional Open-Question references replaced with id-based references (spec:q:else-block, spec:q:nested-placeholders). Reordering OQ doesn't break cross-references.\n\n7. New regression test (cli/tests/spec-builds-determinism.test.ts) asserts cross-SPEC drift cannot recur.",
      affected_sections: ["§3", "§4", "§6", "§6.4", "§17", "§19"],
      kind: "patch",
    },
  },
  {
    id: "spec:rev:0-1-1",
    type: "spec:Revision",
    fields: {
      version: "0.1.1",
      date: "2026-05-04",
      title: "Pass-2: corrected sortBy as 3-arg macro; aligned helper inventory with SPEC-EXPRESSION-RUNTIME §M14.",
      notes:
        "No surface-form changes (still CEL-only, four placeholder forms). Three corrections:\n\n1. `fn.sortBy` shown with the wrong 2-arg signature in the iteration capability description and §6.4 inventory. Fixed: it is a 3-arg MACRO `fn.sortBy(list, var, key)` mirroring CEL's `list.filter(p, expr)` / `list.map(p, expr)` form. The previous example `${project.primitives.filter(...).sortBy(p, p.id)}` was invalid CEL — CEL has no `.sortBy` method; sort lives in the host helper set.\n2. The `dsl:helper` capability description omitted `fn.replace` and used a `fn.date(iso, fmt)` formulation instead of the namespaced `fn.date.short` / `fn.date.long` / `fn.date.iso`. Fixed to enumerate the standard set verbatim from SPEC-EXPRESSION-RUNTIME §M14.\n3. Iteration definition in §3 Definitions updated to use the corrected sortBy form.\n\nNo Open Questions resolved or added.",
      affected_sections: ["§3", "§6", "§6.4"],
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
        "Initial draft authored via the fdpm.spec-authoring plugin. Couples to SPEC-CEL-VALIDATOR by design (Principle 1). Surface is intentionally small — variables, CEL list comprehensions, conditional blocks, helper functions, template includes — with explicit Future Work for `${else}`, row templates, and cross-project queries.",
      affected_sections: ["all"],
      kind: "minor",
    },
  },
];

// ── Sections ───────────────────────────────────────────────────────────────

const sections: PrimitiveSpec[] = [
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
        "This SPEC defines a small render-time template DSL evaluated by FDPM's `cap:renderer` execution path. The template envelope is the only surface this SPEC introduces; everything inside `${...}` is a CEL expression evaluated by the runtime defined in SPEC-EXPRESSION-RUNTIME. The four surface forms:",
        "",
        "1. **Variable / scalar expression** — `${doc.title}`, `${project.fingerprint}`, `${env.NOW}`. Any CEL expression that yields a value the renderer can stringify.",
        "2. **Iteration / projection** — `${project.primitives.filter(p, p.type_id == \"spec:ADR\").map(p, p.fields.title)}`. Plain CEL list comprehensions over the project graph; no SQL-shaped sugar.",
        "3. **Conditional block** — `${if: doc.status == \"Draft\"}…${endif}`. Single-pass; inverse via `${if: !x}`; no `${else}` in v0.1 (see Open Question `spec:q:else-block`). Use CEL ternary `${cond ? a : b}` for inline two-branch.",
        "4. **Template inclusion** — `${include: spec:tpl:adr-only}`. Inline another DomainProfile-declared template by id.",
        "",
        "All four are parsed by ONE engine — the host CEL parser SPEC-EXPRESSION-RUNTIME defines. There is no second grammar.",
        "",
        "### 1.2 What this document does NOT define",
        "",
        "- The evaluator, the type mapping, the error model, the activation surface, or the helper inventory. All five are owned by SPEC-EXPRESSION-RUNTIME. This SPEC names them; it does not redefine them.",
        "- A SQL-shaped query surface. Earlier drafts proposed `${query: SELECT … FROM …}`; the v0.1 decision drops it (ADR-DSL-001 §Decision). Iteration is plain CEL list comprehension. One engine, one parser, no fork.",
        "- A general-purpose template language. Loops over arbitrary data beyond CEL macros, user-defined functions, recursive macros, and `${else}` are explicitly Future Work.",
        "- A side-effecting `${exec: ...}` form. Renders are pure projections from project state plus the activation; that property is what makes the GENERATED-DOCUMENT banner's claims honest.",
        "- Cross-project queries (Future Work).",
        "- Authoring tooling (LSP, syntax highlighting). Tooling can be built on the §6.4 grammar later.",
        "",
        "### 1.3 Why now",
        "",
        "Two observations pushed toward this SPEC. First, the GENERATED-DOCUMENT banner introduced in commit a37208f hard-codes `regeneration_command` strings containing literal paths and project ids — the natural form is `${doc.spec_id}`. Second, the renderer in `spec_md.ts` has ~20 small TS helpers (`renderADRs`, `renderRevisions`, `renderRisks`, `renderReferences`, …) each doing the same shape: filter primitives by `type_id`, sort by some field, project specific columns. That shape is exactly what a CEL list comprehension expresses. Formalising this now — before authors come to depend on undocumented silent-coerce behaviour — is the PALS-LAW move.",
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
      body_md: "Each principle is testable; the renderer enumerates them in declared order.",
    },
  },
  {
    id: "spec:sec:4-5",
    type: "spec:Section",
    fields: {
      number: "4.5",
      title: "Architectural Decision Summary",
      kind: "decision_summary",
      body_md:
        "The full ADR is in §6; the trade-off matrix in §7. The summary below is the one-paragraph form.",
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
      title: "DSL Surface (normative)",
      kind: "capability_table",
      body_md:
        "Four surface forms (matching §1.1), each modelled as a `spec:Capability`. Helper functions (`fn.*`) are NOT a separate form — they appear inside any of the four. The helper inventory lives in §6.4. Multiplicity refers to occurrences per template.",
    },
  },
  {
    id: "spec:sec:6-4",
    type: "spec:Section",
    fields: {
      number: "6.4",
      title: "Helper-function inventory and grammar",
      kind: "schema",
      body_md: [
        "The `fn.*` set is closed. Adding a helper requires a SPEC amendment per Principle 3.",
        "The grammar is the contract. CI parses every shipped renderer's templates against it; parse failures block the build.",
        "",
        "_Note: the renderer's `kind: \"schema\"` section currently emits **all** spec:SchemaDefinition primitives in the project — see Future Work spec:fw:per-section-schemas. Both schemas below are surfaced under this single section as a workaround._",
      ].join("\n\n"),
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
      body_md: "Options scored across the axes that drove the decision.",
    },
  },
  {
    id: "spec:sec:9",
    type: "spec:Section",
    fields: {
      number: "9",
      title: "Quality-Attribute Scenarios (SEI template)",
      kind: "scenarios",
      body_md: "",
    },
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
        "Order matters: this SPEC waits for SPEC-CEL-VALIDATOR's host evaluator (step 1), lands the DSL behind a feature flag (step 2), migrates the smallest projection first (step 3), then progresses kind-by-kind with parity tests (step 4) before amending SPEC-CORE (step 5).",
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
  // Sections under document
  ...sections.map((s, i) => ({
    id: `rel:doc-has-sec-${i + 1}`,
    type: "spec:HasSection",
    from: documentSpec.id,
    to: s.id,
  })),
  // Document defines each Term
  ...termSpecs.map((t, i) => ({
    id: `rel:doc-defines-${i + 1}`,
    type: "spec:Defines",
    from: documentSpec.id,
    to: t.id,
  })),

  // ADR considers + chose
  { id: "rel:adr-considers-cel", type: "spec:Considers", from: adr.id, to: optA.id },
  { id: "rel:adr-considers-liquid", type: "spec:Considers", from: adr.id, to: optB.id },
  { id: "rel:adr-considers-quo", type: "spec:Considers", from: adr.id, to: optC.id },
  { id: "rel:adr-chose-cel", type: "spec:Chose", from: adr.id, to: optA.id },

  // Trade-off axes
  ...tradeoffs.map((t, i) => ({
    id: `rel:adr-tradeoff-${i + 1}`,
    type: "spec:HasTradeoff",
    from: adr.id,
    to: t.id,
  })),

  // QA scenarios target attributes
  { id: "rel:qas-det-targets", type: "spec:Targets", from: "spec:qas:determinism", to: "spec:qa:determinism" },
  { id: "rel:qas-typo-targets", type: "spec:Targets", from: "spec:qas:typo-loud", to: "spec:qa:debuggability" },
  { id: "rel:qas-helper-targets", type: "spec:Targets", from: "spec:qas:helper-purity", to: "spec:qa:security" },

  // Mitigations cover risks
  { id: "rel:mit-helper", type: "spec:Mitigates", from: "spec:mit:helper-amendment", to: "spec:risk:helper-creep" },
  { id: "rel:mit-no-fall", type: "spec:Mitigates", from: "spec:mit:no-fallthrough", to: "spec:risk:silent-empty" },
  { id: "rel:mit-cache", type: "spec:Mitigates", from: "spec:mit:cache-compiled", to: "spec:risk:perf" },
  { id: "rel:mit-flag", type: "spec:Mitigates", from: "spec:mit:phased-fallback", to: "spec:risk:cel-coupling" },

  // ADR resolves the blocking question
  { id: "rel:adr-resolves-coupling", type: "spec:Resolves", from: adr.id, to: "spec:q:cel-coupling" },

  // Migration step dependencies
  { id: "rel:mig-2-deps-1", type: "spec:DependsOn", from: "spec:mig:2", to: "spec:mig:1" },
  { id: "rel:mig-3-deps-2", type: "spec:DependsOn", from: "spec:mig:3", to: "spec:mig:2" },
  { id: "rel:mig-4-deps-3", type: "spec:DependsOn", from: "spec:mig:4", to: "spec:mig:3" },
  { id: "rel:mig-5-deps-4", type: "spec:DependsOn", from: "spec:mig:5", to: "spec:mig:4" },

  // Acceptance criteria verify requirements / invariants
  { id: "rel:ac1-verifies-r1", type: "spec:Verifies", from: "spec:ac:1", to: "spec:req:r-001" },
  { id: "rel:ac3-verifies-r5", type: "spec:Verifies", from: "spec:ac:3", to: "spec:req:r-005" },
  { id: "rel:ac4-verifies-inv-helper", type: "spec:Verifies", from: "spec:ac:4", to: "spec:inv:helper-allowlist" },

  // Conformance items verify
  { id: "rel:conf1-verifies-prin4", type: "spec:Verifies", from: "spec:conf:1", to: "spec:inv:closed-activation" },
  { id: "rel:conf2-verifies-bounded", type: "spec:Verifies", from: "spec:conf:2", to: "spec:inv:bounded-eval" },
  { id: "rel:conf3-verifies-r5", type: "spec:Verifies", from: "spec:conf:3", to: "spec:req:r-005" },

  // Citations
  { id: "rel:adr-cites-cel", type: "spec:Cites", from: adr.id, to: "spec:ref:cel-validator" },
  { id: "rel:adr-cites-cel-spec", type: "spec:Cites", from: adr.id, to: "spec:ref:cel-spec" },
  { id: "rel:adr-cites-liquid", type: "spec:Cites", from: adr.id, to: "spec:ref:liquid" },
  { id: "rel:adr-cites-spec-md", type: "spec:Cites", from: adr.id, to: "spec:ref:spec-md" },
  { id: "rel:doc-cites-claude", type: "spec:Cites", from: documentSpec.id, to: "spec:ref:claude-md" },

  // Required reads
  { id: "rel:doc-req-claude", type: "spec:RequiredRead", from: documentSpec.id, to: "spec:ref:claude-md" },
  { id: "rel:doc-req-cel", type: "spec:RequiredRead", from: documentSpec.id, to: "spec:ref:cel-validator" },

  // Document RevisedIn
  { id: "rel:doc-revised-0-1-0", type: "spec:RevisedIn", from: documentSpec.id, to: "spec:rev:0-1-0" },
  { id: "rel:doc-revised-0-1-1", type: "spec:RevisedIn", from: documentSpec.id, to: "spec:rev:0-1-1" },
  { id: "rel:doc-revised-0-1-2", type: "spec:RevisedIn", from: documentSpec.id, to: "spec:rev:0-1-2" },
  { id: "rel:doc-revised-0-1-3", type: "spec:RevisedIn", from: documentSpec.id, to: "spec:rev:0-1-3" },
  { id: "rel:doc-revised-0-1-5", type: "spec:RevisedIn", from: documentSpec.id, to: "spec:rev:0-1-5" },
  { id: "rel:doc-revised-0-1-4", type: "spec:RevisedIn", from: documentSpec.id, to: "spec:rev:0-1-4" },
];

// ── Commit ─────────────────────────────────────────────────────────────────

async function main() {
  const host = await openHost();

  const result = await defineProject(host, {
    id: PROJECT_ID,
    name: "SPEC — Render-Time DSL for FDPM Document Templates",
    profile: PROFILE_ID,
    description:
      "SPEC for a CEL-only render-time template DSL: thin placeholder envelope plus three directive keywords (if/endif/include); everything inside `${...}` is plain CEL evaluated by SPEC-EXPRESSION-RUNTIME's host engine.",
  })
    .primitives([
      documentSpec,
      ...termSpecs,
      ...stakeholderSpecs,
      ...qaSpecs,
      ...principleSpecs,
      ...capabilitySpecs,
      helperSchema,
      grammarSchema,
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
  console.log(
    `  FDPM_DATA_DIR=/tmp/fdpm-spec-render-dsl npx tsx cli/src/bin/fdpm.ts \\`,
  );
  console.log(
    `    render ${PROJECT_ID} text/markdown --renderer-id spec:SpecMarkdownRenderer \\`,
  );
  console.log(`    -o docs/specs/SPEC-RENDER-DSL.md`);
}

main().catch((e) => {
  console.error("FAILED:", e);
  if (e && typeof e === "object" && "findings" in e) {
    console.error("Findings:", JSON.stringify((e as { findings: unknown }).findings, null, 2));
  }
  process.exit(1);
});
