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
    summary: "persistence directory for profiles and project logs",
  },
  {
    name: "FDPM_PLUGIN_PATH",
    defaultValue: "unset",
    exampleValue: "~/.fdpm/plugins",
    summary: "extra plugin search paths (colon-separated)",
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
] as const;

export const FDPM_ENV_VAR_NAMES = FDPM_ENV_VARS.map((spec) => spec.name);

export function renderEnvVarHelpLines(): string[] {
  const labelWidth = Math.max(...FDPM_ENV_VARS.map((spec) => spec.name.length)) + 2;
  return FDPM_ENV_VARS.map(
    (spec) =>
      `  ${spec.name.padEnd(labelWidth)}${spec.summary} (default: ${spec.defaultValue})`,
  );
}
