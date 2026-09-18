/**
 * The type counts on a `fdpm profile list` row.
 *
 * The listing counted the RAW profile, so every composition row read `0  0`
 * beside rows whose counts were real — `profile:formal-specification-dnis:0.1`
 * carries 34 primitive and 32 relation types and reported none of them. A zero
 * in a catalogue does not read as "ask a different way"; it reads as "nothing
 * here", and hid the candidate from the question the listing exists to answer.
 *
 * The subprocess tests in `profile-list-resolved.test.ts` cover the happy path
 * end to end. They cannot reach the branch below — a profile whose `extends`
 * chain no longer resolves — because a CLI run has no way to unregister a
 * parent mid-flight, and in-process coverage cannot see a subprocess at all.
 * This file exercises the failure path directly.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Host } from "../src/core/host.js";
import { profileTypeCounts } from "../src/commands/profile.js";
import { TEST_PROFILE } from "./fixtures.js";

let dataDir: string;
beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "fdpm-counts-"));
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

async function hostWithComposition(): Promise<Host> {
  const host = new Host({ dataDir, noPlugins: true });
  await host.load();
  await host.registerProfile(TEST_PROFILE);
  await host.registerProfile({
    ...structuredClone(TEST_PROFILE),
    id: "test:composed",
    version: "0.1.0",
    label: "Composed",
    extends: ["test:demo@1.0.0"],
    categories: [],
    scopes: [],
    primitive_types: [],
    relation_types: [],
    validation_rules: [],
  } as never);
  return host;
}

describe("profile list — type counts", () => {
  it("reports a plain profile's own vocabulary", async () => {
    const host = await hostWithComposition();
    const counts = profileTypeCounts(host, { id: "test:demo", version: "1.0.0" });
    expect(counts).toEqual({
      primitive_type_count: TEST_PROFILE.primitive_types.length,
      relation_type_count: TEST_PROFILE.relation_types.length,
      resolved: true,
    });
  });

  it("reports a composition profile's inherited vocabulary, not its empty declaration", async () => {
    const host = await hostWithComposition();
    const raw = host.profiles.getRaw("test:composed");
    expect(raw.primitive_types).toHaveLength(0);

    const counts = profileTypeCounts(host, { id: "test:composed", version: "0.1.0" });
    expect(counts.resolved).toBe(true);
    expect(counts.primitive_type_count).toBe(TEST_PROFILE.primitive_types.length);
    expect(counts.relation_type_count).toBe(TEST_PROFILE.relation_types.length);
  });

  it("reports null rather than a raw count when the extends chain does not resolve", async () => {
    const host = await hostWithComposition();
    // The parent leaves — a pinned parent whose plugin moved on, reproduced.
    host.profiles.unregister("test:demo@1.0.0");
    expect(() => host.profiles.getResolved("test:composed")).toThrow();

    const counts = profileTypeCounts(host, { id: "test:composed", version: "0.1.0" });
    expect(counts).toEqual({
      primitive_type_count: null,
      relation_type_count: null,
      resolved: false,
    });
    // Falling back to the raw count here would print `0` — the same misleading
    // zero the resolved count exists to remove, and print it exactly when the
    // profile cannot be used to create anything at all.
  });

  it("counts a specific revision, not merely the newest", async () => {
    const host = await hostWithComposition();
    await host.registerProfile({
      ...structuredClone(TEST_PROFILE),
      version: "2.0.0",
      primitive_types: [],
      relation_types: [],
      validation_rules: [],
    } as never);

    const older = profileTypeCounts(host, { id: "test:demo", version: "1.0.0" });
    const newer = profileTypeCounts(host, { id: "test:demo", version: "2.0.0" });
    expect(older.primitive_type_count).toBe(TEST_PROFILE.primitive_types.length);
    expect(newer.primitive_type_count).toBe(0);
  });
});
