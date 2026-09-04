/**
 * The driver's verification boundary, exercised with malformed, adversarial
 * and endless model output. A fake ModelClient scripts the turns; the
 * executor is a spy. No network.
 */
import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { ARMS, buildToolSurface, type ToolSurface } from "../../src/eval/arms.js";
import { driveInstruction, type ModelClient, type ToolExecutor } from "../../src/eval/driver.js";

const SURFACE: ToolSurface = buildToolSurface(ARMS.tools, {
  instructions: undefined,
  tools: [
    { name: "fdpm.workbook.list", description: "list", inputSchema: { type: "object" } },
    { name: "fdpm.primitive.create", description: "create", inputSchema: { type: "object" } },
  ],
});

type Block = Anthropic.ContentBlock;

function msg(content: Block[], stop_reason: Anthropic.StopReason): Anthropic.Message {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "fake",
    content,
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 3, cache_creation_input_tokens: 0 },
  } as unknown as Anthropic.Message;
}

function text(t: string): Block {
  return { type: "text", text: t, citations: null } as Block;
}

function toolUse(name: string, input: unknown, id = "tu_1"): Block {
  return { type: "tool_use", id, name, input } as Block;
}

interface Scripted extends ModelClient {
  calls: Anthropic.MessageCreateParamsNonStreaming[];
}

/** Each entry is either a message to return or an error to throw. */
function scripted(steps: Array<Anthropic.Message | Error | (() => Anthropic.Message)>): Scripted {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
  let i = 0;
  return {
    model: "fake-model",
    calls,
    async createTurn(params) {
      // Snapshot: the driver keeps appending to the same messages array.
      calls.push({ ...params, messages: params.messages.map((m) => ({ ...m })) });
      const step = steps[Math.min(i, steps.length - 1)]!;
      i += 1;
      if (step instanceof Error) throw step;
      return typeof step === "function" ? step() : step;
    },
  };
}

function spyExecutor(reply = "ok"): { execute: ToolExecutor; seen: Array<{ name: string; input: unknown }> } {
  const seen: Array<{ name: string; input: unknown }> = [];
  return {
    seen,
    execute: async (name, input) => {
      seen.push({ name, input });
      return { text: reply, is_error: false };
    },
  };
}

const noSleep = async () => {};

describe("driver — happy path", () => {
  it("executes a tool call, feeds the result back in one user message, and stops on end_turn", async () => {
    const model = scripted([
      msg([toolUse("fdpm.workbook.list", {})], "tool_use"),
      msg([text("Done: one workbook.")], "end_turn"),
    ]);
    const spy = spyExecutor('{"workbooks":[]}');
    const t = await driveInstruction({ model, surface: SURFACE, instruction: "List workbooks.", execute: spy.execute, sleep: noSleep });
    expect(t.terminal).toBe("end_turn");
    expect(t.turns).toBe(2);
    expect(spy.seen).toEqual([{ name: "fdpm.workbook.list", input: {} }]);
    expect(t.tool_calls).toHaveLength(1);
    expect(t.tool_calls[0]).toMatchObject({ name: "fdpm.workbook.list", accepted: true, is_error: false });
    expect(t.final_text).toBe("Done: one workbook.");
    expect(t.usage.input_tokens).toBe(20);
    expect(t.usage.cache_read_input_tokens).toBe(6);
    // Second request carries: instruction, assistant turn, ONE user message with the tool result.
    const second = model.calls[1]!;
    expect(second.messages).toHaveLength(3);
    expect(second.messages[2]!.role).toBe("user");
    expect(second.system).toBe(SURFACE.system);
    expect(second.tools?.map((x) => (x as Anthropic.Tool).name)).toEqual(SURFACE.tools.map((x) => x.name));
  });

  it("returns every result of a multi-tool turn in a single user message", async () => {
    const model = scripted([
      msg([toolUse("fdpm.workbook.list", {}, "a"), toolUse("fdpm.workbook.list", {}, "b")], "tool_use"),
      msg([text("done")], "end_turn"),
    ]);
    const spy = spyExecutor();
    await driveInstruction({ model, surface: SURFACE, instruction: "x", execute: spy.execute, sleep: noSleep });
    const userMsg = model.calls[1]!.messages[2]!;
    expect(Array.isArray(userMsg.content)).toBe(true);
    expect((userMsg.content as unknown[]).length).toBe(2);
    expect(spy.seen).toHaveLength(2);
  });
});

describe("driver — control 1 and 3: typed parse and the failure path", () => {
  it("rejects a tool_use whose input is not an object, without calling the executor", async () => {
    const model = scripted([
      msg([toolUse("fdpm.primitive.create", "not-an-object")], "tool_use"),
      msg([text("stopping")], "end_turn"),
    ]);
    const spy = spyExecutor();
    const t = await driveInstruction({ model, surface: SURFACE, instruction: "x", execute: spy.execute, sleep: noSleep });
    expect(spy.seen).toHaveLength(0);
    expect(t.tool_calls[0]).toMatchObject({ accepted: false, is_error: true });
    expect(t.tool_calls[0]!.result_excerpt).toContain("must be a JSON object");
    const result = (model.calls[1]!.messages[2]!.content as Anthropic.ToolResultBlockParam[])[0]!;
    expect(result.is_error).toBe(true);
  });

  it("rejects a tool the arm does not expose, naming the available ones", async () => {
    const model = scripted([
      msg([toolUse("fdpm.profile.type_info", { profile_id: "p", type_id: "t" })], "tool_use"),
      msg([text("ok")], "end_turn"),
    ]);
    const spy = spyExecutor();
    const t = await driveInstruction({ model, surface: SURFACE, instruction: "x", execute: spy.execute, sleep: noSleep });
    expect(spy.seen).toHaveLength(0);
    expect(t.tool_calls[0]!.result_excerpt).toContain("unknown tool fdpm.profile.type_info");
    expect(t.tool_calls[0]!.result_excerpt).toContain("fdpm.workbook.list");
  });

  it("turns an executor exception into an is_error result and keeps going", async () => {
    const model = scripted([
      msg([toolUse("fdpm.workbook.list", {})], "tool_use"),
      msg([text("ok")], "end_turn"),
    ]);
    const execute: ToolExecutor = async () => {
      throw new Error("boom");
    };
    const t = await driveInstruction({ model, surface: SURFACE, instruction: "x", execute, sleep: noSleep });
    expect(t.terminal).toBe("end_turn");
    expect(t.tool_calls[0]).toMatchObject({ accepted: true, is_error: true });
    expect(t.tool_calls[0]!.result_excerpt).toContain("boom");
  });

  it("truncates oversized tool results before they reach the model", async () => {
    const model = scripted([
      msg([toolUse("fdpm.workbook.list", {})], "tool_use"),
      msg([text("ok")], "end_turn"),
    ]);
    const spy = spyExecutor("x".repeat(5_000));
    await driveInstruction({
      model,
      surface: SURFACE,
      instruction: "x",
      execute: spy.execute,
      bounds: { max_result_chars: 100 },
      sleep: noSleep,
    });
    const result = (model.calls[1]!.messages[2]!.content as Anthropic.ToolResultBlockParam[])[0]!;
    expect(String(result.content)).toContain("[truncated 4900 chars]");
    expect(String(result.content).length).toBeLessThan(200);
  });
});

describe("driver — control 5: bounds are owned by code", () => {
  it("stops an endless tool loop at max_turns", async () => {
    const model = scripted([msg([toolUse("fdpm.workbook.list", {})], "tool_use")]);
    const spy = spyExecutor();
    const t = await driveInstruction({
      model,
      surface: SURFACE,
      instruction: "x",
      execute: spy.execute,
      bounds: { max_turns: 4, max_tool_calls: 100 },
      sleep: noSleep,
    });
    expect(t.terminal).toBe("max_turns");
    expect(t.turns).toBe(4);
    expect(spy.seen).toHaveLength(4);
  });

  it("stops at max_tool_calls even when the turn budget remains", async () => {
    const model = scripted([
      msg([toolUse("fdpm.workbook.list", {}, "a"), toolUse("fdpm.workbook.list", {}, "b"), toolUse("fdpm.workbook.list", {}, "c")], "tool_use"),
    ]);
    const spy = spyExecutor();
    const t = await driveInstruction({
      model,
      surface: SURFACE,
      instruction: "x",
      execute: spy.execute,
      bounds: { max_turns: 10, max_tool_calls: 2 },
      sleep: noSleep,
    });
    expect(t.terminal).toBe("max_tool_calls");
    expect(spy.seen).toHaveLength(2);
    expect(t.tool_calls).toHaveLength(2);
  });

  it("stops on the wall clock", async () => {
    let clock = 0;
    const model = scripted([msg([toolUse("fdpm.workbook.list", {})], "tool_use")]);
    const spy = spyExecutor();
    const t = await driveInstruction({
      model,
      surface: SURFACE,
      instruction: "x",
      execute: spy.execute,
      bounds: { max_wall_ms: 1_000, max_turns: 100 },
      now: () => {
        clock += 600;
        return clock;
      },
      sleep: noSleep,
    });
    expect(t.terminal).toBe("max_wall_ms");
    expect(t.turns).toBeLessThan(5);
  });

  it("records the model's own terminal reasons: max_tokens and refusal", async () => {
    const spy = spyExecutor();
    const a = await driveInstruction({ model: scripted([msg([text("…")], "max_tokens")]), surface: SURFACE, instruction: "x", execute: spy.execute, sleep: noSleep });
    expect(a.terminal).toBe("max_tokens");
    const b = await driveInstruction({ model: scripted([msg([], "refusal")]), surface: SURFACE, instruction: "x", execute: spy.execute, sleep: noSleep });
    expect(b.terminal).toBe("refusal");
    expect(spy.seen).toHaveLength(0);
  });
});

describe("driver — API failures are classified, retried within bounds, then terminal", () => {
  function rateLimit(): Anthropic.RateLimitError {
    return new Anthropic.RateLimitError(429, { type: "error" }, "slow down", new Headers());
  }

  it("retries a 429 and succeeds", async () => {
    const sleeps: number[] = [];
    const model = scripted([rateLimit(), rateLimit(), msg([text("ok")], "end_turn")]);
    const t = await driveInstruction({
      model,
      surface: SURFACE,
      instruction: "x",
      execute: spyExecutor().execute,
      bounds: { api_retries: 3, retry_backoff_ms: 10 },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    expect(t.terminal).toBe("end_turn");
    expect(t.api_errors).toHaveLength(2);
    expect(sleeps).toEqual([10, 20]);
    expect(t.turns).toBe(1);
  });

  it("gives up after the retry budget", async () => {
    const model = scripted([rateLimit()]);
    const t = await driveInstruction({
      model,
      surface: SURFACE,
      instruction: "x",
      execute: spyExecutor().execute,
      bounds: { api_retries: 2, retry_backoff_ms: 1 },
      sleep: noSleep,
    });
    expect(t.terminal).toBe("api_error");
    expect(t.api_errors).toHaveLength(3);
    expect(model.calls).toHaveLength(3);
  });

  it("does not retry a 400", async () => {
    const bad = new Anthropic.BadRequestError(400, { type: "error" }, "bad request", new Headers());
    const model = scripted([bad]);
    const t = await driveInstruction({ model, surface: SURFACE, instruction: "x", execute: spyExecutor().execute, sleep: noSleep });
    expect(t.terminal).toBe("api_error");
    expect(model.calls).toHaveLength(1);
    expect(t.api_errors[0]).toContain("BadRequestError 400");
  });
});
