---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Opus 4.7 via Claude Code"
  date: "2026-05-05"
---

# Repository Purpose

## Disclaimer

This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](./DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.

## Repository Layout

The runnable CLI package lives under [`fdpm-cli/`](./fdpm-cli/); the
top-level repository carries cross-cutting docs (`docs/specs/`,
`DISCLAIMER.md`, `PURPOSE.md`, this file) and packaging scripts. The
nested layout exists so the repo can host adjacent tools (renderers,
plugins, eval harnesses) without polluting the CLI's `package.json`.

## Why This Repository Exists

This repository exists to ship FDPM as an **agent-driven domain workbench**.

**Primary user is the LLM agent. The human-CLI surface is the same
surface as a side effect, not a co-design constraint.** Humans are
reviewers — they read renders, audit the operation log, and (in a
future iteration) interact through a web UI sitting on the same MCP
substrate. The CLI exists; it is the debug surface and the
script-automation surface, not the design target.

Every architectural decision in this repository should be evaluated
against this question: *can a cold LLM agent, given only the FDPM MCP
server and no prior domain prompting, drive a workbook competently on
first contact?* If the answer is no, the surface is wrong, regardless
of how clean it looks to a human operator.

The architecture is a **hypothesis**, not a finished product. The
verb / resource / prompt / expression layering described below is
unproven at scale. The first eval — three-arm differential against a
cold-agent test set — is the falsifiable contract; if it fails, the
design is wrong and the work above v2 is moot.

## What "Agent-Driven Workbook" Means Concretely

An FDPM workbook is a typed, event-sourced graph of primitives and
relations. The agent does not edit it through generic CRUD; it acts
through a **plugin-shipped vocabulary** with four parts, ordered by
how a cold agent encounters them:

1. **Verbs (act)** — domain-specific operation kinds
   (`planning.task.complete`, `fs.assumption.invalidate`,
   `dnis.node.split`). Each verb is a first-class entry in the
   operation log: replayable, auditable, plugin-namespaced. Verbs
   are exposed as per-verb MCP tools so a cold agent can call them
   by name with typed payloads.
2. **Resources (read)** — plugin-contributed read-only views of
   workbook state, addressed by URI (`fdpm://workbook/{id}/...`).
   Reads must go through resources, not through `get_*` tools.
   This is a structural commitment: tools that bloat the catalog
   with read variants are the failure mode that killed agents on
   earlier MCP-shaped systems.
3. **Prompts (orient)** — MCP prompts shipped by each plugin,
   parameterized workflow templates the user invokes (e.g.
   `planning/triage_iteration`, `fs/audit_assumptions`). Prompts
   deliver the *how to think* layer that tool descriptions alone
   cannot. They close the cold-start gap.
4. **Expressions (compose)** — a filter language exposed through one
   MCP tool, `workbook.operation(expr)`, that lets the agent compose
   queries, graph traversals, guards, and verb invocations into one
   atomic batch. The grammar borrows dynamic-array idioms from
   spreadsheets and PowerQuery M (`FILTER`, `MAP`, `FOR_EACH`,
   `LET`, structured-table references) at the surface; semantics
   diverge — verbs are syntactically distinct, execute in defined
   order, fail with structured errors that don't propagate as
   values, and produce auditable ops. Expressions compile down to
   the same atomic verb ops; the log is the truth, not the
   expression text.

Cutting across all four: **discovery tools** (`list_verbs`,
`describe_verb`, `applicable_operations(entity)`, `describe_language`,
`list_resources`) let an agent learn the vocabulary at runtime. To
keep the catalog small enough that the agent can reason about it,
verbs and resources are summarized at connect and the full surface
is fetched on demand — progressive disclosure, converging on the
direction MCP Skills (SEP-2640) is taking, without locking to its
draft shape.

A plugin that ships only a profile is a schema. A plugin that ships
verbs, resources, prompts, and renderers is a complete domain
vocabulary an agent can install and immediately operate within.

### Plugin-Version Migration Contract

Every plugin-emitted op kind carries a `plugin_id@semver` tuple.
Plugin upgrades that drop or rename op kinds MUST declare
migrations for every historical kind that appears in the project's
log. An upgrade with a missing migration is refused at plugin
activation; the project log remains replayable, or the operator
downgrades the plugin and tries again. The log is the source of
truth, and that property has a price: plugin authors own the
migration matrix forward.

## The Human Role

Humans do not edit primitives directly. Humans:

- **Review renders.** Plugin-registered renderers (`text/markdown`,
  `text/html`, `application/pdf`, SVG diagrams) produce the
  human-readable artifact for a workbook at a given revision. Render
  output is the human's window into agent work.
- **Audit the operation log.** Every state change is a typed,
  plugin-namespaced op with `actor`, `plugin_id`, `request_id`, and
  `causation_op_id`. A human can replay any project to any revision,
  inspect why an agent chose a verb, and undo by emitting an inverse
  op.
- **Approve or refuse via prompts.** When the agent product surface
  matures, prompts will be the negotiation point: a user invokes a
  prompt, sees the proposed expression and the planned op set
  (`workbook.dry_run`), and approves or modifies before execution.
- **Operate the future web UI.** A web UI will sit on top of the
  same MCP surface — same verbs, same expressions, same prompts —
  rendered for human eyes. The CLI and the web UI are two views of
  the same agent-shaped substrate, not parallel implementations.

## What It Provides

- **An event-sourced workbook runtime** — typed primitives, relations,
  validation pipeline, replay, time-travel, undo. The substrate every
  other layer rests on.
- **A plugin runtime that can extend the operation kind namespace** —
  plugins register verbs as first-class ops with their own replay
  handlers, payload schemas, MCP tools, and prompts. The log records
  domain intent, not just mechanism.
- **An MCP server surface** that exposes per-verb tools, the
  `workbook.operation` expression tool, discovery tools, and
  plugin-shipped prompts as a coherent agent-facing vocabulary.
- **Rendered human-review artifacts** — markdown, HTML, PDF, SVG —
  produced by plugin renderers from the current state of a workbook,
  for humans to read and audit.
- **A CLI** for debugging, automation, and operators who prefer
  shell-level interaction. The CLI is a peer of the MCP surface, not
  the primary product.
- **Bundled domain plugins** (`planning`, `formal_specification`,
  `software_architecture`, `spec_authoring`, `dnis`) that exercise
  the runtime against real domains and ship the verb / prompt
  vocabularies for those domains.

## Who It Is For

- **LLM agents** driving FDPM workbooks via MCP — the primary user.
  An agent installs a plugin and inherits the verbs, queries,
  expressions, and prompts of that domain.
- **Plugin authors** building agent-shaped domain vocabularies. A
  plugin ships profiles, validators, renderers, verb handlers,
  prompts, and (where appropriate) named queries. Together they
  form an installable domain expertise.
- **Human reviewers** who consume renders, audit operation logs,
  and approve or refuse agent-proposed actions. Today via the CLI
  and rendered output; later via a web UI on the same MCP surface.
- **Operators and automation** scripting workbooks through the CLI
  for cron jobs, backups, migrations, and CI checks. A peer use
  case to the agent product, not the design driver.

## Trust Model and Plugin Authorship

**Plugin authorship is in-house only for the foreseeable future.**
The architecture is unproven; opening it to third-party authors
before the eval validates the thesis would commit the runtime to
trust mechanisms (signing, prompt-injection mitigations,
sandboxing, capability scoping) whose shape can't be designed
correctly until the underlying surfaces are stable.

In v1–v2, every plugin is treated as `core` trust. The
`community` and `verified` tiers exist in the manifest schema and
in shipped behavior, but the surfaces that need third-party
hardening — verb registration, prompt registration, expression
emission — are not exercised against them. Plugin authors today
are FDPM contributors; the runtime trusts them.

Distribution, signing, and community-tier hardening are
post-eval work. The architecture must survive its own eval
before opening to third parties. If the eval fails, none of
this matters.

## Non-Goals

- This repository is not a generic CRUD database for documents.
  Generic CRUD is the failure mode that motivated the verb /
  resource / prompt / expression design.
- It is not a story-generation product, an NLP pipeline, or an
  open-ended chat surface. The agent operates within a typed,
  event-sourced contract; the primary "intelligence" is the
  agent's own.
- It is not optimized for the human-CLI case at the cost of the
  agent case. Where the two surfaces conflict, the agent surface
  wins and the CLI inherits the same shape.
- It is not optimized for community plugin authorship in v1–v2.
  Trust tiers, signing, and sandboxing for third-party plugins
  are deferred. In-house plugins are the only supported authoring
  path until the eval validates the architecture.
- It is not an HTTP server deployment. MCP is the agent transport;
  HTTP is out of scope for the CLI runtime. A future web UI will
  add an HTTP layer on top of the MCP surface, not in place of it.
- It does not redefine FDPM separately from the SPECs it ships
  (SPEC-CORE, SPEC-DNIS, SPEC-PLUGGABLE-ARCHITECTURE, SPEC-MCP-SERVER,
  and the in-flight SPEC-PLUGIN-VERBS / SPEC-WORKBOOK-EXPRESSION).
