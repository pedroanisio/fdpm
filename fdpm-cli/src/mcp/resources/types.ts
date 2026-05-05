/**
 * SPEC-MCP-SERVER resources surface — type definitions.
 *
 * Resources are read-only addressable views of project state, served
 * via the MCP `resources/list` and `resources/read` requests. Each
 * provider declares:
 *
 *   - `templates`  — ResourceTemplate entries advertised on every
 *                    `resources/list` so clients understand the URI
 *                    shape (e.g. `fdpm://project/{project_id}/render/{target}`).
 *
 *   - `enumerate`  — Generates the *concrete* resource entries that
 *                    currently exist (one per project × renderer
 *                    target, etc.). Returns the per-resource metadata
 *                    `resources/list` advertises.
 *
 *   - `match`      — Decides whether this provider handles a given
 *                    URI on `resources/read`. Returns `null` if the
 *                    URI doesn't belong to this provider, or a
 *                    typed parse result the provider's `read` will
 *                    consume.
 *
 *   - `read`       — Returns the actual contents (text or blob) for
 *                    a URI this provider matched. Throws an
 *                    `FDPMException` (typically `not_found` or
 *                    `permission`) on miss / staleness.
 */
import type { Host } from "../../core/host.js";

/**
 * One advertised entry returned to the MCP client by `resources/list`.
 * The MCP `Resource` schema (per @modelcontextprotocol/sdk) requires
 * `uri` and `name`; everything else is optional advisory metadata.
 */
export interface ResourceEntry {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  size?: number;
}

/**
 * URI template returned by `resources/templates/list` (and embedded
 * in `resources/list`'s _meta for clients that don't separately call
 * the templates list). RFC 6570 Level 1 (simple variable expansion)
 * is enough for the v0.1 surface.
 */
export interface ResourceTemplateEntry {
  uriTemplate: string;
  name: string;
  description?: string;
  mimeType?: string;
}

/**
 * One read result. Mirrors the MCP `TextResourceContents` /
 * `BlobResourceContents` union: either `text` is set (for text/* MIME
 * types) or `blob` is a base64-encoded byte string. Never both. The
 * MCP SDK serialises either shape correctly.
 */
export interface ResourceReadResult {
  uri: string;
  mimeType: string;
  text?: string;
  blob?: string; // base64
}

/**
 * Provider contract — one provider per resource family (render,
 * future: transfer, validate, etc.). Providers MUST be pure with
 * respect to their inputs (`enumerate`/`read` may consult the live
 * Host but MUST NOT mutate state — the resources surface is
 * read-only by SPEC).
 */
export interface ResourceProvider<MatchedT = unknown> {
  /** Stable, human-readable provider id. Used in audit logs. */
  readonly id: string;

  /** URI templates this provider advertises. */
  templates(host: Host): readonly ResourceTemplateEntry[];

  /** Concrete resource entries currently servable by this provider. */
  enumerate(host: Host): readonly ResourceEntry[];

  /**
   * Decide whether a given URI belongs to this provider. Returns a
   * typed match object the provider's `read` will consume, or `null`
   * if the URI does not belong here.
   */
  match(uri: string): MatchedT | null;

  /**
   * Return the resource contents for a previously-matched URI. May
   * throw FDPMException (`not_found` for missing, `permission` for
   * staleness, `unsupported_media` for renderer-target mismatch,
   * `verification` for renderer findings if the provider escalates
   * them).
   */
  read(host: Host, matched: MatchedT): Promise<ResourceReadResult>;
}
