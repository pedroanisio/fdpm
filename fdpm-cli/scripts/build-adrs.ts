/**
 * Build a `software-architecture` workbook that contains every ADR
 * recorded for the FDPM CLI codebase, then render the canonical
 * `decisions.md` ADR document via the `sw:ADRRenderer`.
 *
 * Source corpus
 * -------------
 * decision:0001 .. decision:0005 are the same decisions encoded in
 * `scripts/build-cli-architecture.ts`; decision:0006 onward are recorded
 * here first.
 * That script bundles them inside a much larger architecture workbook;
 * this script isolates the ADR surface so the rendered Markdown is
 * exactly the architectural decision record and nothing else.
 *
 * If new ADRs are added to the codebase, add them to the `decisions`
 * array below — `decision:000N` ids are sortable and the renderer
 * orders sections by id.
 *
 * Run with:
 *   FDPM_DATA_DIR=/tmp/fdpm-adrs npx tsx scripts/build-adrs.ts
 *
 * Output:
 *   - Workbook `fdpm-cli-adrs` persisted under FDPM_DATA_DIR.
 *   - `docs/adrs/decisions.md` at the repository root (override with --out).
 *     The directory is created if it does not exist.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  openHost,
  defineProject,
  renderProject,
  type PrimitiveSpec,
  type RelationSpec,
} from "../src/sdk.js";
import {
  PROFILE_ID,
  SCOPE_IDS,
} from "../plugins/software_architecture/index.js";

const PROJECT_ID = "fdpm-cli-adrs";

// ── Decisions ──────────────────────────────────────────────────────────────
//
// Lifted verbatim from scripts/build-cli-architecture.ts so the two
// scripts stay byte-faithful for the shared decision ids. The
// `sw:Decision` schema requires status / title / context / rationale /
// alternatives (>=1) / consequences; date and deciders are optional and
// omitted here because the source corpus does not record them.

interface DecisionInput {
  id: string;
  title: string;
  context: string;
  rationale: string;
  consequences: string;
  altName: string;
  altReason: string;
}

const decisions: DecisionInput[] = [
  {
    id: "decision:0001",
    title: "Event-sourced Store with JSONL persistence",
    context:
      "The CLI must support deterministic replay, undo, time-travel diff, and audit (SPEC-CORE §5.5).",
    rationale:
      "Persisting an append-only stream of typed Operations and projecting them into Store gives replayability and audit for free; rebuild-from-log is a single primitive.",
    consequences:
      "Every state change must go through Operation. Snapshots are derived, never authoritative. Disk format is text-grep-friendly but unbounded; rotation is a future concern.",
    altName: "Direct mutation with periodic snapshots",
    altReason:
      "Loses replay/undo and forces ad-hoc audit; conflicts with SPEC-CORE §5.5 / §13.3.",
  },
  {
    id: "decision:0002",
    title: "Plugin contributions are pure data",
    context:
      "Profiles, validators, and renderers must be loadable from third-party packages without trusting their code paths beyond the activation hook.",
    rationale:
      "Plugins register PROFILE objects (data) plus capabilities (named functions); the Host treats the contributed schema as the source of truth and never invokes plugin code on hot validation paths unless a cap:validator is registered.",
    consequences:
      "Vocabulary plugins (e.g. software-architecture) can ship without any executable code. Plugins that want enforcement must opt in via cap:validator. Predicate DSL on declarative-only rules is not evaluated by the Core.",
    altName: "Mandatory executable validators per plugin",
    altReason:
      "Forces every vocabulary contributor to ship runtime code; raises trust surface unnecessarily.",
  },
  {
    id: "decision:0003",
    title: "Validation runs on the proposed post-state, before append",
    context:
      "An invalid primitive must never reach the Store projection or the JSONL log.",
    rationale:
      "Host.runWithValidation builds the proposed instance, runs ValidationPipeline, and only then calls Store.append. Failures produce a structured ValidationReport and abort the operation.",
    consequences:
      "Each write costs one full validation pass. Touched-paths optimization on patch operations limits the cost. Trust-tier gating composes cleanly with this order.",
    altName: "Validate after append, then revert on failure",
    altReason:
      "Pollutes the log with rejected operations and weakens the §8 gate's invariant.",
  },
  {
    id: "decision:0004",
    title: "TypeScript port preserves Python source idioms byte-faithfully",
    context:
      "The CLI is a port of a prior Python implementation that used a legacy DSL (StructField[X], min_items, has_relation, etc.).",
    rationale:
      "Port at parity first, evolve later. Quirks like single-valued StructField with min_items are preserved verbatim so existing exports validate identically.",
    consequences:
      "Some field shapes look counterintuitive in TS (single-object struct fields). Documented as known idiosyncrasies in plugin READMEs.",
    altName: "Idiomatic TypeScript redesign",
    altReason:
      "Breaks compatibility with existing workbook transfers; expands scope beyond the port.",
  },
  {
    id: "decision:0005",
    title: "Commander as the CLI dispatcher",
    context:
      "The CLI exposes a noun/verb surface aligned with SPEC-CORE §9 HTTP routes.",
    rationale:
      "Commander is mature, ESM-native, and matches the noun→verb tree without custom routing.",
    consequences:
      "Help text, --json flags, and subcommand discovery come for free. Ties argv parsing to Commander's conventions.",
    altName: "Hand-rolled argv parser",
    altReason: "Reinvents flags/help/error handling with no benefit.",
  },
  {
    id: "decision:0006",
    title:
      "MCP tool catalog is a measured, capped byte budget; payload schemas ship as resources",
    context:
      "Every MCP session pays for the whole tools/list registry before the agent does any work. On manifest 0.1.0 the 30-tool catalog measured 33,929 bytes, 8,809 of them the DomainProfile schema inlined into fdpm.profile.register. PURPOSE.md commits to per-verb plugin tools across five bundled plugins, so an unmeasured catalog only grows.",
    rationale:
      "Registry cost is roughly tools × schema size × result verbosity and is invisible unless measured. A byte budget enforced in CI and at boot (src/mcp/catalog.ts: 28,000 B total, 2,000 B per tool, a ratchet on the measured size) makes growth a reviewed decision; plugin tools share the budget so verbs can never bulk-advertise. Large payload schemas move to resources (fdpm://schema/profile), validated server-side with the same Zod object.",
    consequences:
      "Adding or widening a tool can fail the build or refuse boot; raising the budget needs a CHANGELOG line (FDPM_MCP_CATALOG_BUDGET_BYTES is the operator escape hatch, total only). A malformed profile is a Tier-2 rejection envelope, not a protocol error. Agents read a resource before composing a profile.",
    altName: "Keep inlining full JSON Schemas per tool and rely on review to notice growth",
    altReason:
      "No reviewer sees the total; the 8.8 KB profile schema shipped through four manifest revisions without anyone measuring it.",
  },
  {
    id: "decision:0007",
    title:
      "Server-generic orientation ships once in initialize.instructions, mirrored at fdpm://guide, not in every tool description",
    context:
      "A cold agent needs call order, the response contract, and rejection recovery before its first call. Until manifest 0.2.0 that prose was pasted into 13 Tier-2 and 5 Tier-3 descriptions and re-sent on every tools/list; PURPOSE.md's eval asks whether a cold agent can drive a workbook on first contact, and plugin prompts (the per-domain layer) are still v0.2.",
    rationale:
      "MCP initialize.instructions is placed in the model context once per session — the right cost profile for text true of every tool. Keeping it static (no runtime state; fdpm.health reports state) makes it byte-identical to a fdpm://guide resource for clients that ignore instructions, and testable without a server. A 4,000 B budget plus CI drift guards (every registry URI template named, no unknown tool named) keep it honest.",
    consequences:
      "Descriptions keep only tool-specific facts; a dedup test fails the build if generic prose creeps back. Catalog shrank 25,699 → 23,567 B and the budget ratcheted to 26,000. Agents get one place to learn the contract; prompts will compose on top, not replace it.",
    altName: "Wait for plugin-shipped MCP prompts (v0.2) to carry orientation",
    altReason:
      "Prompts are per-domain and user-invoked; the server-generic contract would still have to live somewhere the agent sees on first contact, and v0.2 has no date.",
  },
  {
    id: "decision:0008",
    title:
      "Make Tier-3 deletes previewable and retry-safe: dry_run previews plus mandatory idempotency keys; no time-based debounce",
    context:
      "Deletes over MCP were neither retry-safe nor previewable: a retried delete could run twice, and an agent had no way to show an operator what a delete would remove. The 2026-Q2 roadmap (task p2-audit-gates) also proposed a 100 ms same-workbook debounce refusing any re-issue without the same key.",
    rationale:
      "Idempotency keys are the established answer to unsafe retries (session-scoped TTL cache with atomic check-then-execute; refuse key reuse with different parameters), and a dry-run preview is the established precaution before destructive actions. With keys mandatory, a time-based debounce adds nothing but false refusals of legitimate distinct deletes and timing-dependent tests, so it is rejected. One core preview module serves MCP, CLI and SDK.",
    consequences:
      "Every real Tier-3 call needs idempotency_key (a tightening on the destructive surface only); same key + same args replays, different args conflicts. dry_run passes the destructive and confirmation gates because it has no side effect. The audit start entry becomes the intent record. No debounce; the roadmap task is recorded as adjusted.",
    altName: "Time-based debounce (refuse a same-workbook re-issue within 100 ms without the same key)",
    altReason:
      "Refuses legitimate distinct deletes issued in quick succession, adds nothing once keys are mandatory, and makes conformance tests timing-dependent.",
  },
  {
    id: "decision:0009",
    title:
      "Close the audit flywheel: record rule_ids on rejections and serve an aggregated audit report as a resource, CLI command and SDK call",
    context:
      "mcp-audit.jsonl recorded every call's outcome, but nothing read it: no one could say which tool, evidence.reason or rule_id failed most, so changes to descriptions, instructions and profiles were driven by taste. Tier-2 rejections did not even record which rules fired.",
    rationale:
      "Honeycomb's MCP server showed the flywheel that works: instrument where tools fail, set a success SLO, turn the error classes into eval cases. Recording rule_ids on rejections gives the class; a typed reader aggregates per tool, reason and rule with an SLO shortfall; serving it as a resource keeps reads off the tool catalog and lets any client or human pull it. One module behind resource, CLI and SDK.",
    consequences:
      "Tier-2 rejection audit entries carry rule_ids (additive). The flywheel's output is the backlog for the teaching surfaces and the seed set for PURPOSE.md's three-arm eval. Host gains a read-only dataDir getter (not exposed as a tool). No manifest bump.",
    altName: "Ship a Tier-1 fdpm.audit.report tool instead of a resource",
    altReason:
      "Costs catalog bytes on every session for an operator-facing read, and contradicts PURPOSE.md's rule that reads go through resources.",
  },
];

const decisionSpecs: PrimitiveSpec[] = decisions.map((d) => ({
  id: d.id,
  type: "sw:Decision",
  scope: SCOPE_IDS.domain,
  fields: {
    status: "Accepted",
    title: d.title,
    context: d.context,
    rationale: d.rationale,
    alternatives: { name: d.altName, reason_rejected: d.altReason },
    consequences: d.consequences,
  },
}));

// ── Evidence + Justifies edges ─────────────────────────────────────────────
//
// The ADR renderer reads `sw:Justifies` (Evidence → Decision) and emits
// an "Evidence" section per decision. The three pairings below mirror
// build-cli-architecture.ts so the rendered ADR document matches.

const evidenceSpecs: PrimitiveSpec[] = [
  {
    id: "evidence:ref:host-source",
    type: "sw:Evidence",
    fields: {
      kind: "Reference",
      source: "fdpm-cli/src/core/host.ts",
      description:
        "Host class — composes Store, ProfileRegistry, ValidationPipeline, persistence, and PluginRuntime.",
    },
  },
  {
    id: "evidence:ref:plugin-runtime",
    type: "sw:Evidence",
    fields: {
      kind: "Reference",
      source: "fdpm-cli/src/plugin/runtime.ts",
      description:
        "PluginRuntime — discovery, activation, capability registration, lifecycle hooks.",
    },
  },
  {
    id: "evidence:ref:cli-bin",
    type: "sw:Evidence",
    fields: {
      kind: "Reference",
      source: "fdpm-cli/src/bin/fdpm.ts",
      description:
        "CLI entry point — Commander wiring and command dispatch.",
    },
  },
  {
    id: "evidence:ref:mcp-catalog",
    type: "sw:Evidence",
    fields: {
      kind: "Reference",
      source: "fdpm-cli/src/mcp/catalog.ts",
      description:
        "Tool-catalog measurement and byte budget — buildToolsListEntries, measureCatalog, checkCatalogBudget; enforced at boot by fdpm-mcp and in CI by tests/mcp/catalog-budget.test.ts.",
    },
  },
  {
    id: "evidence:ref:mcp-instructions",
    type: "sw:Evidence",
    fields: {
      kind: "Reference",
      source: "fdpm-cli/src/mcp/instructions.ts",
      description:
        "SERVER_INSTRUCTIONS — static cold-start orientation, INSTRUCTIONS_BUDGET_BYTES, checkInstructionsBudget; served on initialize and at fdpm://guide; contract in tests/mcp/instructions.test.ts.",
    },
  },
  {
    id: "evidence:ref:mcp-tier3",
    type: "sw:Evidence",
    fields: {
      kind: "Reference",
      source: "fdpm-cli/src/mcp/dispatch.ts",
      description:
        "Dispatcher step 5b — idempotency cache lookup/replay/conflict/coalescing and the dry_run gate bypass; previews in src/core/operations/delete-preview.ts; tests tier3-dry-run / tier3-idempotency.",
    },
  },
  {
    id: "evidence:ref:mcp-audit-report",
    type: "sw:Evidence",
    fields: {
      kind: "Reference",
      source: "fdpm-cli/src/persistence/mcp-audit-report.ts",
      description:
        "Typed JSONL parse and aggregation (totals, per-tool rows, error classes, SLO, percentiles); served by src/mcp/resources/audit.ts, src/commands/mcp.ts and sdk.auditReport; tests audit-report / resources-audit / cli-audit-report.",
    },
  },
];

const relations: RelationSpec[] = [
  {
    id: "rel:host-src-justifies-d3",
    type: "sw:Justifies",
    from: "evidence:ref:host-source",
    to: "decision:0003",
  },
  {
    id: "rel:plugin-rt-justifies-d2",
    type: "sw:Justifies",
    from: "evidence:ref:plugin-runtime",
    to: "decision:0002",
  },
  {
    id: "rel:cli-bin-justifies-d5",
    type: "sw:Justifies",
    from: "evidence:ref:cli-bin",
    to: "decision:0005",
  },
  {
    id: "rel:mcp-catalog-justifies-d6",
    type: "sw:Justifies",
    from: "evidence:ref:mcp-catalog",
    to: "decision:0006",
  },
  {
    id: "rel:mcp-instructions-justifies-d7",
    type: "sw:Justifies",
    from: "evidence:ref:mcp-instructions",
    to: "decision:0007",
  },
  {
    id: "rel:mcp-tier3-justifies-d8",
    type: "sw:Justifies",
    from: "evidence:ref:mcp-tier3",
    to: "decision:0008",
  },
  {
    id: "rel:mcp-audit-justifies-d9",
    type: "sw:Justifies",
    from: "evidence:ref:mcp-audit-report",
    to: "decision:0009",
  },
];

// ── Output path (--out=path overrides default) ─────────────────────────────

function parseOutPath(): string {
  const arg = process.argv.find((a) => a.startsWith("--out="));
  const fromArg = arg ? arg.slice("--out=".length) : null;
  // Default lands in docs/adrs/decisions.md at the repo root. The
  // script lives at fdpm-cli/scripts/, so the repo root is two levels
  // up. Using a URL relative to import.meta.url keeps this stable
  // regardless of the caller's CWD.
  const defaultPath = new URL("../../docs/adrs/decisions.md", import.meta.url)
    .pathname;
  return resolve(fromArg ?? defaultPath);
}

async function main(): Promise<void> {
  const host = await openHost();

  const built = await defineProject(host, {
    id: PROJECT_ID,
    name: "FDPM CLI — Architectural Decision Records",
    profile: PROFILE_ID,
    description:
      "Every architectural decision recorded for the @fdpm/cli package, captured as sw:Decision primitives under the fdpm.software-architecture profile.",
  })
    .primitives([...decisionSpecs, ...evidenceSpecs])
    .relations(relations)
    .commit();

  console.log("Built ADR workbook:", built.workbook_id);
  console.log("  decisions:", decisionSpecs.length);
  console.log("  evidence: ", evidenceSpecs.length);
  console.log("  edges:    ", relations.length);
  console.log("  revision: ", built.revision);

  const rendered = await renderProject(host, {
    workbook: PROJECT_ID,
    target: "text/markdown",
    // The SDK's flat-args convention drops `_id`/`Id` suffixes on
    // input fields (see RenderOptions in sdk.ts), so pass `renderer`
    // not `rendererId`. Required to disambiguate from
    // `fdpm.formal-specification`'s `fs:SpecRenderer`, which also
    // registers under target=text/markdown.
    renderer: "sw:ADRRenderer",
  });

  const outPath = parseOutPath();
  // ADR renderer returns either a string or a Buffer/Uint8Array under
  // `bytes`; the markdown branch is a string.
  const body =
    typeof rendered.bytes === "string"
      ? rendered.bytes
      : Buffer.from(rendered.bytes).toString("utf8");
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, body, "utf8");
  console.log("Rendered ADR document:", outPath);
  console.log("  pluginId: ", rendered.pluginId);
  console.log("  renderer: ", rendered.rendererId);
  console.log("  bytes:    ", body.length);
}

main().catch((e) => {
  console.error("FAILED:", e);
  if (e && typeof e === "object" && "findings" in e) {
    console.error(
      "Findings:",
      JSON.stringify((e as { findings: unknown }).findings, null, 2),
    );
  }
  process.exit(1);
});
