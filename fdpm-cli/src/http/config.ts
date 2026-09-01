/**
 * Deployment configuration resolvers for the remote transport.
 *
 * Both defaults here are deliberately the safe end of a trade-off, with
 * an explicit opt-out, because the unsafe end is the one nobody revisits.
 *
 *   - The advertised scope set defaults to read only. A connector that
 *     needs to write learns which scope from the 401 challenge rather
 *     than being handed the whole catalogue at discovery time
 *     (`kc:invariant:scope-minimization`).
 *   - The bind address defaults to loopback. A container opts in to
 *     0.0.0.0 explicitly — the Dockerfile does
 *     (`kc:invariant:origin-validation`).
 */

import { FDPMException } from "../core/errors/fdpm-exception.js";
import { ALL_SCOPES, SCOPE_READ } from "./principal.js";

export const ADVERTISED_SCOPES_ENV = "FDPM_MCP_ADVERTISED_SCOPES";
export const BIND_HOST_ENV = "FDPM_MCP_HTTP_HOST";

/** Loopback, so a local server is not reachable from the network by accident. */
export const DEFAULT_BIND_HOST = "127.0.0.1";

/**
 * Scopes published in protected resource metadata. Not the same thing as
 * the scopes this server *enforces*: every tier is always gated, whatever
 * is advertised here. This is only what a client is told to ask for first.
 */
export function resolveAdvertisedScopes(env: NodeJS.ProcessEnv): string[] {
  const raw = env[ADVERTISED_SCOPES_ENV];
  if (raw === undefined || raw.trim() === "") return [SCOPE_READ];

  const requested = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const unknown = requested.filter((s) => !(ALL_SCOPES as readonly string[]).includes(s));
  if (unknown.length > 0) {
    // Advertising a scope no token will ever carry produces a connector
    // that authenticates and then fails every call with an
    // insufficient_scope the operator cannot satisfy.
    throw new FDPMException(
      "verification",
      `${ADVERTISED_SCOPES_ENV} names ${unknown.length} scope(s) this server does not define: ${unknown.join(", ")}`,
      { evidence: { reason: "unknown_scope", unknown, known: [...ALL_SCOPES] } },
    );
  }

  if (!requested.includes(SCOPE_READ)) {
    throw new FDPMException(
      "verification",
      `${ADVERTISED_SCOPES_ENV} must include ${SCOPE_READ}; without it a client can authenticate and do nothing`,
      { evidence: { reason: "missing_read_scope", requested } },
    );
  }

  return requested;
}

export function resolveBindHost(env: NodeJS.ProcessEnv): string {
  const raw = env[BIND_HOST_ENV];
  if (raw === undefined || raw.trim() === "") return DEFAULT_BIND_HOST;
  return raw.trim();
}

export const REQUIRED_PLUGINS_ENV = "FDPM_MCP_REQUIRED_PLUGINS";

/**
 * Plugin ids the operator declares this deployment cannot run without.
 *
 * Empty by default: a gateway that ships only the plugins baked into its
 * image needs nothing here, and no existing deployment changes behaviour.
 * It earns its keep for plugins installed from OUTSIDE the image — the
 * per-plugin init-container images the doks-tor1 overlay copies into
 * FDPM_PLUGIN_PATH — because those depend on two strings in two
 * repositories agreeing: the plugin's `trust.signed_by` and this pod's
 * FDPM_TRUSTED_KEYS.
 */
export function resolveRequiredPlugins(env: NodeJS.ProcessEnv): string[] {
  return (env[REQUIRED_PLUGINS_ENV] ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

/** The slice of a plugin record this check needs. */
export interface PluginActivationView {
  readonly id: string;
  readonly state: string;
  readonly trust?: string;
}

/**
 * Refuse to serve when a declared-required plugin is not active.
 *
 * Boot-time refusal rather than a readiness flap, for the same reason
 * FDPM_MCP_ALLOWED_HOSTS refuses to start: a mismatched trust key or a
 * missing plugin image never self-heals, so a pod that stays NotReady
 * forever is just a slower way to say "misconfigured" — and a pod that
 * answers /readyz while missing a capability is the failure this exists
 * to prevent.
 *
 * The distinction between "discovered but disabled" and "absent" is kept,
 * because they have different fixes: the first is almost always
 * FDPM_TRUSTED_KEYS not matching the manifest's `trust.signed_by`; the
 * second is an init container that did not run or copied to the wrong path.
 */
export function assertRequiredPluginsActive(
  required: readonly string[],
  discovered: readonly PluginActivationView[],
): void {
  if (required.length === 0) return;
  const byId = new Map(discovered.map((p) => [p.id, p]));
  const missing = required
    .map((id) => {
      const found = byId.get(id);
      if (found === undefined) return { plugin_id: id, reason: "not_discovered" as const };
      if (found.state !== "active") {
        return {
          plugin_id: id,
          reason: "not_active" as const,
          state: found.state,
          ...(found.trust === undefined ? {} : { trust: found.trust }),
        };
      }
      return null;
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  if (missing.length === 0) return;

  const detail = missing
    .map((m) =>
      m.reason === "not_discovered"
        ? `${m.plugin_id} (not discovered on FDPM_PLUGIN_PATH)`
        : `${m.plugin_id} (discovered, state=${m.state}${
            "trust" in m ? `, trust=${m.trust}` : ""
          } — check FDPM_TRUSTED_KEYS against its manifest trust.signed_by)`,
    )
    .join("; ");

  throw new FDPMException(
    "verification",
    `${REQUIRED_PLUGINS_ENV} names ${missing.length} plugin(s) that are not active: ${detail}`,
    { evidence: { reason: "required_plugin_inactive", missing } },
  );
}
