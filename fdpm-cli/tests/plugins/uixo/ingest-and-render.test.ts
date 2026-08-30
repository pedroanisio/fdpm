/**
 * End to end: a UIXO document in the source schema's own shape goes in, a
 * validated workbook comes out, and the outline renderer walks the graph
 * back out of the relations the ingest split it into.
 *
 * Plus the failure paths — PALS's LAW control 4. A verification layer with
 * no failing-input test is unverified.
 */
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { Host } from "../../../src/core/host.js";
import { FDPMException } from "../../../src/core/errors/fdpm-exception.js";
import {
  buildUixoWorkbook,
  parseUixoDocument,
  projectUixoDocument,
} from "../../../plugins/uixo/ingest.js";
import { renderDocumentOutline, renderClassTable } from "../../../plugins/uixo/renderers/document_outline.js";
import { PROFILE_ID, ENTITY_NAMES, RELATION_TYPES } from "../../../plugins/uixo/sidecar.js";
import type { RendererInput } from "../../../src/plugin/types.js";
import manifest from "../../../plugins/uixo/fdpm-plugin.json" with { type: "json" };
import { NODE_COMMAND, tsxArgs } from "../../_helpers/process.js";

type Json = Record<string, unknown>;
const WB = "uixo-ingest";

/**
 * A minimal but complete document, following the ontology's ACTUAL
 * containment chain — checked against the class shapes, not assumed:
 *
 *   InteractionSystem -hasSurface-> Screen -hasLayout-> Layout
 *     -hasRegion-> Region -regionComponent-> Container
 *     -hasChildComponent-> Button
 *
 * uixo:Screen has no hasChildComponent (it is a Surface, not a
 * Component), which is exactly the kind of assumption the domain check
 * catches. Containment between Components is declared in BOTH directions
 * because the ontology declares both properties and the invariants
 * require them to agree.
 */

/**
 * Address a fixture entity by its id. The document is a list, but the
 * tests care about *which* entity they are mutating; indexing by position
 * broke silently the moment the fixture grew an actor, a feature and a
 * policy to satisfy the oracle's E263/E301/E302.
 */
function entity(d: Json, id: string): Record<string, unknown> {
  const found = (d.entities as Record<string, unknown>[]).find((e) => e["id"] === id);
  if (!found) throw new Error(`fixture has no entity "${id}"`);
  return found;
}

function validDocument(): Json {
  return {
    schemaVersion: "1.2.0",
    entities: [
      {
        id: "ex:app",
        type: "uixo:InteractionSystem",
        label: "Demo application",
        hasSurface: ["ex:screen"],
        // E263: a root must declare at least one actor.
        hasActor: ["ex:actor"],
        // E301/E302: the root lists its features and policies as soft
        // links, which is how the ontology attaches them.
        extensions: { spec: { features: ["ex:feature"], policies: ["ex:policy"] } },
      },
      { id: "ex:actor", type: "uixo:HumanActor", label: "Operator" },
      { id: "ex:feature", type: "uixo:Feature", label: "Editing" },
      { id: "ex:policy", type: "uixo:Policy", label: "Autosave policy" },
      { id: "ex:screen", type: "uixo:Screen", label: "Main screen", hasLayout: ["ex:layout"] },
      { id: "ex:layout", type: "uixo:Layout", label: "Main layout", hasRegion: ["ex:region"] },
      { id: "ex:region", type: "uixo:Region", label: "Action bar", regionComponent: ["ex:bar"] },
      {
        id: "ex:bar",
        type: "uixo:Container",
        label: "Button bar",
        hasChildComponent: ["ex:save", "ex:cancel"],
      },
      {
        id: "ex:save",
        type: "uixo:Button",
        label: "Save",
        orderIndex: 0,
        parentComponent: ["ex:bar"],
      },
      {
        id: "ex:cancel",
        type: "uixo:Button",
        label: "Cancel",
        orderIndex: 1,
        parentComponent: ["ex:bar"],
      },
    ],
  };
}

function docWith(mutate: (d: Json) => void): Json {
  const clone = JSON.parse(JSON.stringify(validDocument())) as Json;
  mutate(clone);
  return clone;
}

let host: Host;
let report: Awaited<ReturnType<typeof buildUixoWorkbook>>;

beforeAll(async () => {
  host = new Host({ dataDir: null, builtinDirs: [resolve(process.cwd(), "plugins")] });
  await host.load();
  report = await buildUixoWorkbook(host, validDocument(), { workbookId: WB });
});

describe("bridge determinism", () => {
  it("`run-bridge --check` reports no drift against the committed files", () => {
    const out = execFileSync(
      NODE_COMMAND,
      tsxArgs([
        join(process.cwd(), "plugins", "uixo", "scripts", "run-bridge.ts"),
        "--check",
      ]),
      { encoding: "utf8", cwd: process.cwd(), maxBuffer: 64 * 1024 * 1024 },
    );
    expect(out).toContain("no drift");
  });

  it("advertises the five document views — not 712, and not a field table", () => {
    // It was one generic class table rather than 712, which was the right
    // call against that alternative; it still described records instead of
    // the model, so it went with the rest of the generic renderers. What
    // replaced it is one view per target, each describing the model.
    const renderers = manifest.capabilities.filter((c) => c.capability_id === "cap:renderer");
    const declared = renderers
      .map((c) => c.metadata as { renderer_id?: string; target?: string } | undefined)
      .map((m) => `${m?.target} ${m?.renderer_id}`)
      .sort();
    expect(declared).toEqual(
      [
        "text/markdown uixo:DocumentOutlineRenderer",
        "text/html uixo:DocumentHtmlRenderer",
        "application/pdf uixo:DocumentPdfRenderer",
        "image/svg+xml uixo:ComponentTreeRenderer",
        "image/png uixo:ComponentSheetRenderer",
      ].sort(),
    );
  });

  it("names an entry point that the plugin module actually exports", async () => {
    const mod = (await import("../../../plugins/uixo/index.js")) as Record<string, unknown>;
    for (const cap of manifest.capabilities.filter((c) => c.capability_id === "cap:renderer")) {
      expect(typeof mod[cap.entry], `${cap.entry} is not an exported function`).toBe("function");
    }
  });
});

describe("activation", () => {
  it("registers 712 primitive types and 210 relation types", () => {
    expect(host.profiles.has(PROFILE_ID)).toBe(true);
    const profile = host.profiles.getResolved(PROFILE_ID);
    expect(profile.primitive_types).toHaveLength(ENTITY_NAMES.length);
    expect(profile.primitive_types).toHaveLength(712);
    expect(profile.relation_types).toHaveLength(RELATION_TYPES.length);
    expect(profile.relation_types).toHaveLength(210);
  });
});

describe("ingest", () => {
  it("writes the document as primitives plus relations", () => {
    expect(report.profileId).toBe(PROFILE_ID);
    expect(report.primitives).toBe((validDocument().entities as unknown[]).length);
    // hasSurface + hasActor + hasLayout + hasRegion + regionComponent = 5,
    // plus hasChildComponent x2 and parentComponent x2 = 9. The features
    // and policies the root declares are extensions.spec soft links, which
    // are attributes rather than typed edges — they do not add relations.
    expect(report.relations).toBe(9);
    expect(report.byType["uixo:Uixo_Button"]).toBe(2);
  });

  it("stores attributes on the primitive and edges as relations, not fields", () => {
    const slice = host.getProject(WB);
    const save = slice.primitives["uixo:Uixo_Button:ex-save"]!;
    expect(save.field_values["label"]).toBe("Save");
    expect(save.field_values["orderIndex"]).toBe(0);
    expect(save.field_values["parentComponent"]).toBeUndefined();

    const rels = Object.values(slice.relations);
    expect(rels.some((r) => r.type_id === "uixo:rel.parentComponent")).toBe(true);
    expect(rels.some((r) => r.type_id === "uixo:rel.hasChildComponent")).toBe(true);
  });
});

describe("nothing is written when verification fails", () => {
  it("rejects an edge pointing at a node the document does not contain", async () => {
    const doc = docWith((d) => {
      entity(d, "ex:bar").hasChildComponent = ["ex:save", "ex:ghost"];
    });
    const err = await buildUixoWorkbook(host, doc, { workbookId: "uixo-nope-1" }).catch((e) => e);
    expect(err).toBeInstanceOf(FDPMException);
    // E102 is the source's code for a reference to a missing entity. The
    // oracle runs before the plugin's own referential pass, so the
    // rejection arrives in the vocabulary an operator can look up in
    // UIXO_ERRORS.
    expect((err as FDPMException).message).toContain("E102");
    expect(() => host.getProject("uixo-nope-1")).toThrow();
  });

  it("rejects an edge whose target is outside the property's RDF range", async () => {
    const doc = docWith((d) => {
      // hasSurface ranges over uixo:Surface; a Button is not one.
      entity(d, "ex:app").hasSurface = ["ex:save"];
    });
    const err = await buildUixoWorkbook(host, doc, { workbookId: "uixo-nope-2" }).catch((e) => e);
    // E103: reference target has the wrong class.
    expect((err as FDPMException).message).toContain("E103");
  });

  it("rejects an unknown ontology class", async () => {
    const doc = docWith((d) => {
      entity(d, "ex:save").type = "uixo:NotAClass";
    });
    const err = await buildUixoWorkbook(host, doc, { workbookId: "uixo-nope-3" }).catch((e) => e);
    // An unknown class fails the source's shape parse (structural tier).
    expect((err as FDPMException).message).toMatch(/E001|structural/);
  });

  it("rejects an unknown field — the source schemas are strict", async () => {
    const doc = docWith((d) => {
      entity(d, "ex:save").smuggled = true;
    });
    await expect(
      buildUixoWorkbook(host, doc, { workbookId: "uixo-nope-4" }),
    ).rejects.toThrow(FDPMException);
  });

  it("rejects duplicate entity ids", async () => {
    const doc = docWith((d) => {
      entity(d, "ex:cancel").id = "ex:save";
    });
    const err = await buildUixoWorkbook(host, doc, { workbookId: "uixo-nope-5" }).catch((e) => e);
    expect((err as FDPMException).message).toContain("E101");
  });

  it("rejects a one-sided containment edge", async () => {
    const doc = docWith((d) => {
      delete entity(d, "ex:save").parentComponent;
    });
    const err = await buildUixoWorkbook(host, doc, { workbookId: "uixo-nope-6" }).catch((e) => e);
    expect((err as FDPMException).message).toMatch(/E221|not-reciprocal/);
  });

  it("rejects an entity with no label", async () => {
    const doc = docWith((d) => {
      delete entity(d, "ex:save").label;
    });
    const err = await buildUixoWorkbook(host, doc, { workbookId: "uixo-nope-7" }).catch((e) => e);
    expect((err as FDPMException).message).toContain("label");
  });

  it("rejects siblings sharing an orderIndex", async () => {
    const doc = docWith((d) => {
      entity(d, "ex:cancel").orderIndex = 0;
    });
    const err = await buildUixoWorkbook(host, doc, { workbookId: "uixo-nope-8" }).catch((e) => e);
    expect((err as FDPMException).message).toMatch(/E223|duplicate-order-index/);
  });

  it("rejects a wholly malformed payload", () => {
    for (const bad of [null, 42, "a document", [], { nodes: "not an array" }, { nodes: [] }]) {
      expect(() => parseUixoDocument(bad)).toThrow(FDPMException);
    }
  });

  it("reports every finding, not just the first", () => {
    const doc = docWith((d) => {
      entity(d, "ex:bar").hasChildComponent = ["ex:ghost-a", "ex:ghost-b"];
    });
    try {
      parseUixoDocument(doc);
      throw new Error("expected rejection");
    } catch (e) {
      expect((e as FDPMException).findings?.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("the outline renderer walks the graph back", () => {
  function render(): string {
    const slice = host.getProject(WB);
    const input = {
      workbookId: WB,
      primitives: Object.values(slice.primitives),
      relations: Object.values(slice.relations),
      profile: host.profiles.getResolved(PROFILE_ID),
    } as unknown as RendererInput;
    return new TextDecoder().decode(renderDocumentOutline(input).bytes);
  }

  it("prints the containment tree from the relations, not from fields", () => {
    const md = render();
    expect(md).toContain("uixo:InteractionSystem");
    expect(md).toContain("Demo application");
    // Children are nested under their parent.
    const barAt = md.indexOf("Button bar");
    const saveAt = md.indexOf("Save");
    expect(barAt).toBeGreaterThan(-1);
    expect(saveAt).toBeGreaterThan(barAt);
    // A non-containment edge is summarised on its source node.
    expect(md).toContain("hasSurface");
  });

  it("reports no orphans for a connected document", () => {
    expect(render()).not.toContain("Unreachable from any root");
  });

  it("renders an empty workbook without throwing", () => {
    const input = {
      workbookId: "empty",
      primitives: [],
      relations: [],
      profile: host.profiles.getResolved(PROFILE_ID),
    } as unknown as RendererInput;
    expect(new TextDecoder().decode(renderDocumentOutline(input).bytes)).toContain("no uixo primitives");
    expect(new TextDecoder().decode(renderClassTable(input).bytes)).toContain("no uixo primitives");
  });

  it("the class table prints attributes per class", () => {
    const slice = host.getProject(WB);
    const input = {
      workbookId: WB,
      primitives: Object.values(slice.primitives),
      relations: Object.values(slice.relations),
      profile: host.profiles.getResolved(PROFILE_ID),
    } as unknown as RendererInput;
    const md = new TextDecoder().decode(renderClassTable(input).bytes);
    expect(md).toContain("uixo:Button");
    expect(md).toContain("`orderIndex`");
  });
});

describe("projection is pure", () => {
  it("splits nodes into attributes and edges without touching a host", () => {
    const doc = validDocument();
    const { nodes } = parseUixoDocument(doc);
    const p = projectUixoDocument(nodes);
    expect(p.primitives).toHaveLength((doc.entities as unknown[]).length);
    // One relation per typed edge in the fixture: hasSurface, hasActor,
    // hasLayout, hasRegion, regionComponent, hasChildComponent ×2,
    // parentComponent ×2.
    expect(p.relations).toHaveLength(9);
    for (const prim of p.primitives) {
      expect(Object.keys(prim.fields)).not.toContain("hasChildComponent");
      expect(Object.keys(prim.fields)).not.toContain("parentComponent");
    }
  });
});
