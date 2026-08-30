export interface EnvVarSpec {
  name: string;
  defaultValue: string;
  exampleValue: string;
  summary: string;
}

export const FDPM_ENV_VARS: readonly EnvVarSpec[] = [
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
    defaultValue: "26000",
    exampleValue: "26000",
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
