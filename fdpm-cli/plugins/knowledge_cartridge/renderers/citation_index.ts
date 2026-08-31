/**
 * `kc:CitationIndexRenderer` — the verification surface, as a page a reviewer
 * can check.
 *
 * The cartridge renderer prints the claims. This one prints the evidence for
 * them, inverted: source by source, every claim that rests on it with its
 * ordinal. That inversion is the point. Reading down a cartridge you can only
 * ask "is this claim cited"; reading down this page you can ask "does this
 * source actually say all of that", which is the question that catches a
 * fabricated ordinal.
 *
 * It also prints the Pass-6 scoreboard, including the three checks the
 * validator layer cannot make. A page that showed only the checks that passed
 * would be the self-certification the protocol warns about.
 */
import type { RendererInput, RendererOutput } from "../../../src/plugin/types.js";
import { renderStandaloneDocument } from "../../../src/core/render/document.js";
import { KC_UNENFORCEABLE_CHECKS } from "../validators.js";
import { buildModel, fieldOf, numberOf, type Citation } from "./_model.js";

const CITATION_INDEX_STYLES = `
.kc-citation-index {
  width: min(74rem, calc(100% - 2rem));
  margin: 0 auto;
  padding: clamp(2.75rem, 7vw, 6.5rem) 0 6rem;
}
.kc-masthead {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(13rem, 24rem);
  align-items: end;
  gap: clamp(1.5rem, 5vw, 5rem);
  padding-bottom: clamp(1.5rem, 4vw, 3rem);
  border-bottom: 1px solid var(--fdpm-rule);
}
.kc-eyebrow {
  margin: 0 0 .8rem;
  color: var(--fdpm-accent);
  font: 700 .75rem/1.2 var(--fdpm-code-font);
  letter-spacing: .12em;
  text-transform: uppercase;
}
.kc-masthead h1 {
  max-width: 18ch;
  margin: 0;
  font: 650 clamp(2rem, 5.5vw, 4.75rem)/.98 var(--fdpm-reading-font);
  letter-spacing: -.035em;
}
.kc-deck { margin: 0; color: var(--fdpm-muted); font: 1.02rem/1.65 var(--fdpm-reading-font); }
.kc-section { margin-top: clamp(3rem, 7vw, 6rem); }
.kc-section-heading { display: grid; grid-template-columns: 3rem minmax(0, 1fr); gap: 1rem; align-items: baseline; }
.kc-section-number { color: var(--fdpm-accent); font: 700 .78rem/1 var(--fdpm-code-font); }
.kc-section h2 { margin: 0 0 1.4rem; font: 650 clamp(1.45rem, 3vw, 2.35rem)/1.12 var(--fdpm-reading-font); }
.kc-table-frame { max-width: 100%; overflow-x: auto; border: 1px solid var(--fdpm-rule); border-radius: .65rem; background: var(--fdpm-surface); }
.kc-table-frame:focus-visible { outline: 3px solid var(--fdpm-focus); outline-offset: 3px; }
.kc-citation-index table { width: 100%; border-collapse: collapse; font-size: .88rem; }
.kc-citation-index th, .kc-citation-index td { padding: .8rem .9rem; text-align: left; vertical-align: top; border-bottom: 1px solid var(--fdpm-rule); }
.kc-citation-index th { color: var(--fdpm-muted); font: 700 .7rem/1.2 var(--fdpm-code-font); letter-spacing: .08em; text-transform: uppercase; }
.kc-citation-index tbody tr:last-child td { border-bottom: 0; }
.kc-citation-index td:nth-child(2) { font: 750 .72rem/1.3 var(--fdpm-code-font); letter-spacing: .05em; }
.kc-citation-index tr.pass td:nth-child(2) { color: var(--fdpm-ok); }
.kc-citation-index tr.fail td:nth-child(2) { color: var(--fdpm-bad); }
.kc-citation-index tr.unchecked td:nth-child(2) { color: var(--fdpm-warn); }
.kc-caveat { max-width: 70ch; margin: 1rem 0 0; padding-left: 1rem; border-left: 3px solid var(--fdpm-warn); color: var(--fdpm-muted); }
.kc-source { display: grid; grid-template-columns: minmax(12rem, .8fr) minmax(0, 1.6fr); gap: clamp(1.2rem, 4vw, 4rem); padding: 1.8rem 0; border-top: 1px solid var(--fdpm-rule); }
.kc-source h3 { margin: 0; font: 650 1.1rem/1.35 var(--fdpm-reading-font); }
.kc-source-meta { display: block; margin-top: .6rem; color: var(--fdpm-muted); font: .78rem/1.5 var(--fdpm-body-font); }
.kc-empty { margin: 0; color: var(--fdpm-muted); font-style: italic; }
.kc-defects { padding-left: 1.2rem; }
.kc-defects li { max-width: 72ch; margin-block: .75rem; }
@media (max-width: 48rem) {
  .kc-masthead, .kc-source { grid-template-columns: 1fr; }
  .kc-citation-index { width: min(100% - 1.25rem, 74rem); }
  .kc-table-frame { border-radius: .35rem; }
  .kc-citation-index th, .kc-citation-index td { padding: .65rem; }
}
@media print {
  .kc-citation-index { width: 100%; padding: 0; }
  .kc-masthead h1 { font-size: 20pt !important; }
  .kc-section { margin-top: 18pt; }
  .kc-source { break-inside: avoid; page-break-inside: avoid; }
  .kc-table-frame { overflow: visible; border-radius: 0; }
}
`;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface CheckRow {
  label: string;
  verdict: "pass" | "fail" | "unchecked";
  detail: string;
}

export function renderCitationIndex(input: RendererInput): RendererOutput {
  const m = buildModel(input.primitives, input.relations);
  const c = m.cartridge;
  const title = c ? fieldOf(c, "cartridge_id") : "cartridge";

  const diagnostics = m.layers.find((l) => l.label.startsWith("L4"))?.items.length ?? 0;
  const overrides = m.layers.find((l) => l.label.startsWith("L5"))?.items.length ?? 0;
  const rate = m.harvest.discardRate;

  const checks: CheckRow[] = [
    {
      label: "Every normative claim carries KEY:ordinal",
      verdict: m.uncited.length === 0 ? "pass" : "fail",
      detail: m.uncited.length === 0 ? "no uncited claims" : `${m.uncited.length} uncited: ${m.uncited.map((u) => u.id).join(", ")}`,
    },
    {
      label: "Discard rate >= 50%",
      verdict: rate === null ? "unchecked" : rate >= 0.5 ? "pass" : "fail",
      detail:
        rate === null
          ? "no harvest rows recorded"
          : `${(rate * 100).toFixed(0)}% (${m.harvest.discarded} of ${m.harvest.total})`,
    },
    {
      label: "L4 has >= 8 rows",
      verdict: diagnostics >= 8 ? "pass" : "fail",
      detail: `${diagnostics} diagnostics`,
    },
    {
      label: "L5 exists and is non-empty",
      verdict: overrides > 0 ? "pass" : "fail",
      detail: `${overrides} overrides`,
    },
    {
      label: "Exclusions list is non-empty",
      verdict: m.excluded.length > 0 ? "pass" : "fail",
      detail: `${m.excluded.length} exclusions`,
    },
    {
      label: "Declared gaps present",
      verdict: m.gaps.length > 0 ? "pass" : "unchecked",
      detail: `${m.gaps.length} gaps declared`,
    },
    ...KC_UNENFORCEABLE_CHECKS.map(
      (k): CheckRow => ({ label: k.check, verdict: "unchecked", detail: k.why }),
    ),
  ];

  // Invert: source → the claims resting on it.
  const bySource = new Map<string, Array<{ claimId: string; citation: Citation }>>();
  for (const layer of m.layers) {
    for (const item of layer.items) {
      for (const cit of item.citations) {
        const list = bySource.get(cit.sourceId) ?? [];
        list.push({ claimId: item.instance.id, citation: cit });
        bySource.set(cit.sourceId, list);
      }
    }
  }
  for (const list of bySource.values()) list.sort((a, b) => a.citation.ordinal - b.citation.ordinal);

  const body: string[] = [
    '<main id="kc-citation-index" class="kc-citation-index">',
    '<header class="kc-masthead">',
    '<div><p class="kc-eyebrow">Knowledge cartridge · verification surface</p>',
    `<h1>${esc(title)} — citation index</h1></div>`,
    '<p class="kc-deck">Evidence inverted by source, so a reviewer can inspect every claim resting on an ordinal rather than trusting a clean-looking cartridge.</p>',
    "</header>",
    '<section class="kc-section" aria-labelledby="kc-scoreboard-heading">',
    '<div class="kc-section-heading"><span class="kc-section-number">01</span>',
    '<h2 id="kc-scoreboard-heading">Pass 6 scoreboard</h2></div>',
    '<div class="kc-table-frame" role="region" aria-label="Pass 6 verification scoreboard" tabindex="0">',
    "<table><thead><tr><th scope=\"col\">Check</th><th scope=\"col\">Verdict</th><th scope=\"col\">Detail</th></tr></thead><tbody>",
    ...checks.map(
      (k) =>
        `<tr class="${k.verdict}"><td>${esc(k.label)}</td><td>${k.verdict.toUpperCase()}</td><td>${esc(
          k.detail,
        )}</td></tr>`,
    ),
    "</tbody></table></div>",
    '<p class="kc-caveat"><strong>UNCHECKED is not PASS.</strong> Three of these checks cannot be made from the graph alone; they are listed so a clean scoreboard cannot be mistaken for a complete one.</p>',
    "</section>",
    '<section class="kc-section" aria-labelledby="kc-evidence-heading">',
    '<div class="kc-section-heading"><span class="kc-section-number">02</span>',
    '<h2 id="kc-evidence-heading">Evidence by source</h2></div>',
  ];

  for (const source of m.sources) {
    const claims = bySource.get(source.id) ?? [];
    body.push(
      '<article class="kc-source">',
      `<h3><code>${esc(fieldOf(source, "citation_key"))}</code> — ${esc(fieldOf(source, "title"))}` +
        `<span class="kc-source-meta">${esc(fieldOf(source, "tier"))} tier · ${numberOf(source, "sentence_count") || "?"} sentences</span></h3>`,
    );
    if (claims.length === 0) {
      body.push('<p class="kc-empty">No claim rests on this source. An uncited source is corpus, not evidence.</p>', "</article>");
      continue;
    }
    body.push('<div class="kc-table-frame"><table><thead><tr><th scope="col">Ordinal</th><th scope="col">Claim</th></tr></thead><tbody>');
    for (const { claimId, citation } of claims) {
      body.push(`<tr><td>${citation.ordinal}</td><td><code>${esc(claimId)}</code></td></tr>`);
    }
    body.push("</tbody></table></div>", "</article>");
  }
  if (m.sources.length === 0) body.push('<p class="kc-empty">No sources have been recorded.</p>');
  body.push("</section>");

  if (m.defects.length > 0) {
    body.push(
      '<section class="kc-section" aria-labelledby="kc-defects-heading">',
      '<div class="kc-section-heading"><span class="kc-section-number">03</span>',
      '<h2 id="kc-defects-heading">Corpus defects</h2></div>',
      '<ul class="kc-defects">',
    );
    for (const d of m.defects) {
      body.push(
        `<li><strong>${esc(fieldOf(d, "kind"))}</strong> (${esc(fieldOf(d, "grade"))}) — ${esc(
          fieldOf(d, "signal"),
        )} <em>Fix: ${esc(fieldOf(d, "fix"))}</em></li>`,
      );
    }
    body.push("</ul>", "</section>");
  }
  body.push("</main>");

  const html = renderStandaloneDocument({
    title: `${title} — citation index`,
    body: `<!-- generated by kc:CitationIndexRenderer -->\n${body.join("\n")}`,
    styles: CITATION_INDEX_STYLES,
    accent: "cobalt",
    bodyClass: "kc-citation-document",
  });

  return {
    bytes: new TextEncoder().encode(html),
    contentType: "text/html",
    filename: `${title || "cartridge"}-citations.html`,
  };
}
