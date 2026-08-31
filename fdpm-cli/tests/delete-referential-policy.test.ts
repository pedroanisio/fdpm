/**
 * Referential policy on delete, and validation on reparent.
 *
 * Deleting a primitive used to succeed unconditionally and silently
 * remove every relation touching it. The cascade itself is correct — it
 * is what keeps the projection free of dangling endpoints, since
 * relation creation rejects a missing source or target as an error — but
 * performing it without the caller asking contradicted the rest of the
 * system, where nothing removes data that was not named. The mechanism
 * stays in replay; the policy now sits at the write boundary.
 *
 * Reparent had a narrower version of the same problem: it changes a
 * primitive's `scope_id` and appended without running the validation
 * pipeline, so a move could place an instance into a scope its own rules
 * forbid.
 */
import { describe, expect, it } from "vitest";
import { newHost, TEST_PROFILE } from "./fixtures.js";
import { Host } from "../src/core/host.js";
import { FDPMException } from "../src/core/errors/fdpm-exception.js";
import { previewPrimitiveDelete } from "../src/core/operations/delete-preview.js";

/** section:s --contains--> para:p, plus an unreferenced section:free. */
async function linkedHost(): Promise<Host> {
  const host = await newHost();
  await host.createProject({ workbook_id: "p", name: "P", profile_id: TEST_PROFILE.id });
  await host.createPrimitive("p", {
    id: "section:s",
    type_id: "test:section",
    field_values: { title: "S", number: 1 },
  });
  await host.createPrimitive("p", {
    id: "section:free",
    type_id: "test:section",
    field_values: { title: "F", number: 2 },
  });
  await host.createPrimitive("p", {
    id: "para:p",
    type_id: "test:para",
    field_values: { text: "T" },
  });
  await host.createRelation("p", {
    id: "rel:r",
    type_id: "test:rel:contains",
    source_id: "section:s",
    target_id: "para:p",
  });
  return host;
}

describe("deleting a referenced primitive", () => {
  it("is refused, and names the relations that block it", async () => {
    const host = await linkedHost();
    await expect(host.deletePrimitive("p", "section:s")).rejects.toThrow(FDPMException);

    let caught: FDPMException | null = null;
    try {
      await host.deletePrimitive("p", "para:p");
    } catch (err) {
      caught = err as FDPMException;
    }
    expect(caught?.category).toBe("conflict");
    const evidence = caught?.evidence as { referencing_relations: { id: string }[] };
    expect(evidence.referencing_relations.map((r) => r.id)).toEqual(["rel:r"]);
  });

  it("changes nothing when refused", async () => {
    const host = await linkedHost();
    const before = host.getProject("p").workbook.revision;
    await expect(host.deletePrimitive("p", "section:s")).rejects.toThrow(FDPMException);
    const after = host.getProject("p");
    expect(Object.keys(after.primitives).sort()).toEqual([
      "para:p",
      "section:free",
      "section:s",
    ]);
    expect(Object.keys(after.relations)).toEqual(["rel:r"]);
    expect(after.workbook.revision).toBe(before);
  });

  it("blocks from either end of the relation", async () => {
    const host = await linkedHost();
    await expect(host.deletePrimitive("p", "section:s")).rejects.toThrow(/referenced by/);
    await expect(host.deletePrimitive("p", "para:p")).rejects.toThrow(/referenced by/);
  });

  it("proceeds with cascade, removing the edges with it", async () => {
    const host = await linkedHost();
    await host.deletePrimitive("p", "section:s", { cascade: true });
    const slice = host.getProject("p");
    expect(Object.keys(slice.primitives).sort()).toEqual(["para:p", "section:free"]);
    expect(Object.keys(slice.relations)).toEqual([]);
  });

  it("leaves an unreferenced primitive deletable without ceremony", async () => {
    const host = await linkedHost();
    await host.deletePrimitive("p", "section:free");
    expect(Object.keys(host.getProject("p").primitives).sort()).toEqual([
      "para:p",
      "section:s",
    ]);
  });

  it("still reports not_found before it reports a reference", async () => {
    const host = await linkedHost();
    await expect(host.deletePrimitive("p", "section:ghost")).rejects.toThrow(/not found/);
  });

  it("refuses exactly what the preview said would be affected", async () => {
    const host = await linkedHost();
    const preview = previewPrimitiveDelete(host, "p", "section:s");
    let caught: FDPMException | null = null;
    try {
      await host.deletePrimitive("p", "section:s");
    } catch (err) {
      caught = err as FDPMException;
    }
    const evidence = caught?.evidence as { referencing_relations: { id: string }[] };
    // Preview and refusal read the same function; a divergence here would
    // mean a caller could be told a delete was clean and then be refused.
    expect(evidence.referencing_relations).toEqual(preview.referencing_relations);
  });

  it("applies the same rule to the batch path", async () => {
    const host = await linkedHost();
    await expect(
      host.appendBatchWithCausation("p", [
        { kind: "primitive.delete", payload: { id: "section:s" } },
      ]),
    ).rejects.toThrow(/referenced by/);

    await host.appendBatchWithCausation("p", [
      { kind: "primitive.delete", payload: { id: "section:s", cascade: true } },
    ]);
    expect(Object.keys(host.getProject("p").relations)).toEqual([]);
  });

  it("replays a log that contains a cascading delete", async () => {
    const host = await linkedHost();
    await host.deletePrimitive("p", "section:s", { cascade: true });
    // The policy gates what enters the log; it must not retroactively
    // reject a log that already contains such a delete.
    expect(() => host.store.rebuildProject("p")).not.toThrow();
    expect(Object.keys(host.getProject("p").primitives).sort()).toEqual([
      "para:p",
      "section:free",
    ]);
  });
});

describe("reparent runs the validation pipeline", () => {
  it("moves a primitive that satisfies its rules", async () => {
    const host = await newHost();
    await host.createProject({ workbook_id: "p", name: "P", profile_id: TEST_PROFILE.id });
    await host.createPrimitive("p", {
      id: "section:a",
      type_id: "test:section",
      field_values: { title: "A", number: 1 },
      scope_id: "test:scope:doc",
    });
    await host.reparent("p", {
      primitive_id: "section:a",
      from_scope_id: "test:scope:doc",
      to_scope_id: "test:scope:appendix",
    });
    expect(host.getProject("p").primitives["section:a"]!.scope_id).toBe(
      "test:scope:appendix",
    );
  });

  it("reports not_found for a primitive that is not there", async () => {
    const host = await newHost();
    await host.createProject({ workbook_id: "p", name: "P", profile_id: TEST_PROFILE.id });
    await expect(
      host.reparent("p", {
        primitive_id: "section:ghost",
        from_scope_id: "test:scope:doc",
        to_scope_id: "test:scope:appendix",
      }),
    ).rejects.toThrow(/not found/);
  });
});
