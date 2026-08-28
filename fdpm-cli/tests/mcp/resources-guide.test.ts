/**
 * `fdpm://guide` — the server instructions as a resource.
 *
 * MCP clients MAY ignore `initialize.instructions`. A resource makes
 * the same orientation text reachable on demand by any client (and
 * by a human through `resources/read`), and pins the invariant that
 * the two surfaces are byte-identical.
 */
import { describe, expect, it } from "vitest";
import { Host } from "../../src/core/host.js";
import { TEST_PROFILE } from "../fixtures.js";
import { SERVER_INSTRUCTIONS } from "../../src/mcp/instructions.js";
import {
  GUIDE_MIME,
  GUIDE_URI,
  guideResourceProvider,
  parseGuideUri,
} from "../../src/mcp/resources/guide.js";
import { profileResourceProvider } from "../../src/mcp/resources/profile.js";
import { renderResourceProvider } from "../../src/mcp/resources/render.js";
import { schemaResourceProvider } from "../../src/mcp/resources/schema.js";
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

describe("parseGuideUri", () => {
  it("accepts exactly fdpm://guide", () => {
    expect(GUIDE_URI).toBe("fdpm://guide");
    expect(parseGuideUri(GUIDE_URI)).toEqual({ kind: "guide" });
  });

  it("rejects variants, fragments, and other providers' URIs", () => {
    for (const bad of [
      "fdpm://guide/",
      "fdpm://guide#x",
      "fdpm://guides",
      "fdpm://Guide",
      "https://guide",
      "fdpm://profiles",
      "fdpm://schema/profile",
      "fdpm://workbook/p/render/text/markdown",
    ]) {
      expect(parseGuideUri(bad), bad).toBeNull();
    }
    expect(profileResourceProvider.match(GUIDE_URI)).toBeNull();
    expect(renderResourceProvider.match(GUIDE_URI)).toBeNull();
    expect(schemaResourceProvider.match(GUIDE_URI)).toBeNull();
  });
});

describe("guideResourceProvider", () => {
  it("advertises one template and one concrete resource, text/markdown", async () => {
    const host = await freshHost();
    const templates = guideResourceProvider.templates(host);
    expect(templates).toHaveLength(1);
    expect(templates[0]!.uriTemplate).toBe(GUIDE_URI);
    expect(templates[0]!.mimeType).toBe(GUIDE_MIME);
    expect(GUIDE_MIME).toBe("text/markdown");
    const entries = guideResourceProvider.enumerate(host);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ uri: GUIDE_URI, mimeType: GUIDE_MIME });
    expect(entries[0]!.size).toBe(Buffer.byteLength(SERVER_INSTRUCTIONS, "utf8"));
  });

  it("is registered: resources/list and templates/list include it", async () => {
    const host = await freshHost();
    expect(listResources(host).map((r) => r.uri)).toContain(GUIDE_URI);
    expect(listTemplates(host).map((t) => t.uriTemplate)).toContain(GUIDE_URI);
  });

  it("read returns the SERVER_INSTRUCTIONS text byte-for-byte", async () => {
    const host = await freshHost();
    const result = await dispatchRead(host, GUIDE_URI);
    expect(result.uri).toBe(GUIDE_URI);
    expect(result.mimeType).toBe(GUIDE_MIME);
    expect(result.blob).toBeUndefined();
    expect(result.text).toBe(SERVER_INSTRUCTIONS);
  });
});
