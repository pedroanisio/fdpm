/**
 * `ctx.registerPrompt` → PluginRuntime prompt registry (SPEC-MCP-SERVER §13.5).
 *
 * Mirrors the renderer registration path: validated at install, unique
 * across plugins by promptId, listed for the MCP server, torn down with
 * the plugin's other contributions on deactivate.
 */
import { describe, expect, it } from "vitest";
import { Host } from "../src/core/host.js";
import { PluginError } from "../src/plugin/errors.js";
import type { PromptRegistration } from "../src/plugin/types.js";

const BODY = "## When to use\nx\n## Call order\ny\n## Failure modes\nz";

function reg(promptId = "acme/hello"): PromptRegistration {
  return {
    promptId,
    title: "Hello",
    description: "Use when you need a minimal example prompt to verify the registry round-trips correctly.",
    arguments: [{ name: "name", description: "Who to greet.", required: true }],
    render: ({ args }) => [{ role: "user", content: { type: "text", text: `${BODY}\nhello ${args["name"]}` } }],
  };
}

async function bareHost(): Promise<Host> {
  const host = new Host({ dataDir: null, noPlugins: true });
  await host.load();
  return host;
}

describe("PluginRuntime prompt registry", () => {
  it("installs, lists (with pluginId), and finds a prompt", async () => {
    const host = await bareHost();
    host.plugins.installPrompt("acme.plugin", reg());
    const listed = host.plugins.listPrompts();
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ promptId: "acme/hello", pluginId: "acme.plugin" });
    expect(host.plugins.findPrompt("acme/hello")?.title).toBe("Hello");
    expect(host.plugins.findPrompt("acme/nope")).toBeUndefined();
  });

  it("rejects a malformed registration at install time (PALS: validate at the boundary)", async () => {
    const host = await bareHost();
    expect(() => host.plugins.installPrompt("acme.plugin", reg("not-namespaced"))).toThrow(/prompt/);
    expect(host.plugins.listPrompts()).toEqual([]);
  });

  it("promptId is unique across plugins: a second plugin registering the same id conflicts", async () => {
    const host = await bareHost();
    host.plugins.installPrompt("acme.plugin", reg());
    let err: unknown;
    try {
      host.plugins.installPrompt("other.plugin", reg());
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(PluginError);
    expect((err as PluginError).message).toMatch(/already registered by acme\.plugin/);
    expect(host.plugins.listPrompts()).toHaveLength(1);
  });

  it("lists prompts sorted by promptId", async () => {
    const host = await bareHost();
    host.plugins.installPrompt("acme.plugin", reg("acme/zeta"));
    host.plugins.installPrompt("acme.plugin", reg("acme/alpha"));
    expect(host.plugins.listPrompts().map((p) => p.promptId)).toEqual(["acme/alpha", "acme/zeta"]);
  });
});

describe("bundled plugins register prompts through ctx.registerPrompt", () => {
  it("the planning plugin contributes planning/triage_iteration and it survives reloadPlugins", async () => {
    const host = new Host({
      dataDir: null,
      builtinDirs: [new URL("../plugins", import.meta.url).pathname],
      pluginPaths: [],
    });
    await host.load();
    const ids = host.plugins.listPrompts().map((p) => p.promptId);
    expect(ids).toContain("planning/triage_iteration");
    const before = host.plugins.listPrompts().length;
    await host.reloadPlugins();
    expect(host.plugins.listPrompts()).toHaveLength(before);
    const record = host.plugins.get("fdpm.planning");
    expect(record?.contributions.prompts.map((p) => p.promptId)).toContain("planning/triage_iteration");
  });
});
