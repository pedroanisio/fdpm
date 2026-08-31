---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Opus 5 (1M context) via Claude Code"
  date: "2026-08-30"
---

# `fdpm.knowledge-cartridge`

A corpus compressed into an **executable competence module** — the six layers
deliberate practice deposits, every claim addressed to a source sentence, and
every hole the corpus could not fill declared rather than filled.

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

A cartridge is assembled wholesale from model output, and
[`GENERATOR.md`](./GENERATOR.md) names the specific failure this profile exists
to stop. Pass 4, GAP FILLING: *"faced with a hole, a model will reach for
training-data knowledge and produce a confident uncited claim sitting in a
document whose every other claim is cited."* That output is fluent and wrong,
and it is indistinguishable from the rest of the page. `kc:val:normative-claim-cited`
is its control.

---

## Identity

| | |
|---|---|
| Plugin id | `fdpm.knowledge-cartridge` |
| Profile id | `profile:knowledge-cartridge:1.0` |
| Vendor prefix | `kc` |
| Primitive types | 13 |
| Relation types | 6 |
| Validators | 5 registrations, 9 rule ids |
| Renderers | 5 |
| MCP prompts | 1 |
| Transfer format | `kc-jsonl` (importer + exporter) |

---

## The document did the design work

[`GENERATOR.md`](./GENERATOR.md) is the seven-pass protocol and the **source of
truth** for this plugin. Where a source file and that document disagree, the
document is right and the file is a bug.

It is a schema in prose. Its Pass-5 "layer type contracts" are row shapes:

| Layer | What GENERATOR.md says its register is | Type |
|---|---|---|
| L0 | "Definitions only. Units, notation." | `kc:Primitive` |
| L1 | "Tabular. One line per rule: ID, rule, value, citation." | `kc:Invariant` |
| L2 | "If a number appears in prose here, it is in the wrong layer." | `kc:Constant` |
| L3 | "Numbered, ordered. The ordering IS the content." | `kc:Step` |
| L4 | "Three columns: symptom / cause / correction." | `kc:Diagnostic` |
| L5 | "Prose is permitted here **and only here**." | `kc:Override` |

And its Pass-3 transposition test is a five-arm discriminated union: *"If a
passage cannot be transposed into one of these five, it does not belong in the
cartridge — however interesting it is."*

### Why six types and not one with a `layer` field

Pass 6 asks *"L4 has >= 8 rows"* and *"L5 exists and is non-empty"*. Against one
polymorphic item type carrying a layer string those are filters over a column,
and nothing stops a diagnostic shipping without a correction. Against six
primitive types they are cardinality checks, and each layer's mandatory register
is a required field the host enforces.

### Why discarded harvest is kept

Pass 3 wants a 70 % discard rate; Pass 6 checks for 50 %. If the workbook held
only the passages that survived, that rate would be a number its author
asserted — which is exactly the SELF-CERTIFICATION failure Pass 6 exists to
prevent. `kc:Harvest.retained` keeps both arms, so the rate is arithmetic over
the graph. This is the one place the plugin adds something the document did not
ask for, and the reason is the document's own instruction: *"Run them as
operations, not as judgements."*

---

## Pass 6, executed

Nine rule ids run at write time. The load-bearing one is the citation check, and
**where** it fires is forced rather than chosen:

> A citation is a `kc:CitesSource` edge; an edge needs both endpoints to exist;
> the host validates every write against the proposed post-state. A layer type
> demanding an inbound citation at creation could therefore never be created —
> in a batch or otherwise. Pass 5 creates the `kc:Cartridge` header last, so the
> header is the gate: it cannot be written while any normative claim is uncited,
> and the finding names every offender.

| Rule id | Level | Catches |
|---|---|---|
| `kc:val:normative-claim-cited` | error | A normative claim with no `KEY:ordinal`. Fires on the header. |
| `kc:val:invariant-falsifiable` | error | A rule you cannot point at a page and violate — a theme, not a constraint. |
| `kc:val:step-constrains-next` | error | A step that constrains nothing; a list item wearing L3's clothes. |
| `kc:val:harvest-retention-arm` | error | A discarded row with no reason, or a retained row carrying one. |
| `kc:val:override-suspends-a-rule` | warning | An L5 override wired to no invariant — an opinion. |
| `kc:val:diagnostic-minimum` | warning | Fewer than 8 diagnostics: under-harvested. |
| `kc:val:judgement-non-empty` | warning | No L5 at all: a textbook, not a practitioner. |
| `kc:val:exclusions-non-empty` | warning | An envelope that excludes nothing, making the gap audit vacuous. |
| `kc:val:discard-rate` | warning | Below 50 %: transposition has become summarising. |

The counting four emit at **warning**, not error, because a cartridge
mid-construction legitimately has three diagnostics and no judgement layer.
Making them errors would block every write until the artifact was finished.

### Three checks that cannot run here

Declared in `KC_UNENFORCEABLE_CHECKS` and printed as `UNCHECKED` by the citation
index, because a scoreboard showing only enforceable checks is the
self-certification the protocol warns about.

| Check | Why not |
|---|---|
| Every ordinal resolves to a real sentence | A validator is a pure function of the instance and the workbook's relations. Resolving an ordinal is a network call to the retrieval substrate. |
| Compression ratio <= 5 % | The numerator is the rendered artifact, which does not exist until after validation. |
| No verbatim quotation beyond short phrases | A length heuristic would flag the ranged reads that are stored verbatim on purpose. Human review. |

---

## Renderers

| Target | Renderer id | What it shows that the others cannot |
|---|---|---|
| `text/markdown` | `kc:CartridgeRenderer` | The artifact, laid out to the Pass-5 registers, with gaps and unreconciled conflicts in the back matter rather than hidden. |
| `application/pdf` | `kc:CartridgePdfRenderer` | The portable practitioner edition: A4 cover and contents, one typed register per layer, citations beside claims, running heads and folios, and the audit back matter in the reading sequence. |
| `text/html` | `kc:CitationIndexRenderer` | The evidence **inverted** — source by source, every claim resting on it. Reading a cartridge you can only ask "is this cited"; reading this you can ask "does the source say all of that". |
| `image/svg+xml` | `kc:LayerMapRenderer` | Depth per layer against its floor. A cartridge heavy in L1/L2 and empty in L4/L5 has harvested facts and no expertise, and that shows here in one glance. |
| `application/json` | `kc:StateRenderer` | The projection an **agent** loads, rather than a person. Bounded, and honest about it. |

Several plugins register `text/html` and `text/markdown`, so ask by id:

```bash
fdpm render <workbook> text/markdown --renderer-id kc:CartridgeRenderer -o cartridge.md
fdpm render <workbook> application/pdf --renderer-id kc:CartridgePdfRenderer -o knowledge-cartridge.pdf
fdpm render <workbook> text/html     --renderer-id kc:CitationIndexRenderer -o citations.html
fdpm render <workbook> image/svg+xml --renderer-id kc:LayerMapRenderer -o layer-map.svg
```

All five are pure functions of their input — no clock, no randomness — and sort
before emitting, because primitive and relation collections are sets. Asserted
in [`renderers.test.ts`](../../tests/plugins/knowledge_cartridge/renderers.test.ts).

### PDF typography and verification

The practitioner PDF embeds four closed, distributable faces from the packaged
Fontsource dependencies: Noto Sans regular, bold, and italic, plus Noto Sans
Mono regular. The PDF therefore does not depend on fonts installed on the
reader's machine, and Western-Latin source text such as `composição — ação`
remains searchable and extractable. Characters outside the packaged Latin
glyph set are replaced with a visible fallback instead of being silently
deleted or causing the render to fail. Expanding script coverage requires
adding the corresponding licensed font subsets and regression fixtures.

`tests/renderers/pdf-visual.spec.ts` verifies the delivered bytes with Poppler:
all font programs must be embedded and Unicode-mapped, multilingual extraction
must survive, and representative cover, register, and audit pages must match
the inspected raster baselines. The PDF is not tagged PDF/UA; that limitation
is documented in the repository renderer quality report.

### `kc:StateRenderer` is a different kind of view

The other three are read by a person; this one is loaded by an agent, which
changes what it must guarantee.

**Bounded.** `KC_STATE_BUDGET_BYTES` is 16 KB — roughly 4,000 tokens — and the
render never exceeds it. A cartridge grows without limit; a context window does
not.

**Honest about truncation.** This is the load-bearing property. A view that
silently drops rows makes the agent's knowledge silently *wrong*: it reasons
confidently from a projection it believes is complete, and nothing downstream
can tell. `_truncated` is emitted whenever anything was evicted — carrying the
count, the policy and a per-layer breakdown — and its absence is a positive
claim that nothing was.

**Eviction is recency, with one derived pin.** ULIDs are minted monotonically,
so sorting by `uid` descending is chronological with no extra field and no
clock. The exception: an invariant that an override suspends is never dropped,
because emitting an exception to a rule that is not there is a projection that
contradicts itself. The pin is computed from the graph, so it cannot drift.

---

## Transfer — `kc-jsonl`

A cartridge is sold as a *module*: something you hand to a practitioner who has
never read the sources. Without an export path it can only exist in the
workspace that built it, which makes that claim false.

```bash
fdpm transfer export <workbook> --format kc-jsonl -o cartridge.kc-jsonl
fdpm transfer import cartridge.kc-jsonl --format kc-jsonl --id my-cartridge
```

One `{kind, data}` record per line, filtered to the `kc:` prefix so a mixed
workbook exports only its cartridge.

The importer **raises on a malformed line and names the line number** rather
than skipping it. A skipped line deletes a claim from a document whose whole
contract is that every claim is accounted for, and it does so invisibly — the
discard rate on the far side would still read as clean. It does not gate
content: it builds a `ProjectTransfer` and stops, so every row still meets the
§7 pipeline on its way in, including the Pass-6 header gate. Import is a parse
boundary, not a second, weaker validator.

> **Host change shipped alongside.** `cap:exporter` had no invocation path
> anywhere — no `findExporter`, no `runExporter`, no CLI or SDK route — so the
> five bundled exporters (`plan-jsonl`, `sw-jsonl`, `fs-jsonl`, `spec-jsonl`,
> `recipe-jsonl`) were registered and uncallable. `PluginRuntime.runExporter`
> now mirrors `runImporter`, including its §6.4 exception barrier.

---

## MCP prompt

`knowledge-cartridge/build_cartridge` carries the seven-pass protocol as a
skill: when to reach for it, the call order over real FDPM tools, and the
failure modes by the rule id that rejects the write.

```bash
fdpm plugin prompt knowledge-cartridge/build_cartridge \
  --arg workbook_id=tc-typ-001 --arg subject=typesetting --arg archetype="book typographer"
```

Body ceiling 5,000 B against a measured 4,602 B — about 11 % headroom. A
procedural specification is re-sent on every step of a run, so its size is a
recurring cost, not a one-off. Raising the ceiling needs a CHANGELOG line.

---

## Layout

```
knowledge_cartridge/
├── GENERATOR.md              # the protocol — SOURCE OF TRUTH
├── ids.ts                    # type ids, categories, scopes, vocabularies, renderer ids
├── _common.ts                # field builders
├── primitives.ts             # 13 primitive types; six of them are the layers
├── relations.ts              # 6 relation types; kc:CitesSource carries the ordinal
├── validators.ts             # Pass 6, executed — plus what it cannot execute
├── prompts.ts                # the generator protocol as an MCP prompt
├── io.ts                     # the kc-jsonl importer/exporter pair
├── index.ts                  # profile + activate()
├── fdpm-plugin.json          # manifest
└── renderers/
    ├── _model.ts             # the one graph walk all five views share
    ├── cartridge_md.ts       # the artifact
    ├── cartridge_pdf.ts      # the portable practitioner edition
    ├── citation_index.ts     # the verification surface
    ├── layer_map.ts          # layer depth vs floors
    └── state_json.ts         # the bounded projection an agent loads
```

## Tests

```bash
npx vitest run tests/plugins/knowledge_cartridge
npm run test:renderers:visual -- --grep "Knowledge cartridge|knowledge cartridge"
```

The visual command requires Chromium and the Poppler utilities `pdffonts`,
`pdftotext`, and `pdftoppm`. CI installs both toolchains on Ubuntu 24.04.
