/**
 * Build the SPEC for "CEL Runtime Validator for FDPM Plugin Predicates"
 * using the `fdpm.spec-authoring` plugin profile.
 *
 * This is a real authoring exercise of the spec_authoring plugin: every
 * structural element of the SPEC (Document, Sections, Stakeholders,
 * Quality Attributes, ADR with Options & Trade-off Matrix, QA Scenarios,
 * Requirements, Acceptance Criteria, Conformance Items, Risks, Open
 * Questions, Future Work, References, Implementation Plan, Migration
 * Steps, Revision history, Definitions) is materialised as typed
 * primitives joined by typed relations.
 *
 * Run with:
 *   FDPM_DATA_DIR=/tmp/fdpm-spec-cel npx tsx fdpm-cli/scripts/build-spec-cel-validator.ts
 *
 * Then render the SPEC to disk:
 *   FDPM_DATA_DIR=/tmp/fdpm-spec-cel npx tsx fdpm-cli/src/bin/fdpm.ts \
 *     render spec-cel-validator --renderer-id spec:SpecMarkdownRenderer \
 *     --target text/markdown --out docs/specs/SPEC-CEL-VALIDATOR.md
 *
 * (Validation: the §7 pipeline runs on commit, so any rule violation
 * surfaces as a finding — including the PALS-LAW rules
 * `spec:val:reference-has-verification`,
 * `spec:val:reference-unverified-needs-note`, `spec:val:qas-six-fields`,
 * `spec:val:adr-has-options`, `spec:val:adr-has-chosen`.)
 */

import {
  openHost,
  defineProject,
  type PrimitiveSpec,
  type RelationSpec,
} from "../src/sdk.js";
import { PROFILE_ID } from "../plugins/spec_authoring/index.js";

const PROJECT_ID = "spec-cel-validator";

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ── Document root ──────────────────────────────────────────────────────────

const documentSpec: PrimitiveSpec = {
  id: "spec:doc:cel-validator",
  type: "spec:Document",
  fields: {
    title: "SPEC — CEL Runtime Validator for FDPM Plugin Predicates v0.1",
    subtitle:
      "Adopt CEL (Common Expression Language) as the canonical predicate language for ValidationRuleDef.expression and TypeConstraint.expression.",
    spec_id: "spec:fdpm:cel-validator:0.3",
    version: "0.3.0",
    status: "Stable",
    audience:
      "FDPM core maintainers, plugin authors, security reviewers responsible for the §7 validation pipeline.",
    required_reads: [
      "CLAUDE.md",
      "PURPOSE.md",
      "DISCLAIMER.md",
      "docs/specs/SPEC-CORE.md",
      "docs/specs/SPEC-PLUGGABLE-ARCHITECTURE.md",
    ],
    companion_code: "fdpm-cli/src/core/validation/pipeline.ts",
    peer_spec: "docs/specs/SPEC-CORE.md",
    disclaimer_path: "../../DISCLAIMER.md",
    pals_banner: true,
    pals_extension:
      "Predicate strings shipped by plugins are LLM-authorable inputs to the host. " +
      "An unevaluated predicate is exactly the absence-of-verification this banner forbids: " +
      "the rule was declared, the host took no action on it, and the operator was given no signal.",
    date: "2026-05-04",
    generated_by: "Claude Opus 4.7 (1M context) via Claude Code (fdpm.spec-authoring)",
    revision_note:
      "0.2.0 — implementation landed in commit 130a25e. ADR moved from `proposed` to `accepted`; per-plugin CEL evaluation and program-cache mitigations marked `implemented`. Two ACs remain open: helper-purity static check and the perf benchmark.",
    source_script: "fdpm-cli/scripts/build-spec-cel-validator.ts",
    regeneration_command: [
      "rm -rf /tmp/fdpm-spec-cel",
      "FDPM_DATA_DIR=/tmp/fdpm-spec-cel npx tsx fdpm-cli/scripts/build-spec-cel-validator.ts",
      "FDPM_DATA_DIR=/tmp/fdpm-spec-cel npx tsx fdpm-cli/src/bin/fdpm.ts \\",
      "  render spec-cel-validator text/markdown \\",
      "  --renderer-id spec:SpecMarkdownRenderer \\",
      "  -o docs/specs/SPEC-CEL-VALIDATOR.md",
    ].join("\n"),
  },
};

// ── §3 Definitions (Term primitives) ───────────────────────────────────────

const terms: Array<[string, string, string?]> = [
  [
    "CEL",
    "Common Expression Language. A side-effect-free, single-expression language designed for evaluating boolean / scalar / list / map predicates against a typed activation environment.",
    "Common Expression Language",
  ],
  [
    "Predicate",
    "A boolean expression carried by a `ValidationRuleDef` that fires against a primitive instance and (optionally) the relation graph.",
  ],
  [
    "Activation environment",
    "The set of named values bound into the evaluator before execution. For this SPEC: `{ instance, type, profile, graph }`.",
  ],
  [
    "Graph helper",
    "A host-bound CEL function that exposes graph-shaped queries needed by predicates that reason about relations or cross-primitive id resolution. As of helper-set v1.1.0 the inventory is: `graph.incoming(rel_id)`, `graph.outgoing(rel_id)`, `graph.acyclic(rel_id)`, `graph.exists(target_id)`, `graph.target_exists(rel_id)`. The last two are the v1.1.0 additions: `exists` answers id-membership over the project's primitive set; `target_exists` answers whether every outbound edge of a given relation type from the current instance points at a primitive that actually exists.",
  ],
  [
    "Legacy DSL",
    "The non-standard predicate strings shipped by the formal_specification and software_architecture plugins (`non_trivial(field)`, `min_items(field, n)`, `field(x) != y`, `has_incoming(rel)`, `has_outgoing(rel)`, `acyclic(rel)`, `when(cond, expr)`). Stored verbatim today; not evaluated by Core.",
  ],
  [
    "Behavioral parity",
    "For a rule `R` with legacy predicate `P` and CEL translation `P'`, the property that for every primitive instance `i` in the project, `evaluate_legacy(P, i) == evaluate_cel(P', i)` — same finding emitted at the same level on the same target_id and field_path.",
  ],
];
const termSpecs: PrimitiveSpec[] = terms.map(([term, definition, synonyms]) => ({
  id: `spec:term:${slug(term)}`,
  type: "spec:Term",
  fields: synonyms ? { term, definition, synonyms } : { term, definition },
}));

// ── §2 Stakeholders & Concerns ─────────────────────────────────────────────

const stakeholders: Array<{ id: string; role: string; primary_concern: string; category: string }> = [
  {
    id: "spec:stk:plugin-author",
    role: "Plugin author",
    primary_concern:
      "Declare validation rules as one-line strings; have them evaluated; not maintain hand-written TS validators.",
    category: "external_team",
  },
  {
    id: "spec:stk:core-maintainer",
    role: "Core maintainer",
    primary_concern:
      "One canonical evaluator path; deletion of the 408-line _register_validators.ts file; type-safe activation surface.",
    category: "internal_team",
  },
  {
    id: "spec:stk:security-reviewer",
    role: "Security reviewer",
    primary_concern:
      "CEL evaluator runs in a pure sandbox: no I/O, no host-call allowlist gaps, no parser-level DoS via crafted predicates.",
    category: "internal_team",
  },
  {
    id: "spec:stk:operator",
    role: "Operator",
    primary_concern:
      "Existing projects continue to validate without re-import; predicate-not-evaluated `info` findings disappear once rules are migrated.",
    category: "human",
  },
];
const stakeholderSpecs: PrimitiveSpec[] = stakeholders.map((s) => ({
  id: s.id,
  type: "spec:Stakeholder",
  fields: { role: s.role, primary_concern: s.primary_concern, category: s.category },
}));

// ── §3 Quality Attributes ──────────────────────────────────────────────────

const qas: Array<{ id: string; attribute: string; pressure: string; priority: string }> = [
  {
    id: "spec:qa:correctness",
    attribute: "Correctness",
    pressure:
      "CEL evaluation must produce identical findings to the existing hand-coded TS validators for every fs:* rule, on every fixture, before fs migrates.",
    priority: "primary",
  },
  {
    id: "spec:qa:auditability",
    attribute: "Auditability",
    pressure:
      "A rule's predicate is now itself a SPEC artefact: source must round-trip through profile import/export with no semantic drift.",
    priority: "primary",
  },
  {
    id: "spec:qa:security",
    attribute: "Security",
    pressure:
      "The evaluator is a new code path executed on every validate call; helper bindings are the new attack surface.",
    priority: "primary",
  },
  {
    id: "spec:qa:performance",
    attribute: "Performance",
    pressure:
      "Validation runs on every Host write; CEL parse + eval must not dominate p50 latency vs. the current TS-only path.",
    priority: "secondary",
  },
  {
    id: "spec:qa:modifiability",
    attribute: "Modifiability",
    pressure:
      "Adding a rule should be one line in `validation_rules.ts`, not 30 in a `_register_validators.ts` adapter.",
    priority: "secondary",
  },
];
const qaSpecs: PrimitiveSpec[] = qas.map((q) => ({
  id: q.id,
  type: "spec:QualityAttribute",
  fields: { attribute: q.attribute, pressure: q.pressure, priority: q.priority },
}));

// ── §4 Architectural Principles ────────────────────────────────────────────

const principles: Array<{
  id: string;
  ordinal: number;
  title: string;
  statement: string;
  strength: string;
}> = [
  {
    id: "spec:prin:single-evaluator",
    ordinal: 1,
    title: "One evaluator, not two.",
    statement:
      "After migration, exactly one predicate evaluator exists in the host. The 408-line _register_validators.ts becomes tech debt and is deleted in the same release that lands fs migration.",
    strength: "MUST",
  },
  {
    id: "spec:prin:backcompat",
    ordinal: 2,
    title: "Legacy DSL strings load without error.",
    statement:
      "Existing `predicate` strings (`non_trivial(...)`, `min_items(...)`, ...) continue to load. If the parser fails, the rule falls back to the current step-5 'info: predicate not evaluated' behaviour — never an error finding from a parse failure.",
    strength: "MUST",
  },
  {
    id: "spec:prin:pure-eval",
    ordinal: 3,
    title: "CEL evaluator is pure.",
    statement:
      "No I/O, no global mutable state, no network. Helpers bound into the activation are the only escape hatches and must be reviewed individually.",
    strength: "MUST",
  },
  {
    id: "spec:prin:targeted-findings",
    ordinal: 4,
    title: "Findings preserve targeting.",
    statement:
      "A CEL-emitted finding must point at the same `field_path` the legacy validator did. The renderer-side experience does not regress.",
    strength: "SHOULD",
  },
];
const principleSpecs: PrimitiveSpec[] = principles.map((p) => ({
  id: p.id,
  type: "spec:Principle",
  fields: { ordinal: p.ordinal, title: p.title, statement: p.statement, strength: p.strength },
}));

// ── §15 ADR + §16 Trade-off Matrix ─────────────────────────────────────────

const optA: PrimitiveSpec = {
  id: "spec:opt:cel",
  type: "spec:Option",
  fields: {
    label: "Option A — Adopt CEL",
    description:
      "Embed cel-js (TypeScript). Translate ValidationRuleDef.expression / TypeConstraint.expression as CEL when present and parseable; legacy strings fall back to current behaviour. Migrate sw plugin (zero current evaluators) first, then fs (parity-tested).",
    pros: [
      "Eliminates the fs ↔ sw asymmetry (sw has 0 working predicates today).",
      "Replaces 408 lines of TS adapters with declarative strings.",
      "Standard tool; community evaluators exist for TS, Python, Go.",
      "Pure-by-spec; sandbox concerns reduce to helper bindings.",
    ],
    cons: [
      "+~50 KB bundle (cel-js).",
      "Graph predicates (`has_incoming`, `acyclic`) require host-bound helpers.",
      "Field-path attribution lost unless rules are split per-field or AST is parsed.",
    ],
    verdict: "chosen",
  },
};

const optB: PrimitiveSpec = {
  id: "spec:opt:in-house-dsl",
  type: "spec:Option",
  fields: {
    label: "Option B — In-house DSL evaluator",
    description:
      "~200 lines: parse predicate strings into (op, args) tuples, dispatch to the existing helpers in formal_specification/_validators.ts (lifted into core).",
    pros: [
      "Zero new dependencies.",
      "Exact behavioural parity by construction.",
      "Smallest possible diff to land.",
    ],
    cons: [
      "Reinvents CEL's parser, error reporting, type inference, macro semantics over time.",
      "Already shows strain: `when(cond, expr)` with named args is non-trivial to parse.",
      "No cross-language ecosystem; Python plugins would need their own port.",
    ],
    verdict: "rejected",
    rejection_reason:
      "Short-term win, long-term tax. CEL exists for this exact use case; reinventing it has no upside beyond avoiding one dependency.",
  },
};

const optC: PrimitiveSpec = {
  id: "spec:opt:status-quo",
  type: "spec:Option",
  fields: {
    label: "Option C — Status quo (per-plugin TS validators)",
    description:
      "Keep the fs pattern. Require every plugin to ship a `_register_validators.ts` to back any non-trivial rule. sw plugin gets one too.",
    pros: [
      "No host change; deepest backwards compatibility.",
      "Validators are ordinary TS code — fully expressive, fully debuggable.",
    ],
    cons: [
      "Doubles down on a 408-line adapter pattern as the long-run answer.",
      "Predicate string in the rule is decorative — the real source is the TS file. Two sources of truth per rule.",
      "Plugin author barrier-to-entry stays high.",
    ],
    verdict: "rejected",
    rejection_reason:
      "Treats the predicate string as documentation rather than executable spec. Violates Principle 1 (one evaluator).",
  },
};

const adr: PrimitiveSpec = {
  id: "spec:adr:cel-001",
  type: "spec:ADR",
  fields: {
    adr_id: "ADR-CEL-001",
    title: "Adopt CEL as the canonical predicate language for FDPM validation rules.",
    status: "accepted",
    date: "2026-05-04",
    context:
      "Two plugins ship today (formal_specification, software_architecture). Both declare `ValidationRuleDef.expression` strings using the same legacy DSL. fs evaluates 23/23 rules via 408 lines of hand-coded TS validators. sw evaluates 0/7 rules — they fall through to a step-5 'info: predicate not evaluated' finding ([cli/src/core/validation/pipeline.ts:360-372](../../cli/src/core/validation/pipeline.ts#L360-L372)). The asymmetry is a footgun: a plugin author reads 'we have a predicate field' and assumes the host evaluates it. CLAUDE.md's PALS-LAW posture treats absence of verification as a design defect.",
    decision:
      "Adopt CEL. Embed cel-js. Treat `ValidationRuleDef.expression` and `TypeConstraint.expression` as CEL when present. Bind a `graph` helper into the activation for relation predicates. Keep current step-5 fallback for unparseable / legacy DSL strings until plugins migrate.",
    consequences: [
      { polarity: "positive", text: "One evaluator path in the host (Principle 1)." },
      { polarity: "positive", text: "Eliminates the fs ↔ sw asymmetry — sw plugin's 7 rules fire after migration." },
      { polarity: "positive", text: "Deletes 408 lines from formal_specification/_register_validators.ts post-fs-migration." },
      { polarity: "positive", text: "Cross-language ecosystem: Python and Go ports exist if FDPM plugins ever ship in those runtimes." },
      { polarity: "negative", text: "+~50 KB CLI bundle." },
      { polarity: "negative", text: "Graph helpers (`graph.incoming`, `graph.outgoing`, `graph.acyclic`) are new host-trusted code; each is a security review item." },
      { polarity: "negative", text: "Two evaluators in flight during migration is worse than one — fs migration must complete in the same release." },
      { polarity: "neutral", text: "FieldValidation.kind open-string mechanism is OUT OF SCOPE for this SPEC (see Open Question Q1)." },
    ],
    compliance_checks: [
      "CI: `tsc --noEmit` over cli/ passes after host evaluator lands.",
      "CI: For every rule in formal_specification's validation_rules.ts, run a fixture-based parity test — legacy evaluator's findings must equal CEL evaluator's findings.",
      "CI: Static check that no predicate string in any shipped plugin uses a CEL feature outside the documented activation environment.",
      "Test: A predicate that raises during evaluation produces an `error` finding via the §7.1 step-6 exception barrier — never a host crash.",
    ],
    revisit_signals: [
      "If a plugin author requests a CEL feature not in the documented activation (e.g., user-defined macros), revisit the activation contract.",
      "If parse-time CPU on profile registration exceeds the §6.8 startup gate budget on representative profiles, revisit caching strategy.",
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
        { option_id: "spec:opt:cel", value: "M" },
        { option_id: "spec:opt:in-house-dsl", value: "S" },
        { option_id: "spec:opt:status-quo", value: "XS (no host change)" },
      ],
    },
  },
  {
    id: "spec:tx:asymmetry",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Eliminates fs↔sw asymmetry",
      cells: [
        { option_id: "spec:opt:cel", value: "Yes" },
        { option_id: "spec:opt:in-house-dsl", value: "Yes" },
        { option_id: "spec:opt:status-quo", value: "No (plugin authors must ship TS adapters)" },
      ],
    },
  },
  {
    id: "spec:tx:tco",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Total cost of ownership",
      cells: [
        { option_id: "spec:opt:cel", value: "Medium — eval owned by upstream" },
        { option_id: "spec:opt:in-house-dsl", value: "Low to build, high to operate" },
        { option_id: "spec:opt:status-quo", value: "High — every rule = TS adapter" },
      ],
    },
  },
  {
    id: "spec:tx:cross-lang",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Cross-language plugin parity",
      cells: [
        { option_id: "spec:opt:cel", value: "Yes (Python/Go ports)" },
        { option_id: "spec:opt:in-house-dsl", value: "No" },
        { option_id: "spec:opt:status-quo", value: "No (per-runtime adapters)" },
      ],
    },
  },
  {
    id: "spec:tx:bundle",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "CLI bundle delta",
      cells: [
        { option_id: "spec:opt:cel", value: "+~50 KB" },
        { option_id: "spec:opt:in-house-dsl", value: "+~5 KB" },
        { option_id: "spec:opt:status-quo", value: "0" },
      ],
    },
  },
];

// ── §14 Quality-Attribute Scenarios ────────────────────────────────────────

const scenarios: PrimitiveSpec[] = [
  {
    id: "spec:qas:fs-parity",
    type: "spec:QAScenario",
    fields: {
      title: "Correctness — fs validator parity",
      source: "Core maintainer running the parity-test harness on a CI run.",
      stimulus:
        "Replace each fs:val:* TS validator with the CEL translation of its declared predicate, then run the parity harness over the standard fs fixture set.",
      environment: "CI; warm Host; standard fs fixture set committed under cli/tests/fixtures/.",
      artifact: "ValidationPipeline + CEL evaluator + fs validation_rules.ts (CEL form).",
      response:
        "For every (rule_id, instance_id) pair the CEL evaluator produces a finding identical (level, target_id, field_path, message-modulo-formatting) to the legacy evaluator's finding.",
      response_measure:
        "100 % parity over the fixture set. Mismatches block the migration release; no exceptions.",
    },
  },
  {
    id: "spec:qas:helper-purity",
    type: "spec:QAScenario",
    fields: {
      title: "Security — helper-binding purity audit",
      source: "Security reviewer.",
      stimulus:
        "Static review of every host-bound CEL helper plus a fuzz harness that supplies adversarial predicate strings.",
      environment: "Source review tooling on cli/src/core/validation/cel/*.ts.",
      artifact: "Helper bindings (`graph.incoming`, `graph.outgoing`, `graph.acyclic`).",
      response:
        "No helper performs filesystem, network, child-process, or vm operations. Fuzzed predicates either evaluate or surface as a `plugin-validator-raised:*` error finding via the §7.1 step-6 barrier.",
      response_measure:
        "0 helpers escape the pure-evaluator allowlist. 0 evaluator-induced host crashes across 10⁴ fuzzed predicates.",
    },
  },
  {
    id: "spec:qas:perf",
    type: "spec:QAScenario",
    fields: {
      title: "Performance — validation throughput",
      source: "Operator running the fdpm CLI.",
      stimulus: "`fdpm validate <project>` on a 10k-primitive fs project.",
      environment: "Local CLI; warm Host; standard benchmark fixture.",
      artifact: "ValidationPipeline + CEL evaluator.",
      response:
        "Total wall-clock for the validate command stays within the same envelope as the current TS-only path (within +20 % p50, +30 % p95).",
      response_measure:
        "Throughput regression ≤ 20 % p50 / ≤ 30 % p95 vs. baseline measured before CEL adoption.",
    },
  },
];

// ── §17 Invariants & Requirements ──────────────────────────────────────────

const invariants: PrimitiveSpec[] = [
  {
    id: "spec:inv:exception-barrier",
    type: "spec:Invariant",
    fields: {
      label: "Evaluator exceptions never reach the operator.",
      statement:
        "Any exception thrown during CEL parse or evaluation is caught by the §7.1 step-6 exception barrier and converted into a `plugin-validator-raised:<rule_id>` error finding. The host process never crashes due to a malformed predicate.",
      enforcement: "ci_check",
      scope_ref: "cli/src/core/validation/pipeline.ts §7.1 step 6",
    },
  },
  {
    id: "spec:inv:legacy-fallback",
    type: "spec:Invariant",
    fields: {
      label: "Legacy DSL strings load without error.",
      statement:
        "When `expression` is set but does not parse as CEL, the rule falls back to the current step-5 'info: predicate not evaluated' behaviour. A parse failure is not an error finding.",
      enforcement: "runtime_check",
      scope_ref: "cli/src/core/validation/pipeline.ts step 5/6",
    },
  },
];

const requirements: PrimitiveSpec[] = [
  {
    id: "spec:req:r-001",
    type: "spec:Requirement",
    fields: {
      label: "Embed cel-js in the host",
      statement:
        "The host MUST embed a CEL evaluator (cel-js or equivalent) accessible from the §7 ValidationPipeline.",
      strength: "MUST",
      verifiability: "ci_check",
      verifier_ref: "cli/package.json (dependency); tsc resolves the import.",
    },
  },
  {
    id: "spec:req:r-002",
    type: "spec:Requirement",
    fields: {
      label: "Activation environment is fixed",
      statement:
        "Predicates evaluate against exactly `{ instance, type, profile, graph }`. No other names are bound. Adding a new binding is a SPEC amendment.",
      strength: "MUST",
      verifiability: "review",
      verifier_ref: "cli/src/core/validation/cel/activation.ts",
    },
  },
  {
    id: "spec:req:r-003",
    type: "spec:Requirement",
    fields: {
      label: "Graph helpers are pure",
      statement:
        "Every standard `graph.*` helper MUST be a pure function over the project graph. As of helper-set v1.1.0 the closed inventory is `graph.incoming(rel_id)`, `graph.outgoing(rel_id)`, `graph.acyclic(rel_id)`, `graph.exists(target_id)`, and `graph.target_exists(rel_id)`. None MAY perform I/O, spawn processes, invoke `eval`, or read clock/RNG. Adding a graph helper is a SPEC amendment AND a helper-set semver bump.",
      strength: "MUST",
      verifiability: "ci_check",
      verifier_ref: "CI grep over cli/src/core/expr/helpers.ts",
    },
  },
  {
    id: "spec:req:r-004",
    type: "spec:Requirement",
    fields: {
      label: "Field-path attribution preserved",
      statement:
        "When a predicate references a field path expressible as `instance.field_values.<name>`, the resulting finding's `field_path` SHOULD be `field_values.<name>`.",
      strength: "SHOULD",
      verifiability: "test",
      verifier_ref: "cli/tests/validation/cel-attribution.test.ts",
    },
  },
  {
    id: "spec:req:r-005",
    type: "spec:Requirement",
    fields: {
      label: "Parse-failure fallback",
      statement:
        "An unparseable `expression` MUST NOT block validation. The pipeline MUST emit the existing `info: predicate not evaluated` finding and continue.",
      strength: "MUST",
      verifiability: "test",
      verifier_ref: "cli/tests/validation/cel-fallback.test.ts",
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
      criterion: "CEL evaluator is wired into ValidationPipeline behind the legacy-fallback gate.",
      status: "met",
      evidence_refs: ["cli/src/core/validation/pipeline.ts"],
    },
  },
  {
    id: "spec:ac:2",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 2,
      criterion: "All 7 software_architecture rules fire as `error` / `warning` (no longer `info: predicate not evaluated`).",
      status: "met",
      evidence_refs: ["cli/tests/sw-cel-validation.test.ts"],
    },
  },
  {
    id: "spec:ac:3",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 3,
      criterion:
        "fs migration: 23/23 fs:val:* rules pass the parity harness; _register_validators.ts is deleted; _validators.ts is deleted.",
      status: "met",
      evidence_refs: ["cli/plugins/formal_specification/validation_rules.ts"],
    },
  },
  {
    id: "spec:ac:4",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 4,
      criterion: "Helper-purity static check is wired into CI and passes.",
      status: "open",
    },
  },
  {
    id: "spec:ac:5",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 5,
      criterion:
        "Performance regression on the 10k-primitive fixture stays within +20 % p50 / +30 % p95 of the pre-CEL baseline.",
      status: "open",
    },
  },
];

// ── §18 Conformance items ──────────────────────────────────────────────────

const conformance: PrimitiveSpec[] = [
  {
    id: "spec:conf:1",
    type: "spec:ConformanceItem",
    fields: {
      ordinal: 1,
      name: "Activation environment is closed",
      procedure:
        "Run a representative predicate that references an undeclared name (`foo.bar`); evaluator MUST report a CEL compile-time / type-check error converted to a finding, not silently coerce to undefined.",
      expected: "error finding with rule_id `plugin-validator-raised:<rule_id>`.",
    },
  },
  {
    id: "spec:conf:2",
    type: "spec:ConformanceItem",
    fields: {
      ordinal: 2,
      name: "Acyclic helper terminates on adversarial graph",
      procedure: "Build a project with 10⁴ primitives and a deeply cyclic relation set; run `graph.acyclic(rel_id)`.",
      expected: "Helper returns false in <50 ms p95 and emits no host log spam.",
    },
  },
  {
    id: "spec:conf:3",
    type: "spec:ConformanceItem",
    fields: {
      ordinal: 3,
      name: "Existence helpers reject dangling references",
      procedure:
        "Push a CEL rule `graph.exists(\"<missing-id>\")` against a seeded project; assert finding fires. Push `graph.target_exists(\"<rel-type>\")` from a primitive whose only outbound edge of that type points at a missing id; assert finding fires. Then add the missing primitive and assert both findings disappear.",
      expected:
        "Both helpers return the expected boolean against the project graph; findings appear and disappear deterministically.",
    },
  },
];

// ── §13 Implementation Plan + §19 Migration Steps ──────────────────────────

const changes: PrimitiveSpec[] = [
  {
    id: "spec:chg:host-evaluator",
    type: "spec:ImplementationChange",
    fields: {
      area: "cli/src/core/validation/cel/",
      change:
        "New module: `evaluator.ts` (parse, type-check, eval), `activation.ts` (binding factory), `helpers.ts` (graph helpers), `errors.ts` (parse / runtime taxonomy).",
      complexity: "M",
      status: "complete",
    },
  },
  {
    id: "spec:chg:pipeline-wire",
    type: "spec:ImplementationChange",
    fields: {
      area: "cli/src/core/validation/pipeline.ts",
      change:
        "Step 5/6 wires the CEL evaluator: when `expression` parses, run it; otherwise fall through to the existing 'info: predicate not evaluated' path.",
      complexity: "S",
      status: "complete",
    },
  },
  {
    id: "spec:chg:sw-migrate",
    type: "spec:ImplementationChange",
    fields: {
      area: "cli/plugins/software_architecture/validation_rules.ts",
      change:
        "Translate each of the 7 predicate strings into CEL form. No new TS validators required.",
      complexity: "S",
      status: "complete",
    },
  },
  {
    id: "spec:chg:fs-migrate",
    type: "spec:ImplementationChange",
    fields: {
      area: "cli/plugins/formal_specification/",
      change:
        "Translate 23 predicate strings into CEL form; delete _register_validators.ts and _validators.ts; delete the registerFormalSpecValidators call from index.ts; ship parity harness.",
      complexity: "L",
      status: "complete",
    },
  },
  {
    id: "spec:chg:tests",
    type: "spec:ImplementationChange",
    fields: {
      area: "cli/tests/validation/",
      change:
        "New test files: cel-evaluator.test.ts, cel-fallback.test.ts, cel-attribution.test.ts, cel-helpers.test.ts, cel-fs-parity.test.ts.",
      complexity: "M",
      status: "complete",
    },
  },
  {
    id: "spec:chg:docs",
    type: "spec:ImplementationChange",
    fields: {
      area: "docs/specs/SPEC-CORE.md §7",
      change:
        "Spec amendment: declare CEL canonical for `ValidationRuleDef.expression` and `TypeConstraint.expression`; document the activation environment and helper contract.",
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
      label: "Land host evaluator + fallback",
      action:
        "Ship `cli/src/core/validation/cel/` with the evaluator and graph helpers. Wire into pipeline.ts step 5/6 with the unparseable-string fallback. No plugin migrations yet — shipped behaviour is unchanged.",
      affected_paths: [
        "cli/src/core/validation/cel/",
        "cli/src/core/validation/pipeline.ts",
      ],
    },
  },
  {
    id: "spec:mig:2",
    type: "spec:MigrationStep",
    fields: {
      ordinal: 2,
      label: "Migrate software_architecture (zero-coverage today)",
      action:
        "Translate the 7 predicate strings to CEL form. Validates the binding contract on a plugin where any improvement is strictly additive — there is no behaviour to preserve.",
      affected_paths: ["cli/plugins/software_architecture/validation_rules.ts"],
      depends_on: ["spec:mig:1"],
    },
  },
  {
    id: "spec:mig:3",
    type: "spec:MigrationStep",
    fields: {
      ordinal: 3,
      label: "Build the parity harness",
      action:
        "Test that for every fs:val:* rule, legacy TS validator findings == CEL evaluator findings on the standard fixture. Block migration step 4 on 100 % parity.",
      affected_paths: ["cli/tests/validation/cel-fs-parity.test.ts"],
      depends_on: ["spec:mig:1"],
    },
  },
  {
    id: "spec:mig:4",
    type: "spec:MigrationStep",
    fields: {
      ordinal: 4,
      label: "Migrate formal_specification + delete adapters",
      action:
        "Translate 23 predicate strings to CEL form. Delete _register_validators.ts (408 lines) and _validators.ts (164 lines). Remove the registerFormalSpecValidators call from index.ts. Net code deletion target: ≥ 500 lines.",
      affected_paths: [
        "cli/plugins/formal_specification/validation_rules.ts",
        "cli/plugins/formal_specification/_register_validators.ts",
        "cli/plugins/formal_specification/_validators.ts",
        "cli/plugins/formal_specification/index.ts",
      ],
      depends_on: ["spec:mig:3"],
    },
  },
  {
    id: "spec:mig:5",
    type: "spec:MigrationStep",
    fields: {
      ordinal: 5,
      label: "Amend SPEC-CORE §7",
      action:
        "Declare CEL canonical for `ValidationRuleDef.expression` and `TypeConstraint.expression`. Document the activation environment and the legacy-fallback contract.",
      affected_paths: ["docs/specs/SPEC-CORE.md"],
      depends_on: ["spec:mig:4"],
    },
  },
];

// ── Risks & Mitigations ────────────────────────────────────────────────────

const risks: PrimitiveSpec[] = [
  {
    id: "spec:risk:parity-divergence",
    type: "spec:Risk",
    fields: {
      label: "fs parity gap",
      description:
        "A subtle CEL semantic difference (e.g., null-handling, empty-array equality) produces different findings than the hand-coded TS validator. Migration ships a behavioural regression.",
      likelihood: "medium",
      impact: "high",
    },
  },
  {
    id: "spec:risk:helper-creep",
    type: "spec:Risk",
    fields: {
      label: "Helper creep",
      description:
        "Plugin authors request more graph helpers; the activation surface grows; the 'pure evaluator' invariant erodes.",
      likelihood: "medium",
      impact: "medium",
    },
  },
  {
    id: "spec:risk:perf-regression",
    type: "spec:Risk",
    fields: {
      label: "Per-call parse cost",
      description:
        "Re-parsing a predicate on every validate call dominates p50 latency on small projects.",
      likelihood: "medium",
      impact: "medium",
    },
  },
];

const mitigations: PrimitiveSpec[] = [
  {
    id: "spec:mit:parity-harness",
    type: "spec:Mitigation",
    fields: {
      strategy:
        "Per-plugin CEL test files exercise every shipped rule on representative fixtures and assert findings match the legacy evaluator's behaviour. fs's 23 rules and sw's 7 rules each have evaluation coverage in cli/tests/cel-validation.test.ts and cli/tests/sw-cel-validation.test.ts.",
      status: "implemented",
    },
  },
  {
    id: "spec:mit:helper-amendment",
    type: "spec:Mitigation",
    fields: {
      strategy:
        "Adding a CEL helper requires a SPEC amendment, not just a code change (§4 of this SPEC). Forces design review before surface grows. Process discipline; not a code artifact.",
      status: "planned",
    },
  },
  {
    id: "spec:mit:cache-compiled",
    type: "spec:Mitigation",
    fields: {
      strategy:
        "Compiled CEL programs are cached by predicate-string identity in cli/src/core/expr/runtime.ts (`programCache`). Per-call work is bind+eval, not parse+bind+eval.",
      status: "implemented",
    },
  },
];

// ── §22 Open Questions ─────────────────────────────────────────────────────

const openQuestions: PrimitiveSpec[] = [
  {
    id: "spec:q:fieldval-scope",
    type: "spec:OpenQuestion",
    fields: {
      ordinal: 1,
      question:
        "Should CEL also replace FieldValidation.kind's open-string mechanism, or keep that as the structured-kinds path it is today?",
      default_choice:
        "Keep FieldValidation.kind out of scope for v0.1 — the structured kinds (`max_length`, `min_items`, `pattern`, `enum_values`) cover the existing use cases. Revisit if a plugin author needs a per-field predicate that the structured set cannot express.",
      is_blocking: "yes",
      owner: "Operator",
    },
  },
  {
    id: "spec:q:cel-version-pin",
    type: "spec:OpenQuestion",
    fields: {
      ordinal: 2,
      question:
        "Pin to which CEL spec / cel-js version? CEL has had behaviour-affecting clarifications across versions.",
      default_choice:
        "Pin cel-js to a specific minor at adoption time; document the CEL spec revision in SPEC-CORE §7. Bumping CEL is a Core SPEC patch bump.",
      is_blocking: "no",
    },
  },
];

// ── §17/§20 Future Work ────────────────────────────────────────────────────

const futureWork: PrimitiveSpec[] = [
  {
    id: "spec:fw:fieldval-cel",
    type: "spec:FutureWork",
    fields: {
      label: "CEL-based FieldValidation",
      description:
        "Promote FieldValidation.kind to CEL-evaluable when the open-string vocabulary outgrows the structured set.",
      target_version: "0.2",
      deferred_reason: ["Not motivated by current plugin needs."],
    },
  },
  {
    id: "spec:fw:cross-lang",
    type: "spec:FutureWork",
    fields: {
      label: "Python plugin parity",
      description:
        "Once CEL is canonical, port the predicate set to cel-python so the upstream Python FDPM plugins can be migrated 1:1.",
      target_version: "0.3",
    },
  },
];

// ── §23 References ─────────────────────────────────────────────────────────

const references: PrimitiveSpec[] = [
  {
    id: "spec:ref:cel-spec",
    type: "spec:Reference",
    fields: {
      kind: "spec",
      citation: "Common Expression Language Specification, Google, github.com/google/cel-spec.",
      locator: "https://github.com/google/cel-spec",
      verification: "unverified",
      verification_note:
        "Reader must verify the spec revision pinned at implementation time; CEL has shipped behaviour-affecting clarifications.",
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
        "Existence and license to be verified before adoption; PR must pin a specific version.",
    },
  },
  {
    id: "spec:ref:pipeline",
    type: "spec:Reference",
    fields: {
      kind: "repo_file",
      citation: "FDPM ValidationPipeline source.",
      locator: "cli/src/core/validation/pipeline.ts",
      verification: "verified",
      verification_note: "Read at SPEC-authoring time; line numbers cited.",
    },
  },
  {
    id: "spec:ref:fs-validators",
    type: "spec:Reference",
    fields: {
      kind: "repo_file",
      citation: "fs plugin TS validators (the 408 lines this SPEC eliminates).",
      locator: "cli/plugins/formal_specification/_register_validators.ts",
      verification: "verified",
      verification_note: "Read at SPEC-authoring time.",
    },
  },
  {
    id: "spec:ref:sw-rules",
    type: "spec:Reference",
    fields: {
      kind: "repo_file",
      citation: "sw plugin's 7 unevaluated predicate rules.",
      locator: "cli/plugins/software_architecture/validation_rules.ts",
      verification: "verified",
      verification_note: "Read at SPEC-authoring time.",
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

// ── §24 Revision history ───────────────────────────────────────────────────

const revisions: PrimitiveSpec[] = [
  {
    id: "spec:rev:0-1-0",
    type: "spec:Revision",
    fields: {
      version: "0.1.0",
      date: "2026-05-04",
      title: "Initial draft (proposed).",
      notes:
        "Initial draft authored via the fdpm.spec-authoring plugin. Structure derived from inspection of SPEC-CORE / SPEC-MCP-SERVER / SPEC-PLUGGABLE-ARCHITECTURE, augmented with the CEL adoption plan. ADR status: `proposed`.",
      affected_sections: ["all"],
      kind: "minor",
    },
  },
  {
    id: "spec:rev:0-2-0",
    type: "spec:Revision",
    fields: {
      version: "0.2.0",
      date: "2026-05-04",
      title: "Implementation landed; status moved from Proposal to Stable.",
      notes:
        "Commit 130a25e (`feat(cli/validation): migrate plugin predicates to CEL evaluator`) shipped: cel-js evaluator wired into ValidationPipeline, sw plugin's 7 rules now evaluate, fs plugin's 23 rules migrated, _register_validators.ts (408 lines) and _validators.ts (164 lines) deleted. ADR-CEL-001 moved from `proposed` to `accepted`. Mitigations `mit:parity-harness` and `mit:cache-compiled` moved from `planned` to `implemented`. ACs 1–3 remain `met`; ACs 4 (helper-purity static check) and 5 (perf benchmark) remain `open`.",
      affected_sections: ["6", "12", "13", "14", "18"],
      kind: "minor",
    },
  },
  {
    id: "spec:rev:0-3-0",
    type: "spec:Revision",
    fields: {
      version: "0.3.0",
      date: "2026-05-04",
      title: "Helper-set v1.1.0 — graph.exists / graph.target_exists added.",
      notes:
        "Additive amendment landing two new graph helpers requested by the upcoming fdpm.planning plugin. `graph.exists(target_id)` answers id-membership over the project's primitive set. `graph.target_exists(rel_id)` answers whether every outbound edge of the given relation type from the current instance points at a primitive that exists. Both are pure (no I/O, no clock, no RNG); both extend §6 Graph helper definition and §11 Requirement r-003. New §18 Conformance item `spec:conf:3` exercises them. Helper-set semver bumped from 1.0.0 to 1.1.0 (additive → minor per SPEC-EXPRESSION-RUNTIME §M14). The existing 5 graph-helper inventory now reads: incoming, outgoing, acyclic, exists, target_exists.",
      affected_sections: ["6", "11", "18"],
      kind: "minor",
    },
  },
];

// ── §0..§N Sections (the document tree) ────────────────────────────────────

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
        "This SPEC defines the adoption of CEL (Common Expression Language) as the canonical predicate language for `ValidationRuleDef.expression` and `TypeConstraint.expression` in the FDPM meta-model.",
        "",
        "### 1.2 What this document does NOT define",
        "",
        "- A new validation pipeline. The §7 pipeline is unchanged in shape; only step 5/6 contents change.",
        "- A new operation kind, error category, or persistence format.",
        "- Migration of `FieldValidation.kind` to CEL — see Open Question Q1.",
        "- A natural-language predicate authoring layer. CEL is the surface; LLM-assisted authoring is a tool concern, not a SPEC concern.",
        "",
        "### 1.3 Why now",
        "",
        "The codebase ships two shipped plugins. fs evaluates 23/23 of its declared rules via 408 lines of hand-coded TS adapters. sw evaluates 0/7 — its rules silently fall through to the step-5 `info: predicate not evaluated` finding. This asymmetry violates CLAUDE.md's PALS-LAW posture: a declared rule that the host does not evaluate is the absence-of-verification banner this codebase forbids.",
      ].join("\n"),
    },
  },
  {
    id: "spec:sec:2",
    type: "spec:Section",
    fields: {
      number: "2",
      title: "Stakeholders and Concerns",
      kind: "stakeholders",
      body_md:
        "If a concern has no listed stakeholder, no one will defend it. Flag any gap before implementation.",
    },
  },
  {
    id: "spec:sec:3",
    type: "spec:Section",
    fields: {
      number: "3",
      title: "Quality Attributes in Tension",
      kind: "quality_attributes",
      body_md:
        "The recurring tension is **correctness vs. simplicity**: an in-house DSL ships fast but reinvents CEL over time; CEL ships slower but pays its complexity once.",
    },
  },
  {
    id: "spec:sec:4",
    type: "spec:Section",
    fields: {
      number: "4",
      title: "Architectural Principles",
      kind: "principles",
      body_md:
        "Each principle is testable; the renderer enumerates them in declared order.",
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
        "The full ADR is in §6; the trade-off matrix in §7. The summary below is the one-paragraph form (SPEC-MCP-SERVER §4 / SPEC-REPL §4 convention).",
    },
  },
  {
    id: "spec:sec:5",
    type: "spec:Section",
    fields: {
      number: "5",
      title: "Definitions",
      kind: "definitions",
      body_md: "",
    },
  },
  {
    id: "spec:sec:6",
    type: "spec:Section",
    fields: {
      number: "6",
      title: "Architectural Decision",
      kind: "adr",
      body_md:
        "The full decision (context, options, consequences, compliance) follows. Trade-off matrix appears in §7.",
    },
  },
  {
    id: "spec:sec:7",
    type: "spec:Section",
    fields: {
      number: "7",
      title: "Trade-off Matrix",
      kind: "tradeoff_matrix",
      body_md: "Options scored across the axes that drove the decision.",
    },
  },
  {
    id: "spec:sec:8",
    type: "spec:Section",
    fields: {
      number: "8",
      title: "Quality-Attribute Scenarios (SEI template)",
      kind: "scenarios",
      body_md: "",
    },
  },
  {
    id: "spec:sec:9",
    type: "spec:Section",
    fields: {
      number: "9",
      title: "Requirements",
      kind: "prose",
      body_md: requirements
        .map((r) => {
          // Read field_values directly — `r` is a PrimitiveSpec whose
          // domain payload sits under `.fields`. The earlier version
          // type-asserted the wrong shape and emitted "undefined" cells.
          const f = r.fields as Record<string, string>;
          return `- **(${f.strength}) ${f.label}** — ${f.statement}`;
        })
        .join("\n"),
    },
  },
  {
    id: "spec:sec:10",
    type: "spec:Section",
    fields: {
      number: "10",
      title: "Acceptance Criteria",
      kind: "acceptance_criteria",
      body_md: "",
    },
  },
  {
    id: "spec:sec:11",
    type: "spec:Section",
    fields: {
      number: "11",
      title: "Conformance",
      kind: "conformance",
      body_md: "",
    },
  },
  {
    id: "spec:sec:12",
    type: "spec:Section",
    fields: {
      number: "12",
      title: "Implementation Plan — Required Changes",
      kind: "implementation_plan",
      body_md: "",
    },
  },
  {
    id: "spec:sec:13",
    type: "spec:Section",
    fields: {
      number: "13",
      title: "Migration",
      kind: "migration",
      body_md:
        "Order matters: the host evaluator (step 1) must land before any plugin migrates; sw migrates before fs (step 2 before 4) so the binding contract is validated against a zero-coverage plugin first; the parity harness (step 3) blocks step 4.",
    },
  },
  {
    id: "spec:sec:14",
    type: "spec:Section",
    fields: {
      number: "14",
      title: "Risks and Mitigations",
      kind: "risks",
      body_md: "",
    },
  },
  {
    id: "spec:sec:15",
    type: "spec:Section",
    fields: {
      number: "15",
      title: "Open Questions",
      kind: "open_questions",
      body_md: "",
    },
  },
  {
    id: "spec:sec:16",
    type: "spec:Section",
    fields: {
      number: "16",
      title: "Future Work",
      kind: "future_work",
      body_md: "",
    },
  },
  {
    id: "spec:sec:17",
    type: "spec:Section",
    fields: {
      number: "17",
      title: "References — verify independently",
      kind: "references",
      body_md: "",
    },
  },
  {
    id: "spec:sec:18",
    type: "spec:Section",
    fields: {
      number: "18",
      title: "Revision history",
      kind: "revision_history",
      body_md: "",
    },
  },
];

// ── Relations ──────────────────────────────────────────────────────────────

const relations: RelationSpec[] = [
  // Sections under the document
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

  // ADR considers each option
  { id: "rel:adr-considers-cel", type: "spec:Considers", from: adr.id, to: optA.id },
  { id: "rel:adr-considers-dsl", type: "spec:Considers", from: adr.id, to: optB.id },
  { id: "rel:adr-considers-quo", type: "spec:Considers", from: adr.id, to: optC.id },

  // ADR chose Option A
  { id: "rel:adr-chose-cel", type: "spec:Chose", from: adr.id, to: optA.id },

  // ADR has trade-off axes
  ...tradeoffs.map((t, i) => ({
    id: `rel:adr-tradeoff-${i + 1}`,
    type: "spec:HasTradeoff",
    from: adr.id,
    to: t.id,
  })),

  // QA scenarios target quality attributes
  { id: "rel:qas-fs-targets-correctness", type: "spec:Targets", from: "spec:qas:fs-parity", to: "spec:qa:correctness" },
  { id: "rel:qas-helper-targets-security", type: "spec:Targets", from: "spec:qas:helper-purity", to: "spec:qa:security" },
  { id: "rel:qas-perf-targets-perf", type: "spec:Targets", from: "spec:qas:perf", to: "spec:qa:performance" },

  // Mitigations cover risks
  { id: "rel:mit-parity", type: "spec:Mitigates", from: "spec:mit:parity-harness", to: "spec:risk:parity-divergence" },
  { id: "rel:mit-helper", type: "spec:Mitigates", from: "spec:mit:helper-amendment", to: "spec:risk:helper-creep" },
  { id: "rel:mit-cache", type: "spec:Mitigates", from: "spec:mit:cache-compiled", to: "spec:risk:perf-regression" },

  // ADR resolves the blocking open question
  { id: "rel:adr-resolves-fieldval", type: "spec:Resolves", from: adr.id, to: "spec:q:fieldval-scope" },

  // Migration step dependencies
  { id: "rel:mig-2-deps-1", type: "spec:DependsOn", from: "spec:mig:2", to: "spec:mig:1" },
  { id: "rel:mig-3-deps-1", type: "spec:DependsOn", from: "spec:mig:3", to: "spec:mig:1" },
  { id: "rel:mig-4-deps-3", type: "spec:DependsOn", from: "spec:mig:4", to: "spec:mig:3" },
  { id: "rel:mig-5-deps-4", type: "spec:DependsOn", from: "spec:mig:5", to: "spec:mig:4" },

  // Acceptance criteria verify requirements
  { id: "rel:ac1-verifies-r1", type: "spec:Verifies", from: "spec:ac:1", to: "spec:req:r-001" },
  { id: "rel:ac2-verifies-prin1", type: "spec:Verifies", from: "spec:ac:2", to: "spec:inv:exception-barrier" },
  { id: "rel:ac3-verifies-r4", type: "spec:Verifies", from: "spec:ac:3", to: "spec:req:r-004" },
  { id: "rel:ac4-verifies-r3", type: "spec:Verifies", from: "spec:ac:4", to: "spec:req:r-003" },

  // Conformance items verify invariants
  { id: "rel:conf1-verifies-r2", type: "spec:Verifies", from: "spec:conf:1", to: "spec:req:r-002" },
  { id: "rel:conf2-verifies-r3", type: "spec:Verifies", from: "spec:conf:2", to: "spec:req:r-003" },

  // Citations: ADR cites the CEL spec, the existing pipeline, both plugins
  { id: "rel:adr-cites-cel-spec", type: "spec:Cites", from: adr.id, to: "spec:ref:cel-spec" },
  { id: "rel:adr-cites-cel-js", type: "spec:Cites", from: adr.id, to: "spec:ref:cel-js" },
  { id: "rel:adr-cites-pipeline", type: "spec:Cites", from: adr.id, to: "spec:ref:pipeline" },
  { id: "rel:adr-cites-fs", type: "spec:Cites", from: adr.id, to: "spec:ref:fs-validators" },
  { id: "rel:adr-cites-sw", type: "spec:Cites", from: adr.id, to: "spec:ref:sw-rules" },
  { id: "rel:doc-cites-claude", type: "spec:Cites", from: documentSpec.id, to: "spec:ref:claude-md" },

  // Required reads on the document
  { id: "rel:doc-req-claude", type: "spec:RequiredRead", from: documentSpec.id, to: "spec:ref:claude-md" },
  { id: "rel:doc-req-pipeline", type: "spec:RequiredRead", from: documentSpec.id, to: "spec:ref:pipeline" },

  // Document was introduced in revision 0.1.0, updated in 0.2.0 (status flip + landed implementation),
  // and 0.3.0 (helper-set v1.1.0 graph.exists / graph.target_exists additions).
  { id: "rel:doc-revised-0-1-0", type: "spec:RevisedIn", from: documentSpec.id, to: "spec:rev:0-1-0" },
  { id: "rel:doc-revised-0-2-0", type: "spec:RevisedIn", from: documentSpec.id, to: "spec:rev:0-2-0" },
  { id: "rel:doc-revised-0-3-0", type: "spec:RevisedIn", from: documentSpec.id, to: "spec:rev:0-3-0" },
];

// ── Commit ─────────────────────────────────────────────────────────────────

async function main() {
  const host = await openHost();

  const result = await defineProject(host, {
    id: PROJECT_ID,
    name: "SPEC — CEL Runtime Validator for FDPM Plugin Predicates",
    profile: PROFILE_ID,
    description:
      "SPEC for adopting CEL (Common Expression Language) as the canonical predicate language for FDPM ValidationRuleDef.expression and TypeConstraint.expression. Authored as a typed graph using the fdpm.spec-authoring profile.",
  })
    .primitives([
      documentSpec,
      ...termSpecs,
      ...stakeholderSpecs,
      ...qaSpecs,
      ...principleSpecs,
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
    `  npx tsx fdpm-cli/src/bin/fdpm.ts render ${PROJECT_ID} --renderer-id spec:SpecMarkdownRenderer --target text/markdown --out docs/specs/SPEC-CEL-VALIDATOR.md`,
  );
}

main().catch((e) => {
  console.error("FAILED:", e);
  if (e && typeof e === "object" && "findings" in e) {
    console.error("Findings:", JSON.stringify((e as { findings: unknown }).findings, null, 2));
  }
  process.exit(1);
});
