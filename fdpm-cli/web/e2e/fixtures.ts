import type { Page, Route } from "@playwright/test";

export const workbooks = [
  {
    id: "plan-chatbot-mvp",
    name: "Plan — Customer-support chatbot MVP",
    profile_id: "profile:planning:0.1",
    revision: 112,
  },
  {
    id: "architecture-analysis",
    name: "FDPM Architecture Analysis",
    profile_id: "profile:software-architecture:1.0",
    revision: 158,
  },
  {
    id: "spec-neutron-stars",
    name: "Formal Specification — Neutron-Star Formation",
    profile_id: "profile:formal-specification:3.0",
    revision: 88,
  },
  {
    id: "starter-recipes",
    name: "Starter Recipes",
    profile_id: "profile:starter:0.1",
    revision: 22,
  },
];

export const plugins = [
  {
    id: "fdpm.planning",
    version: "0.1.0",
    kind: "server",
    state: "active",
    trust: "core",
    capabilities: 15,
  },
  {
    id: "fdpm.spec-authoring",
    version: "0.1.0",
    kind: "server",
    state: "active",
    trust: "core",
    capabilities: 10,
  },
  {
    id: "fdpm.quarantined-example",
    version: "0.1.0",
    kind: "server",
    state: "quarantined",
    trust: "third-party",
    capabilities: 2,
  },
];

export const planningWorkbook = {
  workbook: {
    id: "plan-chatbot-mvp",
    name: "Plan — Customer-support chatbot MVP",
    profile_id: "profile:planning:0.1",
    description: "A focused release plan with explicit acceptance evidence.",
    created_at: "2026-05-01T00:00:00.000Z",
    revision: 112,
  },
  primitives: {
    "iteration:foundation": {
      id: "iteration:foundation",
      uid: "01ITERATION",
      type_id: "plan:Iteration",
      revision: 1,
      field_values: {
        name: "Foundation",
        goal: "Ship the verified application skeleton.",
        start_date: "2026-05-06",
        end_date: "2026-05-19",
      },
    },
    "task:scaffold": {
      id: "task:scaffold",
      uid: "01TASKSCAFFOLD",
      type_id: "plan:Task",
      revision: 2,
      field_values: {
        name: "Scaffold application",
        summary: "Create the typed application shell and test wiring.",
        status: "Ready",
        priority: "P0",
        executor_kind: "Either",
        kind: "Implementation",
        ai_minutes: 60,
      },
    },
    "criterion:scaffold": {
      id: "criterion:scaffold",
      uid: "01CRITERION",
      type_id: "plan:AcceptanceCriterion",
      revision: 1,
      field_values: { criterion: "The clean build and test suite pass.", status: "open" },
    },
  },
  relations: [
    {
      id: "rel:iteration",
      type_id: "plan:InIteration",
      source_id: "task:scaffold",
      target_id: "iteration:foundation",
    },
    {
      id: "rel:verifies",
      type_id: "plan:Verifies",
      source_id: "task:scaffold",
      target_id: "criterion:scaffold",
    },
  ],
};

const genericWorkbook = {
  workbook: {
    id: "starter-recipes",
    name: "Starter Recipes",
    profile_id: "profile:starter:0.1",
    description: "Small examples for learning the workbook model.",
    created_at: "2026-05-01T00:00:00.000Z",
    revision: 22,
  },
  primitives: {
    "recipe:first": {
      id: "recipe:first",
      uid: "01RECIPE",
      type_id: "starter:Recipe",
      revision: 1,
      field_values: { name: "First recipe", instructions: "Create, validate, then render." },
    },
  },
  relations: [],
};

const profile = {
  id: "profile:planning:0.1",
  version: "0.1.0",
  name: "Planning",
  label: "Planning",
  description: "Typed execution plans with task-state validation.",
  primitive_types: [
    {
      id: "plan:Task",
      name: "Task",
      description: "An executable unit of work.",
      fields: [
        { name: "name", kind: "string", required: true, description: "Human-readable task name." },
        { name: "status", kind: "enum", required: true, description: "Current workflow state." },
      ],
    },
  ],
  relation_types: [
    {
      id: "plan:Verifies",
      name: "Verifies",
      description: "Links a task to its acceptance evidence.",
      source_types: ["plan:Task"],
      target_types: ["plan:AcceptanceCriterion"],
      fields: [],
    },
  ],
};

function json(route: Route, value: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
}

export async function mockApi(page: Page): Promise<void> {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (request.method() === "POST" && path.startsWith("/api/planning/")) {
      return json(route, { ok: true, workbook: "plan-chatbot-mvp", task_id: "task:scaffold", verb: path.split("/").pop(), revision: 113 });
    }
    if (path === "/api/workbooks") return json(route, { workbooks });
    if (path === "/api/workbooks/plan-chatbot-mvp") return json(route, planningWorkbook);
    if (path.startsWith("/api/workbooks/")) return json(route, genericWorkbook);
    if (path === "/api/plugins") return json(route, { plugins });
    if (path === "/api/plugins/fdpm.planning/manifest") {
      return json(route, {
        id: "fdpm.planning",
        version: "0.1.0",
        kind: "server",
        name: "Planning",
        description: "Planning workflows with verified task transitions.",
        authors: ["FDPM contributors"],
        license: "MIT",
      });
    }
    if (path === "/api/plugins/fdpm.planning/readme") {
      return json(route, { markdown: "## Planning plugin\n\nUse the profile to coordinate verified execution." });
    }
    if (path === "/api/plugins/fdpm.planning") {
      return json(route, {
        id: "fdpm.planning",
        version: "0.1.0",
        state: "active",
        trust: "core",
        kind: "server",
        permissions: ["read:workbooks", "write:primitives"],
        capabilities: [
          { capability_id: "cap:profile", local_name: "planning", entry: "./index.ts" },
          { capability_id: "cap:validator", local_name: "task-state", entry: "./validation.ts" },
        ],
        contributions: { profiles: ["profile:planning:0.1"], validators: 1, renderers: 0, transformers: 0, importers: 0, exporters: 0 },
        source: { kind: "workspace", root: "plugins/planning", manifestPath: "plugins/planning/fdpm-plugin.json", builtin: true },
      });
    }
    if (path === "/api/profiles") {
      return json(route, { profiles: [{ id: profile.id, version: profile.version, label: profile.label, primitive_type_count: 1, relation_type_count: 1 }] });
    }
    if (path.startsWith("/api/profiles/")) return json(route, profile);
    return json(route, { error: "not_found" }, 404);
  });
}
