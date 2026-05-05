import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Host } from "../src/core/host.js";
import { PROFILE_ID } from "../plugins/spec_authoring/index.js";
import { buildRenderCommand } from "../src/commands/render.js";

async function newSpecHost(args?: { dataDir?: string | null; pluginPaths?: string[] }): Promise<Host> {
  const host = new Host({
    dataDir: args?.dataDir ?? null,
    builtinDirs: [resolve(process.cwd(), "plugins")],
    pluginPaths: args?.pluginPaths ?? [],
  });
  await host.load();
  return host;
}

async function seedSpecProject(host: Host, workbookId = "spec-dsl"): Promise<void> {
  await host.createProject({
    workbook_id: workbookId,
    name: "Spec DSL",
    profile_id: PROFILE_ID,
  });
  await host.createPrimitive(workbookId, {
    id: "spec:doc:test",
    type_id: "spec:Document",
    field_values: {
      title: "Spec DSL",
      spec_id: "spec:test:render-dsl:0.1",
      version: "0.1.0",
      status: "Draft",
      audience: "Renderer tests",
      required_reads: ["CLAUDE.md"],
      disclaimer_path: "../../DISCLAIMER.md",
      pals_banner: true,
      date: "2026-05-04",
      generated_by: "vitest",
    },
    scope_id: "scope:spec:normative",
  });
  await host.createPrimitive(workbookId, {
    id: "spec:sec:references",
    type_id: "spec:Section",
    field_values: {
      number: "1",
      title: "References",
      body_md: "",
      kind: "references",
    },
    scope_id: "scope:spec:informative",
  });
  await host.createPrimitive(workbookId, {
    id: "spec:ref:cel",
    type_id: "spec:Reference",
    field_values: {
      kind: "url",
      citation: "Common Expression Language",
      locator: "https://cel.dev/",
      verification: "verified",
      verification_note: "Checked against the public site.",
    },
  });
  await host.createRelation(workbookId, {
    id: "spec:rel:doc-section",
    type_id: "spec:HasSection",
    source_id: "spec:doc:test",
    target_id: "spec:sec:references",
    field_values: {},
  });
  await host.createRelation(workbookId, {
    id: "spec:rel:doc-ref",
    type_id: "spec:Cites",
    source_id: "spec:doc:test",
    target_id: "spec:ref:cel",
    field_values: {},
  });
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

describe("render DSL engine", () => {
  it("interpolates variables and conditionals through the host-owned runtime", async () => {
    const host = await newSpecHost();
    await seedSpecProject(host);
    const slice = host.getProject("spec-dsl");
    const profile = host.profiles.getResolved(slice.workbook.profile_id);
    const facade = host.renderDsl.createFacade({
      slice,
      profile,
      defaultDoc: slice.primitives["spec:doc:test"],
    });
    const out = facade.renderTemplate(
      "Title: ${doc.fields.title}${if: workbook.id == \"spec-dsl\"} OK${endif}",
      { templateId: "test:ok" },
    );
    expect(out.text).toBe("Title: Spec DSL OK");
    expect(out.findings).toEqual([]);
  });

  it("surfaces a located render finding and emits an inline marker on unknown names", async () => {
    const host = await newSpecHost();
    await seedSpecProject(host);
    const slice = host.getProject("spec-dsl");
    const profile = host.profiles.getResolved(slice.workbook.profile_id);
    const facade = host.renderDsl.createFacade({
      slice,
      profile,
      defaultDoc: slice.primitives["spec:doc:test"],
    });
    const out = facade.renderTemplate("x ${missing}\ny", { templateId: "test:unknown" });
    expect(out.text).toContain("[[render-error: missing ::");
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0]).toMatchObject({
      kind: "render-error",
      templateId: "test:unknown",
      line: 1,
      column: 3,
      expression: "missing",
      expr_code: "unknown-name",
    });
  });

  it("rejects include cycles with a located render finding", async () => {
    const host = await newSpecHost();
    await seedSpecProject(host);
    const slice = host.getProject("spec-dsl");
    const profile = host.profiles.getResolved(slice.workbook.profile_id);
    const facade = host.renderDsl.createFacade({
      slice,
      profile,
      defaultDoc: slice.primitives["spec:doc:test"],
    });
    const out = facade.renderTemplate("${include: a}", {
      templateId: "root",
      includes: {
        a: "${include: b}",
        b: "${include: a}",
      },
    });
    expect(out.text).toContain("[[render-error: include:a :: include cycle detected:");
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0]).toMatchObject({
      templateId: "b",
      expression: "include:a",
      line: 1,
      column: 1,
    });
  });

  it("enforces the include depth limit at 5", async () => {
    const host = await newSpecHost();
    await seedSpecProject(host);
    const slice = host.getProject("spec-dsl");
    const profile = host.profiles.getResolved(slice.workbook.profile_id);
    const facade = host.renderDsl.createFacade({
      slice,
      profile,
      defaultDoc: slice.primitives["spec:doc:test"],
    });
    const out = facade.renderTemplate("${include: a}", {
      templateId: "root",
      includes: {
        a: "${include: b}",
        b: "${include: c}",
        c: "${include: d}",
        d: "${include: e}",
        e: "${include: f}",
        f: "too deep",
      },
    });
    expect(out.text).toContain("[[render-error: include:f :: include depth limit 5 exceeded at f]]");
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0]).toMatchObject({
      templateId: "e",
      expression: "include:f",
      line: 1,
      column: 1,
    });
  });

  it("drives the spec renderer references section from a template and remains deterministic", async () => {
    const host = await newSpecHost();
    await seedSpecProject(host);
    const slice = host.getProject("spec-dsl");
    const profile = host.profiles.getResolved(slice.workbook.profile_id);
    const first = await host.plugins.runRenderer(
      "text/markdown",
      {
        workbookId: "spec-dsl",
        workbook: slice.workbook,
        primitives: Object.values(slice.primitives),
        relations: Object.values(slice.relations),
        templates: Object.values(slice.templates),
        profile,
      },
      { rendererId: "spec:SpecMarkdownRenderer" },
    );
    const second = await host.plugins.runRenderer(
      "text/markdown",
      {
        workbookId: "spec-dsl",
        workbook: slice.workbook,
        primitives: Object.values(slice.primitives),
        relations: Object.values(slice.relations),
        templates: Object.values(slice.templates),
        profile,
      },
      { rendererId: "spec:SpecMarkdownRenderer" },
    );
    const text = new TextDecoder().decode(first.bytes);
    expect(text).toContain(
      "- Common Expression Language (https://cel.dev/) _[verified]_ — Checked against the public site.",
    );
    expect(first.findings ?? []).toEqual([]);
    expect(new TextDecoder().decode(second.bytes)).toBe(text);
  });
});

describe("fdpm render --strict", () => {
  it("preserves bytes and changes the exit code when findings are present", async () => {
    const pluginRoot = mkdtempSync(join(tmpdir(), "fdpm-render-strict-plugin-"));
    const manifest = {
      id: "test.render-dsl",
      version: "0.1.0",
      spec_version: "1.1.0",
      kind: "server",
      host_compatibility: { fdpm: ">=1.0,<2" },
      permissions: ["render:server"],
      capabilities: [{ capability_id: "cap:renderer", local_name: "strict", entry: "fn" }],
    };
    writePlugin(
      pluginRoot,
      "test.render-dsl",
      manifest,
      `
const manifest = ${JSON.stringify(manifest)};
export default {
  manifest,
  activate(ctx) {
    ctx.registerRenderer({
      target: "text/plain",
      rendererId: "test:strict",
      fn(input) {
        const rendered = input.renderDsl.renderTemplate("value=\${workbook.id} missing=\${missing}", {
          templateId: "test:strict",
        });
        return {
          bytes: new TextEncoder().encode(rendered.text),
          contentType: "text/plain",
          findings: rendered.findings,
        };
      },
    });
  },
};
`,
    );
    try {
      const host = await newSpecHost({ pluginPaths: [pluginRoot] });
      await host.plugins.enable("test.render-dsl");
      await seedSpecProject(host, "strict-spec");
      const cmd = buildRenderCommand(host);
      let stdout = "";
      let stderr = "";
      const stdoutWrite = process.stdout.write.bind(process.stdout);
      const stderrWrite = process.stderr.write.bind(process.stderr);
      const originalExitCode = process.exitCode;
      process.exitCode = undefined;
      process.stdout.write = ((chunk: string | Uint8Array) => {
        stdout += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
        return true;
      }) as typeof process.stdout.write;
      process.stderr.write = ((chunk: string | Uint8Array) => {
        stderr += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
        return true;
      }) as typeof process.stderr.write;
      try {
        await cmd.parseAsync(
          ["strict-spec", "text/plain", "--renderer-id", "test:strict", "--strict"],
          { from: "user" },
        );
      } finally {
        process.stdout.write = stdoutWrite;
        process.stderr.write = stderrWrite;
      }
      expect(process.exitCode).toBe(3);
      expect(stdout).toContain("value=strict-spec");
      expect(stdout).toContain("[[render-error: missing ::");
      expect(stderr).toContain("render produced 1 finding(s); --strict sets exit code 3");
      process.exitCode = originalExitCode;
    } finally {
      rmSync(pluginRoot, { recursive: true, force: true });
    }
  });
});
