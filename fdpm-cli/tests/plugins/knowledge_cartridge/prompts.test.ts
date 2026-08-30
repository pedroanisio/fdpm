/**
 * `knowledge-cartridge/build_cartridge` — the generator protocol as a skill.
 *
 * Held to the same two gates as the loop-forward prompts: no drift, and a
 * measured byte ceiling. The drift gate matters more here than usual, because
 * this prompt teaches an agent to write into a profile whose validators will
 * reject a mistake — a prompt naming a renamed type is a confident instruction
 * to produce a rejected write.
 *
 * It also asserts the prompt stays faithful to GENERATOR.md on the three points
 * a paraphrase would quietly lose: harvest is located with snippets but
 * EXTRACTED with a ranged read, the discard rate has a floor, and the gap is
 * declared rather than filled.
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
  BUILD_CARTRIDGE_PROMPT,
  KC_PROMPT_BODY_CEILING_BYTES,
  KNOWLEDGE_CARTRIDGE_PROMPTS,
} from "../../../plugins/knowledge_cartridge/prompts.js";
import { PLUGIN_ID } from "../../../plugins/knowledge_cartridge/ids.js";

const PLUGIN_DIR = join(process.cwd(), "plugins", "knowledge_cartridge");
const ARGS = { workbook_id: "kc-demo", subject: "typesetting", archetype: "book typographer" };

/** Every `kc:` identifier the plugin declares outside the prompt itself. */
function pluginKcIds(): Set<string> {
  const ids = new Set<string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith(".ts") && entry.name !== "prompts.ts") {
        for (const m of readFileSync(p, "utf8").matchAll(/kc:[A-Za-z][A-Za-z0-9:_-]*/g)) ids.add(m[0]);
      }
    }
  };
  walk(PLUGIN_DIR);
  return ids;
}

async function body(args: Record<string, string> = ARGS): Promise<string> {
  const out = await renderPrompt(BUILD_CARTRIDGE_PROMPT, args);
  return out.messages.map((m) => m.content.text).join("\n");
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

describe("build_cartridge — registration", () => {
  it("passes the skill contract and fits the listing budget", () => {
    expect(KNOWLEDGE_CARTRIDGE_PROMPTS.map((p) => p.promptId)).toEqual([
      "knowledge-cartridge/build_cartridge",
    ]);
    expect(() => validatePromptRegistration(BUILD_CARTRIDGE_PROMPT)).not.toThrow();
    expect(listingBytes(BUILD_CARTRIDGE_PROMPT)).toBeLessThanOrEqual(PROMPT_LISTING_BUDGET_BYTES);
    expect(BUILD_CARTRIDGE_PROMPT.description).toMatch(/^Use /);
  });

  it("requires only the workbook, so it can orient an agent that has not chosen a subject", () => {
    const required = BUILD_CARTRIDGE_PROMPT.arguments.filter((a) => a.required === true);
    expect(required.map((a) => a.name)).toEqual(["workbook_id"]);
  });
});

describe("build_cartridge — body", () => {
  it("carries the three skill sections and threads its arguments", async () => {
    const text = await body();
    expect(text).toMatch(/when to use/i);
    expect(text).toMatch(/call order/i);
    expect(text).toMatch(/failure modes/i);
    expect(text).toContain("kc-demo");
    expect(text).toContain("typesetting");
    expect(text).toContain("book typographer");
  });

  it("names only tools that exist in the MCP manifest", async () => {
    const known = new Set(MANIFEST.map((t) => t.name));
    const text = await body();
    const mentioned = [...new Set(text.match(/fdpm\.[a-z_]+(\.[a-z_]+)?/g) ?? [])];
    expect(mentioned.length).toBeGreaterThanOrEqual(4);
    expect(mentioned.filter((n) => !known.has(n))).toEqual([]);
  });

  it("cites only kc: ids the plugin actually declares (drift gate)", async () => {
    const real = pluginKcIds();
    const text = await body();
    const cited = [...new Set(text.match(/kc:[A-Za-z][A-Za-z0-9:_-]*/g) ?? [])];
    expect(cited.length).toBeGreaterThanOrEqual(10);
    expect(cited.filter((id) => !real.has(id))).toEqual([]);
  });

  it("walks all seven passes in order", async () => {
    const text = await body();
    const passes = ["PASS 0", "PASS 1", "PASS 2", "PASS 3", "PASS 4", "PASS 5", "PASS 6"];
    let cursor = -1;
    for (const p of passes) {
      const at = text.indexOf(p);
      expect(at, `${p} missing`).toBeGreaterThan(-1);
      expect(at, `${p} out of order`).toBeGreaterThan(cursor);
      cursor = at;
    }
  });

  it("keeps the three claims a paraphrase would lose", async () => {
    const text = await body();
    // Snippets locate; ranged reads extract. Snippets alone yield stubs.
    expect(text).toMatch(/ranged read/i);
    // The discard floor is what separates transposition from summarising.
    expect(text).toMatch(/50%/);
    // The gap is the deliverable.
    expect(text).toMatch(/never fill it/i);
    // The envelope is written before retrieval, not after.
    expect(text).toMatch(/before any retrieval/i);
  });

  it("tells the agent the header is the gate, not the individual claim", async () => {
    // The citation check cannot fire per write; a prompt that said otherwise
    // would send an agent looking for a rejection that never comes.
    const text = await body();
    expect(text).toMatch(/header/i);
    expect(text).toContain("kc:val:normative-claim-cited");
  });

  it("stays under the pinned ceiling, which is under the host budget", async () => {
    expect(KC_PROMPT_BODY_CEILING_BYTES).toBeLessThanOrEqual(PROMPT_BODY_BUDGET_BYTES);
    const text = await body();
    const bytes = Buffer.byteLength(text, "utf8");
    expect(
      bytes,
      `body is ${bytes} B, ceiling ${KC_PROMPT_BODY_CEILING_BYTES} B — raising the ceiling is a reviewed decision`,
    ).toBeLessThanOrEqual(KC_PROMPT_BODY_CEILING_BYTES);
  });

  it("renders deterministically", async () => {
    expect(await body()).toBe(await body());
  });
});

describe("build_cartridge — argument failure paths", () => {
  it("rejects a missing required argument", async () => {
    await expect(renderPrompt(BUILD_CARTRIDGE_PROMPT, {})).rejects.toThrow(/prompt_argument_missing/);
  });

  it("rejects an undeclared argument", async () => {
    await expect(
      renderPrompt(BUILD_CARTRIDGE_PROMPT, { workbook_id: "x", corpus: "y" }),
    ).rejects.toThrow(/prompt_argument_unknown/);
  });

  it("renders with the optional arguments omitted", async () => {
    const text = await body({ workbook_id: "kc-bare" });
    expect(text).toContain("kc-bare");
    expect(text).toContain("<subject>");
  });
});

describe("build_cartridge — surface parity", () => {
  it("is registered by activation and reachable through the Host", async () => {
    const host = await hostWithPlugins();
    const mine = host.plugins.listPrompts().filter((p) => p.pluginId === PLUGIN_ID);
    expect(mine.map((p) => p.promptId)).toEqual(["knowledge-cartridge/build_cartridge"]);
    const found = host.plugins.findPrompt("knowledge-cartridge/build_cartridge");
    expect(found).toBeDefined();
    const out = await renderPrompt(found!, { workbook_id: "kc-live" });
    expect(out.messages[0]!.content.text).toContain("kc-live");
  });

  it("appears in the SDK listing and renders through the SDK facade", async () => {
    const host = await hostWithPlugins();
    const entry = listPrompts(host).find((p) => p.name === "knowledge-cartridge/build_cartridge");
    expect(entry).toMatchObject({ plugin_id: PLUGIN_ID });
    const out = await sdkRenderPrompt(host, {
      id: "knowledge-cartridge/build_cartridge",
      args: { workbook_id: "kc-sdk" },
    });
    expect(out.messages.map((m) => m.content.text).join("\n")).toContain("kc-sdk");
  });
});
