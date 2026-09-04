/**
 * `Host.retireProfile` — removing one profile revision.
 *
 * Retire is refused, never forced, whenever something still resolves to
 * the revision. That is not caution for its own sake: every read path
 * (render, validate, workbook get, quality scoring) resolves a workbook's
 * profile through the registry and throws `not_found` when it is missing,
 * so deleting a referenced revision does not degrade those surfaces — it
 * breaks them, with no operation in any log to explain why.
 *
 * The four refusals, and the one success, are asserted here.
 */

import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Host } from "../src/core/host.js";
import { FDPMException } from "../src/core/errors/fdpm-exception.js";
import type { DomainProfile } from "../src/core/models/meta.js";
import { TEST_PROFILE } from "./fixtures.js";

function revision(version: string, over: Partial<DomainProfile> = {}): DomainProfile {
  return { ...TEST_PROFILE, version, ...over } as DomainProfile;
}

async function expectRefusal(
  run: () => Promise<unknown>,
  category: string,
  reason?: string,
): Promise<FDPMException> {
  try {
    await run();
  } catch (err) {
    const e = err as FDPMException;
    expect(e).toBeInstanceOf(FDPMException);
    expect(e.category).toBe(category);
    if (reason) expect(e.evidence?.["reason"]).toBe(reason);
    return e;
  }
  throw new Error("expected the retire to be refused");
}

describe("Host.retireProfile", () => {
  let dataDir: string;
  let host: Host;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "fdpm-profile-retire-"));
    host = new Host({ dataDir, noPlugins: true });
    await host.load();
    await host.registerProfile(revision("1.0.0"));
    await host.registerProfile(revision("2.0.0"));
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it("removes the revision from the registry and deletes its persisted file", async () => {
    const before = (await readdir(join(dataDir, "profiles"))).length;
    const result = await host.retireProfile("test:demo@2.0.0");

    expect(result).toEqual({ profile_id: "test:demo", version: "2.0.0" });
    expect(host.profiles.versionsOf("test:demo")).toEqual(["1.0.0"]);
    expect(host.profiles.has("test:demo@2.0.0")).toBe(false);
    expect((await readdir(join(dataDir, "profiles"))).length).toBe(before - 1);

    const reopened = new Host({ dataDir, noPlugins: true });
    await reopened.load();
    expect(reopened.profiles.versionsOf("test:demo")).toEqual(["1.0.0"]);
  });

  it("refuses while a workbook is bound to the revision, naming the workbook", async () => {
    await host.createProject({ workbook_id: "wb-bound", name: "Bound", profile_id: "test:demo" });
    const err = await expectRefusal(() => host.retireProfile("test:demo@2.0.0"), "conflict");
    expect(err.evidence?.["workbooks"]).toEqual(["wb-bound"]);
    expect(host.profiles.has("test:demo@2.0.0")).toBe(true);
  });

  it("refuses while an unpinned workbook resolves to the revision", async () => {
    // An unpinned (pre-revision) workbook resolves to the OLDEST revision,
    // so 1.0.0 is referenced even though the binding names no version.
    await host.createProject({ workbook_id: "wb-old", name: "Old", profile_id: "test:demo@1.0.0" });
    const err = await expectRefusal(() => host.retireProfile("test:demo@1.0.0"), "conflict");
    expect(err.evidence?.["workbooks"]).toEqual(["wb-old"]);
  });

  it("refuses while another profile extends the revision", async () => {
    await host.registerProfile({
      ...revision("1.0.0"),
      id: "test:child",
      primitive_types: [],
      relation_types: [],
      categories: [],
      scopes: [],
      extends: ["test:demo@2.0.0"],
    } as DomainProfile);

    const err = await expectRefusal(() => host.retireProfile("test:demo@2.0.0"), "conflict");
    expect(err.evidence?.["dependents"]).toEqual(["test:child@1.0.0"]);
  });

  it("refuses a plugin-contributed revision and names the plugin to disable", async () => {
    host.registerPluginProfile(revision("3.0.0"), "test.owner");
    const err = await expectRefusal(
      () => host.retireProfile("test:demo@3.0.0"),
      "conflict",
      "plugin_owned",
    );
    expect(err.evidence?.["plugin_id"]).toBe("test.owner");
  });

  it("refuses a Core-owned profile", async () => {
    await expectRefusal(() => host.retireProfile("core:empty"), "permission", "reserved_namespace");
  });

  it("reports not_found for a revision that was never registered", async () => {
    const err = await expectRefusal(() => host.retireProfile("test:demo@9.9.9"), "not_found");
    expect(err.evidence?.["registered_versions"]).toEqual(["1.0.0", "2.0.0"]);
  });

  it("retires the newest revision when the ref names no version", async () => {
    await host.retireProfile("test:demo");
    expect(host.profiles.versionsOf("test:demo")).toEqual(["1.0.0"]);
  });
});
