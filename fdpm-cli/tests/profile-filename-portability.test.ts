import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonlLogStore } from "../src/persistence/jsonl-log.js";

describe("portable persisted profile filenames", () => {
  let dataDir: string;
  let store: JsonlLogStore;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "fdpm-profile-filename-"));
    store = new JsonlLogStore(dataDir);
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it("does not collapse punctuation-distinct profile IDs", async () => {
    await store.writeProfile("profile:a.b:1", { marker: "dot" });
    await store.writeProfile("profile:a_b:1", { marker: "underscore" });

    const files = await store.listProfileFiles();
    const profiles = await Promise.all(files.map((file) => store.readProfileFile(file)));

    expect(files).toHaveLength(2);
    expect(profiles).toEqual(
      expect.arrayContaining([{ marker: "dot" }, { marker: "underscore" }]),
    );
  });

  it("uses filenames that remain distinct after case folding", async () => {
    await store.writeProfile("profile:Case:1", { marker: "upper" });
    await store.writeProfile("profile:case:1", { marker: "lower" });

    const names = (await store.listProfileFiles()).map((file) => basename(file));
    expect(new Set(names.map((name) => name.toLowerCase())).size).toBe(2);
  });

  it("bounds the filename even when the profile ID is very long", async () => {
    await store.writeProfile(`profile:${"a".repeat(1_000)}`, { marker: "long" });

    const names = (await store.listProfileFiles()).map((file) => basename(file));
    expect(names).toHaveLength(1);
    expect(names[0]!.length).toBeLessThanOrEqual(180);
  });

  it("continues to discover profiles written with the legacy slug format", async () => {
    await mkdir(store.profileDir(), { recursive: true });
    const legacyPath = join(store.profileDir(), "profile_legacy_1.json");
    await writeFile(legacyPath, JSON.stringify({ marker: "legacy" }), "utf8");

    expect(await store.listProfileFiles()).toEqual([legacyPath]);
  });
});
