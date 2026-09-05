---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Fable 5.1 via Claude Code"
  date: "2026-09-05"
---

# Delegating to the Codex CLI, with a verification boundary

## Claude Code plans and reviews; Codex executes; nothing crosses between them unchecked

## Disclaimer

This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](../DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.

---

Claude Code and the Codex CLI run side by side in the VS Code integrated
terminal. Claude Code owns the session: it reads the goal, decides the
approach, integrates results, and holds every git operation. Codex runs out of
band through `codex exec`, receives a written work order, and returns a file.

The interesting part is not the plumbing. It is what happens to the file Codex
returns. A second model's output is untrusted input, and a delegation setup
whose only control is "read it carefully" has no verification layer at all —
it has an instruction, which is a different thing. This guide sets up three
layers plus the executor that runs them, and each is independently useful:

| Level | What it adds | Where it lives |
|---|---|---|
| 1 | A wrapper that runs Codex in a declared sandbox and validates the return against a JSON Schema — and, for proof attempts, executes the artifact and resolves every reference — before you read it | [`fdpm-cli/scripts/codex-delegate.sh`](../fdpm-cli/scripts/codex-delegate.sh), [`verify-return.ts`](../fdpm-cli/scripts/codex-delegation/verify-return.ts) |
| 2 | The pipeline as validated data in an fdpm workbook: agents, stages, contracts, tool grants, delegation modes | [`scripts/codex-delegation/seed.ts`](../fdpm-cli/scripts/codex-delegation/seed.ts) |
| 3 | A Silent Acceptance v2.1.0 verification boundary per stage, over all nine error classes, with the operator as acceptance authority | same seed, `profile:codex-delegation:0.2` |
| — | An executor that runs any loop-forward pipeline to a terminal state and writes the run receipt | [`fdpm-cli/src/loop/`](../fdpm-cli/src/loop/), [`scripts/run-loop-forward.ts`](../fdpm-cli/scripts/run-loop-forward.ts) |

Level 1 works on its own. Levels 2 and 3 make the containment auditable
instead of asserted, which matters once more than one person — or more than
one agent — is editing the setup. The executor is what makes the frontier-proof
loop ([`scripts/frontier-proof-loop/`](../fdpm-cli/scripts/frontier-proof-loop/README.md))
a thing that runs rather than a thing that is described.

---

## 1. Prerequisites

- VS Code with the integrated terminal (any shell; the scripts assume bash or zsh)
- Node.js 18 or later
- A Claude subscription or Anthropic API key
- A ChatGPT plan or OpenAI API key for Codex
- `jq` and `bwrap` (bubblewrap) on the PATH — the wrapper uses `jq` for git
  snapshots and the return envelope, and `bwrap` to execute proof artifacts
  with the host read-only and no network
- For `attempt` mode: PARI/GP (`/usr/bin/gp`), Python 3, and a Lean 4
  toolchain via `elan` with the mathlib project under
  `fdpm-cli/scripts/frontier-proof-loop/fplproofs/` (`lake exe cache get`)
- A git repository to work in

---

## 2. Install and authenticate both agents

```bash
npm i -g @anthropic-ai/claude-code
npm i -g @openai/codex        # macOS alternative: brew install --cask codex
codex login                   # opens a browser; ChatGPT plan or API key
```

Confirm both sides before writing any configuration:

```bash
claude --version
codex --version
codex login status            # expect "Logged in using ChatGPT" or an API-key line
codex exec --help
```

The wrapper depends on six `codex exec` features: `--cd`, `--sandbox` with the
values `read-only` and `workspace-write`, `--output-last-message`, `-c
key=value` config overrides, `--skip-git-repo-check`, and `--strict-config`.
All six are present in **codex-cli 0.153.2**, the version this guide was
verified against on 2026-09-05 with two real delegations (§7). If one is
missing from `--help`, your version differs and the wrapper needs adjusting.

`--strict-config` is the one people leave out, and it is load-bearing: without
it, an unrecognised `-c` key is accepted and silently ignored, so a renamed
config key gives you a run under a policy nobody applied and no error to show
for it. With it, the run fails loudly. `model_reasoning_effort` is a key this
Codex version knows — it is set in the operator's own `~/.codex/config.toml`,
which also pins `model = "gpt-6-astra"`.

---

## 3. Level 1 — the wrapper

The wrapper is a file in this repository, not a snippet to paste:

```
fdpm-cli/scripts/codex-delegate.sh                    the entry point
fdpm-cli/scripts/codex-delegation/verify-return.ts    the boundary (calls into src/loop)
fdpm-cli/scripts/codex-delegation/print-mode.ts       the mode records
fdpm-cli/src/loop/checks/                             the checks themselves, shared with the executor
```

Earlier revisions of this guide inlined the script. That is how a guide and a
tool drift apart: the copy in the prose stops matching the copy on disk and
nothing notices. Read the file.

### 3.1 What it does

1. Snapshots git — `HEAD`, a digest of `git status --porcelain`, the stash
   list, the ref list — before anything runs.
2. Appends the mode's JSON Schema to your work order as an enforced return
   contract.
3. Runs `codex exec` with the sandbox tier the mode declares.
4. Snapshots git again.
5. Runs every check that applies to the mode, reporting every failure rather
   than the first.
6. On success, prints the path to a validated envelope `{mode, validated,
   return}`. On any failure, exits non-zero, prints the failures, and keeps the
   raw return for review. **It never prints an unvalidated return.**

### 3.2 The checks

| Check | Modes | Catches | How |
|---|---|---|---|
| `cdel.json_contract` | all | `ERR_SCHEMA`, `ERR_OMISSION`, `ERR_TRUNCATION` | Parses exactly one JSON object and validates it against the mode's schema. A code fence, a preamble, or a trailing apology all fail. |
| `cdel.paths_exist` | research, patch, write | `ERR_HALLUCINATION` | Every cited path is resolved inside the delegation repository and stat-ed. An absolute path or one escaping through `..` is rejected without touching the filesystem. |
| `cdel.quotes_match` | research | `ERR_HALLUCINATION` | Every evidence quote must appear as a fixed string in the file it is attributed to, at the line cited. A paraphrase fails even when the path is real. |
| `cdel.diff_applies` | patch | `ERR_REASONING` | The diff is fed to `git apply --check`. |
| `cdel.no_git_mutation` | all | `ERR_INSTRUCTION` | The two git snapshots are compared. |
| `fpl.formal_artifact_check` | attempt | `ERR_HALLUCINATION` | The artifact is executed under bubblewrap; `proved`, `computed` and `refuted` require exit 0 **and** no runner error marker (PARI/GP exits 0 after an error and keeps going); `prose` is allowed only with `partial` or `failed`. |
| `fpl.reference_resolves` | attempt | `ERR_HALLUCINATION` | Every DOI, arXiv id or https locator is retrieved and the title found there must match the cited title after normalisation. |

`cdel.no_git_mutation` reads git, never the return. A subordinate agent that
commits and then reports `committed: false` fails the same comparison as an
honest one. A producer that attests to its own compliance is not a control.
It also cannot tell the agent's edits from anyone else's: a delegation whose
target repository is being edited by someone else during the run is rejected,
and that is the right answer — the run's isolation assumption failed, whoever
broke it (§7 shows exactly this happening).

`cdel.quotes_match` is the check that changes how delegation feels. Before it,
"Codex said this file says X" is a claim you have to go verify. After it, the
quote is verbatim or the delegation failed — and what is left for you to judge
is whether the *conclusion* follows, which is the part a machine cannot do for
you. `fpl.formal_artifact_check` is the same move for mathematics: "the
script proves it" becomes "the script ran, here, in a sandbox, and exited
clean".

### 3.3 The four modes

```bash
npx tsx fdpm-cli/scripts/codex-delegation/print-mode.ts research
npx tsx fdpm-cli/scripts/codex-delegation/print-mode.ts attempt --schema
```

| Mode | Sandbox | Writes | Requires git | Returns |
|---|---|---|---|---|
| `research` | `read-only` | no | no | `{answer, evidence[], confidence, open_questions, unverified_claims}` |
| `patch` | `read-only` | no | yes | `{diff, target_files, explanation, verification_commands, applied:false}` |
| `write` | `workspace-write` | yes | yes | `{files_changed, commands_run, results, risks, committed:false}` |
| `attempt` | `read-only` | no | no | `{status, artifact_kind, artifact, reproduction_command, summary, claims[], references[], obstructions[], self_reported_confidence}` |

`attempt` is the frontier-proof loop's solver step. The tree is read-only
throughout: what the subordinate agent proposes, the boundary executes. Its
artifact kinds are `lean4` (checked in the mathlib project), `cas` (PARI/GP)
and `python` (`-I`, exact integers), plus `prose` for a step the agent could
not complete.

Three properties hold in every mode, and they are enforced by
`profile:codex-delegation:0.2`, not by this paragraph:

- **No mode uses `danger-full-access`.** A non-interactive run has no approval
  surface, so `approval_policy="never"` is forced and the sandbox tier is the
  only containment left. Delegation with no containment is not delegation.
- **No mode holds git authority.** Commits, pushes, releases and sign-off are
  yours. An agent that can commit can erase the diff you were going to review.
- **A writing mode refuses to run outside a git working tree**, because an edit
  that cannot be diffed or reverted removes the review step delegation exists
  for.

There is no `--network` flag. Network access inside a write sandbox is an
escalation with no verification story attached, and it was removed rather than
left as an option nobody would remember to justify.

### 3.4 Scratch files

All scratch — work orders, raw returns, git snapshots, executed artifacts — is
written under `_tmp/codex-delegate/` at this repository's root, which is
git-ignored and which you can read, diff and delete. Nothing goes to the
system temp directory: work you cannot see or review is unauditable, and it
outlives the repository it belonged to.

### 3.5 Install it as a skill

```bash
mkdir -p ~/.claude/skills/delegate-to-codex
```

Save as `~/.claude/skills/delegate-to-codex/SKILL.md`, adjusting the absolute
path to your checkout:

```markdown
---
name: delegate-to-codex
description: Delegate work to the Codex CLI — large read-heavy investigations, bulk patch drafting, bounded mechanical implementation, a cross-model second opinion on a design or diff, or one machine-checkable step of a proof. Claude keeps design, review, verification, and all git operations.
---

# Delegate to Codex

Codex starts with zero session context. Write a work order to a file
containing: goal and success criteria, absolute repo path, relevant files and
symbols, constraints and non-goals (including files not to touch), and the
exact proof command. Do NOT write a return contract by hand — the wrapper
appends the mode's JSON Schema and enforces it.

Invoke only through the wrapper, as a background Bash task:

    /abs/path/to/fdpm-cli/scripts/codex-delegate.sh \
      --repo /abs/path --mode research|patch|write|attempt \
      --prompt-file <repo>/_tmp/order.md

The wrapper prints the path of a validated envelope, or exits non-zero with the
failures. A non-zero exit means there is no return: do not read the raw file
and act on it. Re-delegate with the failure in hand, or take the task over.
Do not edit the target repository while a delegation is running against it;
the git-mutation check will reject the run, and it will be right to.

Never pass --yolo, --dangerously-bypass-approvals-and-sandbox, or
danger-full-access; the wrapper does not accept them. After two failed rounds,
stop delegating and do the task.
```

---

## 4. Level 1 — the routing policy

Append to `~/.claude/CLAUDE.md` for a personal default, or to a repository's
`CLAUDE.md` to share it. Project-level files take precedence.

```markdown
## Delegation

On nontrivial tasks, act as an orchestrator. Keep your own turns for goal
understanding, architecture, judgment calls, integration and final review.
Push context-heavy and mechanical work out of this conversation.

Route to Codex (delegate-to-codex skill) for: whole-module audits, sweeping
migrations, bulk patch drafting across many files, second opinions from a
different model family on a design or diff, and single machine-checkable
steps of a proof (attempt mode).

Route to Claude subagents for anything that needs session context, MCP tools,
or tight back-and-forth with you.

Never delegate: architectural decisions, ambiguous specs, secrets, commits,
pushes, releases, destructive operations, or final sign-off. Single-file edits
are cheaper to do directly.

A validated return is structurally valid, not correct. Before integrating,
open the files it cites yourself.
```

Short policy statements work better than long rulebooks: a compact contract is
followed more reliably than an enumerated checklist.

---

## 5. Level 2 — the pipeline as a workbook

Everything above is a shell script and a paragraph of prose. Level 2 makes it
data the host validates.

```bash
cd fdpm-cli

# Build into a throwaway data dir first.
FDPM_DATA_DIR=$(mktemp -d) npx tsx scripts/build-codex-delegation.ts

# Or against the data dir the fdpm MCP server serves (default ~/.fdpm-cli),
# then send the server SIGHUP so it reloads. Re-runnable: an already
# registered profile is reported, not overwritten.
npx tsx scripts/build-codex-delegation.ts

# Inspect without touching any host.
npx tsx scripts/build-codex-delegation.ts --print | jq '.profile.validation_rules[].id'
```

This registers `profile:codex-delegation:0.2` — a composition extending
`profile:loop-forward:2.0` and `profile:silent-acceptance:2.1` — and seeds the
workbook `codex-delegation` with:

- **2 agents** with their tool grants. The subordinate agent's grant list is
  the containment: three read grants, no write authority, no git tool. The
  orchestrator holds the git authority precisely so the subordinate does not
  have to.
- **4 stages** — `order`, `delegate`, `review`, `apply` — each with a closed
  output contract and its validators. The delegate stage's contract declares
  no retry, because the wrapper never re-prompts: a failed delegation is a
  failed delegation, and re-delegating is the orchestrator's decision.
- **4 delegation modes**, each bound to the `lf:OutputContract` whose schema
  the wrapper enforces. `verify-return.ts` imports these schemas from the same
  file the workbook is built from, so the contract the wrapper enforces and the
  contract the workbook declares are the same object and cannot drift.
- **4 adversarial examples**, including an invented path, a self-commit, and a
  review that read nothing — each recording which control rejects it and why.

Once the MCP server has reloaded, the workbook renders through the
loop-forward and silent-acceptance renderers that ship with those plugins:

```
fdpm://workbook/codex-delegation/render/text/markdown
fdpm://workbook/codex-delegation/render/text/html
```

### Why the profile exists

Three of the containment claims in §3.3 used to be sentences in this file. A
sentence in a markdown file is not a control — nobody's tooling reads it, and
an agent editing the setup has no reason to treat it as binding. As rules on
`cdel:DelegationMode` they are enforced on every write:

| Rule | Rejects |
|---|---|
| `cdel:val:no-full-access` | `sandbox_tier == "danger-full-access"` |
| `cdel:val:write-tier-coherent` | a mode whose write scope and sandbox tier disagree, in either direction |
| `cdel:val:no-git-authority` | `git_allowed == true` |
| `cdel:val:write-requires-git` | a writing mode that would run outside a working tree |

Three further rules warn on incompleteness: a stage no boundary guards, a mode
no stage runs, a verifier no pipeline record implements.

---

## 6. Level 3 — the verification boundary

Level 3 answers, per stage: **which control covers each of the nine Silent
Acceptance error classes, and who has the authority to accept what escapes?**

Each of the four stages carries an `sa:VerificationBoundary` with an
`sa:Consumer` (who reads the output and what it costs them when it is wrong),
a pinned `sa:SolverConfiguration` (model, harness, and digests over the context
policy, tool set and prompt set), and nine `sa:ErrorClassCoverage` rows. The
acceptance authority is you, the operator, in the control domain
`operator-review` — outside both agents' runtimes, which is the property that
makes it an authority rather than a self-assessment.

### What is honestly covered, and what is not

**Every one of the 36 coverage rows is dispositioned `accepted_risk`, and every
boundary is `draft`.** That is not a gap in the modelling; it is the modelling
working. `profile:silent-acceptance:2.1` refuses the disposition `covered`
without measured `verifier_recall`, `false_positive_rate` and
`calibration_sample_size`, and no `sa:CalibrationRun` has been run against real
delegations. The verifiers are implemented and execute on every delegation;
what is missing is the measurement, not the code. Each risk names its
implemented verifier as the compensating control, and the first passed
calibration moves rows to `covered` and boundaries to `active`.

The classes with **no** implemented verifier, stated rather than papered over:

- **`ERR_SYCOPHANCY` on the delegate stage.** Nothing detects an answer shaped
  to agree with the framing of the work order. The structural control is that
  the order is written before the return exists and cannot be revised in
  response to it.
- **`ERR_SEMANTIC` and `ERR_REASONING` on the delegate stage.** No check
  decides whether an answer follows from its evidence. The `review` stage is
  the control: its schema requires a non-empty `independently_read` list, so an
  `integrate` verdict is only reachable after you have opened the cited files.
- **`ERR_SYCOPHANCY` on the review stage.** The reviewer is the same agent that
  wrote the order, so this boundary sits inside the producer's control domain.
  This is the pipeline's weakest boundary and it is why the acceptance
  authority sits outside it: an `integrate` verdict is not an acceptance.
- **`ERR_SEMANTIC` on the apply stage.** Nothing re-runs the proof command
  inside the boundary. You do, and that is the declared control.

Read the boundary for any stage:

```bash
npx tsx fdpm-cli/scripts/build-codex-delegation.ts --print \
  | jq '.workbooks[0].primitives[] | select(.type=="sa:ErrorClassCoverage" and (.id|test("delegate")))
        | {id, class: .fields.error_class, disposition: .fields.disposition, objective: .fields.control_objective}'
```

### Acceptance authority

You are the acceptance authority. The mechanism, not the intention:

- Neither agent holds a git grant, in any mode.
- `cdel.no_git_mutation` fails any delegation during which git moved.
- Every orchestrator write is approved per action; the executor denies
  `per_action` calls unless you answer the prompt, and nothing in the loop can
  approve itself.
- The `apply` stage's schema pins `committed` to `false`.

So acceptance can only happen at a commit you make, and the verdict store is
the git history plus this workbook's append-only operation log — both readable
outside either agent's runtime.

---

## 7. Running it — the executor

[`scripts/run-loop-forward.ts`](../fdpm-cli/scripts/run-loop-forward.ts) runs
any loop-forward pipeline in a workbook to a terminal state and writes an
`lf:RunReceipt` plus one `sa:OutputSubmission` per accepted stage output. It
is the piece that turns the workbook from a description into a thing that
runs; the code is in [`fdpm-cli/src/loop/`](../fdpm-cli/src/loop/).

```bash
cd fdpm-cli
npx tsx scripts/run-loop-forward.ts \
  --workbook codex-delegation --pipeline lf:pipeline:cdel-codex-delegation \
  --orchestrator file \
  --input repo_path=/abs/repo --input mode=research \
  --input goal="State what src/sdk.ts exports." \
  --input context_files='["fdpm-cli/src/sdk.ts"]' \
  --input constraints="read-only" --input proof_command="npx vitest run tests/sdk-public-surface.test.ts"
```

What it enforces, in code the model cannot reach:

- **Every bound.** `max_iterations`, `max_model_calls`, `max_total_tokens`,
  `max_wall_clock_ms`, the per-contract attempt ceiling, the carry size. The
  budget is checked before every model call, not after.
- **Every contract.** A stage output reaches the next stage only after its
  typed parse and every validator accepted it; a validator the registry does
  not implement is a hard failure, never a pass. A driver error is a rejected
  attempt, never output.
- **Every approval.** Drivers are chosen by the agent's provider: `openai` runs
  through the wrapper; `anthropic` runs a bounded tool-use loop against a
  freshly spawned fdpm MCP server (needs `ANTHROPIC_API_KEY`), with `per_run`
  grants exercisable only when named with `--approve-per-run` and `per_action`
  grants prompting on a TTY with `--approve-per-action`, denied otherwise.
- **The orchestrator by hand.** `--orchestrator file` writes each
  orchestrator-stage prompt to `_tmp/loop-forward/exchange/<stage>.i<n>.a<m>.prompt.md`
  and waits for the matching `.output.json`. An interactive agent session — or
  you — is the orchestrator, and the receipt still records what was accepted
  and why.

`--dry-run` prints the loaded pipeline; `--print-model` dumps the typed model.
The same script runs the frontier-proof loop
(`--workbook frontier-proof-loop --pipeline lf:pipeline:fpl-frontier-proof-loop`),
whose attempt stage is an attempt-mode delegation against this repository.

---

## 8. What has actually been run

Verified on 2026-09-05 against codex-cli 0.153.2 with `model = "gpt-6-astra"`:

1. **Research mode, real round trip.** A scratch repository with one file.
   Codex returned one JSON object citing `src/math.js` line 1,
   `export function add(a, b) {`; the boundary confirmed the path and the
   verbatim quote at that line and printed the envelope. 10,970 tokens.
2. **Attempt mode, first run — rejected.** The ECDLP instance under
   `fdpm-cli/research/ecdlp/` (a FrontierMath open problem; the operator's
   copy). Codex produced a self-contained PARI/GP script certifying the
   instance. The boundary rejected it: `cdel.no_git_mutation` saw the working
   tree's status digest change during the run — because this repository was
   being edited at the time. The control cannot tell the agent's edits from
   anyone else's, and it should not.
3. **Attempt mode, second run — accepted.** Same order, tree quiet. Codex
   returned `status: computed`, `artifact_kind: cas`, eight claims (p and n
   prime, the curve nonsingular, P and Q on it, `[n]P = [n]Q = O`,
   `#E(F_p) = 5n`), no references, no obstructions. The boundary executed the
   artifact under bubblewrap — host read-only, no network — and it printed
   `1` and exited clean with no PARI error marker. 38,737 tokens. That is the
   frontier loop's golden example (`attempt-instance-certified`) happening for
   real, and it is the reason the loop can now be pointed at a problem.

4. **The frontier-proof loop, three iterations, through the executor.**
   `run-loop-forward.ts --orchestrator file` on the ECDLP pursuit, with an
   interactive Claude session answering the orchestrator prompts and Codex as
   the solver. Iteration 1 certified the instance (eight checks, one PARI/GP
   artifact); iteration 2 screened the three classical weaknesses (not
   anomalous, embedding degree > 40, j ∉ {0, 1728}); iteration 3's plan
   reported `blocked` because the one remaining open leaf is explained by the
   undefeated generic-group barrier. Nine stage attempts, nine accepted on the
   first try; the register stages wrote 22 proof records and 5 knowledge
   records, all re-read from the store by `fpl.written_ids_exist` and
   `fpl.producer_status_guard` after a host reload; both evidence bundles'
   manifest roots recomputed. Receipt `lf:receipt:fpl-ecdlp-run-2`: 3
   iterations, 9 model calls, 62,322 tokens, 772 s, terminal `blocked`, with
   a handoff carrying the DAG state. All four workbooks validate at zero
   errors and zero warnings afterwards.

   Two things that run exposed and that were fixed before it passed: the
   executor was handing the frontier pipeline the wrapper's envelope where its
   contract expects the raw attempt payload (a wiring defect, now an explicit
   `unwrapEnvelope` per profile), and a rejected attempt kept only a digest
   of the wrapper's stderr (now the file and its tail are in the receipt's
   evidence). A first run with the tree being edited was rejected by
   `cdel.no_git_mutation`, as it should be.

Not yet run: the orchestrator stages driven by the Anthropic API rather than
by hand (no `ANTHROPIC_API_KEY` in this environment), and any
`sa:CalibrationRun`. Both are executable with the script above; neither has
happened. Note also what "by hand" means for the boundary: the orchestrator's
writes went through the MCP server directly rather than through the
executor's grant enforcement, so the per-action approval control was not
exercised on that run — the store-reading validators were.

---

## 9. Daily usage patterns

**Background second brain.** At the start of a large job: "Write a work order
asking Codex to audit the `payments` module for unhandled error paths, run it
in research mode as a background task, and keep planning while it runs."

**Patch drafting you review.** "Freeze the approach we agreed on, send it to
Codex in patch mode across the five handler files, then show me the diff."
The diff has already passed `git apply --check` by the time you see it.

**Cross-model design review.** Ask for a verdict plus numbered risks tied to
specific files. The paths and quotes are checked; the judgement is not. Read it
as a colleague's review.

**One proof step.** In attempt mode, give Codex one step an artifact can
settle — a computation, a lemma in Lean, a counterexample search — and let the
boundary run it. What comes back is a claim with an executed artifact behind
it, or a `partial`/`failed` with the obstruction named.

**Parallel lanes.** Dispatch every read-only audit before any lane that changes
the tree, so audits observe a consistent state. And never edit the target
repository while a delegation is running against it.

Patterns to avoid: delegating a single-file edit (the round trip costs more
than the edit), letting two workers write the same files, and delegating a task
whose specification is itself the hard part.

---

## 10. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Wrapper exits 2 with a git error | `patch` or `write` mode outside a working tree | By design. Research and attempt modes add `--skip-git-repo-check`; the writing modes refuse. |
| Auth or login error | Codex not signed in | `codex login`; inside Claude Code, `! codex login` |
| Skill not offered in an interactive session | Skill directory created mid-session | Restart Claude Code once |
| A `-c` override fails the run | The key is unknown to your Codex version | Correct. `--strict-config` turned a silent no-op into an error. Check the config reference and update the wrapper. |
| `cdel.paths_exist` rejected a return | The model named a file that does not exist | Working as intended — this is the control, not a bug. Re-delegate with the failure quoted, and take the task over after the second failure. |
| `cdel.quotes_match` rejected a return | The quote is a paraphrase, or the line is wrong | Same. A citation you cannot follow is not evidence. |
| `cdel.no_git_mutation` rejected a return | Git moved during the delegation | Investigate before re-running. Either something else in your session touched the tree — an editor, another agent, you — or the sandbox did not hold. |
| `fpl.formal_artifact_check` rejected a `computed` return | The artifact exited non-zero, timed out, or the runner printed an error and exited 0 anyway | The claim is not established. Read the runner output the failure quotes; re-delegate with it. |
| `fpl.reference_resolves` rejected a return | A locator did not resolve, or resolved to a different title | The reference is fabricated or misremembered. Both are the same failure from where you sit. |
| Codex edits files in research mode | The sandbox tier did not apply | Stop. Confirm the wrapper passed `--sandbox read-only` and that `--strict-config` did not mask a config problem. |
| The executor ends `failed` with "unimplemented validator" | A contract names a validator `src/loop/named.ts` does not register | Correct: an output nothing inspected has not crossed the boundary. Implement the validator or fix the record. |

---

## 11. What this does not do

- **It does not make Codex's answers correct.** Every check here is
  structural. A return can pass all of them and still be wrong, which is
  exactly what the uncovered error classes in §6 say.
- **It is not calibrated.** No boundary has measured recall. The
  `accepted_risk` dispositions are honest, not pessimistic.
- **It does not verify the orchestrator.** Claude Code reviews its own
  delegation, which is why the review boundary is the weakest one and why
  acceptance is yours.
- **It does not survive you skipping the review.** The `independently_read`
  requirement is a schema constraint on an agent's output, not a guarantee
  that a human read anything.
- **It does not produce proofs of open problems.** An executed artifact
  establishes what the artifact computes. On a Millennium problem the loop's
  honest terminal states are `blocked`, `stagnated` and `exhausted`, and its
  honest product is a verified map of the attack and its barriers. See the
  frontier-proof-loop README.

---

## References

- Silent Acceptance v2.1.0 — doi:[10.5281/zenodo.19401266](https://doi.org/10.5281/zenodo.19401266)
- Claude Code sub-agents and skills: <https://code.claude.com/docs/en/sub-agents>
- Claude Code documentation: <https://docs.claude.com/en/docs/claude-code/overview>
- Codex CLI config reference: <https://developers.openai.com/codex/config-reference>
- Official Codex plugin for Claude Code: <https://github.com/openai/codex-plugin-cc> — an alternative bridge with its own default sandbox behaviour and no return-contract enforcement
- [Frontier proof loop](../fdpm-cli/scripts/frontier-proof-loop/README.md) · [Repository README](../README.md) · [Architecture](architecture/FDPM-ARCHITECTURE.md) · [Profile atlas](architecture/PROFILES.md)
