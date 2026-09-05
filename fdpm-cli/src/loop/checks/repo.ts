/**
 * Repository-grounded checks on model output: cited paths exist, quotes are
 * verbatim, a diff applies, git did not move.
 *
 * ARCHITECTURAL REQUIREMENT: LLMs will always produce some form of error.
 * Absence of output verification is a design defect, not a runtime bug.
 * All LLM output must be treated as untrusted and validated explicitly.
 *
 * Every function here is pure over its inputs except for reading the
 * filesystem and running `git apply --check`; none of them consults a model.
 * They are the shared implementation behind the Codex delegation wrapper
 * (scripts/codex-delegation/verify-return.ts) and the loop-forward executor's
 * `cdel.*` named validators, so the two cannot drift apart.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

/** The nine Silent Acceptance v2.1.0 §5 error classes, as strings so this module has no plugin dependency. */
export type ErrorClassId =
  | "ERR_HALLUCINATION"
  | "ERR_OMISSION"
  | "ERR_SCHEMA"
  | "ERR_TRUNCATION"
  | "ERR_SYCOPHANCY"
  | "ERR_INSTRUCTION"
  | "ERR_CALIBRATION"
  | "ERR_SEMANTIC"
  | "ERR_REASONING";

export interface CheckFailure {
  check: string;
  error_class: ErrorClassId;
  message: string;
}

export const failure = (check: string, error_class: ErrorClassId, message: string): CheckFailure => ({ check, error_class, message });

/** Git facts captured before and after a run, read from git, never from a model. */
export interface GitSnapshot {
  head: string;
  status_digest: string;
  stash_list: string;
  ref_list: string;
}

/**
 * Resolve a cited path inside a repository. A path that is absolute, or that
 * escapes the repository through a parent segment, is rejected without
 * touching the filesystem: a return that names /etc/passwd has already left
 * the boundary the sandbox was drawn around.
 */
export function resolveInsideRepo(repoPath: string, cited: string): string | null {
  if (cited === "" || isAbsolute(cited)) return null;
  const target = resolve(repoPath, cited);
  const rel = relative(repoPath, target);
  if (rel === "" || rel.startsWith("..") || rel.startsWith(`..${sep}`)) return null;
  return target;
}

export function pathsExist(check: string, repoPath: string, cited: readonly string[]): CheckFailure[] {
  const failures: CheckFailure[] = [];
  for (const path of cited) {
    const target = resolveInsideRepo(repoPath, path);
    if (target === null) {
      failures.push(failure(check, "ERR_HALLUCINATION", `Cited path escapes the repository: ${path}`));
      continue;
    }
    try {
      statSync(target);
    } catch {
      failures.push(failure(check, "ERR_HALLUCINATION", `Cited path does not exist: ${path}`));
    }
  }
  return failures;
}

export interface Quote {
  path: string;
  line: number;
  quote: string;
}

/**
 * Every quote must appear as a fixed string in the file it is attributed to,
 * and the cited line must be part of the match. A paraphrase fails here even
 * when the path is real — the difference between "the file exists" and "the
 * file says this". A path that does not resolve is reported by `pathsExist`,
 * not here.
 */
export function quotesMatch(check: string, repoPath: string, quotes: readonly Quote[]): CheckFailure[] {
  const failures: CheckFailure[] = [];
  for (const q of quotes) {
    const target = resolveInsideRepo(repoPath, q.path);
    if (target === null) continue;
    let content: string;
    try {
      content = readFileSync(target, "utf8");
    } catch {
      continue;
    }
    if (q.quote === "" || !content.includes(q.quote)) {
      failures.push(failure(check, "ERR_HALLUCINATION", `Quote is not verbatim in ${q.path}: ${JSON.stringify(q.quote.slice(0, 120))}`));
      continue;
    }
    const firstLine = q.quote.split("\n", 1)[0] ?? "";
    const stated = content.split("\n")[q.line - 1];
    if (stated === undefined || !stated.includes(firstLine)) {
      failures.push(
        failure(
          check,
          "ERR_HALLUCINATION",
          `Quote appears in ${q.path} but not at the cited line ${q.line}; a citation that points at the wrong place cannot be checked by a reader.`,
        ),
      );
    }
  }
  return failures;
}

/** Feed a diff to `git apply --check`. A diff that does not apply is not a patch. */
export function diffApplies(check: string, repoPath: string, diff: string): CheckFailure[] {
  const body = diff.endsWith("\n") ? diff : `${diff}\n`;
  try {
    execFileSync("git", ["-C", repoPath, "apply", "--check", "--recount", "-"], { input: body, stdio: ["pipe", "pipe", "pipe"] });
    return [];
  } catch (err) {
    const stderr = (err as { stderr?: Buffer }).stderr?.toString("utf8").trim() ?? String(err);
    return [failure(check, "ERR_REASONING", `The returned diff does not apply to the working tree: ${stderr}`)];
  }
}

const GIT_FIELDS: ReadonlyArray<[keyof GitSnapshot, string]> = [
  ["head", "HEAD moved"],
  ["status_digest", "the working tree's staged/unstaged state changed in a way the run was not authorised to make"],
  ["stash_list", "the stash list changed"],
  ["ref_list", "refs were created, moved or deleted"],
];

/**
 * Compare git state captured before a run with the state after it. The
 * comparison reads git, never the output, so a producer that commits and then
 * reports `committed: false` fails the same check as one that reports
 * honestly (Silent Acceptance v2.1.0 §9.7). `allowWorkingTreeChange` exempts
 * the status digest for runs whose purpose is an unstaged diff to review.
 */
export function noGitMutation(check: string, before: GitSnapshot, after: GitSnapshot, allowWorkingTreeChange: boolean): CheckFailure[] {
  const failures: CheckFailure[] = [];
  for (const [field, description] of GIT_FIELDS) {
    if (field === "status_digest" && allowWorkingTreeChange) continue;
    if (before[field] !== after[field]) {
      failures.push(failure(check, "ERR_INSTRUCTION", `Git state changed during the run: ${description} (${field}).`));
    }
  }
  return failures;
}

/** Capture the git facts `noGitMutation` compares. Outside a working tree every field is a fixed sentinel. */
export function gitSnapshot(repoPath: string): GitSnapshot {
  const git = (args: string[]): string => {
    try {
      return execFileSync("git", ["-C", repoPath, ...args], { stdio: ["ignore", "pipe", "ignore"] }).toString("utf8");
    } catch {
      return "";
    }
  };
  const inside = git(["rev-parse", "--is-inside-work-tree"]).trim() === "true";
  if (!inside) return { head: "not-a-git-repo", status_digest: "not-a-git-repo", stash_list: "not-a-git-repo", ref_list: "not-a-git-repo" };
  const digest = (text: string): string => createHash("sha256").update(text).digest("hex");
  return {
    head: git(["rev-parse", "HEAD"]).trim() || "no-head",
    status_digest: digest(git(["status", "--porcelain"])),
    stash_list: digest(git(["stash", "list"])),
    ref_list: digest(git(["show-ref"])),
  };
}
