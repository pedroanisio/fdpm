---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Opus 5 (1M context) via Claude Code"
  date: "2026-08-29"
---

# fdpm.uixo — UIXO v11 interaction ontology
## Parity with the source oracle

The plugin vendors `uixo-native.ts`, which exports `validateUixoDocument`
— **41 coded checks** across four tiers (structural, referential,
semantic, policy) with a remediation per code in `UIXO_ERRORS`. It is the
ontology's own authority on whether a document is well formed, and it now
runs as the **first control** in [`ingest.ts`](./ingest.ts): a document is
judged by the source before anything is projected, and a rejection quotes
the source's E-code and fix so an operator can look it up.

It had been vendored and never called. That gap let three divergences
ship, all found by validating one real 346-entity document the oracle
accepts with zero issues:

| Divergence | Effect |
|---|---|
| Ingest demanded a `nodes` envelope | The source declares `entities`. Being `.strict()`, ingest could not read a valid document at all. |
| `extensions` stored as a JSON string | The profile demanded a string while the Zod validator, generated from the same `z.record`, demanded a record — so **any** document carrying `extensions` was un-ingestable either way. Records now map to the host's `json` field kind, which both accept. |
| Reachability ignored soft links | The source collects soft links by walking the whole `extensions` object; ours walked nothing. On the real document that was **221 false orphans out of 346**. |

False positives are worse than missing checks: they teach an operator to
ignore the validator. The reachability walk now reads soft links back out
of `extensions` and resolves them through `field_values.id`, matching the
source exactly.

**What is still narrower than the source.** The oracle judges a document
at ingest. The host validates one write at a time and cannot see the
document, so edits made afterwards through the CLI or MCP are judged by
the per-class field validators, the 210 typed relation endpoints and the
graph invariants in [`invariants.ts`](./invariants.ts) — not by all 41.
That is recorded as `uixo.document-oracle-gate-at-ingest` in the declared
losses.


## Disclaimer

This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](../../../DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.

An RDF interaction ontology as a typed, event-sourced FDPM workbook: 712
ontology classes as primitives, 210 relation types **derived** from the
ontology's own hierarchy, and referential integrity enforced by the host on
every write instead of by a document-level oracle someone has to remember
to run.

| | |
|---|---|
| Profile | `profile:uixo:1.2` |
| Derived from | [`schemas/uixo-native.ts`](./schemas/uixo-native.ts) v1.2.0, vendored; source ontology `uixo_tbox_full_v11`, sha256 `bd808d51…` |
| Primitive types | 712 (one per ontology class, across 31 RDF prefixes) |
| Relation types | 210 (one per graph-edge property) |
| Renderers | Five document views — `text/markdown`, `text/html`, `application/pdf`, `image/svg+xml`, `image/png` (see [Five views](#five-views-of-one-document)) |

Root [README.md](../../README.md).

## The problem this plugin exists to solve

`uixo-native.ts` is already Zod, and `@fdpm/zod-bridge` accepts it
unchanged — 712 primitive types in 100 ms. That result is worthless, and
measurably so.

The source models every graph edge as `z.array(UixoEntityIdSchema)`
because "instance graphs may be cyclic" and referential integrity is
"enforced by `UixoDocumentSchema`". Handed to the bridge as-is:

```
relation types: 0
list fields:    1653   (every edge, as opaque id strings)
```

and a Button written with `hasChildComponent: ["ex:does-not-exist"]` was
**accepted with zero findings**. Measured, before this plugin existed.
712 typed boxes and no graph.

## The derivation

[`derive.ts`](./derive.ts) lifts all 1,653 edge fields out of the entity
schemas and re-expresses them as relation types. Everything it needs is
machine-readable in the source, so nothing here is hand-maintained:

| Input | Where it comes from |
|---|---|
| Which fields are edges | `z.array(<string>)` shape |
| Each edge's RDF range | its own `.describe()` — `range uixo:Component`, present on **1,653 of 1,653** |
| Which classes satisfy a range | `CLASS_PARENT`, the ontology's full 712-entry hierarchy |

The result:

```
primitive types: 712      relation types: 210
list fields:       0      unclassified edges: 0
```

1,653 edge *occurrences* collapse to 210 *properties* — `hasChildComponent`
is one property that 272 classes carry, not 272 relations. Target sets are
precise: median 1, p90 45, max 272.

Lifting uses `.omit()` on the strict source object, which also turns the
lifted key into an **unrecognised** one — so writing `hasChildComponent`
as a field is now a rejection, not a silently-stored list the host cannot
check. That rejection is the point, and it is the first test in
[`referential-integrity.test.ts`](../../tests/plugins/uixo/referential-integrity.test.ts).

### What the host now enforces, per write

- **Endpoint existence** — an edge to a non-existent entity is refused.
- **Range** (`owl:range`) — `hasLayout` will not accept a Button.
- **Domain** (`owl:domain`) — `uixo:Canvas` has no `hasChildComponent`, so
  it cannot be the source of one. This one caught a wrong assumption in my
  own first test fixture.

## Four transformations, each declared

Every one is in [`sidecar.ts`](./sidecar.ts) `declaredLoss` and emitted to
`generated/audit.json`:

1. **Edges → relations.** Buys host-enforced integrity; costs a consumer
   reading one primitive in isolation its edges.
2. **`uixo:Button` → `Uixo_Button`.** 31 prefixes share one profile and
   **five local names collide across them** (`InlineCode`,
   `LanguageSelector`, `NavigationItem`, `PromptComposer`, `VisualLayer`).
   Unprefixed, ten distinct classes would silently become five. Reversible
   via `qnameOf()`; the entity's own `type` field still carries the QName.
3. **Field names pass through unchanged.** `FieldDef.name` requires an
   identifier and nothing more — the host treats a name as an opaque key
   into `field_values` and derives nothing from its shape. For an RDF
   vocabulary the camelCase property name *is* the name, so
   `hasChildComponent` is stored as `hasChildComponent`. (An earlier draft
   snake_cased them against a stricter pattern that has since been
   corrected to what SPEC-CORE actually requires; the rename bought
   nothing and did not round-trip cleanly for `hasPlanCTA`.)
4. **Ten `owl:Thing` edges open to all 712 classes.** Their declared range
   names no storable class, so they are endpoint-checked for existence but
   not for range — which is all the ontology asserts about them either.

Plus one honest non-transformation: `extensions` is a `z.record` and stays
an opaque `json-record` blob on all 712 classes. Unlike a Record with known
keys, this is the ontology's *deliberate* open-world extension point, so a
blob is the faithful mapping. Entity references smuggled inside it are not
endpoint-checked.

## Vendoring

`schemas/uixo-native.ts` is generated in another repository
("Do not hand-edit; regenerate instead") and lived in a `_tmp/` directory
nothing may depend on. It is vendored by
[`scripts/vendor-uixo.ts`](./scripts/vendor-uixo.ts), which prepends a
header and applies a short recorded list of type annotations — five
exports whose inferred types exceed what TypeScript will serialise into a
`.d.ts` (TS7056), which upstream never hits because it does not emit
declarations.

```bash
npx tsx plugins/uixo/scripts/vendor-uixo.ts <path-to-upstream>   # re-vendor
npx tsx plugins/uixo/scripts/vendor-uixo.ts --check              # gate
```

`--check` reverses the annotations and re-hashes, so an in-place edit of
the vendored body fails. The upstream sha256 is recorded in the header and
asserted by test.

## Where the source oracle went

`validateUixoDocument` and its tiered `UIXO_ERRORS` catalog are **not**
ported wholesale, and that is declared. The split:

- **Per write, by the host** — field validation (712 Zod validators) and
  endpoint/domain/range enforcement (210 relation types).
- **[`invariants.ts`](./invariants.ts)** — the graph-level v1.1/v1.2
  deltas a per-primitive `ValidatorFn` cannot see, because it receives one
  instance and the relations but never the sibling primitives: exactly one
  InteractionSystem root, reachability from it, containment as a tree
  (single parent, reciprocal `hasChildComponent`/`parentComponent`, no
  cycles, unique `orderIndex` among siblings), and a non-blank label on
  every entity.
- **Not ported** — the semantic and policy tiers (status families,
  state-machine reachability, conditional rules, catalog-template
  placement). They need vocabulary the profile does not carry; inventing it
  here would be worse than leaving the source oracle to do its job.

`buildUixoWorkbook` runs the graph invariants before it writes anything. A
workbook built by direct primitive writes is field- and endpoint-valid but
not graph-valid until `validateUixoWorkbook()` is run against it.

## Ingest

```ts
import { buildUixoWorkbook } from "./plugins/uixo/index.js";
const report = await buildUixoWorkbook(host, uixoDocumentJson, { workbookId: "ui" });
```

ARCHITECTURAL REQUIREMENT: LLMs will always produce some form of error.
Absence of output verification is a design defect, not a runtime bug.
All LLM output must be treated as untrusted and validated explicitly.

The five controls: each node parsed against the class its own `type` names
(strict, so unknown fields are rejected); ids unique, every edge target
resolving and range-conformant; a `verification` `FDPMException` that
writes nothing on failure; a failure-path suite covering dangling,
out-of-range, unknown-class, duplicate-id, one-sided-containment,
missing-label and duplicate-orderIndex documents; and no loop whose
termination depends on input content.

## Scale

712 types is ~22× the largest previous profile here, and it is a non-issue
for the host: `profiles.register()` 1 ms, `getResolved()` 0 ms, 0.3 MB
heap, `createPrimitive()` 1 ms.

`generated/profile.json` is **7.1 MB**, which *is* a live concern for the
MCP surface: `fdpm.profile.get` would return it whole, and
`FDPM_MCP_MAX_RESOURCE_BYTES` (`task:p1-sizecap`) is still Backlog on the
Q2 roadmap. This plugin promotes that task from nicety to prerequisite.
The plugin registers **two** renderers rather than one per class for the
same reason.

## Five views of one document

A UI component tree drawn as nested boxes *is* a wireframe, which is why
that is the view worth having for an interaction ontology. Five renderers
are registered:

| Target | Renderer id | What it is |
|---|---|---|
| `text/markdown` | `uixo:DocumentOutlineRenderer` | The containment list, walking `hasChildComponent` alone — the literal reading, and the profile's default. |
| `text/html` | `uixo:DocumentHtmlRenderer` | The reviewable page: a sticky index, the palette as swatches, findings surfaced as a table, then the containment forest with prose as prose and every cross-link a resolving `href`. |
| `application/pdf` | `uixo:DocumentPdfRenderer` | The paginated artefact that leaves the workbook: title page, contents with leader dots and folios, printed palette, findings, structure, censuses, running head. |
| `image/svg+xml` | `uixo:ComponentTreeRenderer` | The poster: palette, breakpoint scale, findings chips, the trees that actually nest, and both censuses as proportional bars. |
| `image/png` | `uixo:ComponentSheetRenderer` | The same poster as pixels — a thumbnail for a ticket, a chat, or a visual diff between revisions. |

```bash
fdpm render <workbook> text/html      --renderer-id uixo:DocumentHtmlRenderer    -o doc.html
fdpm render <workbook> application/pdf --renderer-id uixo:DocumentPdfRenderer    -o doc.pdf
fdpm render <workbook> image/svg+xml  --renderer-id uixo:ComponentTreeRenderer   -o tree.svg
fdpm render <workbook> image/png      --renderer-id uixo:ComponentSheetRenderer  -o tree.png
```

Binary targets require `-o`; the CLI refuses to stream them to a terminal.

### What counts as containment

The ontology does not mark a property as containment, so the tree has to
be derived — and `hasChildComponent` alone is not enough. On a real
346-entity document it reaches a handful of buttons and leaves everything
else unreachable from any root, because the chain runs
`InteractionSystem → Screen → Layout → Region → Container` through five
*different* properties.

Deriving it from the *name* instead would be a convention masquerading as
a rule: 145 properties begin with `has`, and a node whose only in-edge is
spelled differently would vanish.

So [`renderers/_model.ts`](./renderers/_model.ts) builds a **spanning
forest over every edge**. A node's parent is one incoming edge; roots are
the nodes with none; every edge not used as a tree edge becomes a
cross-link on its source and a back-link on its target, so nothing is
dropped and nothing is drawn twice. Name shape only breaks a tie — a
`has…` or `…Component` in-edge is preferred when a node has several — so
the common case reads as the ontology intends while the uncommon case
still reaches every entity.

**This forest is a view, not a claim the ontology makes.** The markdown
outline remains the literal reading and is left as it was.

### Rendering values as what they are

The first version of these four put every attribute through one
flattening function. On the reference document that turned the entire
payload — the prose, the CSS custom properties, the hex colours, the
measured contrast ratios — into a grey comma-separated run-on, and the
PDF into 41 pages of it. Present but unreadable is worse than absent: it
looks like the document has been rendered.

[`renderers/_present.ts`](./renderers/_present.ts) classifies each value
by shape and by the ontology's own naming, so every view can draw a
colour as a swatch, a status as a badge, a reference as a link, and prose
as prose. Nothing is keyed to a particular document: `#F6F3EC` is a
colour because it matches the hex grammar, `hasSeverity` is a status
because the ontology names it one.

It also unpacks `extensions`. That field is a `z.record` on all 712
classes — the ontology's open-world escape hatch — and it carries the
writing: on the reference document `extensions.description` is present on
**all 346** entities and `extensions.spec` on 100. Treating it as one
opaque blob is faithful to the schema and useless to a reader, so
`description` becomes the entity's prose and the rest keeps its structure
as a nested fact tree.

Two document-level cuts fall out of the same classification, and they are
what make these views specialized rather than generic:

- **`colorTokens`** — every colour the document declares, including those
  inside a nested theme map. Eleven of the reference document's tokens
  carry a hex directly; a twelfth carries a whole dark-theme override as
  a `name -> hex` map, and stopping at the top level would have shown the
  light theme and silently dropped the dark one.
- **`findings`** — everything carrying a warning or error status, lifted
  out of whatever depth containment buried it at.

### One layout, two rasterisations

[`renderers/_wireframe.ts`](./renderers/_wireframe.ts) computes the
nesting once; the SVG emits it as vectors and the PNG paints it as
pixels. Neither owns a coordinate, so the bitmap cannot disagree with its
own vector. Layout is measure-then-place: a painter that discovers its
own extent as it goes is a painter that clips, and clipping is the defect
a screenshot cannot show you.

A box too narrow to hold a legible caption stops nesting and reports its
remaining descendants as a count on the header (`+N nested`) rather than
dropping them silently. Roots with no children are not drawn as boxes at
all — a record is not a hierarchy, and drawing 118 of them as nested
boxes is what made the first version a 15,000-pixel wall of grey pills.
They are grouped by class as chips instead.

The PNG encoder is [`src/core/render/png.ts`](../../src/core/render/png.ts),
shared with `plugins/style`; the PDF's WinAnsi sanitisation and wrapping
are [`src/core/render/pdf.ts`](../../src/core/render/pdf.ts).

### Characters both encoders cannot draw

Both faces have a limited repertoire and both used to lose characters
silently. The WinAnsi sanitiser replaced every code point above U+00FF
with `?` — **111 substitutions** on the reference document, every em dash
and arrow in the prose — and the 5x7 raster face dropped anything it had
no glyph for, turning a `<=` bound into a bare value.

`ASCII_FOLD` in `png.ts` now holds one table of readings and each encoder
applies its own keep-set on top: the PDF font draws dashes, quotes and
bullets, so those pass through unchanged; the raster face folds
everything. `tests/render-text-fold.test.ts` asserts both, including that
`toWinAnsi` never emits a code point `drawText` would throw on.

## Layout

```
plugins/uixo/
├── schemas/uixo-native.ts   # VENDORED — regenerate upstream, re-vendor here
├── derive.ts                # the fix: edges -> relation types, names -> snake_case
├── sidecar.ts               # entities + derived relations + declared losses
├── invariants.ts            # graph-level checks relations cannot express
├── ingest.ts                # UIXO document -> validated workbook
├── renderers/
│   ├── _model.ts            # graph -> DocumentView; the spanning forest
│   ├── _present.ts          # value typing: colours, statuses, refs, prose
│   ├── _poster.ts           # poster bands, shared by SVG and PNG
│   ├── _wireframe.ts        # nested-box geometry inside the structure band
│   ├── document_outline.ts  # text/markdown (+ the class table)
│   ├── document_html.ts     # text/html
│   ├── document_pdf.ts      # application/pdf
│   ├── component_tree.ts    # image/svg+xml
│   └── component_sheet.ts   # image/png
├── index.ts                 # activate(): profile + 712 validators + 5 renderers
├── scripts/vendor-uixo.ts   # vendoring + --check gate
├── scripts/run-bridge.ts    # regenerates generated/ + fdpm-plugin.json
└── generated/               # bridge-owned
```

```bash
npx tsx plugins/uixo/scripts/vendor-uixo.ts --check   # vendoring gate
npx tsx plugins/uixo/scripts/run-bridge.ts --check    # drift gate
npx vitest run tests/plugins/uixo                     # 87 tests
```

## Known limits

- The `extensions` blob (above) — 712 unvalidated fields by design.
- One property, `rendersArticle`, is declared with two ranges
  (`uixoarticle:Article` | `uixowiki:WikiArticle`). One relation type per
  property means its target set is the **union**, so it accepts a target
  the narrower declaring class would not. Splitting per source class would
  restore soundness at the cost of one relation type per (class, property)
  pair. Reported by `rangeConflicts()` and asserted by test rather than
  left silent.
- Abstract classes are handled implicitly: a range naming a class with no
  registered schema contributes only its descendants. The ontology does not
  mark abstractness explicitly, so — unlike `plugins/uml/abstract.ts` —
  there is no independent check that a registered class is instantiable.
- RDF multi-typing is not representable; inherited from the source, which
  states it directly.
