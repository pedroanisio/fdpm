import { describe, it, expect } from "vitest";
import { parseLegacyType } from "../src/core/profile/compile.js";

/**
 * The legacy field-type spec parser bridges the Python source's open
 * type-string vocabulary to the CLI's structured `kind` enum.
 *
 * Vocabulary (mirrors src/fdpm/models/core.py FieldType.is_valid_spec):
 *   string, ConstrainedText, boolean, integer, float, ISO8601, StableID,
 *   SemVer, Enum["a","b",...], T[], StructField[X], StructField[X][]
 */
describe("legacy_type → kind translation", () => {
  it("primitive scalars", () => {
    expect(parseLegacyType("string", "x", "y", []).kind).toBe("string");
    expect(parseLegacyType("ConstrainedText", "x", "y", []).kind).toBe("text");
    expect(parseLegacyType("boolean", "x", "y", []).kind).toBe("boolean");
    expect(parseLegacyType("integer", "x", "y", []).kind).toBe("integer");
    expect(parseLegacyType("float", "x", "y", []).kind).toBe("number");
    expect(parseLegacyType("ISO8601", "x", "y", []).kind).toBe("datetime");
    expect(parseLegacyType("StableID", "x", "y", []).kind).toBe("string");
    expect(parseLegacyType("SemVer", "x", "y", []).kind).toBe("string");
  });

  it("Enum[...] yields enum kind with parsed values", () => {
    const r = parseLegacyType('Enum["a", "b", "c"]', "x", "y", []);
    expect(r.kind).toBe("enum");
    expect(r.enum_values).toEqual(["a", "b", "c"]);
  });

  it("string[] yields list of string", () => {
    const r = parseLegacyType("string[]", "x", "y", []);
    expect(r.kind).toBe("list");
    expect(r.item_field?.kind).toBe("string");
  });

  it("StructField[X][] yields list of struct", () => {
    const r = parseLegacyType("StructField[TensorSpec][]", "x", "y", []);
    expect(r.kind).toBe("list");
    expect(r.item_field?.kind).toBe("struct");
    expect(r.item_field?.struct_id).toBe("TensorSpec");
  });

  it("StructField[X] yields struct", () => {
    const r = parseLegacyType("StructField[Variable]", "x", "y", []);
    expect(r.kind).toBe("struct");
    expect(r.struct_id).toBe("Variable");
  });

  it("rejects an unknown spec", () => {
    expect(() => parseLegacyType("nonsense", "x", "y", [])).toThrow(/unknown spec/);
  });

  it("rejects empty Enum", () => {
    expect(() => parseLegacyType("Enum[]", "x", "y", [])).toThrow(/empty Enum/);
  });
});
