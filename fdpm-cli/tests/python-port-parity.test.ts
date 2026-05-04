import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PROFILE as FORMAL_SPEC_PROFILE,
  PROFILE_ID as FORMAL_SPEC_PROFILE_ID,
} from "../plugins/formal_specification/index.js";
import {
  PROFILE as SOFTWARE_ARCHITECTURE_PROFILE,
  PROFILE_ID as SOFTWARE_ARCHITECTURE_PROFILE_ID,
} from "../plugins/software_architecture/index.js";

function readPythonPlugin(filename: string): string {
  return readFileSync(resolve(process.cwd(), "..", "src", "fdpm", "plugins", filename), "utf8");
}

function extractProfileId(source: string): string {
  const match = source.match(/\bid="([^"]+)"/);
  if (!match) throw new Error("profile id not found");
  return match[1];
}

function extractConstructorIds(source: string, ctor: string): string[] {
  return [...source.matchAll(new RegExp(`${ctor}\\(\\s*id="([^"]+)"`, "gms"))].map(
    (match) => match[1]!,
  );
}

describe("python port parity — formal_specification", () => {
  const python = readPythonPlugin("formal_specification.py");

  it("keeps the profile id aligned with the Python source", () => {
    expect(extractProfileId(python)).toBe(FORMAL_SPEC_PROFILE_ID);
  });

  it("keeps primitive, relation, validation-rule, and template ids aligned with the Python source", () => {
    expect(FORMAL_SPEC_PROFILE.primitive_types.map((item) => item.id).sort()).toEqual(
      extractConstructorIds(python, "PrimitiveTypeDef").sort(),
    );
    expect(FORMAL_SPEC_PROFILE.relation_types.map((item) => item.id).sort()).toEqual(
      extractConstructorIds(python, "RelationTypeDef").sort(),
    );
    expect(FORMAL_SPEC_PROFILE.validation_rules.map((item) => item.id).sort()).toEqual(
      extractConstructorIds(python, "ValidationRuleDef").sort(),
    );
    expect(FORMAL_SPEC_PROFILE.templates.map((item) => item.id).sort()).toEqual(
      extractConstructorIds(python, "TemplateDef").sort(),
    );
  });
});

describe("python port parity — software_architecture", () => {
  const python = readPythonPlugin("software_architecture.py");

  it("keeps the profile id aligned with the Python source", () => {
    expect(extractProfileId(python)).toBe(SOFTWARE_ARCHITECTURE_PROFILE_ID);
  });

  it("preserves every Python-source primitive, relation, validation-rule, renderer, and template id", () => {
    const primitiveIds = new Set(
      SOFTWARE_ARCHITECTURE_PROFILE.primitive_types.map((item) => item.id),
    );
    const relationIds = new Set(
      SOFTWARE_ARCHITECTURE_PROFILE.relation_types.map((item) => item.id),
    );
    const validationRuleIds = new Set(
      SOFTWARE_ARCHITECTURE_PROFILE.validation_rules.map((item) => item.id),
    );
    const rendererIds = new Set(
      SOFTWARE_ARCHITECTURE_PROFILE.renderers.map((item) => item.renderer_id),
    );
    const templateIds = new Set(SOFTWARE_ARCHITECTURE_PROFILE.templates.map((item) => item.id));

    for (const id of extractConstructorIds(python, "PrimitiveTypeDef")) {
      expect(primitiveIds.has(id)).toBe(true);
    }
    for (const id of extractConstructorIds(python, "RelationTypeDef")) {
      expect(relationIds.has(id)).toBe(true);
    }
    for (const id of extractConstructorIds(python, "ValidationRuleDef")) {
      expect(validationRuleIds.has(id)).toBe(true);
    }
    for (const id of extractConstructorIds(python, "RendererBinding")) {
      expect(rendererIds.has(id)).toBe(true);
    }
    for (const id of extractConstructorIds(python, "TemplateDef")) {
      expect(templateIds.has(id)).toBe(true);
    }
  });
});
