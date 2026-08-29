/**
 * The three normalisations that make schemas-lib's UML representable in
 * FDPM. Each is forced by a host rule, so each is asserted against that
 * rule rather than against itself.
 */
import { describe, expect, it } from "vitest";
import { DomainProfile } from "../../../src/core/models/meta.js";
import {
  normalizeUpper,
  toValueSpecification,
} from "../../../plugins/uml/ingest.js";
import { UNLIMITED, Schemas } from "../../../plugins/uml/schemas/uml-foundation.js";
import profile from "../../../plugins/uml/generated/profile.json" with { type: "json" };

const FIELD_NAME_RE = /^[a-z][a-z0-9_]*$/;

describe("field-name normalisation", () => {
  it("every generated field name satisfies the host's FieldDef.name rule", () => {
    const offenders: string[] = [];
    for (const pt of profile.primitive_types) {
      for (const f of pt.fields as Array<{ name: string }>) {
        if (!FIELD_NAME_RE.test(f.name)) offenders.push(`${pt.id}.${f.name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the type definitions are accepted by DomainProfile (the parser that rejected camelCase)", () => {
    // The bridge writes `enum_defs` and `constraints` alongside the
    // profile; DomainProfile governs the type definitions themselves,
    // which is what the field-name rule lives in. End-to-end
    // registration is asserted in profile-activation.test.ts.
    const { enum_defs: _enums, constraints: _constraints, ...typeDefs } = profile as Record<string, unknown>;
    const parsed = DomainProfile.safeParse(typeDefs);
    expect(parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`)).toEqual([]);
  });

  it("keeps XMI identity under a legal name", () => {
    for (const pt of profile.primitive_types) {
      const names = (pt.fields as Array<{ name: string }>).map((f) => f.name);
      expect(names).toContain("xmi_id");
      expect(names).not.toContain("xmi:id");
    }
  });
});

describe("multiplicity upper bound", () => {
  it('maps UML "*" to the UNLIMITED sentinel and leaves finite bounds alone', () => {
    expect(normalizeUpper("*")).toBe(UNLIMITED);
    expect(normalizeUpper(1)).toBe(1);
    expect(normalizeUpper(0)).toBe(0);
    expect(normalizeUpper(undefined)).toBeUndefined();
  });

  it("stores `upper` as a number, never a json-union blob", () => {
    const property = profile.primitive_types.find((p) => p.id === "uml:Property");
    const upper = (property?.fields as Array<{ name: string; kind: string; format?: string }>).find(
      (f) => f.name === "upper",
    );
    expect(upper?.kind).toBe("number");
    expect(upper?.format).toBeUndefined();
  });

  it("accepts UNLIMITED but rejects any other negative bound", () => {
    expect(Schemas.Property.safeParse({ xmi_id: "01HQ8Z3K7M4N5P6R7S8T9V0001", upper: UNLIMITED }).success).toBe(true);
    expect(Schemas.Property.safeParse({ xmi_id: "01HQ8Z3K7M4N5P6R7S8T9V0001", upper: -2 }).success).toBe(false);
  });
});

describe("ValueSpecification", () => {
  it("lifts each raw literal to its UML kind (§8.3)", () => {
    expect(toValueSpecification("abc")).toEqual({ kind: "literal_string", body: "abc" });
    expect(toValueSpecification(3)).toEqual({ kind: "literal_integer", body: "3" });
    expect(toValueSpecification(1.5)).toEqual({ kind: "literal_real", body: "1.5" });
    expect(toValueSpecification(true)).toEqual({ kind: "literal_boolean", body: "true" });
    expect(toValueSpecification(null)).toEqual({ kind: "literal_null", body: "" });
    expect(toValueSpecification(undefined)).toBeUndefined();
    expect(toValueSpecification({ body: "x > 0", language: "OCL" })).toEqual({
      kind: "opaque_expression",
      body: "x > 0",
      language: "OCL",
    });
  });

  it("is a struct field in the profile, not an untyped blob", () => {
    const property = profile.primitive_types.find((p) => p.id === "uml:Property");
    const dv = (property?.fields as Array<{ name: string; kind: string }>).find((f) => f.name === "default_value");
    expect(dv?.kind).toBe("struct");
  });
});
