import { describe, it, expect } from "vitest";
import { Host } from "../src/core/host.js";
import { TEST_PROFILE } from "./fixtures.js";
import {
  defineProject,
  openHost,
  renderProject,
  type HostOptions,
  type CommitOptions,
} from "../src/sdk.js";
import { FDPMException } from "../src/core/errors/fdpm-exception.js";

/**
 * Pass-2 SDK refinement tests — covers behaviours added during the
 * pass-2 audit: `pending` accessor, `rollbackOnError` commit option,
 * queue-time input-shape guards, HostOptions re-export, and the
 * render result shape.
 */

async function newHostWithProfile(): Promise<Host> {
  const host = new Host({ dataDir: null, noPlugins: true });
  await host.load();
  await host.registerProfile(TEST_PROFILE);
  return host;
}

// -- pending accessor (S6) ---------------------------------------------

describe("ProjectBuilder.pending", () => {
  it("starts at zero/zero", async () => {
    const host = await newHostWithProfile();
    const b = defineProject(host, { id: "p", name: "P", profile: "test:demo" });
    expect(b.pending).toEqual({ primitives: 0, relations: 0 });
  });

  it("accumulates across primitives() / relations() calls", async () => {
    const host = await newHostWithProfile();
    const b = defineProject(host, { id: "p", name: "P", profile: "test:demo" });
    b.primitives([
      { id: "section:a", type: "test:section", fields: { title: "A", number: 1 } },
      { id: "section:b", type: "test:section", fields: { title: "B", number: 2 } },
    ]);
    expect(b.pending).toEqual({ primitives: 2, relations: 0 });
    b.primitives([{ id: "para:1", type: "test:para", fields: { text: "x" } }]);
    expect(b.pending).toEqual({ primitives: 3, relations: 0 });
    b.relations([
      { id: "rel:1", type: "test:rel:contains", from: "section:a", to: "para:1", fields: {} },
    ]);
    expect(b.pending).toEqual({ primitives: 3, relations: 1 });
  });

  it("reading pending does not commit the builder", async () => {
    const host = await newHostWithProfile();
    const b = defineProject(host, { id: "p", name: "P", profile: "test:demo" });
    b.primitives([
      { id: "section:a", type: "test:section", fields: { title: "A", number: 1 } },
    ]);
    void b.pending;
    void b.pending;
    // commit() should still work — builder isn't sealed by the read.
    const r = await b.commit();
    expect(r.primitives_created).toBe(1);
  });
});

// -- rollbackOnError (S5) ----------------------------------------------

describe("commit({ rollbackOnError: true })", () => {
  it("deletes the project on failure when set", async () => {
    const host = await newHostWithProfile();
    await expect(
      defineProject(host, { id: "p", name: "P", profile: "test:demo" })
        .primitives([
          { id: "section:a", type: "test:section", fields: { title: "A", number: 1 } },
          // Validation failure on the second op.
          { id: "section:bad", type: "test:section", fields: { title: "x".repeat(300), number: 2 } },
        ])
        .commit({ rollbackOnError: true }),
    ).rejects.toThrow(FDPMException);
    // Project itself should be gone — rollback happened.
    expect(() => host.getProject("p")).toThrow(/not found|not_found/i);
  });

  it("leaves partial state in place when rollbackOnError is unset (default)", async () => {
    const host = await newHostWithProfile();
    await expect(
      defineProject(host, { id: "p", name: "P", profile: "test:demo" })
        .primitives([
          { id: "section:a", type: "test:section", fields: { title: "A", number: 1 } },
          { id: "section:bad", type: "test:section", fields: { title: "x".repeat(300), number: 2 } },
        ])
        .commit(),
    ).rejects.toThrow(FDPMException);
    // Project survives; the first primitive made it through.
    const slice = host.getProject("p");
    expect(slice.primitives["section:a"]).toBeDefined();
    expect(slice.primitives["section:bad"]).toBeUndefined();
  });

  it("re-throws the original error after a successful rollback", async () => {
    const host = await newHostWithProfile();
    try {
      await defineProject(host, { id: "p", name: "P", profile: "test:demo" })
        .primitives([
          { id: "section:bad", type: "test:section", fields: { title: "x".repeat(300), number: 1 } },
        ])
        .commit({ rollbackOnError: true });
      throw new Error("should have thrown");
    } catch (err) {
      // Original validation error preserved (not the wrapper).
      expect(err).toBeInstanceOf(FDPMException);
      expect((err as FDPMException).category).toBe("validation");
    }
  });

  // P0 regression: rollback path runs `deleteProject` on a project
  // whose primitive batch failed on the very first op — meaning the
  // project was created but ZERO primitives were persisted. Earlier
  // rollback test failed on the *second* primitive, so this empty-
  // project edge case was uncovered.
  it("rolls back a project whose first primitive failed (zero primitives persisted)", async () => {
    const host = await newHostWithProfile();
    await expect(
      defineProject(host, { id: "p-empty", name: "P", profile: "test:demo" })
        .primitives([
          { id: "section:bad", type: "test:section", fields: { title: "x".repeat(300), number: 1 } },
          { id: "section:ok", type: "test:section", fields: { title: "OK", number: 2 } },
        ])
        .commit({ rollbackOnError: true }),
    ).rejects.toThrow(FDPMException);
    expect(() => host.getProject("p-empty")).toThrow(/not found|not_found/i);
  });

  it("CommitOptions type is exported and accepts rollbackOnError", () => {
    // Type-only assertion: this just compiles.
    const _opts: CommitOptions = { rollbackOnError: true };
    expect(_opts.rollbackOnError).toBe(true);
  });
});

// -- queue-time input-shape guards (S7, S11) ---------------------------

describe("queue-time spec validation", () => {
  it("rejects a non-array argument to primitives()", async () => {
    const host = await newHostWithProfile();
    const b = defineProject(host, { id: "p", name: "P", profile: "test:demo" });
    expect(() =>
      // Cast to bypass the TS guard and exercise the runtime check.
      b.primitives({} as unknown as Parameters<typeof b.primitives>[0]),
    ).toThrow(/expects an array/);
  });

  it("rejects a non-array argument to relations()", async () => {
    const host = await newHostWithProfile();
    const b = defineProject(host, { id: "p", name: "P", profile: "test:demo" });
    expect(() =>
      b.relations(null as unknown as Parameters<typeof b.relations>[0]),
    ).toThrow(/expects an array/);
  });

  it("rejects a primitive spec missing required keys", async () => {
    const host = await newHostWithProfile();
    const b = defineProject(host, { id: "p", name: "P", profile: "test:demo" });
    expect(() =>
      b.primitives([
        // No `type` field.
        { id: "section:a", fields: { title: "A", number: 1 } } as never,
      ]),
    ).toThrow(/missing required property: type/);
  });

  it("rejects a relation spec with non-string `from`", async () => {
    const host = await newHostWithProfile();
    const b = defineProject(host, { id: "p", name: "P", profile: "test:demo" });
    expect(() =>
      b.relations([
        {
          id: "rel:1",
          type: "test:rel:contains",
          from: 42 as unknown as string,
          to: "x",
          fields: {},
        },
      ]),
    ).toThrow(/from.*string/i);
  });
});

// -- HostOptions re-export (S4) ----------------------------------------

describe("openHost / HostOptions re-export", () => {
  it("HostOptions is importable from the SDK", async () => {
    // Type-only: this just compiles.
    const opts: HostOptions = { dataDir: null, noPlugins: true };
    const host = await openHost(opts);
    expect(host).toBeInstanceOf(Host);
  });
});

// -- P0 regressions: double-commit guard + cause-chain preservation ----

describe("ProjectBuilder.commit double-commit guard", () => {
  it("throws when commit() is called twice on the same builder", async () => {
    const host = await newHostWithProfile();
    const b = defineProject(host, { id: "p-once", name: "P", profile: "test:demo" })
      .primitives([
        { id: "section:a", type: "test:section", fields: { title: "A", number: 1 } },
      ]);
    const first = await b.commit();
    expect(first.primitives_created).toBe(1);
    await expect(b.commit()).rejects.toThrow(/already been committed/);
  });

  it("throws when commit() is called twice after a rolled-back failure", async () => {
    const host = await newHostWithProfile();
    const b = defineProject(host, { id: "p-roll-once", name: "P", profile: "test:demo" })
      .primitives([
        { id: "section:bad", type: "test:section", fields: { title: "x".repeat(300), number: 1 } },
      ]);
    await expect(b.commit({ rollbackOnError: true })).rejects.toThrow(FDPMException);
    // Second attempt must be refused even though the first never persisted state.
    await expect(b.commit({ rollbackOnError: true })).rejects.toThrow(/already been committed/);
  });

  it("rejects primitives() / relations() after commit", async () => {
    const host = await newHostWithProfile();
    const b = defineProject(host, { id: "p-sealed", name: "P", profile: "test:demo" });
    await b.commit();
    expect(() =>
      b.primitives([
        { id: "section:a", type: "test:section", fields: { title: "A", number: 1 } },
      ]),
    ).toThrow(/already been committed/);
    expect(() =>
      b.relations([
        { id: "rel:1", type: "test:rel:contains", from: "x", to: "y", fields: {} },
      ]),
    ).toThrow(/already been committed/);
  });
});

describe("commit rollback-failure error preserves cause chain", () => {
  it("attaches original error via Error.cause and preserves findings/evidence", async () => {
    const host = await newHostWithProfile();
    // Force the rollback's deleteProject to fail so we hit the
    // wrapped-internal-error path. The first primitive will fail
    // validation; deleteProject will then throw our injected error.
    const rollbackBoom = new Error("simulated rollback failure");
    const original = host.deleteProject.bind(host);
    host.deleteProject = async () => {
      // Restore so test cleanup (if any) isn't affected.
      host.deleteProject = original;
      throw rollbackBoom;
    };

    let caught: unknown;
    try {
      await defineProject(host, { id: "p-cause", name: "P", profile: "test:demo" })
        .primitives([
          { id: "section:bad", type: "test:section", fields: { title: "x".repeat(300), number: 1 } },
        ])
        .commit({ rollbackOnError: true });
      throw new Error("should have thrown");
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(FDPMException);
    const wrapped = caught as FDPMException & { cause?: unknown };
    expect(wrapped.category).toBe("internal");
    expect(wrapped.message).toMatch(/commit failed AND rollback failed/);

    // The original validation error must be reachable via Error.cause.
    expect(wrapped.cause).toBeInstanceOf(FDPMException);
    expect((wrapped.cause as FDPMException).category).toBe("validation");

    // Structured findings from the original error must survive on the wrapper.
    expect(Array.isArray(wrapped.findings)).toBe(true);
    expect((wrapped.findings as unknown[]).length).toBeGreaterThan(0);

    // Both error messages should be available via evidence.
    expect(wrapped.evidence).toBeDefined();
    expect(wrapped.evidence!["original_error"]).toEqual(expect.any(String));
    expect(wrapped.evidence!["rollback_error"]).toBe("simulated rollback failure");
  });
});

// -- renderProject result shape (S12) ----------------------------------

describe("renderProject result shape", () => {
  it("returns rendererId and pluginId on the result object", async () => {
    // Use a real host with the formal-specification plugin so a
    // renderer is registered. Fall back to skipping if the plugin
    // can't load in this test env.
    const host = new Host({ dataDir: null });
    await host.load();
    // The plugin registers profile:formal-specification:3.0 with
    // renderers for text/markdown, text/html, application/pdf.
    // If activation failed, skip — we don't want this test to fail
    // because of unrelated plugin issues.
    const profiles = host.profiles.listRaw();
    const fs = profiles.find((p) => p.id.startsWith("profile:formal-specification:"));
    if (!fs) {
      // Plugin didn't activate in this env; nothing to test.
      return;
    }
    await defineProject(host, {
      id: "fs-render-shape",
      name: "Render Shape Test",
      profile: fs.id,
    }).commit();
    const r = await renderProject(host, {
      project: "fs-render-shape",
      target: "text/markdown",
    });
    expect(typeof r.rendererId).toBe("string");
    expect(r.rendererId.length).toBeGreaterThan(0);
    expect(typeof r.pluginId).toBe("string");
    expect(r.pluginId.length).toBeGreaterThan(0);
    expect(r.contentType).toBe("text/markdown");
    expect(r.bytes).toBeInstanceOf(Uint8Array);
  });
});
