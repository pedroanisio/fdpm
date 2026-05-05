/**
 * Batch delete tools (v0.1.1).
 *
 * fdpm.primitive.delete_batch / fdpm.relation.delete_batch are
 * Tier-3 destructive tools that route through Host.appendBatchWithCausation.
 * Real-session evidence: cleanup loops over rejection-retry-residue
 * primitives are N round-trips with N opportunities to partially
 * fail. Atomic batches collapse this to one round-trip with an
 * atomic outcome.
 *
 * The tests cover:
 *   - happy path (N deletes, N operations, storage emptied)
 *   - rollback when one id is absent (storage unchanged)
 *   - rollback when one delete violates a relation cardinality
 *     bound (the §7 pipeline still gates relation deletes
 *     indirectly, via primitive deletion validation downstream —
 *     but for THIS test we only assert the not_found branch)
 *   - input schema bounds (1..500)
 *   - tier classification (destructive)
 *   - description contract
 */

import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Host } from "../../src/core/host.js";
import { tool as primitiveDeleteBatch } from "../../src/mcp/tools/primitive-delete-batch.js";
import { tool as relationDeleteBatch } from "../../src/mcp/tools/relation-delete-batch.js";
import { tool as primitiveCreateBatch } from "../../src/mcp/tools/primitive-create-batch.js";
import { tool as relationCreateBatch } from "../../src/mcp/tools/relation-create-batch.js";
import { FDPMException } from "../../src/core/errors/fdpm-exception.js";
import { MANIFEST } from "../../src/mcp/manifest.js";

const TEST_PROFILE = {
  id: "profile:batch-del-test:0.1",
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

async function setupHostWithItems(count: number): Promise<{ host: Host; ids: string[] }> {
  const dataDir = mkdtempSync(join(tmpdir(), "mcp-bdel-"));
  const host = new Host({ dataDir, noPlugins: true });
  await host.load();
  await host.registerProfile(TEST_PROFILE, false);
  await host.createProject({
    workbook_id: "p",
    name: "p",
    profile_id: "profile:batch-del-test:0.1",
  });
  const ids = Array.from({ length: count }, (_, i) => `test:item:i${i}`);
  await primitiveCreateBatch.handler(
    host,
    {
      workbook_id: "p",
      primitives: ids.map((id) => ({
        id,
        type_id: "test:Item",
        field_values: { title: id },
      })),
    },
    {} as never,
  );
  return { host, ids };
}

describe("fdpm.primitive.delete_batch — happy path & atomicity", () => {
  it("deletes all N primitives in one call and removes them from storage", async () => {
    const { host, ids } = await setupHostWithItems(5);
    const result = await primitiveDeleteBatch.handler(
      host,
      { workbook_id: "p", primitive_ids: ids },
      {} as never,
    );
    expect(result.ok).toBe(true);
    expect(result.operations).toHaveLength(5);
    expect(result.post_state_summary.count).toBe(5);

    // Storage MUST be empty after a successful batch.
    const slice = host.getProject("p");
    expect(Object.keys(slice.primitives)).toEqual([]);
  });

  it("rolls back the entire batch if any id is absent (not_found)", async () => {
    const { host, ids } = await setupHostWithItems(3);
    await expect(
      primitiveDeleteBatch.handler(
        host,
        {
          workbook_id: "p",
          primitive_ids: [ids[0]!, "test:item:never_existed", ids[2]!],
        },
        {} as never,
      ),
    ).rejects.toThrow(FDPMException);

    // Critical: NOTHING was deleted — first id was real but rolled back.
    const slice = host.getProject("p");
    expect(Object.keys(slice.primitives).sort()).toEqual([...ids].sort());
  });

  it("rejection FDPMException carries category=not_found", async () => {
    const { host, ids } = await setupHostWithItems(2);
    let caught: FDPMException | null = null;
    try {
      await primitiveDeleteBatch.handler(
        host,
        { workbook_id: "p", primitive_ids: [ids[0]!, "test:item:ghost"] },
        {} as never,
      );
    } catch (err) {
      caught = err as FDPMException;
    }
    expect(caught).toBeInstanceOf(FDPMException);
    expect(caught!.category).toBe("not_found");
  });

  it("input schema enforces 1..500 ids", () => {
    expect(
      primitiveDeleteBatch.input.safeParse({ workbook_id: "p", primitive_ids: [] }).success,
    ).toBe(false);
    expect(
      primitiveDeleteBatch.input.safeParse({
        workbook_id: "p",
        primitive_ids: Array.from({ length: 501 }, (_, i) => `test:item:${i}`),
      }).success,
    ).toBe(false);
    expect(
      primitiveDeleteBatch.input.safeParse({
        workbook_id: "p",
        primitive_ids: ["test:item:a"],
      }).success,
    ).toBe(true);
  });

  it("scales to 50 deletes (representative cleanup load)", async () => {
    const { host, ids } = await setupHostWithItems(50);
    const result = await primitiveDeleteBatch.handler(
      host,
      { workbook_id: "p", primitive_ids: ids },
      {} as never,
    );
    expect(result.ok).toBe(true);
    expect(result.operations).toHaveLength(50);
    expect(Object.keys(host.getProject("p").primitives)).toEqual([]);
  });
});

describe("fdpm.relation.delete_batch — happy path & atomicity", () => {
  async function setupHostWithRelations(): Promise<{ host: Host; relIds: string[] }> {
    const { host, ids } = await setupHostWithItems(3);
    const relIds = ["rel:a-b", "rel:b-c", "rel:c-a"];
    await relationCreateBatch.handler(
      host,
      {
        workbook_id: "p",
        relations: [
          {
            id: "rel:a-b",
            type_id: "test:Relates",
            source_id: ids[0]!,
            target_id: ids[1]!,
          },
          {
            id: "rel:b-c",
            type_id: "test:Relates",
            source_id: ids[1]!,
            target_id: ids[2]!,
          },
          {
            id: "rel:c-a",
            type_id: "test:Relates",
            source_id: ids[2]!,
            target_id: ids[0]!,
          },
        ],
      },
      {} as never,
    );
    return { host, relIds };
  }

  it("deletes all N relations atomically", async () => {
    const { host, relIds } = await setupHostWithRelations();
    const result = await relationDeleteBatch.handler(
      host,
      { workbook_id: "p", relation_ids: relIds },
      {} as never,
    );
    expect(result.ok).toBe(true);
    expect(result.operations).toHaveLength(3);
    expect(Object.keys(host.getProject("p").relations)).toEqual([]);
  });

  it("rolls back if any relation id is absent", async () => {
    const { host, relIds } = await setupHostWithRelations();
    await expect(
      relationDeleteBatch.handler(
        host,
        { workbook_id: "p", relation_ids: [relIds[0]!, "rel:ghost"] },
        {} as never,
      ),
    ).rejects.toThrow(FDPMException);

    // Storage unchanged.
    expect(Object.keys(host.getProject("p").relations).sort()).toEqual([...relIds].sort());
  });
});

describe("delete_batch tools — manifest classification", () => {
  it("both batch tools are Tier 3 (destructive)", () => {
    const pdb = MANIFEST.find((t) => t.name === "fdpm.primitive.delete_batch");
    const rdb = MANIFEST.find((t) => t.name === "fdpm.relation.delete_batch");
    expect(pdb).toBeDefined();
    expect(rdb).toBeDefined();
    expect(pdb!.tier).toBe("destructive");
    expect(rdb!.tier).toBe("destructive");
    expect(pdb!.annotations.destructiveHint).toBe(true);
    expect(rdb!.annotations.destructiveHint).toBe(true);
  });

  it("descriptions document the off-by-default policy", () => {
    expect(primitiveDeleteBatch.description).toMatch(/off by default|destructive/i);
    expect(primitiveDeleteBatch.description).toMatch(/atomic|atomically/i);
    expect(primitiveDeleteBatch.description).toMatch(/roll[s]? back|rollback|rolled back/i);
    expect(relationDeleteBatch.description).toMatch(/off by default|destructive/i);
    expect(relationDeleteBatch.description).toMatch(/atomic|atomically/i);
  });
});
