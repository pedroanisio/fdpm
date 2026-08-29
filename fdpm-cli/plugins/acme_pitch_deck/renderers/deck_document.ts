/**
 * The pitch deck as a deck: a running order, and a phase map.
 *
 * Eight per-entity field tables described Slide records; none described
 * the pitch. This profile models a slide as a phase in an argument
 * (`phase`, `strategicJob`, `buyerObjectionAddressed`) with a speaking
 * budget, so the deck's shape — how long each phase runs, where the
 * objections are answered — is the thing worth rendering.
 *
 *   text/markdown   the running order, with the strategic job of each
 *                   slide and the objection it answers.
 *   image/svg+xml   a phase map: slides as blocks along a timeline,
 *                   width proportional to speaking seconds, grouped by
 *                   phase — so pacing is visible before anyone rehearses.
 */

import type { RendererInput, RendererOutput } from "../../../src/plugin/types.js";

interface Prim { id: string; type_id: string; field_values: Record<string, unknown> }

const str = (p: Prim | undefined, k: string): string => {
  const v = p?.field_values?.[k];
  return typeof v === "string" ? v : v === undefined || v === null ? "" : String(v);
};
const num = (p: Prim | undefined, k: string, d = 0): number => {
  const v = p?.field_values?.[k];
  return typeof v === "number" ? v : Number.isFinite(Number(v)) ? Number(v) : d;
};
const arr = (p: Prim | undefined, k: string): string[] => {
  const v = p?.field_values?.[k];
  return Array.isArray(v) ? v.map(String) : [];
};

/** Slides in presentation order; a variant slide is still a slide. */
export function deckSlides(primitives: Prim[]): Prim[] {
  return primitives
    .filter((p) => p.type_id === "acme:Slide" || p.type_id.startsWith("acme:Slide_"))
    .slice()
    .sort((a, b) => num(a, "displayNumber") - num(b, "displayNumber") || a.id.localeCompare(b.id));
}

export function renderPitchDeckMarkdown(input: RendererInput): RendererOutput {
  const slides = deckSlides(input.primitives as unknown as Prim[]);
  const total = slides.reduce((n, s) => n + num(s, "estimatedSpeakingSeconds"), 0);
  const L: string[] = [];
  L.push(`# ${input.workbook?.name ?? "Pitch deck"} — running order`, "");
  L.push(
    `_${slides.length} slide(s)${total ? ` · ${Math.round(total / 60)} min estimated (${total}s)` : ""}._`,
    "",
  );

  let phase = "";
  for (const s of slides) {
    const p = str(s, "phase");
    if (p && p !== phase) {
      phase = p;
      L.push(`## ${p}`, "");
    }
    const secs = num(s, "estimatedSpeakingSeconds");
    L.push(`### ${num(s, "displayNumber") || "—"}. ${str(s, "headline") || str(s, "eyebrow") || s.id.split(":").pop()}`, "");
    const badges = [str(s, "type") || s.type_id.replace("acme:Slide_", ""), secs ? `${secs}s` : ""].filter(Boolean);
    if (badges.length) L.push(`\`${badges.join(" · ")}\``, "");
    if (str(s, "eyebrow") && str(s, "headline")) L.push(`_${str(s, "eyebrow")}_`, "");
    if (str(s, "strategicJob")) L.push(`**Job:** ${str(s, "strategicJob")}`, "");
    if (str(s, "buyerObjectionAddressed")) L.push(`**Answers objection:** ${str(s, "buyerObjectionAddressed")}`, "");
    if (str(s, "rationaleForPosition")) L.push(`_Why here:_ ${str(s, "rationaleForPosition")}`, "");
    for (const [label, key] of [["Claims", "claimsAdvanced"], ["Evidence", "evidenceUsed"], ["Risks", "risksAddressed"], ["Open questions", "openQuestions"]] as const) {
      const xs = arr(s, key);
      if (xs.length) L.push(`_${label}:_ ${xs.join("; ")}`);
    }
    L.push("");
  }
  return {
    bytes: new TextEncoder().encode(L.join("\n").replace(/\n{3,}/g, "\n\n") + "\n"),
    contentType: "text/markdown",
    filename: "pitch-deck.md",
  };
}

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Phase map: one row per phase, slides as blocks whose width is the
 * speaking budget. Pacing problems — a phase that eats half the meeting,
 * a slide with no budget at all — are visible without reading.
 */
export function renderPitchDeckPhaseMap(input: RendererInput): RendererOutput {
  const slides = deckSlides(input.primitives as unknown as Prim[]);
  const phases: string[] = [];
  for (const s of slides) {
    const p = str(s, "phase") || "unphased";
    if (!phases.includes(p)) phases.push(p);
  }
  const PAD = 24, ROW = 54, LABEL = 132, TRACK = 620, HEAD = 52;
  const width = PAD * 2 + LABEL + TRACK;
  const height = PAD * 2 + HEAD + Math.max(1, phases.length) * ROW;
  const totalOf = (p: string) =>
    slides.filter((s) => (str(s, "phase") || "unphased") === p).reduce((n, s) => n + Math.max(num(s, "estimatedSpeakingSeconds"), 30), 0);
  const grandTotal = Math.max(1, ...phases.map(totalOf));

  const S: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Pitch deck phase map">`,
    "<style>",
    ".bg{fill:#fbfbfd}.ph{font:600 12px system-ui;fill:#16181d}.sub{font:11px system-ui;fill:#8b93a3}",
    ".blk{fill:#3d6be5;opacity:.85}.blk:nth-child(2n){opacity:.68}.n{font:600 10px system-ui;fill:#fff}",
    ".title{font:600 16px system-ui;fill:#16181d}.nobudget{fill:#d9534f;opacity:.7}",
    "@media (prefers-color-scheme:dark){.bg{fill:#15171b}.ph,.title{fill:#e9ebef}.sub{fill:#9aa2b1}}",
    "</style>",
    `<rect class="bg" width="${width}" height="${height}"/>`,
    `<text class="title" x="${PAD}" y="${PAD + 14}">${esc(String(input.workbook?.name ?? "Pitch deck"))}</text>`,
    `<text class="sub" x="${PAD}" y="${PAD + 32}">${slides.length} slides across ${phases.length} phase(s) · block width is speaking budget</text>`,
  ];
  phases.forEach((p, i) => {
    const y = PAD + HEAD + i * ROW;
    const mine = slides.filter((s) => (str(s, "phase") || "unphased") === p);
    const secs = totalOf(p);
    S.push(
      `<text class="ph" x="${PAD}" y="${y + 18}">${esc(p)}</text>`,
      `<text class="sub" x="${PAD}" y="${y + 33}">${mine.length} slide(s) · ${Math.round(secs / 60)} min</text>`,
    );
    let x = PAD + LABEL;
    for (const s of mine) {
      const budget = num(s, "estimatedSpeakingSeconds");
      const w = Math.max(14, Math.round((Math.max(budget, 30) / grandTotal) * TRACK));
      S.push(
        `<rect class="blk${budget === 0 ? " nobudget" : ""}" x="${x}" y="${y + 6}" width="${w - 3}" height="30" rx="4"><title>${esc(str(s, "headline"))}${budget ? ` — ${budget}s` : " — no speaking budget"}</title></rect>`,
        `<text class="n" x="${x + 6}" y="${y + 26}">${num(s, "displayNumber") || ""}</text>`,
      );
      x += w;
    }
  });
  S.push("</svg>");
  return {
    bytes: new TextEncoder().encode(S.join("\n") + "\n"),
    contentType: "image/svg+xml",
    filename: "pitch-deck-phases.svg",
  };
}
