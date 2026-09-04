---
disclaimer:
  generated_by: "Claude Fable 5.1 via Claude Code (README restructure); positioning text from the author's workflow"
  date: "2026-09-04"
---

# fdpm — VeraFormX: schema-enforced workbooks for agents and people

VeraFormX is a server that AI agents and people author structured work into, through MCP tools or a command line, holding every body of work to a schema the work cannot escape. Specifications, requirements, plans, reports, filings, and the briefs one model hands to another are stored as a graph of typed items and named links; each change is checked before it is accepted and appended to a log that only grows. What you get back is work you did not have to re-read to trust: a malformed write is rejected the moment it happens and named against the rule it broke, an approved document renders to every format its readers need from one source, and the account of who changed what, and why, survives as long as the work does. That is what makes one model's output usable as the next model's input with nobody in the middle inspecting the handoff.

The source is public at [github.com/pedroanisio/fdpm](https://github.com/pedroanisio/fdpm) under the Apache License 2.0. Today it runs from a checkout: `npm --prefix fdpm-cli ci && npm --prefix fdpm-cli run build`, then `npm --prefix fdpm-cli run dev -- version`. The npm packages `@fdpm/cli` 1.3.0 and `@fdpm/zod-bridge` 0.4.0 are not published yet.

The schema is called a profile: the closed set of types and relations a body of work may contain, the fields each type requires, and the checks a write has to pass. Each body of work is a workbook, and a workbook names its profile when it is created. Twenty-three profiles are registered out of the box, so a team working in specification, requirements, architecture, planning, academic publishing, historical fiction, formal reasoning, or multi-stage AI pipelines starts with the rulebook already written.

## Invalid data never gets written

Every write is checked against the profile before it lands, so malformed data never reaches storage or the next model in the chain. An AI writing a report can omit a required field or contradict itself, and nothing in an ordinary pipeline stops the save. VeraFormX refuses the write whole and names the rule that failed, the field, and what was wrong with the value. The retry is aimed rather than guessed, which matters most when the thing retrying is another model.

## One rulebook, generated once

The rules live in a single schema and the server enforces that schema directly, so there is no separately maintained checker to go stale between releases. Where a domain already exists as a Zod schema, the profile and its enforcement layer are generated from it in one direction, deterministically. The UIXO interaction ontology arrives this way: 712 classes become primitive types and 210 relation types are derived from its 1,653 graph-edge fields, with the source ontology pinned by content hash. Nobody hand-maintains the 712 validators that enforce it, and nobody can.

Three classes of rule run on every write: shape rules (a report carries a title and a date), agreement rules (the end date follows the start date), and judgment rules written as code for what a declarative schema cannot express — referential integrity across a deck, slug uniqueness, acyclicity of a claim hierarchy.

## You decide which rules are fatal

A blocking rule refuses the write outright; an advisory rule records the concern and lets it through. That lets you take in a partner's export or a legacy import without being locked out of your own records by their imperfections, and it lets a domain evolve: the shipped software-requirements profile downgraded its edge-existence rules from error to warning in its second version, because a node has to exist before an edge can point at it.

## Data as a connected graph

Items connect through named links, hold their order, and nest inside one another, and the links are as typed as the items. Across the twenty base profiles there are 969 primitive types and 500 relation types, and the compositions add nine relation types more. References hold from both ends: a link cannot be created to an item that is not there, and an item cannot be quietly removed out from under a link that depends on it. Moving an item runs the same checks as any other write, and a reorder is checked as a permutation, so it cannot invent or drop members.

## A vocabulary you can extend without forking it

A profile can extend other profiles; the registry resolves the chain at registration, rejecting cycles and identifier collisions. A workbook on a derived profile is checked against the union of the chain, so the parent stays usable on its own while the child adds one concern across it. Three composed profiles ship: the document-plan, spec-authoring and formal-specification vocabularies each joined to graph-derived section numbering.

What a workbook cannot do is change its mind: no operation exists that could rewrite its profile, because the set of operation kinds is closed at twenty-four and every payload rejects unknown fields. The guarantees a record carries are the guarantees it was created under, which is what an auditor is actually asking.

## Two kinds of content

Finished documents render from one source, and the outputs agree because they share it. Forty-seven renderers ship across the profiles, producing Markdown, HTML, PDF, SVG and PNG diagrams, BibTeX and LaTeX for academic work, and OpenAPI YAML from an architecture model. Compliance filings, reports and contracts live here, in the formats a regulator, a counterparty and an internal reader each need, with no reconciliation step.

Instructions for downstream AI are the second kind. A requirement, specification or plan that passes the check is a brief the receiving model can start from, and one stage's validated output becomes the next stage's input. The loop-forward profile models that chain explicitly: bounded multi-stage pipelines whose only backward data path is a named carry, per-stage output contracts, an evaluation gate, and terminal run receipts. The planning profile models the other half: work breakdown, machine-evaluable acceptance criteria, and concurrent execution by humans and several agents at once. Five domains also ship briefings as MCP prompts, six in all, so a model meeting a domain for the first time is told how to author in it rather than only which fields exist.

## People approve; the schema decides

Reviewers approve and refuse rather than hand-patch records: a clean rendered view beside the log of what happened, then accept or reject. Human and AI answer to the same rulebook, so an approved change is exactly as trustworthy as a machine-generated one.

Destructive operations are off unless explicitly armed, and each can be previewed first: the preview names the item that would disappear and every link still touching it. Deleting a record other records point at is refused, and the refusal lists them; removing those links along with it is a separate, deliberate instruction.

## A log that only grows

Every change appends to a log that is never rewritten, and the current state is that log replayed. Each entry records the author, the tool, and the cause. Any prior version rebuilds and any two versions compare. The agent-memory profile takes the same principle into the domain model: a later claim supersedes an earlier one, and the chain of replacements is the account of how the agent's picture of the world changed.

What the log accepts, it keeps. A write is on stable storage before the call returns, and two processes writing the same records cannot interleave into a history that will not replay.

## Where the guarantee stops

VeraFormX guarantees shape. A correctly shaped report carrying wrong numbers passes, because verifying facts belongs to the model that wrote them and to the person who approves them. The value concentrates where broken shape is the thing that causes the damage: AI-to-AI handoffs, compliance paperwork, and projects that run long enough for their own history to matter. The case against it holds where one person reads every output once and checks it by hand; at that volume the schema costs more than it returns.

## What ships today

Twenty-two plugin directories, one of them the `_starter` teaching template, ship twenty-two profiles; with the core empty profile the registry holds twenty-three: twenty base and three composed. Together the plugins register 897 validators, 47 renderers and 6 MCP prompts.

| Profile | Models |
| --- | --- |
| Formal Specification | Specifications, technical papers, typed execution roadmaps |
| Spec Authoring | House-style SPEC documents as a typed object graph |
| Software Requirements | An SRS with traceability, agreements, change control, baselines |
| Software Architecture | Domain models, services, APIs, state machines, decisions |
| Planning | Work breakdown, acceptance criteria, dependencies, agent scheduling |
| Loop-Forward | Multi-stage AI pipelines with contracts, gates, and run receipts |
| Agent Memory | Facts with provenance, hypotheses owing evidence, supersession chains |
| Knowledge Cartridge | A corpus compressed into a cited, executable competence module |
| Academic Paper | Eight paper genres across 24 types and 61 relations |
| Fact-Fiction | Historical fiction whose invented layer stays honest about its relationship to the historical record |
| RE-CRT | A typed reason DAG, its dual obstruction DAG, claim and theorem registries, an evidence layer, and open-leaf triage |
| Document Plan | A document's plan, registries, and section tree |
| Visual Style | A style registry: grammar sections, rules, compliance checks |
| UML 2.5.1 | Twenty-two metaclasses of the foundation subset |
| UIXO | A 712-class interaction ontology |

Business and pitch deck profiles, a document node identity profile, and the starter template round out the set; per-profile counts, validators, renderers and prompts are in the generated [profile atlas](docs/architecture/PROFILES.md). A workspace can register further profiles of its own.

## Availability

| | Status |
| --- | --- |
| Source | Public on GitHub: [pedroanisio/fdpm](https://github.com/pedroanisio/fdpm) |
| Licence | Apache License 2.0 (SPDX `Apache-2.0`); [`LICENSE`](LICENSE) at the root and byte-identical copies in both package roots |
| npm | Not yet published; `@fdpm/cli` 1.3.0 and `@fdpm/zod-bridge` 0.4.0 install from a checkout |
| Naming | The rename from FDPM is in progress. Package names, plugin identifiers, the `fdpm://` resource scheme and the `FDPM_*` environment variables still carry the old name |

The remaining gate is the first npm publication; the procedure is in [RELEASING.md](RELEASING.md).

## Plugin trust

A plugin's trust tier decides whether it runs without the operator's say-so. `core` plugins are in-tree under `fdpm-cli/plugins/<id>/` and activate automatically. `verified` plugins declare `trust.signed_by`, which must match a key in `FDPM_TRUSTED_KEYS` before they activate on their own. `community` plugins — a valid manifest, no signature — are discovered but start `disabled` and never auto-activate; the operator enables each with `fdpm plugin enable <id>`. Discovery and activation are separate decisions, and the second belongs to the operator.

## The falsifiable contract

The verb / resource / prompt architecture is a hypothesis, and its kill criterion is a three-arm cold-agent eval — verbs only; verbs plus discovery tools; verbs, discovery and plugin-shipped prompts — on the same fifty-instruction set and model snapshot with no prior exposure. The rule in the [design document](docs/architecture/DESIGN.md#eval-design-the-falsifiable-contract): if arm 3 does not beat arm 2 by at least **15 percentage points** on first-try success, prompts did not pay for themselves and the v3+ work that depends on the prompt thesis is reconsidered. The runner ships (`npm --prefix fdpm-cli run eval:cold-agent -- --model <id>`) with a fifty-instruction planning test set whose reference solutions pass all four scoring criteria against the real server; the measurement itself has not been run, so no first-try success number exists yet. The design, the arms as they map onto the surface that ships, and the scoring rules are in [docs/eval/COLD-AGENT-EVAL.md](docs/eval/COLD-AGENT-EVAL.md); the reasoning for gating the roadmap on it is in [PURPOSE.md](PURPOSE.md).

## Where to read next

- [docs/architecture/DESIGN.md](docs/architecture/DESIGN.md) — full design document and status ledger (formerly this README)
- [fdpm-cli/MANUAL.md](fdpm-cli/MANUAL.md) — command reference
- [AGENTS.md](AGENTS.md) — programmatic reference for agents
- [PURPOSE.md](PURPOSE.md) — why the project exists
- [docs/specs/SPEC-CORE.md](docs/specs/SPEC-CORE.md) and [docs/specs/SPEC-MCP-SERVER.md](docs/specs/SPEC-MCP-SERVER.md) — the normative specifications
- [docs/PUBLIC-READINESS.md](docs/PUBLIC-READINESS.md) — release-readiness assessment
- [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), [RELEASING.md](RELEASING.md)
- [fdpm-cli/packages/zod-bridge/README.md](fdpm-cli/packages/zod-bridge/README.md) — Zod schema to plugin generator

## Disclaimer

This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](./DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.

## Verification statement

- Counts: read from [docs/architecture/PROFILES.md](docs/architecture/PROFILES.md), generated from the running host by `fdpm-cli/scripts/build-profile-atlas.ts` and drift-gated by `fdpm-cli/tests/_meta/doc-drift.test.ts`; the operation-kind count is the length of `OPERATION_KINDS` in `fdpm-cli/src/core/operations/kinds.ts`.
- Licence: `fdpm-cli/tests/_meta/public-readiness.test.mjs` pins the SHA-256 of the canonical Apache text for all three `LICENSE` copies and the SPDX field in both manifests.
- Visibility: the GitHub API returned `visibility: public` and `license: Apache-2.0` for `pedroanisio/fdpm` on 2026-09-04; the npm registry returned 404 for both packages the same day.
- Not verified: the cold-agent eval has not run, so no first-try success number exists. The claims about what the schema is worth — aimed retries, trustworthy handoffs, where the value concentrates — are the author's judgement, not measurements.

### Verification boundary

> VERIFICATION BOUNDARY REQUIRED (Silent Acceptance v2.0.0):
> LLM error rates are non-negligible across realistic deployments.
> Passing LLM output onward with no declared verification boundary is a
> design defect, not a runtime bug. All LLM output must be treated as
> untrusted and validated explicitly, per error class.

## License

Apache License, Version 2.0 (SPDX `Apache-2.0`). The canonical text is [`LICENSE`](LICENSE); byte-identical copies in `fdpm-cli/LICENSE` and `fdpm-cli/packages/zod-bridge/LICENSE` ship in the npm tarballs.
