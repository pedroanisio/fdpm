/**
 * SPEC-MCP-SERVER resources surface — render provider tests.
 *
 * Slice 1 ships render-as-resource at
 * `fdpm://workbook/{workbook_id}/render/{target}`. These tests exercise:
 *
 *   - URI parser (round-trip, mid-target slashes, malformed inputs)
 *   - resources/list shape (one entry per workbook × renderer target)
 *   - resources/templates/list shape (the URI template advertised to clients)
 *   - resources/read for a text/* output (lands in `text`)
 *   - resources/read for a binary output (application/pdf — base64 in `blob`)
 *   - lenient tail-replay path: an out-of-band log append surfaces in
 *     the next read without an error envelope (read-only resources
 *     follow SPEC-REPL §10.2 lenient mode)
 *   - error envelopes: unknown URI, unknown workbook, unknown target
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Host } from "../../src/core/host.js";
import { FDPMException } from "../../src/core/errors/fdpm-exception.js";
import {
  buildRenderUri,
  parseRenderUri,
} from "../../src/mcp/resources/render.js";
import {
  dispatchRead,
  listResources,
  listTemplates,
} from "../../src/mcp/resources/registry.js";
import { appendRawOp } from "../_helpers/oob-write.js";

let dataDir: string;
beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "fdpm-resources-"));
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

async function freshHost(): Promise<Host> {
  const host = new Host({
    dataDir,
    builtinDirs: [resolve(process.cwd(), "plugins")],
  });
  await host.load();
  return host;
}

const FS_PROFILE = "profile:formal-specification:3.0";

// ── URI parser ─────────────────────────────────────────────────────

describe("parseRenderUri / buildRenderUri", () => {
  it("round-trips a simple (workbook, target) pair", () => {
    const uri = buildRenderUri("my-proj", "text/markdown");
    expect(uri).toBe("fdpm://workbook/my-proj/render/text/markdown");
    expect(parseRenderUri(uri)).toEqual({
      workbookId: "my-proj",
      target: "text/markdown",
    });
  });

  it("accepts mid-target slashes (target may itself contain `/`)", () => {
    const uri = "fdpm://workbook/foo/render/application/pdf";
    expect(parseRenderUri(uri)).toEqual({
      workbookId: "foo",
      target: "application/pdf",
    });
  });

  it("returns null on the wrong scheme", () => {
    expect(parseRenderUri("https://example.com/foo")).toBeNull();
    expect(parseRenderUri("fdpm:workbook/foo/render/text/markdown")).toBeNull();
  });

  it("returns null when the `workbook/` keyword is missing", () => {
    expect(parseRenderUri("fdpm://other/foo/render/text/markdown")).toBeNull();
  });

  it("returns null when the `/render/` segment is missing", () => {
    expect(parseRenderUri("fdpm://workbook/foo/text/markdown")).toBeNull();
  });

  it("returns null when workbook_id or target is empty", () => {
    expect(parseRenderUri("fdpm://workbook//render/text/markdown")).toBeNull();
    expect(parseRenderUri("fdpm://workbook/foo/render/")).toBeNull();
  });

  it("parses an optional `#renderer_id` fragment for disambiguation", () => {
    const uri =
      "fdpm://workbook/foo/render/text/markdown#spec:SpecMarkdownRenderer";
    expect(parseRenderUri(uri)).toEqual({
      workbookId: "foo",
      target: "text/markdown",
      rendererId: "spec:SpecMarkdownRenderer",
    });
  });

  it("buildRenderUri emits the fragment when rendererId is provided", () => {
    expect(buildRenderUri("foo", "text/markdown")).toBe(
      "fdpm://workbook/foo/render/text/markdown",
    );
    expect(buildRenderUri("foo", "text/markdown", "spec:SpecMarkdownRenderer")).toBe(
      "fdpm://workbook/foo/render/text/markdown#spec:SpecMarkdownRenderer",
    );
  });

  it("an empty fragment after `#` parses without rendererId", () => {
    // Defensive: `text/markdown#` is malformed but shouldn't crash;
    // returns the URI with no rendererId.
    expect(parseRenderUri("fdpm://workbook/foo/render/text/markdown#")).toEqual({
      workbookId: "foo",
      target: "text/markdown",
    });
  });
});

describe("listResources collision handling", () => {
  it("emits fragment-disambiguated URIs only when multiple renderers share a target", async () => {
    const host = await freshHost();
    await host.createProject({
      workbook_id: "coll-proj",
      name: "Collision",
      profile_id: FS_PROFILE,
    });
    const resources = listResources(host).filter((r) =>
      r.uri.includes("/workbook/coll-proj/"),
    );

    // For each target with >1 renderer, every resource entry should
    // carry a `#<renderer_id>` fragment. For singletons, no fragment.
    const renderers = host.plugins.listRenderers();
    const counts = new Map<string, number>();
    for (const r of renderers) counts.set(r.target, (counts.get(r.target) ?? 0) + 1);

    for (const r of resources) {
      const parsed = parseRenderUri(r.uri);
      expect(parsed).not.toBeNull();
      const ambiguous = (counts.get(parsed!.target) ?? 0) > 1;
      if (ambiguous) {
        expect(parsed!.rendererId).toBeDefined();
      } else {
        expect(parsed!.rendererId).toBeUndefined();
      }
    }
  });
});

// ── resources/list + resources/templates/list ──────────────────────

describe("listResources / listTemplates", () => {
  it("returns at least one template advertising the render URI shape", async () => {
    const host = await freshHost();
    const tpls = listTemplates(host);
    const renderTpl = tpls.find((t) => t.uriTemplate.includes("/render/"));
    expect(renderTpl).toBeDefined();
    expect(renderTpl!.uriTemplate).toBe(
      "fdpm://workbook/{workbook_id}/render/{target}",
    );
    expect(renderTpl!.name).toBe("Workbook render");
  });

  it("returns one resource entry per (workbook × renderer target) pair", async () => {
    const host = await freshHost();
    await host.createProject({
      workbook_id: "rl-proj",
      name: "RL",
      profile_id: FS_PROFILE,
    });

    const resources = listResources(host);
    const renderers = host.plugins.listRenderers();
    expect(renderers.length).toBeGreaterThan(0);
    // For one workbook, the resource count equals the renderer count.
    const projectRes = resources.filter((r) => r.uri.includes("/workbook/rl-proj/"));
    expect(projectRes.length).toBe(renderers.length);

    // Every entry has the canonical URI shape.
    for (const r of projectRes) {
      const parsed = parseRenderUri(r.uri);
      expect(parsed?.workbookId).toBe("rl-proj");
      expect(typeof parsed?.target).toBe("string");
      // mimeType matches the target.
      expect(r.mimeType).toBe(parsed?.target);
      // name has both workbook and target.
      expect(r.name).toContain("rl-proj");
      expect(r.name).toContain(parsed!.target);
    }
  });

  it("emits no render entries when there are no workbooks", async () => {
    // Pre-v0.1.2 this test asserted listResources was globally empty
    // — true while render was the only provider. With the profile
    // provider also wired in (v0.1.2) the registry-aggregated list
    // always includes the profiles index plus one entry per
    // registered profile. The render-specific invariant is what we
    // actually care about: a host with zero workbooks contributes
    // zero render URIs.
    const host = await freshHost();
    const renderEntries = listResources(host).filter((e) =>
      e.uri.includes("/render/"),
    );
    expect(renderEntries.length).toBe(0);
  });
});

// ── resources/read — text output ───────────────────────────────────

describe("dispatchRead (text/markdown)", () => {
  it("renders a workbook to text/markdown and returns it as `text`", async () => {
    const host = await freshHost();
    await host.createProject({
      workbook_id: "md-proj",
      name: "Markdown Workbook",
      profile_id: FS_PROFILE,
    });
    await host.createPrimitive("md-proj", {
      id: "section:1",
      type_id: "fs:Section",
      field_values: {
        number: 1,
        title: "Introduction",
        status: "draft",
        version: "0.1",
        description: "First section.",
      },
    });

    const result = await dispatchRead(
      host,
      buildRenderUri("md-proj", "text/markdown"),
    );

    expect(result.uri).toBe("fdpm://workbook/md-proj/render/text/markdown");
    expect(result.mimeType).toBe("text/markdown");
    expect(result.text).toBeDefined();
    expect(result.blob).toBeUndefined();
    // The rendered markdown carries the section title.
    expect(result.text).toContain("Introduction");
    expect(result.text).toContain("md-proj");
  });
});

// ── resources/read — binary output ─────────────────────────────────

describe("dispatchRead (application/pdf)", () => {
  it("renders a workbook to application/pdf and returns it as base64 `blob`", async () => {
    const host = await freshHost();
    await host.createProject({
      workbook_id: "pdf-proj",
      name: "PDF Workbook",
      profile_id: FS_PROFILE,
    });

    const result = await dispatchRead(
      host,
      buildRenderUri("pdf-proj", "application/pdf"),
    );
    expect(result.mimeType).toBe("application/pdf");
    expect(result.blob).toBeDefined();
    expect(result.text).toBeUndefined();
    // Decode the base64 and check the magic header.
    const raw = Buffer.from(result.blob!, "base64");
    expect(raw.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });
});

// ── Lenient tail-replay (read picks up out-of-band writes) ────────

describe("dispatchRead — SPEC-REPL §10.2 lenient mode", () => {
  it("surfaces an out-of-band log append on the next read without throwing", async () => {
    const host = await freshHost();
    await host.createProject({
      workbook_id: "oob-proj",
      name: "OOB",
      profile_id: FS_PROFILE,
    });

    // First read seeds the projection.
    const before = await dispatchRead(
      host,
      buildRenderUri("oob-proj", "text/markdown"),
    );
    expect(before.text).not.toContain("OOB-injected section");

    // Now inject an op directly into the JSONL log (mimics another
    // process appending). The op_id must be exactly 26 chars per the
    // Operation schema; revision = current + 1 (workbook.create was rev 1).
    appendRawOp(dataDir, "oob-proj", {
      op_id: "01TESTRESOURCEOOB000000RES",
      kind: "primitive.create",
      workbook_id: "oob-proj",
      payload: {
        id: "section:oob",
        type_id: "fs:Section",
        field_values: {
          number: 1,
          title: "OOB-injected section",
          status: "draft",
          version: "0.1",
          description: "Appended out of band.",
        },
        uid: "01TESTRESOURCEOOBUID000RES",
      },
      actor: "test:oob",
      plugin_id: null,
      timestamp: "2026-05-05T00:00:00.000Z",
      revision: 2,
      request_id: "00000000-0000-7000-8000-000000000res",
      parent_op_id: null,
      causation_op_id: null,
      schema_version: "1.2.0",
    });

    // Second read should tail-replay and surface the new section.
    const after = await dispatchRead(
      host,
      buildRenderUri("oob-proj", "text/markdown"),
    );
    expect(after.text).toContain("OOB-injected section");
  });
});

// ── Error envelopes ───────────────────────────────────────────────

describe("dispatchRead — error envelopes", () => {
  it("throws not_found for an unknown URI scheme/shape", async () => {
    const host = await freshHost();
    await expect(
      dispatchRead(host, "fdpm://nothing/here"),
    ).rejects.toMatchObject({
      category: "not_found",
    });
  });

  it("supported_templates is included in the not_found evidence", async () => {
    const host = await freshHost();
    try {
      await dispatchRead(host, "fdpm://nothing/here");
      throw new Error("expected dispatchRead to reject");
    } catch (err) {
      expect(err).toBeInstanceOf(FDPMException);
      const env = (err as FDPMException).toEnvelope();
      const supported = (env.evidence as Record<string, unknown>)[
        "supported_templates"
      ];
      expect(Array.isArray(supported)).toBe(true);
      expect((supported as string[]).some((t) => t.includes("/render/"))).toBe(true);
    }
  });

  it("throws not_found for an unknown workbook", async () => {
    const host = await freshHost();
    await expect(
      dispatchRead(host, buildRenderUri("nonexistent", "text/markdown")),
    ).rejects.toMatchObject({
      category: "not_found",
    });
  });

  it("throws not_found for an unknown renderer target", async () => {
    const host = await freshHost();
    await host.createProject({
      workbook_id: "tgt-proj",
      name: "Target",
      profile_id: FS_PROFILE,
    });
    await expect(
      dispatchRead(
        host,
        buildRenderUri("tgt-proj", "application/x-not-a-real-target"),
      ),
    ).rejects.toMatchObject({
      category: "not_found",
    });
  });
});
