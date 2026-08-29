/**
 * The deck as a deck: a running order, and a contact sheet.
 *
 * Thirteen per-entity field tables told you what a Slide record contains
 * and nothing about the deck. A deck is a sequence with an argument — each
 * slide answers an audience question, carries a key message, and leans on
 * claims, evidence and objections that live elsewhere in the graph. Two
 * modes, because a deck is consumed two ways:
 *
 *   text/markdown   the running order, with speaker intent and the
 *                   claims/evidence each slide draws on — the thing you
 *                   rehearse from and review in a diff.
 *   image/svg+xml   a contact sheet: every slide as a thumbnail in order,
 *                   sized by cognitive load, so the shape of the deck is
 *                   visible at a glance — where it front-loads, where it
 *                   crowds.
 */

import type { RendererInput, RendererOutput } from "../../../src/plugin/types.js";

interface Prim { id: string; type_id: string; field_values: Record<string, unknown> }
interface Rel { id: string; type_id: string; source_id: string; target_id: string }

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

export interface DeckModel {
  slides: Prim[];
  nameOf: (id: string) => string;
  claimsOf: (slide: Prim) => string[];
  evidenceOf: (slide: Prim) => string[];
  objectionsOf: (slide: Prim) => string[];
  personas: Prim[];
  presenters: Prim[];
}

export function buildDeckModel(primitives: Prim[], relations: Rel[]): DeckModel {
  const byId = new Map(primitives.map((p) => [p.id, p]));
  const of = (t: string) => primitives.filter((p) => p.type_id === `acme:${t}`);
  const nameOf = (id: string): string => {
    const p = byId.get(id);
    if (!p) return id;
    return str(p, "title") || str(p, "statement") || str(p, "name") || str(p, "summary") || id.split(":").pop() || id;
  };
  const via = (type: string, slide: Prim): string[] =>
    relations.filter((r) => r.type_id === type && r.source_id === slide.id).map((r) => nameOf(r.target_id)).sort();

  return {
    slides: of("Slide").slice().sort((a, b) => num(a, "slide_number") - num(b, "slide_number") || a.id.localeCompare(b.id)),
    nameOf,
    claimsOf: (s) => via("acme:SlideSupports_claim_ids", s),
    evidenceOf: (s) => via("acme:SlideUses_evidence_ids", s),
    objectionsOf: (s) => via("acme:SlideAddresses_objection_ids", s),
    personas: of("AudienceSegment"),
    presenters: of("Presenter"),
  };
}

export function renderDeckMarkdown(input: RendererInput): RendererOutput {
  const m = buildDeckModel(input.primitives as unknown as Prim[], (input.relations ?? []) as unknown as Rel[]);
  const L: string[] = [];
  L.push(`# ${input.workbook?.name ?? "Deck"} — running order`, "");
  L.push(`_${m.slides.length} slide(s)._`, "");
  if (m.personas.length) {
    L.push(`**Audience:** ${m.personas.map((p) => str(p, "name") || str(p, "title")).filter(Boolean).join(", ")}`, "");
  }

  for (const s of m.slides) {
    const n = num(s, "slide_number");
    L.push(`## ${n || "—"}. ${str(s, "title")}`, "");
    if (str(s, "role_in_deck")) L.push(`\`${str(s, "role_in_deck")}\`${str(s, "cognitive_load") ? ` · load ${str(s, "cognitive_load")}` : ""}`, "");
    if (str(s, "key_message")) L.push(`**${str(s, "key_message")}**`, "");
    if (str(s, "audience_question_answered")) L.push(`_Answers:_ ${str(s, "audience_question_answered")}`, "");
    const blocks = arr(s, "content_blocks");
    if (blocks.length) {
      for (const b of blocks) L.push(`- ${b}`);
      L.push("");
    }
    if (str(s, "visual_strategy")) L.push(`_Visual:_ ${str(s, "visual_strategy")}`, "");
    if (str(s, "speaker_intent")) L.push(`_Intent:_ ${str(s, "speaker_intent")}`, "");
    const rest: string[] = [];
    const claims = m.claimsOf(s);
    const evidence = m.evidenceOf(s);
    const objections = m.objectionsOf(s);
    if (claims.length) rest.push(`_supports:_ ${claims.join("; ")}`);
    if (evidence.length) rest.push(`_evidence:_ ${evidence.join("; ")}`);
    if (objections.length) rest.push(`_answers objection:_ ${objections.join("; ")}`);
    if (rest.length) L.push(rest.join("  \n"), "");
  }
  return {
    bytes: new TextEncoder().encode(L.join("\n").replace(/\n{3,}/g, "\n\n") + "\n"),
    contentType: "text/markdown",
    filename: "deck.md",
  };
}

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Wrap to a fixed character width — SVG has no text flow. */
function wrap(text: string, width: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > width) {
      lines.push(cur.trim());
      cur = w;
      if (lines.length === maxLines) break;
    } else cur = `${cur} ${w}`;
  }
  if (lines.length < maxLines && cur.trim()) lines.push(cur.trim());
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    lines[maxLines - 1] = `${lines[maxLines - 1]!.slice(0, width - 1)}…`;
  }
  return lines;
}

/**
 * Contact sheet: every slide as a card, in order, five to a row. The load
 * bar under each title is `cognitive_load`, so a deck that crowds its
 * middle shows it without anyone reading a word.
 */
export function renderDeckContactSheet(input: RendererInput): RendererOutput {
  const m = buildDeckModel(input.primitives as unknown as Prim[], (input.relations ?? []) as unknown as Rel[]);
  const COLS = 5, W = 190, H = 128, GAP = 14, PAD = 24;
  const rows = Math.max(1, Math.ceil(m.slides.length / COLS));
  const width = PAD * 2 + COLS * W + (COLS - 1) * GAP;
  const height = PAD * 2 + 46 + rows * H + (rows - 1) * GAP;
  const maxLoad = Math.max(1, ...m.slides.map((s) => num(s, "cognitive_load", 0)));

  const S: string[] = [];
  S.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Deck contact sheet">`,
    "<style>",
    ".bg{fill:#fbfbfd}.card{fill:#fff;stroke:#dcdfe6}.num{font:600 11px system-ui;fill:#8b93a3}",
    ".ttl{font:600 12px system-ui;fill:#16181d}.msg{font:11px system-ui;fill:#5b6270}",
    ".role{font:600 9px system-ui;letter-spacing:.06em;fill:#8b93a3}",
    ".load{fill:#c8ccd6}.load-hi{fill:#d9534f}.deck{font:600 16px system-ui;fill:#16181d}",
    "@media (prefers-color-scheme:dark){.bg{fill:#15171b}.card{fill:#1c1f25;stroke:#333846}.ttl{fill:#e9ebef}.msg{fill:#9aa2b1}.deck{fill:#e9ebef}}",
    "</style>",
    `<rect class="bg" width="${width}" height="${height}"/>`,
    `<text class="deck" x="${PAD}" y="${PAD + 14}">${esc(String(input.workbook?.name ?? "Deck"))}</text>`,
    `<text class="msg" x="${PAD}" y="${PAD + 32}">${m.slides.length} slides · bar height is cognitive load</text>`,
  );
  m.slides.forEach((s, i) => {
    const x = PAD + (i % COLS) * (W + GAP);
    const y = PAD + 46 + Math.floor(i / COLS) * (H + GAP);
    const load = num(s, "cognitive_load", 0);
    const barW = Math.round((load / maxLoad) * (W - 24));
    S.push(
      `<g transform="translate(${x} ${y})">`,
      `<rect class="card" width="${W}" height="${H}" rx="8"/>`,
      `<text class="num" x="12" y="20">${num(s, "slide_number") || i + 1}</text>`,
      `<text class="role" x="${W - 12}" y="20" text-anchor="end">${esc(str(s, "role_in_deck").toUpperCase().slice(0, 18))}</text>`,
    );
    wrap(str(s, "title"), 26, 2).forEach((line, j) => S.push(`<text class="ttl" x="12" y="${42 + j * 15}">${esc(line)}</text>`));
    wrap(str(s, "key_message"), 30, 3).forEach((line, j) => S.push(`<text class="msg" x="12" y="${82 + j * 13}">${esc(line)}</text>`));
    if (barW > 0) {
      S.push(`<rect class="load${load >= maxLoad ? " load-hi" : ""}" x="12" y="${H - 12}" width="${barW}" height="4" rx="2"/>`);
    }
    S.push("</g>");
  });
  S.push("</svg>");
  return {
    bytes: new TextEncoder().encode(S.join("\n") + "\n"),
    contentType: "image/svg+xml",
    filename: "deck-contact-sheet.svg",
  };
}
