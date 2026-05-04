import { describe, it, expect, expectTypeOf } from "vitest";
import { Host } from "../src/core/host.js";
import {
  defineProject,
  renderProject,
  type RenderOptions,
  type RenderResult,
  type ProjectHeader,
  type PrimitiveSpec,
  type RelationSpec,
  type PatchPrimitiveInput,
  type PatchRelationInput,
} from "../src/sdk.js";

/**
 * P3 SDK regressions:
 *   - P3 #11 RenderOptions field renamed `rendererId` → `renderer`
 *            for alias-convention consistency. Result envelope keeps
 *            `rendererId`/`pluginId` (provenance fields, not aliases).
 *
 * The audit also called out P2 #11 / P3 #11 ambiguity around the
 * RenderOptions naming. The auditor's proposal `projectId` /
 * `targetMimeType` was rejected (it goes the wrong direction —
 * `project` IS already the alias). Real fix: `rendererId` → `renderer`.
 */

// -- structural rename: `rendererId` → `renderer` ----------------------

describe("RenderOptions alias-convention rename", () => {
  it("RenderOptions exposes `renderer`, not `rendererId`", () => {
    // Type-level: the new name is required; the old one is gone.
    const ok: RenderOptions = {
      project: "p",
      target: "text/markdown",
      renderer: "fs:SpecRenderer",
    };
    expect(ok.renderer).toBe("fs:SpecRenderer");

    // The old field name must NOT appear in the input shape.
    expectTypeOf<RenderOptions>().not.toHaveProperty("rendererId");
    expectTypeOf<RenderOptions>().toHaveProperty("renderer");
  });

  it("RenderResult keeps `rendererId`/`pluginId` (output provenance)", () => {
    // Outputs intentionally keep the Host-flavoured suffixes — they
    // identify the runtime entity that produced the bytes. Stripping
    // would lose meaning.
    expectTypeOf<RenderResult>().toHaveProperty("rendererId");
    expectTypeOf<RenderResult>().toHaveProperty("pluginId");
  });
});

// -- runtime forwarding of the new `renderer` field --------------------

describe("renderProject forwards `renderer` to the host runtime", () => {
  it("renders successfully when `renderer` matches a registered id", async () => {
    const host = new Host({ dataDir: null });
    await host.load();
    const profiles = host.profiles.listRaw();
    const fs = profiles.find((p) => p.id.startsWith("profile:formal-specification:"));
    if (!fs) {
      // Plugin runtime not available in this env — skip rather than
      // fail noisily; the rename's structural correctness is covered
      // by the type-level test above.
      return;
    }
    await defineProject(host, {
      id: "p3-renderer-ok",
      name: "Renderer rename test",
      profile: fs.id,
    }).commit();

    const r = await renderProject(host, {
      project: "p3-renderer-ok",
      target: "text/markdown",
      renderer: "fs:SpecRenderer",
    });
    expect(r.rendererId).toBe("fs:SpecRenderer");
    expect(r.contentType).toBe("text/markdown");
  });

  it("propagates the host's not-found error when `renderer` is unknown", async () => {
    const host = new Host({ dataDir: null });
    await host.load();
    const profiles = host.profiles.listRaw();
    const fs = profiles.find((p) => p.id.startsWith("profile:formal-specification:"));
    if (!fs) return;
    await defineProject(host, {
      id: "p3-renderer-bad",
      name: "Renderer rename test",
      profile: fs.id,
    }).commit();

    await expect(
      renderProject(host, {
        project: "p3-renderer-bad",
        target: "text/markdown",
        renderer: "does:not:exist",
      }),
    ).rejects.toThrow(/rendererId=does:not:exist|no renderer/i);
  });

  it("renders with default renderer when `renderer` is omitted", async () => {
    const host = new Host({ dataDir: null });
    await host.load();
    const profiles = host.profiles.listRaw();
    const fs = profiles.find((p) => p.id.startsWith("profile:formal-specification:"));
    if (!fs) return;
    await defineProject(host, {
      id: "p3-renderer-default",
      name: "Default renderer test",
      profile: fs.id,
    }).commit();

    const r = await renderProject(host, {
      project: "p3-renderer-default",
      target: "text/markdown",
    });
    expect(typeof r.rendererId).toBe("string");
    expect(r.rendererId.length).toBeGreaterThan(0);
  });
});

// -- pin the alias convention across every SDK input shape -------------

describe("SDK alias convention is honored across input shapes", () => {
  // The file-level docstring claims a single naming rule for INPUT
  // shapes: drop `_id` / `Id` suffixes, rename `field_values` →
  // `fields`, snake_case → camelCase. These compile-time pins fail
  // loudly if anyone re-introduces a Host-flavoured suffix on any
  // input shape, which would silently regress consistency.

  it("ProjectHeader uses `id`/`profile`, not `project_id`/`profile_id`", () => {
    expectTypeOf<ProjectHeader>().toHaveProperty("id");
    expectTypeOf<ProjectHeader>().toHaveProperty("profile");
    expectTypeOf<ProjectHeader>().not.toHaveProperty("project_id");
    expectTypeOf<ProjectHeader>().not.toHaveProperty("profile_id");
  });

  it("PrimitiveSpec uses `type`/`fields`/`scope`, not the *_id forms", () => {
    expectTypeOf<PrimitiveSpec>().toHaveProperty("type");
    expectTypeOf<PrimitiveSpec>().toHaveProperty("fields");
    expectTypeOf<PrimitiveSpec>().toHaveProperty("scope");
    expectTypeOf<PrimitiveSpec>().not.toHaveProperty("type_id");
    expectTypeOf<PrimitiveSpec>().not.toHaveProperty("scope_id");
    expectTypeOf<PrimitiveSpec>().not.toHaveProperty("field_values");
  });

  it("RelationSpec uses `type`/`from`/`to`/`fields`, not the host forms", () => {
    expectTypeOf<RelationSpec>().toHaveProperty("type");
    expectTypeOf<RelationSpec>().toHaveProperty("from");
    expectTypeOf<RelationSpec>().toHaveProperty("to");
    expectTypeOf<RelationSpec>().toHaveProperty("fields");
    expectTypeOf<RelationSpec>().not.toHaveProperty("type_id");
    expectTypeOf<RelationSpec>().not.toHaveProperty("source_id");
    expectTypeOf<RelationSpec>().not.toHaveProperty("target_id");
    expectTypeOf<RelationSpec>().not.toHaveProperty("field_values");
  });

  it("PatchPrimitiveInput uses `project`/`fields`/`scope`/`expectedRevision`", () => {
    expectTypeOf<PatchPrimitiveInput>().toHaveProperty("project");
    expectTypeOf<PatchPrimitiveInput>().toHaveProperty("fields");
    expectTypeOf<PatchPrimitiveInput>().toHaveProperty("scope");
    expectTypeOf<PatchPrimitiveInput>().toHaveProperty("expectedRevision");
    expectTypeOf<PatchPrimitiveInput>().not.toHaveProperty("project_id");
    expectTypeOf<PatchPrimitiveInput>().not.toHaveProperty("scope_id");
    expectTypeOf<PatchPrimitiveInput>().not.toHaveProperty("expected_revision");
    expectTypeOf<PatchPrimitiveInput>().not.toHaveProperty("field_values");
  });

  it("PatchRelationInput uses `project`/`fields`/`expectedRevision`", () => {
    expectTypeOf<PatchRelationInput>().toHaveProperty("project");
    expectTypeOf<PatchRelationInput>().toHaveProperty("fields");
    expectTypeOf<PatchRelationInput>().toHaveProperty("expectedRevision");
    expectTypeOf<PatchRelationInput>().not.toHaveProperty("project_id");
    expectTypeOf<PatchRelationInput>().not.toHaveProperty("expected_revision");
    expectTypeOf<PatchRelationInput>().not.toHaveProperty("field_values");
  });

  it("RenderOptions uses `project`/`target`/`renderer` (no Id/_id)", () => {
    expectTypeOf<RenderOptions>().toHaveProperty("project");
    expectTypeOf<RenderOptions>().toHaveProperty("target");
    expectTypeOf<RenderOptions>().toHaveProperty("renderer");
    expectTypeOf<RenderOptions>().not.toHaveProperty("project_id");
    expectTypeOf<RenderOptions>().not.toHaveProperty("rendererId");
  });
});
