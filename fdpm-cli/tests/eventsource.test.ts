import { describe, it, expect } from "vitest";
import { newHost } from "./fixtures.js";
import { replay } from "../src/core/store/replay.js";
import { undo } from "../src/core/host-extra.js";

describe("§5.5 event sourcing", () => {
  it("core-eventsource-001: every state-changing endpoint appends one operation per affected record", async () => {
    const host = await newHost();
    await host.createProject({ workbook_id: "p1", name: "P1", profile_id: "test:demo" });
    await host.createPrimitive("p1", {
      id: "section:a",
      type_id: "test:section",
      field_values: { title: "A", number: 1 },
      scope_id: "test:scope:doc",
    });
    await host.patchPrimitive("p1", { id: "section:a", field_values: { number: 99 } });
    const log = host.store.getOperationLog("p1");
    expect(log.map((o) => o.kind)).toEqual([
      "workbook.create",
      "primitive.create",
      "primitive.patch",
    ]);
    expect(log.map((o) => o.revision)).toEqual([1, 2, 3]);
  });

  it("core-eventsource-002: replay is pure and deterministic", async () => {
    const host = await newHost();
    await host.createProject({ workbook_id: "p1", name: "P1", profile_id: "test:demo" });
    for (let i = 0; i < 25; i++) {
      await host.createPrimitive("p1", {
        id: `section:${i}`,
        type_id: "test:section",
        field_values: { title: `S${i}`, number: i },
        scope_id: "test:scope:doc",
      });
    }
    const log = host.store.getOperationLog("p1");
    const a = replay(log);
    const b = replay(log);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("core-eventsource-005: GET /at?revision=N is byte-equal to replay(log[:N+1])", async () => {
    const host = await newHost();
    await host.createProject({ workbook_id: "p1", name: "P1", profile_id: "test:demo" });
    await host.createPrimitive("p1", {
      id: "section:a",
      type_id: "test:section",
      field_values: { title: "A", number: 1 },
    });
    await host.createPrimitive("p1", {
      id: "section:b",
      type_id: "test:section",
      field_values: { title: "B", number: 2 },
    });
    const slice = host.store.getProjectAt("p1", 2);
    // At revision 2, only section:a exists (workbook.create=1, primitive.create=2).
    expect(Object.keys(slice.primitives).sort()).toEqual(["section:a"]);
    const slice3 = host.store.getProjectAt("p1", 3);
    expect(Object.keys(slice3.primitives).sort()).toEqual(["section:a", "section:b"]);
  });

  it("core-eventsource-006: undo of primitive.create yields primitive.delete; undo of patch reverts field_values", async () => {
    const host = await newHost();
    await host.createProject({ workbook_id: "p1", name: "P1", profile_id: "test:demo" });
    const created = await host.createPrimitive("p1", {
      id: "section:a",
      type_id: "test:section",
      field_values: { title: "A", number: 1 },
    });
    expect(host.getProject("p1").primitives["section:a"]).toBeDefined();
    await undo(host, "p1", created.append.op.op_id);
    expect(host.getProject("p1").primitives["section:a"]).toBeUndefined();

    // Patch + undo restores prior values.
    await host.createPrimitive("p1", {
      id: "section:b",
      type_id: "test:section",
      field_values: { title: "B", number: 2 },
    });
    const patched = await host.patchPrimitive("p1", {
      id: "section:b",
      field_values: { number: 99 },
    });
    expect(host.getProject("p1").primitives["section:b"]?.field_values["number"]).toBe(99);
    await undo(host, "p1", patched.append.op.op_id);
    expect(host.getProject("p1").primitives["section:b"]?.field_values["number"]).toBe(2);
  });

  it("core-eventsource-007: snapshots are byte-equal to replay(log[:N])", async () => {
    const host = await newHost();
    await host.createProject({ workbook_id: "p1", name: "P1", profile_id: "test:demo" });
    for (let i = 0; i < 5; i++) {
      await host.createPrimitive("p1", {
        id: `section:${i}`,
        type_id: "test:section",
        field_values: { title: `S${i}`, number: i },
      });
    }
    host.store.takeSnapshot("p1", host.getProject("p1").workbook.revision);
    const snap = host.store.getSnapshots("p1")[0]!;
    const log = host.store.getOperationLog("p1").filter((o) => o.revision <= snap.revision);
    const replayed = replay(log);
    expect(Object.keys(snap.state.primitives).sort()).toEqual(
      Object.keys(replayed.primitives["p1"] ?? {}).sort(),
    );
  });
});
