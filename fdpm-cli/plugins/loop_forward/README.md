---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Opus 5 (1M context) via Claude Code"
  date: "2026-08-29"
---

# `fdpm.loop-forward`

The canonical **loop-forward v2** contract as an FDPM domain profile:
versioned prompt templates, reusable agents with approval-aware tool
grants, bounded multi-stage feedback pipelines, per-stage output
contracts, executable examples, an evaluation gate, and terminal run
receipts.

## Disclaimer

This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](../../../DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.

Up: [repository README](../../../README.md) · [plugin index](../)

---

## ARCHITECTURAL REQUIREMENT

```
ARCHITECTURAL REQUIREMENT: LLMs will always produce some form of error.
Absence of output verification is a design defect, not a runtime bug.
All LLM output must be treated as untrusted and validated explicitly.
```

A loop-forward store is a document a model writes, and a loop-forward
pipeline is a machine for consuming model output. Both facts shape this
plugin: [`ingest.ts`](./ingest.ts) has exactly one parse boundary and no
path around it, and [`verification_surface.ts`](./renderers/verification_surface.ts)
renders the five controls as a page a reviewer can check.

---

## Identity

| | |
|---|---|
| Plugin id | `fdpm.loop-forward` |
| Profile id | `profile:loop-forward:2.0` |
| Vendor prefix | `lf` |
| Schema version | `2.0.0` |
| Primitive types | 15 |
| Relation types | 22 |
| Renderers | 5 |
| Validators | 8 |

---

## The schema is vendored, not authored here

[`schemas/loop-forward.ts`](./schemas/loop-forward.ts) is a **verbatim
copy** of the canonical contract. Its digest is recorded in
[`generated/schema-hash.json`](./generated/schema-hash.json), so a copy
that has drifted from its source is a checkable fact rather than a
discovery.

**Never edit it here.** A change goes to the source and is re-vendored.

---

## How the document becomes a graph

The contract models a store as one root document with stages, bindings,
carries, stop conditions, tool grants and output contracts all nested
inside. FDPM's unit is a graph of primitives joined by typed relations,
so the import flattens that document under two rules.

**A nested object is lifted to a primitive when something else points at
it.** A carry is referenced by name from a binding; a stage is referenced
by id from a carry, a binding and a stop condition. Left as struct
fields, those references are opaque strings the host never checks and the
graph renderers have no edges to draw.

**`AttemptRecord` is deliberately not lifted.** The contract bounds
`run_receipts` at 10,000 and each receipt's `records` at 100,000, so
lifting the attempt record would let one run become a hundred thousand
primitives. It stays a serialized array on `lf:RunReceipt`.

### The three edges that carry the model

| Relation | What it means |
|---|---|
| `lf:BindingReadsStage` | The same-iteration **forward** edge. Permitted only toward a strictly earlier stage — this is what makes one iteration a DAG. |
| `lf:CarryCapturesStage` | The cross-iteration **back** edge. All backward flow goes through a carry; the iteration ceiling is what keeps that cycle safe. |
| `lf:StopConditionObservesStage` | How a run may end. Many-to-many, because the `unchanged` arm observes up to 32 outputs at once. |

### Discriminated unions, and why validation matters

The contract carries six discriminated unions. `@fdpm/zod-bridge` maps a
union in field position to an opaque `format: "json-union"` blob, so
nothing could address `binding.source.kind` or `stop_condition.kind`.
Each union is therefore flattened onto a discriminator enum plus the
union of its arms' fields, every arm-specific field optional.

That flattening is lossy **in one direction**: the profile now permits a
record the contract would reject. [`validators.ts`](./validators.ts)
closes the gap and is run by the host on every write. Each rule cites the
contract rule it mirrors, and each is covered by a test that feeds it the
malformed record it exists to reject.

One case is worth calling out. The contract states its two approval rules
— write authority needs an approval boundary; anything beyond read or
write needs per-action approval — inside
`AgentDefinitionSchema.superRefine`, over `tool_policy`. Lifting the
grant to `lf:ToolGrant` takes it out of the scope where those rules were
written, so both are restated against the grant itself. A lift that
silently drops a rule is the failure mode this layer exists for.

---

## Renderers

All five read the **design graph** — what the pipeline *is*, not what
happened when it ran.

| Target | Renderer id | What it shows that nothing else does |
|---|---|---|
| `image/svg+xml` | `lf:PipelineGraphRenderer` | Forward arcs **above** the stage row, carries **below** it. Everything above is acyclic; everything below is the intentional cycle the iteration ceiling bounds. |
| `text/html` | `lf:VerificationSurfaceRenderer` | The five controls per stage. Finds the stage emitting text or markdown with no validator — nothing can reject its output. |
| `text/html` | `lf:AuthorityMatrixRenderer` | Direct tool grants, plus the authority each **pipeline inherits** through its stages' agents. That join is in no document. |
| `text/html` | `lf:BindingMatrixRenderer` | Where every task-template variable's value comes from, and whether anything supplies it. |
| `text/markdown` | `lf:BudgetEnvelopeRenderer` | Structural worst case against declared budget. Finds a pipeline that **can only ever end `exhausted`**. |

Because several plugins register `text/html`, ask for these by
`--renderer-id`:

```bash
fdpm render <workbook> image/svg+xml --renderer-id lf:PipelineGraphRenderer --output graph.svg
fdpm render <workbook> text/html     --renderer-id lf:VerificationSurfaceRenderer --output verify.html
fdpm render <workbook> text/html     --renderer-id lf:AuthorityMatrixRenderer     --output authority.html
fdpm render <workbook> text/html     --renderer-id lf:BindingMatrixRenderer       --output bindings.html
fdpm render <workbook> text/markdown --renderer-id lf:BudgetEnvelopeRenderer
```

### Determinism

Every renderer is a pure function of its input: no clock, no randomness,
no network. Ingest uses `mintUidFromSeed`, so two ingests of one document
are byte-equal, and the relation set is sorted before any adjacency list
is built — shuffling the input changes nothing in the output. Both
properties are asserted in
[`tests/plugins/loop_forward/renderers.test.ts`](../../tests/plugins/loop_forward/renderers.test.ts).

### Stated limits

- **Binding type verdicts.** For a `stage_output` or `literal` source, the
  value's type lives inside the source stage's JSON Schema, which this
  profile stores as an opaque payload. The matrix reports `unknown`
  rather than assuming the check passes.
- **Token figures are a floor.** `max_output_tokens` bounds a call's
  output only. Input tokens depend on the rendered prompt and on how far
  an `append` carry has grown, neither of which the document fixes.
- **No evidence renderers.** `lf:RunReceipt` ships because the contract
  defines it and a workbook must be able to hold one. Nothing reads it
  yet — the Family B views (attempt timeline, terminal-state ledger,
  promotion dossier) are not built.

---

## Layout

```
loop_forward/
├── schemas/loop-forward.ts   # VENDORED verbatim — never edit here
├── generated/schema-hash.json# digest of the vendored copy
├── ids.ts                    # type ids, categories, scopes, vocabularies
├── primitives.ts             # 15 primitive types + the flattening rules
├── relations.ts              # 22 relation types
├── validators.ts             # the layer that closes the flattening loss
├── ingest.ts                 # parse boundary: document -> workbook graph
├── _common.ts                # field builders
├── index.ts                  # profile + activate()
├── fdpm-plugin.json          # manifest (must match what activate registers)
└── renderers/
    ├── _model.ts             # the one graph walk all five renderers share
    ├── _html.ts              # the page shell the three HTML views share
    ├── pipeline_graph.ts     # A1
    ├── verification_surface.ts # A2
    ├── authority_matrix.ts   # A3
    ├── binding_matrix.ts     # A4
    └── budget_envelope.ts    # A5
```

## Tests

```bash
npx vitest run tests/plugins/loop_forward
```
