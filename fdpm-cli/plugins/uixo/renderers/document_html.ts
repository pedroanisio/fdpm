/**
 * `text/html` — the document as a reviewable specification.
 *
 * The first version of this renderer put every attribute through one
 * flattening function and emitted 346 identical cards. On the reference
 * document that meant the whole payload — the prose, the CSS custom
 * properties, the hex colours, the measured contrast ratios — arrived as
 * a grey comma-separated run-on, and 118 root entities stacked with no
 * way to reach any of them. Present but unreadable is worse than absent:
 * it looks like the document has been rendered.
 *
 * What replaced it, in the order a reader needs it:
 *
 *  1. **Summary** — counts, and the classes actually used.
 *  2. **Palette** — every entity denoting a colour, as a swatch with its
 *     hex, its custom-property name and its prose. A design document is
 *     mostly colour tokens; a list of grey rows reading "Color: accent"
 *     is strictly worse than the colour.
 *  3. **Findings** — anything carrying a warning or error status, lifted
 *     out of whatever depth containment buried it at.
 *  4. **Structure** — the containment forest, prose first, then facts
 *     with their types preserved: swatches, badges, resolving links.
 *  5. **Censuses** — edges by property, classes in use.
 *
 * A sticky index makes all of it reachable, which a 346-entity page needs
 * and the previous version did not have.
 *
 * Two properties are load-bearing and both are asserted by the suite:
 *
 *  - **Self-contained.** No script, no stylesheet link, no `@import`, no
 *    absolute URL. Opening the file must not reach the network.
 *  - **Escaped.** Every value goes through `esc()`, and anything reaching
 *    a CSS context is additionally matched against the hex grammar —
 *    escaping protects the HTML parser, not the CSS one.
 */

import type { RendererInput, RendererOutput } from "../../../src/plugin/types.js";
import { renderStandaloneDocument } from "../../../src/core/render/document.js";
import { displayName, readDocument, type DocumentView, type NodeView } from "./_model.js";
import {
  byClass,
  colorTokens,
  findings,
  humanKey,
  present,
  readableInkOn,
  shortClass,
  type Fact,
  type Presented,
  type Value,
} from "./_present.js";

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** A hex safe to interpolate into a `style` attribute; else null. */
const cssHex = (hex: string): string | null =>
  /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(hex) ? hex : null;

/**
 * A fragment id safe for `id=` and `href="#…"`. Entity ids carry colons
 * and slashes, so they are slugged rather than escaped: escaping keeps
 * the page valid but leaves anchors that do not resolve, and a link that
 * silently goes nowhere is worse than no link. Slugging the primitive id
 * keeps uniqueness, which the host guarantees inside a workbook.
 */
const anchor = (primitiveId: string): string =>
  `n-${primitiveId.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "")}`;

// ── Values ─────────────────────────────────────────────────────────────

function renderValue(value: Value): string {
  switch (value.kind) {
    case "color": {
      const safe = cssHex(value.hex);
      return safe
        ? `<span class="chip"><i style="background:${safe}"></i><code>${esc(value.hex)}</code></span>`
        : `<code>${esc(value.text)}</code>`;
    }
    case "status":
      return `<span class="badge t-${esc(value.tone)}">${esc(value.text)}</span>`;
    case "ratio":
      return `<span class="num">${esc(value.text)}</span>`;
    case "measure":
      return `<span class="num">${esc(value.text)}</span>`;
    case "code":
      return `<code>${esc(value.text)}</code>`;
    case "ref":
      return value.id === null
        ? `<code>${esc(value.text)}</code>`
        : `<a href="#${esc(anchor(value.id))}">${esc(value.text)}</a>`;
    case "list":
      return value.items.length === 0
        ? `<span class="muted">none</span>`
        : value.items.map(renderValue).join('<span class="sep">·</span>');
    case "group":
      return factList(value.entries, "nested");
    default:
      return esc(value.text);
  }
}

function factList(facts: Fact[], cssClass: string): string {
  if (facts.length === 0) return "";
  return [
    `<dl class="${cssClass}">`,
    ...facts.flatMap((f) => [
      `<dt>${esc(humanKey(f.key))}</dt>`,
      `<dd>${renderValue(f.value)}</dd>`,
    ]),
    `</dl>`,
  ].join("");
}

// ── Entities ───────────────────────────────────────────────────────────

function entityCard(doc: DocumentView, p: Presented, seen: Set<string>): string {
  const node = p.node;
  const parts: string[] = [];
  const swatch = p.swatch ? cssHex(p.swatch) : null;

  parts.push(
    `<article class="node" id="${esc(anchor(node.id))}" data-class="${esc(node.className)}" data-depth="${node.depth}">`,
  );
  parts.push(`<header>`);
  if (swatch) parts.push(`<i class="dot" style="background:${swatch}"></i>`);
  parts.push(`<h3>${esc(displayName(node))}</h3>`);
  parts.push(`<span class="cls">${esc(shortClass(node.className))}</span>`);
  for (const badge of p.badges) {
    parts.push(`<span class="badge t-${esc(badge.tone)}">${esc(badge.label)}</span>`);
  }
  parts.push(`<code class="eid">${esc(node.entityId)}</code>`);
  parts.push(`</header>`);

  if (p.description) parts.push(`<p class="prose">${esc(p.description)}</p>`);

  if (p.cssName || swatch) {
    parts.push(`<p class="token">`);
    if (p.cssName) parts.push(`<code>${esc(p.cssName)}</code>`);
    if (swatch) {
      parts.push(`<span class="chip"><i style="background:${swatch}"></i><code>${esc(p.swatch)}</code></span>`);
    }
    parts.push(`</p>`);
  }

  parts.push(factList(p.facts, "facts"));

  const links = (groups: NodeView["crossLinks"], dir: string): void => {
    if (groups.length === 0) return;
    parts.push(`<ul class="links ${dir}">`);
    for (const group of groups) {
      const targets = group.targets
        .map((t) => {
          const target = doc.nodes.get(t);
          return target
            ? `<a href="#${esc(anchor(t))}">${esc(displayName(target))}</a>`
            : `<code>${esc(t)}</code>`;
        })
        .join('<span class="sep">·</span>');
      parts.push(`<li><span class="prop">${esc(humanKey(group.property))}</span> ${targets}</li>`);
    }
    parts.push(`</ul>`);
  };
  links(node.crossLinks, "out");
  links(node.backLinks, "in");

  const kids = node.children.filter((c) => !seen.has(c));
  if (kids.length > 0) {
    parts.push(`<div class="children">`);
    for (const child of kids) {
      seen.add(child);
      const kid = doc.nodes.get(child);
      if (kid) parts.push(entityCard(doc, present(doc, kid), seen));
    }
    parts.push(`</div>`);
  }

  parts.push(`</article>`);
  return parts.join("\n");
}

// ── Sections ───────────────────────────────────────────────────────────

function swatchFigure(t: ReturnType<typeof colorTokens>[number]): string {
  const safe = cssHex(t.hex);
  const ink = safe ? readableInkOn(safe) : "#000000";
  return [
    `<figure class="swatch">`,
    `<a class="well" href="#${esc(anchor(t.id))}" style="background:${safe ?? "transparent"};color:${ink}">`,
    `<span>${esc(t.hex)}</span></a>`,
    `<figcaption><b>${esc(t.name)}</b>`,
    t.cssName ? `<code>${esc(t.cssName)}</code>` : "",
    t.description ? `<span class="muted">${esc(t.description)}</span>` : "",
    `</figcaption></figure>`,
  ].join("");
}

function paletteSection(doc: DocumentView): string {
  const tokens = colorTokens(doc);
  if (tokens.length === 0) return "";

  // Colours declared on their own entity first, then each nested set as
  // its own band — a theme override is a set, not eleven loose swatches.
  const own = tokens.filter((t) => t.set === undefined);
  const sets = new Map<string, typeof tokens>();
  for (const t of tokens) {
    if (t.set !== undefined) sets.set(t.set, [...(sets.get(t.set) ?? []), t]);
  }

  const parts = [`<section id="palette"><h2>Palette <span class="count">${tokens.length}</span></h2>`];
  if (own.length > 0) {
    parts.push(`<div class="swatches">${own.map(swatchFigure).join("")}</div>`);
  }
  for (const [name, group] of sets) {
    parts.push(`<h3 class="setname">${esc(name)} <span class="count">${group.length}</span></h3>`);
    parts.push(`<div class="swatches">${group.map(swatchFigure).join("")}</div>`);
  }
  parts.push(`</section>`);
  return parts.join("\n");
}

function findingsSection(doc: DocumentView): string {
  const rows = findings(doc);
  if (rows.length === 0) return "";
  return [
    `<section id="findings"><h2>Findings <span class="count">${rows.length}</span></h2>`,
    `<table class="findings"><thead><tr><th>Severity</th><th>What</th><th>Detail</th></tr></thead><tbody>`,
    ...rows.map(
      (r) =>
        `<tr><td><span class="badge t-${esc(r.tone)}">${esc(r.severity ?? r.tone)}</span></td>` +
        `<td><a href="#${esc(anchor(r.id))}">${esc(r.name)}</a>` +
        (r.code ? ` <code>${esc(r.code)}</code>` : "") +
        `<br><span class="cls">${esc(shortClass(r.className))}</span></td>` +
        `<td>${esc(r.message ?? "")}</td></tr>`,
    ),
    `</tbody></table></section>`,
  ].join("\n");
}

function censusTable(title: string, header: string, rows: { label: string; count: number }[]): string {
  if (rows.length === 0) return "";
  const max = Math.max(...rows.map((r) => r.count), 1);
  return [
    `<h3>${esc(title)}</h3>`,
    `<table class="census"><thead><tr><th>${esc(header)}</th><th class="num">n</th><th></th></tr></thead><tbody>`,
    ...rows.map(
      (r) =>
        `<tr><td><code>${esc(r.label)}</code></td><td class="num">${esc(r.count)}</td>` +
        // Width-only inline style over a computed percentage; never author
        // text, so no author string reaches a CSS context.
        `<td class="barcell"><span class="bar" style="width:${((r.count / max) * 100).toFixed(1)}%"></span></td></tr>`,
    ),
    `</tbody></table>`,
  ].join("\n");
}

function indexNav(doc: DocumentView, hasPalette: boolean, hasFindings: boolean): string {
  const classes = byClass(doc).slice(0, 24);
  return [
    `<nav id="index">`,
    `<b>Contents</b>`,
    `<ul>`,
    `<li><a href="#summary">Summary</a></li>`,
    hasPalette ? `<li><a href="#palette">Palette</a></li>` : "",
    hasFindings ? `<li><a href="#findings">Findings</a></li>` : "",
    `<li><a href="#structure">Structure</a></li>`,
    `<li><a href="#census">Census</a></li>`,
    `</ul>`,
    `<b>Classes</b>`,
    `<ul class="classes">`,
    // Each class jumps to its first instance. There is no per-class
    // section to anchor — the page is organised by containment, not by
    // class — so a link to a heading that does not exist would be a
    // dead link dressed as navigation.
    ...classes.map(
      (c) =>
        `<li><a href="#${esc(anchor(c.nodes[0]!.id))}">${esc(shortClass(c.className))}</a><span>${c.nodes.length}</span></li>`,
    ),
    `</ul>`,
    `</nav>`,
  ].join("\n");
}

const PAGE_CSS = `
:root { --ok:var(--fdpm-ok); --warn:var(--fdpm-warn); --err:var(--fdpm-bad); --nav:280px; }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--fg);
  font:15px/1.55 var(--fdpm-body-font); }
.layout { display:grid; grid-template-columns:var(--nav) minmax(0,1fr); gap:2.5rem; max-width:96rem; margin:0 auto; padding:2rem 1.5rem 6rem; }
@media (max-width:60rem) { .layout { grid-template-columns:minmax(0,1fr); } #index { position:static; max-height:none; } }
#index { position:sticky; top:2rem; align-self:start; max-height:calc(100vh - 4rem); overflow:auto; font-size:.83rem; }
#index b { display:block; margin:1rem 0 .35rem; font-size:.7rem; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); }
#index b:first-child { margin-top:0; }
#index ul { list-style:none; margin:0; padding:0; }
#index li { display:flex; justify-content:space-between; gap:.5rem; padding:.12rem 0; }
#index li span { color:var(--muted); font-variant-numeric:tabular-nums; }
a { color:var(--accent); text-decoration:underline; text-underline-offset:.14em; }
#index a { text-decoration:none; }
a:hover { text-decoration-thickness:.12em; }
h1 { font-size:1.85rem; margin:0 0 .2rem; letter-spacing:-.01em; }
h2 { font-size:1.15rem; margin:2.5rem 0 .75rem; padding-bottom:.4rem; border-bottom:2px solid var(--fg); display:flex; align-items:baseline; gap:.6rem; }
h3 { font-size:.95rem; margin:0; font-weight:650; }
h2 .count { font-size:.75rem; font-weight:400; color:var(--muted); }
.lede { color:var(--muted); margin:0 0 .5rem; }
code { font-family:var(--fdpm-code-font); font-size:.84em; }
.muted { color:var(--muted); }
.num { font-variant-numeric:tabular-nums; }
.sep { color:var(--line); margin:0 .35em; }

.metrics { display:flex; flex-wrap:wrap; gap:.5rem 2.5rem; margin:1rem 0 0; padding:0; list-style:none; }
.metrics div { display:flex; flex-direction:column; }
.metrics dt { font-size:.7rem; text-transform:uppercase; letter-spacing:.07em; color:var(--muted); }
.metrics dd { margin:0; font-size:1.5rem; font-variant-numeric:tabular-nums; line-height:1.2; }

.swatches { display:grid; grid-template-columns:repeat(auto-fill,minmax(11rem,1fr)); gap:.85rem; }
.swatch { margin:0; }
.swatch .well { display:flex; align-items:flex-end; height:4.5rem; padding:.35rem .5rem; border:1px solid var(--line);
  border-radius:6px; text-decoration:none; }
.swatch .well span { font-family:var(--fdpm-code-font); font-size:.72rem; }
.setname { margin:1.25rem 0 .5rem; font-size:.78rem; text-transform:uppercase; letter-spacing:.07em; color:var(--muted); }
.setname .count { text-transform:none; letter-spacing:0; }
.swatch figcaption { display:flex; flex-direction:column; gap:.1rem; margin-top:.35rem; font-size:.78rem; line-height:1.4; }
.swatch figcaption .muted { font-size:.74rem; }

.chip { display:inline-flex; align-items:center; gap:.35em; }
.chip i { width:.8em; height:.8em; border:1px solid var(--line); border-radius:2px; display:inline-block; }
.dot { width:.85rem; height:.85rem; border-radius:3px; border:1px solid var(--line); flex:none; }

.badge { display:inline-block; padding:.05em .5em; border-radius:999px; font-size:.7rem; font-weight:600;
  border:1px solid currentColor; white-space:nowrap; }
.t-ok { color:var(--ok); } .t-warn { color:var(--warn); } .t-error { color:var(--err); }
.t-info { color:var(--accent); } .t-muted { color:var(--muted); }

.node { border:1px solid var(--line); border-radius:7px; background:var(--panel); padding:.6rem .8rem; margin:.5rem 0; }
.node header { display:flex; flex-wrap:wrap; align-items:center; gap:.45rem; }
.node .cls { font-family:var(--fdpm-code-font); font-size:.72rem; color:var(--muted); }
.node .eid { margin-left:auto; color:var(--muted); font-size:.72rem; }
.node .prose { margin:.4rem 0 .3rem; font-size:.88rem; max-width:68ch; }
.node .token { margin:.25rem 0; display:flex; gap:.75rem; align-items:center; font-size:.8rem; }
.node .children { margin:.5rem 0 0 .9rem; padding-left:.8rem; border-left:2px solid var(--line); }

dl.facts, dl.nested { display:grid; grid-template-columns:minmax(6rem,10rem) minmax(0,1fr); gap:.1rem .8rem; margin:.35rem 0; font-size:.8rem; }
dl.nested { margin:.15rem 0 .15rem .2rem; }
dl.facts > dt, dl.nested > dt { color:var(--muted); }
dl.facts > dd, dl.nested > dd { margin:0; min-width:0; overflow-wrap:anywhere; }

ul.links { list-style:none; margin:.3rem 0 0; padding:0; font-size:.78rem; }
ul.links li { display:flex; gap:.45rem; padding:.05rem 0; }
ul.links .prop { color:var(--muted); flex:none; min-width:9rem; }
ul.links.in { border-left:2px solid var(--line); padding-left:.55rem; }
ul.links.in .prop::before { content:"← "; }
ul.links.out .prop::before { content:"→ "; }

table { border-collapse:collapse; width:100%; font-size:.83rem; margin:.4rem 0 1rem; }
th, td { text-align:left; vertical-align:top; padding:.3rem .55rem; border-bottom:1px solid var(--line); }
th { font-size:.7rem; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); }
td.num, th.num { text-align:right; font-variant-numeric:tabular-nums; width:3.5rem; }
.barcell { width:40%; }
.bar { display:block; height:.5rem; background:var(--muted); border-radius:2px; opacity:.55; }
.census-cols { display:grid; grid-template-columns:repeat(auto-fit,minmax(20rem,1fr)); gap:0 2rem; }
.warn-note { color:var(--err); font-weight:600; }
.empty { color:var(--muted); font-style:italic; }
@media (max-width:42rem) {
  .layout { padding:1.5rem 1rem 6rem; }
  .census-cols, .swatches { grid-template-columns:minmax(0,1fr); }
  dl.facts, dl.nested { grid-template-columns:minmax(0,1fr); }
  ul.links li { flex-wrap:wrap; }
  ul.links .prop { min-width:0; }
}
@media print { #index { display:none !important; } .layout { display:block; max-width:none; padding:0; } .census-cols { display:block; } }
`.trim();

export function renderDocumentHtml(input: RendererInput): RendererOutput {
  const doc = readDocument(input);
  const tokens = colorTokens(doc);
  const flagged = findings(doc);

  const parts: string[] = [
    `<div class="layout">`,
    indexNav(doc, tokens.length > 0, flagged.length > 0),
    `<main>`,
    `<section id="summary">`,
    `<h1>UIXO document</h1>`,
    `<p class="lede">workbook <code>${esc(doc.workbookId)}</code> on <code>${esc(doc.profileId)}</code></p>`,
    `<dl class="metrics">`,
    ...[
      ["Entities", doc.nodeCount],
      ["Edges", doc.edgeCount],
      ["Roots", doc.roots.length],
      ["Classes", doc.classCensus.length],
      ["Properties", doc.relationCensus.length],
      ["Max depth", Math.max(...[...doc.nodes.values()].map((n) => n.depth), 0)],
    ].map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`),
    `</dl>`,
    doc.cycleBroken.length > 0
      ? `<p class="warn-note">${esc(doc.cycleBroken.length)} entity(ies) are reachable only by breaking a cycle in the containment graph.</p>`
      : "",
    `</section>`,
    paletteSection(doc),
    findingsSection(doc),
    `<section id="structure"><h2>Structure <span class="count">${doc.nodeCount} entities, ${doc.roots.length} roots</span></h2>`,
  ];

  if (doc.nodeCount === 0) {
    parts.push(`<p class="empty">No UIXO entities have been recorded yet.</p>`);
  } else {
    const seen = new Set<string>();
    for (const root of doc.roots) {
      if (seen.has(root)) continue;
      seen.add(root);
      const node = doc.nodes.get(root);
      if (node) parts.push(entityCard(doc, present(doc, node), seen));
    }
  }
  parts.push(`</section>`);

  parts.push(`<section id="census"><h2>Census</h2><div class="census-cols">`);
  parts.push(
    censusTable(
      "Edges by property",
      "Property",
      doc.relationCensus.map((r) => ({ label: r.property, count: r.count })),
    ),
  );
  parts.push(
    censusTable(
      "Classes in use",
      "Class",
      doc.classCensus.map((c) => ({ label: c.className, count: c.count })),
    ),
  );
  parts.push(`</div></section>`);

  parts.push(`</main>`, `</div>`);
  const html = renderStandaloneDocument({
    title: `UIXO document — ${doc.workbookId}`,
    body: parts.join("\n"),
    styles: PAGE_CSS,
    accent: "jade",
  });

  return {
    bytes: new TextEncoder().encode(html),
    contentType: "text/html",
    filename: "uixo-document.html",
  };
}
