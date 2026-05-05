import { describe, it, expect } from "vitest";
import { newHost } from "./fixtures.js";
import { splitProject, cloneProject } from "../src/core/host-extra.js";

describe("§5.4 graph operations", () => {
  it("core-graphops-clone-001: clone copies primitives and relations under a new id", async () => {
    const host = await newHost();
    await host.createProject({ workbook_id: "p1", name: "P1", profile_id: "test:demo" });
    await host.createPrimitive("p1", {
      id: "section:a",
      type_id: "test:section",
      field_values: { title: "A", number: 1 },
    });
    const result = await cloneProject(host, "p1", {
      target_workbook_id: "p2",
      target_workbook_name: "P2",
    });
    expect(result.primitives_copied).toBe(1);
    expect(host.getProject("p2").primitives["section:a"]).toBeDefined();
    // The clone op carries `cloned_from` evidence in its payload.
    const log = host.store.getOperationLog("p2");
    const createOp = log.find((o) => o.kind === "workbook.create")!;
    expect((createOp.payload as { cloned_from?: string }).cloned_from).toBe("p1");
  });

  it("core-graphops-clone-002: clone with target id collision yields 409 conflict", async () => {
    const host = await newHost();
    await host.createProject({ workbook_id: "p1", name: "P1", profile_id: "test:demo" });
    await host.createProject({ workbook_id: "p2", name: "P2", profile_id: "test:demo" });
    await expect(
      cloneProject(host, "p1", { target_workbook_id: "p2", target_workbook_name: "Dup" }),
    ).rejects.toThrow(/exists|conflict/);
  });

  it("core-graphops-split-003: profile with no partition unit rejects :split", async () => {
    const host = await newHost();
    await host.createProject({ workbook_id: "p1", name: "P1", profile_id: "core:empty" });
    await expect(
      splitProject(host, "p1", {
        partition: [
          { target_workbook_name: "X", sections: ["section:a"] },
          { target_workbook_name: "Y", sections: ["section:b"] },
        ],
        cross_partition_relations: "drop",
      }),
    ).rejects.toThrow(/partition/);
  });

  it("core-graphops-split-001: split partitions into N workbooks, drops cross-partition relations", async () => {
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
    const result = await splitProject(host, "p1", {
      partition: [
        { target_workbook_id: "p1-a", target_workbook_name: "A", sections: ["section:a"] },
        { target_workbook_id: "p1-b", target_workbook_name: "B", sections: ["section:b"] },
      ],
      cross_partition_relations: "drop",
    });
    expect(result.project_ids).toEqual(["p1-a", "p1-b"]);
    expect(host.getProject("p1-a").primitives["section:a"]).toBeDefined();
    expect(host.getProject("p1-b").primitives["section:b"]).toBeDefined();
  });

  it("core-graphops-split-002: section appearing in two partition entries rejected", async () => {
    const host = await newHost();
    await host.createProject({ workbook_id: "p1", name: "P1", profile_id: "test:demo" });
    await host.createPrimitive("p1", {
      id: "section:a",
      type_id: "test:section",
      field_values: { title: "A", number: 1 },
    });
    await expect(
      splitProject(host, "p1", {
        partition: [
          { target_workbook_name: "X", sections: ["section:a"] },
          { target_workbook_name: "Y", sections: ["section:a"] },
        ],
        cross_partition_relations: "drop",
      }),
    ).rejects.toThrow(/multiple partition|repeats|partition/);
  });
});
