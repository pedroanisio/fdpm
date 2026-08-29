/**
 * Phase 2 — Components, ports and connectors (UML 2.5.1
 * StructuredClassifiers).
 *
 * The package's point is *internal structure*: a Component is a
 * classifier whose parts talk to each other through Ports over
 * Connectors, and a Connector is only meaningful because its two ends
 * name roles in that structure. So the tests here are mostly about the
 * edges, not the attributes — a Port that no classifier owns, or a
 * Connector with one end, is not a model.
 *
 * ComponentRealization is deliberately NOT a primitive: like
 * Dependency, Generalization and InterfaceRealization before it, it is a
 * DirectedRelationship and becomes an edge (uml:RealizesComponent).
 */
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { Host } from "../../../src/core/host.js";
import { FDPMException } from "../../../src/core/errors/fdpm-exception.js";
import { PROFILE_ID, REL, ENTITY_NAMES, CLASSIFIER_TYPES } from "../../../plugins/uml/sidecar.js";
import { buildUmlWorkbook, parseUmlModel } from "../../../plugins/uml/ingest.js";
import { MODEL_OUTLINE_RENDERER_ID } from "../../../plugins/uml/index.js";
import { isAbstractMetaclass } from "../../../plugins/uml/abstract.js";

async function freshHost(): Promise<Host> {
  const host = new Host({ dataDir: null, builtinDirs: [resolve(process.cwd(), "plugins")] });
  await host.load();
  return host;
}
const ID = (n: number) => `01HQ8Z3K7M4N5P6R7S8T9V${String(n).padStart(4, "0")}`;

/**
 * An order service: a component with a provided and a required
 * interface, two ports, an inner part, and an assembly connector
 * joining the part's port to the component's own.
 */
const componentModel = () => ({
  "xmi:id": ID(1),
  name: "Fulfilment",
  packagedElement: [
    { "xmi:id": ID(2), "xmi:type": "uml:Interface", name: "OrderIntake" },
    { "xmi:id": ID(3), "xmi:type": "uml:Interface", name: "PaymentGateway" },
    { "xmi:id": ID(4), "xmi:type": "uml:Class", name: "OrderStore" },
    {
      "xmi:id": ID(5),
      "xmi:type": "uml:Component",
      name: "OrderService",
      isIndirectlyInstantiated: false,
      ownedAttribute: [{ "xmi:id": ID(6), name: "store", type: ID(4), aggregation: "composite" }],
      ownedPort: [
        {
          "xmi:id": ID(7),
          name: "intake",
          type: ID(2),
          isService: true,
          provided: [ID(2)],
        },
        {
          "xmi:id": ID(8),
          name: "payments",
          type: ID(3),
          isConjugated: true,
          required: [ID(3)],
        },
      ],
      ownedConnector: [
        {
          "xmi:id": ID(9),
          name: "storeLink",
          kind: "delegation",
          end: [
            { "xmi:id": ID(10), role: ID(7) },
            { "xmi:id": ID(11), role: ID(6) },
          ],
        },
      ],
      realization: [{ "xmi:id": ID(12), realizingClassifier: ID(4) }],
    },
    {
      "xmi:id": ID(13),
      "xmi:type": "uml:Artifact",
      name: "order-service.jar",
      fileName: "build/order-service.jar",
      manifestation: [ID(5)],
    },
    {
      "xmi:id": ID(14),
      "xmi:type": "uml:AssociationClass",
      name: "Assignment",
      ownedEnd: [
        { "xmi:id": ID(15), name: "assigned", type: ID(4), upper: "*" },
        { "xmi:id": ID(16), name: "assignee", type: ID(5) },
      ],
      ownedAttribute: [{ "xmi:id": ID(17), name: "assignedAt", type: ID(4) }],
    },
  ],
});

describe("the profile carries the structured-classifier metaclasses", () => {
  let host: Host;
  beforeAll(async () => {
    host = await freshHost();
  });

  it("registers Component, Port, Connector, ConnectorEnd, Artifact and AssociationClass", () => {
    const ids = host.profiles.getResolved(PROFILE_ID).primitive_types.map((p) => p.id);
    for (const id of ["uml:Component", "uml:Port", "uml:Connector", "uml:ConnectorEnd", "uml:Artifact", "uml:AssociationClass"]) {
      expect(ids, `${id} must be registered`).toContain(id);
    }
    for (const n of ["Component", "Port", "Connector", "ConnectorEnd", "Artifact", "AssociationClass"]) {
      expect(ENTITY_NAMES).toContain(n);
      expect(isAbstractMetaclass(n), `${n} is concrete in UML 2.5.1`).toBe(false);
    }
  });

  it("keeps ComponentRealization a relation, not a primitive", () => {
    const profile = host.profiles.getResolved(PROFILE_ID);
    expect(profile.primitive_types.map((p) => p.id)).not.toContain("uml:ComponentRealization");
    const realizes = (profile.relation_types ?? []).find((r) => r.id === REL.RealizesComponent);
    expect(realizes).toBeDefined();
    expect(realizes?.target_types).toEqual(["uml:Component"]);
  });

  it("treats the new classifiers as classifiers everywhere it matters", () => {
    const rels = host.profiles.getResolved(PROFILE_ID).relation_types ?? [];
    for (const c of ["uml:Component", "uml:Artifact", "uml:AssociationClass"]) {
      expect(CLASSIFIER_TYPES as readonly string[]).toContain(c);
      expect(rels.find((r) => r.id === REL.Owns)?.target_types, `${c} is packageable`).toContain(c);
      expect(rels.find((r) => r.id === REL.TypedBy)?.target_types, `${c} can type an element`).toContain(c);
      expect(rels.find((r) => r.id === REL.Specializes)?.source_types, `${c} can specialise`).toContain(c);
      expect(rels.find((r) => r.id === REL.OwnsAttribute)?.source_types, `${c} owns attributes`).toContain(c);
    }
  });

  it("declares the internal-structure edges with typed endpoints — no wildcards", () => {
    const rels = host.profiles.getResolved(PROFILE_ID).relation_types ?? [];
    const expected: Array<[string, string[], string]> = [
      [REL.OwnsPort, ["uml:Port"], "uml:Component"],
      [REL.OwnsConnector, ["uml:Connector"], "uml:Component"],
      [REL.OwnsConnectorEnd, ["uml:ConnectorEnd"], "uml:Connector"],
      [REL.PartWithPort, ["uml:Property"], "uml:ConnectorEnd"],
      [REL.Manifests, ["uml:Component", "uml:Class", "uml:Interface", "uml:Package"], "uml:Artifact"],
      [REL.NestsArtifact, ["uml:Artifact"], "uml:Artifact"],
    ];
    for (const [id, targets, source] of expected) {
      const rel = rels.find((r) => r.id === id);
      expect(rel, `${id} must exist`).toBeDefined();
      expect(rel?.target_types, `${id} targets`).not.toBe("*");
      for (const t of targets) expect(rel?.target_types, `${id} targets ${t}`).toContain(t);
      expect(rel?.source_types, `${id} sources ${source}`).toContain(source);
    }
    // A connector end's role may be a plain property or a port.
    const role = rels.find((r) => r.id === REL.ConnectorRole);
    expect(role?.source_types).toEqual(["uml:ConnectorEnd"]);
    expect(role?.target_types).toEqual(expect.arrayContaining(["uml:Property", "uml:Port"]));
    // Provided/required interfaces.
    for (const id of [REL.Provides, REL.Requires]) {
      const r = rels.find((x) => x.id === id);
      expect(r?.target_types).toEqual(["uml:Interface"]);
      expect(r?.source_types).toEqual(expect.arrayContaining(["uml:Port", "uml:Component"]));
    }
  });

  it("adds no wildcard endpoints anywhere in the profile", () => {
    const wildcards = (host.profiles.getResolved(PROFILE_ID).relation_types ?? [])
      .filter((r) => r.source_types === "*" || r.target_types === "*")
      .map((r) => r.id);
    expect(wildcards).toEqual([]);
  });
});

describe("ingest builds the internal structure", () => {
  let host: Host;
  let report: Awaited<ReturnType<typeof buildUmlWorkbook>>;
  beforeAll(async () => {
    host = await freshHost();
    report = await buildUmlWorkbook(host, componentModel(), { workbookId: "uml-components" });
  });

  it("lands every element of the package", () => {
    expect(report.byType["uml:Component"]).toBe(1);
    expect(report.byType["uml:Port"]).toBe(2);
    expect(report.byType["uml:Connector"]).toBe(1);
    expect(report.byType["uml:ConnectorEnd"]).toBe(2);
    expect(report.byType["uml:Artifact"]).toBe(1);
    expect(report.byType["uml:AssociationClass"]).toBe(1);
  });

  it("validates clean", () => {
    expect(host.validateProject("uml-components").summary).toEqual({ errors: 0, warnings: 0, info: 0 });
  });

  it("wires ports, connectors and their ends", () => {
    const rels = Object.values(host.getProject("uml-components").relations);
    const comp = `uml:Component:${ID(5)}`;
    expect(rels.filter((r) => r.type_id === REL.OwnsPort && r.source_id === comp)).toHaveLength(2);
    const conn = `uml:Connector:${ID(9)}`;
    expect(rels.some((r) => r.type_id === REL.OwnsConnector && r.source_id === comp && r.target_id === conn)).toBe(true);
    expect(rels.filter((r) => r.type_id === REL.OwnsConnectorEnd && r.source_id === conn)).toHaveLength(2);
    // The first end's role is a Port, the second's is a plain Property —
    // the same edge type, two legal target types.
    const roles = rels.filter((r) => r.type_id === REL.ConnectorRole);
    expect(roles.map((r) => r.target_id).sort()).toEqual([`uml:Port:${ID(7)}`, `uml:Property:${ID(6)}`].sort());
  });

  it("wires provided and required interfaces, realization, manifestation", () => {
    const rels = Object.values(host.getProject("uml-components").relations);
    expect(rels.some((r) => r.type_id === REL.Provides && r.source_id === `uml:Port:${ID(7)}` && r.target_id === `uml:Interface:${ID(2)}`)).toBe(true);
    expect(rels.some((r) => r.type_id === REL.Requires && r.source_id === `uml:Port:${ID(8)}` && r.target_id === `uml:Interface:${ID(3)}`)).toBe(true);
    expect(rels.some((r) => r.type_id === REL.RealizesComponent && r.source_id === `uml:Class:${ID(4)}` && r.target_id === `uml:Component:${ID(5)}`)).toBe(true);
    expect(rels.some((r) => r.type_id === REL.Manifests && r.source_id === `uml:Artifact:${ID(13)}` && r.target_id === `uml:Component:${ID(5)}`)).toBe(true);
  });

  it("carries the metaclass-specific attributes", () => {
    const prims = host.getProject("uml-components").primitives;
    expect(prims[`uml:Component:${ID(5)}`]?.field_values["is_indirectly_instantiated"]).toBe(false);
    expect(prims[`uml:Port:${ID(7)}`]?.field_values["is_service"]).toBe(true);
    expect(prims[`uml:Port:${ID(8)}`]?.field_values["is_conjugated"]).toBe(true);
    expect(prims[`uml:Connector:${ID(9)}`]?.field_values["kind"]).toBe("delegation");
    expect(prims[`uml:Artifact:${ID(13)}`]?.field_values["file_name"]).toBe("build/order-service.jar");
    // An AssociationClass is both: its ends are member ends AND it owns
    // an ordinary attribute.
    const rels = Object.values(host.getProject("uml-components").relations);
    const ac = `uml:AssociationClass:${ID(14)}`;
    expect(rels.filter((r) => r.type_id === REL.MemberEnd && r.source_id === ac)).toHaveLength(2);
    expect(rels.some((r) => r.type_id === REL.OwnsAttribute && r.source_id === ac && r.target_id === `uml:Property:${ID(17)}`)).toBe(true);
  });

  it("renders the internal structure in UML notation", async () => {
    const slice = host.getProject("uml-components");
    const out = await host.plugins.runRenderer(
      "text/markdown",
      {
        workbookId: "uml-components",
        workbook: slice.workbook,
        primitives: Object.values(slice.primitives),
        relations: Object.values(slice.relations),
        templates: Object.values(slice.templates),
        profile: host.profiles.getResolved(PROFILE_ID),
      },
      { rendererId: MODEL_OUTLINE_RENDERER_ID },
    );
    const md = new TextDecoder().decode(out.bytes);
    expect(md).toContain("«component» OrderService");
    expect(md).toContain("«artifact» order-service.jar");
    expect(md).toContain("«association class» Assignment");
    // Ports print with their type and their contract.
    expect(md).toContain("`«port» intake : OrderIntake`");
    expect(md).toMatch(/provides:.*OrderIntake/);
    expect(md).toMatch(/requires:.*PaymentGateway/);
    // A connector prints as its two ends.
    expect(md).toContain("«connector» storeLink");
    expect(md).toContain("delegation");
    expect(md).toMatch(/intake.*↔.*store|store.*↔.*intake/);
    // Manifestation and realization are stated, not implied.
    expect(md).toMatch(/manifests:.*OrderService/);
    expect(md).toMatch(/realized by:.*OrderStore/);
  });
});

describe("the ingest gate for internal structure", () => {
  it("rejects a connector with fewer than two ends (§11.2)", () => {
    const m = componentModel() as Record<string, any>;
    m["packagedElement"][3].ownedConnector[0].end.pop();
    try {
      parseUmlModel(m);
      throw new Error("expected rejection");
    } catch (err) {
      expect(err).toBeInstanceOf(FDPMException);
      expect((err as FDPMException).message).toMatch(/at least 2|two ends/i);
    }
  });

  it("rejects a connector end whose role does not resolve", () => {
    const m = componentModel() as Record<string, any>;
    m["packagedElement"][3].ownedConnector[0].end[0].role = ID(999);
    expect(() => parseUmlModel(m)).toThrow(FDPMException);
  });

  it("rejects a connector end whose role is not a property or port", () => {
    const m = componentModel() as Record<string, any>;
    m["packagedElement"][3].ownedConnector[0].end[0].role = ID(2); // an Interface
    try {
      parseUmlModel(m);
      throw new Error("expected rejection");
    } catch (err) {
      expect((err as FDPMException).message).toMatch(/role/i);
    }
  });

  it("rejects a provided interface that is not an Interface", () => {
    const m = componentModel() as Record<string, any>;
    m["packagedElement"][3].ownedPort[0].provided = [ID(4)]; // a Class
    try {
      parseUmlModel(m);
      throw new Error("expected rejection");
    } catch (err) {
      expect((err as FDPMException).message).toMatch(/interface/i);
    }
  });

  it("rejects an unknown field on a port rather than dropping it", () => {
    const m = componentModel() as Record<string, any>;
    m["packagedElement"][3].ownedPort[0].isMagic = true;
    expect(() => parseUmlModel(m)).toThrow(FDPMException);
  });

  it("accepts the model unchanged", () => {
    expect(() => parseUmlModel(componentModel())).not.toThrow();
  });
});

/**
 * Regressions. Phase 2 widened five existing relation types and added a
 * second classifier family; both are places where an earlier phase can
 * quietly break. These pin the seams.
 */
describe("regression: Phase 2 does not disturb Phases 0 and 1", () => {
  let host: Host;
  beforeAll(async () => {
    host = await freshHost();
  });

  it("keeps every earlier metaclass and edge registered", () => {
    const profile = host.profiles.getResolved(PROFILE_ID);
    const types = profile.primitive_types.map((p) => p.id);
    for (const id of ["uml:Package", "uml:Model", "uml:Class", "uml:Interface", "uml:DataType", "uml:PrimitiveType", "uml:Enumeration", "uml:EnumerationLiteral", "uml:Property", "uml:Operation", "uml:Parameter", "uml:Association", "uml:Signal", "uml:Reception", "uml:Constraint", "uml:Comment"]) {
      expect(types, `${id} survived Phase 2`).toContain(id);
    }
    const rels = (profile.relation_types ?? []).map((r) => r.id);
    for (const id of ["uml:Owns", "uml:OwnsAttribute", "uml:OwnsOperation", "uml:OwnsParameter", "uml:OwnsLiteral", "uml:OwnsReception", "uml:Signals", "uml:Specializes", "uml:Realizes", "uml:DependsOn", "uml:TypedBy", "uml:MemberEnd", "uml:Annotates", "uml:Constrains"]) {
      expect(rels, `${id} survived Phase 2`).toContain(id);
    }
    expect(types).toHaveLength(22);
    expect(rels).toHaveLength(24);
  });

  it("still registers no abstract metaclass", () => {
    const offenders = host.profiles
      .getResolved(PROFILE_ID)
      .primitive_types.map((p) => p.id.split(":").pop()!)
      .filter((n) => isAbstractMetaclass(n));
    expect(offenders).toEqual([]);
  });

  it("the Phase 0 library model still ingests, validates and renders unchanged", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const fixture = JSON.parse(
      readFileSync(join(process.cwd(), "tests/plugins/uml/fixtures/library.model.json"), "utf8"),
    ) as unknown;
    const report = await buildUmlWorkbook(host, fixture, { workbookId: "uml-regression-library" });
    // Same counts as before Phase 2 widened the profile.
    expect(report.primitives).toBe(25);
    expect(host.validateProject("uml-regression-library").summary).toEqual({ errors: 0, warnings: 0, info: 0 });
  });
});

describe("regression: the widened endpoints stay honest", () => {
  let host: Host;
  const WB = "uml-endpoint-regression";
  beforeAll(async () => {
    host = await freshHost();
    await host.createProject({ workbook_id: WB, name: "endpoints", profile_id: PROFILE_ID });
    for (const [type, n] of [["Component", 20], ["Port", 21], ["Connector", 22], ["Interface", 23], ["Class", 24]] as const) {
      await host.createPrimitive(WB, {
        id: `uml:${type}:${ID(n)}`,
        type_id: `uml:${type}`,
        field_values: { xmi_id: ID(n), ...(type === "Connector" ? {} : { name: `${type}${n}` }) },
      });
    }
  });

  it("accepts a port owned by a component", async () => {
    const out = await host.createRelation(WB, {
      id: "uml:ownsport:ok",
      type_id: REL.OwnsPort,
      source_id: `uml:Component:${ID(20)}`,
      target_id: `uml:Port:${ID(21)}`,
    });
    expect(out.report.accepted).toBe(true);
  });

  it("refuses a port owned by an interface — widening did not become a wildcard", async () => {
    await expect(
      host.createRelation(WB, {
        id: "uml:ownsport:bad",
        type_id: REL.OwnsPort,
        source_id: `uml:Interface:${ID(23)}`,
        target_id: `uml:Port:${ID(21)}`,
      }),
    ).rejects.toThrow(FDPMException);
  });

  it("refuses a provided edge pointed at a class rather than an interface", async () => {
    await expect(
      host.createRelation(WB, {
        id: "uml:provides:bad",
        type_id: REL.Provides,
        source_id: `uml:Port:${ID(21)}`,
        target_id: `uml:Class:${ID(24)}`,
      }),
    ).rejects.toThrow(FDPMException);
  });

  it("refuses a connector end owned by anything but a connector", async () => {
    await expect(
      host.createRelation(WB, {
        id: "uml:ownsend:bad",
        type_id: REL.OwnsConnectorEnd,
        source_id: `uml:Component:${ID(20)}`,
        target_id: `uml:Port:${ID(21)}`,
      }),
    ).rejects.toThrow(FDPMException);
  });
});
