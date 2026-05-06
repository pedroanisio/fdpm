/**
 * Regression tests for the file-emission and capability-derivation
 * surfaces promised by the howto-zod-to-fdpm-plugin workbook (rev 195):
 *
 *   - writeArtefactsToDir          — generated/profile.json etc.
 *   - writePluginScaffold          — fdpm-plugin.json + index.ts
 *   - zodSchemaToMarkdownRenderer  — cap:renderer derivation
 *   - zodSchemaToImporter          — cap:importer derivation
 *   - zodSchemaToExporter          — cap:exporter derivation
 *   - zodSchemaToExprHelper        — cap:expr-helper derivation
 *
 * Every emitter is deterministic: same input -> byte-equal output.
 * File emitters write only under `outputDir`. Snapshot drift gate is
 * enforced by writeArtefactsToDir's twin readArtefacts pair (the
 * caller diffs).
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, existsSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { defineDomain, type Domain } from "../src/sidecar-types.js";
import { assembleDomainProfileFromSidecar } from "../src/sidecar-orchestrator.js";
import {
  writeArtefactsToDir,
  writePluginScaffold,
  type ScaffoldResult,
} from "../src/scaffold.js";
import { zodSchemaToMarkdownRenderer } from "../src/renderers.js";
import { zodSchemaToImporter, zodSchemaToExporter } from "../src/io.js";
import { zodSchemaToExprHelper } from "../src/expr-helper.js";

const CustomerId = z.string();
const Customer = z.object({
  id: CustomerId,
  name: z.string().min(1).max(80),
  tier: z.enum(["free", "pro", "enterprise"]),
});

const baseFdpm = {
  pluginId: "acme.customers",
  vendor: "acme",
  profileId: "profile:acme-customers:0.1",
  pluginVersion: "0.1.0",
  hostCompatibility: ">=0.5.0 <0.6.0",
} as const;

function minimalDomain(): Domain {
  return defineDomain({
    __sidecarSpec: "0.1",
    entities: {
      Customer: {
        schema: Customer,
        identityKind: "id-field",
        idField: "id",
        idSchema: CustomerId,
      },
    },
    fdpm: baseFdpm,
  });
}

let tempDir: string;
beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "zod-bridge-scaffold-"));
});
afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

// ===========================================================================
// writeArtefactsToDir
// ===========================================================================

describe("writeArtefactsToDir — generated/* snapshot files", () => {
  it("writes profile.json, view-page.json, product-page-bundle.json, audit.json, usl-ng-core.json", () => {
    const result = assembleDomainProfileFromSidecar({
      domain: minimalDomain(),
      generatedAt: "1970-01-01T00:00:00.000Z",
    });
    writeArtefactsToDir(result, { outputDir: tempDir });
    const generated = join(tempDir, "generated");
    expect(existsSync(join(generated, "profile.json"))).toBe(true);
    expect(existsSync(join(generated, "view-page.json"))).toBe(true);
    expect(existsSync(join(generated, "product-page-bundle.json"))).toBe(true);
    expect(existsSync(join(generated, "audit.json"))).toBe(true);
    expect(existsSync(join(generated, "usl-ng-core.json"))).toBe(true);
  });

  it("writes JSON content matching stableStringify of the in-memory artefact", () => {
    const result = assembleDomainProfileFromSidecar({
      domain: minimalDomain(),
      generatedAt: "1970-01-01T00:00:00.000Z",
    });
    writeArtefactsToDir(result, { outputDir: tempDir });
    const onDisk = readFileSync(join(tempDir, "generated", "profile.json"), "utf8");
    const parsed = JSON.parse(onDisk);
    expect(parsed.id).toBe(result.profile.id);
    expect(parsed.primitive_types[0].id).toBe(result.profile.primitive_types[0]!.id);
  });

  it("is deterministic — two runs with identical inputs produce byte-equal files", () => {
    const result = assembleDomainProfileFromSidecar({
      domain: minimalDomain(),
      generatedAt: "1970-01-01T00:00:00.000Z",
    });
    const dirA = mkdtempSync(join(tmpdir(), "zod-bridge-scaffold-a-"));
    const dirB = mkdtempSync(join(tmpdir(), "zod-bridge-scaffold-b-"));
    try {
      writeArtefactsToDir(result, { outputDir: dirA });
      writeArtefactsToDir(result, { outputDir: dirB });
      const a = readFileSync(join(dirA, "generated", "profile.json"), "utf8");
      const b = readFileSync(join(dirB, "generated", "profile.json"), "utf8");
      expect(a).toBe(b);
    } finally {
      rmSync(dirA, { recursive: true, force: true });
      rmSync(dirB, { recursive: true, force: true });
    }
  });

  it("refuses to write outside outputDir (the §12 bridgeNeverModifies invariant)", () => {
    const result = assembleDomainProfileFromSidecar({
      domain: minimalDomain(),
      generatedAt: "1970-01-01T00:00:00.000Z",
    });
    expect(() =>
      writeArtefactsToDir(result, {
        outputDir: tempDir,
        // path traversal attempt
        artefactSubdir: "../escape" as never,
      }),
    ).toThrow(/bridge:write-violation/);
  });
});

// ===========================================================================
// writePluginScaffold
// ===========================================================================

describe("writePluginScaffold — runnable plugin directory", () => {
  it("writes fdpm-plugin.json with id, version, host_compatibility, capabilities[]", () => {
    const result = assembleDomainProfileFromSidecar({
      domain: minimalDomain(),
      generatedAt: "1970-01-01T00:00:00.000Z",
    });
    writePluginScaffold(result, { outputDir: tempDir });
    const manifest = JSON.parse(
      readFileSync(join(tempDir, "fdpm-plugin.json"), "utf8"),
    );
    expect(manifest.id).toBe("acme.customers");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.spec_version).toBe("1");
    expect(manifest.kind).toBe("server");
    expect(manifest.host_compatibility.fdpm).toBe(">=0.5.0 <0.6.0");
    expect(Array.isArray(manifest.capabilities)).toBe(true);
    // cap:profile is always emitted; cap:validator is emitted because
    // every entity has a validator.
    const ids = manifest.capabilities.map((c: { capability_id: string }) => c.capability_id);
    expect(ids).toContain("cap:profile");
    expect(ids).toContain("cap:validator");
  });

  it("derives cap:profile.local_name from pluginId (NOT the profile id tail)", () => {
    // Regression: pre-fix, local_name was set to tailOf(profileId)
    // which yields the version string ("0.1") because profile ids are
    // shaped `profile:<vendor>-<plugin>:<version>`. The intent is the
    // plugin slug.
    const result = assembleDomainProfileFromSidecar({
      domain: minimalDomain(),
      generatedAt: "1970-01-01T00:00:00.000Z",
    });
    writePluginScaffold(result, { outputDir: tempDir });
    const manifest = JSON.parse(
      readFileSync(join(tempDir, "fdpm-plugin.json"), "utf8"),
    );
    const profileCap = manifest.capabilities.find(
      (c: { capability_id: string }) => c.capability_id === "cap:profile",
    );
    expect(profileCap.local_name).toBe("acme-customers");
    expect(profileCap.local_name).not.toBe("0.1");
  });

  it("populates manifest.capabilities[cap:validator].metadata.rule_ids with the closed set", () => {
    const result = assembleDomainProfileFromSidecar({
      domain: minimalDomain(),
      generatedAt: "1970-01-01T00:00:00.000Z",
    });
    writePluginScaffold(result, { outputDir: tempDir });
    const manifest = JSON.parse(
      readFileSync(join(tempDir, "fdpm-plugin.json"), "utf8"),
    );
    const validatorCaps = manifest.capabilities.filter(
      (c: { capability_id: string }) => c.capability_id === "cap:validator",
    );
    expect(validatorCaps.length).toBeGreaterThan(0);
    const ruleIds: string[] = validatorCaps[0].metadata.rule_ids;
    expect(Array.isArray(ruleIds)).toBe(true);
    expect(ruleIds.length).toBeGreaterThan(0);
    expect(ruleIds.every((r) => r.startsWith("acme.customers:zod."))).toBe(true);
  });

  it("writes index.ts that exports profile + activate(ctx)", () => {
    const result = assembleDomainProfileFromSidecar({
      domain: minimalDomain(),
      generatedAt: "1970-01-01T00:00:00.000Z",
    });
    writePluginScaffold(result, { outputDir: tempDir });
    const index = readFileSync(join(tempDir, "index.ts"), "utf8");
    expect(index).toContain("export const profile");
    expect(index).toContain("export function activate");
    expect(index).toContain("ctx.registerProfile(profile)");
    expect(index).toContain("ctx.registerValidator");
    // CI drift gate, per the workbook's example:bridge-entry-module.
    expect(index).toContain("profile drift");
  });

  it("returns the list of files written (callable assertion shape)", () => {
    const result = assembleDomainProfileFromSidecar({
      domain: minimalDomain(),
      generatedAt: "1970-01-01T00:00:00.000Z",
    });
    const out: ScaffoldResult = writePluginScaffold(result, {
      outputDir: tempDir,
    });
    expect(out.files.length).toBeGreaterThanOrEqual(2); // manifest + index
    expect(out.files.every((f) => f.startsWith(tempDir))).toBe(true);
  });

  it("is deterministic — identical inputs produce byte-equal manifest + index", () => {
    const result = assembleDomainProfileFromSidecar({
      domain: minimalDomain(),
      generatedAt: "1970-01-01T00:00:00.000Z",
    });
    const dirA = mkdtempSync(join(tmpdir(), "zod-bridge-scaffold-pa-"));
    const dirB = mkdtempSync(join(tmpdir(), "zod-bridge-scaffold-pb-"));
    try {
      writePluginScaffold(result, { outputDir: dirA });
      writePluginScaffold(result, { outputDir: dirB });
      const manA = readFileSync(join(dirA, "fdpm-plugin.json"), "utf8");
      const manB = readFileSync(join(dirB, "fdpm-plugin.json"), "utf8");
      expect(manA).toBe(manB);
      const idxA = readFileSync(join(dirA, "index.ts"), "utf8");
      const idxB = readFileSync(join(dirB, "index.ts"), "utf8");
      expect(idxA).toBe(idxB);
    } finally {
      rmSync(dirA, { recursive: true, force: true });
      rmSync(dirB, { recursive: true, force: true });
    }
  });

  it("refuses to write outside outputDir", () => {
    const result = assembleDomainProfileFromSidecar({
      domain: minimalDomain(),
      generatedAt: "1970-01-01T00:00:00.000Z",
    });
    expect(() =>
      writePluginScaffold(result, {
        outputDir: tempDir,
        manifestFilename: "../escape.json" as never,
      }),
    ).toThrow(/bridge:write-violation/);
  });

  it("never writes a file with a leading absolute path or .. component", () => {
    const result = assembleDomainProfileFromSidecar({
      domain: minimalDomain(),
      generatedAt: "1970-01-01T00:00:00.000Z",
    });
    const out = writePluginScaffold(result, { outputDir: tempDir });
    for (const f of out.files) {
      expect(f).not.toContain("..");
      // every emitted path is under tempDir
      expect(f.startsWith(tempDir)).toBe(true);
      expect(statSync(f).isFile()).toBe(true);
    }
  });
});

// ===========================================================================
// zodSchemaToMarkdownRenderer
// ===========================================================================

describe("zodSchemaToMarkdownRenderer — cap:renderer derivation", () => {
  it("returns a renderer + a manifest entry (capability descriptor)", () => {
    const out = zodSchemaToMarkdownRenderer(Customer, {
      primitive_type_id: "acme:Customer",
      title: (p) => `# Customer ${p.field_values.id}`,
      fieldOrder: "schema",
    });
    expect(typeof out.renderer).toBe("function");
    expect(out.capability.capability_id).toBe("cap:renderer");
    expect(out.capability.metadata.primitive_type_id).toBe("acme:Customer");
    expect(out.capability.metadata.target).toBe("text/markdown");
  });

  it("emits the workbook's documented table shape (header + rows in declared field order)", () => {
    const { renderer } = zodSchemaToMarkdownRenderer(Customer, {
      primitive_type_id: "acme:Customer",
      fieldOrder: "schema",
    });
    const md = renderer({
      id: "cust-001",
      type_id: "acme:Customer",
      field_values: { id: "cust-001", name: "Alice", tier: "pro" },
    });
    expect(md).toMatch(/^# /m);
    expect(md).toContain("| Field");
    expect(md).toContain("| name");
    expect(md).toContain("| Alice");
    expect(md).toContain("| tier");
    // schema field order: id, name, tier — id appears before name appears before tier
    const iId = md.indexOf("| id ");
    const iName = md.indexOf("| name ");
    const iTier = md.indexOf("| tier ");
    expect(iId).toBeGreaterThan(0);
    expect(iName).toBeGreaterThan(iId);
    expect(iTier).toBeGreaterThan(iName);
  });

  it("supports alphabetical fieldOrder and explicit array order", () => {
    const { renderer: alpha } = zodSchemaToMarkdownRenderer(Customer, {
      primitive_type_id: "acme:Customer",
      fieldOrder: "alphabetical",
    });
    const mdA = alpha({
      id: "x",
      type_id: "acme:Customer",
      field_values: { id: "x", name: "a", tier: "free" },
    });
    // alpha order: id, name, tier (already alpha)
    expect(mdA.indexOf("| id ")).toBeLessThan(mdA.indexOf("| name "));

    const { renderer: explicit } = zodSchemaToMarkdownRenderer(Customer, {
      primitive_type_id: "acme:Customer",
      fieldOrder: ["tier", "name", "id"],
    });
    const mdE = explicit({
      id: "x",
      type_id: "acme:Customer",
      field_values: { id: "x", name: "a", tier: "free" },
    });
    expect(mdE.indexOf("| tier ")).toBeLessThan(mdE.indexOf("| name "));
    expect(mdE.indexOf("| name ")).toBeLessThan(mdE.indexOf("| id "));
  });

  it("is deterministic", () => {
    const { renderer } = zodSchemaToMarkdownRenderer(Customer, {
      primitive_type_id: "acme:Customer",
    });
    const target = {
      id: "x",
      type_id: "acme:Customer",
      field_values: { id: "x", name: "Alice", tier: "pro" },
    };
    expect(renderer(target)).toBe(renderer(target));
  });
});

// ===========================================================================
// zodSchemaToImporter / zodSchemaToExporter — round-trip property
// ===========================================================================

describe("zodSchemaToImporter / zodSchemaToExporter — cap:importer / cap:exporter", () => {
  it("importer parses an array of JSON elements and emits PrimitiveCreate intents", () => {
    const { importer, capability } = zodSchemaToImporter(Customer, {
      primitive_type_id: "acme:Customer",
      idFrom: (parsed) => `customer:${(parsed as { id: string }).id}`,
      pluginId: "acme.customers",
      typeName: "customer",
    });
    expect(capability.capability_id).toBe("cap:importer");
    const result = importer(JSON.stringify([
      { id: "a", name: "A", tier: "free" },
      { id: "b", name: "B", tier: "pro" },
    ]));
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.intents).toHaveLength(2);
    expect(result.intents[0]!.id).toBe("customer:a");
    expect(result.intents[0]!.type_id).toBe("acme:Customer");
  });

  it("importer is atomic: any single safeParse failure halts the whole batch", () => {
    const { importer } = zodSchemaToImporter(Customer, {
      primitive_type_id: "acme:Customer",
      idFrom: (parsed) => `customer:${(parsed as { id: string }).id}`,
      pluginId: "acme.customers",
      typeName: "customer",
    });
    const result = importer(JSON.stringify([
      { id: "a", name: "A", tier: "free" },
      { id: "b", name: "B", tier: "BAD-TIER" }, // invalid enum
    ]));
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]!.rule_id).toMatch(/^acme.customers:zod./);
  });

  it("exporter produces deterministic JSON of a workbook's primitive set", () => {
    const { exporter, capability } = zodSchemaToExporter(Customer, {
      primitive_type_id: "acme:Customer",
      filename: () => "customers.json",
    });
    expect(capability.capability_id).toBe("cap:exporter");
    const a = exporter({
      id: "wb-1",
      primitives: [
        { id: "customer:a", type_id: "acme:Customer", field_values: { id: "a", name: "A", tier: "free" } },
        { id: "customer:b", type_id: "acme:Customer", field_values: { id: "b", name: "B", tier: "pro" } },
      ],
    });
    const b = exporter({
      id: "wb-1",
      primitives: [
        // Same set, different order — exporter MUST sort.
        { id: "customer:b", type_id: "acme:Customer", field_values: { id: "b", name: "B", tier: "pro" } },
        { id: "customer:a", type_id: "acme:Customer", field_values: { id: "a", name: "A", tier: "free" } },
      ],
    });
    expect(a.body).toBe(b.body);
    expect(a.filename).toBe("customers.json");
  });

  it("round-trip: importer(exporter(W)).intents matches W's primitive set modulo id derivation", () => {
    const { importer } = zodSchemaToImporter(Customer, {
      primitive_type_id: "acme:Customer",
      idFrom: (p) => `customer:${(p as { id: string }).id}`,
      pluginId: "acme.customers",
      typeName: "customer",
    });
    const { exporter } = zodSchemaToExporter(Customer, {
      primitive_type_id: "acme:Customer",
      filename: () => "x.json",
    });
    const W = {
      id: "wb-1",
      primitives: [
        { id: "customer:a", type_id: "acme:Customer", field_values: { id: "a", name: "A", tier: "free" } },
      ],
    };
    const exported = exporter(W);
    const reImported = importer(exported.body);
    expect(reImported.kind).toBe("ok");
    if (reImported.kind !== "ok") return;
    expect(reImported.intents).toHaveLength(1);
    expect(reImported.intents[0]!.field_values).toEqual({
      id: "a",
      name: "A",
      tier: "free",
    });
  });
});

// ===========================================================================
// zodSchemaToExprHelper — purity + deterministic boolean result
// ===========================================================================

describe("zodSchemaToExprHelper — cap:expr-helper", () => {
  it("returns a function and a manifest entry; function is true/false on safeParse outcome", () => {
    const out = zodSchemaToExprHelper(Customer, {
      function_name: "acme.isValidCustomer",
      arity: 1,
      arg_types: ["object"],
      return_type: "boolean",
    });
    expect(out.capability.capability_id).toBe("cap:expr-helper");
    expect(out.capability.metadata.function_name).toBe("acme.isValidCustomer");
    expect(out.capability.metadata.pure).toBe(true);
    expect(out.fn({ id: "a", name: "A", tier: "free" })).toBe(true);
    expect(out.fn({ id: "a", name: "", tier: "free" })).toBe(false); // name min(1)
    expect(out.fn({ id: "a", name: "A", tier: "BAD" })).toBe(false);
  });

  it("is referentially transparent — same arg, same result", () => {
    const { fn } = zodSchemaToExprHelper(Customer, {
      function_name: "acme.isValidCustomer",
      arity: 1,
      arg_types: ["object"],
      return_type: "boolean",
    });
    const arg = { id: "a", name: "A", tier: "free" };
    expect(fn(arg)).toBe(fn(arg));
    expect(fn(arg)).toBe(fn(arg));
  });
});
