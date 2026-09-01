import { describe, it, expect } from "vitest";
import { newHost } from "./fixtures.js";
import {
  exportTransfer,
  importTransfer,
  createTemplate,
  applyTemplate,
  createTestSuite,
  runTestSuite,
} from "../src/core/host-extra.js";
import { SPEC_CORE_VERSION } from "../src/core/version/spec.js";

describe("transfer + templates + test-suites", () => {
  it("transfer round-trips a workbook verbatim", async () => {
    const a = await newHost();
    await a.createProject({ workbook_id: "p1", name: "P1", profile_id: "test:demo" });
    await a.createPrimitive("p1", {
      id: "section:a",
      type_id: "test:section",
      field_values: { title: "A", number: 1 },
    });
    const transfer = exportTransfer(a, "p1");
    // Track the constant, not a literal: a SPEC minor bump should not
    // require editing an unrelated round-trip test.
    expect(transfer.spec_core).toBe(SPEC_CORE_VERSION);

    const b = await newHost();
    // Re-target the transfer's workbook id for the destination host.
    transfer.workbook = { ...transfer.workbook, id: "p1-imported" };
    const imported = await importTransfer(b, transfer);
    expect(imported.workbook_id).toBe("p1-imported");
    expect(b.getProject("p1-imported").primitives["section:a"]).toBeDefined();
  });

  it("templates: create + apply expands per-primitive operations under one parent_op_id", async () => {
    const host = await newHost();
    await host.createProject({ workbook_id: "p1", name: "P1", profile_id: "test:demo" });
    await createTemplate(host, "p1", {
      id: "tmpl:basic",
      label: "Basic",
      primitives: [
        {
          id: "section:tmpl-a",
          type_id: "test:section",
          field_values: { title: "Templated A", number: 1 },
          revision: 0,
        },
      ],
      relations: [],
    });
    const out = await applyTemplate(host, "p1", "tmpl:basic", "copy:");
    expect(out.length).toBeGreaterThan(1);
    const parent = out[0]!.op.op_id;
    expect(out[1]!.op.parent_op_id).toBe(parent);
    expect(host.getProject("p1").primitives["copy:section:tmpl-a"]).toBeDefined();
  });

  it("test-suite: run produces a SuiteRunReport", async () => {
    const host = await newHost();
    await host.createProject({ workbook_id: "p1", name: "P1", profile_id: "test:demo" });
    await createTestSuite(host, "p1", {
      id: "suite:demo",
      label: "Demo",
      checks: [
        { id: "chk:1", expression: "always-pass", level: "info", message: "ok" },
      ],
    });
    const report = runTestSuite(host, "p1", "suite:demo");
    expect(report.suite_id).toBe("suite:demo");
    expect(report.findings).toHaveLength(1);
    expect(report.accepted).toBe(true);
  });
});
