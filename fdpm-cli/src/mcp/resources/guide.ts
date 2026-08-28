/**
 * `fdpm://guide` — the server instructions as a resource.
 *
 * MCP clients MAY ignore `initialize.instructions`. Serving the same
 * text as a resource makes the orientation layer reachable on demand
 * by any client — and by a human through `resources/read` — and pins
 * the invariant that the two surfaces are byte-identical
 * (`tests/mcp/resources-guide.test.ts`).
 *
 * Exact-match URI; no fragments, no variants. Pure: no Host state is
 * consulted.
 */
import type { Host } from "../../core/host.js";
import { SERVER_INSTRUCTIONS, instructionsBytes } from "../instructions.js";
import type {
  ResourceEntry,
  ResourceProvider,
  ResourceReadResult,
  ResourceTemplateEntry,
} from "./types.js";

export const GUIDE_URI = "fdpm://guide";
export const GUIDE_MIME = "text/markdown";

export type GuideUriMatch = { kind: "guide" };

export function parseGuideUri(uri: string): GuideUriMatch | null {
  return uri === GUIDE_URI ? { kind: "guide" } : null;
}

export const guideResourceProvider: ResourceProvider<GuideUriMatch> = {
  id: "fdpm.guide",

  templates(_host: Host): readonly ResourceTemplateEntry[] {
    return [
      {
        uriTemplate: GUIDE_URI,
        name: "Server guide",
        description:
          "How to drive this server: call order, the Tier-2 response contract and recovery loop, resource URIs, error reasons. Identical to the `instructions` sent on initialize.",
        mimeType: GUIDE_MIME,
      },
    ];
  },

  enumerate(_host: Host): readonly ResourceEntry[] {
    return [
      {
        uri: GUIDE_URI,
        name: "Server guide",
        description: "Orientation text for agents (same bytes as initialize.instructions).",
        mimeType: GUIDE_MIME,
        size: instructionsBytes(),
      },
    ];
  },

  match(uri: string): GuideUriMatch | null {
    return parseGuideUri(uri);
  },

  async read(_host: Host, _matched: GuideUriMatch): Promise<ResourceReadResult> {
    return { uri: GUIDE_URI, mimeType: GUIDE_MIME, text: SERVER_INSTRUCTIONS };
  },
};
