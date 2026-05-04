import { describe, it, expect } from "vitest";
import { PROFILE, manifest } from "../plugins/software_architecture/index.js";
import { PluginManifest } from "../src/plugin/manifest.js";

/**
 * Structural integrity audit for the software_architecture profile.
 *
 * Locks down the cross-reference and length invariants that the Python
 * source enforces at model-construction time (Pydantic validators) but
 * which the TypeScript runtime stores verbatim. Without these tests a
 * future edit could silently introduce a dangling reference, an inline
 * struct without a definition, or a description that the Python source
 * would reject.
 */

const catIds = new Set(PROFILE.categories.map((c) => c.id));
const typeIds = new Set(PROFILE.primitive_types.map((p) => p.id));

describe("software_architecture — structural integrity", () => {
  it("manifest passes the host's PluginManifest schema", () => {
    expect(() => PluginManifest.parse(manifest)).not.toThrow();
  });

  it("every primitive references a declared category", () => {
    for (const pt of PROFILE.primitive_types) {
      const cat = pt.category_id ?? pt.category;
      expect(catIds.has(cat!), `primitive ${pt.id} → category ${cat}`).toBe(true);
    }
  });

  it("every relation source/target type id resolves to a declared primitive (or '*')", () => {
    for (const rt of PROFILE.relation_types) {
      for (const k of ["source_types", "target_types"] as const) {
        const v = rt[k];
        if (v === "*" || v == null) continue;
        for (const t of v) {
          expect(typeIds.has(t), `relation ${rt.id}.${k} → ${t}`).toBe(true);
        }
      }
    }
  });

  it("every validation rule applies_to references a declared primitive", () => {
    for (const r of PROFILE.validation_rules) {
      for (const t of r.applies_to ?? []) {
        expect(typeIds.has(t), `rule ${r.id}.applies_to → ${t}`).toBe(true);
      }
    }
  });

  it("every StructField[X] field references an inline_struct defined on the same primitive", () => {
    for (const pt of PROFILE.primitive_types) {
      const inlineNames = new Set((pt.inline_structs ?? []).map((s) => s.name));
      for (const f of pt.fields) {
        const m = /^StructField\[([^\]]+)\]/.exec(f.legacy_type ?? "");
        if (m) {
          expect(
            inlineNames.has(m[1]!),
            `primitive ${pt.id}.${f.name} → undefined inline struct ${m[1]}`,
          ).toBe(true);
        }
      }
    }
  });

  it("every references-validation points at a declared primitive type", () => {
    for (const pt of PROFILE.primitive_types) {
      for (const f of pt.fields) {
        for (const v of f.validations ?? []) {
          if (v.kind === "references") {
            expect(typeIds.has(String(v.value)), `${pt.id}.${f.name} references ${v.value}`).toBe(
              true,
            );
          }
        }
      }
    }
  });

  it("respects Python source description-length caps", () => {
    const cap = (where: string, val: string | undefined, max: number) => {
      if (val != null) {
        expect(val.length, `${where} description length`).toBeLessThanOrEqual(max);
      }
    };
    cap("profile", PROFILE.description, 500);
    for (const c of PROFILE.categories) cap(`category ${c.id}`, c.description, 280);
    for (const s of PROFILE.scopes) cap(`scope ${s.id}`, s.description, 280);
    for (const pt of PROFILE.primitive_types) {
      cap(`primitive ${pt.id}`, pt.description, 280);
      for (const f of pt.fields) cap(`field ${pt.id}.${f.name}`, f.description, 140);
      for (const s of pt.inline_structs ?? []) {
        for (const f of s.fields) {
          cap(`inline ${pt.id}.${s.name}.${f.name}`, f.description, 140);
        }
      }
    }
    for (const rt of PROFILE.relation_types) {
      cap(`relation ${rt.id}`, rt.description, 280);
      for (const f of rt.metadata_schema ?? []) {
        cap(`relmeta ${rt.id}.${f.name}`, f.description, 140);
      }
    }
    for (const r of PROFILE.validation_rules) cap(`rule ${r.id}`, r.description, 280);
    for (const t of PROFILE.templates) cap(`template ${t.id}`, t.description, 280);
    for (const r of PROFILE.renderers) cap(`renderer ${r.renderer_id}`, r.description, 280);
  });

  it("every primitive has at least one field; every inline struct has at least one field", () => {
    for (const pt of PROFILE.primitive_types) {
      expect(pt.fields.length, `primitive ${pt.id} fields`).toBeGreaterThan(0);
      for (const s of pt.inline_structs ?? []) {
        expect(s.fields.length, `inline struct ${pt.id}.${s.name} fields`).toBeGreaterThan(0);
      }
    }
  });
});
