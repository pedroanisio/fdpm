# plan-sections-tree-implementation — Agent Board

> Profile: `profile:planning:0.1` v0.1.0. 15 tasks. Generated at 2026-05-04T21:08:44.468Z.

## 🎯 Available to claim

- `task:relations-order` _(Either/P0)_ — CHG-1: Add \`order: int\` (optional, default 0) to spec:HasSection in fdpm-cli/plugins/spec\_authoring/relations.ts. No cardinality changes; add the field after the existing description block and re-export through index.ts ids module.
- `task:renderer-dfs` _(Either/P0)_ — CHG-2: Replace renderSections flat-filter in spec\_md.ts with a DFS rooted at the document, sorting children by \`(order, uid)\`. Introduce \`deriveNumber(path: number\[\]): string\` that joins ancestor indices with '.'.
- `task:fallback-detection` _(Either/P0)_ — CHG-3: Detect 'no \`order\` edges in project' and route through the legacy compareSectionNumbers path; emit \`info\`-level deprecation findings on mixed-mode projects (Section with both authored \`number\` and a derivable position).
- `task:tests-dfs-fixture` _(Either/P0)_ — Pure-graph fixture in spec\_md.test.ts: build a Document with three nested sections (1 → 1.1 → 1.1.1 plus a 1.2 sibling and a §2 root sibling) using only \`order\` edges; assert the rendered headings exactly.
- `task:tests-fallback-fixture` _(Either/P0)_ — Fallback fixture in spec\_md.test.ts: a project authored with the v0.0 pattern (only authored \`number\`, no \`order\` edges) renders byte-equal to its pre-renderer-change output.
- `task:tests-mixed-mode` _(Either/P1)_ — Mixed-mode fixture in spec\_md.test.ts: a project with both authored \`number\` and \`order\` edges produces the expected count of \`info\`-level deprecation findings — one per mixed Section.
- `task:tests-determinism` _(Either/P0)_ — Replay-determinism gate: run the same log twice through the new (order, uid) sibling ordering and assert byte-equal SHA-256. Tiebreak shuffle: insert siblings with identical \`order\` in two different insertion orders and assert the rendered output is invariant.
- `task:codemod` _(Either/P0)_ — CHG-4: New script fdpm-cli/scripts/migrate-section-numbers.ts. Parses build-spec-\*.ts; replaces \`number: "N"\` with \`fields: { order: N \* 10 }\` on the matching spec:HasSection; drops \`number\` from spec:Section. Sparse 10/20/30 keeps insertion O(1).
- `task:codemod-diff-gate` _(Either/P0)_ — Codemod self-check: per-SPEC differential — if rendered output diverges by even one byte before/after migration, the codemod refuses to write the file. Mitigates RSK-2 (codemod silent loss).
- `task:codemod-apply` _(Either/P0)_ — Run the codemod against all 9 existing build-spec-\*.ts scripts. Commit the migrated forms in a separate PR; verify each migrated SPEC re-renders byte-equal to its pre-codemod render.

---

## 👤 actor:Bot:Builder

### Ready (10)

- `task:relations-order` _(Either/P0)_ — CHG-1: Add \`order: int\` (optional, default 0) to spec:HasSection in fdpm-cli/plugins/spec\_authoring/relations.ts. No cardinality changes; add the field after the existing description block and re-export through index.ts ids module.
- `task:renderer-dfs` _(Either/P0)_ — CHG-2: Replace renderSections flat-filter in spec\_md.ts with a DFS rooted at the document, sorting children by \`(order, uid)\`. Introduce \`deriveNumber(path: number\[\]): string\` that joins ancestor indices with '.'.
- `task:fallback-detection` _(Either/P0)_ — CHG-3: Detect 'no \`order\` edges in project' and route through the legacy compareSectionNumbers path; emit \`info\`-level deprecation findings on mixed-mode projects (Section with both authored \`number\` and a derivable position).
- `task:tests-dfs-fixture` _(Either/P0)_ — Pure-graph fixture in spec\_md.test.ts: build a Document with three nested sections (1 → 1.1 → 1.1.1 plus a 1.2 sibling and a §2 root sibling) using only \`order\` edges; assert the rendered headings exactly.
- `task:tests-fallback-fixture` _(Either/P0)_ — Fallback fixture in spec\_md.test.ts: a project authored with the v0.0 pattern (only authored \`number\`, no \`order\` edges) renders byte-equal to its pre-renderer-change output.
- `task:tests-mixed-mode` _(Either/P1)_ — Mixed-mode fixture in spec\_md.test.ts: a project with both authored \`number\` and \`order\` edges produces the expected count of \`info\`-level deprecation findings — one per mixed Section.
- `task:tests-determinism` _(Either/P0)_ — Replay-determinism gate: run the same log twice through the new (order, uid) sibling ordering and assert byte-equal SHA-256. Tiebreak shuffle: insert siblings with identical \`order\` in two different insertion orders and assert the rendered output is invariant.
- `task:codemod` _(Either/P0)_ — CHG-4: New script fdpm-cli/scripts/migrate-section-numbers.ts. Parses build-spec-\*.ts; replaces \`number: "N"\` with \`fields: { order: N \* 10 }\` on the matching spec:HasSection; drops \`number\` from spec:Section. Sparse 10/20/30 keeps insertion O(1).
- `task:codemod-diff-gate` _(Either/P0)_ — Codemod self-check: per-SPEC differential — if rendered output diverges by even one byte before/after migration, the codemod refuses to write the file. Mitigates RSK-2 (codemod silent loss).
- `task:codemod-apply` _(Either/P0)_ — Run the codemod against all 9 existing build-spec-\*.ts scripts. Commit the migrated forms in a separate PR; verify each migrated SPEC re-renders byte-equal to its pre-codemod render.

### Backlog (4)

- `task:deprecate-number-field` _(Either/P1)_ — CHG-6: In fdpm-cli/plugins/spec\_authoring/primitives/document.ts, mark the \`number\` field on spec:Section as deprecated in its description. No structural change in v0.1; description-only.
- `task:lint-sparse-order` _(Either/P2)_ — Mitigation MIT-3: add validator spec:val:section-order-sparse — emits an \`info\` finding when a sibling group has more than two ties. Documents the 10/20/30 convention without forcing it.
- `task:perf-baseline` _(Either/P3)_ — Mitigation MIT-4: benchmark render time on the largest existing SPEC (SPEC-DNIS, ~120 sections); fail CI if the post-change render exceeds 2× the pre-change baseline. Mitigates RSK-4 (render-time perf regression).
- `task:spec-status-flip` _(Either/P2)_ — Once back-compat lands and the renderer test fixtures are green, flip SPEC-SECTIONS-TREE status from Proposal to Stable in build-spec-sections-tree.ts and re-render docs/specs/SPEC-SECTIONS-TREE.md.

## 👤 actor:Person:Maintainer

### Backlog (1)

- `task:rollout-review` _(Human/P1)_ — Human review of the migrated SPEC outputs and the codemod's diff-gate behaviour before merging the codemod-applied PR. Spot-checks the back-compat path on at least two unmigrated scripts and the post-codemod path on at least two migrated scripts.
