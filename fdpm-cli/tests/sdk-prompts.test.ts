/** `listPrompts(host)` / `renderPrompt(host, { id, args })` — the SDK face of plugin prompts. */
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Host } from "../src/core/host.js";
import { listPrompts, renderPrompt } from "../src/sdk.js";

async function hostWithPlugins(): Promise<Host> {
  const host = new Host({ dataDir: null, builtinDirs: [join(process.cwd(), "plugins")], pluginPaths: [] });
  await host.load();
  return host;
}

describe("SDK prompts", () => {
  it("listPrompts returns metadata entries with the owning plugin", async () => {
    const host = await hostWithPlugins();
    const list = listPrompts(host);
    const triage = list.find((p) => p.name === "planning/triage_iteration");
    expect(triage).toMatchObject({ plugin_id: "fdpm.planning", title: expect.any(String) });
    expect(triage!.arguments.some((a) => a.name === "workbook_id" && a.required)).toBe(true);
  });

  it("renderPrompt renders with args and rejects unknown ids / missing args", async () => {
    const host = await hostWithPlugins();
    const out = await renderPrompt(host, { id: "planning/triage_iteration", args: { workbook_id: "plan-sdk" } });
    expect(out.messages[0]!.content.text).toContain("plan-sdk");
    await expect(renderPrompt(host, { id: "planning/nope", args: {} })).rejects.toMatchObject({ category: "not_found" });
    await expect(renderPrompt(host, { id: "planning/triage_iteration", args: {} })).rejects.toMatchObject({
      evidence: { reason: "prompt_argument_missing" },
    });
  });

  it("a host without plugins has no prompts", async () => {
    const host = new Host({ dataDir: null, noPlugins: true });
    await host.load();
    expect(listPrompts(host)).toEqual([]);
  });
});
