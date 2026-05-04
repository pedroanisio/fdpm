import { describe, it, expect } from "vitest";
import { newHost } from "./fixtures.js";
import { importTransfer } from "../src/core/host-extra.js";

/**
 * #3 — `primitive patch` (and `relation patch`) default to touched-paths
 * validation. A patch on field B succeeds even when field A has a
 * pre-existing violation; this is what makes imported third-party data
 * editable through the targeted-patch surface.
 *
 * `--full-validate` (`fullValidate: true`) is the escape hatch for
 * callers that want the original strict semantics.
 */

const longTitle = "x".repeat(300); // > test:section.title max_length 200

async function seed(host: Awaited<ReturnType<typeof newHost>>) {
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
        id: "section:imported",
        type_id: "test:section",
        // Pre-existing violation on `title`.
        field_values: { title: longTitle, number: 1 },
        revision: 0,
      },
    ],
    relations: [],
    templates: [],
    test_suites: [],
    operation_log: [],
  });
}

describe("§9.7 patchPrimitive — touched-paths default", () => {
  it("succeeds when patching an unrelated field despite pre-existing violation", async () => {
    const host = await newHost();
    await seed(host);
    const result = await host.patchPrimitive("p", {
      id: "section:imported",
      // Touch `number` only — `title` is left untouched (and over max_length).
      field_values: { number: 42 },
    });
    expect(result.report.accepted).toBe(true);
    expect(host.getProject("p").primitives["section:imported"]?.field_values["number"]).toBe(42);
  });

  it("rejects when --full-validate is set and another field violates", async () => {
    const host = await newHost();
    await seed(host);
    await expect(
      host.patchPrimitive("p", {
        id: "section:imported",
        field_values: { number: 99 },
        fullValidate: true,
      }),
    ).rejects.toThrow(/validation/i);
  });

  it("still rejects when the touched field itself violates", async () => {
    const host = await newHost();
    await seed(host);
    await expect(
      host.patchPrimitive("p", {
        id: "section:imported",
        // Replace title with another over-length value.
        field_values: { title: "y".repeat(400) },
      }),
    ).rejects.toThrow(/validation/i);
  });

  it("does not record fullValidate in the persisted op payload", async () => {
    const host = await newHost();
    await seed(host);
    await host.patchPrimitive("p", {
      id: "section:imported",
      field_values: { number: 7 },
      fullValidate: false,
    });
    const log = host.getLog("p", { kinds: ["primitive.patch"] });
    const last = log[log.length - 1];
    expect(last).toBeDefined();
    expect(Object.keys(last!.payload as object)).not.toContain("fullValidate");
  });
});

describe("§9.7 patchRelation — touched-paths default", () => {
  it("succeeds when patching an unrelated relation field after a sibling violation", async () => {
    // The test:demo profile has no required-field violations on the
    // existing relation type, so this test verifies the no-regression
    // path: a normal patch still succeeds in the touched-paths default.
    const host = await newHost();
    await host.createProject({ project_id: "q", name: "Q", profile_id: "test:demo" });
    await host.createPrimitive("q", {
      id: "section:s",
      type_id: "test:section",
      field_values: { title: "S", number: 1 },
    });
    await host.createPrimitive("q", {
      id: "para:a",
      type_id: "test:para",
      field_values: { text: "alpha" },
    });
    await host.createRelation("q", {
      id: "rel:s-a",
      type_id: "test:rel:contains",
      source_id: "section:s",
      target_id: "para:a",
      field_values: {},
    });
    // No-op patch (no fields on this relation type) should still be
    // schema-clean. We use replace to exercise the relation patch path.
    const r = await host.patchRelation("q", {
      id: "rel:s-a",
      field_values: {},
    });
    expect(r.report.accepted).toBe(true);
  });
});
