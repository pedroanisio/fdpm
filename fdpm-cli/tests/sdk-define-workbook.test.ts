import { describe, it, expect } from "vitest";
import { Host } from "../src/core/host.js";
import { TEST_PROFILE } from "./fixtures.js";
import { defineProject, openHost, renderProject } from "../src/sdk.js";
import { FDPMException } from "../src/core/errors/fdpm-exception.js";
import { CORE_RENDERER_ID } from "../src/core/profile/core-renderer.js";

/**
 * SDK tests — `defineProject()`, `openHost()`, `renderProject()`.
 *
 * The SDK is a thin facade over Host; these tests verify the shape of
 * the public surface, the atomic-by-default semantics, and that errors
 * surface as typed FDPMException.
 *
 * Most behaviour is exercised at the Host layer in other suites; here
 * we verify only what the SDK adds: builder ergonomics, the `from`/`to`
 * relation aliasing, the `fields` aliasing, atomic commit, and the
 * structured commit summary.
 */

async function newHostWithProfile(): Promise<Host> {
  const host = new Host({ dataDir: null, noPlugins: true });
  await host.load();
  await host.registerProfile(TEST_PROFILE);
  return host;
}

describe("defineProject", () => {
  it("creates a workbook with primitives and relations atomically", async () => {
    const host = await newHostWithProfile();
    const result = await defineProject(host, {
      id: "p",
      name: "P",
      profile: "test:demo",
    })
      .primitives([
        { id: "section:a", type: "test:section", fields: { title: "A", number: 1 } },
        { id: "para:1", type: "test:para", fields: { text: "alpha" } },
      ])
      .relations([
        {
          id: "rel:a-1",
          type: "test:rel:contains",
          from: "section:a",
          to: "para:1",
          fields: {},
        },
      ])
      .commit();
    expect(result.workbook_id).toBe("p");
    expect(result.primitives_created).toBe(2);
    expect(result.relations_created).toBe(1);
    expect(result.revision).toBeGreaterThan(0);
    expect(host.getProject("p").primitives["section:a"]).toBeDefined();
    expect(host.getProject("p").relations["rel:a-1"]).toBeDefined();
  });

  it("first failing primitive aborts the remaining commits (not all-or-nothing)", async () => {
    const host = await newHostWithProfile();
    await expect(
      defineProject(host, { id: "p", name: "P", profile: "test:demo" })
        .primitives([
          { id: "section:a", type: "test:section", fields: { title: "A", number: 1 } },
          // title max_length is 200 — this is over; commit aborts here.
          { id: "section:bad", type: "test:section", fields: { title: "x".repeat(300), number: 2 } },
          { id: "section:c", type: "test:section", fields: { title: "C", number: 3 } },
        ])
        .commit(),
    ).rejects.toThrow(FDPMException);
    // Pre-failure ops are committed; post-failure ops never ran.
    // This is NOT all-or-nothing — see commit() docstring for why.
    const slice = host.getProject("p");
    expect(slice.primitives["section:a"]).toBeDefined();
    expect(slice.primitives["section:bad"]).toBeUndefined();
    expect(slice.primitives["section:c"]).toBeUndefined();
  });

  it("supports calling primitives() / relations() multiple times (chained)", async () => {
    const host = await newHostWithProfile();
    const r = await defineProject(host, { id: "p", name: "P", profile: "test:demo" })
      .primitives([
        { id: "section:a", type: "test:section", fields: { title: "A", number: 1 } },
      ])
      .primitives([
        { id: "para:1", type: "test:para", fields: { text: "x" } },
      ])
      .relations([
        { id: "rel:1", type: "test:rel:contains", from: "section:a", to: "para:1", fields: {} },
      ])
      .commit();
    expect(r.primitives_created).toBe(2);
    expect(r.relations_created).toBe(1);
  });

  it("permits an empty workbook (no primitives, no relations)", async () => {
    const host = await newHostWithProfile();
    const r = await defineProject(host, { id: "empty", name: "E", profile: "test:demo" }).commit();
    expect(r.primitives_created).toBe(0);
    expect(r.relations_created).toBe(0);
  });

  it("respects scope_id and description options on the workbook", async () => {
    const host = await newHostWithProfile();
    await defineProject(host, {
      id: "p",
      name: "P",
      profile: "test:demo",
      description: "Test description.",
    })
      .primitives([
        {
          id: "section:a",
          type: "test:section",
          fields: { title: "A", number: 1 },
          scope: "test:scope:doc",
        },
      ])
      .commit();
    const slice = host.getProject("p");
    expect(slice.workbook.description).toBe("Test description.");
    expect(slice.primitives["section:a"]?.scope_id).toBe("test:scope:doc");
  });

  it("rejects a duplicate primitive id at queue time (before commit)", async () => {
    const host = await newHostWithProfile();
    // The duplicate is detected when the second primitives() / second
    // entry is appended — without ever calling host. This is a useful
    // behaviour change from pass 1: failure surfaces at the call site
    // that introduced the duplicate, not deep inside commit().
    expect(() =>
      defineProject(host, { id: "p", name: "P", profile: "test:demo" }).primitives([
        { id: "section:a", type: "test:section", fields: { title: "A", number: 1 } },
        { id: "section:a", type: "test:section", fields: { title: "B", number: 2 } },
      ]),
    ).toThrow(/duplicate primitive id/i);
  });

  it("rejects duplicate ids across separate primitives() calls", async () => {
    const host = await newHostWithProfile();
    const builder = defineProject(host, { id: "p", name: "P", profile: "test:demo" });
    builder.primitives([
      { id: "section:a", type: "test:section", fields: { title: "A", number: 1 } },
    ]);
    expect(() =>
      builder.primitives([
        { id: "section:a", type: "test:section", fields: { title: "B", number: 2 } },
      ]),
    ).toThrow(/duplicate primitive id/i);
  });

  it("does not auto-create a workbook that already exists", async () => {
    const host = await newHostWithProfile();
    await host.createProject({ workbook_id: "existing", name: "X", profile_id: "test:demo" });
    // commit() should fail rather than silently no-op the workbook.create
    // (which the host rejects as conflict).
    await expect(
      defineProject(host, { id: "existing", name: "X", profile: "test:demo" }).commit(),
    ).rejects.toThrow();
  });

  it("commit() returns a structured summary including revision", async () => {
    const host = await newHostWithProfile();
    const r = await defineProject(host, { id: "p", name: "P", profile: "test:demo" })
      .primitives([
        { id: "section:a", type: "test:section", fields: { title: "A", number: 1 } },
      ])
      .commit();
    expect(r).toEqual({
      workbook_id: "p",
      revision: expect.any(Number),
      primitives_created: 1,
      relations_created: 0,
    });
  });
});

describe("openHost", () => {
  it("returns a loaded Host", async () => {
    const host = await openHost({ dataDir: null, noPlugins: true });
    expect(host).toBeInstanceOf(Host);
    // load() was awaited; calling listProjects must not throw.
    expect(host.listProjects()).toEqual([]);
  });

  it("forwards options to the Host constructor", async () => {
    const host = await openHost({ dataDir: null, noPlugins: true });
    await host.registerProfile(TEST_PROFILE);
    await host.createProject({ workbook_id: "x", name: "X", profile_id: "test:demo" });
    expect(host.listProjects().map((p) => p.id)).toEqual(["x"]);
  });
});

describe("renderProject", () => {
  it("rejects a target with no registered renderer", async () => {
    const host = await newHostWithProfile();
    await defineProject(host, { id: "p", name: "P", profile: "test:demo" }).commit();
    await expect(
      renderProject(host, { workbook: "p", target: "application/pdf" }),
    ).rejects.toThrow();
  });

  // Markdown is not such a target: core registers a profile-generic
  // renderer at `text/markdown` for every profile, so the fallback answers
  // even when no plugin is loaded. See core/profile/core-renderer.ts.
  it("falls back to the core renderer when no plugin claims text/markdown", async () => {
    const host = await newHostWithProfile();
    await defineProject(host, { id: "p", name: "P", profile: "test:demo" }).commit();
    const out = await renderProject(host, { workbook: "p", target: "text/markdown" });
    expect(out.rendererId).toBe(CORE_RENDERER_ID);
    expect(out.contentType).toBe("text/markdown");
  });
});
