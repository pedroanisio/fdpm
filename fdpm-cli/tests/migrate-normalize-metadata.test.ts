import { describe, it, expect } from "vitest";
import { newHost } from "./fixtures.js";
import { importTransfer } from "../src/core/host-extra.js";

/**
 * #7 — `migrate normalize-metadata` lifts legacy
 * `field_values._metadata.{kind,context}` to top-level fields.
 *
 * The legacy shape lands via `importTransfer` (the import path is the
 * one that historically wrote the nested envelope). The migration is
 * opt-in, dry-runnable, and visible in the operation log as a sequence
 * of replace ops.
 */

async function seedWithLegacyShape() {
  const host = await newHost();
  await importTransfer(host, {
    spec_core: "1.1",
    workbook: {
      id: "p",
      name: "P",
      profile_id: "test:demo",
      created_at: new Date().toISOString(),
      revision: 0,
    },
    primitives: [
      {
        id: "section:s",
        type_id: "test:section",
        field_values: { title: "S", number: 1 },
        revision: 0,
      },
      {
        id: "para:a",
        type_id: "test:para",
        field_values: { text: "alpha" },
        revision: 0,
      },
    ],
    relations: [
      {
        id: "rel:legacy",
        type_id: "test:rel:contains",
        source_id: "section:s",
        target_id: "para:a",
        // Legacy nested-metadata shape — top-level field_values are
        // empty; semantic info lives under _metadata.
        field_values: {
          _metadata: { kind: "contains", context: "Legacy import." },
        },
        revision: 0,
      },
      {
        id: "rel:already-flat",
        type_id: "test:rel:contains",
        source_id: "section:s",
        target_id: "para:a",
        // Already in the new shape — should be skipped.
        field_values: { kind: "contains", context: "Already flat." },
        revision: 0,
      },
    ],
    templates: [],
    test_suites: [],
    operation_log: [],
  });
  return host;
}

describe("host.migrateNormalizeMetadata", () => {
  it("lifts _metadata.* to top-level on legacy relations", async () => {
    const host = await seedWithLegacyShape();
    const result = await host.migrateNormalizeMetadata("p");
    expect(result.dry_run).toBe(false);
    expect(result.normalised).toEqual(["rel:legacy"]);
    expect(result.skipped).toEqual(["rel:already-flat"]);
    expect(result.errors).toEqual([]);

    const after = host.getProject("p").relations["rel:legacy"];
    expect(after).toBeDefined();
    expect(after?.field_values["_metadata"]).toBeUndefined();
    expect(after?.field_values["kind"]).toBe("contains");
    expect(after?.field_values["context"]).toBe("Legacy import.");
  });

  it("dry-run reports the same outcome without mutating", async () => {
    const host = await seedWithLegacyShape();
    const before = host.getProject("p").workbook.revision;
    const result = await host.migrateNormalizeMetadata("p", { dryRun: true });
    expect(result.dry_run).toBe(true);
    expect(result.normalised).toEqual(["rel:legacy"]);
    const after = host.getProject("p").workbook.revision;
    expect(after).toBe(before);
    // Underlying relation unchanged.
    const rel = host.getProject("p").relations["rel:legacy"];
    expect(rel?.field_values["_metadata"]).toBeDefined();
  });

  it("preserves existing top-level keys when both _metadata and top-level present", async () => {
    const host = await newHost();
    await importTransfer(host, {
      spec_core: "1.1",
      workbook: {
        id: "p",
        name: "P",
        profile_id: "test:demo",
        created_at: new Date().toISOString(),
        revision: 0,
      },
      primitives: [
        {
          id: "section:s",
          type_id: "test:section",
          field_values: { title: "S", number: 1 },
          revision: 0,
        },
        {
          id: "para:a",
          type_id: "test:para",
          field_values: { text: "alpha" },
          revision: 0,
        },
      ],
      relations: [
        {
          id: "rel:both",
          type_id: "test:rel:contains",
          source_id: "section:s",
          target_id: "para:a",
          field_values: {
            kind: "top-wins",
            _metadata: { kind: "nested-loses", context: "kept" },
          },
          revision: 0,
        },
      ],
      templates: [],
      test_suites: [],
      operation_log: [],
    });
    await host.migrateNormalizeMetadata("p");
    const r = host.getProject("p").relations["rel:both"];
    expect(r?.field_values["kind"]).toBe("top-wins"); // top-level preserved
    expect(r?.field_values["context"]).toBe("kept");  // nested lifted (no collision)
    expect(r?.field_values["_metadata"]).toBeUndefined();
  });

  it("logs each rewrite as relation.replace for auditability", async () => {
    const host = await seedWithLegacyShape();
    const before = host
      .getLog("p", { kinds: ["relation.replace"] })
      .filter((op) => (op.payload as { id?: string }).id === "rel:legacy").length;
    await host.migrateNormalizeMetadata("p");
    const after = host
      .getLog("p", { kinds: ["relation.replace"] })
      .filter((op) => (op.payload as { id?: string }).id === "rel:legacy").length;
    // The migration emits exactly one replace for the normalised relation.
    expect(after - before).toBe(1);
  });

  it("groups all rewrites under one batch request_id (atomicity marker)", async () => {
    // Atomic batching means every replace op the migration emits shares
    // a single request_id. Without batching, each would have its own.
    const host = await seedWithLegacyShape();
    // Add a second migrate-able relation to make the batch non-trivial.
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
        { id: "section:s", type_id: "test:section", field_values: { title: "S", number: 1 }, revision: 0 },
        { id: "para:a", type_id: "test:para", field_values: { text: "a" }, revision: 0 },
        { id: "para:b", type_id: "test:para", field_values: { text: "b" }, revision: 0 },
      ],
      relations: [
        {
          id: "rel:legacy-a",
          type_id: "test:rel:contains",
          source_id: "section:s",
          target_id: "para:a",
          field_values: { _metadata: { kind: "contains" } },
          revision: 0,
        },
        {
          id: "rel:legacy-b",
          type_id: "test:rel:contains",
          source_id: "section:s",
          target_id: "para:b",
          field_values: { _metadata: { kind: "contains" } },
          revision: 0,
        },
      ],
      templates: [],
      test_suites: [],
      operation_log: [],
    });
    // Take a snapshot of replace-op count before migrate so the import's
    // own replace ops don't leak into the assertion.
    const preReplaces = host
      .getLog("p2", { kinds: ["relation.replace"] })
      .map((op) => op.op_id);
    await host.migrateNormalizeMetadata("p2");
    const newReplaces = host
      .getLog("p2", { kinds: ["relation.replace"] })
      .filter((op) => !preReplaces.includes(op.op_id));
    expect(newReplaces.length).toBe(2);
    const requestIds = new Set(newReplaces.map((op) => op.request_id));
    expect(requestIds.size).toBe(1);
  });
});
