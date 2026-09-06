---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Fable 5.1 via Claude Code"
  date: "2026-09-05"
last_verified: "2026-09-05"
tool_versions:
  - tool: "fdpm-cli"
    version: "1.3.0"
  - tool: "Claude Code"
    version: "2.1.261"
  - tool: "codex-cli"
    version: "0.153.4 (the guide's runs were on 0.153.2 and 0.153.4)"
  - tool: "Node.js"
    version: "24.14.0"
  - tool: "Lean 4"
    version: "4.33.1 (elan), mathlib pinned in fplproofs/lake-manifest.json"
  - tool: "PARI/GP"
    version: "2.15.4"
  - tool: "bubblewrap"
    version: "0.11.0"
---

# fdpm-loop user manual — running Claude Code + Codex loops by tool calls

## Disclaimer

This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](../DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.

## Overview

This manual is for the operator who runs Claude Code in VS Code with the
`fdpm` and `fdpm-loop` MCP servers connected and wants to put a
Claude-orchestrated, Codex-solved loop onto a task — a code investigation, a
patch, or one checkable step of a mathematical pursuit — and get back records
that were validated rather than asserted. It assumes you have read
[how-to.md](how-to.md) once and know what a verification boundary is. Each
scenario below is a goal, the sentence you say, what the tools do in
response, how you verify the result, and what to do when it fails.

The cast never changes:

| Role | Who | What it may do |
|---|---|---|
| Orchestrator | your Claude Code session | reads and writes workbooks through `fdpm`, answers `fdpm-loop` prompts |
| Solver | the Codex CLI, inside the loop server | reads a repository in a sandbox; returns one JSON object |
| Boundary | `fdpm-loop` + the delegation wrapper | validates every output, executes artifacts, resolves references, snapshots git |
| Acceptance authority | you, the operator | the only party that records a verdict (`recrt:EvidenceBundle`, `verification_status`) |

Nothing an agent writes becomes verified. That sentence is the whole design.

---

## Prerequisites

Every item is testable. Run the check; if it does not print what is shown,
fix that before anything else.

1. Both MCP servers connected in your session.
   `claude mcp list` prints `fdpm: … ✔ Connected` and `fdpm-loop: … ✔ Connected`.
   In a session, `/mcp` shows both. The loop tools appear as
   `mcp__fdpm-loop__fdpm_loop_*`; on 2026-09-05 they appeared in a running
   session immediately after registration, without a restart. If they do
   not, restart Claude Code.
2. Codex signed in: `codex login status` prints `Logged in using ChatGPT` or
   an API-key line. `codex --version` prints `codex-cli 0.153.x`.
3. The sandbox: `bwrap --version` prints `bubblewrap 0.11.0` (or newer).
4. For `cas` artifacts: `/usr/bin/gp --version-short` prints `2.15.4`. Use
   the absolute path; in this repository's shell `gp` is aliased to
   `git push`.
5. For `lean4` artifacts: `cd fdpm-cli/scripts/frontier-proof-loop/fplproofs && lake env lean --version`
   prints `Lean (version 4.33.1, …)`, and `.lake/` exists (else
   `lake exe cache get`; `.lake/` measured 7.5 GB on 2026-09-05).
6. The workbooks: `fdpm_workbook_list` (through `fdpm`) shows
   `codex-delegation`, `frontier-proof-loop`, `fpl-ecdlp-proofs`,
   `fpl-ecdlp-knowledge`. If not:
   `cd fdpm-cli && npx tsx scripts/build-codex-delegation.ts && npx tsx scripts/build-frontier-proof-loop.ts`,
   then `kill -HUP` every `fdpm-mcp.js` process.

---

## The protocol on one page

Six tools on `fdpm-loop`. Every call returns `next`, which is one of three
shapes, and the loop is: act on `next` until it is `terminal`.

| Tool | Arguments | Returns |
|---|---|---|
| `fdpm_loop_start` | `workbook_id`, `pipeline_id`, `inputs`, optional `receipt_slug`, `codex_effort`, `codex_model` | `next` |
| `fdpm_loop_submit` | `run_id`, `output` (one JSON object, as string or object) | `accepted`, `record` (with any `failures`), `next` |
| `fdpm_loop_wait` | `run_id`, `timeout_ms` (default 20000, max 300000) | `next` |
| `fdpm_loop_status` | `run_id` | `summary`, `next`, every `records[]` so far |
| `fdpm_loop_abort` | `run_id`, `reason` | `next` (terminal; the receipt is still written) |
| `fdpm_loop_list` | — | the runs this server process knows |

| `next.kind` | Meaning | What the orchestrator does |
|---|---|---|
| `prompt` | a stage is yours: `stage`, `system_prompt`, `task_prompt`, `contract_schema`, `deadline_at` | do the stage's work, then `fdpm_loop_submit` one JSON object matching `contract_schema` |
| `running` | a solver stage is executing inside the server | `fdpm_loop_wait` repeatedly; do not edit the repository |
| `terminal` | the run ended; `outcome.terminal_state`, `outcome.receipt_id` | read the receipt; `kill -HUP` the `fdpm` server to see it there |

A rejected `submit` returns `accepted: false` with the failures classified
by Silent Acceptance error class, and — when the stage contract allows a
retry — the same stage again with the failures appended to `task_prompt`.
A stage whose contract does not retry ends the run.

### The two pipelines

**`codex-delegation` / `lf:pipeline:cdel-codex-delegation`** (code work).
Inputs: `repo_path`, `mode` (`research | patch | write | attempt`), `goal`,
`context_files` (list), `constraints`, `proof_command`.

| # | Stage | Answered by | Output contract (required keys) |
|---|---|---|---|
| 0 | `order` | orchestrator | `stop_reason` (`continue|answered|blocked|approval_required|do_it_yourself`), `mode`, `order_path`, `goal`, `context_files` (every path must exist), `constraints`, `proof_command` |
| 1 | `delegate` | Codex | the mode's return, re-validated: paths exist, quotes verbatim, diff applies, artifact executes, references resolve, git unchanged |
| 2 | `review` | orchestrator | `verdict` (`integrate|reject|escalate`), `findings[]` (`error_class`, `location`, `note`), `independently_read[]` (non-empty, paths must exist), `notes` |
| 3 | `apply` | orchestrator | `written[]` (paths must exist), `rejected[]`, `proof_command`, `proof_exit_code` (observed), `proof_output_tail`, `committed: false` |

Budget as seeded: 2 iterations, 16 model calls, 800,000 tokens, 2 h, $40.
Stops: `answered` → `success`; `do_it_yourself` → `clean_noop`; `blocked`;
`approval_required`; the review repeating itself twice → `stagnated`.

**`frontier-proof-loop` / `lf:pipeline:fpl-frontier-proof-loop`** (proofs).
Inputs: `pursuit_id`, `domain`, `problem_statement`, `acceptance_criterion`,
`proofs_workbook_id`, `knowledge_workbook_id`, `evidence_root` — all copied
from the `fpl:Pursuit` record; the orchestrator reads them, you do not type
them.

| # | Stage | Answered by | Output contract (required keys) |
|---|---|---|---|
| 0 | `plan` | orchestrator | `stop_reason` (`continue|target_verified|blocked|approval_required|clean_noop`), `target_node_id` (an existing `recrt:ProofNode`), `step` {`title`, `kind` (`lemma|computation|reduction|formalization|literature_check|obstruction_analysis`), `instructions`, `success_test`}, `rationale` |
| 1 | `attempt` | Codex | `status` (`proved|computed|partial|failed|refuted`), `artifact_kind` (`lean4|cas|python|prose`), `artifact`, `reproduction_command`, `summary`, `claims[]`, `references[]`, `obstructions[]`, `self_reported_confidence` — the artifact is executed under bubblewrap; `proved|computed|refuted` need exit 0 and no runner error; every reference must resolve to its cited title |
| 2 | `audit` | orchestrator | `verdict` (`register|reject|escalate`), `findings[]` (nine-class `error_class`), `reproduced` (true only if you re-ran it), `notes` |
| 3 | `register` | orchestrator | `written[]` ({`workbook_id`,`id`,`type_id`} — read back from the store), `verification_status_written: "unverified"`, `evidence_bundle` (`{manifest_root, bundle_path}` or null; the root is recomputed), `dag_summary`, `obstructions[]`, `iteration_note` |

Budget as seeded: 12 iterations, 96 model calls, 3,000,000 tokens, 6 h, $200.
Stops on `plan`: `target_verified` → `success`, `blocked`, `approval_required`,
`clean_noop`; an attempt repeating itself three times → `stagnated`.

---

## How to phrase a request

You talk to the orchestrator in prose. It reads ids and inputs off the
workbooks. These sentences are sufficient; anything you add narrows them.

| You say | The orchestrator does |
|---|---|
| "Delegate to Codex in research mode: what does `src/x.ts` export?" | `fdpm_loop_start` on `codex-delegation`, mode `research`, then the four stages |
| "Draft a patch with Codex across the five handler files for X." | mode `patch`; you get a diff that already passed `git apply --check` |
| "Have Codex apply this bounded change and prove it with `npm test`." | mode `write`; the tree stays diffable, nothing is committed |
| "Run the frontier loop on `fpl:pursuit:ecdlp-frontiermath`." | `fdpm_loop_start` on `frontier-proof-loop` with the pursuit's inputs |
| "Register a pursuit for the Riemann Hypothesis: … acceptance criterion … Then run the loop." | creates the two workbooks and the `fpl:Pursuit`, then starts |
| "Status of the run." / "Where are we?" | `fdpm_loop_status` |
| "Abort the run, reason: …" | `fdpm_loop_abort` |
| "Continue for at most N more iterations." | keeps answering prompts, then answers `blocked`/`clean_noop` honestly or aborts with your reason |
| "Show me the receipt." | `fdpm_primitive_get` of `lf:receipt:<slug>` after reloading `fdpm` |

Two things only you can say, and the orchestrator will ask for them rather
than invent them: the **acceptance criterion** of a new pursuit, and any
**verdict** (a run "verified" something only when you record it — Part C).

---

## Part A — Delegating code work to Codex

### A1. Research a module with cited evidence

**Goal.** An answer to a question about the code whose every claim carries a
path, a line and a verbatim quote that was checked against the file.

**Say.** "Delegate to Codex in research mode against this repo: which
exported functions in `fdpm-cli/src/sdk.ts` wrap Host methods, and what does
`commit()` do when a write is rejected? Cite path, line and exact text."

**What happens.**
1. `fdpm_loop_start(codex-delegation, …, {mode: "research", goal, context_files: ["fdpm-cli/src/sdk.ts"], …})` → `prompt: order`.
2. The orchestrator submits the work order (`stop_reason: "continue"`).
3. `running: delegate` — Codex reads the file in a read-only sandbox; 2–3 minutes; the orchestrator polls `fdpm_loop_wait`.
4. `prompt: review` — the orchestrator opens the cited file itself and submits a verdict with `independently_read`.
5. `prompt: apply` — nothing is written for a research question; the proof command is run and its real exit code reported.
6. `prompt: order` (iteration 2) — `stop_reason: "answered"` → `terminal: success`.

**Verify.** `outcome.receipt_id` is `lf:receipt:<slug>`; `outcome.records`
has five entries, all `accepted: true`; the answer's evidence lines open to
the quoted text. The run of 2026-09-05 (`lf:receipt:mcp-real-run-1`) did
exactly this in 5 calls and 36,451 tokens.

**If it fails.** `cdel.paths_exist` or `cdel.quotes_match` in the delegate
record means Codex cited a file or a line that is not there; the stage does
not retry — re-delegate with the failure quoted in the goal, or take the
task over after a second failure. A `cdel.no_git_mutation` failure means
the repository changed during the delegation (see Troubleshooting).

### A2. Audit a module for unhandled error paths

**Goal.** A list of unhandled error paths in a module, each pointing at a
real line.

**Say.** "Delegate a research audit of `fdpm-cli/src/mcp/` for unhandled
error paths: every finding must quote the line where the error is raised
and the caller that does not handle it."

**What happens.** As A1, with `context_files` listing the directory's
files. The wrapper enforces the research schema: `answer`, `evidence[]`,
`confidence`, `open_questions[]`, `unverified_claims[]`.

**Verify.** Every `evidence[].quote` is verbatim at `evidence[].line` — the
boundary checked, but the review stage opens the files anyway; the review
contract requires it (`independently_read` must not be empty).

**If it fails.** A long module makes Codex omit findings rather than invent
them; the schema cannot see an omission. Ask for a second run scoped to the
files the first did not cite.

### A3. Draft a multi-file patch you review

**Goal.** A unified diff across three files that applies cleanly to the
tree, without Codex touching the tree.

**Say.** "Freeze the approach we agreed on and delegate a patch to Codex
across `a.ts`, `b.ts`, `c.ts`: … Return the diff; I will apply it."

**What happens.** Mode `patch`; the sandbox is read-only; the return is
`{diff, target_files, explanation, verification_commands, applied: false}`;
the boundary runs `git apply --check --recount` on the diff before the
orchestrator sees it.

**Verify.** `cdel.diff_applies` is absent from the delegate record's
failures. Apply it yourself: `git apply <diff>`; run the
`verification_commands`.

**If it fails.** `cdel.diff_applies` rejects a diff that does not apply —
usually the tree moved since the order was written. Re-delegate.

### A4. Bounded mechanical edit with a proof command

**Goal.** Codex edits files inside a git working tree; the whole change
stays an unstaged diff you review; nothing is committed.

**Say.** "Delegate in write mode: rename `fooBar` to `fooBaz` across
`src/`, run `npx vitest run tests/foo.test.ts`, return files changed and
the command output."

**What happens.** Mode `write` (`workspace-write` sandbox; refuses a
non-git directory). Return: `{files_changed, commands_run[], results,
risks, committed: false}`. The boundary compares HEAD, the stash list and
the ref list before and after; the working tree is allowed to change.

**Verify.** `git status` shows the change unstaged; `git log -1` is the
commit you started from. The apply stage's `proof_exit_code` is the exit
code the orchestrator observed, not the one Codex reported.

**If it fails.** `cdel.no_git_mutation` with "HEAD moved" means the solver
committed. The return is discarded whatever it says; inspect
`git reflog` and reset if needed. This is the control working.

### A5. Cross-model design review

**Goal.** A second opinion from a different model family on a design or a
diff, with risks tied to files.

**Say.** "Delegate a research-mode design review of `docs/adr/0007.md`
and the code it describes: verdict `sound | sound-with-risks | flawed`,
numbered risks each citing a file and line."

**What happens.** As A1. The verdict is prose inside `answer`; the risks
are `evidence[]` entries and are path-checked.

**Verify.** Read it as a colleague's review: the paths are real, the
judgement is not checked by any machine — the review stage is where the
orchestrator decides what to take.

**If it fails.** A review with no `evidence[]` fails the schema's
`minItems: 1`; a review whose risks cite nothing real fails
`cdel.paths_exist`.

### A6. Three read-only audits in parallel

**Goal.** Audit three modules concurrently before any lane changes the
tree.

**Say.** "Start three research delegations, one per module: …. Do not
start any write lane until all three have returned."

**What happens.** Three `fdpm_loop_start` calls; three `run_id`s; the
orchestrator polls each with `fdpm_loop_wait`. Codex runs are sequential
inside one server process in practice (the wrapper is one process per
call), but the runs are independent records.

**Verify.** `fdpm_loop_list` shows three runs; each reaches `terminal`.

**If it fails.** Editing the repository while any of them is running
rejects that run's delegate stage.

### A7. A task that should not be delegated

**Goal.** Recognise, in the order stage, that the round trip costs more than
the edit.

**Say.** "Delegate: change the timeout on line 12 of `config.ts` to 30000."

**What happens.** The orchestrator answers the order prompt with
`stop_reason: "do_it_yourself"` and the run ends `clean_noop` with a
receipt recording the decision. Then it makes the edit directly.

**Verify.** `outcome.terminal_state` is `clean_noop`; one model call.

### A8. A computation with a machine-checkable answer

**Goal.** A numeric or algebraic fact established by an executed script,
not by a model's arithmetic.

**Say.** "Delegate in attempt mode: is 2^127 − 1 prime, and what is its
Lucas–Lehmer residue trace? Return a PARI/GP artifact."

**What happens.** Mode `attempt`: the return is the attempt contract
(`status`, `artifact_kind: "cas"`, `artifact`, …). The boundary writes the
artifact to a private directory and runs `/usr/bin/gp -q -f` under
bubblewrap with no network; `computed` requires exit 0 and no `***`
diagnostic in the output.

**Verify.** The delegate record shows no `fpl.formal_artifact_check`
failure; run the artifact yourself: `bwrap --ro-bind / / --dev /dev --proc /proc --tmpfs /tmp --unshare-all -- /usr/bin/gp -q -f artifact.gp`.

**If it fails.** "runner reported an error and exit 0 does not establish
the claim" is PARI printing `***` and continuing — the claim is not
established; read the quoted line.

---

## Part B — The frontier proof loop

### B1. Run the seeded ECDLP pursuit

**Goal.** One or more iterations on `fpl:pursuit:ecdlp-frontiermath`, ending
in a receipt and unverified proof records.

**Say.** "Run the frontier loop on `fpl:pursuit:ecdlp-frontiermath`."

**What happens.**
1. The orchestrator reads the pursuit (`fdpm_primitive_get frontier-proof-loop fpl:pursuit:ecdlp-frontiermath`) and calls `fdpm_loop_start(frontier-proof-loop, lf:pipeline:fpl-frontier-proof-loop, {pursuit inputs})`.
2. `prompt: plan` — it reads the proof workbook (`fdpm_primitive_search fpl-ecdlp-proofs type_id=recrt:ProofNode`, `fdpm_relation_list … recrt:ExplainedByBarrier`) and picks one open leaf no undefeated barrier explains.
3. `running: attempt` — Codex, in attempt mode, against this repository; the artifact is executed before anyone reads the return.
4. `prompt: audit` — the orchestrator reproduces the artifact and, where it can, recomputes the claim independently.
5. `prompt: register` — it writes `unverified` nodes and claims through `fdpm`, then submits their ids; the server reloads its projection and reads them back.
6. Repeat, or `plan` reports `blocked`.

**Verify.** After the run of 2026-09-05 (`lf:receipt:fpl-ecdlp-run-2`) the
proof workbook holds 18 nodes and the pursuit is `blocked` at the
generic-group barrier; a new run on it ends `blocked` in one plan stage
unless a bypass has been registered (B11).

**If it fails.** See B10.

### B2. Register a new pursuit (a Millennium problem) and run it

**Goal.** A Riemann Hypothesis pursuit with its own proof and knowledge
workbooks, ready for the loop.

**Say.** "Register a pursuit for the Riemann Hypothesis. Domain mathematics,
target_kind proof. Acceptance criterion: a Lean 4 proof term of mathlib's
`RiemannHypothesis` checked by the kernel in `fplproofs`, captured in an
evidence bundle whose manifest_root I recomputed. Then run the loop."

**What happens.** The orchestrator, through `fdpm`:
1. `fdpm_workbook_create({workbook_id: "fpl-rh-proofs", name, profile_id: "profile:re-crt:6.2"})` and `… "fpl-rh-knowledge" … "profile:logical-knowledge-base:1.0"`.
2. In `fpl-rh-proofs`: `recrt:ReasonDAG`, `recrt:ObstructionDAG`, a `recrt:ProofNode` of `node_type: "goal"` stating the hypothesis, open leaves as `node_type: "open"` (e.g. "state the hypothesis in mathlib terms", "establish the functional-equation prerequisites", "literature check of known equivalents"), `recrt:ProofSupports` leaf → goal, `recrt:ProofInDAG` for every node, `recrt:ProofRootOf` goal → DAG, a `recrt:RuleBasis` with `recrt:Rule`s such as `cas-certified-computation` and `published-theorem`.
3. In `fpl-rh-knowledge`: the `lkb:LogicalKnowledgeBase` header, `lkb:AgentDeclaration`s for the orchestrator, the solver and the operator.
4. In `frontier-proof-loop`: the `fpl:Pursuit` with every required field — `title`, `domain`, `statement`, `target_kind`, `acceptance_criterion` (your sentence, verbatim), `status: "open"`, `proofs_workbook_id`, `knowledge_workbook_id`, `evidence_root` (e.g. `fdpm-cli/research/frontier-proof-loop/evidence/rh`), `opened_at`, `owner`, plus `external_refs` that resolve — and an `fpl:PipelinePursues` edge from `lf:pipeline:fpl-frontier-proof-loop`.
5. `fdpm_loop_start` with the pursuit's inputs.

**Verify.** `fdpm_workbook_list` shows the two workbooks;
`fdpm_primitive_get frontier-proof-loop fpl:pursuit:rh` shows your
acceptance criterion unchanged; `fpl:val:pursuit-workbooks-distinct` did
not fire (the two ids differ).

**If it fails.** A rejected `fpl:Pursuit` names the missing field; an
`external_refs` entry that does not resolve is removed, not kept.

### B3. P vs NP — a verified barrier map

**Goal.** An obstruction DAG whose barriers cite references that resolve,
and open leaves that name what a bypass would have to do.

**Say.** "Register a P vs NP pursuit (target_kind proof, acceptance
criterion: a Lean 4 proof term of `P ≠ NP` or `P = NP` over mathlib's
complexity definitions, kernel-checked, in a recomputed evidence bundle) and
run the loop with plan steps of kind `literature_check` and
`obstruction_analysis` first."

**What happens.** Plan steps ask Codex for `prose` artifacts with
`status: "partial"` and `references[]`; `fpl.reference_resolves` retrieves
every DOI, arXiv id or https locator and compares the title found there with
the cited one. Barriers register as `recrt:ObstructionNode`s
(`obstruction_type: "barrier"`, `blocking_strength: 1`) with
`recrt:ExplainedByBarrier` from the leaves they explain — relativization,
natural proofs, algebrization, each with the reference that resolved.

**Verify.** Every `references[].locator` in the accepted attempts resolves
(the delegate record has no `fpl.reference_resolves` failure); the
obstruction workbook renders through `fdpm://workbook/<proofs>/render/text/markdown`.

**If it fails.** "Reference does not resolve" or "resolves to <other
title>" is a fabricated or misremembered citation; the attempt is rejected
whole. That is the point.

**Expect.** The run ends `blocked` when every open leaf is explained by an
undefeated barrier. That is the honest product for this problem.

### B4. Birch and Swinnerton-Dyer for a specific curve — computation

**Goal.** Computed invariants (analytic rank, conductor, leading coefficient
bounds) for one named curve, each established by an executed CAS artifact.

**Say.** "Register a BSD pursuit for the curve `y^2 = x^3 − x` (target_kind
computation; acceptance criterion: the analytic and algebraic ranks agree as
computed by two independent CAS runs the operator re-executes, in a
recomputed evidence bundle). Run the loop with `cas` steps."

**What happens.** `computation` steps; Codex returns PARI/GP scripts
(`ellinit`, `ellanalyticrank`, `ellrank` where available); the boundary
executes each; the audit stage re-runs it and recomputes in Python where
exact integer arithmetic suffices.

**Verify.** Each registered `recrt:ProofNode` is `derived` with an
`recrt:HasRule` edge to `recrt:rule:cas-certified-computation` and an
`open_payload` naming the artifact path; the evidence bundle's
`manifest_root` recomputes: `npx tsx -e` is not needed —
`python3 - <<'PY'` … `hashlib.sha256` over sorted `"sha256  path"` lines,
as in the audit examples of the 2026-09-05 run.

**If it fails.** A timed-out artifact (`did not finish within … ms`) does
not establish a `computed` status; either split the step or raise
`artifactTimeoutMs` (D6).

### B5. Navier–Stokes — formalization and computation steps

**Goal.** Steps that a machine can check on a problem where a proof is not
in reach: formalize a statement, verify an energy inequality numerically
over exact rationals, screen a candidate blow-up ansatz.

**Say.** "Register a Navier–Stokes existence-and-smoothness pursuit
(target_kind formalization; acceptance criterion: a Lean 4 statement of the
Clay formulation type-checked against mathlib, plus every claimed inequality
verified by an exact-arithmetic script, in recomputed bundles). Run the loop
with `formalization` steps first."

**What happens.** `lean4` artifacts are checked with `lake env lean` inside
`fplproofs` under bubblewrap; `python` artifacts run with `python3 -I`.

**Verify.** A `lean4` artifact that fails to elaborate shows
`…:line:col: error:` in the failure message and the attempt is rejected;
one that elaborates shows no failure.

**Expect.** `partial` and `failed` statuses with obstructions named; the
loop stops `blocked` or `stagnated`. There is no criterion a machine can
accept here short of a proof term, and the loop will not pretend otherwise.

### B6. Yang–Mills mass gap and the Hodge conjecture — where it stops early

**Goal.** Know before you spend budget what the loop can do here.

**What happens.** Both lack a machine-checkable formulation in mathlib.
Register with `target_kind: "formalization"` and a criterion that names the
statement to be type-checked; expect the first `plan` to choose a
`literature_check` and the second to report `blocked`.

**Verify.** `outcome.terminal_state` is `blocked` with a handoff naming the
barrier; the knowledge workbook holds the references that resolved.

### B7. A Lean 4 formalization step against mathlib

**Goal.** One lemma stated and proved in Lean 4, checked by the kernel.

**Say.** "Plan a `formalization` step: state and prove in Lean 4 that the
group of points of the ECDLP curve is cyclic of order 5n given the
certified order; artifact_kind lean4."

**What happens.** Codex returns a `.lean` artifact; the boundary runs
`lake env lean artifact.lean` in `fdpm-cli/scripts/frontier-proof-loop/fplproofs`
under bubblewrap (host read-only; mathlib's `.lake/` oleans are read).
`proved` requires exit 0 and no `error:` line.

**Verify.** Re-run it yourself:
`cd fplproofs && lake env lean /path/artifact.lean` prints nothing on
success.

**If it fails.** `sorry` makes Lean warn, not fail; the audit stage must
reject an artifact containing `sorry` as `ERR_INSTRUCTION` (a proof that is
declared, not given). The orchestrator's audit checks for it; the boundary
does not yet.

### B8. A counterexample search

**Goal.** Refute a conjecture by exhibiting a witness, or bound the search.

**Say.** "Plan a `computation` step: search for a counterexample to
<statement> for all n ≤ 10^6 with exact integer arithmetic; status
`refuted` with the witness if found, else `partial` with the bound."

**What happens.** A `python` artifact under `python3 -I`, no network.
`refuted` requires exit 0; the audit stage verifies the witness
independently.

**Verify.** The registered node's payload states the witness or the bound;
the claim's `falsifier` says what would overturn it.

### B9. Resume a run after the loop server restarted

**Goal.** Continue a run whose server process died.

**What happens.** On start the server loads `<data dir>/loop-runs/*.json`
and resumes every run without a terminal state that no living server owns.
Each run records the server that started it (`owner: { instance_id, pid }`);
every Claude Code session runs its own loop server over the same store, so a
server started while another session's run is mid-solver leaves that run
alone (its log says `belongs to live server … not adopted`) and adopts it
only once that process is gone. For an adopted run, a solver stage that was
in flight is recorded as a lost attempt (`driver_error` "the loop server
restarted while … was running") and the contract's retry policy decides
what happens next.

**Say.** "List the loop runs and continue `<run_id>`."

**Verify.** `fdpm_loop_list` shows the run; `fdpm_loop_status` shows the
pending `prompt` or `running`; the records include the lost attempt.

### B10. An attempt is rejected — reading the failures

**Goal.** Act on a rejected solver stage without guessing.

| `failures[].check` | Class | It means | Do |
|---|---|---|---|
| `lf.output_contract` | `ERR_SCHEMA` / `ERR_OMISSION` / `ERR_TRUNCATION` | not one JSON object of the declared shape | the retry feedback already says which keys; nothing for you to do |
| `fpl.formal_artifact_check` | `ERR_HALLUCINATION` | the artifact exited non-zero, or PARI printed `***` and exited 0 | read the quoted runner output; the claim is not established |
| `fpl.formal_artifact_check` | `ERR_SEMANTIC` | timed out | split the step or raise the timeout (D6) |
| `fpl.formal_artifact_check` | `ERR_INSTRUCTION` | `prose` with `proved`/`computed` | a step needs an artifact a machine can check |
| `fpl.reference_resolves` | `ERR_HALLUCINATION` | a locator did not resolve, or resolved to none of the titles the page declares (`og:title`, `citation_title`, `<title>` with or without its site suffix); PDFs have no title to compare and repository paths are not references | a fabricated or misremembered citation; rejected whole. The message lists what the page declares |
| `cdel.no_git_mutation` | `ERR_INSTRUCTION` | git moved during the stage | someone edited the repository, or the sandbox did not hold; investigate before re-running |
| any check above, with `driver_error` "wrapper rejected the return at its verification boundary" | the check's own | the wrapper refused the return before the executor saw it | the failures are the wrapper's verdict, check by check; `wrapper_raw_return_path` in the record's evidence is the refused return |
| `driver` | `ERR_TRUNCATION` | the wrapper exited without a verdict (`codex exec` failed) or the server restarted | the message carries the wrapper's last stderr line; `wrapper_stderr_path` in the record's evidence has all of it |

The frontier attempt contract retries twice with the failures appended to
Codex's order; the delegation pipeline's delegate stage does not retry.

### B11. The run ends `blocked` — name a bypass and rerun

**Goal.** Turn a barrier into a next step.

**What happens.** `outcome.handoff` carries the DAG state and the plan's
rationale naming the barrier. A bypass is a claim that the barrier does not
apply to this instance: register it as an `recrt:ObstructionNode` with
`obstruction_type: "bypass"`, `blocking_strength: 0`, and an
`recrt:BypassDefeatsBarrier` edge to the barrier. The grounded labelling
then marks the barrier `out`, the leaf it explained becomes open again, and
the next `plan` may choose it.

**Say.** "Register a bypass of the generic-group barrier for the ECDLP
pursuit: <the structural property you conjecture>. Then run the loop."

**Verify.** `fdpm_relation_list fpl-ecdlp-proofs type_id=recrt:BypassDefeatsBarrier`
shows the edge; the next plan prompt's rationale names the leaf as open.

**If it fails.** A bypass with `blocking_strength` other than 0 is
rejected by the profile; a bypass that names no barrier is a warning until
the edge exists.

### B12. Stagnation and exhaustion

**Goal.** Understand and adjust when the loop stops without a stop
condition.

- `stagnated`: the attempt (frontier) or the review (delegation) produced
  the same output N times. Change the step, not the budget.
- `exhausted`: `max_iterations`, `max_model_calls`, `max_total_tokens` or
  `max_wall_clock_ms` was reached. Raise the bound (D6) only after reading
  the records: the budget exists so that a run cannot ask itself to
  continue forever.

### B13. Abort a run

**Say.** "Abort run `<run_id>`, reason: the step is ill-posed."

**What happens.** `fdpm_loop_abort` ends the run `failed` with
`reason: "aborted: …"`; the receipt is written; a solver stage still
running is ignored on return.

---

## Part C — Acceptance authority (only you)

### C1. Verify an evidence bundle and record a verdict

**Goal.** Move a node from `unverified` to `cas_checked` or
`proof_witnessed` on evidence you recomputed.

**Steps.**
1. Locate the bundle: the node's `open_payload` names it, e.g.
   `fdpm-cli/research/frontier-proof-loop/evidence/ecdlp/run-2/`.
2. Re-run the artifact yourself: `bwrap … -- /usr/bin/gp -q -f <bundle>/artifact.gp` (or `lake env lean`, or `python3 -I`); compare with `<bundle>/stdout.txt`.
3. Recompute the root:
   ```bash
   cd <bundle> && (for f in $(find . -type f | sed 's|^\./||' | sort); do printf '%s  %s\n' "$(sha256sum "$f" | cut -d' ' -f1)" "$f"; done; echo) | sha256sum
   ```
   The library's `manifestRoot` is sha256 over the sorted lines joined by
   newline plus a trailing newline; the value must equal the
   `manifest_root` the register stage reported.
4. Create the bundle record (through `fdpm`): `recrt:EvidenceBundle`
   `{id, manifest_root, hash_algorithm: "sha256", bundle_path}` — its id
   pattern is `recrt:evidence-bundle:{slug}`.
5. Create `recrt:EvidencedBy` from the node to the bundle.
6. Patch the node: `fdpm_primitive_patch` `verification_status` to
   `cas_checked` (an executed computation) or `proof_witnessed` (a
   kernel-checked proof).
7. When the goal itself is established under the acceptance criterion,
   patch the `fpl:Pursuit` `status` to `verified` (or `refuted`).

**Verify.** `fdpm validate <proofs workbook>` reports zero errors; the
re-crt evidence-gate rule stops warning on that node.

**Never.** Let an agent do steps 4–7. `fpl.producer_status_guard` rejects a
register stage that tries; the design depends on this record being yours.

### C2. Reject or supersede a registered node

**Goal.** Correct a wrong registration without erasing the record.

**Steps.** Do not delete. Create the corrected node, `recrt:ProofSupports`
it into place, and leave the wrong one with an `open_payload` note naming
its successor; `verification_status` stays `unverified`. The re-crt profile
has no supersession edge; the note is the link.

### C3. Calibrate a boundary

**Goal.** Move an `sa:ErrorClassCoverage` row from `accepted_risk` to
`covered`, and a boundary from `draft` to `active`.

**Status.** No calibration run exists. Every boundary is `draft`; every row
is `accepted_risk` with an implemented verifier as its compensating control.

**Steps.** Assemble a labelled set of solver returns (the receipts' raw
returns under `_tmp/codex-delegate/` are a start); for each error class
count what the verifier caught and missed; create `sa:CalibrationRun`
(`calibration_id`, `dataset_ref`, `dataset_digest`, `estimator`,
`confidence_level`, `sample_size_total`, `started_at`, `status: "passed"`,
`owner`) with `sa:CalibrationEvaluatesBoundary`,
`sa:CalibrationUsesConfiguration` and `sa:CalibrationMeasuresCoverage`
edges; patch each measured row with `verifier_recall`,
`false_positive_rate`, `calibration_sample_size`, `failure_action` and
`disposition: "covered"`; then patch the boundary to `active`. The
silent-acceptance profile refuses `covered` without those fields.

---

## Part D — Operations

### D1. Inspect a run

- `fdpm_loop_status(run_id)` — where it is and every attempt so far.
- `receipt_error` on the outcome or the summary: the run ended but its
  receipt could not be written (for example the id was taken). The run file
  under `<data dir>/loop-runs/` still holds every record.
- The receipt: `fdpm_primitive_get <workbook> lf:receipt:<slug>` after D2;
  `records` is the serialized attempt history; `handoff` the carried state.
- Renders: `fdpm://workbook/<workbook>/render/text/markdown` (budget
  envelope for the pipeline, boundary declaration, assurance dashboard,
  argument graph for the proof workbook).

### D2. Reload the `fdpm` server to see what the loop wrote

The loop server and the `fdpm` server share one data dir but hold separate
projections. After a run: `kill -HUP $(pgrep -f 'dist/src/bin/fdpm-mcp.js')`.
The receipt then appears through `fdpm`.

### D3. Run from a terminal instead of the tools

```bash
cd fdpm-cli
npx tsx scripts/run-loop-forward.ts --workbook frontier-proof-loop \
  --pipeline lf:pipeline:fpl-frontier-proof-loop --orchestrator file --input …
```
Prompts and answers are files under `_tmp/loop-forward/exchange/`. Same
executor, same checks, no server.

### D4. Unattended orchestrator stages (needs an API key)

`--orchestrator anthropic` runs the orchestrator stages through the
Anthropic API with `ANTHROPIC_API_KEY` set; `per_run` grants are exercised
only when named with `--approve-per-run <grant id>`, `per_action` grants
prompt on a TTY with `--approve-per-action` and are denied otherwise. Not
yet run in this repository.

### D5. Change the solver's effort or model for one run

`fdpm_loop_start(…, codex_effort: "high", codex_model: "<id>")`. The
default effort is the wrapper's; the default model is the one pinned in
`~/.codex/config.toml` (`gpt-6-astra` at the time of writing). Every
solver-configuration change is a boundary review: the
`sa:SolverConfiguration` digests were computed over the seeded prompts,
grants and context policy, not over these overrides.

### D6. Adjust budgets and timeouts

- Iterations, calls, tokens, wall clock: patch the pipeline's
  `lf:LoopConfig` (`lf:loop:fpl-main`, `lf:loop:cdel-main`) through `fdpm`,
  then start a new run; a running run keeps the bounds it started with.
- Attempts per stage: the stage's `lf:OutputContract` `max_attempts`
  (`on_invalid: "retry"` only).
- Artifact execution timeout: the loop server's default is 300,000 ms
  (`productionIO`); it is not yet a per-run argument.

### D7. Where things live, and cleaning up

| What | Where |
|---|---|
| run state | `~/.fdpm-cli/loop-runs/<run_id>.json` |
| solver orders, raw returns, wrapper stderr | `_tmp/loop-forward/codex/` and `_tmp/codex-delegate/` (git-ignored) |
| executed artifacts | `_tmp/loop-forward/artifacts/` (deleted after each run) |
| evidence bundles | `fdpm-cli/research/frontier-proof-loop/evidence/<pursuit>/` (git-ignored; the bundle record's `bundle_path`) |
| receipts, nodes, claims | the workbooks in `~/.fdpm-cli` |

`_tmp/` is cleared only when you ask.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `mcp__fdpm-loop__*` tools absent | server not registered, or the session predates registration | `claude mcp get fdpm-loop`; register per how-to.md §7; restart Claude Code |
| `fdpm_loop_start` → `input "x" is not declared` / `required input y is missing` | inputs do not match the pipeline's VariableSpecs | copy the input names from the pursuit record or the table above |
| `fdpm_loop_submit` → `conflict: run … is waiting on its delegate stage` | a solver stage is running | `fdpm_loop_wait` until `next` changes |
| `fdpm_loop_submit` → `not_found: unknown run` | the server process that held the run restarted and the run had ended, the id is wrong, or another session's live server owns the run | `fdpm_loop_list`; finished runs are on disk, not listed; a run another session started is driven from that session |
| `fdpm_loop_start` → `conflict: receipt lf:receipt:<slug> already exists` | the `receipt_slug` was used by an earlier run | choose another slug |
| the terminal outcome carries `receipt_error` | the receipt could not be written when the run ended | the run file under `<data dir>/loop-runs/` has every record; fix the cause (usually a taken id) and record the outcome by hand |
| `fpl.reference_resolves` "resolves to X (the page also declares …), not to the cited Y" | the citation equals none of the page's own titles | cite one of the declared titles; do not cite PDFs or repository paths |
| submit rejected with `Failures:` in the next prompt | your output missed the contract | the failures name the keys or the checks; fix and resubmit |
| `cdel.no_git_mutation` on a solver stage | the repository changed during the delegation | stop editing; re-run |
| `cdel.no_git_mutation` "HEAD moved" on `review` or `apply` | the orchestrator committed during its stage | never commit inside a stage; the operator commits |
| `fpl.written_ids_exist` says an id does not exist | the register stage reported an id that was not written, or was written to another workbook | read the ids back with `fdpm_primitive_get` before submitting |
| `fpl.evidence_bundle_manifest` root does not recompute | files under `bundle_path` changed after the root was computed | recompute; never edit a bundle |
| the run ended `failed: contract names an unimplemented validator` | a pipeline record names a validator not in `src/loop/named.ts` | implement it or fix the record; an unchecked output does not pass |
| the receipt is not visible through `fdpm` | its projection is stale | D2 |
| `lake env lean` fails with "unknown package" | `.lake/` missing | `cd fplproofs && lake exe cache get` |

---

## Reference

**Terminal states.** `success`, `clean_noop`, `blocked`, `approval_required`,
`exhausted`, `stagnated`, `failed`. A receipt is written for every one.

**Error classes** (Silent Acceptance v2.1.0 §5). `ERR_HALLUCINATION`,
`ERR_OMISSION`, `ERR_SCHEMA`, `ERR_TRUNCATION`, `ERR_SYCOPHANCY`,
`ERR_INSTRUCTION`, `ERR_CALIBRATION`, `ERR_SEMANTIC`, `ERR_REASONING`. Every
failure a check reports carries one; every audit finding must name one.

**Named validators** (`src/loop/named.ts`). `fpl.node_exists_in_workbook`,
`fpl.formal_artifact_check`, `fpl.reference_resolves`,
`fpl.error_class_vocabulary`, `fpl.written_ids_exist`,
`fpl.producer_status_guard`, `fpl.evidence_bundle_manifest`,
`cdel.json_contract`, `cdel.paths_exist`, `cdel.quotes_match`,
`cdel.diff_applies`, `cdel.no_git_mutation`.

**Artifact runners** (absolute paths, under bubblewrap, host read-only, no
network). `lean4`: `lake env lean` in `fplproofs`; `cas`:
`/usr/bin/gp -q -f`; `python`: `/usr/bin/python3 -I`.

**Ids.** Pipelines `lf:pipeline:cdel-codex-delegation`,
`lf:pipeline:fpl-frontier-proof-loop`; loops `lf:loop:cdel-main`,
`lf:loop:fpl-main`; the seeded pursuit `fpl:pursuit:ecdlp-frontiermath`;
receipts `lf:receipt:<slug>`.

**Profiles.** `profile:codex-delegation:0.2`,
`profile:frontier-proof-loop:0.1`, and their parents
`profile:loop-forward:2.0`, `profile:silent-acceptance:2.1`,
`profile:re-crt:6.2`, `profile:logical-knowledge-base:1.0`.

---

## What this does not do

- It does not make a model's answer correct. Every check is structural;
  the review and audit stages, and your verdict, are where meaning is judged.
- It does not prove open problems. Its honest terminal states on one are
  `blocked`, `stagnated` and `exhausted`, and its product is a verified map
  of the attack.
- It is not calibrated. No `sa:CalibrationRun` exists; every boundary is
  `draft`.
- It does not enforce grants on the orchestrator's writes; those go through
  the `fdpm` server under that server's controls. It does judge what was
  written and whether git moved.

## Related

- [how-to.md](how-to.md) — the delegation wrapper, the profile, the
  verification boundary, what has been run
- [frontier-proof-loop README](../fdpm-cli/scripts/frontier-proof-loop/README.md)
- Silent Acceptance v2.1.0 — doi:[10.5281/zenodo.19401266](https://doi.org/10.5281/zenodo.19401266)
- [Repository README](../README.md)
