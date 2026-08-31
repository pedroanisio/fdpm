/**
 * The reported failure, over the wire, on the profile that produced it.
 *
 * `batch-settled-validation.test.ts` proves the host re-validates against the
 * settled projection. It does not prove an agent ever sees those reports: the
 * MCP batch tools forward `reports` from the host, and nothing in the type
 * system says the envelope carries the settled ones rather than a recomputed
 * or reordered set.
 *
 * These cases spawn `fdpm-mcp`, speak MCP through the SDK client, and drive
 * `fdpm.primitive.create_batch` against `profile:knowledge-cartridge:1.0`,
 * whose `kc:Cartridge` validator counts the rest of the graph. The header is
 * created FIRST in both cases, so in loop it is judged against a workbook that
 * holds none of the entries after it — the shape that produced the original
 * "L4 holds 0 diagnostics" beside `ok: true` in a batch that created four.
 *
 * Both directions are covered, because the settled pass is not a warning
 * filter: a finding can appear at settle time as well as vanish, and the
 * appearing case changes whether the batch commits at all.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/** Anchored on this file, not process.cwd(): vitest may run from either root. */
const PKG_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const TSX = join(PKG_ROOT, "node_modules", ".bin", "tsx");
const MCP_BIN = join(PKG_ROOT, "src", "bin", "fdpm-mcp.ts");
const TIMEOUT_MS = 180_000;

const PROFILE = "profile:knowledge-cartridge:1.0";
const SCOPE = "scope:knowledge-cartridge:workbook";
const WB = "settled-e2e";

let dataDir: string;
beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "fdpm-settled-stdio-"));
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

/** Plugins stay ON here: the cartridge profile is what carries the validator. */
function serverEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !k.startsWith("FDPM_")) env[k] = v;
  }
  return { ...env, FDPM_DATA_DIR: dataDir };
}

async function connect(): Promise<{ client: Client; close: () => Promise<void> }> {
  const transport = new StdioClientTransport({ command: TSX, args: [MCP_BIN], env: serverEnv() });
  const client = new Client({ name: "settled-stdio-test", version: "0.0.0" }, { capabilities: {} });
  await client.connect(transport);
  return { client, close: () => client.close() };
}

interface Finding {
  rule_id: string;
  message: string;
  level: string;
}
interface BatchEnvelope {
  ok?: boolean;
  validation_reports?: Array<{ target_id: string; accepted: boolean; findings: Finding[] }>;
  validation_report?: { target_id: string; accepted: boolean; findings: Finding[] };
}

function envelope(result: unknown): BatchEnvelope {
  return (result as { structuredContent?: BatchEnvelope }).structuredContent ?? {};
}

const cartridgeEntry = {
  id: "kc:cartridge:settled",
  type_id: "kc:Cartridge",
  scope_id: SCOPE,
  field_values: {
    cartridge_id: "TC-SET-001",
    subject: "batch validation",
    archetype: "an agent authoring a cartridge in one call",
    substrate: "filesystem",
    snapshot_date: "2026-08-31",
    source_token_estimate: 0,
    disclaimer: "Paraphrase not quotation; defaults are starting positions, not tolerances.",
  },
};

/** L5. Exempt from the citation rule, so a batch of these carries no error. */
function overrideEntry(n: number) {
  return {
    id: `kc:override:settled-${n}`,
    type_id: "kc:Override",
    scope_id: SCOPE,
    field_values: {
      condition: `Condition ${n}: the batch is still mid-flight.`,
      rationale: `Rationale ${n}: an intermediate projection is not the workbook anyone will hold.`,
    },
  };
}

/** L4. A normative claim, so an uncited one is an error on the header. */
function diagnosticEntry(n: number) {
  return {
    id: `kc:diagnostic:settled-${n}`,
    type_id: "kc:Diagnostic",
    scope_id: SCOPE,
    field_values: {
      symptom: `Symptom ${n}: the report contradicts the workbook it describes.`,
      cause: `Cause ${n}: validation ran against a projection the batch had not finished building.`,
      correction: `Correction ${n}: re-evaluate once the batch settles.`,
    },
  };
}

async function makeWorkbook(client: Client): Promise<void> {
  await client.callTool({
    name: "fdpm.workbook.create",
    arguments: { workbook_id: WB, name: "Settled E2E", profile_id: PROFILE },
  });
}

describe("fdpm.primitive.create_batch — settled reports over stdio", () => {
  it(
    "drops the finding the batch itself falsified, and keeps the one it did not",
    async () => {
      const { client, close } = await connect();
      try {
        await makeWorkbook(client);

        // Header FIRST: in loop it is judged against an empty workbook, so
        // `kc:val:judgement-non-empty` fires. The same batch then creates the
        // three overrides that make it false.
        const primitives = [cartridgeEntry, overrideEntry(1), overrideEntry(2), overrideEntry(3)];
        const env = envelope(
          await client.callTool({
            name: "fdpm.primitive.create_batch",
            arguments: { workbook_id: WB, primitives },
          }),
        );

        expect(env.ok, JSON.stringify(env.validation_report ?? {})).toBe(true);
        expect(env.validation_reports).toHaveLength(4);

        const header = env.validation_reports!.find((r) => r.target_id === cartridgeEntry.id);
        expect(header, "the header's report must be in the envelope").toBeDefined();
        const ruleIds = header!.findings.map((f) => f.rule_id);

        // Gone: the batch that triggered it also falsified it.
        expect(ruleIds).not.toContain("kc:val:judgement-non-empty");
        expect(header!.findings.map((f) => f.message).join(" | ")).not.toContain("L5 is empty");

        // Kept: this workbook really does hold zero diagnostics. The settled
        // pass corrects false findings; it does not suppress true ones.
        const shortfall = header!.findings.find((f) => f.rule_id === "kc:val:diagnostic-minimum");
        expect(shortfall, "a true shortfall must survive the settled pass").toBeDefined();
        expect(shortfall!.message).toContain("L4 holds 0 diagnostics");
        expect(shortfall!.level).toBe("warning");
      } finally {
        await close();
      }
    },
    TIMEOUT_MS,
  );

  it(
    "rejects and rolls back a batch whose own result violates a cross-entity rule",
    async () => {
      // The behaviour change. `kc:val:normative-claim-cited` is an error: a
      // cartridge header must not stand over an uncited claim. In loop the
      // header sees zero claims and passes; the batch then creates eight,
      // none of them cited, because a kc:CitesSource edge cannot exist in a
      // primitive batch. Before the settled pass this committed and reported
      // success.
      const { client, close } = await connect();
      try {
        await makeWorkbook(client);

        const primitives = [
          cartridgeEntry,
          ...Array.from({ length: 8 }, (_, i) => diagnosticEntry(i + 1)),
        ];
        const env = envelope(
          await client.callTool({
            name: "fdpm.primitive.create_batch",
            arguments: { workbook_id: WB, primitives },
          }),
        );

        // Rejected, not errored: the documented ok:false / isError:false pair.
        expect(env.ok).toBe(false);
        expect(env.validation_reports).toBeUndefined();
        const findings = env.validation_report!.findings;
        const cited = findings.find((f) => f.rule_id === "kc:val:normative-claim-cited");
        expect(cited, JSON.stringify(findings)).toBeDefined();
        expect(cited!.level).toBe("error");
        expect(cited!.message).toContain("8 normative claim(s)");

        // Rolled back whole: not one of the nine entries is in the workbook.
        const listed = await client.callTool({
          name: "fdpm.primitive.search",
          arguments: { workbook_id: WB, limit: 50 },
        });
        const results = (listed as { structuredContent?: { results?: unknown[] } })
          .structuredContent?.results;
        expect(results ?? []).toHaveLength(0);

        // And no entry reached the log either: rollback happens before
        // persistence, so the log still holds only the workbook.create that
        // opened it.
        const kinds = readFileSync(join(dataDir, "workbooks", WB, "log.jsonl"), "utf8")
          .split("\n")
          .filter((l) => l.trim().length > 0)
          .map((l) => (JSON.parse(l) as { kind: string }).kind);
        expect(kinds).toEqual(["workbook.create"]);
      } finally {
        await close();
      }
    },
    TIMEOUT_MS,
  );
});
