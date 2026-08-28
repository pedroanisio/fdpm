/**
 * `planning/triage_iteration` — the first plugin-shipped MCP prompt
 * (PURPOSE.md: "prompts deliver the how-to-think layer that tool
 * descriptions alone cannot"; SPEC-MCP-SERVER §13.5).
 *
 * Written as a skill, not a template: when to use it, the exact call
 * order over FDPM tools and resources, and the failure modes by their
 * real rule ids. `tests/planning-prompt.test.ts` cross-checks every
 * tool name against the manifest and every `plan:val:*` id against
 * this plugin's sources, so the procedure cannot drift from the
 * validators it teaches.
 */
import type { PromptRegistration } from "../../src/plugin/types.js";

export const TRIAGE_ITERATION_PROMPT: PromptRegistration = {
  promptId: "planning/triage_iteration",
  title: "Triage an iteration",
  description:
    "Use at the start (or a checkpoint) of a planning iteration to rank Ready tasks, surface Blocked ones, claim work, and record decisions — without violating the planning validators.",
  arguments: [
    { name: "workbook_id", description: "The planning workbook to triage.", required: true },
    { name: "iteration_id", description: "Restrict to one plan:Iteration id (default: every iteration)." },
    { name: "focus", description: "Optional substring to prioritise in task names/summaries." },
  ],
  render: ({ args }) => {
    const wb = args["workbook_id"]!;
    const iteration = args["iteration_id"];
    const focus = args["focus"];
    const scope = iteration ? `iteration ${iteration}` : "every iteration";
    const text = [
      `# Triage — workbook ${wb} (${scope}${focus ? `, focus "${focus}"` : ""})`,
      ``,
      `## When to use`,
      `At the start of an iteration or at a checkpoint, when tasks exist and someone must decide what is Ready, what is Blocked, and what to claim next. Not for authoring a plan from scratch (create the plan:Iteration, plan:WorkBreakdown and tasks first) and not for closing an iteration (use the acceptance criteria).`,
      ``,
      `## Call order`,
      `1. fdpm.workbook.get(workbook_id: "${wb}") — confirm the profile is profile:planning:0.1 and note the revision.`,
      `2. Read the board through resources: fdpm://workbook/${wb}/render/text/markdown#plan:AgentBoardRenderer shows tasks grouped by status with claims; the same URI with #plan:RoadmapRenderer shows the phase view.`,
      `3. fdpm.primitive.search(workbook_id: "${wb}", type_id: "plan:Task"${focus ? `, query: "${focus}"` : ""}) — list tasks; then fdpm.primitive.search(type_id: "plan:Blocker") and fdpm.primitive.search(type_id: "plan:Iteration")${iteration ? ` and keep only tasks linked to ${iteration} via plan:InIteration` : ""}.`,
      `4. fdpm.relation.list(workbook_id: "${wb}", type_id: "plan:DependsOn") and type_id "plan:BlockedBy" — a task is Ready only when every DependsOn target is Done and it has no open BlockedBy edge.`,
      `5. Rank: P0 before P1; Ready before Backlog; tasks that unblock others first; tasks with a live claim (claim_holder_id + claim_until in the future) are taken.`,
      `6. Apply transitions with fdpm.primitive.patch(workbook_id: "${wb}", patch: { id, field_values: { status } }): Backlog→Ready when step 4 holds; Ready→In_progress together with claim_holder_id and claim_until (ISO-8601, in the future); In_progress→Blocked only after creating a plan:Blocker and a plan:BlockedBy edge (fdpm.relation.create). Batch several with fdpm.primitive.create_batch / fdpm.relation.create_batch.`,
      `7. Done needs an acceptance criterion: create the plan:AcceptanceCriterion and the plan:Verifies edge (task → AC) BEFORE patching status to Done — the validator checks the graph at write time.`,
      `8. To remove a stale task or edge, preview first: fdpm.primitive.delete(dry_run: true) shows the referencing relations; then delete with an idempotency_key.`,
      `9. Verify with fdpm.log.tail(workbook_id: "${wb}") that every intended operation was recorded, then re-read the board (step 2) and report: Ready list in rank order, Blocked list with blocker ids, claims made.`,
      ``,
      `## Failure modes`,
      `- plan:val:done-task-has-ac — status Done without a plan:Verifies edge to an acceptance criterion: do step 7 first.`,
      `- plan:val:ai-task-has-machine-checkable-ac — executor_kind AI requires an AC with a CEL expression; create the AC, then the task as Either, add Verifies, then patch executor_kind.`,
      `- plan:val:ai-minutes-numeric-bucket / plan:val:ai-task-duration-bounded — ai_minutes is the closed enum 5..60 in steps of 5; split larger tasks.`,
      `- plan:val:blocked-task-has-blocker — status Blocked requires a plan:BlockedBy edge to an open plan:Blocker.`,
      `- plan:val:claim-has-expiry — claim_holder_id without a future claim_until is rejected.`,
      `- plan:val:no-circular-deps — a DependsOn edge that closes a cycle is rejected; check step 4 before adding edges.`,
      `- permission/stale_state — another process changed the log; ask the operator to SIGHUP fdpm-mcp and re-read from step 1.`,
      `- ok:false envelopes carry validation_report.findings[] with the rule_id above: fix the input, retry; nothing was written.`,
    ].join("\n");
    return [{ role: "user", content: { type: "text", text } }];
  },
};

export const PLANNING_PROMPTS: readonly PromptRegistration[] = [TRIAGE_ITERATION_PROMPT];
