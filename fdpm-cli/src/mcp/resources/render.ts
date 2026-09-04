/**
 * `fdpm://workbook/{workbook_id}/render/{target}` — render resources.
 *
 * Each (workbook, registered renderer target) pair is a resource. The
 * provider walks `host.listProjects()` × `host.plugins.listRenderers()`
 * to enumerate. `read` invokes `host.plugins.runRenderer` against the
 * workbook's current state (with a SPEC-REPL §10.2 lenient tail-replay
 * first to pick up any out-of-band writes — render is read-only).
 *
 * URI parser: `fdpm://workbook/<id>/render/<target>` where `<target>`
 * may itself contain a `/` (most renderer targets are MIME types like
 * `text/markdown`). The split point is the literal `/render/` segment
 * — anything after is treated as one opaque target string. No URL-
 * encoding required, no query-string parsing yet (the
 * disambiguation `?renderer-id=...` is not modelled in v0.1; if two
 * plugins ever advertise the same `(target)` slot, the resource list
 * surfaces both with their `rendererId`s baked into the URI via a
 * different scheme — out of scope here).
 *
 * Output framing: textual MIME types (`text/*`) decode to UTF-8 and
 * land in `text`. Binary MIME types (`application/pdf`, `image/*`,
 * etc.) base64-encode into `blob`. The MCP SDK serialises both.
 */
import type { Host } from "../../core/host.js";
import { FDPMException } from "../../core/errors/fdpm-exception.js";
import type {
  ResourceEntry,
  ResourceProvider,
  ResourceReadResult,
  ResourceTemplateEntry,
} from "./types.js";

const URI_SCHEME = "fdpm://";
const RENDER_SEGMENT = "/render/";

export interface RenderUriMatch {
  workbookId: string;
  target: string;
  /** Optional disambiguator when multiple renderers share `target`. */
  rendererId?: string;
}

/**
 * Parse a render URI. Returns `null` if the URI doesn't match the
 * `fdpm://workbook/<id>/render/<target>[#<renderer_id>]` pattern;
 * throws nothing (validation of {workbook_id, target, rendererId}
 * existence happens in `read`).
 *
 * The optional `#<renderer_id>` fragment disambiguates when more
 * than one registered renderer advertises the same `target` — for
 * example when both `fs:SpecRenderer` and `spec:SpecMarkdownRenderer`
 * register `text/markdown`. URIs without a fragment let the host
 * pick the first match (deterministic by plugin activation order).
 */
export function parseRenderUri(uri: string): RenderUriMatch | null {
  if (!uri.startsWith(URI_SCHEME)) return null;
  const rest = uri.slice(URI_SCHEME.length);
  if (!rest.startsWith("workbook/")) return null;
  const afterProjectKeyword = rest.slice("workbook/".length);
  const renderIdx = afterProjectKeyword.indexOf(RENDER_SEGMENT);
  if (renderIdx <= 0) return null;
  const workbookId = afterProjectKeyword.slice(0, renderIdx);
  const tail = afterProjectKeyword.slice(renderIdx + RENDER_SEGMENT.length);
  if (workbookId.length === 0 || tail.length === 0) return null;
  // Fragment split: `text/markdown#spec:SpecMarkdownRenderer`
  // → { target: "text/markdown", rendererId: "spec:SpecMarkdownRenderer" }.
  const hashIdx = tail.indexOf("#");
  if (hashIdx === -1) return { workbookId, target: tail };
  const target = tail.slice(0, hashIdx);
  const rendererId = tail.slice(hashIdx + 1);
  if (target.length === 0) return null;
  const out: RenderUriMatch = { workbookId, target };
  if (rendererId.length > 0) out.rendererId = rendererId;
  return out;
}

/**
 * Build a render URI. The `rendererId` argument is required at the
 * type level (caller-discipline) but only embedded when needed —
 * caller passes an empty string to skip the fragment, or
 * `buildRenderUriCanonical` uses the registry to pick the right
 * shape automatically.
 */
export function buildRenderUri(
  workbookId: string,
  target: string,
  rendererId: string = "",
): string {
  const base = `${URI_SCHEME}workbook/${workbookId}${RENDER_SEGMENT}${target}`;
  return rendererId.length > 0 ? `${base}#${rendererId}` : base;
}

export const renderResourceProvider: ResourceProvider<RenderUriMatch> = {
  id: "fdpm.render",
  /** Reads the workbook slice and renders it. */
  readsWorkbookState: true,

  templates(_host: Host): readonly ResourceTemplateEntry[] {
    return [
      {
        uriTemplate: `${URI_SCHEME}workbook/{workbook_id}/render/{target}`,
        name: "Workbook render",
        description:
          "Render a workbook through a registered renderer. `target` is the MIME type or symbolic id the renderer was registered under (e.g. `text/markdown`, `text/html`, `application/pdf`). Read-only; the freshness gate runs a SPEC-REPL §10.2 lenient tail-replay before invoking the renderer.",
        mimeType: undefined,
      },
    ];
  },

  enumerate(host: Host): readonly ResourceEntry[] {
    const workbooks = host.listProjects();
    const renderers = host.plugins.listRenderers();
    // Count renderers per target so we can emit the fragment-
    // disambiguated URI only when needed (single-renderer targets
    // keep the pretty `fdpm://workbook/{id}/render/{target}` form).
    const targetCounts = new Map<string, number>();
    for (const r of renderers) {
      targetCounts.set(r.target, (targetCounts.get(r.target) ?? 0) + 1);
    }
    const out: ResourceEntry[] = [];
    for (const workbook of workbooks) {
      for (const r of renderers) {
        const ambiguous = (targetCounts.get(r.target) ?? 0) > 1;
        out.push({
          uri: ambiguous
            ? buildRenderUri(workbook.id, r.target, r.rendererId)
            : buildRenderUri(workbook.id, r.target),
          name: ambiguous
            ? `${workbook.id} → ${r.target} (${r.rendererId})`
            : `${workbook.id} → ${r.target}`,
          description: `${r.rendererId} (plugin ${r.pluginId}) rendering of workbook ${workbook.id}`,
          mimeType: r.target,
          // size omitted: we'd have to render to know it. Cheap to
          // omit; the client knows it'll get the bytes on read.
        });
      }
    }
    return out;
  },

  match(uri: string): RenderUriMatch | null {
    return parseRenderUri(uri);
  },

  async read(host: Host, matched: RenderUriMatch): Promise<ResourceReadResult> {
    // SPEC-REPL §10.2 lenient tail-replay: pick up any out-of-band
    // writes before rendering. Render is read-only so the lenient
    // path is correct (no `staleStateException`); a `host_compat`
    // throw from `reloadProjectTail` (truncated/rewritten log) is
    // surfaced verbatim — it's a real operator error.
    await host.reloadProjectTail(matched.workbookId);

    // Verify the workbook exists. Host.getProject throws not_found
    // with a structured envelope — let it propagate.
    const slice = host.getProject(matched.workbookId);
    const profile = host.resolveProfileForWorkbook(slice.workbook);

    // Verify the renderer is registered before invoking. Pass the
    // optional `rendererId` so a fragment-disambiguated URI selects
    // the right one when multiple plugins share a target, and pass
    // the workbook's profile so profile-declared renderer_bindings
    // win over insertion order when no fragment is given.
    const renderer = host.plugins.findRenderer(matched.target, matched.rendererId, profile);
    if (renderer === undefined) {
      throw new FDPMException(
        "not_found",
        `renderer not found: ${matched.target}`,
        {
          evidence: {
            workbook_id: matched.workbookId,
            target: matched.target,
            ...(matched.rendererId !== undefined && {
              renderer_id: matched.rendererId,
            }),
            available_targets: [
              ...new Set(host.plugins.listRenderers().map((r) => r.target)),
            ].sort(),
          },
        },
      );
    }

    const result = await host.plugins.runRenderer(
      matched.target,
      {
        workbookId: matched.workbookId,
        workbook: slice.workbook,
        primitives: Object.values(slice.primitives),
        relations: Object.values(slice.relations),
        templates: Object.values(slice.templates),
        profile,
      },
      matched.rendererId !== undefined ? { rendererId: matched.rendererId } : {},
    );

    const uri = buildRenderUri(
      matched.workbookId,
      matched.target,
      matched.rendererId ?? "",
    );
    const isText = result.contentType.startsWith("text/");
    if (isText) {
      // The renderer's output is already UTF-8 by §6.5 contract for
      // text/* outputs. Decode and surface as `text`.
      const text = new TextDecoder("utf-8", { fatal: false }).decode(result.bytes);
      return { uri, mimeType: result.contentType, text };
    }
    // Binary outputs: base64-encode for the MCP `blob` field.
    const blob = Buffer.from(result.bytes).toString("base64");
    return { uri, mimeType: result.contentType, blob };
  },
};
