/**
 * Planning plugin SDK helpers.
 *
 * Strict-by-default operations on top of `Host.*` that encode the
 * planning profile's invariants. Every helper that touches a Task's
 * `status` field uses `fullValidate: true` so the profile's
 * graph-stateful CEL rules (done-task-has-ac, non-root-task-has-deps,
 * ai-task-has-machine-checkable-ac) fire — without the flag,
 * `host.patchPrimitive` would silently bypass them per
 * src/core/validation/pipeline.ts §runPrimitiveFieldPatch.
 *
 * Composite helpers (markBlocked, unblock, createAITask, createDoneTask)
 * issue multiple `Host.*` calls in sequence. They do NOT auto-rollback
 * on partial failure: an exception leaves the workbook in whatever
 * intermediate state the failing op produced, and the caller decides
 * whether to clean up. Live workbooks have no transaction boundary
 * outside `defineProject().commit()`, which is for fresh authoring.
 */

import type { Host } from "../../src/core/host.js";

// ---------------------------------------------------------------------------
// Internal: known type/relation/scope ids for this profile.
// ---------------------------------------------------------------------------

const TASK = "plan:Task";
const AC = "plan:AcceptanceCriterion";
const BLOCKER = "plan:Blocker";
const REL_VERIFIES = "plan:Verifies";
const REL_BLOCKED_BY = "plan:BlockedBy";
const REL_IN_ITERATION = "plan:InIteration";
const REL_HITS_MILESTONE = "plan:HitsMilestone";
const SCOPE_WORKBOOK = "scope:plan:workbook";

// ---------------------------------------------------------------------------
// Common arg shape.
// ---------------------------------------------------------------------------

interface TaskRef {
  workbook: string;
  taskId: string;
}

// ---------------------------------------------------------------------------
// Internal: load a primitive of expected type, or throw.
// ---------------------------------------------------------------------------

function getPrimitive(
  host: Host,
  workbook: string,
  id: string,
  expectedType: string,
): Record<string, unknown> & { type_id: string; field_values: Record<string, unknown> } {
  const slice = host.getProject(workbook);
  const p = slice.primitives[id];
  if (!p) {
    throw new Error(`planning: ${expectedType} not found: ${id}`);
  }
  if (p.type_id !== expectedType) {
    throw new Error(
      `planning: id ${id} resolves to ${p.type_id}, expected ${expectedType}`,
    );
  }
  return p as Record<string, unknown> & {
    type_id: string;
    field_values: Record<string, unknown>;
  };
}

// ---------------------------------------------------------------------------
// State transitions (single-op, strict validation).
// ---------------------------------------------------------------------------

async function setStatus(
  host: Host,
  args: TaskRef,
  status: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  // Pre-check that the id resolves to a Task — without this, host.patchPrimitive
  // would still succeed structurally on a non-Task id whose primitive type
  // happens to declare a `status` field, which would be a confusing error.
  getPrimitive(host, args.workbook, args.taskId, TASK);
  await host.patchPrimitive(args.workbook, {
    id: args.taskId,
    field_values: { status, ...extra },
    fullValidate: true,
  });
}

export async function markReady(host: Host, args: TaskRef): Promise<void> {
  await setStatus(host, args, "Ready");
}

export interface MarkInProgressArgs extends TaskRef {
  /** Actor id taking the claim. Optional — pass to atomically set the lease. */
  holder?: string;
  /** Lease length in minutes. Defaults to 60 when `holder` is provided. */
  ttlMinutes?: number;
}

export async function markInProgress(
  host: Host,
  args: MarkInProgressArgs,
): Promise<void> {
  const extra: Record<string, unknown> = {};
  if (args.holder !== undefined) {
    const ttl = args.ttlMinutes ?? 60;
    extra.claim_holder_id = args.holder;
    extra.claim_until = new Date(Date.now() + ttl * 60_000).toISOString();
  }
  await setStatus(host, args, "In_progress", extra);
}

export async function markInReview(host: Host, args: TaskRef): Promise<void> {
  await setStatus(host, args, "In_review");
}

export async function markDone(host: Host, args: TaskRef): Promise<void> {
  // Strict by construction: plan:val:done-task-has-ac fires under
  // fullValidate and rejects tasks lacking a plan:Verifies edge.
  await setStatus(host, args, "Done");
}

export async function markCancelled(host: Host, args: TaskRef): Promise<void> {
  await setStatus(host, args, "Cancelled");
}

// ---------------------------------------------------------------------------
// Claim / release (lease primitives, no status change).
// ---------------------------------------------------------------------------

export interface ClaimArgs extends TaskRef {
  holder: string;
  ttlMinutes: number;
}

export async function claimTask(host: Host, args: ClaimArgs): Promise<void> {
  getPrimitive(host, args.workbook, args.taskId, TASK);
  if (args.ttlMinutes <= 0) {
    throw new Error(`planning: claimTask ttlMinutes must be > 0 (got ${args.ttlMinutes})`);
  }
  const claim_until = new Date(Date.now() + args.ttlMinutes * 60_000).toISOString();
  await host.patchPrimitive(args.workbook, {
    id: args.taskId,
    field_values: { claim_holder_id: args.holder, claim_until },
    fullValidate: true,
  });
}

export async function releaseClaim(host: Host, args: TaskRef): Promise<void> {
  // patchPrimitive merges field_values; setting to null clears the field.
  // The schema marks both as optional so absence is permitted.
  const p = getPrimitive(host, args.workbook, args.taskId, TASK);
  if (p.field_values.claim_holder_id == null && p.field_values.claim_until == null) {
    return; // idempotent: already released.
  }
  await host.replacePrimitive(args.workbook, {
    id: args.taskId,
    type_id: TASK,
    field_values: stripClaim(p.field_values),
  });
}

function stripClaim(fv: Record<string, unknown>): Record<string, unknown> {
  const out = { ...fv };
  delete out.claim_holder_id;
  delete out.claim_until;
  return out;
}

// ---------------------------------------------------------------------------
// Schedule edges (idempotent).
// ---------------------------------------------------------------------------

function relationIdExists(host: Host, workbook: string, id: string): boolean {
  const slice = host.getProject(workbook);
  return slice.relations[id] !== undefined;
}

function relationBetweenExists(
  host: Host,
  workbook: string,
  type_id: string,
  source_id: string,
  target_id: string,
): boolean {
  const slice = host.getProject(workbook);
  for (const r of Object.values(slice.relations)) {
    if (r.type_id === type_id && r.source_id === source_id && r.target_id === target_id) {
      return true;
    }
  }
  return false;
}

export interface AddToIterationArgs extends TaskRef {
  iterationId: string;
  /** Override the auto-generated relation id. */
  relationId?: string;
}

export async function addToIteration(
  host: Host,
  args: AddToIterationArgs,
): Promise<{ relationId: string; created: boolean }> {
  if (relationBetweenExists(host, args.workbook, REL_IN_ITERATION, args.taskId, args.iterationId)) {
    return { relationId: "", created: false };
  }
  const relationId = args.relationId ?? `rel:in-iteration:${args.taskId}:${args.iterationId}`;
  await host.createRelation(args.workbook, {
    id: relationId,
    type_id: REL_IN_ITERATION,
    source_id: args.taskId,
    target_id: args.iterationId,
  });
  return { relationId, created: true };
}

export interface HitsMilestoneArgs extends TaskRef {
  milestoneId: string;
  relationId?: string;
}

export async function hitsMilestone(
  host: Host,
  args: HitsMilestoneArgs,
): Promise<{ relationId: string; created: boolean }> {
  if (relationBetweenExists(host, args.workbook, REL_HITS_MILESTONE, args.taskId, args.milestoneId)) {
    return { relationId: "", created: false };
  }
  const relationId = args.relationId ?? `rel:hits-milestone:${args.taskId}:${args.milestoneId}`;
  await host.createRelation(args.workbook, {
    id: relationId,
    type_id: REL_HITS_MILESTONE,
    source_id: args.taskId,
    target_id: args.milestoneId,
  });
  return { relationId, created: true };
}

// ---------------------------------------------------------------------------
// Blocker flow (composite, no auto-rollback).
// ---------------------------------------------------------------------------

export interface MarkBlockedArgs extends TaskRef {
  /** Use an existing blocker by id. Mutually exclusive with `newBlocker`. */
  blockerId?: string;
  /** Create a new blocker inline. Mutually exclusive with `blockerId`. */
  newBlocker?: {
    id: string;
    description: string;
    severity: "Critical" | "High" | "Medium" | "Low";
    discoveredAt?: string;
  };
}

export async function markBlocked(
  host: Host,
  args: MarkBlockedArgs,
): Promise<{ blockerId: string; relationId: string }> {
  if (!args.blockerId === !args.newBlocker) {
    throw new Error(
      "planning: markBlocked requires exactly one of { blockerId, newBlocker }",
    );
  }
  getPrimitive(host, args.workbook, args.taskId, TASK);

  let blockerId: string;
  if (args.blockerId) {
    getPrimitive(host, args.workbook, args.blockerId, BLOCKER);
    blockerId = args.blockerId;
  } else {
    blockerId = args.newBlocker!.id;
    await host.createPrimitive(args.workbook, {
      id: blockerId,
      type_id: BLOCKER,
      field_values: {
        description: args.newBlocker!.description,
        severity: args.newBlocker!.severity,
        discovered_at:
          args.newBlocker!.discoveredAt ?? new Date().toISOString(),
      },
    });
  }

  // Create the BlockedBy edge (if not already present).
  const relationId = `rel:blocked-by:${args.taskId}:${blockerId}`;
  if (!relationBetweenExists(host, args.workbook, REL_BLOCKED_BY, args.taskId, blockerId)) {
    await host.createRelation(args.workbook, {
      id: relationId,
      type_id: REL_BLOCKED_BY,
      source_id: args.taskId,
      target_id: blockerId,
    });
  }

  // Now flip status under full validation. plan:val:blocked-task-has-blocker
  // requires the BlockedBy edge to exist by this point — which it does.
  await setStatus(host, args, "Blocked");
  return { blockerId, relationId };
}

export interface UnblockArgs extends TaskRef {
  blockerId: string;
  /** When true, set Blocker.resolved_at to now. Default false. */
  resolveBlocker?: boolean;
  /** Status to flip the task to after unblocking. Default "Ready". */
  newStatus?: "Backlog" | "Ready" | "In_progress";
}

export async function unblock(host: Host, args: UnblockArgs): Promise<void> {
  getPrimitive(host, args.workbook, args.taskId, TASK);
  const slice = host.getProject(args.workbook);
  // Find the matching BlockedBy edge.
  let edgeId: string | null = null;
  for (const [id, r] of Object.entries(slice.relations)) {
    if (
      r.type_id === REL_BLOCKED_BY &&
      r.source_id === args.taskId &&
      r.target_id === args.blockerId
    ) {
      edgeId = id;
      break;
    }
  }
  if (!edgeId) {
    throw new Error(
      `planning: no plan:BlockedBy edge from ${args.taskId} to ${args.blockerId}`,
    );
  }

  // Flip the task's status FIRST so the BlockedBy edge is still in place
  // when blocked-task-has-blocker validates. Then drop the edge.
  await setStatus(host, args, args.newStatus ?? "Ready");
  await host.deleteRelation(args.workbook, edgeId);

  if (args.resolveBlocker) {
    const blocker = getPrimitive(host, args.workbook, args.blockerId, BLOCKER);
    await host.patchPrimitive(args.workbook, {
      id: args.blockerId,
      field_values: {
        ...blocker.field_values,
        resolved_at: new Date().toISOString(),
      },
      fullValidate: true,
    });
  }
}

// ---------------------------------------------------------------------------
// Trap-dodging composites — the README's 4-step pattern as one call.
// ---------------------------------------------------------------------------

export interface TaskSpec {
  id: string;
  name: string;
  summary: string;
  kind: "Implementation" | "Test" | "Documentation" | "Investigation" | "Review" | "Refactor";
  priority: "P0" | "P1" | "P2" | "P3";
  /** Defaults to the workbook scope if not provided. */
  scope?: string;
  plannedStart?: string;
  plannedFinish?: string;
  assigneeId?: string;
  /** Extra raw field overrides — escape hatch for things this typed shape doesn't expose. */
  extraFields?: Record<string, unknown>;
}

export interface AcceptanceSpec {
  id: string;
  criterion: string;
  expression: string; // CEL — required for createAITask
  status?: "open" | "in_progress" | "met" | "blocked" | "waived";
  evidenceRefs?: string[];
  scope?: string;
}

export interface CreateAITaskArgs {
  workbook: string;
  task: TaskSpec & {
    /** AI tasks REQUIRE ai_minutes from the bounded enum {5,10,15,…,60}. */
    aiMinutes: 5 | 10 | 15 | 20 | 25 | 30 | 35 | 40 | 45 | 50 | 55 | 60;
  };
  ac: AcceptanceSpec;
  /** Override the auto-generated Verifies relation id. */
  verifiesRelationId?: string;
}

/**
 * Create an AI-executable task with its acceptance criterion in the
 * order the planning profile's create-time validation tolerates.
 *
 * Four ops, each strict:
 *   1. Create the AcceptanceCriterion.
 *   2. Create the Task with executor_kind = "Either" so the AI rules
 *      don't fire yet (plan:val:ai-task-has-machine-checkable-ac
 *      cannot find an outbound Verifies edge yet).
 *   3. Create the plan:Verifies edge.
 *   4. host.replacePrimitive on the Task to flip executor_kind = "AI"
 *      and set ai_minutes — full validation runs and the AI rules now
 *      see the Verifies edge.
 *
 * On failure mid-sequence, the workbook is left in whatever
 * intermediate state the last successful op produced. This helper does
 * not roll back. Caller must clean up via host.deletePrimitive /
 * deleteRelation if it cares.
 */
export async function createAITask(
  host: Host,
  args: CreateAITaskArgs,
): Promise<{ taskId: string; acId: string; verifiesRelationId: string }> {
  const taskScope = args.task.scope ?? SCOPE_WORKBOOK;
  const acScope = args.ac.scope ?? SCOPE_WORKBOOK;

  await host.createPrimitive(args.workbook, {
    id: args.ac.id,
    type_id: AC,
    scope_id: acScope,
    field_values: {
      criterion: args.ac.criterion,
      expression: args.ac.expression,
      status: args.ac.status ?? "open",
      ...(args.ac.evidenceRefs && { evidence_refs: args.ac.evidenceRefs }),
    },
  });

  await host.createPrimitive(args.workbook, {
    id: args.task.id,
    type_id: TASK,
    scope_id: taskScope,
    field_values: {
      name: args.task.name,
      summary: args.task.summary,
      kind: args.task.kind,
      executor_kind: "Either", // staged: AI rules don't fire yet
      status: "Backlog",
      priority: args.task.priority,
      is_root: true, // exempt from non-root-task-has-deps at create time
      ...(args.task.plannedStart && { planned_start: args.task.plannedStart }),
      ...(args.task.plannedFinish && { planned_finish: args.task.plannedFinish }),
      ...(args.task.assigneeId && { assignee_id: args.task.assigneeId }),
      ...args.task.extraFields,
    },
  });

  const verifiesRelationId =
    args.verifiesRelationId ?? `rel:verifies:${args.task.id}:${args.ac.id}`;
  await host.createRelation(args.workbook, {
    id: verifiesRelationId,
    type_id: REL_VERIFIES,
    source_id: args.task.id,
    target_id: args.ac.id,
  });

  // Flip to AI + set ai_minutes via replace (full validation; the
  // AC rule now sees the Verifies edge).
  const created = getPrimitive(host, args.workbook, args.task.id, TASK);
  await host.replacePrimitive(args.workbook, {
    id: args.task.id,
    type_id: TASK,
    ...(created.scope_id != null && { scope_id: created.scope_id as string }),
    field_values: {
      ...created.field_values,
      executor_kind: "AI",
      ai_minutes: args.task.aiMinutes,
    },
  });

  return {
    taskId: args.task.id,
    acId: args.ac.id,
    verifiesRelationId,
  };
}

export interface CreateDoneTaskArgs {
  workbook: string;
  task: TaskSpec & {
    /** "Human" or "Either" — Done AI tasks would also need ai_minutes; use createAITask + markDone instead. */
    executorKind?: "Human" | "Either";
  };
  ac: AcceptanceSpec;
  verifiesRelationId?: string;
}

/**
 * Create a non-AI task that is born Done, in one helper call.
 *
 * Same trap-dodging pattern as createAITask — but the final replace
 * flips status="Done" instead of executor_kind="AI". Use this for
 * back-filling already-completed work into a planning workbook.
 *
 * For AI tasks that need to be born Done, call createAITask first,
 * then markDone — splitting the two keeps each helper's invariants
 * crisp.
 */
export async function createDoneTask(
  host: Host,
  args: CreateDoneTaskArgs,
): Promise<{ taskId: string; acId: string; verifiesRelationId: string }> {
  const taskScope = args.task.scope ?? SCOPE_WORKBOOK;
  const acScope = args.ac.scope ?? SCOPE_WORKBOOK;
  const executorKind = args.task.executorKind ?? "Human";

  await host.createPrimitive(args.workbook, {
    id: args.ac.id,
    type_id: AC,
    scope_id: acScope,
    field_values: {
      criterion: args.ac.criterion,
      expression: args.ac.expression,
      status: args.ac.status ?? "met",
      ...(args.ac.evidenceRefs && { evidence_refs: args.ac.evidenceRefs }),
    },
  });

  await host.createPrimitive(args.workbook, {
    id: args.task.id,
    type_id: TASK,
    scope_id: taskScope,
    field_values: {
      name: args.task.name,
      summary: args.task.summary,
      kind: args.task.kind,
      executor_kind: executorKind,
      status: "Backlog",
      priority: args.task.priority,
      is_root: true,
      ...(args.task.plannedStart && { planned_start: args.task.plannedStart }),
      ...(args.task.plannedFinish && { planned_finish: args.task.plannedFinish }),
      ...(args.task.assigneeId && { assignee_id: args.task.assigneeId }),
      ...args.task.extraFields,
    },
  });

  const verifiesRelationId =
    args.verifiesRelationId ?? `rel:verifies:${args.task.id}:${args.ac.id}`;
  await host.createRelation(args.workbook, {
    id: verifiesRelationId,
    type_id: REL_VERIFIES,
    source_id: args.task.id,
    target_id: args.ac.id,
  });

  const created = getPrimitive(host, args.workbook, args.task.id, TASK);
  await host.replacePrimitive(args.workbook, {
    id: args.task.id,
    type_id: TASK,
    ...(created.scope_id != null && { scope_id: created.scope_id as string }),
    field_values: { ...created.field_values, status: "Done" },
  });

  return {
    taskId: args.task.id,
    acId: args.ac.id,
    verifiesRelationId,
  };
}
