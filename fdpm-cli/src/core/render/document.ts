/**
 * Shared shell for self-contained, user-facing HTML renderers.
 *
 * Renderer bodies remain domain-owned: a paper, a requirements specification,
 * and an authority matrix should not collapse into one generic template. This
 * module owns the cross-renderer contract around that body instead—closed
 * colour and type tokens, responsive bounds, keyboard focus, light/dark
 * themes, reduced motion, and lossless browser printing.
 */

export type DocumentAccent = "jade" | "cobalt" | "ochre" | "plum" | "crimson";

export interface StandaloneDocumentOptions {
  /** Plain-text document title. It is escaped before entering the head. */
  title: string;
  /** Trusted renderer-owned HTML. Values inside it must already be escaped. */
  body: string;
  /** Domain-specific CSS layered after the shared contract. */
  styles?: string;
  /** A closed accent role; arbitrary author-controlled CSS is not accepted. */
  accent?: DocumentAccent;
  lang?: string;
  bodyClass?: string;
}

export function escapeDocumentHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Wrap an escaped renderer body in the shared standalone-document contract.
 *
 * The theme control is CSS-only: some renderer contracts deliberately forbid
 * script tags in portable documents. Standalone files carry no external
 * assets, so opening an artifact from a file URL cannot fail a resource
 * request or silently lose its design system.
 */
export function renderStandaloneDocument(options: StandaloneDocumentOptions): string {
  const accent = options.accent ?? "jade";
  const lang = options.lang ?? "en";
  const bodyClass = options.bodyClass ? ` class="${escapeDocumentHtml(options.bodyClass)}"` : "";
  const domainStyles = options.styles?.trim() ?? "";

  return [
    "<!doctype html>",
    `<html lang="${escapeDocumentHtml(lang)}" data-accent="${accent}">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light dark">',
    `<title>${escapeDocumentHtml(options.title)}</title>`,
    `<style>${DOCUMENT_CSS}${domainStyles ? `\n${domainStyles}` : ""}\n${DOCUMENT_PRINT_CSS}</style>`,
    "</head>",
    `<body${bodyClass}>`,
    '<a class="fdpm-skip-link" href="#fdpm-content">Skip to content</a>',
    '<nav class="fdpm-document-actions" aria-label="Document actions" data-no-print>',
    '<input id="fdpm-theme-toggle" class="fdpm-theme-toggle" type="checkbox" data-fdpm-theme-toggle aria-label="Use alternate color theme">',
    '<label class="fdpm-theme-label" for="fdpm-theme-toggle" title="Switch color theme">',
    themeIcon(),
    "<span>Theme</span>",
    "</label>",
    '<button type="button" data-fdpm-print onclick="window.print()" title="Print or save as PDF">',
    printIcon(),
    "<span>Print</span>",
    "</button>",
    "</nav>",
    '<div id="fdpm-content" tabindex="-1">',
    options.body,
    "</div>",
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

function themeIcon(): string {
  return (
    '<svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" ' +
    'stroke="currentColor" stroke-width="1.8"><path d="M12 3v2m0 14v2M3 12h2m14 0h2' +
    'M5.64 5.64l1.42 1.42m9.88 9.88 1.42 1.42m0-12.72-1.42 1.42M7.06 16.94l-1.42 1.42"/>' +
    '<circle cx="12" cy="12" r="4"/></svg>'
  );
}

function printIcon(): string {
  return (
    '<svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" ' +
    'stroke="currentColor" stroke-width="1.8"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5' +
    'a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v7H6z"/></svg>'
  );
}

export const DOCUMENT_CSS = `
:root {
  color-scheme: light dark;
  --fdpm-paper: #f6f2e8;
  --fdpm-surface: #fffdf7;
  --fdpm-ink: #18221d;
  --fdpm-muted: #526059;
  --fdpm-rule: #c6cec7;
  --fdpm-accent: #075e54;
  --fdpm-accent-soft: #d9eee8;
  --fdpm-focus: #b1490c;
  --fdpm-ok: #176b43;
  --fdpm-warn: #765000;
  --fdpm-bad: #a33131;
  --fdpm-shadow: 0 16px 44px rgba(34, 43, 37, 0.12);
  --fdpm-body-font: "Avenir Next", Avenir, "Segoe UI", sans-serif;
  --fdpm-reading-font: Charter, "Bitstream Charter", "Iowan Old Style", "Palatino Linotype", Georgia, serif;
  --fdpm-code-font: "Berkeley Mono", "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
  --bg: var(--fdpm-paper);
  --ground: var(--fdpm-paper);
  --panel: var(--fdpm-surface);
  --ink: var(--fdpm-ink);
  --fg: var(--fdpm-ink);
  --muted: var(--fdpm-muted);
  --rule: var(--fdpm-rule);
  --line: var(--fdpm-rule);
  --accent: var(--fdpm-accent);
  --code-bg: color-mix(in srgb, var(--fdpm-ink) 6%, transparent);
}
:root[data-accent="cobalt"] { --fdpm-accent: #1f55a5; --fdpm-accent-soft: #dfe9f8; }
:root[data-accent="ochre"] { --fdpm-accent: #7a4c00; --fdpm-accent-soft: #f2e5c9; }
:root[data-accent="plum"] { --fdpm-accent: #70436d; --fdpm-accent-soft: #eee0ec; }
:root[data-accent="crimson"] { --fdpm-accent: #9b3337; --fdpm-accent-soft: #f3dedf; }
:root:has(#fdpm-theme-toggle:checked) {
  --fdpm-paper: #101713;
  --fdpm-surface: #18211c;
  --fdpm-ink: #edf0e7;
  --fdpm-muted: #b4beb5;
  --fdpm-rule: #45534a;
  --fdpm-accent: #74d8c5;
  --fdpm-accent-soft: #1d4038;
  --fdpm-focus: #ffb37a;
  --fdpm-ok: #72d7a0;
  --fdpm-warn: #f0c16d;
  --fdpm-bad: #ff9a96;
  --fdpm-shadow: 0 18px 52px rgba(0, 0, 0, 0.34);
}
@media (prefers-color-scheme:dark) {
  :root:not(:has(#fdpm-theme-toggle:checked)) {
    --fdpm-paper: #101713;
    --fdpm-surface: #18211c;
    --fdpm-ink: #edf0e7;
    --fdpm-muted: #b4beb5;
    --fdpm-rule: #45534a;
    --fdpm-accent: #74d8c5;
    --fdpm-accent-soft: #1d4038;
    --fdpm-focus: #ffb37a;
    --fdpm-ok: #72d7a0;
    --fdpm-warn: #f0c16d;
    --fdpm-bad: #ff9a96;
    --fdpm-shadow: 0 18px 52px rgba(0, 0, 0, 0.34);
  }
  :root:has(#fdpm-theme-toggle:checked) {
    --fdpm-paper: #f6f2e8;
    --fdpm-surface: #fffdf7;
    --fdpm-ink: #18221d;
    --fdpm-muted: #526059;
    --fdpm-rule: #c6cec7;
    --fdpm-accent: #075e54;
    --fdpm-accent-soft: #d9eee8;
    --fdpm-focus: #b1490c;
    --fdpm-ok: #176b43;
    --fdpm-warn: #765000;
    --fdpm-bad: #a33131;
    --fdpm-shadow: 0 16px 44px rgba(34, 43, 37, 0.12);
  }
}
*, *::before, *::after { box-sizing: border-box; }
html { min-width: 18rem; scroll-behavior: smooth; }
body {
  min-width: 18rem;
  margin: 0;
  background: var(--fdpm-paper);
  color: var(--fdpm-ink);
  font-family: var(--fdpm-body-font);
  line-height: 1.6;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
}
img, svg, canvas { max-width: 100%; }
#fdpm-content {
  overflow-wrap: anywhere;
  word-break: break-word;
}
#fdpm-content, main, article, section, header, footer, aside, div, dl, blockquote {
  min-width: 0;
  max-width: 100%;
}
h1, h2, h3, h4, h5, h6, p, li, dt, dd, td, th, a, span, strong, em, code {
  overflow-wrap: anywhere;
  word-break: break-word;
}
a { color: var(--fdpm-accent); text-underline-offset: 0.16em; }
a:hover { text-decoration-thickness: 0.12em; }
:focus-visible {
  outline: 3px solid var(--fdpm-focus);
  outline-offset: 3px;
  border-radius: 0.18rem;
}
.fdpm-skip-link {
  position: fixed;
  z-index: 10001;
  inset: 0.75rem auto auto 0.75rem;
  transform: translateY(-180%);
  padding: 0.58rem 0.82rem;
  border: 1px solid var(--fdpm-rule);
  border-radius: 0.4rem;
  background: var(--fdpm-surface);
  color: var(--fdpm-ink);
  font: 650 0.86rem/1 var(--fdpm-body-font);
  box-shadow: var(--fdpm-shadow);
  transition: transform 140ms ease;
}
.fdpm-skip-link:focus { transform: translateY(0); }
.fdpm-document-actions {
  position: fixed;
  z-index: 10000;
  right: max(1rem, env(safe-area-inset-right));
  bottom: max(1rem, env(safe-area-inset-bottom));
  display: flex;
  gap: 0.45rem;
  padding: 0.38rem;
  border: 1px solid var(--fdpm-rule);
  border-radius: 0.7rem;
  background: color-mix(in srgb, var(--fdpm-surface) 92%, transparent);
  box-shadow: var(--fdpm-shadow);
  backdrop-filter: blur(14px);
}
.fdpm-theme-toggle {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: 0;
  opacity: 0;
}
.fdpm-document-actions button, .fdpm-theme-label {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 2.5rem;
  padding: 0.48rem 0.68rem;
  border: 0;
  border-radius: 0.42rem;
  background: transparent;
  color: var(--fdpm-ink);
  font: 650 0.78rem/1 var(--fdpm-body-font);
  cursor: pointer;
}
.fdpm-document-actions button:hover, .fdpm-theme-label:hover { background: var(--fdpm-accent-soft); color: var(--fdpm-accent); }
.fdpm-theme-toggle:focus-visible + .fdpm-theme-label { outline: 3px solid var(--fdpm-focus); outline-offset: 3px; }
#fdpm-content:focus { outline: none; }
code, pre, kbd, samp { font-family: var(--fdpm-code-font); }
pre {
  max-width: 100%;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
  overflow-x: visible;
}
table { max-width: 100%; }
@media (max-width: 42rem) {
  .fdpm-document-actions { right: 0.75rem; bottom: 0.75rem; }
  .fdpm-document-actions button, .fdpm-theme-label { min-width: 2.5rem; justify-content: center; }
  .fdpm-document-actions button span, .fdpm-theme-label span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  table { display: table; width: 100%; table-layout: fixed; overflow: visible; }
}
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
}
`;

/**
 * Final print layer for every standalone document.
 *
 * This is emitted after renderer-specific styles so screen-scale headings,
 * fixed controls and scroll containers cannot accidentally win in print.
 */
export const DOCUMENT_PRINT_CSS = `
@page { size: A4; margin: 15mm; }
@media print {
  *, *::before, *::after { box-shadow: none !important; text-shadow: none !important; }
  html, body {
    width: 100% !important;
    height: auto !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: visible !important;
    background: #fff !important;
    color: #111 !important;
    font-size: 11pt;
    line-height: 1.45;
  }
  .fdpm-document-actions, .fdpm-skip-link, [data-no-print], nav[aria-label="Document actions"] { display: none !important; }
  #fdpm-content, main, section, article, div, pre, [style*="overflow"], [style*="max-height"], .scroll {
    max-width: none !important;
    max-height: none !important;
    height: auto !important;
    overflow: visible !important;
  }
  [style*="position: fixed"], [style*="position: sticky"], .fixed, .sticky { position: static !important; }
  h1 { font-size: 20pt !important; line-height: 1.15 !important; margin-block-start: 0 !important; }
  h2 { font-size: 15pt !important; line-height: 1.2 !important; }
  h3 { font-size: 12.5pt !important; line-height: 1.25 !important; }
  h1, h2, h3, h4, h5, h6 { break-after: avoid; page-break-after: avoid; }
  p, li, dd { widows: 3; orphans: 3; }
  article, figure, blockquote, pre, tr, .card, .panel, .node, .fdpm-primitive, [data-break-avoid] {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  img, svg, canvas { max-width: 100% !important; height: auto !important; break-inside: avoid; }
  table { display: table; width: 100%; border-collapse: collapse; font-size: 9pt; overflow: visible !important; }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  a { color: #111 !important; text-decoration: underline; }
  :root { color-scheme: light; --bg:#fff; --ground:#fff; --panel:#fff; --ink:#111; --fg:#111; --muted:#444; --rule:#999; --line:#999; --accent:#111; }
}
`;
