import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { Host } from "../src/core/host.js";
import type { DomainProfile } from "../src/core/models/meta.js";

/**
 * Every profile bears a renderer.
 *
 * Not a style preference — a correctness invariant, because of what
 * `PluginRuntime.findRenderer` does when a profile declares nothing. Its
 * third disambiguation step returns "the first renderer matching `target`
 * by insertion order", from any plugin. A profile with no declared binding
 * therefore does not fail to render: it renders through whichever plugin
 * happened to load first, and a UML model comes back as a shopping list.
 * A convincing wrong document is worse than a refusal.
 *
 * The invariant closes that path by construction: if every profile names at
 * least one renderer that is actually registered, step 2 always resolves and
 * step 3 is never reached for a profile the host knows.
 */

function declaredRendererIds(profile: DomainProfile): string[] {
  const out = new Set<string>();
  for (const binding of profile.renderer_bindings ?? []) {
    if (binding.renderer_id) out.add(binding.renderer_id);
  }
  for (const binding of profile.renderers ?? []) {
    if (binding.renderer_id) out.add(binding.renderer_id);
  }
  return [...out];
}

async function loadHost(): Promise<Host> {
  // dataDir: null keeps operator-registered profiles out, so the suite
  // asserts the shipped tree and not whatever is on this machine.
  const host = new Host({
    dataDir: null,
    builtinDirs: [resolve(process.cwd(), "plugins")],
    pluginPaths: [],
  });
  await host.load();
  return host;
}

describe("renderer coverage", () => {
  it("gives every registered profile at least one runnable renderer", async () => {
    const host = await loadHost();
    const registered = new Set(host.plugins.listRenderers().map((r) => r.rendererId));

    const bare: string[] = [];
    for (const raw of host.profiles.listRaw()) {
      const resolved = host.profiles.getResolved(raw.id);
      const runnable = declaredRendererIds(resolved).filter((id) => registered.has(id));
      if (runnable.length === 0) bare.push(raw.id);
    }

    expect(bare, `profiles with no runnable renderer:\n  ${bare.join("\n  ")}`).toEqual([]);
  });

  it("resolves a markdown renderer for every profile without falling back to insertion order", async () => {
    const host = await loadHost();

    for (const raw of host.profiles.listRaw()) {
      const resolved = host.profiles.getResolved(raw.id);
      const declared = new Set(declaredRendererIds(resolved));
      const found = host.plugins.findRenderer("text/markdown", undefined, resolved);
      expect(found, `no text/markdown renderer for ${raw.id}`).toBeDefined();
      // The one the profile asked for, not the one that loaded first.
      expect(declared.has(found!.rendererId), `${raw.id} fell through to ${found!.rendererId}`).toBe(
        true,
      );
    }
  });

  it("lets a composition profile inherit the renderers of what it extends", async () => {
    const host = await loadHost();
    const composed = host.profiles
      .listRaw()
      .filter((p) => (p.extends ?? []).length > 0)
      .map((p) => p.id);
    expect(composed.length, "no composition profile in the tree to check").toBeGreaterThan(0);

    for (const id of composed) {
      const resolved = host.profiles.getResolved(id);
      const parents = (host.profiles.getRaw(id).extends ?? []).flatMap((p) =>
        declaredRendererIds(host.profiles.getResolved(p)),
      );
      const own = new Set(declaredRendererIds(resolved));
      for (const inherited of parents) {
        expect(own.has(inherited), `${id} did not inherit ${inherited}`).toBe(true);
      }
    }
  });
});
