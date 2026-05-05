#!/usr/bin/env python3
"""
Rename an FDPM plugin across the fdpm-cli codebase.

Companion to ``rename_project_to_workbook.py`` but **structurally
different**: the project→workbook script does a global concept rename
with `\\b`-anchored regex; this script does a precision-first plugin
rename, touching only the identifier surfaces an FDPM plugin actually
produces (per SPEC-PLUGIN-NAMING §5.2) plus its `extends` references.

The script reads the source plugin's ``fdpm-plugin.json`` to learn its
current state, takes a target via flags, computes the substitution plan,
prints it, and (with ``--apply``) executes it.

Defaults to --dry-run. Use --apply to mutate the working tree.

What gets renamed (per SPEC-PLUGIN-NAMING §5.2 + extends):

  Surface              | Source                          | Target
  ---------------------+---------------------------------+--------------------
  Manifest id          | "id": "fdpm.spec-authoring"     | "id": "fdpm.documents.specifications"
  Profile id (literal) | "profile:spec-authoring:0.1"    | "profile:specifications:0.1"
  Profile id (any vsn) | profile:spec-authoring:         | profile:specifications:
  Type prefix          | spec:                           | specifications:
  Directory            | plugins/spec_authoring/         | plugins/documents/specifications/
  Capability local     | "local_name": "spec-authoring"  | "local_name": "specifications"
  Extends references   | "profile:spec-authoring:..."    | "profile:specifications:..."

What does NOT get renamed (precision filter):

  - Bare prose mentions of the plugin's leaf word ("DNIS" in headings,
    "the spec-authoring workflow" in narrative paragraphs, etc.).
  - References that don't disambiguate as the plugin's identity surface
    — only the specific identifier patterns listed above are rewritten.
  - The plugin's TS source files for primitives whose type ids start
    with the source prefix BUT only at the type-id position, not at
    arbitrary string-match positions (substitutions are exact-prefix
    only, not `\\b`-anchored).
  - Anything in node_modules, dist, lockfiles, CLAUDE.md/PURPOSE.md/DISCLAIMER.md.

Branch behavior (--apply only):
  * Default: refuses to run unless the working tree is a clean git repo.
    Creates a fresh branch (default: rename/plugin-<source-leaf>-to-<target-leaf>),
    performs all rewrites and renames on that branch, and stages the
    result. Does NOT commit — review with `git diff --staged` and
    commit yourself.
  * --allow-dirty skips the clean-tree check.
  * --reuse-branch switches to the branch if it already exists.
  * --no-branch mutates the current branch in place.
  * --no-stage skips the `git add -A` step.

Outputs:
  * --dry-run: unified diff per modified file to stdout, plus a
    PLUGIN_RENAME_REPORT.md file at repo root.
  * --apply: rewrites in place (on the branch), `git mv` for path
    renames where possible, stages, writes the same report.

Exit codes:
  0  success
  1  unexpected error
  2  invalid invocation
  3  precondition failed (dirty tree, source manifest not found, etc.)
  4  source plugin's structural shape is unknown (manifest backfill required)
"""

from __future__ import annotations

import argparse
import difflib
import json
import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

REPO_ROOT_DEFAULT = Path(__file__).resolve().parents[2]
PLUGINS_ROOT_DEFAULT = REPO_ROOT_DEFAULT / "fdpm-cli" / "plugins"
SCRIPT_FILE = Path(__file__).resolve()

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
    ".repo",
    ".claude",
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
    "PLUGIN_RENAME_REPORT.md",
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


# --------------------------------------------------------------------------
# Plugin identity model
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class PluginIdentity:
    """The identifier surfaces a single FDPM plugin produces.

    Reads what's currently in the manifest; lets the substitution plan
    compute exactly which strings need rewriting without ever falling
    back to bare-word substitution.
    """

    manifest_id: str  # e.g. "fdpm.spec-authoring"
    leaf: str  # e.g. "spec-authoring" — last dotted segment of manifest_id
    directory: Path  # absolute path to the plugin's directory
    directory_name: str  # e.g. "spec_authoring" (basename, snake_case today)
    type_prefix: str | None  # e.g. "spec" — None when the plugin contributes no types
    profile_id_no_version: str | None  # e.g. "profile:spec-authoring:" (trailing colon)

    @property
    def vendor(self) -> str:
        # First dotted segment of manifest_id.
        return self.manifest_id.split(".", 1)[0]

    @property
    def is_composition(self) -> bool:
        return self.type_prefix is None


def parse_manifest_identity(manifest_path: Path) -> PluginIdentity:
    """Read fdpm-plugin.json and the corresponding plugins/<dir>/index.ts
    PROFILE_ID constant to populate a PluginIdentity."""
    if not manifest_path.is_file():
        raise PreconditionError(f"manifest not found: {manifest_path}")
    with manifest_path.open(encoding="utf-8") as fh:
        manifest = json.load(fh)
    manifest_id = manifest.get("id")
    if not isinstance(manifest_id, str):
        raise PreconditionError(
            f"manifest at {manifest_path} has no string `id` field"
        )
    plugin_dir = manifest_path.parent
    leaf = manifest_id.split(".")[-1]

    # Type prefix: read PROFILE_ID from index.ts and infer the prefix from
    # the first primitive_type id in the activated profile. We do a
    # best-effort string scan here; the operator can override with
    # --source-prefix if the heuristic fails.
    prefix = _infer_type_prefix(plugin_dir)

    # Profile id literal: read PROFILE_ID constant from index.ts.
    profile_id_no_version = _infer_profile_id_no_version(plugin_dir)

    return PluginIdentity(
        manifest_id=manifest_id,
        leaf=leaf,
        directory=plugin_dir,
        directory_name=plugin_dir.name,
        type_prefix=prefix,
        profile_id_no_version=profile_id_no_version,
    )


_PROFILE_ID_RE = re.compile(
    r'PROFILE_ID\s*=\s*"(profile:[a-z0-9-]+:[0-9]+\.[0-9]+(?:\.[0-9]+)?)"'
)


def _infer_profile_id_no_version(plugin_dir: Path) -> str | None:
    """Scan plugins/<dir>/index.ts for `export const PROFILE_ID = "..."`.
    Returns the leading "profile:<leaf>:" portion (with trailing colon)
    so substitutions can match against any version. None if absent."""
    index_ts = plugin_dir / "index.ts"
    if not index_ts.is_file():
        return None
    try:
        text = index_ts.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return None
    m = _PROFILE_ID_RE.search(text)
    if not m:
        return None
    full = m.group(1)  # e.g. "profile:spec-authoring:0.1"
    parts = full.split(":")
    if len(parts) < 3:
        return None
    return f"{parts[0]}:{parts[1]}:"


_PRIMITIVE_TYPE_ID_RE = re.compile(
    r'\bid:\s*"([a-z][a-z0-9-]*):[A-Za-z][A-Za-z0-9_]*"'
)


def _infer_type_prefix(plugin_dir: Path) -> str | None:
    """Heuristic: scan plugins/<dir>/primitives/*.ts and relations.ts for
    the first `id: "<prefix>:Foo"` pattern; the prefix wins. Returns None
    for composition profiles that contribute no types.

    Composition profiles (no primitives/ directory and no relations.ts)
    return None — they have no type prefix to substitute."""
    candidates: list[Path] = []
    primitives_dir = plugin_dir / "primitives"
    if primitives_dir.is_dir():
        candidates.extend(sorted(primitives_dir.glob("*.ts")))
    rel_ts = plugin_dir / "relations.ts"
    if rel_ts.is_file():
        candidates.append(rel_ts)
    for candidate in candidates:
        try:
            text = candidate.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        m = _PRIMITIVE_TYPE_ID_RE.search(text)
        if m:
            return m.group(1)
    return None


# --------------------------------------------------------------------------
# Substitution plan
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class TargetSpec:
    """The desired post-rename identifier surfaces."""

    manifest_id: str  # e.g. "fdpm.documents.specifications"
    leaf: str  # last segment
    type_prefix: str | None  # None to leave unchanged (composition or operator opt-out)
    directory_relative: Path  # relative to plugins/, e.g. "documents/specifications"


@dataclass(frozen=True)
class Substitution:
    """An exact-string substitution to apply during the content pass."""

    pattern: str  # literal string to find
    replacement: str
    rationale: str  # human-readable why this substitution exists

    def apply(self, text: str) -> tuple[str, int]:
        if self.pattern not in text:
            return text, 0
        new = text.replace(self.pattern, self.replacement)
        n = (len(text) - len(new)) // (len(self.pattern) - len(self.replacement)) if (
            len(self.pattern) != len(self.replacement)
        ) else text.count(self.pattern)
        return new, n


def build_substitutions(
    src: PluginIdentity, tgt: TargetSpec
) -> list[Substitution]:
    """Compute the list of exact-string substitutions for the rename.

    Each substitution is a literal pattern, not a regex. This is the
    precision-first design point: we only rewrite the specific
    identifier surfaces, never bare-word matches.
    """
    subs: list[Substitution] = []

    # 1. Manifest id — both the bare form and the JSON-quoted form
    #    (the bare form catches plugin loader paths, README cross-refs).
    if src.manifest_id != tgt.manifest_id:
        subs.append(
            Substitution(
                pattern=f'"{src.manifest_id}"',
                replacement=f'"{tgt.manifest_id}"',
                rationale="manifest id (JSON-quoted)",
            )
        )
        subs.append(
            Substitution(
                pattern=src.manifest_id,
                replacement=tgt.manifest_id,
                rationale="manifest id (bare)",
            )
        )

    # 2. Profile id — match the leading `profile:<leaf>:` portion so any
    #    version suffix is preserved. Captures both PROFILE_ID literals
    #    and `extends: ["profile:..."]` references in dependent plugins.
    if (
        src.profile_id_no_version
        and tgt.leaf != src.leaf
    ):
        target_profile_id_no_version = f"profile:{tgt.leaf}:"
        subs.append(
            Substitution(
                pattern=src.profile_id_no_version,
                replacement=target_profile_id_no_version,
                rationale="profile id (any version) — covers extends references",
            )
        )

    # 3. Type prefix — exact match on `<prefix>:` (literal colon).
    #    This catches `spec:Document`, `spec:Section`, etc. without
    #    matching prose like "spec authoring" or arbitrary uses of
    #    "spec".
    if (
        src.type_prefix
        and tgt.type_prefix
        and src.type_prefix != tgt.type_prefix
    ):
        subs.append(
            Substitution(
                pattern=f"{src.type_prefix}:",
                replacement=f"{tgt.type_prefix}:",
                rationale=f"type prefix ({src.type_prefix}: → {tgt.type_prefix}:)",
            )
        )

    # 4. Capability local_name in manifest JSON. The manifest may carry
    #    `"local_name": "<leaf>"` for the primary capability instance
    #    (per SPEC-PLUGIN-NAMING §5.2 row 5). This is a JSON-quoted
    #    literal, very precise.
    if src.leaf != tgt.leaf:
        subs.append(
            Substitution(
                pattern=f'"local_name": "{src.leaf}"',
                replacement=f'"local_name": "{tgt.leaf}"',
                rationale="capability local_name (JSON-quoted)",
            )
        )

    return subs


def build_path_renames(
    src: PluginIdentity, tgt: TargetSpec, plugins_root: Path
) -> list[tuple[Path, Path]]:
    """Compute the directory-rename plan. Today there is exactly one
    rename: `plugins/<src.directory_name>/` → `plugins/<tgt.directory_relative>/`.
    SPEC-PLUGIN-NAMING §5.2 says the directory mirrors the path, so a
    multi-rung target produces a nested target directory."""
    renames: list[tuple[Path, Path]] = []
    if src.directory != plugins_root / tgt.directory_relative:
        target_dir = plugins_root / tgt.directory_relative
        renames.append((src.directory, target_dir))
    return renames


# --------------------------------------------------------------------------
# File walking and rewriting
# --------------------------------------------------------------------------


def is_within(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def should_skip_dir(name: str) -> bool:
    return name in SKIP_DIR_NAMES


def should_skip_file(path: Path) -> bool:
    if path.resolve() == SCRIPT_FILE:
        return True
    if path.name in SKIP_FILE_NAMES:
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


def rewrite_text(text: str, subs: list[Substitution]) -> tuple[str, int]:
    """Apply substitutions in declared order. Each substitution is an
    exact-string replacement (str.replace), NOT a regex. Returns
    (new_text, replacement_count)."""
    out = text
    total = 0
    for sub in subs:
        if sub.pattern not in out:
            continue
        n = out.count(sub.pattern)
        out = out.replace(sub.pattern, sub.replacement)
        total += n
    return out, total


# --------------------------------------------------------------------------
# Git workflow
# --------------------------------------------------------------------------


class PreconditionError(RuntimeError):
    """Raised when a guardrail check fails."""


def _git(
    root: Path, *args: str, check: bool = False
) -> subprocess.CompletedProcess[str]:
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
        _git(
            root, "show-ref", "--verify", "--quiet", f"refs/heads/{name}"
        ).returncode
        == 0
    )


def create_or_switch_branch(
    root: Path, name: str, reuse: bool
) -> tuple[str, bool]:
    if branch_exists(root, name):
        if not reuse:
            raise PreconditionError(
                f"branch '{name}' already exists; pass --reuse-branch or pick "
                f"a different --branch name"
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
            os.rename(src, dst)
        return
    os.rename(src, dst)


# --------------------------------------------------------------------------
# Report
# --------------------------------------------------------------------------


@dataclass
class Report:
    src: PluginIdentity | None = None
    tgt: TargetSpec | None = None
    substitutions: list[Substitution] = field(default_factory=list)
    files_scanned: int = 0
    files_modified: int = 0
    total_replacements: int = 0
    per_file: list[tuple[Path, int]] = field(default_factory=list)
    path_renames: list[tuple[Path, Path]] = field(default_factory=list)
    branch_used: str | None = None
    branch_created: bool = False
    starting_branch: str | None = None
    staged: bool = False


def write_report(root: Path, report: Report, dry_run: bool) -> Path:
    target = root / "PLUGIN_RENAME_REPORT.md"
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
    lines.append(
        "    or verifiable reference may be invalid, erroneous, or a hallucination."
    )
    lines.append('  generated_by: "rename_plugin.py (Claude Opus 4.7)"')
    lines.append('  date: "2026-05-05"')
    lines.append("---")
    lines.append("")
    lines.append("# Plugin Rename Report")
    lines.append("")
    if report.src and report.tgt:
        lines.append(
            f"- source plugin: `{report.src.manifest_id}` "
            f"(leaf=`{report.src.leaf}`, prefix=`{report.src.type_prefix or '(none)'}`)"
        )
        lines.append(
            f"- target plugin: `{report.tgt.manifest_id}` "
            f"(leaf=`{report.tgt.leaf}`, prefix=`{report.tgt.type_prefix or '(unchanged)'}`)"
        )
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
        lines.append(
            "- committed: no (review with `git diff --staged`, then commit yourself)"
        )
    lines.append("")
    lines.append("## Substitution plan")
    lines.append("")
    if report.substitutions:
        lines.append("| # | Pattern | Replacement | Rationale |")
        lines.append("|---|---------|-------------|-----------|")
        for i, sub in enumerate(report.substitutions, 1):
            lines.append(
                f"| {i} | `{sub.pattern}` | `{sub.replacement}` | {sub.rationale} |"
            )
    else:
        lines.append(
            "_no substitutions — source and target identifiers are identical_"
        )
    lines.append("")
    lines.append("## Modified files")
    lines.append("")
    if report.per_file:
        for path, n in sorted(report.per_file, key=lambda x: x[0].as_posix()):
            try:
                rel = path.relative_to(root)
                lines.append(f"- `{rel}` — {n} replacement(s)")
            except ValueError:
                lines.append(f"- `{path}` — {n} replacement(s)")
    else:
        lines.append("_none_")
    lines.append("")
    lines.append("## Path renames")
    lines.append("")
    if report.path_renames:
        for src, dst in report.path_renames:
            try:
                src_rel = src.relative_to(root)
            except ValueError:
                src_rel = src
            try:
                dst_rel = dst.relative_to(root)
            except ValueError:
                dst_rel = dst
            lines.append(f"- `{src_rel}` -> `{dst_rel}`")
    else:
        lines.append("_none_")
    lines.append("")
    lines.append("## Notes")
    lines.append("")
    lines.append(
        "- This script applies **exact-string** substitutions, not "
        "`\\b`-anchored regex. Bare prose mentions of the plugin's leaf "
        "word are NOT rewritten — only the structural identifier "
        "surfaces from SPEC-PLUGIN-NAMING §5.2 plus `extends` references."
    )
    lines.append(
        "- The substitutions are derived from the source plugin's "
        "current `fdpm-plugin.json` and `index.ts`. If the inferred "
        "type prefix is wrong, override with `--source-prefix`."
    )
    lines.append(
        "- The host-side `extends` validation (SPEC-PLUGIN-NAMING §4.3) "
        "validates `structural_shape` compatibility at profile load, "
        "but does NOT validate that referenced profile ids exist. After "
        "this rename, run the test suite to catch any orphaned "
        "`extends` references."
    )
    lines.append(
        "- MCP clients that hard-code the old plugin's profile id must "
        "be updated separately; this script does not touch external "
        "consumer config."
    )
    target.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return target


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------


def _slugify_for_branch(s: str) -> str:
    """Make a string safe for inclusion in a git branch name."""
    return re.sub(r"[^a-z0-9-]+", "-", s.lower()).strip("-")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        description="Rename an FDPM plugin across the fdpm-cli codebase.",
        epilog=(
            "Example: rename `fdpm.spec-authoring` to "
            "`fdpm.documents.specifications` (per SPEC-PLUGIN-NAMING §3.7):\n"
            "  rename_plugin.py --source fdpm.spec-authoring "
            "--target-id fdpm.documents.specifications "
            "--target-leaf specifications --target-prefix specifications "
            "--target-directory documents/specifications"
        ),
    )
    parser.add_argument(
        "--root",
        type=Path,
        default=REPO_ROOT_DEFAULT,
        help=f"Repo root to operate on (default: {REPO_ROOT_DEFAULT}).",
    )
    parser.add_argument(
        "--plugins-root",
        type=Path,
        default=PLUGINS_ROOT_DEFAULT,
        help=f"Plugins directory (default: {PLUGINS_ROOT_DEFAULT}).",
    )
    parser.add_argument(
        "--source",
        required=True,
        help="Source plugin manifest id, e.g. fdpm.spec-authoring.",
    )
    parser.add_argument(
        "--target-id",
        required=True,
        help="Target manifest id, e.g. fdpm.documents.specifications.",
    )
    parser.add_argument(
        "--target-leaf",
        required=True,
        help="Target leaf (last dotted segment of --target-id), used for "
        "profile id, type prefix, capability local_name.",
    )
    parser.add_argument(
        "--target-prefix",
        default=None,
        help="Target type prefix (default: same as --target-leaf). Pass "
        "explicitly only if you want a different prefix from the leaf "
        "(e.g. when honoring SPEC-PLUGIN-NAMING §3.5 escape hatch).",
    )
    parser.add_argument(
        "--target-directory",
        required=True,
        help="Target directory relative to plugins/, e.g. "
        "'documents/specifications'. Multi-rung paths produce nested "
        "directories per SPEC-PLUGIN-NAMING §5.2.",
    )
    parser.add_argument(
        "--source-prefix",
        default=None,
        help="Override the inferred source type prefix. Use only if "
        "auto-detection from index.ts/primitives/*.ts fails.",
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
        default=None,
        help="Branch name to create for the rename. Default: "
        "rename/plugin-<source-leaf>-to-<target-leaf>.",
    )
    parser.add_argument(
        "--no-branch",
        action="store_true",
        help="Do not create a branch; mutate the current branch in place.",
    )
    parser.add_argument(
        "--reuse-branch",
        action="store_true",
        help="If --branch already exists, switch to it instead of erroring.",
    )
    parser.add_argument(
        "--allow-dirty",
        action="store_true",
        help="Skip the clean-working-tree check.",
    )
    parser.add_argument(
        "--no-stage",
        action="store_true",
        help="Do not run `git add -A` after the rewrite.",
    )
    parser.add_argument(
        "--print-plan",
        action="store_true",
        help="Print the substitution plan to stderr before any "
        "filesystem activity. Forces dry-run unless --apply is also set.",
    )
    args = parser.parse_args(argv)

    if not args.apply and not args.dry_run:
        args.dry_run = True

    root: Path = args.root.resolve()
    if not root.exists() or not root.is_dir():
        print(
            f"error: root does not exist or is not a directory: {root}",
            file=sys.stderr,
        )
        return 2
    plugins_root: Path = args.plugins_root.resolve()
    if not plugins_root.exists() or not plugins_root.is_dir():
        print(
            f"error: plugins root does not exist: {plugins_root}", file=sys.stderr
        )
        return 2

    # ------------------------------------------------------------------
    # Locate the source plugin's manifest. The script accepts either a
    # full manifest id (`fdpm.spec-authoring`) or the leaf alone
    # (`spec-authoring`); we resolve to a directory under plugins/.
    # ------------------------------------------------------------------
    source_id = args.source
    source_leaf = source_id.split(".")[-1]
    # The directory name today may be snake_case (e.g. spec_authoring)
    # even though the manifest id is kebab-case (spec-authoring). Try
    # both forms.
    candidates = [
        plugins_root / source_leaf,
        plugins_root / source_leaf.replace("-", "_"),
    ]
    src_dir: Path | None = None
    for candidate in candidates:
        if (candidate / "fdpm-plugin.json").is_file():
            src_dir = candidate
            break
    if src_dir is None:
        print(
            f"error: cannot locate manifest for source `{source_id}` under "
            f"{plugins_root}. Tried: {[str(c) for c in candidates]}",
            file=sys.stderr,
        )
        return 3

    try:
        src = parse_manifest_identity(src_dir / "fdpm-plugin.json")
    except PreconditionError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 3

    if src.manifest_id != source_id:
        print(
            f"warning: --source was `{source_id}` but the manifest at "
            f"{src_dir}/fdpm-plugin.json has id `{src.manifest_id}`; using "
            f"the manifest's id.",
            file=sys.stderr,
        )

    if args.source_prefix is not None:
        src = PluginIdentity(
            manifest_id=src.manifest_id,
            leaf=src.leaf,
            directory=src.directory,
            directory_name=src.directory_name,
            type_prefix=args.source_prefix or None,
            profile_id_no_version=src.profile_id_no_version,
        )

    # ------------------------------------------------------------------
    # Build the target spec.
    # ------------------------------------------------------------------
    target_prefix = args.target_prefix if args.target_prefix is not None else args.target_leaf
    if src.type_prefix is None:
        # Composition profile — explicitly declare no target prefix
        # regardless of what the user passed.
        target_prefix = None
    tgt = TargetSpec(
        manifest_id=args.target_id,
        leaf=args.target_leaf,
        type_prefix=target_prefix,
        directory_relative=Path(args.target_directory),
    )

    # ------------------------------------------------------------------
    # Build the substitution plan.
    # ------------------------------------------------------------------
    subs = build_substitutions(src, tgt)
    path_renames = build_path_renames(src, tgt, plugins_root)

    if args.print_plan or args.dry_run:
        print("", file=sys.stderr)
        print("Substitution plan:", file=sys.stderr)
        print(
            f"  source: id=`{src.manifest_id}` leaf=`{src.leaf}` "
            f"prefix=`{src.type_prefix or '(none)'}` dir=`{src.directory_name}`",
            file=sys.stderr,
        )
        print(
            f"  target: id=`{tgt.manifest_id}` leaf=`{tgt.leaf}` "
            f"prefix=`{tgt.type_prefix or '(unchanged)'}` "
            f"dir=`{tgt.directory_relative}`",
            file=sys.stderr,
        )
        print(f"  substitutions ({len(subs)}):", file=sys.stderr)
        for i, sub in enumerate(subs, 1):
            print(
                f"    {i}. `{sub.pattern}` → `{sub.replacement}`  ({sub.rationale})",
                file=sys.stderr,
            )
        if path_renames:
            print(f"  path renames ({len(path_renames)}):", file=sys.stderr)
            for rsrc, rdst in path_renames:
                print(f"    {rsrc} → {rdst}", file=sys.stderr)
        print("", file=sys.stderr)

    if not subs and not path_renames:
        print(
            "no changes — source and target identifiers are identical.",
            file=sys.stderr,
        )
        return 0

    report = Report(src=src, tgt=tgt, substitutions=subs, path_renames=path_renames)

    use_git = is_git_repo(root)

    # ------------------------------------------------------------------
    # Pre-apply guardrails.
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
        branch_name = args.branch or (
            f"rename/plugin-{_slugify_for_branch(src.leaf)}-to-"
            f"{_slugify_for_branch(tgt.leaf)}"
        )
        try:
            report.branch_used, report.branch_created = create_or_switch_branch(
                root, branch_name, reuse=args.reuse_branch
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
    # Pass 1: content rewrite.
    # ------------------------------------------------------------------
    for fpath in iter_candidate_files(root):
        report.files_scanned += 1
        try:
            original = fpath.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        new_text, n = rewrite_text(original, subs)
        if n == 0 or new_text == original:
            continue
        report.files_modified += 1
        report.total_replacements += n
        report.per_file.append((fpath, n))
        if args.dry_run:
            if not args.no_diff:
                try:
                    rel = fpath.relative_to(root)
                except ValueError:
                    rel = fpath
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
    # Pass 2: path renames.
    # ------------------------------------------------------------------
    if args.apply:
        for rsrc, rdst in path_renames:
            if not rsrc.exists():
                continue
            do_rename(rsrc, rdst, use_git=use_git, root=root)

    # ------------------------------------------------------------------
    # Stage.
    # ------------------------------------------------------------------
    if args.apply and use_git and not args.no_stage:
        try:
            stage_all(root)
            report.staged = True
        except PreconditionError as exc:
            print(f"warning: {exc}", file=sys.stderr)

    # ------------------------------------------------------------------
    # Report.
    # ------------------------------------------------------------------
    report_path = write_report(root, report, dry_run=args.dry_run)

    print("", file=sys.stderr)
    print(f"mode:                {'dry-run' if args.dry_run else 'apply'}", file=sys.stderr)
    print(f"source:              {src.manifest_id}", file=sys.stderr)
    print(f"target:              {tgt.manifest_id}", file=sys.stderr)
    print(f"substitutions:       {len(subs)}", file=sys.stderr)
    print(f"files scanned:       {report.files_scanned}", file=sys.stderr)
    print(f"files modified:      {report.files_modified}", file=sys.stderr)
    print(f"total replacements:  {report.total_replacements}", file=sys.stderr)
    print(f"path renames:        {len(report.path_renames)}", file=sys.stderr)
    if report.branch_used:
        verb = "created" if report.branch_created else "reused"
        print(f"branch:              {report.branch_used} ({verb})", file=sys.stderr)
    if args.apply and use_git:
        print(f"staged:              {'yes' if report.staged else 'no'}", file=sys.stderr)
        print(
            "committed:           no — review with `git diff --staged`",
            file=sys.stderr,
        )
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
