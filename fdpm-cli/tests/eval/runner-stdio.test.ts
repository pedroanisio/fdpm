/**
 * End to end over the real wire: a scripted model drives `fdpm-mcp`
 * through the runner, and the receipt on disk carries the score the
 * scorer computed from the Host — not from anything the model said.
 */
import Anthropic from "@anthropic-ai/sdk";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ModelClient } from "../../src/eval/driver.js";
import { runEval, type RunReceipt } from "../../src/eval/runner.js";
import { parseTestSet } from "../../src/eval/schema.js";
import { META_TOOL_READ_RESOURCE } from "../../src/eval/arms.js";

const TIMEOUT_MS = 240_000;
const PROFILE = "profile:planning:0.1";

const SET = parseTestSet({
  schema_version: "1.0.0",
  id: "stdio-mini",
  title: "mini",
  profile_id: PROFILE,
  generated_by: "test",
  instructions: [
    {
      id: "mini-create",
      category: "simple",
      profile_id: PROFILE,
      workbook_id: "wb-mini-create",
      setup: [{ tool: "fdpm.workbook.create", args: { workbook_id: "wb-mini-create", name: "Mini", profile_id: PROFILE } }],
      instruction: "Create task:one.",
      expected: { assertions: [{ kind: "primitive_exists", id: "task:one", fields: { status: "Backlog" } }], destructive: { kinds: [] } },
      reference_solution: [
        {
          tool: "fdpm.primitive.create",
          args: {
            workbook_id: "wb-mini-create",
            primitive: { id: "task:one", type_id: "plan:Task", field_values: { name: "One", summary: "One.", kind: "Implementation", executor_kind: "Human", status: "Backlog", priority: "P2", is_root: true } },
          },
        },
      ],
    },
    {
      id: "mini-refuse",
      category: "refusal",
      profile_id: PROFILE,
      workbook_id: "wb-mini-refuse",
      setup: [{ tool: "fdpm.workbook.create", args: { workbook_id: "wb-mini-refuse", name: "Mini R", profile_id: PROFILE } }],
      instruction: "Email the team.",
      expected: { assertions: [{ kind: "workbook_exists" }], max_new_operations: 0, destructive: { kinds: [] } },
      reference_solution: [],
    },
    {
      id: "mini-bad-setup",
      category: "simple",
      profile_id: PROFILE,
      workbook_id: "wb-mini-bad",
      setup: [
        { tool: "fdpm.workbook.create", args: { workbook_id: "wb-mini-bad", name: "Bad", profile_id: PROFILE } },
        { tool: "fdpm.primitive.create", args: { workbook_id: "wb-mini-bad", primitive: { id: "task:x", type_id: "plan:NoSuchType", field_values: {} } } },
      ],
      instruction: "unreachable",
      expected: { assertions: [], destructive: { kinds: [] } },
      reference_solution: [{ tool: "fdpm.primitive.patch", args: {} }],
    },
  ],
});

let outDir: string;
beforeEach(() => {
  outDir = mkdtempSync(join(tmpdir(), "fdpm-eval-out-"));
});
afterEach(() => {
  rmSync(outDir, { recursive: true, force: true });
});

type Block = Anthropic.ContentBlock;
function msg(content: Block[], stop_reason: Anthropic.StopReason): Anthropic.Message {
  return {
    id: "m",
    type: "message",
    role: "assistant",
    model: "scripted",
    content,
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  } as unknown as Anthropic.Message;
}

/**
 * A model that behaves: reads the guide when it can, creates task:one with
 * a valid payload, and does nothing for the refusal instruction.
 */
function scriptedModel(): ModelClient {
  return {
    model: "scripted-model",
    async createTurn(params) {
      const first = params.messages[0]!;
      const instruction = typeof first.content === "string" ? first.content : "";
      const priorToolCalls = params.messages.filter((m) => m.role === "assistant").length;
      const toolNames = (params.tools ?? []).map((t) => (t as Anthropic.Tool).name);
      if (instruction.startsWith("Email")) return msg([{ type: "text", text: "I cannot send email; nothing changed.", citations: null } as Block], "end_turn");
      if (priorToolCalls === 0 && toolNames.includes(META_TOOL_READ_RESOURCE)) {
        return msg([{ type: "tool_use", id: "t0", name: META_TOOL_READ_RESOURCE, input: { uri: "fdpm://guide" } } as Block], "tool_use");
      }
      if (priorToolCalls <= 1) {
        return msg(
          [
            {
              type: "tool_use",
              id: "t1",
              name: "fdpm.primitive.create",
              input: {
                workbook_id: "wb-mini-create",
                primitive: { id: "task:one", type_id: "plan:Task", field_values: { name: "One", summary: "One.", kind: "Implementation", executor_kind: "Human", status: "Backlog", priority: "P2", is_root: true } },
              },
            } as Block,
          ],
          "tool_use",
        );
      }
      return msg([{ type: "text", text: "Created task:one.", citations: null } as Block], "end_turn");
    },
  };
}

describe("runner over stdio", () => {
  it(
    "drives a scripted model through the real server and writes a scored receipt",
    async () => {
      const receipt = await runEval({
        testSet: SET,
        arms: ["tools_discovery"],
        driver: { kind: "model", client: scriptedModel() },
        outDir,
        runId: "test-run",
        now: () => 0,
      });
      expect(receipt.run_id).toBe("test-run");
      expect(receipt.model).toBe("scripted-model");
      expect(receipt.results).toHaveLength(3);

      const create = receipt.results.find((r) => r.instruction_id === "mini-create")!;
      expect(create.status).toBe("scored");
      expect(create.score?.passed, JSON.stringify(create.score?.criteria)).toBe(true);
      expect(create.score?.metrics).toMatchObject({ writes: 1, baseline_writes: 1, resource_reads: 1 });
      expect(create.transcript.terminal).toBe("end_turn");

      const refuse = receipt.results.find((r) => r.instruction_id === "mini-refuse")!;
      expect(refuse.status).toBe("scored");
      expect(refuse.score?.passed).toBe(true);
      expect(refuse.score?.metrics.new_operations).toBe(0);

      const bad = receipt.results.find((r) => r.instruction_id === "mini-bad-setup")!;
      expect(bad.status).toBe("invalid_setup");
      expect(bad.error).toContain("plan:NoSuchType");

      const onDisk = JSON.parse(readFileSync(join(outDir, "receipt.json"), "utf8")) as RunReceipt;
      expect(onDisk.report.arms[0]!.first_try_success_rate).toBeCloseTo(2 / 3);
      expect(onDisk.report.arms[0]!.invalid_setup).toBe(1);
      expect(existsSync(join(outDir, "transcripts", "tools_discovery", "mini-create.json"))).toBe(true);
      expect(onDisk.test_set.sha256).toMatch(/^[0-9a-f]{64}$/);
    },
    TIMEOUT_MS,
  );

  it(
    "the reference driver reproduces the baseline through the same pipeline",
    async () => {
      const receipt = await runEval({
        testSet: SET,
        arms: ["tools"],
        driver: { kind: "reference" },
        outDir,
        filter: { ids: ["mini-create", "mini-refuse"] },
      });
      expect(receipt.driver).toBe("reference");
      expect(receipt.results.map((r) => r.score?.passed)).toEqual([true, true]);
      expect(receipt.results[0]!.score?.metrics.writes).toBe(1);
      expect(receipt.results[1]!.transcript.tool_calls).toBe(0);
    },
    TIMEOUT_MS,
  );
});
