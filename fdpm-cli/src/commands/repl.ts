/**
 * `fdpm repl` — SPEC-REPL §8 in-process REPL surface.
 *
 * The REPL holds one Host for its entire session and re-parses each
 * input line through the same Commander tree the one-shot CLI uses.
 * Per-command state changes go through Host's normal entry points;
 * the REPL adds NO new state-mutation paths (Principle 1).
 *
 * Architecture:
 *
 *   1. Read line from TTY or pipe.
 *   2. If empty → continue.
 *   3. If `:`-prefixed → meta-command (in-process, no Commander).
 *   4. Tokenize via shell-quote (POSIX shell-word rules; no expansion).
 *   5. Look up commandMetadata by full subcommand path.
 *   6. Freshness check: stat each project log, refuse (strict) or
 *      tail-replay (lenient) on detected out-of-band writes.
 *   7. Build a fresh Commander program with exitOverride() and parse
 *      the tokens via parseAsync(tokens, { from: "user" }).
 *   8. On error: format and print to stderr, return to prompt.
 *
 * Output framing (SPEC-REPL §8.2):
 *   - Banners, prompts, and error envelopes go to stderr.
 *   - Command results go to stdout. In `--json` session mode every
 *     command produces exactly one JSON line on stdout.
 *
 * Scripted mode (SPEC-REPL §9):
 *   - `--script <file>` reads commands from `<file>`, exits at EOF.
 *   - Stdin redirection is equivalent.
 *   - In `--json` mode emits a final `{"summary": ...}` line on
 *     stdout containing ok/error counts and wall-clock duration.
 *   - `--exit-on-error` exits on the first FDPMException.
 *   - Without `--exit-on-error`, exit code is the highest
 *     EXIT_CODE_FOR_CATEGORY observed (or 0 if none failed).
 */
import { Command } from "commander";
import { createInterface, type Interface as ReadlineInterface } from "node:readline";
import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { parse as shellParse } from "shell-quote";
import type { Host } from "../core/host.js";
import { FDPMException, EXIT_CODE_FOR_CATEGORY } from "../core/errors/fdpm-exception.js";
import { staleStateException } from "../core/errors/stale-state.js";
import { formatError } from "../bin/error-handling.js";
import { buildProgram, topLevelCommandNames } from "../bin/program.js";
// NOTE: We deliberately do NOT import `ALL_COMMAND_METADATA` from
// `./index.js` at module load — that would create a circular import
// (index.ts imports from this file for the CI gate's REPL entry).
// Instead, the dispatcher imports the registry dynamically the first
// time it runs. The cost is one extra `import()` await per REPL
// session; the benefit is a clean module graph.
import { type CommandMetadataMap, type SubcommandMetadata, NO_PROJECT_ARGV, NO_PROJECT_JSON } from "./metadata.js";

let _allCommandMetadata: CommandMetadataMap | null = null;
async function getAllCommandMetadata(): Promise<CommandMetadataMap> {
  if (_allCommandMetadata !== null) return _allCommandMetadata;
  const mod = await import("./index.js");
  _allCommandMetadata = mod.ALL_COMMAND_METADATA;
  return _allCommandMetadata;
}

const REPL_ADVICE = "run :reload or restart the REPL";
const FORBIDDEN_META_PREFIXES = [":!", ":cd"];

interface ReplSessionOptions {
  json: boolean;
  banner: boolean;
  exitOnError: boolean;
  scriptPath: string | null;
}

interface FreshnessSnapshot {
  /** Per-project (mtime_ns, size) at last sync; absent = never seen. */
  readonly perProject: Map<string, { mtime_ns: bigint; size: bigint }>;
}

export function buildReplCommand(host: Host): Command {
  const cmd = new Command("repl");
  cmd
    .description("Long-lived interactive process holding one Host (SPEC-REPL §8)")
    .option("--no-banner", "suppress the startup banner")
    .option(
      "--script <path>",
      "read commands from a file (one per line, # for comments) and exit at EOF",
    )
    .option(
      "--exit-on-error",
      "in scripted mode, exit on the first FDPMException with the matching exit code",
    )
    .option("--json", "session-wide JSON output mode (one JSON value per line on stdout)")
    .action(async (opts) => {
      const session: ReplSessionOptions = {
        json: opts.json === true,
        banner: opts.banner !== false,
        exitOnError: opts.exitOnError === true,
        scriptPath: opts.script != null ? String(opts.script) : null,
      };
      const isScripted = session.scriptPath !== null || !process.stdin.isTTY;
      // Banner suppressed in scripted mode unless explicitly enabled.
      const showBanner = session.banner && !isScripted;

      if (showBanner) {
        printBanner(host);
      }

      const summary = { ok: 0, error: 0, maxExitCode: 0, startedAt: Date.now() };
      const freshness: FreshnessSnapshot = { perProject: new Map() };

      let cancelInputOnSigint = false;
      let lastSigintAt = 0;
      const sigintHandler = (): void => {
        const now = Date.now();
        if (cancelInputOnSigint && now - lastSigintAt > 2000) {
          // First SIGINT within the input window: cancel the current
          // input, return to a fresh prompt. The readline interface
          // handles its own redraw via SIGINT.
          lastSigintAt = now;
          if (!isScripted) writeStderr("\n");
          return;
        }
        // Second SIGINT within 2s: abrupt shutdown.
        process.exit(130);
      };
      process.on("SIGINT", sigintHandler);
      process.on("SIGTERM", () => process.exit(0));

      const rl: ReadlineInterface = createInterface({
        input:
          session.scriptPath !== null
            ? createReadStream(resolve(session.scriptPath), { encoding: "utf8" })
            : process.stdin,
        // Output goes to /dev/null for readline's own bookkeeping —
        // we manage the prompt manually on stderr so JSON-mode output
        // stays clean.
        output: process.stderr,
        terminal: !isScripted,
        historySize: 1000,
        prompt: isScripted ? "" : "fdpm> ",
        completer: !isScripted ? makeCompleter(host) : undefined,
      });

      if (!isScripted) {
        cancelInputOnSigint = true;
        rl.prompt();
      }

      for await (const rawLine of rl) {
        cancelInputOnSigint = false;
        const line = stripComment(rawLine).trim();
        if (line.length === 0) {
          if (!isScripted) rl.prompt();
          continue;
        }

        // Meta-commands first — never reach Commander, never persist.
        if (line.startsWith(":")) {
          const metaResult = await handleMeta(line, host, session, freshness);
          if (metaResult === "quit") {
            rl.close();
            break;
          }
          if (!isScripted) rl.prompt();
          cancelInputOnSigint = true;
          continue;
        }

        // Forbidden bare prefixes (defense in depth — should be caught
        // by the meta-command branch above, but a typo like `:!ls`
        // followed by a space lands here without the leading colon
        // being parsed).
        for (const forbidden of FORBIDDEN_META_PREFIXES) {
          if (line.startsWith(forbidden)) {
            writeStderr(`error: ${forbidden} is forbidden in v0.1 (see SPEC-REPL §8.5)\n`);
            summary.error += 1;
            if (session.exitOnError) {
              process.exit(EXIT_CODE_FOR_CATEGORY.permission);
            }
            if (!isScripted) rl.prompt();
            cancelInputOnSigint = true;
            continue;
          }
        }

        let tokens: string[];
        try {
          tokens = tokenizeLine(line);
        } catch (err) {
          writeStderr(`error: tokenization failed: ${(err as Error).message}\n`);
          summary.error += 1;
          if (session.exitOnError) {
            process.exit(EXIT_CODE_FOR_CATEGORY.verification);
          }
          if (!isScripted) rl.prompt();
          cancelInputOnSigint = true;
          continue;
        }

        const result = await dispatchOne(host, tokens, session, freshness);
        if (result.kind === "ok") {
          summary.ok += 1;
        } else {
          summary.error += 1;
          if (result.exitCode > summary.maxExitCode) {
            summary.maxExitCode = result.exitCode;
          }
          if (session.exitOnError) {
            process.exit(result.exitCode);
          }
        }
        if (!isScripted) rl.prompt();
        cancelInputOnSigint = true;
      }

      // End of input.
      if (isScripted && session.json) {
        writeStdoutJson({
          summary: {
            ok: summary.ok,
            error: summary.error,
            duration_ms: Date.now() - summary.startedAt,
          },
        });
      }
      if (isScripted && !session.exitOnError) {
        process.exitCode = summary.maxExitCode;
      }
    });

  return cmd;
}

// ── Tokenizer ──────────────────────────────────────────────────────

/**
 * Tokenize an input line per SPEC-REPL §8.4: POSIX shell-word splitting
 * (single quotes, double quotes, backslash escape). Variable expansion,
 * command substitution, and glob expansion are explicitly forbidden.
 *
 * shell-quote returns objects (e.g. `{op: '|'}`) for shell metacharacters
 * we do NOT support; reject them as `verification` errors so the
 * operator gets a clear message instead of mysterious downstream
 * Commander confusion.
 */
function tokenizeLine(line: string): string[] {
  const parsed = shellParse(line, () => "");
  const out: string[] = [];
  for (const part of parsed) {
    if (typeof part === "string") {
      out.push(part);
    } else {
      throw new Error(
        `unsupported shell token (variable expansion, redirection, or pipe is not allowed)`,
      );
    }
  }
  return out;
}

function stripComment(line: string): string {
  // SPEC-REPL §9: scripted-mode comments start with `#`. Apply to
  // interactive too — a trailing `# note` shouldn't trip the parser.
  // Be conservative: only strip when the `#` is at the start of the
  // line OR preceded by whitespace, so `#`-bearing primitive ids
  // (e.g. `--id rel:bar#baz`) don't get clipped.
  const idx = line.search(/(^|\s)#/);
  if (idx === -1) return line;
  return line.slice(0, idx);
}

// ── Meta-commands ──────────────────────────────────────────────────

async function handleMeta(
  line: string,
  host: Host,
  session: ReplSessionOptions,
  freshness: FreshnessSnapshot,
): Promise<"continue" | "quit"> {
  const trimmed = line.trim();
  // `:!<anything>` — shell escape — is forbidden, regardless of what
  // follows the bang.
  if (trimmed.startsWith(":!")) {
    writeStderr(`error: :! is forbidden in v0.1 (see SPEC-REPL §8.5)\n`);
    return "continue";
  }
  // `:cd ...` — would silently change plugin discovery — also forbidden.
  if (trimmed === ":cd" || trimmed.startsWith(":cd ")) {
    writeStderr(`error: :cd is forbidden in v0.1 (see SPEC-REPL §8.5)\n`);
    return "continue";
  }

  const [cmd, ...rest] = trimmed.slice(1).split(/\s+/);
  switch (cmd) {
    case "help":
      writeStderr(renderHelpText(host));
      return "continue";
    case "quit":
    case "exit":
      return "quit";
    case "reload": {
      try {
        if (rest[0] === "plugins") {
          const r = await host.reloadPlugins();
          writeStderr(`plugins reloaded (active=${r.plugins})\n`);
        } else {
          const r = await host.reload();
          writeStderr(`reloaded (projects=${r.projects.length})\n`);
          // Reset the freshness snapshot so the next command re-stats.
          freshness.perProject.clear();
        }
      } catch (err) {
        const formatted = formatError(err, { wantsJson: session.json });
        writeStderr(formatted.stderr);
      }
      return "continue";
    }
    case "pwd":
      writeStderr(`${process.cwd()}\n`);
      return "continue";
    case "env":
      // Print FDPM_* env vars only (operator may have shell-private
      // exports we shouldn't echo).
      for (const [k, v] of Object.entries(process.env).sort()) {
        if (k.startsWith("FDPM_")) writeStderr(`${k}=${v ?? ""}\n`);
      }
      return "continue";
    case "json": {
      const next = rest[0];
      if (next === "on") session.json = true;
      else if (next === "off") session.json = false;
      else writeStderr(`json mode: ${session.json ? "on" : "off"}\n`);
      return "continue";
    }
    case "history":
      writeStderr("(history is in-memory; use shell history or --history-file)\n");
      return "continue";
    case "time":
      writeStderr("(timing not implemented in v0.1)\n");
      return "continue";
    default:
      writeStderr(`error: unknown meta-command :${cmd} (try :help)\n`);
      return "continue";
  }
}

function renderHelpText(host: Host): string {
  const lines: string[] = [];
  lines.push("FDPM REPL — meta-commands:");
  lines.push("  :help                 show this message");
  lines.push("  :quit | :exit         clean shutdown");
  lines.push("  :reload               full Host reload (re-runs load + plugin discovery)");
  lines.push("  :reload plugins       re-run plugin discovery + activation only");
  lines.push("  :pwd                  print process cwd");
  lines.push("  :env                  print FDPM_* environment variables");
  lines.push("  :json on | off        toggle session-wide JSON output mode");
  lines.push("  :history              note about history persistence");
  lines.push("");
  lines.push("Forbidden in v0.1: :cd, :!<shell-cmd>");
  lines.push("");
  lines.push("Available top-level commands:");
  const program = buildProgram(host);
  lines.push("  " + topLevelCommandNames(program).join(", "));
  lines.push("");
  return lines.join("\n");
}

// ── Tab completion ─────────────────────────────────────────────────

/**
 * Minimal v0.1 tab completion (SPEC-REPL §8.6 + §27.Q2):
 * candidates come exclusively from the Commander tree's top-level
 * subcommand list. Filesystem-sourced completion is forbidden.
 *
 * The returned completer matches readline's `(line) => [hits, prefix]`
 * convention. For the first word, we offer all subcommands matching
 * the typed prefix; subsequent words are not completed in v0.1.
 */
function makeCompleter(host: Host): (line: string) => [string[], string] {
  const program = buildProgram(host);
  const topLevels = topLevelCommandNames(program);
  return (line: string) => {
    const tokens = line.split(/\s+/);
    if (tokens.length <= 1) {
      const prefix = tokens[0] ?? "";
      const hits = topLevels.filter((name) => name.startsWith(prefix));
      return [hits, prefix];
    }
    return [[], line];
  };
}

// ── Dispatch ───────────────────────────────────────────────────────

interface DispatchOk {
  kind: "ok";
}
interface DispatchErr {
  kind: "err";
  exitCode: number;
}
type DispatchResult = DispatchOk | DispatchErr;

async function dispatchOne(
  host: Host,
  tokens: readonly string[],
  session: ReplSessionOptions,
  freshness: FreshnessSnapshot,
): Promise<DispatchResult> {
  if (tokens.length === 0) return { kind: "ok" };

  // Look up commandMetadata by progressive prefix. For "primitive
  // create my-proj" → first try "primitive create" (depth 2), then
  // "primitive" (depth 1). Pick the longest match.
  const registry = await getAllCommandMetadata();
  const meta = lookupMetadata(tokens, registry);

  // Freshness gate.
  if (meta) {
    try {
      await runFreshnessGate(host, tokens, meta, freshness);
    } catch (err) {
      const formatted = formatError(err, { wantsJson: session.json });
      writeStderr(formatted.stderr);
      return { kind: "err", exitCode: formatted.exitCode };
    }
  }

  // Build a fresh program per dispatch (Commander state — like the
  // help-displayed flag and the parsed-args buffers — does not roll
  // over cleanly across parseAsync calls in v12). Cheap to rebuild.
  const program = buildProgram(host, {
    exitOverride: true,
    // Route Commander's own writes to stderr so --json output stays
    // pure on stdout.
    writeOut: writeStderr,
    writeErr: writeStderr,
  });

  // Inject the session-wide --json default by prepending the flag
  // when the operator hasn't supplied it on this line.
  const finalTokens =
    session.json && !tokens.includes("--json") ? [...tokens, "--json"] : tokens;

  try {
    await program.parseAsync(finalTokens, { from: "user" });
    // Snapshot the project's freshness AFTER our own writes so the
    // next command's freshness gate doesn't false-trigger on writes
    // we just made.
    if (meta) {
      const projects = meta.projectIdsFromArgv(tokens);
      for (const projectId of projects) {
        if (projectId === "*") continue;
        const stat = host.statProjectLog(projectId);
        if (stat !== null) freshness.perProject.set(projectId, stat);
        else freshness.perProject.delete(projectId);
      }
    }
    return { kind: "ok" };
  } catch (err) {
    // Commander's exitOverride throws CommanderError for help-display
    // and parse errors; wrap them as verification failures so the
    // session-summary exit code is sane.
    const isCommanderError =
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      typeof (err as { code: unknown }).code === "string";
    if (isCommanderError) {
      const code = (err as { code: string }).code;
      // help/version display are not failures.
      if (code === "commander.helpDisplayed" || code === "commander.version") {
        return { kind: "ok" };
      }
      const message =
        err instanceof Error ? err.message : String((err as { message?: unknown }).message ?? code);
      writeStderr(`error: ${message}\n`);
      return { kind: "err", exitCode: EXIT_CODE_FOR_CATEGORY.verification };
    }
    const formatted = formatError(err, { wantsJson: session.json });
    writeStderr(formatted.stderr);
    return { kind: "err", exitCode: formatted.exitCode };
  }
}

/**
 * Look up subcommand metadata by trying the longest prefix of `tokens`
 * first. Falls back to a `tokens[0]`-only key for top-level commands
 * with no subcommand depth (`validate`, `render`, `diff`, `edit`).
 * Returns `undefined` if no entry matches — the dispatcher then skips
 * the freshness gate and lets Commander surface the unknown-command
 * error.
 */
function lookupMetadata(
  tokens: readonly string[],
  registry: CommandMetadataMap,
): SubcommandMetadata | undefined {
  // Try longest prefixes first (depth 4 → 3 → 2 → 1).
  for (let depth = Math.min(tokens.length, 4); depth >= 1; depth -= 1) {
    const key = tokens.slice(0, depth).join(" ");
    const entry = registry[key];
    if (entry !== undefined) return entry;
  }
  return undefined;
}

/**
 * SPEC-REPL §10.2 freshness gate. For each project the command will
 * touch:
 *   - if no cached snapshot → take one (first sight).
 *   - if cached snapshot matches current (mtime_ns, size) → no change,
 *     proceed.
 *   - if changed and command is read-only → tail-replay, refresh
 *     snapshot, proceed.
 *   - if changed and command is write-capable → refuse with
 *     staleStateException.
 *
 * `["*"]` (wildcard) means stat every known project; treated like a
 * loop over the live project set.
 */
async function runFreshnessGate(
  host: Host,
  tokens: readonly string[],
  meta: SubcommandMetadata,
  freshness: FreshnessSnapshot,
): Promise<void> {
  let projects = meta.projectIdsFromArgv(tokens);
  if (projects.length === 1 && projects[0] === "*") {
    projects = host.listProjects().map((p) => p.id);
  }
  for (const projectId of projects) {
    if (projectId === "*") continue;
    const cached = freshness.perProject.get(projectId);
    const observed = host.statProjectLog(projectId);
    if (observed === null) {
      // Project log doesn't exist yet (e.g. just-created project
      // before its first persisted op). Nothing to compare.
      freshness.perProject.delete(projectId);
      continue;
    }
    if (cached === undefined) {
      // First sight — record and proceed.
      freshness.perProject.set(projectId, observed);
      continue;
    }
    const unchanged =
      cached.mtime_ns === observed.mtime_ns && cached.size === observed.size;
    if (unchanged) continue;

    if (meta.readOnly) {
      // Lenient mode — incremental tail-replay then proceed.
      await host.reloadProjectTail(projectId);
      freshness.perProject.set(projectId, observed);
    } else {
      // Strict mode — refuse with structured envelope.
      throw staleStateException({
        project_id: projectId,
        advice: REPL_ADVICE,
        detail: {
          cached_mtime_ns: cached.mtime_ns.toString(),
          cached_size: cached.size.toString(),
          observed_mtime_ns: observed.mtime_ns.toString(),
          observed_size: observed.size.toString(),
        },
      });
    }
  }
}

// ── I/O helpers ────────────────────────────────────────────────────

function writeStderr(text: string): void {
  process.stderr.write(text);
}

function writeStdoutJson(payload: unknown): void {
  process.stdout.write(JSON.stringify(payload) + "\n");
}

function printBanner(host: Host): void {
  void host; // reserved for future use
  writeStderr("fdpm REPL (SPEC-REPL §8) — :help for commands, :quit to exit\n");
}

// ── Module exports for testing ─────────────────────────────────────

export const _internal = {
  tokenizeLine,
  stripComment,
  lookupMetadata,
  NO_PROJECT_ARGV,
  NO_PROJECT_JSON,
};

// ── commandMetadata (per the CI gate) ──────────────────────────────
//
// The REPL itself is a long-lived command — it doesn't fit the
// per-command staleness model (it manages its own freshness gate
// internally per dispatched line). The metadata entry here exists
// solely so the central registry stays exhaustive and the CI
// classification gate at tests/_meta/command-metadata-presence.test.ts
// keeps passing. SPEC-MCP-SERVER will never expose `repl` as a tool
// (it's a stdin-driven loop, not a request/response operation).

export const commandMetadata: CommandMetadataMap = {
  repl: {
    readOnly: false,
    projectIdsFromArgv: NO_PROJECT_ARGV,
    projectIdsFromJson: NO_PROJECT_JSON,
  },
};
