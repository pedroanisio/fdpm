/**
 * `fdpm://profile/{profile_id}` and `fdpm://profiles` — profile resources.
 *
 * Resources are the right surface for *browsing* and *chunked
 * reading* of profile data; tools (`fdpm.profile.get`, `fdpm.profile
 * .type_info`) remain the right surface for *answering specific
 * questions* with structured arguments. The two surfaces deliberately
 * overlap: a client UI can list profiles via `resources/list` and
 * read them via `resources/read`, while an agent in a task flow uses
 * the tool calls. Either path is supported; neither is the only one.
 *
 * URI shapes (RFC 6570 Level 1):
 *
 *   - `fdpm://profile/{profile_id}`            — raw registered profile
 *   - `fdpm://profile/{profile_id}#summary`    — summary view (id, version, counts)
 *   - `fdpm://profile/{profile_id}#types`      — types view (vocabulary only)
 *   - `fdpm://profile/{profile_id}#resolved`   — extends-chain-flattened
 *   - `fdpm://profiles`                        — the registered-profile index
 *
 * The fragment-keyed alternates (`#summary`, `#types`, `#resolved`)
 * mirror how `render.ts` uses `#<renderer_id>` to disambiguate
 * multiple renderers on the same target. They are NOT enumerated by
 * `resources/list` to keep the listing tractable — clients ask for
 * the alternates by URI when they need them, or use the tool with a
 * `view` argument.
 *
 * MIME type: every read returns `application/json` with the JSON body
 * landing in `text` (per the `text/*` heuristic, the registry treats
 * `application/json` as text and decodes UTF-8 bytes; we shortcut
 * that by serialising directly to a string here).
 */
import type { Host } from "../../core/host.js";
import { FDPMException } from "../../core/errors/fdpm-exception.js";
import { applyProfileView, type ProfileViewName } from "../profile-views.js";
import type {
  ResourceEntry,
  ResourceProvider,
  ResourceReadResult,
  ResourceTemplateEntry,
} from "./types.js";

const URI_SCHEME = "fdpm://";
const PROFILE_PREFIX = "profile/";
const PROFILES_INDEX_URI = "fdpm://profiles";
const MIME = "application/json";

/**
 * Fragment-keyed alternates. `resolved` is not a `view` (the view
 * names cover projection of the raw profile); resolved triggers an
 * extends-chain merge in the host's `ProfileRegistry.getResolved`.
 */
const FRAGMENT_RESOLVED = "resolved";
const FRAGMENT_VIEWS: ReadonlySet<string> = new Set(["summary", "types"]);

export type ProfileUriMatchKind =
  | { kind: "index" }
  | { kind: "profile"; profileId: string; view?: ProfileViewName; resolved?: boolean };

/**
 * Parse a profile URI. Returns `null` if the URI doesn't match the
 * profile or profiles-index shapes; the caller (the registry) treats
 * `null` as "not my URI" and tries the next provider.
 *
 * `fdpm://profile/<id>`              → { kind: "profile", profileId: <id> }
 * `fdpm://profile/<id>#summary`      → { kind: "profile", profileId: <id>, view: "summary" }
 * `fdpm://profile/<id>#types`        → { kind: "profile", profileId: <id>, view: "types" }
 * `fdpm://profile/<id>#resolved`     → { kind: "profile", profileId: <id>, resolved: true }
 * `fdpm://profiles`                  → { kind: "index" }
 *
 * Unknown fragments return `null` (treat as "no provider matches"),
 * not "match with default view". Silently downgrading would mask
 * client bugs.
 */
export function parseProfileUri(uri: string): ProfileUriMatchKind | null {
  if (uri === PROFILES_INDEX_URI) return { kind: "index" };
  if (!uri.startsWith(URI_SCHEME)) return null;
  const rest = uri.slice(URI_SCHEME.length);
  if (!rest.startsWith(PROFILE_PREFIX)) return null;
  const tail = rest.slice(PROFILE_PREFIX.length);
  if (tail.length === 0) return null;
  const hashIdx = tail.indexOf("#");
  if (hashIdx === -1) return { kind: "profile", profileId: tail };
  const profileId = tail.slice(0, hashIdx);
  const fragment = tail.slice(hashIdx + 1);
  if (profileId.length === 0) return null;
  if (fragment === FRAGMENT_RESOLVED) {
    return { kind: "profile", profileId, resolved: true };
  }
  if (FRAGMENT_VIEWS.has(fragment)) {
    return { kind: "profile", profileId, view: fragment as ProfileViewName };
  }
  return null;
}

/**
 * Build a profile URI. `fragment` is optional and must be one of
 * the accepted alternates (`summary`, `types`, `resolved`) when set.
 * Caller-discipline: the function does not validate the fragment
 * here — it is a builder, not a validator. Use `parseProfileUri`
 * round-trip if you need to verify.
 */
export function buildProfileUri(profileId: string, fragment: string = ""): string {
  const base = `${URI_SCHEME}${PROFILE_PREFIX}${profileId}`;
  return fragment.length > 0 ? `${base}#${fragment}` : base;
}

export function profilesIndexUri(): string {
  return PROFILES_INDEX_URI;
}

export const profileResourceProvider: ResourceProvider<ProfileUriMatchKind> = {
  id: "fdpm.profile",

  templates(_host: Host): readonly ResourceTemplateEntry[] {
    // The MCP `ResourceTemplate` shape is RFC 6570 Level 1 (simple
    // variable expansion). We cannot model the optional fragment in
    // a single template; advertise the canonical raw-profile shape
    // and document the alternates in the description. Clients that
    // want a specific view can call the tool with `view: "..."`.
    return [
      {
        uriTemplate: `${URI_SCHEME}${PROFILE_PREFIX}{profile_id}`,
        name: "Domain profile",
        description:
          "A registered DomainProfile by id, returned as application/json. Append `#summary`, `#types`, or `#resolved` to the URI for projected/merged views (the raw profile is the default). For programmatic use, prefer the `fdpm.profile.get` tool with the `view` argument.",
        mimeType: MIME,
      },
      {
        uriTemplate: PROFILES_INDEX_URI,
        name: "Profile index",
        description:
          "Index of every registered DomainProfile (id, version, label/name, primitive/relation type counts). Equivalent to calling `fdpm.profile.list` and a per-profile `fdpm.profile.get` with `view: \"summary\"` rolled into one read.",
        mimeType: MIME,
      },
    ];
  },

  enumerate(host: Host): readonly ResourceEntry[] {
    // List every registered profile as a concrete resource (raw
    // shape only — fragment-keyed alternates are addressable but
    // not enumerated, by the same design as render.ts not
    // enumerating every renderer's fragment combination).
    const out: ResourceEntry[] = [];
    out.push({
      uri: PROFILES_INDEX_URI,
      name: "All profiles (index)",
      description: "Index of every registered DomainProfile",
      mimeType: MIME,
    });
    for (const profile of host.profiles.listRaw()) {
      const labelText =
        profile.label !== undefined && profile.label !== ""
          ? profile.label
          : profile.name !== undefined && profile.name !== ""
            ? profile.name
            : profile.id;
      out.push({
        uri: buildProfileUri(profile.id),
        name: `Profile: ${labelText}`,
        description: `${profile.id} v${profile.version} — ${profile.primitive_types.length} primitive type(s), ${profile.relation_types.length} relation type(s)`,
        mimeType: MIME,
      });
    }
    return out;
  },

  match(uri: string): ProfileUriMatchKind | null {
    return parseProfileUri(uri);
  },

  async read(host: Host, matched: ProfileUriMatchKind): Promise<ResourceReadResult> {
    if (matched.kind === "index") {
      const index = {
        profiles: host.profiles.listRaw().map((p) => ({
          id: p.id,
          version: p.version,
          ...(p.label !== undefined ? { label: p.label } : {}),
          ...(p.name !== undefined ? { name: p.name } : {}),
          primitive_type_count: p.primitive_types.length,
          relation_type_count: p.relation_types.length,
          validation_rule_count: p.validation_rules.length,
        })),
      };
      return {
        uri: PROFILES_INDEX_URI,
        mimeType: MIME,
        text: JSON.stringify(index, null, 2),
      };
    }

    // matched.kind === "profile"
    const profileId = matched.profileId;
    // ProfileRegistry.getRaw / getResolved throw not_found via
    // FDPMException — let it propagate. We do not pre-check with
    // .has() because that would race the throw and double the
    // lookup; the throw IS the check.
    const profile = matched.resolved === true
      ? host.profiles.getResolved(profileId)
      : host.profiles.getRaw(profileId);
    const projected = applyProfileView(
      profile as unknown as Record<string, unknown>,
      matched.view,
    );

    const fragment = matched.resolved === true
      ? FRAGMENT_RESOLVED
      : matched.view !== undefined
        ? matched.view
        : "";
    const uri = buildProfileUri(profileId, fragment);
    return {
      uri,
      mimeType: MIME,
      text: JSON.stringify(projected.value, null, 2),
    };
  },
};

// Re-export so test code and any future caller can verify the FDPMException
// surface this provider raises (currently only via the registry's getRaw/
// getResolved). Kept here as a marker that the provider does NOT swallow
// the not_found envelope; consumers can match { category: "not_found" }.
export { FDPMException };
