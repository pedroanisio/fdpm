import { describe, it, expect } from "vitest";
import { newHost } from "./fixtures.js";
import { importTransfer } from "../src/core/host-extra.js";

/**
 * #1 — `host.validateProject` (read-only workbook-wide validation).
 *
 * The CLI surface is tested indirectly through host APIs; the same
 * validators run in both pathways, so unit-testing the host method is
 * sufficient.
 *
 * Violations are seeded via `importTransfer` (the import path bypasses
 * §7, mirroring the real-world case where third-party data lands in the
 * store with pre-existing violations).
 */

const longTitle = "x".repeat(300); // exceeds test:section.title max_length 200

async function seedViolatingProject(host: Awaited<ReturnType<typeof newHost>>, workbookId: string) {
  await importTransfer(host, {
    spec_core: "1.1",
    workbook: {
      id: workbookId,
      name: "Imported",
      profile_id: "test:demo",
      created_at: new Date().toISOString(),
      revision: 0,
    },
    primitives: [
      {
        id: "section:bad",
        type_id: "test:section",
        field_values: { title: longTitle, number: 1 },
        revision: 0,
      },
      {
        id: "section:also-bad",
        type_id: "test:section",
        field_values: { title: longTitle, number: 2 },
        revision: 0,
      },
      {
        id: "section:clean",
        type_id: "test:section",
        field_values: { title: "OK", number: 3 },
        revision: 0,
      },
    ],
    relations: [],
    templates: [],
    test_suites: [],
    operation_log: [],
  });
}

describe("host.validateProject", () => {
  it("returns empty findings for a clean workbook", async () => {
    const host = await newHost();
    await host.createProject({ workbook_id: "p", name: "P", profile_id: "test:demo" });
    await host.createPrimitive("p", {
      id: "section:a",
      type_id: "test:section",
      field_values: { title: "A", number: 1 },
    });
    const r = host.validateProject("p");
    expect(r.summary.errors).toBe(0);
    expect(r.summary.warnings).toBe(0);
    expect(r.primitives).toEqual([]);
    expect(r.relations).toEqual([]);
    expect(r.revision).toBeGreaterThan(0);
  });

  it("surfaces a max_length violation that bypassed the import gate", async () => {
    const host = await newHost();
    await seedViolatingProject(host, "imp");
    const r = host.validateProject("imp");
    expect(r.summary.errors).toBeGreaterThan(0);
    expect(r.primitives.length).toBe(2); // bad + also-bad; clean is omitted
    const ids = r.primitives.map((p) => p.target_id).sort();
    expect(ids).toEqual(["section:also-bad", "section:bad"]);
    const ruleIds = new Set(
      r.primitives.flatMap((p) => p.findings.map((f) => f.rule_id)),
    );
    expect(ruleIds.has("core:field:max_length")).toBe(true);
  });

  it("filters by --target id", async () => {
    const host = await newHost();
    await seedViolatingProject(host, "imp");
    const restricted = host.validateProject("imp", {
      targetIds: new Set(["section:bad"]),
    });
    expect(restricted.primitives.length).toBe(1);
    expect(restricted.primitives[0]?.target_id).toBe("section:bad");
  });

  it("filters by --rule id", async () => {
    const host = await newHost();
    await seedViolatingProject(host, "imp");
    const matched = host.validateProject("imp", {
      ruleIds: new Set(["core:field:max_length"]),
    });
    expect(matched.summary.errors).toBeGreaterThan(0);
    const noMatch = host.validateProject("imp", {
      ruleIds: new Set(["core:nonexistent"]),
    });
    expect(noMatch.summary.errors).toBe(0);
    expect(noMatch.primitives).toEqual([]);
  });

  it("filters by --min-level (drops below threshold)", async () => {
    const host = await newHost();
    await seedViolatingProject(host, "imp");
    const all = host.validateProject("imp", { minLevel: "info" });
    const errOnly = host.validateProject("imp", { minLevel: "error" });
    // Both should report the same errors — no warnings/info in this fixture.
    expect(errOnly.summary.errors).toBe(all.summary.errors);
    // With minLevel=error, accepted flag flips per-report based on filtered set.
  });

  it("is read-only: revision unchanged after multiple validate calls", async () => {
    const host = await newHost();
    await seedViolatingProject(host, "imp");
    const before = host.getProject("imp").workbook.revision;
    host.validateProject("imp");
    host.validateProject("imp", { minLevel: "error" });
    host.validateProject("imp", { targetIds: new Set(["section:bad"]) });
    const after = host.getProject("imp").workbook.revision;
    expect(after).toBe(before);
  });

  it("throws when workbook does not exist", async () => {
    const host = await newHost();
    expect(() => host.validateProject("ghost")).toThrow();
  });
});
