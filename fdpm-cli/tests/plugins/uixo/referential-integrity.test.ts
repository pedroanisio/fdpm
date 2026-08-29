/**
 * The regression this whole plugin exists to prevent.
 *
 * Handed to the bridge unchanged, uixo-native.ts yields 712 primitive
 * types, ZERO relation types, and 1,653 graph edges stored as lists of
 * opaque id strings. A Button written with
 * `hasChildComponent: ["ex:does-not-exist"]` is then accepted by the host
 * with no findings at all — measured, before derive.ts existed.
 *
 * These tests assert the fixed behaviour at the host boundary: the edge is
 * not a field any more (writing it as one is rejected), it is a relation,
 * and the relation's endpoint must exist and must satisfy the ontology's
 * declared range.
 */
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { Host } from "../../../src/core/host.js";
import { FDPMException } from "../../../src/core/errors/fdpm-exception.js";
import { PROFILE_ID } from "../../../plugins/uixo/sidecar.js";
import { relationTypeId } from "../../../plugins/uixo/derive.js";

const WB = "uixo-refint";
const BUTTON = "uixo:Uixo_Button";
const CANVAS = "uixo:Uixo_Canvas";
const HAS_CHILD = relationTypeId("hasChildComponent");

let host: Host;

beforeAll(async () => {
  host = new Host({ dataDir: null, builtinDirs: [resolve(process.cwd(), "plugins")] });
  await host.load();
  await host.createProject({ workbook_id: WB, name: "referential integrity", profile_id: PROFILE_ID });
  await host.createPrimitive(WB, {
    id: `${BUTTON}:save`,
    type_id: BUTTON,
    field_values: { id: "ex:save", type: "uixo:Button", label: "Save" },
  });
  await host.createPrimitive(WB, {
    id: `${CANVAS}:main`,
    type_id: CANVAS,
    field_values: { id: "ex:main", type: "uixo:Canvas", label: "Main canvas" },
  });
});

describe("edges are no longer unchecked fields", () => {
  it("REGRESSION: writing hasChildComponent as a field is rejected", async () => {
    // Before derive.ts this was accepted with zero findings. `.omit()` on
    // a strict object turns the lifted key into an unrecognised one, so
    // the old shape cannot be smuggled back in.
    await expect(
      host.createPrimitive(WB, {
        id: `${BUTTON}:legacy-shape`,
        type_id: BUTTON,
        field_values: {
          id: "ex:legacy",
          type: "uixo:Button",
          label: "Legacy",
          hasChildComponent: ["ex:does-not-exist-anywhere"],
        },
      }),
    ).rejects.toThrow(FDPMException);
  });

  it("the same primitive without the edge field is accepted", async () => {
    const out = await host.createPrimitive(WB, {
      id: `${BUTTON}:ok`,
      type_id: BUTTON,
      field_values: { id: "ex:ok", type: "uixo:Button", label: "Fine" },
    });
    expect(out.report.accepted).toBe(true);
  });

  it("no primitive type carries a list-typed field any more", () => {
    const profile = host.profiles.getResolved(PROFILE_ID);
    const lists: string[] = [];
    for (const pt of profile.primitive_types) {
      for (const f of pt.fields) {
        if (f.kind === "list") lists.push(`${pt.id}.${f.name}`);
      }
    }
    expect(lists).toEqual([]);
  });
});

describe("edges are relations the host enforces", () => {
  it("accepts an edge whose endpoints both exist and satisfy domain and range", async () => {
    // The ontology gives hasChildComponent to the 272 uixo:Component
    // subclasses. Button is one; Canvas is not (see the domain test below).
    const out = await host.createRelation(WB, {
      id: "uixo:hasChildComponent:save--ok",
      type_id: HAS_CHILD,
      source_id: `${BUTTON}:save`,
      target_id: `${BUTTON}:ok`,
    });
    expect(out.report.accepted).toBe(true);
  });

  it("REGRESSION: an edge to a non-existent entity is refused", async () => {
    await expect(
      host.createRelation(WB, {
        id: "uixo:hasChildComponent:save--ghost",
        type_id: HAS_CHILD,
        source_id: `${BUTTON}:save`,
        target_id: `${BUTTON}:does-not-exist-anywhere`,
      }),
    ).rejects.toThrow(FDPMException);
  });

  it("refuses an edge from a class the ontology gives no such property", async () => {
    // owl:domain is enforced too, not just range: uixo:Canvas does not
    // declare hasChildComponent, so it cannot be the source of one.
    const rel = host.profiles.getResolved(PROFILE_ID).relation_types?.find((r) => r.id === HAS_CHILD);
    expect(rel?.source_types).not.toContain(CANVAS);
    await expect(
      host.createRelation(WB, {
        id: "uixo:hasChildComponent:main--save",
        type_id: HAS_CHILD,
        source_id: `${CANVAS}:main`,
        target_id: `${BUTTON}:save`,
      }),
    ).rejects.toThrow(FDPMException);
  });

  it("refuses an edge whose target is outside the property's declared range", async () => {
    // uixo:rel.hasLayout has range uixo:Layout; a Button is not one.
    const hasLayout = relationTypeId("hasLayout");
    const rel = host.profiles.getResolved(PROFILE_ID).relation_types?.find((r) => r.id === hasLayout);
    expect(rel).toBeDefined();
    expect(rel?.target_types).not.toContain(BUTTON);
    await expect(
      host.createRelation(WB, {
        id: "uixo:hasLayout:main--save",
        type_id: hasLayout,
        source_id: `${CANVAS}:main`,
        target_id: `${BUTTON}:save`,
      }),
    ).rejects.toThrow(FDPMException);
  });
});
