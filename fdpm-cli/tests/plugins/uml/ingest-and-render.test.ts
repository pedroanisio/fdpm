/**
 * End to end: a UML model in the SOURCE library's shape (camelCase,
 * `xmi:id`, nested containment, `"*"` bounds) becomes a workbook on
 * profile:uml:2.5 and renders back as UML notation.
 *
 * The load-bearing assertion is identity: `Association::ownedEnd`
 * declares the Property, and `Association::memberEnd` addresses it. If
 * containment were left inline as a struct blob — what the bridge does
 * without lifting — those would be two different objects and the model
 * would be quietly wrong. Here they are one primitive with one id.
 *
 * ⚠ PALS's LAW — the failure-path tests are not optional decoration:
 * they are what makes parseUmlModel a verification layer rather than a
 * comment claiming to be one.
 */
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { Host } from "../../../src/core/host.js";
import { FDPMException } from "../../../src/core/errors/fdpm-exception.js";
import { buildUmlWorkbook, parseUmlModel } from "../../../plugins/uml/ingest.js";
import { MODEL_OUTLINE_RENDERER_ID } from "../../../plugins/uml/index.js";
import { PROFILE_ID, REL } from "../../../plugins/uml/sidecar.js";

const FIXTURE = join(process.cwd(), "tests/plugins/uml/fixtures/library.model.json");
const model = () => JSON.parse(readFileSync(FIXTURE, "utf8")) as Record<string, unknown>;

async function freshHost(): Promise<Host> {
  const host = new Host({ dataDir: null, builtinDirs: [resolve(process.cwd(), "plugins")] });
  await host.load();
  return host;
}

const ID = {
  book: "uml:Class:01HQ8Z3K7M4N5P6R7S8T9V0013",
  publication: "uml:Class:01HQ8Z3K7M4N5P6R7S8T9V0011",
  borrowable: "uml:Interface:01HQ8Z3K7M4N5P6R7S8T9V0008",
  loan: "uml:Association:01HQ8Z3K7M4N5P6R7S8T9V0021",
  borrowed: "uml:Property:01HQ8Z3K7M4N5P6R7S8T9V0023",
  keywords: "uml:Property:01HQ8Z3K7M4N5P6R7S8T9V0016",
  loanState: "uml:Enumeration:01HQ8Z3K7M4N5P6R7S8T9V0004",
  string: "uml:PrimitiveType:01HQ8Z3K7M4N5P6R7S8T9V0003",
} as const;

describe("buildUmlWorkbook — the library model", () => {
  let host: Host;
  let report: Awaited<ReturnType<typeof buildUmlWorkbook>>;

  beforeAll(async () => {
    host = await freshHost();
    report = await buildUmlWorkbook(host, model(), { workbookId: "uml-library" });
  });

  it("lands every element as a primitive on profile:uml:2.5", () => {
    expect(report.profileId).toBe(PROFILE_ID);
    // 1 model + 1 package + 5 classifiers + 1 association + 1 constraint
    // + 3 literals + 7 properties (5 attributes + 2 association ends)
    // + 2 operations + 2 parameters + 1 comment.
    expect(report.primitives).toBe(25);
    expect(report.byType["uml:Class"]).toBe(3);
    expect(report.byType["uml:Property"]).toBe(7);
    expect(report.byType["uml:EnumerationLiteral"]).toBe(3);
    expect(report.byType["uml:Parameter"]).toBe(2);
  });

  it("validates clean against the host pipeline", () => {
    const report = host.validateProject("uml-library");
    expect(report.summary).toEqual({ errors: 0, warnings: 0, info: 0 });
  });

  it("normalises names, bounds and default values on the way in", () => {
    const slice = host.getProject("uml-library");
    const keywords = slice.primitives[ID.keywords]!;
    // camelCase → snake_case, "*" → -1, "" → a ValueSpecification.
    expect(Object.keys(keywords.field_values)).toContain("is_ordered");
    expect(Object.keys(keywords.field_values)).not.toContain("isOrdered");
    expect(keywords.field_values["upper"]).toBe(-1);
    expect(keywords.field_values["lower"]).toBe(0);
    const subtitle = slice.primitives["uml:Property:01HQ8Z3K7M4N5P6R7S8T9V0015"]!;
    expect(subtitle.field_values["default_value"]).toEqual({ kind: "literal_string", body: "" });
    expect(keywords.field_values["qualified_name"]).toBe("Library::lending::Book::keywords");
  });

  it("gives the association end ONE identity, shared by ownership and membership", () => {
    const slice = host.getProject("uml-library");
    const rels = Object.values(slice.relations);
    const ownedBy = rels.filter((r) => r.type_id === REL.OwnsAttribute && r.target_id === ID.borrowed);
    const memberOf = rels.filter((r) => r.type_id === REL.MemberEnd && r.target_id === ID.borrowed);
    expect(ownedBy).toHaveLength(1);
    expect(memberOf).toHaveLength(1);
    expect(ownedBy[0]!.source_id).toBe(ID.loan);
    expect(memberOf[0]!.source_id).toBe(ID.loan);
    // …and exactly one primitive carries that id.
    expect(Object.keys(slice.primitives).filter((id) => id === ID.borrowed)).toHaveLength(1);
  });

  it("resolves generalisation, realisation, dependency and typing as relations", () => {
    const slice = host.getProject("uml-library");
    const rels = Object.values(slice.relations);
    const spec = rels.find((r) => r.type_id === REL.Specializes && r.source_id === ID.book);
    expect(spec?.target_id).toBe(ID.publication);
    expect(spec?.field_values?.["is_substitutable"]).toBe(true);

    expect(rels.some((r) => r.type_id === REL.Realizes && r.source_id === ID.book && r.target_id === ID.borrowable)).toBe(true);
    const dep = rels.find((r) => r.type_id === REL.DependsOn);
    expect(dep?.target_id).toBe(ID.loanState);
    expect(dep?.field_values?.["kind"]).toBe("usage");
    expect(rels.some((r) => r.type_id === REL.TypedBy && r.source_id === ID.keywords && r.target_id === ID.string)).toBe(true);
    expect(rels.some((r) => r.type_id === REL.Constrains && r.target_id === ID.loan)).toBe(true);
    expect(rels.some((r) => r.type_id === REL.Annotates && r.target_id === ID.loan)).toBe(true);
  });

  it("renders the model in UML notation through uml:ModelOutlineRenderer", async () => {
    const slice = host.getProject("uml-library");
    const out = await host.plugins.runRenderer(
      "text/markdown",
      {
        workbookId: "uml-library",
        workbook: slice.workbook,
        primitives: Object.values(slice.primitives),
        relations: Object.values(slice.relations),
        templates: Object.values(slice.templates),
        profile: host.profiles.getResolved(PROFILE_ID),
      },
      { rendererId: MODEL_OUTLINE_RENDERER_ID },
    );
    const md = new TextDecoder().decode(out.bytes);

    expect(md).toContain("«model» Library");
    expect(md).toContain("«package» lending");
    expect(md).toContain("«class» Book");
    expect(md).toContain("_specializes:_ Publication");
    expect(md).toContain("_realizes:_ Borrowable");
    // UML attribute notation: visibility, name, type, multiplicity.
    expect(md).toContain("`+ keywords : String [0..*]`");
    expect(md).toContain("`# title : String`");
    expect(md).toContain("`+ isAvailable() : String`");
    expect(md).toContain("«enumeration» LoanState");
    expect(md).toContain("`requested`");
    expect(md).toContain("self.borrowed->size() <= 10");
    expect(md).toContain("> Loans are governed by the lending policy of 2026-01.");
    // The abstract Publication is marked, and the association's ends print.
    expect(md).toContain("«class» Publication _{abstract}_");
    // An association end is one Property: printed as an end, not repeated
    // as an attribute of the association.
    expect(md.match(/borrowed : Book \[0\.\.\*\]/g) ?? []).toHaveLength(1);
    // A comment attached to an element is not "unowned".
    expect(md).not.toContain("## Unowned elements");
    expect(md).toContain("end `borrowed : Book [0..*]`");
  });
});

describe("parseUmlModel — the verification gate (PALS's LAW)", () => {
  const cases: Array<[string, (m: Record<string, any>) => void, string]> = [
    [
      "unresolved type reference",
      (m) => {
        m["packagedElement"][0].packagedElement[4].ownedAttribute[0].type = "01HQ8Z3K7M4N5P6R7S8T9V9999";
      },
      "unresolved reference",
    ],
    [
      "duplicate xmi:id",
      (m) => {
        m["packagedElement"][0].packagedElement[4].ownedAttribute[0]["xmi:id"] =
          "01HQ8Z3K7M4N5P6R7S8T9V0011";
      },
      "duplicate xmi:id",
    ],
    [
      "association with a single end",
      (m) => {
        m["packagedElement"][0].packagedElement[6].ownedEnd.pop();
      },
      "requires at least 2",
    ],
    [
      "a property typed by something that is not a classifier",
      (m) => {
        m["packagedElement"][0].packagedElement[4].ownedAttribute[0].type =
          "01HQ8Z3K7M4N5P6R7S8T9V0025";
      },
      "not a classifier",
    ],
  ];

  for (const [label, mutate, expected] of cases) {
    it(`rejects ${label}`, () => {
      const m = model();
      mutate(m as Record<string, any>);
      try {
        parseUmlModel(m);
        throw new Error("expected parseUmlModel to reject");
      } catch (err) {
        expect(err).toBeInstanceOf(FDPMException);
        const e = err as FDPMException;
        expect(e.category).toBe("verification");
        expect(e.message).toContain(expected);
      }
    });
  }

  it("rejects an unknown field rather than silently dropping it", () => {
    const m = model() as Record<string, any>;
    m["packagedElement"][0].packagedElement[4].ownedAttribute[0].isCompozite = true;
    expect(() => parseUmlModel(m)).toThrow(FDPMException);
  });

  it("rejects an xmi:id that is not a ULID", () => {
    const m = model() as Record<string, any>;
    m["packagedElement"][0]["xmi:id"] = "pkg-1";
    expect(() => parseUmlModel(m)).toThrow(FDPMException);
  });

  it("writes nothing when the gate rejects", async () => {
    const host = await freshHost();
    const m = model() as Record<string, any>;
    m["packagedElement"][0].packagedElement[4].ownedAttribute[0].type = "01HQ8Z3K7M4N5P6R7S8T9V9999";
    await expect(buildUmlWorkbook(host, m, { workbookId: "uml-rejected" })).rejects.toThrow(FDPMException);
    expect(host.listProjects().some((p) => p.id === "uml-rejected")).toBe(false);
  });
});
