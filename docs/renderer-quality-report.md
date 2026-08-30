# Renderer quality report

Date: 2026-08-29
Scope: the live built-in renderer registry loaded from `fdpm-cli/plugins`

## Outcome

The live registry contains 41 renderers owned by 16 providers and bound through 19 resolved profiles. It exposes eight output targets. Every renderer was exercised with the same six-state acceptance model: empty, short, typical, long, malformed/partial, and dense. The final format result is 246/246 passing cases with no unbound renderer.

The interactive visual surface is eight standalone HTML renderers and seven SVG renderers. Their browser suite covers mobile (360 px), tablet (768 px), desktop (1440 px), wide/4K-class (2560 px), light, dark, print, keyboard order, focus, serious/critical Axe findings, horizontal overflow, console errors, and failed resources. The final browser result is 91/91 passing tests.

This repository does not expose renderer-owned application routes, asynchronous loading screens, forms, overlays, or skeleton states. Its user-facing surfaces are synchronous exported artifacts. Empty and malformed/partial fixtures therefore cover the applicable absence and recovery states; inventing route-level loading UI would not exercise a real product path.

## Complete inventory

Target totals: 18 Markdown, 8 HTML, 7 SVG, 3 PDF, 2 PNG, and one each of BibTeX, LaTeX, and YAML.

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

The original `HEAD` was extracted and rendered in isolation with the final acceptance harness. That baseline remains under `_tmp/renderer-baseline/` and is reproducible without changing the working tree.

| Evidence | Original `HEAD` | Final tree |
|---|---:|---:|
| Registered renderers | 41 | 41 |
| Six-state format cases | 239/246 passed | 246/246 passed |
| Unbound renderers | 0 | 0 |
| Formal-spec HTML landmark cases | 0/6 | 6/6 |
| Agent-board byte determinism | failed | passed |
| Expanded browser matrix | first red iteration: 34/91 | 91/91 |

Baseline artifacts:

- `_tmp/renderer-baseline/baseline.json`
- `_tmp/renderer-baseline/baseline-html-desktop-light.png`
- `_tmp/renderer-baseline/baseline-html-mobile-light.png`

Final tracked visual evidence:

- `fdpm-cli/tests/renderers/__snapshots__/html-empty-desktop-light.png`
- `fdpm-cli/tests/renderers/__snapshots__/html-empty-mobile-light.png`
- `fdpm-cli/tests/renderers/__snapshots__/html-empty-desktop-dark.png`
- `fdpm-cli/tests/renderers/__snapshots__/html-empty-desktop-print.png`

Visual inspection was performed on the two original-HEAD galleries, the four final galleries, representative PNG sheets, Chromium-rendered SVG contact sheets, and the first pages of all three PDF families. The final light/dark/print galleries preserve the academic, specification, matrix, registry, and UIXO information architectures instead of reducing them to one generic card template.

## Problems found and changes implemented

### Shared HTML system

Before, the eight HTML renderers independently owned document roots, tokens, responsive rules, and print behavior. Formal specification lacked a `main` landmark in all six acceptance states. No common theme or print controls existed, focus behavior varied, empty copy exposed internal primitive names, and long unbroken text could expand the page past a 360 px viewport.

`src/core/render/document.ts` now owns the standalone artifact contract:

- closed paper/surface/ink/accent/status tokens with domain-selectable accents;
- a system-font typography stack and readable content measures;
- automatic OS light/dark mode plus a keyboard-operable in-document theme control;
- a skip link, visible focus, reduced-motion handling, and semantic document actions;
- a native Print/Save as PDF action and a final A4 print layer that wins over domain CSS;
- mobile-to-wide bounds, resilient grid children, wrapping for long/multilingual tokens, and print-safe headings/tables/code;
- no external resources, so file-URL artifacts remain complete offline.

All eight HTML renderers now use that shell while keeping their domain-specific body layouts and accent roles. Empty copy was changed to direct user-facing language such as “No styles have been recorded yet” and “No UIXO entities have been recorded yet.” Invalid author-provided locale strings now fall back to a valid `en` document language.

### Accessibility and resilience corrections

- Formal-spec documents gained the shared content landmark and print behavior.
- Long-token overflow was fixed at the shared content boundary; UIXO received narrow-grid exceptions for its census, facts, links, and swatches.
- Code blocks wrap without creating unreachable scroll areas. Tables fit mobile layouts; the binding matrix's intentionally scrollable nested matrix is a named, keyboard-focusable region.
- UIXO incoming-link opacity no longer lowers text below AA contrast, and content links are visibly underlined rather than relying on color alone.
- SVG tests now require a non-zero scalable viewport, a role/name, zero serious or critical Axe findings, and no console/resource failures.
- Planning Gantt now has `role="img"`, an explicit title/description relationship, and a caller-supplied render clock.
- Dense loop-forward workbooks now emit one valid SVG document containing stacked pipeline drawings with unique marker ids, instead of sibling SVG roots.

### Determinism and contracts

`RendererInput.renderedAt` makes time an explicit render dependency. `PluginRuntime` freezes it once per invocation. Agent Board and Gantt no longer consult the wall clock while producing bytes; direct callers have deterministic fallbacks. Regression tests protect direct and runtime-mediated rendering.

The acceptance harness dynamically inventories the live Host registry rather than maintaining a second renderer list. It verifies content type, UTF-8/format signatures, dimensions or roots, HTML landmarks/self-containment, placeholder leakage, deterministic bytes, output filenames, findings, and artifact hashes for all six states. Artifact names are length-bounded so stress content cannot become an invalid path.

### Browser verification

The Playwright matrix renders all eight HTML and seven SVG surfaces from live resolved profiles. It checks:

- widths of 360, 768, 1440, and 2560 px;
- page overflow and SVG geometry;
- Axe WCAG 2 A/AA and 2.1 A/AA serious/critical findings;
- skip-link and theme-control keyboard order plus theme state change;
- visible print action invocation and print-media behavior;
- print overflow, clipped code/scroll containers, and heading scale;
- console errors and failed resources;
- screenshot regression galleries for empty and typical content in desktop light, mobile light, desktop dark, and desktop print.

## Final validation

| Command | Result |
|---|---|
| `npm run render:acceptance -- --output ../_tmp/renderer-acceptance.json --artifact-dir ../_tmp/renderer-artifacts` | 246/246 passed; 41 renderers; 19 profiles; 8 targets; 0 unbound |
| `npm run test:renderers:visual -- --update-snapshots=all` | 91/91 passed |
| `npx vitest run tests/planning-renderers.test.ts tests/plugins/loop_forward/renderers.test.ts tests/plugins/uixo/renderers.test.ts tests/renderer-acceptance.test.ts tests/render.test.ts` | 117/117 passed |
| `npx vitest run tests/plugins/style/renderers.test.ts` | 26/26 passed |
| `npm test` | 1,966/1,966 passed across 192 files |
| `npm run typecheck` | passed |
| `npm run build` | passed |

The final machine-readable evidence is `_tmp/renderer-acceptance.json`; all 246 output artifacts are under `_tmp/renderer-artifacts/`. Playwright scratch diagnostics are under `_tmp/renderer-playwright-results/` when a case fails.

## Remaining limitations and recommended follow-up

1. **PDF accessibility and font packaging.** All three PDF families render as A4 without clipping in the inspected fixtures, but `pdfinfo` reports them as untagged and `pdffonts` reports standard Base-14 fonts as unembedded. This limits structural screen-reader navigation and makes the files unsuitable for a PDF/UA claim. Follow-up: move PDF generation to a tagged-PDF-capable pipeline, embed a licensed Unicode font family, add language/structure metadata, and validate with veraPDF/PAC in CI.
2. **Theme persistence.** The standalone HTML contract intentionally contains no script or external asset. The theme control therefore lasts for the open document but is not persisted across reloads; OS preference is still honored on every open. If persistence becomes a product requirement, revise the no-script portability contract explicitly and add a small local-storage controller with CSP coverage.
3. **Pixel coverage by format.** HTML and SVG have automated browser and screenshot coverage. PDF and PNG were generated in all six states and representative outputs were visually inspected, but do not yet have pixel-diff baselines; Markdown, YAML, BibTeX, and LaTeX are text/contract checked rather than visually rasterized. Follow-up: add deterministic PDF/PNG page rasterization and TeX compilation in an image with pinned fonts/toolchains.
4. **Synthetic resilience fixtures.** The acceptance corpus is schema-derived and deliberately calls renderers directly, including malformed inputs that bypass normal project validation. This proves renderer resilience, not that the synthetic prose is editorially representative of every real customer corpus. Follow-up: add anonymized canonical workbooks for each profile alongside the generative stress matrix.
5. **Chromium installation.** The browser configuration defaults to `/snap/bin/chromium` for this environment. Other machines must set `FDPM_CHROMIUM_EXECUTABLE_PATH` or install Chromium at that path. Pin the browser build in CI before treating screenshot bytes as cross-machine portable.

These limitations do not conceal a failing command in the current checkout. They describe capabilities the present renderer dependencies do not provide and the exact next validation needed to close them.

## Reproduction

From `fdpm-cli/`:

```sh
npm install
npm run render:acceptance -- --output ../_tmp/renderer-acceptance.json --artifact-dir ../_tmp/renderer-artifacts
npm run test:renderers:visual
npm test
npm run typecheck
npm run build
```

For a non-snap Chromium installation:

```sh
FDPM_CHROMIUM_EXECUTABLE_PATH=/absolute/path/to/chromium npm run test:renderers:visual
```

For the current PDF audit:

```sh
pdfinfo ../_tmp/renderer-artifacts/acad_PaperPdfRenderer/typical-renderer-acceptance.pdf
pdffonts ../_tmp/renderer-artifacts/acad_PaperPdfRenderer/typical-renderer-acceptance.pdf
pdfinfo ../_tmp/renderer-artifacts/fs_SpecPdfRenderer/typical-renderer-acceptance.pdf
pdffonts ../_tmp/renderer-artifacts/fs_SpecPdfRenderer/typical-renderer-acceptance.pdf
pdfinfo ../_tmp/renderer-artifacts/uixo_DocumentPdfRenderer/typical-uixo-document.pdf
pdffonts ../_tmp/renderer-artifacts/uixo_DocumentPdfRenderer/typical-uixo-document.pdf
```
