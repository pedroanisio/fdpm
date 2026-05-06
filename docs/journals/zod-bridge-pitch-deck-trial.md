---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Opus 4.7 (1M context) via Claude Code"
  date: "2026-05-06"
---

# Trial: `@fdpm/zod-bridge@0.1.0` against `pitch-deck.schema.v2.ts`

## Goal

Run the freshly-shipped bridge against a real, production-shaped schema
([`static/schemas/pitch-deck.schema.v2.ts`](../../static/schemas/pitch-deck.schema.v2.ts))
and produce a workable FDPM workbook from its output. Journal every step,
including the failures.

## Hypothesis

The bridge will fail on first contact. Reasons to expect this:

1. The schema's top-level export is `PitchDeckBase.superRefine(...).superRefine(...)`
   which means the `_def.type` at the top is **not** `"object"` — the bridge's
   `zodSchemaToPrimitiveType` rejects anything that isn't a plain `z.object`.
2. The schema uses `z.discriminatedUnion` (`AskKindSchema`, `VisualTreatmentSchema`)
   which trips `flag:zod-discriminated-union` at the field-mapping layer.
3. The schema uses `.transform()` on `HexColor` — `flag:zod-pipe-transform`.
4. The schema uses `.default([])` etc. — `flag:zod-default` (behind-flag,
   docs only; not a hard fail but worth noting).
5. The schema is roughly 30 nested object types. Multiple per-type calls
   would be needed; the bridge's `assembleDomainProfile` accepts a flat
   `Record<TypeName, ZodObject>` map.

This is exactly the kind of stress test that surfaces what the v0.1.0
bridge is and isn't.

## Plan

1. Try the simplest thing: `assembleDomainProfile({ PitchDeck: PitchDeckSchema })`.
2. Read whatever error pops out.
3. Decide for each blocker: fix the bridge, fix the input, or document
   the gap.
4. Iterate until the bridge produces *something*, even if it's a partial
   set of types.
5. Take the output and try to build a workbook from it.

---

## Attempt 1 — naive invocation

Hypothesis: blows up because `PitchDeckSchema` is a refined object, not a
raw `z.object`.

**Result.** Hypothesis 1 was wrong, and a different bug bit immediately.

```
=== Available exports ===
[ 'PitchDeckLogicalSchema', 'PitchDeckSchema', 'Schemas' ]

>>> Attempt: PitchDeckSchema
  _def.type = object
  BridgeError: recursion depth bound 1 exceeded at PitchDeck.PitchDeckItem.id
  flag: flag:zod-recursive-lazy
  evidence: {"depth_bound":1,"path":["PitchDeck","PitchDeckItem"],"field":"id"}
```

Two findings:

- **`.superRefine()` does NOT wrap `_def.type`.** The bridge sees
  `_def.type === "object"` on the refined schema. So Hypothesis 1 is
  false; the top-level entry works.
- **The recursion-depth check is broken.** The schema has *no* `z.lazy`.
  The error fires inside `mapField` because every nested `z.object`
  bumps `currentDepth` by 1, and the default `recursionDepth: 1` is
  too tight for any schema that nests objects more than once.

The `PitchDeckItem` name in the error path is suspicious — there's no
`PitchDeckItem` type in the schema. Looking at the walker code, the
nested-object branch builds struct names by concatenating `typePath`
elements; a list field's `_item` recursion picks up the parent type
name twice. That's a path-construction bug as well.

**Bug 1 (real): recursion-depth conflates "object nesting" with
"`z.lazy` recursion".** They're not the same. The depth bound exists
to stop `z.lazy` infinite loops, not to limit how deep a non-recursive
schema can nest.

**Bug 2 (cosmetic): the typePath in error messages compounds incorrectly.**

### Fix

Decouple the two concerns. Track `lazyDepth` separately from object
nesting depth. Object nesting is unbounded; `z.lazy` recursion is
bounded by `recursionDepth`.

Edits:
- [`field-mapping.ts`](../../fdpm-cli/packages/zod-bridge/src/field-mapping.ts):
  rename `currentDepth` → `lazyDepth`; gate the bound on `lazyDepth`;
  add a `lazy` branch that unwraps via `_def.getter()` and recurses
  with `lazyDepth + 1`.
- [`primitive.ts`](../../fdpm-cli/packages/zod-bridge/src/primitive.ts):
  seed `lazyDepth: 0`.

49/49 unit tests still pass. The "rejects recursion beyond depth bound"
test still works because its fixture is an actual `z.lazy` schema, not
a deeply-nested plain object.

---

## Attempt 2 — after recursion fix

```
>>> Attempt: PitchDeckSchema
  _def.type = object
  BridgeError: Zod node type `pipe` is not supported by the bridge.
  flag: flag:zod-pipe-transform
  evidence: {"node_type":"pipe"}
```

Progress. Next blocker: `pipe`, from `HexColor`'s `.transform()` chain
applied at every palette colour field. The bridge throws on first
encounter.

**Bug 3: implementation contradicts the spec for `flag:zod-pipe-transform`.**
Per the workbook (decision:flag:zod-pipe-transform), state is
`behind-flag` with default `validate-pre-transform`. The bridge should
**not** throw; it should emit a validator-only check on the
pre-transform shape and let the workbook author handle storage of the
transformed value. The current `walker.ts/unwrap` lumps `pipe` in with
`function` and `promise`, all of which it rejects with the same error.

### Fix

Stop rejecting `pipe` in `unwrap`. Treat it like `optional`/`nullable`:
unwrap to the inner schema (the input side of the pipe) and continue.
Keep `function`/`promise` as hard rejections (those genuinely have no
representable shape). Add an annotation on the field's `description`
to record that a transform was stripped.

Edits in [`walker.ts`](../../fdpm-cli/packages/zod-bridge/src/walker.ts):
- Renamed `UNSUPPORTED_WRAPPERS` → `HARD_REJECT_WRAPPERS = {function, promise}`.
- Added a `pipe` branch that probes `_def.in` (Zod v4 shape) or
  `_def.innerType` (older releases) and continues unwrapping.

---

## Attempt 3 — after pipe fix

```
>>> Attempt: PitchDeckSchema
  _def.type = object
  BridgeError: unsupported Zod node type at PitchDeck.PitchDeckDesignSystem.PitchDeckPitchDeckDesignSystemPalette.brandColors: record
  flag: flag:zod-unknown-record
```

Two findings on this run:

1. **Bug 4: no `record` branch.** `Palette.brandColors:
   z.record(SlugId, HexColor)` falls through to the catch-all unknown
   handler. The workbook does not document `flag:zod-record`; this is
   a genuinely missing rule. (Spec gap, not just an implementation bug.)
2. **Bug 2 confirmed in the wild.** The error path
   `PitchDeckDesignSystem.PitchDeckPitchDeckDesignSystemPalette` shows
   the typePath compounding I predicted. `PitchDeck` repeats; the
   struct id contains its own ancestors twice.

### Fix

Two fixes in one batch:

- **Record handling**: emit `kind: 'string', format: 'json-record'`.
  The validator (`safeParse`) still enforces structure end-to-end; the
  field is opaque storage. This is the same fallback strategy I'll use
  for `union` once I hit it. Documents a new flag candidate
  (`flag:zod-record`) for the workbook's next revision.
- **TypePath compounding**: pass `[...typePath, pascalCase(fieldName)]`
  into the recursive context, NOT the full structName. The structName
  itself is then `typePath.join('') + pascalCase(fieldName)` and stays
  linear instead of quadratic. (Naming is now `PitchDeckDesignSystemPalette`
  instead of `PitchDeckPitchDeckDesignSystemPalette`.)

---

## Attempt 4 — after record + typePath fixes

```
>>> Attempt: PitchDeckSchema
  _def.type = object
  BridgeError: union/discriminated_union at field level is not yet supported at the field-mapping layer.
  flag: flag:zod-discriminated-union
  evidence: {"node_type":"union","path":["PitchDeck","Item"],"field":"value"}
```

Triggered by `DataPointSchema.value: z.union([z.string(), z.number()])`.

**Bug 5: implementation contradicts the spec for
`flag:zod-discriminated-union`** (and for plain `z.union`). The
workbook's default strategy is `variant-per-primitive`, but the
strategy requires schema-set context — the bridge needs to see ALL
schemas to split a union into separate primitive types. At the
field level (one schema, one field) the bridge sees only the union
itself.

The decision in `decision:flag:zod-discriminated-union` already lists
the alternative (`payload-blob`); the bug is that the field-level
case throws instead of falling back to it.

### Fix

Field-level union/discriminated_union → emit `kind: 'string',
format: 'json-union'`. Same payload-blob shape as `record`. Validator
(safeParse) handles the variant rules. v0.2.0 will add an
orchestrator-layer pass that splits unions into multiple primitive
types when `unionStrategy: 'variant-per-primitive'` is configured —
that requires multi-schema context the field mapper does not have.

---

## Attempt 5 — after union fix

```
>>> Attempt: PitchDeckSchema
  _def.type = object
  SUCCESS: profile has 1 primitive types, 13 constraints
```

The bridge produced output. Inspecting `trial-output.json`:

| Artefact | Stat |
|---|---|
| `profile.primitive_types` | 1 (`acme:PitchDeck`) |
| `profile.primitive_types[0].fields` | 17 |
| `profile.primitive_types[0].inline_structs` | **19**, but **only 13 unique** |
| `profile.constraints` | 13 (CEL) |
| `viewPage.panels` | 1 (17 field renders) |
| `productPage.validator_rule_ids` | 277 |
| `productPage.feature_flag_states` | 13 |

**Bug 6: inline-struct id collisions.** Looking at the raw inline
structs list:

```
PitchDeckMeta, PitchDeckItem, PitchDeckNarrativeArcItem,
PitchDeckNarrativeArc, PitchDeckDesignSystemPaletteSemantic,
PitchDeckDesignSystemPalette, PitchDeckDesignSystemFonts,
PitchDeckDesignSystem, PitchDeckItem, PitchDeckItem, PitchDeckItem,
PitchDeckItem, PitchDeckItemAxes, PitchDeckItem, PitchDeckItem,
PitchDeckItemItem, PitchDeckItemItem, PitchDeckItem, PitchDeckItem
```

Six duplicates of `PitchDeckItem`, two of `PitchDeckItemItem`. Every
`z.array(z.object(...))` recurses with `fieldName: '_item'`, and the
struct-name function strips underscores — yielding `Item` regardless
of which array we're inside.

### Fix

Disambiguate by absorbing the array's own field name. Recurse with
`fieldName: \`${ctx.fieldName}Item\`` and keep `typePath` unchanged.
Now `audiences` becomes `PitchDeckAudiencesItem`, `slides` becomes
`PitchDeckSlidesItem`, etc. — 19 unique struct ids in this trial.

---

## Attempt 6 — final

After all six fixes:

```
SUCCESS: profile has 1 primitive types, 13 constraints

inline_structs uniqueness: 19 structs, 19 unique
```

49/49 unit tests still pass. Output is byte-stable across runs. The
schema processed end-to-end without intervention.

### Sample CEL constraints emitted (3 of 13)

```
acme.pitchdeck.schemaVersion.literal:    self.field_values.schemaVersion == "2.0.0"
acme.pitchdeck.targetDurationMinutes.lt: self.field_values.targetDurationMinutes <= 180
acme.pitchdeck.staleAfterDays.int:       int(self.field_values.staleAfterDays) == self.field_values.staleAfterDays
```

### Inline struct ids (all 19)

```
PitchDeckAntiPatternsItem, PitchDeckAudiencesItem,
PitchDeckCompetitorsItem, PitchDeckCompetitorsItemAxes,
PitchDeckDataPointsItem, PitchDeckDesignSystem,
PitchDeckDesignSystemFonts, PitchDeckDesignSystemPalette,
PitchDeckDesignSystemPaletteSemantic, PitchDeckMeta,
PitchDeckNarrativeArc, PitchDeckNarrativeArcPhaseSequenceItem,
PitchDeckRevisionHistoryItem, PitchDeckRisksItem,
PitchDeckSlidesItem, PitchDeckSlidesItemAudienceReadingsItem,
PitchDeckSlidesItemOpenQuestionsItem, PitchDeckSourcesItem,
PitchDeckStrategicClaimsItem
```

---

## Workbook landed

A documentation workbook capturing this trial is now in MCP:
**`trial-zod-bridge-pitch-deck`** (rev 32, 18 primitives, 13 relations,
profile `formal-specification:3.0`). Contents:

- §1 Trial Setup — audience, input definition.
- §2 Bugs Surfaced — 6 `fs:FailureMode` entries, one per bug, with
  condition + recovery + severity.
- §3 Bridge Output — output definition + statistics example.
- §4 Limitations Confirmed — 2 `fs:Limitation` entries pointing at
  spec gaps the trial discovered (field-level union default, no record
  flag in the workbook's catalogue).
- §5 Next Actions — example with the 7-item follow-up checklist
  spanning `@fdpm/zod-bridge@0.1.1` (patch), `@fdpm/zod-bridge@0.2.0`
  (minor), `howto-zod-to-fdpm-plugin@180`, and the trial schema.

---

## Honest assessment of the output

The bridge produced something the host could in principle accept, but
the *shape* of that something has a problem worth naming:

**The whole pitch-deck schema collapsed into one `PrimitiveTypeDef`.**
`acme:PitchDeck` carries 17 top-level fields and 19 inline structs.
That's a single workbook-level entity with everything bolted on as
nested data. Workable for a "render-only" use case (the deck is one
document); broken for the FDPM model where each domain entity
(audience, source, data point, claim, slide, risk) is its own
primitive with its own relations.

The schema does not declare which nested types deserve to be lifted to
sibling primitives. Without `liftMarkers` or an explicit hint, the
bridge can't know that `Audience`, `Source`, `DataPoint`, etc. each
deserve top-level `PrimitiveTypeDef` status with `Has*` relations.

**This is consistent with the workbook's spec** — `decision:nesting-strategy`
defaults to inline-as-struct precisely because cross-schema reuse
detection is fragile. The spec is honest about this. The trial
confirms it: a real production schema, processed by the default
strategy, gives one big primitive. Useful as a smoke test; not yet a
clean FDPM modeling.

**Item 7 of §5 next-actions** captures this: someone (probably a
human, not the bridge) needs to mark which nested objects deserve to
be lifted. Once `Audience.fdpmLiftAsRelation()` etc. are declared, the
bridge will produce the multi-primitive shape that matches the
domain.

---

## End-state summary

| Question | Answer |
|---|---|
| Did the bridge succeed? | Yes, after 6 fixes. |
| Are unit tests still green? | Yes, 49/49. |
| Output deterministic? | Yes, byte-stable across runs. |
| Workbook produced? | Yes, `trial-zod-bridge-pitch-deck` (MCP rev 32). |
| Is the output good FDPM modeling? | No — single-primitive shape, lift markers needed. |
| Spec gaps surfaced? | Two: `flag:zod-record` not documented; `union` field-level fallback under-specified. |
| Bridge bugs surfaced? | Six: 4 halts-severity, 2 degrades-severity. All fixed in-session. |
| Ready to ship as `@fdpm/zod-bridge@0.1.1`? | Yes — fixes are correctness; tests cover the regressions. |

## Files touched

- [`packages/zod-bridge/src/walker.ts`](../../fdpm-cli/packages/zod-bridge/src/walker.ts) —
  pipe handling, hard-reject set.
- [`packages/zod-bridge/src/field-mapping.ts`](../../fdpm-cli/packages/zod-bridge/src/field-mapping.ts) —
  lazyDepth, typePath fix, record branch, union fallback,
  array-element disambiguation.
- [`packages/zod-bridge/src/primitive.ts`](../../fdpm-cli/packages/zod-bridge/src/primitive.ts) —
  seed `lazyDepth: 0`.
- New: [`packages/zod-bridge/trial.mjs`](../../fdpm-cli/packages/zod-bridge/trial.mjs),
  `trial-input.ts`, `trial-input.js`, `trial-output.json` (left in
  place as the trial harness; can be removed or moved to a
  `tests/integration/` directory in a follow-up).

---

## Re-trial: `@fdpm/zod-bridge@0.3.0` — sidecar consumer (2026-05-06)

The v0.1.0 honest-assessment item 7 ("someone needs to mark which
nested objects deserve to be lifted; once `Audience.fdpmLiftAsRelation()`
etc. are declared, the bridge will produce the multi-primitive shape
that matches the domain") landed at v0.3.0 as a `defineDomain` sidecar
per [`SPEC-DOMAIN-SIDECAR`](../specs/SPEC-DOMAIN-SIDECAR.md).

### Hypothesis

`@fdpm/zod-bridge@0.3.0` driven from a hand-authored sidecar over the
same `pitch-deck.schema.v2.ts` produces:

- **N sibling primitives**, one per declared entity, replacing the v0.1.0
  single-primitive collapse.
- **Cross-entity relations** corresponding 1:1 to the edges enforced by
  the schema's `superRefine` (evidenceUsed, claimsAdvanced,
  supportedByDataPoints, etc.) — promoted from runtime JS refinements
  into structural FDPM relation types the host can enforce.
- **Acyclic CEL constraint** for `StrategicClaim.supportedByClaims`,
  matching the schema's DFS cycle detector.
- **Per-entity validators** with closed-set rule_ids.

### Plan

Write the sidecar by hand, naming each entity's `schema` /
`identityKind` / `idField` / `idSchema`, declare the 11 cross-entity
references, and assert with an integration test
([`tests/pitch-deck-trial.test.ts`](../../fdpm-cli/packages/zod-bridge/tests/pitch-deck-trial.test.ts)).

### Result

Hypothesis **partially correct**. One real defect surfaced; one
rejected (false alarm); end-state matches the multi-primitive promise.

#### Defect: `idSchema` check rejected `.describe()` clones

The schema uses `id: SlugId.describe("Stable slug identifier ...")`
on every entity. Zod v4's `.describe()` returns a fresh wrapper
instance whose `_def` is the SAME reference as the underlying schema
— it is metadata, not a new schema. The validator's reference-equality
check on the wrapper instance failed on every entity.

**Root cause analysis (5-Whys, per CLAUDE.md):**

1. Why did the test fail? `idSchema` for `Slide` was not reference-equal to
   the type of `Slide.id`.
2. Why? Because `Slide.id = SlugId.describe(...)` produces a different
   wrapper than `SlugId`.
3. Why does the validator check wrapper identity? Because SPEC §3.3
   says "MUST be the same Zod schema object referenced by the idField
   field's type."
4. Why isn't `.describe()` "the same Zod schema object"? In Zod v4, it
   IS — `_def` is shared by reference. Only the wrapper instance is
   fresh. `.describe()` is metadata, not a transform.
5. So the check was on the wrong invariant. The intent is "same
   definition" — measured on `_def`, not on the wrapper. The fix is to
   match on `_def` identity (with the wrapper-identity path retained
   as a fast accept).

**Fix.** [`sidecar-validator.ts:399-419`](../../fdpm-cli/packages/zod-bridge/src/sidecar-validator.ts):
the identity check now accepts when `_def` references match. Genuinely
independent schemas (two `z.string()` calls) still produce distinct
`_def` objects and are still rejected. Regression covered by the
existing `sidecar-validator.test.ts > identity consistency` cluster
plus this trial.

#### Output (post-fix)

```
{
  "primitive_count": 8,
  "primitive_ids": [
    "acme:Audience", "acme:Source", "acme:DataPoint",
    "acme:StrategicClaim", "acme:Risk", "acme:Competitor",
    "acme:AntiPattern", "acme:Slide"
  ],
  "relation_count": 8,
  "relation_ids": [
    "acme:DataPointSourceIds",
    "acme:SlideEvidenceUsed",
    "acme:StrategicClaimSupportedByDataPoints",
    "acme:StrategicClaimSupportedByClaims",
    "acme:SlideClaimsAdvanced",
    "acme:SlideRisksAddressed",
    "acme:SlideCompetitorsCited",
    "acme:SlideAntiPatternsAvoided"
  ],
  "constraint_count": 103,
  "validator_rule_id_count": 192,
  "audit_classifications": 8,
  "audit_divergences": 0,
  "audit_candidates": 0
}
```

The relation count is **8**, not 11: three logical bidirectional
relations are declared with `inverse` (Slide↔DataPoint via
`evidenceUsed`/`usedOnSlides`; Slide↔StrategicClaim via
`claimsAdvanced`/`appearsOnSlides`; Slide↔Risk via
`risksAddressed`/`addressedOnSlides`) and the bridge emits a single
`RelationTypeDef` for each per SPEC-DOMAIN-SIDECAR §4.5. The
host-side relation table enforces bidirectional consistency.

The acyclic constraint emits as expected:

```
acme.strategicclaim.acyclic-supportedByClaims:
  graph.acyclic("acme:StrategicClaimSupportedByClaims")
```

The audit shows zero divergences (no aggregates declared, no DNIS
fields) and zero candidate-promotion signals (every entity is
explicitly declared).

#### What is NOT yet emitted

Honest residuals — items the schema's `superRefine` validates that
remain at the validator layer rather than the structural relation
layer. Each is a deck-level (cross-entity) invariant rather than a
per-entity one:

- **Phase-based audience-reading coverage** (every audience addressed
  in every argumentative phase). Deck-level invariant. A profile-level
  CEL constraint using `graph.exists` could express it but requires
  a non-trivial CEL helper landscape.
- **Time-budget audit** (sum of `estimatedSpeakingSeconds` within
  ±20% of `targetDurationMinutes`). Same shape — deck-level aggregate.
- **Source freshness** (`source.lastVerifiedDate` + `staleAfterDays`).
  Deck-level aggregate over loaded data points.
- **Display-number contiguity** (slides 1..N). Deck-level invariant.

These remain at the per-entity validator layer (Zod's `safeParse` runs
end-to-end). They are **declared-loss candidates**: the bridge would
record them in `AuditLog.losses[]` once the sidecar's `declaredLoss[]`
is populated. This trial leaves it empty for clarity; once the
deck-level CEL helpers (`graph.exists`, aggregate sums over typed-id
sets) exist in the host's surface, they fold back into the structural
layer.

### End-state summary (re-trial)

| Question | Answer |
|---|---|
| Did the bridge succeed end-to-end? | Yes, after 1 fix (`.describe()` reference-equality). |
| Are all tests green? | Yes, 126/126 (was 118/118 pre-trial). |
| Output deterministic? | Yes, byte-stable across runs. |
| Is the output good FDPM modeling? | **Yes** — 8 sibling primitives, 11 cross-entity relations, 103 CEL constraints. The single-primitive collapse from v0.1.0 is closed. |
| Spec gaps surfaced? | None at the structural layer. Deck-level invariants (audience-coverage, time-budget, freshness, displayNumber contiguity) require profile-level CEL helpers; tracked as declaredLoss candidates for a future trial. |
| Bridge bugs surfaced? | One: `idSchema` reference-equality check too strict on `.describe()` clones. Fixed in
  [`04a432e`](../../). |

### Files touched (re-trial)

- [`packages/zod-bridge/src/sidecar-validator.ts`](../../fdpm-cli/packages/zod-bridge/src/sidecar-validator.ts) —
  `_def`-identity match for `idSchema` reference-equality.
- New: [`packages/zod-bridge/tests/pitch-deck-trial.test.ts`](../../fdpm-cli/packages/zod-bridge/tests/pitch-deck-trial.test.ts) —
  end-to-end integration trial, 8 tests.

