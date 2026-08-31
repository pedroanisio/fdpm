# VeraFormX

VeraFormX is a server that AI agents and people author structured work into, through MCP tools or a command line, holding every body of work to a schema the work cannot escape. Specifications, requirements, plans, reports, filings, and the briefs one model hands to another are stored as a graph of typed items and named links, and each change to that graph is checked before it is accepted and appended to a log that only ever grows. What you get back is work you did not have to re-read to trust: a malformed write is rejected at the moment it happens and named against the rule it broke, an approved document renders to every format its readers need from one source, and the account of who changed what, and why, survives as long as the work does. That is what makes one model's output usable as the next model's input with nobody sitting in the middle to inspect the handoff.

The schema is called a profile: the closed set of types and relations a body of work may contain, the fields each type requires, and the checks a write has to pass. Each body of work is a workbook, and a workbook names its profile when it is created. Twenty-one profiles ship today, so a team working in specification, requirements, architecture, planning, academic publishing, or multi-stage AI pipelines starts with the rulebook already written.

## Invalid data never gets written

Every write is checked against the profile before it lands, so malformed data never reaches storage or the next model in the chain. An AI writing a report, a plan, or a task list can omit a required field or contradict itself, and nothing in an ordinary pipeline stops the save. VeraFormX refuses the write whole, then names the rule that failed and the field it failed on, in a message that says what was wrong with the value. The retry is aimed rather than guessed, which matters most when the thing retrying is another model.

## One rulebook, generated once

The rules live in a single schema and the server enforces that schema directly, so there is no separately maintained checker to go stale between releases. Where a domain is already defined as a Zod schema, the profile and its entire enforcement layer are generated from that schema in one direction, deterministically. The UIXO interaction ontology arrives this way: 712 classes become primitive types and 210 relation types are derived from the ontology's graph-edge fields, with the source ontology pinned by content hash. Nobody hand-maintains the validator set that enforces it, and nobody can.

Three classes of rule run on every write. Shape rules require a report to carry a title and a date. Agreement rules require the end date to follow the start date. Judgment rules are written as code, for constraints a declarative schema cannot express — referential integrity across a whole deck, slug uniqueness, acyclicity of a claim hierarchy, contiguity of slide numbering.

## You decide which rules are fatal

A rule marked blocking refuses the write outright; a rule marked advisory records the concern and lets it through. That distinction is what lets you take in data from outside your control, a partner's export or a legacy import, without being locked out of your own records by their imperfections. It is also what lets a domain evolve: the shipped software requirements profile downgraded its edge-existence rules from error to warning in its second version, because a node has to be creatable before the edge that points at it can exist. The knob is there because real domains need it.

## Data as a connected graph

Items connect through named links, hold their order, and nest inside one another, and the links are as typed as the items. Across the shipped profiles there are 950 primitive types and 484 relation types — 475 declared by the base profiles and nine more added by the compositions. References hold from both ends: a link cannot be created to an item that isn't there, and an item cannot be quietly removed out from under a link that depends on it. Moving an item between groups runs the same rule checks as any other write to that item, and re-ordering a set is checked as a permutation of that set, so a reorder cannot invent or drop members.

## A vocabulary you can extend without forking it

A profile can extend other profiles, and the registry resolves the chain when the profile is registered, rejecting cycles and identifier collisions. A workbook on a derived profile is checked against the union of everything in the chain, so the parent stays usable on its own while the child adds one concern across it. Three composed profiles ship: the document-plan vocabulary joined to graph-derived section numbering, and the spec-authoring and formal-specification vocabularies joined to the same. Two of the three declare no types of their own and exist only so that one workbook can hold both vocabularies at once.

What a workbook cannot do is change its mind. It names one profile when it is created and no operation exists that could rewrite that choice, because the set of operation kinds is closed at twenty-three and every payload rejects unknown fields. The guarantees a record carries are the guarantees it was created under, which is the property an auditor is actually asking about.

## Two kinds of content

Finished documents render from one source, and the outputs agree because they share that source. Forty-five renderers ship across the profiles, producing Markdown, HTML, PDF, SVG and PNG diagrams, BibTeX and LaTeX for academic work, and OpenAPI YAML from an architecture model. Compliance filings, reports, and contracts live here: the formats a regulator, a counterparty, and an internal reader each need, with no reconciliation step between them.

Instructions for downstream AI are the second kind. Requirements, specifications, and plans passing the check means the receiving model starts from a brief that is complete and unambiguous, and one stage's validated output becomes the next stage's input. The loop-forward profile models that chain explicitly: bounded multi-stage pipelines whose only backward data path is a named carry, per-stage output contracts, an evaluation gate, and terminal run receipts. The planning profile models the other half, with work breakdown, machine-evaluable acceptance criteria, and concurrent execution by humans and several agents at once. A domain also ships its own briefing, so a model meeting that domain for the first time is told how to author in it rather than only which fields exist.

## People approve; the schema decides

Reviewers work by approving and refusing rather than hand-patching records. A reviewer reads a clean rendered view alongside the log of what happened, then accepts or rejects. The human and the AI answer to the same rulebook, which makes an approved change exactly as trustworthy as a machine-generated one.

Destructive operations are off unless explicitly armed, and any of them can be run as a preview first: the preview names the item that would disappear and every link still touching it. Deleting a record that other records point at is refused, and the refusal lists every one of them. Removing those links along with it is a separate, deliberate instruction.

## A log that only grows

Every change appends to a log that is never rewritten, and the current state is that log replayed. Each entry records the author, the tool, and the cause. Any prior version rebuilds, any two versions compare, and a fix applied to the schema propagates to every item created after it. The agent-memory profile takes the same principle into the domain model itself: a later claim supersedes an earlier one and the chain of replacements is the account of how the agent's picture of the world changed.

What the log accepts, it keeps. A write is on stable storage before the call returns rather than sitting in a cache waiting to be flushed, and two processes writing the same records cannot interleave into a history that will not replay.

## Where the guarantee stops

VeraFormX guarantees shape. A correctly-shaped report carrying wrong numbers passes, because verifying facts belongs to the model that wrote them and to the person who approves them. The value concentrates where broken shape is the thing that causes the damage.

VeraFormX earns its keep on AI-to-AI handoffs, compliance paperwork, and projects that run long enough for their own history to matter. The case against it holds where one person reads every output once and checks it by hand: at that volume, the schema costs more than it returns.

---

## What ships today

Twenty plugins ship twenty profiles — seventeen independent and three composed from the others — and a core empty profile makes twenty-one in the registry. Together they register 883 validators, 45 renderers, and 5 authoring briefings for models. The 712 validators belonging to the UIXO ontology alone indicate how far the model scales before it needs help.

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
| Document Plan | A document's plan, registries, and section tree |
| Visual Style | A style registry: grammar sections, rules, compliance checks |
| UML 2.5.1 | Twenty-two metaclasses of the foundation subset |
| UIXO | A 712-class interaction ontology |

Business and pitch deck profiles, a document node identity profile, and a starter template for authors round out the set. A workspace can register further profiles of its own.

## Availability

The source is public and the packages are not yet published. Reading, building and running from a checkout works today; taking a dependency on it does not.

| | Status |
| --- | --- |
| Source | Public on GitHub |
| Licence | **Not yet selected.** Public source without a licence reserves all rights, so no use, copying or redistribution is granted yet |
| npm | `@fdpm/cli` and `@fdpm/zod-bridge` are unpublished; the VeraFormX-named packages do not exist yet |
| Naming | The rename from FDPM is in progress. Package names, plugin identifiers, the `fdpm://` resource scheme and the `FDPM_*` environment variables still carry the old name |

Selecting the licence is the one decision that gates everything downstream of it.
