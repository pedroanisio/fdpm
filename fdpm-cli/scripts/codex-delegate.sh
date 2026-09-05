#!/usr/bin/env bash
#
# Run the Codex CLI non-interactively under a declared delegation mode, and
# refuse to hand the orchestrator anything that has not crossed the boundary.
#
# ARCHITECTURAL REQUIREMENT: LLMs will always produce some form of error.
# Absence of output verification is a design defect, not a runtime bug.
# All LLM output must be treated as untrusted and validated explicitly.
#
# This script is deliberately thin. It captures git state, appends the mode's
# machine-checkable return contract to the work order, runs `codex exec` in the
# sandbox tier the mode declares, and then hands the raw return to
# scripts/codex-delegation/verify-return.ts, which is where the five checks
# live and where they are unit-tested. On any failure this script exits
# non-zero and prints the failures; it never prints an unvalidated return.
#
# The mode records this script derives its behaviour from live in
# scripts/codex-delegation/seed.ts and are registered in the fdpm workbook
# `codex-delegation`, where profile:codex-delegation:0.1 enforces that no mode
# runs without a sandbox, that no mode holds git authority, and that a writing
# mode refuses to run outside a git working tree.
#
#   codex-delegate.sh --repo DIR --mode research|patch|write \
#                     --prompt-file FILE [--output FILE] [--model M] [--effort E]
#
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
pkg="$(cd "$here/.." && pwd)"
root="$(cd "$here/../.." && pwd)"
scratch="$root/_tmp/codex-delegate"
mkdir -p "$scratch"

# Resolve tsx from this package rather than through `npx`, which resolves from
# the caller's working directory: the wrapper is normally invoked with the
# TARGET repository as cwd, where `npx tsx` would try to download a copy.
tsx="$pkg/node_modules/.bin/tsx"
for tool in codex jq git; do
  command -v "$tool" >/dev/null || { echo "required tool not on PATH: $tool" >&2; exit 2; }
done
[[ -x "$tsx" ]] || { echo "tsx not installed; run npm install in $pkg" >&2; exit 2; }

repo="" prompt="" out="" mode="" model="" effort=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)        repo="$2"; shift 2 ;;
    --prompt-file) prompt="$2"; shift 2 ;;
    --output)      out="$2"; shift 2 ;;
    --mode)        mode="$2"; shift 2 ;;
    --model)       model="$2"; shift 2 ;;
    --effort)      effort="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

[[ -d "$repo" && -f "$prompt" ]] || { echo "need --repo DIR and --prompt-file FILE" >&2; exit 2; }
repo="$(cd "$repo" && pwd)"

# --- Mode -------------------------------------------------------------------
# The sandbox tier is not a flag the caller may choose. It is a property of the
# mode, and it is the only containment a non-interactive run has: there is no
# prompt surface to answer an approval on, so `approval_policy="never"` is
# forced and the tier carries the whole weight.
case "$mode" in
  research) sandbox="read-only"; requires_git=0 ;;
  patch) sandbox="read-only"; requires_git=1 ;;
  write) sandbox="workspace-write"; requires_git=1 ;;
  *) echo "--mode must be research, patch or write" >&2; exit 2 ;;
esac

is_git=0
if git -C "$repo" rev-parse --is-inside-work-tree >/dev/null 2>&1; then is_git=1; fi
if [[ $requires_git -eq 1 && $is_git -eq 0 ]]; then
  echo "$mode mode requires a git working tree so the change is diffable and revertible" >&2
  exit 2
fi

run="$(date -u +%Y%m%dT%H%M%SZ)-$mode-$$"
order="$scratch/$run.order.md"
raw="$scratch/$run.return.json"
before="$scratch/$run.git-before.json"
after="$scratch/$run.git-after.json"
[[ -n "$out" ]] || out="$scratch/$run.validated.json"

# --- Git snapshot -----------------------------------------------------------
# Read from git, never from the return. A subordinate agent that commits and
# then reports committed:false fails the same comparison as an honest one.
cdel_git_snapshot() {
  local target="$1"
  if [[ $is_git -eq 0 ]]; then
    printf '{"head":"not-a-git-repo","status_digest":"not-a-git-repo","stash_list":"not-a-git-repo","ref_list":"not-a-git-repo"}\n' > "$target"
    return 0
  fi
  local head status_digest stash refs
  head="$(git -C "$repo" rev-parse HEAD 2>/dev/null || echo "no-head")"
  status_digest="$(git -C "$repo" status --porcelain | sha256sum | cut -d' ' -f1)"
  stash="$(git -C "$repo" stash list | sha256sum | cut -d' ' -f1)"
  refs="$(git -C "$repo" show-ref | sha256sum | cut -d' ' -f1)"
  jq -n --arg h "$head" --arg s "$status_digest" --arg t "$stash" --arg r "$refs" \
    '{head:$h, status_digest:$s, stash_list:$t, ref_list:$r}' > "$target"
}

# --- Work order -------------------------------------------------------------
# The return contract is a JSON Schema the wrapper enforces, not a paragraph
# asking for a particular shape. A prose return contract is not a contract.
schema="$("$tsx" "$here/codex-delegation/print-mode.ts" "$mode" --schema)"
{
  cat "$prompt"
  echo
  echo "## Return contract"
  echo
  echo "Return exactly one JSON object and nothing else: no prose before it, no code fence around it."
  echo "It is validated against this JSON Schema before anyone reads it; a return that fails is discarded, not repaired."
  echo
  echo '```json'
  echo "$schema"
  echo '```'
  echo
  echo "Every path you name must exist in the repository. Every quote you attribute to a file must appear in that file verbatim, at the line you cite. You hold no git authority: do not commit, push, stage, stash, tag or rewrite history."
} > "$order"

# --- Run --------------------------------------------------------------------
# --strict-config makes an unrecognised -c key a hard error. Without it a
# renamed config key is accepted and silently ignored, which is how a run ends
# up with a policy nobody applied and no error to show for it.
args=(exec --strict-config --cd "$repo" --sandbox "$sandbox" -c 'approval_policy="never"' --output-last-message "$raw")
[[ -n "$effort" ]] && args+=(-c "model_reasoning_effort=\"$effort\"")
[[ -n "$model" ]] && args+=(--model "$model")
[[ $is_git -eq 0 ]] && args+=(--skip-git-repo-check)

cdel_git_snapshot "$before"
set +e
codex "${args[@]}" - < "$order"
codex_status=$?
set -e
cdel_git_snapshot "$after"

if [[ $codex_status -ne 0 ]]; then
  echo "codex exec exited $codex_status; no return to verify" >&2
  exit "$codex_status"
fi
[[ -s "$raw" ]] || { echo "codex exec produced no last message" >&2; exit 1; }

# --- Boundary ---------------------------------------------------------------
# cdel.json_contract, cdel.paths_exist, cdel.quotes_match, cdel.diff_applies
# and cdel.no_git_mutation, in one pass, reporting every failure rather than
# the first.
set +e
verdict="$("$tsx" "$here/codex-delegation/verify-return.ts" \
  --mode "$mode" --repo "$repo" --return "$raw" --git-before "$before" --git-after "$after")"
verify_status=$?
set -e

if [[ $verify_status -ne 0 ]]; then
  echo "delegation rejected at the verification boundary; the return was NOT accepted:" >&2
  echo "$verdict" >&2
  echo "raw return kept for review at $raw" >&2
  exit 1
fi

# What the orchestrator receives is the envelope, never the raw message: the
# mode the return was checked under, the fact that it was checked, and the
# payload that passed. `validated` can only ever be true here, because a
# failed verification exited above.
printf '%s\n' "$verdict" | jq --arg m "$mode" '{mode: $m, validated: true, return: .value}' > "$out"
echo "$out"
