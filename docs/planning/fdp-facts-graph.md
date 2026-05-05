---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Opus 4.7 via Claude Code"
  date: "2026-05-05"
---

# FDPM Factual Knowledge Graph

**Scope of "factual" in this document:** every claim is annotated with
its evidence type:

- `[CODE: <path>]` — verified against a file in this repository on
  the date in the frontmatter.
- `[CONVERSATION]` — stated in the architectural conversation that
  produced the strategy draft and the PURPOSE/README edits.
  Architectural intent, not implementation status.
- `[UNVERIFIED]` — claim was made in an earlier version of this
  document or in conversation, but I could not verify it against the
  codebase or against an authoritative external source. Retained
  with the marker so the gap is visible; do not cite as fact.
- `[REMOVED]` markers below note claims that previously appeared in
  this document and were dropped because they were either
  incorrect against the codebase or unverifiable.

This is not a comprehensive audit; it covers the claims that have
been load-bearing in the recent strategy conversation. When the
strategy progresses, individual claims should be re-verified, not
assumed to still hold.

---

## 1 · External standards & specifications

### MCP (Model Context Protocol)

- **Host-visible primitives:** tools, resources, prompts, plus
  sampling, roots, and elicitation. `[UNVERIFIED — external spec;
  not checked against modelcontextprotocol.io]`
- **Tools** are model-callable, JSON-Schema-typed actions.
  `[UNVERIFIED — external spec]`
- **Resources** are URI-addressable read-only state.
  `[UNVERIFIED — external spec]`
- **Prompts** are user-invokable templates.
  `[UNVERIFIED — external spec]`

`[REMOVED]` Specific MCP spec date and "Production" status — neither
verified.

### SEP-2076 / SEP-2640 (Skills over MCP)

- `[UNVERIFIED]` Working group activity, Resources-based extension
  direction, skill:// URI shape, expected ship date, and named
  source person were all in the prior version of this document with
  no code reference. None of this is verified against a primary
  source. Treat as unverified; do not use to justify architectural
  decisions until at least one primary source is captured.

### OpenAI Codex CLI

- `[UNVERIFIED]` Release version, date, plugin model details
  (SKILL.md, .mcp.json, .app.json, plugin.json), and the "skills are
  authoring primitive; plugins are distribution primitive"
  attribution. Were claims in the prior version of this document; no
  primary source captured here. Do not cite.

### Snyk "ToxicSkills" audit

- `[UNVERIFIED]` Date, sample size, flaw rate, malicious-payload
  count, and threat-vector framing. Were used in the strategy
  conversation to justify deferring community plugins. The
  in-house-only decision in PURPOSE.md does not depend on these
  numbers being correct — it stands on the architecture-is-unproven
  argument alone — but the numbers themselves should not be cited
  as established fact.

---

## 2 · FDPM codebase architecture (verified)

### Plugin capabilities

The plugin context exposes these registration methods
`[CODE: fdpm-cli/src/plugin/types.ts]`:

| Capability registration | Method |
|---|---|
| Profile (schema definition) | `registerProfile(profile)` |
| Validator (per primitive type) | `registerValidator(reg)` |
| Renderer (server-side) | `registerRenderer(reg)` |
| Expression helper (CEL) | `registerExprHelper(reg)` |
| Transformer (primitive→primitive) | `registerTransformer(reg)` |
| Importer (`ProjectTransfer` ingest) | `registerImporter(reg)` |
| Exporter (`ProjectTransfer` egress) | `registerExporter(reg)` |

Plus lifecycle hooks (`onInstall`, `onEnable`, `onDisable`,
`onUninstall`) declared on the plugin entry module
`[CODE: fdpm-cli/src/plugin/types.ts]`.

`[REMOVED]` The previous "Capability slots (7 total)" table claimed
`cap:lifecycle-hook` was a slot alongside the seven `register*`
methods. Lifecycle hooks are entry-module exports, not a
`registerXxx` capability slot — they don't compose the same way.
The original table also gave each capability a "Production" status
column without distinguishing between plumbing-shipped and any
particular plugin actually using it.

### Operation kinds (closed enum)

The `OperationKind` enum is a closed string union of 23 values
`[CODE: fdpm-cli/src/core/operations/kinds.ts]`:

```
project.create, project.delete, project.split, project.clone,
primitive.create, primitive.replace, primitive.patch,
primitive.field-patch, primitive.delete,
relation.create, relation.replace, relation.patch,
relation.field-patch, relation.delete,
structure.reorder, structure.reparent,
template.create, template.delete, template.apply,
test_suite.create, test_suite.replace, test_suite.delete,
transfer.import
```

Plugins **cannot** add new kinds in the current codebase. Replay is
a hardcoded `switch` over these 23 values
`[CODE: fdpm-cli/src/core/store/replay.ts]`. Extending this is the
v1 work named in the strategy draft.

### Operation shape

The `Operation` Zod schema
`[CODE: fdpm-cli/src/core/operations/operation.ts]` requires:

```
{
  op_id: ULID (length 26),
  parent_op_id: ULID | null,
  kind: OperationKind,
  project_id: string (regex: /^[a-z0-9][a-z0-9-]*$/),
  payload: record,
  actor: string,
  plugin_id: string | null,
  timestamp: ISO datetime,
  revision: positive integer,
  request_id: UUID v7,
  causation_op_id: ULID | null,
  schema_version: string
}
```

`[REMOVED]` The previous "Op envelope structure" was a paraphrase
that omitted op_id, parent_op_id, actor, revision, request_id,
causation_op_id, and schema_version, and gave `timestamp` as a
number rather than an ISO string. The actual shape is materially
larger; replay correctness depends on those omitted fields.

### Operation log persistence

A persistent append-only JSONL log per project exists
`[CODE: fdpm-cli/src/persistence/jsonl-log.ts]`. The host's
`appendBatch` writes to it after the in-memory store applies the op
`[CODE: fdpm-cli/src/core/host.ts:1008-1019]`. Replay,
time-travel, and undo against this log are tested behaviors per
the README's conformance section.

`[REMOVED]` The previous claim "No persistent append-only log; no
replay path, no audit trail" is incorrect. The substrate is
shipped. What is *not* shipped is plugin-emitted op kinds — the
**closed-enum constraint**, not a missing log.

### Plugin manifests in the codebase

Confirmed via `ls fdpm-cli/plugins/`
`[CODE: fdpm-cli/plugins/]`:

- `dnis/`
- `formal_specification/`
- `formal_specification_dnis/`
- `planning/`
- `software_architecture/`
- `spec_authoring/`
- `spec_authoring_dnis/`

Seven plugins. The previous version of this document listed five
plugins, including `filesystem/` (which does not exist) and omitted
the three DNIS-related plugins (which do).

`[REMOVED]` `filesystem/fdpm-plugin.json` — does not exist.

### MCP server surface (currently shipped)

- 30 tools across three trust tiers
  `[CODE: fdpm-cli/src/mcp/manifest.ts]`:
  - **Tier 1** read-only: 12 tools.
  - **Tier 2** validating-write: 13 tools.
  - **Tier 3** destructive: 5 tools (disabled by default; require
    `FDPM_MCP_ENABLE_DESTRUCTIVE`).
- One resource URI scheme:
  `fdpm://project/{project_id}/render/{target}[#{renderer_id}]`
  `[CODE: fdpm-cli/src/mcp/resources/render.ts]`.
- No prompts surface registered. The plugin context has no
  `registerPrompt` method `[CODE: fdpm-cli/src/plugin/types.ts]`.

Note on `project` vs. `workbook`: the rename is in flight
(see `fdpm-cli/scripts/rename_project_to_workbook.py`) but has not
been applied. The URI scheme above still uses `project`, and that
is what the current code actually exposes.

### Expression languages in production

- **CEL** is used in validation rules across plugins (e.g.
  `fdpm-cli/plugins/planning/validation_rules.ts`).
  `[CODE: fdpm-cli/plugins/*/validation_rules.ts]`
- **A render-time DSL** with `fn.section_of` and template forms is
  shipped per the README's "SPEC-DNIS adoption" section.
  `[CODE: fdpm-cli/src/core/dnis/, README.md `SPEC-DNIS adoption`
  section]`

`[REMOVED]` The previous claim of `fn.fdpm.spec-authoring.section-number`
as a render-DSL helper — could not verify the exact namespacing
form against the codebase in this audit pass. The render-DSL
exists, the specific helper name is unverified.

### Renderers shipped per plugin (confirmed by directory listing)

| Plugin | Renderers |
|---|---|
| formal_specification | markdown, html, pdf `[CODE: fdpm-cli/plugins/formal_specification/renderers/]` |
| planning | agent_board, gantt, roadmap `[CODE: fdpm-cli/plugins/planning/renderers/]` |
| software_architecture | adr, plus OpenAPI renderer per manifest `[CODE: fdpm-cli/plugins/software_architecture/]` |
| spec_authoring | not enumerated this pass `[UNVERIFIED]` |

---

## 3 · FDPM → MCP integration mapping

### What's mapped today (shipped)

| Surface | MCP primitive | Mapping |
|---|---|---|
| Generic CRUD over primitives/relations/structure | tools (Tier 1/2/3) | 30 tools total, statically registered `[CODE: fdpm-cli/src/mcp/manifest.ts]` |
| Renderer output | resources | `fdpm://project/{id}/render/{target}` `[CODE: fdpm-cli/src/mcp/resources/render.ts]` |

### What's proposed but not implemented

`[CONVERSATION]` from the strategy draft, not from the codebase:

- Per-verb MCP tools auto-generated from plugin-registered op kinds.
- Plugin-contributed resource URI schemes beyond render.
- Discovery tools: `list_verbs`, `describe_verb`,
  `applicable_operations(entity)`, `list_resources`,
  `describe_language`, `workbook.dry_run(expr)`.
- Plugin-shipped MCP prompts (no `registerPrompt` API exists yet).
- `workbook.operation(expr)` filter language as a single MCP tool.
- MCP change notifications.

`[REMOVED]` The previous "Direct mappings (mechanical)" table
implied that current FDPM transformers, importers, exporters,
profiles, and validators are already exposed as MCP primitives in
specific URI shapes. They are not. The current MCP surface is the
30-tool generic CRUD surface plus the render resource. Everything
else is a design proposal.

`[REMOVED]` URI conventions like `mcp__<plugin>__<transformer_name>`
and `skill://<plugin-name>/<skill-name>` — proposed in the prior
version of this document, never committed. Drop until a SPEC pins
them.

---

## 4 · Identified gaps in FDPM

### Architectural gaps relative to the strategy draft's design

Each row names a gap between what the codebase ships and what the
strategy draft commits to. Gaps are facts about the codebase, not
about the rest of the world.

| Gap | What's there today | What the design wants |
|---|---|---|
| Closed `OperationKind` enum | 23 hardcoded kinds; plugins can't extend | Plugin-namespaced op kinds with replay handler registry |
| No `registerPrompt` API | `PluginContext` has 7 `register*` methods; prompt is not one | `ctx.registerPrompt(reg)` lands in v1 |
| Single resource URI scheme | `fdpm://project/{id}/render/{target}` only | Plugin-contributed URI schemes for typed reads |
| No discovery tools | Tool catalog is static at server startup | `list_verbs`, `describe_verb`, etc. as MCP tools |
| No change notifications | MCP server doesn't emit `*/list_changed` | Long-running agents stay in sync |
| No plugin-version migration contract for op kinds | Closed enum has no versioning problem; opening it creates one | `plugin_id@semver` per op kind, declared migrations |
| No expression language | `workbook.operation` doesn't exist | Filter language with sources + FILTER + LET |

`[REMOVED]` "No op log storage" — incorrect (see §2 above).
"No op dispatcher" — partially incorrect; `appendBatch` is the
dispatcher for the closed kind set. What's missing is dispatch for
plugin-emitted kinds.

### Validation patterns

- Validation runs in the §7 pipeline `[CODE per README's "Conformance" section]`.
- CEL validators are registered per rule; some plugins also ship
  TypeScript validators that mirror CEL rules
  `[CODE: fdpm-cli/plugins/formal_specification/_validators.ts,
  _register_validators.ts]`.
- Whether this dual pattern creates "drift risk" is a judgment, not
  a fact. The README documents it as a deliberate design choice for
  v1.1: a profile that ships rules without paired
  `cap:validator` registrations gets the v1.1 fallback (info-level
  finding); there is no general `cap:predicate-evaluator` Core
  capability yet.

`[REMOVED]` The previous "36% flaw rate in comparable systems per
Snyk" link to FDPM's validators implied a measured FDPM property.
There is no FDPM validator-flaw-rate measurement; conflating it
with the unverified Snyk industry number is misleading.

### Identifier system

`[REMOVED]` The previous claim that FDPM has a `stableId(field, "type:name")`
function with deferred dangling-reference enforcement. Searching
`fdpm-cli/src/core/identity/` and `fdpm-cli/src/` for `stableId`
returned no matches. The DNIS specification defines paragraph-grain
identity through `dnis:Document` and `dnis:Node` primitives with
`Position` ordering and content hashes, not a `stableId` function.

If there is a `stableId`-like function elsewhere, this audit didn't
find it; cite the file:line if it exists.

---

## 5 · Adjacent systems (not verified, partial commentary)

The previous version of this document compared FDPM to Sphinx,
Pandoc, Asciidoctor, RDF/SHACL/SPARQL, TypeDB, Datomic, XTDB,
Sanity, Contentful, Strapi, MDX, Contentlayer, Velite, Notion, Coda,
Roam, Obsidian, Concourse, Temporal — assigning each system a
short feature comparison.

Each individual comparison is **plausible** (these systems exist;
the high-level features named are roughly correct) but no specific
claim was verified. Treat the table as **unverified background
context for the strategy conversation**, not as a feature-comparison
matrix you'd cite in a competitive analysis.

`[UNVERIFIED]` Section retained for traceability but not edited
into a fact table. If a comparative analysis is needed, do it as a
separate document with primary-source citations per row.

---

## 6 · Evaluation criteria

`[CONVERSATION]` These are commitments from the strategy draft and
the README's "Eval design" section, not measured properties.

### Three-arm differential design

50 instructions, three arms in parallel, same model snapshot, no
prior fdpm exposure:

1. Verbs only — per-verb MCP tools, no discovery, no prompts.
2. Verbs + discovery.
3. Verbs + discovery + prompts.

### Pass criteria for a single instruction (all four required)

a. Terminal workbook state matches the instruction's stated goal.
b. The audit log replays in isolation against a fresh workbook and
   produces the same terminal state.
c. No destructive ops (Tier 3) executed outside the instruction's
   stated scope.
d. Verb-sequence length within 2× the human-baseline sequence for
   the same instruction.

### Thresholds (open questions)

- **Differential threshold for prompts to count as paid-for:** arm 3
  ≥ 15 percentage points better than arm 2 on first-try success.
  Committed in the strategy draft.
- **Absolute threshold for "ship it":** not chosen. The strategy
  draft flags this as an unanswered question.
- **Step-change threshold ("game-changer"):** the prior version of
  this document named a "≥10× improvement vs. strongest alternative"
  threshold. This was not committed in the strategy draft and is
  not currently part of the eval design. Listed here as an
  unresolved candidate, not a commitment.

---

## 7 · Regulatory references

`[REMOVED]` Section. The previous version named EU AI Act, FDA
guidance, DoD Directive 3000.09, and "MCP security issues (April
2025)" as load-bearing context. None were verified against primary
sources, none are referenced from any code path or SPEC document in
this repository, and the strategy draft does not depend on any of
them. Including them gave a false impression of compliance
grounding.

If regulatory context becomes relevant, add it as a separate
document with primary-source citations.

---

## 8 · Version staging

`[CONVERSATION]` Per [mcp-strategy-draft.md](mcp-strategy-draft.md).
The strategy draft is the authoritative source; this section
mirrors it and will go stale.

### v1 — substrate proof

- Plugin namespace for op kinds.
- Replay handler registry replacing the hardcoded switch.
- Payload validation registry.
- Plugin-version migration contract.
- Required-plugins manifest.
- Per-verb MCP tools auto-generated from registered verbs.
- One plugin (planning) ships three verbs.
- `ctx.registerPrompt(reg)` API in the plugin context.
- **No eval at v1.**

### v2 — discovery, prompts, eval (eval gate)

- Discovery tools.
- Plugin-contributed resource URI schemes.
- Progressive disclosure layer.
- MCP change notifications.
- First plugin-shipped MCP prompt.
- Three-arm cold-agent eval.

### v3 — expression language, scoped down

- `workbook.operation(expr)` and `workbook.dry_run(expr)`.
- Sources + FILTER + LET; defer MAP, FOR_EACH, LAMBDA, transitive
  closures.

`[REMOVED]` The previous version named v1 deliverables ("op
dispatcher + op log") that are already shipped, and named "validator
flaw rate reduction (baseline 36% from industry)" as a deferred
goal — neither claim was correctly grounded.

---

## 9 · Unconfirmed / deferred claims

| Claim | Status |
|---|---|
| `stableId` enforcement across rewrites | **`stableId` itself not found in codebase.** See §4. |
| Capability pre-declaration protocol | `[CONVERSATION]` Aspirational; not implemented. |
| Transformer signature generalization beyond `fromType→toType` | `[CONVERSATION]` Identified as needed for non-mapping verbs (`task.complete`, `iteration.cut`). |
| Plugin deployment time anecdote ("three days → eleven minutes") | `[UNVERIFIED]` Not measured against FDPM. |
| Agent capability step-change (10×) | `[CONVERSATION]` Hypothesis; no eval data exists. |
| First-class plugin op kinds | `[CONVERSATION]` Designed in strategy draft; not implemented. |
| MCP prompts surface | `[CONVERSATION]` Designed; not implemented. |

---

## 10 · Audit method and limits

This document was rewritten on the date in the frontmatter by:

1. Searching the working tree for the existence of each named file,
   directory, function, type, or constant.
2. Reading the relevant file when the path was claimed.
3. Marking everything I could not verify against either the
   codebase or a primary external source as `[UNVERIFIED]`.
4. Removing claims that were directly contradicted by the codebase
   (with `[REMOVED]` notes preserving the diff so anyone reading the
   prior version can see why their notes don't match this version).

**What this audit did not do:**

- Re-derive the SPEC compliance claims in the README.
- Verify the test counts named in the README against the actual test
  suite output.
- Audit the comparative-systems section in §5.
- Verify any external standard or industry-statistic claim against a
  primary source.

When in doubt, read the code. When the strategy draft and this
document disagree, the strategy draft is the more recent design
intent; this document is the more recent codebase fact-check.
