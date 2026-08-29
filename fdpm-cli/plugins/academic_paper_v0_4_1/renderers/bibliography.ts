/**
 * The paper's sources, as BibTeX.
 *
 * `acad:Work` records everything a reference needs — authors, year, title,
 * container, publisher, DOI — and `acad:Citation` joins a passage to the work
 * it cites with a locator. Rendered as Markdown that is a list a human
 * retypes; rendered as BibTeX it is a file that goes straight into a LaTeX
 * document or a reference manager. This is the profile's one genuinely
 * interoperable output, so it is worth emitting exactly.
 *
 * Two details decide whether the output is usable rather than merely
 * plausible. BibTeX lowercases title words unless capitals are brace
 * protected, so a title emitted naively comes back as "the structure of
 * scientific revolutions". And `& % # _ $` are syntax in BibTeX's TeX
 * substrate: unescaped, they do not produce a wrong bibliography, they
 * produce a build error in whatever consumes the file.
 */

import type { RendererInput, RendererOutput } from "../../../src/plugin/types.js";
import { buildPaperModel } from "./paper_document.js";

/**
 * What the field readers below actually touch.
 *
 * `str` and `list` name a field and read it; they never look at `id` or
 * `type_id`. Typing them against the full primitive would force every caller
 * holding a narrower record — `citationKeys` takes one — to carry a `type_id`
 * it has no use for.
 */
interface Fields {
  field_values: Record<string, unknown>;
}

interface Prim extends Fields {
  id: string;
  type_id: string;
}

const str = (p: Fields | undefined, k: string): string => {
  const v = p?.field_values?.[k];
  return typeof v === "string" ? v : v === undefined || v === null ? "" : String(v);
};
const list = (p: Fields | undefined, k: string): string[] => {
  const v = p?.field_values?.[k];
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  const s = str(p, k);
  return s ? [s] : [];
};

/** Characters TeX treats as syntax. Backslash first, or it doubles the rest. */
export function escapeTex(s: string): string {
  return s
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([&%$#_{}])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}

/**
 * Protect capitals so BibTeX does not case-fold them.
 *
 * BibTeX lowercases title words under most styles unless they are inside
 * braces, so an unprotected title comes back as "the structure of scientific
 * revolutions". The whole title is wrapped in one extra pair rather than each
 * capitalised word in its own: per-word protection produces `{Representing}
 * and {Intervening}`, which case-folds correctly but leaves the .bib source
 * unreadable and breaks any tool matching on the title as contiguous text.
 * One pair protects everything and keeps the title legible.
 */
function protectCaps(s: string): string {
  return /[A-Z]/.test(s) ? `{${s}}` : s;
}

const field = (name: string, value: string): string => `  ${name} = {${value}}`;

/**
 * The entry type BibTeX should use.
 *
 * Driven by which fields the work actually carries, because the profile does
 * not record an entry type: a container title means an article in something,
 * a bare publisher means a book, and neither means the honest `@misc`.
 */
function entryType(w: Prim): string {
  const declared = str(w, "kind").toLowerCase();
  if (["book", "article", "incollection", "inproceedings", "phdthesis", "techreport"].includes(declared)) {
    return declared;
  }
  if (str(w, "venue") && str(w, "publisher")) return "incollection";
  if (str(w, "venue")) return "article";
  if (str(w, "publisher")) return "book";
  return "misc";
}

/** Surname from "Kuhn, Thomas S." or "Thomas S. Kuhn". */
function surname(author: string): string {
  const comma = author.indexOf(",");
  const raw = comma === -1 ? (author.split(/\s+/).pop() ?? author) : author.slice(0, comma);
  return raw.replace(/[^A-Za-z]/g, "").toLowerCase();
}

/** First title word that carries meaning, for the key's third part. */
function titleWord(title: string): string {
  const stop = new Set(["a", "an", "the", "on", "of", "in", "and", "for", "to"]);
  for (const w of title.toLowerCase().split(/[^a-z0-9]+/i)) {
    if (w.length > 0 && !stop.has(w)) return w;
  }
  return "untitled";
}

/**
 * A citation key that is stable across renders and unique within the file.
 *
 * `surnameYEARword` is the convention every reference manager produces, so a
 * key generated here matches one a human would have written. Collisions get a
 * letter suffix in a deterministic order rather than a hash, so re-rendering
 * an unchanged workbook produces an unchanged file.
 */
export function citationKeys(works: readonly (Fields & { id: string })[]): Map<string, string> {
  const keys = new Map<string, string>();
  const used = new Map<string, number>();
  for (const w of works) {
    const authors = list(w, "authorsFreeText");
    const base =
      `${authors.length > 0 ? surname(authors[0]!) : "anon"}${str(w, "year") || "nd"}${titleWord(str(w, "title"))}`.replace(
        /[^a-z0-9]/g,
        "",
      );
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    keys.set(w.id, seen === 0 ? base : `${base}${String.fromCharCode(97 + seen)}`);
  }
  return keys;
}

export function renderBibliography(input: RendererInput): RendererOutput {
  const model = buildPaperModel(input.primitives as never, input.relations as never);
  const works = model.works as unknown as Prim[];

  /* Locators live on the citation, not the work, so they are collected per
     work and emitted as a note. A reference manager ignores an unknown field;
     a reader does not. */
  const locators = new Map<string, string[]>();
  for (const c of model.citations) {
    if (c.work === undefined || c.locator === "") continue;
    const id = (c.work as unknown as Prim).id;
    locators.set(id, [...(locators.get(id) ?? []), c.locator]);
  }

  const keys = citationKeys(works);
  const entries = works.map((w) => {
    const fields: string[] = [];
    const authors = list(w, "authorsFreeText");
    if (authors.length > 0) fields.push(field("author", escapeTex(authors.join(" and "))));
    const title = str(w, "title");
    if (title) fields.push(field("title", protectCaps(escapeTex(title))));
    const container = str(w, "venue");
    if (container) {
      const type = entryType(w);
      fields.push(
        field(type === "incollection" ? "booktitle" : "journal", protectCaps(escapeTex(container))),
      );
    }
    for (const [name, key] of [
      ["publisher", "publisher"],
      ["year", "year"],
      ["volume", "volume"],
      ["number", "number"],
      ["pages", "pages"],
      ["doi", "doi"],
      ["url", "url"],
      ["isbn", "isbn"],
    ] as const) {
      const value = str(w, key);
      if (value) fields.push(field(name, name === "doi" || name === "url" ? value : escapeTex(value)));
    }
    const cited = locators.get(w.id);
    if (cited !== undefined && cited.length > 0) {
      fields.push(field("note", escapeTex(`cited at ${cited.join("; ")}`)));
    }
    return `@${entryType(w)}{${keys.get(w.id)},\n${fields.join(",\n")},\n}`;
  });

  const title = str(model.paper as unknown as Prim, "title") || input.workbookId;
  const header = [
    `% Bibliography for ${title}`,
    `% Generated from ${input.workbookId} by acad:BibliographyRenderer.`,
    `% ${works.length} works, ${model.citations.length} citations.`,
    "",
  ].join("\n");

  const body = entries.length > 0 ? entries.join("\n\n") : "% No acad:Work primitives in this workbook.";

  return {
    bytes: new TextEncoder().encode(`${header}${body}\n`),
    contentType: "application/x-bibtex",
    filename: `${input.workbookId}.bib`,
  };
}
