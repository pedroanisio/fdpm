/**
 * Host.reloadProjectTail() — SPEC-REPL §10.2 lenient-mode incremental
 * tail-replay.
 *
 * Three outcomes from §10.2:
 *   1. No change: cheap no-op returning {appliedOps: 0}.
 *   2. Pure append: new tail ops applied; in-memory state matches disk.
 *   3. Divergent (truncated or rewritten prefix): host_compat throw
 *      so the operator sees the issue instead of the freshness gate
 *      silently masking it.
 *
 * Also exercises Store.appendReplayedOps directly to prove its
 * revision-contiguity guard before we go through Host.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Host } from "../src/core/host.js";
import { FDPMException } from "../src/core/errors/fdpm-exception.js";
import {
  appendRawOp,
  rewriteFirstOp,
  truncateLogToOps,
} from "./_helpers/oob-write.js";

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "fdpm-tail-"));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

async function freshHost(): Promise<Host> {
  const host = new Host({
    dataDir,
    builtinDirs: [resolve(process.cwd(), "plugins")],
  });
  await host.load();
  return host;
}

const FS_PROFILE = "profile:formal-specification:3.0";

describe("Host.reloadProjectTail — no change", () => {
  it("returns {appliedOps: 0, newRevision} when nothing is on disk", async () => {
    const host = await freshHost();
    const result = await host.reloadProjectTail("never-existed");
    expect(result.appliedOps).toBe(0);
    expect(result.newRevision).toBe(0);
  });

  it("returns {appliedOps: 0} when on-disk log matches in-memory log", async () => {
    const host = await freshHost();
    const created = await host.createProject({
      workbook_id: "proj-stable",
      name: "Stable",
      profile_id: FS_PROFILE,
    });
    const result = await host.reloadProjectTail("proj-stable");
    expect(result.appliedOps).toBe(0);
    expect(result.newRevision).toBe(created.project_revision);
  });
});

describe("Host.reloadProjectTail — pure append (lenient replay)", () => {
  it("applies a single out-of-band op and reports {appliedOps: 1}", async () => {
    const host = await freshHost();
    await host.createProject({
      workbook_id: "proj-append",
      name: "Append",
      profile_id: FS_PROFILE,
    });
    const beforeRev = host.getProject("proj-append").workbook.revision;

    appendRawOp(dataDir, "proj-append", {
      op_id: "01JZZZAPPEND00000000000001",
      kind: "primitive.create",
      workbook_id: "proj-append",
      payload: {
        id: "section:tail-1",
        type_id: "fs:Section",
        field_values: {
          number: 1,
          title: "Tail-replayed",
          status: "draft",
          version: "0.1",
          description: "Appended by another process.",
        },
        uid: "01JZZZAPPENDUID0000000001",
      },
      actor: "test:oob",
      plugin_id: null,
      timestamp: "2026-05-05T00:00:00.000Z",
      revision: beforeRev + 1,
      request_id: "00000000-0000-7000-8000-000000000ap1",
      parent_op_id: null,
      causation_op_id: null,
      schema_version: "1.2.0",
    });

    const result = await host.reloadProjectTail("proj-append");
    expect(result.appliedOps).toBe(1);
    expect(result.newRevision).toBe(beforeRev + 1);
    expect(host.getProject("proj-append").primitives["section:tail-1"]).toBeDefined();
  });

  it("applies multiple contiguous appends in order", async () => {
    const host = await freshHost();
    await host.createProject({
      workbook_id: "proj-multi",
      name: "Multi",
      profile_id: FS_PROFILE,
    });
    const beforeRev = host.getProject("proj-multi").workbook.revision;

    for (let i = 1; i <= 3; i += 1) {
      appendRawOp(dataDir, "proj-multi", {
        op_id: `01JZZZMULTI00000000000000${i}`,
        kind: "primitive.create",
        workbook_id: "proj-multi",
        payload: {
          id: `section:multi-${i}`,
          type_id: "fs:Section",
          field_values: {
            number: i,
            title: `Multi ${i}`,
            status: "draft",
            version: "0.1",
            description: `Sequence ${i}.`,
          },
          uid: `01JZZZMULTIUID00000000${i.toString().padStart(3, "0")}`,
        },
        actor: "test:oob",
        plugin_id: null,
        timestamp: `2026-05-05T00:00:0${i}.000Z`,
        revision: beforeRev + i,
        request_id: `00000000-0000-7000-8000-00000000mu${i}`,
        parent_op_id: null,
        causation_op_id: null,
        schema_version: "1.2.0",
      });
    }

    const result = await host.reloadProjectTail("proj-multi");
    expect(result.appliedOps).toBe(3);
    expect(result.newRevision).toBe(beforeRev + 3);
    const slice = host.getProject("proj-multi");
    expect(slice.primitives["section:multi-1"]).toBeDefined();
    expect(slice.primitives["section:multi-2"]).toBeDefined();
    expect(slice.primitives["section:multi-3"]).toBeDefined();
  });
});

describe("Host.reloadProjectTail — divergent log (host_compat)", () => {
  it("throws host_compat when the on-disk log shrank (truncate)", async () => {
    const host = await freshHost();
    await host.createProject({
      workbook_id: "proj-shrink",
      name: "Shrink",
      profile_id: FS_PROFILE,
    });
    truncateLogToOps(dataDir, "proj-shrink", 0);
    await expect(host.reloadProjectTail("proj-shrink")).rejects.toMatchObject({
      category: "host_compat",
    });
  });

  it("throws host_compat when the on-disk log prefix was rewritten", async () => {
    const host = await freshHost();
    await host.createProject({
      workbook_id: "proj-rewrite",
      name: "Rewrite",
      profile_id: FS_PROFILE,
    });
    rewriteFirstOp(dataDir, "proj-rewrite", {
      op_id: "01JZZZWRONG0000000000000R0",
      kind: "workbook.create",
      workbook_id: "proj-rewrite",
      payload: {
        workbook_id: "proj-rewrite",
        name: "DIFFERENT",
        profile_id: FS_PROFILE,
      },
      actor: "test:rewriter",
      plugin_id: null,
      timestamp: "2026-05-05T00:00:00.000Z",
      revision: 1,
      request_id: "00000000-0000-7000-8000-00000000wrng",
      parent_op_id: null,
      causation_op_id: null,
      schema_version: "1.2.0",
    });
    await expect(host.reloadProjectTail("proj-rewrite")).rejects.toMatchObject({
      category: "host_compat",
    });
  });
});

describe("Store.appendReplayedOps — revision contiguity guard", () => {
  it("throws host_compat when an op's revision skips ahead", async () => {
    const host = await freshHost();
    const created = await host.createProject({
      workbook_id: "proj-skip",
      name: "Skip",
      profile_id: FS_PROFILE,
    });
    // Synthesize an op with revision = currentRev + 5 (gap of 4).
    // Use the same shape Operation accepts.
    const badOp = {
      op_id: "01JZZZSKIP0000000000000SK1",
      kind: "primitive.create" as const,
      workbook_id: "proj-skip",
      payload: {
        id: "section:skip",
        type_id: "fs:Section",
        field_values: {
          number: 1,
          title: "Skip",
          status: "draft",
          version: "0.1",
          description: "Should fail",
        },
        uid: "01JZZZSKIPUID0000000000000",
      },
      actor: "test:skip",
      plugin_id: null,
      timestamp: "2026-05-05T00:00:00.000Z",
      revision: created.project_revision + 5,
      request_id: "00000000-0000-7000-8000-00000000skip" as const,
      parent_op_id: null,
      causation_op_id: null,
      schema_version: "1.2.0" as const,
    };

    expect(() => host.store.appendReplayedOps("proj-skip", [badOp])).toThrow(
      FDPMException,
    );
  });
});

describe("staleStateException helper", () => {
  it("constructs a permission envelope with reason=stale_state and parameterized advice", async () => {
    const { staleStateException } = await import("../src/core/errors/stale-state.js");
    const ex = staleStateException({
      workbook_id: "proj-x",
      advice: "run :reload or restart the REPL",
    });
    expect(ex.category).toBe("permission");
    const env = ex.toEnvelope();
    expect((env.evidence as Record<string, unknown>)["reason"]).toBe("stale_state");
    expect((env.evidence as Record<string, unknown>)["workbook_id"]).toBe("proj-x");
    expect((env.evidence as Record<string, unknown>)["advice"]).toBe(
      "run :reload or restart the REPL",
    );
  });

  it("accepts a different advice string for the MCP surface (proves the parameterization)", async () => {
    const { staleStateException } = await import("../src/core/errors/stale-state.js");
    const mcpAdvice = "operator must SIGHUP fdpm-mcp";
    const ex = staleStateException({ workbook_id: "proj-y", advice: mcpAdvice });
    expect(
      (ex.toEnvelope().evidence as Record<string, unknown>)["advice"],
    ).toBe(mcpAdvice);
  });

  it("includes optional detail (cached/observed mtime+size) when provided", async () => {
    const { staleStateException } = await import("../src/core/errors/stale-state.js");
    const ex = staleStateException({
      workbook_id: "proj-z",
      advice: "run :reload",
      detail: {
        cached_mtime_ns: "1000000",
        cached_size: "200",
        observed_mtime_ns: "2000000",
        observed_size: "300",
      },
    });
    const detail = (ex.toEnvelope().evidence as Record<string, unknown>)["detail"] as Record<
      string,
      unknown
    >;
    expect(detail).toBeDefined();
    expect(detail["observed_size"]).toBe("300");
  });
});
