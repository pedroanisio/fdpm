/**
 * The SRS as a document, in the shape IEEE 830 / ISO-29148 readers expect.
 *
 * This profile shipped with no renderer of any kind: eight metaclasses,
 * seventeen relation types, and no way to read a workbook as anything but
 * raw primitives. A requirements specification is a document people sign,
 * so it is rendered as one — scope boundaries before requirements,
 * requirements grouped by kind and ordered by priority, each carrying its
 * rationale, acceptance criteria, provenance and traceability.
 *
 * Two targets because an SRS is read two ways: `text/markdown` for review
 * in a diff, `text/html` for circulation and print. Both are built from
 * one model of the document (`buildSrsModel`) so they cannot drift into
 * telling different stories.
 */

import type { RendererInput, RendererOutput } from "../../../src/plugin/types.js";
import { renderStandaloneDocument } from "../../../src/core/render/document.js";

interface Prim {
  id: string;
  type_id: string;
  field_values: Record<string, unknown>;
}
interface Rel {
  id: string;
  type_id: string;
  source_id: string;
  target_id: string;
  field_values?: Record<string, unknown>;
}

const T = (p: string) => `srs:${p}`;
const PRIORITY_ORDER = ["must", "should", "could", "wont", "critical", "high", "medium", "low"];

function fv(p: Prim | undefined, k: string): string {
  const v = p?.field_values?.[k];
  return typeof v === "string" ? v : v === undefined || v === null ? "" : String(v);
}
function list(p: Prim | undefined, k: string): string[] {
  const v = p?.field_values?.[k];
  return Array.isArray(v) ? v.map((x) => String(x)) : [];
}

export interface SrsModel {
  spec: Prim | undefined;
  inScope: Prim[];
  outOfScope: Prim[];
  requirementsByKind: Array<{ kind: string; items: Prim[] }>;
  stakeholders: Prim[];
  glossary: Prim[];
  baselines: Prim[];
  changes: Prim[];
  /** requirement id → the edges that matter for traceability. */
  trace: Map<string, { label: string; targets: string[] }[]>;
  nameOf: (id: string) => string;
  counts: { requirements: number; agreed: number; boundaries: number };
}

/**
 * One model, two renderings. Ordering is total and content-derived, so a
 * render is reproducible: priority rank, then title, then id.
 */
export function buildSrsModel(primitives: Prim[], relations: Rel[]): SrsModel {
  const byId = new Map(primitives.map((p) => [p.id, p]));
  const of = (t: string) => primitives.filter((p) => p.type_id === T(t));
  const nameOf = (id: string): string => {
    const p = byId.get(id);
    if (!p) return id;
    return fv(p, "title") || fv(p, "name") || fv(p, "term") || id.split(":").pop() || id;
  };

  const rank = (p: Prim): number => {
    const i = PRIORITY_ORDER.indexOf(fv(p, "priority").toLowerCase());
    return i === -1 ? PRIORITY_ORDER.length : i;
  };
  const ordered = (xs: Prim[]): Prim[] =>
    xs.slice().sort((a, b) => rank(a) - rank(b) || fv(a, "title").localeCompare(fv(b, "title")) || a.id.localeCompare(b.id));

  const boundaries = of("ScopeBoundary");
  const requirements = ordered(of("Requirement"));
  const kinds = [...new Set(requirements.map((r) => fv(r, "kind") || "unclassified"))].sort();

  const TRACE: Array<[string, string]> = [
    ["srs:DerivedFrom", "derived from"],
    ["srs:Refines", "refines"],
    ["srs:DependsOn", "depends on"],
    ["srs:Satisfies", "satisfies"],
    ["srs:ConflictsWith", "conflicts with"],
    ["srs:Duplicates", "duplicates"],
    ["srs:RelatedTo", "related to"],
    ["srs:ElicitedFrom", "elicited from"],
    ["srs:HasAgreement", "agreement"],
  ];
  const trace = new Map<string, { label: string; targets: string[] }[]>();
  for (const r of requirements) {
    const rows: { label: string; targets: string[] }[] = [];
    for (const [type, label] of TRACE) {
      const targets = relations
        .filter((e) => e.type_id === type && e.source_id === r.id)
        .map((e) => nameOf(e.target_id))
        .sort();
      if (targets.length > 0) rows.push({ label, targets });
    }
    if (rows.length > 0) trace.set(r.id, rows);
  }

  return {
    spec: of("Specification")[0],
    inScope: boundaries.filter((b) => fv(b, "polarity") === "in_scope"),
    outOfScope: boundaries.filter((b) => fv(b, "polarity") === "out_of_scope"),
    requirementsByKind: kinds.map((kind) => ({
      kind,
      items: requirements.filter((r) => (fv(r, "kind") || "unclassified") === kind),
    })),
    stakeholders: of("Stakeholder").slice().sort((a, b) => fv(a, "name").localeCompare(fv(b, "name"))),
    glossary: of("GlossaryEntry").slice().sort((a, b) => fv(a, "term").localeCompare(fv(b, "term"))),
    baselines: of("Baseline").slice().sort((a, b) => fv(a, "date").localeCompare(fv(b, "date"))),
    changes: of("ChangeRequest").slice().sort((a, b) => fv(a, "date").localeCompare(fv(b, "date"))),
    trace,
    nameOf,
    counts: {
      requirements: requirements.length,
      agreed: relations.filter((e) => e.type_id === "srs:HasAgreement").length,
      boundaries: boundaries.length,
    },
  };
}

// ── markdown ────────────────────────────────────────────────────────────

export function renderSrsMarkdown(input: RendererInput): RendererOutput {
  const m = buildSrsModel(input.primitives as unknown as Prim[], (input.relations ?? []) as unknown as Rel[]);
  const L: string[] = [];
  const spec = m.spec;

  L.push(`# ${fv(spec, "project") || input.workbook?.name || "Software Requirements Specification"}`, "");
  if (spec) {
    const meta = [
      fv(spec, "version") && `version ${fv(spec, "version")}`,
      fv(spec, "date"),
      list(spec, "authors").join(", "),
    ].filter(Boolean);
    if (meta.length) L.push(`_${meta.join(" · ")}_`, "");
    L.push(`**Purpose.** ${fv(spec, "purpose")}`, "");
    const audience = list(spec, "intended_audience");
    if (audience.length) L.push(`**Audience.** ${audience.join(", ")}`, "");
    else if (fv(spec, "intended_audience")) L.push(`**Audience.** ${fv(spec, "intended_audience")}`, "");
    if (fv(spec, "scope")) L.push(`**Scope.** ${fv(spec, "scope")}`, "");
  }
  L.push(
    `_${m.counts.requirements} requirement(s) · ${m.counts.boundaries} scope boundary/ies · ${m.counts.agreed} agreement edge(s)._`,
    "",
  );

  if (m.inScope.length || m.outOfScope.length) {
    L.push("## Scope", "");
    for (const [heading, items] of [["In scope", m.inScope], ["Out of scope", m.outOfScope]] as const) {
      if (!items.length) continue;
      L.push(`### ${heading}`, "");
      for (const b of items) {
        L.push(`- **${fv(b, "title")}** — ${fv(b, "statement")}`);
        if (fv(b, "rationale")) L.push(`  - _why:_ ${fv(b, "rationale")}`);
        for (const ac of list(b, "acceptance_criteria")) L.push(`  - _accepted when:_ ${ac}`);
      }
      L.push("");
    }
  }

  for (const group of m.requirementsByKind) {
    if (group.items.length === 0) continue;
    L.push(`## Requirements — ${group.kind}`, "");
    for (const r of group.items) {
      const badges = [fv(r, "priority"), fv(r, "origin_class"), fv(r, "provenance_rank"), fv(r, "status")]
        .filter(Boolean)
        .join(" · ");
      L.push(`### ${fv(r, "title")}`, "");
      if (badges) L.push(`\`${badges}\``, "");
      L.push(fv(r, "statement"), "");
      if (fv(r, "rationale")) L.push(`**Rationale.** ${fv(r, "rationale")}`, "");
      const acs = list(r, "acceptance_criteria");
      if (acs.length) {
        L.push("**Acceptance criteria**", "");
        for (const ac of acs) L.push(`- ${ac}`);
        L.push("");
      }
      const vm = list(r, "verification_methods");
      if (vm.length) L.push(`**Verified by** ${vm.join(", ")}`, "");
      const tr = m.trace.get(r.id);
      if (tr) {
        L.push("**Traceability**", "");
        for (const row of tr) L.push(`- _${row.label}:_ ${row.targets.join(", ")}`);
        L.push("");
      }
    }
  }

  if (m.stakeholders.length) {
    L.push("## Stakeholders", "", "| Name | Role |", "|---|---|");
    for (const s of m.stakeholders) L.push(`| ${fv(s, "name")} | ${fv(s, "role")} |`);
    L.push("");
  }
  if (m.glossary.length) {
    L.push("## Glossary", "");
    for (const g of m.glossary) L.push(`- **${fv(g, "term")}** — ${fv(g, "definition")}`);
    L.push("");
  }
  if (m.baselines.length || m.changes.length) {
    L.push("## Change history", "");
    for (const b of m.baselines) L.push(`- **baseline** ${fv(b, "name")} (${fv(b, "date")})`);
    for (const c of m.changes) L.push(`- **change** ${fv(c, "date")} by ${fv(c, "author")} — ${fv(c, "description")}`);
    L.push("");
  }

  return {
    bytes: new TextEncoder().encode(L.join("\n").replace(/\n{3,}/g, "\n\n") + "\n"),
    contentType: "text/markdown",
    filename: "srs.md",
  };
}

// ── html ────────────────────────────────────────────────────────────────

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const SRS_CSS = `
body { padding: 3rem 1.5rem 5rem; font: 16px/1.65 var(--fdpm-body-font); }
.srs { max-width: 50rem; margin: 0 auto; }
h1 { font-size: clamp(2rem, 6vw, 2.85rem); line-height: 1.12; letter-spacing: -.025em; margin: 0 0 .35rem; }
h2 { font-size: 1.3rem; margin: 2.7rem 0 .8rem; padding-bottom: .4rem; border-bottom: 2px solid var(--rule); }
h3 { font-size: 1.05rem; margin: 1.8rem 0 .45rem; }
.meta { color: var(--muted); font-size: .88rem; margin: 0 0 1.5rem; }
.badges { display: flex; flex-wrap: wrap; gap: .4rem; margin: .35rem 0 .6rem; }
.badge { font-size: .7rem; font-weight: 650; letter-spacing: .045em; text-transform: uppercase; padding: .15rem .5rem; border: 1px solid var(--rule); border-radius: 999px; color: var(--muted); }
.badge.p-must, .badge.p-critical { border-color: var(--accent); color: var(--accent); background: var(--fdpm-accent-soft); }
article { margin: 1.1rem 0; padding: .8rem 1rem; border-left: 3px solid var(--rule); background: color-mix(in srgb, var(--panel) 72%, transparent); }
article h3 { margin-top: 0; }
blockquote { margin: .6rem 0; padding: .5rem .9rem; border-left: 3px solid var(--rule); color: var(--muted); }
table { border-collapse: collapse; width: 100%; margin: .75rem 0; }
th, td { text-align: left; padding: .45rem .6rem; border-bottom: 1px solid var(--rule); font-size: .94rem; }
th { color: var(--muted); font-weight: 650; font-size: .76rem; text-transform: uppercase; letter-spacing: .05em; }
ul { margin: .4rem 0 .8rem; padding-left: 1.2rem; }
.trace { font-size: .86rem; color: var(--muted); }
@media (max-width: 42rem) { body { padding: 2rem 1rem 5rem; } article { padding-inline: .75rem; } }
`;

/**
 * A print-ready SRS. Styles are inline because the artefact travels on its
 * own — attached to a ticket, mailed to a reviewer — and a stylesheet that
 * has to travel with it will not.
 */
export function renderSrsHtml(input: RendererInput): RendererOutput {
  const m = buildSrsModel(input.primitives as unknown as Prim[], (input.relations ?? []) as unknown as Rel[]);
  const spec = m.spec;
  const H: string[] = [];
  const title = fv(spec, "project") || input.workbook?.name || "Software Requirements Specification";

  H.push(
    '<main class="srs">',
    `<h1>${esc(title)}</h1>`,
  );
  if (spec) {
    const meta = [fv(spec, "version") && `version ${fv(spec, "version")}`, fv(spec, "date"), list(spec, "authors").join(", ")]
      .filter(Boolean)
      .join(" · ");
    if (meta) H.push(`<p class="meta">${esc(meta)}</p>`);
    if (fv(spec, "purpose")) H.push(`<p><strong>Purpose.</strong> ${esc(fv(spec, "purpose"))}</p>`);
    if (fv(spec, "scope")) H.push(`<p><strong>Scope.</strong> ${esc(fv(spec, "scope"))}</p>`);
  }
  H.push(
    `<p class="meta">${m.counts.requirements} requirement(s) · ${m.counts.boundaries} scope boundary/ies · ${m.counts.agreed} agreement edge(s).</p>`,
  );
  if (m.counts.requirements === 0) {
    H.push('<p class="empty">No requirements have been recorded yet.</p>');
  }

  if (m.inScope.length || m.outOfScope.length) {
    H.push("<h2>Scope</h2>");
    for (const [heading, items] of [["In scope", m.inScope], ["Out of scope", m.outOfScope]] as const) {
      if (!items.length) continue;
      H.push(`<h3>${heading}</h3><ul>`);
      for (const b of items) H.push(`<li><strong>${esc(fv(b, "title"))}</strong> — ${esc(fv(b, "statement"))}</li>`);
      H.push("</ul>");
    }
  }
  for (const group of m.requirementsByKind) {
    if (!group.items.length) continue;
    H.push(`<h2>Requirements — ${esc(group.kind)}</h2>`);
    for (const r of group.items) {
      H.push("<article>", `<h3>${esc(fv(r, "title"))}</h3>`, '<div class="badges">');
      for (const b of [fv(r, "priority"), fv(r, "origin_class"), fv(r, "provenance_rank")].filter(Boolean)) {
        H.push(`<span class="badge p-${esc(b.toLowerCase())}">${esc(b)}</span>`);
      }
      H.push("</div>", `<p>${esc(fv(r, "statement"))}</p>`);
      if (fv(r, "rationale")) H.push(`<blockquote>${esc(fv(r, "rationale"))}</blockquote>`);
      const acs = list(r, "acceptance_criteria");
      if (acs.length) H.push("<ul>", ...acs.map((a) => `<li>${esc(a)}</li>`), "</ul>");
      const tr = m.trace.get(r.id);
      if (tr) {
        H.push('<p class="trace">', tr.map((row) => `${esc(row.label)}: ${esc(row.targets.join(", "))}`).join(" · "), "</p>");
      }
      H.push("</article>");
    }
  }
  if (m.stakeholders.length) {
    H.push("<h2>Stakeholders</h2><table><thead><tr><th>Name</th><th>Role</th></tr></thead><tbody>");
    for (const s of m.stakeholders) H.push(`<tr><td>${esc(fv(s, "name"))}</td><td>${esc(fv(s, "role"))}</td></tr>`);
    H.push("</tbody></table>");
  }
  if (m.glossary.length) {
    H.push("<h2>Glossary</h2><ul>");
    for (const g of m.glossary) H.push(`<li><strong>${esc(fv(g, "term"))}</strong> — ${esc(fv(g, "definition"))}</li>`);
    H.push("</ul>");
  }
  H.push("</main>");
  const html = renderStandaloneDocument({
    title,
    body: H.join("\n"),
    styles: SRS_CSS,
    accent: "cobalt",
  });

  return {
    bytes: new TextEncoder().encode(html),
    contentType: "text/html",
    filename: "srs.html",
  };
}
