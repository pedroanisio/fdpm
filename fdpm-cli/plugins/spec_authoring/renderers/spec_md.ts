/**
 * `text/markdown` renderer for spec:Document graphs.
 *
 * Walks every spec:* primitive and assembles a complete SPEC document
 * matching the SPEC-CORE / SPEC-MCP-SERVER house style:
 *
 *   - YAML frontmatter (disclaimer, generated_by, date, revision, status)
 *   - PALS-LAW banner blockquote
 *   - "## Disclaimer" pointing at @DISCLAIMER.md
 *   - "## 0. Document Status" canonical table
 *   - User-authored Sections (sorted by `number`)
 *   - Auto-included sections by `kind`:
 *       definitions          → spec:Term table
 *       stakeholders         → Stakeholder/Concern table
 *       quality_attributes   → QA table
 *       capability_table     → spec:Capability table
 *       tool_surface         → tiered Tool tables
 *       schema               → SchemaDefinition fenced blocks
 *       scenarios            → SEI-format QAScenario blocks
 *       adr                  → ADR + Trade-off Matrix
 *       tradeoff_matrix      → Trade-off Matrix only
 *       error_taxonomy       → ErrorCategory table
 *       configuration        → ConfigEntry table
 *       acceptance_criteria  → AC numbered list
 *       conformance          → ConformanceItem list
 *       risks                → Risk × Mitigation table
 *       open_questions       → OpenQuestion block (one-blocking discipline)
 *       future_work          → FutureWork bullet list
 *       implementation_plan  → ImplementationChange table
 *       migration            → MigrationStep ordered list
 *       revision_history     → Revision blocks (newest first)
 *       references           → Reference list with verification posture
 *
 *   - Closing References list (always emitted if any spec:Reference exists,
 *     even when no section of kind='references' is authored — citations
 *     without a bibliography is the failure mode we exist to prevent).
 *
 * The renderer reacts to `template_id` via project-level options if the
 * caller threads it through; absent that, it produces the full SPEC.
 */
import type { RendererFn, RendererOutput } from "../../../src/plugin/types.js";
import type { PrimitiveInstance, RelationInstance } from "../../../src/core/models/instance.js";
import type { RenderFinding } from "../../../src/core/render/template.js";

type FV = Record<string, unknown>;
function fv<T = unknown>(p: PrimitiveInstance, key: string): T | undefined {
  return (p.field_values as FV)[key] as T | undefined;
}
function fvs(p: PrimitiveInstance, key: string): string {
  const v = fv<unknown>(p, key);
  if (v === undefined || v === null) return "";
  return typeof v === "string" ? v : String(v);
}
function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}
function nonEmpty(s: string | undefined): boolean {
  return !!s && s.trim().length > 0;
}
function escapeCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

interface Ctx {
  primitives: readonly PrimitiveInstance[];
  relations: readonly RelationInstance[];
  byId: Map<string, PrimitiveInstance>;
  doc: PrimitiveInstance | undefined;
  findings: RenderFinding[];
  renderDsl: Parameters<RendererFn>[0]["renderDsl"];
  outgoing: Map<string, Map<string, string[]>>; // src → typeId → [tgt]
  incoming: Map<string, Map<string, string[]>>; // tgt → typeId → [src]
  /**
   * SPEC-SECTIONS-TREE v0.2 §6.4 — dnis:Node id → §N.M.K heading map.
   * Built once at renderer entry by buildSectionIndex(); consumed by
   * the `fn.section_of` helper (helper-set v1.2.0) when this map is
   * threaded through the renderTemplate facade. Empty when the project
   * contains no dnis:Document.
   */
  sectionIndex: Map<string, string>;
}

function buildCtx(
  primitives: readonly PrimitiveInstance[],
  relations: readonly RelationInstance[],
  renderDsl: Parameters<RendererFn>[0]["renderDsl"],
): Ctx {
  const byId = new Map<string, PrimitiveInstance>();
  for (const p of primitives) byId.set(p.id, p);
  const outgoing = new Map<string, Map<string, string[]>>();
  const incoming = new Map<string, Map<string, string[]>>();
  for (const r of relations) {
    if (!outgoing.has(r.source_id)) outgoing.set(r.source_id, new Map());
    const o = outgoing.get(r.source_id)!;
    if (!o.has(r.type_id)) o.set(r.type_id, []);
    o.get(r.type_id)!.push(r.target_id);

    if (!incoming.has(r.target_id)) incoming.set(r.target_id, new Map());
    const i = incoming.get(r.target_id)!;
    if (!i.has(r.type_id)) i.set(r.type_id, []);
    i.get(r.type_id)!.push(r.source_id);
  }
  // Heuristic: if there's exactly one Document in the project, that's the doc.
  // Otherwise pick the first by id (sorted) so output is deterministic.
  const docs = primitives
    .filter((p) => p.type_id === "spec:Document")
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));
  return {
    primitives,
    relations,
    byId,
    doc: docs[0],
    findings: [],
    renderDsl,
    outgoing,
    incoming,
    // Empty by default; populated by populateSectionIndex() at the
    // renderSpecMarkdown entry point if the project contains a dnis:
    // Document. Building it before any renderSection call keeps the
    // §N.M.K resolution available to every template anywhere in the
    // document, not just inside the section body.
    sectionIndex: new Map<string, string>(),
  };
}

/**
 * Walk the dnis:Node graph DFS to build the §N.M.K → NodeId map for
 * `fn.section_of`. Both the bare NID (the `uid` field) and the slug-form
 * primitive id (`p.id`, e.g. "dnis:node:01k…") are inserted so callers
 * can lookup either form. Idempotent: safe to call twice; later calls
 * overwrite. Returns the count of indexed nodes (for diagnostics).
 *
 * Mirrors the DFS in renderSectionsFromDnis but emits NO output — pure
 * index construction. Splitting these is what makes the index available
 * BEFORE any rendering begins.
 */
function populateSectionIndex(ctx: Ctx): number {
  const sections = collectActiveDnisSections(ctx.primitives);
  if (sections.length === 0) return 0;
  return walkSectionTree(sections, ctx.sectionIndex, (node) => {
    const content = parseDnisContent(ctx, node);
    return {
      slug: deriveSectionSlug(content),
      ...(content.number_override !== undefined && {
        numberOverride: content.number_override,
      }),
    };
  });
}

/**
 * Build a fresh §N.M.K → id index from a project's primitives — same
 * algorithm as the renderer's internal populateSectionIndex but
 * decoupled from the renderer's Ctx so callers (and tests) can
 * exercise the indexing logic without spinning up a full render.
 *
 * The returned map is keyed by, for every active dnis:Node section:
 *   - the bare NID (SPEC-CORE primitive `uid`)
 *   - the slug-form primitive id (`p.id`, e.g. "dnis:node:01k…")
 *   - the author-supplied `content.ref_slug` (if present), prefixed
 *     with `section:` if the author didn't already
 *   - the title-derived slug `section:<lowercased-hyphenated>` (if no
 *     ref_slug). Title collisions across the document get
 *     `-2`, `-3`, … suffixes in DFS order.
 *
 * SPEC-RENDER-DSL v0.1.7 / helper-set v1.2.0 §6.4 fn.section_of.
 */
export function buildSectionIndex(
  primitives: readonly PrimitiveInstance[],
): Map<string, string> {
  const out = new Map<string, string>();
  const sections = collectActiveDnisSections(primitives);
  if (sections.length === 0) return out;
  walkSectionTree(sections, out, (node) => {
    // Tests exercise this path; we don't need the rendering finding
    // surface, so skip parseDnisContent's diagnostic emission and
    // parse content directly. Returns the empty meta on bad shape.
    const raw = ((node.field_values as Record<string, unknown>)["content"] ?? "") as string;
    if (typeof raw !== "string" || raw.length === 0) return { slug: null };
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { slug: null };
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { slug: null };
    }
    const obj = parsed as Record<string, unknown>;
    const content: DnisSectionContent = {
      title: typeof obj["title"] === "string" ? (obj["title"] as string) : "",
      body_md: typeof obj["body_md"] === "string" ? (obj["body_md"] as string) : "",
      ...(typeof obj["ref_slug"] === "string" && { ref_slug: obj["ref_slug"] as string }),
    };
    return {
      slug: deriveSectionSlug(content),
      ...(typeof obj["number_override"] === "string" && {
        numberOverride: obj["number_override"] as string,
      }),
    };
  });
  return out;
}

function collectActiveDnisSections(
  primitives: readonly PrimitiveInstance[],
): readonly PrimitiveInstance[] {
  const dnisRoot = primitives.find((p) => p.type_id === "dnis:Document");
  if (!dnisRoot) return [];
  return primitives.filter(
    (p) =>
      p.type_id === "dnis:Node" &&
      fvs(p, "kind") === "section" &&
      !nonEmpty(fvs(p, "retired_at")),
  );
}

/**
 * Shared DFS used by both the renderer's populateSectionIndex (which
 * surfaces parseDnisContent findings) and the public buildSectionIndex
 * (which returns a fresh map). The per-node callback supplies the
 * slug (for the slug-keyed entry) and an optional numberOverride
 * (which becomes the entry's value in place of the DFS path label —
 * see DnisSectionContent.number_override). Both fields are
 * independent; either or both can be unset.
 */
interface SectionMetaForIndex {
  readonly slug: string | null;
  readonly numberOverride?: string;
}
function walkSectionTree(
  sections: readonly PrimitiveInstance[],
  index: Map<string, string>,
  metaFor: (node: PrimitiveInstance) => SectionMetaForIndex,
): number {
  const byParentNid = new Map<string, PrimitiveInstance[]>();
  for (const n of sections) {
    const parent = fvs(n, "parent_node_id") || "";
    if (!byParentNid.has(parent)) byParentNid.set(parent, []);
    byParentNid.get(parent)!.push(n);
  }
  for (const [, group] of byParentNid) {
    group.sort((a, b) => fvs(a, "position").localeCompare(fvs(b, "position")));
  }
  let count = 0;
  const slugOccurrences = new Map<string, number>();
  function dfs(parentNid: string, ancestorPath: number[]): void {
    const children = byParentNid.get(parentNid) ?? [];
    for (let i = 0; i < children.length; i += 1) {
      const child = children[i]!;
      const path = [...ancestorPath, i + 1];
      const meta = metaFor(child);
      // §-number used in the index is the override when present, else
      // the DFS path label. Cross-references via fn.section_of resolve
      // to whatever the rendered heading prints.
      const number = meta.numberOverride ?? path.join(".");
      // Both id forms (NID + slug-form primitive id).
      index.set(child.uid, number);
      index.set(child.id, number);
      // Slug-keyed entry; collisions get `-2`, `-3`, … in DFS order.
      const baseSlug = meta.slug;
      if (baseSlug) {
        const seen = slugOccurrences.get(baseSlug) ?? 0;
        const finalSlug = seen === 0 ? baseSlug : `${baseSlug}-${seen + 1}`;
        slugOccurrences.set(baseSlug, seen + 1);
        index.set(finalSlug, number);
      }
      count += 1;
      dfs(child.uid, path);
    }
  }
  dfs("", []);
  return count;
}

function out(src: string, type: string, ctx: Ctx): string[] {
  return ctx.outgoing.get(src)?.get(type) ?? [];
}
function inc(tgt: string, type: string, ctx: Ctx): string[] {
  return ctx.incoming.get(tgt)?.get(type) ?? [];
}

/**
 * Emit a renderer-level diagnostic. RenderFinding (src/core/render/template.ts:12)
 * is shaped for render-DSL parser/evaluator errors; we reuse it for
 * renderer-side findings by setting `expression` to the rule_id and
 * leaving line/column at 0. The `templateId` carries the rule_id so
 * downstream consumers can group these alongside DSL findings.
 */
function pushRendererFinding(ctx: Ctx, rule_id: string, message: string): void {
  ctx.findings.push({
    kind: "render-error",
    templateId: rule_id,
    line: 0,
    column: 0,
    expression: rule_id,
    message,
  });
}

// ── Frontmatter, banner, status ──────────────────────────────────

function renderFrontmatter(doc: PrimitiveInstance): string[] {
  const date = fvs(doc, "date") || new Date().toISOString().slice(0, 10);
  const generatedBy = fvs(doc, "generated_by") || "fdpm.spec-authoring";
  const revision = fvs(doc, "revision_note");
  const status = fvs(doc, "status") || "Draft";
  const sourceScript = fvs(doc, "source_script");
  const lines = [
    "---",
    "disclaimer:",
    "  notice: >-",
    "    No information within this document should be taken for granted.",
    "    Any statement or premise not backed by a real logical definition",
    "    or verifiable reference may be invalid, erroneous, or a hallucination.",
    `  generated_by: "${generatedBy}"`,
    `  date: "${date}"`,
    // Machine-readable provenance — distinct from `disclaimer` so static
    // tools can detect "this is a generated artefact" without parsing
    // prose. The visible banner immediately below the H1 is the
    // human-facing counterpart; this block is for CI / lint / pre-commit.
    "generated:",
    "  warning: >-",
    "    This document is generated. Edits made directly to this file will",
    "    be lost on the next render. Update the source script and re-run.",
    "  by: \"fdpm.spec-authoring renderer (spec:SpecMarkdownRenderer)\"",
  ];
  if (nonEmpty(sourceScript)) lines.push(`  source_script: ${JSON.stringify(sourceScript)}`);
  if (nonEmpty(revision)) lines.push(`revision: ${JSON.stringify(revision)}`);
  lines.push(`status: "${status}"`);
  lines.push("---", "");
  return lines;
}

function renderGeneratedBanner(doc: PrimitiveInstance): string[] {
  // Sits between the H1 and the PALS banner. Uses a heavy GitHub-style
  // alert so the warning is impossible to miss in any Markdown renderer
  // that supports admonitions; falls back to a plain blockquote
  // otherwise. The banner is unconditional (every spec:Document is
  // rendered, therefore every output is generated) — there is no
  // pals_banner-style toggle for it.
  const sourceScript = fvs(doc, "source_script");
  const regenCmd = fvs(doc, "regeneration_command");

  const lines: string[] = [
    "> [!WARNING]",
    "> **GENERATED DOCUMENT — DO NOT EDIT THIS FILE.**",
    ">",
    "> This file is rendered from a typed object graph by the",
    "> `fdpm.spec-authoring` plugin's `spec:SpecMarkdownRenderer`. Any",
    "> direct edits will be silently overwritten on the next render and",
    "> will not round-trip through the build pipeline.",
  ];
  if (nonEmpty(sourceScript)) {
    lines.push(">", `> **Source of truth:** \`${sourceScript}\``);
  }
  if (nonEmpty(regenCmd)) {
    lines.push(">", "> **Regenerate with:**", ">", "> ```bash");
    for (const ln of regenCmd.split("\n")) lines.push(`> ${ln}`);
    lines.push("> ```");
  }
  lines.push("");
  return lines;
}

function renderPalsBanner(doc: PrimitiveInstance): string[] {
  if (fv<boolean>(doc, "pals_banner") === false) return [];
  const ext = fvs(doc, "pals_extension");
  const lines = [
    "> **ARCHITECTURAL REQUIREMENT (PALS's LAW):** LLMs will always produce some",
    "> form of error. Absence of output verification is a design defect, not a",
    "> runtime bug. All LLM output must be treated as untrusted and validated",
    "> explicitly.",
  ];
  if (nonEmpty(ext)) {
    lines.push(">");
    for (const ln of ext.split("\n")) lines.push(`> ${ln}`);
  }
  lines.push("");
  return lines;
}

function renderDisclaimer(doc: PrimitiveInstance): string[] {
  const path = fvs(doc, "disclaimer_path") || "../../DISCLAIMER.md";
  return [
    "## Disclaimer",
    "",
    `This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](${path}).`,
    "> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.",
    "",
    "---",
    "",
  ];
}

function renderStatus(doc: PrimitiveInstance): string[] {
  const lines = ["## 0. Document Status", "", "| Field | Value |", "| --- | --- |"];
  const row = (k: string, v: string) => {
    if (nonEmpty(v)) lines.push(`| ${escapeCell(k)} | ${escapeCell(v)} |`);
  };
  row("Spec ID", fvs(doc, "spec_id"));
  row("Version", fvs(doc, "version"));
  row("Status", fvs(doc, "status"));
  row("Audience", fvs(doc, "audience"));
  const required = asArray<string>(fv(doc, "required_reads"));
  if (required.length > 0) row("Required reads", required.join(", "));
  row("Companion code", fvs(doc, "companion_code"));
  row("Peer SPEC", fvs(doc, "peer_spec"));
  row("Supersedes", fvs(doc, "supersedes"));
  row("Implements", fvs(doc, "implements"));
  for (const extra of asArray<{ field: string; value: string }>(fv(doc, "status_rows"))) {
    if (extra && nonEmpty(extra.field)) row(extra.field, extra.value ?? "");
  }
  lines.push("", "---", "");
  return lines;
}

// ── Auto-include sections by kind ────────────────────────────────

function renderDefinitionsTable(ctx: Ctx): string[] {
  const terms = ctx.primitives
    .filter((p) => p.type_id === "spec:Term")
    .slice()
    .sort((a, b) => fvs(a, "term").localeCompare(fvs(b, "term")));
  if (terms.length === 0) return [];
  const lines = ["| Term | Definition |", "| --- | --- |"];
  for (const t of terms) {
    const term = fvs(t, "term");
    const def = fvs(t, "definition");
    const syn = fvs(t, "synonyms");
    const cell = nonEmpty(syn) ? `${def} _(also: ${syn})_` : def;
    lines.push(`| **${escapeCell(term)}** | ${escapeCell(cell)} |`);
  }
  lines.push("");
  return lines;
}

function renderStakeholdersTable(ctx: Ctx): string[] {
  const stakeholders = ctx.primitives.filter((p) => p.type_id === "spec:Stakeholder");
  if (stakeholders.length === 0) return [];
  const lines = ["| Stakeholder | Primary concern |", "| --- | --- |"];
  for (const s of stakeholders) {
    const role = fvs(s, "role");
    const pc = fvs(s, "primary_concern");
    lines.push(`| ${escapeCell(role)} | ${escapeCell(pc)} |`);
  }
  lines.push("");
  return lines;
}

function renderQATable(ctx: Ctx): string[] {
  const qas = ctx.primitives.filter((p) => p.type_id === "spec:QualityAttribute");
  if (qas.length === 0) return [];
  const lines = ["| Attribute | Pressure |", "| --- | --- |"];
  for (const q of qas) {
    lines.push(`| **${escapeCell(fvs(q, "attribute"))}** | ${escapeCell(fvs(q, "pressure"))} |`);
  }
  lines.push("");
  return lines;
}

function renderToolSurface(ctx: Ctx): string[] {
  const tools = ctx.primitives.filter((p) => p.type_id === "spec:Tool");
  if (tools.length === 0) return [];
  const lines: string[] = [];
  for (const tier of ["read_only", "validating_write", "destructive"] as const) {
    const tt = tools.filter((t) => fvs(t, "tier") === tier);
    if (tt.length === 0) continue;
    lines.push(`### Tier — ${tier.replace("_", " ")}`, "");
    lines.push("| Tool | Backed by |", "| --- | --- |");
    for (const t of tt) {
      lines.push(`| \`${escapeCell(fvs(t, "tool_name"))}\` | ${escapeCell(fvs(t, "backed_by"))} |`);
    }
    lines.push("");
  }
  return lines;
}

function renderCapabilityTable(ctx: Ctx): string[] {
  const caps = ctx.primitives.filter((p) => p.type_id === "spec:Capability");
  if (caps.length === 0) return [];
  const lines = ["| Capability | Purpose | Multiplicity |", "| --- | --- | --- |"];
  for (const c of caps) {
    lines.push(
      `| \`${escapeCell(fvs(c, "capability_id"))}\` | ${escapeCell(fvs(c, "description"))} | ${escapeCell(fvs(c, "multiplicity") || "0..N")} |`,
    );
  }
  lines.push("");
  return lines;
}

function renderSchemas(ctx: Ctx): string[] {
  const schemas = ctx.primitives.filter((p) => p.type_id === "spec:SchemaDefinition");
  if (schemas.length === 0) return [];
  const lines: string[] = [];
  for (const s of schemas) {
    lines.push(`#### ${fvs(s, "name")}`, "");
    const dialect = fvs(s, "dialect");
    const fence = dialect === "json_schema_2020_12" ? "json" : dialect === "zod" ? "ts" : dialect;
    lines.push("```" + fence, fvs(s, "body"), "```", "");
  }
  return lines;
}

function renderScenarios(ctx: Ctx): string[] {
  const sc = ctx.primitives.filter((p) => p.type_id === "spec:QAScenario");
  if (sc.length === 0) return [];
  const lines: string[] = [];
  for (const s of sc) {
    lines.push(`### ${fvs(s, "title")}`, "", "```");
    // Match SPEC-REPL §14 / SPEC-MCP §14 spacing: label in [], 20-col gutter
    // before the value so multi-line values align under each other.
    const w = (label: string, key: string) => {
      const v = fvs(s, key);
      const gutter = " ".repeat(Math.max(1, 20 - (label.length + 2)));
      lines.push(`[${label}]${gutter}${v}`);
    };
    w("Source", "source");
    w("Stimulus", "stimulus");
    w("Environment", "environment");
    w("Artifact", "artifact");
    w("Response", "response");
    w("Response measure", "response_measure");
    lines.push("```", "");
  }
  return lines;
}

function renderPrinciples(ctx: Ctx): string[] {
  const ps = ctx.primitives
    .filter((p) => p.type_id === "spec:Principle")
    .slice()
    .sort((a, b) => (fv<number>(a, "ordinal") ?? 0) - (fv<number>(b, "ordinal") ?? 0));
  if (ps.length === 0) return [];
  const lines: string[] = [];
  for (const p of ps) {
    const strength = fvs(p, "strength");
    const tag = nonEmpty(strength) ? `(${strength}) ` : "";
    lines.push(`${fv(p, "ordinal")}. ${tag}**${fvs(p, "title")}** ${fvs(p, "statement")}`);
  }
  lines.push("");
  return lines;
}

/** Strip a trailing "." so we don't render "title.." after appending one. */
function rstripDot(s: string): string {
  return s.replace(/\.+$/, "");
}

function renderDecisionSummary(ctx: Ctx): string[] {
  const adrs = ctx.primitives.filter((p) => p.type_id === "spec:ADR");
  if (adrs.length === 0) return [];
  const lines: string[] = ["The decision in one paragraph per ADR:", ""];
  for (const a of adrs) {
    const decision = fvs(a, "decision");
    const adrId = fvs(a, "adr_id");
    if (!nonEmpty(decision)) continue;
    const title = rstripDot(fvs(a, "title"));
    lines.push(`> **${adrId} — ${title}.** ${decision}`, "");
  }
  return lines;
}

function renderADRs(ctx: Ctx): string[] {
  const adrs = ctx.primitives
    .filter((p) => p.type_id === "spec:ADR")
    .slice()
    .sort((a, b) => fvs(a, "adr_id").localeCompare(fvs(b, "adr_id")));
  if (adrs.length === 0) return [];
  const lines: string[] = [];
  for (const a of adrs) {
    // Render ADR inline (no enclosing code fence): SPEC-MCP §15's literal
    // ```markdown ... ``` wrap is one stylistic option in the source SPECs;
    // the inline form composes better with the renderer's heading depth and
    // lets readers click into the ADR's links.
    lines.push(
      `#### ${fvs(a, "adr_id")} — ${fvs(a, "title")}`,
      "",
      `- **Status:** ${fvs(a, "status")}`,
      `- **Date:** ${fvs(a, "date")}`,
      "",
      "##### Context",
      "",
      fvs(a, "context"),
      "",
      "##### Options considered",
      "",
    );
    const consideredIds = out(a.id, "spec:Considers", ctx);
    const chosenIds = out(a.id, "spec:Chose", ctx);
    for (const oid of consideredIds) {
      const opt = ctx.byId.get(oid);
      if (!opt) continue;
      const verdict = chosenIds.includes(oid) ? "chosen" : (fvs(opt, "verdict") || "considered");
      lines.push(`###### ${fvs(opt, "label")} _(${verdict})_`, "", fvs(opt, "description"), "");
      const pros = asArray<string>(fv(opt, "pros"));
      const cons = asArray<string>(fv(opt, "cons"));
      if (pros.length > 0) {
        lines.push("- Pros:");
        for (const p of pros) lines.push(`  - ${p}`);
      }
      if (cons.length > 0) {
        lines.push("- Cons:");
        for (const c of cons) lines.push(`  - ${c}`);
      }
      const rej = fvs(opt, "rejection_reason");
      if (nonEmpty(rej)) lines.push(`- Rejection reason: ${rej}`);
      lines.push("");
    }

    lines.push("##### Decision", "", fvs(a, "decision"), "", "##### Consequences", "");
    const cons = asArray<{ polarity: string; text: string }>(fv(a, "consequences"));
    for (const c of cons) {
      lines.push(`- ${c.polarity ? `**${c.polarity}**: ` : ""}${c.text}`);
    }
    lines.push("");

    const checks = asArray<string>(fv(a, "compliance_checks"));
    if (checks.length > 0) {
      lines.push("##### Compliance / verification", "");
      for (const ck of checks) lines.push(`- ${ck}`);
      lines.push("");
    }
    const revisit = asArray<string>(fv(a, "revisit_signals"));
    if (revisit.length > 0) {
      lines.push("##### Signals to revisit", "");
      for (const r of revisit) lines.push(`- ${r}`);
      lines.push("");
    }
  }
  return lines;
}

function renderTradeoffMatrix(ctx: Ctx): string[] {
  const adrs = ctx.primitives.filter((p) => p.type_id === "spec:ADR");
  if (adrs.length === 0) return [];
  const lines: string[] = [];
  for (const adr of adrs) {
    const axisIds = out(adr.id, "spec:HasTradeoff", ctx);
    if (axisIds.length === 0) continue;
    const optIds = out(adr.id, "spec:Considers", ctx);
    if (optIds.length === 0) continue;
    const opts = optIds
      .map((id) => ctx.byId.get(id))
      .filter((p): p is PrimitiveInstance => !!p);

    lines.push(`### Trade-off matrix — ${fvs(adr, "adr_id")}`, "");
    const header = ["Axis", ...opts.map((o) => escapeCell(fvs(o, "label")))];
    lines.push(`| ${header.join(" | ")} |`);
    lines.push(`| ${header.map(() => "---").join(" | ")} |`);
    for (const aid of axisIds) {
      const axis = ctx.byId.get(aid);
      if (!axis) continue;
      const cells = asArray<{ option_id: string; value: string }>(fv(axis, "cells"));
      const cellByOpt = new Map(cells.map((c) => [c.option_id, c.value]));
      const row = [escapeCell(fvs(axis, "axis"))];
      for (const o of opts) row.push(escapeCell(cellByOpt.get(o.id) || "—"));
      lines.push(`| ${row.join(" | ")} |`);
    }
    lines.push("");
  }
  return lines;
}

function renderErrorTaxonomy(ctx: Ctx): string[] {
  const errs = ctx.primitives.filter((p) => p.type_id === "spec:ErrorCategory");
  if (errs.length === 0) return [];
  const lines = ["| Category | When | HTTP |", "| --- | --- | --- |"];
  for (const e of errs) {
    lines.push(
      `| \`${escapeCell(fvs(e, "category"))}\` | ${escapeCell(fvs(e, "when_used"))} | ${escapeCell(fvs(e, "http_status") || "—")} |`,
    );
  }
  lines.push("");
  return lines;
}

function renderConfiguration(ctx: Ctx): string[] {
  const cfg = ctx.primitives.filter((p) => p.type_id === "spec:ConfigEntry");
  if (cfg.length === 0) return [];
  const lines = ["| Key | Default | Purpose |", "| --- | --- | --- |"];
  for (const c of cfg) {
    lines.push(
      `| \`${escapeCell(fvs(c, "key"))}\` | ${escapeCell(fvs(c, "default") || "—")} | ${escapeCell(fvs(c, "purpose"))} |`,
    );
  }
  lines.push("");
  return lines;
}

function renderAcceptanceCriteria(ctx: Ctx): string[] {
  const acs = ctx.primitives
    .filter((p) => p.type_id === "spec:AcceptanceCriterion")
    .slice()
    .sort((a, b) => (fv<number>(a, "ordinal") ?? 0) - (fv<number>(b, "ordinal") ?? 0));
  if (acs.length === 0) return [];
  const lines: string[] = [];
  for (const ac of acs) {
    const status = fvs(ac, "status");
    const mark = status === "met" ? "x" : status === "blocked" ? "!" : " ";
    lines.push(`- [${mark}] **${fv(ac, "ordinal")}.** ${fvs(ac, "criterion")} _(${status})_`);
    for (const e of asArray<string>(fv(ac, "evidence_refs"))) {
      lines.push(`  - evidence: ${e}`);
    }
  }
  lines.push("");
  return lines;
}

function renderConformance(ctx: Ctx): string[] {
  const items = ctx.primitives
    .filter((p) => p.type_id === "spec:ConformanceItem")
    .slice()
    .sort((a, b) => (fv<number>(a, "ordinal") ?? 0) - (fv<number>(b, "ordinal") ?? 0));
  if (items.length === 0) return [];
  const lines: string[] = [];
  for (const it of items) {
    lines.push(`- **${fv(it, "ordinal")}. ${fvs(it, "name")}** — ${fvs(it, "procedure")}`);
    lines.push(`  - expected: ${fvs(it, "expected")}`);
  }
  lines.push("");
  return lines;
}

function renderRisks(ctx: Ctx): string[] {
  const risks = ctx.primitives.filter((p) => p.type_id === "spec:Risk");
  if (risks.length === 0) return [];
  const lines = ["| Risk | Mitigation |", "| --- | --- |"];
  for (const r of risks) {
    const mitIds = inc(r.id, "spec:Mitigates", ctx);
    const mits = mitIds
      .map((id) => ctx.byId.get(id))
      .filter((p): p is PrimitiveInstance => !!p)
      .map((m) => fvs(m, "strategy"))
      .join("; ");
    lines.push(`| **${escapeCell(fvs(r, "label"))}** — ${escapeCell(fvs(r, "description"))} | ${escapeCell(mits || "_(none)_")} |`);
  }
  lines.push("");
  return lines;
}

function renderOpenQuestions(ctx: Ctx): string[] {
  const qs = ctx.primitives
    .filter((p) => p.type_id === "spec:OpenQuestion")
    .slice()
    .sort((a, b) => (fv<number>(a, "ordinal") ?? 0) - (fv<number>(b, "ordinal") ?? 0));
  if (qs.length === 0) return [];
  const lines: string[] = [];
  const blocking = qs.filter((q) => fvs(q, "is_blocking") === "yes");
  if (blocking.length === 1) {
    const q = blocking[0]!;
    lines.push(
      "The single blocking ambiguity that must be resolved before implementation begins:",
      "",
      `> **${fvs(q, "question")}**`,
      "",
    );
    const def = fvs(q, "default_choice");
    if (nonEmpty(def)) {
      lines.push(`This SPEC currently chooses: ${def}.`, "");
    }
  }
  const others = qs.filter((q) => fvs(q, "is_blocking") !== "yes");
  if (others.length > 0) {
    if (blocking.length === 1) lines.push("Other open questions (defaulted):", "");
    for (const q of others) {
      lines.push(`- **Q${fv(q, "ordinal")}.** ${fvs(q, "question")}`);
      const def = fvs(q, "default_choice");
      if (nonEmpty(def)) lines.push(`  - default: ${def}`);
      const owner = fvs(q, "owner");
      if (nonEmpty(owner)) lines.push(`  - owner: ${owner}`);
    }
    lines.push("");
  }
  return lines;
}

function renderFutureWork(ctx: Ctx): string[] {
  const items = ctx.primitives.filter((p) => p.type_id === "spec:FutureWork");
  if (items.length === 0) return [];
  const lines: string[] = [];
  for (const f of items) {
    const tv = fvs(f, "target_version");
    const tail = nonEmpty(tv) ? ` _(target: ${tv})_` : "";
    lines.push(`- **${fvs(f, "label")}**${tail} — ${fvs(f, "description")}`);
  }
  lines.push("");
  return lines;
}

function renderImplementationPlan(ctx: Ctx): string[] {
  const chs = ctx.primitives.filter((p) => p.type_id === "spec:ImplementationChange");
  if (chs.length === 0) return [];
  const lines = [
    "| Area | Change | Complexity | Status |",
    "| --- | --- | --- | --- |",
  ];
  for (const c of chs) {
    lines.push(
      `| ${escapeCell(fvs(c, "area"))} | ${escapeCell(fvs(c, "change"))} | ${escapeCell(fvs(c, "complexity"))} | ${escapeCell(fvs(c, "status"))} |`,
    );
  }
  lines.push("");
  return lines;
}

function renderMigration(ctx: Ctx): string[] {
  const steps = ctx.primitives
    .filter((p) => p.type_id === "spec:MigrationStep")
    .slice()
    .sort((a, b) => (fv<number>(a, "ordinal") ?? 0) - (fv<number>(b, "ordinal") ?? 0));
  if (steps.length === 0) return [];
  const lines: string[] = [];
  for (const s of steps) {
    lines.push(`${fv(s, "ordinal")}. **${fvs(s, "label")}** — ${fvs(s, "action")}`);
    const paths = asArray<string>(fv(s, "affected_paths"));
    for (const p of paths) lines.push(`   - touches: \`${p}\``);
  }
  lines.push("");
  return lines;
}

function renderRevisions(ctx: Ctx): string[] {
  const revs = ctx.primitives
    .filter((p) => p.type_id === "spec:Revision")
    .slice()
    .sort((a, b) => fvs(b, "version").localeCompare(fvs(a, "version")));
  if (revs.length === 0) return [];
  const lines: string[] = [];
  for (const r of revs) {
    lines.push(`### ${fvs(r, "version")} — ${fvs(r, "date")} — ${fvs(r, "title")}`, "");
    lines.push(fvs(r, "notes"), "");
    const sec = asArray<string>(fv(r, "affected_sections"));
    if (sec.length > 0) lines.push(`Affected sections: ${sec.join(", ")}`, "");
  }
  return lines;
}

function renderReferences(ctx: Ctx): string[] {
  const refs = ctx.primitives
    .filter((p) => p.type_id === "spec:Reference")
    .slice()
    .sort((a, b) => fvs(a, "citation").localeCompare(fvs(b, "citation")));
  if (refs.length === 0) return [];
  if (ctx.renderDsl) {
    return renderReferencesWithTemplate(ctx, refs);
  }
  const lines: string[] = [];
  for (const r of refs) {
    const verification = fvs(r, "verification");
    const note = fvs(r, "verification_note");
    const locator = fvs(r, "locator");
    let line = `- ${fvs(r, "citation")}`;
    if (nonEmpty(locator)) line += ` (${locator})`;
    line += ` _[${verification}]_`;
    if (nonEmpty(note)) line += ` — ${note}`;
    lines.push(line);
  }
  lines.push("");
  return lines;
}

const REFERENCE_ITEM_TEMPLATE =
  "- ${doc.fields.citation}${if: doc.fields.locator} (${doc.fields.locator})${endif} _[${doc.fields.verification}]_${if: doc.fields.verification_note} — ${doc.fields.verification_note}${endif}";

/**
 * Render a dnis:Node section's body_md as a template (SPEC-RENDER-DSL
 * v0.1.7 §6.4 fn.section_of et al.). Threads the renderer's
 * sectionIndex into the renderTemplate call so cross-section
 * references resolve. Findings from the evaluator (parser errors,
 * unknown names, unknown helpers) are forwarded to ctx.findings so
 * they show up in the renderer output alongside other findings.
 *
 * The doc context for template evaluation is the spec:Document
 * (default — what the facade resolves when docId is omitted), NOT the
 * dnis:Node itself. Authors writing `${doc.title}` in a section's
 * body get the spec's title; this matches the existing behaviour of
 * the (template-driven) References section.
 *
 * Caller has already checked `ctx.renderDsl != null` and the section's
 * `eval_body == true`.
 */
function evaluateDnisBody(
  ctx: Ctx,
  node: PrimitiveInstance,
  body: string,
): string {
  const rendered = ctx.renderDsl!.renderTemplate(body, {
    templateId: `spec:section:dnis:${node.id}`,
    sectionIndex: ctx.sectionIndex,
  });
  ctx.findings.push(...rendered.findings);
  return rendered.text;
}

function renderReferencesWithTemplate(
  ctx: Ctx,
  refs: readonly PrimitiveInstance[],
): string[] {
  const lines: string[] = [];
  for (const ref of refs) {
    const rendered = ctx.renderDsl!.renderTemplate(REFERENCE_ITEM_TEMPLATE, {
      templateId: "spec:section:references:item",
      docId: ref.id,
      sectionIndex: ctx.sectionIndex,
    });
    lines.push(rendered.text);
    ctx.findings.push(...rendered.findings);
  }
  lines.push("");
  return lines;
}

// ── Section walk ─────────────────────────────────────────────────

const KIND_RENDERERS: Record<string, (ctx: Ctx) => string[]> = {
  definitions: renderDefinitionsTable,
  stakeholders: renderStakeholdersTable,
  quality_attributes: renderQATable,
  decision_summary: renderDecisionSummary,
  capability_table: renderCapabilityTable,
  tool_surface: renderToolSurface,
  schema: renderSchemas,
  scenarios: renderScenarios,
  adr: renderADRs,
  tradeoff_matrix: renderTradeoffMatrix,
  error_taxonomy: renderErrorTaxonomy,
  configuration: renderConfiguration,
  acceptance_criteria: renderAcceptanceCriteria,
  conformance: renderConformance,
  risks: renderRisks,
  open_questions: renderOpenQuestions,
  future_work: renderFutureWork,
  implementation_plan: renderImplementationPlan,
  migration: renderMigration,
  revision_history: renderRevisions,
  references: renderReferences,
  principles: renderPrinciples,
};

function compareSectionNumbers(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10));
  const pb = b.split(".").map((n) => parseInt(n, 10));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (Number.isNaN(va) || Number.isNaN(vb)) return a.localeCompare(b);
    if (va !== vb) return va - vb;
  }
  return 0;
}

function renderSections(ctx: Ctx): string[] {
  // SPEC-CORE 1.2 §5.6 / SPEC-SECTIONS-TREE v0.2 — DNIS-Node-backed path.
  // If the project contains a dnis:Document AND at least one active
  // dnis:Node whose kind is "section", treat the DNIS Node graph as the
  // canonical section tree and DFS-walk it. The legacy `spec:Section`
  // path stays available for projects that haven't migrated.
  const dnisRoot = ctx.primitives.find((p) => p.type_id === "dnis:Document");
  const dnisSections = dnisRoot
    ? ctx.primitives.filter(
        (p) =>
          p.type_id === "dnis:Node" &&
          fvs(p, "kind") === "section" &&
          !nonEmpty(fvs(p, "retired_at")),
      )
    : [];
  const legacySections = ctx.primitives.filter((p) => p.type_id === "spec:Section");

  if (dnisSections.length > 0) {
    if (legacySections.length > 0) {
      pushRendererFinding(
        ctx,
        "spec:render:mixed-mode-sections",
        `project contains ${dnisSections.length} dnis:Node section(s) AND ${legacySections.length} spec:Section primitive(s); ` +
          "the DNIS path is canonical and the spec:Section primitives will be ignored. " +
          "Migrate the legacy primitives via the SPEC-SECTIONS-TREE codemod or remove them.",
      );
    }
    return renderSectionsFromDnis(ctx, dnisSections);
  }

  return renderSectionsLegacy(ctx, legacySections);
}

function renderSectionsLegacy(
  ctx: Ctx,
  sections: readonly PrimitiveInstance[],
): string[] {
  const sorted = sections
    .slice()
    .sort((a, b) => compareSectionNumbers(fvs(a, "number"), fvs(b, "number")));

  const lines: string[] = [];
  for (const s of sorted) {
    const number = fvs(s, "number");
    const title = fvs(s, "title");
    const explicitDepth = fv<number>(s, "depth");
    const computed = (number.match(/\./g)?.length ?? 0) + 2; // "1" → ##, "1.2" → ###, "1.2.3" → ####
    const depth = Math.min(Math.max(explicitDepth ?? computed, 2), 6);
    const hashes = "#".repeat(depth);
    lines.push(`${hashes} ${number}. ${title}`, "");
    const body = fvs(s, "body_md");
    if (nonEmpty(body)) {
      lines.push(body.trim(), "");
    }
    const kind = fvs(s, "kind");
    const fn = KIND_RENDERERS[kind];
    if (fn) {
      lines.push(...fn(ctx));
    }
    lines.push("---", "");
  }
  return lines;
}

/**
 * SPEC-SECTIONS-TREE v0.2 — DNIS-backed section rendering.
 *
 * The DNIS Node tree is the canonical section structure. Each
 * `dnis:Node` of kind "section" carries its rendering payload as a
 * JSON-encoded `content` field with shape:
 *
 *     {
 *       "title": "Section title",
 *       "body_md": "Section prose, possibly empty.",
 *       "dispatch_kind"?: "adr" | "stakeholders" | ... | undefined,
 *       "depth_override"?: number  // optional; renderer normally derives
 *                                  // depth from DFS path length
 *     }
 *
 * Numbering is a deterministic function of the tree shape: at each
 * level, siblings are sorted by SPEC-DNIS Position (string-comparable
 * per SPEC-DNIS §6.1), then assigned 1-based positional indices joined
 * by `.`. Depth is path-length + 2 (so a top-level section is `##`, a
 * sub-section is `###`, etc.) — clamped to [2, 6] to match the legacy
 * path.
 *
 * Body content is rendered the same way as the legacy path: the parsed
 * `dispatch_kind` looks up `KIND_RENDERERS`; the kind handler walks the
 * project's typed primitives (spec:Stakeholder, spec:ADR, …) for table
 * content. The DNIS Node holds title + prose + dispatch hint; it does
 * NOT hold the typed primitives themselves.
 */
function renderSectionsFromDnis(
  ctx: Ctx,
  nodes: readonly PrimitiveInstance[],
): string[] {
  // dnis:Node primitives carry `parent_node_id` as the parent's bare
  // NID (the ULID stored as the SPEC-CORE `uid`), NOT as the parent's
  // slug-shaped primitive id (e.g. "dnis:node:01k..."). Group children
  // by that NID, with empty string sentinel for roots (matching the
  // adapter's `node.parentNodeId ?? ""` write — see
  // src/core/dnis/adapter.ts).
  const byParentNid = new Map<string, PrimitiveInstance[]>();
  for (const n of nodes) {
    const parent = fvs(n, "parent_node_id") || "";
    if (!byParentNid.has(parent)) byParentNid.set(parent, []);
    byParentNid.get(parent)!.push(n);
  }
  for (const [, group] of byParentNid) {
    group.sort((a, b) =>
      fvs(a, "position").localeCompare(fvs(b, "position")),
    );
  }

  const lines: string[] = [];
  function dfs(parentNid: string, ancestorPath: number[]): void {
    const children = byParentNid.get(parentNid) ?? [];
    for (let i = 0; i < children.length; i += 1) {
      const child = children[i]!;
      const path = [...ancestorPath, i + 1];
      const number = path.join(".");
      const parsed = parseDnisContent(ctx, child);
      const title = parsed.title;
      const body = parsed.body_md;
      const dispatchKind = parsed.dispatch_kind ?? "";
      const depthOverride = parsed.depth_override;

      // §-number: literal override (for letter appendices, mid-chain
      // inserts, etc. — see number_override docstring) or DFS-derived.
      const numberLabel = parsed.number_override ?? number;
      // Heading depth: explicit override → fall back to override's dot
      // count (so a number_override of "5.6" gives depth 3 like the
      // legacy spec_md path) → fall back to DFS path length.
      const fromOverride = parsed.number_override
        ? (parsed.number_override.match(/\./g)?.length ?? 0) + 2
        : null;
      const computed = path.length + 1; // top-level = 2 (##), sub = 3 (###), …
      const depth = Math.min(
        Math.max(depthOverride ?? fromOverride ?? computed, 2),
        6,
      );
      const hashes = "#".repeat(depth);
      lines.push(`${hashes} ${numberLabel}. ${title}`, "");
      if (nonEmpty(body)) {
        // SPEC-RENDER-DSL v0.1.7: opt-in body_md template evaluation.
        // Authors who want ${doc.title} / ${fn.section_of("section:foo")}
        // / ${if: …}…${endif} / ${include: …} resolved at render
        // time set content.eval_body = true. Default false preserves
        // byte-equal output for prose containing literal `${…}`
        // (e.g. CEL examples in SPEC-EXPRESSION-RUNTIME body_md).
        const renderedBody =
          parsed.eval_body && ctx.renderDsl
            ? evaluateDnisBody(ctx, child, body)
            : body;
        lines.push(renderedBody.trim(), "");
      }
      if (dispatchKind) {
        const fn = KIND_RENDERERS[dispatchKind];
        if (fn) lines.push(...fn(ctx));
      }
      lines.push("---", "");

      // Recurse: use THIS node's `uid` (= the bare DNIS NID, per
      // SPEC-CORE §5.6.1's NID==uid pin) as the parent key for its
      // children. The SPEC-CORE primitive's `uid` field is the
      // parent_node_id values point at.
      dfs(child.uid, path);
    }
  }
  dfs("", []);
  return lines;
}

interface DnisSectionContent {
  title: string;
  body_md: string;
  dispatch_kind?: string;
  depth_override?: number;
  /**
   * Optional author-supplied stable reference handle, e.g.
   * "purpose-and-scope". When present, populateSectionIndex emits a
   * `section:<ref_slug>` entry into the index so prose can write
   * `${fn.section_of("section:purpose-and-scope")}` instead of the
   * 26-char NID. Takes priority over the title-derived slug; survives
   * title rewrites.
   */
  ref_slug?: string;
  /**
   * Opt-in: route body_md through the render-DSL evaluator
   * (`ctx.renderDsl.renderTemplate`) before emission. Default false,
   * which preserves byte-equal output for SPECs whose body_md contains
   * literal `${…}` documentation (e.g. CEL examples). When true, the
   * body is treated as a template — `${doc.title}`, `${fn.section_of(
   * "section:foo")}`, `${if: …}…${endif}`, `${include: …}` all work.
   * Per-section opt-in keeps the migration risk contained.
   */
  eval_body?: boolean;
  /**
   * Optional literal heading-label override. When present, this string
   * is used as the §-number in the rendered heading INSTEAD of the
   * DFS-derived path index, and is emitted into the section_index
   * (so cross-references resolve to the override too).
   *
   * Use cases that the pure DFS path cannot represent:
   *   - Letter-labeled appendices ("A", "B") whose siblings are
   *     numerically-labeled top-level sections.
   *   - Mid-chain inserts that must keep a stable label (e.g. an
   *     amendment §5.6 added between §5 and §6 in a SPEC whose
   *     downstream sections cannot renumber without breaking external
   *     references).
   *
   * Default unset = DFS-derived numbering. Setting this is a
   * deliberate departure from the SPEC-SECTIONS-TREE v0.2 default;
   * authors should reach for it only when the structure itself can't
   * be expressed via DFS path. Cross-document refs to overridden
   * sections work via fn.section_of (the slug entries are still
   * generated; their value is the override string).
   */
  number_override?: string;
}

function parseDnisContent(ctx: Ctx, node: PrimitiveInstance): DnisSectionContent {
  const raw = fvs(node, "content");
  if (!raw) {
    pushRendererFinding(
      ctx,
      "spec:render:dnis-section-empty-content",
      `dnis:Node ${node.id} has empty content; rendering as untitled blank section`,
    );
    return { title: "(untitled)", body_md: "" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    pushRendererFinding(
      ctx,
      "spec:render:dnis-section-invalid-json",
      `dnis:Node ${node.id} content is not valid JSON: ${(err as Error).message}`,
    );
    return { title: "(invalid content)", body_md: "" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { title: "(invalid content)", body_md: "" };
  }
  const obj = parsed as Record<string, unknown>;
  const out: DnisSectionContent = {
    title: typeof obj["title"] === "string" ? (obj["title"] as string) : "(untitled)",
    body_md: typeof obj["body_md"] === "string" ? (obj["body_md"] as string) : "",
  };
  if (typeof obj["dispatch_kind"] === "string") out.dispatch_kind = obj["dispatch_kind"] as string;
  if (typeof obj["depth_override"] === "number") out.depth_override = obj["depth_override"] as number;
  if (typeof obj["ref_slug"] === "string") out.ref_slug = obj["ref_slug"] as string;
  if (typeof obj["eval_body"] === "boolean") out.eval_body = obj["eval_body"] as boolean;
  if (typeof obj["number_override"] === "string") out.number_override = obj["number_override"] as string;
  return out;
}

/**
 * Derive a stable, readable handle from a dnis:Node section's content
 * for the slug-keyed section_index entry. Priority:
 *   1. Author-supplied `content.ref_slug` (verbatim, no normalisation
 *      beyond a `section:` prefix if absent). Survives title rewrites.
 *   2. Lowercased title with non-alphanumeric runs collapsed to single
 *      hyphens, leading/trailing hyphens trimmed.
 * Returns `null` if neither path produces a non-empty slug — the
 * caller skips slug indexing for that node and the NID/primitive-id
 * entries still cover lookup.
 *
 * Collisions across siblings/uncles are possible (two sections both
 * titled "Open Questions"). populateSectionIndex disambiguates by
 * appending `-2`, `-3`, … to second+ occurrences in DFS order. The
 * first occurrence keeps the bare slug.
 */
function deriveSectionSlug(content: DnisSectionContent): string | null {
  if (content.ref_slug && content.ref_slug.trim().length > 0) {
    const explicit = content.ref_slug.trim();
    return explicit.startsWith("section:") ? explicit : `section:${explicit}`;
  }
  const fromTitle = content.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (fromTitle.length === 0) return null;
  return `section:${fromTitle}`;
}

// ── Top-level renderer entry ─────────────────────────────────────

export const renderSpecMarkdown: RendererFn = (input): RendererOutput => {
  const ctx = buildCtx(input.primitives, input.relations, input.renderDsl);
  // Build the §N.M.K → dnis:Node id index before any rendering begins.
  // Templates anywhere in the document can resolve cross-section
  // references via `fn.section_of(node_id)` (helper-set v1.2.0). The
  // index is empty when the project has no dnis:Document — legacy
  // spec:Section projects are unaffected.
  populateSectionIndex(ctx);
  const lines: string[] = [];

  if (!ctx.doc) {
    lines.push(
      "# (no spec:Document found in this project)",
      "",
      "_The spec_authoring renderer requires at least one `spec:Document` primitive._",
      "",
    );
    return toOutput(lines, []);
  }
  const doc = ctx.doc;

  lines.push(...renderFrontmatter(doc));
  lines.push(`# ${fvs(doc, "title")}`, "");
  const sub = fvs(doc, "subtitle");
  if (nonEmpty(sub)) lines.push(`_${sub}_`, "");
  // GENERATED-DOCUMENT banner sits ABOVE the PALS banner because it
  // governs the file's lifecycle (don't edit this), whereas PALS-LAW
  // governs the content's epistemic posture (don't trust unverified
  // claims). Lifecycle precedes epistemics: a reader who edits the
  // file directly never reaches the PALS banner the next time.
  lines.push(...renderGeneratedBanner(doc));
  lines.push(...renderPalsBanner(doc));
  lines.push(...renderDisclaimer(doc));
  lines.push(...renderStatus(doc));

  // User-authored sections (with auto-include hooks by `kind`).
  lines.push(...renderSections(ctx));

  // Closing References list — emitted unconditionally if any
  // spec:Reference primitive exists, even without a section of
  // kind='references'. PALS-LAW: a citation without a bibliography
  // is exactly the verification gap the SPEC banner forbids.
  //
  // The check covers BOTH the legacy spec:Section path AND the DNIS
  // path (dnis:Node whose content.dispatch_kind == "references"); a
  // SPEC migrated to the DNIS section tree retains its references
  // section without re-emitting the closing block.
  const hasReferenceSection =
    ctx.primitives.some(
      (p) => p.type_id === "spec:Section" && fvs(p, "kind") === "references",
    ) ||
    ctx.primitives.some((p) => {
      if (p.type_id !== "dnis:Node") return false;
      if (fvs(p, "kind") !== "section") return false;
      if (nonEmpty(fvs(p, "retired_at"))) return false;
      const raw = fvs(p, "content");
      if (!raw) return false;
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        return parsed && parsed["dispatch_kind"] === "references";
      } catch {
        return false;
      }
    });
  if (!hasReferenceSection) {
    const refs = ctx.primitives.filter((p) => p.type_id === "spec:Reference");
    if (refs.length > 0) {
      lines.push("## References — verify independently", "");
      lines.push(...renderReferences(ctx));
    }
  }

  return toOutput(lines, ctx.findings);
};

function toOutput(lines: string[], findings: RenderFinding[]): RendererOutput {
  const text = lines.join("\n");
  return {
    bytes: new TextEncoder().encode(text),
    contentType: "text/markdown",
    filename: "SPEC.md",
    findings,
  };
}
