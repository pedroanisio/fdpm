/**
 * `planning/triage_iteration` — the first plugin-shipped MCP prompt.
 *
 * Content contract (a skill, not a template): it says when to use it,
 * the exact call order over real FDPM tools and resources, and the
 * failure modes by their real rule ids. The test cross-checks every
 * `plan:val:*` id the prompt cites against the plugin's own sources so
 * the prompt cannot drift from the validators it teaches.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Host } from "../src/core/host.js";
import { MANIFEST } from "../src/mcp/manifest.js";
import {
  PROMPT_BODY_BUDGET_BYTES,
  PROMPT_LISTING_BUDGET_BYTES,
  listingBytes,
  renderPrompt,
} from "../src/mcp/prompts.js";
import { TRIAGE_ITERATION_PROMPT } from "../plugins/planning/prompts.js";

const PLUGIN_DIR = join(process.cwd(), "plugins", "planning");

function pluginRuleIds(): Set<string> {
  const ids = new Set<string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith(".ts") && entry.name !== "prompts.ts") {
        for (const m of readFileSync(p, "utf8").matchAll(/plan:val:[a-z0-9-]+/g)) ids.add(m[0]);
      }
    }
  };
  walk(PLUGIN_DIR);
  return ids;
}

describe("planning/triage_iteration — registration", () => {
  it("has the skill-shaped metadata within the listing budget", () => {
    expect(TRIAGE_ITERATION_PROMPT.promptId).toBe("planning/triage_iteration");
    expect(TRIAGE_ITERATION_PROMPT.description).toMatch(/^Use /);
    expect(TRIAGE_ITERATION_PROMPT.arguments.map((a) => [a.name, a.required === true])).toEqual([
      ["workbook_id", true],
      ["iteration_id", false],
      ["focus", false],
    ]);
    expect(listingBytes(TRIAGE_ITERATION_PROMPT)).toBeLessThanOrEqual(PROMPT_LISTING_BUDGET_BYTES);
  });
});

describe("planning/triage_iteration — rendered body", () => {
  it("contains the three skill sections, names only real tools, cites only real rule ids, and stays within budget", async () => {
    const out = await renderPrompt(TRIAGE_ITERATION_PROMPT, { workbook_id: "plan-x" });
    const text = out.messages.map((m) => m.content.text).join("\n");
    expect(text).toMatch(/when to use/i);
    expect(text).toMatch(/call order/i);
    expect(text).toMatch(/failure modes/i);
    expect(text).toContain("plan-x");
    const known = new Set(MANIFEST.map((t) => t.name));
    const mentioned = [...new Set(text.match(/fdpm\.[a-z_]+(\.[a-z_]+)?/g) ?? [])];
    expect(mentioned.length).toBeGreaterThanOrEqual(4);
    expect(mentioned.filter((n) => !known.has(n))).toEqual([]);
    const cited = [...new Set(text.match(/plan:val:[a-z0-9-]+/g) ?? [])];
    expect(cited.length).toBeGreaterThanOrEqual(3);
    const real = pluginRuleIds();
    expect(cited.filter((id) => !real.has(id))).toEqual([]);
    expect(text).toMatch(/dry_run/);
    expect(text).toMatch(/plan:Verifies/);
    expect(Buffer.byteLength(text, "utf8")).toBeLessThanOrEqual(PROMPT_BODY_BUDGET_BYTES);
  });

  it("threads optional arguments into the procedure", async () => {
    const out = await renderPrompt(TRIAGE_ITERATION_PROMPT, {
      workbook_id: "plan-x",
      iteration_id: "iter:2026-q3",
      focus: "auth",
    });
    const text = out.messages.map((m) => m.content.text).join("\n");
    expect(text).toContain("iter:2026-q3");
    expect(text).toContain("auth");
  });

  it("is reachable through a Host with the bundled planning plugin", async () => {
    const host = new Host({
      dataDir: null,
      builtinDirs: [join(process.cwd(), "plugins")],
      pluginPaths: [],
    });
    await host.load();
    const found = host.plugins.findPrompt("planning/triage_iteration");
    expect(found).toBeDefined();
    const out = await renderPrompt(found!, { workbook_id: "plan-y" });
    expect(out.messages[0]!.content.text).toContain("plan-y");
  });
});
