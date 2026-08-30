/**
 * The derivation is the plugin. These tests pin the numbers it produces
 * and the properties that make it correct, so a re-vendored ontology that
 * changes them fails here rather than silently shipping a weaker profile.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ENTITY_QNAMES,
  buildEntitySchemas,
  collectEdgeFields,
  derivationSummary,
  deriveRelationTypes,
  entityName,
  qnameOf,
  rangeClosure,
  rangeConflicts,
  relationTypeId,
  unclassifiedIdArrays,
} from "../../../plugins/uixo/derive.js";
import { RELATION_TYPES, UIXO_SOURCE_SHA256 } from "../../../plugins/uixo/sidecar.js";
import profile from "../../../plugins/uixo/generated/profile.json" with { type: "json" };
import { NODE_COMMAND, tsxArgs } from "../../_helpers/process.js";

describe("the vendored source", () => {
  it("is the ontology build this plugin was derived from", () => {
    expect(UIXO_SOURCE_SHA256).toBe(
      "bd808d5130922949c78d3fffd5774c4e3f48deee4b48c7af9beaba401c76cdfd",
    );
  });

  it("still carries the vendoring header, unedited in the body", () => {
    const out = execFileSync(
      NODE_COMMAND,
      tsxArgs([
        join(process.cwd(), "plugins", "uixo", "scripts", "vendor-uixo.ts"),
        "--check",
      ]),
      { encoding: "utf8", cwd: process.cwd() },
    );
    expect(out).toContain("header intact");
  });
});

describe("edge extraction", () => {
  it("finds every graph edge and classifies all of them", () => {
    const s = derivationSummary();
    expect(s.entities).toBe(712);
    expect(s.edgeFields).toBe(1653);
    expect(s.relationTypes).toBe(210);
    // The failure mode this guards: an id-array field with no parseable
    // range would stay an unchecked string list, exactly the defect the
    // plugin exists to remove.
    expect(s.unclassified).toBe(0);
  });

  it("leaves no id-array field behind", () => {
    expect(unclassifiedIdArrays()).toEqual([]);
  });

  it("collapses 1,653 occurrences to 210 properties, not 1,653 relations", () => {
    const edges = collectEdgeFields();
    expect(edges.length).toBe(1653);
    expect(new Set(edges.map((e) => e.field)).size).toBe(210);
    expect(deriveRelationTypes(edges)).toHaveLength(210);
  });
});

describe("target sets come from the ontology's own hierarchy", () => {
  it("expands a range to its concrete subclasses", () => {
    // uixo:Component is the widest range in the ontology.
    const components = rangeClosure("uixo:Component");
    expect(components.length).toBe(272);
    expect(components).toContain("uixo:Button");
    // Cross-namespace: the hierarchy is not confined to one prefix, which
    // is why a per-namespace profile split is not possible.
    expect(components.some((c) => !c.startsWith("uixo:"))).toBe(true);
  });

  it("gives hasChildComponent the Component closure as both endpoints", () => {
    const rel = RELATION_TYPES.find((r) => r.id === relationTypeId("hasChildComponent"))!;
    expect(rel.source_types).toHaveLength(272);
    expect(rel.target_types).toHaveLength(272);
    expect(rel.target_types).toContain("uixo:Uixo_Button");
  });

  it("opens exactly the owl:Thing edges to every class, and no others", () => {
    const wide = RELATION_TYPES.filter((r) => r.target_types.length === ENTITY_QNAMES.length);
    expect(wide).toHaveLength(10);
    for (const r of wide) expect(r.description).toContain("owl:Thing");
    // Everything else is narrower than the whole ontology.
    const rest = RELATION_TYPES.filter((r) => r.target_types.length < ENTITY_QNAMES.length);
    expect(rest).toHaveLength(200);
    expect(Math.min(...rest.map((r) => r.target_types.length))).toBeGreaterThan(0);
  });

  it("records the one property declared with two ranges rather than silently widening", () => {
    const conflicts = rangeConflicts();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.field).toBe("rendersArticle");
    expect(conflicts[0]!.ranges).toEqual(["uixoarticle:Article", "uixowiki:WikiArticle"]);
  });
});

describe("entity names round-trip", () => {
  it("qnameOf inverts entityName for all 712 classes", () => {
    for (const q of ENTITY_QNAMES) expect(qnameOf(entityName(q))).toBe(q);
  });

  it("disambiguates the local names that collide across prefixes", () => {
    // Five local names are declared in two namespaces each. Dropping the
    // prefix from the entity name would silently merge each pair into one
    // primitive type — ten distinct ontology classes becoming five.
    const byLocal = new Map<string, string[]>();
    for (const q of ENTITY_QNAMES) {
      const local = q.split(":")[1]!;
      byLocal.set(local, [...(byLocal.get(local) ?? []), q]);
    }
    const collisions = [...byLocal.entries()].filter(([, qs]) => qs.length > 1);
    expect(collisions.map(([local]) => local).sort()).toEqual([
      "InlineCode",
      "LanguageSelector",
      "NavigationItem",
      "PromptComposer",
      "VisualLayer",
    ]);
    for (const [, qs] of collisions) {
      expect(new Set(qs.map(entityName)).size).toBe(qs.length);
    }
  });

  it("emits 712 distinct primitive type ids — no class is merged away", () => {
    expect(new Set(ENTITY_QNAMES.map(entityName)).size).toBe(ENTITY_QNAMES.length);
  });
});

describe("entity schemas have their edges lifted out", () => {
  it("omits every edge field, keeping the attributes", () => {
    const shape = buildEntitySchemas()["Uixo_Button"]!.shape;
    expect(Object.keys(shape)).toContain("label");
    // Names are the ontology's own; FieldDef.name requires an identifier,
    // not a house style.
    expect(Object.keys(shape)).toContain("orderIndex");
    expect(Object.keys(shape)).not.toContain("hasChildComponent");
    expect(Object.keys(shape)).not.toContain("parentComponent");
  });

  it("keeps the schemas strict, so a lifted field is rejected not ignored", () => {
    const button = buildEntitySchemas()["Uixo_Button"]!;
    const withEdge = button.safeParse({
      id: "ex:b",
      type: "uixo:Button",
      hasChildComponent: ["ex:x"],
    });
    expect(withEdge.success).toBe(false);
  });
});

describe("the emitted profile", () => {
  it("carries 712 primitive types and 210 relation types", () => {
    expect(profile.primitive_types).toHaveLength(712);
    expect(profile.relation_types).toHaveLength(210);
  });

  it("has no list-typed and no json-union field", () => {
    const bad: string[] = [];
    for (const pt of profile.primitive_types) {
      for (const f of pt.fields as { name: string; kind?: string; format?: string }[]) {
        if (f.kind === "list" || f.format === "json-union") bad.push(`${pt.id}.${f.name}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("satisfies FieldDef.name — identifiers, unique within each type", () => {
    // The host requires an identifier (nothing that would make
    // `field_values.<name>` ambiguous) and uniqueness within the type.
    const bad: string[] = [];
    for (const pt of profile.primitive_types) {
      const seen = new Set<string>();
      for (const f of pt.fields as { name: string }[]) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(f.name)) bad.push(`${pt.id}.${f.name} (shape)`);
        if (seen.has(f.name)) bad.push(`${pt.id}.${f.name} (duplicate)`);
        seen.add(f.name);
      }
    }
    expect(bad).toEqual([]);
  });

  it("keeps exactly one declared opaque field per class — the extensions record", () => {
    const records = profile.primitive_types.filter((pt) =>
      (pt.fields as { name: string; format?: string }[]).some(
        (f) => f.name === "extensions" && f.format === "json-record",
      ),
    );
    expect(records).toHaveLength(712);
  });
});
