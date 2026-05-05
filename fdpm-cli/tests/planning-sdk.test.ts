import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { Host } from "../src/core/host.js";
import {
  claimTask,
  createAITask,
  createDoneTask,
  markBlocked,
  markCancelled,
  markDone,
  markInProgress,
  markInReview,
  markReady,
  releaseClaim,
  unblock,
  addToIteration,
  hitsMilestone,
} from "../plugins/planning/sdk.js";

/**
 * End-to-end tests for plugins/planning/sdk.ts.
 *
 * The premise: every helper that flips Task.status MUST trigger the
 * profile-level CEL rules (done-task-has-ac etc.) — no "lenient by
 * default" leak. The trap-dodging composites (createAITask /
 * createDoneTask) must succeed where the naive 1-op-per-step author
 * would hit a validation error.
 */

const PROFILE_ID = "profile:planning:0.1";
const WB_SCOPE = "scope:plan:workbook";

async function freshHost(): Promise<Host> {
  const host = new Host({
    dataDir: null,
    builtinDirs: [resolve(process.cwd(), "plugins")],
    pluginPaths: [],
  });
  await host.load();
  return host;
}

async function newPlanningProject(host: Host, id: string): Promise<void> {
  await host.createProject({
    workbook_id: id,
    name: id,
    profile_id: PROFILE_ID,
  });
}

/**
 * Seed a Human task with an AC and Verifies edge already in place — i.e.,
 * a task ready to transition through Ready / In_progress / In_review / Done.
 * Returns the task id. Uses createDoneTask's scaffolding minus the final
 * status flip, so this is a more permissive starting point than "born done".
 */
async function seedReadyTask(
  host: Host,
  workbook: string,
  taskId: string,
  acId: string,
): Promise<void> {
  await host.createPrimitive(workbook, {
    id: acId,
    type_id: "plan:AcceptanceCriterion",
    scope_id: WB_SCOPE,
    field_values: {
      criterion: `criterion for ${taskId}`,
      expression: "true",
      status: "open",
    },
  });
  await host.createPrimitive(workbook, {
    id: taskId,
    type_id: "plan:Task",
    scope_id: WB_SCOPE,
    field_values: {
      name: taskId,
      summary: `summary for ${taskId}`,
      kind: "Implementation",
      executor_kind: "Human",
      status: "Backlog",
      priority: "P2",
      is_root: true,
    },
  });
  await host.createRelation(workbook, {
    id: `rel:verifies:${taskId}:${acId}`,
    type_id: "plan:Verifies",
    source_id: taskId,
    target_id: acId,
  });
}

// ---------------------------------------------------------------------------
// Strict-default state transitions
// ---------------------------------------------------------------------------

describe("markDone — strict by default", () => {
  it("REJECTS marking a task Done when no Verifies edge exists", async () => {
    const host = await freshHost();
    await newPlanningProject(host, "wb-md-1");
    // Seed a task with no AC, no Verifies edge.
    await host.createPrimitive("wb-md-1", {
      id: "task:t1",
      type_id: "plan:Task",
      scope_id: WB_SCOPE,
      field_values: {
        name: "t1",
        summary: "no ac",
        kind: "Implementation",
        executor_kind: "Human",
        status: "Backlog",
        priority: "P2",
        is_root: true,
      },
    });
    let caught: any = null;
    try {
      await markDone(host, { workbook: "wb-md-1", taskId: "task:t1" });
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeNull();
    const findings = (caught.findings ?? []) as Array<{ rule_id: string }>;
    expect(findings.some((f) => f.rule_id === "plan:val:done-task-has-ac")).toBe(true);
  });

  it("ACCEPTS marking a task Done when Verifies edge is already in place", async () => {
    const host = await freshHost();
    await newPlanningProject(host, "wb-md-2");
    await seedReadyTask(host, "wb-md-2", "task:t1", "ac:t1");
    await markDone(host, { workbook: "wb-md-2", taskId: "task:t1" });
    const t = host.getProject("wb-md-2").primitives["task:t1"]!;
    expect(t.field_values.status).toBe("Done");
  });
});

describe("simple state transitions", () => {
  it("markReady → markInProgress → markInReview", async () => {
    const host = await freshHost();
    await newPlanningProject(host, "wb-flow");
    await seedReadyTask(host, "wb-flow", "task:t1", "ac:t1");

    await markReady(host, { workbook: "wb-flow", taskId: "task:t1" });
    expect(host.getProject("wb-flow").primitives["task:t1"]!.field_values.status).toBe("Ready");

    await markInProgress(host, { workbook: "wb-flow", taskId: "task:t1" });
    expect(host.getProject("wb-flow").primitives["task:t1"]!.field_values.status).toBe("In_progress");

    await markInReview(host, { workbook: "wb-flow", taskId: "task:t1" });
    expect(host.getProject("wb-flow").primitives["task:t1"]!.field_values.status).toBe("In_review");
  });

  it("markCancelled is unconditional (no AC required)", async () => {
    const host = await freshHost();
    await newPlanningProject(host, "wb-cancel");
    await host.createPrimitive("wb-cancel", {
      id: "task:t1",
      type_id: "plan:Task",
      scope_id: WB_SCOPE,
      field_values: {
        name: "t1",
        summary: "no ac",
        kind: "Implementation",
        executor_kind: "Human",
        status: "Backlog",
        priority: "P2",
        is_root: true,
      },
    });
    await markCancelled(host, { workbook: "wb-cancel", taskId: "task:t1" });
    expect(host.getProject("wb-cancel").primitives["task:t1"]!.field_values.status).toBe("Cancelled");
  });

  it("markInProgress with holder also sets the lease", async () => {
    const host = await freshHost();
    await newPlanningProject(host, "wb-claim-flow");
    await seedReadyTask(host, "wb-claim-flow", "task:t1", "ac:t1");
    // sw:Actor type is not registered in this test; the planning rule only
    // demands claim_until alongside claim_holder_id, not actor existence.
    await markInProgress(host, {
      workbook: "wb-claim-flow",
      taskId: "task:t1",
      holder: "actor:alice",
      ttlMinutes: 10,
    });
    const t = host.getProject("wb-claim-flow").primitives["task:t1"]!;
    expect(t.field_values.status).toBe("In_progress");
    expect(t.field_values.claim_holder_id).toBe("actor:alice");
    expect(typeof t.field_values.claim_until).toBe("string");
  });

  it("rejects state transitions on a non-Task id", async () => {
    const host = await freshHost();
    await newPlanningProject(host, "wb-wrongtype");
    await host.createPrimitive("wb-wrongtype", {
      id: "ac:foo",
      type_id: "plan:AcceptanceCriterion",
      scope_id: WB_SCOPE,
      field_values: { criterion: "x", expression: "true", status: "open" },
    });
    await expect(
      markReady(host, { workbook: "wb-wrongtype", taskId: "ac:foo" }),
    ).rejects.toThrow(/expected plan:Task/);
  });
});

// ---------------------------------------------------------------------------
// Claim / release
// ---------------------------------------------------------------------------

describe("claimTask + releaseClaim", () => {
  it("claim sets both fields, release clears them, release is idempotent", async () => {
    const host = await freshHost();
    await newPlanningProject(host, "wb-claim");
    await seedReadyTask(host, "wb-claim", "task:t1", "ac:t1");

    await claimTask(host, {
      workbook: "wb-claim",
      taskId: "task:t1",
      holder: "actor:alice",
      ttlMinutes: 30,
    });
    let t = host.getProject("wb-claim").primitives["task:t1"]!;
    expect(t.field_values.claim_holder_id).toBe("actor:alice");
    expect(typeof t.field_values.claim_until).toBe("string");

    await releaseClaim(host, { workbook: "wb-claim", taskId: "task:t1" });
    t = host.getProject("wb-claim").primitives["task:t1"]!;
    expect(t.field_values.claim_holder_id).toBeUndefined();
    expect(t.field_values.claim_until).toBeUndefined();

    // Idempotent.
    await releaseClaim(host, { workbook: "wb-claim", taskId: "task:t1" });
  });

  it("rejects claimTask with non-positive ttl", async () => {
    const host = await freshHost();
    await newPlanningProject(host, "wb-claim-bad");
    await seedReadyTask(host, "wb-claim-bad", "task:t1", "ac:t1");
    await expect(
      claimTask(host, {
        workbook: "wb-claim-bad",
        taskId: "task:t1",
        holder: "actor:alice",
        ttlMinutes: 0,
      }),
    ).rejects.toThrow(/ttlMinutes/);
  });
});

// ---------------------------------------------------------------------------
// Blocker flow
// ---------------------------------------------------------------------------

describe("markBlocked + unblock", () => {
  it("creates a new blocker, BlockedBy edge, and flips status — all in one call", async () => {
    const host = await freshHost();
    await newPlanningProject(host, "wb-block-1");
    await seedReadyTask(host, "wb-block-1", "task:t1", "ac:t1");

    const r = await markBlocked(host, {
      workbook: "wb-block-1",
      taskId: "task:t1",
      newBlocker: {
        id: "blocker:db-down",
        description: "Database is down",
        severity: "High",
      },
    });
    expect(r.blockerId).toBe("blocker:db-down");
    const slice = host.getProject("wb-block-1");
    expect(slice.primitives["blocker:db-down"]).toBeDefined();
    expect(slice.primitives["task:t1"]!.field_values.status).toBe("Blocked");
    expect(
      Object.values(slice.relations).some(
        (rel) =>
          rel.type_id === "plan:BlockedBy" &&
          rel.source_id === "task:t1" &&
          rel.target_id === "blocker:db-down",
      ),
    ).toBe(true);
  });

  it("rejects when both blockerId AND newBlocker are passed (or neither)", async () => {
    const host = await freshHost();
    await newPlanningProject(host, "wb-block-2");
    await seedReadyTask(host, "wb-block-2", "task:t1", "ac:t1");
    await expect(
      markBlocked(host, {
        workbook: "wb-block-2",
        taskId: "task:t1",
      } as any),
    ).rejects.toThrow(/exactly one/);
  });

  it("unblock removes the edge, flips status, optionally resolves the blocker", async () => {
    const host = await freshHost();
    await newPlanningProject(host, "wb-unblock");
    await seedReadyTask(host, "wb-unblock", "task:t1", "ac:t1");
    await markBlocked(host, {
      workbook: "wb-unblock",
      taskId: "task:t1",
      newBlocker: { id: "blocker:b1", description: "blocked", severity: "Medium" },
    });

    await unblock(host, {
      workbook: "wb-unblock",
      taskId: "task:t1",
      blockerId: "blocker:b1",
      resolveBlocker: true,
    });
    const slice = host.getProject("wb-unblock");
    expect(slice.primitives["task:t1"]!.field_values.status).toBe("Ready");
    expect(
      Object.values(slice.relations).some(
        (r) => r.type_id === "plan:BlockedBy" && r.target_id === "blocker:b1",
      ),
    ).toBe(false);
    expect(typeof slice.primitives["blocker:b1"]!.field_values.resolved_at).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// Trap-dodging composites
// ---------------------------------------------------------------------------

describe("createAITask — single-call replacement for the README's 4-step pattern", () => {
  it("creates an AI task with AC + Verifies edge, all rules satisfied", async () => {
    const host = await freshHost();
    await newPlanningProject(host, "wb-ai-1");
    const r = await createAITask(host, {
      workbook: "wb-ai-1",
      task: {
        id: "task:t1",
        name: "t1",
        summary: "ai task",
        kind: "Implementation",
        priority: "P1",
        aiMinutes: 30,
      },
      ac: {
        id: "ac:t1",
        criterion: "tests pass",
        expression: "true",
      },
    });
    expect(r.taskId).toBe("task:t1");
    const t = host.getProject("wb-ai-1").primitives["task:t1"]!;
    expect(t.field_values.executor_kind).toBe("AI");
    expect(t.field_values.ai_minutes).toBe(30);
  });

  it("the naive equivalent (createPrimitive of an AI task without prior AC) FAILS — proves the helper earns its keep", async () => {
    const host = await freshHost();
    await newPlanningProject(host, "wb-ai-naive");
    let caught: any = null;
    try {
      await host.createPrimitive("wb-ai-naive", {
        id: "task:naive",
        type_id: "plan:Task",
        scope_id: WB_SCOPE,
        field_values: {
          name: "naive",
          summary: "ai with no AC up front",
          kind: "Implementation",
          executor_kind: "AI",
          status: "Backlog",
          priority: "P1",
          ai_minutes: 30,
          is_root: true,
        },
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeNull();
    const findings = (caught.findings ?? []) as Array<{ rule_id: string }>;
    expect(
      findings.some((f) => f.rule_id === "plan:val:ai-task-has-machine-checkable-ac"),
    ).toBe(true);
  });
});

describe("createDoneTask", () => {
  it("creates a Human task born Done with AC + Verifies, full validation passing", async () => {
    const host = await freshHost();
    await newPlanningProject(host, "wb-done-1");
    const r = await createDoneTask(host, {
      workbook: "wb-done-1",
      task: {
        id: "task:t1",
        name: "t1",
        summary: "back-fill",
        kind: "Documentation",
        priority: "P3",
      },
      ac: { id: "ac:t1", criterion: "doc shipped", expression: "true", status: "met" },
    });
    expect(r.taskId).toBe("task:t1");
    const t = host.getProject("wb-done-1").primitives["task:t1"]!;
    expect(t.field_values.status).toBe("Done");
  });
});

// ---------------------------------------------------------------------------
// Schedule edges (idempotent)
// ---------------------------------------------------------------------------

describe("addToIteration / hitsMilestone — idempotent", () => {
  it("addToIteration creates the edge once, second call is a no-op", async () => {
    const host = await freshHost();
    await newPlanningProject(host, "wb-iter");
    await seedReadyTask(host, "wb-iter", "task:t1", "ac:t1");
    await host.createPrimitive("wb-iter", {
      id: "iteration:s1",
      type_id: "plan:Iteration",
      scope_id: WB_SCOPE,
      field_values: {
        name: "s1",
        start_date: "2026-05-01",
        end_date: "2026-05-15",
      },
    });
    const a = await addToIteration(host, {
      workbook: "wb-iter",
      taskId: "task:t1",
      iterationId: "iteration:s1",
    });
    expect(a.created).toBe(true);
    const b = await addToIteration(host, {
      workbook: "wb-iter",
      taskId: "task:t1",
      iterationId: "iteration:s1",
    });
    expect(b.created).toBe(false);
  });

  it("hitsMilestone creates the edge once", async () => {
    const host = await freshHost();
    await newPlanningProject(host, "wb-mile");
    await seedReadyTask(host, "wb-mile", "task:t1", "ac:t1");
    await host.createPrimitive("wb-mile", {
      id: "milestone:m1",
      type_id: "plan:Milestone",
      scope_id: WB_SCOPE,
      field_values: { name: "m1", target_date: "2026-06-01", status: "Upcoming" },
    });
    const a = await hitsMilestone(host, {
      workbook: "wb-mile",
      taskId: "task:t1",
      milestoneId: "milestone:m1",
    });
    expect(a.created).toBe(true);
  });
});
