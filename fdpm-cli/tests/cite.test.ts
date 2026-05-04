import { describe, it, expect } from "vitest";
import { Host } from "../src/core/host.js";
import type { DomainProfile } from "../src/core/models/meta.js";
import { sanitizeIdPart } from "../src/commands/primitive.js";

/**
 * #8 — `host.createRelation` with the fs:References shape that
 * `primitive cite` produces.
 *
 * The CLI command is sugar over createRelation; testing the host call
 * directly verifies that a citation-binding relation lands with the
 * expected fields. The CLI's only added value is auto-generating the
 * relation id, which is a pure string operation tested separately.
 */

const CITATION_PROFILE: DomainProfile = {
  id: "test:cite",
  version: "1.0.0",
  label: "Citation Demo",
  extends: [],
  categories: [{ id: "test:cat", label: "X" }],
  scopes: [],
  primitive_types: [
    {
      id: "test:claim",
      fields: [{ name: "text", kind: "string", required: true, validations: [] }],
      id_format: { pattern: "^claim:[a-z0-9-]+$", uniqueness: "project" },
      inline_structs: [],
      is_partition_unit: false,
    },
    {
      id: "test:source",
      fields: [{ name: "url", kind: "string", required: true, validations: [] }],
      id_format: { pattern: "^source:[a-z0-9-]+$", uniqueness: "project" },
      inline_structs: [],
      is_partition_unit: false,
    },
  ],
  relation_types: [
    {
      id: "test:rel:cites",
      source_type_id: "test:claim",
      target_type_id: "test:source",
      cardinality: "many-to-many",
      fields: [
        {
          name: "kind",
          kind: "enum",
          required: true,
          enum_values: ["uses", "refines", "overrides", "see_also"],
          validations: [],
        },
        { name: "context", kind: "string", required: false, validations: [] },
      ],
    },
  ],
  validation_rules: [],
  renderer_bindings: [],
  inline_structs: [],
};

async function newCitationHost() {
  const host = new Host({ dataDir: null, noPlugins: true });
  await host.load();
  await host.registerProfile(CITATION_PROFILE);
  await host.createProject({ project_id: "p", name: "P", profile_id: "test:cite" });
  await host.createPrimitive("p", {
    id: "claim:single-writer",
    type_id: "test:claim",
    field_values: { text: "Each typed component has one writer." },
  });
  await host.createPrimitive("p", {
    id: "source:helland-2007",
    type_id: "test:source",
    field_values: { url: "https://example.com/helland-2007" },
  });
  return host;
}

describe("citation binding (sugar shape that `primitive cite` produces)", () => {
  it("creates a References-shaped relation with kind=see_also", async () => {
    const host = await newCitationHost();
    await host.createRelation("p", {
      id: "rel:cites:claim-single-writer-source-helland-2007",
      type_id: "test:rel:cites",
      source_id: "claim:single-writer",
      target_id: "source:helland-2007",
      field_values: { kind: "see_also", context: "Primary source." },
    });
    const slice = host.getProject("p");
    const r = slice.relations["rel:cites:claim-single-writer-source-helland-2007"];
    expect(r).toBeDefined();
    expect(r?.field_values["kind"]).toBe("see_also");
    expect(r?.field_values["context"]).toBe("Primary source.");
  });

  describe("sanitizeIdPart", () => {
    it("strips colons (the FDPM id separator)", () => {
      expect(sanitizeIdPart("section:audit-log")).toBe("section-audit-log");
    });

    it("collapses runs of dashes", () => {
      expect(sanitizeIdPart("foo--bar")).toBe("foo-bar");
      expect(sanitizeIdPart("foo:::bar")).toBe("foo-bar");
    });

    it("strips leading and trailing dashes", () => {
      expect(sanitizeIdPart(":foo:")).toBe("foo");
      expect(sanitizeIdPart("---x---")).toBe("x");
    });

    it("preserves alphanumerics and internal dashes", () => {
      expect(sanitizeIdPart("rfc-9162")).toBe("rfc-9162");
    });

    it("handles complex id like principle:append-only-audit", () => {
      expect(sanitizeIdPart("principle:append-only-audit")).toBe("principle-append-only-audit");
    });

    it("handles id with non-ASCII gracefully", () => {
      // Non-ASCII chars dropped, no crash. Result still valid for relation id.
      expect(sanitizeIdPart("café:naïve")).toBe("caf-na-ve");
    });
  });

  it("rejects an invalid kind value at the relation layer", async () => {
    const host = await newCitationHost();
    await expect(
      host.createRelation("p", {
        id: "rel:cites:bad",
        type_id: "test:rel:cites",
        source_id: "claim:single-writer",
        target_id: "source:helland-2007",
        field_values: { kind: "cites" }, // not in enum
      }),
    ).rejects.toThrow(/validation|verification/i);
  });
});
