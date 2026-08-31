/**
 * Contract gates on every `DomainProfile` this checkout ships.
 *
 * `DomainProfile.description` is optional in the schema, which is right for
 * the type — a profile assembled in a test fixture has no use for prose. It
 * is not right for a profile a team is asked to choose between. Three shipped
 * profiles declared none, and the profile atlas fell back to their plugin
 * manifest's description, which answers "what does this plugin do?" to a
 * reader who asked "what does this profile model?". The two are not the same
 * question: `fdpm.academic-paper-v0-4-1` describes a bridge run and its entity
 * count; `profile:academic-paper:0.4.1` should describe the paper.
 *
 * Optional in the schema, required to ship. That distinction is what this
 * file encodes, and it is why the gate lives in a test rather than in
 * `meta.ts`.
 *
 * A second gate was written here and removed: it failed a profile whose
 * description is byte-identical to its plugin manifest's, on the theory that
 * copying the manifest across is the cheap way to turn the gate above green.
 * `profile:planning:0.1` fails it and is not wrong — its text describes the
 * vocabulary, and the plugin is a thin wrapper that reuses it. A gate that
 * fails correct code teaches people to weaken gates, so it is not here.
 *
 * Scoped to plugins rooted under this checkout's `plugins/`, for the same
 * reason `build-profile-atlas.ts` is: the loader also discovers plugins from
 * `~/.fdpm/plugins`, and a gate that failed on a developer's unrelated
 * installed plugin would be switched off within a week.
 */
import { resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { openHost } from "../../src/sdk.js";
import type { DomainProfile } from "../../src/core/models/meta.js";

const CLI_ROOT = resolve(__dirname, "..", "..");
const PLUGINS_ROOT = resolve(CLI_ROOT, "plugins") + sep;

interface ShippedProfile {
  raw: DomainProfile;
  pluginId: string;
  dir: string;
}

/** `dataDir: null`: a real data dir holds profiles registered at runtime. */
async function shippedProfiles(): Promise<ShippedProfile[]> {
  const host = await openHost({ dataDir: null });
  const owner = new Map<string, { pluginId: string; dir: string }>();
  for (const rec of host.plugins.list()) {
    const r = rec as unknown as {
      id: string;
      source: { root: string };
      contributions: { profileIds: string[] };
    };
    if (!r.source.root.startsWith(PLUGINS_ROOT)) continue;
    for (const pid of r.contributions.profileIds) {
      owner.set(pid, { pluginId: r.id, dir: r.source.root.slice(PLUGINS_ROOT.length) });
    }
  }
  const out: ShippedProfile[] = [];
  for (const raw of host.profiles.listRaw() as DomainProfile[]) {
    const o = owner.get(raw.id);
    if (o === undefined) continue; // core:empty and anything not ours.
    out.push({ raw, pluginId: o.pluginId, dir: o.dir });
  }
  return out;
}

describe("every shipped profile describes itself", () => {
  it("declares a description of its own, not its plugin's", async () => {
    const profiles = await shippedProfiles();
    expect(profiles.length).toBeGreaterThan(0);

    const missing = profiles
      .filter((p) => (p.raw.description ?? "").trim().length === 0)
      .map((p) => `${p.raw.id} (plugins/${p.dir}/)`);

    expect(
      missing,
      "A profile without its own description forces every reader — the atlas, " +
        "fdpm profile list, an agent choosing a vocabulary — to fall back to " +
        "the plugin manifest, which describes the plugin. Set it at source: " +
        "`fdpm.profileDescription` in the sidecar for bridge-generated plugins, " +
        "or `description` on the DomainProfile for hand-written ones.",
    ).toEqual([]);
  });

});

/**
 * SPEC-PLUGIN-NAMING §5.5.1: the version tail of a profile id MUST be exactly
 * `<major>.<minor>`.
 *
 * The tail names a compatibility series, not a release. It moves only when the
 * type catalogue changes in a way existing workbooks cannot survive, because
 * the id is recorded in every workbook's `workbook.create` operation and that
 * log is append-only — changing an id does not rename anything, it orphans
 * every log that names it, and the host has no profile-id migration.
 *
 * So a tail that disagrees with `version` is NOT a defect and is not checked
 * here. A three-segment tail is, because it encodes a patch level into a
 * durable reference and guarantees churn the rule exists to prevent.
 */
const GRANDFATHERED_TAILS = new Set([
  // Predates §5.5.1 and has workbooks in the field. Renaming it would orphan
  // their logs, so it is exempt by name rather than renamed — the same posture
  // §9 takes for the other naming gates. Nothing may be added here without a
  // deliberate edit, which is what makes this an exemption and not a loophole.
  "profile:academic-paper:0.4.1",
]);

describe("profile ids follow SPEC-PLUGIN-NAMING §5.5.1", () => {
  it("carries a two-segment version tail", async () => {
    const profiles = await shippedProfiles();
    expect(profiles.length).toBeGreaterThan(0);

    const bad = profiles
      .filter((p) => !GRANDFATHERED_TAILS.has(p.raw.id))
      .filter((p) => !/^\d+\.\d+$/.test(p.raw.id.slice(p.raw.id.lastIndexOf(":") + 1)))
      .map((p) => `${p.raw.id} (plugins/${p.dir}/)`);

    expect(
      bad,
      "A profile id tail must be exactly <major>.<minor> — it names a " +
        "compatibility series, and a patch segment in a durable reference " +
        "guarantees the churn the rule exists to prevent.",
    ).toEqual([]);
  });

  it("keeps the grandfathered list from growing silently", async () => {
    // The exemption is only an exemption while it is small and every entry is
    // still real. An id that leaves the tree should leave this list with it.
    const ids = new Set((await shippedProfiles()).map((p) => p.raw.id));
    for (const g of GRANDFATHERED_TAILS) {
      expect(ids, `${g} is grandfathered but no longer shipped; drop it`).toContain(g);
    }
    expect(GRANDFATHERED_TAILS.size).toBeLessThanOrEqual(1);
  });
});
