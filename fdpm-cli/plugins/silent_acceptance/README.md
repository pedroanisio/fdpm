---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  source: "../SILENT_ACCEPTANCE-v2.1.0.pdf"
  generated_by: "OpenAI Codex"
  date: "2026-09-04"
---

# Silent Acceptance 2.1 profile

`profile:silent-acceptance:2.1` turns the reviewable verification-boundary
declaration in Silent Acceptance v2.1.0 into an FDPM graph. It is an assurance
profile, not a task scheduler and not an evidence knowledge base.

Use it alongside existing workbooks:

| Concern | Profile | Workbook responsibility |
|---|---|---|
| Multi-agent task ownership and leases | `profile:planning:0.1` | Who does which task, acceptance criteria, and coordination state |
| Bounded agent/model/tool pipelines | `profile:loop-forward:2.0` | Agents, prompts, stages, tool authority, validators, and run receipts |
| Research claims and evidence | `profile:logical-knowledge-base:1.0` or `profile:re-crt:6.2` | Claims, derivations, falsifiers, sources, proofs, and obstructions |
| Output verification and release authority | `profile:silent-acceptance:2.1` | Which output may cross which boundary, under which calibration and verdicts |

Keeping these as separate workbooks preserves their distinct authorities. A
planning workbook may name an assurance workbook or rendered artifact in its
acceptance evidence; it should not make a task agent the acceptance authority.

## Normative mapping

The model is derived from §§3.1, 5, 9.1, 9.6, and 9.7 of the supplied PDF.

| Protocol obligation | Profile representation |
|---|---|
| Complete solver configuration | `sa:SolverConfiguration`, including digests for context policy, tools, and prompts |
| Declared consumer and consequence | `sa:Consumer` and `sa:BoundaryProtectsConsumer` |
| Non-empty checked scope `S` | Nine `sa:ErrorClassCoverage` rows; an active boundary requires at least one `covered` row |
| Every class outside `S` is accepted risk | `accepted_risk` plus `sa:AcceptedRisk` or `sa:CoverageDeferredToBoundary` |
| Verifier mechanism and location | `sa:Verifier`, `sa:CoverageUsesVerifier`, and boundary `verifier_location` |
| Calibration against one configuration | `sa:CalibrationRun`, `sa:CalibrationUsesConfiguration`, and `sa:BoundaryPinsConfiguration` |
| Recall and specificity | `verifier_recall` and `false_positive_rate` on each covered class |
| Failure behaviour | Closed `retry`, `abstain`, `escalate`, or `fallback` action per covered class |
| Oracle | `sa:Oracle` and `sa:CoverageUsesOracle` |
| Severity and residual risk | Per-class prevalence, severity weight, and formula-checked `residual_risk` |
| Consumer tolerance `tau` | Boundary `tolerated_failure_rate` |
| Owner and calibration date | Required boundary and class ownership/date fields |
| Configuration change requires reevaluation | `sa:SubmissionCrossesBoundary` rejects a configuration other than the boundary pin |
| Acceptance outside producer control | `sa:AcceptanceAuthority`; active-boundary validation rejects shared domains or rewritable verdict stores |

The PDF also discusses prompt injection, policy/compliance failures, multimodal
outputs, and `ERR_TOOL_USE` as separate or future scope. They are deliberately
not added to the v2.1 intrinsic nine-class enum.

The severity-weighted residual-risk sum and `tau` are retained as separate
quantities. The protocol defines residual risk using class severity weights, while
`tau` is a tolerated failure rate; the profile does not make a dimensionally invalid
numeric comparison between them. The consumer's required
`acceptability_definition` records the basis on which the declared residual risk is
judged acceptable.

## Lifecycle

Build an assurance workbook in this order:

1. Create the consumer, solver configuration, acceptance authority, and a
   `draft` verification boundary.
2. Link exactly one coverage row for each of the nine intrinsic error classes.
3. For each `covered` class, link a verifier and an independent oracle. For
   each `accepted_risk` class, link a mitigation record or downstream boundary.
4. Record one passed calibration linked to the boundary, its pinned
   configuration, and every coverage row.
5. Patch the boundary to `active`. The patch is rejected if the declaration is
   incomplete, residual risk exceeds `tau`, or control domains are not separate.
6. Link every output submission to its producing configuration before linking
   it to the boundary. A changed configuration is rejected until a new boundary
   revision or calibration is declared.
7. Record verification runs and class verdicts, then let the delegated authority
   append an acceptance decision. An `accept` decision requires one correct
   verdict per class.

Start and inspect a workbook:

```sh
fdpm profile get profile:silent-acceptance:2.1 --json

fdpm workbook create --json \
  --id research-assurance \
  --name "Research assurance" \
  --profile profile:silent-acceptance:2.1

fdpm profile get profile:silent-acceptance:2.1 --json \
  | jq '.primitive_types[] | select(.id == "sa:VerificationBoundary")'
fdpm validate research-assurance --json
```

The MCP equivalent begins with `fdpm.workbook.list`, then
`fdpm.profile.type_info`, and uses the batch create tools. A workbook is pinned
to profile version `2.1.0` when created.

## Renderers

All four renderers are profile-bound, so a Silent Acceptance workbook cannot
fall through to an unrelated plugin renderer.

```sh
fdpm render research-assurance text/markdown \
  --renderer-id sa:BoundaryDeclarationRenderer \
  --output silent-acceptance-boundary.md

fdpm render research-assurance text/html \
  --renderer-id sa:AssuranceDashboardRenderer \
  --output silent-acceptance-assurance.html

fdpm render research-assurance image/svg+xml \
  --renderer-id sa:ControlDomainMapRenderer \
  --output silent-acceptance-control-domains.svg

fdpm render research-assurance application/vnd.fdpm.silent-acceptance+json \
  --renderer-id sa:StateRenderer \
  --output silent-acceptance-state.json
```

- Markdown is the human-reviewable §9.1 declaration.
- HTML is a responsive, light/dark, print-ready assurance dashboard.
- SVG shows producer, verifier, consumer, and acceptance control domains.
- JSON is a deterministic agent projection capped at 256 KiB.

## Verification boundary of this profile

The graph can reject structural defects, mismatched configuration pins,
incomplete calibration, formula drift, and declared control-domain collisions.
It cannot prove that:

- deployed OS/IAM privileges actually prevent producer writes;
- an external oracle or human label is correct;
- every production output traversed the declared verifier path.

Every renderer labels these as unchecked assurance claims. Deployment evidence
outside the producer's control domain must close them.

## Compatibility

The profile identity is `profile:silent-acceptance:2.1`, and its schema version
is `2.1.0`. Adding optional annotations is a minor change. Removing a type,
renaming a field, narrowing an enum, or changing a required relation is a
breaking change and requires a new major profile family.

The source PDF carries a v2.1.0 cover and normative §9.1 text, while some
end-matter strings retain v2.0.0 wording. This plugin follows the v2.1.0 cover
and the normative sections named above; it does not derive validation behavior
from stale end matter.
