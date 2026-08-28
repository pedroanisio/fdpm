/**
 * `fdpm://schema/{schema_id}` — schema resources.
 *
 * Serves the JSON Schema an agent needs to compose a payload WITHOUT
 * that schema riding in every `tools/list` response. The first (and
 * for now only) member is `fdpm://schema/profile`, the DomainProfile
 * shape consumed by `fdpm.profile.register`. Before this provider
 * existed the tool inlined an 8.8 KB schema into the catalog
 * (SPEC-MCP-SERVER §8.5 catalog budget); now the tool advertises an
 * opaque `profile` object, validates server-side with the same Zod
 * schema, and points the agent here for the shape.
 *
 * The body is derived from the Zod source of truth at read time
 * (`toJsonSchema(DomainProfile)`, §11.1). Resource and validator
 * cannot drift because they are the same object.
 *
 * URI shape (RFC 6570 Level 1): `fdpm://schema/{schema_id}` with
 * `schema_id ∈ { profile }`. Unknown ids and any fragment return
 * `null` from `match` so the registry raises `not_found` with the
 * supported templates in evidence — no silent fallback.
 *
 * MIME type: `application/schema+json` (RFC 8259 §11 registration for
 * JSON Schema documents). The registry treats `application/*json` as
 * text; the body is serialised to `text`.
 */
import type { Host } from "../../core/host.js";
import { DomainProfile } from "../../core/models/meta.js";
import { toJsonSchema } from "../schemas.js";
import type {
  ResourceEntry,
  ResourceProvider,
  ResourceReadResult,
  ResourceTemplateEntry,
} from "./types.js";

export const SCHEMA_MIME = "application/schema+json";
export const PROFILE_SCHEMA_URI = "fdpm://schema/profile";
const SCHEMA_URI_TEMPLATE = "fdpm://schema/{schema_id}";

export type SchemaUriMatch = { kind: "profile" };

/**
 * Exact-match parser. There is one schema today; when more land,
 * extend the switch — do not loosen to a prefix match, because a
 * prefix match would turn typos into `null`-less surprises.
 */
export function parseSchemaUri(uri: string): SchemaUriMatch | null {
  if (uri === PROFILE_SCHEMA_URI) return { kind: "profile" };
  return null;
}

export const schemaResourceProvider: ResourceProvider<SchemaUriMatch> = {
  id: "fdpm.schema",

  templates(_host: Host): readonly ResourceTemplateEntry[] {
    return [
      {
        uriTemplate: SCHEMA_URI_TEMPLATE,
        name: "JSON Schema",
        description:
          "JSON Schema (draft-7) for a payload shape the tools accept. `schema_id` is `profile` for the DomainProfile shape consumed by `fdpm.profile.register` — read it BEFORE composing a profile; the same schema is enforced server-side.",
        mimeType: SCHEMA_MIME,
      },
    ];
  },

  enumerate(_host: Host): readonly ResourceEntry[] {
    return [
      {
        uri: PROFILE_SCHEMA_URI,
        name: "DomainProfile JSON Schema",
        description:
          "Input shape for fdpm.profile.register (draft-7). Derived from the server's own validator.",
        mimeType: SCHEMA_MIME,
      },
    ];
  },

  match(uri: string): SchemaUriMatch | null {
    return parseSchemaUri(uri);
  },

  async read(_host: Host, matched: SchemaUriMatch): Promise<ResourceReadResult> {
    // `matched.kind` is exhaustively "profile" today; the switch keeps
    // the next schema id a one-case addition.
    switch (matched.kind) {
      case "profile":
        return {
          uri: PROFILE_SCHEMA_URI,
          mimeType: SCHEMA_MIME,
          text: JSON.stringify(toJsonSchema(DomainProfile), null, 2),
        };
    }
  },
};
