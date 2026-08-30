/**
 * `fdpm.loop-forward` MCP prompts — the operating instructions for the
 * loop-forward v2 domain.
 *
 * The profile could already describe a pipeline and render five audit
 * views of it, but it shipped nothing that told an agent how to build or
 * review one. These prompts are that missing layer, and this suite holds
 * them to the same contract the planning prompt is held to plus two the
 * planning suite does not have:
 *
 *   - a DRIFT gate. Every `lf:` type id, relation id, validator rule id
 *     and renderer id a prompt body cites is checked against the
 *     plugin's own sources. A prompt that teaches a type that was
 *     renamed is worse than no prompt: it is a confident instruction to
 *     write something the validators will reject.
 *   - a BUDGET RATCHET. `P` sits in an agent's context on every step of
 *     every run, so its size is a per-step cost, not a one-off. The
 *     pinned ceilings below are measured, not aspirational, and moving
 *     one is a reviewed decision — the same discipline
 *     `tests/mcp/catalog-budget.test.ts` applies to the tool catalog and
 *     `checkInstructionsBudget` applies to the server instructions.
 *
 * ARCHITECTURAL REQUIREMENT (PALS's LAW): a prompt body is model-facing
 * output authored by a plugin. It is untrusted until `validatePromptBody`
 * has passed it, and every assertion below runs against the body that
 * `renderPrompt` actually returns, never against the source string.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Host } from "../../../src/core/host.js";
import { MANIFEST } from "../../../src/mcp/manifest.js";
import {
  PROMPT_BODY_BUDGET_BYTES,
  PROMPT_LISTING_BUDGET_BYTES,
  listingBytes,
  renderPrompt,
  validatePromptRegistration,
} from "../../../src/mcp/prompts.js";
import { listPrompts, renderPrompt as sdkRenderPrompt } from "../../../src/sdk.js";
import {
  AUTHOR_PIPELINE_PROMPT,
  AUDIT_PIPELINE_PROMPT,
  LOOP_FORWARD_PROMPTS,
  LOOP_FORWARD_PROMPT_BODY_CEILING_BYTES,
} from "../../../plugins/loop_forward/prompts.js";
import { PLUGIN_ID, R, T } from "../../../plugins/loop_forward/ids.js";

const PLUGIN_DIR = join(process.cwd(), "plugins", "loop_forward");

/**
 * Every `lf:`-prefixed identifier the plugin declares anywhere except in
 * the prompts themselves. Reading the sources rather than importing a
 * curated list is deliberate: an id that exists only inside a prompt
 * body is exactly the drift this gate exists to catch.
 */
function pluginLfIds(): Set<string> {
  const ids = new Set<string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        walk(p);
      } else if (entry.name.endsWith(".ts") && entry.name !== "prompts.ts") {
        for (const m of readFileSync(p, "utf8").matchAll(/lf:[A-Za-z][A-Za-z0-9:-]*/g)) {
          ids.add(m[0]);
        }
      }
    }
  };
  walk(PLUGIN_DIR);
  return ids;
}

async function hostWithPlugins(): Promise<Host> {
  const host = new Host({
    dataDir: null,
    builtinDirs: [join(process.cwd(), "plugins")],
    pluginPaths: [],
  });
  await host.load();
  return host;
}

async function bodyOf(
  prompt: typeof AUTHOR_PIPELINE_PROMPT,
  args: Record<string, string>,
): Promise<string> {
  const out = await renderPrompt(prompt, args);
  return out.messages.map((m) => m.content.text).join("\n");
}

const AUTHOR_ARGS = { workbook_id: "lf-demo" };
const AUDIT_ARGS = { workbook_id: "lf-demo" };

// ── Registration contract ────────────────────────────────────────────

describe("loop-forward prompts — registration", () => {
  it("exports exactly the two operating skills, both passing the registration contract", () => {
    expect(LOOP_FORWARD_PROMPTS.map((p) => p.promptId)).toEqual([
      "loop-forward/author_pipeline",
      "loop-forward/audit_pipeline",
    ]);
    for (const reg of LOOP_FORWARD_PROMPTS) {
      expect(() => validatePromptRegistration(reg)).not.toThrow();
    }
  });

  it("declares skill-shaped metadata within the listing budget", () => {
    for (const reg of LOOP_FORWARD_PROMPTS) {
      expect(reg.description.length).toBeGreaterThanOrEqual(40);
      expect(reg.description.length).toBeLessThanOrEqual(300);
      expect(reg.description).toMatch(/^Use /);
      expect(reg.title.length).toBeLessThanOrEqual(80);
      expect(listingBytes(reg)).toBeLessThanOrEqual(PROMPT_LISTING_BUDGET_BYTES);
    }
  });

  it("requires workbook_id on both prompts and describes every argument", () => {
    for (const reg of LOOP_FORWARD_PROMPTS) {
      const wb = reg.arguments.find((a) => a.name === "workbook_id");
      expect(wb, `${reg.promptId} must take workbook_id`).toBeDefined();
      expect(wb!.required).toBe(true);
      for (const a of reg.arguments) expect(a.description.trim().length).toBeGreaterThan(0);
    }
  });
});

// ── Body contract ────────────────────────────────────────────────────

describe("loop-forward prompts — rendered body", () => {
  it("carries the three skill sections and threads the workbook id", async () => {
    for (const reg of LOOP_FORWARD_PROMPTS) {
      const text = await bodyOf(reg, { workbook_id: "lf-demo" });
      expect(text, reg.promptId).toMatch(/when to use/i);
      expect(text, reg.promptId).toMatch(/call order/i);
      expect(text, reg.promptId).toMatch(/failure modes/i);
      expect(text, reg.promptId).toContain("lf-demo");
    }
  });

  it("names only tools that exist in the MCP manifest", async () => {
    const known = new Set(MANIFEST.map((t) => t.name));
    for (const reg of LOOP_FORWARD_PROMPTS) {
      const text = await bodyOf(reg, { workbook_id: "lf-demo" });
      const mentioned = [...new Set(text.match(/fdpm\.[a-z_]+(\.[a-z_]+)?/g) ?? [])];
      expect(mentioned.length, `${reg.promptId} must name real tools`).toBeGreaterThanOrEqual(4);
      expect(mentioned.filter((n) => !known.has(n)), reg.promptId).toEqual([]);
    }
  });

  it("cites only lf: ids the plugin actually declares (drift gate)", async () => {
    const real = pluginLfIds();
    for (const reg of LOOP_FORWARD_PROMPTS) {
      const text = await bodyOf(reg, { workbook_id: "lf-demo" });
      const cited = [...new Set(text.match(/lf:[A-Za-z][A-Za-z0-9:-]*/g) ?? [])];
      expect(cited.length, `${reg.promptId} must cite real ids`).toBeGreaterThanOrEqual(5);
      expect(cited.filter((id) => !real.has(id)), reg.promptId).toEqual([]);
    }
  });

  it("author_pipeline teaches the endpoint-before-edge order the relations require", async () => {
    const text = await bodyOf(AUTHOR_PIPELINE_PROMPT, AUTHOR_ARGS);
    // The graph cannot be built edge-first: every relation endpoint must
    // already exist, so the procedure must name the primitives before the
    // relations that join them.
    expect(text.indexOf(T.PromptTemplate)).toBeGreaterThanOrEqual(0);
    expect(text.indexOf(T.Stage)).toBeGreaterThan(-1);
    expect(text.indexOf(T.Stage)).toBeLessThan(text.indexOf(R.PipelineHasStage));
    expect(text.indexOf(T.Carry)).toBeLessThan(text.indexOf(R.LoopHasCarry));
    expect(text).toContain("fdpm.primitive.create_batch");
    expect(text).toContain("fdpm.relation.create_batch");
  });

  it("audit_pipeline routes review through the five renderers as resources", async () => {
    const text = await bodyOf(AUDIT_PIPELINE_PROMPT, AUDIT_ARGS);
    for (const rendererId of [
      "lf:PipelineGraphRenderer",
      "lf:VerificationSurfaceRenderer",
      "lf:AuthorityMatrixRenderer",
      "lf:BindingMatrixRenderer",
      "lf:BudgetEnvelopeRenderer",
    ]) {
      expect(text, `audit must name ${rendererId}`).toContain(rendererId);
    }
    expect(text).toContain("fdpm://workbook/lf-demo/render/");
  });

  it("cites every validator rule id a pipeline author can trip", async () => {
    const text = await bodyOf(AUTHOR_PIPELINE_PROMPT, AUTHOR_ARGS);
    for (const ruleId of [
      "lf:val:binding-source-arm",
      "lf:val:output-contract-arm",
      "lf:val:output-validator-arm",
      "lf:val:stop-condition-arm",
      "lf:val:carry-consistency",
      "lf:val:variable-enum-consistency",
      "lf:val:tool-grant-zod",
      "lf:val:example-reason",
    ]) {
      expect(text, `failure modes must cover ${ruleId}`).toContain(ruleId);
    }
  });

  it("renders deterministically for identical arguments", async () => {
    for (const reg of LOOP_FORWARD_PROMPTS) {
      const a = await bodyOf(reg, { workbook_id: "lf-demo" });
      const b = await bodyOf(reg, { workbook_id: "lf-demo" });
      expect(a, reg.promptId).toBe(b);
    }
  });
});

// ── Budget ratchet ───────────────────────────────────────────────────

describe("loop-forward prompts — budget ratchet", () => {
  it("keeps every body under the pinned ceiling, which is under the host budget", async () => {
    expect(LOOP_FORWARD_PROMPT_BODY_CEILING_BYTES).toBeLessThanOrEqual(PROMPT_BODY_BUDGET_BYTES);
    for (const reg of LOOP_FORWARD_PROMPTS) {
      const text = await bodyOf(reg, { workbook_id: "lf-demo" });
      const bytes = Buffer.byteLength(text, "utf8");
      expect(
        bytes,
        `${reg.promptId} is ${bytes} B, ceiling ${LOOP_FORWARD_PROMPT_BODY_CEILING_BYTES} B — ` +
          "raising the ceiling is a reviewed decision, not a fix",
      ).toBeLessThanOrEqual(LOOP_FORWARD_PROMPT_BODY_CEILING_BYTES);
    }
  });

  it("stays bounded when every optional argument is supplied", async () => {
    for (const reg of LOOP_FORWARD_PROMPTS) {
      const args: Record<string, string> = {};
      for (const a of reg.arguments) args[a.name] = a.name === "workbook_id" ? "lf-demo" : "x".repeat(64);
      const text = await bodyOf(reg, args);
      expect(Buffer.byteLength(text, "utf8"), reg.promptId).toBeLessThanOrEqual(
        LOOP_FORWARD_PROMPT_BODY_CEILING_BYTES,
      );
    }
  });
});

// ── Argument handling (failure paths) ────────────────────────────────

describe("loop-forward prompts — argument failure paths", () => {
  it("rejects a missing required argument", async () => {
    await expect(renderPrompt(AUTHOR_PIPELINE_PROMPT, {})).rejects.toThrow(/prompt_argument_missing/);
  });

  it("rejects an undeclared argument", async () => {
    await expect(
      renderPrompt(AUTHOR_PIPELINE_PROMPT, { workbook_id: "lf-demo", nope: "x" }),
    ).rejects.toThrow(/prompt_argument_unknown/);
  });

  it("rejects a non-string argument", async () => {
    await expect(
      renderPrompt(AUTHOR_PIPELINE_PROMPT, { workbook_id: 7 as unknown as string }),
    ).rejects.toThrow(/prompt_argument_invalid/);
  });

  it("rejects a non-object argument bag", async () => {
    await expect(
      renderPrompt(AUTHOR_PIPELINE_PROMPT, [] as unknown as Record<string, unknown>),
    ).rejects.toThrow(/prompt_argument_invalid/);
  });
});

// ── Integration paths: Host, MCP, SDK ────────────────────────────────

describe("loop-forward prompts — surface parity", () => {
  it("activation registers both prompts under fdpm.loop-forward", async () => {
    const host = await hostWithPlugins();
    const mine = host.plugins.listPrompts().filter((p) => p.pluginId === PLUGIN_ID);
    expect(mine.map((p) => p.promptId).sort()).toEqual([
      "loop-forward/audit_pipeline",
      "loop-forward/author_pipeline",
    ]);
  });

  it("is reachable and renderable through the Host registry (the prompts/get path)", async () => {
    const host = await hostWithPlugins();
    for (const id of ["loop-forward/author_pipeline", "loop-forward/audit_pipeline"]) {
      const found = host.plugins.findPrompt(id);
      expect(found, id).toBeDefined();
      const out = await renderPrompt(found!, { workbook_id: "lf-live" });
      expect(out.messages[0]!.content.text).toContain("lf-live");
      expect(out.description).toBe(found!.description);
    }
  });

  it("appears in the SDK listing with its owning plugin (the prompts/list path)", async () => {
    const host = await hostWithPlugins();
    const list = listPrompts(host);
    const author = list.find((p) => p.name === "loop-forward/author_pipeline");
    expect(author).toMatchObject({ plugin_id: PLUGIN_ID });
    expect(author!.arguments.some((a) => a.name === "workbook_id" && a.required)).toBe(true);
  });

  it("renders through the SDK facade", async () => {
    const host = await hostWithPlugins();
    const out = await sdkRenderPrompt(host, {
      id: "loop-forward/audit_pipeline",
      args: { workbook_id: "lf-sdk" },
    });
    expect(out.name).toBe("loop-forward/audit_pipeline");
    expect(out.messages.map((m) => m.content.text).join("\n")).toContain("lf-sdk");
  });

  it("does not collide with prompt ids from other bundled plugins", async () => {
    const host = await hostWithPlugins();
    const ids = host.plugins.listPrompts().map((p) => p.promptId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
