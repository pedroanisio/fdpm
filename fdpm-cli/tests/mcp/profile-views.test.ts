/**
 * Profile-view projection tests.
 *
 * Real-world signal: composed profiles run ~65 KB on the wire.
 * `applyProfileView` exists so callers can request `summary` or
 * `types` shapes that strip descriptions/examples without losing
 * the structural answer to "what fields does X have?".
 *
 * Coverage:
 *   - `full` and undefined view → pass-through, applied=false
 *   - `summary` view → only id/version/label/counts, _view marker
 *   - `types` view → primitive_types[]/relation_types[] preserved
 *     in stripped form (kind, required, enum_values), descriptions
 *     dropped, _view marker present
 *   - field shape: CLI-native `kind` and Python-source `legacy_type`
 *     both pass through; `enum_values` (NOT `enum`), `ref_type_id`,
 *     `struct_id`, and nested `item_field` preserved
 *   - relation shape: both singular `*_type_id` and plural `*_types`
 *     pass through; symmetric/transitive only emitted when true
 *   - missing optional sections (no relation_types, etc.) handled
 *   - tier discipline: a real composed profile is materially
 *     smaller after `summary` and `types` projection
 */
import { describe, expect, it } from "vitest";
import {
  applyProfileView,
  PROFILE_VIEW_NAMES,
  type ProfileViewName,
} from "../../src/mcp/profile-views.js";

// A realistic raw-profile shape mirroring DomainProfile's keys. Keep
// the shape literal — schemas evolve, but the projection contract is
// the actual contract the test guards.
const SAMPLE_PROFILE: Record<string, unknown> = {
  id: "test:demo",
  version: "1.0.0",
  label: "Test Demo",
  description: "A profile used in unit tests.",
  extends: [],
  categories: [{ id: "test:cat:doc", label: "Document" }],
  scopes: [{ id: "test:scope:doc", label: "Document", rank: 0 }],
  primitive_types: [
    {
      id: "test:section",
      name: "Section",
      scoped: false,
      is_partition_unit: true,
      id_format: { pattern: "^section:[a-z0-9-]+$", uniqueness: "workbook" },
      fields: [
        { name: "title", kind: "string", required: true, description: "lengthy descriptive text we want stripped" },
        { name: "number", kind: "integer", required: true },
        { name: "status", kind: "enum", required: false, enum_values: ["draft", "stable"] },
        { name: "section_ref", kind: "id-ref", required: false, ref_type_id: "test:section" },
        { name: "items", kind: "list", required: false, item_field: { name: "_item", kind: "string" } },
      ],
    },
    {
      // Python-source spelling: legacy_type instead of kind.
      id: "test:legacy",
      fields: [
        { name: "raw", legacy_type: "string", required: true, description: "stripped" },
      ],
      id_format: { pattern: "^legacy:[a-z0-9-]+$", uniqueness: "workbook" },
    },
  ],
  relation_types: [
    {
      id: "test:rel:contains",
      source_type_id: "test:section",
      target_type_id: "test:section",
      cardinality: "one-to-many",
      symmetric: false,
      transitive: false,
    },
    {
      // Plural form (Python-source style).
      id: "test:rel:related",
      source_types: ["test:section"],
      target_types: ["test:section"],
      symmetric: true,
      transitive: true,
    },
  ],
  validation_rules: [{ id: "rule-1" }, { id: "rule-2" }],
  templates: [],
};

describe("applyProfileView (unit)", () => {
  it("undefined view is pass-through and applied=false", () => {
    const r = applyProfileView(SAMPLE_PROFILE, undefined);
    expect(r.applied).toBe(false);
    expect(r.value).toBe(SAMPLE_PROFILE);
    expect("_view" in r.value).toBe(false);
  });

  it("'full' view is pass-through and applied=false", () => {
    const r = applyProfileView(SAMPLE_PROFILE, "full");
    expect(r.applied).toBe(false);
    expect(r.value).toBe(SAMPLE_PROFILE);
  });

  it("'summary' view returns only id/version/label/counts and _view marker", () => {
    const r = applyProfileView(SAMPLE_PROFILE, "summary");
    expect(r.applied).toBe(true);
    expect(r.value).toEqual({
      id: "test:demo",
      version: "1.0.0",
      label: "Test Demo",
      description: "A profile used in unit tests.",
      primitive_type_count: 2,
      relation_type_count: 2,
      validation_rule_count: 2,
      category_count: 1,
      scope_count: 1,
      template_count: 0,
      _view: "summary",
    });
    // No long-form arrays in summary.
    expect("primitive_types" in r.value).toBe(false);
    expect("relation_types" in r.value).toBe(false);
    expect("validation_rules" in r.value).toBe(false);
  });

  it("'summary' view tolerates a profile missing optional sections", () => {
    const minimal = { id: "x:y", version: "0.1.0" };
    const r = applyProfileView(minimal, "summary");
    expect(r.value).toEqual({
      id: "x:y",
      version: "0.1.0",
      primitive_type_count: 0,
      relation_type_count: 0,
      validation_rule_count: 0,
      category_count: 0,
      scope_count: 0,
      template_count: 0,
      _view: "summary",
    });
  });

  it("'types' view keeps the type vocabulary and strips descriptions", () => {
    const r = applyProfileView(SAMPLE_PROFILE, "types");
    expect(r.applied).toBe(true);
    expect(r.value._view).toBe("types");
    const prims = r.value.primitive_types as Array<Record<string, unknown>>;
    expect(prims).toHaveLength(2);
    const section = prims[0]!;
    expect(section.id).toBe("test:section");
    expect(section.name).toBe("Section");
    expect(section.is_partition_unit).toBe(true);
    expect(section.id_format).toEqual({
      pattern: "^section:[a-z0-9-]+$",
      uniqueness: "workbook",
    });
    // Fields preserve kind/required and type-shape extras; descriptions go.
    const fields = section.fields as Array<Record<string, unknown>>;
    expect(fields.find((f) => f.name === "title")).toEqual({
      name: "title",
      kind: "string",
      required: true,
    });
    expect(fields.find((f) => f.name === "status")).toEqual({
      name: "status",
      kind: "enum",
      required: false,
      enum_values: ["draft", "stable"],
    });
    expect(fields.find((f) => f.name === "section_ref")).toEqual({
      name: "section_ref",
      kind: "id-ref",
      required: false,
      ref_type_id: "test:section",
    });
    const items = fields.find((f) => f.name === "items")!;
    expect(items.kind).toBe("list");
    expect((items.item_field as Record<string, unknown>).kind).toBe("string");
  });

  it("'types' view passes through both `kind` and `legacy_type` field forms", () => {
    const r = applyProfileView(SAMPLE_PROFILE, "types");
    const prims = r.value.primitive_types as Array<Record<string, unknown>>;
    const legacy = prims.find((p) => p.id === "test:legacy")!;
    const legacyFields = legacy.fields as Array<Record<string, unknown>>;
    expect(legacyFields[0]).toEqual({
      name: "raw",
      legacy_type: "string",
      required: true,
    });
    // No description leakage on either shape.
    for (const field of legacyFields) {
      expect("description" in field).toBe(false);
    }
  });

  it("'types' view keeps both singular and plural relation source/target shapes", () => {
    const r = applyProfileView(SAMPLE_PROFILE, "types");
    const rels = r.value.relation_types as Array<Record<string, unknown>>;
    expect(rels.find((r0) => r0.id === "test:rel:contains")).toEqual({
      id: "test:rel:contains",
      source_type_id: "test:section",
      target_type_id: "test:section",
      cardinality: "one-to-many",
    });
    expect(rels.find((r0) => r0.id === "test:rel:related")).toEqual({
      id: "test:rel:related",
      source_types: ["test:section"],
      target_types: ["test:section"],
      symmetric: true,
      transitive: true,
    });
  });

  it("PROFILE_VIEW_NAMES enumerates only the supported views", () => {
    expect(PROFILE_VIEW_NAMES).toEqual(["full", "summary", "type_ids", "types"]);
  });

  it("'type_ids' view returns the type vocabulary as bare id lists", () => {
    const r = applyProfileView(SAMPLE_PROFILE, "type_ids");
    expect(r.applied).toBe(true);
    expect(r.value).toEqual({
      id: "test:demo",
      version: "1.0.0",
      label: "Test Demo",
      primitive_type_ids: ["test:section", "test:legacy"],
      relation_type_ids: ["test:rel:contains", "test:rel:related"],
      _view: "type_ids",
    });
  });

  it("'type_ids' view tolerates a profile missing optional sections", () => {
    const r = applyProfileView({ id: "x:y", version: "0.1.0" }, "type_ids");
    expect(r.value).toEqual({
      id: "x:y",
      version: "0.1.0",
      primitive_type_ids: [],
      relation_type_ids: [],
      _view: "type_ids",
    });
  });

  it("'type_ids' view is materially smaller than 'types'", () => {
    // The rung exists for `profile:uixo:1.2`, whose 712 primitive types put
    // even the stripped `types` view at 1,835,052 B — past any tool-result
    // ceiling. `type_ids` names the vocabulary so the caller can then ask
    // `fdpm.profile.type_info` for the single type it needs.
    const bytes = (view: ProfileViewName): number =>
      Buffer.byteLength(JSON.stringify(applyProfileView(SAMPLE_PROFILE, view).value), "utf8");
    expect(bytes("type_ids")).toBeLessThan(bytes("types"));
  });

  it("an unknown view name (defensively) falls back to pass-through", () => {
    // Cast through unknown — the validator rejects this at the
    // tool layer, but the helper itself defends against bad call
    // sites without throwing.
    const r = applyProfileView(SAMPLE_PROFILE, "garbage" as ProfileViewName);
    expect(r.applied).toBe(false);
    expect(r.value).toBe(SAMPLE_PROFILE);
  });

  it("summary view is materially smaller than the full profile", () => {
    // Anchor the size-discipline claim that motivated the feature.
    // We're not asserting an absolute byte count (would be brittle);
    // we're asserting summary is at least 5x smaller than full for
    // a profile this shape, which holds with substantial margin.
    const fullBytes = Buffer.byteLength(JSON.stringify(SAMPLE_PROFILE), "utf8");
    const summaryBytes = Buffer.byteLength(
      JSON.stringify(applyProfileView(SAMPLE_PROFILE, "summary").value),
      "utf8",
    );
    expect(summaryBytes * 5).toBeLessThan(fullBytes);
  });
});
