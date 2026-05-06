/**
 * SPEC-MCP-SERVER resources surface — profile provider tests.
 *
 * Covers the `fdpm://profile/{id}` family + `fdpm://profiles` index
 * added in v0.1.2:
 *
 *   - URI parser (raw, fragment-keyed alternates, malformed inputs)
 *   - resources/list shape (one entry per registered profile + index)
 *   - resources/templates/list shape
 *   - resources/read for the raw profile (text/json in `text`)
 *   - resources/read for `#summary` and `#types` fragments
 *   - resources/read for `#resolved` (extends-chain merge)
 *   - resources/read for the index URI
 *   - error envelopes: unknown profile id, malformed URI, unknown fragment
 *   - dispatch ordering: render and profile providers do not collide
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Host } from "../../src/core/host.js";
import { FDPMException } from "../../src/core/errors/fdpm-exception.js";
import { TEST_PROFILE } from "../fixtures.js";
import {
  buildProfileUri,
  parseProfileUri,
  profileResourceProvider,
  profilesIndexUri,
} from "../../src/mcp/resources/profile.js";
import {
  dispatchRead,
  listResources,
  listTemplates,
} from "../../src/mcp/resources/registry.js";

let dataDir: string;
beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "fdpm-resources-profile-"));
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

async function freshHost(): Promise<Host> {
  // null dataDir = in-memory only. noPlugins for determinism.
  const host = new Host({ dataDir: null, noPlugins: true });
  await host.load();
  await host.registerProfile(TEST_PROFILE);
  return host;
}

// ── URI parser ─────────────────────────────────────────────────────

describe("parseProfileUri / buildProfileUri", () => {
  it("round-trips a raw profile URI", () => {
    const uri = buildProfileUri("test:demo");
    expect(uri).toBe("fdpm://profile/test:demo");
    expect(parseProfileUri(uri)).toEqual({
      kind: "profile",
      profileId: "test:demo",
    });
  });

  it("accepts profile ids that contain colons (namespaced ids)", () => {
    const uri = "fdpm://profile/profile:formal-specification:3.0";
    expect(parseProfileUri(uri)).toEqual({
      kind: "profile",
      profileId: "profile:formal-specification:3.0",
    });
  });

  it("recognises the #summary fragment", () => {
    const m = parseProfileUri("fdpm://profile/test:demo#summary");
    expect(m).toEqual({ kind: "profile", profileId: "test:demo", view: "summary" });
  });

  it("recognises the #types fragment", () => {
    const m = parseProfileUri("fdpm://profile/test:demo#types");
    expect(m).toEqual({ kind: "profile", profileId: "test:demo", view: "types" });
  });

  it("recognises the #resolved fragment", () => {
    const m = parseProfileUri("fdpm://profile/test:demo#resolved");
    expect(m).toEqual({ kind: "profile", profileId: "test:demo", resolved: true });
  });

  it("recognises the bare profiles index URI", () => {
    expect(parseProfileUri("fdpm://profiles")).toEqual({ kind: "index" });
    expect(profilesIndexUri()).toBe("fdpm://profiles");
  });

  it("returns null on the wrong scheme", () => {
    expect(parseProfileUri("https://example.com/profile/x")).toBeNull();
    expect(parseProfileUri("fdpm:profile/x")).toBeNull();
  });

  it("returns null when the `profile/` keyword is missing", () => {
    expect(parseProfileUri("fdpm://other/x")).toBeNull();
  });

  it("returns null when the profile id is empty", () => {
    expect(parseProfileUri("fdpm://profile/")).toBeNull();
    expect(parseProfileUri("fdpm://profile/#summary")).toBeNull();
  });

  it("returns null on unknown fragments (no silent downgrade)", () => {
    expect(parseProfileUri("fdpm://profile/test:demo#raw")).toBeNull();
    expect(parseProfileUri("fdpm://profile/test:demo#full")).toBeNull();
    expect(parseProfileUri("fdpm://profile/test:demo#")).toBeNull();
  });

  it("does not match render URIs (no provider overlap)", () => {
    expect(parseProfileUri("fdpm://workbook/p/render/text/markdown")).toBeNull();
  });
});

// ── resources/templates/list ───────────────────────────────────────

describe("profileResourceProvider.templates", () => {
  it("advertises the raw profile and the profiles index", async () => {
    const host = await freshHost();
    const templates = profileResourceProvider.templates(host);
    expect(templates.map((t) => t.uriTemplate)).toEqual([
      "fdpm://profile/{profile_id}",
      "fdpm://profiles",
    ]);
    for (const t of templates) {
      expect(t.mimeType).toBe("application/json");
      expect(t.name.length).toBeGreaterThan(0);
    }
  });

  it("the registry-aggregated templates include profile templates", async () => {
    const host = await freshHost();
    const all = listTemplates(host);
    const uris = all.map((t) => t.uriTemplate);
    expect(uris).toContain("fdpm://profile/{profile_id}");
    expect(uris).toContain("fdpm://profiles");
    // Render provider's templates remain present.
    expect(uris).toContain("fdpm://workbook/{workbook_id}/render/{target}");
  });
});

// ── resources/list ─────────────────────────────────────────────────

describe("profileResourceProvider.enumerate", () => {
  it("emits one entry per registered profile, plus the index entry", async () => {
    const host = await freshHost();
    const entries = profileResourceProvider.enumerate(host);
    // Index always first.
    expect(entries[0]?.uri).toBe("fdpm://profiles");
    // One entry per registered profile (core:empty + test:demo).
    const profileUris = entries
      .filter((e) => e.uri !== "fdpm://profiles")
      .map((e) => e.uri);
    expect(profileUris).toContain("fdpm://profile/test:demo");
    expect(profileUris.length).toBeGreaterThanOrEqual(2);
    for (const e of entries) {
      expect(e.mimeType).toBe("application/json");
    }
  });

  it("does NOT enumerate fragment-keyed alternates (clients address by URI)", async () => {
    const host = await freshHost();
    const uris = profileResourceProvider.enumerate(host).map((e) => e.uri);
    expect(uris.some((u) => u.includes("#"))).toBe(false);
  });

  it("registry-aggregated list contains profile entries alongside render entries", async () => {
    const host = await freshHost();
    const all = listResources(host).map((e) => e.uri);
    expect(all).toContain("fdpm://profiles");
    expect(all).toContain("fdpm://profile/test:demo");
  });
});

// ── resources/read — happy paths ───────────────────────────────────

describe("dispatchRead — profile family", () => {
  it("reads the raw profile (full DomainProfile JSON in `text`)", async () => {
    const host = await freshHost();
    const r = await dispatchRead(host, "fdpm://profile/test:demo");
    expect(r.uri).toBe("fdpm://profile/test:demo");
    expect(r.mimeType).toBe("application/json");
    expect(r.text).toBeTruthy();
    expect(r.blob).toBeUndefined();
    const body = JSON.parse(r.text!);
    expect(body.id).toBe("test:demo");
    // Raw shape: full primitive_types/relation_types arrays present.
    expect(Array.isArray(body.primitive_types)).toBe(true);
    expect(body.primitive_types.length).toBe(2);
    // No projection markers on raw read.
    expect(body._view).toBeUndefined();
    expect(body._projected).toBeUndefined();
  });

  it("reads the #summary fragment as a projected summary", async () => {
    const host = await freshHost();
    const r = await dispatchRead(host, "fdpm://profile/test:demo#summary");
    expect(r.uri).toBe("fdpm://profile/test:demo#summary");
    const body = JSON.parse(r.text!);
    expect(body._view).toBe("summary");
    expect(body.id).toBe("test:demo");
    expect(body.primitive_type_count).toBe(2);
    expect(body.relation_type_count).toBe(1);
    // The full primitive_types[] payload MUST NOT leak into summary.
    expect(body.primitive_types).toBeUndefined();
  });

  it("reads the #types fragment as the type vocabulary", async () => {
    const host = await freshHost();
    const r = await dispatchRead(host, "fdpm://profile/test:demo#types");
    const body = JSON.parse(r.text!);
    expect(body._view).toBe("types");
    expect(Array.isArray(body.primitive_types)).toBe(true);
    expect(body.primitive_types.length).toBe(2);
    const section = body.primitive_types.find((p: { id: string }) => p.id === "test:section");
    expect(section).toBeTruthy();
    // Field-level shape sanity (kind not type, enum_values not enum).
    const fields = section.fields as Array<Record<string, unknown>>;
    const status = fields.find((f) => f.name === "status")!;
    expect(status.kind).toBe("enum");
    expect(status.enum_values).toEqual(["draft", "stable", "deprecated"]);
  });

  it("reads the #resolved fragment (extends-chain-flattened profile)", async () => {
    const host = await freshHost();
    // test:demo declares no extends, so resolved == raw shape-wise;
    // we still verify the path runs and produces a structurally
    // identical id/version. The resolved-vs-raw distinction is
    // exercised more thoroughly by ProfileRegistry's own tests.
    const r = await dispatchRead(host, "fdpm://profile/test:demo#resolved");
    expect(r.uri).toBe("fdpm://profile/test:demo#resolved");
    const body = JSON.parse(r.text!);
    expect(body.id).toBe("test:demo");
    expect(body.version).toBe("1.0.0");
  });

  it("reads the index URI as the registered-profile index", async () => {
    const host = await freshHost();
    const r = await dispatchRead(host, "fdpm://profiles");
    expect(r.uri).toBe("fdpm://profiles");
    const body = JSON.parse(r.text!) as {
      profiles: Array<{ id: string; version: string; primitive_type_count: number }>;
    };
    expect(Array.isArray(body.profiles)).toBe(true);
    const demo = body.profiles.find((p) => p.id === "test:demo");
    expect(demo?.version).toBe("1.0.0");
    expect(demo?.primitive_type_count).toBe(2);
  });

  // ── error envelopes ──────────────────────────────────────────────

  it("not_found is thrown for an unknown profile id (raw shape)", async () => {
    const host = await freshHost();
    await expect(
      dispatchRead(host, "fdpm://profile/does:not:exist"),
    ).rejects.toBeInstanceOf(FDPMException);
    await expect(
      dispatchRead(host, "fdpm://profile/does:not:exist"),
    ).rejects.toMatchObject({ category: "not_found" });
  });

  it("not_found also fires for unknown id with a fragment (#summary)", async () => {
    const host = await freshHost();
    await expect(
      dispatchRead(host, "fdpm://profile/does:not:exist#summary"),
    ).rejects.toMatchObject({ category: "not_found" });
  });

  it("malformed URI surfaces a registry-level not_found with template hints", async () => {
    const host = await freshHost();
    // Unknown fragment → no provider matches → registry's helpful error.
    await expect(
      dispatchRead(host, "fdpm://profile/test:demo#bogus"),
    ).rejects.toMatchObject({
      category: "not_found",
    });
  });

  it("a render URI still routes to the render provider, not profile", async () => {
    // Smoke check that the new provider doesn't shadow render URIs.
    // We don't dispatchRead an actual render here (would require a
    // workbook + renderer fixture, which the render tests cover);
    // we only confirm the profile provider's match() returns null.
    expect(
      profileResourceProvider.match("fdpm://workbook/p/render/text/markdown"),
    ).toBeNull();
  });
});
