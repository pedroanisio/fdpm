import { describe, it, expect, expectTypeOf } from "vitest";
import { Host } from "../src/core/host.js";
import { TEST_PROFILE } from "./fixtures.js";
import {
  defineProject,
  type PrimitiveSpec,
  type RelationSpec,
  type PartialCommitFailure,
} from "../src/sdk.js";
import { FDPMException } from "../src/core/errors/fdpm-exception.js";

/**
 * P2 SDK regressions:
 *   - P2 #7  generic `fields` on PrimitiveSpec / RelationSpec
 *   - P2 #9  referential pre-flight for queued relations
 *   - P2 #10 partial-commit evidence on FDPMException
 *
 * P2 #8 (cross-collection ID uniqueness) was rejected as out of scope —
 * primitives and relations live in separate id namespaces in the host
 * data model, so forbidding overlap at the SDK boundary would be a
 * foot-gun rather than a guard. A regression test enforcing the
 * REJECTION lives under "rejected: cross-namespace id sharing".
 */

async function newHostWithProfile(): Promise<Host> {
  const host = new Host({ dataDir: null, noPlugins: true });
  await host.load();
  await host.registerProfile(TEST_PROFILE);
  return host;
}

// -- P2 #7: generic fields ---------------------------------------------

describe("PrimitiveSpec / RelationSpec generic fields", () => {
  it("PrimitiveSpec narrows the fields shape when parameterised", () => {
    type SectionFields = { title: string; number: number };
    type SectionSpec = PrimitiveSpec<SectionFields>;
    const ok: SectionSpec = {
      id: "section:a",
      type: "test:section",
      fields: { title: "A", number: 1 },
    };
    expectTypeOf(ok.fields).toEqualTypeOf<SectionFields>();
    // Default still works (untyped Record).
    const untyped: PrimitiveSpec = {
      id: "section:b",
      type: "test:section",
      fields: { whatever: 1, anything: "ok" },
    };
    expect(untyped.fields["whatever"]).toBe(1);
  });

  it("RelationSpec generic narrows fields and stays optional", () => {
    type RelFields = { weight: number };
    type WeightedRel = RelationSpec<RelFields>;
    const r: WeightedRel = {
      id: "rel:1",
      type: "x:rel",
      from: "a",
      to: "b",
      fields: { weight: 2 },
    };
    expectTypeOf(r.fields).toEqualTypeOf<RelFields | undefined>();
    // Omitted fields still allowed.
    const r2: WeightedRel = { id: "rel:2", type: "x:rel", from: "a", to: "b" };
    expect(r2.fields).toBeUndefined();
  });

  it("typed primitives() / relations() commit through the runtime path unchanged", async () => {
    // The narrowing is compile-time; the runtime payload is the same
    // bag of unknowns. Verifying that the host's pipeline still gets
    // exactly what it needs guards against accidentally constraining
    // the runtime shape via the generic.
    const host = await newHostWithProfile();
    type Sec = { title: string; number: number };
    const r = await defineProject(host, { id: "p7", name: "P", profile: "test:demo" })
      .primitives<Sec>([
        { id: "section:a", type: "test:section", fields: { title: "A", number: 1 } },
      ])
      .commit();
    expect(r.primitives_created).toBe(1);
    expect(host.getProject("p7").primitives["section:a"]?.field_values["title"]).toBe("A");
  });

  it("rejected: cross-namespace id sharing is allowed by design", async () => {
    // Documents the P2 #8 rejection: primitives and relations have
    // separate id namespaces in the host. Sharing an id MUST commit
    // successfully so embedders importing data from systems that
    // share namespaces aren't blocked.
    const host = await newHostWithProfile();
    const r = await defineProject(host, { id: "p-share", name: "P", profile: "test:demo" })
      .primitives([
        { id: "section:a", type: "test:section", fields: { title: "A", number: 1 } },
        { id: "para:shared", type: "test:para", fields: { text: "p" } },
      ])
      .relations([
        // Same string as the para id above. Different namespace; legal.
        { id: "para:shared", type: "test:rel:contains", from: "section:a", to: "para:shared", fields: {} },
      ])
      .commit();
    expect(r.primitives_created).toBe(2);
    expect(r.relations_created).toBe(1);
    const slice = host.getProject("p-share");
    expect(slice.primitives["para:shared"]).toBeDefined();
    expect(slice.relations["para:shared"]).toBeDefined();
  });
});

// -- P2 #9: referential pre-flight -------------------------------------

describe("commit referential pre-flight", () => {
  it("fails with verification + dangling_refs evidence when `from` is unknown", async () => {
    const host = await newHostWithProfile();
    const builder = defineProject(host, { id: "p9-from", name: "P", profile: "test:demo" })
      .primitives([
        { id: "para:1", type: "test:para", fields: { text: "p" } },
      ])
      .relations([
        // section:ghost is never queued.
        { id: "rel:1", type: "test:rel:contains", from: "section:ghost", to: "para:1", fields: {} },
      ]);
    let caught: unknown;
    try {
      await builder.commit();
      throw new Error("should have thrown");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(FDPMException);
    const e = caught as FDPMException;
    expect(e.category).toBe("verification");
    expect(e.message).toMatch(/unknown primitive ids/);
    const dangling = (e.evidence?.["dangling_refs"] as Array<Record<string, unknown>>) ?? [];
    expect(dangling).toHaveLength(1);
    expect(dangling[0]).toMatchObject({
      relation_id: "rel:1",
      missing: "section:ghost",
      side: "from",
    });
  });

  it("flags `to` as well as `from`", async () => {
    const host = await newHostWithProfile();
    let caught: unknown;
    try {
      await defineProject(host, { id: "p9-to", name: "P", profile: "test:demo" })
        .primitives([
          { id: "section:a", type: "test:section", fields: { title: "A", number: 1 } },
        ])
        .relations([
          { id: "rel:1", type: "test:rel:contains", from: "section:a", to: "para:nope", fields: {} },
        ])
        .commit();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(FDPMException);
    const dangling = (caught as FDPMException).evidence?.["dangling_refs"] as Array<
      Record<string, unknown>
    >;
    expect(dangling[0]).toMatchObject({ side: "to", missing: "para:nope" });
  });

  it("reports ALL dangling refs at once (not one per round-trip)", async () => {
    const host = await newHostWithProfile();
    let caught: unknown;
    try {
      await defineProject(host, { id: "p9-many", name: "P", profile: "test:demo" })
        .primitives([
          { id: "section:a", type: "test:section", fields: { title: "A", number: 1 } },
        ])
        .relations([
          { id: "rel:1", type: "test:rel:contains", from: "section:ghost1", to: "para:nope1", fields: {} },
          { id: "rel:2", type: "test:rel:contains", from: "section:a", to: "para:nope2", fields: {} },
        ])
        .commit();
    } catch (err) {
      caught = err;
    }
    const dangling = (caught as FDPMException).evidence?.["dangling_refs"] as Array<unknown>;
    // rel:1 has TWO dangling sides + rel:2 has ONE = 3 entries total.
    expect(dangling).toHaveLength(3);
  });

  it("does NOT create the project when pre-flight fails", async () => {
    const host = await newHostWithProfile();
    await expect(
      defineProject(host, { id: "p9-noproject", name: "P", profile: "test:demo" })
        .primitives([{ id: "section:a", type: "test:section", fields: { title: "A", number: 1 } }])
        .relations([
          { id: "rel:1", type: "test:rel:contains", from: "section:nope", to: "section:a", fields: {} },
        ])
        .commit(),
    ).rejects.toThrow(FDPMException);
    // Project must not exist — no rollback was needed because no
    // host write ever ran.
    expect(() => host.getProject("p9-noproject")).toThrow(/not found|not_found/i);
  });

  it("seals the builder (cannot retry commit) after a pre-flight failure", async () => {
    const host = await newHostWithProfile();
    const b = defineProject(host, { id: "p9-seal", name: "P", profile: "test:demo" })
      .primitives([{ id: "section:a", type: "test:section", fields: { title: "A", number: 1 } }])
      .relations([
        { id: "rel:1", type: "test:rel:contains", from: "section:ghost", to: "section:a", fields: {} },
      ]);
    await expect(b.commit()).rejects.toThrow(/unknown primitive ids/);
    await expect(b.commit()).rejects.toThrow(/already been committed/);
  });

  it("preflight failure carries a partial_commit envelope with failed_at='preflight'", async () => {
    const host = await newHostWithProfile();
    let caught: FDPMException | undefined;
    try {
      await defineProject(host, { id: "p9-pc", name: "P", profile: "test:demo" })
        .primitives([{ id: "section:a", type: "test:section", fields: { title: "A", number: 1 } }])
        .relations([
          { id: "rel:1", type: "test:rel:contains", from: "section:ghost", to: "section:a", fields: {} },
        ])
        .commit();
    } catch (err) {
      caught = err as FDPMException;
    }
    expect(caught).toBeInstanceOf(FDPMException);
    const pc = caught!.evidence?.["partial_commit"] as PartialCommitFailure;
    expect(pc.failed_at).toBe("preflight");
    expect(pc.primitives_created).toBe(0);
    expect(pc.relations_created).toBe(0);
    expect(pc.failed_id).toBe("rel:1");
  });
});

// -- P2 #10: partial_commit evidence on host-call failures -------------

describe("commit partial_commit evidence", () => {
  it("attaches failed_at='primitive' + counts when a primitive fails mid-batch", async () => {
    const host = await newHostWithProfile();
    let caught: FDPMException | undefined;
    try {
      await defineProject(host, { id: "p10-prim", name: "P", profile: "test:demo" })
        .primitives([
          { id: "section:a", type: "test:section", fields: { title: "A", number: 1 } },
          { id: "section:b", type: "test:section", fields: { title: "B", number: 2 } },
          // Fails validation: title too long.
          { id: "section:bad", type: "test:section", fields: { title: "x".repeat(300), number: 3 } },
          { id: "section:c", type: "test:section", fields: { title: "C", number: 4 } },
        ])
        .commit();
    } catch (err) {
      caught = err as FDPMException;
    }
    expect(caught).toBeInstanceOf(FDPMException);
    const pc = caught!.evidence?.["partial_commit"] as PartialCommitFailure;
    expect(pc).toBeDefined();
    expect(pc.project_id).toBe("p10-prim");
    expect(pc.failed_at).toBe("primitive");
    expect(pc.failed_id).toBe("section:bad");
    expect(pc.primitives_created).toBe(2); // section:a and section:b persisted
    expect(pc.relations_created).toBe(0);
    // Counts MUST agree with what's actually in the host.
    const slice = host.getProject("p10-prim");
    expect(Object.keys(slice.primitives)).toHaveLength(2);
  });

  it("attaches failed_at='relation' + counts when a relation fails after primitives", async () => {
    const host = await newHostWithProfile();
    let caught: FDPMException | undefined;
    try {
      await defineProject(host, { id: "p10-rel", name: "P", profile: "test:demo" })
        .primitives([
          { id: "section:a", type: "test:section", fields: { title: "A", number: 1 } },
          { id: "para:1", type: "test:para", fields: { text: "p" } },
        ])
        .relations([
          // First relation OK.
          { id: "rel:1", type: "test:rel:contains", from: "section:a", to: "para:1", fields: {} },
          // Second relation: unknown type — host validation fails.
          // (Pre-flight only catches dangling refs, not unknown types,
          // so this exercises the host-call failure path post-preflight.)
          { id: "rel:2", type: "test:rel:does-not-exist", from: "section:a", to: "para:1", fields: {} },
        ])
        .commit();
    } catch (err) {
      caught = err as FDPMException;
    }
    expect(caught).toBeInstanceOf(FDPMException);
    const pc = caught!.evidence?.["partial_commit"] as PartialCommitFailure;
    expect(pc.failed_at).toBe("relation");
    expect(pc.failed_id).toBe("rel:2");
    expect(pc.primitives_created).toBe(2);
    expect(pc.relations_created).toBe(1);
  });

  it("partial_commit evidence survives rollback wrap on rollback success path", async () => {
    // With rollbackOnError: true and a successful rollback, the
    // ORIGINAL FDPMException is re-thrown (not wrapped). It must
    // still carry the partial_commit envelope so embedders can read
    // what HAD persisted before rollback removed it.
    const host = await newHostWithProfile();
    let caught: FDPMException | undefined;
    try {
      await defineProject(host, { id: "p10-roll", name: "P", profile: "test:demo" })
        .primitives([
          { id: "section:a", type: "test:section", fields: { title: "A", number: 1 } },
          { id: "section:bad", type: "test:section", fields: { title: "x".repeat(300), number: 2 } },
        ])
        .commit({ rollbackOnError: true });
    } catch (err) {
      caught = err as FDPMException;
    }
    expect(caught).toBeInstanceOf(FDPMException);
    const pc = caught!.evidence?.["partial_commit"] as PartialCommitFailure;
    expect(pc).toBeDefined();
    expect(pc.failed_at).toBe("primitive");
    expect(pc.primitives_created).toBe(1);
    // The project itself should be gone — rollback ran.
    expect(() => host.getProject("p10-roll")).toThrow(/not found|not_found/i);
  });

  it("partial_commit envelope reaches embedders through a rollback-failure wrap", async () => {
    // When rollback ALSO fails, the wrapping internal-category
    // FDPMException copies the original evidence — partial_commit
    // included — so embedders can still see what persisted.
    const host = await newHostWithProfile();
    const rollbackBoom = new Error("simulated rollback failure");
    const original = host.deleteProject.bind(host);
    host.deleteProject = async () => {
      host.deleteProject = original;
      throw rollbackBoom;
    };

    let caught: FDPMException | undefined;
    try {
      await defineProject(host, { id: "p10-wrap", name: "P", profile: "test:demo" })
        .primitives([
          { id: "section:a", type: "test:section", fields: { title: "A", number: 1 } },
          { id: "section:bad", type: "test:section", fields: { title: "x".repeat(300), number: 2 } },
        ])
        .commit({ rollbackOnError: true });
    } catch (err) {
      caught = err as FDPMException;
    }

    expect(caught).toBeInstanceOf(FDPMException);
    expect(caught!.category).toBe("internal");
    const pc = caught!.evidence?.["partial_commit"] as PartialCommitFailure;
    expect(pc).toBeDefined();
    expect(pc.failed_at).toBe("primitive");
    expect(pc.primitives_created).toBe(1);
    // And the cause chain is still intact (P0 #3 regression hold).
    const cause = (caught as Error & { cause?: unknown }).cause;
    expect(cause).toBeInstanceOf(FDPMException);
  });

  it("PartialCommitFailure type is exported from the package root", async () => {
    // Type-only assertion — compiles because the import at top of
    // file resolves.
    const _shape: PartialCommitFailure = {
      project_id: "x",
      primitives_created: 0,
      relations_created: 0,
      failed_at: "preflight",
    };
    expect(_shape.failed_at).toBe("preflight");
  });
});
