/**
 * Host-level activation of fdpm.document-plan and its composition
 * companion fdpm.document-plan-dnis: both discovered, both active (not
 * quarantined by a renderer-id or profile-id collision), the composition
 * profile resolves to the union of docplan:* and dnis:* types, and the
 * bridge-derived Zod validators actually judge writes.
 */
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Host } from "../../../src/core/host.js";
import { PLUGIN_ID, PROFILE_ID, ENTITY_NAMES, primitiveTypeId } from "../../../plugins/document_plan/index.js";
import {
  PLUGIN_ID as DNIS_PLUGIN_ID,
  PROFILE_ID as COMPOSITION_PROFILE_ID,
  REL,
  RELATION_TYPES,
} from "../../../plugins/document_plan_dnis/index.js";

async function freshHost(): Promise<Host> {
  const host = new Host({
    dataDir: null,
    builtinDirs: [resolve(process.cwd(), "plugins")],
    pluginPaths: [],
  });
  await host.load();
  return host;
}

const CONCEPT_ID = "c1a2b3c4-d5e6-4f70-8192-a3b4c5d6e7f8";

describe("fdpm.document-plan — activation", () => {
  it("both plugins are active and the profiles are registered", async () => {
    const host = await freshHost();
    for (const id of [PLUGIN_ID, DNIS_PLUGIN_ID]) {
      const record = host.plugins.get(id);
      expect(record, id).toBeDefined();
      expect(record?.state, `${id}: ${record?.errorMessage ?? ""}`).toBe("active");
    }
    expect(host.profiles.has(PROFILE_ID)).toBe(true);
    expect(host.profiles.has(COMPOSITION_PROFILE_ID)).toBe(true);
    const listed = host.profiles.getRaw(PROFILE_ID);
    expect(listed.version).toBe("3.1.0");
    expect(listed.label).toBe("Document Plan (v3.1.0)");
  });

  it("the composition profile resolves to docplan:* + dnis:* types and the docplan relations", async () => {
    const host = await freshHost();
    const resolved = host.profiles.getResolved(COMPOSITION_PROFILE_ID);
    const typeIds = resolved.primitive_types.map((t) => t.id);
    for (const n of ENTITY_NAMES) expect(typeIds).toContain(primitiveTypeId(n));
    expect(typeIds).toEqual(expect.arrayContaining(["dnis:Document", "dnis:Node"]));
    const relIds = resolved.relation_types.map((r) => r.id);
    for (const r of RELATION_TYPES) expect(relIds).toContain(r.id);
    expect(relIds).toContain("dnis:DerivedFrom");
    const cites = resolved.relation_types.find((r) => r.id === REL.NodeCites)!;
    expect(cites.source_type_id).toBe("dnis:Node");
    expect(cites.target_type_id).toBe("docplan:ContentSource");
    expect(cites.fields.map((f) => f.name)).toEqual(["locator", "supports", "note"]);
  });

  it("the bridge-derived validator accepts a valid Concept and rejects an invalid one", async () => {
    const host = await freshHost();
    await host.createProject({ workbook_id: "docplan-val", name: "validator probe", profile_id: PROFILE_ID });

    const ok = await host.createPrimitive("docplan-val", {
      id: `docplan:Concept:${CONCEPT_ID}`,
      type_id: "docplan:Concept",
      field_values: {
        id: CONCEPT_ID,
        term: "operation log",
        definition: "The append-only per-workbook JSONL sequence of immutable operations.",
        introduced_in: "ledger",
      },
    });
    expect(ok.report.accepted).toBe(true);

    await expect(
      host.createPrimitive("docplan-val", {
        id: "docplan:Concept:d2b3c4d5-e6f7-4081-92a3-b4c5d6e7f809",
        type_id: "docplan:Concept",
        field_values: {
          id: "d2b3c4d5-e6f7-4081-92a3-b4c5d6e7f809",
          definition: "missing term, and the introduced_in slug has uppercase",
          introduced_in: "NotASlug",
        },
      }),
    ).rejects.toMatchObject({ category: "validation" });
  });

  it("the plan brief renders the header and its registries", async () => {
    const host = await freshHost();
    await host.createProject({ workbook_id: "docplan-render", name: "renderer probe", profile_id: PROFILE_ID });
    await host.createPrimitive("docplan-render", {
      id: `docplan:Concept:${CONCEPT_ID}`,
      type_id: "docplan:Concept",
      field_values: { id: CONCEPT_ID, term: "operation log", definition: "The ledger.", introduced_in: "ledger" },
    });
    const slice = host.getProject("docplan-render");
    const out = await host.plugins.runRenderer(
      "text/markdown",
      {
        workbookId: "docplan-render",
        workbook: slice.workbook,
        primitives: Object.values(slice.primitives),
        relations: Object.values(slice.relations),
        profile: host.profiles.getResolved(PROFILE_ID),
      },
      { rendererId: "docplan:PlanBriefRenderer" },
    );
    const text = new TextDecoder().decode(out.bytes);
    // The concept appears in the brief's Concepts registry, with its
    // definition — not as a bare field table.
    expect(text).toContain("operation log");
    expect(text).toContain("The ledger.");
    expect(text).toContain("## Concepts");
    expect(out.rendererId).toBe("docplan:PlanBriefRenderer");
  });
});
