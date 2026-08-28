/**
 * SPEC-MCP-SERVER resources surface — schema provider tests.
 *
 * `fdpm://schema/profile` serves the DomainProfile JSON Schema so
 * that `fdpm.profile.register` can advertise an opaque `profile`
 * object instead of inlining 8.8 KB of schema into every
 * `tools/list` response (SPEC-MCP-SERVER §8.5 catalog budget). The
 * schema is derived from the same Zod source of truth the server
 * validates against (§11.1) — the resource and the validator cannot
 * drift.
 *
 * Covers:
 *   - URI parser (accepted shape, wrong scheme, unknown schema id,
 *     fragments rejected)
 *   - resources/templates/list and resources/list shape
 *   - resources/read returns application/schema+json whose body is
 *     byte-identical to `toJsonSchema(DomainProfile)`
 *   - registry dispatch: not_found for unknown schema ids; no provider
 *     overlap with render / profile URIs
 *   - purity: repeated reads are identical and touch no state
 */
import { describe, expect, it } from "vitest";
import { Host } from "../../src/core/host.js";
import { FDPMException } from "../../src/core/errors/fdpm-exception.js";
import { DomainProfile } from "../../src/core/models/meta.js";
import { toJsonSchema } from "../../src/mcp/schemas.js";
import { TEST_PROFILE } from "../fixtures.js";
import {
  PROFILE_SCHEMA_URI,
  SCHEMA_MIME,
  parseSchemaUri,
  schemaResourceProvider,
} from "../../src/mcp/resources/schema.js";
import { profileResourceProvider } from "../../src/mcp/resources/profile.js";
import { renderResourceProvider } from "../../src/mcp/resources/render.js";
import {
  dispatchRead,
  listResources,
  listTemplates,
} from "../../src/mcp/resources/registry.js";

async function freshHost(): Promise<Host> {
  const host = new Host({ dataDir: null, noPlugins: true });
  await host.load();
  await host.registerProfile(TEST_PROFILE);
  return host;
}

// ── URI parser ─────────────────────────────────────────────────────

describe("parseSchemaUri", () => {
  it("accepts the canonical profile-schema URI", () => {
    expect(PROFILE_SCHEMA_URI).toBe("fdpm://schema/profile");
    expect(parseSchemaUri(PROFILE_SCHEMA_URI)).toEqual({ kind: "profile" });
  });

  it("returns null on the wrong scheme or missing keyword", () => {
    expect(parseSchemaUri("https://example.com/schema/profile")).toBeNull();
    expect(parseSchemaUri("fdpm:schema/profile")).toBeNull();
    expect(parseSchemaUri("fdpm://schemas/profile")).toBeNull();
    expect(parseSchemaUri("fdpm://schema/")).toBeNull();
    expect(parseSchemaUri("fdpm://schema")).toBeNull();
  });

  it("returns null for unknown schema ids (no silent fallback)", () => {
    expect(parseSchemaUri("fdpm://schema/workbook")).toBeNull();
    expect(parseSchemaUri("fdpm://schema/Profile")).toBeNull();
  });

  it("rejects fragments and trailing segments", () => {
    expect(parseSchemaUri("fdpm://schema/profile#summary")).toBeNull();
    expect(parseSchemaUri("fdpm://schema/profile/extra")).toBeNull();
  });

  it("does not match profile or render URIs (no provider overlap)", () => {
    expect(parseSchemaUri("fdpm://profile/test:demo")).toBeNull();
    expect(parseSchemaUri("fdpm://profiles")).toBeNull();
    expect(parseSchemaUri("fdpm://workbook/p/render/text/markdown")).toBeNull();
    expect(profileResourceProvider.match(PROFILE_SCHEMA_URI)).toBeNull();
    expect(renderResourceProvider.match(PROFILE_SCHEMA_URI)).toBeNull();
  });
});

// ── templates / list ───────────────────────────────────────────────

describe("schemaResourceProvider.templates / enumerate", () => {
  it("advertises one template with the schema+json MIME type", async () => {
    const host = await freshHost();
    const templates = schemaResourceProvider.templates(host);
    expect(templates).toHaveLength(1);
    expect(templates[0]!.uriTemplate).toBe("fdpm://schema/{schema_id}");
    expect(templates[0]!.mimeType).toBe(SCHEMA_MIME);
    expect(templates[0]!.description).toMatch(/profile/);
    expect(templates[0]!.description).toMatch(/fdpm\.profile\.register/);
  });

  it("enumerates exactly the profile schema as a concrete resource", async () => {
    const host = await freshHost();
    const entries = schemaResourceProvider.enumerate(host);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      uri: PROFILE_SCHEMA_URI,
      mimeType: SCHEMA_MIME,
    });
    expect(entries[0]!.name.length).toBeGreaterThan(0);
  });

  it("is registered in the registry: resources/list and templates/list include it", async () => {
    const host = await freshHost();
    expect(listResources(host).map((r) => r.uri)).toContain(PROFILE_SCHEMA_URI);
    expect(listTemplates(host).map((t) => t.uriTemplate)).toContain(
      "fdpm://schema/{schema_id}",
    );
  });
});

// ── read ───────────────────────────────────────────────────────────

describe("resources/read fdpm://schema/profile", () => {
  it("returns application/schema+json whose body is the DomainProfile JSON Schema", async () => {
    const host = await freshHost();
    const result = await dispatchRead(host, PROFILE_SCHEMA_URI);
    expect(result.uri).toBe(PROFILE_SCHEMA_URI);
    expect(result.mimeType).toBe(SCHEMA_MIME);
    expect(result.blob).toBeUndefined();
    expect(typeof result.text).toBe("string");
    const schema = JSON.parse(result.text!) as Record<string, unknown>;
    expect(schema["type"]).toBe("object");
    const props = schema["properties"] as Record<string, unknown>;
    for (const key of [
      "id",
      "version",
      "extends",
      "primitive_types",
      "relation_types",
      "scopes",
      "categories",
    ]) {
      expect(props, `properties.${key}`).toHaveProperty(key);
    }
    const required = schema["required"] as string[];
    expect(required).toContain("id");
    expect(required).toContain("version");
  });

  it("is byte-identical to toJsonSchema(DomainProfile) — one source of truth (§11.1)", async () => {
    const host = await freshHost();
    const result = await dispatchRead(host, PROFILE_SCHEMA_URI);
    expect(JSON.parse(result.text!)).toEqual(toJsonSchema(DomainProfile));
  });

  it("is pure: two reads are identical and registering a profile does not change it", async () => {
    const host = await freshHost();
    const a = await dispatchRead(host, PROFILE_SCHEMA_URI);
    await host.registerProfile({ ...TEST_PROFILE, id: "test:other" });
    const b = await dispatchRead(host, PROFILE_SCHEMA_URI);
    expect(a.text).toBe(b.text);
  });

  it("unknown schema id → not_found from the registry with supported templates in evidence", async () => {
    const host = await freshHost();
    await expect(dispatchRead(host, "fdpm://schema/workbook")).rejects.toMatchObject({
      category: "not_found",
    });
    try {
      await dispatchRead(host, "fdpm://schema/workbook");
    } catch (err) {
      expect(err).toBeInstanceOf(FDPMException);
      const evidence = (err as FDPMException).evidence as { supported_templates: string[] };
      expect(evidence.supported_templates).toContain("fdpm://schema/{schema_id}");
    }
  });
});
