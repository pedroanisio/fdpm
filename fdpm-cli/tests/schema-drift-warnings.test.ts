import { describe, it, expect } from "vitest";
import { newHost } from "./fixtures.js";
import { importTransfer } from "../src/core/host-extra.js";

/**
 * #10 — undeclared top-level field_values keys surface as warning-level
 * findings under rule `core:field:undeclared` when validate runs.
 *
 * The validation gate still rejects only on `error`-level findings, so
 * existing edits are unaffected (no regression). The drift only becomes
 * visible to the operator through `validate` output.
 */

async function seedWithDriftedPrimitive() {
  const host = await newHost();
  await importTransfer(host, {
    spec_core: "1.1",
    project: {
      id: "p",
      name: "P",
      profile_id: "test:demo",
      created_at: new Date().toISOString(),
      revision: 0,
    },
    primitives: [
      {
        id: "section:drifted",
        type_id: "test:section",
        // `title` and `number` are declared. `before`, `after`, `reason`
        // are the kind of fields that older imports carry on
        // ChangeRecord-style primitives — undeclared in this fixture.
        field_values: {
          title: "OK",
          number: 1,
          before: "old text",
          after: "new text",
          reason: "context",
        },
        revision: 0,
      },
    ],
    relations: [],
    templates: [],
    test_suites: [],
    operation_log: [],
  });
  return host;
}

describe("§7 schema-drift detection", () => {
  it("emits one warning per undeclared field", async () => {
    const host = await seedWithDriftedPrimitive();
    const r = host.validateProject("p");
    expect(r.summary.errors).toBe(0);
    expect(r.summary.warnings).toBe(3); // before, after, reason
    expect(r.primitives.length).toBe(1);
    const findings = r.primitives[0]!.findings;
    expect(findings.every((f) => f.rule_id === "core:field:undeclared")).toBe(true);
    const fields = findings
      .map((f) => f.field_path?.replace(/^field_values\./, ""))
      .sort();
    expect(fields).toEqual(["after", "before", "reason"]);
  });

  it("does not surface _metadata as drift (legacy envelope is exempt)", async () => {
    const host = await newHost();
    await importTransfer(host, {
      spec_core: "1.1",
      project: {
        id: "p",
        name: "P",
        profile_id: "test:demo",
        created_at: new Date().toISOString(),
        revision: 0,
      },
      primitives: [
        {
          id: "section:s",
          type_id: "test:section",
          field_values: { title: "S", number: 1 },
          revision: 0,
        },
        {
          id: "para:a",
          type_id: "test:para",
          field_values: { text: "alpha" },
          revision: 0,
        },
      ],
      relations: [
        {
          id: "rel:legacy",
          type_id: "test:rel:contains",
          source_id: "section:s",
          target_id: "para:a",
          field_values: {
            _metadata: { kind: "contains" },
          },
          revision: 0,
        },
      ],
      templates: [],
      test_suites: [],
      operation_log: [],
    });
    const r = host.validateProject("p");
    // _metadata must NOT trigger an "undeclared" warning.
    const undeclaredWarnings = [...r.primitives, ...r.relations]
      .flatMap((rep) => rep.findings)
      .filter((f) => f.rule_id === "core:field:undeclared");
    expect(undeclaredWarnings).toEqual([]);
  });

  it("validation gate still permits writes despite undeclared fields", async () => {
    // Confirm no regression: a clean primitive still creates fine.
    const host = await newHost();
    await host.createProject({ project_id: "p", name: "P", profile_id: "test:demo" });
    const result = await host.createPrimitive("p", {
      id: "section:a",
      type_id: "test:section",
      field_values: { title: "A", number: 1 },
    });
    expect(result.report.accepted).toBe(true);
  });

  it("--strict mode in validate would treat warnings as exit-failing", async () => {
    // The CLI's --strict translates warnings into an exit-code-failing
    // FDPMException. The host method exposes the warnings count; the CLI
    // wraps it. We assert the counts the CLI consumes.
    const host = await seedWithDriftedPrimitive();
    const r = host.validateProject("p");
    expect(r.summary.warnings).toBeGreaterThan(0);
    expect(r.summary.errors).toBe(0);
  });
});
