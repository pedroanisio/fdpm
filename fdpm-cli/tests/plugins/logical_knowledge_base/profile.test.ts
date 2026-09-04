/**
 * Activation, manifest agreement, and the prompt's drift gates.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { Host } from "../../../src/core/host.js";
import { CORE_ID_PATTERN } from "../../../src/core/identity/id-rules.js";
import { MANIFEST } from "../../../src/mcp/manifest.js";
import {
  PROMPT_BODY_BUDGET_BYTES,
  PROMPT_LISTING_BUDGET_BYTES,
  listingBytes,
  renderPrompt,
} from "../../../src/mcp/prompts.js";
import * as plugin from "../../../plugins/logical_knowledge_base/index.js";
import { AUTHOR_THEORY_PROMPT } from "../../../plugins/logical_knowledge_base/prompts.js";
import { VALIDATOR_RULE_IDS } from "../../../plugins/logical_knowledge_base/validators.js";
import manifest from "../../../plugins/logical_knowledge_base/fdpm-plugin.json" with { type: "json" };

const PLUGIN_DIR = join(process.cwd(), "plugins", "logical_knowledge_base");

let host: Host;
beforeAll(async () => {
  host = new Host({ dataDir: null, builtinDirs: [resolve(process.cwd(), "plugins")] });
  await host.load();
});

describe("fdpm.logical-knowledge-base activation", () => {
  it("registers the derived profile under the schema's semantic model version", () => {
    expect(host.profiles.has(plugin.PROFILE_ID)).toBe(true);
    const p = host.profiles.getResolved(plugin.PROFILE_ID);
    expect(p.version).toBe("1.0.0");
    expect(p.primitive_types).toHaveLength(117);
    expect(p.relation_types).toHaveLength(77);
    for (const t of p.primitive_types) expect(t.id).toMatch(CORE_ID_PATTERN);
    for (const r of p.relation_types) expect(r.id).toMatch(CORE_ID_PATTERN);
  });

  it("binds both renderers and the prompt", () => {
    const renderers = host.plugins.listRenderers().map((r) => r.rendererId);
    expect(renderers).toContain(plugin.THEORY_RENDERER_ID);
    expect(renderers).toContain(plugin.ARGUMENT_GRAPH_RENDERER_ID);
    const prompts = host.plugins.listPrompts().map((p) => p.promptId);
    expect(prompts).toContain(AUTHOR_THEORY_PROMPT.promptId);
  });
});

describe("the manifest agrees with the code", () => {
  it("names the plugin id, the profile version and real entry points", () => {
    expect(manifest.id).toBe(plugin.PLUGIN_ID);
    expect(manifest.version).toBe(plugin.PROFILE.version);
    const exportsOf = plugin as unknown as Record<string, unknown>;
    for (const cap of manifest.capabilities) {
      if (cap.entry) expect(exportsOf[cap.entry], `${cap.capability_id}/${cap.local_name} entry ${cap.entry} is not exported`).toBeDefined();
    }
    const renderers = manifest.capabilities.filter((c) => c.capability_id === "cap:renderer").map((c) => (c.metadata as { renderer_id: string }).renderer_id);
    expect(renderers.sort()).toEqual([plugin.ARGUMENT_GRAPH_RENDERER_ID, plugin.THEORY_RENDERER_ID].sort());
    const rules = manifest.capabilities.filter((c) => c.capability_id === "cap:validator").map((c) => (c.metadata as { rule_id: string }).rule_id);
    const known = new Set<string>(Object.values(VALIDATOR_RULE_IDS));
    expect(rules.filter((r) => !known.has(r))).toEqual([]);
    const formats = manifest.capabilities.filter((c) => c.capability_id === "cap:importer" || c.capability_id === "cap:exporter").map((c) => (c.metadata as { format: string }).format);
    expect(formats).toEqual([plugin.TRANSFER_FORMAT, plugin.TRANSFER_FORMAT]);
  });
});

/** Every `lkb:` identifier the plugin declares outside the prompt itself, plus the derived ids. */
function realLkbIds(): Set<string> {
  const ids = new Set<string>();
  const p = plugin.PROFILE;
  for (const t of p.primitive_types) ids.add(t.id);
  for (const r of p.relation_types) ids.add(r.id);
  for (const v of Object.values(VALIDATOR_RULE_IDS)) ids.add(v);
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "generated" && entry.name !== "schemas") walk(file);
      } else if (entry.name.endsWith(".ts") && entry.name !== "prompts.ts") {
        for (const m of readFileSync(file, "utf8").matchAll(/lkb:[A-Za-z][A-Za-z0-9-]*(?:\.[A-Za-z][A-Za-z0-9-]*)*(?::[a-z0-9-]+)*/g)) ids.add(m[0]);
      }
    }
  };
  walk(PLUGIN_DIR);
  return ids;
}

describe("logical-knowledge-base/author_theory", () => {
  it("has skill-shaped metadata within the listing budget", () => {
    expect(AUTHOR_THEORY_PROMPT.promptId).toBe("logical-knowledge-base/author_theory");
    expect(AUTHOR_THEORY_PROMPT.description).toMatch(/^Use /);
    expect(AUTHOR_THEORY_PROMPT.arguments.map((a) => [a.name, a.required === true])).toEqual([
      ["workbook_id", true],
      ["focus", false],
    ]);
    expect(listingBytes(AUTHOR_THEORY_PROMPT)).toBeLessThanOrEqual(PROMPT_LISTING_BUDGET_BYTES);
  });

  it("renders the three required sections, cites only real tools and real lkb ids, within budget", async () => {
    const out = await renderPrompt(AUTHOR_THEORY_PROMPT, { workbook_id: "lkb-x" });
    const body = out.messages.map((m) => m.content.text).join("\n");
    expect(body).toMatch(/when to use/i);
    expect(body).toMatch(/call order/i);
    expect(body).toMatch(/failure modes/i);
    expect(body).toContain("lkb-x");
    const knownTools = new Set(MANIFEST.map((t) => t.name));
    const tools = [...new Set(body.match(/fdpm\.[a-z_]+\.[a-z_]+/g) ?? [])];
    expect(tools.length).toBeGreaterThanOrEqual(5);
    expect(tools.filter((n) => !knownTools.has(n))).toEqual([]);
    const real = realLkbIds();
    const cited = [...new Set(body.match(/lkb:[A-Za-z][A-Za-z0-9-]*(?:\.[A-Za-z][A-Za-z0-9-]*)*(?::[a-z0-9-]+)*/g) ?? [])].filter((id) => !id.includes("<"));
    expect(cited.length).toBeGreaterThanOrEqual(8);
    expect(cited.filter((id) => !real.has(id))).toEqual([]);
    expect(body).toContain("lkb:ref.");
    expect(body).toContain(VALIDATOR_RULE_IDS.document);
    expect(Buffer.byteLength(body, "utf8")).toBeLessThanOrEqual(PROMPT_BODY_BUDGET_BYTES);
  });

  it("threads focus into the heading when given", async () => {
    const out = await renderPrompt(AUTHOR_THEORY_PROMPT, { workbook_id: "lkb-x", focus: "rules" });
    expect(out.messages[0]!.content.text).toContain("focus: rules");
  });
});
