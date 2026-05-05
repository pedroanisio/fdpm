/**
 * `fdpm.profile.type_info` (Tier 1, v0.1.1).
 *
 * Returns the minimum-sufficient construction contract for one type
 * within a (resolved) profile so an LLM can call create/replace
 * without round-tripping through full-profile fetches.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Host } from "../../src/core/host.js";
import { tool as typeInfoTool } from "../../src/mcp/tools/profile-type-info.js";

describe("fdpm.profile.type_info", () => {
  let host: Host;

  beforeEach(async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "mcp-typeinfo-"));
    host = new Host({ dataDir, noPlugins: true });
    await host.load();

    await host.registerProfile(
      {
        id: "profile:test-typeinfo:0.1",
        version: "0.1.0",
        extends: [],
        scopes: [],
        primitive_types: [
          {
            id: "test:Doc",
            fields: [
              { name: "title", kind: "string", required: true, validations: [] },
              { name: "tag", kind: "string", required: false, validations: [] },
            ],
            id_format: { pattern: "^test:doc:\\w+$", uniqueness: "project", pattern_kind: "regex" },
            inline_structs: [],
            is_partition_unit: false,
            scoped: false,
            constraints: [],
            description: "A test document type.",
          },
        ],
        relation_types: [
          {
            id: "test:Cites",
            source_type_id: "test:Doc",
            target_type_id: "test:Doc",
            cardinality: "many-to-many",
            fields: [
              { name: "page", kind: "number", required: false, validations: [] },
            ],
            symmetric: false,
            transitive: false,
            description: "Cites relation.",
          },
        ],
      },
      false,
    );
  });

  it("returns primitive type info with kind, id_pattern, fields, required_field_names", async () => {
    const result = await typeInfoTool.handler(
      host,
      { profile_id: "profile:test-typeinfo:0.1", type_id: "test:Doc" },
      {} as never,
    );
    expect(result.kind).toBe("primitive");
    expect((result as { type_id: string }).type_id).toBe("test:Doc");
    expect((result as { id_pattern: string }).id_pattern).toBe("^test:doc:\\w+$");
    expect((result as { id_uniqueness: string }).id_uniqueness).toBe("project");
    expect((result as { required_field_names: string[] }).required_field_names).toEqual(["title"]);
    expect((result as { fields: unknown[] }).fields).toHaveLength(2);
  });

  it("returns relation type info with kind, source/target, fields", async () => {
    const result = await typeInfoTool.handler(
      host,
      { profile_id: "profile:test-typeinfo:0.1", type_id: "test:Cites" },
      {} as never,
    );
    expect(result.kind).toBe("relation");
    expect((result as { source_type_id?: string }).source_type_id).toBe("test:Doc");
    expect((result as { target_type_id?: string }).target_type_id).toBe("test:Doc");
    expect((result as { required_field_names: string[] }).required_field_names).toEqual([]);
    expect((result as { fields: unknown[] }).fields).toHaveLength(1);
  });

  it("throws not_found for unknown profile", async () => {
    await expect(
      typeInfoTool.handler(host, { profile_id: "profile:nope:0.1", type_id: "test:Doc" }, {} as never),
    ).rejects.toThrow();
  });

  it("throws not_found for unknown type id", async () => {
    await expect(
      typeInfoTool.handler(
        host,
        { profile_id: "profile:test-typeinfo:0.1", type_id: "test:Unknown" },
        {} as never,
      ),
    ).rejects.toThrow(/not found/);
  });

  it("input schema validates correctly", () => {
    expect(
      typeInfoTool.input.safeParse({ profile_id: "p", type_id: "t" }).success,
    ).toBe(true);
    expect(typeInfoTool.input.safeParse({ profile_id: "p" }).success).toBe(false);
    expect(typeInfoTool.input.safeParse({ profile_id: "", type_id: "t" }).success).toBe(false);
  });

  it("output schema accepts both primitive and relation shapes", async () => {
    const primitive = await typeInfoTool.handler(
      host,
      { profile_id: "profile:test-typeinfo:0.1", type_id: "test:Doc" },
      {} as never,
    );
    expect(typeInfoTool.output.safeParse(primitive).success).toBe(true);

    const relation = await typeInfoTool.handler(
      host,
      { profile_id: "profile:test-typeinfo:0.1", type_id: "test:Cites" },
      {} as never,
    );
    expect(typeInfoTool.output.safeParse(relation).success).toBe(true);
  });
});
