/**
 * `fdpm.loop-forward` MCP prompts — the operating instructions for the
 * loop-forward v2 domain (SPEC-MCP-SERVER §13.5, ADR `decision:0010`).
 *
 * The profile already describes a pipeline and renders five audit views
 * of one. Neither tells an agent how to *build* a pipeline or how to
 * *decide whether one is safe to run*. These two prompts are that layer,
 * and they are skills rather than templates: when to reach for them, the
 * exact call order over real FDPM tools and resources, and the failure
 * modes named by the validator rule ids that actually reject the write.
 *
 * Two properties this file must keep, both enforced by
 * `tests/plugins/loop_forward/prompts.test.ts`:
 *
 *   - **No drift.** Every `lf:` identifier below is cross-checked against
 *     the plugin's own sources. An instruction that names a renamed type
 *     is worse than silence: it is a confident instruction to write
 *     something the validators will reject.
 *   - **A budget.** A procedural specification sits in the agent's
 *     context on every step of every run, so its size is a per-step
 *     cost. `LOOP_FORWARD_PROMPT_BODY_CEILING_BYTES` is measured, not
 *     aspirational; raising it is a reviewed decision with a CHANGELOG
 *     line, the same discipline the tool catalog and the server
 *     instructions already carry.
 *
 * The call orders below are not stylistic. Relation endpoints must exist
 * before the edge that joins them (`ValidationPipeline` resolves both
 * endpoints at write time), so a procedure that creates edges first
 * cannot succeed — which is why every sequence here names primitives
 * before the relations over them.
 */
import type { PromptRegistration } from "../../src/plugin/types.js";
import {
  AUTHORITY_MATRIX_RENDERER_ID,
  BINDING_MATRIX_RENDERER_ID,
  BUDGET_ENVELOPE_RENDERER_ID,
  PIPELINE_GRAPH_RENDERER_ID,
  PROFILE_ID,
  R,
  T,
  VERIFICATION_SURFACE_RENDERER_ID,
} from "./ids.js";

/**
 * Measured ceiling for a rendered body, in UTF-8 bytes.
 *
 * Evidence, measured against this file with every optional argument
 * supplied: `author_pipeline` renders 4,089 B and `audit_pipeline`
 * 3,023 B. The ceiling is set at 4,500 B — about 10 % headroom over the
 * larger of the two, the same ratchet the tool catalog carries.
 *
 * It is deliberately far under the host's `PROMPT_BODY_BUDGET_BYTES`
 * (16,384): that is the outer limit for any prompt, whereas a procedural
 * specification is re-sent on every step of every run, so its size is a
 * recurring cost rather than a one-off. A ceiling with 47 % slack would
 * pass while the body doubled, which is not a gate. Raising this number
 * requires a CHANGELOG line and a reason.
 */
export const LOOP_FORWARD_PROMPT_BODY_CEILING_BYTES = 4_500;

function renderUri(workbookId: string, target: string, rendererId: string): string {
  return `fdpm://workbook/${workbookId}/render/${target}#${rendererId}`;
}

// ── loop-forward/author_pipeline ─────────────────────────────────────

export const AUTHOR_PIPELINE_PROMPT: PromptRegistration = {
  promptId: "loop-forward/author_pipeline",
  title: "Author a loop-forward pipeline",
  description:
    "Use when building a new bounded multi-stage prompt pipeline in a loop-forward workbook — templates, agents with tool grants, stages, bindings, output contracts, and a loop with carries and stop conditions.",
  arguments: [
    { name: "workbook_id", description: "The loop-forward workbook to author in.", required: true },
    { name: "pipeline_id", description: "Id to give the new lf:Pipeline (default: derive from its name)." },
  ],
  render: ({ args }) => {
    const wb = args["workbook_id"]!;
    const pid = args["pipeline_id"];
    const text = [
      `# Author a loop-forward pipeline — workbook ${wb}`,
      ``,
      `## When to use`,
      `When a workbook on ${PROFILE_ID} needs a new pipeline built from nothing, or an existing one extended with a stage or a loop. Not for reviewing a pipeline you did not write (use loop-forward/audit_pipeline) and not for recording a run (that is a ${T.RunReceipt}, written by the runner, not by hand).`,
      ``,
      `## Call order`,
      `Endpoints before edges: every relation is rejected if either endpoint is missing, so create primitives first and join them after.`,
      `1. fdpm.workbook.get(workbook_id: "${wb}") — confirm profile_id is ${PROFILE_ID} and note the revision.`,
      `2. fdpm.profile.type_info(profile_id: "${PROFILE_ID}", type_id: "${T.Stage}") for each type you will write — it returns id_pattern and required_field_names. Skipping this is the most common cause of rejection.`,
      `3. Templates and their variables: create ${T.PromptTemplate} rows, then a ${T.VariableSpec} per placeholder, then join with ${R.TemplateDeclaresVariable}.`,
      `4. Agents and authority: create ${T.AgentDefinition}, then one ${T.ToolGrant} per tool the agent may call, then ${R.AgentUsesSystemTemplate} and ${R.AgentGrantsTool}. Grant the narrowest set that works — the grant is the authorization perimeter, not a hint.`,
      `5. The pipeline shell: create the ${T.Pipeline}${pid ? ` with id "${pid}"` : ""}, then its ${T.Stage} rows in execution order, then ${R.PipelineHasStage} and ${R.PipelineDeclaresInput}.`,
      `6. Wire each stage: ${R.StageRunsAgent} and ${R.StageUsesTaskTemplate} (add ${R.StageOverridesSystemTemplate} only when the stage needs a different system template than its agent's).`,
      `7. Data flow: create a ${T.VariableBinding} per input with exactly one source arm — literal, pipeline_input, stage_output or carried — then ${R.StageHasBinding}, plus ${R.BindingReadsStage} for a stage_output arm. Forward reads only; a binding that reads a later stage is not a loop, it is a defect.`,
      `8. Guards: create a ${T.OutputContract} per stage and at least one ${T.OutputValidator} under it, then ${R.StageHasOutputContract} and ${R.ContractHasValidator}. A stage with no validator is an unguarded consumer of model output.`,
      `9. The loop, if any: create the ${T.LoopConfig}, then each ${T.Carry} (the only backward data path) and each ${T.StopCondition}, then ${R.PipelineHasLoop}, ${R.LoopHasCarry}, ${R.LoopHasStopCondition}, ${R.CarryCapturesStage} and ${R.StopConditionObservesStage}.`,
      `10. Evidence: create a ${T.PipelineExample} and an ${T.EvaluationPolicy}, then ${R.PipelineHasExample} and ${R.PipelineHasEvaluation}.`,
      `11. Batch the writes: fdpm.primitive.create_batch then fdpm.relation.create_batch (1..500, all-or-nothing, later entries may reference earlier ones). Verify with fdpm.log.tail(workbook_id: "${wb}") and read back ${renderUri(wb, "image/svg+xml", PIPELINE_GRAPH_RENDERER_ID)} to see the graph you actually built.`,
      ``,
      `## Failure modes`,
      `- ${"lf:val:binding-source-arm"} — a binding with zero or several source arms set; pick exactly one.`,
      `- ${"lf:val:output-contract-arm"} — a contract whose json_schema is unparseable, is not an object schema, or whose retry policy omits max_attempts.`,
      `- ${"lf:val:output-validator-arm"} — a range validator with neither min nor max, or min above max.`,
      `- ${"lf:val:stop-condition-arm"} — an "unchanged" condition whose terminal_state is not "stagnated", or whose observed window is malformed.`,
      `- ${"lf:val:carry-consistency"} — an enum carry without enum_values, or enum_values on a non-enum carry.`,
      `- ${"lf:val:variable-enum-consistency"} — the same mismatch on a ${T.VariableSpec}.`,
      `- ${"lf:val:tool-grant-zod"} — a grant whose argument schema is not valid Zod-shaped JSON.`,
      `- ${"lf:val:example-reason"} — an example that records an outcome without the reason that explains it.`,
      `- not_found on a relation — the endpoint primitive was not created yet; go back to the step that creates it.`,
      `- ok:false with isError:false — validation rejected the write and nothing was written. Read validation_report.findings[] for rule_id and field_path, fix, retry.`,
      `- permission / stale_state — another process appended to the log; ask the operator to SIGHUP fdpm-mcp, then re-read from step 1.`,
    ].join("\n");
    return [{ role: "user", content: { type: "text", text } }];
  },
};

// ── loop-forward/audit_pipeline ──────────────────────────────────────

export const AUDIT_PIPELINE_PROMPT: PromptRegistration = {
  promptId: "loop-forward/audit_pipeline",
  title: "Audit a loop-forward pipeline",
  description:
    "Use before running or approving a loop-forward pipeline someone else authored, to check its authority grants, unguarded stages, data flow and whether its budget can actually reach a stop condition.",
  arguments: [
    { name: "workbook_id", description: "The loop-forward workbook to audit.", required: true },
    { name: "pipeline_id", description: "Restrict the audit to one lf:Pipeline id (default: every pipeline)." },
  ],
  render: ({ args }) => {
    const wb = args["workbook_id"]!;
    const pid = args["pipeline_id"];
    const scope = pid ? `pipeline ${pid}` : "every pipeline";
    const text = [
      `# Audit a loop-forward pipeline — workbook ${wb} (${scope})`,
      ``,
      `## When to use`,
      `Before running, approving or inheriting a pipeline you did not author. The five renderers below are the review surface; read them rather than reconstructing the graph from primitives by hand. Not for building a pipeline (use loop-forward/author_pipeline).`,
      ``,
      `## Call order`,
      `1. fdpm.workbook.get(workbook_id: "${wb}") — confirm profile_id is ${PROFILE_ID} and note the revision every finding below is relative to.`,
      `2. Shape: read ${renderUri(wb, "image/svg+xml", PIPELINE_GRAPH_RENDERER_ID)}. Confirm the stage order is a forward DAG and that each ${T.Carry} back edge is one you expect. An unexpected back edge is unbounded context growth.`,
      `3. Guards: read ${renderUri(wb, "text/html", VERIFICATION_SURFACE_RENDERER_ID)}. Any stage with no ${T.OutputValidator} consumes model output unchecked — that is a design defect, not a style preference. Record it.`,
      `4. Authority: read ${renderUri(wb, "text/html", AUTHORITY_MATRIX_RENDERER_ID)}. For every destructive ${T.ToolGrant}, confirm the ${T.AgentDefinition} holding it runs only in stages that need it.`,
      `5. Data flow: read ${renderUri(wb, "text/html", BINDING_MATRIX_RENDERER_ID)}. Every ${T.VariableSpec} a template declares must have a ${T.VariableBinding}; an unbound variable renders as an empty placeholder at run time, silently.`,
      `6. Termination: read ${renderUri(wb, "text/markdown", BUDGET_ENVELOPE_RENDERER_ID)}. Compare the ${T.LoopConfig} budget against the structural bound. A budget below the bound means the loop can only ever end exhausted, never by a ${T.StopCondition}.`,
      `7. Evidence: fdpm.primitive.search(workbook_id: "${wb}", type_id: "${T.PipelineExample}") and type_id "${T.EvaluationPolicy}" — a pipeline with no example and no evaluation gate has never been shown to work.`,
      `8. History: fdpm.primitive.search(workbook_id: "${wb}", type_id: "${T.RunReceipt}") and fdpm.relation.list(workbook_id: "${wb}", type_id: "${R.ReceiptEvaluatesPipeline}") — past terminal states tell you how this pipeline actually ends.`,
      `9. Report: list unguarded stages, destructive grants, unbound variables and a budget that cannot terminate, each with the primitive id and the revision from step 1. Do not patch what you were asked to audit.`,
      ``,
      `## Failure modes`,
      `- not_found on a render URI — that renderer is not registered; confirm the plugin is active with fdpm.profile.list before concluding the view is empty.`,
      `- An empty diagram is not a clean bill of health — it usually means the workbook holds no ${T.Pipeline} at all. Check counts from step 1 first.`,
      `- unsupported_media — the target does not match a registered renderer; the five ids above are the registered set.`,
      `- permission / stale_state — another process appended to the log mid-audit; every finding above is stale. Re-read from step 1.`,
      `- Findings are observations, not writes. If you are asked to fix what you found, that is a separate authoring pass under loop-forward/author_pipeline.`,
    ].join("\n");
    return [{ role: "user", content: { type: "text", text } }];
  },
};

export const LOOP_FORWARD_PROMPTS: readonly PromptRegistration[] = [
  AUTHOR_PIPELINE_PROMPT,
  AUDIT_PIPELINE_PROMPT,
];
