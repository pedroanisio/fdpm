/**
 * `.env` loading for the CLI and the MCP server.
 *
 * The host reads configuration from `process.env`, and a long-running process
 * receives that once, at spawn. Without this module the only way to put
 * `FDPM_PLUGIN_PATH` in front of an MCP server was to wrap its command in a
 * shell that sourced a file — configuration living in the client's launcher
 * instead of beside the workbooks it configures, and invisible to `fdpm`
 * itself.
 *
 * Three rules make reading a file safe, and each is enforced below rather than
 * documented and hoped for:
 *
 *   1. **The environment wins.** A variable already set — the MCP client's
 *      `env` block, an exported shell variable — is a deliberate act by the
 *      operator; a file on disk does not get to undo one. This is also the
 *      standard dotenv contract, so it holds no surprises.
 *   2. **Only documented names are applied.** The registry in `./env.ts` is
 *      the contract (`tests/env-contract.test.ts` keeps it exhaustive), so a
 *      prefixed name outside it is a typo, and a typo that silently does
 *      nothing is worse than one that is reported. Names outside the `FDPM_`
 *      namespace are ignored entirely: a shared `.env` is a plausible home for unrelated
 *      secrets, and reading one must not import them into this process.
 *   3. **An explicitly named file must exist.** `FDPM_ENV_FILE` is an
 *      instruction, not a hint. Ignoring a missing one turns a typo in the
 *      launcher into a host running with none of the configuration it was
 *      handed.
 *
 * Parsing is `util.parseEnv`, Node's own dotenv parser (quotes, comments,
 * `export` prefixes). Using it keeps the project off a dependency whose whole
 * value would be the same 40 lines of quote handling.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseEnv } from "node:util";
import { FDPMException } from "../errors/fdpm-exception.js";
import { FDPM_ENV_VAR_NAMES } from "./env.js";

/** Where the loader looks, in order, when `FDPM_ENV_FILE` is not set. */
export const DOTENV_FILENAME = ".env";
/** Per-user fallback: an MCP server is spawned with a cwd nobody chose. */
export const DOTENV_HOME_SUBPATH = [".fdpm", ".env"] as const;

/** What one load did, in enough detail to log or assert on. */
export interface DotenvLoadResult {
  /** Files read, lowest precedence first. Empty when no candidate existed. */
  sources: string[];
  /** Documented names taken from the file and applied to the environment. */
  applied: string[];
  /** Names in the file that the environment already defined, so were kept. */
  preserved: string[];
  /** `FDPM_*` names in the file that the runtime does not document. */
  unknown: string[];
}

export interface DotenvLoadOptions {
  /** Environment to read and mutate. Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Directory holding the project-local `.env`. Defaults to `process.cwd()`. */
  cwd?: string;
  /** Home directory for the per-user fallback. Defaults to `os.homedir()`. */
  home?: string;
}

/**
 * Resolve which files to read, lowest precedence first.
 *
 * The per-user file and a working-directory file LAYER rather than compete.
 * First-file-wins was the obvious rule and the wrong one: `~/.env` is a
 * plausible home for unrelated secrets and typically carries no FDPM names at
 * all, so starting a server from that directory selected it, applied nothing,
 * and the configured plugins silently disappeared. Layering means the per-user
 * file is always in force and a project file overrides the individual keys it
 * names — the same shape as git's system/global/local config.
 *
 * `FDPM_ENV_FILE` is the exception: an explicit instruction replaces the
 * search rather than joining it, so an operator naming one file gets exactly
 * that file.
 *
 * @returns Paths to load in application order; empty when none exist.
 * @throws {@link FDPMException} `not_found` when `FDPM_ENV_FILE` names an
 * absent file.
 */
function selectSources(
  env: NodeJS.ProcessEnv,
  cwd: string,
  home: string,
): string[] {
  const explicit = env["FDPM_ENV_FILE"];
  if (explicit) {
    const path = resolve(cwd, explicit);
    if (!existsSync(path)) {
      throw new FDPMException(
        "not_found",
        `FDPM_ENV_FILE points at a file that does not exist: ${path}`,
        {
          evidence: { path, variable: "FDPM_ENV_FILE" },
        },
      );
    }
    return [path];
  }
  const layered = [
    join(home, ...DOTENV_HOME_SUBPATH),
    join(cwd, DOTENV_FILENAME),
  ].filter((candidate) => existsSync(candidate));
  // A cwd of `$HOME/.fdpm` would otherwise read the same file twice.
  return [...new Set(layered)];
}

/**
 * Load FDPM configuration from a `.env` file into an environment.
 *
 * Call this before anything reads `process.env` — in practice, at the top of
 * `bin/fdpm.ts` and `bin/fdpm-mcp.ts`, before the Host is constructed.
 *
 * @param options - Injection points for tests; production passes nothing.
 * @returns What was applied, kept and rejected.
 * @throws {@link FDPMException} `not_found` when `FDPM_ENV_FILE` is set to a
 * missing path, or `verification` when the chosen file does not parse.
 */
export function loadDotenv(options: DotenvLoadOptions = {}): DotenvLoadResult {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const home = options.home ?? homedir();

  const sources = selectSources(env, cwd, home);
  const result: DotenvLoadResult = {
    sources,
    applied: [],
    preserved: [],
    unknown: [],
  };

  // Merge the layers first, so a later file overriding an earlier one is a
  // plain overwrite here rather than a second write into `env` -- which would
  // otherwise be blocked by the "environment wins" rule below.
  const merged = new Map<string, string>();
  for (const source of sources) {
    const text = readFileSync(source, "utf8");
    let parsed: NodeJS.Dict<string>;
    try {
      parsed = parseEnv(text);
    } catch (err) {
      throw new FDPMException(
        "verification",
        `could not parse ${source} as a .env file`,
        { evidence: { path: source }, cause: err },
      );
    }

    // `util.parseEnv` never throws on garbage -- it returns whatever it could
    // make of the text, which for a file that is not key=value at all is an
    // empty object. A file that exists, is non-empty, and yields no
    // assignments was meant to configure something and did not.
    if (Object.keys(parsed).length === 0 && text.trim() !== "") {
      throw new FDPMException(
        "verification",
        `could not parse ${source} as a .env file`,
        { evidence: { path: source } },
      );
    }

    for (const [name, value] of Object.entries(parsed)) {
      if (value !== undefined) merged.set(name, value);
    }
  }

  const documented = new Set<string>(FDPM_ENV_VAR_NAMES);
  for (const [name, value] of merged) {
    if (!name.startsWith("FDPM_")) continue;
    if (!documented.has(name)) {
      result.unknown.push(name);
      continue;
    }
    if (env[name] !== undefined) {
      result.preserved.push(name);
      continue;
    }
    env[name] = value;
    result.applied.push(name);
  }
  return result;
}

/**
 * One line describing a load, for the MCP server's startup banner and the
 * CLI's verbose output. Empty when nothing was read and nothing was wrong.
 */
export function describeDotenvLoad(result: DotenvLoadResult): string {
  if (result.sources.length === 0) return "";
  const parts = [
    `env_file=${result.sources.join(",")}`,
    `applied=${result.applied.length}`,
  ];
  if (result.preserved.length > 0)
    parts.push(`kept_from_environment=${result.preserved.join(",")}`);
  if (result.unknown.length > 0)
    parts.push(`UNKNOWN=${result.unknown.join(",")}`);
  return parts.join(" ");
}
