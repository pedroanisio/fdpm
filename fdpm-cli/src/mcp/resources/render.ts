/**
 * `fdpm://project/{project_id}/render/{target}` — render resources.
 *
 * Each (project, registered renderer target) pair is a resource. The
 * provider walks `host.listProjects()` × `host.plugins.listRenderers()`
 * to enumerate. `read` invokes `host.plugins.runRenderer` against the
 * project's current state (with a SPEC-REPL §10.2 lenient tail-replay
 * first to pick up any out-of-band writes — render is read-only).
 *
 * URI parser: `fdpm://project/<id>/render/<target>` where `<target>`
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
  projectId: string;
  target: string;
  /** Optional disambiguator when multiple renderers share `target`. */
  rendererId?: string;
}

/**
 * Parse a render URI. Returns `null` if the URI doesn't match the
 * `fdpm://project/<id>/render/<target>[#<renderer_id>]` pattern;
 * throws nothing (validation of {project_id, target, rendererId}
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
  if (!rest.startsWith("project/")) return null;
  const afterProjectKeyword = rest.slice("project/".length);
  const renderIdx = afterProjectKeyword.indexOf(RENDER_SEGMENT);
  if (renderIdx <= 0) return null;
  const projectId = afterProjectKeyword.slice(0, renderIdx);
  const tail = afterProjectKeyword.slice(renderIdx + RENDER_SEGMENT.length);
  if (projectId.length === 0 || tail.length === 0) return null;
  // Fragment split: `text/markdown#spec:SpecMarkdownRenderer`
  // → { target: "text/markdown", rendererId: "spec:SpecMarkdownRenderer" }.
  const hashIdx = tail.indexOf("#");
  if (hashIdx === -1) return { projectId, target: tail };
  const target = tail.slice(0, hashIdx);
  const rendererId = tail.slice(hashIdx + 1);
  if (target.length === 0) return null;
  const out: RenderUriMatch = { projectId, target };
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
  projectId: string,
  target: string,
  rendererId: string = "",
): string {
  const base = `${URI_SCHEME}project/${projectId}${RENDER_SEGMENT}${target}`;
  return rendererId.length > 0 ? `${base}#${rendererId}` : base;
}

export const renderResourceProvider: ResourceProvider<RenderUriMatch> = {
  id: "fdpm.render",

  templates(_host: Host): readonly ResourceTemplateEntry[] {
    return [
      {
        uriTemplate: `${URI_SCHEME}project/{project_id}/render/{target}`,
        name: "Project render",
        description:
          "Render a project through a registered renderer. `target` is the MIME type or symbolic id the renderer was registered under (e.g. `text/markdown`, `text/html`, `application/pdf`). Read-only; the freshness gate runs a SPEC-REPL §10.2 lenient tail-replay before invoking the renderer.",
        mimeType: undefined,
      },
    ];
  },

  enumerate(host: Host): readonly ResourceEntry[] {
    const projects = host.listProjects();
    const renderers = host.plugins.listRenderers();
    // Count renderers per target so we can emit the fragment-
    // disambiguated URI only when needed (single-renderer targets
    // keep the pretty `fdpm://project/{id}/render/{target}` form).
    const targetCounts = new Map<string, number>();
    for (const r of renderers) {
      targetCounts.set(r.target, (targetCounts.get(r.target) ?? 0) + 1);
    }
    const out: ResourceEntry[] = [];
    for (const project of projects) {
      for (const r of renderers) {
        const ambiguous = (targetCounts.get(r.target) ?? 0) > 1;
        out.push({
          uri: ambiguous
            ? buildRenderUri(project.id, r.target, r.rendererId)
            : buildRenderUri(project.id, r.target),
          name: ambiguous
            ? `${project.id} → ${r.target} (${r.rendererId})`
            : `${project.id} → ${r.target}`,
          description: `${r.rendererId} (plugin ${r.pluginId}) rendering of project ${project.id}`,
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
    await host.reloadProjectTail(matched.projectId);

    // Verify the project exists. Host.getProject throws not_found
    // with a structured envelope — let it propagate.
    const slice = host.getProject(matched.projectId);
    const profile = host.profiles.getResolved(slice.project.profile_id);

    // Verify the renderer is registered before invoking. Pass the
    // optional `rendererId` so a fragment-disambiguated URI selects
    // the right one when multiple plugins share a target.
    const renderer = host.plugins.findRenderer(matched.target, matched.rendererId);
    if (renderer === undefined) {
      throw new FDPMException(
        "not_found",
        `renderer not found: ${matched.target}`,
        {
          evidence: {
            project_id: matched.projectId,
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
        projectId: matched.projectId,
        project: slice.project,
        primitives: Object.values(slice.primitives),
        relations: Object.values(slice.relations),
        templates: Object.values(slice.templates),
        profile,
      },
      matched.rendererId !== undefined ? { rendererId: matched.rendererId } : {},
    );

    const uri = buildRenderUri(
      matched.projectId,
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
