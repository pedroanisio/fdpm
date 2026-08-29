/**
 * What `FieldDef.name` must actually guarantee.
 *
 * The schema enforced `^[a-z][a-z0-9_]*$` — a house style, not a
 * contract. SPEC-CORE states exactly one rule about the name (§ "Every
 * `FieldDef` has a `name` unique within its containing primitive or
 * struct"), and nothing in the host derives anything from its shape: a
 * name is an opaque key into `field_values`
 * (validation/pipeline.ts:396,408,602), and no case conversion exists
 * anywhere in core.
 *
 * The evidence that the pattern was the anomaly rather than the
 * violations: three independent parts of this codebase broke it — the
 * host's own profile compiler (`_item`), the bridge (`<field>Item`), and
 * three domain schemas whose vocabularies are legitimately camelCase
 * (`epistemicMethod`, `hasSeverity`, `ownedAttribute`). A rule that the
 * generator, the compiler and the domains all contradict is not
 * protecting anything.
 *
 * So: permit any identifier, forbid what would actually break — a name
 * that cannot be addressed in a `field_path` (dots, brackets,
 * whitespace, quotes) — and enforce the uniqueness SPEC-CORE does
 * require, which nothing checked at all.
 */
import { describe, expect, it } from "vitest";
import { DomainProfile, FieldDef } from "../src/core/models/meta.js";

const field = (name: string) => ({ name, kind: "string" as const, required: false, validations: [] });

describe("FieldDef.name — what is allowed", () => {
  it("accepts the snake_case house style", () => {
    for (const n of ["title", "owned_attribute", "x1", "a_b_c9"]) {
      expect(FieldDef.safeParse(field(n)).success, n).toBe(true);
    }
  });

  it("accepts a domain's own camelCase vocabulary", () => {
    // These are real names from academic-paper, uixo and UML.
    for (const n of ["epistemicMethod", "hasSeverity", "ownedAttribute", "publicationDate"]) {
      expect(FieldDef.safeParse(field(n)).success, n).toBe(true);
    }
  });

  it("accepts a leading underscore, which the compiler itself emits", () => {
    expect(FieldDef.safeParse(field("_item")).success).toBe(true);
    expect(FieldDef.safeParse(field("_meta")).success).toBe(true);
  });
});

describe("FieldDef.name — what is forbidden, and why", () => {
  it("rejects names that cannot be addressed in a field_path", () => {
    // Findings carry `field_path: "field_values.<name>"`; a dot or a
    // bracket makes that path ambiguous or unparseable.
    for (const n of ["a.b", "a[0]", "a b", 'a"b', "a/b", "a:b"]) {
      expect(FieldDef.safeParse(field(n)).success, n).toBe(false);
    }
  });

  it("rejects an empty name and one that starts with a digit", () => {
    expect(FieldDef.safeParse(field("")).success).toBe(false);
    expect(FieldDef.safeParse(field("1st")).success).toBe(false);
  });
});

describe("field-name uniqueness — the rule SPEC-CORE actually states", () => {
  const profileWith = (fields: Array<{ name: string }>) => ({
    id: "profile:dup-test:0.1",
    version: "0.1.0",
    label: "Duplicate-name test",
    primitive_types: [
      {
        id: "dup:Thing",
        id_format: { pattern: "^dup:Thing:[a-z0-9-]+$" },
        fields: fields.map((f) => field(f.name)),
      },
    ],
    relation_types: [],
  });

  it("rejects two fields with the same name on one primitive type", () => {
    const parsed = DomainProfile.safeParse(profileWith([{ name: "title" }, { name: "title" }]));
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => /unique|duplicate/i.test(i.message))).toBe(true);
      expect(parsed.error.issues.some((i) => i.message.includes("title"))).toBe(true);
    }
  });

  it("accepts distinct names, including ones differing only in case", () => {
    // `title` and `Title` are different keys in field_values, so both may
    // exist — surprising, but it is what the storage model says.
    expect(DomainProfile.safeParse(profileWith([{ name: "title" }, { name: "Title" }])).success).toBe(true);
  });
});
