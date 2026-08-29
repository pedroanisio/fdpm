---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Opus 5 (1M context) via Claude Code"
  date: "2026-08-29"
---

# fdpm.style — Visual Style Definition 3.1.0

## Disclaimer

This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](../../../DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.

A style registry as a typed, event-sourced FDPM workbook: fifteen entities
as primitives, ten typed edges, one Zod validator per entity, a
cross-entity invariant set the per-primitive pipeline cannot express, and a
renderer that reassembles the graph into the document the source schema
describes.

| | |
|---|---|
| Profile | `profile:style:3.1` |
| Derived from | [`schemas/style.ts`](./schemas/style.ts), a normalisation of `_ingest_bin/style-schema.ts` v3.1.0 (3717 lines of type-level TypeScript) |
| Entities | Style, Movement, LineGrammar, ColorGrammar, FormGrammar, SpatialGrammar, SurfaceGrammar, TypographyGrammar, CompositionGrammar, ContrastGrammar, IconographyGrammar, MotionGrammar, Rule, ComplianceCheck, CanonicalReference |
| Relations | `style:HasGrammar`, `style:DeclaresRule`, `style:DeclaresCheck`, `style:TestsRule`, `style:CitesExemplar`, `style:HasReference`, `style:BelongsToMovement`, `style:NegatesMovement`, `style:InfluencesStyle`, `style:ParentMovement` |
| Renderers | Four document views — `text/markdown`, `text/html`, `image/svg+xml`, `image/png` (see [Four views](#four-views-of-one-registry)) |

Root [README.md](../../README.md).

## A workbook is one StyleRegistry

The source schema defines `StyleRegistry` as *the closed world for
cross-document resolution*: every `StyleId` and `MovementId` referenced by
any contained style must name an entry in the registry, and external
references are not permitted. That is exactly what an FDPM workbook is, so
the mapping is one registry per workbook, many styles inside it.

The consequence is the point of the whole exercise. In the source, closed-
world resolution is a function you have to remember to call
(`validateStyleRegistry`). Here, every cross-reference is a relation, and
the host's §7 pipeline rejects a relation whose endpoint does not exist
(`src/core/validation/pipeline.ts:682-690`). The registry's closed world
became an invariant of every write.

## What the transcription had to change, and why

The source is **type-level** TypeScript — 36 `interface`s, 83 `type`
aliases, 30 smart constructors — and `@fdpm/zod-bridge` walks **runtime**
Zod nodes. Types are erased before the bridge ever runs, so this is a
transcription, not a copy. Five transformations, each forced by a checkable
rule, each declared in [`sidecar.ts`](./sidecar.ts) `declaredLoss` and
emitted into `generated/audit.json`:

| # | Transformation | Forced by |
|---|---|---|
| 1 | Branded types and smart constructors → Zod schemas carrying the same regexes and bounds | Brands are compile-time only — the source says so itself (PIPELINE NOTE, `style-schema.ts:96-107`) |
| 2 | camelCase → snake_case on every field | `FieldDef.name` must match `^[a-z][a-z0-9_]*$` (`src/core/models/meta.ts`) |
| 3 | 47 discriminated unions flattened onto their `kind` discriminant | A field-level union becomes an opaque `format: "json-union"` string (`packages/zod-bridge/src/field-mapping.ts:66-77`) |
| 4 | `Record` / `Partial<Record>` → key-bearing entry lists | `z.record` becomes an opaque `format: "json-record"` string (`field-mapping.ts:187-192`) |
| 5 | Cross-references → relations | `ReferenceSpec` emits a single `target_type_id`; `style:HasGrammar` needs ten |

Transformations 3 and 4 exist for one measurable reason, and the test suite
holds them to it: **the emitted profile contains zero `json-union` and zero
`json-record` fields.** Every one of the fifteen primitive types stores
typed, queryable values — `string`, `number`, `boolean`, `enum`, `list`,
`struct`, and nothing else.

### The cost of flattening

Flattening a union widens the *storage* type. The emitted `FieldDef`s for
`LineGrammar` alone would accept `kind: "no-lines"` carrying a
`stroke_weight`. That is a real soundness loss and it is declared as one.
What closes it is the entity's `superRefine`, which the host runs on every
write via `safeParse` (`packages/zod-bridge/src/validator.ts:21`): the
selected arm's fields are required and every other arm's fields are
rejected. Nothing invalid is stored. A consumer reading the profile's
`FieldDef`s *without* running the validator sees a wider type than the
source declares — that is the whole of the loss, and it is why the
declaration exists.

Every entity schema is a `z.strictObject`, so an unknown field is a
rejection rather than a silent strip. This matters more than it looks: the
host's own policy for an undeclared field is a **warning**
(`core:field:undeclared` — "tolerated but not validated"), so without
strict schemas a smuggled field would be stored unvalidated.

## Where the 991 lines of invariants went

The source implements its cross-field checks in `validateStyleDefinition()`
and `validateStyleRegistry()` over one whole object graph. Here the graph is
fifteen primitive types, and a `ValidatorFn` receives **one** instance plus
the relations — never the sibling primitives (`src/plugin/types.ts`,
`ValidatorContext`). So the invariants split by scope:

- **Confined to one entity** → that entity's `superRefine` in
  `schemas/style.ts`. Runs on every host write. Period ordering, provenance
  ordering, weight-range overflow, the diagonal-angle band, palette and
  role dedup, the prompt code-point cap, the token-section arm discipline,
  the subgenre-breakdown coherence, the SC 1.4.11 version gate.
- **Spanning entities** → [`invariants.ts`](./invariants.ts). Rule/check
  weight alignment, defining-rule exemplar coverage, non-advisory check
  coverage, rule-id namespace and P-form agreement, grammar↔token kind
  agreement, the stroke-weight derivation, the WCAG contrast arithmetic,
  forbidden-colour prohibition linkage, exemplar resolution, grammar-section
  completeness, the movement forest, and self-influence.

**This is the plugin's one real gap, and it is deliberate.**
`buildStyleWorkbook` runs the cross-entity set before it writes anything,
so an ingested workbook is invariant-clean by construction. A workbook
assembled by *direct primitive writes* is field-valid but not
invariant-checked until `validateStyleWorkbook()` is run against it. There
is no host hook for a whole-workbook validator to close this
automatically; it is declared under `style.cross-entity-invariants`.

## Ingest — the verification boundary

```ts
import { buildStyleWorkbook } from "./plugins/style/index.js";

const report = await buildStyleWorkbook(host, registryJson, {
  workbookId: "styles",
});
```

ARCHITECTURAL REQUIREMENT: LLMs will always produce some form of error.
Absence of output verification is a design defect, not a runtime bug.
All LLM output must be treated as untrusted and validated explicitly.

`registryJson` is untrusted no matter who produced it. The five controls,
each checkable in review:

1. **Typed parse.** `StyleRegistryInput` is strict at every level; an
   unknown key is a rejection.
2. **Semantic validation.** Id uniqueness and referential validity of every
   `parentMovement`, `negatedMovements`, `influencedStyles`, `exemplars` and
   `testsRule` pointer — then the whole projection through
   `validateStyleWorkbook`.
3. **Defined failure path.** A `verification` `FDPMException` naming every
   offending path. No coercion, no defaulting, no `catch {}`. Nothing is
   written.
4. **Failure-path tests.** `tests/plugins/style/invariants.test.ts` feeds
   malformed, incomplete and adversarial registries and asserts the
   rejection, by rule id.
5. **Deterministic bounds.** No loop's termination depends on input
   content; the movement walk carries its own visited set.

## Four views of one registry

A style specification is not prose about colours; a table saying `#D2232A`
asks the reader to imagine the thing the document is *for*. Four
renderers are registered, and the three added beyond the outline exist so
that the measurable parts of a style are rendered as what they mean.

| Target | Renderer id | What it is |
|---|---|---|
| `text/markdown` | `style:StyleOutlineRenderer` | The registry as the source schema reads — the reviewable document, and the profile's default. |
| `text/html` | `style:StyleHtmlRenderer` | The specification page. Palette and forbidden colours painted as chips, colour tokens as a copyable `:root {}` block, every WCAG pair with its **measured** ratio, the required minimum and a pass/fail verdict. |
| `image/svg+xml` | `style:StyleSpecimenRenderer` | One specimen plate per style: palette, contrast pairs drawn as the two colours actually combine, a stroke specimen at the declared weight, the rule census as a proportional bar, ten grammar badges. |
| `image/png` | `style:PaletteSheetRenderer` | The palette as pixels — a chip sheet for a picker, an eyedropper or a diff against last release. Palette, forbidden colours, colour tokens; nothing else. |

```bash
fdpm render <workbook> text/html      --renderer-id style:StyleHtmlRenderer     -o style.html
fdpm render <workbook> image/svg+xml  --renderer-id style:StyleSpecimenRenderer -o style.svg
fdpm render <workbook> image/png      --renderer-id style:PaletteSheetRenderer  -o style.png
```

Binary targets require `-o`; the CLI refuses to stream them to a terminal.

Four properties hold across the three, and the suite asserts each:

1. **One walk.** All three read the graph through
   [`renderers/_model.ts`](./renderers/_model.ts), which resolves what the
   graph only points at — a rule's exemplars become titles, a contrast
   pair's token names become hexes with a ratio and a verdict. Four
   independent walks is how four views drift into disagreeing about one
   registry.
2. **Self-contained.** The HTML carries no script, no stylesheet link, no
   `@import` and no absolute URL; the SVG names only generic font
   families. A specification gets mailed around and opened offline, and a
   specimen that changes shape between viewers is not a specimen.
3. **Escaped.** Every author-supplied string — a rule statement, an axiom,
   a reference title — passes through the format's escape. Values reaching
   a CSS context are additionally matched against the hex or ident grammar,
   because escaping protects the HTML parser and not the CSS one.
4. **Deterministic.** Nothing reads a clock, a locale or the environment.
   Two renders of one workbook are byte-equal, so the output can be
   committed and diffed.

The PNG is encoded in-repo ([`src/core/render/png.ts`](../../src/core/render/png.ts)):
8-bit truecolour, filter type 0, `node:zlib` for the deflate, a 5×7
bitmap face for the labels. No image dependency was added, because the
only raster this plugin produces is flat rectangles and monospaced text —
a rasteriser earns its place when it has to resolve fonts, curves and
blending, and none of that appears here. Correctness is not "a viewer
opened it": the suite parses the chunk stream, verifies every CRC against
an independent implementation, inflates IDAT and reads the palette's
colours back out of the pixels.

## Layout

```
plugins/style/
├── schemas/style.ts          # the Zod transcription — the single source of truth
├── sidecar.ts                # entities, ten relation types, declared losses
├── invariants.ts             # the cross-entity invariant set
├── ingest.ts                 # StyleRegistry JSON → validated workbook
├── renderers/
│   ├── _model.ts             # the graph → RegistryView walk, shared by all views
│   ├── style_outline.ts      # text/markdown
│   ├── style_html.ts         # text/html
│   ├── style_specimen.ts     # image/svg+xml
│   └── style_palette.ts      # image/png
├── index.ts                  # activate(): profile + 15 validators + 19 renderers
├── scripts/run-bridge.ts     # regenerates everything below
├── generated/                # profile.json, audit.json, … (bridge-owned)
├── capabilities/             # per-entity renderer descriptors (bridge-owned)
└── fdpm-plugin.json          # manifest (bridge-owned)
```

`schemas/style.ts`, `sidecar.ts`, `invariants.ts`, `ingest.ts`,
`renderers/` and `index.ts` are hand-authored. Everything else is
regenerated by `npm run bridge` and gated by `npm run bridge -- --check`,
which fails on any drift. The four `cap:renderer` entries in the manifest
are declared in `scripts/run-bridge.ts` and must match what `index.ts`
registers — the manifest is what a host reads to decide a profile can
render at all, and the drift test asserts the two agree.

```bash
npm run bridge -- --check          # drift gate
npx vitest run tests/plugins/style # the suite
```

## Known limits

- The bridge enumerates a closed `rule_id` set by walking the schema,
  emitting one `custom` id per refinement *attachment point*. Every
  `superRefine` here attaches at the entity root but raises issues at nested
  field paths, so emitted ids are more specific than the enumerated set.
  Nothing in the host checks findings against that set — it is audit
  metadata — so this costs discoverability, not correctness.
- The fifteen per-entity markdown renderers are generated by
  `zodSchemaToMarkdownRenderer`. They used to stringify array elements with
  `String()`, so a list-of-struct field — `palette`, `typefaces`,
  `tokens_colors` — rendered as `[object Object]`; the note that stood here
  said the day the bridge fixed it, this text would come out. It was fixed
  on 2026-08-29: a struct now renders as inline key/value pairs, unset
  fields are omitted, and each entity is headed by its own name rather than
  its type and ULID. The four hand-written views above are the renderers to
  reach for when you want the registry as one document; the generated ones
  are per-entity detail.
- The PNG face covers uppercase, digits and `# - . : / ( )`. A label is
  upper-cased before it is drawn and an unmapped character advances
  without painting, so a non-Latin token name renders as a gap. The HTML
  and SVG views carry the full text; the raster sheet is a colour
  artefact, and a substituted glyph in a hex code would be worse than a
  space.
- `RenderedStyle` and `CssArtifacts` are not modelled. The source keeps
  them out of `StyleDefinition` behind a `sha256-jcs` content hash because
  they are a renderer's output rather than stored truth; the same reasoning
  keeps them out of the profile.
- The source's `../shared/primitives` module was never ingested with the
  schema and does not exist in this repository — `tsc` fails on that import
  alone. Its two exports (`HEX_COLOR_REGEX`, `SEMVER_REGEX`) are inlined in
  `schemas/style.ts` so the plugin has no dangling dependency. The sibling
  `design-system-schema-zod.ts` the source header references was not
  ingested either and is not reconstructed here.
- Historical and art-historical claims in the test fixture are illustrative
  test data, not scholarship. The `source` fields name the *kind* of
  citation the schema requires; they are not verified accession records.
