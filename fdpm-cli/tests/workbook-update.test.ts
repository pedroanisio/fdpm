import { describe, it, expect } from "vitest";
import { newHost } from "./fixtures.js";
import { replay } from "../src/core/store/replay.js";
import { undo } from "../src/core/host-extra.js";
import { PAYLOAD_SCHEMAS } from "../src/core/operations/payloads.js";
import { OPERATION_KINDS } from "../src/core/operations/kinds.js";
import { FDPMException } from "../src/core/errors/fdpm-exception.js";

async function hostWithProject() {
  const host = await newHost();
  await host.createProject({
    workbook_id: "p1",
    name: "Original",
    profile_id: "test:demo",
    description: "first description",
  });
  return host;
}

describe("workbook.update", () => {
  it("is a member of the closed operation-kind set", () => {
    expect(OPERATION_KINDS).toContain("workbook.update");
    expect(PAYLOAD_SCHEMAS["workbook.update"]).toBeDefined();
  });

  it("renames a workbook and appends exactly one operation", async () => {
    const host = await hostWithProject();
    const before = host.store.getOperationLog("p1").length;
    const out = await host.updateProject({ workbook_id: "p1", name: "Renamed" });

    const workbook = host.getProject("p1").workbook;
    expect(workbook.name).toBe("Renamed");
    // Untouched fields survive.
    expect(workbook.description).toBe("first description");
    expect(workbook.profile_id).toBe("test:demo");

    const log = host.store.getOperationLog("p1");
    expect(log.length).toBe(before + 1);
    expect(log[log.length - 1]!.kind).toBe("workbook.update");
    expect(workbook.revision).toBe(out.project_revision);
  });

  it("rewrites a description without touching the name", async () => {
    const host = await hostWithProject();
    await host.updateProject({ workbook_id: "p1", description: "second description" });
    const workbook = host.getProject("p1").workbook;
    expect(workbook.name).toBe("Original");
    expect(workbook.description).toBe("second description");
  });

  it("clears the description when passed null", async () => {
    const host = await hostWithProject();
    await host.updateProject({ workbook_id: "p1", description: null });
    const workbook = host.getProject("p1").workbook;
    expect(workbook.description).toBeUndefined();
    expect("description" in workbook).toBe(false);
  });

  it("sets a description on a workbook created without one", async () => {
    const host = await newHost();
    await host.createProject({ workbook_id: "p2", name: "No Desc", profile_id: "test:demo" });
    await host.updateProject({ workbook_id: "p2", description: "added later" });
    expect(host.getProject("p2").workbook.description).toBe("added later");
  });

  it("updates both fields in one operation", async () => {
    const host = await hostWithProject();
    await host.updateProject({ workbook_id: "p1", name: "Both", description: "both too" });
    const log = host.store.getOperationLog("p1");
    expect(log.filter((o) => o.kind === "workbook.update").length).toBe(1);
    const workbook = host.getProject("p1").workbook;
    expect([workbook.name, workbook.description]).toEqual(["Both", "both too"]);
  });

  // -- failure paths --------------------------------------------------

  it("rejects an update that changes nothing", async () => {
    const host = await hostWithProject();
    const before = host.store.getOperationLog("p1").length;
    await expect(host.updateProject({ workbook_id: "p1" })).rejects.toThrow(FDPMException);
    // A rejected update appends nothing.
    expect(host.store.getOperationLog("p1").length).toBe(before);
  });

  it("rejects an unknown workbook with not_found", async () => {
    const host = await hostWithProject();
    await expect(
      host.updateProject({ workbook_id: "nope", name: "X" }),
    ).rejects.toMatchObject({ category: "not_found" });
  });

  it("payload schema rejects an empty update, a blank name and unknown fields", () => {
    const schema = PAYLOAD_SCHEMAS["workbook.update"]!;
    expect(schema.safeParse({ workbook_id: "p1" }).success).toBe(false);
    expect(schema.safeParse({ workbook_id: "p1", name: "" }).success).toBe(false);
    expect(
      schema.safeParse({ workbook_id: "p1", name: "ok", profile_id: "test:other" }).success,
    ).toBe(false);
    expect(schema.safeParse({ workbook_id: "p1", name: "ok" }).success).toBe(true);
    expect(schema.safeParse({ workbook_id: "p1", description: null }).success).toBe(true);
  });

  it("refuses to re-bind the profile, so instances cannot be orphaned", async () => {
    const host = await hostWithProject();
    await expect(
      // @ts-expect-error profile_id is intentionally absent from the input type
      host.updateProject({ workbook_id: "p1", profile_id: "test:other" }),
    ).rejects.toThrow(FDPMException);
    expect(host.getProject("p1").workbook.profile_id).toBe("test:demo");
  });

  // -- replay and inverse ---------------------------------------------

  it("replays deterministically from the log", async () => {
    const host = await hostWithProject();
    await host.updateProject({ workbook_id: "p1", name: "Renamed" });
    await host.updateProject({ workbook_id: "p1", description: null });
    const log = host.store.getOperationLog("p1");
    const a = replay(log);
    const b = replay(log);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.workbooks["p1"]!.name).toBe("Renamed");
    expect(a.workbooks["p1"]!.description).toBeUndefined();
  });

  it("time-travels to the pre-update name", async () => {
    const host = await hostWithProject();
    const atCreate = host.getProject("p1").workbook.revision;
    await host.updateProject({ workbook_id: "p1", name: "Renamed" });
    expect(host.store.getProjectAt("p1", atCreate).workbook.name).toBe("Original");
    expect(host.getProject("p1").workbook.name).toBe("Renamed");
  });

  it("undo restores the previous name", async () => {
    const host = await hostWithProject();
    await host.updateProject({ workbook_id: "p1", name: "Renamed" });
    await undo(host, "p1");
    expect(host.getProject("p1").workbook.name).toBe("Original");
    // The undo is itself an appended operation, not a log rewrite.
    const log = host.store.getOperationLog("p1");
    expect(log[log.length - 1]!.kind).toBe("workbook.update");
  });

  it("undo of a cleared description restores it", async () => {
    const host = await hostWithProject();
    await host.updateProject({ workbook_id: "p1", description: null });
    expect(host.getProject("p1").workbook.description).toBeUndefined();
    await undo(host, "p1");
    expect(host.getProject("p1").workbook.description).toBe("first description");
  });

  it("undo of a rename leaves a later description edit alone", async () => {
    const host = await hostWithProject();
    const rename = await host.updateProject({ workbook_id: "p1", name: "Renamed" });
    await host.updateProject({ workbook_id: "p1", description: "edited after the rename" });
    await undo(host, "p1", rename.op.op_id);
    const workbook = host.getProject("p1").workbook;
    expect(workbook.name).toBe("Original");
    expect(workbook.description).toBe("edited after the rename");
  });
});
