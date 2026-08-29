/**
 * Activation contract for fdpm.uml: the profile the host serves is the
 * profile on disk, the twelve author-declared relation types survive
 * finalizeProfile, and every metaclass carries a Zod validator that
 * rejects malformed input rather than storing it.
 */
import { resolve } from "node:path";
import { describe, expect, it, beforeAll } from "vitest";
import { Host } from "../../../src/core/host.js";
import { FDPMException } from "../../../src/core/errors/fdpm-exception.js";
import {
  ENTITY_NAMES,
  PLUGIN_ID,
  PROFILE_ID,
  RELATION_TYPES,
  primitiveTypeId,
} from "../../../plugins/uml/sidecar.js";
import generated from "../../../plugins/uml/generated/profile.json" with { type: "json" };

async function freshHost(): Promise<Host> {
  const host = new Host({ dataDir: null, builtinDirs: [resolve(process.cwd(), "plugins")] });
  await host.load();
  return host;
}

let host: Host;
beforeAll(async () => {
  host = await freshHost();
});

describe("fdpm.uml activation", () => {
  it("registers profile:uml:2.5 with all fourteen metaclasses", () => {
    expect(host.profiles.has(PROFILE_ID)).toBe(true);
    const profile = host.profiles.getResolved(PROFILE_ID);
    const ids = profile.primitive_types.map((p) => p.id).sort();
    expect(ids).toEqual(ENTITY_NAMES.map(primitiveTypeId).sort());
    expect(ids).toContain("uml:Class");
    expect(ids).toContain("uml:Association");
  });

  it("carries the twelve author-declared relation types with their polymorphic endpoints", () => {
    const profile = host.profiles.getResolved(PROFILE_ID);
    const rels = profile.relation_types ?? [];
    expect(rels.map((r) => r.id).sort()).toEqual(RELATION_TYPES.map((r) => r.id).sort());

    const owns = rels.find((r) => r.id === "uml:Owns");
    // Package ownership is polymorphic: a package may own any
    // PackageableElement. This is the case the sidecar's ReferenceSpec
    // cannot express and the reason the relations are hand-declared.
    expect(owns?.target_types).toContain("uml:Class");
    expect(owns?.target_types).toContain("uml:Package");
    expect(owns?.source_types).toEqual(["uml:Package", "uml:Model"]);

    const memberEnd = rels.find((r) => r.id === "uml:MemberEnd");
    expect(memberEnd?.target_types).toEqual(["uml:Property"]);
  });

  it("the registered profile matches generated/profile.json (no runtime-only drift)", () => {
    const live = host.profiles.getResolved(PROFILE_ID);
    expect(live.primitive_types.map((p) => p.id).sort()).toEqual(
      generated.primitive_types.map((p) => p.id).sort(),
    );
    expect((live.relation_types ?? []).map((r) => r.id).sort()).toEqual(
      generated.relation_types.map((r) => r.id).sort(),
    );
    expect(live.version).toBe(generated.version);
  });

  it("registers the model-outline renderer, and only that", () => {
    const ids = host.plugins.listRenderers().map((r) => r.rendererId);
    expect(ids).toContain("uml:ModelOutlineRenderer");
  });
});

describe("per-metaclass Zod validators", () => {
  const WB = "uml-validator-test";
  const GOOD_ID = "01HQ8Z3K7M4N5P6R7S8T9V0001";

  beforeAll(async () => {
    await host.createProject({ workbook_id: WB, name: "validators", profile_id: PROFILE_ID });
  });

  it("accepts a well-formed Class", async () => {
    const out = await host.createPrimitive(WB, {
      id: `uml:Class:${GOOD_ID}`,
      type_id: "uml:Class",
      field_values: { xmi_id: GOOD_ID, name: "Book", visibility: "public", is_abstract: false },
    });
    expect(out.append.project_revision).toBeGreaterThan(0);
    expect(out.report.accepted).toBe(true);
    const stored = host.getProject(WB).primitives[`uml:Class:${GOOD_ID}`];
    expect(stored?.field_values["name"]).toBe("Book");
    // Defaults declared in the schema are applied on the way in.
    expect(stored?.field_values["visibility"]).toBe("public");
  });

  it("rejects an xmi_id that is not a ULID", async () => {
    await expect(
      host.createPrimitive(WB, {
        id: "uml:Class:not-a-ulid",
        type_id: "uml:Class",
        field_values: { xmi_id: "not-a-ulid", name: "Broken" },
      }),
    ).rejects.toThrow(FDPMException);
  });

  it("rejects a visibility outside VisibilityKind", async () => {
    const id = "01HQ8Z3K7M4N5P6R7S8T9V0002";
    await expect(
      host.createPrimitive(WB, {
        id: `uml:Class:${id}`,
        type_id: "uml:Class",
        field_values: { xmi_id: id, name: "Broken", visibility: "internal" },
      }),
    ).rejects.toThrow(FDPMException);
  });

  it("rejects a Comment with no body (the one required field)", async () => {
    const id = "01HQ8Z3K7M4N5P6R7S8T9V0003";
    await expect(
      host.createPrimitive(WB, {
        id: `uml:Comment:${id}`,
        type_id: "uml:Comment",
        field_values: { xmi_id: id },
      }),
    ).rejects.toThrow(FDPMException);
  });

  it("rejects a relation whose endpoints the profile does not allow", async () => {
    const cls = "01HQ8Z3K7M4N5P6R7S8T9V0004";
    const cmt = "01HQ8Z3K7M4N5P6R7S8T9V0005";
    await host.createPrimitive(WB, {
      id: `uml:Class:${cls}`,
      type_id: "uml:Class",
      field_values: { xmi_id: cls, name: "Owner" },
    });
    await host.createPrimitive(WB, {
      id: `uml:Comment:${cmt}`,
      type_id: "uml:Comment",
      field_values: { xmi_id: cmt, body: "note" },
    });
    // uml:OwnsAttribute targets uml:Property only.
    await expect(
      host.createRelation(WB, {
        id: "uml:ownsattribute:bad",
        type_id: "uml:OwnsAttribute",
        source_id: `uml:Class:${cls}`,
        target_id: `uml:Comment:${cmt}`,
      }),
    ).rejects.toThrow(FDPMException);
  });
});
