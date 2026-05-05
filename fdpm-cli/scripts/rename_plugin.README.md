---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Opus 4.7 via Claude Code"
  date: "2026-05-05"
---

# rename_plugin.py

Parameterized plugin-rename tool: rewrites a single FDPM plugin's
identifier surfaces (per [SPEC-PLUGIN-NAMING.md](../../docs/specs/SPEC-PLUGIN-NAMING.md) §5.2)
across the codebase — manifest id, profile id, type prefix, capability
local name, plus the plugin's directory tree and any `extends`
references in dependent plugins.

## Disclaimer

This work is subject to the methodological caveats and commitments
described in [@DISCLAIMER.md](../../../DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or
> verifiable reference should be taken for granted.

---

## Why this is a different tool than `rename_project_to_workbook.py`

`rename_project_to_workbook.py` is a **global concept rename** —
every standalone `workbook` token across the codebase becomes
`workbook`, with `\b` word boundaries and a `projection`-skip rule.
That works because `workbook` is a Core noun referenced everywhere.

A **plugin rename** is structurally different. We want to rewrite
*only* the specific identifier surfaces a plugin produces, never
arbitrary prose mentions of the plugin's leaf word. Renaming
`fdpm.dnis` to `fdpm.infrastructure.dnis` should NOT rewrite every
heading and citation of "DNIS" in `SPEC-DNIS.md`; it should rewrite
`profile:dnis:` references and `fdpm.dnis` references, leaving prose
alone.

This script applies **exact-string** substitutions, not regex word
boundaries. The substitutions are derived from the source plugin's
own `fdpm-plugin.json` and `index.ts`, which makes them precise by
construction.

---

## What gets renamed

Per [SPEC-PLUGIN-NAMING.md §5.2](../../docs/specs/SPEC-PLUGIN-NAMING.md) plus `extends` references:

| Surface | Source pattern | Target pattern | Example |
|---|---|---|---|
| Manifest id (JSON-quoted) | `"<source.manifest_id>"` | `"<target.manifest_id>"` | `"fdpm.spec-authoring"` → `"fdpm.documents.specifications"` |
| Manifest id (bare) | `<source.manifest_id>` | `<target.manifest_id>` | catches loader paths, README cross-refs |
| Profile id (any version) | `profile:<source.leaf>:` | `profile:<target.leaf>:` | covers `extends` references regardless of version |
| Type prefix | `<source.prefix>:` | `<target.prefix>:` | `spec:Document` → `specifications:Document` |
| Capability local_name | `"local_name": "<source.leaf>"` | `"local_name": "<target.leaf>"` | manifest JSON only |
| Directory tree | `plugins/<source.dir>/` | `plugins/<target.dir>/` | `plugins/spec_authoring/` → `plugins/documents/specifications/` |

Each substitution is logged in the substitution plan with a rationale.

## What does NOT get renamed

- Bare prose mentions of the plugin's leaf word ("the spec-authoring
  workflow" in narrative paragraphs, "DNIS" in headings).
- References that don't disambiguate as the plugin's identity surface
  — only the specific identifier patterns above are rewritten.
- Anything in the standard skip set: `node_modules`, `dist`, lockfiles,
  `CLAUDE.md`/`PURPOSE.md`/`DISCLAIMER.md`, `package.json`.

---

## Usage

### Dry run (default)

```bash
python3 fdpm-cli/scripts/rename_plugin.py \
  --source fdpm.spec-authoring \
  --target-id fdpm.documents.specifications \
  --target-leaf specifications \
  --target-directory documents/specifications
```

Prints the substitution plan to stderr, every per-file unified diff to
stdout, and writes `PLUGIN_RENAME_REPORT.md` at the repo root. No
filesystem mutations.

### Apply (creates a branch, stages, does not commit)

```bash
python3 fdpm-cli/scripts/rename_plugin.py \
  --source fdpm.spec-authoring \
  --target-id fdpm.documents.specifications \
  --target-leaf specifications \
  --target-directory documents/specifications \
  --apply
```

Creates branch `rename/plugin-spec-authoring-to-specifications` from
HEAD, performs the rewrite + path renames on it, runs `git add -A`,
and stops. **No commit.** Review with `git diff --staged` and commit
yourself.

### Inspect the plan without scanning files

```bash
python3 fdpm-cli/scripts/rename_plugin.py \
  --source fdpm.spec-authoring \
  --target-id fdpm.documents.specifications \
  --target-leaf specifications \
  --target-directory documents/specifications \
  --print-plan --no-diff
```

Same plan, no per-file diffs. Useful for checking the substitution
list before committing to a real run.

---

## Required arguments

| Flag | Meaning | Example |
|---|---|---|
| `--source` | Source plugin's manifest id (or bare leaf — script tries both directory forms) | `fdpm.spec-authoring` |
| `--target-id` | Target manifest id (full path) | `fdpm.documents.specifications` |
| `--target-leaf` | Target leaf — used for profile id, type prefix, capability `local_name` | `specifications` |
| `--target-directory` | Target directory relative to `plugins/` | `documents/specifications` |

Multi-rung `--target-directory` produces a nested directory tree per
[SPEC-PLUGIN-NAMING §5.2](../../docs/specs/SPEC-PLUGIN-NAMING.md).

## Optional arguments

| Flag | Default | Effect |
|---|---|---|
| `--target-prefix` | same as `--target-leaf` | Override the type prefix. Use only if claiming the SPEC §3.5 escape hatch. |
| `--source-prefix` | auto-detected | Override the inferred source prefix if the heuristic fails. |
| `--root` | repo root | Where to scan. |
| `--plugins-root` | `<root>/fdpm-cli/plugins` | Where to find `--source`. |
| `--branch` | `rename/plugin-<src.leaf>-to-<tgt.leaf>` | Branch name on `--apply`. |
| `--no-branch` | off | Mutate the current branch in place. |
| `--reuse-branch` | off | If `--branch` exists, switch to it instead of erroring. |
| `--allow-dirty` | off | Skip the clean-tree check. |
| `--no-stage` | off | Skip `git add -A`. |
| `--no-diff` | off | Suppress per-file diffs in dry-run. |
| `--print-plan` | off | Print the substitution plan to stderr. |

---

## How it infers the source plugin's prefix

The script reads the source plugin's `index.ts` and `primitives/*.ts`
files looking for `id: "<prefix>:Foo"` patterns. The first match's
prefix wins. Composition profiles (no `primitives/` dir, no
`relations.ts`) yield `None` — they have no type prefix to substitute.

If the heuristic is wrong (e.g., the prefix lives in an unusual file),
override with `--source-prefix`.

---

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success (dry-run or apply) |
| 1 | Unexpected error |
| 2 | Invalid invocation |
| 3 | Precondition failed (dirty tree, source manifest not found, branch exists, etc.) |
| 4 | Reserved (source plugin's structural shape is unknown — not yet enforced) |

---

## What this tool does NOT do

- **Does not migrate `structural_shape` / `composes_with_shapes`.** Those
  are SPEC §7.1 backfill items the operator must add by hand to each
  manifest.
- **Does not rewrite tests.** If a test asserts on the old manifest id
  or profile id, the substitutions catch them, but assertions on
  *behavioral* properties tied to the rename require operator review.
- **Does not bump SemVer.** A plugin rename is arguably a major
  version bump for the plugin and a breaking change for any external
  consumer; the operator is responsible for adjusting `version` in the
  manifest accordingly.
- **Does not validate the target against SPEC-PLUGIN-NAMING.** The
  script is SPEC-blind: it will let you rename to `fdpm.work.planning`
  even though `planning` is a gerund and §3.3 forbids it. The PR
  review (§8.3) is where this gets caught.
- **Does not touch external consumer config.** Any MCP client,
  saved workbook, or third-party tool that references the old profile
  id by name needs its own update.

---

## Comparison with `rename_project_to_workbook.py`

| Property | `rename_project_to_workbook.py` | `rename_plugin.py` |
|---|---|---|
| Target | One specific concept (`workbook` → `workbook`) | Any plugin (parameterized) |
| Substitution form | `\b`-anchored regex | Exact-string match |
| Casing variants | 9 hand-written variants | Auto-derived from manifest |
| Skip rule | `projection` substring | None (precision via exactness) |
| Branch default | `rename/workbook-to-workbook` | `rename/plugin-<src>-to-<tgt>` |
| Report file | `RENAME_REPORT.md` | `PLUGIN_RENAME_REPORT.md` |
| Workflow | Same: dry-run default, branch-creating, two-pass, no commit |
| Skip list | Same set of files/dirs |

---

## When to use this script vs. when not to

**Use this script when:**

- You're renaming a single plugin per [SPEC-PLUGIN-NAMING.md §3.7](../../docs/specs/SPEC-PLUGIN-NAMING.md) audit.
- You want the directory rename, manifest-id rewrite, and `extends`-reference
  rewrites done atomically on a branch.
- You want a deterministic, auditable substitution plan.

**Do NOT use this script when:**

- The rename involves changing the plugin's *structural shape* (that is
  a manifest field, not a name).
- You're renaming multiple plugins at once with interdependent changes
  (run the script once per plugin, on the same branch, and review the
  combined diff).
- The "rename" is actually a fork (you want both the old and new plugin
  to coexist) — this script removes the old plugin's identifiers
  entirely; for a fork, copy the directory by hand.

---

## See also

- [SPEC-PLUGIN-NAMING.md](../../docs/specs/SPEC-PLUGIN-NAMING.md) — naming convention this script enforces.
- [SPEC-PLUGGABLE-ARCHITECTURE.md §5.1](../../docs/specs/SPEC-PLUGGABLE-ARCHITECTURE.md) — manifest-id regex.
- `rename_project_to_workbook.py` — sibling tool for global concept renames.
