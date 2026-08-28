/**
 * SPEC-MCP-SERVER §13.5 — prompt shaping and the skill contract.
 *
 * A prompt is a skill: reusable procedural knowledge about WHEN to use
 * a set of tools, in what ORDER, and how to handle FAILURES. The
 * corpus is explicit that "context, not just templates" is what makes
 * prompt providers earn their keep, and that the agent should see only
 * metadata until it selects one (progressive disclosure, ~100 tokens).
 * These helpers enforce that as code, not convention:
 *
 *   - registration: namespaced id, description that states when to use
 *     (40..300 chars), well-formed unique argument names, listing entry
 *     within PROMPT_LISTING_BUDGET_BYTES;
 *   - rendering: required args present, unknown args rejected, strings
 *     only; the body MUST contain the three skill sections and stay
 *     within PROMPT_BODY_BUDGET_BYTES; plugin output is validated, never
 *     trusted (PALS's LAW).
 */
import { describe, expect, it } from "vitest";
import { FDPMException } from "../../src/core/errors/fdpm-exception.js";
import type { PromptRegistration } from "../../src/plugin/types.js";
import {
  PROMPT_BODY_BUDGET_BYTES,
  PROMPT_DESCRIPTION_MAX,
  PROMPT_DESCRIPTION_MIN,
  PROMPT_LISTING_BUDGET_BYTES,
  PROMPT_REQUIRED_SECTIONS,
  listingBytes,
  promptListEntry,
  renderPrompt,
  resolvePromptArgs,
  validatePromptBody,
  validatePromptRegistration,
} from "../../src/mcp/prompts.js";

const GOOD_BODY = [
  "# Triage",
  "## When to use",
  "At the start of an iteration.",
  "## Call order",
  "1. fdpm.workbook.get",
  "## Failure modes",
  "- stale_state: SIGHUP",
].join("\n");

function reg(over: Partial<PromptRegistration> = {}): PromptRegistration {
  return {
    promptId: "test/triage",
    title: "Triage",
    description: "Use at the start of an iteration to rank open tasks and surface blockers before assigning work.",
    arguments: [
      { name: "workbook_id", description: "Workbook to triage.", required: true },
      { name: "focus", description: "Optional substring filter on task names." },
    ],
    render: ({ args }) => [
      { role: "user", content: { type: "text", text: `${GOOD_BODY}\nworkbook=${args["workbook_id"]} focus=${args["focus"] ?? "-"}` } },
    ],
    ...over,
  };
}

function reason(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return (e as FDPMException).evidence?.["reason"] as string | undefined;
  }
  return undefined;
}

describe("validatePromptRegistration — the skill contract at registration", () => {
  it("accepts a well-formed registration", () => {
    expect(() => validatePromptRegistration(reg())).not.toThrow();
  });

  it("requires a namespaced id <plugin>/<slug>", () => {
    for (const bad of ["triage", "Test/triage", "test/Triage", "test/", "/triage", "test/tri age", "a/b/c"]) {
      expect(reason(() => validatePromptRegistration(reg({ promptId: bad }))), bad).toBe("prompt_invalid");
    }
  });

  it("requires a description that states when to use, within bounds", () => {
    expect(PROMPT_DESCRIPTION_MIN).toBe(40);
    expect(PROMPT_DESCRIPTION_MAX).toBe(300);
    expect(reason(() => validatePromptRegistration(reg({ description: "Triage tasks." })))).toBe("prompt_invalid");
    expect(reason(() => validatePromptRegistration(reg({ description: "x".repeat(301) })))).toBe("prompt_invalid");
    expect(reason(() => validatePromptRegistration(reg({ title: "" })))).toBe("prompt_invalid");
  });

  it("requires unique, well-formed argument names with descriptions", () => {
    expect(
      reason(() =>
        validatePromptRegistration(
          reg({ arguments: [{ name: "a", description: "x" }, { name: "a", description: "y" }] }),
        ),
      ),
    ).toBe("prompt_invalid");
    expect(reason(() => validatePromptRegistration(reg({ arguments: [{ name: "Bad-Name", description: "x" }] })))).toBe("prompt_invalid");
    expect(reason(() => validatePromptRegistration(reg({ arguments: [{ name: "ok", description: "" }] })))).toBe("prompt_invalid");
  });

  it("caps the listing entry (progressive disclosure: metadata only) at PROMPT_LISTING_BUDGET_BYTES", () => {
    expect(PROMPT_LISTING_BUDGET_BYTES).toBe(600);
    const fat = reg({
      arguments: Array.from({ length: 8 }, (_, i) => ({ name: `arg_${i}`, description: "d".repeat(70) })),
    });
    expect(listingBytes(fat)).toBeGreaterThan(PROMPT_LISTING_BUDGET_BYTES);
    expect(reason(() => validatePromptRegistration(fat))).toBe("prompt_invalid");
  });
});

describe("promptListEntry — the MCP prompts/list shape", () => {
  it("exposes name, title, description, arguments and nothing else", () => {
    const entry = promptListEntry(reg());
    expect(entry).toEqual({
      name: "test/triage",
      title: "Triage",
      description: reg().description,
      arguments: [
        { name: "workbook_id", description: "Workbook to triage.", required: true },
        { name: "focus", description: "Optional substring filter on task names.", required: false },
      ],
    });
    expect(listingBytes(reg())).toBe(Buffer.byteLength(JSON.stringify(entry), "utf8"));
  });
});

describe("resolvePromptArgs", () => {
  it("returns only declared args as strings; missing optional args are absent", () => {
    expect(resolvePromptArgs(reg(), { workbook_id: "wb" })).toEqual({ workbook_id: "wb" });
    expect(resolvePromptArgs(reg(), { workbook_id: "wb", focus: "auth" })).toEqual({ workbook_id: "wb", focus: "auth" });
  });

  it("rejects a missing required arg, an unknown arg, and a non-string value", () => {
    expect(reason(() => resolvePromptArgs(reg(), {}))).toBe("prompt_argument_missing");
    expect(reason(() => resolvePromptArgs(reg(), undefined))).toBe("prompt_argument_missing");
    expect(reason(() => resolvePromptArgs(reg(), { workbook_id: "wb", bogus: "1" }))).toBe("prompt_argument_unknown");
    expect(reason(() => resolvePromptArgs(reg(), { workbook_id: 7 as unknown as string }))).toBe("prompt_argument_invalid");
  });
});

describe("validatePromptBody — plugin output is untrusted", () => {
  it("accepts a body with the three skill sections", () => {
    expect(PROMPT_REQUIRED_SECTIONS).toEqual(["When to use", "Call order", "Failure modes"]);
    const msgs = [{ role: "user" as const, content: { type: "text" as const, text: GOOD_BODY } }];
    expect(validatePromptBody(msgs)).toEqual(msgs);
  });

  it("rejects empty, non-text, section-less, and oversized bodies", () => {
    expect(reason(() => validatePromptBody([]))).toBe("prompt_body_invalid");
    expect(
      reason(() => validatePromptBody([{ role: "user", content: { type: "image", data: "" } as never }])),
    ).toBe("prompt_body_invalid");
    expect(
      reason(() => validatePromptBody([{ role: "user", content: { type: "text", text: "## When to use\nonly one section" } }])),
    ).toBe("prompt_body_invalid");
    expect(PROMPT_BODY_BUDGET_BYTES).toBe(16_384);
    const huge = GOOD_BODY + "\n" + "x".repeat(PROMPT_BODY_BUDGET_BYTES);
    expect(reason(() => validatePromptBody([{ role: "user", content: { type: "text", text: huge } }]))).toBe("prompt_body_invalid");
  });

  it("sections are matched case-insensitively across all messages", () => {
    const msgs = [
      { role: "user" as const, content: { type: "text" as const, text: "WHEN TO USE: now" } },
      { role: "user" as const, content: { type: "text" as const, text: "call order: a, b\nfailure modes: none" } },
    ];
    expect(() => validatePromptBody(msgs)).not.toThrow();
  });
});

describe("renderPrompt — end to end over a registration", () => {
  it("resolves args, renders, validates, and returns the prompts/get shape", async () => {
    const out = await renderPrompt(reg(), { workbook_id: "wb-1" });
    expect(out.description).toBe(reg().description);
    expect(out.messages).toHaveLength(1);
    expect(out.messages[0]!.content.text).toContain("workbook=wb-1 focus=-");
  });

  it("a render function that returns garbage is rejected, never passed through", async () => {
    const bad = reg({ render: () => [] });
    await expect(renderPrompt(bad, { workbook_id: "wb" })).rejects.toMatchObject({
      evidence: { reason: "prompt_body_invalid" },
    });
    const throws = reg({
      render: () => {
        throw new Error("boom");
      },
    });
    await expect(renderPrompt(throws, { workbook_id: "wb" })).rejects.toMatchObject({
      evidence: { reason: "prompt_render_failed" },
    });
  });
});
