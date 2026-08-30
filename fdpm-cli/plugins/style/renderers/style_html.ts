/**
 * `text/html` — the registry as a style sheet you can open in a browser.
 *
 * The markdown outline describes the palette; this one *is* the palette.
 * A colour written as `#D2232A` in a table is a fact you have to imagine;
 * the same colour painted into a chip is a fact you can check. Everything
 * the schema stores as a value that has a visual meaning — palette
 * entries, forbidden colours, colour tokens, contrast pairs, type stacks,
 * stroke weight — is rendered as that meaning, and the rest is rendered as
 * text beside it.
 *
 * Two properties are load-bearing and both are asserted by the suite:
 *
 *  - **Self-contained.** No script, no stylesheet link, no `@import`, no
 *    absolute URL. Opening the file must not reach the network, because a
 *    style specification is exactly the kind of document that gets mailed
 *    around and opened offline.
 *  - **Escaped.** Every value that reaches the page goes through `esc()`.
 *    Style text is author-supplied prose — a rule statement, an axiom, a
 *    reference title — and a `<` in prose is a `<` on the page, never the
 *    start of an element.
 */

import type { RendererInput, RendererOutput } from "../../../src/plugin/types.js";
import { renderStandaloneDocument } from "../../../src/core/render/document.js";
import { readRegistry, readableInkOn, type StyleView, type RegistryView } from "./_model.js";

/** HTML text escape. Applied to every interpolated value without exception. */
function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * A hex colour safe to interpolate into a `style` attribute.
 *
 * Escaping is not enough for a CSS context: `esc()` protects the HTML
 * parser, not the CSS one. A value reaching an inline style must match
 * the hex grammar or be dropped, so no author-supplied string can ever
 * open a declaration of its own.
 */
function cssHex(hex: string): string | null {
  return /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(hex) ? hex : null;
}

/** A CSS custom-property name safe to emit; anything else is dropped. */
function cssIdent(name: string): string | null {
  return /^[A-Za-z][A-Za-z0-9-]*$/.test(name) ? name : null;
}

const list = (items: string[]): string => (items.length > 0 ? items.map(esc).join(", ") : "—");

function table(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return `<p class="empty">none declared</p>`;
  return [
    `<table>`,
    `<thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>`,
    `<tbody>`,
    ...rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`),
    `</tbody>`,
    `</table>`,
  ].join("\n");
}

const badge = (weight: string): string =>
  `<span class="badge badge-${esc(weight)}">${esc(weight)}</span>`;

/** One palette entry as a chip painted in its own colour. */
function swatch(name: string, hex: string, caption: string): string {
  const safe = cssHex(hex);
  const ink = safe ? readableInkOn(safe) : "#000000";
  const style = safe ? `background:${safe};color:${ink}` : "background:transparent;color:inherit";
  return [
    `<figure class="swatch" data-swatch="${esc(name)}">`,
    `<div class="chip" style="${style}">${esc(hex)}</div>`,
    `<figcaption><b>${esc(name)}</b><br>${esc(caption)}</figcaption>`,
    `</figure>`,
  ].join("");
}

function grammarSections(style: StyleView): string {
  const out: string[] = [];
  for (const section of style.grammar) {
    out.push(`<section class="grammar" data-section="${esc(section.section)}">`);
    out.push(`<h4>${esc(section.section)} <code>${esc(section.code)}</code></h4>`);
    if (!section.present) {
      out.push(`<p class="empty">section not declared</p>`);
      out.push(`</section>`);
      continue;
    }
    out.push(
      table(
        ["Field", "Value"],
        section.fields.map(([k, v]) => [`<code>${esc(k)}</code>`, esc(flatten(v))]),
      ),
    );
    if (section.rules.length > 0) {
      out.push(
        table(
          ["Rule", "Kind", "Weight", "Statement", "Exemplars"],
          section.rules.map((r) => [
            `<code>${esc(r.ruleId)}</code>`,
            esc(r.kind),
            badge(r.weight),
            esc(r.statement),
            r.exemplars.length > 0 ? list(r.exemplars) : "—",
          ]),
        ),
      );
    }
    out.push(`</section>`);
  }
  return out.join("\n");
}

/** A stored field value as one line of text. Structs print as pairs. */
function flatten(v: unknown): string {
  if (v === undefined || v === null) return "—";
  if (Array.isArray(v)) return v.length === 0 ? "—" : v.map(flatten).join(" / ");
  if (typeof v === "object") {
    return Object.entries(v as Record<string, unknown>)
      .filter(([, x]) => x !== undefined && x !== null && String(x) !== "")
      .map(([k, x]) => `${k.replace(/_/g, " ")}: ${flatten(x)}`)
      .join(", ");
  }
  return String(v);
}

function tokenBlock(style: StyleView): string {
  const decls = style.tokens.colors
    .map((t) => {
      const ident = cssIdent(t.name);
      const hex = cssHex(t.value);
      return ident && hex ? `  --${ident}: ${hex};` : null;
    })
    .filter((l): l is string => l !== null);
  if (decls.length === 0) return `<p class="empty">no colour tokens rendered</p>`;
  return `<pre class="tokens"><code>:root {\n${esc(decls.join("\n"))}\n}</code></pre>`;
}

function contrastTable(style: StyleView): string {
  const rows = style.tokens.contrastPairs.map((p) => {
    const verdict =
      p.pass === undefined
        ? `<span data-verdict="unresolved">unresolved</span>`
        : `<span data-verdict="${p.pass ? "pass" : "fail"}">${p.pass ? "pass" : "fail"}</span>`;
    const fg = p.foregroundHex ? cssHex(p.foregroundHex) : null;
    const bg = p.backgroundHex ? cssHex(p.backgroundHex) : null;
    const sample =
      fg && bg
        ? `<span class="sample" style="background:${bg};color:${fg}">Aa</span>`
        : "—";
    return [
      `<code>${esc(p.foreground)}</code>`,
      `<code>${esc(p.background)}</code>`,
      esc(p.usage),
      sample,
      p.ratio === undefined ? "—" : `${p.ratio.toFixed(2)}:1`,
      p.required === undefined ? "—" : `${p.required.toFixed(1)}:1`,
      verdict,
    ];
  });
  return table(
    ["Foreground", "Background", "Usage", "Sample", "Measured", "Required", "Verdict"],
    rows,
  );
}

function styleArticle(style: StyleView): string {
  const out: string[] = [];
  out.push(`<article class="style" data-style="${esc(style.styleId)}">`);
  out.push(
    `<h2>${esc(style.name)} <code class="code">${esc(style.code)}</code> <small>${esc(style.period.label)}</small></h2>`,
  );

  out.push(
    table(
      ["Field", "Value"],
      [
        ["Aliases", list(style.aliases)],
        ["Geographic centres", list(style.geographicCenters)],
        ["Origin medium", esc(style.originMedium)],
        ["Parent movement", esc(style.parentMovement ?? "—")],
        ["Negates", list(style.negates)],
        ["Influences", list(style.influences)],
        ["Locale", `<code>${esc(style.locale)}</code>`],
        ["Schema version", `<code>${esc(style.schemaVersion)}</code>`],
      ],
    ),
  );

  out.push(`<h3>Philosophy</h3>`);
  out.push(
    `<p class="stance">ornament <b>${esc(style.ornamentStance)}</b> · machine <b>${esc(
      style.machineAttitude,
    )}</b> · ${esc(style.formFunctionRelation)} · ${esc(style.humanRelation)}</p>`,
  );
  for (const a of style.axioms) {
    out.push(
      `<blockquote><p>${esc(a.statement)}</p><cite>${esc(a.source || "unattributed")}</cite></blockquote>`,
    );
  }

  out.push(`<h3>Palette</h3>`);
  out.push(
    style.palette.length > 0
      ? `<div class="swatches">${style.palette
          .map((p) => swatch(p.name, p.hex, `${p.role}${p.printingOrigin ? ` · ${p.printingOrigin}` : ""}`))
          .join("")}</div>`
      : `<p class="empty">no palette declared</p>`,
  );

  if (style.forbiddenColors.length > 0) {
    out.push(`<h4>Forbidden</h4>`);
    out.push(
      `<div class="swatches">${style.forbiddenColors
        .map((c) => swatch(c.name, c.hex ?? "", `forbidden by ${c.prohibitedBy}`))
        .join("")}</div>`,
    );
    out.push(
      table(
        ["Colour", "Reason", "Prohibited by"],
        style.forbiddenColors.map((c) => [
          esc(c.name),
          esc(c.reason),
          `<code>${esc(c.prohibitedBy)}</code>`,
        ]),
      ),
    );
  }

  if (style.typefaces.length > 0) {
    out.push(`<h3>Type</h3>`);
    const stacks = new Map(style.tokens.fontStacks.map((s) => [s.role, s.stack]));
    out.push(
      table(
        ["Role", "Classification", "Exemplars", "Specimen"],
        style.typefaces.map((t) => {
          const stack = stacks.get(t.role);
          // The stack is author text; it is shown, never used as CSS.
          return [
            `<code>${esc(t.role)}</code>`,
            esc(t.classification),
            list(t.exemplars),
            stack ? `<code>${esc(stack)}</code>` : "—",
          ];
        }),
      ),
    );
  }

  out.push(`<h3>Grammar</h3>`);
  out.push(grammarSections(style));

  out.push(`<h3>Compliance</h3>`);
  out.push(
    `<p>Minimum weighted pass ratio: <b>${esc(style.minimumPassRatio ?? "—")}</b>. Rules: ${
      style.ruleWeights.defining
    } defining, ${style.ruleWeights.strong} strong, ${style.ruleWeights.advisory} advisory.</p>`,
  );
  out.push(
    table(
      ["Check", "Kind", "Weight", "Tests", "Criterion"],
      style.checks.map((c) => [
        `<code>${esc(c.checkId)}</code>`,
        esc(c.kind),
        badge(c.weight),
        `<code>${esc(c.testsRule ?? "—")}</code>`,
        esc(c.criterion),
      ]),
    ),
  );

  out.push(`<h3>Canonical references</h3>`);
  for (const role of ["primary", "secondary", "counter-example"] as const) {
    const bucket = style.references.filter((r) => r.role === role);
    if (bucket.length === 0) continue;
    out.push(`<h4>${esc(role)}</h4>`);
    out.push(`<ul class="refs">`);
    for (const r of bucket) {
      out.push(
        `<li><b>${esc(r.title)}</b> — ${list(r.creators)} (${
          r.year === null ? "n.d." : esc(r.year)
        }), ${esc(r.medium)}.<br><span>${esc(r.exemplifies)}</span><br><cite>${esc(r.source)}</cite></li>`,
      );
    }
    out.push(`</ul>`);
  }

  out.push(`<h3>Production tokens</h3>`);
  out.push(tokenBlock(style));
  if (style.tokens.scale.length > 0) {
    out.push(
      table(
        ["Scale token", "px"],
        style.tokens.scale.map((t) => [`<code>${esc(t.name)}</code>`, esc(t.value)]),
      ),
    );
  }
  out.push(
    `<p>Base unit <b>${esc(style.tokens.baseUnit ?? "—")}</b> px · stroke weight <b>${esc(
      style.tokens.strokeWeight ?? "—",
    )}</b> px</p>`,
  );

  out.push(
    `<h4>WCAG ${esc(style.tokens.wcagVersion ?? "—")} ${esc(
      (style.tokens.wcagLevel ?? "").toUpperCase() || "—",
    )}</h4>`,
  );
  out.push(contrastTable(style));

  if (style.tokens.promptPositive) {
    out.push(`<h4>Prompt fragment</h4>`);
    out.push(`<p class="prompt"><b>positive</b> ${esc(style.tokens.promptPositive)}</p>`);
    if (style.tokens.promptNegative) {
      out.push(`<p class="prompt"><b>negative</b> ${esc(style.tokens.promptNegative)}</p>`);
    }
  }

  out.push(`</article>`);
  return out.join("\n");
}

/**
 * The page's own styling. Neutral on purpose: the document is a container
 * for the styles it describes, and a container that asserts a look of its
 * own competes with every palette on the page. It follows the reader's
 * light/dark preference and leaves the colour to the swatches.
 */
const PAGE_CSS = `
* { box-sizing: border-box; }
body { margin:0; padding:2rem 1.25rem 5rem; background:var(--bg); color:var(--fg);
  font:15px/1.55 var(--fdpm-body-font); }
main { max-width: 62rem; margin: 0 auto; }
h1 { font-size: 1.7rem; margin: 0 0 .25rem; }
h2 { font-size: 1.35rem; margin: 2.5rem 0 .5rem; border-top: 2px solid var(--fg); padding-top: .75rem; }
h3 { font-size: 1.05rem; margin: 1.75rem 0 .5rem; }
h4 { font-size: .9rem; margin: 1.1rem 0 .4rem; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
small { font-weight: 400; color: var(--muted); }
code { font-family: var(--fdpm-code-font); font-size: .86em; }
code.code { border:1px solid var(--line); border-radius:3px; padding:0 .35em; }
.subtitle { color: var(--muted); margin: 0 0 1rem; }
table { border-collapse: collapse; width: 100%; margin: .5rem 0 1rem; display:block; overflow-x:auto; }
th, td { text-align: left; vertical-align: top; padding: .35rem .6rem; border-bottom: 1px solid var(--line); }
th { font-size: .78rem; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); font-weight: 600; }
blockquote { margin: .75rem 0; padding: .5rem 0 .5rem 1rem; border-left: 3px solid var(--line); }
blockquote p { margin: 0 0 .3rem; }
cite { color: var(--muted); font-size: .85rem; font-style: normal; }
.swatches { display: flex; flex-wrap: wrap; gap: .75rem; margin: .5rem 0 1rem; }
.swatch { margin: 0; width: 9.5rem; }
.chip { height: 4rem; border: 1px solid var(--line); border-radius: 4px; display: flex; align-items: flex-end;
  padding: .3rem .4rem; font-family: var(--fdpm-code-font); font-size: .78rem; }
.swatch figcaption { font-size: .78rem; color: var(--muted); margin-top: .3rem; line-height: 1.35; }
.swatch figcaption b { color: var(--fg); }
.sample { display:inline-block; padding: .1rem .5rem; border: 1px solid var(--line); border-radius: 3px; }
.badge { display:inline-block; padding: 0 .45em; border-radius: 999px; font-size: .72rem; border: 1px solid currentColor; }
.badge-defining { color: var(--fdpm-bad); }
.badge-strong { color: var(--fdpm-warn); }
.badge-advisory { color: var(--muted); }
[data-verdict="pass"] { color: var(--fdpm-ok); font-weight: 600; }
[data-verdict="fail"] { color: var(--fdpm-bad); font-weight: 600; }
[data-verdict="unresolved"] { color: var(--muted); }
.grammar { border: 1px solid var(--line); border-radius: 6px; padding: .5rem .9rem 1rem; margin: .6rem 0; background: var(--panel); }
.grammar h4 { margin-top: .6rem; color: var(--fg); }
.tokens { background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: .75rem 1rem; overflow-x: auto; }
.refs { padding-left: 1.1rem; }
.refs li { margin-bottom: .6rem; }
.empty { color: var(--muted); font-style: italic; }
.stance b { font-weight: 600; }
.prompt { background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: .5rem .75rem; }
@media (max-width: 42rem) { body { padding: 1.5rem .85rem 5rem; } .swatch { width: min(100%, 10.5rem); } }
`.trim();

export function renderStyleHtml(input: RendererInput): RendererOutput {
  const registry: RegistryView = readRegistry(input);
  const locale = registry.styles[0]?.locale ?? "en";
  const lang = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(locale) ? locale : "en";

  const body = [
    `<main>`,
    `<h1>Style registry</h1>`,
    `<p class="subtitle">${registry.styles.length} style(s), ${registry.movements.length} movement(s) — workbook <code>${esc(
      registry.workbookId,
    )}</code> on <code>${esc(registry.profileId)}</code>.</p>`,
  ];

  const sections: string[] = [];
  if (registry.movements.length > 0) {
    sections.push(`<h2>Movements</h2>`);
    sections.push(
      table(
        ["Movement", "Period", "Parent", "Aliases"],
        registry.movements.map((m) => [
          esc(m.name),
          esc(m.period.label),
          esc(m.parentName ?? "—"),
          list(m.aliases),
        ]),
      ),
    );
  }

  if (registry.styles.length === 0) {
    sections.push(`<p class="empty">No styles have been recorded yet.</p>`);
  } else {
    for (const style of registry.styles) sections.push(styleArticle(style));
  }

  body.push(...sections, `</main>`);
  const html = renderStandaloneDocument({
    title: `Style registry — ${registry.workbookId}`,
    body: body.join("\n"),
    styles: PAGE_CSS,
    accent: "ochre",
    lang,
  });

  return {
    bytes: new TextEncoder().encode(html),
    contentType: "text/html",
    filename: "style-registry.html",
  };
}
