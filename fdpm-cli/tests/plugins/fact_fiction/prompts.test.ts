/**
 * `fact-fiction/ground_fiction` — the grounding audit as a skill.
 *
 * Same two gates as the planning prompt: measured byte budgets and a
 * drift gate. The drift gate matters because this prompt teaches an
 * agent to write into a profile whose validators reject mistakes — a
 * prompt citing a renamed rule id is a confident instruction to
 * produce a rejected write.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MANIFEST } from "../../../src/mcp/manifest.js";
import {
  PROMPT_BODY_BUDGET_BYTES,
  PROMPT_LISTING_BUDGET_BYTES,
  listingBytes,
  renderPrompt,
} from "../../../src/mcp/prompts.js";
import { GROUND_FICTION_PROMPT } from "../../../plugins/fact_fiction/prompts.js";

const PLUGIN_DIR = join(process.cwd(), "plugins", "fact_fiction");

/** Every `ff:` identifier the plugin declares outside the prompt itself. */
function pluginFfIds(): Set<string> {
  const ids = new Set<string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith(".ts") && entry.name !== "prompts.ts") {
        for (const m of readFileSync(p, "utf8").matchAll(/ff:[A-Za-z]+(:[a-z0-9-]+)*/g)) {
          ids.add(m[0]);
        }
      }
    }
  };
  walk(PLUGIN_DIR);
  return ids;
}

describe("fact-fiction/ground_fiction — registration", () => {
  it("has skill-shaped metadata within the listing budget", () => {
    expect(GROUND_FICTION_PROMPT.promptId).toBe("fact-fiction/ground_fiction");
    expect(GROUND_FICTION_PROMPT.description).toMatch(/^Use /);
    expect(
      GROUND_FICTION_PROMPT.arguments.map((a) => [a.name, a.required === true]),
    ).toEqual([
      ["workbook_id", true],
      ["element_id", false],
    ]);
    expect(listingBytes(GROUND_FICTION_PROMPT)).toBeLessThanOrEqual(
      PROMPT_LISTING_BUDGET_BYTES,
    );
  });
});

describe("fact-fiction/ground_fiction — rendered body", () => {
  it("has the three skill sections, names only real tools and ff: ids, and fits the budget", async () => {
    const out = await renderPrompt(GROUND_FICTION_PROMPT, { workbook_id: "ff-x" });
    const text = out.messages.map((m) => m.content.text).join("\n");
    expect(text).toMatch(/when to use/i);
    expect(text).toMatch(/call order/i);
    expect(text).toMatch(/failure modes/i);
    expect(text).toContain("ff-x");

    const knownTools = new Set(MANIFEST.map((t) => t.name));
    const tools = [...new Set(text.match(/fdpm\.[a-z_]+(\.[a-z_]+)?/g) ?? [])];
    expect(tools.length).toBeGreaterThanOrEqual(4);
    expect(tools.filter((n) => !knownTools.has(n))).toEqual([]);

    const real = pluginFfIds();
    const cited = [...new Set(text.match(/ff:[A-Za-z]+(:[a-z0-9-]+)*/g) ?? [])];
    expect(cited.length).toBeGreaterThanOrEqual(5);
    expect(cited.filter((id) => !real.has(id))).toEqual([]);

    // The skill must teach the two invariants agents trip over:
    // sources are shared primitives (cite, don't duplicate) and
    // grounding is edges, not prose.
    expect(text).toMatch(/ff:Cites/);
    expect(text).toMatch(/ff:BasedOn|ff:CouplesTo/);
    expect(Buffer.byteLength(text, "utf8")).toBeLessThanOrEqual(PROMPT_BODY_BUDGET_BYTES);
  });

  it("threads element_id into the procedure when given", async () => {
    const out = await renderPrompt(GROUND_FICTION_PROMPT, {
      workbook_id: "ff-x",
      element_id: "fic:menna",
    });
    const text = out.messages.map((m) => m.content.text).join("\n");
    expect(text).toContain("fic:menna");
  });
});
