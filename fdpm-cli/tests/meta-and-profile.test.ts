import { describe, it, expect } from "vitest";
import { newHost, TEST_PROFILE } from "./fixtures.js";
import { CORE_EMPTY_PROFILE } from "../src/core/profile/core-empty.js";
import { ProfileRegistry } from "../src/core/profile/registry.js";
import { DomainProfile } from "../src/core/models/meta.js";
import { FDPMException } from "../src/core/errors/fdpm-exception.js";

describe("§4 meta-model & §1.5 core:empty", () => {
  it("core-meta-003: core:empty is registered at host startup with zero plugins installed", async () => {
    const host = await newHost();
    expect(host.profiles.has("core:empty")).toBe(true);
    const resolved = host.profiles.getResolved("core:empty");
    expect(resolved.id).toBe("core:empty");
    expect(resolved.primitive_types).toHaveLength(0);
    expect(resolved.relation_types).toHaveLength(0);
    expect(resolved.scopes).toHaveLength(1);
  });

  it("core-meta-001: meta-model rejects extra fields and missing required fields", () => {
    const bad = { id: "test:x", version: "1.0.0" }; // missing required fields
    expect(DomainProfile.safeParse(bad).success).toBe(false);
    const stricter = { ...TEST_PROFILE, surprise_extra: 42 } as unknown;
    expect(DomainProfile.safeParse(stricter).success).toBe(false);
  });

  it("core-graphops-meta-001: is_partition_unit defaults to false when absent", () => {
    const parsed = DomainProfile.parse({
      id: "test:y",
      version: "1.0.0",
      label: "Y",
      categories: [],
      scopes: [],
      primitive_types: [
        {
          id: "test:thing",
          fields: [],
          id_format: { pattern: ".*" },
          inline_structs: [],
        },
      ],
      relation_types: [],
      validation_rules: [],
      renderer_bindings: [],
      inline_structs: [],
    });
    expect(parsed.primitive_types[0]?.is_partition_unit).toBe(false);
  });
});

describe("§4.3 profile resolution", () => {
  it("core-meta-002: detects circular extends", () => {
    const r = new ProfileRegistry();
    r.register({ ...CORE_EMPTY_PROFILE, id: "test:a", extends: ["test:b"] });
    r.register({ ...CORE_EMPTY_PROFILE, id: "test:b", extends: ["test:a"] });
    expect(() => r.getResolved("test:a")).toThrow(/circular/);
  });

  it("core-meta-002: detects ID collisions across the chain", () => {
    const r = new ProfileRegistry();
    const dup = { ...TEST_PROFILE, id: "test:base" };
    r.register(dup);
    r.register({
      ...TEST_PROFILE,
      id: "test:child",
      extends: ["test:base"],
    });
    // test:child extends test:base; both have test:section -> collision
    expect(() => r.getResolved("test:child")).toThrow(/ID collision/);
  });

  it("core-meta-002: returns flattened profile for valid extends", () => {
    const r = new ProfileRegistry();
    const empty: Omit<DomainProfile, "id"> = {
      version: "1.0.0",
      label: "L",
      extends: [],
      categories: [],
      scopes: [],
      primitive_types: [],
      relation_types: [],
      validation_rules: [],
      renderer_bindings: [],
      inline_structs: [],
    };
    r.register({ ...empty, id: "test:base", categories: [{ id: "test:cat:base", label: "B" }] });
    r.register({
      ...empty,
      id: "test:child",
      extends: ["test:base"],
      categories: [{ id: "test:cat:child", label: "C" }],
    });
    const resolved = r.getResolved("test:child");
    const ids = resolved.categories.map((c) => c.id).sort();
    expect(ids).toEqual(["test:cat:base", "test:cat:child"]);
  });
});

describe("§11.3 reserved namespaces", () => {
  it("rejects re-registration of core:empty by external caller", async () => {
    const host = await newHost();
    expect(() => host.profiles.register(CORE_EMPTY_PROFILE)).toThrow(FDPMException);
  });
});
