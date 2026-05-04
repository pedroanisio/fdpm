import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "node:path";
import { Host } from "../src/core/host.js";

/**
 * End-to-end tests for the two renderers contributed by the
 * `fdpm.software-architecture` plugin:
 *
 *   - sw:OpenAPIRenderer   → application/x-yaml (OpenAPI 3.1)
 *   - sw:ADRRenderer       → text/markdown (one section per sw:Decision)
 *
 * The tests exercise the full host pipeline (registration → runRenderer →
 * §6.5 output verification), and the output structure is asserted against
 * concrete primitives we insert here.
 */

const PROFILE_ID = "profile:software-architecture:1.0";

async function freshHost(): Promise<Host> {
  const host = new Host({
    dataDir: null,
    builtinDirs: [resolve(process.cwd(), "plugins")],
    pluginPaths: [],
  });
  await host.load();
  return host;
}

async function projectWithDecisions(host: Host): Promise<void> {
  await host.createProject({
    project_id: "demo-adr",
    name: "ADR demo",
    profile_id: PROFILE_ID,
  });
  // Two decisions, second supersedes first. Order matters because of the
  // sw:val:decision-superseded-has-successor CEL rule (error level): the
  // Superseded status can only be set AFTER the sw:Supersedes edge exists,
  // so we create both decisions as Accepted, wire the relation, then flip
  // decision:0001 to Superseded.
  await host.createPrimitive("demo-adr", {
    id: "decision:0001",
    type_id: "sw:Decision",
    scope_id: "scope:sw:domain",
    field_values: {
      status: "Accepted",
      title: "Use SQLite",
      context: "Need a local store.",
      rationale: "Single-file, no daemon.",
      alternatives: { name: "Postgres", reason_rejected: "Operator overhead." },
      consequences: "Limited concurrency.",
    },
  });
  await host.createPrimitive("demo-adr", {
    id: "decision:0002",
    type_id: "sw:Decision",
    scope_id: "scope:sw:domain",
    field_values: {
      status: "Accepted",
      title: "Switch to Postgres",
      context: "Concurrency requirements grew.",
      rationale: "MVCC handles the new workload.",
      alternatives: { name: "Stay on SQLite", reason_rejected: "Lock contention." },
      consequences: "Adds an operational dependency.",
    },
  });
  await host.createRelation("demo-adr", {
    id: "rel:supersedes-1",
    type_id: "sw:Supersedes",
    source_id: "decision:0002",
    target_id: "decision:0001",
  });
  await host.replacePrimitive("demo-adr", {
    id: "decision:0001",
    type_id: "sw:Decision",
    scope_id: "scope:sw:domain",
    field_values: {
      status: "Superseded",
      title: "Use SQLite",
      context: "Need a local store.",
      rationale: "Single-file, no daemon.",
      alternatives: { name: "Postgres", reason_rejected: "Operator overhead." },
      consequences: "Limited concurrency.",
    },
  });
  // Evidence justifying the superseder.
  await host.createPrimitive("demo-adr", {
    id: "evidence:Reference:bench",
    type_id: "sw:Evidence",
    field_values: {
      kind: "Reference",
      source: "docs/bench-2026Q1.md",
      description: "Q1 benchmark showed 40x lock contention on SQLite under target load.",
    },
  });
  await host.createRelation("demo-adr", {
    id: "rel:justifies-bench",
    type_id: "sw:Justifies",
    source_id: "evidence:Reference:bench",
    target_id: "decision:0002",
  });
}

async function projectWithHttpApi(host: Host): Promise<void> {
  await host.createProject({
    project_id: "demo-api",
    name: "HTTP API demo",
    profile_id: PROFILE_ID,
  });
  // A service.
  await host.createPrimitive("demo-api", {
    id: "domain:Service:Orders",
    type_id: "sw:Entity",
    scope_id: "scope:sw:domain",
    field_values: {
      kind: "Service",
      name: "Orders",
      lifecycle: "Active",
      description: "Owns order placement.",
    },
  });
  // Two endpoints — one HTTP, one CLI (CLI must be excluded).
  await host.createPrimitive("demo-api", {
    id: "endpoint:POST:place-order",
    type_id: "sw:Endpoint",
    field_values: {
      name: "Place order",
      protocol: "HTTP",
      method: "POST",
      path: "/orders",
    },
  });
  await host.createPrimitive("demo-api", {
    id: "endpoint:CLI:replay",
    type_id: "sw:Endpoint",
    field_values: {
      name: "Replay log",
      protocol: "CLI",
    },
  });
  // Schemas for input and output.
  // NOTE: sw:Schema.fields is a single-valued StructField[SchemaField] in the
  // v1.0 profile (Python-source parity quirk — see the plugin README "Single-
  // valued StructField" note). One field per Schema is the only shape that
  // currently passes validation; the OpenAPI renderer's asArray() handles
  // either form so it's forward-compatible.
  await host.createPrimitive("demo-api", {
    id: "schema:OrderRequest",
    type_id: "sw:Schema",
    field_values: {
      name: "OrderRequest",
      format: "JSONSchema",
      fields: { name: "quantity", type: "integer", required: true, description: "Units to order." },
    },
  });
  await host.createPrimitive("demo-api", {
    id: "schema:OrderResponse",
    type_id: "sw:Schema",
    field_values: {
      name: "OrderResponse",
      format: "JSONSchema",
      fields: { name: "order_id", type: "uuid", required: true, description: "Assigned id." },
    },
  });
  // Wire endpoint ↔ service ↔ schemas.
  await host.createRelation("demo-api", {
    id: "rel:exposes-place",
    type_id: "sw:Exposes",
    source_id: "domain:Service:Orders",
    target_id: "endpoint:POST:place-order",
  });
  await host.createRelation("demo-api", {
    id: "rel:input-place",
    type_id: "sw:InputTo",
    source_id: "schema:OrderRequest",
    target_id: "endpoint:POST:place-order",
  });
  await host.createRelation("demo-api", {
    id: "rel:output-place",
    type_id: "sw:OutputOf",
    source_id: "schema:OrderResponse",
    target_id: "endpoint:POST:place-order",
  });
}

describe("sw:ADRRenderer — text/markdown", () => {
  let host: Host;
  beforeAll(async () => {
    host = await freshHost();
    await projectWithDecisions(host);
  });

  it("is registered under target=text/markdown with rendererId=sw:ADRRenderer", () => {
    const reg = host.plugins.findRenderer("text/markdown", "sw:ADRRenderer");
    expect(reg).toBeDefined();
    expect(reg?.pluginId).toBe("fdpm.software-architecture");
  });

  it("emits one section per Decision, an index, and supersedes/superseded-by lines", async () => {
    const slice = host.getProject("demo-adr");
    const profile = host.profiles.getResolved(slice.project.profile_id);
    const out = await host.plugins.runRenderer(
      "text/markdown",
      {
        projectId: "demo-adr",
        primitives: Object.values(slice.primitives),
        relations: Object.values(slice.relations),
        profile,
      },
      { rendererId: "sw:ADRRenderer" },
    );
    expect(out.contentType).toBe("text/markdown");
    expect(out.rendererId).toBe("sw:ADRRenderer");
    const md = new TextDecoder("utf-8", { fatal: true }).decode(out.bytes);

    // Header + index.
    expect(md.startsWith("# Architectural Decision Records — demo-adr")).toBe(true);
    expect(md).toContain("Generated by `sw:ADRRenderer` from 2 `sw:Decision` primitives");
    expect(md).toContain("## Index");
    expect(md).toContain("[`decision:0001`](#adr--decision-0001)");
    expect(md).toContain("[`decision:0002`](#adr--decision-0002)");

    // Sections.
    expect(md).toContain("## ADR — `decision:0001`: Use SQLite");
    expect(md).toContain("## ADR — `decision:0002`: Switch to Postgres");

    // Supersedes / superseded-by.
    expect(md).toContain("**Superseded by:** `decision:0002`");
    expect(md).toContain("**Supersedes:** `decision:0001`");

    // Sections from the template.
    expect(md).toContain("### Context");
    expect(md).toContain("### Decision");
    expect(md).toContain("### Consequences");
    expect(md).toContain("### Alternatives considered");
    expect(md).toContain("**Postgres** — Operator overhead.");

    // Evidence wired by sw:Justifies appears under decision:0002.
    expect(md).toContain("### Evidence");
    expect(md).toContain("`evidence:Reference:bench` (Reference)");
  });

  it("emits a documented stub when there are no decisions", async () => {
    const empty = await freshHost();
    await empty.createProject({
      project_id: "no-adr",
      name: "Empty",
      profile_id: PROFILE_ID,
    });
    const slice = empty.getProject("no-adr");
    const profile = empty.profiles.getResolved(slice.project.profile_id);
    const out = await empty.plugins.runRenderer(
      "text/markdown",
      {
        projectId: "no-adr",
        primitives: Object.values(slice.primitives),
        relations: Object.values(slice.relations),
        profile,
      },
      { rendererId: "sw:ADRRenderer" },
    );
    const md = new TextDecoder().decode(out.bytes);
    expect(md).toContain("from 0 `sw:Decision` primitive");
    expect(md).toContain("_No `sw:Decision` primitives found in this project._");
  });
});

describe("sw:OpenAPIRenderer — application/x-yaml", () => {
  let host: Host;
  beforeAll(async () => {
    host = await freshHost();
    await projectWithHttpApi(host);
  });

  it("is registered under target=application/x-yaml with rendererId=sw:OpenAPIRenderer", () => {
    const reg = host.plugins.findRenderer("application/x-yaml", "sw:OpenAPIRenderer");
    expect(reg).toBeDefined();
    expect(reg?.pluginId).toBe("fdpm.software-architecture");
  });

  it("emits an OpenAPI 3.1 doc with paths, components, tags, and an exclusion log", async () => {
    const slice = host.getProject("demo-api");
    const profile = host.profiles.getResolved(slice.project.profile_id);
    const out = await host.plugins.runRenderer(
      "application/x-yaml",
      {
        projectId: "demo-api",
        primitives: Object.values(slice.primitives),
        relations: Object.values(slice.relations),
        profile,
      },
      { rendererId: "sw:OpenAPIRenderer" },
    );
    expect(out.contentType).toBe("application/x-yaml");
    expect(out.rendererId).toBe("sw:OpenAPIRenderer");
    expect(out.filename).toBe("openapi.yaml");

    const yaml = new TextDecoder("utf-8", { fatal: true }).decode(out.bytes);

    // Header.
    expect(yaml.startsWith("openapi: 3.1.0")).toBe(true);

    // Info block.
    expect(yaml).toContain("title: Software Architecture");
    expect(yaml).toContain("x-fdpm-project-id: demo-api");
    expect(yaml).toContain('x-fdpm-profile-id: "profile:software-architecture:1.0"');

    // Tag for the Service.
    expect(yaml).toContain("name: Orders");

    // The HTTP endpoint shows up under paths./orders.post.
    expect(yaml).toContain("/orders:");
    expect(yaml).toContain("post:");
    expect(yaml).toContain("summary: Place order");
    expect(yaml).toContain("operationId: endpoint_POST_place_order");
    // Tag wired through sw:Exposes.
    expect(yaml).toContain("- Orders");

    // Request body refs the input schema.
    expect(yaml).toContain("requestBody:");
    expect(yaml).toContain("$ref: \"#/components/schemas/OrderRequest\"");
    // Response schema.
    expect(yaml).toContain("$ref: \"#/components/schemas/OrderResponse\"");

    // Components section with both schemas.
    expect(yaml).toContain("components:");
    expect(yaml).toContain("OrderRequest:");
    expect(yaml).toContain("OrderResponse:");
    // mapFieldType: uuid → string + format: uuid
    expect(yaml).toContain("format: uuid");
    // mapFieldType: integer → integer + format: int32
    expect(yaml).toContain("format: int32");

    // CLI endpoint must be excluded with a recorded reason.
    expect(yaml).toContain("x-fdpm-excluded-endpoints:");
    expect(yaml).toContain("id: \"endpoint:CLI:replay\"");
    expect(yaml).toContain("reason: protocol=CLI (OpenAPI describes HTTP only)");
  });

  it("produces an empty paths map (paths: {}) when no HTTP endpoints exist", async () => {
    const empty = await freshHost();
    await empty.createProject({
      project_id: "no-http",
      name: "Empty",
      profile_id: PROFILE_ID,
    });
    const slice = empty.getProject("no-http");
    const profile = empty.profiles.getResolved(slice.project.profile_id);
    const out = await empty.plugins.runRenderer(
      "application/x-yaml",
      {
        projectId: "no-http",
        primitives: Object.values(slice.primitives),
        relations: Object.values(slice.relations),
        profile,
      },
      { rendererId: "sw:OpenAPIRenderer" },
    );
    const yaml = new TextDecoder().decode(out.bytes);
    expect(yaml).toContain("paths: {}");
  });
});
