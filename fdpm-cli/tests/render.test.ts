import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Host } from "../src/core/host.js";
import { PDFDocument } from "pdf-lib";
import { PROFILE_ID } from "../plugins/formal_specification/index.js";

/**
 * Renderer pipeline tests:
 *  - runRenderer §6.5 gate: MIME mismatch, size cap, invalid UTF-8 for
 *    text/* targets all surface as PluginError(verification) WITHOUT
 *    quarantining the plugin (the renderer ran fine; only the output
 *    was unacceptable).
 *  - runRenderer §6.4 exception barrier: a raising renderer quarantines
 *    its plugin and rejects with PluginError(capability).
 *  - End-to-end against the formal_specification plugin:
 *      markdown contains expected headings,
 *      html starts with <!doctype html> and is well-formed,
 *      pdf starts with the %PDF magic and parses via pdf-lib.
 */

function tmpPluginDir(): string {
  return mkdtempSync(join(tmpdir(), "fdpm-render-test-"));
}

function writePlugin(
  parent: string,
  id: string,
  manifest: Record<string, unknown>,
  entry: string,
): string {
  const dir = join(parent, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "fdpm-plugin.json"), JSON.stringify(manifest, null, 2));
  writeFileSync(join(dir, "index.ts"), entry);
  return dir;
}

async function newFsHost(): Promise<Host> {
  const host = new Host({
    dataDir: null,
    builtinDirs: [resolve(process.cwd(), "plugins")],
    pluginPaths: [],
  });
  await host.load();
  return host;
}

async function newFsHostWithPaper(): Promise<Host> {
  const host = await newFsHost();
  await host.createProject({
    workbook_id: "paper",
    name: "Demo Paper",
    profile_id: PROFILE_ID,
  });
  await host.createPrimitive("paper", {
    id: "section:1",
    type_id: "fs:Section",
    field_values: {
      number: 1,
      title: "Introduction",
      status: "draft",
      version: "1.0.0",
      description: "Sets the scene.",
    },
    scope_id: "scope:fs:specification",
  });
  await host.createPrimitive("paper", {
    id: "section:2",
    type_id: "fs:Section",
    field_values: {
      number: 2,
      title: "Method",
      status: "stable",
      version: "1.0.0",
      description: "How it works.",
    },
    scope_id: "scope:fs:method",
  });
  return host;
}

describe("formal_specification renderers — happy path", () => {
  it("markdown renderer produces expected headings and is valid UTF-8", async () => {
    const host = await newFsHostWithPaper();
    const slice = host.getProject("paper");
    const profile = host.profiles.getResolved(slice.workbook.profile_id);
    const out = await host.plugins.runRenderer("text/markdown", {
      workbookId: "paper",
      primitives: Object.values(slice.primitives),
      relations: Object.values(slice.relations),
      profile,
    });
    expect(out.contentType).toBe("text/markdown");
    expect(out.rendererId).toBe("fs:SpecRenderer");
    const text = new TextDecoder().decode(out.bytes);
    expect(text.startsWith("# paper")).toBe(true);
    expect(text).toContain("## 1. Introduction");
    expect(text).toContain("## 2. Method");
  });

  it("html renderer produces a well-formed document", async () => {
    const host = await newFsHostWithPaper();
    const slice = host.getProject("paper");
    const profile = host.profiles.getResolved(slice.workbook.profile_id);
    const out = await host.plugins.runRenderer("text/html", {
      workbookId: "paper",
      primitives: Object.values(slice.primitives),
      relations: Object.values(slice.relations),
      profile,
    });
    expect(out.contentType).toBe("text/html");
    const html = new TextDecoder().decode(out.bytes);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<title>paper</title>");
    expect(html).toContain("<h1>paper</h1>");
    expect(html).toContain("Introduction");
    expect(html).toContain("@media print");
  });

  it("pdf renderer produces a valid pdf-lib-parseable document", async () => {
    const host = await newFsHostWithPaper();
    const slice = host.getProject("paper");
    const profile = host.profiles.getResolved(slice.workbook.profile_id);
    const out = await host.plugins.runRenderer("application/pdf", {
      workbookId: "paper",
      primitives: Object.values(slice.primitives),
      relations: Object.values(slice.relations),
      profile,
    });
    expect(out.contentType).toBe("application/pdf");
    expect(out.bytes.byteLength).toBeGreaterThan(500);
    // Magic bytes: %PDF-
    const magic = new TextDecoder().decode(out.bytes.slice(0, 5));
    expect(magic).toBe("%PDF-");
    // Round-trip via pdf-lib to confirm structural validity.
    const reloaded = await PDFDocument.load(out.bytes);
    expect(reloaded.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("renders an empty workbook without crashing", async () => {
    const host = await newFsHost();
    await host.createProject({
      workbook_id: "empty",
      name: "Empty",
      profile_id: PROFILE_ID,
    });
    const slice = host.getProject("empty");
    const profile = host.profiles.getResolved(slice.workbook.profile_id);
    const md = await host.plugins.runRenderer("text/markdown", {
      workbookId: "empty",
      primitives: [],
      relations: [],
      profile,
    });
    expect(new TextDecoder().decode(md.bytes)).toContain("# empty");
    const pdf = await host.plugins.runRenderer("application/pdf", {
      workbookId: "empty",
      primitives: [],
      relations: [],
      profile,
    });
    expect(new TextDecoder().decode(pdf.bytes.slice(0, 5))).toBe("%PDF-");
  });
});

describe("runRenderer — §6.5 output verification gate", () => {
  function makeRendererPlugin(args: {
    id: string;
    target: string;
    fnSrc: string; // raw function body returning RendererOutput-shaped object
  }): { dir: string; pluginId: string } {
    const dir = tmpPluginDir();
    writePlugin(
      dir,
      args.id,
      {
        id: args.id,
        version: "0.1.0",
        spec_version: "1.1.0",
        kind: "server",
        host_compatibility: { fdpm: ">=1.0,<2" },
        permissions: ["render:server"],
        capabilities: [
          { capability_id: "cap:renderer", local_name: "test", entry: "fn" },
        ],
      },
      `
const manifest = ${JSON.stringify({
  id: args.id,
  version: "0.1.0",
  spec_version: "1.1.0",
  kind: "server",
  host_compatibility: { fdpm: ">=1.0,<2" },
  permissions: ["render:server"],
  capabilities: [{ capability_id: "cap:renderer", local_name: "test" }],
})};
const fn = ${args.fnSrc};
export default {
  manifest,
  activate: (ctx) => {
    ctx.registerRenderer({ target: ${JSON.stringify(args.target)}, rendererId: "test:renderer", fn });
  },
};
`,
    );
    return { dir, pluginId: args.id };
  }

  it("rejects output whose contentType does not match the declared target", async () => {
    const { dir, pluginId } = makeRendererPlugin({
      id: "test.mime-liar",
      target: "text/markdown",
      // Function lies: registered as text/markdown but returns text/html.
      fnSrc: `() => ({ bytes: new TextEncoder().encode("# x"), contentType: "text/html" })`,
    });
    const host = new Host({ dataDir: null, builtinDirs: [], pluginPaths: [dir] });
    await host.load();
    await host.plugins.enable(pluginId);
    await expect(
      host.plugins.runRenderer("text/markdown", {
        workbookId: "x",
        primitives: [],
        relations: [],
        profile: { id: "p:x:1.0" } as never,
      }),
    ).rejects.toThrow(/contentType=text\/html/);
    // Plugin NOT quarantined — its function ran fine.
    expect(host.plugins.get(pluginId)?.state).toBe("active");
    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects output whose size exceeds FDPM_MAX_RENDER_BYTES", async () => {
    const previous = process.env["FDPM_MAX_RENDER_BYTES"];
    process.env["FDPM_MAX_RENDER_BYTES"] = "1024";
    try {
      const { dir, pluginId } = makeRendererPlugin({
        id: "test.huge-output",
        target: "text/plain",
        fnSrc: `() => ({ bytes: new TextEncoder().encode("x".repeat(2048)), contentType: "text/plain" })`,
      });
      const host = new Host({ dataDir: null, builtinDirs: [], pluginPaths: [dir] });
      await host.load();
      await host.plugins.enable(pluginId);
      await expect(
        host.plugins.runRenderer("text/plain", {
          workbookId: "x",
          primitives: [],
          relations: [],
          profile: { id: "p:x:1.0" } as never,
        }),
      ).rejects.toThrow(/exceeds cap/);
      expect(host.plugins.get(pluginId)?.state).toBe("active");
      rmSync(dir, { recursive: true, force: true });
    } finally {
      if (previous == null) delete process.env["FDPM_MAX_RENDER_BYTES"];
      else process.env["FDPM_MAX_RENDER_BYTES"] = previous;
    }
  });

  it("rejects invalid UTF-8 for a text/* target", async () => {
    const { dir, pluginId } = makeRendererPlugin({
      id: "test.bad-utf8",
      target: "text/plain",
      // 0xC0 0xC1 are invalid UTF-8 start bytes.
      fnSrc: `() => ({ bytes: new Uint8Array([0xc0, 0xc1, 0xc2]), contentType: "text/plain" })`,
    });
    const host = new Host({ dataDir: null, builtinDirs: [], pluginPaths: [dir] });
    await host.load();
    await host.plugins.enable(pluginId);
    await expect(
      host.plugins.runRenderer("text/plain", {
        workbookId: "x",
        primitives: [],
        relations: [],
        profile: { id: "p:x:1.0" } as never,
      }),
    ).rejects.toThrow(/invalid UTF-8/);
    expect(host.plugins.get(pluginId)?.state).toBe("active");
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("runRenderer — §6.4 exception barrier", () => {
  it("quarantines a raising renderer's plugin without crashing the host", async () => {
    const dir = tmpPluginDir();
    writePlugin(
      dir,
      "test.raising-renderer",
      {
        id: "test.raising-renderer",
        version: "0.1.0",
        spec_version: "1.1.0",
        kind: "server",
        host_compatibility: { fdpm: ">=1.0,<2" },
        permissions: ["render:server"],
        capabilities: [
          { capability_id: "cap:renderer", local_name: "boom", entry: "fn" },
        ],
      },
      `
const manifest = ${JSON.stringify({
  id: "test.raising-renderer",
  version: "0.1.0",
  spec_version: "1.1.0",
  kind: "server",
  host_compatibility: { fdpm: ">=1.0,<2" },
  permissions: ["render:server"],
  capabilities: [{ capability_id: "cap:renderer", local_name: "boom" }],
})};
const fn = () => { throw new Error("renderer-boom"); };
export default {
  manifest,
  activate: (ctx) => { ctx.registerRenderer({ target: "text/markdown", rendererId: "boom", fn }); },
};
`,
    );
    const host = new Host({ dataDir: null, builtinDirs: [], pluginPaths: [dir] });
    await host.load();
    await host.plugins.enable("test.raising-renderer");
    await expect(
      host.plugins.runRenderer("text/markdown", {
        workbookId: "x",
        primitives: [],
        relations: [],
        profile: { id: "p:x:1.0" } as never,
      }),
    ).rejects.toThrow(/renderer-boom|raised/);
    const r = host.plugins.get("test.raising-renderer");
    expect(r?.state).toBe("quarantined");
    expect(r?.errorMessage).toContain("renderer-boom");
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("runRenderer — disambiguation", () => {
  it("returns a 'no renderer registered' error for an unknown target", async () => {
    const host = await newFsHost();
    await expect(
      host.plugins.runRenderer("application/x-fictional", {
        workbookId: "x",
        primitives: [],
        relations: [],
        profile: { id: "p:x:1.0" } as never,
      }),
    ).rejects.toThrow(/no renderer registered/);
  });
});
