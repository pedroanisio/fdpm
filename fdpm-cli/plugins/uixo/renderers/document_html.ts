/**
 * `text/html` — the document as a reviewable specification page.
 *
 * The markdown outline is a nested list; a browser can do more with the
 * same graph without doing anything a static file cannot. Containment
 * nests as real elements, every cross-link is an anchor to the entity it
 * names, and every entity carries an `id` so a reviewer can send a
 * colleague a URL that lands on the node under discussion — which is the
 * whole reason a UI model gets reviewed in a browser rather than a diff.
 *
 * Two properties are load-bearing and both are asserted by the suite:
 *
 *  - **Self-contained.** No script, no stylesheet link, no `@import`, no
 *    absolute URL. Opening the file must not reach the network.
 *  - **Escaped.** Every value interpolated into the page goes through
 *    `esc()`. Labels and attribute values are author text, and a `<` in
 *    author text is a `<` on the page, never the start of an element.
 */

import type { RendererInput, RendererOutput } from "../../../src/plugin/types.js";
import { displayName, flattenValue, readDocument, type DocumentView, type NodeView } from "./_model.js";

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * A fragment id safe to put in `id=` and `href="#…"`.
 *
 * Entity ids are author-supplied and carry colons and slashes, so they
 * are slugged rather than escaped: escaping would keep the page valid but
 * leave anchors that do not resolve, and a link that silently goes
 * nowhere is worse than no link. Collisions are avoided by slugging the
 * primitive id, which the host guarantees unique inside a workbook.
 */
const anchor = (primitiveId: string): string =>
  `n-${primitiveId.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "")}`;

function attributeRows(node: NodeView): string {
  const rows = node.attributes.filter(([, v]) => v !== undefined && v !== null);
  if (rows.length === 0) return "";
  return [
    `<table class="fields">`,
    ...rows.map(
      ([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(flattenValue(v))}</td></tr>`,
    ),
    `</table>`,
  ].join("");
}

function linkList(
  doc: DocumentView,
  links: { property: string; targets: string[] }[],
  cssClass: string,
  arrow: string,
): string {
  if (links.length === 0) return "";
  const items = links.map((link) => {
    const targets = link.targets
      .map((t) => {
        const target = doc.nodes.get(t);
        const name = target ? displayName(target) : t;
        return `<a href="#${esc(anchor(t))}">${esc(name)}</a>`;
      })
      .join(", ");
    return `<li><code>${esc(arrow)} ${esc(link.property)}</code> ${targets}</li>`;
  });
  return `<ul class="${cssClass}">${items.join("")}</ul>`;
}

function nodeSection(doc: DocumentView, id: string, seen: Set<string>): string {
  if (seen.has(id)) return "";
  seen.add(id);
  const node = doc.nodes.get(id);
  if (!node) return "";

  const parts: string[] = [];
  parts.push(
    `<section class="node" id="${esc(anchor(id))}" data-class="${esc(node.className)}" data-depth="${node.depth}">`,
  );
  parts.push(
    `<h3><span class="cls">${esc(node.className)}</span> ${esc(displayName(node))}` +
      `<code class="eid">${esc(node.entityId)}</code>` +
      (node.orderIndex === undefined ? "" : `<span class="ord">order ${esc(node.orderIndex)}</span>`) +
      `</h3>`,
  );
  parts.push(attributeRows(node));
  parts.push(linkList(doc, node.crossLinks, "links out", "→"));
  parts.push(linkList(doc, node.backLinks, "links in", "←"));
  if (node.children.length > 0) {
    parts.push(`<div class="children">`);
    for (const child of node.children) parts.push(nodeSection(doc, child, seen));
    parts.push(`</div>`);
  }
  parts.push(`</section>`);
  return parts.join("\n");
}

function censusTable(title: string, header: string, rows: { label: string; count: number }[]): string {
  if (rows.length === 0) return "";
  const max = Math.max(...rows.map((r) => r.count), 1);
  return [
    `<h2>${esc(title)}</h2>`,
    `<table class="census">`,
    `<thead><tr><th>${esc(header)}</th><th>Count</th><th></th></tr></thead>`,
    `<tbody>`,
    ...rows.map(
      (r) =>
        `<tr><td><code>${esc(r.label)}</code></td><td class="num">${esc(r.count)}</td>` +
        // The bar is width-only inline style over a computed percentage —
        // never author text, so no author string reaches a CSS context.
        `<td class="barcell"><span class="bar" style="width:${((r.count / max) * 100).toFixed(1)}%"></span></td></tr>`,
    ),
    `</tbody></table>`,
  ].join("\n");
}

const PAGE_CSS = `
:root { color-scheme: light dark; --bg:#ffffff; --fg:#16181d; --muted:#5b616e; --line:#d8dbe2; --panel:#f6f7f9; --accent:#2b5fa8; }
@media (prefers-color-scheme: dark) { :root { --bg:#101215; --fg:#e6e8ec; --muted:#9aa1ad; --line:#2a2e36; --panel:#171a1f; --accent:#7ea6e0; } }
* { box-sizing: border-box; }
body { margin:0; padding:2rem 1.25rem 5rem; background:var(--bg); color:var(--fg);
  font:15px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
main { max-width: 68rem; margin: 0 auto; }
h1 { font-size: 1.7rem; margin: 0 0 .25rem; }
h2 { font-size: 1.2rem; margin: 2.25rem 0 .5rem; border-top: 2px solid var(--fg); padding-top: .7rem; }
h3 { font-size: .95rem; margin: 0 0 .4rem; display: flex; flex-wrap: wrap; align-items: baseline; gap: .45rem; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .86em; }
a { color: var(--accent); }
.subtitle { color: var(--muted); margin: 0 0 1.25rem; }
.node { border: 1px solid var(--line); border-left: 3px solid var(--accent); border-radius: 5px;
  padding: .55rem .75rem; margin: .45rem 0; background: var(--panel); }
.node .children { margin-top: .5rem; }
.cls { font-family: ui-monospace, monospace; font-size: .8rem; color: var(--muted); }
.eid { border: 1px solid var(--line); border-radius: 3px; padding: 0 .3em; color: var(--muted); }
.ord { font-size: .72rem; color: var(--muted); }
table { border-collapse: collapse; margin: .35rem 0 .5rem; }
table.fields th, table.fields td { text-align: left; vertical-align: top; padding: .15rem .6rem .15rem 0;
  font-size: .82rem; border-bottom: 1px solid var(--line); }
table.fields th { font-weight: 600; color: var(--muted); white-space: nowrap; }
ul.links { list-style: none; padding: 0; margin: .2rem 0; font-size: .82rem; }
ul.links li { margin: .1rem 0; }
ul.in { opacity: .75; }
table.census { width: 100%; }
table.census th, table.census td { text-align: left; padding: .2rem .5rem; border-bottom: 1px solid var(--line); font-size: .85rem; }
table.census .num { text-align: right; width: 4rem; }
.barcell { width: 45%; }
.bar { display: block; height: .55rem; background: var(--muted); border-radius: 2px; }
.warn { color: #b3261e; font-weight: 600; }
.empty { color: var(--muted); font-style: italic; }
`.trim();

export function renderDocumentHtml(input: RendererInput): RendererOutput {
  const doc = readDocument(input);

  const parts: string[] = [
    `<!doctype html>`,
    `<html lang="en">`,
    `<head>`,
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<title>UIXO document — ${esc(doc.workbookId)}</title>`,
    `<style>${PAGE_CSS}</style>`,
    `</head>`,
    `<body>`,
    `<main>`,
    `<h1>UIXO document</h1>`,
    `<p class="subtitle">${esc(doc.nodeCount)} entities, ${esc(doc.edgeCount)} edges, ${esc(
      doc.roots.length,
    )} root(s) — workbook <code>${esc(doc.workbookId)}</code> on <code>${esc(doc.profileId)}</code>.</p>`,
  ];

  if (doc.cycleBroken.length > 0) {
    parts.push(
      `<p class="warn">${esc(doc.cycleBroken.length)} entity(ies) are reachable only by breaking a cycle in the containment graph.</p>`,
    );
  }

  parts.push(`<h2>Structure</h2>`);
  if (doc.nodeCount === 0) {
    parts.push(`<p class="empty">no uixo primitives in this workbook</p>`);
  } else {
    const seen = new Set<string>();
    for (const root of doc.roots) parts.push(nodeSection(doc, root, seen));
  }

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

  parts.push(`</main>`, `</body>`, `</html>`, ``);

  return {
    bytes: new TextEncoder().encode(parts.join("\n")),
    contentType: "text/html",
    filename: "uixo-document.html",
  };
}
