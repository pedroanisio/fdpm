Inspect, evaluate, and improve every content-rendering path available in this codebase. This includes all renderers, templates, layouts, output formats, routes, components, themes, export modes, and representative content states.

The objective is to ensure that every user-facing output ships with a polished, coherent, accessible, and production-grade UI/UX comparable to top-tier professional publishing and SaaS products.

Do not stop at an audit. Implement the improvements, validate them using representative fixtures, and iterate until the completion criteria are satisfied.

### Phase 1 — Inventory and baseline

Build a complete inventory of:

* Every renderer and supported output format
* Routes, entry points, templates, components, and style dependencies
* Themes, layout variants, responsive modes, and export targets
* Loading, empty, error, partial-data, overflow, and edge-case states
* Existing inconsistencies, duplicated styling, and fragile rendering logic
* Renderers or states that cannot currently be exercised or verified

For each renderer, generate or locate representative fixtures covering short, typical, long, malformed, and content-dense inputs. Record screenshots and objective baseline results before making changes.

### Phase 2 — Multidimensional review

Assess every rendered output across:

* Information architecture and visual hierarchy
* Typography, readability, line length, rhythm, and density
* Spacing, alignment, grids, proportions, and whitespace
* Color system, contrast, borders, shadows, and surfaces
* Responsive behavior from narrow mobile screens to 4K displays
* Navigation, controls, forms, tables, panels, overlays, and tooltips
* Loading feedback, skeletons, empty states, errors, and recovery paths
* Micro-interactions, transitions, focus states, and perceived performance
* Accessibility: keyboard navigation, semantic structure, screen readers, focus visibility, reduced motion, and WCAG contrast
* Content resilience: long titles, long words, multilingual copy, missing media, large datasets, code blocks, tables, citations, and nested content
* Print and export quality where applicable, including page breaks, clipping, margins, resolution, and font embedding
* Cross-renderer consistency without erasing format-specific strengths

Evaluate the writing and interface copy as part of the experience. Remove vague, mechanical, or generic wording and replace it with concise, natural, task-oriented copy.

### Phase 3 — Systematic improvement

Create or refine a shared rendering design system covering:

* Design tokens
* Typography scale
* Spacing and grid rules
* Color and elevation semantics
* Reusable layout primitives
* Interactive-state conventions
* Responsive and print behavior
* Accessibility requirements

Fix systemic causes before applying renderer-specific exceptions. Preserve existing functionality, data semantics, and public contracts unless a change is necessary and documented.

Every renderer must remain visually distinctive where its purpose requires it, while still feeling like part of the same product.

### Phase 4 — Verification loop

Use automated browser testing and visual inspection to verify every renderer at representative viewport sizes and output states.

Add or improve:

* Playwright end-to-end coverage
* Screenshot and visual-regression tests
* Accessibility checks
* Overflow, clipping, and horizontal-scroll detection
* Keyboard-navigation tests
* Responsive-layout assertions
* Console-error and failed-resource detection
* Export or print validation where relevant

Run multiple review-and-improvement passes. After each pass:

1. Render all fixtures.
2. Capture screenshots.
3. Compare results against the baseline and design-system rules.
4. Identify remaining defects.
5. Implement corrections.
6. Re-run the complete verification suite.

Do not declare completion based only on tests passing. Inspect the rendered outputs visually and resolve visible quality problems that automated checks cannot detect.

### Definition of done

The work is complete only when:

* Every renderer and relevant state is inventoried and exercised.
* No content is unintentionally clipped, overlapped, truncated, or unreadable.
* Outputs remain coherent across mobile, tablet, desktop, wide, and print contexts where applicable.
* Keyboard navigation and visible focus work throughout.
* Automated accessibility checks report no serious or critical violations.
* Contrast meets WCAG AA requirements.
* No tested page produces unexpected console errors or failed resources.
* Visual-regression coverage protects the major renderers and states.
* Typography, spacing, hierarchy, interaction behavior, and copy are consistently professional.
* All applicable tests, linting, type checks, and production builds pass.
* Remaining limitations are explicitly documented with evidence and recommended follow-up actions.

Conclude with a concise report containing:

* The complete renderer inventory
* Problems found and changes implemented
* Before-and-after evidence
* Test and accessibility results
* Remaining risks or limitations
* Exact commands needed to reproduce the validation

Continue iterating until these criteria are met or a genuine external blocker is identified. Do not conceal failures, weaken tests, remove supported behavior, or use superficial styling changes to simulate completion.
