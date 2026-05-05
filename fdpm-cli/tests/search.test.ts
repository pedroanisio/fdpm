import { describe, it, expect } from "vitest";
import { newHost } from "./fixtures.js";

/**
 * #2 — `searchPrimitives` / `searchRelations`.
 *
 * Replaces the "dump everything to JSON and grep" workflow that the
 * original session forced (when I had to discover that
 * `principle:append-only-audit-log` was actually
 * `principle:append-only-audit`).
 */

async function seed(host: Awaited<ReturnType<typeof newHost>>) {
  await host.createProject({ workbook_id: "p", name: "P", profile_id: "test:demo" });
  await host.createPrimitive("p", {
    id: "section:audit-log",
    type_id: "test:section",
    field_values: { title: "Audit Log Section", number: 1 },
  });
  await host.createPrimitive("p", {
    id: "section:audit",
    type_id: "test:section",
    field_values: { title: "Audit Overview", number: 2 },
  });
  await host.createPrimitive("p", {
    id: "section:other",
    type_id: "test:section",
    field_values: { title: "Other", number: 3 },
  });
  await host.createPrimitive("p", {
    id: "para:p1",
    type_id: "test:para",
    field_values: { text: "this paragraph mentions auditing" },
  });
  await host.createRelation("p", {
    id: "rel:audit-link",
    type_id: "test:rel:contains",
    source_id: "section:audit-log",
    target_id: "para:p1",
    field_values: {},
  });
}

describe("host.searchPrimitives", () => {
  it("filters by id substring (case-insensitive)", async () => {
    const host = await newHost();
    await seed(host);
    const hits = host.searchPrimitives("p", { idLike: "AUDIT" });
    const ids = hits.map((p) => p.id).sort();
    expect(ids).toEqual(["section:audit", "section:audit-log"]);
  });

  it("filters by id regex with anchors", async () => {
    const host = await newHost();
    await seed(host);
    const hits = host.searchPrimitives("p", { idRegex: /^section:audit$/ });
    expect(hits.map((p) => p.id)).toEqual(["section:audit"]);
  });

  it("filters by exact type", async () => {
    const host = await newHost();
    await seed(host);
    const sections = host.searchPrimitives("p", { typeId: "test:section" });
    expect(sections.length).toBe(3);
    const paras = host.searchPrimitives("p", { typeId: "test:para" });
    expect(paras.length).toBe(1);
  });

  it("filters by field-value substring (whole field_values)", async () => {
    const host = await newHost();
    await seed(host);
    const hits = host.searchPrimitives("p", {
      fieldMatch: [{ needle: "auditing" }],
    });
    expect(hits.map((p) => p.id)).toEqual(["para:p1"]);
  });

  it("filters by field-value substring scoped to a top-level path", async () => {
    const host = await newHost();
    await seed(host);
    const hits = host.searchPrimitives("p", {
      fieldMatch: [{ path: "title", needle: "audit log" }],
    });
    expect(hits.map((p) => p.id)).toEqual(["section:audit-log"]);
  });

  it("filters by field-value regex", async () => {
    const host = await newHost();
    await seed(host);
    const hits = host.searchPrimitives("p", {
      fieldMatch: [{ path: "title", needle: "^Audit", regex: true }],
    });
    expect(hits.map((p) => p.id).sort()).toEqual(["section:audit", "section:audit-log"]);
  });

  it("AND-combines multiple filter dimensions", async () => {
    const host = await newHost();
    await seed(host);
    const hits = host.searchPrimitives("p", {
      typeId: "test:section",
      idLike: "audit",
      fieldMatch: [{ path: "title", needle: "Log" }],
    });
    expect(hits.map((p) => p.id)).toEqual(["section:audit-log"]);
  });

  it("returns [] when nothing matches", async () => {
    const host = await newHost();
    await seed(host);
    expect(host.searchPrimitives("p", { idLike: "nonexistent" })).toEqual([]);
  });
});

describe("host.searchRelations", () => {
  it("filters by source/target ids", async () => {
    const host = await newHost();
    await seed(host);
    const bySource = host.searchRelations("p", { sourceId: "section:audit-log" });
    expect(bySource.map((r) => r.id)).toEqual(["rel:audit-link"]);
    const byTarget = host.searchRelations("p", { targetId: "para:p1" });
    expect(byTarget.map((r) => r.id)).toEqual(["rel:audit-link"]);
    const noMatch = host.searchRelations("p", { sourceId: "section:other" });
    expect(noMatch).toEqual([]);
  });

  it("AND-combines source filter with type filter", async () => {
    const host = await newHost();
    await seed(host);
    const hits = host.searchRelations("p", {
      sourceId: "section:audit-log",
      typeId: "test:rel:contains",
    });
    expect(hits.length).toBe(1);
  });
});
