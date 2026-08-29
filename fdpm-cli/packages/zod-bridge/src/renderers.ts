/**
 * cap:renderer derivation — schema-driven markdown renderer.
 *
 * Per howto-zod-to-fdpm-plugin §7 / `example:bridge-renderer`.
 *
 * This function is the repo's default reading experience: 88 of the 103
 * registered renderers come from here — every entity of academic-paper,
 * style, uml, both acme decks and document-plan. So its output is not an
 * implementation detail, it is what most profiles look like.
 *
 * What it owes a reader, and what it used to do instead:
 *
 *   - A heading that NAMES the thing. It emitted
 *     `# uml:Class uml:Class:01HQ8Z…` — the type twice and a ULID. Now
 *     the entity's own name/title/label leads, with the type as a
 *     subtitle and the id kept as a code span only when nothing names it.
 *   - Rows that carry information. Every declared field was emitted
 *     whether or not the instance set it, so a 30-field entity with four
 *     values rendered 26 blank cells. Unset fields are omitted; `false`
 *     and `0` are values and stay.
 *   - Values a person can read: yes/no rather than true/false, lists
 *     comma-joined, structs as inline key/value pairs rather than raw
 *     JSON, and pipes escaped so a value cannot break the table.
 *   - Labels as words: `qualified_name` reads "Qualified name".
 *
 * Determinism: pure function of (schema, options, target). No clock,
 * no IO. Two calls with the same inputs return byte-equal strings.
 */

import type { ZodObject, ZodRawShape } from "zod";
import { getObjectShape } from "./walker.js";

export interface RenderTarget {
  id: string;
  type_id: string;
  field_values: Record<string, unknown>;
}

export type FieldOrder = "schema" | "alphabetical" | ReadonlyArray<string>;

export interface MarkdownRendererOptions {
  primitive_type_id: string;
  /** Title factory; default: the entity's name, else its type and id slug. */
  title?: (target: RenderTarget) => string;
  /**
   * Field names to try, in order, when naming the entity in the heading.
   * Defaults to the conventional ones; a domain with its own convention
   * (say `headline`) passes its own.
   */
  nameFields?: ReadonlyArray<string>;
  fieldOrder?: FieldOrder;
}

export interface MarkdownRendererCapability {
  capability_id: "cap:renderer";
  local_name: string;
  entry: string;
  metadata: {
    primitive_type_id: string;
    target: "text/markdown";
  };
}

export interface MarkdownRendererResult {
  renderer: (target: RenderTarget) => string;
  capability: MarkdownRendererCapability;
}

export function zodSchemaToMarkdownRenderer(
  schema: ZodObject<ZodRawShape>,
  opts: MarkdownRendererOptions,
): MarkdownRendererResult {
  const declaredOrder = listSchemaFields(schema);
  const order = resolveOrder(declaredOrder, opts.fieldOrder);

  const nameFields = opts.nameFields ?? DEFAULT_NAME_FIELDS;

  const renderer = (target: RenderTarget): string => {
    const lines: string[] = [];
    lines.push(opts.title ? opts.title(target) : defaultTitle(target, opts.primitive_type_id, nameFields));
    lines.push("");
    // The type belongs under the heading, not in it: the heading answers
    // "which one is this", the subtitle answers "what kind of thing".
    lines.push(`\`${opts.primitive_type_id}\``);
    lines.push("");

    const rows = order
      .map((field) => ({ field, value: target.field_values[field] }))
      .filter(({ field, value }) => isPresent(value) && !nameFields.includes(field));
    if (rows.length === 0) {
      lines.push("_no fields set_");
      return lines.join("\n");
    }
    lines.push("| Field | Value |");
    lines.push("|---|---|");
    for (const { field, value } of rows) {
      lines.push(`| ${humanise(field)} | ${formatValue(value)} |`);
    }
    return lines.join("\n");
  };

  return {
    renderer,
    capability: {
      capability_id: "cap:renderer",
      local_name: kebabCase(opts.primitive_type_id),
      entry: `${camelCaseLast(opts.primitive_type_id)}MarkdownRenderer`,
      metadata: {
        primitive_type_id: opts.primitive_type_id,
        target: "text/markdown",
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function listSchemaFields(schema: ZodObject<ZodRawShape>): string[] {
  const shape = getObjectShape(schema);
  return shape ? Object.keys(shape) : [];
}

function resolveOrder(
  declared: ReadonlyArray<string>,
  override: FieldOrder | undefined,
): ReadonlyArray<string> {
  if (override === undefined || override === "schema") return declared;
  if (override === "alphabetical") return [...declared].sort();
  // Explicit array — keep what the user provided, in their order.
  return override;
}

/** Fields that conventionally carry a human name for the entity. */
const DEFAULT_NAME_FIELDS: ReadonlyArray<string> = ["name", "title", "label", "headline", "summary"];

/**
 * `## <name>` when the entity names itself, otherwise `## <Type> \`<slug>\``
 * — the tail of the id, not the whole namespaced form, which repeats the
 * type the subtitle already gives.
 *
 * A heading level of `##` leaves `#` for whoever assembles these into a
 * document; a per-entity fragment is never the document title.
 */
function defaultTitle(
  target: RenderTarget,
  primitiveTypeId: string,
  nameFields: ReadonlyArray<string>,
): string {
  for (const field of nameFields) {
    const v = target.field_values[field];
    if (typeof v === "string" && v.trim() !== "") return `## ${v.trim()}`;
  }
  const type = primitiveTypeId.split(":").pop() ?? primitiveTypeId;
  const slug = target.id.split(":").pop() ?? target.id;
  return `## ${type} \`${slug}\``;
}

/** `false` and `0` are values; empty strings, arrays and nullish are not. */
function isPresent(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return true;
}

/** `qualified_name` -> "Qualified name"; `xmi_id` -> "Xmi id". */
function humanise(field: string): string {
  const words = field
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A pipe inside a value would split the row into extra columns. */
function escapeCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n+/g, " ");
}

function formatValue(v: unknown): string {
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (Array.isArray(v)) return escapeCell(v.map((x) => formatScalar(x)).join(", "));
  if (v !== null && typeof v === "object") {
    return escapeCell(
      Object.entries(v as Record<string, unknown>)
        .filter(([, x]) => isPresent(x))
        .map(([k, x]) => `${humanise(k).toLowerCase()}: ${formatScalar(x)}`)
        .join("; "),
    );
  }
  return escapeCell(formatScalar(v));
}

/** One level down: nested objects inside a list or struct print compactly. */
function formatScalar(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function kebabCase(s: string): string {
  // Keep ascii letters/digits; convert ":" and other separators to "-".
  return s
    .replace(/[A-Z]+/g, (m) => `-${m.toLowerCase()}`)
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function camelCaseLast(s: string): string {
  // primitive_type_id is "<vendor>:<Name>"; the entry name is the
  // PascalCase tail with the first letter lowercased + suffix appended
  // by the caller.
  const tail = s.split(":").pop() ?? s;
  return tail[0]!.toLowerCase() + tail.slice(1);
}
