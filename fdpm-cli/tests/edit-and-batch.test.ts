import { describe, it, expect } from "vitest";
import { newHost } from "./fixtures.js";
import { FDPMException } from "../src/core/errors/fdpm-exception.js";
import { batchEdit } from "../src/core/host-extra.js";

describe("§9.7 editing API", () => {
  it("core-edit-002: field-patch on immutable field is rejected", async () => {
    const host = await newHost();
    await host.createProject({ workbook_id: "p1", name: "P1", profile_id: "test:demo" });
    await host.createPrimitive("p1", {
      id: "section:a",
      type_id: "test:section",
      field_values: { title: "A", number: 1 },
    });
    await expect(
      host.fieldPatchPrimitive("p1", {
        id: "section:a",
        operations: [{ op: "replace", path: "/id", value: "section:b" } as never],
      }),
    ).rejects.toThrow(/immutable|verification/);
  });

  it("core-edit-003: batch with one failing op rolls back all earlier ops", async () => {
    const host = await newHost();
    await host.createProject({ workbook_id: "p1", name: "P1", profile_id: "test:demo" });
    const beforeRev = host.getProject("p1").workbook.revision;
    await expect(
      batchEdit(host, "p1", [
        {
          kind: "primitive.create",
          payload: {
            id: "section:a",
            type_id: "test:section",
            field_values: { title: "A", number: 1 },
          },
        },
        {
          // Bad payload — will trigger verification rejection mid-batch.
          kind: "primitive.create",
          payload: { id: "x", missing: true },
        },
      ]),
    ).rejects.toThrow(FDPMException);
    // No change observable.
    const afterRev = host.getProject("p1").workbook.revision;
    expect(afterRev).toBe(beforeRev);
    expect(host.getProject("p1").primitives["section:a"]).toBeUndefined();
  });

  it("core-edit-004: If-Match revision mismatch yields conflict", async () => {
    const host = await newHost();
    await host.createProject({ workbook_id: "p1", name: "P1", profile_id: "test:demo" });
    await host.createPrimitive("p1", {
      id: "section:a",
      type_id: "test:section",
      field_values: { title: "A", number: 1 },
    });
    await expect(
      host.patchPrimitive("p1", {
        id: "section:a",
        field_values: { number: 2 },
        expected_revision: 999,
      }),
    ).rejects.toThrow(/If-Match|conflict/);
  });

  it("core-edit-006: reorder with non-permutation is rejected", async () => {
    const host = await newHost();
    await host.createProject({ workbook_id: "p1", name: "P1", profile_id: "test:demo" });
    await host.createPrimitive("p1", {
      id: "section:a",
      type_id: "test:section",
      field_values: { title: "A", number: 1 },
      scope_id: "test:scope:doc",
    });
    await host.createPrimitive("p1", {
      id: "section:b",
      type_id: "test:section",
      field_values: { title: "B", number: 2 },
      scope_id: "test:scope:doc",
    });
    await expect(
      host.reorder("p1", "test:scope:doc", ["section:a", "section:c"]),
    ).rejects.toThrow(/permutation/);
  });

  it("core-edit-006: reorder with a valid full permutation succeeds and rewrites scope_membership", async () => {
    // Regression: while triaging a post-import edit campaign on a
    // 18-member scope, an early test reordered only 13 of the 18 ids
    // and saw "must be a permutation". Confirm that the gate's
    // condition is exactly equality-of-sets — a full permutation
    // succeeds and the new ordering is reflected in the workbook slice.
    const host = await newHost();
    await host.createProject({ workbook_id: "p1", name: "P1", profile_id: "test:demo" });
    for (const [id, n] of [
      ["section:a", 1],
      ["section:b", 2],
      ["section:c", 3],
    ] as const) {
      await host.createPrimitive("p1", {
        id,
        type_id: "test:section",
        field_values: { title: id, number: n },
        scope_id: "test:scope:doc",
      });
    }
    const before = host.getProject("p1").scope_membership["test:scope:doc"];
    expect(before).toEqual(["section:a", "section:b", "section:c"]);
    await host.reorder("p1", "test:scope:doc", [
      "section:c",
      "section:a",
      "section:b",
    ]);
    const after = host.getProject("p1").scope_membership["test:scope:doc"];
    expect(after).toEqual(["section:c", "section:a", "section:b"]);
  });

  it("structure.reparent moves primitive and updates membership", async () => {
    const host = await newHost();
    await host.createProject({ workbook_id: "p1", name: "P1", profile_id: "test:demo" });
    await host.createPrimitive("p1", {
      id: "section:a",
      type_id: "test:section",
      field_values: { title: "A", number: 1 },
      scope_id: "test:scope:doc",
    });
    await host.reparent("p1", {
      primitive_id: "section:a",
      from_scope_id: "test:scope:doc",
      to_scope_id: "test:scope:appendix",
    });
    const slice = host.getProject("p1");
    expect(slice.scope_membership["test:scope:doc"]?.includes("section:a")).toBe(false);
    expect(slice.scope_membership["test:scope:appendix"]?.includes("section:a")).toBe(true);
    expect(slice.primitives["section:a"]?.scope_id).toBe("test:scope:appendix");
  });
});

/**
 * §9.7.4 field-patch validation is path-scoped (P3 — post-v0.5.1 review).
 *
 * Pre-P3, a `:field-patch` on field B was rejected when field A had a
 * pre-existing violation, because the pipeline re-validated the entire
 * merged record. That made imported third-party data uneditable.
 *
 * Post-P3, the §7 step-4 (per-field) checks iterate only over the
 * touched-paths set computed from the JSON-Patch operation list. Other
 * steps (type resolution, ID format, required fields, custom
 * validators) still run in full because they're either cheap or
 * structurally required.
 */
describe("§9.7.4 field-patch — path-scoped revalidation (P3)", () => {
  it("accepts a field-patch on field B when field A has a pre-existing violation", async () => {
    const host = await newHost();
    await host.createProject({ workbook_id: "p1", name: "P1", profile_id: "test:demo" });

    // The test:demo profile declares test:section.title with
    // max_length=200. createPrimitive would reject a 300-char title.
    // We seed the violation by importing a ProjectTransfer (the import
    // path bypasses §7; it's how real-world third-party data lands
    // in the store). The synthetic transfer carries a primitive whose
    // `title` is 300 chars (violating max_length=200) and a `number`
    // that is fine.
    const longTitle = "x".repeat(300);
    const { importTransfer } = await import("../src/core/host-extra.js");
    await importTransfer(host, {
      spec_core: "1.1",
      workbook: {
        id: "p2",
        name: "P2",
        profile_id: "test:demo",
        created_at: new Date().toISOString(),
        revision: 0,
      },
      primitives: [
        {
          id: "section:a",
          type_id: "test:section",
          field_values: { title: longTitle, number: 1 },
          revision: 0,
        },
      ],
      relations: [],
      templates: [],
      test_suites: [],
    });
    // Sanity: the seeded primitive lives in p2.
    const seeded = host.getProject("p2").primitives["section:a"];
    expect(seeded).toBeDefined();
    expect((seeded!.field_values["title"] as string).length).toBe(300);

    // Field-patch the OTHER field. Pre-P3 this fails with
    // "length 300 exceeds max 200" on `title`; post-P3 it succeeds
    // because `title` is not in the touched set.
    const result = await host.fieldPatchPrimitive("p2", {
      id: "section:a",
      operations: [{ op: "replace", path: "/number", value: 99 } as never],
    });
    expect(result.report.accepted).toBe(true);
    // Confirm the patch landed and the unrelated violation is unchanged.
    const patched = host.getProject("p2").primitives["section:a"];
    expect(patched!.field_values["number"]).toBe(99);
    expect((patched!.field_values["title"] as string).length).toBe(300);
  });

  it("still validates a field that is touched by the patch", async () => {
    // Same setup but the patch TARGETS the validated field. The targeting
    // is bounded to touched paths, not "skip all per-field checks" — so
    // a patch that introduces a too-long title MUST fail.
    const host = await newHost();
    await host.createProject({ workbook_id: "p1", name: "P1", profile_id: "test:demo" });
    await host.createPrimitive("p1", {
      id: "section:a",
      type_id: "test:section",
      field_values: { title: "OK", number: 1 },
    });
    let caught: FDPMException | undefined;
    try {
      await host.fieldPatchPrimitive("p1", {
        id: "section:a",
        operations: [
          { op: "replace", path: "/title", value: "x".repeat(300) } as never,
        ],
      });
    } catch (e) {
      caught = e as FDPMException;
    }
    expect(caught).toBeInstanceOf(FDPMException);
    expect(caught!.category).toBe("validation");
    const findings = (caught!.findings ?? []) as Array<{
      rule_id: string;
      field_path?: string | null;
    }>;
    expect(
      findings.some(
        (f) => f.rule_id === "core:field:max_length" && f.field_path === "field_values.title",
      ),
    ).toBe(true);
  });

  it("still enforces required-field absence post-patch (a `remove` on a required field is rejected)", async () => {
    // Step 3 (required) always runs in field-patch — a `remove` op
    // that drops a required field surfaces as a validation error.
    const host = await newHost();
    await host.createProject({ workbook_id: "p1", name: "P1", profile_id: "test:demo" });
    await host.createPrimitive("p1", {
      id: "section:a",
      type_id: "test:section",
      field_values: { title: "OK", number: 1 },
    });
    await expect(
      host.fieldPatchPrimitive("p1", {
        id: "section:a",
        operations: [{ op: "remove", path: "/number" } as never],
      }),
    ).rejects.toThrow(/required field missing.*number|validation/);
  });

  it("touchedTopLevelPaths handles add, remove, replace, move, copy, test", async () => {
    // Direct unit test for the helper — guards against regression in
    // the path-extraction logic that scopes the validator.
    const { touchedTopLevelPaths } = await import("../src/core/operations/json-patch.js");
    const set = touchedTopLevelPaths([
      { op: "add", path: "/a", value: 1 },
      { op: "remove", path: "/b" },
      { op: "replace", path: "/c/0", value: 2 },
      { op: "move", path: "/d", from: "/e/nested" },
      { op: "copy", path: "/f", from: "/g" },
      { op: "test", path: "/h", value: "ok" },
    ]);
    expect([...set].sort()).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
  });
});
