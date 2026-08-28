import { describe, it, expect } from "vitest";
import { Host } from "../src/core/host.js";
import { TEST_PROFILE } from "./fixtures.js";
import {
  defineProject,
  patchPrimitive,
  patchRelation,
  deletePrimitive,
  deleteRelation,
  previewPrimitiveDelete,
  previewRelationDelete,
  previewWorkbookDelete,
} from "../src/sdk.js";
import { FDPMException } from "../src/core/errors/fdpm-exception.js";

/**
 * SDK edit-helper regression tests — covers patchPrimitive,
 * patchRelation, deletePrimitive, deleteRelation. These were added
 * after the P1 audit revealed the SDK only supported greenfield
 * workbook construction and forced embedders to drop down to raw
 * Host methods for any post-create edit.
 */

async function seedHost(): Promise<Host> {
  const host = new Host({ dataDir: null, noPlugins: true });
  await host.load();
  await host.registerProfile(TEST_PROFILE);
  await defineProject(host, { id: "p", name: "P", profile: "test:demo" })
    .primitives([
      {
        id: "section:a",
        type: "test:section",
        fields: { title: "A", number: 1 },
      },
      {
        id: "section:b",
        type: "test:section",
        fields: { title: "B", number: 2 },
      },
      { id: "para:1", type: "test:para", fields: { text: "hello" } },
    ])
    .relations([
      {
        id: "rel:1",
        type: "test:rel:contains",
        from: "section:a",
        to: "para:1",
        fields: {},
      },
    ])
    .commit();
  return host;
}

// -- patchPrimitive ----------------------------------------------------

describe("patchPrimitive", () => {
  it("patches a single field, bumps revision, returns ValidationReport", async () => {
    const host = await seedHost();
    const before = host.getProject("p").primitives["section:a"]!;
    const result = await patchPrimitive(host, {
      workbook: "p",
      id: "section:a",
      fields: { title: "A — updated" },
    });
    const after = host.getProject("p").primitives["section:a"]!;
    expect(after.field_values["title"]).toBe("A — updated");
    // Untouched field is preserved.
    expect(after.field_values["number"]).toBe(1);
    // Revision moved forward.
    expect(after.revision).toBeGreaterThan(before.revision);
    // Result envelope shape.
    expect(typeof result.revision).toBe("number");
    expect(result.report).toBeDefined();
    expect(Array.isArray(result.report.findings)).toBe(true);
  });

  it("forwards `scope` as scope_id on the underlying Host call", async () => {
    const host = await seedHost();
    await patchPrimitive(host, {
      workbook: "p",
      id: "section:a",
      fields: {},
      scope: "test:scope:appendix",
    });
    const after = host.getProject("p").primitives["section:a"]!;
    expect(after.scope_id).toBe("test:scope:appendix");
  });

  it("propagates `expectedRevision` mismatch as a `conflict` exception", async () => {
    const host = await seedHost();
    const stored = host.getProject("p").primitives["section:a"]!;
    await expect(
      patchPrimitive(host, {
        workbook: "p",
        id: "section:a",
        fields: { title: "x" },
        expectedRevision: stored.revision + 99,
      }),
    ).rejects.toMatchObject({ category: "conflict" });
  });

  it("propagates validation errors with category `validation`", async () => {
    const host = await seedHost();
    await expect(
      patchPrimitive(host, {
        workbook: "p",
        id: "section:a",
        fields: { title: "x".repeat(300) },
      }),
    ).rejects.toMatchObject({ category: "validation" });
  });

  it("throws `not_found` for an unknown primitive id", async () => {
    const host = await seedHost();
    await expect(
      patchPrimitive(host, {
        workbook: "p",
        id: "section:does-not-exist",
        fields: { title: "x" },
      }),
    ).rejects.toMatchObject({ category: "not_found" });
  });

  it("respects `fullValidate: true` (whole-record validation path)", async () => {
    // We can't easily stage a pre-existing violation through normal
    // create paths, so this test only verifies the flag is forwarded
    // without crashing — the touched-paths default and full-record
    // path both succeed when the record is clean.
    const host = await seedHost();
    const out = await patchPrimitive(host, {
      workbook: "p",
      id: "section:a",
      fields: { title: "ok" },
      fullValidate: true,
    });
    expect(out.report.findings.length).toBe(0);
  });
});

// -- patchRelation -----------------------------------------------------

describe("patchRelation", () => {
  it("succeeds for an empty patch on a fields-less relation type", async () => {
    // test:rel:contains has zero fields; an empty patch is a valid
    // no-op that still bumps the workbook revision.
    const host = await seedHost();
    const before = host.getProject("p").relations["rel:1"]!;
    const result = await patchRelation(host, {
      workbook: "p",
      id: "rel:1",
      fields: {},
    });
    const after = host.getProject("p").relations["rel:1"]!;
    expect(after.revision).toBeGreaterThanOrEqual(before.revision);
    expect(typeof result.revision).toBe("number");
    expect(result.report).toBeDefined();
  });

  it("throws `not_found` for an unknown relation id", async () => {
    const host = await seedHost();
    await expect(
      patchRelation(host, {
        workbook: "p",
        id: "rel:missing",
        fields: {},
      }),
    ).rejects.toMatchObject({ category: "not_found" });
  });

  it("propagates `expectedRevision` mismatch as a `conflict` exception", async () => {
    const host = await seedHost();
    const stored = host.getProject("p").relations["rel:1"]!;
    await expect(
      patchRelation(host, {
        workbook: "p",
        id: "rel:1",
        fields: {},
        expectedRevision: stored.revision + 99,
      }),
    ).rejects.toMatchObject({ category: "conflict" });
  });
});

// -- deletePrimitive ---------------------------------------------------

describe("deletePrimitive", () => {
  it("removes the primitive and returns the new revision", async () => {
    const host = await seedHost();
    const before = host.getProject("p").workbook.revision;
    const result = await deletePrimitive(host, {
      workbook: "p",
      id: "section:b",
    });
    const slice = host.getProject("p");
    expect(slice.primitives["section:b"]).toBeUndefined();
    expect(slice.primitives["section:a"]).toBeDefined();
    expect(typeof result.revision).toBe("number");
    expect(result.revision).toBeGreaterThan(before);
  });

  it("throws `not_found` for an unknown primitive id", async () => {
    const host = await seedHost();
    await expect(
      deletePrimitive(host, { workbook: "p", id: "section:nope" }),
    ).rejects.toMatchObject({ category: "not_found" });
  });

  it("throws (FDPMException) when the workbook itself is unknown", async () => {
    const host = await seedHost();
    await expect(
      deletePrimitive(host, { workbook: "no-such-workbook", id: "section:a" }),
    ).rejects.toThrow(FDPMException);
  });
});

// -- deleteRelation ----------------------------------------------------

describe("deleteRelation", () => {
  it("removes the relation and returns the new revision", async () => {
    const host = await seedHost();
    const before = host.getProject("p").workbook.revision;
    const result = await deleteRelation(host, {
      workbook: "p",
      id: "rel:1",
    });
    const slice = host.getProject("p");
    expect(slice.relations["rel:1"]).toBeUndefined();
    expect(typeof result.revision).toBe("number");
    expect(result.revision).toBeGreaterThan(before);
  });

  it("throws `not_found` for an unknown relation id", async () => {
    const host = await seedHost();
    await expect(
      deleteRelation(host, { workbook: "p", id: "rel:does-not-exist" }),
    ).rejects.toMatchObject({ category: "not_found" });
  });
});

// -- end-to-end roundtrip ----------------------------------------------

describe("edit helpers compose with defineProject", () => {
  it("create -> patch -> delete cycle keeps the workbook consistent", async () => {
    const host = await seedHost();
    await patchPrimitive(host, {
      workbook: "p",
      id: "section:a",
      fields: { title: "renamed", number: 99 },
    });
    await deletePrimitive(host, { workbook: "p", id: "section:b" });
    await deleteRelation(host, { workbook: "p", id: "rel:1" });

    const slice = host.getProject("p");
    expect(slice.primitives["section:a"]?.field_values["title"]).toBe("renamed");
    expect(slice.primitives["section:a"]?.field_values["number"]).toBe(99);
    expect(slice.primitives["section:b"]).toBeUndefined();
    expect(slice.relations["rel:1"]).toBeUndefined();
    // para:1 survives — only section:b and rel:1 were removed.
    expect(slice.primitives["para:1"]).toBeDefined();
  });
});

// -- delete previews (dry-run surface) ----------------------------------

describe("preview*Delete — the SDK dry-run surface", () => {
  it("previewPrimitiveDelete reports referencing relations and appends nothing", async () => {
    const host = await seedHost();
    const WB = host.listProjects()[0]!.id;
    await host.createPrimitive(WB, {
      id: "section:pv",
      type_id: "test:section",
      field_values: { title: "PV", number: 9 },
    });
    await host.createPrimitive(WB, { id: "para:pv", type_id: "test:para", field_values: { text: "t" } });
    await host.createRelation(WB, {
      id: "rel:pv",
      type_id: "test:rel:contains",
      source_id: "section:pv",
      target_id: "para:pv",
      field_values: {},
    });
    const before = host.getLog(WB).length;
    const p = previewPrimitiveDelete(host, { workbook: WB, id: "section:pv" });
    expect(p.referencing_relations.map((r) => r.id)).toEqual(["rel:pv"]);
    expect(host.getLog(WB).length).toBe(before);
    expect(previewRelationDelete(host, { workbook: WB, id: "rel:pv" }).target_id).toBe("para:pv");
    expect(previewWorkbookDelete(host, { workbook: WB }).relation_count).toBeGreaterThanOrEqual(1);
  });
});
