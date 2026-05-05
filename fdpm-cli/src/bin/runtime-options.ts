import { FDPMException } from "../core/errors/fdpm-exception.js";

export const LOG_LEVELS = ["debug", "info", "warn", "error", "silent"] as const;
export type LogLevelName = (typeof LOG_LEVELS)[number];

export interface OneShotCliRuntimeOptions {
  persist: boolean;
  dataDir?: string;
  logLevelOverride?: LogLevelName;
}

function valueAfter(argv: readonly string[], flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  return idx >= 0 ? argv[idx + 1] : undefined;
}

function isLogLevelName(value: string): value is LogLevelName {
  return (LOG_LEVELS as readonly string[]).includes(value);
}

export function resolveOneShotCliRuntimeOptions(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): OneShotCliRuntimeOptions {
  const persist = !argv.includes("--no-persist");
  const dataDir = valueAfter(argv, "--data-dir");
  const explicitLogLevel = valueAfter(argv, "--log-level");
  const quiet = argv.includes("--quiet");
  const verbose = argv.includes("--verbose");

  if (quiet && verbose) {
    throw new FDPMException("verification", "--quiet conflicts with --verbose");
  }
  if (explicitLogLevel !== undefined && quiet) {
    throw new FDPMException("verification", "--log-level conflicts with --quiet");
  }
  if (explicitLogLevel !== undefined && verbose) {
    throw new FDPMException("verification", "--log-level conflicts with --verbose");
  }
  if (explicitLogLevel !== undefined && !isLogLevelName(explicitLogLevel)) {
    throw new FDPMException(
      "verification",
      `invalid --log-level: ${explicitLogLevel} (expected ${LOG_LEVELS.join(" | ")})`,
    );
  }

  let logLevelOverride: LogLevelName | undefined;
  if (explicitLogLevel !== undefined) logLevelOverride = explicitLogLevel;
  else if (quiet) logLevelOverride = "silent";
  else if (verbose) logLevelOverride = "info";
  else if (env["FDPM_LOG_LEVEL"] === undefined) logLevelOverride = "warn";

  return {
    persist,
    ...(dataDir !== undefined && { dataDir }),
    ...(logLevelOverride !== undefined && { logLevelOverride }),
  };
}
