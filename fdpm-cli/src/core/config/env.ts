export interface EnvVarSpec {
  name: string;
  defaultValue: string;
  exampleValue: string;
  summary: string;
}

export const FDPM_ENV_VARS: readonly EnvVarSpec[] = [
  {
    name: "FDPM_MCP_EXPECTED_AUDIENCE",
    defaultValue: "the value of FDPM_MCP_PUBLIC_URL",
    exampleValue: "fdpm-mcp",
    summary:
      "fdpm-mcp-http: the `aud` value a bearer token must carry, when the authorization server does not use the resource URL; Keycloak's audience mapper emits the resource CLIENT ID, and privileges granted as Keycloak client roles are then read from resource_access.<audience>.roles as well as from `scope`",
  },
  {
    name: "FDPM_MCP_ADVERTISED_SCOPES",
    defaultValue: "fdpm.read",
    exampleValue: "fdpm.read,fdpm.write",
    summary:
      "fdpm-mcp-http: scopes published in protected resource metadata and in the 401 challenge; defaults to the read scope alone so clients elevate on challenge rather than being handed the whole catalogue (must include fdpm.read)",
  },
  {
    name: "FDPM_MCP_HTTP_PORT",
    defaultValue: "8080",
    exampleValue: "8080",
    summary:
      "fdpm-mcp-http: TCP port the remote MCP server listens on",
  },
  {
    name: "FDPM_MCP_HTTP_HOST",
    defaultValue: "127.0.0.1",
    exampleValue: "0.0.0.0",
    summary:
      "fdpm-mcp-http: bind address; defaults to loopback so a local server is not reachable from the network by accident, and a container opts in to 0.0.0.0 explicitly (the Dockerfile does)",
  },
  {
    name: "FDPM_MCP_PUBLIC_URL",
    defaultValue: "(required)",
    exampleValue: "https://mcp.example.com/mcp",
    summary:
      "fdpm-mcp-http: the exact connector URL clients type, path included; also the RFC 9728 `resource` value and the expected token audience",
  },
  {
    name: "FDPM_MCP_OAUTH_ISSUER",
    defaultValue: "(required)",
    exampleValue: "https://auth.example.com",
    summary:
      "fdpm-mcp-http: authorization server issuer advertised as the first entry of `authorization_servers` in protected resource metadata",
  },
  {
    name: "FDPM_MCP_ALLOWED_HOSTS",
    defaultValue: "(required)",
    exampleValue: "mcp.example.com",
    summary:
      "fdpm-mcp-http: comma-separated Host header allow-list for DNS-rebinding protection; the server refuses to start when empty",
  },
  {
    name: "FDPM_MCP_ALLOWED_ORIGINS",
    defaultValue: "(none)",
    exampleValue: "https://claude.ai,https://chatgpt.com",
    summary:
      "fdpm-mcp-http: comma-separated browser Origin allow-list; a request with no Origin (native clients) is always allowed",
  },
  {
    name: "FDPM_MCP_AUTH_MODE",
    defaultValue: "introspection",
    exampleValue: "introspection",
    summary:
      "fdpm-mcp-http: bearer verification strategy, `introspection` (RFC 7662) or `static` (single shared token)",
  },
  {
    name: "FDPM_MCP_INTROSPECTION_URL",
    defaultValue: "(required when auth mode is introspection)",
    exampleValue: "https://auth.example.com/oauth2/introspect",
    summary:
      "fdpm-mcp-http: RFC 7662 token introspection endpoint",
  },
  {
    name: "FDPM_MCP_CLIENT_ID",
    defaultValue: "(required when auth mode is introspection)",
    exampleValue: "fdpm-resource-server",
    summary:
      "fdpm-mcp-http: client id this resource server authenticates to the introspection endpoint with",
  },
  {
    name: "FDPM_MCP_CLIENT_SECRET",
    defaultValue: "(required when auth mode is introspection)",
    exampleValue: "change-me",
    summary:
      "fdpm-mcp-http: client secret for the introspection endpoint; supply via a secret store, never a literal in a manifest",
  },
  {
    name: "FDPM_MCP_STATIC_TOKEN",
    defaultValue: "(required when auth mode is static)",
    exampleValue: "a-32-character-minimum-shared-secret",
    summary:
      "fdpm-mcp-http: shared bearer token for `static` auth mode; minimum 32 characters and compared in constant time",
  },
  {
    name: "FDPM_MCP_STATIC_SCOPES",
    defaultValue: "fdpm.read,fdpm.write,fdpm.admin",
    exampleValue: "fdpm.read,fdpm.write",
    summary:
      "fdpm-mcp-http: scopes granted to the static token",
  },
  {
    name: "FDPM_MCP_TENANT_CLAIM",
    defaultValue: "tenant",
    exampleValue: "tenant",
    summary:
      "fdpm-mcp-http: name of the verified token claim carrying the tenant id",
  },
  {
    name: "FDPM_MCP_SINGLE_TENANT",
    defaultValue: "(unset — multi-tenant)",
    exampleValue: "default",
    summary:
      "fdpm-mcp-http: pin every principal to one tenant, ignoring the claim; the single-tenant deployment mode",
  },
  {
    name: "FDPM_MCP_MAX_TENANT_HOSTS",
    defaultValue: "32",
    exampleValue: "32",
    summary:
      "fdpm-mcp-http: maximum simultaneously loaded tenant Hosts before LRU eviction",
  },
  {
    name: "FDPM_MCP_HOST_IDLE_SECONDS",
    defaultValue: "900",
    exampleValue: "900",
    summary:
      "fdpm-mcp-http: idle seconds after which an unpinned tenant Host is evicted from the pool",
  },
  {
    name: "FDPM_MCP_SESSION_IDLE_SECONDS",
    defaultValue: "1800",
    exampleValue: "1800",
    summary:
      "fdpm-mcp-http: idle seconds after which an MCP session is closed",
  },
  {
    name: "FDPM_MCP_MAX_SESSIONS",
    defaultValue: "1000",
    exampleValue: "1000",
    summary:
      "fdpm-mcp-http: maximum concurrent MCP sessions before new ones are refused with quota",
  },
  {
    name: "FDPM_MCP_KEEPALIVE_SECONDS",
    defaultValue: "15",
    exampleValue: "15",
    summary:
      "fdpm-mcp-http: SSE keep-alive interval; must be below the ingress idle timeout",
  },
  {
    name: "FDPM_MCP_SWEEP_SECONDS",
    defaultValue: "60",
    exampleValue: "60",
    summary:
      "fdpm-mcp-http: interval between idle sweeps of sessions and pooled Hosts",
  },
  {
    name: "FDPM_ENV_FILE",
    defaultValue: "~/.fdpm/.env then ./.env (layered)",
    exampleValue: "~/.fdpm/.env",
    summary:
      "explicit .env file for the CLI and MCP server, replacing the layered default search; a variable already set in the environment always wins, and only documented FDPM_* names are applied",
  },
  {
    name: "FDPM_DATA_DIR",
    defaultValue: "~/.fdpm-cli",
    exampleValue: "~/.fdpm-cli",
    summary: "persistence directory for profiles and workbook logs",
  },
  {
    name: "FDPM_PLUGIN_PATH",
    defaultValue: "unset",
    exampleValue: "~/.fdpm/plugins",
    summary:
      "extra plugin search paths separated by the OS path-list delimiter (`:` on POSIX, `;` on Windows)",
  },
  {
    name: "FDPM_FSYNC",
    defaultValue: "1",
    exampleValue: "1",
    summary: "0 -> skip the fsync after each operation-log write (faster bulk import, loses the tail on host crash)",
  },
  {
    name: "FDPM_LOG_LEVEL",
    defaultValue: "info",
    exampleValue: "info",
    summary: "plugin logger threshold: debug | info | warn | error | silent",
  },
  {
    name: "FDPM_DEBUG",
    defaultValue: "unset",
    exampleValue: "1",
    summary: "truthy -> also emit plugin debug logs",
  },
  {
    name: "FDPM_VERBOSE",
    defaultValue: "unset",
    exampleValue: "1",
    summary: "truthy -> expand human-mode error output",
  },
  {
    name: "FDPM_JSON_COMPACT",
    defaultValue: "unset",
    exampleValue: "1",
    summary:
      "1 -> emit compact (single-line) JSON; set by `fdpm repl --json` and SPEC-MCP-SERVER",
  },
  {
    name: "FDPM_MAX_REQUEST_BYTES",
    defaultValue: "5242880",
    exampleValue: "5242880",
    summary: "cap on -f / stdin input size in bytes",
  },
  {
    name: "FDPM_MAX_FIELD_PATCH_OPS",
    defaultValue: "100",
    exampleValue: "100",
    summary: "cap on operations per field-patch request",
  },
  {
    name: "FDPM_LOG_PAGE_MAX",
    defaultValue: "10000",
    exampleValue: "10000",
    summary: "max events returned by one log page",
  },
  {
    name: "FDPM_MAX_BATCH_OPS",
    defaultValue: "500",
    exampleValue: "500",
    summary: "cap on operations per edit batch",
  },
  {
    name: "FDPM_AUDIT_DIFF_MAX_BYTES",
    defaultValue: "32768",
    exampleValue: "32768",
    summary: "max bytes of diff evidence in audit projection",
  },
  {
    name: "FDPM_TRUSTED_KEYS",
    defaultValue: '""',
    exampleValue: "maintainer-key-1,maintainer-key-2",
    summary: "comma-separated keys allowed for verified plugin trust",
  },
  {
    name: "FDPM_MAX_RENDER_BYTES",
    defaultValue: "52428800",
    exampleValue: "52428800",
    summary: "cap on renderer output size in bytes",
  },
  {
    name: "FDPM_SNAPSHOT_EVERY_OPS",
    defaultValue: "1000",
    exampleValue: "1000",
    summary: "store snapshot after every N appended operations",
  },
  {
    name: "FDPM_NO_PLUGINS",
    defaultValue: "unset",
    exampleValue: "1",
    summary: "truthy -> fdpm-mcp constructs Host with noPlugins=true",
  },
  {
    name: "FDPM_MCP_ENABLE_DESTRUCTIVE",
    defaultValue: "unset",
    exampleValue: "1",
    summary: "fdpm-mcp: truthy -> expose Tier-3 destructive tools (off by default)",
  },
  {
    name: "FDPM_MCP_ENABLE_PLUGINS",
    defaultValue: '""',
    exampleValue: "plugin-id-1,plugin-id-2",
    summary: "fdpm-mcp: comma-separated plugin ids whose MCP tools are exposed",
  },
  {
    name: "FDPM_MCP_MAX_CALLS_PER_MINUTE",
    defaultValue: "120",
    exampleValue: "120",
    summary: "fdpm-mcp: per-session rate limit on tool calls",
  },
  {
    name: "FDPM_MCP_MAX_RESOURCE_BYTES",
    defaultValue: "1048576",
    exampleValue: "1048576",
    summary:
      "fdpm-mcp: cap on the bytes one resources/read may serve; over-cap reads are refused with a `quota` envelope",
  },
  {
    name: "FDPM_MCP_MAX_RESULT_BYTES",
    defaultValue: "32768",
    exampleValue: "32768",
    summary:
      "fdpm-mcp: cap on the bytes one read-only tools/call result may serve; over-cap results are refused with a `quota` envelope naming the tool's narrowing arguments",
  },
  {
    name: "FDPM_MCP_AUDIT_FULL_ARGS",
    defaultValue: "unset",
    exampleValue: "1",
    summary: "fdpm-mcp: truthy -> log full args (default: sha256 hash only)",
  },
  {
    name: "FDPM_MCP_REQUIRE_CONFIRMATION_TOKEN",
    defaultValue: "unset",
    exampleValue: "1",
    summary:
      "SPEC-MCP-SERVER §9.3: exactly `1` gates Tier 2/3 calls behind an `_confirmation_token` argument; requires FDPM_MCP_CONFIRMATION_TOKEN",
  },
  {
    name: "FDPM_MCP_CONFIRMATION_TOKEN",
    defaultValue: "unset",
    exampleValue: "change-me",
    summary:
      "fdpm-mcp: the token Tier 2/3 calls must present when the gate above is on; startup refuses if the gate is on and this is empty",
  },
  {
    name: "FDPM_MCP_CATALOG_BUDGET_BYTES",
    // Must equal DEFAULT_CATALOG_BUDGET.total_bytes in src/mcp/catalog.ts.
    // These drifted (registry 28000 vs code 26000) until 2026-08-29; the
    // env-contract test now asserts they agree.
    defaultValue: "27000",
    exampleValue: "27000",
    summary:
      "fdpm-mcp: cap on the UTF-8 byte size of the advertised tools/list catalog; boot refuses when exceeded (SPEC-MCP-SERVER §8.5)",
  },
  {
    name: "FDPM_WORKSPACE",
    defaultValue: "unset",
    exampleValue: "prod-laptop",
    summary:
      "SPEC-WORKSPACE §8.3: workspace id or name to resolve via the registry; ignored when FDPM_DATA_DIR is set",
  },
  {
    name: "FDPM_REGISTRY_PATH",
    defaultValue: "platform state directory",
    exampleValue: "./.fdpm-state/workspaces.json",
    summary:
      "SPEC-WORKSPACE §12: override the native operator-local registry path (XDG state on Linux, Application Support on macOS, LocalAppData on Windows)",
  },
] as const;

export const FDPM_ENV_VAR_NAMES = FDPM_ENV_VARS.map((spec) => spec.name);

export function renderEnvVarHelpLines(): string[] {
  const labelWidth = Math.max(...FDPM_ENV_VARS.map((spec) => spec.name.length)) + 2;
  return FDPM_ENV_VARS.map(
    (spec) =>
      `  ${spec.name.padEnd(labelWidth)}${spec.summary} (default: ${spec.defaultValue})`,
  );
}
