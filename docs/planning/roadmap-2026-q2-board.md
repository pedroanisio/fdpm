# plan-roadmap-2026-q2 — Agent Board

> Profile: `profile:planning:0.1` v0.1.0. 32 tasks. Generated at 2026-08-28T19:32:26.978Z.

## 🎯 Available to claim

- `task:p1-subscribe` _(Either/P0)_ — Wire ResourceSubscribeRequestSchema + the watcher loop. On subscribe, take a (mtime\_ns, size) snapshot via host.statProjectLog and poll on a 250-500ms cadence; emit notifications/resources/updated when the snapshot changes.
- `task:p1-sizecap` _(Either/P0)_ — Add FDPM\_MCP\_MAX\_RESOURCE\_BYTES (default 1 MiB). Reject oversized renders in resources/read with a \`quota\` envelope carrying \`evidence.bytes\` and \`evidence.cap\`. Cap also applies after base64 expansion for binary blobs.
- `task:p1-providers` _(Either/P1)_ — Add three more resource providers: (a) workbook transfer at fdpm://workbook/{id}/transfer, (b) validate report at fdpm://workbook/{id}/validate, (c) primitive view at fdpm://workbook/{id}/primitive/{pid}. Each ~50 lines under src/mcp/resources/.

---

## Unassigned

### Ready (3)

- `task:p1-subscribe` _(Either/P0)_ — Wire ResourceSubscribeRequestSchema + the watcher loop. On subscribe, take a (mtime\_ns, size) snapshot via host.statProjectLog and poll on a 250-500ms cadence; emit notifications/resources/updated when the snapshot changes.
- `task:p1-sizecap` _(Either/P0)_ — Add FDPM\_MCP\_MAX\_RESOURCE\_BYTES (default 1 MiB). Reject oversized renders in resources/read with a \`quota\` envelope carrying \`evidence.bytes\` and \`evidence.cap\`. Cap also applies after base64 expansion for binary blobs.
- `task:p1-providers` _(Either/P1)_ — Add three more resource providers: (a) workbook transfer at fdpm://workbook/{id}/transfer, (b) validate report at fdpm://workbook/{id}/validate, (c) primitive view at fdpm://workbook/{id}/primitive/{pid}. Each ~50 lines under src/mcp/resources/.

### Backlog (21)

- `task:p1-tests` _(Either/P0)_ — End-to-end JSON-RPC smoke against fdpm-mcp via stdio: subscribe, modify workbook log, observe notification; oversized render → quota envelope; each new provider returns content.
- `task:p3-streaming` _(Either/P1)_ — Long renders (>1 MB) stream partial chunks to stdout in JSON mode. Each chunk: \`{stream\_id, seq, final, bytes\_chunk}\` envelope. Renderer needs an optional streaming hook the REPL drives.
- `task:p3-multiline` _(Either/P2)_ — Trailing backslash continues input across lines. Continuation prompt \`... > \` on stderr. Cancel via Ctrl-C clears the in-progress buffer.
- `task:p3-completion` _(Either/P2)_ — Tab completion learns: profile ids after \`--profile\`, primitive ids after \`--id\`/\`get\`/\`patch\` second arg, type ids after \`--type\`. Sourced from registry only (per SPEC-REPL §8.6 — never from filesystem).
- `task:p3-tests` _(Either/P1)_ — Tests: streaming render produces N+1 chunks (N data + 1 final flag); multi-line via spawn-with-stdin-pipe assembles correctly; completion returns expected candidates for known fixtures.
- `task:p4-codemod-write` _(Either/P0)_ — Implement fdpm-cli/scripts/migrate-section-numbers.ts. Parses build-spec-\*.ts, replaces hand-authored \`number: "N"\` with the dnis:Node path, drops legacy spec:Section. Per-script byte-diff gate: refuses to write if pre/post output differs.
- `task:p4-codemod-apply` _(Human/P0)_ — Run the codemod across every build-spec-\*.ts. Commit each migrated script in a separate commit so reviewers can see one-at-a-time diffs. Re-render every SPEC and confirm byte-equal output.
- `task:p4-deprecation-removal` _(Either/P1)_ — Remove the spec:Section.number field from the active schema OR escalate the deprecation to an error finding (decide based on whether any external workbook still uses it). Update SPEC-SECTIONS-TREE §11 / §15.
- `task:p4-spec-stable` _(Either/P1)_ — Flip SPEC-SECTIONS-TREE status from Proposal to Stable in build-spec-sections-tree.ts; re-render docs/specs/SPEC-SECTIONS-TREE.md.
- `task:p5-audit` _(Either/P1)_ — Audit which build-spec-\*.ts under fdpm-cli/scripts/ still hand-author \`number\` on spec:Section / fs:Section. Produce a spreadsheet (or just a markdown table) of (script, section\_count, profile\_id).
- `task:p5-migrate-scripts` _(Either/P1)_ — Migrate each script identified by p5-audit to use dnis:Node sections via DnisHostAdapter. Re-render and confirm byte-equal output (the DNIS path's DFS numbering should match the legacy compareSectionNumbers output for any well-formed SPEC).
- `task:p5-legacy-removal-tracked` _(Either/P2)_ — Add a tracking-issue or SPEC-CORE follow-up entry for removing renderSectionsLegacy in spec\_md.ts (the function is dead code once every script is migrated). Keep a one-release deprecation window before removal.
- `task:p6-partial-failure` _(Either/P2)_ — Make :reload plugins survive a single plugin's activate() throwing. Today the reload aborts mid-way through. Fix: catch per-plugin, mark as \`quarantined\`, continue with the rest. Surface the count of quarantined plugins in the reload result.
- `task:p6-incremental` _(Either/P2)_ — Plugin discovery currently rescans every dir on every load. Cache (dir, mtime\_ns) and skip unchanged dirs. Cache invalidates on :reload plugins. Saves wall-clock on REPL :reload and MCP SIGHUP.
- `task:p6-spec-doc` _(Either/P2)_ — Write SPEC-PLUGIN-LIFECYCLE: documents activation order (profile-deps first, capability-deps next), partial-failure semantics, and the incremental-discovery contract. Either as a fresh SPEC under docs/specs/ or as a §-level addition to SPEC-CORE.
- `task:p7-host-impl` _(Either/P2)_ — Add Host.searchPrimitivesAcross(filters) that walks every loaded workbook and returns a flat array of (workbook\_id, primitive). Reuses the per-workbook searchPrimitives implementation; coalesces results by id when --dedupe is passed.
- `task:p7-cli-flags` _(Either/P2)_ — Extend \`fdpm primitive search\` with --across-workbooks, --type-class GLOB (e.g. \`\*:Section\` matches spec:Section, fs:Section, sw:Section), --field-equals key=value (multiple). Output groups results by workbook\_id in human mode, flat array in JSON mode.
- `task:p7-tests` _(Either/P2)_ — Tests against a multi-workbook fixture (3 workbooks, 2 profiles, ~20 primitives total). Cover: --across-workbooks returns all matches, --type-class glob matches across profiles, --field-equals composes with the others.
- `task:p8-design` _(Either/P2)_ — Decide between (a) generating MANUAL.md + README.md env tables from src/core/config/env.ts at build time, or (b) introducing a content-include mechanism (e.g. \<!--include:env-table--> markers replaced by a script). (a) is simpler; (b) is more flexible.
- `task:p8-implementation` _(Either/P2)_ — Implement the chosen approach from p8-design. Either way: env-contract test passes after adding a new env var without manual MANUAL.md / README.md edits.
- `task:p8-tests` _(Either/P2)_ — Update tests/env-contract.test.ts to reflect the new generation/include mechanism. Add a regression test: adding a fake env var to env.ts triggers regeneration and the test re-passes without manual edits.

### Done (8)

- `task:p1-server-instructions` _(Either/P0)_ — Static initialize.instructions (cold-start workflow, response contract, gating) mirrored at fdpm://guide; 18 tool descriptions deduplicated; catalog 25,699 → 23,567 B, budget ratcheted to 26,000. Shipped 33c774b + 6689bfd (SPEC-MCP-SERVER 0.1.4 §8.6, ADR decision:0007, GH #10).
- `task:p1-plugin-prompts` _(Either/P0)_ — Plugin MCP prompts as skills: ctx.registerPrompt + registry, prompts/list (metadata) + prompts/get (validated body), skill contract and budgets, planning/triage\_iteration, CLI plugin prompts|prompt, SDK listPrompts/renderPrompt. Shipped 8ecaf14 (SPEC 0.1.7 §13.5, decision:0010).
- `task:p1-catalog-budget` _(Either/P0)_ — Measure and cap the advertised tools/list catalog (28,000 B / 2,000 B per tool) at boot and in CI; fdpm://schema/profile resource; opaque fdpm.profile.register input validated server-side. Shipped fe03e34 (SPEC-MCP-SERVER 0.1.3, ADR decision:0006, GH #9).
- `task:p2-dry-run` _(Either/P0)_ — Every Tier-3 tool accepts dry\_run: would-affect preview via src/core/operations/delete-preview.ts (also CLI --dry-run and SDK preview\*Delete); passes the destructive and confirmation gates; appends nothing. Shipped 8279af2 (SPEC-MCP-SERVER 0.1.5 §8.7).
- `task:p2-idempotency` _(Either/P0)_ — Real Tier-3 calls require idempotency\_key; session cache (tool, key) → result, TTL 5 min, cap 1,000: same args replay (audit replayed:true), different args conflict/idempotency\_key\_reused, concurrent same-key calls coalesce. Shipped 8279af2.
- `task:p2-audit-gates` _(Either/P1)_ — Start audit entry is the intent record (written before the handler) with tier/idempotency\_key/dry\_run; complete carries replayed/dry\_run. ADJUSTED: the 100 ms debounce was not adopted — with keys mandatory it only refuses legitimate deletes (decision:0008). Shipped 8279af2.
- `task:p2-tests` _(Either/P0)_ — tier3-dry-run (13), tier3-idempotency (14), delete-preview (9), pre-execution audit, stdio E2E dry-run through the disabled gate, SDK previews, CLI --dry-run (6). Suite 148 files / 1,288+ tests green at 8279af2.
- `task:p2-audit-report` _(Either/P1)_ — Audit flywheel: Tier-2 rejections record rule\_ids; mcp-audit.jsonl aggregated into per-tool outcomes, error classes and a success-rate SLO; served as fdpm://audit/report\[/{window}\], fdpm mcp audit-report, SDK auditReport. Shipped d05bc8b (SPEC 0.1.6 §9.5, decision:0009).
