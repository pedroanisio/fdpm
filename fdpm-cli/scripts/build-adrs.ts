/**
 * Build a `software-architecture` project that contains every ADR
 * recorded for the FDPM CLI codebase, then render the canonical
 * `decisions.md` ADR document via the `sw:ADRRenderer`.
 *
 * Source corpus
 * -------------
 * The five ADRs below are the same decisions encoded in
 * `scripts/build-cli-architecture.ts` (decision:0001 .. decision:0005).
 * That script bundles them inside a much larger architecture project;
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
 *   - Project `fdpm-cli-adrs` persisted under FDPM_DATA_DIR.
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
      "Breaks compatibility with existing project transfers; expands scope beyond the port.",
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

  console.log("Built ADR project:", built.project_id);
  console.log("  decisions:", decisionSpecs.length);
  console.log("  evidence: ", evidenceSpecs.length);
  console.log("  edges:    ", relations.length);
  console.log("  revision: ", built.revision);

  const rendered = await renderProject(host, {
    project: PROJECT_ID,
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
