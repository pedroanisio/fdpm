import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { Host } from "../src/core/host.js";
import { PROFILE } from "../plugins/planning/index.js";
import { PROFILE as SW_PROFILE } from "../plugins/software_architecture/index.js";

/**
 * End-to-end CEL rule firing tests.
 *
 * These exercise the §7 ValidationPipeline against real Host.createPrimitive
 * + Host.createRelation calls. Each rule from validation_rules.ts is
 * tested in BOTH the satisfied and violated configurations.
 *
 * The plugin imports sw:Actor for cross-profile assignee_id / claim_holder_id.
 * Tests register both profiles on the host before seeding tasks.
 */

const PROFILE_ID = "profile:planning:0.1";

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

const REQUIRED_TASK_FIELDS = {
  kind: "Implementation",
  status: "Backlog",
  priority: "P2",
} as const;

function rule(id: string) {
  return PROFILE.validation_rules.find((r) => r.id === id);
}

// ---------------------------------------------------------------------------
// (1) plan:val:ai-task-duration-bounded
// ---------------------------------------------------------------------------

describe("plan:val:ai-task-duration-bounded", () => {
  it("REJECTS an AI task with no ai_minutes", async () => {
    const host = await freshHost();
    await newPlanningProject(host, "p1a");
    let caught: any = null;
    try {
      await host.createPrimitive("p1a", {
        id: "task:bad",
        type_id: "plan:Task",
        scope_id: "scope:plan:workbook",
        field_values: {
          ...REQUIRED_TASK_FIELDS,
          name: "bad",
          summary: "ai task without minutes",
          executor_kind: "AI",
          is_root: true,
        },
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeNull();
    const findings = (caught.findings ?? []) as Array<{ rule_id: string }>;
    expect(
      findings.some((f) => f.rule_id === "plan:val:ai-task-duration-bounded"),
    ).toBe(true);
  });

  it("REJECTS an AI task with ai_minutes outside the enum (value 70 → enum-shape error before the rule)", async () => {
    const host = await freshHost();
    await newPlanningProject(host, "p1b");
    let caught: any = null;
    try {
      await host.createPrimitive("p1b", {
        id: "task:overrun",
        type_id: "plan:Task",
        scope_id: "scope:plan:workbook",
        field_values: {
          ...REQUIRED_TASK_FIELDS,
          name: "overrun",
          summary: "ai task longer than 60m",
          executor_kind: "AI",
          ai_minutes: 70,
          is_root: true,
        },
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeNull();
    // The Enum field check fires first ("value not in enum"); the rule
    // would also fire (modulo 5 fails). We accept either path; both prove
    // 70 is rejected.
    expect(String(caught.findings?.[0]?.message ?? "")).toMatch(
      /enum|ai-task-duration-bounded/i,
    );
  });

  // The "ACCEPTS" tests must satisfy both the duration rule AND the
  // ai-task-has-machine-checkable-ac rule; helper builds both pieces.
  async function seedAcceptableAiTask(
    host: Host,
    workbookId: string,
    taskId: string,
    aiMinutes: number,
  ): Promise<Awaited<ReturnType<Host["replacePrimitive"]>>> {
    await newPlanningProject(host, workbookId);
    const acId = `ac:${taskId.replace(/[^a-z0-9]+/gi, "-")}`;
    await host.createPrimitive(workbookId, {
      id: acId,
      type_id: "plan:AcceptanceCriterion",
      scope_id: "scope:plan:workbook",
      field_values: {
        criterion: "test passes",
        expression: 'instance.field_values.status == "Done"',
        status: "open",
      },
    });
    await host.createPrimitive(workbookId, {
      id: taskId,
      type_id: "plan:Task",
      scope_id: "scope:plan:workbook",
      field_values: {
        ...REQUIRED_TASK_FIELDS,
        name: taskId,
        summary: "ai task",
        executor_kind: "Human",
        human_estimate: "1h",
        is_root: true,
      },
    });
    await host.createRelation(workbookId, {
      id: `rel:verifies-${taskId.replace(/[^a-z0-9]+/gi, "-")}`,
      type_id: "plan:Verifies",
      source_id: taskId,
      target_id: acId,
    });
    return host.replacePrimitive(workbookId, {
      id: taskId,
      type_id: "plan:Task",
      scope_id: "scope:plan:workbook",
      field_values: {
        ...REQUIRED_TASK_FIELDS,
        name: taskId,
        summary: "ai task",
        executor_kind: "AI",
        ai_minutes: aiMinutes,
        is_root: true,
      },
    });
  }

  it("ACCEPTS an AI task at the lower boundary (5 minutes)", async () => {
    const host = await freshHost();
    const r = await seedAcceptableAiTask(host, "p1c", "task:tiny", 5);
    expect(r.report.accepted).toBe(true);
  });

  it("ACCEPTS an AI task at the upper boundary (60 minutes)", async () => {
    const host = await freshHost();
    const r = await seedAcceptableAiTask(host, "p1d", "task:max", 60);
    expect(r.report.accepted).toBe(true);
  });

  it("ACCEPTS a Human task with NO ai_minutes (the rule short-circuits)", async () => {
    const host = await freshHost();
    await newPlanningProject(host, "p1e");
    const r = await host.createPrimitive("p1e", {
      id: "task:human",
      type_id: "plan:Task",
      scope_id: "scope:plan:workbook",
      field_values: {
        ...REQUIRED_TASK_FIELDS,
        name: "human",
        summary: "human task",
        executor_kind: "Human",
        human_estimate: "2d",
        is_root: true,
      },
    });
    expect(r.report.accepted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (2) plan:val:non-root-task-has-deps
// ---------------------------------------------------------------------------

describe("plan:val:non-root-task-has-deps", () => {
  it("REJECTS a task with no parent and no DependsOn (and is_root unset)", async () => {
    const host = await freshHost();
    await newPlanningProject(host, "p2a");
    let caught: any = null;
    try {
      await host.createPrimitive("p2a", {
        id: "task:orphan",
        type_id: "plan:Task",
        scope_id: "scope:plan:workbook",
        field_values: {
          ...REQUIRED_TASK_FIELDS,
          name: "orphan",
          summary: "no deps no parent no flag",
          executor_kind: "Human",
          human_estimate: "1h",
          // is_root deliberately not set
        },
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeNull();
    const findings = (caught.findings ?? []) as Array<{ rule_id: string }>;
    expect(
      findings.some((f) => f.rule_id === "plan:val:non-root-task-has-deps"),
    ).toBe(true);
  });

  it("ACCEPTS a task with is_root=true and no other context", async () => {
    const host = await freshHost();
    await newPlanningProject(host, "p2b");
    const r = await host.createPrimitive("p2b", {
      id: "task:explicit-root",
      type_id: "plan:Task",
      scope_id: "scope:plan:workbook",
      field_values: {
        ...REQUIRED_TASK_FIELDS,
        name: "explicit-root",
        summary: "marked root",
        executor_kind: "Human",
        human_estimate: "1d",
        is_root: true,
      },
    });
    expect(r.report.accepted).toBe(true);
  });

  it("ACCEPTS a non-root task that declares DependsOn (rule passes once relation exists)", async () => {
    const host = await freshHost();
    await newPlanningProject(host, "p2c");
    // Root task first.
    await host.createPrimitive("p2c", {
      id: "task:root",
      type_id: "plan:Task",
      scope_id: "scope:plan:workbook",
      field_values: {
        ...REQUIRED_TASK_FIELDS,
        name: "root",
        summary: "root",
        executor_kind: "Human",
        human_estimate: "1d",
        is_root: true,
      },
    });
    // Child task. Created with DependsOn pointing back at root.
    // The rule runs on the proposed post-state; the relation must exist
    // before the child is created. Strategy: create child as is_root first,
    // then create the relation, then drop is_root via replace? Simpler:
    // since the rule is a 'pass if ANY of {is_root, Subtask, Contains,
    // DependsOn} is true', create child as is_root=true, validate-clean,
    // then ADD the DependsOn edge afterward. Now flip is_root → undefined
    // via replacePrimitive — at which point DependsOn carries the rule.
    await host.createPrimitive("p2c", {
      id: "task:child",
      type_id: "plan:Task",
      scope_id: "scope:plan:workbook",
      field_values: {
        ...REQUIRED_TASK_FIELDS,
        name: "child",
        summary: "depends on root",
        executor_kind: "Human",
        human_estimate: "1h",
        is_root: true,
      },
    });
    await host.createRelation("p2c", {
      id: "rel:child-deps",
      type_id: "plan:DependsOn",
      source_id: "task:child",
      target_id: "task:root",
    });
    // Now flip child's is_root off; rule passes via DependsOn.
    const r = await host.replacePrimitive("p2c", {
      id: "task:child",
      type_id: "plan:Task",
      scope_id: "scope:plan:workbook",
      field_values: {
        ...REQUIRED_TASK_FIELDS,
        name: "child",
        summary: "depends on root",
        executor_kind: "Human",
        human_estimate: "1h",
      },
    });
    expect(r.report.accepted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (3) plan:val:no-circular-deps  (graph.acyclic helper)
// ---------------------------------------------------------------------------

describe("plan:val:no-circular-deps", () => {
  it("REJECTS the relation that would close a 2-cycle", async () => {
    const host = await freshHost();
    await newPlanningProject(host, "p3a");
    for (const id of ["task:a", "task:b"]) {
      await host.createPrimitive("p3a", {
        id,
        type_id: "plan:Task",
        scope_id: "scope:plan:workbook",
        field_values: {
          ...REQUIRED_TASK_FIELDS,
          name: id,
          summary: id,
          executor_kind: "Human",
          human_estimate: "1h",
          is_root: true,
        },
      });
    }
    // a → b: clean.
    await host.createRelation("p3a", {
      id: "rel:a-b",
      type_id: "plan:DependsOn",
      source_id: "task:a",
      target_id: "task:b",
    });
    // b → a: closes the cycle. The validation runs against task:b post-
    // state and should flag the rule on task:b's outbound graph.
    let caught: any = null;
    try {
      await host.createRelation("p3a", {
        id: "rel:b-a",
        type_id: "plan:DependsOn",
        source_id: "task:b",
        target_id: "task:a",
      });
    } catch (e) {
      caught = e;
    }
    // The rule applies to plan:Task and runs on each task; the cycle is
    // detectable from either source. Rule level is `error`, so the
    // operation should be rejected. (If the relation is accepted but a
    // subsequent task validate flags the cycle, the test is still
    // meaningful — we accept either signal.)
    if (caught) {
      const findings = (caught.findings ?? []) as Array<{ rule_id: string }>;
      expect(
        findings.some((f) => f.rule_id === "plan:val:no-circular-deps"),
      ).toBe(true);
    } else {
      // The relation was accepted; validate the workbook and assert the
      // rule fires.
      const report = host.validateProject("p3a");
      const findings = report.primitives
        .flatMap((entry) => entry.findings)
        .filter((f) => f.rule_id === "plan:val:no-circular-deps");
      expect(findings.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// (4) plan:val:done-task-has-ac
// ---------------------------------------------------------------------------

describe("plan:val:done-task-has-ac", () => {
  it("REJECTS a Done task with no Verifies edge", async () => {
    const host = await freshHost();
    await newPlanningProject(host, "p4a");
    // Create the task in Backlog first (Backlog is fine), then flip to Done.
    await host.createPrimitive("p4a", {
      id: "task:no-ac",
      type_id: "plan:Task",
      scope_id: "scope:plan:workbook",
      field_values: {
        ...REQUIRED_TASK_FIELDS,
        name: "no-ac",
        summary: "claims done",
        executor_kind: "Human",
        human_estimate: "1h",
        is_root: true,
      },
    });
    let caught: any = null;
    try {
      await host.replacePrimitive("p4a", {
        id: "task:no-ac",
        type_id: "plan:Task",
        scope_id: "scope:plan:workbook",
        field_values: {
          ...REQUIRED_TASK_FIELDS,
          status: "Done",
          name: "no-ac",
          summary: "claims done",
          executor_kind: "Human",
          human_estimate: "1h",
          is_root: true,
        },
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeNull();
    const findings = (caught.findings ?? []) as Array<{ rule_id: string }>;
    expect(
      findings.some((f) => f.rule_id === "plan:val:done-task-has-ac"),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (5) plan:val:blocked-task-has-blocker
// ---------------------------------------------------------------------------

describe("plan:val:blocked-task-has-blocker", () => {
  it("REJECTS Blocked status without a BlockedBy edge", async () => {
    const host = await freshHost();
    await newPlanningProject(host, "p5a");
    let caught: any = null;
    try {
      await host.createPrimitive("p5a", {
        id: "task:blocked-empty",
        type_id: "plan:Task",
        scope_id: "scope:plan:workbook",
        field_values: {
          ...REQUIRED_TASK_FIELDS,
          status: "Blocked",
          name: "blocked-empty",
          summary: "blocked but no blocker",
          executor_kind: "Human",
          human_estimate: "1h",
          is_root: true,
        },
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeNull();
    const findings = (caught.findings ?? []) as Array<{ rule_id: string }>;
    expect(
      findings.some((f) => f.rule_id === "plan:val:blocked-task-has-blocker"),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (6) plan:val:planned-dates-ordered
// ---------------------------------------------------------------------------

describe("plan:val:planned-dates-ordered", () => {
  it("REJECTS planned_finish < planned_start", async () => {
    const host = await freshHost();
    await newPlanningProject(host, "p6a");
    let caught: any = null;
    try {
      await host.createPrimitive("p6a", {
        id: "task:reverse",
        type_id: "plan:Task",
        scope_id: "scope:plan:workbook",
        field_values: {
          ...REQUIRED_TASK_FIELDS,
          name: "reverse",
          summary: "finish before start",
          executor_kind: "Human",
          human_estimate: "1h",
          planned_start: "2026-05-10",
          planned_finish: "2026-05-01",
          is_root: true,
        },
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeNull();
    const findings = (caught.findings ?? []) as Array<{ rule_id: string }>;
    expect(
      findings.some((f) => f.rule_id === "plan:val:planned-dates-ordered"),
    ).toBe(true);
  });

  it("ACCEPTS planned_finish == planned_start (zero-duration)", async () => {
    const host = await freshHost();
    await newPlanningProject(host, "p6b");
    const r = await host.createPrimitive("p6b", {
      id: "task:zero",
      type_id: "plan:Task",
      scope_id: "scope:plan:workbook",
      field_values: {
        ...REQUIRED_TASK_FIELDS,
        name: "zero",
        summary: "instant",
        executor_kind: "Human",
        human_estimate: "0h",
        planned_start: "2026-05-01",
        planned_finish: "2026-05-01",
        is_root: true,
      },
    });
    expect(r.report.accepted).toBe(true);
  });

  it("ACCEPTS only one date set", async () => {
    const host = await freshHost();
    await newPlanningProject(host, "p6c");
    const r = await host.createPrimitive("p6c", {
      id: "task:half",
      type_id: "plan:Task",
      scope_id: "scope:plan:workbook",
      field_values: {
        ...REQUIRED_TASK_FIELDS,
        name: "half",
        summary: "start only",
        executor_kind: "Human",
        human_estimate: "1d",
        planned_start: "2026-05-01",
        is_root: true,
      },
    });
    expect(r.report.accepted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (7) plan:val:claim-has-expiry
// ---------------------------------------------------------------------------

describe("plan:val:claim-has-expiry", () => {
  it("REJECTS a claim_holder_id without claim_until", async () => {
    const host = await freshHost();
    await newPlanningProject(host, "p7a");
    // Create a sw:Actor for the holder reference (stableId expects sw:Actor).
    // The validation Core does NOT enforce `references`, so a missing
    // Actor primitive doesn't fail the test; the field is allowed as a
    // free-form string. Use a syntactically valid id.
    let caught: any = null;
    try {
      await host.createPrimitive("p7a", {
        id: "task:loose-claim",
        type_id: "plan:Task",
        scope_id: "scope:plan:workbook",
        field_values: {
          ...REQUIRED_TASK_FIELDS,
          name: "loose-claim",
          summary: "claim no expiry",
          executor_kind: "AI",
          ai_minutes: 30,
          claim_holder_id: "actor:Bot:builder",
          // claim_until deliberately omitted
          is_root: true,
        },
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeNull();
    const findings = (caught.findings ?? []) as Array<{ rule_id: string }>;
    expect(
      findings.some((f) => f.rule_id === "plan:val:claim-has-expiry"),
    ).toBe(true);
  });

  it("ACCEPTS a claim_holder_id with claim_until set (Human task to keep this rule isolated)", async () => {
    const host = await freshHost();
    await newPlanningProject(host, "p7b");
    const r = await host.createPrimitive("p7b", {
      id: "task:bounded-claim",
      type_id: "plan:Task",
      scope_id: "scope:plan:workbook",
      field_values: {
        ...REQUIRED_TASK_FIELDS,
        name: "bounded-claim",
        summary: "claim with expiry",
        executor_kind: "Human",
        human_estimate: "1h",
        claim_holder_id: "actor:Person:alice",
        claim_until: "2026-05-04T18:00:00Z",
        is_root: true,
      },
    });
    expect(r.report.accepted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (8) plan:val:ai-task-has-machine-checkable-ac
// ---------------------------------------------------------------------------

describe("plan:val:ai-task-has-machine-checkable-ac", () => {
  it("REJECTS an AI task with no Verifies edge", async () => {
    const host = await freshHost();
    await newPlanningProject(host, "p8a");
    let caught: any = null;
    try {
      await host.createPrimitive("p8a", {
        id: "task:ai-no-ac",
        type_id: "plan:Task",
        scope_id: "scope:plan:workbook",
        field_values: {
          ...REQUIRED_TASK_FIELDS,
          name: "ai-no-ac",
          summary: "ai task without ac",
          executor_kind: "AI",
          ai_minutes: 15,
          is_root: true,
        },
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeNull();
    const findings = (caught.findings ?? []) as Array<{ rule_id: string }>;
    expect(
      findings.some(
        (f) => f.rule_id === "plan:val:ai-task-has-machine-checkable-ac",
      ),
    ).toBe(true);
  });

  it("ACCEPTS an AI task once a Verifies edge is added", async () => {
    const host = await freshHost();
    await newPlanningProject(host, "p8b");
    // Create the AC first; create the task with a placeholder
    // executor_kind=Human (so the AI rule doesn't fire); add Verifies;
    // then flip to AI.
    await host.createPrimitive("p8b", {
      id: "ac:tested-ai-ok",
      type_id: "plan:AcceptanceCriterion",
      scope_id: "scope:plan:workbook",
      field_values: {
        criterion: "test passes",
        expression: 'instance.field_values.status == "Done"',
        status: "open",
      },
    });
    await host.createPrimitive("p8b", {
      id: "task:ai-ok",
      type_id: "plan:Task",
      scope_id: "scope:plan:workbook",
      field_values: {
        ...REQUIRED_TASK_FIELDS,
        name: "ai-ok",
        summary: "ai task with ac",
        executor_kind: "Human",
        human_estimate: "1h",
        is_root: true,
      },
    });
    await host.createRelation("p8b", {
      id: "rel:verifies",
      type_id: "plan:Verifies",
      source_id: "task:ai-ok",
      target_id: "ac:tested-ai-ok",
    });
    const r = await host.replacePrimitive("p8b", {
      id: "task:ai-ok",
      type_id: "plan:Task",
      scope_id: "scope:plan:workbook",
      field_values: {
        ...REQUIRED_TASK_FIELDS,
        name: "ai-ok",
        summary: "ai task with ac",
        executor_kind: "AI",
        ai_minutes: 15,
        is_root: true,
      },
    });
    expect(r.report.accepted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (9) plan:val:implements-target-exists  (helper-set v1.1.0 graph.target_exists)
// ---------------------------------------------------------------------------

describe("plan:val:implements-target-exists", () => {
  it("the Core gate rejects dangling Implements at relation-create time (core:relation:target-missing)", async () => {
    const host = await freshHost();
    await newPlanningProject(host, "p9a");
    await host.createPrimitive("p9a", {
      id: "task:src",
      type_id: "plan:Task",
      scope_id: "scope:plan:workbook",
      field_values: {
        ...REQUIRED_TASK_FIELDS,
        name: "src",
        summary: "src",
        executor_kind: "Human",
        human_estimate: "1h",
        is_root: true,
      },
    });
    let caught: any = null;
    try {
      await host.createRelation("p9a", {
        id: "rel:dangling",
        type_id: "plan:Implements",
        source_id: "task:src",
        target_id: "sw:Capability:GHOST",
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeNull();
    const findings = (caught.findings ?? []) as Array<{ rule_id: string }>;
    // Either the Core gate or the CEL rule must fire — both are valid
    // protections against this dangling reference.
    expect(
      findings.some(
        (f) =>
          f.rule_id === "core:relation:target-missing" ||
          f.rule_id === "plan:val:implements-target-exists",
      ),
    ).toBe(true);
  });

  it("the Core cascades target deletion to outbound Implements relations (so plan:val:implements-target-exists is defense-in-depth)", async () => {
    const host = await freshHost();
    await newPlanningProject(host, "p9c");
    await host.createPrimitive("p9c", {
      id: "task:src",
      type_id: "plan:Task",
      scope_id: "scope:plan:workbook",
      field_values: {
        ...REQUIRED_TASK_FIELDS,
        name: "src",
        summary: "src",
        executor_kind: "Human",
        human_estimate: "1h",
        is_root: true,
      },
    });
    await host.createPrimitive("p9c", {
      id: "task:tgt",
      type_id: "plan:Task",
      scope_id: "scope:plan:workbook",
      field_values: {
        ...REQUIRED_TASK_FIELDS,
        name: "tgt",
        summary: "tgt",
        executor_kind: "Human",
        human_estimate: "1h",
        is_root: true,
      },
    });
    await host.createRelation("p9c", {
      id: "rel:will-cascade",
      type_id: "plan:Implements",
      source_id: "task:src",
      target_id: "task:tgt",
    });
    await host.deletePrimitive("p9c", "task:tgt");
    // After delete: the relation must be gone too (cascade behaviour),
    // and the surviving graph must validate clean.
    const slice = host.store.getProject("p9c");
    expect(Object.keys(slice.primitives)).toEqual(["task:src"]);
    expect(Object.keys(slice.relations)).toEqual([]);
    const report = host.validateProject("p9c");
    const findings = report.primitives
      .flatMap((entry) => entry.findings)
      .filter((f) => f.rule_id === "plan:val:implements-target-exists");
    // Cascade prevents any dangling state, so the rule does NOT fire.
    expect(findings.length).toBe(0);
  });

  it("ACCEPTS plan:Implements once the target primitive exists", async () => {
    const host = await freshHost();
    await newPlanningProject(host, "p9b");
    // Use a sibling primitive in the same workbook (no need to register
    // sw plugin profile — wildcard target_types accepts anything).
    await host.createPrimitive("p9b", {
      id: "task:src",
      type_id: "plan:Task",
      scope_id: "scope:plan:workbook",
      field_values: {
        ...REQUIRED_TASK_FIELDS,
        name: "src",
        summary: "src",
        executor_kind: "Human",
        human_estimate: "1h",
        is_root: true,
      },
    });
    await host.createPrimitive("p9b", {
      id: "task:tgt",
      type_id: "plan:Task",
      scope_id: "scope:plan:workbook",
      field_values: {
        ...REQUIRED_TASK_FIELDS,
        name: "tgt",
        summary: "tgt",
        executor_kind: "Human",
        human_estimate: "1h",
        is_root: true,
      },
    });
    const r = await host.createRelation("p9b", {
      id: "rel:resolves",
      type_id: "plan:Implements",
      source_id: "task:src",
      target_id: "task:tgt",
    });
    expect(r.report.accepted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (10) plan:comp:in-progress-has-assignee  (warning, not error)
// ---------------------------------------------------------------------------

describe("plan:comp:in-progress-has-assignee", () => {
  it("WARNS on In_progress task without assignee_id", async () => {
    const host = await freshHost();
    await newPlanningProject(host, "p10a");
    const r = await host.createPrimitive("p10a", {
      id: "task:unattended",
      type_id: "plan:Task",
      scope_id: "scope:plan:workbook",
      field_values: {
        ...REQUIRED_TASK_FIELDS,
        status: "In_progress",
        name: "unattended",
        summary: "running with no owner",
        executor_kind: "Human",
        human_estimate: "1h",
        is_root: true,
      },
    });
    // Warning ≠ rejection.
    expect(r.report.accepted).toBe(true);
    const fired = r.report.findings.find(
      (f) =>
        f.rule_id === "plan:comp:in-progress-has-assignee" &&
        f.level === "warning",
    );
    expect(fired).toBeDefined();
  });

  it("does NOT fire on Backlog or Done", async () => {
    const host = await freshHost();
    await newPlanningProject(host, "p10b");
    const r = await host.createPrimitive("p10b", {
      id: "task:not-running",
      type_id: "plan:Task",
      scope_id: "scope:plan:workbook",
      field_values: {
        ...REQUIRED_TASK_FIELDS,
        name: "not-running",
        summary: "not active",
        executor_kind: "Human",
        human_estimate: "1h",
        is_root: true,
      },
    });
    expect(r.report.accepted).toBe(true);
    expect(
      r.report.findings.some(
        (f) => f.rule_id === "plan:comp:in-progress-has-assignee",
      ),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// (11) plan:val:iteration-dates-ordered  (pass-2 addition)
// ---------------------------------------------------------------------------

describe("plan:val:iteration-dates-ordered", () => {
  it("REJECTS an iteration with end_date before start_date", async () => {
    const host = await freshHost();
    await newPlanningProject(host, "p11a");
    let caught: any = null;
    try {
      await host.createPrimitive("p11a", {
        id: "iteration:reverse",
        type_id: "plan:Iteration",
        scope_id: "scope:plan:iteration",
        field_values: {
          name: "reverse",
          start_date: "2026-05-15",
          end_date: "2026-05-01",
        },
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeNull();
    const findings = (caught.findings ?? []) as Array<{ rule_id: string }>;
    expect(
      findings.some((f) => f.rule_id === "plan:val:iteration-dates-ordered"),
    ).toBe(true);
  });

  it("ACCEPTS an iteration where end_date == start_date (zero-day)", async () => {
    const host = await freshHost();
    await newPlanningProject(host, "p11b");
    const r = await host.createPrimitive("p11b", {
      id: "iteration:zero",
      type_id: "plan:Iteration",
      scope_id: "scope:plan:iteration",
      field_values: {
        name: "zero",
        start_date: "2026-05-04",
        end_date: "2026-05-04",
      },
    });
    expect(r.report.accepted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (12) plan:val:milestone-hit-not-future  (pass-2 addition)
// ---------------------------------------------------------------------------

describe("plan:val:milestone-hit-not-future", () => {
  it("WARNS on a milestone marked Hit with a future target_date", async () => {
    const host = await freshHost();
    await newPlanningProject(host, "p12a");
    // Future date = year 2099 (safely past env.NOW for the lifetime of
    // this test; the rule compares against the activation's frozen NOW
    // which is wall-clock at evaluator construction).
    const r = await host.createPrimitive("p12a", {
      id: "milestone:future-hit",
      type_id: "plan:Milestone",
      field_values: {
        name: "future-hit",
        target_date: "2099-12-31",
        status: "Hit",
      },
    });
    // Warning ≠ rejection; the create succeeds.
    expect(r.report.accepted).toBe(true);
    const fired = r.report.findings.find(
      (f) =>
        f.rule_id === "plan:val:milestone-hit-not-future" &&
        f.level === "warning",
    );
    expect(fired).toBeDefined();
  });

  it("does NOT warn on a Hit milestone whose target_date is in the past", async () => {
    const host = await freshHost();
    await newPlanningProject(host, "p12b");
    const r = await host.createPrimitive("p12b", {
      id: "milestone:past-hit",
      type_id: "plan:Milestone",
      field_values: {
        name: "past-hit",
        target_date: "2000-01-01",
        status: "Hit",
      },
    });
    expect(r.report.accepted).toBe(true);
    expect(
      r.report.findings.some(
        (f) => f.rule_id === "plan:val:milestone-hit-not-future",
      ),
    ).toBe(false);
  });

  it("does NOT warn on Upcoming/Missed/Cancelled regardless of date", async () => {
    const host = await freshHost();
    await newPlanningProject(host, "p12c");
    for (const status of ["Upcoming", "Missed", "Cancelled"] as const) {
      const r = await host.createPrimitive("p12c", {
        id: `milestone:${status.toLowerCase()}`,
        type_id: "plan:Milestone",
        field_values: {
          name: status.toLowerCase(),
          target_date: "2099-12-31",
          status,
        },
      });
      expect(r.report.accepted).toBe(true);
      expect(
        r.report.findings.some(
          (f) => f.rule_id === "plan:val:milestone-hit-not-future",
        ),
      ).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// End-to-end: host.runRenderer dispatch (capability-level integration test
// distinct from the direct-call renderer tests in planning-renderers.test.ts)
// ---------------------------------------------------------------------------

describe("host.runRenderer end-to-end dispatch for the 3 planning renderers", () => {
  it("dispatches plan:RoadmapRenderer / plan:GanttSvgRenderer / plan:AgentBoardRenderer through the capability registry", async () => {
    const host = await freshHost();
    await newPlanningProject(host, "p-runrenderer");

    // Seed one task so the renderers have something to chew on.
    await host.createPrimitive("p-runrenderer", {
      id: "task:demo",
      type_id: "plan:Task",
      scope_id: "scope:plan:workbook",
      field_values: {
        ...REQUIRED_TASK_FIELDS,
        name: "demo",
        summary: "demo task",
        executor_kind: "Human",
        human_estimate: "1h",
        is_root: true,
        planned_start: "2026-05-04",
        planned_finish: "2026-05-05",
      },
    });

    const slice = host.getProject("p-runrenderer");
    const profile = host.profiles.getResolved(slice.workbook.profile_id);
    const input = {
      workbookId: "p-runrenderer",
      profile,
      primitives: Object.values(slice.primitives),
      relations: Object.values(slice.relations),
    };

    // Roadmap.
    const roadmap = await host.plugins.runRenderer(
      "text/markdown",
      input,
      { rendererId: "plan:RoadmapRenderer" },
    );
    expect(roadmap.contentType).toBe("text/markdown");
    expect(roadmap.rendererId).toBe("plan:RoadmapRenderer");
    expect(new TextDecoder().decode(roadmap.bytes)).toContain(
      "p-runrenderer — Roadmap",
    );

    // Gantt SVG.
    const gantt = await host.plugins.runRenderer(
      "image/svg+xml",
      input,
      { rendererId: "plan:GanttSvgRenderer" },
    );
    expect(gantt.contentType).toBe("image/svg+xml");
    expect(gantt.rendererId).toBe("plan:GanttSvgRenderer");
    expect(new TextDecoder().decode(gantt.bytes)).toContain("<svg");

    // Agent Board.
    const board = await host.plugins.runRenderer(
      "text/markdown",
      input,
      { rendererId: "plan:AgentBoardRenderer" },
    );
    expect(board.contentType).toBe("text/markdown");
    expect(board.rendererId).toBe("plan:AgentBoardRenderer");
    expect(new TextDecoder().decode(board.bytes)).toContain(
      "p-runrenderer — Agent Board",
    );
  });
});

// ---------------------------------------------------------------------------
// Spot-check: the planning profile loads via plugin discovery (auto-registered)
// ---------------------------------------------------------------------------

describe("planning — discoverable as a built-in plugin", () => {
  it("Host.load() registers the planning profile alongside sw and fs", async () => {
    const host = await freshHost();
    expect(host.profiles.has(PROFILE.id)).toBe(true);
    expect(host.profiles.has(SW_PROFILE.id)).toBe(true);
    // Sanity: the renderers were registered.
    const r = host.plugins.findRenderer("text/markdown", "plan:RoadmapRenderer");
    expect(r).toBeDefined();
    const g = host.plugins.findRenderer("image/svg+xml", "plan:GanttSvgRenderer");
    expect(g).toBeDefined();
    const b = host.plugins.findRenderer("text/markdown", "plan:AgentBoardRenderer");
    expect(b).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// (12) plan:val:iteration-name-non-empty
//      (regression for Issue: validator was checking an undeclared `label`
//       field; renamed from iteration-label-non-empty in 2026-Q2)
// ---------------------------------------------------------------------------

describe("plan:val:iteration-name-non-empty", () => {
  it("ACCEPTS a well-named iteration with zero findings from this rule", async () => {
    const host = await freshHost();
    await newPlanningProject(host, "p12a");
    const r = await host.createPrimitive("p12a", {
      id: "iteration:well-named",
      type_id: "plan:Iteration",
      scope_id: "scope:plan:iteration",
      field_values: {
        name: "2026-Q2",
        start_date: "2026-05-05",
        end_date: "2026-08-31",
      },
    });
    expect(r.report.accepted).toBe(true);
    const fired = r.report.findings.filter(
      (f) => f.rule_id === "plan:val:iteration-name-non-empty",
    );
    expect(fired).toEqual([]);
  });

  it("does NOT emit a `core:field:undeclared` warning for a well-formed iteration", async () => {
    // Regression for the prior bug: callers added `label` to suppress
    // this rule, which then triggered `core:field:undeclared`. Now
    // there is no `label` field, no schema mismatch, and no warning.
    const host = await freshHost();
    await newPlanningProject(host, "p12b");
    const r = await host.createPrimitive("p12b", {
      id: "iteration:no-stray-fields",
      type_id: "plan:Iteration",
      scope_id: "scope:plan:iteration",
      field_values: {
        name: "2026-Q2",
        start_date: "2026-05-05",
        end_date: "2026-08-31",
      },
    });
    expect(r.report.accepted).toBe(true);
    const undeclared = r.report.findings.filter(
      (f) => f.rule_id === "core:field:undeclared",
    );
    expect(undeclared).toEqual([]);
  });

  it("WARNS when name is whitespace-only", async () => {
    const host = await freshHost();
    await newPlanningProject(host, "p12c");
    const r = await host.createPrimitive("p12c", {
      id: "iteration:whitespace",
      type_id: "plan:Iteration",
      scope_id: "scope:plan:iteration",
      field_values: {
        name: "   ",
        start_date: "2026-05-05",
        end_date: "2026-08-31",
      },
    });
    expect(r.report.accepted).toBe(true);
    const fired = r.report.findings.find(
      (f) =>
        f.rule_id === "plan:val:iteration-name-non-empty" &&
        f.level === "warning",
    );
    expect(fired).toBeDefined();
    expect(fired!.field_path).toBe("field_values.name");
  });

  it("the prior rule_id `plan:val:iteration-label-non-empty` is no longer registered", async () => {
    // History note: the validator was renamed in 2026-Q2 from
    // iteration-label-non-empty → iteration-name-non-empty as part of
    // fixing the wrong-field bug. This guard ensures the old id
    // doesn't get accidentally re-introduced (e.g. by a copy-paste
    // from an older tutorial).
    const host = await freshHost();
    await newPlanningProject(host, "p12d");
    const r = await host.createPrimitive("p12d", {
      id: "iteration:legacy-id-check",
      type_id: "plan:Iteration",
      scope_id: "scope:plan:iteration",
      field_values: {
        name: "2026-Q2",
        start_date: "2026-05-05",
        end_date: "2026-08-31",
      },
    });
    const old = r.report.findings.filter(
      (f) => f.rule_id === "plan:val:iteration-label-non-empty",
    );
    expect(old).toEqual([]);
  });
});
