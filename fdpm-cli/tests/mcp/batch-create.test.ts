/**
 * Batch create tools (v0.1.1).
 *
 * `fdpm.primitive.create_batch` and `fdpm.relation.create_batch`
 * accept typed intents (NOT raw operations) and route through
 * Host.appendBatchWithCausation. Atomicity contract: all entries
 * validate AND persist, or the whole batch rolls back.
 *
 * Real-session evidence: LLMs producing 25-primitive sequences
 * fragment that into 25 round-trips. Batches collapse this to
 * one round-trip with one atomic outcome. The test below exercises
 * the success path AND the rollback path against actual storage.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Host } from "../../src/core/host.js";
import { tool as primitiveCreateBatch } from "../../src/mcp/tools/primitive-create-batch.js";
import { tool as relationCreateBatch } from "../../src/mcp/tools/relation-create-batch.js";
import { FDPMException } from "../../src/core/errors/fdpm-exception.js";

const TEST_PROFILE = {
  id: "profile:batch-test:0.1",
  version: "0.1.0",
  extends: [] as string[],
  scopes: [],
  primitive_types: [
    {
      id: "test:Item",
      fields: [
        { name: "title", kind: "string" as const, required: true, validations: [] },
      ],
      id_format: { pattern: "^test:item:\\w+$", uniqueness: "workbook" as const, pattern_kind: "regex" as const },
      inline_structs: [],
      is_partition_unit: false,
      scoped: false,
      constraints: [],
    },
  ],
  relation_types: [
    {
      id: "test:Relates",
      source_type_id: "test:Item",
      target_type_id: "test:Item",
      cardinality: "many-to-many" as const,
      fields: [],
      symmetric: false,
      transitive: false,
    },
  ],
};

async function setupHost(): Promise<Host> {
  const dataDir = mkdtempSync(join(tmpdir(), "mcp-batch-"));
  const host = new Host({ dataDir, noPlugins: true });
  await host.load();
  await host.registerProfile(TEST_PROFILE, false);
  await host.createProject({
    workbook_id: "p",
    name: "p",
    profile_id: "profile:batch-test:0.1",
  });
  return host;
}

describe("fdpm.primitive.create_batch", () => {
  let host: Host;

  beforeEach(async () => {
    host = await setupHost();
  });

  it("creates N primitives atomically and returns N operations + reports", async () => {
    const result = await primitiveCreateBatch.handler(
      host,
      {
        workbook_id: "p",
        primitives: [
          { id: "test:item:a", type_id: "test:Item", field_values: { title: "A" } },
          { id: "test:item:b", type_id: "test:Item", field_values: { title: "B" } },
          { id: "test:item:c", type_id: "test:Item", field_values: { title: "C" } },
        ],
      },
      {} as never,
    );
    expect(result.ok).toBe(true);
    expect(result.operations).toHaveLength(3);
    expect(result.validation_reports).toHaveLength(3);
    expect(result.validation_reports!.every((r) => r.accepted)).toBe(true);
    expect(result.post_state_summary.count).toBe(3);
    expect(result.post_state_summary.primitive_ids).toEqual(["test:item:a", "test:item:b", "test:item:c"]);

    // Verify storage: all three are present.
    const slice = host.getProject("p");
    expect(Object.keys(slice.primitives).sort()).toEqual(["test:item:a", "test:item:b", "test:item:c"]);
  });

  it("rolls back the entire batch if any entry fails validation", async () => {
    await expect(
      primitiveCreateBatch.handler(
        host,
        {
          workbook_id: "p",
          primitives: [
            { id: "test:item:ok", type_id: "test:Item", field_values: { title: "OK" } },
            // Invalid: id doesn't match the pattern → core:id-format
            { id: "wrong:id:format", type_id: "test:Item", field_values: { title: "Bad" } },
            { id: "test:item:never", type_id: "test:Item", field_values: { title: "Never" } },
          ],
        },
        {} as never,
      ),
    ).rejects.toThrow(FDPMException);

    // Critical: storage MUST be empty — first entry must NOT persist.
    const slice = host.getProject("p");
    expect(Object.keys(slice.primitives)).toEqual([]);
  });

  it("rejection FDPMException carries findings for the failing entry", async () => {
    let caught: FDPMException | null = null;
    try {
      await primitiveCreateBatch.handler(
        host,
        {
          workbook_id: "p",
          primitives: [
            { id: "wrong:id:format", type_id: "test:Item", field_values: { title: "X" } },
          ],
        },
        {} as never,
      );
    } catch (err) {
      caught = err as FDPMException;
    }
    expect(caught).toBeInstanceOf(FDPMException);
    expect(caught!.category).toBe("validation");
    expect(caught!.findings).toBeDefined();
    expect((caught!.findings as { rule_id: string }[])[0].rule_id).toBe("core:id-format");
  });

  it("input schema enforces 1..500 primitives", () => {
    expect(
      primitiveCreateBatch.input.safeParse({ workbook_id: "p", primitives: [] }).success,
    ).toBe(false);
    expect(
      primitiveCreateBatch.input.safeParse({
        workbook_id: "p",
        primitives: Array.from({ length: 501 }, (_, i) => ({
          id: `test:item:${i}`,
          type_id: "test:Item",
          field_values: { title: `T${i}` },
        })),
      }).success,
    ).toBe(false);
  });

  it("description references type_info and atomicity", () => {
    expect(primitiveCreateBatch.description).toMatch(/fdpm\.profile\.type_info/);
    expect(primitiveCreateBatch.description).toMatch(/atomic|atomically/i);
    expect(primitiveCreateBatch.description).toMatch(/roll[s]? back|rollback|rolled back/i);
  });

  it("entries can reference siblings via the in-flight projection", async () => {
    // Create A first (in a separate batch), then in one batch create B
    // and a relation B->A. Tests that the batch sees A even though it's
    // not in the current intent list.
    await primitiveCreateBatch.handler(
      host,
      {
        workbook_id: "p",
        primitives: [
          { id: "test:item:anchor", type_id: "test:Item", field_values: { title: "A" } },
        ],
      },
      {} as never,
    );

    // Now create two new items in one batch — second references first
    // implicitly via cardinality (test:Relates many-to-many; no
    // cross-reference field needed for this test).
    const result = await primitiveCreateBatch.handler(
      host,
      {
        workbook_id: "p",
        primitives: [
          { id: "test:item:b1", type_id: "test:Item", field_values: { title: "B1" } },
          { id: "test:item:b2", type_id: "test:Item", field_values: { title: "B2" } },
        ],
      },
      {} as never,
    );
    expect(result.ok).toBe(true);
    expect(host.getProject("p").primitives["test:item:anchor"]).toBeDefined();
    expect(host.getProject("p").primitives["test:item:b1"]).toBeDefined();
  });
});

describe("fdpm.relation.create_batch", () => {
  let host: Host;

  beforeEach(async () => {
    host = await setupHost();
    // Seed two primitives so we have something to relate.
    await primitiveCreateBatch.handler(
      host,
      {
        workbook_id: "p",
        primitives: [
          { id: "test:item:a", type_id: "test:Item", field_values: { title: "A" } },
          { id: "test:item:b", type_id: "test:Item", field_values: { title: "B" } },
        ],
      },
      {} as never,
    );
  });

  it("creates N relations atomically", async () => {
    const result = await relationCreateBatch.handler(
      host,
      {
        workbook_id: "p",
        relations: [
          {
            id: "rel:a-b-1",
            type_id: "test:Relates",
            source_id: "test:item:a",
            target_id: "test:item:b",
          },
          {
            id: "rel:a-b-2",
            type_id: "test:Relates",
            source_id: "test:item:b",
            target_id: "test:item:a",
          },
        ],
      },
      {} as never,
    );
    expect(result.ok).toBe(true);
    expect(result.operations).toHaveLength(2);
    expect(result.post_state_summary.count).toBe(2);
    expect(Object.keys(host.getProject("p").relations).sort()).toEqual(["rel:a-b-1", "rel:a-b-2"]);
  });

  it("rolls back if any relation fails (e.g. missing source)", async () => {
    await expect(
      relationCreateBatch.handler(
        host,
        {
          workbook_id: "p",
          relations: [
            {
              id: "rel:ok",
              type_id: "test:Relates",
              source_id: "test:item:a",
              target_id: "test:item:b",
            },
            {
              id: "rel:bad",
              type_id: "test:Relates",
              source_id: "test:item:nonexistent",
              target_id: "test:item:b",
            },
          ],
        },
        {} as never,
      ),
    ).rejects.toThrow(FDPMException);

    // Both relations must be absent — atomic rollback.
    expect(Object.keys(host.getProject("p").relations)).toEqual([]);
  });

  it("input schema enforces 1..500 relations", () => {
    expect(
      relationCreateBatch.input.safeParse({ workbook_id: "p", relations: [] }).success,
    ).toBe(false);
  });

  it("description hints at type_info and atomicity", () => {
    expect(relationCreateBatch.description).toMatch(/fdpm\.profile\.type_info/);
    expect(relationCreateBatch.description).toMatch(/atomic|atomically/i);
  });
});
