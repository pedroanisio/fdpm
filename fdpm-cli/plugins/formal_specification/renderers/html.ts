import type {
  RendererFn,
  RendererOutput,
} from "../../../src/plugin/types.js";
import {
  buildDocumentTreeAuto,
  fieldRows,
  formatCitation,
  typeLabel,
  type SectionBlock,
} from "./_common.js";
import type { PrimitiveInstance } from "../../../src/core/models/instance.js";
import type { DomainProfile } from "../../../src/core/models/meta.js";
import { renderStandaloneDocument } from "../../../src/core/render/document.js";

/**
 * `text/html` renderer for the formal_specification profile.
 *
 * Self-contained HTML (no external assets) with a minimal print-friendly
 * stylesheet. The structure mirrors the Markdown renderer so the two
 * targets stay in lockstep — anyone implementing a third (e.g. DOCX)
 * can lift the same shape.
 */
export const renderHtml: RendererFn = (input): RendererOutput => {
  const tree = buildDocumentTreeAuto(input);
  const out: string[] = [];

  out.push('<main class="fdpm-specification">');
  out.push("<header class=\"fdpm-header\">");
  out.push(`<h1>${esc(tree.workbook_id)}</h1>`);
  out.push(
    `<p class="fdpm-meta">Profile: <code>${esc(tree.profile.id)}</code> v${esc(
      tree.profile.version,
    )}</p>`,
  );
  for (const f of tree.findings) {
    out.push(`<aside class="fdpm-finding" data-rule="${esc(f.expression)}">${esc(f.message)}</aside>`);
  }
  out.push("</header>");

  if (tree.sections.length === 0 && tree.unsectioned.length === 0 && tree.citations.length === 0) {
    out.push('<p class="fdpm-empty">No specification sections or primitives have been recorded yet.</p>');
  }

  for (const block of tree.sections) appendSection(out, block, tree.profile);

  if (tree.unsectioned.length > 0) {
    out.push('<section class="fdpm-section fdpm-unsectioned">');
    out.push("<h2>Appendix — Unsectioned</h2>");
    out.push(
      '<p class="fdpm-meta">Primitives not anchored to any section via <code>fs:ContainedIn</code> or matching <code>scope_id</code>.</p>',
    );
    for (const p of tree.unsectioned) appendPrimitive(out, p, tree.profile);
    out.push("</section>");
  }

  if (tree.citations.length > 0) {
    out.push('<section class="fdpm-bibliography">');
    out.push("<h2>Bibliography</h2>");
    out.push("<ol>");
    for (const c of tree.citations) {
      out.push(
        `<li><strong>[${esc(String(c.field_values["key"] ?? c.id))}]</strong> ${esc(formatCitation(c))}</li>`,
      );
    }
    out.push("</ol>");
    out.push("</section>");
  }

  out.push("</main>");

  const html = renderStandaloneDocument({
    title: tree.workbook_id,
    body: out.join("\n"),
    styles: BASE_CSS,
    accent: "cobalt",
  });

  return {
    bytes: new TextEncoder().encode(html),
    contentType: "text/html",
    filename: `${tree.workbook_id}.html`,
    ...(tree.findings.length > 0 ? { findings: tree.findings } : {}),
  };
};

function appendSection(
  out: string[],
  block: SectionBlock,
  profile: DomainProfile,
): void {
  out.push('<section class="fdpm-section">');
  out.push(
    `<h2>${block.number}. ${esc(block.title)}${
      block.status ? ` <span class="fdpm-status">${esc(block.status)}</span>` : ""
    }</h2>`,
  );
  if (block.description) out.push(`<p>${esc(block.description)}</p>`);
  for (const p of block.primitives) appendPrimitive(out, p, profile);
  out.push("</section>");
}

function appendPrimitive(
  out: string[],
  p: PrimitiveInstance,
  profile: DomainProfile,
): void {
  out.push('<article class="fdpm-primitive">');
  out.push(
    `<h3>${esc(typeLabel(p.type_id, profile))} <code>${esc(p.id)}</code></h3>`,
  );
  out.push("<dl>");
  for (const row of fieldRows(p, profile)) {
    out.push(`<dt>${esc(row.name)}</dt>`);
    if (row.value.includes("\n")) {
      out.push(`<dd><pre>${esc(row.value)}</pre></dd>`);
    } else {
      out.push(`<dd>${esc(row.value)}</dd>`);
    }
  }
  out.push("</dl>");
  out.push("</article>");
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const BASE_CSS = `
* { box-sizing: border-box; }
body {
  padding: 2.5rem 1rem 5rem;
  font-family: var(--fdpm-reading-font);
  color: var(--fg);
  line-height: 1.58;
}
.fdpm-specification {
  max-width: 48em;
  margin: 0 auto;
}
h1, h2, h3 { font-family: var(--fdpm-body-font); color: var(--accent); }
h1 { font-size: 2em; margin-bottom: 0.2em; }
h2 { font-size: 1.4em; margin-top: 2em; border-bottom: 1px solid var(--rule); padding-bottom: 0.2em; }
h3 { font-size: 1.1em; margin-top: 1.4em; }
.fdpm-meta { color: var(--muted); font-size: 0.9em; }
.fdpm-empty { color: var(--muted); font-style: italic; }
.fdpm-status {
  font-weight: normal;
  font-size: 0.7em;
  background: var(--code-bg);
  padding: 0.1em 0.4em;
  border-radius: 0.3em;
  vertical-align: middle;
}
.fdpm-primitive {
  border-left: 3px solid var(--rule);
  padding: 0 1em;
  margin: 1em 0;
}
dl { margin: 0.5em 0; }
dt { font-weight: 600; margin-top: 0.5em; }
dd { margin: 0.2em 0 0.5em 1.2em; }
code, pre { font-family: var(--fdpm-code-font); }
pre { background: var(--code-bg); padding: 0.6em 0.8em; overflow-x: auto; }
@media print {
  h1 { font-size: 18pt; }
  .fdpm-section { break-before: page; }
  .fdpm-section:first-of-type { break-before: auto; }
  .fdpm-primitive { page-break-inside: avoid; }
}
`;
