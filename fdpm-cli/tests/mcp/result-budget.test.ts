/**
 * The tool-result ceiling.
 *
 * `resources/read` has been capped since the read guard landed; `tools/call`
 * was not. The gap is not theoretical: `fdpm.profile.get` with the default
 * `view: "full"` serves 5,409,966 B for `profile:uixo:1.2` and 113,888 B for
 * `profile:academic-paper:0.4.1`, and a client refused a 61,233-character
 * result outright. The server recorded every one of those calls as `ok: true`,
 * because nothing on the tool path measured what it was about to return.
 *
 * These tests pin three things:
 *
 *   1. The ceiling is resolved like every other operator knob — a malformed
 *      value is a refusal, never a silent fallback to the default.
 *   2. A read-only result over the ceiling is REFUSED with a `quota` envelope
 *      that names the narrowing levers the tool actually has. A read has no
 *      side effect, so refusing it costs one round trip and teaches the caller
 *      the smaller call.
 *   3. A write result is NOT refused. The append already happened; a caller
 *      that receives `quota` instead of its operation record cannot tell a
 *      rejected write from a completed one, and the obvious recovery — retry —
 *      duplicates the write. Bounding write echoes is a separate change with
 *      a different mechanism (compaction, not refusal).
 *
 * Plus the audit consequence: every complete entry carries `result_bytes`, so
 * the operator can see the distribution that produced the refusal rather than
 * inferring it from a client-side error message.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { Host } from "../../src/core/host.js";
import { TEST_PROFILE } from "../fixtures.js";
import { createDispatcher } from "../../src/mcp/dispatch.js";
import { createSession } from "../../src/mcp/session.js";
import { McpAuditLog } from "../../src/persistence/mcp-audit-log.js";
import {
  DEFAULT_MAX_RESULT_BYTES,
  MAX_RESULT_BYTES_ENV,
  measureResultBytes,
  resolveMaxResultBytes,
} from "../../src/mcp/result-budget.js";
import type { DispatchCtx, McpToolEntry } from "../../src/mcp/types.js";

let dataDir: string;
beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "fdpm-mcp-budget-"));
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

async function bootstrap(
  maxResultBytes?: number,
): Promise<{ host: Host; ctx: DispatchCtx }> {
  const host = new Host({ dataDir, noPlugins: true });
  await host.load();
  await host.registerProfile(TEST_PROFILE);
  const ctx: DispatchCtx = {
    session: createSession({ maxPerMinute: 600 }),
    enableDestructive: false,
    enabledPlugins: new Set(),
    auditFullArgs: false,
    hostOptions: { dataDir, noPlugins: true },
    ...(maxResultBytes === undefined ? {} : { maxResultBytes }),
  };
  return { host, ctx };
}

/** A read-only tool that returns a payload of a caller-chosen size. */
function padTool(narrowing?: readonly string[]): McpToolEntry<unknown, unknown> {
  return {
    name: "test.pad",
    tier: "read_only",
    description: "Returns a string of the requested byte length.",
    input: z.object({ size: z.number().int().positive() }).strict(),
    output: z.object({}).passthrough(),
    annotations: { readOnlyHint: true },
    ...(narrowing === undefined ? {} : { narrowing }),
    handler: async (_host, args) => ({
      pad: "x".repeat((args as { size: number }).size),
    }),
  };
}

/** A Tier-2 tool that returns an oversized but well-formed envelope. */
function fatWriteTool(): McpToolEntry<unknown, unknown> {
  return {
    name: "test.fat_write",
    tier: "validating_write",
    description: "Returns an oversized Tier-2 envelope.",
    input: z.object({ size: z.number().int().positive() }).strict(),
    output: z.object({}).passthrough(),
    annotations: {},
    handler: async (_host, args) => ({
      ok: true,
      validation_report: { accepted: true, findings: [], target_id: "t1" },
      post_state_summary: { echo: "x".repeat((args as { size: number }).size) },
    }),
  };
}

describe("result budget — operator knob", () => {
  it("defaults when the variable is unset or blank", () => {
    expect(resolveMaxResultBytes({})).toBe(DEFAULT_MAX_RESULT_BYTES);
    expect(resolveMaxResultBytes({ [MAX_RESULT_BYTES_ENV]: "   " })).toBe(
      DEFAULT_MAX_RESULT_BYTES,
    );
  });

  it("parses a positive integer", () => {
    expect(resolveMaxResultBytes({ [MAX_RESULT_BYTES_ENV]: "4096" })).toBe(4096);
  });

  it.each(["0", "-1", "1MB", "4096.5", "nonsense"])(
    "refuses %s rather than falling back to the default",
    (raw) => {
      expect(() => resolveMaxResultBytes({ [MAX_RESULT_BYTES_ENV]: raw })).toThrow(
        MAX_RESULT_BYTES_ENV,
      );
    },
  );

  it("measures the UTF-8 bytes of the serialised result, not its character count", () => {
    // "é" is one character and two UTF-8 bytes; the JSON wrapper adds 10.
    expect(measureResultBytes({ a: "é" })).toBe(Buffer.byteLength('{"a":"é"}', "utf8"));
  });
});

describe("result budget — read-only results are refused over the ceiling", () => {
  it("refuses with quota/result_too_large and reports the measured size", async () => {
    const { host, ctx } = await bootstrap(1024);
    const tool = padTool();
    const d = createDispatcher(host, ctx, null, (n) => (n === tool.name ? tool : null));

    const result = await d.call("test.pad", { size: 4096 });

    expect(result.isError).toBe(true);
    const env = (
      result.structuredContent as {
        error: { category: string; evidence?: Record<string, unknown> };
      }
    ).error;
    expect(env.category).toBe("quota");
    expect(env.evidence?.["reason"]).toBe("result_too_large");
    expect(env.evidence?.["cap"]).toBe(1024);
    expect(env.evidence?.["env"]).toBe(MAX_RESULT_BYTES_ENV);
    expect(env.evidence?.["tool"]).toBe("test.pad");
    expect(Number(env.evidence?.["bytes"])).toBeGreaterThan(4096);
  });

  it("carries the tool's declared narrowing levers so the retry is obvious", async () => {
    const { host, ctx } = await bootstrap(1024);
    const tool = padTool(['view: "types"', "fields: [...]"]);
    const d = createDispatcher(host, ctx, null, (n) => (n === tool.name ? tool : null));

    const result = await d.call("test.pad", { size: 4096 });

    const env = (result.structuredContent as { error: { evidence?: Record<string, unknown> } })
      .error;
    expect(env.evidence?.["narrowing"]).toEqual(['view: "types"', "fields: [...]"]);
  });

  it("passes a result that fits through untouched", async () => {
    const { host, ctx } = await bootstrap(4096);
    const tool = padTool();
    const d = createDispatcher(host, ctx, null, (n) => (n === tool.name ? tool : null));

    const result = await d.call("test.pad", { size: 16 });

    expect(result.isError).toBe(false);
    expect((result.structuredContent as { pad: string }).pad).toBe("x".repeat(16));
  });

  it("applies the default ceiling when the context does not set one", async () => {
    const { host, ctx } = await bootstrap();
    const tool = padTool();
    const d = createDispatcher(host, ctx, null, (n) => (n === tool.name ? tool : null));

    const over = await d.call("test.pad", { size: DEFAULT_MAX_RESULT_BYTES + 1 });
    expect(over.isError).toBe(true);
    const under = await d.call("test.pad", { size: 128 });
    expect(under.isError).toBe(false);
  });
});

describe("result budget — write results are never refused", () => {
  it("returns the oversized Tier-2 envelope rather than a quota error", async () => {
    const { host, ctx } = await bootstrap(1024);
    const tool = fatWriteTool();
    const d = createDispatcher(host, ctx, null, (n) => (n === tool.name ? tool : null));

    const result = await d.call("test.fat_write", { size: 8192 });

    // The append already happened. A `quota` envelope here would be
    // indistinguishable from a refused write and would invite a duplicating
    // retry, which is strictly worse than an oversized response.
    expect(result.isError).toBe(false);
    expect((result.structuredContent as { ok: boolean }).ok).toBe(true);
  });
});

describe("result budget — fdpm.profile.get, through the real manifest", () => {
  /**
   * The reported failure, reproduced against the shipped tool rather than a
   * synthetic one: a profile whose `full` view is larger than any client will
   * take. Before the ceiling this returned 61,233 characters, the client
   * discarded them, and the audit log recorded `ok: true`.
   */
  async function withBigProfile(
    typeCount: number,
  ): Promise<{ host: Host; ctx: DispatchCtx }> {
    const { host, ctx } = await bootstrap();
    const big = structuredClone(TEST_PROFILE) as unknown as Record<string, unknown>;
    big["id"] = "test:big";
    // Types carrying the long-form descriptions the `types` view strips. Same
    // shape as the profiles that motivated this: the bulk is documentation,
    // not vocabulary — until the type count alone is the bulk, which is what
    // the 400-type case below reproduces.
    big["primitive_types"] = Array.from({ length: typeCount }, (_, i) => ({
      id: `test:big:t${i}`,
      fields: [
        {
          name: "title",
          kind: "string",
          required: true,
          description: `Field ${i}. ${"Long-form prose that the types view drops. ".repeat(6)}`,
          validations: [],
        },
      ],
      id_format: { pattern: `^t${i}:[a-z0-9-]+$`, uniqueness: "workbook" },
      inline_structs: [],
      is_partition_unit: false,
    }));
    big["relation_types"] = [];
    await host.registerProfile(big as never);
    return { host, ctx };
  }

  it("refuses view: full and names the views that would fit", async () => {
    const { host, ctx } = await withBigProfile(150);
    const d = createDispatcher(host, ctx, null);

    const result = await d.call("fdpm.profile.get", { profile_id: "test:big" });

    expect(result.isError).toBe(true);
    const env = (
      result.structuredContent as {
        error: { category: string; message: string; evidence?: Record<string, unknown> };
      }
    ).error;
    expect(env.category).toBe("quota");
    expect(env.evidence?.["reason"]).toBe("result_too_large");
    expect(env.evidence?.["narrowing"]).toContain('view: "types"');
    expect(env.evidence?.["narrowing"]).toContain('view: "type_ids"');
    // The refusal has to be self-sufficient: an agent reads the message, not
    // only the evidence block.
    expect(env.message).toContain('view: "types"');
  });

  it("serves the same profile under view: types and view: type_ids", async () => {
    const { host, ctx } = await withBigProfile(150);
    const d = createDispatcher(host, ctx, null);

    const types = await d.call("fdpm.profile.get", {
      profile_id: "test:big",
      view: "types",
    });
    expect(types.isError).toBe(false);
    expect((types.structuredContent as { _view: string })._view).toBe("types");

    const ids = await d.call("fdpm.profile.get", {
      profile_id: "test:big",
      view: "type_ids",
    });
    expect(ids.isError).toBe(false);
    const idsBody = ids.structuredContent as { primitive_type_ids: string[] };
    expect(idsBody.primitive_type_ids).toHaveLength(150);
    // The rung earns its place only if it is the smaller one.
    expect(measureResultBytes(ids.structuredContent)).toBeLessThan(
      measureResultBytes(types.structuredContent),
    );
  });

  it("still answers with type_ids when even the types view is too large", async () => {
    // `profile:uixo:1.2` in the operator's own data dir: 712 primitive types,
    // `full` at 5,409,966 B and `types` at 1,835,052 B. Both are past any
    // ceiling, so `summary` (which gives a count, not names) and `type_ids`
    // (which gives names a caller can pass to fdpm.profile.type_info) are the
    // only rungs that answer. Without `type_ids` such a profile would be
    // unusable over MCP.
    const { host, ctx } = await withBigProfile(400);
    const d = createDispatcher(host, ctx, null);

    const types = await d.call("fdpm.profile.get", {
      profile_id: "test:big",
      view: "types",
    });
    expect(types.isError).toBe(true);

    const ids = await d.call("fdpm.profile.get", {
      profile_id: "test:big",
      view: "type_ids",
    });
    expect(ids.isError).toBe(false);
    expect(
      (ids.structuredContent as { primitive_type_ids: string[] }).primitive_type_ids,
    ).toHaveLength(400);

    // And the id it hands back is one `fdpm.profile.type_info` accepts, so
    // the ladder actually terminates in a usable answer.
    const info = await d.call("fdpm.profile.type_info", {
      profile_id: "test:big",
      type_id: "test:big:t7",
    });
    expect(info.isError).toBe(false);
  });
});

describe("result budget — the audit log records what was served", () => {
  it("writes result_bytes on a successful complete entry", async () => {
    const { host, ctx } = await bootstrap(4096);
    const audit = new McpAuditLog(dataDir);
    const tool = padTool();
    const d = createDispatcher(host, ctx, audit, (n) => (n === tool.name ? tool : null));

    await d.call("test.pad", { size: 100 });

    const entries = readFileSync(audit.path, "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    const complete = entries.find((e) => e["phase"] === "complete");
    expect(complete).toBeDefined();
    expect(complete?.["ok"]).toBe(true);
    expect(Number(complete?.["result_bytes"])).toBeGreaterThan(100);
  });

  it("writes result_bytes and the refusal reason when the ceiling refuses a call", async () => {
    const { host, ctx } = await bootstrap(256);
    const audit = new McpAuditLog(dataDir);
    const tool = padTool();
    const d = createDispatcher(host, ctx, audit, (n) => (n === tool.name ? tool : null));

    await d.call("test.pad", { size: 4096 });

    const entries = readFileSync(audit.path, "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    const complete = entries.find((e) => e["phase"] === "complete");
    expect(complete?.["ok"]).toBe(false);
    expect(complete?.["error_category"]).toBe("quota");
    expect(complete?.["error_reason"]).toBe("result_too_large");
    expect(Number(complete?.["result_bytes"])).toBeGreaterThan(4096);
  });
});
