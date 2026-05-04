import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { Host } from "../src/core/host.js";

/**
 * End-to-end runtime tests for the software_architecture plugin.
 *
 * Content-parity with the Python source is covered by
 * `software-architecture-content.test.ts`. Here we exercise the actual
 * CLI append → validate → store path: every primitive shape is created
 * through `createPrimitive`, several relations are created through
 * `createRelation`, and we assert the validation pipeline accepts
 * conformant payloads and rejects representative malformed ones.
 *
 * Notes on Python-source-faithful quirks the runtime now enforces:
 *
 *  1. The CLI's id_format checker treats `{placeholder}` as `[^:]+` —
 *     each placeholder is a *single* colon-free segment. The Python
 *     source's `sw:Entity` pattern `{scope}:{kind}:{name}` therefore
 *     requires three colon-free segments (e.g. `domain:Service:Billing`).
 *     But the source's `state:{entity}:{name}` and similar nested
 *     patterns assume `{entity}` is a single segment — they cannot
 *     accommodate a real Entity id (which contains two colons).
 *     We test by using single-segment placeholders for nested patterns.
 *  2. `Decision.alternatives`, `Schema.fields`, `Contract.error_conditions`
 *     are declared as single-valued `StructField[X]` (no `[]` suffix)
 *     in the Python source, even though their `min_items=1` validation
 *     reads them as lists. The runtime correctly enforces the field
 *     type: a single struct object, not an array.
 *  3. `references` validation on `StableID` fields is stored verbatim
 *     but not enforced by the v1.1 Core — values that point at absent
 *     primitives are accepted.
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

async function newProject(host: Host, project_id = "sw-demo"): Promise<void> {
  await host.createProject({
    project_id,
    name: "Software Architecture Demo",
    profile_id: PROFILE_ID,
  });
}

describe("software_architecture — end-to-end runtime", () => {
  it("accepts a conformant Entity (scoped, all required fields, enum + max_length OK)", async () => {
    const host = await freshHost();
    await newProject(host);
    const r = await host.createPrimitive("sw-demo", {
      id: "domain:Service:Billing",
      type_id: "sw:Entity",
      scope_id: "scope:sw:domain",
      field_values: {
        kind: "Service",
        name: "Billing",
        lifecycle: "Active",
        description: "Owns invoices, charges, refunds, and dunning.",
      },
    });
    expect(r.report.accepted).toBe(true);
    expect(host.getProject("sw-demo").primitives["domain:Service:Billing"]).toBeDefined();
  });

  it("rejects an Entity with an enum-violating lifecycle", async () => {
    const host = await freshHost();
    await newProject(host);
    await expect(
      host.createPrimitive("sw-demo", {
        id: "domain:Service:Bad",
        type_id: "sw:Entity",
        scope_id: "scope:sw:domain",
        field_values: {
          kind: "Service",
          name: "Bad",
          lifecycle: "Live", // not in enum
          description: "x",
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects an Entity whose description exceeds the 280-char max_length", async () => {
    const host = await freshHost();
    await newProject(host);
    await expect(
      host.createPrimitive("sw-demo", {
        id: "domain:Service:Long",
        type_id: "sw:Entity",
        scope_id: "scope:sw:domain",
        field_values: {
          kind: "Service",
          name: "Long",
          lifecycle: "Active",
          description: "x".repeat(281),
        },
      }),
    ).rejects.toThrow();
  });

  it("accepts a Decision with a single-object Alternative (StructField[Alternative], not []) ", async () => {
    const host = await freshHost();
    await newProject(host);
    const r = await host.createPrimitive("sw-demo", {
      id: "decision:0001",
      type_id: "sw:Decision",
      scope_id: "scope:sw:domain",
      field_values: {
        status: "Accepted",
        title: "Adopt event sourcing for billing",
        context: "Audit and replay requirements drive the choice.",
        rationale: "Replay enables retroactive correction and audit.",
        alternatives: { name: "CRUD", reason_rejected: "No replay; audit gaps." },
        consequences: "Adds projection complexity but enables audit.",
      },
    });
    expect(r.report.accepted).toBe(true);
  });

  it("rejects a Decision whose alternatives is an array (Python-source single-struct semantics)", async () => {
    const host = await freshHost();
    await newProject(host);
    let caught: unknown = null;
    try {
      await host.createPrimitive("sw-demo", {
        id: "decision:0002",
        type_id: "sw:Decision",
        scope_id: "scope:sw:domain",
        field_values: {
          status: "Accepted",
          title: "x",
          context: "x",
          rationale: "y",
          alternatives: [{ name: "CRUD", reason_rejected: "x" }], // wrong: must be a single object
          consequences: "z",
        },
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeTruthy();
    const findings = (caught as { findings?: Array<{ message: string }> }).findings ?? [];
    expect(findings.some((f) => /expects struct, got array/.test(f.message))).toBe(true);
  });

  it("accepts Concept, Invariant, Constraint, Assumption, Guarantee (semantics primitives)", async () => {
    const host = await freshHost();
    await newProject(host);
    // Each id strictly matches the Python-source id_format pattern.
    const samples: Array<{
      id: string;
      type_id: string;
      scope_id: string;
      field_values: Record<string, unknown>;
    }> = [
      {
        id: "concept:Charge",
        type_id: "sw:Concept",
        scope_id: "scope:sw:domain",
        field_values: { name: "Charge", definition: "An attempt to capture funds." },
      },
      // Scoped-semantic ids use single-segment placeholders for {scope} —
      // the Python source pattern `invariant:{scope}:{name}` cannot fit a
      // full scope id like `scope:sw:domain` (which is itself 3 segments).
      // The id_format `{scope}` slot here is a short scope alias.
      {
        id: "invariant:domain:single-capture",
        type_id: "sw:Invariant",
        scope_id: "scope:sw:domain",
        field_values: {
          statement: "A charge is captured at most once.",
          enforcement: "Runtime",
        },
      },
      {
        id: "constraint:runtime:p99-latency",
        type_id: "sw:Constraint",
        scope_id: "scope:sw:runtime",
        field_values: {
          statement: "p99 charge latency < 300ms",
          metric: "histogram_quantile(0.99, charge_latency)",
        },
      },
      {
        id: "assumption:runtime:network-uptime",
        type_id: "sw:Assumption",
        scope_id: "scope:sw:runtime",
        field_values: {
          statement: "Card-network uptime > 99.9%.",
          invalidation: "Network outage report contradicts.",
        },
      },
      {
        id: "guarantee:runtime:at-least-once",
        type_id: "sw:Guarantee",
        scope_id: "scope:sw:runtime",
        field_values: {
          statement: "At-least-once delivery of charge events.",
          conditions: "Subscriber acks within 30s.",
        },
      },
    ];
    for (const p of samples) {
      const r = await host.createPrimitive("sw-demo", p);
      expect(r.report.accepted, `${p.type_id} should accept`).toBe(true);
    }
  });

  it("accepts behavior primitives (State, Transition, FailureMode) with single-segment placeholders", async () => {
    const host = await freshHost();
    await newProject(host);
    // Note: Python source state:{entity}:{name} requires single-segment {entity}.
    // We use a short placeholder ("billing") here — see test header for context.
    const s1 = await host.createPrimitive("sw-demo", {
      id: "state:billing:Pending",
      type_id: "sw:State",
      field_values: { entity_id: "domain:Service:Billing", name: "Pending", terminal: false },
    });
    const s2 = await host.createPrimitive("sw-demo", {
      id: "state:billing:Captured",
      type_id: "sw:State",
      field_values: { entity_id: "domain:Service:Billing", name: "Captured", terminal: true },
    });
    const tr = await host.createPrimitive("sw-demo", {
      id: "transition:Pending:Captured",
      type_id: "sw:Transition",
      field_values: {
        from_state: "state:billing:Pending",
        to_state: "state:billing:Captured",
        trigger: "Capture API returns 200.",
      },
    });
    const fm = await host.createPrimitive("sw-demo", {
      id: "failure:billing:network-timeout",
      type_id: "sw:FailureMode",
      field_values: {
        entity_id: "domain:Service:Billing",
        description: "Card-network timeout during capture.",
        detection: "Open circuit from capture client metrics.",
        mitigation: "Retry with exponential backoff; surface to dunning queue.",
        severity: "High",
      },
    });
    expect(s1.report.accepted).toBe(true);
    expect(s2.report.accepted).toBe(true);
    expect(tr.report.accepted).toBe(true);
    expect(fm.report.accepted).toBe(true);
  });

  it("accepts interface primitives (Endpoint, Schema, Contract, Event) — single-object struct fields", async () => {
    const host = await freshHost();
    await newProject(host);
    const ep = await host.createPrimitive("sw-demo", {
      id: "endpoint:POST:charges",
      type_id: "sw:Endpoint",
      field_values: {
        name: "Create charge",
        protocol: "HTTP",
        method: "POST",
        path: "charges",
      },
    });
    // Schema.fields is a single StructField[SchemaField] — pass one object,
    // not an array (Python-source single-struct semantics).
    const sch = await host.createPrimitive("sw-demo", {
      id: "schema:ChargeRequest",
      type_id: "sw:Schema",
      field_values: {
        name: "ChargeRequest",
        format: "JSONSchema",
        fields: { name: "amount_cents", type: "integer", required: true, description: "Amount." },
      },
    });
    const con = await host.createPrimitive("sw-demo", {
      id: "contract:billing:checkout",
      type_id: "sw:Contract",
      field_values: {
        provider: "domain:Service:Billing",
        consumer: "domain:Service:Checkout",
        preconditions: ["Authenticated request.", "Currency enabled for merchant."],
        postconditions: ["A persisted charge exists."],
        error_conditions: {
          name: "card_declined",
          condition: "Network reports decline.",
          response: "402 with error.code=card_declined.",
        },
      },
    });
    const ev = await host.createPrimitive("sw-demo", {
      id: "event:billing:charge.captured",
      type_id: "sw:Event",
      field_values: {
        name: "charge.captured",
        source: "domain:Service:Billing",
        schema_id: "schema:ChargeRequest",
        ordering: "PartitionOrdered",
      },
    });
    expect(ep.report.accepted).toBe(true);
    expect(sch.report.accepted).toBe(true);
    expect(con.report.accepted).toBe(true);
    expect(ev.report.accepted).toBe(true);
  });

  it("accepts Evidence with the optional ISO8601 timestamp", async () => {
    const host = await freshHost();
    await newProject(host);
    const r = await host.createPrimitive("sw-demo", {
      id: "evidence:Test:capture-loadtest",
      type_id: "sw:Evidence",
      field_values: {
        kind: "Test",
        source: "https://ci.example.com/runs/4242",
        timestamp: "2026-04-30T12:00:00Z",
        description: "5k RPS capture loadtest passed within the 300ms p99 envelope.",
      },
    });
    expect(r.report.accepted).toBe(true);
  });

  it("creates a relation between two existing primitives (sw:DependsOn, with metadata)", async () => {
    const host = await freshHost();
    await newProject(host);
    for (const name of ["Billing", "Ledger"]) {
      await host.createPrimitive("sw-demo", {
        id: `domain:Service:${name}`,
        type_id: "sw:Entity",
        scope_id: "scope:sw:domain",
        field_values: { kind: "Service", name, lifecycle: "Active", description: `${name} svc` },
      });
    }
    const r = await host.createRelation("sw-demo", {
      id: "rel:billing-depends-ledger",
      type_id: "sw:DependsOn",
      source_id: "domain:Service:Billing",
      target_id: "domain:Service:Ledger",
      field_values: { kind: "runtime" },
    });
    expect(r.report.accepted).toBe(true);
  });
});
