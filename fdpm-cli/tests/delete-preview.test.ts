/**
 * Core delete previews — the would-affect computation behind Tier-3
 * `dry_run` (MCP), `--dry-run` (CLI) and the SDK `preview*Delete`
 * helpers. One implementation, three surfaces.
 *
 * A preview is a pure read over `Host.getProject`: it names what a
 * delete would remove and what references it, throws the same
 * `not_found` the real delete would, and never appends an operation.
 */
import { describe, expect, it } from "vitest";
import { Host } from "../src/core/host.js";
import { FDPMException } from "../src/core/errors/fdpm-exception.js";
import { TEST_PROFILE } from "./fixtures.js";
import {
  previewPrimitiveDelete,
  previewPrimitiveDeleteBatch,
  previewRelationDelete,
  previewRelationDeleteBatch,
  previewWorkbookDelete,
} from "../src/core/operations/delete-preview.js";

const WB = "wb-preview";

async function fixtureHost(): Promise<Host> {
  const host = new Host({ dataDir: null, noPlugins: true });
  await host.load();
  await host.registerProfile(TEST_PROFILE);
  await host.createProject({ workbook_id: WB, name: "Preview", profile_id: TEST_PROFILE.id });
  await host.createPrimitive(WB, {
    id: "section:s1",
    type_id: "test:section",
    field_values: { title: "S1", number: 1 },
  });
  await host.createPrimitive(WB, {
    id: "section:s2",
    type_id: "test:section",
    field_values: { title: "S2", number: 2 },
  });
  await host.createPrimitive(WB, {
    id: "para:p1",
    type_id: "test:para",
    field_values: { text: "hello" },
  });
  await host.createRelation(WB, {
    id: "rel:s1-p1",
    type_id: "test:rel:contains",
    source_id: "section:s1",
    target_id: "para:p1",
    field_values: {},
  });
  return host;
}

describe("previewPrimitiveDelete", () => {
  it("names the primitive and every relation that references it as source or target", async () => {
    const host = await fixtureHost();
    const asSource = previewPrimitiveDelete(host, WB, "section:s1");
    expect(asSource).toEqual({
      workbook_id: WB,
      id: "section:s1",
      type_id: "test:section",
      referencing_relations: [
        { id: "rel:s1-p1", type_id: "test:rel:contains", source_id: "section:s1", target_id: "para:p1" },
      ],
      // Pointers held in `id-ref` FIELD values, which nothing cascades.
      // This fixture's profile declares none, so the list is empty — but
      // the key is part of the shape now, because a preview that omitted
      // it reported a delete as clean while leaving references dangling.
      referencing_fields: [],
    });
    const asTarget = previewPrimitiveDelete(host, WB, "para:p1");
    expect(asTarget.referencing_relations.map((r) => r.id)).toEqual(["rel:s1-p1"]);
    const unreferenced = previewPrimitiveDelete(host, WB, "section:s2");
    expect(unreferenced.referencing_relations).toEqual([]);
  });

  it("is a pure read: nothing is appended and the primitive still exists afterwards", async () => {
    const host = await fixtureHost();
    const before = host.getLog(WB).length;
    previewPrimitiveDelete(host, WB, "section:s1");
    expect(host.getLog(WB).length).toBe(before);
    expect("section:s1" in host.getProject(WB).primitives).toBe(true);
  });

  it("throws not_found for an unknown primitive and for an unknown workbook", async () => {
    const host = await fixtureHost();
    expect(() => previewPrimitiveDelete(host, WB, "section:nope")).toThrow(FDPMException);
    try {
      previewPrimitiveDelete(host, WB, "section:nope");
    } catch (e) {
      expect((e as FDPMException).category).toBe("not_found");
    }
    expect(() => previewPrimitiveDelete(host, "no-such-wb", "section:s1")).toThrow(FDPMException);
  });
});

describe("previewRelationDelete", () => {
  it("returns the relation's endpoints and type", async () => {
    const host = await fixtureHost();
    expect(previewRelationDelete(host, WB, "rel:s1-p1")).toEqual({
      workbook_id: WB,
      id: "rel:s1-p1",
      type_id: "test:rel:contains",
      source_id: "section:s1",
      target_id: "para:p1",
    });
  });

  it("throws not_found for an unknown relation", async () => {
    const host = await fixtureHost();
    expect(() => previewRelationDelete(host, WB, "rel:nope")).toThrow(/not found/);
  });
});

describe("previewWorkbookDelete", () => {
  it("summarises what a workbook delete removes", async () => {
    const host = await fixtureHost();
    const p = previewWorkbookDelete(host, WB);
    expect(p.workbook_id).toBe(WB);
    expect(p.name).toBe("Preview");
    expect(p.profile_id).toBe(TEST_PROFILE.id);
    expect(p.primitive_count).toBe(3);
    expect(p.relation_count).toBe(1);
    expect(p.revision).toBe(host.getLog(WB).length);
  });

  it("throws not_found for an unknown workbook", async () => {
    const host = await fixtureHost();
    expect(() => previewWorkbookDelete(host, "no-such-wb")).toThrow(FDPMException);
  });
});

describe("batch previews — mirror the batch delete contract", () => {
  it("previews every id in array order", async () => {
    const host = await fixtureHost();
    const p = previewPrimitiveDeleteBatch(host, WB, ["section:s2", "section:s1"]);
    expect(p.count).toBe(2);
    expect(p.items.map((i) => i.id)).toEqual(["section:s2", "section:s1"]);
    expect(p.items[1]!.referencing_relations).toHaveLength(1);
    const r = previewRelationDeleteBatch(host, WB, ["rel:s1-p1"]);
    expect(r.count).toBe(1);
    expect(r.items[0]!.target_id).toBe("para:p1");
  });

  it("the first missing id rejects the whole preview with not_found naming it", async () => {
    const host = await fixtureHost();
    try {
      previewPrimitiveDeleteBatch(host, WB, ["section:s1", "section:ghost", "section:zzz"]);
      expect.unreachable("should have thrown");
    } catch (e) {
      const err = e as FDPMException;
      expect(err.category).toBe("not_found");
      expect(err.evidence).toMatchObject({ missing_id: "section:ghost" });
    }
  });
});
