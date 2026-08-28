/**
 * SPEC-MCP-SERVER §8.5 / §15 — end-to-end over the real stdio binary.
 *
 * Every other MCP test exercises the dispatcher in-process. The
 * catalog budget, however, is enforced in `src/bin/fdpm-mcp.ts` at
 * boot — a path no in-process test reaches. This suite spawns the
 * actual binary (via tsx) and speaks MCP through the SDK client:
 *
 *   - a default-budget session: `tools/list` carries `_meta.catalog_bytes`
 *     within `_meta.catalog_budget_bytes`; `fdpm.health.catalog` agrees
 *     with it; `fdpm://schema/profile` is readable over the wire; a
 *     malformed `fdpm.profile.register` is a Tier-2 rejection on the
 *     wire (isError=false, ok=false);
 *   - `FDPM_MCP_CATALOG_BUDGET_BYTES` raises the total and is reported
 *     back by `fdpm.health`;
 *   - a budget smaller than the catalog refuses boot with exit 2 and a
 *     message naming the env var (the operator escape hatch);
 *   - a malformed budget value refuses boot with exit 2.
 *
 * `FDPM_NO_PLUGINS=1` keeps each cold start to the Core manifest.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { DEFAULT_CATALOG_BUDGET } from "../../src/mcp/catalog.js";
import { PROFILE_SCHEMA_URI, SCHEMA_MIME } from "../../src/mcp/resources/schema.js";
import { SERVER_INSTRUCTIONS } from "../../src/mcp/instructions.js";
import { GUIDE_MIME, GUIDE_URI } from "../../src/mcp/resources/guide.js";

const TSX = join(process.cwd(), "node_modules", ".bin", "tsx");
const BIN = join(process.cwd(), "src", "bin", "fdpm-mcp.ts");
const SPAWN_TIMEOUT_MS = 60_000;

let dataDir: string;
beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "fdpm-mcp-stdio-"));
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

/** process.env minus every FDPM_* knob, plus the ones this test sets. */
function serverEnv(extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !k.startsWith("FDPM_")) env[k] = v;
  }
  return { ...env, FDPM_DATA_DIR: dataDir, FDPM_NO_PLUGINS: "1", ...extra };
}

async function connect(extra: Record<string, string> = {}): Promise<{
  client: Client;
  close: () => Promise<void>;
}> {
  const transport = new StdioClientTransport({
    command: TSX,
    args: [BIN, "--data-dir", dataDir],
    env: serverEnv(extra),
    stderr: "pipe",
  });
  const client = new Client({ name: "fdpm-mcp-stdio-test", version: "0.0.0" });
  await client.connect(transport);
  // Drain the banner so a full pipe can never block the child.
  transport.stderr?.on("data", () => {});
  return {
    client,
    close: async () => {
      await client.close();
    },
  };
}

interface HealthOut {
  ok: boolean;
  manifest_version: string;
  catalog: {
    tool_count: number;
    total_bytes: number;
    budget_total_bytes: number;
    budget_per_tool_bytes: number;
    within_budget: boolean;
  };
}

describe("fdpm-mcp over stdio — catalog budget end to end", () => {
  it(
    "default budget: tools/list _meta, fdpm.health.catalog, schema resource, and wire-level Tier-2 rejection agree",
    async () => {
      const { client, close } = await connect();
      try {
        const listed = await client.listTools();
        expect(listed.tools.length).toBeGreaterThan(0);
        const meta = listed._meta as
          | { manifest_version: string; catalog_bytes: number; catalog_budget_bytes: number }
          | undefined;
        expect(meta).toBeDefined();
        expect(meta!.catalog_budget_bytes).toBe(DEFAULT_CATALOG_BUDGET.total_bytes);
        expect(meta!.catalog_bytes).toBeGreaterThan(0);
        expect(meta!.catalog_bytes).toBeLessThanOrEqual(meta!.catalog_budget_bytes);
        const register = listed.tools.find((t) => t.name === "fdpm.profile.register");
        expect(register).toBeDefined();
        expect(register!.description).toContain(PROFILE_SCHEMA_URI);
        const profileProp = (register!.inputSchema as { properties: Record<string, unknown> })
          .properties["profile"] as Record<string, unknown>;
        expect(profileProp["type"]).toBe("object");
        expect(profileProp).not.toHaveProperty("properties");

        const health = await client.callTool({ name: "fdpm.health", arguments: {} });
        expect(health.isError).toBe(false);
        const h = health.structuredContent as unknown as HealthOut;
        expect(h.catalog.within_budget).toBe(true);
        expect(h.catalog.tool_count).toBe(listed.tools.length);
        expect(h.catalog.total_bytes).toBe(meta!.catalog_bytes);
        expect(h.catalog.budget_total_bytes).toBe(meta!.catalog_budget_bytes);
        expect(h.catalog.budget_per_tool_bytes).toBe(DEFAULT_CATALOG_BUDGET.per_tool_bytes);

        const schema = await client.readResource({ uri: PROFILE_SCHEMA_URI });
        expect(schema.contents).toHaveLength(1);
        const content = schema.contents[0] as { uri: string; mimeType?: string; text?: string };
        expect(content.uri).toBe(PROFILE_SCHEMA_URI);
        expect(content.mimeType).toBe(SCHEMA_MIME);
        const parsed = JSON.parse(content.text!) as { type: string; required: string[] };
        expect(parsed.type).toBe("object");
        expect(parsed.required).toContain("id");

        const templates = await client.listResourceTemplates();
        expect(templates.resourceTemplates.map((t) => t.uriTemplate)).toContain(
          "fdpm://schema/{schema_id}",
        );

        // §8.6 — initialize.instructions is the static orientation text and
        // fdpm://guide serves the same bytes.
        expect(client.getInstructions()).toBe(SERVER_INSTRUCTIONS);
        const guide = await client.readResource({ uri: GUIDE_URI });
        const guideContent = guide.contents[0] as { mimeType?: string; text?: string };
        expect(guideContent.mimeType).toBe(GUIDE_MIME);
        expect(guideContent.text).toBe(SERVER_INSTRUCTIONS);
        expect(templates.resourceTemplates.map((t) => t.uriTemplate)).toContain(GUIDE_URI);

        // §8.7 — dry_run is a preview: it passes the (disabled) destructive
        // gate over the wire and appends nothing; the real call still refuses.
        const created = await client.callTool({
          name: "fdpm.workbook.create",
          arguments: { workbook_id: "wb-e2e", name: "E2E", profile_id: "core:empty" },
        });
        expect(created.isError).toBe(false);
        const preview = await client.callTool({
          name: "fdpm.workbook.delete",
          arguments: { workbook_id: "wb-e2e", dry_run: true },
        });
        expect(preview.isError).toBe(false);
        const previewOut = preview.structuredContent as unknown as {
          ok: boolean;
          dry_run: boolean;
          would_affect: { workbook_id: string; primitive_count: number };
        };
        expect(previewOut.dry_run).toBe(true);
        expect(previewOut.would_affect.workbook_id).toBe("wb-e2e");
        expect(previewOut.would_affect.primitive_count).toBe(0);
        const refused = await client.callTool({
          name: "fdpm.workbook.delete",
          arguments: { workbook_id: "wb-e2e", idempotency_key: "e2e-1" },
        });
        expect(refused.isError).toBe(true);
        const refusedOut = refused.structuredContent as unknown as { error: { evidence: { reason: string } } };
        expect(refusedOut.error.evidence.reason).toBe("destructive_disabled");
        const stillThere = await client.callTool({ name: "fdpm.workbook.list", arguments: {} });
        const wbs = (stillThere.structuredContent as unknown as { workbooks: Array<{ id: string }> }).workbooks;
        expect(wbs.map((w) => w.id)).toContain("wb-e2e");

        const rejected = await client.callTool({
          name: "fdpm.profile.register",
          arguments: { profile: { id: "not a valid id", version: "x" } },
        });
        expect(rejected.isError).toBe(false);
        const env = rejected.structuredContent as unknown as {
          ok: boolean;
          validation_report: { accepted: boolean; findings: Array<{ rule_id: string }> };
        };
        expect(env.ok).toBe(false);
        expect(env.validation_report.accepted).toBe(false);
        expect(env.validation_report.findings.every((f) => f.rule_id === "core:profile-schema")).toBe(
          true,
        );

        // §9.5 — the audit report is a resource; the rejection above is now an error class.
        const audit = await client.readResource({ uri: "fdpm://audit/report" });
        const auditContent = audit.contents[0] as { mimeType?: string; text?: string };
        expect(auditContent.mimeType).toBe("application/json");
        const auditReport = JSON.parse(auditContent.text!) as {
          totals: { calls: number; rejected: number };
          error_classes: Array<{ class: string }>;
        };
        expect(auditReport.totals.calls).toBeGreaterThanOrEqual(2);
        expect(auditReport.totals.rejected).toBeGreaterThanOrEqual(1);
        expect(auditReport.error_classes.map((c) => c.class)).toContain(
          "fdpm.profile.register rule:core:profile-schema",
        );
        expect(templates.resourceTemplates.map((t) => t.uriTemplate)).toContain(
          "fdpm://audit/report/{window}",
        );

        // §13.5 — prompts capability is declared; with plugins off the list is empty.
        expect(client.getServerCapabilities()?.prompts).toBeDefined();
        const noPrompts = await client.listPrompts();
        expect(noPrompts.prompts).toEqual([]);
      } finally {
        await close();
      }
    },
    SPAWN_TIMEOUT_MS,
  );

  it(
    "FDPM_MCP_CATALOG_BUDGET_BYTES raises the total and fdpm.health reports it",
    async () => {
      const { client, close } = await connect({ FDPM_MCP_CATALOG_BUDGET_BYTES: "60000" });
      try {
        const health = await client.callTool({ name: "fdpm.health", arguments: {} });
        const h = health.structuredContent as unknown as HealthOut;
        expect(h.catalog.budget_total_bytes).toBe(60_000);
        expect(h.catalog.budget_per_tool_bytes).toBe(DEFAULT_CATALOG_BUDGET.per_tool_bytes);
        expect(h.catalog.within_budget).toBe(true);
      } finally {
        await close();
      }
    },
    SPAWN_TIMEOUT_MS,
  );

  it(
    "a budget smaller than the catalog refuses boot: exit 2, violations and the env var named on stderr",
    () => {
      const result = spawnSync(TSX, [BIN, "--data-dir", dataDir], {
        env: serverEnv({ FDPM_MCP_CATALOG_BUDGET_BYTES: "1000" }),
        encoding: "utf8",
        timeout: SPAWN_TIMEOUT_MS,
      });
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/exceeds its byte budget/);
      expect(result.stderr).toMatch(/catalog total \d+ B exceeds budget 1000 B/);
      expect(result.stderr).toMatch(/FDPM_MCP_CATALOG_BUDGET_BYTES/);
      expect(result.stdout).toBe("");
    },
    SPAWN_TIMEOUT_MS,
  );

  it(
    "a malformed budget value refuses boot with exit 2 before any MCP frame",
    () => {
      const result = spawnSync(TSX, [BIN, "--data-dir", dataDir], {
        env: serverEnv({ FDPM_MCP_CATALOG_BUDGET_BYTES: "lots" }),
        encoding: "utf8",
        timeout: SPAWN_TIMEOUT_MS,
      });
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/FDPM_MCP_CATALOG_BUDGET_BYTES must be a positive integer/);
      expect(result.stdout).toBe("");
    },
    SPAWN_TIMEOUT_MS,
  );
});

describe("fdpm-mcp over stdio — plugin prompts (plugins on)", () => {
  it(
    "prompts/list is metadata only; prompts/get renders planning/triage_iteration with arguments",
    async () => {
      const { client, close } = await connect({ FDPM_NO_PLUGINS: "0" });
      try {
        const listed = await client.listPrompts();
        const triage = listed.prompts.find((p) => p.name === "planning/triage_iteration");
        expect(triage).toBeDefined();
        expect(triage!.description).toMatch(/^Use /);
        expect(JSON.stringify(triage)).not.toMatch(/Call order/);
        expect(triage!.arguments?.some((a) => a.name === "workbook_id" && a.required === true)).toBe(true);

        const got = await client.getPrompt({
          name: "planning/triage_iteration",
          arguments: { workbook_id: "plan-e2e", focus: "auth" },
        });
        const text = got.messages.map((m) => (m.content as { text: string }).text).join("\n");
        expect(text).toContain("plan-e2e");
        expect(text).toContain("auth");
        expect(text).toMatch(/call order/i);

        await expect(client.getPrompt({ name: "planning/triage_iteration", arguments: {} })).rejects.toThrow(
          /prompt_argument_missing/,
        );
        await expect(client.getPrompt({ name: "planning/nope" })).rejects.toThrow(/not_found|not found/);
      } finally {
        await close();
      }
    },
    SPAWN_TIMEOUT_MS,
  );
});
