/**
 * The document view of a style registry: every style printed as the
 * source schema reads it — identity, philosophy, the ten grammar
 * sections with their rules inline, the compliance table, references,
 * and the production token layer.
 *
 * This is the renderer a reader wants. The fifteen per-entity renderers
 * the bridge generates are field tables; this one reassembles the graph
 * the ingest took apart, which is the only view in which the profile's
 * cross-references are legible.
 */

import type { RendererInput, RendererOutput } from "../../../src/plugin/types.js";
import { GRAMMAR_SECTIONS, RULE_SECTION_CODES, type GrammarSection } from "../schemas/style.js";
import { REL, VENDOR } from "../sidecar.js";

interface P {
  id: string;
  type_id: string;
  field_values: Record<string, unknown>;
}
interface R {
  type_id: string;
  source_id: string;
  target_id: string;
  field_values?: Record<string, unknown>;
}

const s = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const n = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);
const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Markdown-escape a table cell. */
function cell(v: unknown): string {
  if (v === undefined || v === null) return "—";
  if (Array.isArray(v)) return v.length === 0 ? "—" : v.map((x) => String(x)).join(", ");
  if (typeof v === "object") return "`" + JSON.stringify(v) + "`";
  return String(v).replace(/\|/g, "\\|");
}

/** Human-readable period, e.g. "1919–1933" or "1962–present". */
function period(p: unknown): string {
  if (typeof p !== "object" || p === null) return "—";
  const o = p as Record<string, unknown>;
  const start = n(o.start);
  const end = n(o.end);
  if (o.kind === "closed") return `${start ?? "?"}–${end ?? "?"}`;
  return start === undefined || start === null ? "unknown origin" : `${start}–present`;
}

export function renderStyleOutline(input: RendererInput): RendererOutput {
  const primitives = input.primitives as unknown as P[];
  const relations = input.relations as unknown as R[];

  const byId = new Map(primitives.map((p) => [p.id, p]));
  const entity = (p: P): string => p.type_id.split(":").pop() ?? p.type_id;

  const outgoing = (type: string, from: string): R[] =>
    relations.filter((r) => r.type_id === type && r.source_id === from);

  const lines: string[] = [];
  const styles = primitives.filter((p) => entity(p) === "Style").sort((a, b) => a.id.localeCompare(b.id));
  const movements = primitives.filter((p) => entity(p) === "Movement").sort((a, b) => a.id.localeCompare(b.id));

  lines.push(`# Style registry`);
  lines.push("");
  lines.push(
    `_${styles.length} style(s), ${movements.length} movement(s) — workbook \`${input.workbookId}\` on \`${input.profile.id}\`._`,
  );
  lines.push("");

  if (movements.length > 0) {
    lines.push(`## Movements`);
    lines.push("");
    lines.push(`| Movement | Period | Parent | Aliases |`);
    lines.push(`| --- | --- | --- | --- |`);
    for (const m of movements) {
      const parent = outgoing(REL.ParentMovement, m.id)[0];
      const parentName = parent ? s(byId.get(parent.target_id)?.field_values.name) : undefined;
      lines.push(
        `| ${cell(m.field_values.name)} | ${period(m.field_values.period)} | ${cell(parentName)} | ${cell(m.field_values.aliases)} |`,
      );
    }
    lines.push("");
  }

  for (const style of styles) {
    const f = style.field_values;
    lines.push(`---`);
    lines.push("");
    lines.push(`## ${s(f.name) ?? style.id} \`${s(f.code) ?? "?"}\``);
    lines.push("");

    // ── Identity ──
    const parentMovement = outgoing(REL.BelongsToMovement, style.id)[0];
    const negated = outgoing(REL.NegatesMovement, style.id).map((r) => s(byId.get(r.target_id)?.field_values.name) ?? r.target_id);
    const influenced = outgoing(REL.InfluencesStyle, style.id).map((r) => s(byId.get(r.target_id)?.field_values.name) ?? r.target_id);
    const om = f.origin_medium as Record<string, unknown> | undefined;
    const originMedium =
      om?.kind === "mixed"
        ? list<Record<string, unknown>>(om.components)
            .map((c) => (c.process ? `${c.family} (${c.process})` : String(c.family)))
            .join(" + ")
        : om
          ? om.process
            ? `${om.family} (${om.process})`
            : String(om.family)
          : "—";

    lines.push(`| | |`);
    lines.push(`| --- | --- |`);
    lines.push(`| Period | ${period(f.period)} |`);
    lines.push(`| Origin medium | ${cell(originMedium)} |`);
    lines.push(`| Geographic centres | ${cell(f.geographic_centers)} |`);
    lines.push(`| Aliases | ${cell(f.aliases)} |`);
    if (parentMovement) {
      lines.push(`| Parent movement | ${cell(s(byId.get(parentMovement.target_id)?.field_values.name))} |`);
    }
    if (negated.length > 0) lines.push(`| Negates | ${cell(negated)} |`);
    if (influenced.length > 0) lines.push(`| Influenced | ${cell(influenced)} |`);
    lines.push(`| Locale | ${cell(f.locale)} |`);
    lines.push(`| Schema version | ${cell(f.schema_version)} |`);
    lines.push("");

    // ── Philosophy ──
    lines.push(`### Philosophy`);
    lines.push("");
    lines.push(
      `Ornament **${cell(f.ornament_stance)}** · machine **${cell(f.machine_attitude)}** · ${cell(f.form_function_relation)} · ${cell(f.human_relation)}`,
    );
    lines.push("");
    for (const a of list<Record<string, unknown>>(f.axioms)) {
      lines.push(`> ${s(a.statement) ?? ""}`);
      lines.push(`> — ${s(a.source) ?? "unattributed"}`);
      lines.push("");
    }

    // ── Grammar ──
    const grammarBySection = new Map<GrammarSection, P>();
    for (const e of outgoing(REL.HasGrammar, style.id)) {
      const section = s(e.field_values?.section) as GrammarSection | undefined;
      const target = byId.get(e.target_id);
      if (section && target && !grammarBySection.has(section)) grammarBySection.set(section, target);
    }

    lines.push(`### Grammar`);
    lines.push("");
    for (const section of GRAMMAR_SECTIONS) {
      const g = grammarBySection.get(section);
      if (!g) {
        lines.push(`#### ${section} \`${RULE_SECTION_CODES[section]}\``);
        lines.push("");
        lines.push(`_(section not declared)_`);
        lines.push("");
        continue;
      }
      lines.push(`#### ${section} \`${RULE_SECTION_CODES[section]}\``);
      lines.push("");
      const fields = Object.entries(g.field_values).filter(([k]) => k !== "grammar_id");
      if (fields.length > 0) {
        lines.push(`| Field | Value |`);
        lines.push(`| --- | --- |`);
        for (const [k, val] of fields) lines.push(`| \`${k}\` | ${cell(val)} |`);
        lines.push("");
      }

      const rules = outgoing(REL.DeclaresRule, g.id)
        .map((r) => byId.get(r.target_id))
        .filter((p): p is P => p !== undefined)
        .sort((a, b) => (s(a.field_values.rule_id) ?? "").localeCompare(s(b.field_values.rule_id) ?? ""));
      if (rules.length > 0) {
        lines.push(`| Rule | Kind | Weight | Statement | Exemplars |`);
        lines.push(`| --- | --- | --- | --- | --- |`);
        for (const rule of rules) {
          const exemplars = outgoing(REL.CitesExemplar, rule.id)
            .map((r) => s(byId.get(r.target_id)?.field_values.title) ?? r.target_id)
            .join("; ");
          lines.push(
            `| \`${cell(rule.field_values.rule_id)}\` | ${cell(rule.field_values.kind)} | ${cell(rule.field_values.weight)} | ${cell(rule.field_values.statement)} | ${exemplars || "—"} |`,
          );
        }
        lines.push("");
      }
    }

    // ── Compliance ──
    const checks = outgoing(REL.DeclaresCheck, style.id)
      .map((r) => byId.get(r.target_id))
      .filter((p): p is P => p !== undefined)
      .sort((a, b) => (s(a.field_values.check_id) ?? "").localeCompare(s(b.field_values.check_id) ?? ""));
    lines.push(`### Compliance`);
    lines.push("");
    lines.push(`Minimum weighted pass ratio for non-defining checks: **${cell(f.minimum_pass_ratio)}**.`);
    lines.push("");
    if (checks.length > 0) {
      lines.push(`| Check | Kind | Weight | Tests | Criterion |`);
      lines.push(`| --- | --- | --- | --- | --- |`);
      for (const c of checks) {
        const tested = outgoing(REL.TestsRule, c.id)[0];
        const testedId = tested ? s(byId.get(tested.target_id)?.field_values.rule_id) ?? tested.target_id : undefined;
        const kind = s(c.field_values.kind);
        const criterion =
          kind === "threshold"
            ? `${cell(c.field_values.threshold_metric)} ${cell(c.field_values.threshold_operator)} ${cell(c.field_values.threshold_value)}${c.field_values.threshold_unit ? " " + cell(c.field_values.threshold_unit) : ""}`
            : kind === "qualitative"
              ? cell(c.field_values.criteria)
              : cell(c.field_values.description);
        lines.push(
          `| \`${cell(c.field_values.check_id)}\` | ${cell(kind)} | ${cell(c.field_values.weight)} | \`${cell(testedId)}\` | ${criterion} |`,
        );
      }
      lines.push("");
    }

    // ── References ──
    lines.push(`### Canonical references`);
    lines.push("");
    const refEdges = outgoing(REL.HasReference, style.id);
    for (const role of ["primary", "secondary", "counter-example"] as const) {
      const inBucket = refEdges.filter((r) => s(r.field_values?.role) === role);
      if (inBucket.length === 0) continue;
      lines.push(`**${role}**`);
      lines.push("");
      for (const e of inBucket) {
        const r = byId.get(e.target_id);
        if (!r) continue;
        const rf = r.field_values;
        const year = rf.year === null ? "n.d." : cell(rf.year);
        lines.push(
          `- ${cell(rf.creators)}, _${cell(rf.title)}_ (${year}), ${cell(rf.medium)} — ${cell(rf.exemplifies)} [${cell(rf.source)}]`,
        );
      }
      lines.push("");
    }

    // ── Tokens ──
    lines.push(`### Production tokens`);
    lines.push("");
    const sections: [string, string, unknown][] = [
      ["colours", s(f.tokens_colors_kind) ?? "omitted", f.tokens_colors],
      ["typography", s(f.tokens_typography_kind) ?? "omitted", f.tokens_scale],
      ["spacing", s(f.tokens_spacing_kind) ?? "omitted", f.tokens_spacing_scale],
      ["shape", s(f.tokens_shape_kind) ?? "omitted", f.tokens_border_radius],
      ["motion", s(f.tokens_motion_kind) ?? "omitted", f.tokens_timing_map],
      ["prompt", s(f.tokens_prompt_kind) ?? "omitted", f.tokens_prompt_positive],
      ["accessibility", s(f.tokens_accessibility_kind) ?? "omitted", f.tokens_contrast_pairs],
    ];
    lines.push(`| Section | Kind | Entries |`);
    lines.push(`| --- | --- | --- |`);
    for (const [name, kind, payload] of sections) {
      const count = Array.isArray(payload) ? String(payload.length) : payload === undefined ? "—" : "1";
      lines.push(`| ${name} | ${kind} | ${kind === "omitted" ? "—" : count} |`);
    }
    lines.push("");

    if (s(f.tokens_colors_kind) === "rendered") {
      lines.push(`**Colour tokens**`);
      lines.push("");
      lines.push(`| Token | Value |`);
      lines.push(`| --- | --- |`);
      for (const t of list<Record<string, unknown>>(f.tokens_colors)) {
        lines.push(`| \`${cell(t.name)}\` | \`${cell(t.value)}\` |`);
      }
      lines.push("");
    }
    if (s(f.tokens_accessibility_kind) === "wcag") {
      lines.push(
        `**WCAG contract** — version ${cell(f.tokens_accessibility_version)}, level ${String(s(f.tokens_accessibility_level) ?? "").toUpperCase()}`,
      );
      lines.push("");
      lines.push(`| Foreground | Background | Usage |`);
      lines.push(`| --- | --- | --- |`);
      for (const p of list<Record<string, unknown>>(f.tokens_contrast_pairs)) {
        lines.push(`| \`${cell(p.foreground)}\` | \`${cell(p.background)}\` | ${cell(p.usage)} |`);
      }
      lines.push("");
    }
    if (s(f.tokens_prompt_kind) === "rendered") {
      lines.push(`**Prompt fragment**`);
      lines.push("");
      lines.push(`- positive: ${cell(f.tokens_prompt_positive)}`);
      lines.push(`- negative: ${cell(f.tokens_prompt_negative) || "—"}`);
      lines.push("");
    }
  }

  if (styles.length === 0) {
    lines.push(`_(no ${VENDOR}:Style primitives in this workbook)_`);
    lines.push("");
  }

  return {
    bytes: new TextEncoder().encode(lines.join("\n")),
    contentType: "text/markdown",
    filename: "style-registry.md",
  };
}
