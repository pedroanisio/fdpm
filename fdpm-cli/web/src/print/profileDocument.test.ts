import { describe, it, expect } from "vitest";
import {
  buildProfileDocumentModel,
  describeField,
  documentTitle,
  normalizeTypeList,
  parseEnumValues,
  DOCUMENT_DISCLAIMER,
} from "./profileDocument";
import type { ProfileDetail, ProfileField } from "../types";

const FIXED = new Date("2026-07-13T12:00:00.000Z");

function field(partial: Partial<ProfileField> & { name: string; kind: string }): ProfileField {
  return { required: false, ...partial };
}

const SAMPLE: ProfileDetail = {
  id: "profile:spec-authoring:0.1",
  version: "0.1.0",
  name: "Spec Authoring",
  label: "Spec Authoring",
  description: "  Author formal specifications.  ",
  extends: ["core:empty", "core:empty", "dnis:base"],
  primitive_types: [
    {
      id: "spec:Requirement",
      name: "Requirement",
      category: "requirements",
      description: "A normative requirement.",
      scoped: false,
      id_format: { pattern: "spec:req:{number}", uniqueness: "global", pattern_kind: "template" },
      fields: [
        field({ name: "statement", kind: "text", legacy_type: "ConstrainedText", required: true }),
        field({
          name: "strength",
          kind: "enum",
          legacy_type: 'Enum["MUST", "MUST_NOT", "SHOULD", "SHOULD_NOT", "MAY"]',
          required: true,
        }),
        field({ name: "verifier_ref", kind: "string", legacy_type: "string", required: false }),
      ],
    },
  ],
  relation_types: [
    {
      id: "spec:Verifies",
      name: "Verifies",
      source_types: ["spec:ConformanceItem", "spec:AcceptanceCriterion"],
      target_types: "spec:Requirement",
      fields: [],
    },
    {
      id: "spec:Cites",
      name: "Cites",
      source_types: "*",
      target_types: ["spec:Reference"],
    },
  ],
};

describe("normalizeTypeList", () => {
  it("wraps a lone string into a single-element array", () => {
    expect(normalizeTypeList("spec:Requirement")).toEqual(["spec:Requirement"]);
  });
  it("returns [] for undefined", () => {
    expect(normalizeTypeList(undefined)).toEqual([]);
  });
  it("dedupes while preserving order and trims blanks", () => {
    expect(normalizeTypeList(["a", "b", "a", " ", "c"])).toEqual(["a", "b", "c"]);
  });
  it("passes the wildcard through", () => {
    expect(normalizeTypeList("*")).toEqual(["*"]);
  });
});

describe("parseEnumValues", () => {
  it("parses quoted string enums", () => {
    expect(parseEnumValues('Enum["stable", "draft", "deprecated"]')).toEqual([
      "stable",
      "draft",
      "deprecated",
    ]);
  });
  it("parses unquoted numeric enums", () => {
    expect(parseEnumValues("Enum[5, 10, 15]")).toEqual(["5", "10", "15"]);
  });
  it("returns null for non-enum legacy types", () => {
    expect(parseEnumValues("ConstrainedText")).toBeNull();
    expect(parseEnumValues("string[]")).toBeNull();
    expect(parseEnumValues(undefined)).toBeNull();
  });
  it("returns [] for an empty enum", () => {
    expect(parseEnumValues("Enum[]")).toEqual([]);
  });
});

describe("describeField", () => {
  it("exposes enum members for enum fields", () => {
    const d = describeField(
      field({ name: "priority", kind: "enum", legacy_type: 'Enum["must", "should"]', required: true }),
    );
    expect(d.enumValues).toEqual(["must", "should"]);
    expect(d.typeLabel).toBe("enum");
    expect(d.required).toBe(true);
    // enum values are shown separately, so the raw type is suppressed
    expect(d.rawType).toBeUndefined();
  });
  it("suppresses a raw type identical to the kind", () => {
    const d = describeField(field({ name: "x", kind: "string", legacy_type: "string" }));
    expect(d.rawType).toBeUndefined();
    expect(d.enumValues).toBeNull();
  });
  it("keeps an informative raw type (e.g. list element type)", () => {
    const d = describeField(field({ name: "tags", kind: "list", legacy_type: "string[]" }));
    expect(d.rawType).toBe("string[]");
  });
});

describe("buildProfileDocumentModel", () => {
  const model = buildProfileDocumentModel(SAMPLE, FIXED);

  it("uses the label as title and trims the description", () => {
    expect(model.title).toBe("Spec Authoring");
    expect(model.description).toBe("Author formal specifications.");
  });

  it("normalizes the extends chain (dedup, order)", () => {
    expect(model.extends).toEqual(["core:empty", "dnis:base"]);
  });

  it("computes totals across primitives and relations", () => {
    expect(model.totals.primitiveTypes).toBe(1);
    expect(model.totals.relationTypes).toBe(2);
    expect(model.totals.fields).toBe(3); // 3 requirement fields, relations have none
    expect(model.totals.requiredFields).toBe(2); // statement + strength
  });

  it("projects the primitive with normalized id_format and fields", () => {
    const req = model.primitives[0];
    expect(req.id).toBe("spec:Requirement");
    expect(req.idFormat).toEqual({
      pattern: "spec:req:{number}",
      patternKind: "template",
      uniqueness: "global",
    });
    expect(req.fields.map((f) => f.name)).toEqual(["statement", "strength", "verifier_ref"]);
    expect(req.fields[1].enumValues).toContain("MUST_NOT");
  });

  it("normalizes relation source/target lists including the wildcard", () => {
    const verifies = model.relations.find((r) => r.id === "spec:Verifies")!;
    expect(verifies.sources).toEqual(["spec:ConformanceItem", "spec:AcceptanceCriterion"]);
    expect(verifies.targets).toEqual(["spec:Requirement"]);

    const cites = model.relations.find((r) => r.id === "spec:Cites")!;
    expect(cites.sources).toEqual(["*"]);
  });

  it("stamps the injected generation time deterministically", () => {
    expect(model.generatedAt).toBe("2026-07-13T12:00:00.000Z");
  });

  it("handles a profile with no types without throwing", () => {
    const empty: ProfileDetail = {
      id: "core:empty",
      version: "1.0.0",
      name: "Core",
      label: "Core (empty)",
      primitive_types: [],
      relation_types: [],
    };
    const m = buildProfileDocumentModel(empty, FIXED);
    expect(m.totals).toEqual({
      primitiveTypes: 0,
      relationTypes: 0,
      fields: 0,
      requiredFields: 0,
    });
    expect(m.extends).toEqual([]);
  });
});

describe("documentTitle", () => {
  it("builds a readable reference title", () => {
    expect(documentTitle({ id: "profile:x:1", label: "Planning", name: "Planning" })).toBe(
      "Planning — Profile Reference",
    );
  });
  it("falls back to id when label and name are empty", () => {
    expect(documentTitle({ id: "profile:x:1", label: "", name: "" })).toBe(
      "profile:x:1 — Profile Reference",
    );
  });
});

describe("DOCUMENT_DISCLAIMER", () => {
  it("carries the project epistemic notice", () => {
    expect(DOCUMENT_DISCLAIMER).toMatch(/taken for granted/);
  });
});
