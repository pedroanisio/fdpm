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

  out.push("<!doctype html>");
  out.push('<html lang="en">');
  out.push("<head>");
  out.push('<meta charset="utf-8">');
  out.push(`<title>${esc(tree.project_id)}</title>`);
  out.push(`<style>${BASE_CSS}</style>`);
  out.push("</head>");
  out.push("<body>");
  out.push("<header class=\"fdpm-header\">");
  out.push(`<h1>${esc(tree.project_id)}</h1>`);
  out.push(
    `<p class="fdpm-meta">Profile: <code>${esc(tree.profile.id)}</code> v${esc(
      tree.profile.version,
    )}</p>`,
  );
  for (const f of tree.findings) {
    out.push(`<aside class="fdpm-finding" data-rule="${esc(f.expression)}">${esc(f.message)}</aside>`);
  }
  out.push("</header>");

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

  out.push("</body>");
  out.push("</html>");

  return {
    bytes: new TextEncoder().encode(out.join("\n")),
    contentType: "text/html",
    filename: `${tree.project_id}.html`,
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
:root {
  --fg: #1a1a1a;
  --muted: #666;
  --rule: #ddd;
  --code-bg: #f6f6f6;
  --accent: #003366;
}
* { box-sizing: border-box; }
body {
  font-family: "Charter", "Georgia", serif;
  color: var(--fg);
  max-width: 48em;
  margin: 2em auto;
  padding: 0 1em;
  line-height: 1.5;
}
h1, h2, h3 { font-family: "Inter", "Helvetica Neue", sans-serif; color: var(--accent); }
h1 { font-size: 2em; margin-bottom: 0.2em; }
h2 { font-size: 1.4em; margin-top: 2em; border-bottom: 1px solid var(--rule); padding-bottom: 0.2em; }
h3 { font-size: 1.1em; margin-top: 1.4em; }
.fdpm-meta { color: var(--muted); font-size: 0.9em; }
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
code, pre { font-family: "JetBrains Mono", "Fira Code", monospace; }
pre { background: var(--code-bg); padding: 0.6em 0.8em; overflow-x: auto; }
@media print {
  body { max-width: none; margin: 0; padding: 0.5in; font-size: 11pt; }
  h1 { font-size: 18pt; }
  h2 { page-break-before: always; }
  h2:first-of-type { page-break-before: auto; }
  .fdpm-primitive { page-break-inside: avoid; }
}
`;
