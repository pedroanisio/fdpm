#!/usr/bin/env python3
"""
Rename "project" -> "workbook" across the fdpm-cli codebase.

Defaults to --dry-run. Use --apply to mutate the working tree.

Branch behavior (--apply only):
  * By default the script refuses to run unless the working tree is a git
    repo with a clean status. It then creates a fresh branch
    (default: rename/project-to-workbook) from the current HEAD,
    performs all rewrites and renames on that branch, and stages the
    result. It does NOT commit — review with `git diff --staged` and
    commit yourself.
  * Override with --allow-dirty to skip the clean-tree check.
  * Override with --reuse-branch to switch to the branch if it already
    exists instead of erroring.
  * Override with --no-branch to mutate the current branch in place
    (the legacy behavior). Useful for non-git trees.
  * Override with --no-stage to skip the `git add -A` step.

Scope (rewritten):
  * .ts, .tsx, .js, .mjs, .cjs, .json, .md, .yml, .yaml under the repo root.
  * File and directory paths whose basename contains "project" (excluding
    anything that contains "projection").

Hard skip list (never read, never rewritten, never renamed):
  * node_modules, dist, build, coverage, .git, .agent-tasks, .vite, .turbo
  * package.json, package-lock.json, pnpm-lock.yaml, yarn.lock, bun.lockb
  * rust.json, log.jsonl
  * CLAUDE.md, PURPOSE.md, DISCLAIMER.md (operator review only)
  * Anything matching the literal substring "projection"
  * This script itself

Substitutions (applied longest-first so prefixes don't double-mutate):
    PROJECTS    -> WORKBOOKS
    Projects    -> Workbooks
    projects    -> workbooks
    project_id  -> workbook_id
    projectId   -> workbookId
    ProjectId   -> WorkbookId
    PROJECT     -> WORKBOOK
    Project     -> Workbook
    project     -> workbook
Each is applied with \\b word boundaries. Lines containing "projection" are
never touched. Per operator decision, the id_uniqueness enum value
("project") IS renamed; no special-case skip for it.

Outputs in --dry-run:
  * A unified diff per modified file to stdout.
  * A RENAME_REPORT.md summary file at the repo root.
  * No branch creation, no git mutations.

Outputs in --apply:
  * (Default) A new branch is created and checked out.
  * Files rewritten in place on that branch.
  * Paths renamed via `git mv` when the working tree is a git repo, else
    plain os.rename.
  * Changes staged but NOT committed. Review and commit yourself.
  * RENAME_REPORT.md still written.

Exit codes:
  0  success (dry-run or apply)
  1  unexpected error
  2  invalid invocation
  3  precondition failed (dirty tree, branch exists, not a git repo, ...)
"""

from __future__ import annotations

import argparse
import difflib
import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

REPO_ROOT_DEFAULT = Path(__file__).resolve().parents[2]

SKIP_DIR_NAMES = {
    "node_modules",
    "dist",
    "build",
    "coverage",
    ".git",
    ".agent-tasks",
    ".vite",
    ".turbo",
    ".next",
    ".cache",
    ".repo",       # third-party skill bundles; not domain code
    ".claude",     # local IDE/agent config; not domain code
}

SKIP_FILE_NAMES = {
    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "bun.lockb",
    "rust.json",
    "log.jsonl",
    "CLAUDE.md",
    "PURPOSE.md",
    "DISCLAIMER.md",
    "RENAME_REPORT.md",
}

CONTENT_EXTS = {
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".json",
    ".md",
    ".mdx",
    ".yml",
    ".yaml",
    ".txt",
}

# Order matters: longest / most specific first so e.g. "project_id" is
# rewritten before plain "project". Each tuple is (pattern, replacement).
SUBSTITUTIONS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bPROJECTS\b"), "WORKBOOKS"),
    (re.compile(r"\bProjects\b"), "Workbooks"),
    (re.compile(r"\bprojects\b"), "workbooks"),
    (re.compile(r"\bproject_id\b"), "workbook_id"),
    (re.compile(r"\bprojectId\b"), "workbookId"),
    (re.compile(r"\bProjectId\b"), "WorkbookId"),
    (re.compile(r"\bPROJECT\b"), "WORKBOOK"),
    (re.compile(r"\bProject\b"), "Workbook"),
    (re.compile(r"\bproject\b"), "workbook"),
]

PROJECTION_RE = re.compile(r"projection", re.IGNORECASE)
SCRIPT_FILE = Path(__file__).resolve()


@dataclass
class Report:
    files_scanned: int = 0
    files_modified: int = 0
    total_replacements: int = 0
    per_file: list[tuple[Path, int]] = field(default_factory=list)
    path_renames: list[tuple[Path, Path]] = field(default_factory=list)
    skipped_due_to_projection: list[Path] = field(default_factory=list)
    meta_docs_with_matches: list[tuple[Path, int]] = field(default_factory=list)
    branch_used: str | None = None
    branch_created: bool = False
    starting_branch: str | None = None
    staged: bool = False


def is_within(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def should_skip_dir(name: str) -> bool:
    return name in SKIP_DIR_NAMES or "projection" in name.lower()


def should_skip_file(path: Path) -> bool:
    if path.resolve() == SCRIPT_FILE:
        return True
    if path.name in SKIP_FILE_NAMES:
        return True
    if "projection" in path.name.lower():
        return True
    if path.suffix.lower() not in CONTENT_EXTS:
        return True
    return False


def iter_candidate_files(root: Path) -> Iterable[Path]:
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if not should_skip_dir(d)]
        dpath = Path(dirpath)
        for fname in filenames:
            fpath = dpath / fname
            if should_skip_file(fpath):
                continue
            yield fpath


def rewrite_text(text: str) -> tuple[str, int]:
    """Apply substitutions line-by-line, skipping lines that mention
    'projection' (case-insensitive). Returns (new_text, replacement_count)."""
    out_lines: list[str] = []
    total = 0
    # splitlines(keepends=True) preserves \n / \r\n exactly.
    for line in text.splitlines(keepends=True):
        if PROJECTION_RE.search(line):
            out_lines.append(line)
            continue
        new_line = line
        for pat, repl in SUBSTITUTIONS:
            new_line, n = pat.subn(repl, new_line)
            total += n
        out_lines.append(new_line)
    return "".join(out_lines), total


def rename_path_component(name: str) -> str:
    """Apply the same casing-aware substitutions to a single path component.
    Components containing 'projection' are returned unchanged."""
    if "projection" in name.lower():
        return name
    out = name
    for pat, repl in SUBSTITUTIONS:
        out = pat.sub(repl, out)
    return out


def plan_path_renames(root: Path) -> list[tuple[Path, Path]]:
    """Walk the tree and produce a list of (src, dst) renames. Sorted with
    deepest paths first so children move before their parent directory's
    name changes."""
    renames: list[tuple[Path, Path]] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if not should_skip_dir(d)]
        dpath = Path(dirpath)
        for fname in filenames:
            if "project" in fname.lower() and "projection" not in fname.lower():
                src = dpath / fname
                if src.resolve() == SCRIPT_FILE:
                    continue
                if fname in SKIP_FILE_NAMES:
                    continue
                new_name = rename_path_component(fname)
                if new_name != fname:
                    renames.append((src, dpath / new_name))
        for dname in list(dirnames):
            if "project" in dname.lower() and "projection" not in dname.lower():
                src = dpath / dname
                new_name = rename_path_component(dname)
                if new_name != dname:
                    renames.append((src, dpath / new_name))
    # Sort by descending path depth so we rename children before parents.
    renames.sort(key=lambda pair: len(pair[0].parts), reverse=True)
    return renames


DEFAULT_BRANCH_NAME = "rename/project-to-workbook"


class PreconditionError(RuntimeError):
    """Raised when a guardrail check (clean tree, branch availability,
    git-repo presence) fails."""


def _git(root: Path, *args: str, check: bool = False) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", "-C", str(root), *args],
        capture_output=True,
        text=True,
        check=check,
    )


def is_git_repo(root: Path) -> bool:
    if shutil.which("git") is None:
        return False
    return _git(root, "rev-parse", "--is-inside-work-tree").returncode == 0


def working_tree_is_clean(root: Path) -> bool:
    result = _git(root, "status", "--porcelain")
    if result.returncode != 0:
        return False
    return result.stdout.strip() == ""


def current_branch(root: Path) -> str | None:
    result = _git(root, "rev-parse", "--abbrev-ref", "HEAD")
    if result.returncode != 0:
        return None
    name = result.stdout.strip()
    return name or None


def branch_exists(root: Path, name: str) -> bool:
    return (
        _git(root, "show-ref", "--verify", "--quiet", f"refs/heads/{name}").returncode == 0
    )


def create_or_switch_branch(root: Path, name: str, reuse: bool) -> tuple[str, bool]:
    """Create branch `name` from HEAD and switch to it. If reuse is True
    and the branch already exists, switch to it instead.

    Returns (branch_name, created) where created=True iff the branch
    was newly created on this call."""
    if branch_exists(root, name):
        if not reuse:
            raise PreconditionError(
                f"branch '{name}' already exists; pass --reuse-branch to switch "
                f"to it, or pick a different --branch name"
            )
        result = _git(root, "switch", name)
        if result.returncode != 0:
            raise PreconditionError(
                f"failed to switch to existing branch '{name}': {result.stderr.strip()}"
            )
        return name, False
    result = _git(root, "switch", "-c", name)
    if result.returncode != 0:
        raise PreconditionError(
            f"failed to create branch '{name}': {result.stderr.strip()}"
        )
    return name, True


def stage_all(root: Path) -> None:
    result = _git(root, "add", "-A")
    if result.returncode != 0:
        raise PreconditionError(f"git add -A failed: {result.stderr.strip()}")


def do_rename(src: Path, dst: Path, use_git: bool, root: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    if use_git:
        result = subprocess.run(
            ["git", "-C", str(root), "mv", str(src), str(dst)],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            # Fall back to os.rename if git mv refuses (e.g. file untracked).
            os.rename(src, dst)
        return
    os.rename(src, dst)


def collect_meta_doc_matches(root: Path) -> list[tuple[Path, int]]:
    """Return (path, match_count) for the three meta docs so the operator
    knows what was deliberately left untouched."""
    out: list[tuple[Path, int]] = []
    for name in ("CLAUDE.md", "PURPOSE.md", "DISCLAIMER.md"):
        for candidate in root.rglob(name):
            if any(part in SKIP_DIR_NAMES for part in candidate.parts):
                continue
            try:
                text = candidate.read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError):
                continue
            n = sum(
                1
                for line in text.splitlines()
                if not PROJECTION_RE.search(line)
                and any(pat.search(line) for pat, _ in SUBSTITUTIONS)
            )
            if n:
                out.append((candidate, n))
    return out


def write_report(root: Path, report: Report, dry_run: bool) -> Path:
    target = root / "RENAME_REPORT.md"
    lines: list[str] = []
    lines.append("---")
    lines.append("disclaimer:")
    lines.append("  notice: >-")
    lines.append(
        "    No information within this document should be taken for granted."
    )
    lines.append(
        "    Any statement or premise not backed by a real logical definition"
    )
    lines.append("    or verifiable reference may be invalid, erroneous, or a hallucination.")
    lines.append('  generated_by: "rename_project_to_workbook.py (Claude Opus 4.7)"')
    lines.append('  date: "2026-05-05"')
    lines.append("---")
    lines.append("")
    lines.append("# Rename Report: project -> workbook")
    lines.append("")
    lines.append(f"- mode: {'dry-run' if dry_run else 'apply'}")
    lines.append(f"- repo root: `{root}`")
    lines.append(f"- files scanned: {report.files_scanned}")
    lines.append(f"- files modified: {report.files_modified}")
    lines.append(f"- total replacements: {report.total_replacements}")
    lines.append(f"- path renames: {len(report.path_renames)}")
    if report.starting_branch:
        lines.append(f"- starting branch: `{report.starting_branch}`")
    if report.branch_used:
        verb = "created" if report.branch_created else "reused"
        lines.append(f"- working branch: `{report.branch_used}` ({verb})")
    if not dry_run:
        lines.append(f"- staged for commit: {'yes' if report.staged else 'no'}")
        lines.append("- committed: no (review with `git diff --staged`, then commit yourself)")
    lines.append("")
    lines.append("## Modified files")
    lines.append("")
    if report.per_file:
        for path, n in sorted(report.per_file, key=lambda x: x[0].as_posix()):
            rel = path.relative_to(root)
            lines.append(f"- `{rel}` — {n} replacement(s)")
    else:
        lines.append("_none_")
    lines.append("")
    lines.append("## Path renames (deepest first)")
    lines.append("")
    if report.path_renames:
        for src, dst in report.path_renames:
            lines.append(
                f"- `{src.relative_to(root)}` -> `{dst.relative_to(root)}`"
            )
    else:
        lines.append("_none_")
    lines.append("")
    lines.append("## Meta docs left untouched (operator review)")
    lines.append("")
    lines.append(
        "Per operator decision, `CLAUDE.md`, `PURPOSE.md`, and `DISCLAIMER.md` "
        "are NOT rewritten by this script. The match counts below are advisory."
    )
    lines.append("")
    if report.meta_docs_with_matches:
        for path, n in report.meta_docs_with_matches:
            rel = path.relative_to(root)
            lines.append(f"- `{rel}` — {n} candidate line(s)")
    else:
        lines.append("_no candidate matches found_")
    lines.append("")
    lines.append("## Notes")
    lines.append("")
    lines.append(
        "- Lines containing the substring `projection` (case-insensitive) "
        "were skipped during content rewrite to protect the audit-projection "
        "domain."
    )
    lines.append(
        "- The `id_uniqueness` enum value `\"project\"` IS renamed to "
        "`\"workbook\"` per operator decision."
    )
    lines.append(
        "- MCP clients that hard-code the old tool names (`fdpm.project.*`) "
        "must be updated separately; this script does not touch external "
        "consumer config."
    )
    target.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return target


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        description="Rename project -> workbook across the fdpm-cli codebase."
    )
    parser.add_argument(
        "--root",
        type=Path,
        default=REPO_ROOT_DEFAULT,
        help=f"Repo root to operate on (default: {REPO_ROOT_DEFAULT}).",
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview changes without writing (default).",
    )
    mode.add_argument(
        "--apply",
        action="store_true",
        help="Mutate the working tree.",
    )
    parser.add_argument(
        "--no-diff",
        action="store_true",
        help="Suppress per-file unified diffs in dry-run output.",
    )
    parser.add_argument(
        "--branch",
        default=DEFAULT_BRANCH_NAME,
        help=f"Branch name to create for the rename (default: {DEFAULT_BRANCH_NAME}).",
    )
    parser.add_argument(
        "--no-branch",
        action="store_true",
        help="Do not create a branch; mutate the current branch in place. "
        "Required for non-git trees.",
    )
    parser.add_argument(
        "--reuse-branch",
        action="store_true",
        help="If --branch already exists, switch to it instead of erroring.",
    )
    parser.add_argument(
        "--allow-dirty",
        action="store_true",
        help="Skip the clean-working-tree check before creating the branch.",
    )
    parser.add_argument(
        "--no-stage",
        action="store_true",
        help="Do not run `git add -A` after the rewrite.",
    )
    args = parser.parse_args(argv)

    if not args.apply and not args.dry_run:
        args.dry_run = True

    root: Path = args.root.resolve()
    if not root.exists() or not root.is_dir():
        print(f"error: root does not exist or is not a directory: {root}", file=sys.stderr)
        return 2

    report = Report()

    use_git = is_git_repo(root)

    # ------------------------------------------------------------------
    # Pre-apply guardrails: branch handling on --apply only
    # ------------------------------------------------------------------
    if args.apply and not args.no_branch:
        if not use_git:
            print(
                "error: --apply with branch creation requires a git repo. "
                "Pass --no-branch to mutate a non-git tree.",
                file=sys.stderr,
            )
            return 3
        if not args.allow_dirty and not working_tree_is_clean(root):
            print(
                "error: working tree is not clean. Commit or stash changes "
                "first, or pass --allow-dirty to proceed anyway.",
                file=sys.stderr,
            )
            return 3
        report.starting_branch = current_branch(root)
        try:
            report.branch_used, report.branch_created = create_or_switch_branch(
                root, args.branch, reuse=args.reuse_branch
            )
        except PreconditionError as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 3
        print(
            f"working on branch: {report.branch_used} "
            f"(was: {report.starting_branch})",
            file=sys.stderr,
        )

    # ------------------------------------------------------------------
    # Pass 1: content rewrite
    # ------------------------------------------------------------------
    for fpath in iter_candidate_files(root):
        report.files_scanned += 1
        try:
            original = fpath.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        new_text, n = rewrite_text(original)
        if n == 0 or new_text == original:
            continue
        report.files_modified += 1
        report.total_replacements += n
        report.per_file.append((fpath, n))
        if args.dry_run:
            if not args.no_diff:
                rel = fpath.relative_to(root)
                diff = difflib.unified_diff(
                    original.splitlines(keepends=True),
                    new_text.splitlines(keepends=True),
                    fromfile=f"a/{rel}",
                    tofile=f"b/{rel}",
                )
                sys.stdout.writelines(diff)
        else:
            fpath.write_text(new_text, encoding="utf-8")

    # ------------------------------------------------------------------
    # Pass 2: path renames (deepest first)
    # ------------------------------------------------------------------
    renames = plan_path_renames(root)
    report.path_renames = renames
    if args.apply:
        for src, dst in renames:
            if not src.exists():
                # Parent already renamed under us in a prior step;
                # reconstruct the new path before renaming.
                continue
            do_rename(src, dst, use_git=use_git, root=root)

    # ------------------------------------------------------------------
    # Pass 3: meta-doc advisory
    # ------------------------------------------------------------------
    report.meta_docs_with_matches = collect_meta_doc_matches(root)

    # ------------------------------------------------------------------
    # Stage (apply only, git only, unless --no-stage)
    # ------------------------------------------------------------------
    if args.apply and use_git and not args.no_stage:
        try:
            stage_all(root)
            report.staged = True
        except PreconditionError as exc:
            print(f"warning: {exc}", file=sys.stderr)

    # ------------------------------------------------------------------
    # Report
    # ------------------------------------------------------------------
    report_path = write_report(root, report, dry_run=args.dry_run)

    print("", file=sys.stderr)
    print(f"mode:                {'dry-run' if args.dry_run else 'apply'}", file=sys.stderr)
    print(f"files scanned:       {report.files_scanned}", file=sys.stderr)
    print(f"files modified:      {report.files_modified}", file=sys.stderr)
    print(f"total replacements:  {report.total_replacements}", file=sys.stderr)
    print(f"path renames:        {len(report.path_renames)}", file=sys.stderr)
    if report.branch_used:
        verb = "created" if report.branch_created else "reused"
        print(f"branch:              {report.branch_used} ({verb})", file=sys.stderr)
    if args.apply and use_git:
        print(f"staged:              {'yes' if report.staged else 'no'}", file=sys.stderr)
        print("committed:           no — review with `git diff --staged`", file=sys.stderr)
    print(f"report written to:   {report_path}", file=sys.stderr)
    if args.dry_run:
        print(
            "\nthis was a dry run. re-run with --apply to mutate the tree.",
            file=sys.stderr,
        )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except KeyboardInterrupt:
        sys.exit(130)
    except Exception as exc:  # noqa: BLE001
        print(f"error: {exc}", file=sys.stderr)
        sys.exit(1)
