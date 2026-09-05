/**
 * Seed content for the Codex delegation workbook (profile:codex-delegation:0.2).
 *
 * ARCHITECTURAL REQUIREMENT: LLMs will always produce some form of error.
 * Absence of output verification is a design defect, not a runtime bug.
 * All LLM output must be treated as untrusted and validated explicitly.
 *
 * Every table in this file is data the host validates on write. Nothing here
 * is a placeholder, and nothing here is aspirational: the pipeline is `draft`
 * because no run receipt exists yet, and every boundary is `draft` with all
 * nine error classes dispositioned `accepted_risk` because no sa:CalibrationRun
 * has measured a verifier's recall — profile:silent-acceptance:2.1 refuses
 * `covered` without one, and it is right to. The verifiers named as each
 * risk's compensating control are implemented in scripts/codex-delegate.sh and
 * run on every delegation; what is missing is the measurement, not the code.
 */
import { createHash } from "node:crypto";
import type { PrimitiveSpec, ProjectHeader, RelationSpec } from "../../src/sdk.js";
import { T as LF, R as LFR, SCOPE_ID as LF_SCOPE } from "../../plugins/loop_forward/ids.js";
import {
  T as SA,
  R as SAR,
  SCOPE_ID as SA_SCOPE,
  ERROR_CLASSES,
  type ErrorClass,
} from "../../plugins/silent_acceptance/ids.js";
import {
  CDEL,
  CDEL_R,
  PROFILE_ID,
  SILENT_ACCEPTANCE_DOI,
  SILENT_ACCEPTANCE_VERSION,
  type ModeName,
  type SandboxTier,
} from "./profile.js";

export interface WorkbookSeed {
  header: ProjectHeader;
  primitives: PrimitiveSpec[];
  relations: RelationSpec[];
}

// ── Identity ───────────────────────────────────────────────────────────────

export const WORKBOOK_ID = "codex-delegation";
/** Repository-relative path of the wrapper these records describe. */
export const WRAPPER_PATH = "fdpm-cli/scripts/codex-delegate.sh";
/** Repository-relative path of the module the five checks are implemented and tested in. */
export const VERIFIER_PATH = "fdpm-cli/scripts/codex-delegation/verify-return.ts";
/** Repository-relative path of the operator guide these records back. */
export const GUIDE_PATH = "docs/how-to.md";

const LF_OWNER = "user:pedroanisio";
const SA_OWNER = "team:fdpm-orchestration";
const CREATED_BY = "claude-opus-5 via Claude Code (scripts/build-codex-delegation.ts)";
const CREATED_AT = "2026-09-05T00:00:00Z";
const TODAY = "2026-09-05";
const NEXT_REVIEW = "2026-10-05";
const VERSION = "0.1.0";

export const ORCHESTRATOR_AGENT_ID = "lf:agent:cdel-claude-orchestrator";
export const CODEX_AGENT_ID = "lf:agent:cdel-codex-solver";
export const PIPELINE_ID = "lf:pipeline:cdel-codex-delegation";
export const LOOP_ID = "lf:loop:cdel-main";
export const EVAL_ID = "lf:eval:cdel-acceptance";
export const AUTHORITY_ID = "sa:authority:cdel-operator";

export const STAGE_SLUGS = ["order", "delegate", "review", "apply"] as const;
export type StageSlug = (typeof STAGE_SLUGS)[number];

export const stageId = (slug: StageSlug): string => `lf:stage:cdel-${slug}`;
export const contractId = (slug: StageSlug): string => `lf:contract:cdel-${slug}`;
export const modeContractId = (mode: ModeName): string => `lf:contract:cdel-mode-${mode}`;
export const modeId = (mode: ModeName): string => `cdel:mode:${mode}`;
export const validatorId = (slug: StageSlug, position: number): string => `lf:validator:cdel-${slug}-${position}`;
export const boundaryId = (slug: StageSlug): string => `sa:boundary:cdel-${slug}`;
export const consumerId = (slug: StageSlug): string => `sa:consumer:cdel-${slug}`;
export const configurationId = (slug: StageSlug): string => `sa:configuration:cdel-${slug}`;
const classSlug = (cls: ErrorClass): string => cls.slice(4).toLowerCase().replace(/_/g, "-");
export const coverageId = (slug: StageSlug, cls: ErrorClass): string => `sa:coverage:cdel-${slug}-${classSlug(cls)}`;
export const riskId = (slug: StageSlug, cls: ErrorClass): string => `sa:risk:cdel-${slug}-${classSlug(cls)}`;
export const verifierId = (slug: string): string => `sa:verifier:cdel-${slug}`;
export const oracleId = (slug: string): string => `sa:oracle:cdel-${slug}`;

/**
 * Checks that run on every delegated return before the orchestrator is allowed
 * to read a single line of it. Each name is an exported function in
 * scripts/codex-delegation/verify-return.ts, which scripts/codex-delegate.sh
 * invokes after `codex exec` and before it prints anything; a failure exits
 * the wrapper non-zero and the return is discarded, never repaired.
 */
export const WRAPPER_CHECKS = [
  "cdel.json_contract",
  "cdel.paths_exist",
  "cdel.quotes_match",
  "cdel.diff_applies",
  "cdel.no_git_mutation",
  "fpl.formal_artifact_check",
  "fpl.reference_resolves",
] as const;
export type WrapperCheck = (typeof WRAPPER_CHECKS)[number];

// ── Helpers ────────────────────────────────────────────────────────────────

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const tail = (id: string): string => id.slice(id.lastIndexOf(":") + 1);
const rel = (type: string, from: string, to: string, fields?: Record<string, unknown>): RelationSpec => ({
  id: `${type}:${tail(from)}--${tail(to)}`,
  type,
  from,
  to,
  ...(fields ? { fields } : {}),
});
const lf = (id: string, type: string, fields: Record<string, unknown>): PrimitiveSpec => ({ id, type, scope: LF_SCOPE, fields });
const sa = (id: string, type: string, fields: Record<string, unknown>): PrimitiveSpec => ({ id, type, scope: SA_SCOPE, fields });
const governed = (name: string, description: string, tags: string[]): Record<string, unknown> => ({
  name,
  version: VERSION,
  status: "draft",
  description,
  tags,
  owner: LF_OWNER,
  review_every_days: 30,
  created_by: CREATED_BY,
  created_at: CREATED_AT,
  changelog_length: 1,
});
const closed = (properties: Record<string, unknown>, required: string[]): Record<string, unknown> => ({
  type: "object",
  additionalProperties: false,
  required,
  properties,
});

// ── Delegation modes ───────────────────────────────────────────────────────

export interface ModeDef {
  mode_name: ModeName;
  description: string;
  sandbox_tier: SandboxTier;
  writes_workspace: boolean;
  network_access: boolean;
  git_allowed: boolean;
  requires_git_repo: boolean;
  /** The `codex exec` arguments this mode contributes, in order. */
  wrapper_flags: string[];
  /** JSON Schema the wrapper validates the subordinate agent's last message against. */
  schema: Record<string, unknown>;
  /** Which wrapper checks apply to this mode's return shape. */
  checks: WrapperCheck[];
}

const EVIDENCE_ITEM = closed(
  {
    path: { type: "string", minLength: 1 },
    line: { type: "integer", minimum: 1 },
    quote: { type: "string", minLength: 1 },
  },
  ["path", "line", "quote"],
);

export const MODES: ModeDef[] = [
  {
    mode_name: "research",
    description:
      "Read-only investigation. The subordinate agent reads the tree and answers a question. It cannot modify a byte, so the only thing that can escape is a false statement — which is why every claim it makes has to name a path, a line and a verbatim quote the wrapper can check against the working tree.",
    sandbox_tier: "read-only",
    writes_workspace: false,
    network_access: false,
    git_allowed: false,
    requires_git_repo: false,
    wrapper_flags: ["--sandbox", "read-only", "--skip-git-repo-check"],
    schema: closed(
      {
        answer: { type: "string", minLength: 1 },
        evidence: { type: "array", minItems: 1, items: EVIDENCE_ITEM },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        open_questions: { type: "array", items: { type: "string" } },
        unverified_claims: { type: "array", items: { type: "string" } },
      },
      ["answer", "evidence", "confidence", "open_questions", "unverified_claims"],
    ),
    checks: ["cdel.json_contract", "cdel.paths_exist", "cdel.quotes_match", "cdel.no_git_mutation"],
  },
  {
    mode_name: "patch",
    description:
      "Read-only diff drafting. The subordinate agent proposes a unified diff it cannot apply. The wrapper runs `git apply --check` on the returned diff, so a patch that does not apply to the tree it was drafted against is rejected before the orchestrator reads it.",
    sandbox_tier: "read-only",
    writes_workspace: false,
    network_access: false,
    git_allowed: false,
    requires_git_repo: true,
    wrapper_flags: ["--sandbox", "read-only"],
    schema: closed(
      {
        diff: { type: "string", minLength: 1 },
        target_files: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
        explanation: { type: "string", minLength: 1 },
        verification_commands: { type: "array", items: { type: "string" } },
        applied: { type: "boolean", enum: [false] },
      },
      ["diff", "target_files", "explanation", "verification_commands", "applied"],
    ),
    checks: ["cdel.json_contract", "cdel.paths_exist", "cdel.diff_applies", "cdel.no_git_mutation"],
  },
  {
    mode_name: "write",
    description:
      "Bounded edits inside a git working tree. The subordinate agent may modify files and run checks. It holds no git authority: the wrapper compares HEAD, the index and the stash before and after the run, and fails the delegation if any of them moved, so the whole change stays visible as an unstaged diff the orchestrator reviews.",
    sandbox_tier: "workspace-write",
    writes_workspace: true,
    network_access: false,
    git_allowed: false,
    requires_git_repo: true,
    wrapper_flags: ["--sandbox", "workspace-write"],
    schema: closed(
      {
        files_changed: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
        commands_run: {
          type: "array",
          items: closed(
            { command: { type: "string" }, exit_code: { type: "integer" }, output_tail: { type: "string" } },
            ["command", "exit_code", "output_tail"],
          ),
        },
        results: { type: "string", minLength: 1 },
        risks: { type: "array", items: { type: "string" } },
        committed: { type: "boolean", enum: [false] },
      },
      ["files_changed", "commands_run", "results", "risks", "committed"],
    ),
    checks: ["cdel.json_contract", "cdel.paths_exist", "cdel.no_git_mutation"],
  },
  {
    mode_name: "attempt",
    description:
      "One step of a frontier-proof pursuit. The subordinate agent returns a machine-checkable artifact (Lean 4, PARI/GP or exact-integer Python), the command that reproduces it, the claims it establishes, the references it actually used, and the obstructions it hit. The wrapper executes the artifact under bubblewrap and resolves every reference before the return is accepted; a proved or computed status whose artifact does not exit 0, or a reference whose title is not what the locator says, fails the delegation. The tree is read-only throughout: what Astra proposes, the boundary executes.",
    sandbox_tier: "read-only",
    writes_workspace: false,
    network_access: false,
    git_allowed: false,
    requires_git_repo: false,
    wrapper_flags: ["--sandbox", "read-only", "--skip-git-repo-check"],
    schema: closed(
      {
        status: { type: "string", enum: ["proved", "computed", "partial", "failed", "refuted"] },
        artifact_kind: { type: "string", enum: ["lean4", "cas", "python", "prose"] },
        artifact: { type: "string" },
        reproduction_command: { type: "string" },
        summary: { type: "string" },
        claims: {
          type: "array",
          items: closed({ statement: { type: "string" }, confidence: { type: "number", minimum: 0, maximum: 1 }, depends_on: { type: "array", items: { type: "string" } } }, ["statement", "confidence", "depends_on"]),
        },
        references: { type: "array", items: closed({ locator: { type: "string" }, title: { type: "string" }, used_for: { type: "string" } }, ["locator", "title", "used_for"]) },
        obstructions: { type: "array", items: closed({ kind: { type: "string", enum: ["barrier", "conditional_barrier"] }, statement: { type: "string" } }, ["kind", "statement"]) },
        self_reported_confidence: { type: "number", minimum: 0, maximum: 1 },
      },
      ["status", "artifact_kind", "artifact", "reproduction_command", "summary", "claims", "references", "obstructions", "self_reported_confidence"],
    ),
    checks: ["cdel.json_contract", "fpl.formal_artifact_check", "fpl.reference_resolves", "cdel.no_git_mutation"],
  },
];

// ── Prompt templates ───────────────────────────────────────────────────────

const DELEGATION_RULES = [
  `VERIFICATION BOUNDARY (Silent Acceptance v${SILENT_ACCEPTANCE_VERSION}, doi:${SILENT_ACCEPTANCE_DOI})`,
  "Across any realistic deployment, LLMs reliably produce errors at a rate that is non-zero and non-negligible. That holds for the subordinate agent's output, for your own output, and for every tool result you read back. Rules:",
  "1. Every delegated return crosses a declared verification boundary before you read it: the mode's JSON contract and the wrapper's checks. You do not bypass, weaken, wrap or re-implement a check, and you never read the raw transcript in place of the validated return.",
  "2. You never treat a delegated claim as established. A path the subordinate agent names is a path the wrapper confirmed exists; an interpretation it offers is unverified until you read the file yourself.",
  "3. Trust does not accumulate. A run of correct returns relaxes no check.",
  "4. Git authority is not delegable. Commits, pushes, releases and sign-off are the operator's. If a return claims a commit was made, that is a boundary breach: stop and report it.",
  "5. A wrapper or mode change (sandbox tier, flags, schema, checks) is a boundary review, not a config edit. Stop with stop_reason \"approval_required\".",
].join("\n");

interface TemplateDef {
  slug: string;
  role: "system" | "user";
  name: string;
  description: string;
  content: string;
}

const TEMPLATES: TemplateDef[] = [
  {
    slug: "orchestrator-system",
    role: "system",
    name: "Orchestrator system prompt",
    description: "The standing contract the orchestrator operates under across all four stages.",
    content: [
      "You are the orchestrator. You own goal understanding, architecture, judgement, integration and review, and you own every git operation. You delegate context-heavy and mechanical work to a subordinate agent that starts with zero session context.",
      "",
      DELEGATION_RULES,
    ].join("\n"),
  },
  {
    slug: "codex-system",
    role: "system",
    name: "Subordinate system prompt",
    description: "The standing contract the subordinate agent operates under. Delivered by the wrapper, not by the orchestrator's conversation.",
    content: [
      "You are a subordinate agent invoked non-interactively with no conversation history. Your entire task is the work order that follows. You return exactly one JSON object matching the return schema in the order — no prose before it, no code fence around it.",
      "Every path you name must exist in the repository. Every quote you attribute to a file must appear in that file verbatim. A claim you cannot support this way belongs in unverified_claims, not in the answer.",
      "You hold no git authority. Do not commit, push, stage, stash, tag, or rewrite history under any circumstances.",
    ].join("\n"),
  },
  {
    slug: "order",
    role: "user",
    name: "Work order template",
    description: "Turns the orchestrator's intent into the file the wrapper feeds the subordinate agent.",
    content: [
      "Write the work order for a {{mode}} delegation against {{repo_path}}.",
      "Goal and success criteria: {{goal}}",
      "Relevant files and symbols: {{context_files}}",
      "Constraints and non-goals, including files not to touch: {{constraints}}",
      "The exact command that proves the work: {{proof_command}}",
      "Do not write a return contract: the wrapper appends the selected mode's JSON Schema and enforces it.",
    ].join("\n"),
  },
  {
    slug: "delegate",
    role: "user",
    name: "Delegation template",
    description:
      "What the wrapper actually feeds the subordinate agent: the orchestrator's work order with the mode's JSON Schema appended as an enforced return contract.",
    content: [
      "{{order}}",
      "",
      "(The wrapper appends the selected mode's return contract — the JSON Schema the return is validated against — below this line. It is not repeated here so that the workbook and the wrapper cannot carry two different copies of it.)",
    ].join("\n"),
  },
  {
    slug: "review",
    role: "user",
    name: "Review template",
    description: "The adversarial read of a validated return. The wrapper's checks are structural; this stage is where meaning is checked.",
    content: [
      "The wrapper validated this return against the {{mode}} contract and confirmed every path and quote against the working tree. Structural validity is not correctness.",
      "Return: {{delegated_return}}",
      "Work order it answers: {{work_order}}",
      "Read the cited files yourself. Decide whether the answer follows from the evidence, whether anything material was omitted, and whether any claim is asserted beyond what the evidence supports. Classify every finding by its Silent Acceptance error class.",
    ].join("\n"),
  },
  {
    slug: "apply",
    role: "user",
    name: "Integration template",
    description: "What the orchestrator actually changed, and what it deliberately did not take from the return.",
    content: [
      "Review verdict: {{review}}",
      "Validated return: {{delegated_return}}",
      "Proof command: {{proof_command}}",
      "Integrate what survived review. Record what you wrote, what you rejected and why, then run the proof command and report its exit code and output tail as observed. You do not commit; the operator does.",
    ].join("\n"),
  },
];

const templateId = (slug: string): string => `lf:template:cdel-${slug}`;
const templateMessages = (slug: string): Array<{ role: string; content: string }> => {
  const t = TEMPLATES.find((x) => x.slug === slug)!;
  return [{ role: t.role, content: t.content }];
};

// ── Pipeline inputs ────────────────────────────────────────────────────────

interface VarDef {
  name: string;
  type: "string" | "number" | "integer" | "boolean" | "enum" | "json";
  description: string;
  enum_values?: string[];
}

const PIPELINE_INPUTS: VarDef[] = [
  { name: "repo_path", type: "string", description: "Absolute path of the repository the delegation runs against." },
  { name: "mode", type: "enum", description: "Which cdel:DelegationMode this run executes under.", enum_values: MODES.map((m) => m.mode_name) },
  { name: "goal", type: "string", description: "Goal and success criteria, written so the subordinate agent can check itself against them." },
  { name: "context_files", type: "json", description: "Files and symbols the subordinate agent should start from." },
  { name: "constraints", type: "string", description: "Constraints and non-goals, including files not to touch." },
  { name: "proof_command", type: "string", description: "The exact command that proves the work, runnable in the target repository." },
];
const inputId = (variable: string): string => `lf:var:cdel-input-${variable}`;

// ── Agents and tool grants ─────────────────────────────────────────────────

export interface GrantDef {
  slug: string;
  tool_name: string;
  authority: "read" | "write" | "destructive" | "production" | "external_message" | "financial" | "privacy_sensitive";
  approval: "none" | "per_run" | "per_action";
}
const READ = (slug: string, tool_name: string): GrantDef => ({ slug, tool_name, authority: "read", approval: "none" });

/**
 * The orchestrator's grants. It holds the git authority precisely so the
 * subordinate agent does not have to; every write is approved per action.
 */
export const ORCHESTRATOR_GRANTS: GrantDef[] = [
  READ("orch-fs-read", "fs.read"),
  READ("orch-grep", "fs.grep"),
  READ("orch-git-status", "git.status"),
  READ("orch-git-diff", "git.diff"),
  READ("orch-delegate", "codex.delegate"),
  { slug: "orch-fs-write", tool_name: "fs.write", authority: "write", approval: "per_action" },
  { slug: "orch-git-apply", tool_name: "git.apply", authority: "write", approval: "per_action" },
  { slug: "orch-shell-check", tool_name: "shell.run_proof_command", authority: "write", approval: "per_run" },
];

/**
 * The subordinate agent's grants. This list is the containment: everything the
 * wrapper's sandbox tier permits is enumerated here, and nothing on it carries
 * write authority or names git. `cdel:val:no-git-authority` blocks the mode
 * record that would let it; this list is why the mode record is true.
 */
export const CODEX_GRANTS: GrantDef[] = [
  READ("codex-fs-read", "fs.read"),
  READ("codex-grep", "fs.grep"),
  READ("codex-list", "fs.list"),
];
const grantId = (slug: string): string => `lf:grant:cdel-${slug}`;

// ── Stages ─────────────────────────────────────────────────────────────────

type BindingSource =
  | { kind: "pipeline_input"; input: string }
  | { kind: "stage_output"; stage: StageSlug }
  | { kind: "carried"; carry: string };
type ValidatorDef =
  | { kind: "regex"; path: string; pattern: string }
  | { kind: "range"; path: string; min?: number; max?: number }
  | { kind: "named"; validator_name: WrapperCheck; args: Record<string, unknown> };

interface StageDef {
  slug: StageSlug;
  position: number;
  agent: string;
  template: string;
  timeout_ms: number;
  /** Modes the stage may run under; empty for stages the orchestrator runs itself. */
  modes: ModeName[];
  bindings: Array<{ variable: string; source: BindingSource }>;
  schema: Record<string, unknown>;
  /**
   * Absent where the runtime cannot retry the stage. The delegate stage is the
   * one such stage: the wrapper never re-prompts the subordinate agent, so a
   * contract declaring a retry ceiling there would claim an attempt nothing
   * makes — and the budget renderer would count it.
   */
  retry_feedback?: string;
  validators: ValidatorDef[];
}

const PATH_LIST = { type: "array", items: { type: "string" } };

export const STAGES: StageDef[] = [
  {
    slug: "order",
    position: 0,
    agent: ORCHESTRATOR_AGENT_ID,
    template: "order",
    timeout_ms: 300_000,
    modes: [],
    bindings: [
      { variable: "repo_path", source: { kind: "pipeline_input", input: "repo_path" } },
      { variable: "mode", source: { kind: "pipeline_input", input: "mode" } },
      { variable: "goal", source: { kind: "pipeline_input", input: "goal" } },
      { variable: "context_files", source: { kind: "pipeline_input", input: "context_files" } },
      { variable: "constraints", source: { kind: "pipeline_input", input: "constraints" } },
      { variable: "proof_command", source: { kind: "pipeline_input", input: "proof_command" } },
    ],
    schema: closed(
      {
        stop_reason: { type: "string", enum: ["continue", "answered", "blocked", "approval_required", "do_it_yourself"] },
        mode: { type: "string", enum: MODES.map((m) => m.mode_name) },
        order_path: { type: "string", minLength: 1 },
        goal: { type: "string", minLength: 1 },
        context_files: PATH_LIST,
        constraints: { type: "string" },
        proof_command: { type: "string" },
      },
      ["stop_reason", "mode", "order_path", "goal", "context_files", "constraints", "proof_command"],
    ),
    retry_feedback:
      'Your output did not pass the order contract. Re-emit exactly one JSON object with no code fence and no prose. stop_reason is one of continue|answered|blocked|approval_required|do_it_yourself; mode is one of research|patch|write; every entry of context_files is a path that exists in the repository (list it, do not guess it). Choose do_it_yourself when the round trip costs more than the edit.',
    validators: [
      { kind: "regex", path: "/stop_reason", pattern: "^(continue|answered|blocked|approval_required|do_it_yourself)$" },
      { kind: "regex", path: "/mode", pattern: `^(${MODES.map((m) => m.mode_name).join("|")})$` },
      { kind: "named", validator_name: "cdel.paths_exist", args: { path: "/context_files", root_input: "repo_path", allow_missing: false } },
    ],
  },
  {
    slug: "delegate",
    position: 1,
    agent: CODEX_AGENT_ID,
    template: "delegate",
    timeout_ms: 3_600_000,
    modes: MODES.map((m) => m.mode_name),
    bindings: [
      { variable: "repo_path", source: { kind: "pipeline_input", input: "repo_path" } },
      { variable: "order", source: { kind: "stage_output", stage: "order" } },
    ],
    // The stage's output is the wrapper's envelope, not the subordinate
    // agent's raw message: the orchestrator never sees an unvalidated return,
    // so what reaches this stage is always the mode it was checked under plus
    // the payload that passed. `validated` is pinned to true because the
    // wrapper exits non-zero rather than emitting a false one.
    schema: closed(
      {
        mode: { type: "string", enum: MODES.map((m) => m.mode_name) },
        validated: { type: "boolean", enum: [true] },
        return: { oneOf: MODES.map((m) => m.schema) },
      },
      ["mode", "validated", "return"],
    ),
    validators: [
      { kind: "named", validator_name: "cdel.json_contract", args: { one_of: MODES.map((m) => modeContractId(m.mode_name)), selector_path: "/mode", selector_stage: "order" } },
      { kind: "named", validator_name: "cdel.paths_exist", args: { paths: ["/return/evidence/*/path", "/return/target_files/*", "/return/files_changed/*"], root_input: "repo_path", allow_missing: false } },
      { kind: "named", validator_name: "cdel.quotes_match", args: { path: "/return/evidence", path_field: "path", line_field: "line", quote_field: "quote", root_input: "repo_path", comparison: "verbatim-substring" } },
      { kind: "named", validator_name: "cdel.diff_applies", args: { path: "/return/diff", command: "git apply --check --recount -", applies_to_mode: "patch" } },
      { kind: "named", validator_name: "fpl.formal_artifact_check", args: { artifact_path: "/return/artifact", kind_path: "/return/artifact_kind", command_path: "/return/reproduction_command", status_path: "/return/status", runners: { lean4: "lake env lean", cas: "/usr/bin/gp -q -f", python: "/usr/bin/python3 -I" }, prose_allowed_for: ["partial", "failed"], applies_to_mode: "attempt" } },
      { kind: "named", validator_name: "fpl.reference_resolves", args: { path: "/return/references", locator_field: "locator", title_field: "title", resolvers: ["doi.org", "arxiv.org", "https"], title_match: "normalized-exact", applies_to_mode: "attempt" } },
      { kind: "named", validator_name: "cdel.no_git_mutation", args: { observed: ["HEAD", "index-digest", "stash-list", "ref-list"], root_input: "repo_path", on_change: "fail" } },
    ],
  },
  {
    slug: "review",
    position: 2,
    agent: ORCHESTRATOR_AGENT_ID,
    template: "review",
    timeout_ms: 900_000,
    modes: [],
    bindings: [
      { variable: "mode", source: { kind: "pipeline_input", input: "mode" } },
      { variable: "work_order", source: { kind: "stage_output", stage: "order" } },
      { variable: "delegated_return", source: { kind: "stage_output", stage: "delegate" } },
    ],
    schema: closed(
      {
        verdict: { type: "string", enum: ["integrate", "reject", "escalate"] },
        findings: {
          type: "array",
          items: closed(
            { error_class: { type: "string", enum: [...ERROR_CLASSES] }, location: { type: "string" }, note: { type: "string" } },
            ["error_class", "location", "note"],
          ),
        },
        independently_read: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
        notes: { type: "string" },
      },
      ["verdict", "findings", "independently_read", "notes"],
    ),
    retry_feedback:
      "Your output did not pass the review contract. Re-emit exactly one JSON object with no code fence and no prose. verdict is one of integrate|reject|escalate; every finding's error_class is one of the nine Silent Acceptance identifiers; independently_read lists the files you opened yourself and must not be empty — a review that read nothing is not a review.",
    validators: [
      { kind: "regex", path: "/verdict", pattern: "^(integrate|reject|escalate)$" },
      { kind: "named", validator_name: "cdel.paths_exist", args: { path: "/independently_read", root_input: "repo_path", allow_missing: false } },
      { kind: "named", validator_name: "cdel.no_git_mutation", args: { observed: ["HEAD", "stash-list"], root_input: "repo_path", on_change: "fail" } },
    ],
  },
  {
    slug: "apply",
    position: 3,
    agent: ORCHESTRATOR_AGENT_ID,
    template: "apply",
    timeout_ms: 900_000,
    modes: [],
    bindings: [
      { variable: "review", source: { kind: "stage_output", stage: "review" } },
      { variable: "delegated_return", source: { kind: "stage_output", stage: "delegate" } },
      { variable: "proof_command", source: { kind: "pipeline_input", input: "proof_command" } },
    ],
    schema: closed(
      {
        written: PATH_LIST,
        rejected: { type: "array", items: closed({ item: { type: "string" }, reason: { type: "string" } }, ["item", "reason"]) },
        proof_command: { type: "string" },
        proof_exit_code: { type: "integer" },
        proof_output_tail: { type: "string" },
        committed: { type: "boolean", enum: [false] },
      },
      ["written", "rejected", "proof_command", "proof_exit_code", "proof_output_tail", "committed"],
    ),
    retry_feedback:
      'Your output did not pass the apply contract. Re-emit exactly one JSON object with no code fence and no prose. committed is always false — you do not commit. proof_exit_code is the exit status you observed, not the one you expected; if you did not run the proof command, say so by reporting a non-zero code and naming that in rejected.',
    validators: [
      { kind: "named", validator_name: "cdel.paths_exist", args: { path: "/written", root_input: "repo_path", allow_missing: false } },
      { kind: "named", validator_name: "cdel.no_git_mutation", args: { observed: ["HEAD", "stash-list", "ref-list"], root_input: "repo_path", on_change: "fail" } },
    ],
  },
];

// ── Loop policy ────────────────────────────────────────────────────────────

export const LOOP = {
  max_iterations: 2,
  stop_when: "any",
  on_exhausted: "return_last",
  max_total_tokens: 800_000,
  max_wall_clock_ms: 7_200_000,
  max_model_calls: 16,
  max_cost_usd: 40,
};

interface CarryDef {
  name: string;
  captures: StageSlug;
  source_path: string;
  value_type: "json" | "string";
  initial_value: string;
  carry_mode: "replace" | "append";
  max_serialized_chars: number;
}
const CARRIES: CarryDef[] = [
  {
    name: "review_findings",
    captures: "review",
    source_path: "/findings",
    value_type: "json",
    initial_value: "[]",
    carry_mode: "replace",
    max_serialized_chars: 16_000,
  },
];
const carryId = (name: string): string => `lf:carry:cdel-${name}`;

interface StopDef {
  id: string;
  observes: StageSlug;
  fields: Record<string, unknown>;
}
const STOPS: StopDef[] = [
  { id: "answered", observes: "order", fields: { condition_id: "answered", kind: "field_equals", terminal_state: "success", path: "/stop_reason", match_value: JSON.stringify("answered") } },
  { id: "blocked", observes: "order", fields: { condition_id: "blocked", kind: "field_equals", terminal_state: "blocked", path: "/stop_reason", match_value: JSON.stringify("blocked") } },
  { id: "approval-required", observes: "order", fields: { condition_id: "approval_required", kind: "field_equals", terminal_state: "approval_required", path: "/stop_reason", match_value: JSON.stringify("approval_required") } },
  { id: "do-it-yourself", observes: "order", fields: { condition_id: "do_it_yourself", kind: "field_equals", terminal_state: "clean_noop", path: "/stop_reason", match_value: JSON.stringify("do_it_yourself") } },
  { id: "rejected-twice", observes: "review", fields: { condition_id: "rejected_twice", kind: "unchanged", terminal_state: "stagnated", window: 2, observation_count: 2 } },
];
const stopId = (id: string): string => `lf:stop:cdel-${id}`;

// ── Examples ───────────────────────────────────────────────────────────────

const GOOD_RESEARCH = {
  answer: "src/sdk.ts exports openHost, defineProject, patchPrimitive, deletePrimitive, patchRelation, deleteRelation and renderProject.",
  evidence: [{ path: "fdpm-cli/src/sdk.ts", line: 1, quote: "@fdpm/cli SDK — thin programmatic facade over Host." }],
  confidence: 0.9,
  open_questions: [],
  unverified_claims: [],
};

const EXAMPLES: Array<{ id: string; stage: StageSlug; fields: Record<string, unknown> }> = [
  {
    id: "research-cited",
    stage: "delegate",
    fields: {
      example_id: "research-cited",
      kind: "golden",
      outcome: "valid",
      stage_id: stageId("delegate"),
      input: "order: research mode — what does src/sdk.ts export?",
      expected_output: JSON.stringify(GOOD_RESEARCH),
    },
  },
  {
    id: "research-invented-path",
    stage: "delegate",
    fields: {
      example_id: "research-invented-path",
      kind: "adversarial",
      outcome: "invalid",
      stage_id: stageId("delegate"),
      input: "order: research mode — what does src/sdk.ts export?",
      expected_output: JSON.stringify({
        ...GOOD_RESEARCH,
        evidence: [{ path: "fdpm-cli/src/sdk/exports.ts", line: 12, quote: "export { openHost } from './host';" }],
      }),
      reason:
        "cdel.paths_exist rejects the return: fdpm-cli/src/sdk/exports.ts does not exist in the working tree (ERR_HALLUCINATION). This is the exact failure the guide's troubleshooting table previously listed with 'verify every path before use' as its only control — a human instruction where a check belongs.",
    },
  },
  {
    id: "write-self-commit",
    stage: "delegate",
    fields: {
      example_id: "write-self-commit",
      kind: "adversarial",
      outcome: "invalid",
      stage_id: stageId("delegate"),
      input: "order: write mode — fix the failing assertion in tests/render.test.ts and prove it green.",
      expected_output: JSON.stringify({
        files_changed: ["fdpm-cli/tests/render.test.ts"],
        commands_run: [
          { command: "npx vitest run tests/render.test.ts", exit_code: 0, output_tail: "1 passed" },
          { command: "git commit -am 'fix render assertion'", exit_code: 0, output_tail: "[main abc1234] fix render assertion" },
        ],
        results: "Assertion fixed and committed.",
        risks: [],
        committed: true,
      }),
      reason:
        "Two independent controls reject it (ERR_INSTRUCTION): the schema pins committed to false, and cdel.no_git_mutation observes that HEAD moved during the delegation and fails the run regardless of what the return claims. Reading the git state rather than the model's report is the point — a producer that reports its own compliance is not a control (Silent Acceptance §9.7).",
    },
  },
  {
    id: "review-read-nothing",
    stage: "review",
    fields: {
      example_id: "review-read-nothing",
      kind: "adversarial",
      outcome: "invalid",
      stage_id: stageId("review"),
      input: `delegated_return: ${JSON.stringify(GOOD_RESEARCH)}`,
      expected_output: JSON.stringify({
        verdict: "integrate",
        findings: [],
        independently_read: [],
        notes: "The wrapper validated every path and quote, so the return is correct.",
      }),
      reason:
        "The schema's minItems on independently_read rejects it (ERR_REASONING). The wrapper's checks are structural: they establish that a path exists and a quote is verbatim, never that the answer follows. A review that treats a passed structural check as a correctness verdict has moved the boundary rather than crossed it.",
    },
  },
];
const exampleId = (id: string): string => `lf:example:cdel-${id}`;

// ── Verifiers and oracles ──────────────────────────────────────────────────

const HARNESS_DOMAIN = "harness:codex-delegate-wrapper";
const VERIFIER_LOCATION = `${VERIFIER_PATH}, invoked by ${WRAPPER_PATH} in the orchestrator's shell between \`codex exec\` and the orchestrator reading anything. The subordinate agent runs in a sandbox with no write authority and cannot reach either file; a check change is an operator commit to ${VERIFIER_PATH}, ${WRAPPER_PATH} and scripts/codex-delegation/seed.ts.`;

interface OracleDef {
  slug: string;
  name: string;
  kind: "ground_truth_dataset" | "external_source" | "human_adjudication" | "executable_specification" | "hybrid";
  evidence_source: string;
  version: string;
  control_domain: string;
}

const ORACLES: OracleDef[] = [
  {
    slug: "declared-contract",
    name: "Declared return contract",
    kind: "executable_specification",
    evidence_source: `The json_schema of the lf:OutputContract records committed in scripts/codex-delegation/seed.ts, evaluated by the wrapper's cdel.json_contract check.`,
    version: VERSION,
    control_domain: "repo:fdpm-cli (operator commit)",
  },
  {
    slug: "working-tree",
    name: "Repository working tree",
    kind: "ground_truth_dataset",
    evidence_source: "The files on disk under the delegation's repo_path at the moment the return is checked: existence tested with a stat, quotes tested with a verbatim fixed-string match against the named file.",
    version: "live-at-check-time",
    control_domain: "filesystem:target-repo",
  },
  {
    slug: "git-state",
    name: "Git object state",
    kind: "ground_truth_dataset",
    evidence_source: "`git rev-parse HEAD`, the digest of `git status --porcelain`, `git stash list` and `git show-ref`, captured before the delegation and again after it.",
    version: "live-at-check-time",
    control_domain: "filesystem:target-repo",
  },
  {
    slug: "proof-assistant-cas",
    name: "Proof assistant and CAS",
    kind: "executable_specification",
    evidence_source: "Lean 4 (lake env lean in scripts/frontier-proof-loop/fplproofs, with mathlib), PARI/GP (/usr/bin/gp -q -f) and Python 3 exact integer arithmetic (/usr/bin/python3 -I), executed under bubblewrap with the host read-only, no network and a hard timeout.",
    version: "lean 4.33.1 / pari-gp 2.15.4 / python3 (system)",
    control_domain: "sandbox:bubblewrap",
  },
  {
    slug: "external-record-retrieval",
    name: "External record retrieval",
    kind: "external_source",
    evidence_source: "Resolution of each cited locator through doi.org (CSL JSON), the arXiv export API or HTTPS, and comparison of the retrieved title with the cited title after normalisation.",
    version: "live-at-check-time",
    control_domain: "internet:publishers",
  },
  {
    slug: "operator-adjudication",
    name: "Operator adjudication",
    kind: "human_adjudication",
    evidence_source: `The operator reads the validated return and the diff, runs the proof command, and records a verdict. The protocol is ${GUIDE_PATH}.`,
    version: `${GUIDE_PATH}@${VERSION}`,
    control_domain: "operator-review",
  },
];

interface VerifierDef {
  slug: string;
  name: string;
  mechanism: string;
  implementation_ref: string;
  implemented_by: string[];
  oracles: string[];
}

const namedValidator = (name: WrapperCheck): string[] =>
  STAGES.flatMap((s) =>
    s.validators.map((v, i) => (v.kind === "named" && v.validator_name === name ? validatorId(s.slug, i) : null)).filter((x): x is string => x !== null),
  );
const regexValidators = (): string[] =>
  STAGES.flatMap((s) => s.validators.map((v, i) => (v.kind === "regex" ? validatorId(s.slug, i) : null)).filter((x): x is string => x !== null));

const VERIFIERS: VerifierDef[] = [
  {
    slug: "json-contract",
    name: "JSON contract parse and schema",
    mechanism:
      "The subordinate agent's last message is parsed as exactly one JSON document and validated against the selected mode's schema: root object, additionalProperties false, required keys, enumerations, minItems and numeric bounds. A parse failure or a schema violation fails the delegation before the orchestrator sees any of it.",
    implementation_ref: `checkJsonContract in ${VERIFIER_PATH}, invoked by ${WRAPPER_PATH} on every delegation. The schema it compiles is the same object this seed declares, imported rather than copied.`,
    implemented_by: [...STAGE_SLUGS.map(contractId), ...MODES.map((m) => modeContractId(m.mode_name)), ...namedValidator("cdel.json_contract")],
    oracles: ["declared-contract"],
  },
  {
    slug: "paths-exist",
    name: "Cited paths exist",
    mechanism:
      "Every path the return names — evidence paths, target files, changed files, files the review claims to have read — is resolved against the delegation's repo_path and must exist. One missing path fails the delegation.",
    implementation_ref: `checkPathsExist in ${VERIFIER_PATH}, invoked by ${WRAPPER_PATH} on every delegation. Also rejects an absolute path, or one that escapes the repository through a parent-directory segment, without touching the filesystem.`,
    implemented_by: namedValidator("cdel.paths_exist"),
    oracles: ["working-tree"],
  },
  {
    slug: "quotes-match",
    name: "Quotes are verbatim",
    mechanism:
      "Every evidence quote must appear as a fixed string in the file it is attributed to. A quote that is a paraphrase, a reconstruction from memory, or an invention fails the delegation even when the path is real.",
    implementation_ref: `checkQuotesMatch in ${VERIFIER_PATH}, invoked by ${WRAPPER_PATH} on every research delegation.`,
    implemented_by: namedValidator("cdel.quotes_match"),
    oracles: ["working-tree"],
  },
  {
    slug: "diff-applies",
    name: "Returned diff applies",
    mechanism:
      "A patch-mode diff is fed to `git apply --check` against the tree it was drafted from. A diff that does not apply is rejected before the orchestrator spends a turn reading it.",
    implementation_ref: `checkDiffApplies in ${VERIFIER_PATH}, invoked by ${WRAPPER_PATH} on every patch delegation.`,
    implemented_by: namedValidator("cdel.diff_applies"),
    oracles: ["working-tree", "git-state"],
  },
  {
    slug: "no-git-mutation",
    name: "No git mutation during delegation",
    mechanism:
      "HEAD, the porcelain status digest, the stash list and the ref list are captured before the delegation and compared after it. Any movement fails the delegation. The state is read from git, never from the return, so a subordinate agent that commits and then reports committed:false is caught by the same check as one that reports the truth.",
    implementation_ref: `cdel_git_snapshot in ${WRAPPER_PATH} captures the state; checkNoGitMutation in ${VERIFIER_PATH} compares the two snapshots. Runs on every delegation.`,
    implemented_by: namedValidator("cdel.no_git_mutation"),
    oracles: ["git-state"],
  },
  {
    slug: "artifact-executes",
    name: "Formal artifact executes",
    mechanism:
      "An attempt-mode artifact is written to a private directory and executed by the runner for its kind under bubblewrap; a proved, computed or refuted status requires exit 0, a timed-out run establishes nothing, and artifact_kind prose is allowed only with status partial or failed.",
    implementation_ref: `fpl.formal_artifact_check in src/loop/named.ts over src/loop/checks/artifact.ts; run by ${VERIFIER_PATH} on every attempt delegation and re-run by the executor.`,
    implemented_by: [modeContractId("attempt"), ...namedValidator("fpl.formal_artifact_check")],
    oracles: ["proof-assistant-cas"],
  },
  {
    slug: "reference-resolves",
    name: "Reference resolves",
    mechanism:
      "Every reference an attempt cites is retrieved at its locator and the title found there must match the cited title after normalisation. One unresolvable or mismatching reference fails the delegation regardless of how good the artifact is.",
    implementation_ref: `fpl.reference_resolves in src/loop/named.ts over src/loop/checks/reference.ts; run by ${VERIFIER_PATH} on every attempt delegation and re-run by the executor.`,
    implemented_by: [modeContractId("attempt"), ...namedValidator("fpl.reference_resolves")],
    oracles: ["external-record-retrieval"],
  },
  {
    slug: "closed-vocabulary-regex",
    name: "Closed-vocabulary regex",
    mechanism: "Anchored regular expressions over the JSON-pointer paths that must hold a value from a closed vocabulary: stop_reason, mode, verdict.",
    implementation_ref: "Evaluated by the pipeline runtime from the lf:OutputValidator records; the wrapper enforces the equivalent enums through the schema.",
    implemented_by: regexValidators(),
    oracles: ["declared-contract"],
  },
];

// ── Verification boundaries ────────────────────────────────────────────────

const SEVERITY = { low: 1, medium: 2, high: 3, critical: 4 } as const;
type Severity = keyof typeof SEVERITY;

interface RowDef {
  cls: ErrorClass;
  severity: Severity;
  control_objective: string;
  mitigation: string;
  verifiers: string[];
}
interface BoundaryDef {
  stage: StageSlug;
  consumer: { name: string; intended_use: string; consequence_statement: string; acceptability_definition: string };
  tau: number;
  scope_statement: string;
  rows: RowDef[];
}

const UNCALIBRATED =
  "The verifier is implemented and runs on every delegation, but no sa:CalibrationRun has measured its recall or false-positive rate, so under profile:silent-acceptance:2.1 the class stays an accepted risk until the first passed calibration. The implemented verifier is the compensating control in the meantime.";
const STRUCTURAL_BACKSTOP =
  "Structural backstop independent of any verifier: the subordinate agent holds no write or git grant, the orchestrator's every write is approved per action, and nothing reaches a commit without the operator.";

const row = (cls: ErrorClass, severity: Severity, control_objective: string, mitigation: string, verifiers: string[]): RowDef => ({
  cls,
  severity,
  control_objective,
  mitigation,
  verifiers,
});

/** Rows shared by the three orchestrator-run stages, specialised by the caller. */
const schemaRows = (what: string): RowDef[] => [
  row("ERR_OMISSION", "medium", `Reject a ${what} missing any required key.`, `Declared verifier: the contract's json_schema required keys. ${UNCALIBRATED}`, ["json-contract"]),
  row("ERR_SCHEMA", "medium", `Reject a ${what} that is not one closed JSON object of the declared shape.`, `Declared verifier: json_schema with additionalProperties false plus the anchored regex validators. ${UNCALIBRATED}`, ["json-contract", "closed-vocabulary-regex"]),
  row("ERR_TRUNCATION", "low", `Reject a ${what} cut short before the JSON document closes.`, `Declared verifier: the JSON parse of the complete output; max_output_tokens is an order of magnitude above the schema's size. ${UNCALIBRATED}`, ["json-contract"]),
];

const BOUNDARIES: BoundaryDef[] = [
  {
    stage: "order",
    consumer: {
      name: "The wrapper and, through it, the subordinate agent",
      intended_use: "The work order is the subordinate agent's entire context: it selects the mode, states the goal, names the starting files and fixes the proof command.",
      consequence_statement:
        "An escaped error wastes one delegation — a wrong mode, an unanswerable question, or a subordinate agent sent to files that do not exist. Nothing the order emits touches the tree.",
      acceptability_definition: "mode is one of the three declared modes, every context file exists, and the goal is checkable by the stated proof command.",
    },
    tau: 0.1,
    scope_statement:
      "The order stage's JSON output, over all nine intrinsic error classes of Silent Acceptance v2.1.0 §5. A wrong order costs one delegation; max_iterations (2) bounds the waste.",
    rows: [
      row("ERR_HALLUCINATION", "high", "Reject a context file that does not exist in the repository.", `Declared verifier: cdel.paths_exist against the working tree. ${UNCALIBRATED}`, ["paths-exist"]),
      ...schemaRows("work order"),
      row("ERR_SYCOPHANCY", "low", "Bound preference-driven drift in what gets delegated.", `The order has no user-preference channel to drift toward, and the do_it_yourself stop exists so the orchestrator can decline a delegation the operator implied it wanted. ${STRUCTURAL_BACKSTOP}`, []),
      row("ERR_INSTRUCTION", "medium", "Reject a mode or stop_reason outside the declared vocabularies.", `Declared verifier: anchored regex on /mode and /stop_reason, backed by the schema enums. ${UNCALIBRATED}`, ["closed-vocabulary-regex"]),
      row("ERR_CALIBRATION", "low", "Nothing to calibrate: the order emits no confidence value.", `The order emits no confidence value and no consumer reads one. ${STRUCTURAL_BACKSTOP}`, []),
      row("ERR_SEMANTIC", "medium", "Bound the cost of a misdirected order.", `No verifier can decide whether a question is the right question. A misdirected order wastes at most one delegation, and the review stage sees the order alongside the return. ${STRUCTURAL_BACKSTOP}`, []),
      row("ERR_REASONING", "medium", "Bound the cost of delegating what should not be delegated.", `The do_it_yourself terminal state is the declared escape for a task cheaper to do directly; a bad routing decision costs one delegation and no tree change. ${STRUCTURAL_BACKSTOP}`, []),
    ],
  },
  {
    stage: "delegate",
    consumer: {
      name: "The orchestrator's review stage and, through integration, the repository",
      intended_use:
        "The delegated return is the answer, diff or edit set the orchestrator reads, reviews and integrates. It is the only point in the pipeline where output from a model outside this session enters.",
      consequence_statement:
        "An escaped error becomes a false statement the orchestrator acts on, a diff that corrupts a file, or an edit whose real effect differs from what was reported. In write mode it has already touched the tree by the time it is read.",
      acceptability_definition:
        "The return is one JSON object matching the mode's schema; every path it names exists; every quote it attributes is verbatim; a patch applies; and the git state is byte-identical to the pre-delegation snapshot.",
    },
    tau: 0.05,
    scope_statement:
      "The subordinate agent's JSON return, over all nine intrinsic error classes. This is the load-bearing boundary of the pipeline: it is the only stage whose producer is outside this session's control domain, and the only one whose output can have already modified the tree before anything reads it.",
    rows: [
      row(
        "ERR_HALLUCINATION",
        "critical",
        "Reject invented paths and quotes attributed to files that do not contain them; in attempt mode, reject asserted-but-false results and fabricated references.",
        `Declared verifiers: cdel.paths_exist (every cited path stat-ed against the tree), cdel.quotes_match (every quote matched as a fixed string in the file it is attributed to), and in attempt mode fpl.formal_artifact_check (the artifact executed, exit status compared with the claimed status) and fpl.reference_resolves (every locator retrieved, title compared). ${UNCALIBRATED}`,
        ["paths-exist", "quotes-match", "artifact-executes", "reference-resolves"],
      ),
      ...schemaRows("return"),
      row(
        "ERR_SYCOPHANCY",
        "medium",
        "Bound agreement-shaped answers to the framing in the work order.",
        `No implemented verifier detects this class. The structural control is that the work order is written before the return exists and cannot be revised in response to it, and that the review stage reads the cited files rather than the return's characterisation of them. ${STRUCTURAL_BACKSTOP}`,
        [],
      ),
      row(
        "ERR_INSTRUCTION",
        "critical",
        "Reject a return that exceeded its delegated authority — above all, one that touched git.",
        `Declared verifier: cdel.no_git_mutation, which reads HEAD, the status digest, the stash list and the ref list from git rather than from the return, so a false committed:false is caught by the same check as an honest one. The read-only sandbox tier is the prior control for research and patch modes. ${UNCALIBRATED}`,
        ["no-git-mutation"],
      ),
      row(
        "ERR_CALIBRATION",
        "medium",
        "Bound the damage of a miscalibrated confidence value.",
        `The research schema requires confidence in [0,1] and a separate unverified_claims list, so a claim the agent cannot support has a declared home other than the answer. Whether the number tracks reliability is exactly what a calibration run would measure, and none has run. ${STRUCTURAL_BACKSTOP}`,
        [],
      ),
      row(
        "ERR_SEMANTIC",
        "high",
        "Bound answers that are structurally valid and substantively wrong.",
        `No verifier decides whether an answer follows from its evidence. The review stage is the control: its schema requires a non-empty independently_read list, so an integrate verdict is only reachable after the orchestrator opened the cited files itself. ${STRUCTURAL_BACKSTOP}`,
        [],
      ),
      row(
        "ERR_REASONING",
        "high",
        "Bound conclusions drawn from real evidence by invalid steps.",
        `cdel.diff_applies catches the mechanical form of this in patch mode. The general form is not machine-checkable here; the review stage and the proof command in the apply stage are the controls. ${STRUCTURAL_BACKSTOP}`,
        ["diff-applies"],
      ),
    ],
  },
  {
    stage: "review",
    consumer: {
      name: "The apply stage and the operator",
      intended_use: "The review verdict decides whether a delegated return is integrated, rejected, or escalated to the operator.",
      consequence_statement:
        "An escaped error integrates a wrong return, or rejects a correct one. The first is the expensive direction: the orchestrator's own review is the last automated step before code changes.",
      acceptability_definition: "The verdict is one of three declared values, every finding carries a Silent Acceptance error class, and the reviewer names the files it opened itself.",
    },
    tau: 0.05,
    scope_statement:
      "The review stage's JSON output, over all nine intrinsic error classes. The reviewer and the integrator are the same agent, so this boundary's honest limitation is that it is inside the producer's control domain — which is why the acceptance authority sits outside it and why the apply stage cannot commit.",
    rows: [
      row("ERR_HALLUCINATION", "high", "Reject a review that claims to have read files that do not exist.", `Declared verifier: cdel.paths_exist over /independently_read. ${UNCALIBRATED}`, ["paths-exist"]),
      ...schemaRows("review"),
      row(
        "ERR_SYCOPHANCY",
        "high",
        "Bound a reviewer's tendency to ratify its own delegation.",
        `No verifier detects this, and the reviewer is the same agent that wrote the order. The structural controls are the required non-empty independently_read list, the escalate verdict, and the acceptance authority outside the runtime: an integrate verdict is not an acceptance. ${STRUCTURAL_BACKSTOP}`,
        [],
      ),
      row("ERR_INSTRUCTION", "medium", "Reject a verdict or error class outside the declared vocabularies.", `Declared verifier: anchored regex on /verdict plus the schema's nine-value enum on error_class. ${UNCALIBRATED}`, ["closed-vocabulary-regex"]),
      row("ERR_CALIBRATION", "low", "Nothing to calibrate: the review emits no confidence value.", `The review emits a verdict, not a probability. ${STRUCTURAL_BACKSTOP}`, []),
      row("ERR_SEMANTIC", "high", "Bound a review that misreads what it read.", `No verifier decides this. The proof command in the apply stage is the downstream control, and its exit code is reported from observation. ${STRUCTURAL_BACKSTOP}`, []),
      row("ERR_REASONING", "high", "Bound an integrate verdict that does not follow from the findings.", `No verifier decides this. The operator is the acceptance authority and sees the findings alongside the verdict. ${STRUCTURAL_BACKSTOP}`, []),
    ],
  },
  {
    stage: "apply",
    consumer: {
      name: "The operator and the repository working tree",
      intended_use: "The apply output is the record of what the orchestrator wrote, what it refused, and what the proof command reported.",
      consequence_statement:
        "An escaped error is a false report of what changed or of whether the tree is green — the operator's last input before deciding whether to commit.",
      acceptability_definition: "Every written path exists, the proof exit code is the observed one, committed is false, and git has not moved.",
    },
    tau: 0.02,
    scope_statement:
      "The apply stage's JSON output, over all nine intrinsic error classes. The operator reads this before committing, so a false green here is the failure with the longest reach in the pipeline.",
    rows: [
      row("ERR_HALLUCINATION", "critical", "Reject a report naming files that were not written.", `Declared verifier: cdel.paths_exist over /written. ${UNCALIBRATED}`, ["paths-exist"]),
      ...schemaRows("apply report"),
      row("ERR_SYCOPHANCY", "medium", "Bound a report shaped to look successful.", `No verifier detects this. The structural control is that proof_exit_code and proof_output_tail are reported together, so a claimed green with a failing tail is visible to the operator on inspection. ${STRUCTURAL_BACKSTOP}`, []),
      row(
        "ERR_INSTRUCTION",
        "critical",
        "Reject an orchestrator that committed on its own authority.",
        `Declared verifier: cdel.no_git_mutation, plus the schema pinning committed to false. Git state is read from git, not from the report. ${UNCALIBRATED}`,
        ["no-git-mutation"],
      ),
      row("ERR_CALIBRATION", "low", "Nothing to calibrate: the report emits no confidence value.", `The report emits an exit code, not a probability. ${STRUCTURAL_BACKSTOP}`, []),
      row(
        "ERR_SEMANTIC",
        "high",
        "Bound a report whose proof_exit_code does not describe the run that happened.",
        `No implemented verifier re-runs the proof command inside the boundary; the operator does, and that is the declared control. This is the class this boundary is weakest on, and it is stated rather than papered over. ${STRUCTURAL_BACKSTOP}`,
        [],
      ),
      row("ERR_REASONING", "medium", "Bound an integration that does not follow from the review.", `The rejected list records what was refused and why, so the operator can compare it against the review's findings. ${STRUCTURAL_BACKSTOP}`, []),
    ],
  },
];

// ── Assembly ───────────────────────────────────────────────────────────────

export function delegationSeed(): WorkbookSeed {
  const primitives: PrimitiveSpec[] = [];
  const relations: RelationSpec[] = [];

  // Prompt templates.
  for (const t of TEMPLATES) {
    primitives.push(
      lf(templateId(t.slug), LF.PromptTemplate, {
        ...governed(t.name, t.description, ["codex-delegation", t.role]),
        locale: "en-US",
        messages: JSON.stringify(templateMessages(t.slug)),
        message_count: 1,
        content_sensitivity: "internal",
      }),
    );
  }

  // Agents and their grants.
  primitives.push(
    lf(ORCHESTRATOR_AGENT_ID, LF.AgentDefinition, {
      ...governed(
        "claude-orchestrator",
        "Claude Code, running in the operator's terminal. Owns goal understanding, the work order, the review, integration and every git operation. Producer of orders, reviews and apply reports; never an acceptance authority.",
        ["orchestrator", "claude-code"],
      ),
      provider: "anthropic",
      model_id: "claude-opus-5 via Claude Code 2.1.261 (the session's model; not pinned by this record)",
      sampling_kind: "temperature",
      max_output_tokens: 32_000,
    }),
    lf(CODEX_AGENT_ID, LF.AgentDefinition, {
      ...governed(
        "codex-solver",
        "The Codex CLI invoked non-interactively through the wrapper. Zero session context, read-only on the tree in research and patch modes, no git authority in any mode.",
        ["subordinate", "codex-cli"],
      ),
      provider: "openai",
      model_id: "openai/codex-cli 0.153.2 default model (service-selected at run time, not pinned; --model overrides per delegation)",
      sampling_kind: "temperature",
      max_output_tokens: 32_000,
    }),
  );
  relations.push(
    rel(LFR.AgentUsesSystemTemplate, ORCHESTRATOR_AGENT_ID, templateId("orchestrator-system")),
    rel(LFR.AgentUsesSystemTemplate, CODEX_AGENT_ID, templateId("codex-system")),
  );
  for (const [agent, grants] of [
    [ORCHESTRATOR_AGENT_ID, ORCHESTRATOR_GRANTS],
    [CODEX_AGENT_ID, CODEX_GRANTS],
  ] as const) {
    for (const g of grants) {
      primitives.push(lf(grantId(g.slug), LF.ToolGrant, { tool_name: g.tool_name, authority: g.authority, approval: g.approval }));
      relations.push(rel(LFR.AgentGrantsTool, agent, grantId(g.slug)));
    }
  }

  // Delegation modes and the contracts that enforce their returns.
  for (const m of MODES) {
    primitives.push({
      id: modeId(m.mode_name),
      type: CDEL.DelegationMode,
      fields: {
        mode_name: m.mode_name,
        description: m.description,
        sandbox_tier: m.sandbox_tier,
        writes_workspace: m.writes_workspace,
        network_access: m.network_access,
        git_allowed: m.git_allowed,
        requires_git_repo: m.requires_git_repo,
        return_schema: JSON.stringify(m.schema),
        wrapper_flags: m.wrapper_flags,
      },
    });
    // on_invalid is "fail", not "retry": the wrapper never re-prompts the
    // subordinate agent. A return that fails a check is reported to the
    // orchestrator as a failed delegation and the raw output is kept for
    // review. Re-delegating is the orchestrator's decision to make with the
    // failure in hand, not a loop the boundary runs on its own.
    primitives.push(
      lf(modeContractId(m.mode_name), LF.OutputContract, {
        format: "json",
        json_schema: JSON.stringify(m.schema),
        validator_count: m.checks.length,
        on_invalid: "fail",
      }),
    );
    relations.push(rel(CDEL_R.ModeReturnsContract, modeId(m.mode_name), modeContractId(m.mode_name)));
  }

  // Pipeline and its inputs.
  primitives.push(
    lf(PIPELINE_ID, LF.Pipeline, {
      ...governed(
        "codex-delegation",
        "Four stages per delegation: the orchestrator writes a work order, the wrapper runs the subordinate agent under a declared delegation mode and validates its return, the orchestrator reviews the validated return against files it opens itself, and the orchestrator integrates what survived. No stage commits: the operator is the acceptance authority and sits outside both agents.",
        ["codex-delegation", "orchestration", "silent-acceptance"],
      ),
      stage_count: STAGES.length,
      example_count: EXAMPLES.length,
    }),
  );
  for (const v of PIPELINE_INPUTS) {
    primitives.push(
      lf(inputId(v.name), LF.VariableSpec, {
        variable_name: v.name,
        type: v.type,
        description: v.description,
        is_required: true,
        sensitivity: "internal",
        ...(v.enum_values ? { enum_values: v.enum_values } : {}),
      }),
    );
    relations.push(rel(LFR.PipelineDeclaresInput, PIPELINE_ID, inputId(v.name)));
  }

  // Stages, bindings, contracts, validators.
  for (const s of STAGES) {
    primitives.push(
      lf(stageId(s.slug), LF.Stage, {
        stage_name: s.slug,
        position: s.position,
        system_prompt_mode: "inherit",
        timeout_ms: s.timeout_ms,
        binding_count: s.bindings.length,
      }),
    );
    relations.push(
      rel(LFR.PipelineHasStage, PIPELINE_ID, stageId(s.slug)),
      rel(LFR.StageRunsAgent, stageId(s.slug), s.agent),
      rel(LFR.StageUsesTaskTemplate, stageId(s.slug), templateId(s.template)),
    );
    for (const mode of s.modes) relations.push(rel(CDEL_R.StageRunsInMode, stageId(s.slug), modeId(mode)));

    for (const b of s.bindings) {
      const id = `lf:binding:cdel-${s.slug}-${b.variable}`;
      const fields: Record<string, unknown> = { variable_name: b.variable, source_kind: b.source.kind };
      if (b.source.kind === "pipeline_input") fields["input_name"] = b.source.input;
      if (b.source.kind === "stage_output") fields["source_path"] = "";
      if (b.source.kind === "carried") fields["carry_name"] = b.source.carry;
      primitives.push(lf(id, LF.VariableBinding, fields));
      relations.push(rel(LFR.StageHasBinding, stageId(s.slug), id));
      if (b.source.kind === "stage_output") relations.push(rel(LFR.BindingReadsStage, id, stageId(b.source.stage)));
      if (b.source.kind === "carried") relations.push(rel(LFR.BindingReadsCarry, id, carryId(b.source.carry)));
    }

    // A stage the orchestrator runs can be re-prompted by the runtime; the
    // delegate stage cannot, because the wrapper reports a failed delegation
    // rather than re-running it. Declaring a retry the system does not perform
    // would inflate every budget the renderer computes from this document.
    primitives.push(
      lf(
        contractId(s.slug),
        LF.OutputContract,
        s.retry_feedback === undefined
          ? { format: "json", json_schema: JSON.stringify(s.schema), validator_count: s.validators.length, on_invalid: "fail" }
          : {
              format: "json",
              json_schema: JSON.stringify(s.schema),
              validator_count: s.validators.length,
              on_invalid: "retry",
              max_attempts: 2,
              retry_feedback: s.retry_feedback,
            },
      ),
    );
    relations.push(rel(LFR.StageHasOutputContract, stageId(s.slug), contractId(s.slug)));

    s.validators.forEach((v, position) => {
      const fields: Record<string, unknown> = { position, kind: v.kind };
      if (v.kind === "regex") Object.assign(fields, { path: v.path, pattern: v.pattern });
      if (v.kind === "range") Object.assign(fields, { path: v.path, ...(v.min !== undefined ? { min: v.min } : {}), ...(v.max !== undefined ? { max: v.max } : {}) });
      if (v.kind === "named") Object.assign(fields, { validator_name: v.validator_name, args: JSON.stringify(v.args) });
      primitives.push(lf(validatorId(s.slug, position), LF.OutputValidator, fields));
      relations.push(rel(LFR.ContractHasValidator, contractId(s.slug), validatorId(s.slug, position)));
    });
  }

  // Loop, carries, stop conditions.
  primitives.push(lf(LOOP_ID, LF.LoopConfig, LOOP));
  relations.push(rel(LFR.PipelineHasLoop, PIPELINE_ID, LOOP_ID));
  for (const c of CARRIES) {
    primitives.push(
      lf(carryId(c.name), LF.Carry, {
        carry_name: c.name,
        source_path: c.source_path,
        value_type: c.value_type,
        initial_value: c.initial_value,
        carry_mode: c.carry_mode,
        max_serialized_chars: c.max_serialized_chars,
      }),
    );
    relations.push(rel(LFR.LoopHasCarry, LOOP_ID, carryId(c.name)), rel(LFR.CarryCapturesStage, carryId(c.name), stageId(c.captures)));
  }
  for (const st of STOPS) {
    primitives.push(lf(stopId(st.id), LF.StopCondition, st.fields));
    relations.push(rel(LFR.LoopHasStopCondition, LOOP_ID, stopId(st.id)), rel(LFR.StopConditionObservesStage, stopId(st.id), stageId(st.observes)));
  }

  // Examples and the evaluation gate.
  for (const e of EXAMPLES) {
    primitives.push(lf(exampleId(e.id), LF.PipelineExample, e.fields));
    relations.push(rel(LFR.PipelineHasExample, PIPELINE_ID, exampleId(e.id)));
  }
  primitives.push(
    lf(EVAL_ID, LF.EvaluationPolicy, {
      metric: "operator_accepted_delegation_ratio",
      unit: "ratio",
      comparator: "gte",
      threshold: 0.8,
      development_dataset_ref: `${GUIDE_PATH} §6 smoke test plus the operator's own delegations, recorded as lf:RunReceipt records in this workbook`,
      acceptance_dataset_ref: "No acceptance dataset exists yet. The first sa:CalibrationRun must be run against real delegations before any boundary leaves draft; until then this policy is a declared target, not a measured one.",
    }),
  );
  relations.push(rel(LFR.PipelineHasEvaluation, PIPELINE_ID, EVAL_ID));

  // Acceptance authority, oracles, verifiers.
  primitives.push(
    sa(AUTHORITY_ID, SA.AcceptanceAuthority, {
      name: "Operator acceptance authority",
      control_domain: "operator-review",
      authorization_ref: `${GUIDE_PATH}, section 'Acceptance authority'. The mechanism is that neither agent holds a git grant and every orchestrator write is approved per action, so acceptance can only happen at a commit the operator makes.`,
      verdict_store_location:
        "The git history of the target repository, plus this workbook's append-only fdpm operation log (sa:ClassVerdict, sa:AcceptanceDecision). Both are readable outside either agent's runtime.",
      is_append_only: true,
      is_outside_runtime_readable: true,
      owner: SA_OWNER,
    }),
  );
  for (const o of ORACLES) {
    primitives.push(
      sa(oracleId(o.slug), SA.Oracle, {
        name: o.name,
        kind: o.kind,
        evidence_source: o.evidence_source,
        version: o.version,
        control_domain: o.control_domain,
        is_independent_from_verifier: true,
        owner: SA_OWNER,
      }),
    );
  }
  for (const v of VERIFIERS) {
    primitives.push(
      sa(verifierId(v.slug), SA.Verifier, {
        name: v.name,
        mechanism: v.mechanism,
        implementation_ref: v.implementation_ref,
        version: VERSION,
        location: VERIFIER_LOCATION,
        control_domain: HARNESS_DOMAIN,
        is_producer_writable: false,
        owner: SA_OWNER,
      }),
    );
    for (const target of v.implemented_by) relations.push(rel(CDEL_R.VerifierImplementedBy, verifierId(v.slug), target));
    for (const o of v.oracles) relations.push(rel(CDEL_R.VerifierChecksAgainst, verifierId(v.slug), oracleId(o)));
  }

  // Per-stage consumer, pinned configuration, boundary, nine coverage rows and their accepted risks.
  for (const b of BOUNDARIES) {
    const stage = STAGES.find((s) => s.slug === b.stage)!;
    const isCodex = stage.agent === CODEX_AGENT_ID;
    const systemTemplate = isCodex ? "codex-system" : "orchestrator-system";
    const grants = isCodex ? CODEX_GRANTS : ORCHESTRATOR_GRANTS;
    const promptSet = { system: templateMessages(systemTemplate), task: templateMessages(stage.template) };
    const contextPolicy = { loop: LOOP, carries: CARRIES, bindings: stage.bindings, timeout_ms: stage.timeout_ms, modes: stage.modes };

    primitives.push(
      sa(consumerId(b.stage), SA.Consumer, { ...b.consumer, owner: SA_OWNER }),
      sa(configurationId(b.stage), SA.SolverConfiguration, {
        solver_configuration_id: `${isCodex ? "codex-cli/0.153.2" : "claude-code/2.1.261"}+codex-delegation-0.1+${systemTemplate}@${VERSION}+${stage.template}@${VERSION}`,
        model_id: isCodex
          ? "openai/codex-cli 0.153.2 default model (operator's ChatGPT plan; the model the service selects is not pinned by this record)"
          : "anthropic/claude-opus-5 via Claude Code 2.1.261 (the session's model; not pinned by this record)",
        harness_id: isCodex ? `codex exec, invoked by ${WRAPPER_PATH}` : "Claude Code 2.1.261 interactive session",
        context_policy_digest: sha256(JSON.stringify(contextPolicy)),
        tool_set_digest: sha256(JSON.stringify(grants)),
        prompt_set_digest: sha256(JSON.stringify(promptSet)),
        producer_control_domain: isCodex ? "agent-runtime:codex-cli" : "agent-runtime:claude-code",
        configured_at: CREATED_AT,
        created_by: "build-codex-delegation.ts",
      }),
      sa(boundaryId(b.stage), SA.VerificationBoundary, {
        boundary_name: `${b.stage} stage boundary`,
        protocol_version: SILENT_ACCEPTANCE_VERSION,
        status: "draft",
        scope_statement: b.scope_statement,
        distribution_ref:
          "No calibration distribution exists yet. The boundary stays draft until an sa:CalibrationRun measures the declared verifiers against real delegations.",
        verifier_location: VERIFIER_LOCATION,
        tolerated_failure_rate: b.tau,
        owner: SA_OWNER,
        calibrated_on: TODAY,
        next_review_on: NEXT_REVIEW,
      }),
    );
    relations.push(
      rel(SAR.BoundaryProtectsConsumer, boundaryId(b.stage), consumerId(b.stage)),
      rel(SAR.BoundaryPinsConfiguration, boundaryId(b.stage), configurationId(b.stage)),
      rel(SAR.BoundaryDelegatesAuthority, boundaryId(b.stage), AUTHORITY_ID),
      rel(CDEL_R.BoundaryGuardsStage, boundaryId(b.stage), stageId(b.stage)),
      rel(CDEL_R.ConfigurationRunsAgent, configurationId(b.stage), stage.agent),
      rel(CDEL_R.ConfigurationUsesTemplate, configurationId(b.stage), templateId(systemTemplate)),
      rel(CDEL_R.ConfigurationUsesTemplate, configurationId(b.stage), templateId(stage.template)),
    );
    for (const g of grants) relations.push(rel(CDEL_R.ConfigurationGrantsTool, configurationId(b.stage), grantId(g.slug)));

    for (const r of b.rows) {
      const severity = SEVERITY[r.severity];
      primitives.push(
        sa(coverageId(b.stage, r.cls), SA.ErrorClassCoverage, {
          error_class: r.cls,
          disposition: "accepted_risk",
          control_objective: `${r.control_objective} Prevalence is unmeasured and declared at the worst case (1.0) until the first calibration run.`,
          prevalence_rate: 1,
          severity_weight: severity,
          residual_risk: severity,
          owner: SA_OWNER,
          calibrated_on: TODAY,
        }),
        sa(riskId(b.stage, r.cls), SA.AcceptedRisk, {
          error_class: r.cls,
          mitigation_note: r.mitigation,
          expires_on: NEXT_REVIEW,
          approved_by: SA_OWNER,
          approval_control_domain: "operator-review",
        }),
      );
      relations.push(
        rel(SAR.BoundaryDeclaresCoverage, boundaryId(b.stage), coverageId(b.stage, r.cls)),
        rel(SAR.CoverageAcceptsRisk, coverageId(b.stage, r.cls), riskId(b.stage, r.cls)),
      );
      for (const v of r.verifiers) relations.push(rel(CDEL_R.RiskMitigatedByVerifier, riskId(b.stage, r.cls), verifierId(v)));
    }
  }

  return {
    header: {
      id: WORKBOOK_ID,
      name: "Codex Delegation — Claude Code orchestrating the Codex CLI",
      profile: PROFILE_ID,
      description: `The delegation pipeline of ${GUIDE_PATH} as validated data: work-order and return contracts, the delegation modes and their sandbox tiers, the tool grants that are the containment, and a Silent Acceptance v2.1.0 verification boundary per stage over all nine intrinsic error classes.`,
    },
    primitives,
    relations,
  };
}

export function allSeeds(): WorkbookSeed[] {
  return [delegationSeed()];
}
