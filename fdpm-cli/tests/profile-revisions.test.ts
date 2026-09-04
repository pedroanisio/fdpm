/**
 * Profile revisions — `(id, version)` is the registry key.
 *
 * Before this contract a profile id could be registered exactly once
 * (`ProfileRegistry.register` threw `conflict` on a known id) and nothing
 * anywhere unregistered one, so an agent that mis-authored a profile over
 * `fdpm.profile.register` burned that id permanently.
 *
 * Making the id reusable is only safe if a workbook cannot be re-pointed at
 * a schema it was not created against: the workbook record pins the version
 * it bound to, and `extends` parents are pinned at registration. Both are
 * asserted here, because "register a second revision" without them is a
 * silent retroactive re-validation of every existing workbook.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Host } from "../src/core/host.js";
import { ProfileRegistry } from "../src/core/profile/registry.js";
import { FDPMException } from "../src/core/errors/fdpm-exception.js";
import { compareProfileVersions, parseProfileRef } from "../src/core/profile/version.js";
import type { DomainProfile } from "../src/core/models/meta.js";
import { TEST_PROFILE } from "./fixtures.js";

function revision(version: string, over: Partial<DomainProfile> = {}): DomainProfile {
  return { ...TEST_PROFILE, version, ...over } as DomainProfile;
}

describe("profile ref parsing and version ordering", () => {
  it("splits an `id@version` ref and leaves a bare id unpinned", () => {
    expect(parseProfileRef("test:demo@1.2.0")).toEqual({ id: "test:demo", version: "1.2.0" });
    expect(parseProfileRef("test:demo")).toEqual({ id: "test:demo" });
  });

  it("orders versions numerically, not lexically", () => {
    expect(compareProfileVersions("1.10.0", "1.9.0")).toBeGreaterThan(0);
    expect(compareProfileVersions("2.0.0", "10.0.0")).toBeLessThan(0);
    expect(compareProfileVersions("1.0.0", "1.0.0")).toBe(0);
  });
});

describe("ProfileRegistry — revisions of one id coexist", () => {
  let registry: ProfileRegistry;

  beforeEach(() => {
    registry = new ProfileRegistry();
  });

  it("accepts a second version of a registered id", () => {
    registry.register(revision("1.0.0"));
    registry.register(revision("2.0.0"));
    expect(registry.versionsOf("test:demo")).toEqual(["1.0.0", "2.0.0"]);
  });

  it("still rejects the same (id, version) twice", () => {
    registry.register(revision("1.0.0"));
    expect(() => registry.register(revision("1.0.0"))).toThrow(FDPMException);
    try {
      registry.register(revision("1.0.0"));
    } catch (err) {
      expect((err as FDPMException).category).toBe("conflict");
      expect((err as FDPMException).evidence?.["registered_versions"]).toEqual(["1.0.0"]);
    }
  });

  it("resolves a bare id to the newest revision and an `@version` ref exactly", () => {
    registry.register(revision("1.0.0"));
    registry.register(revision("2.0.0"));
    expect(registry.getRaw("test:demo").version).toBe("2.0.0");
    expect(registry.getRaw("test:demo@1.0.0").version).toBe("1.0.0");
    expect(registry.getResolved("test:demo@1.0.0").version).toBe("1.0.0");
  });

  it("reports presence per id and per revision", () => {
    registry.register(revision("1.0.0"));
    expect(registry.has("test:demo")).toBe(true);
    expect(registry.has("test:demo@1.0.0")).toBe(true);
    expect(registry.has("test:demo@2.0.0")).toBe(false);
  });

  it("names the registered revisions when a ref points at no revision", () => {
    registry.register(revision("1.0.0"));
    try {
      registry.getRaw("test:demo@9.9.9");
      throw new Error("expected not_found");
    } catch (err) {
      expect((err as FDPMException).category).toBe("not_found");
      expect((err as FDPMException).evidence?.["registered_versions"]).toEqual(["1.0.0"]);
    }
  });

  it("unregisters one revision and leaves the others addressable", () => {
    registry.register(revision("1.0.0"));
    registry.register(revision("2.0.0"));
    registry.unregister("test:demo@1.0.0");
    expect(registry.versionsOf("test:demo")).toEqual(["2.0.0"]);
    expect(registry.getRaw("test:demo").version).toBe("2.0.0");
  });

  it("refuses to unregister a ref that names no version", () => {
    registry.register(revision("1.0.0"));
    try {
      registry.unregister("test:demo");
      throw new Error("expected a refusal");
    } catch (err) {
      expect((err as FDPMException).category).toBe("verification");
      expect((err as FDPMException).evidence?.["registered_versions"]).toEqual(["1.0.0"]);
    }
    expect(registry.versionsOf("test:demo")).toEqual(["1.0.0"]);
  });

  it("refuses to unregister a revision that is not registered", () => {
    registry.register(revision("1.0.0"));
    expect(() => registry.unregister("test:demo@2.0.0")).toThrow(FDPMException);
  });

  it("pins an unpinned `extends` parent to the revision current at registration", () => {
    registry.register({ ...revision("1.0.0"), id: "test:parent" } as DomainProfile);
    registry.register({
      ...revision("1.0.0"),
      id: "test:child",
      primitive_types: [],
      relation_types: [],
      categories: [],
      scopes: [],
      extends: ["test:parent"],
    } as DomainProfile);

    expect(registry.getRaw("test:child").extends).toEqual(["test:parent@1.0.0"]);
  });

  it("keeps a child's resolved shape stable when the parent gains a revision", () => {
    registry.register({ ...revision("1.0.0"), id: "test:parent" } as DomainProfile);
    registry.register({
      ...revision("1.0.0"),
      id: "test:child",
      primitive_types: [],
      relation_types: [],
      categories: [],
      scopes: [],
      extends: ["test:parent"],
    } as DomainProfile);

    const extraType = {
      id: "test:added",
      fields: [],
      id_format: { pattern: "^added:[a-z]+$", uniqueness: "workbook" as const },
      inline_structs: [],
      is_partition_unit: false,
      scoped: false,
      constraints: [],
    };
    registry.register({
      ...revision("2.0.0"),
      id: "test:parent",
      primitive_types: [...TEST_PROFILE.primitive_types, extraType],
    } as DomainProfile);

    const typeIds = registry.getResolved("test:child").primitive_types.map((t) => t.id);
    expect(typeIds).not.toContain("test:added");
  });
});

describe("persisted revisions", () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "fdpm-profile-revisions-"));
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it("writes one file per revision and reloads both on a fresh host", async () => {
    const host = new Host({ dataDir, noPlugins: true });
    await host.load();
    await host.registerProfile(revision("1.0.0"));
    await host.registerProfile(revision("2.0.0"));

    const reopened = new Host({ dataDir, noPlugins: true });
    await reopened.load();
    expect(reopened.profiles.versionsOf("test:demo")).toEqual(["1.0.0", "2.0.0"]);
  });
});

describe("workbooks pin the profile revision they were created against", () => {
  let dataDir: string;
  let host: Host;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "fdpm-profile-pin-"));
    host = new Host({ dataDir, noPlugins: true });
    await host.load();
    await host.registerProfile(revision("1.0.0"));
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it("records the resolved version on the workbook", async () => {
    await host.createProject({ workbook_id: "wb-a", name: "A", profile_id: "test:demo" });
    const slice = host.store.getProject("wb-a");
    expect(slice.workbook.profile_id).toBe("test:demo");
    expect(slice.workbook.profile_version).toBe("1.0.0");
  });

  it("binds an explicit `id@version` ref without leaking the ref into profile_id", async () => {
    await host.registerProfile(revision("2.0.0"));
    await host.createProject({ workbook_id: "wb-b", name: "B", profile_id: "test:demo@1.0.0" });
    const slice = host.store.getProject("wb-b");
    expect(slice.workbook.profile_id).toBe("test:demo");
    expect(slice.workbook.profile_version).toBe("1.0.0");
  });

  it("keeps validating an existing workbook against its pinned revision", async () => {
    await host.createProject({ workbook_id: "wb-c", name: "C", profile_id: "test:demo" });
    await host.createPrimitive("wb-c", {
      id: "section:one",
      type_id: "test:section",
      field_values: { title: "One", number: 1 },
    });

    // A later revision makes `owner` required; the pinned workbook must not
    // start failing on primitives written under the revision it bound to.
    const stricter = revision("2.0.0", {
      primitive_types: TEST_PROFILE.primitive_types.map((t) =>
        t.id === "test:section"
          ? { ...t, fields: [...t.fields, { name: "owner", kind: "string" as const, required: true, validations: [] }] }
          : t,
      ),
    });
    await host.registerProfile(stricter);

    const report = host.validateProject("wb-c");
    expect(report.summary.errors).toBe(0);
  });

  it("binds a workbook created after the bump to the newer revision", async () => {
    await host.registerProfile(revision("2.0.0"));
    await host.createProject({ workbook_id: "wb-d", name: "D", profile_id: "test:demo" });
    expect(host.store.getProject("wb-d").workbook.profile_version).toBe("2.0.0");
  });

  it("resolves a workbook written before pinning existed to the oldest revision", async () => {
    await host.createProject({ workbook_id: "wb-e", name: "E", profile_id: "test:demo" });
    await host.registerProfile(revision("2.0.0"));

    // Simulate a pre-pinning log: strip the pin the create op recorded.
    const slice = host.store.getProject("wb-e");
    const unpinned = { ...slice.workbook };
    delete (unpinned as { profile_version?: string }).profile_version;

    expect(host.resolveProfileForWorkbook(unpinned).version).toBe("1.0.0");
  });
});
