---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Opus 4.7 (1M context) via Claude Code"
  date: "2026-05-06"
---

# Worked Sidecar: `pitch-deck.schema.v2.ts`

## Purpose

Author the sidecar **by hand** for an existing real schema, before any
code or formal spec exists. The exercise is to discover what the
sidecar format actually needs to carry, how painful it is to write,
and where the schema and sidecar overlap or conflict.

This is the empirical input to `@fdpm/zod-bridge@0.3.0`'s sidecar
spec. If the worked example reveals problems, the spec changes; the
spec doesn't drive the worked example.

## Source

[`static/schemas/pitch-deck.schema.v2.ts`](../../static/schemas/pitch-deck.schema.v2.ts)
— 1347 lines, 13 named sub-schemas, 9 entity-shaped types.

## Step 1 — extract the references the schema actually declares

Walking the schema, here are every foreign-key-shaped field. Notation:
`From.field → Target [cardinality]`. Inverse direction is read from
the schema's own validators (lines 957-995) which enforce bidirectional
consistency for two edge pairs.

```
Source.derivedFrom    → Source              [many; self-reference; optional]
DataPoint.sourceIds   → Source              [many]
DataPoint.usedOnSlides ← inverse of Slide.evidenceUsed
Claim.supportedByDataPoints → DataPoint     [many]
Claim.supportedByClaims     → Claim         [many; self-reference]
Claim.appearsOnSlides       ← inverse of Slide.claimsAdvanced
Risk.addressedOnSlides      ← inverse of Slide.risksAddressed (implied; not enforced bidir today)
Slide.evidenceUsed     → DataPoint          [many]   ↔ DataPoint.usedOnSlides
Slide.claimsAdvanced   → Claim              [many]   ↔ Claim.appearsOnSlides
Slide.competitorsCited → Competitor         [many]
Slide.risksAddressed   → Risk               [many]   ↔ Risk.addressedOnSlides (implied)
Slide.antiPatternsAvoided → AntiPattern     [many]
Slide.audienceReadings[].audienceId → Audience [one; nested in struct]
Slide.visual (variant=stat-tiles).tiles[].dataPointId → DataPoint [one; deep-nested]
Slide.visual (variant=stat-tiles).chartDataPointIds → DataPoint [many; deep-nested]
Slide.visual (variant=chart-with-signal-rail).chartDataPointIds → DataPoint [many; deep-nested]
Slide.visual (variant=competitive-quadrant).items[].competitorId → Competitor [one; deep-nested]
NarrativeArc.phaseSequence[].slideIds → Slide [many; nested]
PitchDeck owns ALL of the above as a containment relation, conceptually.
```

That's **17 distinct edge declarations**, of which **3 are paired
inverses** (so 14 unique relations, each appearing once or twice in
the sidecar). Two edges are deep inside discriminated-union variants.

This is more complex than I expected. Important findings:

- **References inside discriminated-union variants** are real
  (`Slide.visual.tiles[].dataPointId`). The sidecar can't just match
  against top-level fields; it needs to address into nested paths.
- **References inside arrays of structs** are also real
  (`Slide.audienceReadings[].audienceId`). Same problem.
- **Self-references** appear (`Source.derivedFrom`,
  `Claim.supportedByClaims`). Cardinality is straightforward but the
  cycle-detection responsibility moves to FDPM.
- **Bidirectional consistency** is currently enforced by the schema's
  own `superRefine`. If FDPM emits paired relations, the host can
  enforce it; the schema's validator becomes redundant on those two
  edges.

## Step 2 — write the sidecar by hand

Here's what I would actually write, today, as a TypeScript module
co-located with the schema:

```ts
// pitch-deck.domain.ts
import {
  PitchDeckSchema, Schemas,
} from "./pitch-deck.schema.v2";
import { defineDomain } from "@fdpm/zod-bridge";

export const domain = defineDomain({
  // Section A — Entities. Identity declarations.
  // Maps logical name → { Zod schema, optional id-schema, doc }.
  // The bridge uses this in place of the v0.2.0 `entities: string[]` option.
  entities: {
    PitchDeck: {
      schema: PitchDeckSchema,
      // No id field in source; PitchDeck is a singleton root.
      identityKind: "singleton",
    },
    Audience:    { schema: Schemas.Audience,    idField: "id" },
    Source:      { schema: Schemas.Source,      idField: "id" },
    DataPoint:   { schema: Schemas.DataPoint,   idField: "id" },
    Claim:       { schema: Schemas.Claim,       idField: "id" },
    AntiPattern: { schema: Schemas.AntiPattern, idField: "id" },
    Risk:        { schema: Schemas.Risk,        idField: "id" },
    Competitor:  { schema: Schemas.Competitor,  idField: "id" },
    Slide:       { schema: Schemas.Slide,       idField: "id" },
  },

  // Section B — References. Foreign-key edges with cardinality + cascade.
  // `from`/`to` resolve against the entities map. `field` is a JSONPath-ish
  // accessor relative to the `from` entity; supports `[]` for array unwrap
  // and `.kind=...` for variant selection.
  references: [
    // Slide outgoing edges
    {
      from: "Slide", field: "evidenceUsed",
      to: "DataPoint", cardinality: "many-to-many",
      inverse: { on: "DataPoint", field: "usedOnSlides" },
      cascade: "set-null",
      doc: "DataPoints surfaced on this slide. Bidirectionally consistent with DataPoint.usedOnSlides.",
    },
    {
      from: "Slide", field: "claimsAdvanced",
      to: "Claim", cardinality: "many-to-many",
      inverse: { on: "Claim", field: "appearsOnSlides" },
      cascade: "set-null",
    },
    {
      from: "Slide", field: "competitorsCited",
      to: "Competitor", cardinality: "many-to-many",
      cascade: "set-null",
    },
    {
      from: "Slide", field: "risksAddressed",
      to: "Risk", cardinality: "many-to-many",
      inverse: { on: "Risk", field: "addressedOnSlides" },
      cascade: "set-null",
    },
    {
      from: "Slide", field: "antiPatternsAvoided",
      to: "AntiPattern", cardinality: "many-to-many",
      cascade: "set-null",
    },
    {
      from: "Slide", field: "audienceReadings[].audienceId",
      to: "Audience", cardinality: "many-to-one",
      cascade: "deny",
      doc: "Each audience reading links a slide to an audience.",
    },

    // Slide.visual discriminated-union deep references
    {
      from: "Slide", field: "visual.kind=stat-tiles-plus-chart.tiles[].dataPointId",
      to: "DataPoint", cardinality: "many-to-one",
      cascade: "deny",
    },
    {
      from: "Slide", field: "visual.kind=stat-tiles-plus-chart.chartDataPointIds",
      to: "DataPoint", cardinality: "many-to-many",
      cascade: "deny",
    },
    {
      from: "Slide", field: "visual.kind=chart-with-signal-rail.chartDataPointIds",
      to: "DataPoint", cardinality: "many-to-many",
      cascade: "deny",
    },
    {
      from: "Slide", field: "visual.kind=competitive-quadrant.items[].competitorId",
      to: "Competitor", cardinality: "many-to-one",
      cascade: "set-null",
    },

    // DataPoint outgoing edges
    {
      from: "DataPoint", field: "sourceIds",
      to: "Source", cardinality: "many-to-many",
      cascade: "deny",
    },

    // Claim outgoing edges
    {
      from: "Claim", field: "supportedByDataPoints",
      to: "DataPoint", cardinality: "many-to-many",
      cascade: "deny",
    },
    {
      from: "Claim", field: "supportedByClaims",
      to: "Claim", cardinality: "many-to-many",
      cascade: "deny",
      acyclic: true,
      doc: "Self-referential support DAG. Cycles rejected at validation.",
    },

    // Source self-reference
    {
      from: "Source", field: "derivedFrom",
      to: "Source", cardinality: "many-to-many",
      cascade: "deny",
      acyclic: true,
    },

    // NarrativeArc → Slide
    {
      from: "PitchDeck", field: "narrativeArc.phaseSequence[].slideIds",
      to: "Slide", cardinality: "many-to-many",
      cascade: "deny",
      doc: "Every slide must appear in exactly one phase.",
    },
  ],

  // Section C — Aggregates. Ownership hierarchy.
  // Used for cascade-default and approval boundaries.
  aggregates: [
    {
      root: "PitchDeck",
      parts: ["Audience", "Source", "DataPoint", "Claim", "AntiPattern", "Risk", "Competitor", "Slide"],
      doc: "PitchDeck is the singleton root; every other Entity exists in service of one PitchDeck.",
    },
  ],

  // Section D — Variants. Discriminated-union strategy overrides.
  // Without this, Slide.visual emits as a single payload-blob field.
  // With this, the bridge splits into 13 sibling primitives + a discriminant relation.
  variants: [
    {
      from: "Slide", field: "visual",
      discriminator: "kind",
      strategy: "variant-per-primitive",
      // Each variant gets a primitive named acme:Slide_<Kind>Visual.
    },
    {
      from: "PitchDeck", field: "asks", // (in some pitch-deck variants; here it's nested in Slide)
      // Skipped — not a top-level union in this schema.
    },
  ],

  // Section E — Lift overrides. Per-field nesting decisions when the
  // type-level signal is wrong.
  liftOverrides: {
    // PitchDeck.designSystem looks Entity-shaped (has fields, nested structs)
    // but is a singleton config; force inline.
    "PitchDeck.designSystem": "inline",
    "PitchDeck.meta": "inline",
    "PitchDeck.narrativeArc": "inline",
  },

  // Section F — Optional. Loss declarations matching USL-NG's signature.
  // Records what the FDPM projection cannot express end-to-end.
  declaredLoss: [
    {
      feature: "DataPoint.value",
      kind: "soundness-loss",
      reason: "z.union([z.string(), z.number()]) emits as payload-blob (json-union format). FDPM has no native scalar-union primitive kind. Validator (safeParse) enforces at write; CEL cannot query.",
    },
    {
      feature: "Source.lastVerifiedDate freshness",
      kind: "completeness-loss",
      reason: "PitchDeckSchema's superRefine emits a freshness warning based on staleAfterDays. FDPM cannot express time-windowed validation; the validator-only check survives, but the staleness logic does not become a CEL constraint.",
    },
  ],

  // Section G — FDPM-specific extensions. Outside the USL-NG-isomorphic core.
  fdpm: {
    profileId: "profile:acme-pitch-deck:0.1",
    pluginVersion: "0.1.0",
    hostCompatibility: ">=0.5.0 <0.6.0",
    pluginId: "acme.pitch-deck",
    vendor: "acme",
    capabilities: ["cap:profile", "cap:validator", "cap:renderer"],
    viewPageOverrides: {
      // Keep PitchDeck's view-page panel collapsed by default; show summary only.
      "acme:PitchDeck": { defaultExpansion: "collapsed" },
    },
  },
});
```

## Step 3 — what the worked example exposed

Things I learned by writing this that the markdown spec should
formalize:

### 1. The reference-path microsyntax is load-bearing

`field: "visual.kind=stat-tiles-plus-chart.tiles[].dataPointId"` is a
real path expression. It needs to support:
- Plain field access: `field`
- Array element traversal: `field[]`
- Variant selection on a discriminator: `field.kind=value`
- Composition of all three: `field.kind=value.subfield[].leaf`

This is a JSONPath subset. The spec should declare it formally.
Failing to do so would push authors to inline string parsing, which
fails on edge cases.

### 2. Identity is more than just `idField`

PitchDeck is a singleton with no id field. The sidecar declares
`identityKind: "singleton"`. Other valid kinds will likely include
`"natural-key"` (Entity has multi-field uniqueness, no surrogate id)
and `"opaque"` (host generates ULID at create time). The spec needs
an enum here.

### 3. Inverse direction must be declared, not inferred

`Slide.evidenceUsed` and `DataPoint.usedOnSlides` are the same edge.
The schema's superRefine enforces bidirectional consistency at write
time. The sidecar's `inverse: { on, field }` carries this. **Without
it, the bridge would emit two separate relations**, doubling the
storage and breaking consistency.

### 4. Cascade is per-edge, not per-aggregate

`Slide.evidenceUsed → DataPoint cascade=set-null` (deletion-tolerant)
vs `Slide.audienceReadings[].audienceId → Audience cascade=deny`
(deletion-blocking). Both Slides reference both targets, but the
semantics differ. The sidecar must support per-edge cascade.

### 5. `acyclic: true` is a relation-level invariant

Self-referential edges (`Source.derivedFrom → Source`,
`Claim.supportedByClaims → Claim`) need cycle detection. The schema
does not enforce this at the type level; the sidecar declares it
and FDPM (or the bridge's emitted CEL) enforces it.

### 6. The variant-per-primitive split needs inverse mapping

If `Slide.visual` splits into 13 primitives, each variant primitive
has a `slide_id` reference back to the parent Slide. The sidecar
implies this but doesn't say it. The spec needs to declare what the
auto-emitted parent-reference looks like (default name? cardinality?).

### 7. Lift overrides bind to nested paths

`"PitchDeck.designSystem": "inline"` is a path-keyed override. Same
microsyntax as `references[].field`. The spec should reuse the
microsyntax instead of having two grammars.

### 8. The sidecar IS most of the work

Writing this took ~15 minutes for a schema I'd already mapped out.
A first-time author with the schema in hand would take an hour or
more, especially on `Slide.visual`. The deal — schema unchanged,
sidecar carries semantics — is honest, but the sidecar is not
trivial.

### 9. References that traverse arrays need special CEL handling

Today the bridge emits `self.field_values.<f>` paths into CEL. For
references like `evidenceUsed`, the relation lives in the host's
relation graph, not in the primitive's CEL constraints — so the bridge
emits NO CEL constraint per reference. Instead the host enforces
foreign-key validity. Worth documenting explicitly so authors know not
to look for a CEL fragment per reference.

### 10. What stays in Zod, what moves to sidecar

The line: anything Zod can express **uniformly** stays in Zod.
Anything that requires *semantic context* (which other schema does
this id refer to? what cascade does this edge have?) moves to the
sidecar. The Zod schema becomes a faithful but semantically thin
shape spec; the sidecar becomes the semantics layer.

## Step 4 — what does NOT work cleanly

1. **`PitchDeck` containing an array of foreign keys to Slide.**
   The schema models `slides: SlideSchema[]` as a *containment* (Slides
   are children of PitchDeck, not top-level peers). The sidecar models
   them as separate Entities with PitchDeck owning them via the
   aggregate. Two views of the same data. The bridge needs to choose:
   does PitchDeck.slides become an `evidenceUsed`-style id-array
   reference, or does it disappear from PitchDeck and reappear via the
   aggregate's part-of relation?

   I think: **the sidecar's aggregate declaration replaces the
   schema's containment.** PitchDeck no longer carries a `slides`
   field at the FDPM primitive level; instead Slides are Entities with
   a `pitchDeckId` reference. The Zod schema's structure-as-tree
   becomes an FDPM graph-with-aggregate-roots. This is a real
   structural transformation, not a simple translation.

   **Caveat:** this means the bridge produces an FDPM model that does
   NOT round-trip back to the source Zod shape. That's a soundness
   loss worth declaring — the sidecar's `declaredLoss` section.
   The schema's tree is a projection of the FDPM graph; not the same.

2. **Variants with deep references** (`Slide.visual.tiles[].dataPointId`)
   require the bridge to either:
   - keep `Slide.visual` as a payload-blob and lose the references, OR
   - split via `variant-per-primitive` AND emit per-variant
     reference declarations.

   The latter is right. Each variant primitive carries its own
   relations. But the sidecar's `references[]` then duplicates entries
   per variant, which is verbose. A future iteration might allow
   variant-bound reference declarations directly inside the
   `variants[]` section.

3. **NarrativeArc.phaseSequence is a struct-of-arrays.** Each phase
   has a `slideIds: SlugId[]`. The sidecar declares
   `field: "narrativeArc.phaseSequence[].slideIds"`. But narrativeArc
   itself is inlined via `liftOverrides`. The bridge has to be careful
   that an inlined struct can still hold a reference path. (It can,
   but the spec must say so explicitly.)

## Step 5 — what's the right next move

Based on the above, I think the spec should be drafted in this order:

1. **The reference-path microsyntax** (Step 3.1, 3.7). Without this,
   nothing else has well-defined semantics.
2. **Identity kinds** (Step 3.2). Singleton, natural-key, opaque-id.
3. **The seven sections** (entities, references, aggregates,
   variants, liftOverrides, declaredLoss, fdpm). Each with
   field-level required/optional enumeration.
4. **The schema-shape transformation** (Step 4.1) — the explicit
   declaration that the bridge produces a graph that does NOT
   round-trip to the Zod tree. Document the soundness loss.
5. **USL-NG isomorphism mapping**. Each of (1)-(3) above gets a
   side-by-side with the corresponding USL-NG Core construct.
6. **The `defineDomain<T>` TypeScript signature** that gives all of
   this strong types and editor autocomplete.

I'd estimate the spec at ~10 pages once written, plus the
USL-NG mapping appendix.

Whether to ship a code prototype before or after the markdown spec is
a real choice. **I lean spec-first**, because the worked example
above already gave me enough confidence to commit the format. Code
without spec is harder for usl-ng-core's maintainers to validate
isomorphism against.

## Open questions for the operator

1. **Sidecar file extension.** Worked example uses `.ts`. Alternative:
   author writes `.ts`, bridge emits a generated `.json` for
   USL-NG ingestion. Two artefacts to keep in sync; might be worth
   it for tool independence.
2. **Path microsyntax — JSONPath subset, JMESPath subset, or
   custom?** I sketched a custom one. JSONPath is the more standard
   choice but its `.kind=value` syntax is uglier
   (`?(@.kind == "value")`). Pick one and commit.
3. **Aggregate semantics.** The worked example treats PitchDeck as a
   single aggregate root containing all other Entities. Is this
   FDPM-mandated, or should the sidecar support multiple aggregates
   per plugin? USL-NG allows multiple roots; FDPM has no opinion
   yet. Pick one.
4. **Acyclic enforcement layer.** Schema's superRefine does it today;
   FDPM-side via CEL `graph.acyclic` is possible (helper exists per
   `fn.std.ts`); sidecar declaration is the trigger. Three layers,
   one canonical answer.
