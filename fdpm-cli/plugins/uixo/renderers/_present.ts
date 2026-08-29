/**
 * What each value *is*, so a renderer can draw it rather than print it.
 *
 * The first version of these renderers flattened every attribute into one
 * comma-separated line. On a real document that put the entire payload —
 * the descriptions, the CSS custom properties, the measured contrast
 * ratios, the hex colours — into an undifferentiated grey run-on. The
 * information was present and unreadable, which is worse than absent,
 * because it looks like the document has been rendered.
 *
 * This module classifies values by shape and by the ontology's own naming
 * so every view can render a colour as a swatch, a status as a badge, a
 * reference as a link, and prose as prose. Nothing here is keyed to a
 * particular document: `#F6F3EC` is a colour because it matches the hex
 * grammar, `hasSeverity` is a status because the ontology names it one,
 * and `extensions.description` is prose because the source schema says
 * `extensions` is the open-world extension point and every document in
 * the corpus puts its prose there.
 *
 * ## Why `extensions` gets special handling
 *
 * `extensions` is a `z.record` on all 712 classes — the ontology's
 * deliberate open-world escape hatch — and it carries the writing. On the
 * 346-entity reference document `extensions.description` is present on
 * **all 346** and `extensions.spec` on 100. Treating it as one opaque
 * blob is faithful to the schema and useless to a reader, so it is
 * unpacked here: `description` becomes the entity's prose, and the rest
 * becomes a nested fact tree that keeps its structure.
 */

import type { DocumentView, NodeView } from "./_model.js";

const HEX = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const RATIO = /^(\d+(?:\.\d+)?):1$/;
const MEASURE = /^-?\d+(?:\.\d+)?(px|rem|em|%|ms|s|pt|vh|vw)$/;

export type Tone = "ok" | "warn" | "error" | "info" | "muted";

export type Value =
  | { kind: "color"; hex: string; text: string }
  | { kind: "status"; text: string; tone: Tone }
  | { kind: "ref"; id: string | null; text: string }
  | { kind: "ratio"; value: number; text: string }
  | { kind: "measure"; text: string }
  | { kind: "code"; text: string }
  | { kind: "text"; text: string }
  | { kind: "list"; items: Value[] }
  | { kind: "group"; entries: Fact[] };

export interface Fact {
  key: string;
  value: Value;
}

export interface Badge {
  label: string;
  tone: Tone;
}

export interface Presented {
  node: NodeView;
  /** `extensions.description`, promoted out of the fact tree to prose. */
  description?: string;
  /** Short status values lifted out so a view can render them as chips. */
  badges: Badge[];
  /** Set when the entity itself denotes a colour (a theme token). */
  swatch?: string;
  /** `extensions.css` — the custom-property name a token defines. */
  cssName?: string;
  /** Everything else, in a stable order, with structure preserved. */
  facts: Fact[];
}

/** Fields whose value is a lifecycle or severity, not data. */
const STATUS_KEYS = new Set(["hasSeverity", "hasStatus", "status", "severity", "level"]);

/** `uixo:Warning` → the tone a view should paint it. */
function toneOf(raw: string): Tone {
  const v = raw.replace(/^[a-z]+:/i, "").toLowerCase();
  if (/(error|fail|invalid|blocked|critical|danger)/.test(v)) return "error";
  if (/(warn|repairing|degraded|pending|partial)/.test(v)) return "warn";
  if (/(ok|valid|succeeded|success|passed|done|complete|enabled|true)/.test(v)) return "ok";
  if (/(info|note|draft)/.test(v)) return "info";
  return "muted";
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Split a camelCase or snake_case key into words for a human label. */
export function humanKey(key: string): string {
  return key
    .replace(/^has(?=[A-Z])/, "")
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

function classify(key: string, raw: unknown, doc: DocumentView): Value {
  if (Array.isArray(raw)) {
    return { kind: "list", items: raw.map((item) => classify(key, item, doc)) };
  }
  if (isPlainObject(raw)) {
    return { kind: "group", entries: factsOf(raw, doc) };
  }
  if (typeof raw === "boolean") {
    return { kind: "status", text: String(raw), tone: raw ? "ok" : "muted" };
  }
  if (typeof raw === "number") {
    return { kind: "measure", text: String(raw) };
  }
  const text = String(raw ?? "");
  if (HEX.test(text)) return { kind: "color", hex: text.toUpperCase(), text };
  if (STATUS_KEYS.has(key)) return { kind: "status", text, tone: toneOf(text) };

  const ratio = RATIO.exec(text);
  if (ratio) return { kind: "ratio", value: Number(ratio[1]), text };
  if (MEASURE.test(text)) return { kind: "measure", text };
  if (/^--[a-z0-9-]+$/i.test(text)) return { kind: "code", text };

  // A bare QName that names an entity in this document is a reference; one
  // that names nothing is left as text rather than rendered as a dead link.
  if (/^[a-z][a-z0-9]*:[A-Za-z0-9_.:-]+$/.test(text) && !text.includes(" ")) {
    const target = [...doc.nodes.values()].find((n) => n.entityId === text);
    return target
      ? { kind: "ref", id: target.id, text: target.label ?? text }
      : { kind: "code", text };
  }
  return { kind: "text", text };
}

function factsOf(source: Record<string, unknown>, doc: DocumentView): Fact[] {
  return Object.entries(source)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([key, v]) => ({ key, value: classify(key, v, doc) }));
}

/**
 * Turn one node into something a view can lay out.
 *
 * The ordering is the point: prose first, then what the entity *is* (its
 * colour, its custom-property name, its status), then the remaining facts.
 * A reader scanning 346 entities needs the sentence, not the field list.
 */
export function present(doc: DocumentView, node: NodeView): Presented {
  const out: Presented = { node, badges: [], facts: [] };

  const attributes = new Map(node.attributes);
  const extensions = attributes.get("extensions");
  attributes.delete("extensions");
  // `label` is already the entity's title in every view; repeating it as a
  // field row was pure noise on all 346 cards.
  attributes.delete("label");

  const ext = isPlainObject(extensions) ? { ...extensions } : undefined;
  if (ext) {
    if (typeof ext["description"] === "string") {
      out.description = ext["description"];
      delete ext["description"];
    }
    if (typeof ext["css"] === "string") {
      out.cssName = ext["css"];
      delete ext["css"];
    }
    if (typeof ext["value"] === "string" && HEX.test(ext["value"])) {
      out.swatch = ext["value"].toUpperCase();
      delete ext["value"];
    }
  }

  for (const [key, raw] of attributes) {
    if (STATUS_KEYS.has(key) && typeof raw === "string") {
      out.badges.push({ label: raw.replace(/^[a-z]+:/i, ""), tone: toneOf(raw) });
      continue;
    }
    if (key === "enabled" && typeof raw === "boolean") {
      out.badges.push({ label: raw ? "enabled" : "disabled", tone: raw ? "ok" : "muted" });
      continue;
    }
    out.facts.push({ key, value: classify(key, raw, doc) });
  }

  if (ext && Object.keys(ext).length > 0) {
    for (const fact of factsOf(ext, doc)) out.facts.push(fact);
  }

  return out;
}

// ── Document-level cuts a specialized view needs ───────────────────────

export interface ColorToken {
  /** Primitive id of the entity the colour was found on. */
  id: string;
  name: string;
  hex: string;
  cssName?: string;
  description?: string;
  /**
   * Set when the colour came from a nested map rather than the entity's
   * own `value` — the entity's name, so a theme override reads as one
   * group instead of eleven loose swatches.
   */
  set?: string;
}

/**
 * Every colour the document declares, wherever it declares it.
 *
 * This is the cut that turns a UIXO document into something worth looking
 * at: the reference document carries 23 theme tokens, and a list of 23
 * grey rows reading "Color: accent" is strictly worse than the colours.
 *
 * Eleven of those tokens carry their hex directly. A twelfth carries a
 * whole dark-theme override as a nested `name → hex` map, and stopping at
 * the top level would have shown the light theme and silently dropped the
 * dark one — so nested groups are mined too, tagged with the entity that
 * holds them.
 */
export function colorTokens(doc: DocumentView): ColorToken[] {
  const out: ColorToken[] = [];
  for (const id of doc.order) {
    const node = doc.nodes.get(id)!;
    const p = present(doc, node);
    const name = node.label ?? node.entityId;

    if (p.swatch !== undefined) {
      const token: ColorToken = { id: node.id, name, hex: p.swatch };
      if (p.cssName !== undefined) token.cssName = p.cssName;
      if (p.description !== undefined) token.description = p.description;
      out.push(token);
    }

    // Depth-bounded by the fact tree, which `classify` builds from a
    // finite value; there is no cycle to guard against here.
    const mine = (facts: Fact[], path: string): void => {
      for (const fact of facts) {
        if (fact.value.kind === "color") {
          out.push({
            id: node.id,
            name: fact.key,
            hex: fact.value.hex,
            set: path,
          });
        } else if (fact.value.kind === "group") {
          mine(fact.value.entries, path);
        }
      }
    };
    mine(p.facts, name);
  }
  return out;
}

export interface FindingRow {
  id: string;
  className: string;
  name: string;
  code?: string;
  message?: string;
  tone: Tone;
  severity?: string;
}

/**
 * Entities that report a problem — anything carrying a non-`ok` status.
 *
 * A document that records an accessibility audit should surface its
 * findings, not bury them at whatever depth the containment tree put
 * them. Derived from the status fields, so it works for any document that
 * uses them, not only for an audit.
 */
export function findings(doc: DocumentView): FindingRow[] {
  const out: FindingRow[] = [];
  for (const id of doc.order) {
    const node = doc.nodes.get(id)!;
    const p = present(doc, node);
    const flagged = p.badges.find((b) => b.tone === "warn" || b.tone === "error");
    if (!flagged) continue;
    const attrs = new Map(node.attributes);
    const row: FindingRow = {
      id: node.id,
      className: node.className,
      name: node.label ?? node.entityId,
      tone: flagged.tone,
      severity: flagged.label,
    };
    const code = attrs.get("findingCode");
    if (typeof code === "string") row.code = code;
    const message = attrs.get("message");
    if (typeof message === "string") row.message = message;
    else if (p.description !== undefined) row.message = p.description;
    out.push(row);
  }
  return out;
}

/** Entities grouped by ontology class, largest group first. */
export function byClass(doc: DocumentView): { className: string; nodes: NodeView[] }[] {
  const groups = new Map<string, NodeView[]>();
  for (const id of doc.order) {
    const node = doc.nodes.get(id)!;
    groups.set(node.className, [...(groups.get(node.className) ?? []), node]);
  }
  return [...groups.entries()]
    .map(([className, nodes]) => ({ className, nodes }))
    .sort((a, b) => b.nodes.length - a.nodes.length || a.className.localeCompare(b.className));
}

/** `uixocss:ThemeVariableToken` → `ThemeVariableToken`. */
export const shortClass = (className: string): string => className.replace(/^[a-z0-9]+:/i, "");

/** `#RGB` / `#RRGGBB` / … → 0-255 channels, or null if not a hex. */
export function hexToRgb(hex: string): [number, number, number] | null {
  if (!HEX.test(hex)) return null;
  const d = hex.slice(1);
  const pair = (i: number): number =>
    d.length <= 4 ? parseInt(d[i]! + d[i]!, 16) : parseInt(d.slice(i * 2, i * 2 + 2), 16);
  return [pair(0), pair(1), pair(2)];
}

/**
 * Ink that stays legible on `hex`: whichever of black or white has the
 * greater WCAG contrast against it.
 *
 * The first version relied on `mix-blend-mode: difference` for this, which
 * looks clever and fails exactly where it matters — a mid-tone like
 * `#8F6420` blends to a muddy value against both ends, so the hex label
 * on the swatch became unreadable on precisely the colours a reader most
 * needs to identify. Computing it is two lines and always right.
 */
export function readableInkOn(hex: string): "#000000" | "#FFFFFF" {
  const rgb = hexToRgb(hex);
  if (rgb === null) return "#000000";
  const channel = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
  // Contrast against white is (1.05)/(l+0.05); against black, (l+0.05)/0.05.
  return (l + 0.05) / 0.05 >= 1.05 / (l + 0.05) ? "#000000" : "#FFFFFF";
}
