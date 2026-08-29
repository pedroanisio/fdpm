/**
 * Phase 1 — the abstract-metaclass policy.
 *
 * UML 2.5.1 marks roughly a third of its metaclasses abstract: Element,
 * NamedElement, Classifier, Feature, Vertex, ActivityNode and friends
 * exist to be specialised, never instantiated. The source library
 * carries no machine-readable marker for this — abstractness appears
 * only in prose doc comments — so a bridge derivation that names every
 * molecule as a primitive type silently invites `uml:Classifier`
 * instances the UML specification forbids.
 *
 * This suite fixes the policy in one place and enforces it in three:
 * the classification is complete over the source, the profile never
 * registers an abstract metaclass, and ingest refuses one by name with
 * a message that says why.
 */
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { Host } from "../../../src/core/host.js";
import { FDPMException } from "../../../src/core/errors/fdpm-exception.js";
import {
  METACLASS_ABSTRACTNESS,
  ABSTRACT_METACLASSES,
  CONCRETE_METACLASSES,
  isAbstractMetaclass,
  assertNoAbstractPrimitiveTypes,
} from "../../../plugins/uml/abstract.js";
import { ENTITY_NAMES, PROFILE_ID, primitiveTypeId } from "../../../plugins/uml/sidecar.js";
import { parseUmlModel } from "../../../plugins/uml/ingest.js";

/**
 * The metaclasses the source library exports, pinned as a fixture with
 * its provenance. Reading the library directly would tie the suite to a
 * path outside the repository (and to agent scratch); pinning it means a
 * change upstream fails this suite until the classification is updated
 * deliberately.
 */
import inventory from "./fixtures/uml-metaclasses.source.json" with { type: "json" };
const sourceMetaclasses = (): string[] => inventory.metaclasses;

describe("the classification is complete and disjoint", () => {
  it("classifies every metaclass the source library exports", () => {
    const source = sourceMetaclasses();
    expect(source.length).toBe(110);
    const unclassified = source.filter((m) => !(m in METACLASS_ABSTRACTNESS));
    expect(unclassified).toEqual([]);
  });

  it("classifies nothing the source does not export", () => {
    const source = new Set(sourceMetaclasses());
    expect(Object.keys(METACLASS_ABSTRACTNESS).filter((m) => !source.has(m))).toEqual([]);
  });

  it("splits into two disjoint sets that cover the whole domain", () => {
    expect(ABSTRACT_METACLASSES.size + CONCRETE_METACLASSES.size).toBe(110);
    expect([...ABSTRACT_METACLASSES].filter((m) => CONCRETE_METACLASSES.has(m))).toEqual([]);
  });

  it("marks the metaclasses UML 2.5.1 defines as abstract", () => {
    // A sample across the packages; the whole set is in abstract.ts with
    // its clause reference per entry.
    for (const m of [
      "Element",
      "NamedElement",
      "Namespace",
      "TypedElement",
      "MultiplicityElement",
      "RedefinableElement",
      "Relationship",
      "DirectedRelationship",
      "Classifier",
      "Feature",
      "StructuralFeature",
      "BehavioralFeature",
      "Behavior",
      "Event",
      "Vertex",
      "ActivityNode",
      "ActivityEdge",
      "ActivityGroup",
      "ControlNode",
      "ObjectNode",
      "Pin",
      "Action",
      "InteractionFragment",
      "MessageEnd",
    ]) {
      expect(isAbstractMetaclass(m), `${m} must be abstract`).toBe(true);
    }
  });

  it("marks the instantiable ones concrete", () => {
    for (const m of ["Class", "Package", "Property", "Operation", "Signal", "Reception", "State", "Transition", "UseCase", "Actor"]) {
      expect(isAbstractMetaclass(m), `${m} must be concrete`).toBe(false);
    }
  });
});

describe("the profile never registers an abstract metaclass", () => {
  it("every entity the plugin bridges is concrete", () => {
    expect(ENTITY_NAMES.filter((n) => isAbstractMetaclass(n))).toEqual([]);
  });

  it("the registered profile carries no abstract primitive type", async () => {
    const host = new Host({ dataDir: null, builtinDirs: [resolve(process.cwd(), "plugins")] });
    await host.load();
    const profile = host.profiles.getResolved(PROFILE_ID);
    const offenders = profile.primitive_types
      .map((p) => p.id.split(":").pop()!)
      .filter((n) => isAbstractMetaclass(n));
    expect(offenders).toEqual([]);
  });

  it("the guard names the offender rather than failing vaguely", () => {
    const bad = {
      id: PROFILE_ID,
      primitive_types: [{ id: primitiveTypeId("Class") }, { id: "uml:Classifier" }, { id: "uml:Vertex" }],
    };
    expect(() => assertNoAbstractPrimitiveTypes(bad)).toThrow(/uml:Classifier/);
    expect(() => assertNoAbstractPrimitiveTypes(bad)).toThrow(/uml:Vertex/);
    expect(() => assertNoAbstractPrimitiveTypes(bad)).toThrow(/abstract/i);
  });

  it("the guard passes a profile of concrete types", () => {
    expect(() =>
      assertNoAbstractPrimitiveTypes({
        id: PROFILE_ID,
        primitive_types: ENTITY_NAMES.map((n) => ({ id: primitiveTypeId(n) })),
      }),
    ).not.toThrow();
  });
});

describe("ingest refuses an abstract metaclass by name", () => {
  const model = (xmiType: string) => ({
    "xmi:id": "01HQ8Z3K7M4N5P6R7S8T9V0001",
    name: "M",
    packagedElement: [{ "xmi:id": "01HQ8Z3K7M4N5P6R7S8T9V0002", "xmi:type": xmiType, name: "X" }],
  });

  it("rejects uml:Classifier with a message that says it is abstract", () => {
    try {
      parseUmlModel(model("uml:Classifier"));
      throw new Error("expected rejection");
    } catch (err) {
      expect(err).toBeInstanceOf(FDPMException);
      const e = err as FDPMException;
      expect(e.category).toBe("verification");
      expect(e.message).toMatch(/abstract/i);
      expect(e.message).toContain("uml:Classifier");
    }
  });

  it("names a concrete alternative when one is obvious", () => {
    try {
      parseUmlModel(model("uml:Classifier"));
    } catch (err) {
      // The point of the message is to unblock the author, not to scold.
      expect((err as FDPMException).message).toMatch(/uml:Class|concrete/i);
    }
  });

  it("still accepts the concrete metaclasses", () => {
    expect(() => parseUmlModel(model("uml:Class"))).not.toThrow();
    expect(() => parseUmlModel(model("uml:Signal"))).not.toThrow();
  });
});

/**
 * Regressions. The defect this phase exists to prevent is a package
 * profile that names abstract metaclasses as primitive types — the exact
 * output a mechanical derivation over all 110 molecules produces. These
 * pin the guard at that scale and fix the boundaries of the ingest scan.
 */
describe("regression: a whole-domain derivation is caught, not shipped", () => {
  it("names every abstract metaclass when handed the full 110-type derivation", () => {
    const wholeDomain = {
      id: "profile:uml-full:2.5",
      primitive_types: sourceMetaclasses().map((m) => ({ id: `uml:${m}` })),
    };
    let message = "";
    try {
      assertNoAbstractPrimitiveTypes(wholeDomain);
      throw new Error("expected the guard to reject the full derivation");
    } catch (err) {
      message = (err as Error).message;
    }
    // 26 of the 110 are abstract in UML 2.5.1.
    expect(message).toContain(`${ABSTRACT_METACLASSES.size} primitive type(s)`);
    expect(ABSTRACT_METACLASSES.size).toBe(26);
    for (const m of ABSTRACT_METACLASSES) expect(message).toContain(`uml:${m}`);
    // …and it does not accuse the concrete ones.
    expect(message).not.toContain("uml:Class,");
    expect(message).not.toContain("uml:Signal");
  });

  it("points the reader at where the fields actually live", () => {
    try {
      assertNoAbstractPrimitiveTypes({ id: "p", primitive_types: [{ id: "uml:Feature" }] });
    } catch (err) {
      expect((err as Error).message).toContain("plugins/uml/abstract.ts");
      expect((err as Error).message).toMatch(/concrete metaclasses that specialise them/i);
    }
  });
});

describe("regression: the ingest scan's boundaries", () => {
  const base = { "xmi:id": "01HQ8Z3K7M4N5P6R7S8T9V0001", name: "M" };

  it("catches an abstract metaclass nested deep in the containment tree", () => {
    const nested = {
      ...base,
      packagedElement: [
        {
          "xmi:id": "01HQ8Z3K7M4N5P6R7S8T9V0002",
          "xmi:type": "uml:Package",
          name: "outer",
          packagedElement: [
            {
              "xmi:id": "01HQ8Z3K7M4N5P6R7S8T9V0003",
              "xmi:type": "uml:Package",
              name: "inner",
              packagedElement: [
                { "xmi:id": "01HQ8Z3K7M4N5P6R7S8T9V0004", "xmi:type": "uml:Feature", name: "deep" },
              ],
            },
          ],
        },
      ],
    };
    try {
      parseUmlModel(nested);
      throw new Error("expected rejection");
    } catch (err) {
      const e = err as FDPMException;
      expect(e.message).toContain("uml:Feature");
      expect(e.message).toMatch(/packagedElement\[0\].packagedElement\[0\].packagedElement\[0\]/);
    }
  });

  it("reports every abstract use, not only the first", () => {
    const many = {
      ...base,
      packagedElement: [
        { "xmi:id": "01HQ8Z3K7M4N5P6R7S8T9V0002", "xmi:type": "uml:Classifier", name: "a" },
        { "xmi:id": "01HQ8Z3K7M4N5P6R7S8T9V0003", "xmi:type": "uml:Feature", name: "b" },
        { "xmi:id": "01HQ8Z3K7M4N5P6R7S8T9V0004", "xmi:type": "uml:Vertex", name: "c" },
      ],
    };
    try {
      parseUmlModel(many);
      throw new Error("expected rejection");
    } catch (err) {
      const e = err as FDPMException;
      expect(e.message).toContain("3 abstract metaclass(es)");
      expect((e.toEnvelope() as { evidence?: { abstract_metaclasses?: string[] } }).evidence?.abstract_metaclasses)
        .toEqual(["uml:Classifier", "uml:Feature", "uml:Vertex"]);
    }
  });

  it("does not fire on an abstract metaclass NAME appearing outside xmi:type", () => {
    // A class legitimately called "Classifier" is not an abstract use.
    const named = {
      ...base,
      packagedElement: [
        { "xmi:id": "01HQ8Z3K7M4N5P6R7S8T9V0002", "xmi:type": "uml:Class", name: "Classifier" },
      ],
    };
    expect(() => parseUmlModel(named)).not.toThrow();
  });

  it("leaves a name that is not UML at all to the ordinary enum error", () => {
    const alien = {
      ...base,
      packagedElement: [
        { "xmi:id": "01HQ8Z3K7M4N5P6R7S8T9V0002", "xmi:type": "uml:Sprocket", name: "x" },
      ],
    };
    try {
      parseUmlModel(alien);
      throw new Error("expected rejection");
    } catch (err) {
      const e = err as FDPMException;
      expect(e.category).toBe("verification");
      // Not the abstract message — an unknown name is a different mistake.
      expect(e.message).not.toMatch(/is abstract/i);
      expect(e.message).toContain("UmlModelInput");
    }
  });
});
