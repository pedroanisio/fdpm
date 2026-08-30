---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Opus 5 (1M context) via Claude Code"
  date: "2026-08-30"
---

<!-- SOURCE OF TRUTH for profile:knowledge-cartridge:1.0.

     ids.ts transcribes this file's vocabularies (the six probes, the four
     source tiers, the four corpus defects), primitives.ts transcribes its
     Pass-5 layer contracts, and validators.ts implements nine of its eleven
     Pass-6 checks. Where a plugin source and this document disagree, this
     document is right and the plugin is a bug.

     Kept here rather than in docs/specs/ because it is a plugin's own
     contract, not a repository SPEC, and every other SPEC in this tree is
     generated from a workbook rather than hand-authored. -->

# TALENT CARTRIDGE GENERATOR — v1.0

A seven-pass protocol for compressing a corpus into an executable competence module.

---

## 0. WHAT A CARTRIDGE IS, MECHANICALLY

"10,000 hours" is a metaphor, and honoring it requires knowing what the metaphor
actually names. Expertise research is clear that deliberate practice does not
deposit *more facts*. It performs four specific conversions:

| Conversion | What changes | Cartridge layer |
|---|---|---|
| **Chunking** | Many small items become one retrievable unit | L2 Constants, L3 Procedures |
| **Automaticity** | Rules stop being weighed and start being obeyed | L1 Invariants |
| **Pattern recognition** | Faults are *named on sight*, then analysed | L4 Diagnostics |
| **Adaptive expertise** | Knowing when the rules do not apply | L5 Judgement |

The six-layer schema is therefore not a stylistic choice. It is the shape of
what practice produces. Any cartridge that omits L4 or L5 has encoded a
textbook, not a practitioner.

**The generator's whole job is to convert declarative knowledge (what a book
holds) into procedural knowledge (what a practitioner holds).** Every pass below
serves that conversion.

---

## 1. NEGATIVE SPECIFICATION — READ BEFORE ANYTHING ELSE

A cartridge is **not**:

- a summary (summaries preserve proportion; cartridges destroy it deliberately)
- a reading list or annotated bibliography
- a glossary (glossaries say what things *are*; cartridges say what to *do*)
- a tutorial (tutorials assume a novice; cartridges assume a practitioner mid-task)
- an essay with headings

**Acceptance test.** Hand the cartridge to a competent practitioner who has
never read the sources. Can they (a) *act* from it, (b) *diagnose* from it, and
(c) *know when to ignore it*? If it only supports (a), it is a manual. If it
only tells them what things are, it is a glossary. All three, or it fails.

**Compression target.** A cartridge is roughly 0.5–2% of source token count.
TC-TYP-001 compressed ~250,000 corpus tokens into ~7,000. If your ratio is
above ~5%, you are summarizing.

---

## 2. INPUT SLOTS

Fill these before Pass 0. Do not proceed on defaults.

```
{SUBJECT}      The craft. Narrow beats broad. "Typesetting" > "design".
{ARCHETYPE}    WHOSE 10,000 hours? A book typographer, a type designer, and a
               web typographer share a subject and share almost no rules.
               This slot determines which rules survive Pass 3.
{CORPUS}       Retrieval substrate + document set. Tier it in Pass 1.
{EXCLUSIONS}   What this cartridge will NOT cover. Mandatory, not optional —
               see Pass 0 failure mode.
{SUBSTRATE}    doc-ray | vector store | filesystem | web. Pass 2 method varies.
```

---

## 3. THE PASSES

Each pass states an objective, a method, an output contract, a stop condition,
and the specific way a model will cheat on it. **The failure modes are the load-
bearing part.** A pass without its failure mode named will silently degrade.

---

### PASS 0 — ENVELOPE

**Objective.** Define the boundary of claimed competence *before* retrieval, so
that "gap" becomes a meaningful word.

**Method.** Write the competence envelope as two lists: what is covered, and
what is explicitly excluded. Derive both from `{ARCHETYPE}`, not from what the
corpus happens to contain — otherwise the corpus defines the envelope and
nothing can ever be missing from it.

**Output contract.** Two bulleted lists. Exclusions must be non-empty and must
name at least two things a reasonable person would expect to be included.

**Stop when.** A reader could predict, for an arbitrary question, whether the
cartridge claims to answer it.

**Failure mode — ENVELOPE INFLATION.** The model draws the envelope to match
whatever it finds, making the gap audit vacuous. Countermeasure: write the
envelope before the first retrieval call, and do not revise it afterwards
except by explicit amendment noted in the artifact.

---

### PASS 1 — SURVEY

**Objective.** Establish what is on the shelf, how authoritative each item is,
and whether the retrieval ranking can be trusted at all.

**Method.**
1. Broad query on `{SUBJECT}` and 2–3 adjacent framings.
2. **Tier the results.** Primary authority / practitioner-tier / tooling-tier /
   strategy-tier. These tiers make incompatible claims and must never co-rank.
3. Record document metadata: page count, sentence count, date, authorship.
4. Run the corpus-defect check (§4 below).

**Output contract.** A tiered source table with an assigned citation KEY per
document, plus a defects list.

**Stop when.** Every document that will be cited has a KEY and a tier.

**Failure mode — RANK-AS-AUTHORITY.** Retrieval rank measures lexical fit, not
standing. On dense shelves it saturates outright: a doc-ray query for agentic AI
returned eleven documents tied at `0.9999997`, which discriminates nothing.
Countermeasure: **if the top-N ranks agree to more than three significant
figures, stop using rank.** Switch to semantic retrieval, entity resolution, or
map-reduce over corpus shards, and tier by hand.

---

### PASS 2 — HARVEST

The heavy pass. Where most of the cost and all of the substance is.

**Objective.** Extract rule-bearing sentences, verbatim and with stable
addresses.

**Method — query in the imperative mood.** This is the single highest-leverage
technique in the protocol. Querying `{SUBJECT}` returns prose *about* the
subject. Querying the shape of a rule returns rules. Run **the six probes**
against each subtopic:

| Probe | Query shape | Yields |
|---|---|---|
| **Quantity** | typical value, range, minimum, maximum, how much | L2 constants |
| **Constraint** | must, never, always, avoid, required | L1 invariants |
| **Ordering** | first, before, after, then, order of operations | L3 procedures |
| **Failure** | problem, mistake, symptom, common error, fails when | L4 diagnostics |
| **Condition** | when, unless, except, depends on | L1 modifiers, L5 |
| **Preference** | better, worse, prefer, instead of, rather than | L5 judgement |

**Method — two-stage retrieval.** Non-negotiable:

1. **Locate** with evidence/snippet retrieval. Snippets are pointers, *not*
   content — they arrive stripped of the surrounding rule.
2. **Extract** with a ranged sequential read around each hit (±20–40 sentences).

In building TC-TYP-001, snippet retrieval surfaced *that* a leading rule
existed; the ranged read at ordinals 424–470 produced the five modifiers, the
worked 11/13 arithmetic, and the subhead examples. **Snippets alone would have
yielded a cartridge of stubs.**

**Method — flood control.** Before spending a query on a common term, check its
corpus frequency. High-frequency terms cluster their hits in one region and
starve coverage of everything else.

**Output contract.** A harvest file of `{KEY:ordinal, verbatim text, probe type,
candidate layer}` rows. Verbatim at this stage — paraphrase in Pass 3, not here.

**Stop when.** Every `{ARCHETYPE}` subtopic has been hit by all six probes, or
returned nothing (record the nothing — it is a Pass 4 input).

**Failure mode — SNIPPET SATISFACTION.** The model accepts snippet-level
evidence as sufficient because it is fluent enough to look complete.
Countermeasure: **mandate at least one ranged read per subtopic.** No subtopic
proceeds to Pass 3 on snippets alone.

**Secondary failure — OUTLINE TRUST.** Heading detection is heuristic and
font-size-based on PDFs. Bringhurst's outline returned forty entries titled with
type specimens (`adefmpru`, `AAHH`) because the specimens were set larger than
the headings. Countermeasure: check the outline's `source` field; if it is
`uniform`, or if titles look like content fragments, navigate by evidence
retrieval instead.

---

### PASS 3 — TRANSPOSE

Where compression actually happens. This is the pass that makes it a cartridge.

**Objective.** Convert each harvested passage into procedural form, or discard it.

**Method — THE TRANSPOSITION TEST.** Every retained item must become exactly one of:

```
(a) CONSTRAINT   a falsifiable rule           -> L1
(b) CONSTANT     a number or ratio            -> L2
(c) STEP         a position in an ordering    -> L3
(d) DIAGNOSTIC   symptom -> cause -> fix      -> L4
(e) OVERRIDE     a condition for ignoring (a) -> L5
```

**If a passage cannot be transposed into one of these five, it does not belong
in the cartridge — however interesting it is.** History, biography, etymology,
and the author's argument for their own position are all Pass 3 discards. They
are why the book is worth reading; they are not what practice deposits.

**Discard rate is the quality signal.** Expect **70%+ discard**. A low discard
rate means the model is transposing prose into prose — i.e. summarizing under a
new name. If discard is under ~50%, the pass has failed; re-run it with the test
applied strictly.

**Output contract.** Five typed lists. Every item carries its `{KEY:ordinal}`.

**Failure mode — TRANSPOSITION THEATRE.** The model reformats a paragraph as a
bullet, calls it a constraint, and moves on. Countermeasure: a constraint must
be **falsifiable** — you must be able to point at a page and say *this violates
it*. If you cannot, it is a theme, not a constraint. Delete it.

---

### PASS 4 — AUDIT

**Objective.** Find where sources disagree, and where the envelope is unmet.

**Method.**
1. **Conflict scan.** Where do two sources give different values for the same
   quantity? Record both with attribution; do not average, do not silently pick.
2. **Envelope-vs-harvest diff.** For each Pass 0 covered-item, is there harvest
   backing it? Unbacked items become declared gaps.
3. **Defect carry-forward.** Duplicates, metadata failures, extraction failures
   from Pass 1.

**Output contract.** A findings list, **graded by attention required**:
- *Low* — known problem, known solution, mechanical fix. State the fix, move on.
- *Decision* — solution unclear, high-impact, or not safely automatable.

**Failure mode — GAP FILLING.** This is the most dangerous failure in the entire
protocol, because its output is fluent and wrong. Faced with a hole, a model
will reach for training-data knowledge and produce a confident uncited claim
sitting in a document whose every other claim is cited. **The gap is the
deliverable.** Countermeasure: mechanical check in Pass 6 — any normative claim
without a `{KEY:ordinal}` is either cited or deleted. No exceptions.

---

### PASS 5 — COMPOSE

**Objective.** Author the artifact.

**Method — layer type contracts.** Each layer has a mandatory register. These
contracts are what keep prose from creeping back in:

```
L0 PRIMITIVES   Definitions only. Units, notation, the three or four
                measurements everything else is expressed in.
L1 INVARIANTS   Tabular. One line per rule: ID, rule, value, citation.
                Prose only to explain rules that resist tabulation.
L2 CONSTANTS    Numbers, ratios, scales, worked examples. Monospaced tables.
                If a number appears in prose here, it is in the wrong layer.
L3 PROCEDURES   Numbered, ordered. The ordering IS the content — state why
                each step constrains the next.
L4 DIAGNOSTICS  Three columns: symptom / cause / correction. Symptom-first,
                always — the practitioner sees the symptom, not the cause.
L5 JUDGEMENT    Prose is permitted here and only here, because this layer is
                explicitly non-executable.
ANNEX           Handoff to adjacent lanes (production, deployment, ops).
```

**Mandatory front and back matter.**
- Cover: cartridge ID, competence envelope, source corpus with sentence counts,
  disclaimer (paraphrase not quotation; defaults are starting positions not
  tolerances; unreviewed by a human expert).
- Back: full citation index; corpus coverage and gaps from Pass 4.

**Failure mode — REGISTER DRIFT.** By L3 the model relaxes into essay prose.
Countermeasure: compose L2 and L4 *first*. They are the hardest to fake, and
once written they anchor the register for everything else.

---

### PASS 6 — VERIFY

**Objective.** Mechanical checks only. No self-assessment — a model asked
whether its output is good will say yes.

**Checklist.**

```
[ ] Every normative claim carries {KEY:ordinal}
[ ] Every ordinal resolves to a real sentence in a real document
[ ] Every number in L2 traces to an ordinal (no derived arithmetic uncited)
[ ] Discard rate from Pass 3 recorded and >= 50%
[ ] Compression ratio recorded and <= 5% of source tokens
[ ] L4 has >= 8 rows (a craft with fewer known failure modes is under-harvested)
[ ] L5 exists and is non-empty (its absence means no adaptive expertise encoded)
[ ] Declared gaps are consistent with the Pass 0 envelope
[ ] Exclusions list is non-empty
[ ] Renderer/validator output surfaced verbatim, nothing suppressed
[ ] No verbatim quotation beyond short attributed phrases
```

**Failure mode — SELF-CERTIFICATION.** Countermeasure: every check above is
countable or resolvable. Run them as operations, not as judgements.

---

## 4. CORPUS DEFECT CHECKS (run during Pass 1)

Four defects observed in practice, each with a known fix:

| Defect | Signal | Fix |
|---|---|---|
| **Duplicate ingestion** | Two ids, identical rank | Dedupe; retire one. *Low* |
| **Metadata failure** | Bare numeric or null title | Repair before anyone else searches. *Low, but discovery impact is high* |
| **Outline extraction failure** | Headings that look like content | Navigate by evidence retrieval. *Low* |
| **Rank saturation** | Top-N agree past 3 s.f. | Abandon rank; tier by hand. *Decision* |

The metadata case deserves emphasis: a doc-ray corpus held Osmani et al.'s
*The New SDLC With Vibe Coding* under the title `1317`. It was the single most
on-point document for its subject and invisible to every title search. **Defect
checks are not housekeeping — they change what the cartridge can contain.**

---

## 5. THE SHORT FORM

When the full protocol is too much ceremony, this is the irreducible core:

> Build a Talent Cartridge on **{SUBJECT}** for **{ARCHETYPE}** from **{CORPUS}**.
>
> A cartridge encodes what deliberate practice deposits — chunking, automaticity,
> pattern recognition, and knowing when rules don't apply — as six layers:
> primitives, invariants, constants, procedures, diagnostics, judgement.
> It is not a summary, a glossary, or a tutorial.
>
> Declare the competence envelope and its exclusions **before** retrieving.
> Harvest by querying in the imperative mood — quantity, constraint, ordering,
> failure, condition, preference — and locate with snippets but **extract with
> ranged sequential reads**; snippets alone yield stubs.
> Transpose every passage into a constraint, a constant, a step, a diagnostic,
> or an override, and **discard anything that fits none of the five** — expect to
> discard 70%.
> Where the corpus is silent, **declare the gap; never fill it**.
> Every normative claim carries a KEY:ordinal.
> Report the discard rate, the compression ratio, and the corpus defects you found.

---

## 6. KNOWN LIMITS OF THIS GENERATOR

Stated so they are not discovered the hard way.

- **Single-corpus bias.** The cartridge inherits its corpus's blind spots
  wholesale. Pass 4 surfaces them but cannot fix them — closing a gap is an
  acquisition decision, not a generation step.
- **Recency.** A cartridge is a snapshot. TC-TYP-001's primary source is a 2004
  edition; it therefore cannot speak to variable fonts, and says so. Date the
  snapshot on the cover.
- **No tacit motor skill.** Genuine 10,000-hour competence includes calibration
  that lives in the hands and eye and does not survive textual transmission.
  L5 gestures at this; it does not transmit it. A cartridge accelerates a
  practitioner. It does not manufacture one.
- **Unreviewed.** The disclaimer is not decoration. Nothing in the pipeline
  substitutes for a domain expert reading the output.

---

*Generator v1.0. Derived from the construction of TC-TYP-001 (Typesetting &
Typographic Composition), where the passes above were executed rather than
theorised, and the failure modes were the ones actually encountered.*
