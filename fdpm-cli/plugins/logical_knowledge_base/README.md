---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Fable 5.1 via Claude Code"
  date: "2026-09-04"
---

# `fdpm.logical-knowledge-base` — a LogicalKnowledgeBase document as an FDPM profile

## Disclaimer

This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](../../../DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.

[← fdpm-cli](../../README.md)

| | |
|---|---|
| Plugin id | `fdpm.logical-knowledge-base` |
| Version | `1.0.0` — tracks the schema's `CURRENT_SEMANTIC_MODEL_VERSION` |
| Profile | `profile:logical-knowledge-base:1.0` |
| Source | `schemas/lkb.ts`, vendored from `_ingest_bin/LogicalKnowledgeBase.ts` (6,638 lines of Zod) by `scripts/vendor-schema.ts` |
| Primitive types | 117 — 115 node kinds, the document header, the external-target stub |
| Relation types | 77 — 73 lifted `Reference` fields, `lkb:provenance`, `lkb:has-step`, `lkb:has-element`, and the derived `lkb:mentions` |
| Validators | 11 rules |
| Renderers | `lkb:TheoryRenderer` (text/markdown), `lkb:ArgumentGraphRenderer` (image/svg+xml) |
| Transfer | `lkb-json` importer and exporter; `applyDocumentUpdate` for a new version of the same document |
| Computed | grounded argumentation semantics; a text syntax and parser for the expression language |
| Prompt | `logical-knowledge-base/author_theory` |

Every count above is `derivationSummary()` in `derive.ts`, pinned by
`tests/plugins/logical_knowledge_base/derive.test.ts`.

## Where it comes from

`LogicalKnowledgeBase.ts` is a Zod schema for a logical knowledge base: one
root document with fourteen collections — declarations, statements, rules,
constraints, queries, proofs, argumentation, processes, conflict policies,
provenance records, interoperability mappings, modules, namespaces and
imports — over a recursive expression language of 59 formula kinds, 17 term
kinds, types, concepts, literals, distributions and membership functions.
Every node shares one metadata shape; the only edge mechanism is a
`Reference` object (`targetId`, `resolution`, one of 25 `targetFamily`
values); and the root schema runs twelve whole-document checks after
parsing: id uniqueness, unresolved references, family agreement, arity,
variable scope, rule-priority cycles, self-parenting, side-effect approval,
the negation-as-failure policy and more.

The schema was written for a document. This plugin makes the same content a
typed, event-sourced graph.

## What becomes what

| Schema | Profile |
|---|---|
| A node kind in a root collection, a proof step, a process element (115 kinds) | A primitive type `lkb:<PascalCase(kind)>` — `predicate_declaration` → `lkb:PredicateDeclaration` |
| The node's `id` | The host id `lkb:<kind-kebab>:<slug>`, with the source identifier kept verbatim in `source_id` (the source charset allows `/`, `#` and `:`, the host id does not) |
| Scalars, enums, literals, datetimes, nested plain objects | Fields of the matching kind; nested objects become shared inline structs named after the exported schema (`Parameter`, `SourceLocation`, `ContextualScope`, 44 in all) |
| A field typed `Formula`, `Term`, `Expression`, `ValueExpression`, `TypeExpression`, `ConceptExpression`, `VariableBinding` or `JsonValue` (194 fields) | `kind: "json"` with `format: "lkb:<Root>"`; the value is parsed with the vendored root schema at write time |
| A field typed `Reference` or `Reference[]` (130 fields, 73 distinct names) | A relation type `lkb:ref.<field>` whose instances carry `resolution`, `target_family`, `external_uri` and `position`. Where the schema names the family in a refinement (`priorityOver`, `overrides` → rules; `constraint_group.members` → constraints) the target types are declared; elsewhere they are open and `lkb:val:reference-family` enforces the per-instance family |
| A local `Reference` *inside* a formula, struct or binding | A derived `lkb:mentions` edge (`path`, `count`, `target_family?`) — see *Usage edges* |
| `provenance: ProvenanceLink[]` | `lkb:provenance` edges to `lkb:ProvenanceRecord`, carrying `role` and `source_fragment` |
| A proof's `steps` / `trace`, a process model's `elements` | Primitives of their own under `lkb:has-step` (`slot`, `position`) and `lkb:has-element` (`position`) |
| The root document minus its collections | One `lkb:LogicalKnowledgeBase` header per workbook |
| A reference with `resolution: imported \| external` | An `lkb:ExternalTarget` stub the edge can point at, so a non-local reference is still an edge |

The mapping is a program, not a table: `derive.ts` walks the vendored
schema's arms and emits the profile; `scripts/build-profile.ts` writes
`generated/profile.json` and `generated/schema-hash.json`, and its `--check`
fails when either input moved without the output moving with it.

## What gets stronger

1. **Reference integrity becomes a write-time invariant.** Upstream,
   `collectReferenceIssues` reports an unresolved reference after the whole
   document is assembled. Here every reference field is an edge, and the host
   refuses an edge to a node that does not exist before the write is appended.
2. **Usage is a graph, and deletion respects it.** References buried inside
   formulas become `lkb:mentions` edges, so "where is predicate P used" is
   `fdpm.relation.list`, and `host.deletePrimitive` refuses to remove a
   declaration that formulas still cite (the host's own rule: a primitive
   with referencing relations is not deleted without `cascade`).
3. **Every id-bearing node is addressable and revisioned.** A proof step or a
   process element has its own operation log, its own patch history and its
   own place in a relation query, not an index inside its container's array.
4. **Provenance is a graph.** "Everything asserted by record R" is a relation
   query, not a tree walk.
5. **One thing is computed that the source only stores.** For a framework
   declared with `semantics: grounded`, the grounded extension is decidable
   on a closed graph; `grounded.ts` computes it, `lkb:val:framework-grounded`
   compares it with the declared `acceptedArguments`, and both renderers
   show it.
6. **The whole upstream verifier still runs — on the reassembled document.**
   `transfer.ts` rebuilds the document from the workbook and parses it with
   the vendored root schema. The importer, the exporter, the updater and the
   `lkb:val:document` validator all go through that one path, so the twelve
   whole-document checks are upstream's own, not a port that could drift.

## What does not come across

Stated rather than hidden:

- **No reasoner.** Entailment, consistency, satisfiability and classification
  queries are stored, not answered — exactly as the source stores them.
  Grounded argumentation semantics is the one computation, because a closed
  workbook makes it decidable; preferred, stable and the other semantics are
  not computed.
- **`lkb:mentions` edges are derived.** The importer and `applyDocumentUpdate`
  write them; a node authored through MCP gets the `lkb:val:mentions-current`
  warning until its edges are added or `reconcileMentions()` runs. There is
  no write hook in the host that could add them automatically.
- **Per-node cross-field refinements run at document level only.** The
  per-node validator parses a strict object built from the arm's shape, so a
  refinement such as "modifiedAt must not precede createdAt" surfaces from
  `lkb:val:document`, not from `lkb:val:node-shape`.
- **The text syntax covers the core, not the whole language.** Modal,
  deontic, temporal, probabilistic and description-logic operators are
  written as JSON.
- **Three reference fields are stricter here than upstream.** The schema
  checks that `priorityOver`, `overrides` and `constraint_group.members` name
  rules or constraints only when the reference states a `targetFamily`; the
  profile declares those target types unconditionally, so a document that
  points one of them elsewhere is refused on import. The all-kinds round trip
  test points them at the intended kinds for that reason.
- **Canonical ordering and the migrations table are metadata.** The operation
  log and profile revisions do their job here.

## Validation

| Rule | Where | What it closes |
|---|---|---|
| `lkb:val:node-shape` | every node type and the header | The node's fields against its own arm of the vendored schema — every string pattern, numeric bound, enum, and every formula, term, type and concept inside a JSON field. Lifted fields are excluded because they are edges. |
| `lkb:val:reference-family` | every `lkb:ref.*` | `target_family`, when present, agrees with the target's kind (`matchesTargetFamily`, ported). External targets are skipped: the family is the remote document's business. |
| `lkb:val:reference-resolution` | every `lkb:ref.*` | `local` edges target document nodes; `imported` / `external` edges target an `lkb:ExternalTarget`; `external` requires `external_uri`; nothing else may carry one. |
| `lkb:val:arity` | every node type | `predicate_application_formula` and `function_application_term` against the declared `arity`, variadic-aware, with upstream's messages. The declaration index is built once per write and shared by every validator of that write. |
| `lkb:val:mentions-current` | every node type | The node's `lkb:mentions` edges match the references inside its formulas; a warning that names the missing and stale edges. |
| `lkb:val:rule-cycle` | `lkb:ref.priorityOver`, `lkb:ref.overrides` | The edge does not close a priority cycle among rules. |
| `lkb:val:self-parent` | the five `parent*` reference fields | A module, world, jurisdiction, organization or security domain does not parent itself. |
| `lkb:val:step-slot` | `lkb:has-step` | `trace` belongs to a counterexample; `steps` to the other proof kinds. |
| `lkb:val:framework-grounded` | `lkb:ArgumentationFramework` | For `semantics: grounded`, the declared `acceptedArguments` equals the computed grounded extension; the warning lists the computed set. |
| `lkb:val:single-header` | `lkb:LogicalKnowledgeBase` | One document per workbook. |
| `lkb:val:document` | `lkb:LogicalKnowledgeBase` | The workbook assembles into a document the root schema accepts. Warnings on the write path (a document is built one node at a time), conclusive on `fdpm validate`; the exporter refuses until they clear. |

The host adds its own gates for free: `core:relation:source-type` /
`core:relation:target-type` on every edge, `core:id-format` on every id, the
FieldDef checks (`pattern`, `min`, `max`, `min_length`, `max_length`) the
derivation emits from the schema's own constraints, and the delete refusal
that the mentions edges turn into referential integrity.

## Usage edges

`collectMentions(fieldValues)` walks a node's stored fields for local
references (skipping extension payloads and annotation values, as upstream's
`isOpaqueChild` does) and `mentionEdges` turns them into `lkb:mentions`
relations with a deterministic id per (source, target). `planMentions`
reports the difference between a workbook's edges and its formulas;
`reconcileMentions(host, workbookId)` applies it. The importer and
`applyDocumentUpdate` write the edges themselves.

## Import, update and export

```sh
# A LogicalKnowledgeBase JSON document in, a validated workbook out.
fdpm transfer import-as lkb-json -f kb.json --workbook-id socrates --workbook-name "Socrates"
```

```ts
import { applyDocumentUpdate, exportLkbJson } from "@fdpm/cli/plugins/logical_knowledge_base";

// A second version of the same document becomes operations against the
// existing workbook: unchanged nodes keep their uids and history.
const { plan, counts } = await applyDocumentUpdate(host, "socrates", newDocument, { dryRun: true });
await applyDocumentUpdate(host, "socrates", newDocument);

// Canonical JSON back out (the schema's own canonical serializer).
const bytes = exportLkbJson(exportTransfer(host, "socrates"));
```

The importer and the updater parse the input with the root schema and refuse
an invalid document with the schema's issues as evidence — nothing partial is
written. The exporter refuses a workbook that does not assemble into a valid
document, because an export the importer would reject is not an export.
`transfer.test.ts` proves the round trip byte-for-byte on the canonical form
of the fixture; `roundtrip-all-kinds.test.ts` proves it for a generated
document holding one node of every one of the 115 kinds; `diff.test.ts`
proves an update is idempotent and leaves the workbook valid.

## Authoring formulas

`formula.ts` parses conventional notation into the schema's trees, the
inverse of the printer the renderers use:

```ts
parseFormula("∀x. pred:Human(x) ⇒ pred:Mortal(x)");
// { kind: "forall_formula", variables: [{ kind: "variable_binding", name: "x" }],
//   body: { kind: "logical_implication_formula", antecedent: …, consequent: … } }
```

Precedence low → high: `↔`, `⇒` (logical) / `→` (material), `∨`, `⊕`, `∧`,
`¬` and the quantifiers, atoms. Identifiers bound by a quantifier are
variables; every other identifier is a reference to a declared symbol
(`pred:Human`, `const:socrates` are written as they are). Comparisons,
arithmetic, literals and lists are covered; `formula.test.ts` holds
parse ∘ print ∘ parse fixed and checks every produced tree against the
vendored schema.

## Rendering

- **`lkb:TheoryRenderer`** (Markdown) reassembles the document and lists it:
  the document check first, then contents, default semantics, namespaces,
  imports, modules, declarations grouped by kind with signatures, statements,
  rules as `body ⇒ head`, constraints, queries, proofs with their steps,
  claims, arguments, attacks and supports, frameworks with their declared and
  computed grounded extensions, processes, conflict policies, provenance
  records, interoperability mappings and external targets.
- **`lkb:ArgumentGraphRenderer`** (SVG) draws claims and arguments ranked by
  longest path from an unsupported premise, support in the repository's
  accepted green, attacks dashed in its rejected red, and — where a grounded
  framework exists — each node's computed label (`in` heavy green, `out`
  heavy red, `undecided` dashed grey), every distinction carried in tone
  first so the drawing survives greyscale.

Both run over the acceptance harness's six fixture states in
`renderers.test.ts`, and the SVG renderer is in the Playwright suite
(`tests/renderers/html-visual.spec.ts`): Axe, four widths, print, and the
gallery baseline.

## Authoring from an agent

`logical-knowledge-base/author_theory` teaches the things agents get wrong
here — references are edges, formulas are JSON in schema shape, usage edges
are derived, the document-level check is read from the header — as a call
order over the MCP tools, with the failure modes named by rule id.
`profile.test.ts` checks every tool name it cites against the MCP manifest
and every `lkb:` id against this plugin's sources.

## Layout

```
plugins/logical_knowledge_base/
├── fdpm-plugin.json           # manifest: profile, 2 renderers, 9 validators, importer, exporter
├── index.ts                   # activation: profile, validators, renderers, transfer, prompt
├── derive.ts                  # schema → DomainProfile (the mapping, as a program)
├── validators.ts              # the eleven rules above
├── transfer.ts                # split / assemble / verify, mentions, lkb-json importer and exporter
├── diff.ts                    # planDocumentUpdate / applyDocumentUpdate
├── grounded.ts                # Dung grounded labelling over declared frameworks
├── formula.ts                 # text syntax → schema trees
├── prompts.ts                 # logical-knowledge-base/author_theory
├── renderers/
│   ├── _formula.ts            # schema trees → text
│   ├── theory.ts              # lkb:TheoryRenderer (text/markdown)
│   └── argument_graph.ts      # lkb:ArgumentGraphRenderer (image/svg+xml)
├── schemas/lkb.ts             # VENDORED — regenerate with scripts/vendor-schema.ts
├── scripts/
│   ├── vendor-schema.ts       # upstream → schemas/lkb.ts, three declared transformations
│   └── build-profile.ts       # derive → generated/*.json; --check is the drift gate
└── generated/
    ├── profile.json           # the derived DomainProfile
    └── schema-hash.json       # sha256 over schemas/lkb.ts + derive.ts
```

## Regenerating

```sh
# 1. Re-vendor after an upstream schema change (records the upstream sha256 in the header).
npx tsx plugins/logical_knowledge_base/scripts/vendor-schema.ts /path/to/LogicalKnowledgeBase.ts

# 2. Regenerate the profile and the hash; bump fdpm-plugin.json if the schema's semantic model version moved.
npx tsx plugins/logical_knowledge_base/scripts/build-profile.ts

# 3. Prove nothing drifted.
npx tsx plugins/logical_knowledge_base/scripts/vendor-schema.ts --check
npx tsx plugins/logical_knowledge_base/scripts/build-profile.ts --check
npx vitest run tests/plugins/logical_knowledge_base
```

`vendor-schema.ts` applies three transformations and documents each: the
`migrateFrom090` undefined guard the repository's `noUncheckedIndexedAccess`
requires; splitting eleven discriminated unions into named arms with explicit
union types, without which `tsc --declaration` cannot serialize the inferred
types of `RuleSchema`, `QuerySchema` and the root (TS7056); and explicit
types on the root schema and its safe parser. Runtime behaviour is unchanged.

## Naming

The plugin follows the shipped convention (`fdpm.<leaf>`, `profile:<leaf>:<major.minor>`,
type prefix `lkb:`). `docs/specs/SPEC-PLUGIN-NAMING.md` proposes a subject
taxonomy (`fdpm.<rung>.<leaf>`) and is still a Proposal that no host gate
enforces; when it becomes normative, the rename is `fdpm.knowledge.logical-knowledge-base`
with the profile id unchanged.

[← fdpm-cli](../../README.md)
