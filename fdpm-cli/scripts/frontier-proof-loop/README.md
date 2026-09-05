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

```bash
cd fdpm-cli
npx tsx scripts/build-frontier-proof-loop.ts            # register + seed (re-runnable)
kill -HUP <fdpm-mcp pids>                               # reload the servers

# The orchestrator by hand — an interactive agent session answers the prompt
# files the executor writes under _tmp/loop-forward/exchange/:
npx tsx scripts/run-loop-forward.ts \
  --workbook frontier-proof-loop --pipeline lf:pipeline:fpl-frontier-proof-loop \
  --orchestrator file \
  --input pursuit_id=fpl:pursuit:ecdlp-frontiermath \
  --input domain=mathematics \
  --input problem_statement="$(...)" --input acceptance_criterion="$(...)" \
  --input proofs_workbook_id=fpl-ecdlp-proofs --input knowledge_workbook_id=fpl-ecdlp-knowledge \
  --input evidence_root=fdpm-cli/research/frontier-proof-loop/evidence/ecdlp

# Unattended orchestrator stages need ANTHROPIC_API_KEY and explicit approvals:
#   --orchestrator anthropic --approve-per-run lf:grant:fpl-fable-workbook-create --approve-per-action
```

## What has been run

On 2026-09-05, one run of three iterations through `run-loop-forward.ts`
with `--orchestrator file` (an interactive Claude Fable session answering the
prompt files) and Codex (`gpt-6-astra`) as the solver, on the ECDLP pursuit:

| Iteration | Step | Solver artifact | Boundary | Registered |
|---|---|---|---|---|
| 1 | Certify the instance | PARI/GP, 8 checks incl. `ellcard` | executed under bubblewrap; reproduced; constants matched to `challenge.json` | 1 assumption + 8 derived + 1 derived aggregate nodes, 8 claims, provenance record |
| 2 | Screen special cases | PARI/GP: anomalous, embedding degree ≤ 40, j ∈ {0,1728} | executed; reproduced; all three recomputed independently in Python | 3 derived + 1 aggregate nodes, 3 claims, proposition + claim + provenance |
| 3 | — | — | plan reported `blocked`: the last open leaf is explained by the undefeated generic-group barrier | handoff with the carried DAG state |

Receipt `lf:receipt:fpl-ecdlp-run-2`: 9 attempts, 9 accepted, 62,322 tokens,
772 s. Every registered node is `unverified`; every claim is `stated` /
`proposed`. No `recrt:EvidenceBundle` exists: that record is the acceptance
authority's, and none has been written. The evidence bundles the authority
would recompute are under
`fdpm-cli/research/frontier-proof-loop/evidence/ecdlp/run-2` and `run-2-i2`
(manifest roots `9a1fd9f1…` and `24bb817b…`).

## What a Millennium Prize pursuit would produce

The first pursuit is ECDLP because it has a decidable acceptance criterion.
No Millennium problem does. Registered against one, this loop's honest output
is an `re-crt` workbook: a reason DAG of the attack, an obstruction DAG whose
barriers cite references that resolved, computations that executed, and every
claim `unverified`. Its terminal states on such a problem are `blocked`,
`stagnated` and `exhausted`. It is a machine for not fooling yourself, and it
is built so that it cannot report a proof it did not find.

[Back to the repository README](../../../README.md)
