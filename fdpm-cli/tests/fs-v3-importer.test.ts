import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { Host } from "../src/core/host.js";
import { PROFILE_ID } from "../plugins/formal_specification/index.js";
import {
  fsV3Importer,
  FS_V3_DEFAULTS,
} from "../plugins/fs_v3_importer/index.js";
import { ProjectTransfer } from "../src/core/models/instance.js";

/**
 * Tests for the fs-v3 cap:importer plugin.
 *
 * Coverage:
 *  - Pure transformation: field renames, scope handling, metadata folding.
 *  - Importer is registered and discoverable through the runtime.
 *  - End-to-end host.plugins.runImporter dispatch + ProjectTransfer parse.
 *  - Real-world fixture: the roadmap-unified-v04.fs-v3.json file at the
 *    repo root (when present).
 */

const FIXTURE: { primitives: unknown[]; relations: unknown[] } = {
  primitives: [
    {
      id: "section:why",
      type_id: "fs:Section",
      profile_id: PROFILE_ID,
      scope: "scope:fs:specification",
      fields: { number: 1, title: "Why", status: "stable" },
      metadata: { created_at: "2026-05-04T00:00:00Z", authored_by: "test" },
    },
    {
      id: "contract:phase-1-to-2",
      type_id: "fs:Contract",
      profile_id: PROFILE_ID,
      scope: null,
      fields: { transition: "1→2", precondition: "x", postcondition: "y" },
    },
  ],
  relations: [
    {
      id: "rel:why-contains-how",
      type_id: "fs:ContainedIn",
      source: "section:how-to-read",
      target: "section:why",
      metadata: { is_primary: true, order: 1 },
      strength: "required",
    },
    {
      id: "rel:bare",
      type_id: "fs:References",
      source: "a:1",
      target: "b:2",
    },
  ],
};

describe("fs-v3 importer — pure transformation", () => {
  it("synthesises a ProjectTransfer envelope with caller-supplied project metadata", () => {
    const transfer = fsV3Importer(FIXTURE, {
      projectId: "demo",
      projectName: "Demo",
      projectDescription: "test",
    });
    expect(transfer.spec_core).toBe("1.1");
    expect(transfer.project.id).toBe("demo");
    expect(transfer.project.name).toBe("Demo");
    expect(transfer.project.description).toBe("test");
    expect(transfer.project.profile_id).toBe(PROFILE_ID);
    expect(transfer.primitives).toHaveLength(2);
    expect(transfer.relations).toHaveLength(2);
    expect(transfer.templates).toEqual([]);
    expect(transfer.test_suites).toEqual([]);
  });

  it("renames primitive fields → field_values and scope → scope_id; drops null scope and per-record metadata", () => {
    const t = fsV3Importer(FIXTURE, { projectId: "demo", projectName: "Demo" });
    const sec = t.primitives.find((p) => p.id === "section:why")!;
    expect(sec.field_values).toEqual({ number: 1, title: "Why", status: "stable" });
    expect(sec.scope_id).toBe("scope:fs:specification");
    expect((sec as Record<string, unknown>)["metadata"]).toBeUndefined();

    const contract = t.primitives.find((p) => p.id === "contract:phase-1-to-2")!;
    expect(contract.scope_id).toBeUndefined();
  });

  it("renames relation source/target → source_id/target_id and folds metadata + strength into field_values", () => {
    const t = fsV3Importer(FIXTURE, { projectId: "demo", projectName: "Demo" });
    const rel = t.relations.find((r) => r.id === "rel:why-contains-how")!;
    expect(rel.source_id).toBe("section:how-to-read");
    expect(rel.target_id).toBe("section:why");
    expect(rel.field_values).toEqual({
      _metadata: { is_primary: true, order: 1 },
      _strength: "required",
    });
    const bare = t.relations.find((r) => r.id === "rel:bare")!;
    expect(bare.field_values).toEqual({});
  });

  it("falls back to FS_V3_DEFAULTS when no options are supplied", () => {
    const t = fsV3Importer(FIXTURE);
    expect(t.project.id).toBe(FS_V3_DEFAULTS.projectId);
    expect(t.project.name).toBe(FS_V3_DEFAULTS.projectName);
  });

  it("rejects input that is not a {primitives, relations} dump as FDPMException(verification)", async () => {
    // The importer throws a typed FDPMException(verification) so the
    // runtime's exception barrier can pass it through to the operator
    // without quarantining the plugin.
    const { FDPMException } = await import("../src/core/errors/fdpm-exception.js");
    try {
      fsV3Importer({ foo: "bar" });
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(FDPMException);
      expect((e as InstanceType<typeof FDPMException>).category).toBe("verification");
    }
    try {
      fsV3Importer(null);
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(FDPMException);
      expect((e as InstanceType<typeof FDPMException>).category).toBe("verification");
    }
  });

  it("produces a ProjectTransfer that passes the canonical zod schema", () => {
    const t = fsV3Importer(FIXTURE, { projectId: "demo", projectName: "Demo" });
    const result = ProjectTransfer.safeParse(t);
    expect(result.success).toBe(true);
  });
});

describe("fs-v3 importer — runtime registration + dispatch", () => {
  it("is auto-registered as an in-tree (core-trust) plugin", async () => {
    const host = new Host({
      dataDir: null,
      builtinDirs: [resolve(process.cwd(), "plugins")],
      pluginPaths: [],
    });
    await host.load();
    const r = host.plugins.get("fdpm.fs-v3-importer");
    expect(r).toBeDefined();
    expect(r!.state).toBe("active");
    expect(r!.trust).toBe("core");
    const importer = host.plugins.findImporter("fs-v3");
    expect(importer).toBeDefined();
    expect(importer!.pluginId).toBe("fdpm.fs-v3-importer");
  });

  it("runImporter dispatches the registered importer and returns a ProjectTransfer", async () => {
    const host = new Host({
      dataDir: null,
      builtinDirs: [resolve(process.cwd(), "plugins")],
      pluginPaths: [],
    });
    await host.load();
    const transfer = await host.plugins.runImporter("fs-v3", FIXTURE, {
      projectId: "demo-rt",
      projectName: "Demo Runtime",
    });
    expect(transfer.project.id).toBe("demo-rt");
    expect(transfer.primitives).toHaveLength(2);
    expect(transfer.relations).toHaveLength(2);
  });

  it("rejects a request for an unknown format", async () => {
    const host = new Host({
      dataDir: null,
      builtinDirs: [resolve(process.cwd(), "plugins")],
      pluginPaths: [],
    });
    await host.load();
    await expect(host.plugins.runImporter("does-not-exist", {})).rejects.toThrow(
      /no importer registered/,
    );
  });
});

describe("fs-v3 importer — real roadmap fixture", () => {
  const ROADMAP = resolve(process.cwd(), "..", "roadmap-unified-v04.fs-v3.json");
  const fixturePresent = existsSync(ROADMAP);

  (fixturePresent ? it : it.skip)(
    "imports the full roadmap-unified-v04 dump end-to-end",
    async () => {
      const raw = JSON.parse(readFileSync(ROADMAP, "utf8"));
      const host = new Host({
        dataDir: null,
        builtinDirs: [resolve(process.cwd(), "plugins")],
        pluginPaths: [],
      });
      await host.load();
      const transfer = await host.plugins.runImporter("fs-v3", raw, {
        projectId: "roadmap-v04",
        projectName: "Roadmap Unified v0.4",
      });
      // Should round-trip the counts.
      expect(transfer.primitives.length).toBe(
        (raw as { primitives: unknown[] }).primitives.length,
      );
      expect(transfer.relations.length).toBe(
        (raw as { relations: unknown[] }).relations.length,
      );
      // Canonical schema parse succeeds.
      expect(ProjectTransfer.safeParse(transfer).success).toBe(true);
    },
  );

  /**
   * Regression: the v0.4 source declares per-phase `reads`/`writes`/
   * `formality_level`/`revisit_label` fields that drive Bernstein-condition
   * parallelism analysis (review-v05-1.md N.2: 12-vs-66 gap). The
   * formal_specification plugin's fs:Phase schema must accept them and
   * the round-trip (fs-v3 dump → ProjectTransfer → host.createPrimitive)
   * must preserve them so a downstream analyser can iterate over them.
   *
   * Three things this test guards against:
   *   1. Importer regression: fs-v3 importer dropping `fields` keys it
   *      doesn't recognise (it currently passes through verbatim).
   *   2. Schema regression: fs:Phase schema removing or renaming the
   *      `reads`/`writes` fields.
   *   3. Validation regression: Core pipeline rejecting the imported
   *      shape (e.g. if StructField[StateComponents] resolution broke).
   */
  (fixturePresent ? it : it.skip)(
    "preserves per-phase reads/writes/formality_level + validates against schema",
    async () => {
      const raw = JSON.parse(readFileSync(ROADMAP, "utf8")) as {
        primitives: Array<{ id: string; type_id: string; fields?: Record<string, unknown> }>;
      };
      const host = new Host({
        dataDir: null,
        builtinDirs: [resolve(process.cwd(), "plugins")],
        pluginPaths: [],
      });
      await host.load();
      const transfer = await host.plugins.runImporter("fs-v3", raw, {
        projectId: "rm-bernstein",
        projectName: "RM Bernstein",
      });
      // Phase 11 (Mobile App) is a known-good representative: it reads
      // 4 components and writes 1, and is on the Bernstein-derived
      // critical path.
      const sourcePhase11 = raw.primitives.find((p) => p.id === "phase:11");
      const transferPhase11 = transfer.primitives.find((p) => p.id === "phase:11");
      expect(sourcePhase11).toBeDefined();
      expect(transferPhase11).toBeDefined();
      expect(transferPhase11!.field_values["reads"]).toEqual(
        sourcePhase11!.fields!["reads"],
      );
      expect(transferPhase11!.field_values["writes"]).toEqual(
        sourcePhase11!.fields!["writes"],
      );
      expect(transferPhase11!.field_values["formality_level"]).toBe("structural");

      // End-to-end: import + validate. Counts match and there is no
      // schema mismatch on phase:11's reads/writes.
      const imported = await host.plugins
        .findImporter("fs-v3")!
        .fn(raw, { projectId: "rm-validation", projectName: "RM Validation" });
      // After the schema lock-in, an `accepted: true` patch on phase:11
      // confirms the shape validates. Use importTransfer + a tiny patch.
      const { importTransfer } = await import("../src/core/host-extra.js");
      const result = await importTransfer(host, imported as never);
      expect(result.project_id).toBe("rm-validation");

      // Now patch a non-reads field to trigger full revalidation; the
      // pipeline must accept the existing reads/writes shape.
      const patchResult = await host.patchPrimitive("rm-validation", {
        id: "phase:11",
        field_values: { name: "Mobile App (validated)" },
      });
      expect(patchResult.report.accepted).toBe(true);
      // No `core:field:type` (shape mismatch) findings on reads/writes.
      const shapeFindings = patchResult.report.findings.filter(
        (f) => f.rule_id === "core:field:type",
      );
      expect(shapeFindings).toEqual([]);
    },
  );

  /**
   * P3 end-to-end regression: the v0.5.1-review remediation pass tried
   * to patch phase:22.procedure[0] (replace π_22 → τ_22) and was
   * rejected because phase:22.outputs is 718 chars (> max_length 500
   * declared on the schema). Pre-P3, full-record revalidation surfaced
   * that unrelated violation and blocked the targeted edit. Post-P3,
   * the path-scoped revalidation lets the procedure[0] patch land.
   */
  (fixturePresent ? it : it.skip)(
    "P3: phase:22.procedure[0] field-patch succeeds despite phase:22.outputs being over max_length",
    async () => {
      const raw = JSON.parse(readFileSync(ROADMAP, "utf8"));
      const host = new Host({
        dataDir: null,
        builtinDirs: [resolve(process.cwd(), "plugins")],
        pluginPaths: [],
      });
      await host.load();
      const { importTransfer } = await import("../src/core/host-extra.js");

      // We need a primitive with an active validation violation on a
      // field we're NOT going to touch. The shipped phase:22 from the
      // fixture used to satisfy this naturally (outputs=718 > old cap
      // 500), but since the cap was bumped to 800 the natural data no
      // longer exceeds it. Construct the violation ourselves by
      // mutating the imported transfer's phase:22.outputs to maxLen+100
      // before importing.
      const profile = host.profiles.getResolved(PROFILE_ID);
      const phaseType = profile.primitive_types.find((t) => t.id === "fs:Phase")!;
      const outputsField = phaseType.fields.find((f) => f.name === "outputs")!;
      const maxLen = (outputsField.validations.find((v) => v.kind === "max_length") as
        | { value: number }
        | undefined)?.value ?? Infinity;
      const oversize = "x".repeat(maxLen + 100);
      // The fs-v3 importer normalises raw fixture data into a
      // ProjectTransfer. We mutate the transfer's phase:22.outputs to
      // an oversize value before importing; the import path bypasses
      // §7 validation, so the violation lands intact in the
      // projection — exactly the "imported data with a pre-existing
      // violation" scenario we want to test the field-patch behaviour
      // against.
      const transfer = await host.plugins.runImporter("fs-v3", raw, {
        projectId: "rm-p3-syn",
        projectName: "RM P3 syn",
      });
      const phase22idx = transfer.primitives.findIndex((p) => p.id === "phase:22");
      transfer.primitives[phase22idx]!.field_values["outputs"] = oversize;
      await importTransfer(host, transfer);
      const phase22 = host.getProject("rm-p3-syn").primitives["phase:22"]!;
      expect((phase22.field_values["outputs"] as string).length).toBeGreaterThan(maxLen);

      // Field-patch the unrelated procedure[0] — must succeed post-P3.
      const result = await host.fieldPatchPrimitive("rm-p3-syn", {
        id: "phase:22",
        operations: [
          {
            op: "replace",
            path: "/procedure/0",
            value:
              "Execute staged rollout with automated rollback triggers; instate retro cadence; τ_22 is applied recurrently — there is no terminal state.",
          } as never,
        ],
      });
      expect(result.report.accepted).toBe(true);
      // The unrelated violation is still there (we did not "fix" it) —
      // confirming path-scoped means "don't touch what wasn't asked".
      const phase22after = host.getProject("rm-p3-syn").primitives["phase:22"]!;
      expect((phase22after.field_values["outputs"] as string).length).toBeGreaterThan(maxLen);
      expect(phase22after.field_values["procedure"]).toEqual([
        expect.stringContaining("τ_22 is applied recurrently"),
      ]);
    },
  );
});
