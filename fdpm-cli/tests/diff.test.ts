import { describe, it, expect } from "vitest";
import { newHost } from "./fixtures.js";

/**
 * #6 — `host.diffProject` (time-travel and cross-project structural diff).
 *
 * The CLI surface is a thin wrapper; testing the host method covers the
 * underlying diff semantics.
 */
describe("host.diffProject — time-travel mode", () => {
  it("reports an added primitive", async () => {
    const host = await newHost();
    await host.createProject({ project_id: "p", name: "P", profile_id: "test:demo" });
    const beforeRev = host.getProject("p").project.revision;
    await host.createPrimitive("p", {
      id: "section:a",
      type_id: "test:section",
      field_values: { title: "A", number: 1 },
    });
    const d = host.diffProject({
      project_id: "p",
      from: { revision: beforeRev },
    });
    expect(d.primitives.added).toEqual(["section:a"]);
    expect(d.primitives.removed).toEqual([]);
    expect(d.primitives.modified).toEqual([]);
  });

  it("reports a removed primitive", async () => {
    const host = await newHost();
    await host.createProject({ project_id: "p", name: "P", profile_id: "test:demo" });
    await host.createPrimitive("p", {
      id: "section:a",
      type_id: "test:section",
      field_values: { title: "A", number: 1 },
    });
    const afterCreate = host.getProject("p").project.revision;
    await host.deletePrimitive("p", "section:a");
    const d = host.diffProject({
      project_id: "p",
      from: { revision: afterCreate },
    });
    expect(d.primitives.added).toEqual([]);
    expect(d.primitives.removed).toEqual(["section:a"]);
  });

  it("reports modified field paths", async () => {
    const host = await newHost();
    await host.createProject({ project_id: "p", name: "P", profile_id: "test:demo" });
    await host.createPrimitive("p", {
      id: "section:a",
      type_id: "test:section",
      field_values: { title: "A", number: 1 },
    });
    const before = host.getProject("p").project.revision;
    await host.patchPrimitive("p", {
      id: "section:a",
      field_values: { title: "A-updated" },
    });
    const d = host.diffProject({
      project_id: "p",
      from: { revision: before },
    });
    expect(d.primitives.modified).toEqual([
      { id: "section:a", changed_fields: ["title"] },
    ]);
    expect(d.primitives.added).toEqual([]);
    expect(d.primitives.removed).toEqual([]);
  });

  it("reports added relation", async () => {
    const host = await newHost();
    await host.createProject({ project_id: "p", name: "P", profile_id: "test:demo" });
    await host.createPrimitive("p", {
      id: "section:s",
      type_id: "test:section",
      field_values: { title: "S", number: 1 },
    });
    await host.createPrimitive("p", {
      id: "para:a",
      type_id: "test:para",
      field_values: { text: "alpha" },
    });
    const before = host.getProject("p").project.revision;
    await host.createRelation("p", {
      id: "rel:s-a",
      type_id: "test:rel:contains",
      source_id: "section:s",
      target_id: "para:a",
      field_values: {},
    });
    const d = host.diffProject({
      project_id: "p",
      from: { revision: before },
    });
    expect(d.relations.added).toEqual(["rel:s-a"]);
  });

  it("returns empty diff for identical revisions", async () => {
    const host = await newHost();
    await host.createProject({ project_id: "p", name: "P", profile_id: "test:demo" });
    await host.createPrimitive("p", {
      id: "section:a",
      type_id: "test:section",
      field_values: { title: "A", number: 1 },
    });
    const rev = host.getProject("p").project.revision;
    const d = host.diffProject({
      project_id: "p",
      from: { revision: rev },
      to: { revision: rev },
    });
    expect(d.primitives.added).toEqual([]);
    expect(d.primitives.removed).toEqual([]);
    expect(d.primitives.modified).toEqual([]);
  });

  it("is read-only: revision unchanged after diff", async () => {
    const host = await newHost();
    await host.createProject({ project_id: "p", name: "P", profile_id: "test:demo" });
    const projectCreateRev = host.getProject("p").project.revision;
    await host.createPrimitive("p", {
      id: "section:a",
      type_id: "test:section",
      field_values: { title: "A", number: 1 },
    });
    const before = host.getProject("p").project.revision;
    host.diffProject({ project_id: "p", from: { revision: projectCreateRev } });
    host.diffProject({ project_id: "p", from: { revision: projectCreateRev } });
    const after = host.getProject("p").project.revision;
    expect(after).toBe(before);
  });
});

describe("host.diffProject — --detail mode", () => {
  it("includes before/after values for modified fields when detail=true", async () => {
    const host = await newHost();
    await host.createProject({ project_id: "p", name: "P", profile_id: "test:demo" });
    await host.createPrimitive("p", {
      id: "section:a",
      type_id: "test:section",
      field_values: { title: "Original", number: 1 },
    });
    const before = host.getProject("p").project.revision;
    await host.patchPrimitive("p", {
      id: "section:a",
      field_values: { title: "Updated" },
    });
    const d = host.diffProject({
      project_id: "p",
      from: { revision: before },
      detail: true,
    });
    expect(d.primitives.modified).toEqual([
      {
        id: "section:a",
        changed_fields: ["title"],
        before: { title: "Original" },
        after: { title: "Updated" },
      },
    ]);
  });

  it("omits before/after when detail is not set (no regression)", async () => {
    const host = await newHost();
    await host.createProject({ project_id: "p", name: "P", profile_id: "test:demo" });
    await host.createPrimitive("p", {
      id: "section:a",
      type_id: "test:section",
      field_values: { title: "X", number: 1 },
    });
    const before = host.getProject("p").project.revision;
    await host.patchPrimitive("p", {
      id: "section:a",
      field_values: { title: "Y" },
    });
    const d = host.diffProject({ project_id: "p", from: { revision: before } });
    const m = d.primitives.modified[0]!;
    expect(m.before).toBeUndefined();
    expect(m.after).toBeUndefined();
  });
});

describe("host.diffProject — cross-project mode", () => {
  it("compares two distinct projects", async () => {
    const host = await newHost();
    await host.createProject({ project_id: "p1", name: "P1", profile_id: "test:demo" });
    await host.createProject({ project_id: "p2", name: "P2", profile_id: "test:demo" });
    await host.createPrimitive("p1", {
      id: "section:a",
      type_id: "test:section",
      field_values: { title: "A", number: 1 },
    });
    await host.createPrimitive("p2", {
      id: "section:a",
      type_id: "test:section",
      field_values: { title: "A-different", number: 1 },
    });
    await host.createPrimitive("p2", {
      id: "section:extra",
      type_id: "test:section",
      field_values: { title: "Extra", number: 2 },
    });
    const d = host.diffProject({
      project_id: "p1",
      from: { project_id: "p1" },
      to: { project_id: "p2" },
    });
    expect(d.primitives.added).toEqual(["section:extra"]);
    expect(d.primitives.modified).toEqual([
      { id: "section:a", changed_fields: ["title"] },
    ]);
  });
});
