---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Opus 4.7 via Claude Code"
  date: "2026-05-05"
---

# rename_project_to_workbook.py

One-shot rename tool: rewrites the domain term `workbook` to `workbook`
across the fdpm-cli codebase — content, identifiers, and file/directory
names — with a curated skip list to avoid corrupting unrelated tokens.

## Disclaimer

This work is subject to the methodological caveats and commitments
described in [@DISCLAIMER.md](../../../DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or
> verifiable reference should be taken for granted.

---

## What it does

By default `--apply` creates a fresh git branch (default name:
`rename/workbook-to-workbook`) before doing anything else, performs the
rewrite on that branch, stages everything, and **does not commit** —
the operator reviews `git diff --staged` and commits manually. This
keeps the rename diff isolated and reversible.

The tool runs in three passes against a repo root (defaults to the
`fdpm-cli` repo root, two levels above the script):

1. **Content rewrite** — for every file with an extension in
   `.ts .tsx .js .jsx .mjs .cjs .json .md .mdx .yml .yaml .txt`,
   apply nine casing-aware substitutions, longest-first, each anchored
   with `\b` word boundaries:

   | from         | to            |
   | ------------ | ------------- |
   | `WORKBOOKS`   | `WORKBOOKS`   |
   | `Workbooks`   | `Workbooks`   |
   | `workbooks`   | `workbooks`   |
   | `workbook_id` | `workbook_id` |
   | `workbookId`  | `workbookId`  |
   | `WorkbookId`  | `WorkbookId`  |
   | `WORKBOOK`    | `WORKBOOK`    |
   | `Workbook`    | `Workbook`    |
   | `workbook`    | `workbook`    |

   Any line containing the substring `projection` (case-insensitive)
   is skipped wholesale — this protects the audit-replay domain
   (`projection.ts`, `Projection`, etc.) from being mangled into
   `workbookion`.

2. **Path renames** — every file or directory whose basename matches
   `*project*` (and does NOT contain `projection`) is renamed using
   the same substitutions. Renames are sorted deepest-first so
   children move before their parent's name changes. When the working
   tree is a git repo, `git mv` is used; otherwise `os.rename`.

3. **Meta-doc audit** — `CLAUDE.md`, `PURPOSE.md`, and `DISCLAIMER.md`
   are NEVER rewritten. The script still scans them and reports
   candidate match counts so the operator can review by hand.

A `RENAME_REPORT.md` is written to the repo root in both modes,
summarizing files modified, replacements made, paths renamed, and
meta-doc match counts left for manual review.

---

## What it does NOT touch

Hard skip list (never read, never rewritten, never renamed):

- Directories: `node_modules`, `dist`, `build`, `coverage`, `.git`,
  `.agent-tasks`, `.vite`, `.turbo`, `.next`, `.cache`, `.repo`
  (third-party skill bundles), `.claude` (local IDE/agent config).
- Files: `package.json`, `package-lock.json`, `pnpm-lock.yaml`,
  `yarn.lock`, `bun.lockb`, `rust.json`, `log.jsonl`,
  `RENAME_REPORT.md`, and the script itself.
- Meta docs: `CLAUDE.md`, `PURPOSE.md`, `DISCLAIMER.md` (operator
  review only).
- Anything matching the literal substring `projection` — file names,
  directory names, and individual lines of content.

Per the operator decision recorded in the rename request, the
`id_uniqueness` enum value `"workbook"` (in
`src/mcp/tools/profile-type-info.ts`) IS rewritten to `"workbook"`,
along with its test.

---

## Usage

The script defaults to `--dry-run`. Run it once in dry-run, review the
report and the diff, then run with `--apply`.

```bash
# from the fdpm-cli repo root (the directory that contains AGENTS.md)
cd /home/admin/github-mirror/_editors/fdpm-cli

# 1) dry run — writes RENAME_REPORT.md and prints unified diffs
python3 fdpm-cli/scripts/rename_project_to_workbook.py --dry-run > rename.diff

# 2) review
less rename.diff
less RENAME_REPORT.md

# 3) ensure the working tree is clean (commit or stash any pending work)
git status

# 4) apply — creates branch `rename/workbook-to-workbook`, rewrites,
#    stages the result. Does NOT commit.
python3 fdpm-cli/scripts/rename_project_to_workbook.py --apply

# 5) verify on the new branch
cd fdpm-cli && npm test
git diff --staged --stat

# 6) commit on your own
git commit -m "refactor: rename workbook -> workbook"
```

To use a different branch name:

```bash
python3 fdpm-cli/scripts/rename_project_to_workbook.py \
    --apply --branch refactor/workbook-rename
```

To mutate the current branch directly (legacy, not recommended):

```bash
python3 fdpm-cli/scripts/rename_project_to_workbook.py --apply --no-branch
```

### Flags

| flag              | meaning                                                                   |
| ----------------- | ------------------------------------------------------------------------- |
| `--root DIR`      | Repo root to operate on (default: two levels above the script).           |
| `--dry-run`       | Default. Print diffs to stdout, write the report, do not mutate.          |
| `--apply`         | Mutate the working tree. Mutually exclusive with `--dry-run`.             |
| `--no-diff`       | Suppress per-file unified diffs in dry-run output (still writes report).  |
| `--branch NAME`   | Branch name to create on `--apply` (default: `rename/workbook-to-workbook`). |
| `--no-branch`     | Do not create a branch; mutate the current branch in place. Required for non-git trees. |
| `--reuse-branch`  | If `--branch` already exists, switch to it instead of erroring.           |
| `--allow-dirty`   | Skip the clean-working-tree check before creating the branch.             |
| `--no-stage`      | Skip the `git add -A` step after the rewrite.                             |

### Branch guardrails (apply mode)

When `--apply` runs in default branch mode, the script enforces:

1. The repo root must be a git working tree. (Override: `--no-branch`.)
2. The working tree must be clean — no staged or unstaged changes.
   (Override: `--allow-dirty`.)
3. The target branch name must not already exist. (Override:
   `--reuse-branch` to switch to it instead.)

If any check fails the script exits `3` without mutating anything.

### Exit codes

- `0` — success (dry-run or apply).
- `1` — unexpected error.
- `2` — invalid invocation (e.g. `--root` does not exist).
- `3` — precondition failed (dirty tree, branch already exists,
  not a git repo, etc.).
- `130` — interrupted (`Ctrl-C`).

---

## Expected scope

On the current `main` branch, dry-run reports:

- 371 files scanned
- 250 files modified
- 3,900 content replacements
- 8 path renames:
  - `fdpm-cli/src/commands/workbook.ts` → `workbook.ts`
  - `fdpm-cli/src/mcp/tools/workbook-{create,delete,list,get}.ts` →
    `workbook-{create,delete,list,get}.ts`
  - `fdpm-cli/tests/workbook-command.test.ts` → `workbook-command.test.ts`
  - `fdpm-cli/tests/host-reload-workbook-tail.test.ts` →
    `host-reload-workbook-tail.test.ts`
  - `fdpm-cli/tests/sdk-define-workbook.test.ts` →
    `sdk-define-workbook.test.ts`
- Meta docs left untouched: `CLAUDE.md` (14 candidate lines),
  `PURPOSE.md` (3 candidate lines).

These numbers will drift as the tree changes. Treat them as an
expected magnitude, not a fixed contract.

---

## Residual risk the tool cannot catch

- **Concatenated or templated identifiers.** A literal like
  `` `fdpm.${"workbook"}.create` `` would be rewritten on the inner
  string but the outer template might still produce a stale name at
  runtime. Verify via the test suite; a clean `npm test` is the
  authoritative check.
- **External MCP clients** with hard-coded `fdpm.workbook.*` tool
  names. The script renames the server-side definitions; clients
  outside this repo must be updated separately.
- **URI compatibility.** `fdpm://workbook/{id}/render/...` resources
  become `fdpm://workbook/{id}/render/...`. There is no
  backwards-compat alias layer — that is a separate decision.
- **Generated files.** Anything written by other build scripts at
  runtime (e.g. into `dist/`, `log.jsonl`, `rust.json`) is not
  rewritten; regenerate after applying the rename.

---

## Recovery

The script does not commit. If the result is wrong, recovery is just
a branch switch:

```bash
# discard everything on the rename branch and go back to where you were
git switch -                          # back to the previous branch
git branch -D rename/workbook-to-workbook
```

If you used `--no-branch` (legacy mode):

```bash
git restore .                           # discard content changes
git restore --staged .                  # if anything was staged
# for path renames already executed via git mv, undo with:
git mv fdpm-cli/src/commands/workbook.ts fdpm-cli/src/commands/workbook.ts
# ...repeat for each rename listed in RENAME_REPORT.md
```

If `--apply` was run on a non-git tree, restore from your backup; the
script does not snapshot.

---

## File reference

- Script: [rename_project_to_workbook.py](rename_project_to_workbook.py)
- Generated report: `RENAME_REPORT.md` at the repo root.
