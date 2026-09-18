---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Fable 5.1 via Claude Code"
  date: "2026-09-05"
---

# Frontier proof loop

## Disclaimer

This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](../../../DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.

An orchestrator agent (Anthropic Fable) commands a solver agent (the Codex CLI
running `gpt-6-astra`) on one frontier problem, one checkable step at a time,
and registers every advance as **unverified** records in two fdpm workbooks.
Nothing either agent writes becomes verified. That is the design, not a gap.

| File | What it is |
|---|---|
| [`profile.ts`](profile.ts) | `profile:frontier-proof-loop:0.1` — extends loop-forward 2.0, silent-acceptance 2.1, re-crt 6.2 and logical-knowledge-base 1.0; contributes `fpl:Pursuit` and the bridge relations |
| [`seed.ts`](seed.ts) | The orchestration workbook (pipeline, boundaries, verifiers, the first pursuit) and the pursuit's proof and knowledge workbooks |
| [`fplproofs/`](fplproofs/) | The Lean 4 project (with mathlib) that `fpl.formal_artifact_check` runs `lean4` artifacts in; `.lake/` is not committed |
| [`../build-frontier-proof-loop.ts`](../build-frontier-proof-loop.ts) | Registers the profile and seeds the three workbooks |
| [`../run-loop-forward.ts`](../run-loop-forward.ts) | Runs the pipeline to a terminal state and writes the run receipt |
| [`../../tests/frontier-proof-loop.test.ts`](../../tests/frontier-proof-loop.test.ts) | The gate: builds clean, every named verifier is implemented, the blocking rule blocks |

## The loop

Four stages per iteration, bounded by the `lf:LoopConfig` (12 iterations, 96
model calls, 6 hours, $200) and by the executor, never by a model:

1. **plan** — Fable reads the proof workbook and picks one step an artifact
   can check. Emits a `stop_reason`; `target_verified` is only legal when the
   goal node's stored status already says so, which Fable cannot set.
2. **attempt** — Astra returns an artifact (Lean 4, PARI/GP, Python), the
   command that reproduces it, claims with confidence, references, and the
   obstructions it hit. The wrapper executes the artifact in a bubblewrap
   sandbox and resolves every reference before the return is accepted.
3. **audit** — Fable reads the validated attempt adversarially and classifies
   findings by Silent Acceptance error class. A verdict is a filter, not an
   acceptance.
4. **register** — Fable writes unverified nodes and claims through the fdpm
   MCP server, reads them back, and reports what it wrote. The producer
   status guard reads the store, not the report.

Every stage has an `sa:VerificationBoundary` over all nine error classes. All
36 coverage rows are `accepted_risk` and every boundary is `draft`: the
verifiers are implemented in `src/loop/named.ts` and run on every attempt, but
no `sa:CalibrationRun` has measured their recall, and
`profile:silent-acceptance:2.1` refuses `covered` without one.

## Verifiers

All eleven declared verifiers are implemented. The seven named validators
live in [`src/loop/named.ts`](../../src/loop/named.ts):

| Validator | What it does |
|---|---|
| `fpl.node_exists_in_workbook` | `target_node_id` is a real `recrt:ProofNode` in the proof workbook |
| `fpl.formal_artifact_check` | Executes the artifact under bubblewrap (read-only host, no network, hard timeout) and requires exit 0 for `proved`, `computed`, `refuted`; `prose` only with `partial` or `failed` |
| `fpl.reference_resolves` | Resolves every DOI / arXiv id / https locator and requires the title found there to match the cited title after normalisation |
| `fpl.error_class_vocabulary` | Every audit finding names one of the nine classes |
| `fpl.written_ids_exist` | Every id the register stage reports exists in the named workbook; non-empty when the audit said `register` |
| `fpl.producer_status_guard` | No written node carries a verdict status; no producer writes an `recrt:EvidenceBundle` |
| `fpl.evidence_bundle_manifest` | The reported `manifest_root` recomputes from the files under `bundle_path` |

Runners are absolute paths. This repository's interactive shell aliases `gp`
to `git push`; a runner spelled `gp -q` would inherit that. The validator
refuses a relative CAS runner outright.

## Acceptance authority

The operator, in the control domain `operator-review`, outside both agents'
runtimes. The mechanism:

- Neither agent holds a grant that can write a verdict. `fpl.producer_status_guard`
  rejects a register stage whose written nodes carry `cas_checked`,
  `proof_witnessed` or `axiom`, and rejects any `recrt:EvidenceBundle` a
  producer writes.
- Every orchestrator write through the MCP server is a `per_action` grant.
  The executor denies those unless the operator answers the prompt; nothing
  in the loop can approve itself.
- A verdict is recorded by the operator as an appended operation: an
  `recrt:EvidenceBundle` whose `manifest_root` the operator recomputed, an
  `recrt:EvidencedBy` edge, and a `verification_status` patch on the node.
  The verdict store is the append-only fdpm operation log of the proof
  workbook plus this workbook's `sa:ClassVerdict` / `sa:AcceptanceDecision`
  records.

## Running it

From Claude Code in VS Code, by tool calls — the session is the
orchestrator, Codex is the solver, no API key. Register the loop server once
(see docs/how-to.md §7), restart Claude Code, then:

```
fdpm_loop_start(
  workbook_id = "frontier-proof-loop",
  pipeline_id = "lf:pipeline:fpl-frontier-proof-loop",
  inputs = { pursuit_id, domain, problem_statement, acceptance_criterion,
             proofs_workbook_id, knowledge_workbook_id, evidence_root })
```

and answer each `prompt` with `fdpm_loop_submit`, polling `fdpm_loop_wait`
while a solver stage runs. The pursuit's input values are on the
`fpl:Pursuit` record (`fdpm_primitive_get frontier-proof-loop
fpl:pursuit:ecdlp-frontiermath`).

From a terminal:

```bash
cd fdpm-cli
npx tsx scripts/build-frontier-proof-loop.ts            # register + seed (re-runnable)
kill -HUP <fdpm-mcp pids>                               # reload the servers
npx tsx scripts/run-loop-forward.ts \
  --workbook frontier-proof-loop --pipeline lf:pipeline:fpl-frontier-proof-loop \
  --orchestrator file ...                               # prompt/output files under ~/.fdpm-cli/loop/exchange/
#   --orchestrator anthropic --approve-per-run <grant> --approve-per-action   # needs ANTHROPIC_API_KEY
```

## Runs and their evidence

Every run writes an `lf:RunReceipt` to the `frontier-proof-loop` workbook
(attempts, accepted attempts, tokens, wall time) and its registered nodes,
claims and provenance to the pursuit's two workbooks. Evidence bundles are
written under the host data dir (`~/.fdpm-cli/evidence/<pursuit>/<run>/`) and
named by the manifest root the acceptance authority recomputes. Nothing a run
registers is verified: every node is `unverified`, every claim `stated` /
`proposed`, and no `recrt:EvidenceBundle` exists until the acceptance
authority creates one from a root it computed itself. The workbooks and the
receipts are the record of what has run; this file does not repeat them.

## What a Millennium Prize pursuit would produce

The first pursuit is ECDLP because it has a decidable acceptance criterion.
No Millennium problem does. Registered against one, this loop's honest output
is an `re-crt` workbook: a reason DAG of the attack, an obstruction DAG whose
barriers cite references that resolved, computations that executed, and every
claim `unverified`. Its terminal states on such a problem are `blocked`,
`stagnated` and `exhausted`. It is a machine for not fooling yourself, and it
is built so that it cannot report a proof it did not find.

[User manual — scenarios](../../../docs/frontier-loop-manual.md) · [Back to the repository README](../../../README.md)
