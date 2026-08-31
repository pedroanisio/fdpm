# Renderer quality report

Date: 2026-08-31
Scope: the live built-in renderer registry loaded from `fdpm-cli/plugins`

## Outcome

The live registry contains 46 renderers bound through 21 resolved profiles and exposes nine output targets. Every renderer was exercised with the same six-state acceptance model: empty, short, typical, long, malformed/partial, and dense. The current result is **276/276 passing cases with no unbound renderer**. All 24 PDF cases pass the strengthened parse/A4/page-metrics gate, and all 54 HTML cases are standalone documents with a doctype and `main` landmark.

The current browser/Poppler suite passes **104/104**. It covers nine standalone HTML and eight SVG renderers across the six fixture states, four responsive widths, keyboard behavior, Axe, print, and resource failures. It also verifies the knowledge-cartridge PDF's embedded font programs, Unicode extraction, and inspected cover/register/audit raster baselines.

This repository does not expose renderer-owned application routes, asynchronous loading screens, forms, overlays, or skeleton states. Its user-facing surfaces are synchronous exported artifacts. Empty and malformed/partial fixtures therefore cover the applicable absence and recovery states; inventing route-level loading UI would not exercise a real product path.

## Complete inventory

Target totals: 19 Markdown, 9 HTML, 8 SVG, 4 PDF, 2 PNG, and one each of JSON, BibTeX, LaTeX, and YAML.

| Renderer | Target | Provider | Fixture cases passed |
|---|---|---|---:|
| `acad:ArgumentGraphRenderer` | `image/svg+xml` | `fdpm.academic-paper-v0-4-1` | 6/6 |
| `acad:BibliographyRenderer` | `application/x-bibtex` | `fdpm.academic-paper-v0-4-1` | 6/6 |
| `acad:LatexRenderer` | `application/x-tex` | `fdpm.academic-paper-v0-4-1` | 6/6 |
| `acad:PaperDocumentRenderer` | `text/markdown` | `fdpm.academic-paper-v0-4-1` | 6/6 |
| `acad:PaperHtmlRenderer` | `text/html` | `fdpm.academic-paper-v0-4-1` | 6/6 |
| `acad:PaperPdfRenderer` | `application/pdf` | `fdpm.academic-paper-v0-4-1` | 6/6 |
| `acme:DeckContactSheetRenderer` | `image/svg+xml` | `acme.business-deck` | 6/6 |
| `acme:DeckRunningOrderRenderer` | `text/markdown` | `acme.business-deck` | 6/6 |
| `acme.pitch-deck:PhaseMapRenderer` | `image/svg+xml` | `acme.pitch-deck` | 6/6 |
| `acme.pitch-deck:RunningOrderRenderer` | `text/markdown` | `acme.pitch-deck` | 6/6 |
| `core:WorkbookRenderer` | `text/markdown` | `core` | 6/6 |
| `dnis:DocumentOutlineRenderer` | `text/markdown` | `fdpm.dnis` | 6/6 |
| `docplan:PlanBriefRenderer` | `text/markdown` | `fdpm.document-plan` | 6/6 |
| `docplan:PlanOutlineRenderer` | `text/markdown` | `fdpm.document-plan-dnis` | 6/6 |
| `fs:SpecHtmlRenderer` | `text/html` | `fdpm.formal-specification` | 6/6 |
| `fs:SpecPdfRenderer` | `application/pdf` | `fdpm.formal-specification` | 6/6 |
| `fs:SpecRenderer` | `text/markdown` | `fdpm.formal-specification` | 6/6 |
| `kc:CartridgePdfRenderer` | `application/pdf` | `fdpm.knowledge-cartridge` | 6/6 |
| `kc:CartridgeRenderer` | `text/markdown` | `fdpm.knowledge-cartridge` | 6/6 |
| `kc:CitationIndexRenderer` | `text/html` | `fdpm.knowledge-cartridge` | 6/6 |
| `kc:LayerMapRenderer` | `image/svg+xml` | `fdpm.knowledge-cartridge` | 6/6 |
| `kc:StateRenderer` | `application/json` | `fdpm.knowledge-cartridge` | 6/6 |
| `lf:AuthorityMatrixRenderer` | `text/html` | `fdpm.loop-forward` | 6/6 |
| `lf:BindingMatrixRenderer` | `text/html` | `fdpm.loop-forward` | 6/6 |
| `lf:BudgetEnvelopeRenderer` | `text/markdown` | `fdpm.loop-forward` | 6/6 |
| `lf:PipelineGraphRenderer` | `image/svg+xml` | `fdpm.loop-forward` | 6/6 |
| `lf:VerificationSurfaceRenderer` | `text/html` | `fdpm.loop-forward` | 6/6 |
| `plan:AgentBoardRenderer` | `text/markdown` | `fdpm.planning` | 6/6 |
| `plan:GanttSvgRenderer` | `image/svg+xml` | `fdpm.planning` | 6/6 |
| `plan:RoadmapRenderer` | `text/markdown` | `fdpm.planning` | 6/6 |
| `recipe:ShoppingListRenderer` | `text/markdown` | `fdpm.starter` | 6/6 |
| `spec:SpecMarkdownRenderer` | `text/markdown` | `fdpm.spec-authoring` | 6/6 |
| `srs:SrsDocumentRenderer` | `text/markdown` | `fdpm.software-requirements` | 6/6 |
| `srs:SrsHtmlRenderer` | `text/html` | `fdpm.software-requirements` | 6/6 |
| `style:PaletteSheetRenderer` | `image/png` | `fdpm.style` | 6/6 |
| `style:StyleHtmlRenderer` | `text/html` | `fdpm.style` | 6/6 |
| `style:StyleOutlineRenderer` | `text/markdown` | `fdpm.style` | 6/6 |
| `style:StyleSpecimenRenderer` | `image/svg+xml` | `fdpm.style` | 6/6 |
| `sw:ADRRenderer` | `text/markdown` | `fdpm.software-architecture` | 6/6 |
| `sw:OpenAPIRenderer` | `application/x-yaml` | `fdpm.software-architecture` | 6/6 |
| `uixo:ComponentSheetRenderer` | `image/png` | `fdpm.uixo` | 6/6 |
| `uixo:ComponentTreeRenderer` | `image/svg+xml` | `fdpm.uixo` | 6/6 |
| `uixo:DocumentHtmlRenderer` | `text/html` | `fdpm.uixo` | 6/6 |
| `uixo:DocumentOutlineRenderer` | `text/markdown` | `fdpm.uixo` | 6/6 |
| `uixo:DocumentPdfRenderer` | `application/pdf` | `fdpm.uixo` | 6/6 |
| `uml:ModelOutlineRenderer` | `text/markdown` | `fdpm.uml` | 6/6 |

## Baseline and before/after evidence

The original `HEAD` was extracted and rendered in isolation with the final acceptance harness during the audit. Generated scratch was intentionally not retained as repository evidence; the durable evidence is the live harness, tests, and tracked visual baselines.

| Evidence | Original `HEAD` | Final tree |
|---|---:|---:|
| Registered renderers | 41 | 46 |
| Six-state format cases | 239/246 passed | 276/276 passed |
| Unbound renderers | 0 | 0 |
| Formal-spec HTML landmark cases | 0/6 | 6/6 |
| Agent-board byte determinism | failed | passed |
| Expanded browser/PDF matrix | first red iteration: 34/91 | 104/104 for nine HTML, eight SVG, and the knowledge-cartridge PDF |

Final tracked visual evidence:

- `fdpm-cli/tests/renderers/__snapshots__/html-empty-desktop-light.png`
- `fdpm-cli/tests/renderers/__snapshots__/html-empty-mobile-light.png`
- `fdpm-cli/tests/renderers/__snapshots__/html-empty-desktop-dark.png`
- `fdpm-cli/tests/renderers/__snapshots__/html-empty-desktop-print.png`
- `fdpm-cli/tests/renderers/__snapshots__/kc-pdf-cover.png`
- `fdpm-cli/tests/renderers/__snapshots__/kc-pdf-register.png`
- `fdpm-cli/tests/renderers/__snapshots__/kc-pdf-audit.png`

Visual inspection was performed on the original-HEAD galleries, the four final galleries, representative PNG sheets, Chromium-rendered SVG contact sheets, and the first pages of the original three PDF families. The 2026-08-31 continuation additionally inspected a validated 13-page knowledge cartridge, with tracked cover, typed-register, and construction-record baselines. No clipping, overlap, broken continuation, or unreadable hierarchy was observed in the sampled pages.

## Problems found and changes implemented

### Knowledge-cartridge practitioner PDF

`kc:CartridgePdfRenderer` is a new domain renderer, not the generic one-page fallback that explicit-id calls previously reached when the id was absent. It provides:

- an A4 cover, computed figures, document metadata, contents with folios, running heads, and page counts;
- all six Pass-5 registers in their own information architecture, with L3 kept ordered, L4 kept symptom → cause → correction, and L5 naming the invariant it suspends;
- `KEY:ordinal` citations beside normative claims, plus visible `UNCITED` treatment when malformed/partial fixtures bypass normal validation;
- declared gaps, unreconciled conflicts, source tiers, corpus defects, harvest accounting, and all `UNCHECKED` controls in the reading sequence;
- a closed high-contrast print palette, labelled rather than hue-only rank, a 1.25 modular type scale, readable prose measure, and split-safe rows for long/Unicode/dense content;
- deterministic metadata and bytes, with packaged Noto Sans/Noto Sans Mono font programs embedded in every file;
- searchable Western-Latin multilingual text with Unicode maps, plus a visible fallback for glyphs outside the packaged Latin set instead of deletion or a render crash.

The manifest, runtime registration, public ids/exports, README inventory, and real-Host tests were updated together.

### Shared HTML system

Before, the existing HTML renderers independently owned document roots, tokens, responsive rules, and print behavior. Formal specification lacked a `main` landmark in all six acceptance states, and the later knowledge-cartridge citation index was only an HTML fragment. No common theme or print controls existed, focus behavior varied, empty copy exposed internal primitive names, and long unbroken text could expand the page past a 360 px viewport.

`src/core/render/document.ts` now owns the standalone artifact contract:

- closed paper/surface/ink/accent/status tokens with domain-selectable accents;
- a system-font typography stack and readable content measures;
- automatic OS light/dark mode plus a keyboard-operable in-document theme control;
- a skip link, visible focus, reduced-motion handling, and semantic document actions;
- a native Print/Save as PDF action and a final A4 print layer that wins over domain CSS;
- mobile-to-wide bounds, resilient grid children, wrapping for long/multilingual tokens, and print-safe headings/tables/code;
- no external resources, so file-URL artifacts remain complete offline.

All nine HTML renderers now use that shell while keeping their domain-specific body layouts and accent roles. The cartridge citation index adds source and status sections, labelled table regions, responsive/print rules, and document actions without weakening its PASS/FAIL/UNCHECKED vocabulary. Empty copy was changed to direct user-facing language such as “No styles have been recorded yet” and “No UIXO entities have been recorded yet.” Invalid author-provided locale strings now fall back to a valid `en` document language.

### Accessibility and resilience corrections

- Formal-spec documents gained the shared content landmark and print behavior.
- Long-token overflow was fixed at the shared content boundary; UIXO received narrow-grid exceptions for its census, facts, links, and swatches.
- Code blocks wrap without creating unreachable scroll areas. Tables fit mobile layouts; the binding matrix's intentionally scrollable nested matrix is a named, keyboard-focusable region.
- UIXO incoming-link opacity no longer lowers text below AA contrast, and content links are visibly underlined rather than relying on color alone.
- SVG tests now require a non-zero scalable viewport, a role/name, zero serious or critical Axe findings, and no console/resource failures.
- The cartridge layer map now supplies an explicit image role and title/description relationship.
- Planning Gantt now has `role="img"`, an explicit title/description relationship, and a caller-supplied render clock.
- Dense loop-forward workbooks now emit one valid SVG document containing stacked pipeline drawings with unique marker ids, instead of sibling SVG roots.

### Determinism and contracts

`RendererInput.renderedAt` makes time an explicit render dependency. `PluginRuntime` freezes it once per invocation. Agent Board and Gantt no longer consult the wall clock while producing bytes; direct callers have deterministic fallbacks. Regression tests protect direct and runtime-mediated rendering.

The acceptance harness dynamically inventories the live Host registry rather than maintaining a second renderer list. It verifies content type, UTF-8/format signatures, dimensions or roots, HTML landmarks/self-containment, placeholder leakage, deterministic bytes, output filenames, findings, and artifact hashes for all six states. PDF acceptance now loads every artifact through `pdf-lib`, records page counts and min/max dimensions, rejects zero-page/corrupt documents, and enforces A4 on every page. Artifact names are length-bounded so stress content cannot become an invalid path.

### Browser verification

The Playwright matrix renders all nine HTML and eight SVG surfaces from live resolved profiles. It checks:

- widths of 360, 768, 1440, and 2560 px;
- page overflow and SVG geometry;
- Axe WCAG 2 A/AA and 2.1 A/AA serious/critical findings;
- skip-link and theme-control keyboard order plus theme state change;
- visible print action invocation and print-media behavior;
- print overflow, clipped code/scroll containers, and heading scale;
- console errors and failed resources;
- screenshot regression galleries for empty and typical content in desktop light, mobile light, desktop dark, and desktop print.

The same command runs a Poppler-backed cartridge-PDF case. It rejects missing or non-Unicode-mapped font programs, verifies multilingual text extraction, rasterizes three representative pages, and compares those pages with the tracked inspected baselines. The CI workflow installs Playwright Chromium and Poppler on Ubuntu 24.04 and runs all 104 cases.

## Final validation

| Command | Result |
|---|---|
| `npm run render:acceptance` | 276/276 passed; all 24 PDF and 54 HTML cases passed; 46 renderers; 21 profiles; 9 targets; 0 unbound |
| `npx vitest run tests/plugins/knowledge_cartridge` | 95/95 passed across 6 files |
| `npx vitest run tests/renderer-pdf-acceptance.test.ts` | 3/3 passed |
| `npm run test:renderers:visual` | 104/104 passed across nine HTML renderers, eight SVG renderers, and the cartridge PDF |
| `npm test` | 2,233/2,233 passed across 212 files; exit 0 |
| `npm run test:public-readiness` | 6/6 passed |
| `npm run typecheck` | passed |
| `npm run build` | passed |

The acceptance and visual commands are reproducible evidence generators; generated diagnostics remain untracked. The seven inspected PNG baselines are tracked with the tests.

## Remaining limitations and required next work

1. **PDF accessibility.** All four PDF families render as A4, but they remain untagged and are not PDF/UA. The cartridge sets language and descriptive metadata and now embeds Unicode-mapped licensed fonts; the academic-paper, formal-specification, and UIXO PDF families still use unembedded Base-14 fonts. A future repository-wide accessibility close requires a tagged-PDF pipeline and veraPDF/PAC validation.
2. **Packaged script coverage.** The cartridge embeds the Latin subsets of Noto Sans and Noto Sans Mono. Supported Western-Latin text remains searchable and extractable, while other scripts receive an explicit visible fallback. Broader multilingual fidelity requires packaged subsets and fixtures for each promised script.
3. **Theme persistence.** The standalone HTML contract intentionally contains no script or external asset. The theme control therefore lasts for the open document but is not persisted across reloads; OS preference is still honored on every open. If persistence becomes a product requirement, the no-script portability contract must change explicitly and gain local-storage and CSP coverage.
4. **Pixel coverage outside the cartridge.** PDF acceptance parses all four PDF families, enforces A4 geometry, and checks deterministic bytes, but automated page-diff baselines currently cover only the knowledge cartridge. PNG is signature/dimension checked, while Markdown, YAML, BibTeX, and LaTeX are text/contract checked rather than visually rasterized.
5. **Synthetic resilience fixtures.** The acceptance corpus is schema-derived and deliberately calls renderers directly, including malformed inputs that bypass normal project validation. This proves renderer resilience, not that the synthetic prose is editorially representative of every real customer corpus. Canonical, anonymized workbooks are still needed alongside the generative stress matrix.
6. **Raster toolchain drift.** CI pins Ubuntu 24.04 and installs its Poppler plus Playwright Chromium, while local runs may use `/snap/bin/chromium` or `FDPM_CHROMIUM_EXECUTABLE_PATH`. Browser or Poppler upgrades can intentionally change antialiasing; baseline changes therefore require visual review.

The knowledge-cartridge-focused slice is green: all six states pass for all five cartridge renderers, the complete 24-case PDF target passes, and the cartridge PDF's packaged-font, extraction, and representative raster checks pass in the tracked CI suite.

## Reproduction

From `fdpm-cli/`:

```sh
npm install
npm run render:acceptance
npx vitest run tests/plugins/knowledge_cartridge
npx vitest run tests/renderer-pdf-acceptance.test.ts
npm run test:renderers:visual
npm test
npm run typecheck
npm run build
```

For an explicit Chromium installation:

```sh
FDPM_CHROMIUM_EXECUTABLE_PATH=/absolute/path/to/chromium npm run test:renderers:visual
```

For the focused cartridge audit:

```sh
npm run test:renderers:visual -- --grep "embeds fonts"
```
