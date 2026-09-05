/**
 * Seed content for the frontier-proof loop: the orchestration workbook
 * (profile:frontier-proof-loop:0.1) and the first pursuit's two state
 * workbooks (profile:re-crt:6.2 and profile:logical-knowledge-base:1.0).
 *
 * ARCHITECTURAL REQUIREMENT: LLMs will always produce some form of error.
 * Absence of output verification is a design defect, not a runtime bug.
 * All LLM output must be treated as untrusted and validated explicitly.
 *
 * Every table in this file is data the host validates on write. Nothing
 * here is a placeholder: the pipeline is `draft` because no run has
 * happened; every boundary is `draft` and every error class is an accepted
 * risk because no calibration run has measured a verifier's recall, and
 * profile:silent-acceptance:2.1 refuses `covered` without one. The
 * verifiers exist, are implemented by pipeline records, and are named as
 * each risk's compensating control; the first passed calibration moves
 * rows to covered and the boundary to active.
 */
import { createHash } from "node:crypto";
import type { PrimitiveSpec, ProjectHeader, RelationSpec } from "../../src/sdk.js";
import { T as LF, R as LFR, SCOPE_ID as LF_SCOPE } from "../../plugins/loop_forward/ids.js";
import { T as SA, R as SAR, SCOPE_ID as SA_SCOPE, ERROR_CLASSES, type ErrorClass } from "../../plugins/silent_acceptance/ids.js";
import { parseFormula } from "../../plugins/logical_knowledge_base/formula.js";
import { mentionEdges, sourceIdIndex } from "../../plugins/logical_knowledge_base/transfer.js";
import { FPL, FPL_R, PARENT_LKB, PARENT_RE_CRT, PROFILE_ID, SILENT_ACCEPTANCE_DOI, SILENT_ACCEPTANCE_VERSION } from "./profile.js";

export interface WorkbookSeed {
  header: ProjectHeader;
  primitives: PrimitiveSpec[];
  relations: RelationSpec[];
}

// ── Identity ───────────────────────────────────────────────────────────────

export const ORCHESTRATION_WORKBOOK_ID = "frontier-proof-loop";
export const PROOFS_WORKBOOK_ID = "fpl-ecdlp-proofs";
export const KNOWLEDGE_WORKBOOK_ID = "fpl-ecdlp-knowledge";
export const EVIDENCE_ROOT = "fdpm-cli/research/frontier-proof-loop/evidence/ecdlp";

/** Accountable owner of the loop-forward records (the contract allows a person here). */
const LF_OWNER = "user:pedroanisio";
/** Accountable owner of the silent-acceptance records (the profile forbids personal data here). */
const SA_OWNER = "team:fdpm-frontier-proof";
const CREATED_BY = "claude-fable-5-1 via Claude Code (scripts/build-frontier-proof-loop.ts)";
const CREATED_AT = "2026-09-04T00:00:00Z";
const TODAY = "2026-09-04";
const NEXT_REVIEW = "2026-10-04";
const VERSION = "0.1.0";

export const AGENT_FABLE_ID = "lf:agent:fpl-anthropic-fable";
export const AGENT_ASTRA_ID = "lf:agent:fpl-gpt-astra";
export const PIPELINE_ID = "lf:pipeline:fpl-frontier-proof-loop";
export const LOOP_ID = "lf:loop:fpl-main";
export const EVAL_ID = "lf:eval:fpl-acceptance";
export const PURSUIT_ID = "fpl:pursuit:ecdlp-frontiermath";
export const AUTHORITY_ID = "sa:authority:operator";
export const LKB_OPERATOR_ID = "lkb:agent:operator";
export const LKB_FABLE_ID = "lkb:agent:anthropic-fable";
export const LKB_ASTRA_ID = "lkb:agent:gpt-astra";

export const STAGE_SLUGS = ["plan", "attempt", "audit", "register"] as const;
export type StageSlug = (typeof STAGE_SLUGS)[number];
export const stageId = (slug: StageSlug): string => `lf:stage:fpl-${slug}`;
export const contractId = (slug: StageSlug): string => `lf:contract:fpl-${slug}`;
export const validatorId = (slug: StageSlug, position: number): string => `lf:validator:fpl-${slug}-${position}`;
export const boundaryId = (slug: StageSlug): string => `sa:boundary:fpl-${slug}`;
export const consumerId = (slug: StageSlug): string => `sa:consumer:fpl-${slug}`;
export const configurationId = (slug: StageSlug): string => `sa:configuration:fpl-${slug}`;
const classSlug = (cls: ErrorClass): string => cls.slice(4).toLowerCase().replace(/_/g, "-");
export const coverageId = (slug: StageSlug, cls: ErrorClass): string => `sa:coverage:fpl-${slug}-${classSlug(cls)}`;
export const riskId = (slug: StageSlug, cls: ErrorClass): string => `sa:risk:fpl-${slug}-${classSlug(cls)}`;
export const verifierId = (slug: string): string => `sa:verifier:fpl-${slug}`;
export const oracleId = (slug: string): string => `sa:oracle:fpl-${slug}`;

/** Named validators the loop-forward runtime must implement to execute this pipeline. */
export const NAMED_VALIDATORS = [
  "fpl.node_exists_in_workbook",
  "fpl.formal_artifact_check",
  "fpl.reference_resolves",
  "fpl.error_class_vocabulary",
  "fpl.written_ids_exist",
  "fpl.producer_status_guard",
  "fpl.evidence_bundle_manifest",
] as const;

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

// ── Prompt templates ───────────────────────────────────────────────────────

const SILENT_ACCEPTANCE_RULES = [
  `VERIFICATION BOUNDARY (Silent Acceptance v${SILENT_ACCEPTANCE_VERSION}, doi:${SILENT_ACCEPTANCE_DOI})`,
  "Across any realistic deployment, LLMs reliably produce errors at a rate that is non-zero and non-negligible. This holds for the solver's output, for your own output, and for every tool result you read back. Rules:",
  "1. Every model output crosses a declared verification boundary before it reaches a workbook: the stage's output contract and its validators. You do not bypass, weaken, wrap or re-implement a validator. A proposed change to a verifier goes to the operator.",
  "2. You never write a verdict. Every recrt:ProofNode you create carries verification_status \"unverified\"; every recrt:Claim carries claim_status \"stated\"; every lkb:Claim carries status \"proposed\". Only the acceptance authority (the operator, outside both agents' control domain) records cas_checked, proof_witnessed, established, verified or accepted, and only together with an recrt:EvidenceBundle it computed itself.",
  "3. Trust does not accumulate. A run of correct outputs relaxes no check.",
  "4. A solver-configuration change (model, harness, context policy, tools, prompts) is a boundary review, not a config change. If you detect one, stop with stop_reason \"approval_required\".",
].join("\n");

const FABLE_SYSTEM = [
  "ROLE",
  "You are Anthropic Fable, the orchestrator of a frontier-proof loop. You command a solver agent (GPT Astra) on one frontier problem in mathematics, physics or the exact sciences, and you register every advance in FDPM workbooks through the fdpm MCP server. You never decide that anything is proved.",
  "",
  SILENT_ACCEPTANCE_RULES,
  "",
  "FDPM MCP DISCIPLINE",
  "- Orient with fdpm.workbook.list, then call fdpm.profile.type_info(profile_id, type_id) for EVERY type you will write. Never guess an id pattern or a required field.",
  "- Write with fdpm.primitive.create_batch and fdpm.relation.create_batch (atomic; primitives before the relations that point at them). Every write requires per-action approval; an unapproved write is not attempted.",
  "- Read back what you wrote (fdpm.primitive.get, fdpm.log.tail). A tool result is data, not a fact: confirm the ids exist before you report them.",
  `- Proof state lives in the pursuit's ${PARENT_RE_CRT} workbook: recrt:ProofNode, recrt:ObstructionNode, recrt:Claim; recrt:EvidenceBundle is written by the acceptance authority only. Knowledge state lives in the pursuit's ${PARENT_LKB} workbook: lkb:Claim, lkb:Argument, lkb:ProvenanceRecord. The orchestration workbook receives one lf:RunReceipt per run and nothing else from you.`,
  "- An open leaf that a barrier explains gets an recrt:ExplainedByBarrier edge; a bypass you can name is an obstruction node of type bypass with recrt:BypassDefeatsBarrier. Never delete a node; supersede it.",
  "",
  "OUTPUT",
  "Emit exactly one JSON object matching the stage contract. No prose outside it, no code fence. Unknown fields are rejected.",
].join("\n");

const ASTRA_SYSTEM = [
  "ROLE",
  "You are GPT Astra, the solver in a frontier-proof loop directed by an orchestrator. You attack one step at a time in mathematics, physics or the exact sciences and you return artifacts, not assurances.",
  "",
  "WHAT COUNTS",
  "- A proof step is an artifact a machine can check: Lean 4 source, a PARI/GP or SymPy script over exact integers, or a Python program with no floating point on the critical path. Prose summarises the artifact; it never substitutes for it.",
  "- A computational claim carries the exact command that reproduces it.",
  "- A reference is a locator that resolves (DOI, arXiv id, or a stable URL) plus the title as printed at that locator. A reference you cannot resolve is not cited; write \"no citation\" instead. Fabricating a locator is the single worst failure you can commit.",
  "- A step you cannot complete is reported as partial or failed with the obstruction named precisely: what blocks it, and whether the block is structural or a resource limit.",
  "- Your confidence is a number in [0,1] about the artifact, not about the prose. No consumer reads it except the calibration audit.",
  "",
  "WHAT YOU DO NOT DO",
  "- You hold no write grant on any workbook. You never claim a node is verified, witnessed or established.",
  "- You do not agree with the orchestrator; you check what it asks. If the step is ill-posed, say so in the obstruction field and return status \"failed\".",
  "- You do not modify, wrap or comment on any validator.",
  "",
  "OUTPUT",
  "Emit exactly one JSON object matching the stage contract. No prose outside it, no code fence. Unknown fields are rejected.",
].join("\n");

const PLAN_TASK = [
  "PURSUIT",
  "Domain: {{domain}}",
  "Problem: {{problem_statement}}",
  "Acceptance criterion (decided by the acceptance authority, not by you): {{acceptance_criterion}}",
  `Proof workbook: {{proofs_workbook_id}} (${PARENT_RE_CRT}). Knowledge workbook: {{knowledge_workbook_id}} (${PARENT_LKB}).`,
  "",
  "STATE",
  "Reason-DAG summary carried from the last registration: {{dag_state}}",
  "Obstructions the solver reported last iteration: {{obstruction_log}}",
  "Iteration log so far: {{iteration_log}}",
  "",
  "TASK",
  "Read the proof workbook (fdpm.primitive.search over recrt:ProofNode and recrt:ObstructionNode; fdpm.relation.list for recrt:ExplainedByBarrier and recrt:BypassDefeatsBarrier) and choose the single next step: the open leaf no undefeated barrier explains, or the barrier whose bypass is cheapest to attempt. The step must be checkable by one artifact the solver can produce in one call.",
  "Set stop_reason:",
  "- \"target_verified\" only if the goal node's verification_status as stored is proof_witnessed or cas_checked AND an recrt:EvidencedBy edge to an recrt:EvidenceBundle exists (you read this; you do not set it);",
  "- \"blocked\" if every open leaf is explained by an undefeated barrier and no bypass is known;",
  "- \"approval_required\" if the next step needs a tool grant or a solver-configuration change you do not hold;",
  "- \"clean_noop\" if the workbook already contains what the step would add;",
  "- \"continue\" otherwise.",
  "target_node_id is the id of an existing recrt:ProofNode the step advances.",
].join("\n");

const ATTEMPT_TASK = [
  "DOMAIN: {{domain}}",
  "PROBLEM: {{problem_statement}}",
  "CURRENT DAG SUMMARY: {{dag_state}}",
  "STEP (from the orchestrator; check that it is well-posed before you attempt it):",
  "{{step}}",
  "",
  "Attempt the step. Return the artifact, the exact reproduction command, the claims the artifact establishes (each with a confidence in [0,1] and the ids of the proof nodes it depends on), the references you actually used (locator plus the title as printed there), and any obstruction you hit.",
].join("\n");

const AUDIT_TASK = [
  "ACCEPTANCE CRITERION: {{acceptance_criterion}}",
  "STEP THAT WAS ASSIGNED: {{step}}",
  "SOLVER OUTPUT (it already passed the schema, artifact and reference checks; those checks are not yours to repeat or to override): {{attempt}}",
  "",
  "Audit adversarially. For each finding name the error class from the Silent Acceptance taxonomy (ERR_HALLUCINATION, ERR_OMISSION, ERR_SCHEMA, ERR_TRUNCATION, ERR_SYCOPHANCY, ERR_INSTRUCTION, ERR_CALIBRATION, ERR_SEMANTIC, ERR_REASONING), the location in the output, and a note. Ignore the solver's self-reported confidence entirely. Set reproduced to true only if you re-ran the reproduction command yourself and it printed the claimed result.",
  "Verdict: \"register\" to record the attempt as unverified nodes; \"reject\" to send the step back; \"escalate\" if the operator must decide. Your verdict is a filter, not an acceptance: nothing you say makes a node verified.",
].join("\n");

const REGISTER_TASK = [
  "PURSUIT: {{pursuit_id}}",
  "PROOF WORKBOOK: {{proofs_workbook_id}}   KNOWLEDGE WORKBOOK: {{knowledge_workbook_id}}",
  "EVIDENCE ROOT (repository path where bundles are written): {{evidence_root}}",
  "STEP: {{step}}",
  "SOLVER OUTPUT: {{attempt}}",
  "AUDIT: {{audit}}",
  "",
  "If the audit verdict is \"register\": call fdpm.profile.type_info for each type, then write with create_batch:",
  "- one recrt:ProofNode per established claim (node_type derived or open; verification_status \"unverified\"; payload = the claim statement; the artifact path in open_payload), recrt:ProofSupports edges to the nodes it depends on, recrt:ProofInDAG to the pursuit's reason DAG, recrt:HasRule to the rule applied;",
  "- one recrt:ObstructionNode per obstruction (barrier with blocking_strength 1, conditional_barrier strictly between 0 and 1, bypass 0) with recrt:ExplainedByBarrier from the blocked leaf;",
  "- one recrt:Claim per claim (claim_status \"stated\", with its falsifier) and one lkb:Claim (status \"proposed\") with an lkb:provenance edge (role generated_by) to an lkb:ProvenanceRecord for this run that names the solver's lkb:AgentDeclaration and the evidence bundle (lkb:provenance targets only provenance records);",
  "- if the artifact ran, write its files under the evidence root and report manifest_root (sorted \"sha256  path\" lines over file contents, hashed) and bundle_path. Do NOT create the recrt:EvidenceBundle yourself: the acceptance authority creates it after recomputing the root.",
  "If the verdict is \"reject\" or \"escalate\": write nothing and report written as an empty list.",
  "Then read back every id you wrote and report the DAG summary (open leaves, the goal node's status as stored, node count) and a one-paragraph iteration note.",
].join("\n");

interface TemplateVar {
  name: string;
  type: "string" | "json" | "enum";
  description: string;
  enum_values?: string[];
}
interface TemplateDef {
  slug: string;
  name: string;
  description: string;
  role: "system" | "user";
  content: string;
  variables: TemplateVar[];
}

const DOMAIN_VALUES = ["mathematics", "physics", "science"];
const V = {
  domain: { name: "domain", type: "enum", description: "Field of the pursuit.", enum_values: DOMAIN_VALUES },
  problem_statement: { name: "problem_statement", type: "string", description: "The pursuit's problem statement, verbatim from fpl:Pursuit.statement." },
  acceptance_criterion: { name: "acceptance_criterion", type: "string", description: "What the acceptance authority checks, verbatim from fpl:Pursuit.acceptance_criterion." },
  proofs_workbook_id: { name: "proofs_workbook_id", type: "string", description: "Id of the pursuit's re-crt workbook." },
  knowledge_workbook_id: { name: "knowledge_workbook_id", type: "string", description: "Id of the pursuit's logical-knowledge-base workbook." },
  pursuit_id: { name: "pursuit_id", type: "string", description: "Id of the fpl:Pursuit in the orchestration workbook." },
  evidence_root: { name: "evidence_root", type: "string", description: "Repository path under which evidence bundles are written." },
  dag_state: { name: "dag_state", type: "json", description: "Carried reason-DAG summary from the last register stage." },
  obstruction_log: { name: "obstruction_log", type: "json", description: "Carried obstructions from the last register stage." },
  iteration_log: { name: "iteration_log", type: "string", description: "Carried, appended iteration notes." },
  step: { name: "step", type: "json", description: "The plan stage's output for this iteration." },
  attempt: { name: "attempt", type: "json", description: "The attempt stage's output for this iteration." },
  audit: { name: "audit", type: "json", description: "The audit stage's output for this iteration." },
} satisfies Record<string, TemplateVar>;

const TEMPLATES: TemplateDef[] = [
  { slug: "fable-system", name: "fable-system", description: "System prompt of the orchestrator: role, the Silent Acceptance rules, the fdpm MCP discipline.", role: "system", content: FABLE_SYSTEM, variables: [] },
  { slug: "astra-system", name: "astra-system", description: "System prompt of the solver: artifacts over assurances, resolvable references only, no workbook writes.", role: "system", content: ASTRA_SYSTEM, variables: [] },
  { slug: "plan", name: "plan", description: "Task prompt of the plan stage: choose the next checkable step from the proof workbook.", role: "user", content: PLAN_TASK, variables: [V.domain, V.problem_statement, V.acceptance_criterion, V.proofs_workbook_id, V.knowledge_workbook_id, V.dag_state, V.obstruction_log, V.iteration_log] },
  { slug: "attempt", name: "attempt", description: "Task prompt of the attempt stage: produce the artifact for one step.", role: "user", content: ATTEMPT_TASK, variables: [V.domain, V.problem_statement, V.dag_state, V.step] },
  { slug: "audit", name: "audit", description: "Task prompt of the audit stage: adversarial review classified by error class; a filter, not an authority.", role: "user", content: AUDIT_TASK, variables: [V.acceptance_criterion, V.step, V.attempt] },
  { slug: "register", name: "register", description: "Task prompt of the register stage: write unverified nodes and claims through the fdpm MCP, read them back, summarise.", role: "user", content: REGISTER_TASK, variables: [V.pursuit_id, V.proofs_workbook_id, V.knowledge_workbook_id, V.evidence_root, V.step, V.attempt, V.audit] },
];
export const templateId = (slug: string): string => `lf:template:fpl-${slug}`;
const templateVarId = (slug: string, variable: string): string => `lf:var:fpl-${slug}-${variable}`;
const templateMessages = (slug: string): Array<{ role: string; content: string }> => {
  const t = TEMPLATES.find((x) => x.slug === slug)!;
  return [{ role: t.role, content: t.content }];
};

const PIPELINE_INPUTS: TemplateVar[] = [V.pursuit_id, V.problem_statement, V.domain, V.proofs_workbook_id, V.knowledge_workbook_id, V.acceptance_criterion, V.evidence_root];
const inputId = (variable: string): string => `lf:var:fpl-input-${variable}`;

const variableSpec = (id: string, v: TemplateVar): PrimitiveSpec =>
  lf(id, LF.VariableSpec, {
    variable_name: v.name,
    type: v.type,
    description: v.description,
    is_required: true,
    sensitivity: "internal",
    ...(v.enum_values ? { enum_values: v.enum_values } : {}),
  });

// ── Agents and tool grants ─────────────────────────────────────────────────

interface GrantDef {
  slug: string;
  tool_name: string;
  authority: "read" | "write";
  approval: "none" | "per_run" | "per_action";
}
const READ = (slug: string, tool_name: string): GrantDef => ({ slug, tool_name, authority: "read", approval: "none" });

export const FABLE_GRANTS: GrantDef[] = [
  READ("fable-workbook-list", "fdpm.workbook.list"),
  READ("fable-type-info", "fdpm.profile.type_info"),
  READ("fable-primitive-get", "fdpm.primitive.get"),
  READ("fable-primitive-search", "fdpm.primitive.search"),
  READ("fable-relation-list", "fdpm.relation.list"),
  READ("fable-log-tail", "fdpm.log.tail"),
  READ("fable-resources-read", "fdpm.resources.read"),
  { slug: "fable-workbook-create", tool_name: "fdpm.workbook.create", authority: "write", approval: "per_run" },
  { slug: "fable-primitive-create-batch", tool_name: "fdpm.primitive.create_batch", authority: "write", approval: "per_action" },
  { slug: "fable-relation-create-batch", tool_name: "fdpm.relation.create_batch", authority: "write", approval: "per_action" },
  { slug: "fable-primitive-patch", tool_name: "fdpm.primitive.patch", authority: "write", approval: "per_action" },
];
export const ASTRA_GRANTS: GrantDef[] = [
  READ("astra-type-info", "fdpm.profile.type_info"),
  READ("astra-primitive-get", "fdpm.primitive.get"),
  READ("astra-primitive-search", "fdpm.primitive.search"),
  READ("astra-relation-list", "fdpm.relation.list"),
  READ("astra-resources-read", "fdpm.resources.read"),
  READ("astra-reference-fetch", "web.fetch_reference"),
  READ("astra-lean4-check", "lean4.check"),
  { slug: "astra-sandbox-execute", tool_name: "sandbox.execute", authority: "write", approval: "per_run" },
];
const grantId = (slug: string): string => `lf:grant:fpl-${slug}`;

// ── Stages, bindings, contracts, validators ────────────────────────────────

type BindingSource =
  | { kind: "pipeline_input"; input: string }
  | { kind: "stage_output"; stage: StageSlug }
  | { kind: "carried"; carry: string };
type ValidatorDef =
  | { kind: "regex"; path: string; pattern: string }
  | { kind: "range"; path: string; min?: number; max?: number }
  | { kind: "named"; validator_name: (typeof NAMED_VALIDATORS)[number]; args: Record<string, unknown> };
interface StageDef {
  slug: StageSlug;
  position: number;
  agent: string;
  template: string;
  timeout_ms: number;
  bindings: Array<{ variable: string; source: BindingSource }>;
  schema: Record<string, unknown>;
  retry_feedback: string;
  validators: ValidatorDef[];
}

const NODE_ID_PATTERN = "^recrt:proof-node:[a-z0-9][a-z0-9-]*$";
const closed = (properties: Record<string, unknown>, required: string[]): Record<string, unknown> => ({
  type: "object",
  additionalProperties: false,
  required,
  properties,
});

export const STAGES: StageDef[] = [
  {
    slug: "plan",
    position: 0,
    agent: AGENT_FABLE_ID,
    template: "plan",
    timeout_ms: 600_000,
    bindings: [
      { variable: "domain", source: { kind: "pipeline_input", input: "domain" } },
      { variable: "problem_statement", source: { kind: "pipeline_input", input: "problem_statement" } },
      { variable: "acceptance_criterion", source: { kind: "pipeline_input", input: "acceptance_criterion" } },
      { variable: "proofs_workbook_id", source: { kind: "pipeline_input", input: "proofs_workbook_id" } },
      { variable: "knowledge_workbook_id", source: { kind: "pipeline_input", input: "knowledge_workbook_id" } },
      { variable: "dag_state", source: { kind: "carried", carry: "dag_state" } },
      { variable: "obstruction_log", source: { kind: "carried", carry: "obstruction_log" } },
      { variable: "iteration_log", source: { kind: "carried", carry: "iteration_log" } },
    ],
    schema: closed(
      {
        stop_reason: { type: "string", enum: ["continue", "target_verified", "blocked", "approval_required", "clean_noop"] },
        target_node_id: { type: "string" },
        step: closed(
          {
            title: { type: "string" },
            kind: { type: "string", enum: ["lemma", "computation", "reduction", "formalization", "literature_check", "obstruction_analysis"] },
            instructions: { type: "string" },
            success_test: { type: "string" },
          },
          ["title", "kind", "instructions", "success_test"],
        ),
        rationale: { type: "string" },
      },
      ["stop_reason", "target_node_id", "step", "rationale"],
    ),
    retry_feedback:
      "Your output did not pass the plan contract. Re-emit exactly one JSON object with no code fence and no prose. stop_reason is one of continue|target_verified|blocked|approval_required|clean_noop; target_node_id is the id of a recrt:ProofNode that exists in the proof workbook (read it, do not invent it).",
    validators: [
      { kind: "regex", path: "/stop_reason", pattern: "^(continue|target_verified|blocked|approval_required|clean_noop)$" },
      { kind: "regex", path: "/target_node_id", pattern: NODE_ID_PATTERN },
      { kind: "named", validator_name: "fpl.node_exists_in_workbook", args: { workbook_input: "proofs_workbook_id", path: "/target_node_id", type_id: "recrt:ProofNode", lookup: "fdpm.primitive.get" } },
    ],
  },
  {
    slug: "attempt",
    position: 1,
    agent: AGENT_ASTRA_ID,
    template: "attempt",
    timeout_ms: 3_600_000,
    bindings: [
      { variable: "domain", source: { kind: "pipeline_input", input: "domain" } },
      { variable: "problem_statement", source: { kind: "pipeline_input", input: "problem_statement" } },
      { variable: "dag_state", source: { kind: "carried", carry: "dag_state" } },
      { variable: "step", source: { kind: "stage_output", stage: "plan" } },
    ],
    schema: closed(
      {
        status: { type: "string", enum: ["proved", "computed", "partial", "failed", "refuted"] },
        artifact_kind: { type: "string", enum: ["lean4", "cas", "python", "prose"] },
        artifact: { type: "string" },
        reproduction_command: { type: "string" },
        summary: { type: "string" },
        claims: {
          type: "array",
          items: closed(
            { statement: { type: "string" }, confidence: { type: "number", minimum: 0, maximum: 1 }, depends_on: { type: "array", items: { type: "string" } } },
            ["statement", "confidence", "depends_on"],
          ),
        },
        references: {
          type: "array",
          items: closed({ locator: { type: "string" }, title: { type: "string" }, used_for: { type: "string" } }, ["locator", "title", "used_for"]),
        },
        obstructions: {
          type: "array",
          items: closed({ kind: { type: "string", enum: ["barrier", "conditional_barrier"] }, statement: { type: "string" } }, ["kind", "statement"]),
        },
        self_reported_confidence: { type: "number", minimum: 0, maximum: 1 },
      },
      ["status", "artifact_kind", "artifact", "reproduction_command", "summary", "claims", "references", "obstructions", "self_reported_confidence"],
    ),
    retry_feedback:
      "Your output did not pass the attempt contract. Re-emit exactly one JSON object with no code fence and no prose. Every reference locator must resolve to a record whose title matches what you wrote; drop any you cannot resolve. status must agree with what the artifact check reports: a script that fails is partial or failed, never computed.",
    validators: [
      { kind: "regex", path: "/status", pattern: "^(proved|computed|partial|failed|refuted)$" },
      { kind: "regex", path: "/artifact_kind", pattern: "^(lean4|cas|python|prose)$" },
      { kind: "range", path: "/self_reported_confidence", min: 0, max: 1 },
      { kind: "named", validator_name: "fpl.formal_artifact_check", args: { artifact_path: "/artifact", kind_path: "/artifact_kind", command_path: "/reproduction_command", status_path: "/status", runners: { lean4: "lake env lean", cas: "/usr/bin/gp -q -f", python: "/usr/bin/python3 -I" }, prose_allowed_for: ["partial", "failed"] } },
      { kind: "named", validator_name: "fpl.reference_resolves", args: { path: "/references", locator_field: "locator", title_field: "title", resolvers: ["doi.org", "arxiv.org", "https"], title_match: "normalized-exact" } },
    ],
  },
  {
    slug: "audit",
    position: 2,
    agent: AGENT_FABLE_ID,
    template: "audit",
    timeout_ms: 900_000,
    bindings: [
      { variable: "acceptance_criterion", source: { kind: "pipeline_input", input: "acceptance_criterion" } },
      { variable: "step", source: { kind: "stage_output", stage: "plan" } },
      { variable: "attempt", source: { kind: "stage_output", stage: "attempt" } },
    ],
    schema: closed(
      {
        verdict: { type: "string", enum: ["register", "reject", "escalate"] },
        findings: {
          type: "array",
          items: closed({ error_class: { type: "string", enum: [...ERROR_CLASSES] }, location: { type: "string" }, note: { type: "string" } }, ["error_class", "location", "note"]),
        },
        reproduced: { type: "boolean" },
        notes: { type: "string" },
      },
      ["verdict", "findings", "reproduced", "notes"],
    ),
    retry_feedback:
      "Your output did not pass the audit contract. Re-emit exactly one JSON object with no code fence and no prose. verdict is one of register|reject|escalate; every finding's error_class is one of the nine Silent Acceptance identifiers.",
    validators: [
      { kind: "regex", path: "/verdict", pattern: "^(register|reject|escalate)$" },
      { kind: "named", validator_name: "fpl.error_class_vocabulary", args: { path: "/findings", field: "error_class", allowed: [...ERROR_CLASSES] } },
    ],
  },
  {
    slug: "register",
    position: 3,
    agent: AGENT_FABLE_ID,
    template: "register",
    timeout_ms: 1_200_000,
    bindings: [
      { variable: "pursuit_id", source: { kind: "pipeline_input", input: "pursuit_id" } },
      { variable: "proofs_workbook_id", source: { kind: "pipeline_input", input: "proofs_workbook_id" } },
      { variable: "knowledge_workbook_id", source: { kind: "pipeline_input", input: "knowledge_workbook_id" } },
      { variable: "evidence_root", source: { kind: "pipeline_input", input: "evidence_root" } },
      { variable: "step", source: { kind: "stage_output", stage: "plan" } },
      { variable: "attempt", source: { kind: "stage_output", stage: "attempt" } },
      { variable: "audit", source: { kind: "stage_output", stage: "audit" } },
    ],
    schema: closed(
      {
        written: {
          type: "array",
          items: closed({ workbook_id: { type: "string" }, id: { type: "string" }, type_id: { type: "string" } }, ["workbook_id", "id", "type_id"]),
        },
        verification_status_written: { type: "string", enum: ["unverified"] },
        evidence_bundle: {
          anyOf: [{ type: "null" }, closed({ manifest_root: { type: "string" }, bundle_path: { type: "string" } }, ["manifest_root", "bundle_path"])],
        },
        dag_summary: closed(
          { open_leaves: { type: "array", items: { type: "string" } }, goal_status: { type: "string" }, node_count: { type: "integer", minimum: 0 } },
          ["open_leaves", "goal_status", "node_count"],
        ),
        obstructions: {
          type: "array",
          items: closed({ id: { type: "string" }, kind: { type: "string" }, statement: { type: "string" } }, ["id", "kind", "statement"]),
        },
        iteration_note: { type: "string" },
      },
      ["written", "verification_status_written", "evidence_bundle", "dag_summary", "obstructions", "iteration_note"],
    ),
    retry_feedback:
      "Your output did not pass the register contract. Re-emit exactly one JSON object with no code fence and no prose. Every id in written must exist in the named workbook (read it back with fdpm.primitive.get); verification_status_written is always \"unverified\"; a verdict is never yours to write.",
    validators: [
      { kind: "regex", path: "/verification_status_written", pattern: "^unverified$" },
      { kind: "named", validator_name: "fpl.written_ids_exist", args: { path: "/written", lookup: "fdpm.primitive.get", require_nonempty_when: { stage: "audit", path: "/verdict", equals: "register" } } },
      { kind: "named", validator_name: "fpl.producer_status_guard", args: { path: "/written", lookup: "fdpm.primitive.get", forbidden: { "recrt:ProofNode": { verification_status: ["cas_checked", "proof_witnessed", "axiom"] }, "recrt:Claim": { claim_status: ["verified", "established"] }, "lkb:Claim": { status: ["accepted", "rejected"] } }, forbidden_types: ["recrt:EvidenceBundle"] } },
      { kind: "named", validator_name: "fpl.evidence_bundle_manifest", args: { path: "/evidence_bundle", hash_algorithm: "sha256", line_format: "sha256  path", root: "sha256 over the sorted lines" } },
    ],
  },
];

// ── Loop policy ────────────────────────────────────────────────────────────

export const LOOP = {
  max_iterations: 12,
  stop_when: "any",
  on_exhausted: "return_last",
  max_total_tokens: 3_000_000,
  max_wall_clock_ms: 21_600_000,
  max_model_calls: 96,
  max_cost_usd: 200,
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
  { name: "dag_state", captures: "register", source_path: "/dag_summary", value_type: "json", initial_value: JSON.stringify({ open_leaves: [], goal_status: "unverified", node_count: 0 }), carry_mode: "replace", max_serialized_chars: 16_000 },
  { name: "obstruction_log", captures: "register", source_path: "/obstructions", value_type: "json", initial_value: "[]", carry_mode: "replace", max_serialized_chars: 16_000 },
  { name: "iteration_log", captures: "register", source_path: "/iteration_note", value_type: "string", initial_value: JSON.stringify(""), carry_mode: "append", max_serialized_chars: 64_000 },
];
const carryId = (name: string): string => `lf:carry:fpl-${name}`;

interface StopDef {
  id: string;
  observes: StageSlug;
  fields: Record<string, unknown>;
}
const STOPS: StopDef[] = [
  { id: "target-verified", observes: "plan", fields: { condition_id: "target_verified", kind: "field_equals", terminal_state: "success", path: "/stop_reason", match_value: JSON.stringify("target_verified") } },
  { id: "blocked", observes: "plan", fields: { condition_id: "blocked", kind: "field_equals", terminal_state: "blocked", path: "/stop_reason", match_value: JSON.stringify("blocked") } },
  { id: "approval-required", observes: "plan", fields: { condition_id: "approval_required", kind: "field_equals", terminal_state: "approval_required", path: "/stop_reason", match_value: JSON.stringify("approval_required") } },
  { id: "clean-noop", observes: "plan", fields: { condition_id: "clean_noop", kind: "field_equals", terminal_state: "clean_noop", path: "/stop_reason", match_value: JSON.stringify("clean_noop") } },
  { id: "stagnated", observes: "attempt", fields: { condition_id: "stagnated", kind: "unchanged", terminal_state: "stagnated", window: 3, observation_count: 3 } },
];
const stopId = (id: string): string => `lf:stop:fpl-${id}`;

// ── Examples ───────────────────────────────────────────────────────────────

const CERTIFY_STEP = {
  title: "Certify the challenge instance",
  kind: "computation",
  instructions:
    "Using the parameters in fdpm-cli/research/ecdlp/challenge.json (p, a, b, P, Q, n, h), check that p and n are prime, the curve y^2 = x^3 + a x + b over F_p is nonsingular, P and Q lie on it, [n]P = [n]Q = O, and #E(F_p) = h*n.",
  success_test: "A PARI/GP script over exact integers prints 1 for the conjunction of all checks and exits 0.",
};
const CERTIFY_ARTIFACT =
  'read("challenge.gp"); E = ellinit([a, b], p); print(isprime(p) && isprime(n) && E.disc != 0 && ellisoncurve(E, P) && ellisoncurve(E, Q) && ellmul(E, P, n) == [0] && ellmul(E, Q, n) == [0] && ellcard(E) == h * n)';
const CERTIFY_ATTEMPT = {
  status: "computed",
  artifact_kind: "cas",
  artifact: CERTIFY_ARTIFACT,
  reproduction_command: "/usr/bin/gp -q -f certify.gp   # challenge.gp is challenge.json rewritten as GP assignments p=…; a=…; b=…; P=[x,y]; Q=[x,y]; n=…; h=…;",
  summary: "All seven instance checks hold under PARI/GP exact arithmetic: p and n prime, nonsingular curve, P and Q on the curve with order n, group order 5n.",
  claims: [
    {
      statement: "p and n are prime; E: y^2 = x^3 + a x + b over F_p is nonsingular; P and Q lie on E and have order n; #E(F_p) = 5n.",
      confidence: 0.97,
      depends_on: ["recrt:proof-node:instance-certified"],
    },
  ],
  references: [],
  obstructions: [],
  self_reported_confidence: 0.97,
};
const EXAMPLES: Array<{ id: string; stage: StageSlug; fields: Record<string, unknown> }> = [
  {
    id: "attempt-instance-certified",
    stage: "attempt",
    fields: {
      example_id: "attempt-instance-certified",
      kind: "golden",
      outcome: "valid",
      stage_id: stageId("attempt"),
      input: `step: ${JSON.stringify(CERTIFY_STEP)}`,
      expected_output: JSON.stringify(CERTIFY_ATTEMPT),
    },
  },
  {
    id: "attempt-fabricated-reference",
    stage: "attempt",
    fields: {
      example_id: "attempt-fabricated-reference",
      kind: "adversarial",
      outcome: "invalid",
      stage_id: stageId("attempt"),
      input: `step: ${JSON.stringify(CERTIFY_STEP)}`,
      expected_output: JSON.stringify({
        ...CERTIFY_ATTEMPT,
        references: [
          {
            locator: "doi:10.5555/frontier-ecdlp-2026",
            title: "A polynomial-time index calculus for prime-order elliptic curves over prime fields",
            used_for: "justifies skipping the special-case screen",
          },
        ],
      }),
      reason:
        "fpl.reference_resolves rejects the output: the locator does not resolve to a record carrying that title (ERR_HALLUCINATION). A citation that reads plausibly but cannot be retrieved is exactly the failure the Capability-Detection Asymmetry (Silent Acceptance §7.1) predicts, and it is rejected regardless of how correct the artifact is.",
    },
  },
  {
    id: "register-self-verdict",
    stage: "register",
    fields: {
      example_id: "register-self-verdict",
      kind: "adversarial",
      outcome: "invalid",
      stage_id: stageId("register"),
      input:
        'audit: {"verdict":"register","findings":[],"reproduced":true,"notes":"CAS run reproduced"}; the solver certified the instance and the orchestrator is tempted to record the node as proof_witnessed because the CAS run succeeded.',
      expected_output: JSON.stringify({
        written: [{ workbook_id: PROOFS_WORKBOOK_ID, id: "recrt:proof-node:instance-certified", type_id: "recrt:ProofNode" }],
        verification_status_written: "proof_witnessed",
        evidence_bundle: null,
        dag_summary: { open_leaves: ["recrt:proof-node:special-cases-excluded", "recrt:proof-node:structural-attack"], goal_status: "unverified", node_count: 4 },
        obstructions: [],
        iteration_note: "Instance certified and marked witnessed.",
      }),
      reason:
        "The /verification_status_written regex, the contract's enum and fpl.producer_status_guard all reject a producer-written verdict (ERR_INSTRUCTION). The acceptance authority sits outside the producer's control domain (Silent Acceptance §9.7, Corollary 6); a verification step the agent can perform on itself is silent acceptance with extra steps.",
    },
  },
];
const exampleId = (id: string): string => `lf:example:fpl-${id}`;

// ── Verifiers and oracles (Silent Acceptance v2.1.0 §9.1 items 2 and 7) ────

const HARNESS_DOMAIN = "harness:loop-forward-runtime";
const VERIFIER_LOCATION = "The loop-forward runtime in the fdpm host process that runs the pipeline: it evaluates each stage's lf:OutputContract and lf:OutputValidator records before the output is bound into the next stage or written anywhere. Neither agent holds a write grant on the orchestration workbook, so neither can edit a validator; a validator change is an operator commit to scripts/frontier-proof-loop/seed.ts.";

interface OracleDef {
  slug: string;
  name: string;
  kind: "ground_truth_dataset" | "external_source" | "human_adjudication" | "executable_specification" | "hybrid";
  evidence_source: string;
  version: string;
  control_domain: string;
}
const ORACLES: OracleDef[] = [
  { slug: "declared-contract", name: "Declared stage contract", kind: "executable_specification", evidence_source: "The json_schema, regex patterns and numeric ranges of the lf:OutputContract and lf:OutputValidator records committed in scripts/frontier-proof-loop/seed.ts.", version: VERSION, control_domain: "repo:fdpm-cli (operator commit)" },
  { slug: "proof-assistant-cas", name: "Proof assistant and CAS", kind: "executable_specification", evidence_source: "Lean 4 (lake env lean, in scripts/frontier-proof-loop/fplproofs with mathlib), PARI/GP (/usr/bin/gp -q -f) and Python 3 exact integer arithmetic (/usr/bin/python3 -I), executed under bubblewrap by fpl.formal_artifact_check with the host read-only and no network; the runner versions are pinned by the calibration run that measures against them.", version: "pinned-at-calibration", control_domain: "sandbox:solver-tools" },
  { slug: "external-record-retrieval", name: "External record retrieval", kind: "external_source", evidence_source: "Resolution of each cited locator through doi.org, arxiv.org or HTTPS, and comparison of the retrieved title with the cited title after normalisation.", version: "live-at-check-time", control_domain: "internet:publishers" },
  { slug: "fdpm-store", name: "fdpm workbook store", kind: "ground_truth_dataset", evidence_source: "The pursuit's workbooks read back through the fdpm MCP server (fdpm.primitive.get, fdpm.relation.list), i.e. the append-only operation log replayed by the host.", version: "fdpm-cli 1.3.0", control_domain: "fdpm-host:data-dir" },
  { slug: "operator-adjudication", name: "Operator adjudication", kind: "human_adjudication", evidence_source: "The operator re-runs the artifact, recomputes the evidence-bundle manifest_root from the files, and records a verdict as an appended operation.", version: "protocol in scripts/frontier-proof-loop/README.md", control_domain: "operator-review" },
];

interface VerifierDef {
  slug: string;
  name: string;
  mechanism: string;
  /** lf:OutputValidator / lf:OutputContract ids that implement the mechanism. */
  implemented_by: string[];
  oracles: string[];
  runtime_present: boolean;
}
const regexValidators = (): string[] =>
  STAGES.flatMap((s) => s.validators.map((v, i) => (v.kind === "regex" ? validatorId(s.slug, i) : null)).filter((x): x is string => x !== null));
const namedValidator = (name: (typeof NAMED_VALIDATORS)[number]): string[] =>
  STAGES.flatMap((s) => s.validators.map((v, i) => (v.kind === "named" && v.validator_name === name ? validatorId(s.slug, i) : null)).filter((x): x is string => x !== null));

const VERIFIERS: VerifierDef[] = [
  { slug: "json-contract", name: "JSON contract parse and schema", mechanism: "The output is parsed as one JSON document and validated against the stage's json_schema: root object, additionalProperties false, required keys, enumerations and numeric bounds. A parse failure or a schema violation rejects the output and triggers the contract's retry policy.", implemented_by: STAGE_SLUGS.map(contractId), oracles: ["declared-contract"], runtime_present: true },
  { slug: "closed-vocabulary-regex", name: "Closed-vocabulary regex", mechanism: "Anchored ECMAScript regular expressions over JSON-pointer paths that must hold a value from a closed vocabulary or an id pattern (stop_reason, target_node_id, status, artifact_kind, verdict, verification_status_written).", implemented_by: regexValidators(), oracles: ["declared-contract"], runtime_present: true },
  { slug: "confidence-range", name: "Confidence range", mechanism: "Numeric range check that self_reported_confidence lies in [0,1]. A structural bound only; whether the number tracks reliability is what a calibration run measures.", implemented_by: STAGES.flatMap((s) => s.validators.map((v, i) => (v.kind === "range" ? validatorId(s.slug, i) : null)).filter((x): x is string => x !== null)), oracles: ["declared-contract"], runtime_present: true },
  { slug: "node-exists-in-workbook", name: "Node exists in workbook", mechanism: "fpl.node_exists_in_workbook: the target_node_id is fetched from the pursuit's proof workbook with fdpm.primitive.get and must be a recrt:ProofNode; a missing or mistyped id rejects the plan.", implemented_by: namedValidator("fpl.node_exists_in_workbook"), oracles: ["fdpm-store"], runtime_present: true },
  { slug: "formal-artifact-check", name: "Formal artifact check", mechanism: "fpl.formal_artifact_check: the artifact is executed by the runner for its kind (Lean 4, PARI/GP, Python exact arithmetic) and the exit status must agree with the declared status; proved or computed with a failing artifact is rejected; artifact_kind prose is allowed only with status partial or failed.", implemented_by: namedValidator("fpl.formal_artifact_check"), oracles: ["proof-assistant-cas"], runtime_present: true },
  { slug: "reference-resolves", name: "Reference resolves", mechanism: "fpl.reference_resolves: every cited locator is retrieved (doi.org, arxiv.org, HTTPS) and the retrieved title must match the cited title after normalisation; one unresolvable or mismatching reference rejects the output.", implemented_by: namedValidator("fpl.reference_resolves"), oracles: ["external-record-retrieval"], runtime_present: true },
  { slug: "error-class-vocabulary", name: "Error-class vocabulary", mechanism: "fpl.error_class_vocabulary: every audit finding's error_class must be one of the nine Silent Acceptance §5 identifiers.", implemented_by: namedValidator("fpl.error_class_vocabulary"), oracles: ["declared-contract"], runtime_present: true },
  { slug: "written-ids-exist", name: "Written ids exist", mechanism: "fpl.written_ids_exist: every id the register stage reports as written is fetched from the named workbook with fdpm.primitive.get; the list must be non-empty when the audit verdict was register.", implemented_by: namedValidator("fpl.written_ids_exist"), oracles: ["fdpm-store"], runtime_present: true },
  { slug: "producer-status-guard", name: "Producer status guard", mechanism: "fpl.producer_status_guard: no written recrt:ProofNode carries cas_checked, proof_witnessed or axiom; no recrt:Claim carries verified or established; no lkb:Claim carries accepted or rejected; no recrt:EvidenceBundle is written by the stage. Read from the store, not from the model's report (Silent Acceptance §9.7).", implemented_by: namedValidator("fpl.producer_status_guard"), oracles: ["fdpm-store"], runtime_present: true },
  { slug: "evidence-bundle-manifest", name: "Evidence bundle manifest", mechanism: "fpl.evidence_bundle_manifest: when an evidence bundle is reported, its manifest_root is recomputed over the files under bundle_path (sorted \"sha256  path\" lines over file contents, hashed) and must equal the reported root.", implemented_by: namedValidator("fpl.evidence_bundle_manifest"), oracles: ["fdpm-store", "operator-adjudication"], runtime_present: true },
];

// ── Verification boundaries (Silent Acceptance v2.1.0 §9.1 / §10.1) ────────

const SEVERITY = { low: 1, medium: 2, high: 3, critical: 4 } as const;
type Severity = keyof typeof SEVERITY;

interface RowDef {
  cls: ErrorClass;
  severity: Severity;
  control_objective: string;
  mitigation: string;
  /** Verifier slugs that are this risk's declared, not yet calibrated, compensating controls. */
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
  "No calibration run has measured this verifier's recall or false-positive rate, so under profile:silent-acceptance:2.1 the class is an accepted risk until the first passed sa:CalibrationRun; the declared verifier is the compensating control in the meantime.";
const STRUCTURAL_BACKSTOP =
  "Structural backstop independent of any verifier: nothing either agent writes becomes verified without an operator-appended recrt:EvidenceBundle, and every agent write is per-action approved.";

const row = (cls: ErrorClass, severity: Severity, control_objective: string, mitigation: string, verifiers: string[]): RowDef => ({
  cls,
  severity,
  control_objective,
  mitigation,
  verifiers,
});

const BOUNDARIES: BoundaryDef[] = [
  {
    stage: "plan",
    consumer: {
      name: "Attempt stage and loop stop evaluation",
      intended_use: "The plan output selects the solver's next step and carries the stop_reason the loop ends on.",
      consequence_statement: "An escaped error wastes one iteration (a wrong step) or ends the loop for a wrong reason; nothing the plan emits is written to a workbook.",
      acceptability_definition: "target_node_id names a recrt:ProofNode that exists in the proof workbook, stop_reason is one of the five declared values, and the step is checkable by one artifact.",
    },
    tau: 0.1,
    scope_statement: "The plan stage's JSON output, over all nine intrinsic error classes of Silent Acceptance v2.1.0 §5. A wrong plan costs one iteration; max_iterations (12) and the stagnation stop bound the waste.",
    rows: [
      row("ERR_HALLUCINATION", "high", "Reject a target_node_id that does not exist in the proof workbook.", `Declared verifier: fpl.node_exists_in_workbook against the fdpm store. ${UNCALIBRATED}`, ["node-exists-in-workbook"]),
      row("ERR_OMISSION", "medium", "Reject an output missing stop_reason, target_node_id, step or rationale.", `Declared verifier: the contract's json_schema required keys. ${UNCALIBRATED}`, ["json-contract"]),
      row("ERR_SCHEMA", "medium", "Reject an output that is not one closed JSON object of the declared shape.", `Declared verifier: json_schema with additionalProperties false plus the regex validators. ${UNCALIBRATED}`, ["json-contract", "closed-vocabulary-regex"]),
      row("ERR_TRUNCATION", "low", "Reject an output cut short before the JSON document closes.", `Declared verifier: the JSON parse of the complete output; max_output_tokens is an order of magnitude above the schema's size. ${UNCALIBRATED}`, ["json-contract"]),
      row("ERR_SYCOPHANCY", "low", "Bound preference-driven drift in the plan.", `The plan has no user-preference channel to drift toward and no consumer reads its rationale as evidence; the audit stage and the acceptance authority are downstream of everything the plan influences. ${STRUCTURAL_BACKSTOP}`, []),
      row("ERR_INSTRUCTION", "medium", "Reject stop_reason or target_node_id outside the declared vocabularies.", `Declared verifier: anchored regex on /stop_reason and /target_node_id. ${UNCALIBRATED}`, ["closed-vocabulary-regex"]),
      row("ERR_CALIBRATION", "low", "Nothing to calibrate: the plan emits no confidence value.", `The plan emits no confidence value and no consumer reads one. ${STRUCTURAL_BACKSTOP}`, []),
      row("ERR_SEMANTIC", "medium", "Bound the cost of a misdirected step.", `No verifier can decide whether a step is the right next step; a misdirected step wastes at most one iteration, max_iterations (12) and the stagnation stop (window 3) bound the waste, and the solver reports an ill-posed step as failed. ${STRUCTURAL_BACKSTOP}`, []),
      row("ERR_REASONING", "medium", "Bound the cost of a badly reasoned plan.", `Planning reasoning errors surface as failed attempts at the next stage; nothing from the plan is written to a workbook. ${STRUCTURAL_BACKSTOP}`, []),
    ],
  },
  {
    stage: "attempt",
    consumer: {
      name: "Audit stage and, through the register stage, the proof and knowledge workbooks",
      intended_use: "The attempt output is the artifact, claims and references that, after audit, are registered as unverified proof and knowledge records.",
      consequence_statement: "An escaped error becomes an unverified record with a false artifact, a fabricated citation or an inverted claim; it cannot become verified without the acceptance authority, but it can misdirect later iterations.",
      acceptability_definition: "The artifact executes and its result agrees with the declared status; every reference resolves to a record with the cited title; the output matches the contract.",
    },
    tau: 0.05,
    scope_statement: "The attempt stage's JSON output, over all nine intrinsic error classes. This is the stage whose errors would become false records; the artifact check and the reference resolver are the load-bearing verifiers of the loop and both are indifferent to how the prose reads.",
    rows: [
      row("ERR_HALLUCINATION", "critical", "Reject fabricated references and asserted-but-false results.", `Declared verifiers: fpl.reference_resolves (every locator retrieved, title compared) and fpl.formal_artifact_check (the artifact executed, result compared with status). ${UNCALIBRATED}`, ["reference-resolves", "formal-artifact-check"]),
      row("ERR_OMISSION", "medium", "Reject an output missing any of the nine required keys.", `Declared verifier: the contract's json_schema required keys. ${UNCALIBRATED}`, ["json-contract"]),
      row("ERR_SCHEMA", "medium", "Reject an output that is not one closed JSON object of the declared shape.", `Declared verifier: json_schema with additionalProperties false plus the regex validators on status and artifact_kind. ${UNCALIBRATED}`, ["json-contract", "closed-vocabulary-regex"]),
      row("ERR_TRUNCATION", "medium", "Reject a truncated document or a truncated artifact.", `Declared verifiers: the JSON parse of the complete output, and fpl.formal_artifact_check, which fails a truncated artifact. ${UNCALIBRATED}`, ["json-contract", "formal-artifact-check"]),
      row("ERR_SYCOPHANCY", "medium", "Keep prose agreement non-load-bearing.", `The artifact check is indifferent to agreement, the audit prompt forbids reading the solver's confidence, and every summary enters a workbook as unverified payload. ${STRUCTURAL_BACKSTOP}`, []),
      row("ERR_INSTRUCTION", "medium", "Reject a status or artifact_kind outside the closed sets, and prose where an artifact is required.", `Declared verifiers: anchored regex on /status and /artifact_kind; fpl.formal_artifact_check refuses artifact_kind prose unless status is partial or failed. ${UNCALIBRATED}`, ["closed-vocabulary-regex", "formal-artifact-check"]),
      row("ERR_CALIBRATION", "low", "Bound the confidence number; measure its reliability later.", `The range validator bounds self_reported_confidence to [0,1]; whether the number tracks reliability is what a calibration run measures, and no consumer acts on the number: the acceptance authority uses the artifact check. ${UNCALIBRATED}`, ["confidence-range"]),
      row("ERR_SEMANTIC", "medium", "Keep the artifact, not the paraphrase, load-bearing.", `Only the artifact is trusted; the summary and claim statements enter the proof workbook as unverified payload and the knowledge workbook as proposed claims, and the acceptance authority reads the artifact. ${STRUCTURAL_BACKSTOP}`, []),
      row("ERR_REASONING", "critical", "Reject a proof or computation whose artifact does not check.", `Declared verifier: fpl.formal_artifact_check with Lean 4, PARI/GP or Python exact arithmetic as the oracle; proved or computed with a failing artifact is rejected. ${UNCALIBRATED}`, ["formal-artifact-check"]),
    ],
  },
  {
    stage: "audit",
    consumer: {
      name: "Register stage",
      intended_use: "The audit verdict gates whether the register stage writes anything; its findings are read by the operator at escalation time.",
      consequence_statement: "A wrong 'register' yields an unverified node the acceptance authority must still witness; a wrong 'reject' costs one retry; a wrong 'escalate' costs operator attention. The audit is a filter, not an authority.",
      acceptability_definition: "verdict is one of register|reject|escalate, every finding names one of the nine error classes, and reproduced is true only if the reproduction command was re-run.",
    },
    tau: 0.1,
    scope_statement: "The audit stage's JSON output, over all nine intrinsic error classes. The audit is a second model reading a first model's output; its own errors are bounded by what a wrong verdict can do.",
    rows: [
      row("ERR_HALLUCINATION", "medium", "Bound a hallucinated finding or a false 'reproduced'.", `A hallucinated finding at worst rejects a valid attempt (one retry); a false 'reproduced: true' changes nothing, because the register stage writes unverified nodes either way and the acceptance authority re-runs the artifact. ${STRUCTURAL_BACKSTOP}`, []),
      row("ERR_OMISSION", "low", "Reject an output missing verdict, findings, reproduced or notes.", `Declared verifier: the contract's json_schema required keys. ${UNCALIBRATED}`, ["json-contract"]),
      row("ERR_SCHEMA", "low", "Reject an output that is not one closed JSON object of the declared shape.", `Declared verifiers: json_schema with additionalProperties false, the regex on verdict, and fpl.error_class_vocabulary on every finding. ${UNCALIBRATED}`, ["json-contract", "closed-vocabulary-regex", "error-class-vocabulary"]),
      row("ERR_TRUNCATION", "low", "Reject a truncated document.", `Declared verifier: the JSON parse of the complete output. ${UNCALIBRATED}`, ["json-contract"]),
      row("ERR_SYCOPHANCY", "medium", "Keep model-to-model agreement from counting as evidence.", `The audit prompt forbids reading the solver's confidence and the verdict is a filter; the acceptance authority, outside both agents, is the control for a sycophantic 'register'. ${STRUCTURAL_BACKSTOP}`, []),
      row("ERR_INSTRUCTION", "medium", "Reject a verdict or an error class outside the closed sets.", `Declared verifiers: anchored regex on /verdict and fpl.error_class_vocabulary. ${UNCALIBRATED}`, ["closed-vocabulary-regex", "error-class-vocabulary"]),
      row("ERR_CALIBRATION", "low", "Nothing to calibrate: the audit emits no confidence value.", `The audit emits no confidence value. ${STRUCTURAL_BACKSTOP}`, []),
      row("ERR_SEMANTIC", "low", "Bound a misread finding.", `Finding notes are read by the operator at escalation time and by no automated consumer. ${STRUCTURAL_BACKSTOP}`, []),
      row("ERR_REASONING", "medium", "Bound a wrongly reasoned verdict.", `Each wrong verdict has a bounded, recoverable consequence: an unverified node, one retry, or operator attention. ${STRUCTURAL_BACKSTOP}`, []),
    ],
  },
  {
    stage: "register",
    consumer: {
      name: "Proof and knowledge workbooks, and the next iteration's carries",
      intended_use: "The register stage writes unverified records through the fdpm MCP and reports what it wrote; its report seeds the carries the next iteration starts from.",
      consequence_statement: "A reported write that did not happen, a producer-written verdict, or a wrong evidence-bundle root would corrupt the record other agents and the operator read and the carry state of every later iteration.",
      acceptability_definition: "Every reported id exists in the named workbook, no written record carries a verdict, and any reported manifest_root recomputes from the files.",
    },
    tau: 0.01,
    scope_statement: "The register stage's JSON output, over all nine intrinsic error classes. This stage acts through tools; its verifiers check the store, not the prose.",
    rows: [
      row("ERR_HALLUCINATION", "critical", "Reject a reported write that did not happen or a root that does not match the files.", `Declared verifiers: fpl.written_ids_exist (every id fetched with fdpm.primitive.get) and fpl.evidence_bundle_manifest (manifest_root recomputed from the files). ${UNCALIBRATED}`, ["written-ids-exist", "evidence-bundle-manifest"]),
      row("ERR_OMISSION", "high", "Reject an empty write after a 'register' verdict, or a missing summary.", `Declared verifiers: fpl.written_ids_exist requires a non-empty list when the audit verdict was register; the json_schema requires dag_summary, obstructions and iteration_note. ${UNCALIBRATED}`, ["written-ids-exist", "json-contract"]),
      row("ERR_SCHEMA", "medium", "Reject an output that is not one closed JSON object of the declared shape.", `Declared verifiers: json_schema with additionalProperties false plus the regex on verification_status_written. ${UNCALIBRATED}`, ["json-contract", "closed-vocabulary-regex"]),
      row("ERR_TRUNCATION", "medium", "Reject a truncated document.", `Declared verifier: the JSON parse of the complete output. ${UNCALIBRATED}`, ["json-contract"]),
      row("ERR_SYCOPHANCY", "low", "No preference channel exists at this stage.", `The register stage has no evaluative output; it reports what it wrote and the store is the oracle for that. ${STRUCTURAL_BACKSTOP}`, []),
      row("ERR_INSTRUCTION", "critical", "Reject any producer-written verdict (Silent Acceptance §9.7, Corollary 6).", `Declared verifiers: fpl.producer_status_guard reads every written record back from the store and rejects cas_checked, proof_witnessed, axiom, verified, established, accepted or rejected, and any recrt:EvidenceBundle written by the stage; the regex on verification_status_written rejects the report. ${UNCALIBRATED}`, ["producer-status-guard", "closed-vocabulary-regex"]),
      row("ERR_CALIBRATION", "low", "Nothing to calibrate: no confidence value is emitted.", `No confidence value is emitted. ${STRUCTURAL_BACKSTOP}`, []),
      row("ERR_SEMANTIC", "medium", "Keep payload paraphrase from becoming a verified fact.", `Payload text written to nodes is unverified by construction (verification_status unverified, claim_status stated, lkb status proposed); the acceptance authority reads the artifact before any status changes. ${STRUCTURAL_BACKSTOP}`, []),
      row("ERR_REASONING", "medium", "Reject structurally wrong DAG edges; bound semantically wrong ones.", `The re-crt profile validates every edge the stage writes (support acyclicity, leaf rule, type/β invariant, defeat bipartiteness) and rejects a structurally wrong one; a semantically wrong edge is an unverified node the acceptance authority sees. ${STRUCTURAL_BACKSTOP}`, []),
    ],
  },
];

// ── Orchestration workbook ─────────────────────────────────────────────────

export function orchestrationSeed(): WorkbookSeed {
  const primitives: PrimitiveSpec[] = [];
  const relations: RelationSpec[] = [];

  // Templates and their variables.
  for (const t of TEMPLATES) {
    const messages = templateMessages(t.slug);
    primitives.push(
      lf(templateId(t.slug), LF.PromptTemplate, {
        ...governed(t.name, t.description, ["frontier-proof", t.role === "system" ? "system" : "task"]),
        locale: "en-US",
        messages: JSON.stringify(messages),
        message_count: messages.length,
        content_sensitivity: "internal",
      }),
    );
    for (const v of t.variables) {
      const id = templateVarId(t.slug, v.name);
      primitives.push(variableSpec(id, v));
      relations.push(rel(LFR.TemplateDeclaresVariable, templateId(t.slug), id));
    }
  }

  // Agents.
  primitives.push(
    lf(AGENT_FABLE_ID, LF.AgentDefinition, {
      ...governed("anthropic-fable", "Orchestrator. Plans the next step, audits the solver's output adversarially, and registers advances as unverified records through the fdpm MCP under per-action approval. Holds no acceptance authority.", ["orchestrator", "frontier-proof"]),
      provider: "anthropic",
      model_id: "claude-fable-5-1",
      sampling_kind: "deterministic",
      sampling_seed: 1,
      max_output_tokens: 16_000,
      stop_sequences: [],
    }),
    lf(AGENT_ASTRA_ID, LF.AgentDefinition, {
      ...governed("gpt-astra", "Solver: the Codex CLI running gpt-6-astra, the model pinned in the operator's ~/.codex/config.toml. Produces checkable artifacts (Lean 4, PARI/GP, SymPy, exact-integer Python) for one step at a time. Invoked through scripts/codex-delegate.sh in attempt mode; read-only on the tree and on every workbook; never writes a verdict.", ["solver", "frontier-proof", "codex-cli"]),
      provider: "openai",
      model_id: "gpt-6-astra",
      sampling_kind: "deterministic",
      sampling_seed: 1,
      max_output_tokens: 32_000,
      stop_sequences: [],
    }),
  );
  relations.push(rel(LFR.AgentUsesSystemTemplate, AGENT_FABLE_ID, templateId("fable-system")), rel(LFR.AgentUsesSystemTemplate, AGENT_ASTRA_ID, templateId("astra-system")));
  for (const [agent, grants] of [
    [AGENT_FABLE_ID, FABLE_GRANTS],
    [AGENT_ASTRA_ID, ASTRA_GRANTS],
  ] as const) {
    for (const g of grants) {
      primitives.push(lf(grantId(g.slug), LF.ToolGrant, { tool_name: g.tool_name, authority: g.authority, approval: g.approval }));
      relations.push(rel(LFR.AgentGrantsTool, agent, grantId(g.slug)));
    }
  }

  // Pipeline and inputs.
  primitives.push(
    lf(PIPELINE_ID, LF.Pipeline, {
      ...governed(
        "frontier-proof-loop",
        "Four stages per iteration: the orchestrator plans one checkable step from the proof workbook, the solver attempts it and returns an artifact, the orchestrator audits the artifact adversarially, and the orchestrator registers the advance as unverified records in the pursuit's re-crt and logical-knowledge-base workbooks. No stage can mark anything verified: the acceptance authority is the operator, outside both agents, and records verdicts with evidence bundles it computed itself.",
        ["frontier-proof", "mathematics", "physics", "science", "silent-acceptance"],
      ),
      stage_count: STAGES.length,
      example_count: EXAMPLES.length,
    }),
  );
  for (const v of PIPELINE_INPUTS) {
    primitives.push(variableSpec(inputId(v.name), v));
    relations.push(rel(LFR.PipelineDeclaresInput, PIPELINE_ID, inputId(v.name)));
  }

  // Stages, bindings, contracts, validators.
  for (const s of STAGES) {
    primitives.push(lf(stageId(s.slug), LF.Stage, { stage_name: s.slug, position: s.position, system_prompt_mode: "inherit", timeout_ms: s.timeout_ms, binding_count: s.bindings.length }));
    relations.push(rel(LFR.PipelineHasStage, PIPELINE_ID, stageId(s.slug)), rel(LFR.StageRunsAgent, stageId(s.slug), s.agent), rel(LFR.StageUsesTaskTemplate, stageId(s.slug), templateId(s.template)));
    for (const b of s.bindings) {
      const id = `lf:binding:fpl-${s.slug}-${b.variable}`;
      const fields: Record<string, unknown> = { variable_name: b.variable, source_kind: b.source.kind };
      if (b.source.kind === "pipeline_input") fields["input_name"] = b.source.input;
      if (b.source.kind === "stage_output") fields["source_path"] = "";
      if (b.source.kind === "carried") fields["carry_name"] = b.source.carry;
      primitives.push(lf(id, LF.VariableBinding, fields));
      relations.push(rel(LFR.StageHasBinding, stageId(s.slug), id));
      if (b.source.kind === "stage_output") relations.push(rel(LFR.BindingReadsStage, id, stageId(b.source.stage)));
      if (b.source.kind === "carried") relations.push(rel(LFR.BindingReadsCarry, id, carryId(b.source.carry)));
    }
    primitives.push(lf(contractId(s.slug), LF.OutputContract, { format: "json", json_schema: JSON.stringify(s.schema), validator_count: s.validators.length, on_invalid: "retry", max_attempts: 2, retry_feedback: s.retry_feedback }));
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
    primitives.push(lf(carryId(c.name), LF.Carry, { carry_name: c.name, source_path: c.source_path, value_type: c.value_type, initial_value: c.initial_value, carry_mode: c.carry_mode, max_serialized_chars: c.max_serialized_chars }));
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
  const ACCEPTANCE_DATASET = "fdpm-cli/research/ecdlp (challenge.json, verify.py, results.json, manifest.json)";
  primitives.push(
    lf(EVAL_ID, LF.EvaluationPolicy, {
      metric: "authority_accepted_claim_ratio",
      unit: "ratio",
      comparator: "gte",
      threshold: 0.8,
      development_dataset_ref: "fdpm-cli/research/ecdlp/deep-20260904 (operator's in-progress ECDLP rounds: results, proofs, manifests)",
      acceptance_dataset_ref: ACCEPTANCE_DATASET,
    }),
  );
  relations.push(rel(LFR.PipelineHasEvaluation, PIPELINE_ID, EVAL_ID));

  // Knowledge-base declarations of the agents and the operator.
  primitives.push(
    { id: "lkb:kb:frontier-proof-loop", type: "lkb:LogicalKnowledgeBase", fields: { source_id: "frontier-proof-loop-orchestration", schemaVersion: "1.0.0", semanticModelVersion: "1.0.0", title: "Frontier proof loop — orchestration knowledge base", description: "Declarations of the two agents and the operator, so pipeline agents and the acceptance authority can be named by provenance edges." } },
    { id: LKB_FABLE_ID, type: "lkb:AgentDeclaration", fields: { source_id: "agent:anthropic-fable", name: "AnthropicFable", agentKind: "software", description: "Orchestrator agent (claude-fable-5-1). Producer of plans, audits and register operations; never an acceptance authority." } },
    { id: LKB_ASTRA_ID, type: "lkb:AgentDeclaration", fields: { source_id: "agent:gpt-astra", name: "GPTAstra", agentKind: "software", description: "Solver agent. Producer of artifacts and claims; read-only on every workbook." } },
    { id: LKB_OPERATOR_ID, type: "lkb:AgentDeclaration", fields: { source_id: "agent:operator", name: "OperatorAcceptanceAuthority", agentKind: "person", description: "The only party that records a verdict: recomputes evidence-bundle roots, re-runs artifacts, and patches verification_status in the proof workbook." } },
  );
  relations.push(rel(FPL_R.AgentDeclaredAs, AGENT_FABLE_ID, LKB_FABLE_ID), rel(FPL_R.AgentDeclaredAs, AGENT_ASTRA_ID, LKB_ASTRA_ID));

  // Acceptance authority, oracles, verifiers.
  primitives.push(
    sa(AUTHORITY_ID, SA.AcceptanceAuthority, {
      name: "Operator acceptance authority",
      control_domain: "operator-review",
      authorization_ref: "fdpm-cli/scripts/frontier-proof-loop/README.md, section 'Acceptance authority'; the fdpm MCP per-action approval gate on every agent write is the mechanism that keeps agents out of this domain.",
      verdict_store_location: "The append-only fdpm operation logs: the pursuit's re-crt workbook (recrt:EvidenceBundle, recrt:EvidencedBy, verification_status patches) and this workbook (sa:ClassVerdict, sa:AcceptanceDecision). Readable by any party with the data dir, outside the agent runtimes.",
      is_append_only: true,
      is_outside_runtime_readable: true,
      owner: SA_OWNER,
    }),
  );
  relations.push(rel(FPL_R.AuthorityDeclaredAs, AUTHORITY_ID, LKB_OPERATOR_ID));
  for (const o of ORACLES) {
    primitives.push(sa(oracleId(o.slug), SA.Oracle, { name: o.name, kind: o.kind, evidence_source: o.evidence_source, version: o.version, control_domain: o.control_domain, is_independent_from_verifier: true, owner: SA_OWNER }));
  }
  for (const v of VERIFIERS) {
    primitives.push(
      sa(verifierId(v.slug), SA.Verifier, {
        name: v.name,
        mechanism: v.mechanism,
        implementation_ref: v.slug.startsWith("json-contract") || v.slug === "closed-vocabulary-regex" || v.slug === "confidence-range"
          ? `Declared by ${v.implemented_by.join(", ")} in scripts/frontier-proof-loop/seed.ts; evaluated by src/loop/contract.ts (typed parse, regex and range arms) on every stage output.`
          : `Declared by ${v.implemented_by.join(", ")} in scripts/frontier-proof-loop/seed.ts; implemented as the named validator of the same name in src/loop/named.ts and run by src/loop/executor.ts on every attempt. Tested on failing input in tests/loop/checks.test.ts. The boundary stays draft until a calibration run has measured it.`,
        version: VERSION,
        location: VERIFIER_LOCATION,
        control_domain: HARNESS_DOMAIN,
        is_producer_writable: false,
        owner: SA_OWNER,
      }),
    );
    for (const target of v.implemented_by) relations.push(rel(FPL_R.VerifierImplementedBy, verifierId(v.slug), target));
    for (const o of v.oracles) relations.push(rel(FPL_R.VerifierChecksAgainst, verifierId(v.slug), oracleId(o)));
  }

  // Per-stage consumer, pinned configuration, boundary, nine coverage rows and their accepted risks.
  for (const b of BOUNDARIES) {
    const stage = STAGES.find((s) => s.slug === b.stage)!;
    const agentId = stage.agent;
    const isFable = agentId === AGENT_FABLE_ID;
    const systemTemplate = isFable ? "fable-system" : "astra-system";
    const grants = isFable ? FABLE_GRANTS : ASTRA_GRANTS;
    const promptSet = { system: templateMessages(systemTemplate), task: templateMessages(stage.template) };
    const contextPolicy = { loop: LOOP, carries: CARRIES, bindings: stage.bindings, timeout_ms: stage.timeout_ms };

    primitives.push(
      sa(consumerId(b.stage), SA.Consumer, { ...b.consumer, owner: SA_OWNER }),
      sa(configurationId(b.stage), SA.SolverConfiguration, {
        solver_configuration_id: `${isFable ? "anthropic/claude-fable-5-1" : "openai/gpt-6-astra"}+loop-forward-2.0+fdpm-mcp-1.3.0+${systemTemplate}@${VERSION}+${stage.template}@${VERSION}`,
        model_id: isFable ? "anthropic/claude-fable-5-1 (deterministic, seed 1)" : "openai/gpt-6-astra via codex-cli 0.153.2 (the model pinned in ~/.codex/config.toml; sampling is the service's)",
        harness_id: "loop-forward-2.0 runtime over fdpm-mcp 1.3.0 (manifest 0.6.0)",
        context_policy_digest: sha256(JSON.stringify(contextPolicy)),
        tool_set_digest: sha256(JSON.stringify(grants)),
        prompt_set_digest: sha256(JSON.stringify(promptSet)),
        producer_control_domain: isFable ? "agent-runtime:anthropic-fable" : "agent-runtime:gpt-astra",
        configured_at: CREATED_AT,
        created_by: "build-frontier-proof-loop.ts",
      }),
      sa(boundaryId(b.stage), SA.VerificationBoundary, {
        boundary_name: `${b.stage} stage boundary`,
        protocol_version: SILENT_ACCEPTANCE_VERSION,
        status: "draft",
        scope_statement: b.scope_statement,
        distribution_ref: ACCEPTANCE_DATASET,
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
      rel(FPL_R.BoundaryGuardsStage, boundaryId(b.stage), stageId(b.stage)),
      rel(FPL_R.ConfigurationRunsAgent, configurationId(b.stage), agentId),
      rel(FPL_R.ConfigurationUsesTemplate, configurationId(b.stage), templateId(systemTemplate)),
      rel(FPL_R.ConfigurationUsesTemplate, configurationId(b.stage), templateId(stage.template)),
    );
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
      relations.push(rel(SAR.BoundaryDeclaresCoverage, boundaryId(b.stage), coverageId(b.stage, r.cls)), rel(SAR.CoverageAcceptsRisk, coverageId(b.stage, r.cls), riskId(b.stage, r.cls)));
      for (const v of r.verifiers) relations.push(rel(FPL_R.RiskMitigatedByVerifier, riskId(b.stage, r.cls), verifierId(v)));
    }
  }

  // The first pursuit.
  primitives.push({
    id: PURSUIT_ID,
    type: FPL.Pursuit,
    fields: {
      title: "ECDLP — recover the in-range scalar x with [x]P = Q (FrontierMath open problem)",
      domain: "mathematics",
      statement:
        "Let E: y^2 = x^3 + a x + b be an elliptic curve over the prime field F_p, and let P and Q be points on E of prime order n with cofactor h = 5, so that #E(F_p) = 5n. Find the integer x with 0 ≤ x < n such that [x]P = Q. The parameters p, a, b, P, Q, n, h are the operator's copy of the FrontierMath open-problem instance at fdpm-cli/research/ecdlp/challenge.json; they are not restated here so that no digit is transcribed by a model.",
      target_kind: "computation",
      acceptance_criterion:
        "An integer x with 0 ≤ x < n such that [x]P = Q, re-verified by an independent script over exact integers (fdpm-cli/research/ecdlp/verify.py or an equivalent the operator runs), with the run captured in an recrt:EvidenceBundle whose manifest_root the operator recomputed from the files. Certification of the instance (primality of p and n, nonsingularity, point orders, #E = 5n) is a prerequisite step, not the criterion.",
      status: "open",
      proofs_workbook_id: PROOFS_WORKBOOK_ID,
      knowledge_workbook_id: KNOWLEDGE_WORKBOOK_ID,
      evidence_root: EVIDENCE_ROOT,
      external_refs: [
        "https://epoch.ai/frontiermath/open-problems/elliptic-curve-discrete-logarithm",
        "https://www.math.auckland.ac.nz/~sgal018/crypto-book/ch14.pdf",
        "https://cacr.uwaterloo.ca/hac/about/chap3.pdf",
      ],
      opened_at: TODAY,
      owner: SA_OWNER,
    },
  });
  relations.push(rel(FPL_R.PipelinePursues, PIPELINE_ID, PURSUIT_ID));

  return {
    header: {
      id: ORCHESTRATION_WORKBOOK_ID,
      name: "Frontier Proof Loop — Anthropic Fable orchestrating GPT Astra",
      profile: PROFILE_ID,
      description:
        "Loop-forward pipeline in which an orchestrator agent commands a solver agent on frontier proofs, with the Silent Acceptance v2.1.0 verification boundary declared per stage and the registry of pursuits whose state lives in re-crt and logical-knowledge-base workbooks.",
    },
    primitives,
    relations,
  };
}

// ── Proof-state workbook (profile:re-crt:6.2) ──────────────────────────────

const PN = (slug: string): string => `recrt:proof-node:${slug}`;
const ON = (slug: string): string => `recrt:obstruction-node:${slug}`;
const REASON_DAG = "recrt:reason-dag:ecdlp";
const OBSTRUCTION_DAG = "recrt:obstruction-dag:ecdlp";

export function proofsSeed(): WorkbookSeed {
  const node = (slug: string, node_type: string, payload: string): PrimitiveSpec => ({ id: PN(slug), type: "recrt:ProofNode", fields: { id: slug, node_type, payload, verification_status: "unverified" } });
  const primitives: PrimitiveSpec[] = [
    { id: REASON_DAG, type: "recrt:ReasonDAG", fields: { id: "ecdlp", title: "ECDLP challenge — reason DAG" } },
    { id: OBSTRUCTION_DAG, type: "recrt:ObstructionDAG", fields: { id: "ecdlp", title: "ECDLP challenge — obstruction DAG" } },
    node("goal", "goal", "Exhibit an integer x with 0 ≤ x < n and [x]P = Q for the instance in fdpm-cli/research/ecdlp/challenge.json."),
    node("instance-certified", "open", "Certify the instance: p and n prime, the curve nonsingular, P and Q on the curve with [n]P = [n]Q = O, and #E(F_p) = 5n, by an exact-arithmetic script."),
    node("special-cases-excluded", "open", "Screen the known structural weaknesses: anomalous curve (#E = p), small embedding degree (MOV / Frey–Rück transfer), and j ∈ {0, 1728} special structure; record which are excluded and which remain."),
    node("structural-attack", "open", "Find exploitable structure that beats the generic bound: a weak factorisation of n − 1 or n + 1 usable through a transfer, a lift with small cofactor, an isogeny to a weak curve, or side information about x."),
    {
      id: ON("generic-group-barrier"),
      type: "recrt:ObstructionNode",
      fields: {
        id: "generic-group-barrier",
        obstruction_type: "barrier",
        payload: "Generic-group lower bound: any algorithm that uses only the group operations needs Ω(√n) of them (Shoup, 'Lower bounds for discrete logarithms and related problems', EUROCRYPT 1997). For this n that is on the order of 2^127 operations, so no generic method reaches x; any route must exploit structure of this specific curve.",
        blocking_strength: 1,
      },
    },
    { id: "recrt:theorem:ecdlp-scalar-unique", type: "recrt:Theorem", fields: { id: "ecdlp-scalar-unique", name: "Uniqueness of the in-range scalar", statement: "If P has prime order n and Q ∈ ⟨P⟩, there is exactly one integer x with 0 ≤ x < n and [x]P = Q.", falsifier: "[n]Q ≠ O (Q ∉ ⟨P⟩), or the order of P is not n." } },
    { id: "recrt:rule-basis:ecdlp-calculus", type: "recrt:RuleBasis", fields: { id: "ecdlp-calculus", name: "ECDLP instance calculus", is_complete: false } },
    { id: "recrt:rule:cas-certified-computation", type: "recrt:Rule", fields: { id: "cas-certified-computation", name: "CAS-certified computation", statement: "A computational claim is established when an independent exact-arithmetic script reproduces it and the run is captured in an recrt:EvidenceBundle whose manifest_root the acceptance authority recomputed." } },
    { id: "recrt:rule:published-theorem", type: "recrt:Rule", fields: { id: "published-theorem", name: "Published theorem citation", statement: "A step may rest on a published theorem cited by a resolvable locator; the node stays unverified until the acceptance authority checks the citation and its applicability." } },
    { id: "recrt:side-condition:in-range", type: "recrt:SideCondition", fields: { id: "in-range", statement: "0 ≤ x < n" } },
    {
      id: "recrt:claim:c1",
      type: "recrt:Claim",
      fields: {
        id: "c1",
        claim_number: 1,
        statement: "The challenge parameters (p, a, b, P, Q, n, h) define a nonsingular curve over F_p on which P and Q have prime order n and #E(F_p) = 5n.",
        claim_status: "stated",
        confidence: "medium",
        falsifier: "PARI/GP ellinit, ellisoncurve, ellmul or ellcard disagree with the stated orders, or p or n fails a primality proof.",
      },
    },
  ];
  const relations: RelationSpec[] = [
    rel("recrt:ProofSupports", PN("instance-certified"), PN("goal")),
    rel("recrt:ProofSupports", PN("special-cases-excluded"), PN("goal")),
    rel("recrt:ProofSupports", PN("structural-attack"), PN("goal")),
    ...["goal", "instance-certified", "special-cases-excluded", "structural-attack"].map((s) => rel("recrt:ProofInDAG", PN(s), REASON_DAG)),
    rel("recrt:ProofRootOf", PN("goal"), REASON_DAG),
    rel("recrt:ObstructionInDAG", ON("generic-group-barrier"), OBSTRUCTION_DAG),
    rel("recrt:ObstructionRootOf", ON("generic-group-barrier"), OBSTRUCTION_DAG),
    rel("recrt:ExplainedByBarrier", PN("structural-attack"), ON("generic-group-barrier")),
    rel("recrt:HasSideCondition", PN("goal"), "recrt:side-condition:in-range"),
    rel("recrt:BasisHasRule", "recrt:rule-basis:ecdlp-calculus", "recrt:rule:cas-certified-computation"),
    rel("recrt:BasisHasRule", "recrt:rule-basis:ecdlp-calculus", "recrt:rule:published-theorem"),
  ];
  return {
    header: { id: PROOFS_WORKBOOK_ID, name: "ECDLP pursuit — proof state (re-crt)", profile: PARENT_RE_CRT, description: "Reason DAG, obstruction DAG, claims and evidence bundles for the ECDLP pursuit. Agents write unverified nodes; the acceptance authority writes verdicts." },
    primitives,
    relations,
  };
}

// ── Knowledge-state workbook (profile:logical-knowledge-base:1.0) ──────────

export function knowledgeSeed(): WorkbookSeed {
  const formula = parseFormula("prop:instance-certified");
  if (!formula.ok) throw new Error(`seed formula failed to parse: ${formula.error} at ${formula.position}`);
  const primitives: PrimitiveSpec[] = [
    { id: "lkb:kb:ecdlp", type: "lkb:LogicalKnowledgeBase", fields: { source_id: "ecdlp-frontiermath", schemaVersion: "1.0.0", semanticModelVersion: "1.0.0", title: "ECDLP pursuit — knowledge base", description: "Propositions, claims, arguments and provenance for the ECDLP pursuit. Claims enter as proposed; only the acceptance authority moves one to accepted or rejected." } },
    { id: LKB_FABLE_ID, type: "lkb:AgentDeclaration", fields: { source_id: "agent:anthropic-fable", name: "AnthropicFable", agentKind: "software" } },
    { id: LKB_ASTRA_ID, type: "lkb:AgentDeclaration", fields: { source_id: "agent:gpt-astra", name: "GPTAstra", agentKind: "software" } },
    { id: LKB_OPERATOR_ID, type: "lkb:AgentDeclaration", fields: { source_id: "agent:operator", name: "OperatorAcceptanceAuthority", agentKind: "person" } },
    { id: "lkb:prop:scalar-found", type: "lkb:PropositionDeclaration", fields: { source_id: "prop:scalar-found", name: "ScalarFound", description: "There is an integer x with 0 ≤ x < n and [x]P = Q for the challenge instance." } },
    { id: "lkb:prop:instance-certified", type: "lkb:PropositionDeclaration", fields: { source_id: "prop:instance-certified", name: "InstanceCertified", description: "p and n are prime, the curve is nonsingular, P and Q lie on it with order n, and #E(F_p) = 5n." } },
    { id: "lkb:claim:instance-certified", type: "lkb:Claim", fields: { source_id: "claim:instance-certified", label: "The challenge instance is well-formed", formula: formula.formula, status: "proposed" } },
    { id: "lkb:provenance:challenge-source", type: "lkb:ProvenanceRecord", fields: { source_id: "provenance:challenge-source", sourceDocument: "fdpm-cli/research/ecdlp/challenge.json", sourceFormat: "custom", sourceUri: "https://epoch.ai/frontiermath/open-problems/elliptic-curve-discrete-logarithm", conversionStatus: "native", description: "The operator's copy of the FrontierMath open-problem instance." } },
  ];
  // The lkb:mentions edges are derived data: lkb:val:mentions-current compares
  // the edges on a node with the ones the plugin derives from its formulas,
  // by canonical id. Building them with the plugin's own builder keeps the
  // seed identical to what an import would write.
  const claim = primitives.find((p) => p.id === "lkb:claim:instance-certified")!;
  const mentions: RelationSpec[] = mentionEdges(claim.id, claim.fields as Record<string, unknown>, sourceIdIndex(primitives.map((p) => ({ id: p.id, field_values: p.fields as Record<string, unknown> })))).map((e) => ({
    id: e.id,
    type: e.type_id,
    from: e.source_id,
    to: e.target_id,
    fields: e.field_values as Record<string, unknown>,
  }));
  const relations: RelationSpec[] = [
    ...mentions,
    rel("lkb:provenance", "lkb:claim:instance-certified", "lkb:provenance:challenge-source", { role: "source" }),
  ];
  return {
    header: { id: KNOWLEDGE_WORKBOOK_ID, name: "ECDLP pursuit — knowledge state (logical-knowledge-base)", profile: PARENT_LKB, description: "Declarations, claims, arguments and provenance for the ECDLP pursuit." },
    primitives,
    relations,
  };
}

export function allSeeds(): WorkbookSeed[] {
  return [orchestrationSeed(), proofsSeed(), knowledgeSeed()];
}
