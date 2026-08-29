/**
 * Phase 1 — the concrete structural leftovers.
 *
 * Of the metaclasses the Foundation subset did not carry, only two are
 * concrete and purely structural: Signal (a Classifier whose instances
 * are asynchronous communications, UML 2.5.1 §11.3) and Reception (a
 * BehavioralFeature declaring that a classifier reacts to a signal,
 * §11.4). Dependency and InterfaceRealization are the other concrete
 * leftovers, and both are already modelled as relations
 * (uml:DependsOn, uml:Realizes) — adding them again as primitives would
 * put the same fact in two places.
 */
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { Host } from "../../../src/core/host.js";
import { FDPMException } from "../../../src/core/errors/fdpm-exception.js";
import { PROFILE_ID, REL, ENTITY_NAMES } from "../../../plugins/uml/sidecar.js";
import { buildUmlWorkbook, parseUmlModel } from "../../../plugins/uml/ingest.js";
import { MODEL_OUTLINE_RENDERER_ID } from "../../../plugins/uml/index.js";

async function freshHost(): Promise<Host> {
  const host = new Host({ dataDir: null, builtinDirs: [resolve(process.cwd(), "plugins")] });
  await host.load();
  return host;
}

const ID = (n: number) => `01HQ8Z3K7M4N5P6R7S8T9V${String(n).padStart(4, "0")}`;

/** A model exercising both new metaclasses and both new edges. */
const signalModel = () => ({
  "xmi:id": ID(1),
  name: "Ordering",
  packagedElement: [
    {
      "xmi:id": ID(2),
      "xmi:type": "uml:PrimitiveType",
      name: "String",
    },
    {
      "xmi:id": ID(3),
      "xmi:type": "uml:Signal",
      name: "OrderPlaced",
      ownedAttribute: [{ "xmi:id": ID(4), name: "orderId", type: ID(2) }],
    },
    {
      "xmi:id": ID(5),
      "xmi:type": "uml:Class",
      name: "OrderHandler",
      isActive: true,
      ownedReception: [{ "xmi:id": ID(6), name: "OrderPlaced", signal: ID(3) }],
    },
  ],
});

describe("profile: Signal and Reception", () => {
  let host: Host;
  beforeAll(async () => {
    host = await freshHost();
  });

  it("registers both metaclasses", () => {
    const ids = host.profiles.getResolved(PROFILE_ID).primitive_types.map((p) => p.id);
    expect(ids).toContain("uml:Signal");
    expect(ids).toContain("uml:Reception");
    expect(ENTITY_NAMES).toContain("Signal");
    expect(ENTITY_NAMES).toContain("Reception");
  });

  it("treats Signal as a packageable classifier", () => {
    const rels = host.profiles.getResolved(PROFILE_ID).relation_types ?? [];
    // Owned by a package…
    expect(rels.find((r) => r.id === REL.Owns)?.target_types).toContain("uml:Signal");
    // …can own attributes…
    expect(rels.find((r) => r.id === REL.OwnsAttribute)?.source_types).toContain("uml:Signal");
    // …and can type a property or parameter.
    expect(rels.find((r) => r.id === REL.TypedBy)?.target_types).toContain("uml:Signal");
    // A signal may also specialise another signal (§11.3).
    expect(rels.find((r) => r.id === REL.Specializes)?.source_types).toContain("uml:Signal");
  });

  it("adds the two edges the metaclasses need, and no others", () => {
    const rels = host.profiles.getResolved(PROFILE_ID).relation_types ?? [];
    const ownsReception = rels.find((r) => r.id === REL.OwnsReception);
    expect(ownsReception).toBeDefined();
    expect(ownsReception?.source_types).toContain("uml:Class");
    expect(ownsReception?.target_types).toEqual(["uml:Reception"]);

    const signals = rels.find((r) => r.id === REL.Signals);
    expect(signals).toBeDefined();
    expect(signals?.source_types).toEqual(["uml:Reception"]);
    expect(signals?.target_types).toEqual(["uml:Signal"]);
    expect(signals?.cardinality).toBe("many-to-one");
  });

  it("keeps Dependency and InterfaceRealization as relations, not primitives", () => {
    const ids = host.profiles.getResolved(PROFILE_ID).primitive_types.map((p) => p.id);
    expect(ids).not.toContain("uml:Dependency");
    expect(ids).not.toContain("uml:InterfaceRealization");
    const rels = (host.profiles.getResolved(PROFILE_ID).relation_types ?? []).map((r) => r.id);
    expect(rels).toContain(REL.DependsOn);
    expect(rels).toContain(REL.Realizes);
  });
});

describe("validators for the new metaclasses", () => {
  const WB = "uml-phase1-validators";
  let host: Host;
  beforeAll(async () => {
    host = await freshHost();
    await host.createProject({ workbook_id: WB, name: "phase1", profile_id: PROFILE_ID });
  });

  it("accepts a well-formed Signal and Reception", async () => {
    const sig = await host.createPrimitive(WB, {
      id: `uml:Signal:${ID(10)}`,
      type_id: "uml:Signal",
      field_values: { xmi_id: ID(10), name: "OrderPlaced" },
    });
    expect(sig.report.accepted).toBe(true);
    const rec = await host.createPrimitive(WB, {
      id: `uml:Reception:${ID(11)}`,
      type_id: "uml:Reception",
      field_values: { xmi_id: ID(11), name: "OrderPlaced", is_static: false },
    });
    expect(rec.report.accepted).toBe(true);
  });

  /**
   * Two layers, two contracts, and the boundary between them is the
   * point of this test. The host tolerates an undeclared field on a
   * direct write and records `core:field:undeclared` as a warning
   * ("tolerated but not validated") — deliberate schema-drift policy,
   * not a gap. The ingest gate is stricter: an author handing over a
   * model with a stray key gets a rejection, because that is a mistake
   * in the source, not drift in a live workbook.
   */
  it("surfaces an undeclared field on a Reception as schema drift, not silence", async () => {
    const out = await host.createPrimitive(WB, {
      id: `uml:Reception:${ID(12)}`,
      type_id: "uml:Reception",
      field_values: { xmi_id: ID(12), name: "Bad", is_query: true },
    });
    expect(out.report.accepted).toBe(true);
    const drift = out.report.findings.find((f) => f.rule_id === "core:field:undeclared");
    expect(drift?.level).toBe("warning");
    expect(drift?.field_path).toBe("field_values.is_query");
    expect(host.validateProject(WB, { minLevel: "warning" }).summary.warnings).toBeGreaterThan(0);
  });

  it("rejects a Signal with a malformed identity", async () => {
    await expect(
      host.createPrimitive(WB, {
        id: "uml:Signal:nope",
        type_id: "uml:Signal",
        field_values: { xmi_id: "nope", name: "Bad" },
      }),
    ).rejects.toThrow(FDPMException);
  });
});

describe("ingest and render", () => {
  let host: Host;
  let report: Awaited<ReturnType<typeof buildUmlWorkbook>>;
  beforeAll(async () => {
    host = await freshHost();
    report = await buildUmlWorkbook(host, signalModel(), { workbookId: "uml-signals" });
  });

  it("lands the signal, its attribute, the class and its reception", () => {
    expect(report.byType["uml:Signal"]).toBe(1);
    expect(report.byType["uml:Reception"]).toBe(1);
    expect(report.byType["uml:Property"]).toBe(1);
    expect(report.byType["uml:Class"]).toBe(1);
  });

  it("wires ownership and the signal reference", () => {
    const rels = Object.values(host.getProject("uml-signals").relations);
    const owns = rels.find((r) => r.type_id === REL.OwnsReception);
    expect(owns?.source_id).toBe(`uml:Class:${ID(5)}`);
    expect(owns?.target_id).toBe(`uml:Reception:${ID(6)}`);
    const signals = rels.find((r) => r.type_id === REL.Signals);
    expect(signals?.source_id).toBe(`uml:Reception:${ID(6)}`);
    expect(signals?.target_id).toBe(`uml:Signal:${ID(3)}`);
    // The signal's own attribute is owned and typed like any other.
    expect(rels.some((r) => r.type_id === REL.OwnsAttribute && r.source_id === `uml:Signal:${ID(3)}`)).toBe(true);
    expect(rels.some((r) => r.type_id === REL.TypedBy && r.source_id === `uml:Property:${ID(4)}`)).toBe(true);
  });

  it("validates clean", () => {
    expect(host.validateProject("uml-signals").summary).toEqual({ errors: 0, warnings: 0, info: 0 });
  });

  it("renders receptions in UML notation", async () => {
    const slice = host.getProject("uml-signals");
    const out = await host.plugins.runRenderer(
      "text/markdown",
      {
        workbookId: "uml-signals",
        workbook: slice.workbook,
        primitives: Object.values(slice.primitives),
        relations: Object.values(slice.relations),
        templates: Object.values(slice.templates),
        profile: host.profiles.getResolved(PROFILE_ID),
      },
      { rendererId: MODEL_OUTLINE_RENDERER_ID },
    );
    const md = new TextDecoder().decode(out.bytes);
    expect(md).toContain("«signal» OrderPlaced");
    expect(md).toContain("«class» OrderHandler");
    // UML prints a reception as a signal-stereotyped feature of its owner.
    expect(md).toContain("`«signal» OrderPlaced`");
    expect(md).toContain("`+ orderId : String`");
  });
});

describe("ingest gate for the new references", () => {
  it("rejects a reception whose signal points at something that is not a Signal", () => {
    const m = signalModel() as Record<string, any>;
    m["packagedElement"][2].ownedReception[0].signal = ID(2); // the PrimitiveType
    try {
      parseUmlModel(m);
      throw new Error("expected rejection");
    } catch (err) {
      expect(err).toBeInstanceOf(FDPMException);
      expect((err as FDPMException).message).toMatch(/not a signal/i);
    }
  });

  it("rejects a reception whose signal does not resolve", () => {
    const m = signalModel() as Record<string, any>;
    m["packagedElement"][2].ownedReception[0].signal = ID(999);
    expect(() => parseUmlModel(m)).toThrow(FDPMException);
  });

  it("rejects an unknown field on a reception rather than dropping it", () => {
    const m = signalModel() as Record<string, any>;
    m["packagedElement"][2].ownedReception[0].isQuery = true;
    expect(() => parseUmlModel(m)).toThrow(FDPMException);
  });
});
