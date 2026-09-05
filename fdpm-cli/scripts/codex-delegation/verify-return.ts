/**
 * The verification boundary of the Codex delegation, as executable code.
 *
 * ARCHITECTURAL REQUIREMENT: LLMs will always produce some form of error.
 * Absence of output verification is a design defect, not a runtime bug.
 * All LLM output must be treated as untrusted and validated explicitly.
 *
 * This module is what `scripts/codex-delegate.sh` runs between `codex exec`
 * and the orchestrator reading anything. It is the sole consumer-side control
 * on output produced by a model outside this session, and it is deliberately
 * boring: parse, validate, stat, grep, compare. Nothing here asks a model
 * whether a model was right.
 *
 * The five checks, and the error class each one exists to catch:
 *
 *   cdel.json_contract    ERR_SCHEMA / ERR_TRUNCATION  one JSON object, mode schema
 *   cdel.paths_exist      ERR_HALLUCINATION            every cited path is real
 *   cdel.quotes_match     ERR_HALLUCINATION            every quote is verbatim
 *   cdel.diff_applies     ERR_REASONING                the diff applies to the tree
 *   cdel.no_git_mutation  ERR_INSTRUCTION              git did not move
 *
 * The schemas come from `seed.ts`, which is also what the fdpm workbook is
 * built from, so the contract the wrapper enforces and the contract the
 * workbook declares are the same object and cannot drift.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import Ajv, { type ValidateFunction } from "ajv";
import type { ErrorClass } from "../../plugins/silent_acceptance/ids.js";
import type { ModeName } from "./profile.js";
import { MODES, type WrapperCheck } from "./seed.js";

/** Git facts captured before and after a delegation, read from git, never from the return. */
export interface GitSnapshot {
  head: string;
  status_digest: string;
  stash_list: string;
  ref_list: string;
}

export interface VerifyInput {
  mode: ModeName;
  /** The subordinate agent's last message, exactly as it was written. */
  returnText: string;
  /** Absolute path of the repository the delegation ran against. */
  repoPath: string;
  before: GitSnapshot;
  after: GitSnapshot;
}

export interface Failure {
  check: WrapperCheck;
  error_class: ErrorClass;
  message: string;
}

export interface VerifyResult {
  ok: boolean;
  failures: Failure[];
  /** The parsed return, present only when cdel.json_contract passed. */
  value?: Record<string, unknown>;
}

const fail = (check: WrapperCheck, error_class: ErrorClass, message: string): Failure => ({ check, error_class, message });

// ── cdel.json_contract ─────────────────────────────────────────────────────

const ajv = new Ajv({ allErrors: true, strict: false });
const compiled = new Map<ModeName, ValidateFunction>();

function validatorFor(mode: ModeName): ValidateFunction {
  const cached = compiled.get(mode);
  if (cached) return cached;
  const def = MODES.find((m) => m.mode_name === mode);
  if (!def) throw new Error(`unknown delegation mode: ${mode}`);
  const fn = ajv.compile(def.schema);
  compiled.set(mode, fn);
  return fn;
}

/**
 * Parse the return as exactly one JSON object and validate it against the
 * mode's schema. A code fence, a preamble, or a trailing apology all fail
 * here — the contract says one object and nothing else, and a parser that
 * forgives prose is a parser that will one day forgive a truncated document.
 */
export function checkJsonContract(mode: ModeName, returnText: string): { failures: Failure[]; value?: Record<string, unknown> } {
  const text = returnText.trim();
  if (text === "") {
    return { failures: [fail("cdel.json_contract", "ERR_TRUNCATION", "The return is empty.")] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // An unterminated document is truncation; anything else is a shape error.
    // Node has spelled this several ways across versions ("Unexpected end of
    // JSON input", "Unterminated string in JSON at position N"), so match the
    // family rather than one release's wording.
    const truncated = /unexpected end of|unterminated/i.test(message);
    return {
      failures: [
        fail(
          "cdel.json_contract",
          truncated ? "ERR_TRUNCATION" : "ERR_SCHEMA",
          `The return is not one JSON document: ${message}`,
        ),
      ],
    };
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { failures: [fail("cdel.json_contract", "ERR_SCHEMA", "The return is valid JSON but is not an object.")] };
  }

  const validate = validatorFor(mode);
  if (!validate(parsed)) {
    const detail = (validate.errors ?? [])
      .map((e) => `${e.instancePath || "/"} ${e.message ?? "is invalid"}`)
      .join("; ");
    const missing = (validate.errors ?? []).some((e) => e.keyword === "required");
    return {
      failures: [
        fail("cdel.json_contract", missing ? "ERR_OMISSION" : "ERR_SCHEMA", `The return does not satisfy the ${mode} contract: ${detail}`),
      ],
      value: parsed as Record<string, unknown>,
    };
  }

  return { failures: [], value: parsed as Record<string, unknown> };
}

// ── cdel.paths_exist ───────────────────────────────────────────────────────

const asStringArray = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);

/** The fields each mode's schema uses to name a file. */
function citedPaths(mode: ModeName, value: Record<string, unknown>): string[] {
  if (mode === "research") {
    const evidence = Array.isArray(value["evidence"]) ? value["evidence"] : [];
    return evidence
      .map((e) => (e !== null && typeof e === "object" ? (e as Record<string, unknown>)["path"] : undefined))
      .filter((p): p is string => typeof p === "string");
  }
  if (mode === "patch") return asStringArray(value["target_files"]);
  return asStringArray(value["files_changed"]);
}

/**
 * Resolve a cited path inside the delegation's repository. A path that is
 * absolute, or that escapes the repository through `..`, is rejected without
 * touching the filesystem: a return that names /etc/passwd has already left
 * the boundary the sandbox tier was drawn around.
 */
export function resolveInsideRepo(repoPath: string, cited: string): string | null {
  if (cited === "" || isAbsolute(cited)) return null;
  const target = resolve(repoPath, cited);
  const rel = relative(repoPath, target);
  if (rel === "" || rel.startsWith("..") || rel.startsWith(`..${sep}`)) return null;
  return target;
}

export function checkPathsExist(mode: ModeName, value: Record<string, unknown>, repoPath: string): Failure[] {
  const failures: Failure[] = [];
  for (const cited of citedPaths(mode, value)) {
    const target = resolveInsideRepo(repoPath, cited);
    if (target === null) {
      failures.push(fail("cdel.paths_exist", "ERR_HALLUCINATION", `Cited path escapes the delegation repository: ${cited}`));
      continue;
    }
    try {
      statSync(target);
    } catch {
      failures.push(fail("cdel.paths_exist", "ERR_HALLUCINATION", `Cited path does not exist: ${cited}`));
    }
  }
  return failures;
}

// ── cdel.quotes_match ──────────────────────────────────────────────────────

/**
 * Every evidence quote must appear as a fixed string in the file it is
 * attributed to, and the stated line must be part of the match. A quote that
 * is a paraphrase or a reconstruction fails here even when the path is real,
 * which is the difference between "the file exists" and "the file says this".
 */
export function checkQuotesMatch(mode: ModeName, value: Record<string, unknown>, repoPath: string): Failure[] {
  if (mode !== "research") return [];
  const evidence = Array.isArray(value["evidence"]) ? value["evidence"] : [];
  const failures: Failure[] = [];

  for (const entry of evidence) {
    if (entry === null || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const cited = typeof row["path"] === "string" ? row["path"] : "";
    const quote = typeof row["quote"] === "string" ? row["quote"] : "";
    const line = typeof row["line"] === "number" ? row["line"] : 0;
    const target = resolveInsideRepo(repoPath, cited);
    if (target === null) continue; // already reported by checkPathsExist

    let content: string;
    try {
      content = readFileSync(target, "utf8");
    } catch {
      continue; // already reported by checkPathsExist
    }

    if (!content.includes(quote)) {
      failures.push(
        fail("cdel.quotes_match", "ERR_HALLUCINATION", `Quote is not verbatim in ${cited}: ${JSON.stringify(quote.slice(0, 120))}`),
      );
      continue;
    }

    const firstLineOfQuote = quote.split("\n", 1)[0] ?? "";
    const lines = content.split("\n");
    const stated = lines[line - 1];
    if (stated === undefined || !stated.includes(firstLineOfQuote)) {
      failures.push(
        fail(
          "cdel.quotes_match",
          "ERR_HALLUCINATION",
          `Quote appears in ${cited} but not at the cited line ${line}; a citation that points at the wrong place cannot be checked by a reader.`,
        ),
      );
    }
  }
  return failures;
}

// ── cdel.diff_applies ──────────────────────────────────────────────────────

/** Feed a patch-mode diff to `git apply --check`. A diff that does not apply is not a patch. */
export function checkDiffApplies(mode: ModeName, value: Record<string, unknown>, repoPath: string): Failure[] {
  if (mode !== "patch") return [];
  const diff = typeof value["diff"] === "string" ? value["diff"] : "";
  const body = diff.endsWith("\n") ? diff : `${diff}\n`;
  try {
    execFileSync("git", ["-C", repoPath, "apply", "--check", "--recount", "-"], {
      input: body,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return [];
  } catch (err) {
    const stderr = (err as { stderr?: Buffer }).stderr?.toString("utf8").trim() ?? String(err);
    return [fail("cdel.diff_applies", "ERR_REASONING", `The returned diff does not apply to the working tree: ${stderr}`)];
  }
}

// ── cdel.no_git_mutation ───────────────────────────────────────────────────

const GIT_FIELDS: Array<[keyof GitSnapshot, string]> = [
  ["head", "HEAD moved"],
  ["status_digest", "the working tree's staged/unstaged state changed in a way the delegation was not authorised to make"],
  ["stash_list", "the stash list changed"],
  ["ref_list", "refs were created, moved or deleted"],
];

/**
 * Compare the git state captured before the delegation with the state after
 * it. The comparison reads git, never the return, so a subordinate agent that
 * commits and then reports `committed: false` fails the same check as one
 * that reports honestly. A producer that attests to its own compliance is not
 * a control (Silent Acceptance v2.1.0 §9.7).
 *
 * In write mode the working tree is expected to change, so `status_digest` is
 * exempt there — the whole point of write mode is an unstaged diff to review.
 */
export function checkNoGitMutation(mode: ModeName, before: GitSnapshot, after: GitSnapshot): Failure[] {
  const failures: Failure[] = [];
  for (const [field, description] of GIT_FIELDS) {
    if (field === "status_digest" && mode === "write") continue;
    if (before[field] !== after[field]) {
      failures.push(
        fail("cdel.no_git_mutation", "ERR_INSTRUCTION", `Git state changed during the delegation: ${description} (${field}).`),
      );
    }
  }
  return failures;
}

// ── The boundary ───────────────────────────────────────────────────────────

/**
 * Run every check that applies to the mode and report all failures, not just
 * the first. A caller that receives `ok: false` has no validated return: there
 * is no partial acceptance here, and no field of `value` is safe to read.
 */
export function verifyReturn(input: VerifyInput): VerifyResult {
  const gitFailures = checkNoGitMutation(input.mode, input.before, input.after);
  const contract = checkJsonContract(input.mode, input.returnText);

  if (contract.failures.length > 0 || contract.value === undefined) {
    const failures = [...contract.failures, ...gitFailures];
    return { ok: false, failures, ...(contract.value ? { value: contract.value } : {}) };
  }

  const value = contract.value;
  const failures = [
    ...checkPathsExist(input.mode, value, input.repoPath),
    ...checkQuotesMatch(input.mode, value, input.repoPath),
    ...checkDiffApplies(input.mode, value, input.repoPath),
    ...gitFailures,
  ];
  return { ok: failures.length === 0, failures, value };
}

// ── CLI ────────────────────────────────────────────────────────────────────

interface CliArgs {
  mode: ModeName;
  repo: string;
  returnFile: string;
  beforeFile: string;
  afterFile: string;
}

function parseArgs(argv: string[]): CliArgs {
  const get = (flag: string): string => {
    const index = argv.indexOf(flag);
    const value = index === -1 ? undefined : argv[index + 1];
    if (value === undefined) throw new Error(`missing required argument ${flag}`);
    return value;
  };
  const mode = get("--mode");
  if (!MODES.some((m) => m.mode_name === mode)) {
    throw new Error(`--mode must be one of ${MODES.map((m) => m.mode_name).join("|")}, got ${JSON.stringify(mode)}`);
  }
  return {
    mode: mode as ModeName,
    repo: get("--repo"),
    returnFile: get("--return"),
    beforeFile: get("--git-before"),
    afterFile: get("--git-after"),
  };
}

const readSnapshot = (path: string): GitSnapshot => JSON.parse(readFileSync(path, "utf8")) as GitSnapshot;

export function runCli(argv: string[]): number {
  const args = parseArgs(argv);
  const result = verifyReturn({
    mode: args.mode,
    returnText: readFileSync(args.returnFile, "utf8"),
    repoPath: resolve(args.repo),
    before: readSnapshot(args.beforeFile),
    after: readSnapshot(args.afterFile),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result.ok ? 0 : 1;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = runCli(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 2;
  }
}
