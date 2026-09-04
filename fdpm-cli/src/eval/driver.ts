/**
 * The model driver — one bounded agentic loop per instruction.
 *
 * VERIFICATION BOUNDARY REQUIRED (Silent Acceptance v2.0.0):
 * LLM error rates are non-negligible across realistic deployments.
 * Passing LLM output onward with no declared verification boundary is a
 * design defect, not a runtime bug. All LLM output must be treated as
 * untrusted and validated explicitly, per error class.
 *
 * SILENT_ACCEPTANCE_VERSION: 2.0.0
 * MODEL_VERSION: pinned per run in `RunConfig.driver.model` and recorded
 *   in the receipt; the driver has no default model of its own.
 * VERIFIER_LOCATION: this module (typed parse of every tool_use block,
 *   bounds) and `score.ts` (the terminal state is read from the Host and
 *   the operation log, never from the model's text). Neither is writable
 *   by the agent: the agent reaches the workbook only through `fdpm-mcp`.
 *
 * The five controls, and where each one lives:
 *   1. Typed parse — `ToolUseInput` rejects a `tool_use.input` that is not
 *      a JSON object; the tool name must be in the surface.
 *   2. Semantic validation — the server validates every write against the
 *      profile; the scorer validates the terminal state against the
 *      instruction's assertions.
 *   3. Defined failure path — a bad block becomes an `is_error` tool
 *      result; an API failure is classified and either retried (bounded)
 *      or terminal with a named reason. Nothing is coerced.
 *   4. Failure-path tests — `tests/eval/driver.test.ts` feeds malformed
 *      inputs, unknown tools, endless tool loops and API errors.
 *   5. Deterministic bounds — turns, tool calls, wall clock and retries
 *      are owned by `DriveBounds`; the model cannot extend them.
 *
 * Error classes not covered by this boundary: ERR_HALLUCINATION and
 * ERR_SEMANTIC in the model's final text — the text is recorded for the
 * transcript and never scored. Mitigation: scoring reads state, not prose.
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { ToolSurface } from "./arms.js";

export interface ModelClient {
  readonly model: string;
  createTurn(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
}

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface AnthropicModelClientOptions {
  model: string;
  effort?: Effort;
  client?: Anthropic;
}

/**
 * The production client. Thinking is adaptive on every model this eval
 * is meant to run on (Claude 4.6+); `effort` is passed through when set.
 *
 * Server-side refusal fallbacks are deliberately NOT enabled: a fallback
 * would let a different model answer part of a run, and the eval's
 * premise is one model snapshot per run. A refusal is a terminal reason
 * and scores as a failure.
 */
export function anthropicModelClient(opts: AnthropicModelClientOptions): ModelClient {
  const client = opts.client ?? new Anthropic();
  return {
    model: opts.model,
    async createTurn(params) {
      const withThinking: Anthropic.MessageCreateParamsNonStreaming = {
        ...params,
        thinking: { type: "adaptive" },
        ...(opts.effort !== undefined && { output_config: { effort: opts.effort } }),
      };
      return client.messages.create(withThinking);
    },
  };
}

export interface DriveBounds {
  /** Model turns (API calls that returned) per instruction. */
  max_turns: number;
  /** Tool calls executed per instruction, across all turns. */
  max_tool_calls: number;
  /** Wall-clock budget per instruction. */
  max_wall_ms: number;
  /** `max_tokens` per turn. */
  max_tokens_per_turn: number;
  /** Retries on retryable API errors (429, 5xx, connection) per turn. */
  api_retries: number;
  /** Base backoff between retries; doubles each time. */
  retry_backoff_ms: number;
  /** Characters of a tool result handed back to the model. */
  max_result_chars: number;
}

export const DEFAULT_BOUNDS: DriveBounds = {
  max_turns: 40,
  max_tool_calls: 60,
  max_wall_ms: 15 * 60_000,
  max_tokens_per_turn: 16_000,
  api_retries: 3,
  retry_backoff_ms: 2_000,
  max_result_chars: 24_000,
};

export interface ToolExecutionResult {
  /** The text handed back to the model. */
  text: string;
  /** Marks the tool_result block `is_error`. */
  is_error: boolean;
}

export type ToolExecutor = (name: string, input: Record<string, unknown>) => Promise<ToolExecutionResult>;

export interface TranscriptToolCall {
  turn: number;
  name: string;
  input: unknown;
  /** False when the block failed the typed parse or named an unknown tool. */
  accepted: boolean;
  is_error: boolean;
  result_excerpt: string;
  duration_ms: number;
}

export type TerminalReason =
  | "end_turn"
  | "stop_sequence"
  | "max_turns"
  | "max_tool_calls"
  | "max_wall_ms"
  | "max_tokens"
  | "refusal"
  | "context_window_exceeded"
  | "api_error";

export interface DriveUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

export interface DriveTranscript {
  model: string;
  turns: number;
  tool_calls: TranscriptToolCall[];
  terminal: TerminalReason;
  /** The model's last text block(s); recorded, never scored. */
  final_text: string;
  usage: DriveUsage;
  api_errors: string[];
  wall_ms: number;
}

export interface DriveOptions {
  model: ModelClient;
  surface: ToolSurface;
  instruction: string;
  execute: ToolExecutor;
  bounds?: Partial<DriveBounds>;
  /** Injectable clock and sleeper so tests are deterministic. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/** Control 1: a tool_use input is a JSON object or it is rejected. */
export const ToolUseInput = z.record(z.string(), z.unknown());

function isRetryable(err: unknown): boolean {
  return (
    err instanceof Anthropic.RateLimitError ||
    err instanceof Anthropic.InternalServerError ||
    err instanceof Anthropic.APIConnectionError
  );
}

function describeError(err: unknown): string {
  if (err instanceof Anthropic.APIError) {
    return `${err.constructor.name}${err.status !== undefined ? ` ${err.status}` : ""}: ${err.message}`;
  }
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

function excerpt(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}… [truncated ${text.length - max} chars]`;
}

export async function driveInstruction(opts: DriveOptions): Promise<DriveTranscript> {
  const bounds: DriveBounds = { ...DEFAULT_BOUNDS, ...opts.bounds };
  const now = opts.now ?? (() => Date.now());
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const started = now();

  const tools: Anthropic.Tool[] = opts.surface.tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as Anthropic.Tool.InputSchema,
  }));
  const known = new Set(opts.surface.tools.map((t) => t.name));
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: opts.instruction }];

  const transcript: DriveTranscript = {
    model: opts.model.model,
    turns: 0,
    tool_calls: [],
    terminal: "max_turns",
    final_text: "",
    usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    api_errors: [],
    wall_ms: 0,
  };
  const finish = (terminal: TerminalReason): DriveTranscript => {
    transcript.terminal = terminal;
    transcript.wall_ms = now() - started;
    return transcript;
  };

  while (transcript.turns < bounds.max_turns) {
    if (now() - started > bounds.max_wall_ms) return finish("max_wall_ms");

    // One turn, with bounded retries on retryable failures only.
    let response: Anthropic.Message | undefined;
    for (let attempt = 0; attempt <= bounds.api_retries; attempt += 1) {
      try {
        response = await opts.model.createTurn({
          model: opts.model.model,
          max_tokens: bounds.max_tokens_per_turn,
          system: opts.surface.system,
          tools,
          messages,
        });
        break;
      } catch (err) {
        transcript.api_errors.push(describeError(err));
        if (!isRetryable(err) || attempt === bounds.api_retries) return finish("api_error");
        await sleep(bounds.retry_backoff_ms * 2 ** attempt);
      }
    }
    if (response === undefined) return finish("api_error");

    transcript.turns += 1;
    transcript.usage.input_tokens += response.usage.input_tokens;
    transcript.usage.output_tokens += response.usage.output_tokens;
    transcript.usage.cache_read_input_tokens += response.usage.cache_read_input_tokens ?? 0;
    transcript.usage.cache_creation_input_tokens += response.usage.cache_creation_input_tokens ?? 0;

    const texts = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text);
    if (texts.length > 0) transcript.final_text = texts.join("\n");

    // The full assistant content (thinking blocks included) goes back
    // unchanged; editing it would invalidate the turn on current models.
    messages.push({ role: "assistant", content: response.content });

    switch (response.stop_reason) {
      case "end_turn":
        return finish("end_turn");
      case "stop_sequence":
        return finish("stop_sequence");
      case "max_tokens":
        return finish("max_tokens");
      case "refusal":
        return finish("refusal");
      case "model_context_window_exceeded":
        return finish("context_window_exceeded");
      case "pause_turn":
        // No server tools are declared, so this is not expected; resuming
        // is the documented handling and costs one turn of the budget.
        continue;
      case "tool_use":
      default:
        break;
    }

    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (toolUses.length === 0) {
      // stop_reason said tool_use but no block came: treat as the model's
      // final word rather than looping on nothing.
      return finish("end_turn");
    }

    const results: Anthropic.ToolResultBlockParam[] = [];
    let exhausted = false;
    for (const block of toolUses) {
      if (transcript.tool_calls.length >= bounds.max_tool_calls) {
        exhausted = true;
        results.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: "tool-call budget exhausted; the run is being stopped",
          is_error: true,
        });
        continue;
      }
      const t0 = now();
      const parsed = ToolUseInput.safeParse(block.input);
      if (!parsed.success) {
        const text = `tool input must be a JSON object: ${parsed.error.issues.map((i) => i.message).join("; ")}`;
        transcript.tool_calls.push({
          turn: transcript.turns,
          name: block.name,
          input: block.input,
          accepted: false,
          is_error: true,
          result_excerpt: text,
          duration_ms: now() - t0,
        });
        results.push({ type: "tool_result", tool_use_id: block.id, content: text, is_error: true });
        continue;
      }
      if (!known.has(block.name)) {
        const text = `unknown tool ${block.name}; available: ${[...known].join(", ")}`;
        transcript.tool_calls.push({
          turn: transcript.turns,
          name: block.name,
          input: parsed.data,
          accepted: false,
          is_error: true,
          result_excerpt: text,
          duration_ms: now() - t0,
        });
        results.push({ type: "tool_result", tool_use_id: block.id, content: text, is_error: true });
        continue;
      }
      let outcome: ToolExecutionResult;
      try {
        outcome = await opts.execute(block.name, parsed.data);
      } catch (err) {
        outcome = { text: `tool execution failed: ${describeError(err)}`, is_error: true };
      }
      const text = excerpt(outcome.text, bounds.max_result_chars);
      transcript.tool_calls.push({
        turn: transcript.turns,
        name: block.name,
        input: parsed.data,
        accepted: true,
        is_error: outcome.is_error,
        result_excerpt: excerpt(text, 400),
        duration_ms: now() - t0,
      });
      results.push({ type: "tool_result", tool_use_id: block.id, content: text, is_error: outcome.is_error });
    }
    // All tool results for a turn go back in ONE user message.
    messages.push({ role: "user", content: results });
    if (exhausted) return finish("max_tool_calls");
  }
  return finish("max_turns");
}
