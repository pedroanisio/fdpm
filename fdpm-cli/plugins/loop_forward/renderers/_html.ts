/**
 * The page shell the three HTML renderers share.
 *
 * One shell, three pages, so a reviewer moving between the verification
 * surface, the authority matrix and the binding matrix reads the same
 * document rather than three that happen to be about the same workbook.
 *
 * The stylesheet is inlined and the page loads nothing: these are
 * artefacts attached to a review, opened from a file:// path or a CI
 * artifact store, where an external stylesheet resolves to nothing and
 * the page silently loses every signal colour carries.
 *
 * Verdict colours are also given a text label in every cell. Colour
 * alone is not a signal a reader with a colour-vision deficiency
 * receives, and these pages exist to be read.
 */

import { renderStandaloneDocument } from "../../../src/core/render/document.js";

export type Verdict = "ok" | "warn" | "bad" | "muted";

export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const STYLE = `
:root {
  --band: color-mix(in srgb, var(--panel) 88%, var(--ink));
  --ok: var(--fdpm-ok); --warn: var(--fdpm-warn); --bad: var(--fdpm-bad);
  --ok-bg: color-mix(in srgb, var(--fdpm-ok) 13%, transparent);
  --warn-bg: color-mix(in srgb, var(--fdpm-warn) 13%, transparent);
  --bad-bg: color-mix(in srgb, var(--fdpm-bad) 13%, transparent);
}
* { box-sizing: border-box; }
body {
  margin: 0; padding: 32px 28px 64px; background: var(--ground); color: var(--ink);
  font: 14px/1.55 var(--fdpm-body-font);
}
main { max-width: 1180px; margin: 0 auto; }
h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: -0.01em; }
h2 { font-size: 15px; margin: 34px 0 10px; padding-bottom: 6px; border-bottom: 1px solid var(--line); }
h3 { font-size: 13px; margin: 22px 0 8px; color: var(--muted); font-weight: 600; }
p.lede { margin: 0 0 6px; color: var(--muted); font-size: 13px; }
p.note { margin: 8px 0 0; font-size: 12px; color: var(--muted); }
.scroll { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 12.5px; }
caption { text-align: left; font-size: 12px; color: var(--muted); padding-bottom: 6px; }
th, td { text-align: left; padding: 6px 9px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { background: var(--band); font-weight: 600; font-size: 11.5px; white-space: nowrap; }
td.num { text-align: right; font-variant-numeric: tabular-nums; }
code, .mono { font-family: var(--fdpm-code-font); font-size: 11.5px; }
.cell { display: inline-block; padding: 1px 7px; border-radius: 3px; font-size: 11.5px; white-space: nowrap; }
.ok { background: var(--ok-bg); color: var(--ok); }
.warn { background: var(--warn-bg); color: var(--warn); }
.bad { background: var(--bad-bg); color: var(--bad); }
.muted { color: var(--muted); }
.summary { display: flex; flex-wrap: wrap; gap: 10px; margin: 14px 0 0; padding: 0; list-style: none; }
.summary li { border: 1px solid var(--line); border-radius: 5px; padding: 8px 12px; min-width: 128px; }
.summary .k { display: block; font-size: 11px; color: var(--muted); }
.summary .v { display: block; font-size: 19px; font-variant-numeric: tabular-nums; }
.findings { margin: 12px 0 0; padding-left: 18px; }
.findings li { margin: 3px 0; font-size: 13px; }
@media (max-width: 42rem) { body { padding: 24px 16px 72px; } }
`.trim();

export function cell(verdict: Verdict, label: string): string {
  return `<span class="cell ${verdict}">${esc(label)}</span>`;
}

/** Wrap page content in a complete, self-contained HTML document. */
export function page(args: {
  title: string;
  lede: string;
  workbookId: string;
  body: string;
}): string {
  const body = [
    "<main>",
    `<h1>${esc(args.title)}</h1>`,
    `<p class="lede">${esc(args.lede)}</p>`,
    `<p class="lede">Workbook <code>${esc(args.workbookId)}</code></p>`,
    args.body,
    "</main>",
  ].join("\n");
  return renderStandaloneDocument({
    title: args.title,
    body,
    styles: STYLE,
    accent: "crimson",
  });
}

/** A stat strip. Values are pre-formatted so the caller controls units. */
export function summary(items: readonly { key: string; value: string }[]): string {
  const cells = items
    .map(
      (item) =>
        `<li><span class="k">${esc(item.key)}</span><span class="v">${esc(item.value)}</span></li>`,
    )
    .join("");
  return `<ul class="summary">${cells}</ul>`;
}

/** A findings list, or an explicit all-clear. Never an empty element. */
export function findings(items: readonly { verdict: Verdict; text: string }[]): string {
  if (items.length === 0) {
    return `<p class="note">${cell("ok", "clear")} Nothing on this page needs attention.</p>`;
  }
  const rows = items
    .map((item) => `<li>${cell(item.verdict, item.verdict === "bad" ? "defect" : "check")} ${esc(item.text)}</li>`)
    .join("");
  return `<ul class="findings">${rows}</ul>`;
}

export function table(args: {
  caption?: string;
  headers: readonly string[];
  rows: readonly (readonly string[])[];
  empty?: string;
}): string {
  if (args.rows.length === 0) {
    return `<p class="note muted">${esc(args.empty ?? "Nothing to show.")}</p>`;
  }
  const head = args.headers.map((header) => `<th>${esc(header)}</th>`).join("");
  const body = args.rows
    .map((row) => `<tr>${row.map((value) => `<td>${value}</td>`).join("")}</tr>`)
    .join("");
  const caption = args.caption ? `<caption>${esc(args.caption)}</caption>` : "";
  return `<div class="scroll"><table>${caption}<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}
