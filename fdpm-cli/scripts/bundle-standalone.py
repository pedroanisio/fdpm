#!/usr/bin/env python3
"""
bundle-standalone.py — package `cli/` as a self-contained `fdpm-cli` codebase.

Produces a tarball whose top-level directory is `fdpm-cli/`. The bundle is
self-contained: it pulls in the mandatory project-level files the cli/
README and MANUAL reference via `../` paths (DISCLAIMER, PURPOSE, CLAUDE,
AGENTS), and snapshots the upstream Python source-of-truth files that the
formal_specification and software_architecture plugins port from. Without
those, the bundled project loses the references the docs and inline
mirror-comments point to.

Excludes build/runtime artefacts (node_modules, dist, coverage), VCS state
(.git, .agent-tasks), editor scratch dirs, and the OS detritus
(.DS_Store, __pycache__).

Usage:
    python3 cli/scripts/bundle-standalone.py [-o OUTPUT] [--gzip|--bzip2|--xz]
                                             [--no-references]

The default output path is `dist-bundle/fdpm-cli-<version>.tar.gz` at the
repo root, where <version> is read from cli/package.json.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tarfile
from collections.abc import Iterable
from pathlib import Path
from typing import Final

REPO_ROOT: Final[Path] = Path(__file__).resolve().parents[2]
CLI_DIR: Final[Path] = REPO_ROOT / "cli"

# Files at the repo root that the cli/ docs reference as `../X.md`. Copied
# into the bundle root so the relative links resolve to a sibling instead
# of dangling.
ROOT_LEVEL_INCLUDES: Final[tuple[str, ...]] = (
    "DISCLAIMER.md",
    "PURPOSE.md",
    "CLAUDE.md",
    "AGENTS.md",
)

# Upstream artefacts the bundled CLI documents (cli/README.md links) and
# whose contents the TypeScript plugin ports mirror line-by-line. Keeping
# them lets the bundle remain auditable against the source-of-truth that
# the inline `// mirrors src/fdpm/plugins/X.py lines NNN-MMM` comments
# point at. Placed under `references/` so they stay clearly read-only.
REFERENCE_INCLUDES: Final[tuple[tuple[str, str], ...]] = (
    ("docs/specs/SPEC-CORE.md", "references/specs/SPEC-CORE.md"),
    ("docs/specs/SPEC-PLUGGABLE-ARCHITECTURE.md",
     "references/specs/SPEC-PLUGGABLE-ARCHITECTURE.md"),
    ("docs/specs/SPEC-CEL-VALIDATOR.md",
     "references/specs/SPEC-CEL-VALIDATOR.md"),
    ("docs/specs/SPEC-EXPRESSION-RUNTIME.md",
     "references/specs/SPEC-EXPRESSION-RUNTIME.md"),
    ("docs/specs/SPEC-RENDER-DSL.md",
     "references/specs/SPEC-RENDER-DSL.md"),
    ("docs/specs/SPEC-UID.md", "references/specs/SPEC-UID.md"),
    ("docs/specs/SPEC-DNIS.md", "references/specs/SPEC-DNIS.md"),
    ("src/fdpm/plugins/formal_specification.py",
     "references/python-sources/formal_specification.py"),
    ("src/fdpm/plugins/software_architecture.py",
     "references/python-sources/software_architecture.py"),
)

# Directory names excluded anywhere they appear inside the cli/ tree.
EXCLUDED_DIR_NAMES: Final[frozenset[str]] = frozenset({
    "node_modules",
    "dist",
    "coverage",
    ".git",
    ".agent-tasks",
    ".vscode",
    ".idea",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    ".turbo",
})

# File suffixes / names excluded anywhere.
EXCLUDED_FILE_SUFFIXES: Final[frozenset[str]] = frozenset({
    ".pyc", ".pyo", ".log", ".tmp",
})
EXCLUDED_FILE_NAMES: Final[frozenset[str]] = frozenset({
    ".DS_Store", "Thumbs.db",
})


# ───────────────────────────────────────────────────────────────────────
# helpers
# ───────────────────────────────────────────────────────────────────────


def read_cli_version() -> str:
    """Read `version` from cli/package.json. Falls back to 'unknown'."""
    pkg = CLI_DIR / "package.json"
    try:
        with pkg.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
        version = data.get("version")
        if isinstance(version, str) and version:
            return version
    except (OSError, json.JSONDecodeError):
        pass
    return "unknown"


def is_excluded(path: Path) -> bool:
    """Return True if any path component is in the exclusion set."""
    if path.name in EXCLUDED_FILE_NAMES:
        return True
    if path.suffix in EXCLUDED_FILE_SUFFIXES:
        return True
    parts = set(path.parts)
    return bool(parts & EXCLUDED_DIR_NAMES)


def iter_cli_files() -> Iterable[Path]:
    """Yield every non-excluded file under cli/, as absolute paths."""
    for root, dirs, files in os.walk(CLI_DIR):
        # Mutate `dirs` in place so os.walk skips excluded subtrees.
        dirs[:] = [d for d in dirs if d not in EXCLUDED_DIR_NAMES]
        root_path = Path(root)
        for name in files:
            file_path = root_path / name
            rel = file_path.relative_to(CLI_DIR)
            if is_excluded(rel):
                continue
            yield file_path


def make_arcname(prefix: str, rel_path: str) -> str:
    """Join the bundle prefix and a relative POSIX path."""
    rel_path = rel_path.lstrip("/")
    return f"{prefix}/{rel_path}" if rel_path else prefix


# ───────────────────────────────────────────────────────────────────────
# bundle assembly
# ───────────────────────────────────────────────────────────────────────


def add_cli_tree(tar: tarfile.TarFile, prefix: str) -> tuple[int, int]:
    """Add every cli/ file under `<prefix>/`. Return (file_count, byte_total)."""
    count = 0
    total_bytes = 0
    for src in sorted(iter_cli_files()):
        rel = src.relative_to(CLI_DIR).as_posix()
        arcname = make_arcname(prefix, rel)
        tar.add(src, arcname=arcname, recursive=False)
        count += 1
        total_bytes += src.stat().st_size
    return count, total_bytes


def add_root_level_includes(tar: tarfile.TarFile, prefix: str) -> int:
    """Pull project-level files (DISCLAIMER, PURPOSE, …) into bundle root."""
    added = 0
    for name in ROOT_LEVEL_INCLUDES:
        src = REPO_ROOT / name
        if not src.is_file():
            print(f"  warning: missing root-level file {src}", file=sys.stderr)
            continue
        tar.add(src, arcname=make_arcname(prefix, name), recursive=False)
        added += 1
    return added


def add_reference_includes(tar: tarfile.TarFile, prefix: str) -> int:
    """Snapshot the upstream sources cli/ docs and ports point at."""
    added = 0
    for src_rel, dst_rel in REFERENCE_INCLUDES:
        src = REPO_ROOT / src_rel
        if not src.is_file():
            print(f"  warning: missing reference file {src}", file=sys.stderr)
            continue
        tar.add(src, arcname=make_arcname(prefix, dst_rel), recursive=False)
        added += 1
    return added


def add_bundle_manifest(
    tar: tarfile.TarFile,
    prefix: str,
    *,
    cli_files: int,
    cli_bytes: int,
    root_files: int,
    reference_files: int,
    version: str,
    include_references: bool,
) -> None:
    """Write a small JSON manifest describing what's inside the tarball."""
    import io
    from datetime import datetime, timezone

    manifest = {
        "name": "fdpm-cli",
        "version": version,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "generator": "cli/scripts/bundle-standalone.py",
        "contents": {
            "cli_files": cli_files,
            "cli_bytes": cli_bytes,
            "root_level_files": root_files,
            "reference_files": reference_files,
            "references_included": include_references,
        },
        "layout": {
            "/": "cli/ tree, flattened (package.json, src/, plugins/, tests/, ...)",
            "/DISCLAIMER.md, /PURPOSE.md, /CLAUDE.md, /AGENTS.md":
                "Project-level files; cli/README.md and cli/MANUAL.md "
                "reference these via `../X.md`.",
            "/references/specs/":
                "SPEC documents the CLI implements; cited by README/MANUAL.",
            "/references/python-sources/":
                "Upstream Python plugin sources whose shape the TypeScript "
                "ports under plugins/{formal_specification,software_architecture}/ "
                "mirror line-by-line.",
        },
    }
    payload = json.dumps(manifest, indent=2).encode("utf-8") + b"\n"

    info = tarfile.TarInfo(name=make_arcname(prefix, "BUNDLE-MANIFEST.json"))
    info.size = len(payload)
    info.mode = 0o644
    info.mtime = int(datetime.now(timezone.utc).timestamp())
    tar.addfile(info, io.BytesIO(payload))


# ───────────────────────────────────────────────────────────────────────
# main
# ───────────────────────────────────────────────────────────────────────


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="bundle-standalone.py",
        description=(
            "Package cli/ as a self-contained `fdpm-cli` codebase tarball."
        ),
    )
    parser.add_argument(
        "-o", "--output",
        type=Path,
        default=None,
        help=(
            "Output tarball path. Default: "
            "<repo>/dist-bundle/fdpm-cli-<version>.tar.<ext>"
        ),
    )
    compression = parser.add_mutually_exclusive_group()
    compression.add_argument(
        "--gzip", dest="compression", action="store_const", const="gz",
        help="Use gzip compression (default)",
    )
    compression.add_argument(
        "--bzip2", dest="compression", action="store_const", const="bz2",
        help="Use bzip2 compression",
    )
    compression.add_argument(
        "--xz", dest="compression", action="store_const", const="xz",
        help="Use xz compression (smaller, slower)",
    )
    compression.add_argument(
        "--none", dest="compression", action="store_const", const="",
        help="No compression (plain .tar)",
    )
    parser.set_defaults(compression="gz")

    parser.add_argument(
        "--no-references",
        action="store_true",
        help=(
            "Do not include references/ (specs + Python sources). "
            "Use when bundling for a distribution where references are "
            "tracked separately."
        ),
    )
    parser.add_argument(
        "--prefix",
        default="fdpm-cli",
        help="Top-level directory inside the tarball (default: fdpm-cli)",
    )
    parser.add_argument(
        "--quiet", "-q",
        action="store_true",
        help="Suppress progress output",
    )
    return parser.parse_args(argv)


def resolve_output_path(args: argparse.Namespace, version: str) -> Path:
    if args.output is not None:
        return args.output.resolve()
    ext = ".tar" if args.compression == "" else f".tar.{args.compression}"
    return REPO_ROOT / "dist-bundle" / f"fdpm-cli-{version}{ext}"


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv if argv is not None else sys.argv[1:])

    if not CLI_DIR.is_dir():
        print(f"error: cli/ not found at {CLI_DIR}", file=sys.stderr)
        return 1

    version = read_cli_version()
    out_path = resolve_output_path(args, version)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    mode = "w" if args.compression == "" else f"w:{args.compression}"

    if not args.quiet:
        print(f"bundling fdpm-cli v{version}")
        print(f"  source: {CLI_DIR}")
        print(f"  output: {out_path}")
        print(f"  prefix: {args.prefix}/")
        print(f"  compression: {args.compression or 'none'}")

    with tarfile.open(out_path, mode=mode) as tar:
        cli_files, cli_bytes = add_cli_tree(tar, args.prefix)
        if not args.quiet:
            print(f"  + cli/: {cli_files} files, {cli_bytes:,} bytes")

        root_files = add_root_level_includes(tar, args.prefix)
        if not args.quiet:
            print(f"  + root-level: {root_files} files")

        reference_files = 0
        if not args.no_references:
            reference_files = add_reference_includes(tar, args.prefix)
            if not args.quiet:
                print(f"  + references/: {reference_files} files")

        add_bundle_manifest(
            tar, args.prefix,
            cli_files=cli_files,
            cli_bytes=cli_bytes,
            root_files=root_files,
            reference_files=reference_files,
            version=version,
            include_references=not args.no_references,
        )

    final_size = out_path.stat().st_size
    if not args.quiet:
        print(f"done: {out_path} ({final_size:,} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
