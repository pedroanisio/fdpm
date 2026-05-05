/**
 * Per-subcommand metadata for the SPEC-REPL §10.2 freshness check.
 *
 * Every command module exports a `commandMetadata: CommandMetadataMap`
 * keyed by full subcommand path (e.g. "project create", "primitive
 * patch", "render"). Two surfaces consume this metadata:
 *
 *   - The REPL pre-dispatch gate looks up by full path, calls
 *     `projectIdsFromArgv` against the post-shell-split tokens, then
 *     stats the resulting project log files. `readOnly` selects strict
 *     refusal vs. incremental tail-replay on detected out-of-band
 *     writes.
 *   - The MCP server dispatcher receives the LLM's JSON args object
 *     (not argv) and uses `projectIdsFromJson` for the same gate.
 *
 * Both adapters MUST return the same set for an equivalent invocation.
 *
 * Why per-subcommand and not per-module: SPEC-REPL §10.2's literal
 * text says "command module's exported `readOnly: boolean`", but most
 * command modules (`project`, `primitive`, `relation`, `dnis`, ...)
 * group read AND write subcommands together. A module-level flag
 * would force `project list` (read-only) to run under the same
 * staleness rules as `project create` (write-capable) — the SEI
 * scenarios the SPEC asserts in §18 (read-only does incremental
 * replay; write-capable refuses) would be unsatisfiable.
 *
 * `projectIdsFromArgv` receives the raw argv tokens for the line
 * about to be dispatched, with the program name already stripped
 * (e.g. for `fdpm project create my-proj`, argv is
 * `["project", "create", "my-proj"]`). This avoids coupling the
 * freshness gate to Commander's internal parser shape.
 *
 * `projectIdsFromJson` receives the parsed JSON args object the
 * LLM (or any non-CLI caller) sent: e.g. for the `project create`
 * tool, an `{project_id: "my-proj", name: "..."}` object. Most
 * adapters are a one-liner `(args) => typeof args.project === "string"
 * ? [args.project] : []`.
 *
 * Sentinel return values:
 *   - `[]` — the command touches no project log (e.g. `health
 *     readiness`, `profile list`). The freshness check is skipped.
 *   - `["*"]` — the command may touch every project (e.g. `plugin
 *     reload`). The freshness check stats every known project log;
 *     used sparingly because it defeats the per-project scoping. The
 *     MCP server may reject `["*"]` with `unsupported_media`.
 */

export type ProjectIdsFromArgv = (argv: readonly string[]) => readonly string[];
export type ProjectIdsFromJson = (args: Record<string, unknown>) => readonly string[];

export interface SubcommandMetadata {
  /**
   * `true` if this subcommand performs no state-mutating Host calls.
   * Read-only subcommands run under SPEC-REPL §10.2 lenient mode by
   * default (incremental tail-replay before dispatch). Write-capable
   * subcommands run under strict mode (refuse with `permission` +
   * `evidence.reason: "stale_state"` on detected out-of-band writes).
   */
  readOnly: boolean;
  projectIdsFromArgv: ProjectIdsFromArgv;
  projectIdsFromJson: ProjectIdsFromJson;
}

/**
 * Map from full subcommand path (space-separated, e.g. "project
 * create") to its metadata. Modules that act as a single command
 * (no subcommands — `validate`, `render`, `diff`, `edit`,
 * `completions`) use the bare module name as the key.
 */
export type CommandMetadataMap = Record<string, SubcommandMetadata>;

// ── Common-pattern helpers (argv side) ─────────────────────────────

/**
 * Most command lines under this CLI have the project_id as the first
 * positional argument after the subcommand keyword(s). Given the
 * subcommand depth (1 for `validate <project>`, 2 for `primitive list
 * <project>`), returns a function that pulls argv[depth] as the
 * single project_id.
 */
export function firstPositionalAfter(depth: number): ProjectIdsFromArgv {
  return (argv) => {
    const id = argv[depth];
    return id != null && !id.startsWith("-") ? [id] : [];
  };
}

/** Sentinel: this subcommand touches no project log. */
export const NO_PROJECT_ARGV: ProjectIdsFromArgv = () => [];

/** Sentinel: this subcommand may touch every known project log. */
export const ALL_PROJECTS_ARGV: ProjectIdsFromArgv = () => ["*"];

/**
 * Extract the value of a long option flag (`--foo bar` or `--foo=bar`)
 * from a token list. Returns `undefined` if the flag is absent. Used
 * by transfer-style subcommands where the project id arrives as
 * `--project-id <id>`, not as a positional.
 */
export function flagValue(argv: readonly string[], flag: string): string | undefined {
  for (let i = 0; i < argv.length; i += 1) {
    const tok = argv[i]!;
    if (tok === flag) {
      const v = argv[i + 1];
      if (v != null && !v.startsWith("-")) return v;
    } else if (tok.startsWith(`${flag}=`)) {
      return tok.slice(flag.length + 1);
    }
  }
  return undefined;
}

/** ProjectIdsFromArgv that pulls `--project-id <id>` (or `--project-id=<id>`). */
export function projectIdFlagArgv(): ProjectIdsFromArgv {
  return (argv) => {
    const v = flagValue(argv, "--project-id");
    return v != null ? [v] : [];
  };
}

/** ProjectIdsFromArgv that pulls `--id <id>` (used by `project create`). */
export function idFlagArgv(): ProjectIdsFromArgv {
  return (argv) => {
    const v = flagValue(argv, "--id");
    return v != null ? [v] : [];
  };
}

// ── Common-pattern helpers (json side) ─────────────────────────────

/**
 * Convention: the JSON tool args carry the project id under one of
 * these top-level keys (most use `project` or `project_id`; transfer
 * uses `project_id`; some have none). Returns the first match.
 */
export function projectFromJsonField(
  ...keys: readonly string[]
): ProjectIdsFromJson {
  return (args) => {
    for (const k of keys) {
      const v = args[k];
      if (typeof v === "string" && v.length > 0) return [v];
    }
    return [];
  };
}

/** Sentinel: this tool touches no project log. */
export const NO_PROJECT_JSON: ProjectIdsFromJson = () => [];

/** Sentinel: this tool may touch every known project log. */
export const ALL_PROJECTS_JSON: ProjectIdsFromJson = () => ["*"];
