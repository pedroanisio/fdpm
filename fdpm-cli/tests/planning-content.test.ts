import { describe, it, expect } from "vitest";
import {
  PROFILE,
  PROFILE_ID,
  SCOPE_IDS,
} from "../plugins/planning/index.js";

/**
 * Schema-only coverage of the fdpm.planning profile.
 *
 * These tests read PROFILE directly and exercise NO host-level operations.
 * They are robust against unrelated host-layer faults (e.g. the SPEC-UID
 * partial migration's gate-schema mismatch) — failures in this file
 * indicate a real planning-plugin defect, not baseline drift.
 */

const EXPECTED_PRIMITIVE_IDS = [
  "plan:WorkBreakdown",
  "plan:Task",
  "plan:AcceptanceCriterion",
  "plan:Blocker",
  "plan:Iteration",
  "plan:Milestone",
];

const EXPECTED_RELATION_IDS = [
  "plan:Subtask",
  "plan:Contains",
  "plan:DependsOn",
  "plan:BlockedBy",
  "plan:Verifies",
  "plan:AssignedTo",
  "plan:InIteration",
  "plan:Implements",
  "plan:HitsMilestone",
];

const EXPECTED_RULE_IDS = [
  "plan:val:ai-task-duration-bounded",
  "plan:val:non-root-task-has-deps",
  "plan:val:no-circular-deps",
  "plan:val:done-task-has-ac",
  "plan:val:blocked-task-has-blocker",
  "plan:val:planned-dates-ordered",
  "plan:val:claim-has-expiry",
  "plan:val:ai-task-has-machine-checkable-ac",
  "plan:val:implements-target-exists",
  "plan:comp:in-progress-has-assignee",
  // pass-2 additions
  "plan:val:iteration-dates-ordered",
  "plan:val:milestone-hit-not-future",
];

const EXPECTED_TEMPLATE_IDS = [
  "plan:tpl:roadmap",
  "plan:tpl:gantt",
  "plan:tpl:agent-board",
];

const AI_MINUTES_VALUES = [
  "5",
  "10",
  "15",
  "20",
  "25",
  "30",
  "35",
  "40",
  "45",
  "50",
  "55",
  "60",
];

describe("planning — profile shape", () => {
  it("declares the documented profile id and version", () => {
    expect(PROFILE.id).toBe(PROFILE_ID);
    expect(PROFILE_ID).toBe("profile:planning:0.1");
    expect(PROFILE.version).toBe("0.1.0");
  });

  it("declares 4 categories aligned with the renderer lenses", () => {
    expect(PROFILE.categories.map((c) => c.id).sort()).toEqual([
      "cat:plan:assurance",
      "cat:plan:execution",
      "cat:plan:scheduling",
      "cat:plan:work",
    ]);
  });

  it("declares 3 scopes; SCOPE_IDS export matches the ScopeDefs", () => {
    expect(PROFILE.scopes.map((s) => s.id).sort()).toEqual([
      "scope:plan:execution",
      "scope:plan:iteration",
      "scope:plan:workbook",
    ]);
    expect(SCOPE_IDS).toEqual({
      workbook: "scope:plan:workbook",
      iteration: "scope:plan:iteration",
      execution: "scope:plan:execution",
    });
  });

  it("registers exactly the 6 documented primitive types", () => {
    expect(PROFILE.primitive_types.map((p) => p.id).sort()).toEqual(
      [...EXPECTED_PRIMITIVE_IDS].sort(),
    );
    expect(PROFILE.primitive_types).toHaveLength(6);
  });

  it("registers exactly the 9 documented relation types", () => {
    expect(PROFILE.relation_types.map((r) => r.id).sort()).toEqual(
      [...EXPECTED_RELATION_IDS].sort(),
    );
    expect(PROFILE.relation_types).toHaveLength(9);
  });

  it("registers exactly the 12 documented validation rules", () => {
    expect(PROFILE.validation_rules.map((r) => r.id).sort()).toEqual(
      [...EXPECTED_RULE_IDS].sort(),
    );
    expect(PROFILE.validation_rules).toHaveLength(12);
  });

  it("registers exactly the 3 documented templates pointing at renderers", () => {
    expect(PROFILE.templates.map((t) => t.id).sort()).toEqual(
      [...EXPECTED_TEMPLATE_IDS].sort(),
    );
    const byId = new Map(PROFILE.templates.map((t) => [t.id, t]));
    expect(byId.get("plan:tpl:roadmap")?.target_renderer).toBe(
      "plan:RoadmapRenderer",
    );
    expect(byId.get("plan:tpl:gantt")?.target_renderer).toBe(
      "plan:GanttSvgRenderer",
    );
    expect(byId.get("plan:tpl:agent-board")?.target_renderer).toBe(
      "plan:AgentBoardRenderer",
    );
  });
});

// ---------------------------------------------------------------------------
// AI-task duration: the hard constraint
// ---------------------------------------------------------------------------

describe("planning — AI-task duration is bounded to {5,10,...,60} via Enum", () => {
  it("plan:Task.ai_minutes is an optional Enum with exactly 12 numeric values", () => {
    const task = PROFILE.primitive_types.find((p) => p.id === "plan:Task")!;
    const f = task.fields.find((x) => x.name === "ai_minutes")!;
    expect(f).toBeDefined();
    expect(f.required).toBe(false);
    // legacy_type spelling is `Enum[5, 10, 15, ..., 60]` — values are int
    // literals; the compile.ts enum extractor strips quotes and stores the
    // 12 string forms in enum_values for the enum-membership check.
    expect(f.legacy_type).toBe(`Enum[${AI_MINUTES_VALUES.join(", ")}]`);
  });

  it("the predicate cross-check (ai-task-duration-bounded) requires AI tasks to populate ai_minutes", () => {
    const r = PROFILE.validation_rules.find(
      (x) => x.id === "plan:val:ai-task-duration-bounded",
    )!;
    expect(r).toBeDefined();
    expect(r.level).toBe("error");
    const expr = (r as unknown as { expression: string }).expression;
    expect(expr).toContain('instance.field_values.executor_kind != "AI"');
    expect(expr).toContain("int(instance.field_values.ai_minutes) >= 5");
    expect(expr).toContain("int(instance.field_values.ai_minutes) <= 60");
    expect(expr).toContain("int(instance.field_values.ai_minutes) % 5 == 0");
  });
});

// ---------------------------------------------------------------------------
// Each rule has a CEL expression of the right shape
// ---------------------------------------------------------------------------

describe("planning — every rule has a real CEL expression (not a placeholder)", () => {
  for (const id of EXPECTED_RULE_IDS) {
    it(`rule ${id} ships a non-empty CEL expression that references instance.* or graph.*`, () => {
      const r = PROFILE.validation_rules.find((x) => x.id === id)!;
      expect(r).toBeDefined();
      const expr = (r as unknown as { expression: string }).expression;
      expect(expr.length).toBeGreaterThan(0);
      expect(expr).toMatch(/instance\.|graph\./);
    });
  }
});

// ---------------------------------------------------------------------------
// Helper-set v1.1.0 dependency: implements-target-exists must use graph.target_exists
// ---------------------------------------------------------------------------

describe("planning — plan:val:implements-target-exists uses graph.target_exists (helper-set v1.1.0)", () => {
  it("references the v1.1.0 graph.target_exists helper", () => {
    const r = PROFILE.validation_rules.find(
      (x) => x.id === "plan:val:implements-target-exists",
    )!;
    expect(r).toBeDefined();
    const expr = (r as unknown as { expression: string }).expression;
    expect(expr).toBe('graph.target_exists("plan:Implements")');
    expect(r.level).toBe("error");
  });
});

// ---------------------------------------------------------------------------
// AI-task machine-checkable AC: error level (per user's confirmed pick)
// ---------------------------------------------------------------------------

describe("planning — AI tasks require a machine-checkable AC", () => {
  it("plan:val:ai-task-has-machine-checkable-ac is error-level and requires Verifies edges for AI tasks", () => {
    const r = PROFILE.validation_rules.find(
      (x) => x.id === "plan:val:ai-task-has-machine-checkable-ac",
    )!;
    expect(r).toBeDefined();
    expect(r.level).toBe("error");
    const expr = (r as unknown as { expression: string }).expression;
    expect(expr).toContain('instance.field_values.executor_kind != "AI"');
    expect(expr).toContain('graph.outgoing("plan:Verifies").size() >= 1');
  });
});

// ---------------------------------------------------------------------------
// plan:Task field shape — dense, multi-field; verify the shape per slice 2
// ---------------------------------------------------------------------------

describe("planning — plan:Task carries the documented field set", () => {
  it("ships every documented field with the expected required/optional flags", () => {
    const task = PROFILE.primitive_types.find((p) => p.id === "plan:Task")!;
    const fields = new Map(task.fields.map((f) => [f.name, f]));

    // Required.
    for (const name of [
      "name",
      "summary",
      "kind",
      "executor_kind",
      "status",
      "priority",
    ]) {
      expect(fields.get(name)?.required, `${name} required`).toBe(true);
    }
    // Optional.
    for (const name of [
      "ai_minutes",
      "human_estimate",
      "planned_start",
      "planned_finish",
      "assignee_id",
      "claim_holder_id",
      "claim_until",
      "is_root",
    ]) {
      expect(fields.get(name)?.required, `${name} optional`).toBe(false);
    }
  });

  it("plan:Task.executor_kind is exactly {AI, Human, Either}", () => {
    const task = PROFILE.primitive_types.find((p) => p.id === "plan:Task")!;
    const f = task.fields.find((x) => x.name === "executor_kind")!;
    expect(f.legacy_type).toBe('Enum["AI", "Human", "Either"]');
  });

  it("plan:Task.status is exactly {Backlog, Ready, In_progress, Blocked, In_review, Done, Cancelled}", () => {
    const task = PROFILE.primitive_types.find((p) => p.id === "plan:Task")!;
    const f = task.fields.find((x) => x.name === "status")!;
    expect(f.legacy_type).toBe(
      'Enum["Backlog", "Ready", "In_progress", "Blocked", "In_review", "Done", "Cancelled"]',
    );
  });

  it("plan:Task references sw:Actor for assignee_id and claim_holder_id (cross-profile stableId)", () => {
    const task = PROFILE.primitive_types.find((p) => p.id === "plan:Task")!;
    for (const name of ["assignee_id", "claim_holder_id"]) {
      const f = task.fields.find((x) => x.name === name)!;
      expect(f.legacy_type).toBe("StableID");
      const ref = (f.validations ?? []).find((v) => v.kind === "references");
      expect(ref?.value, `${name} references`).toBe("sw:Actor");
    }
  });
});

// ---------------------------------------------------------------------------
// AcceptanceCriterion shape
// ---------------------------------------------------------------------------

describe("planning — plan:AcceptanceCriterion fields", () => {
  it("ships criterion (required), expression (optional), status (required), evidence_refs (optional)", () => {
    const ac = PROFILE.primitive_types.find(
      (p) => p.id === "plan:AcceptanceCriterion",
    )!;
    const fields = new Map(ac.fields.map((f) => [f.name, f]));
    expect(fields.get("criterion")?.required).toBe(true);
    expect(fields.get("expression")?.required).toBe(false);
    expect(fields.get("status")?.required).toBe(true);
    expect(fields.get("evidence_refs")?.required).toBe(false);
    const status = fields.get("status")!;
    expect(status.legacy_type).toBe(
      'Enum["open", "in_progress", "met", "blocked", "waived"]',
    );
  });
});

// ---------------------------------------------------------------------------
// Relations: cardinality / source-target shape
// ---------------------------------------------------------------------------

describe("planning — relation source/target shapes", () => {
  it("plan:Subtask is Task → Task and transitive", () => {
    const r = PROFILE.relation_types.find((x) => x.id === "plan:Subtask")!;
    expect(r.source_types).toEqual(["plan:Task"]);
    expect(r.target_types).toEqual(["plan:Task"]);
    expect(r.transitive).toBe(true);
  });

  it("plan:Contains is WorkBreakdown → Task | WorkBreakdown and transitive", () => {
    const r = PROFILE.relation_types.find((x) => x.id === "plan:Contains")!;
    expect(r.source_types).toEqual(["plan:WorkBreakdown"]);
    expect(r.target_types).toEqual(["plan:Task", "plan:WorkBreakdown"]);
    expect(r.transitive).toBe(true);
  });

  it("plan:DependsOn is Task → Task, transitive, with optional finish-to-start kind metadata", () => {
    const r = PROFILE.relation_types.find((x) => x.id === "plan:DependsOn")!;
    expect(r.source_types).toEqual(["plan:Task"]);
    expect(r.target_types).toEqual(["plan:Task"]);
    expect(r.transitive).toBe(true);
    const kind = (r.metadata_schema ?? []).find((m) => m.name === "kind");
    expect(kind).toBeDefined();
    expect(kind?.required).toBe(false);
    expect(kind?.legacy_type).toBe(
      'Enum["finish-to-start", "start-to-start", "finish-to-finish", "start-to-finish"]',
    );
  });

  it("plan:Implements is Task → * (wildcard target type) for cross-profile work tracking", () => {
    const r = PROFILE.relation_types.find((x) => x.id === "plan:Implements")!;
    expect(r.source_types).toEqual(["plan:Task"]);
    expect(r.target_types).toBe("*");
  });

  it("plan:AssignedTo is Task → sw:Actor (cross-profile)", () => {
    const r = PROFILE.relation_types.find((x) => x.id === "plan:AssignedTo")!;
    expect(r.source_types).toEqual(["plan:Task"]);
    expect(r.target_types).toEqual(["sw:Actor"]);
  });
});

// ---------------------------------------------------------------------------
// Manifest pin enforces the helper-set version. Verifies the JSON, not the
// plugin runtime.
// ---------------------------------------------------------------------------

describe("planning — manifest declares helper-set v1.1.0 pin", () => {
  it("host_compatibility.expr_helper_set requires >=1.1.0,<2", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const url = await import("node:url");
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const manifestPath = path.join(
      here,
      "..",
      "plugins",
      "planning",
      "fdpm-plugin.json",
    );
    const m = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<
      string,
      unknown
    >;
    const hc = m.host_compatibility as Record<string, string>;
    expect(hc.expr_helper_set).toBe(">=1.1.0,<2");
    expect(m.id).toBe("fdpm.planning");
    expect(m.version).toBe("0.1.0");
  });
});
