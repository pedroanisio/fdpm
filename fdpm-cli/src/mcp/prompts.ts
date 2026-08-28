/**
 * MCP prompts — shaping, validation, and the skill contract
 * (SPEC-MCP-SERVER §13.5).
 *
 * A prompt is a skill: reusable procedural knowledge about WHEN to use
 * a set of tools, in what ORDER, and how to handle FAILURES. Two rules
 * from the corpus become code here:
 *
 *   - "context, not just templates": the rendered body MUST carry the
 *     three sections in `PROMPT_REQUIRED_SECTIONS`, and the listing
 *     description MUST say when to use the prompt;
 *   - progressive disclosure: `prompts/list` carries metadata only
 *     (capped at `PROMPT_LISTING_BUDGET_BYTES` per entry); the body is
 *     rendered on `prompts/get` and capped at `PROMPT_BODY_BUDGET_BYTES`.
 *
 * ARCHITECTURAL REQUIREMENT (PALS's LAW): a plugin's render function is
 * untrusted output. `renderPrompt` resolves and type-checks arguments,
 * catches render failures, and validates the body before anything
 * reaches the client.
 */

import { FDPMException } from "../core/errors/fdpm-exception.js";
import type { PromptMessage, PromptRegistration } from "../plugin/types.js";

export const PROMPT_ID_PATTERN = /^[a-z][a-z0-9_-]*\/[a-z][a-z0-9_]*$/;
export const PROMPT_ARG_NAME_PATTERN = /^[a-z_][a-z0-9_]*$/;
export const PROMPT_TITLE_MAX = 80;
export const PROMPT_DESCRIPTION_MIN = 40;
export const PROMPT_DESCRIPTION_MAX = 300;
export const PROMPT_LISTING_BUDGET_BYTES = 600;
export const PROMPT_BODY_BUDGET_BYTES = 16_384;
export const PROMPT_REQUIRED_SECTIONS = ["When to use", "Call order", "Failure modes"] as const;

export interface PromptListEntry {
  name: string;
  title: string;
  description: string;
  arguments: Array<{ name: string; description: string; required: boolean }>;
}

export interface RenderedPrompt {
  description: string;
  messages: PromptMessage[];
}

function invalid(promptId: string, problem: string): FDPMException {
  return new FDPMException("validation", `prompt ${promptId}: ${problem} (prompt_invalid)`, {
    evidence: { reason: "prompt_invalid", prompt: promptId, problem },
  });
}

export function promptListEntry(reg: PromptRegistration): PromptListEntry {
  return {
    name: reg.promptId,
    title: reg.title,
    description: reg.description,
    arguments: reg.arguments.map((a) => ({
      name: a.name,
      description: a.description,
      required: a.required === true,
    })),
  };
}

export function listingBytes(reg: PromptRegistration): number {
  return Buffer.byteLength(JSON.stringify(promptListEntry(reg)), "utf8");
}

/** The skill contract at registration time. Throws `validation` / `prompt_invalid`. */
export function validatePromptRegistration(reg: PromptRegistration): void {
  const id = typeof reg?.promptId === "string" ? reg.promptId : "<unnamed>";
  if (typeof reg !== "object" || reg === null) throw invalid(id, "registration must be an object");
  if (!PROMPT_ID_PATTERN.test(id)) {
    throw invalid(id, `promptId must match ${PROMPT_ID_PATTERN} (<plugin>/<slug>)`);
  }
  if (typeof reg.title !== "string" || reg.title.trim().length === 0 || reg.title.length > PROMPT_TITLE_MAX) {
    throw invalid(id, `title must be 1..${PROMPT_TITLE_MAX} characters`);
  }
  if (
    typeof reg.description !== "string" ||
    reg.description.length < PROMPT_DESCRIPTION_MIN ||
    reg.description.length > PROMPT_DESCRIPTION_MAX
  ) {
    throw invalid(
      id,
      `description must be ${PROMPT_DESCRIPTION_MIN}..${PROMPT_DESCRIPTION_MAX} characters and say when to use the prompt`,
    );
  }
  if (!Array.isArray(reg.arguments)) throw invalid(id, "arguments must be an array");
  const seen = new Set<string>();
  for (const a of reg.arguments) {
    if (typeof a?.name !== "string" || !PROMPT_ARG_NAME_PATTERN.test(a.name)) {
      throw invalid(id, `argument name ${JSON.stringify(a?.name)} must match ${PROMPT_ARG_NAME_PATTERN}`);
    }
    if (seen.has(a.name)) throw invalid(id, `duplicate argument ${a.name}`);
    seen.add(a.name);
    if (typeof a.description !== "string" || a.description.trim().length === 0) {
      throw invalid(id, `argument ${a.name} needs a description`);
    }
  }
  if (typeof reg.render !== "function") throw invalid(id, "render must be a function");
  const bytes = listingBytes(reg);
  if (bytes > PROMPT_LISTING_BUDGET_BYTES) {
    throw invalid(id, `listing entry is ${bytes} B, budget ${PROMPT_LISTING_BUDGET_BYTES} B`);
  }
}

/** Resolve caller-provided arguments against the declaration. */
export function resolvePromptArgs(
  reg: PromptRegistration,
  provided: Record<string, unknown> | undefined,
): Record<string, string> {
  const input = provided ?? {};
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new FDPMException("validation", `prompt ${reg.promptId}: arguments must be an object (prompt_argument_invalid)`, {
      evidence: { reason: "prompt_argument_invalid", prompt: reg.promptId },
    });
  }
  const declared = new Map(reg.arguments.map((a) => [a.name, a]));
  for (const key of Object.keys(input)) {
    if (!declared.has(key)) {
      throw new FDPMException("validation", `prompt ${reg.promptId}: unknown argument ${JSON.stringify(key)} (prompt_argument_unknown)`, {
        evidence: { reason: "prompt_argument_unknown", prompt: reg.promptId, argument: key },
      });
    }
  }
  const out: Record<string, string> = {};
  for (const a of reg.arguments) {
    const v = input[a.name];
    if (v === undefined) {
      if (a.required === true) {
        throw new FDPMException("validation", `prompt ${reg.promptId}: missing required argument ${JSON.stringify(a.name)} (prompt_argument_missing)`, {
          evidence: { reason: "prompt_argument_missing", prompt: reg.promptId, argument: a.name },
        });
      }
      continue;
    }
    if (typeof v !== "string") {
      throw new FDPMException("validation", `prompt ${reg.promptId}: argument ${JSON.stringify(a.name)} must be a string (prompt_argument_invalid)`, {
        evidence: { reason: "prompt_argument_invalid", prompt: reg.promptId, argument: a.name },
      });
    }
    out[a.name] = v;
  }
  return out;
}

function bodyInvalid(problem: string): FDPMException {
  return new FDPMException("verification", `prompt body rejected: ${problem} (prompt_body_invalid)`, {
    evidence: { reason: "prompt_body_invalid", problem },
  });
}

/** The skill contract on the rendered body. Throws `verification` / `prompt_body_invalid`. */
export function validatePromptBody(messages: unknown): PromptMessage[] {
  if (!Array.isArray(messages) || messages.length === 0) throw bodyInvalid("messages must be a non-empty array");
  const texts: string[] = [];
  for (const m of messages as unknown[]) {
    if (typeof m !== "object" || m === null) throw bodyInvalid("message must be an object");
    const msg = m as { role?: unknown; content?: { type?: unknown; text?: unknown } };
    if (msg.role !== "user" && msg.role !== "assistant") throw bodyInvalid(`role must be user|assistant, got ${String(msg.role)}`);
    if (typeof msg.content !== "object" || msg.content === null || msg.content.type !== "text") {
      throw bodyInvalid("content must be { type: \"text\", text }");
    }
    if (typeof msg.content.text !== "string" || msg.content.text.trim().length === 0) {
      throw bodyInvalid("content.text must be a non-empty string");
    }
    texts.push(msg.content.text);
  }
  const joined = texts.join("\n").toLowerCase();
  for (const section of PROMPT_REQUIRED_SECTIONS) {
    if (!joined.includes(section.toLowerCase())) throw bodyInvalid(`missing section "${section}"`);
  }
  const bytes = Buffer.byteLength(texts.join("\n"), "utf8");
  if (bytes > PROMPT_BODY_BUDGET_BYTES) throw bodyInvalid(`body is ${bytes} B, budget ${PROMPT_BODY_BUDGET_BYTES} B`);
  return messages as PromptMessage[];
}

/** Resolve arguments, render, validate: the `prompts/get` pipeline. */
export async function renderPrompt(
  reg: PromptRegistration,
  provided: Record<string, unknown> | undefined,
): Promise<RenderedPrompt> {
  const args = resolvePromptArgs(reg, provided);
  let raw: unknown;
  try {
    raw = await reg.render({ args });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new FDPMException("internal", `prompt ${reg.promptId}: render failed: ${msg} (prompt_render_failed)`, {
      evidence: { reason: "prompt_render_failed", prompt: reg.promptId, message: msg },
    });
  }
  return { description: reg.description, messages: validatePromptBody(raw) };
}
