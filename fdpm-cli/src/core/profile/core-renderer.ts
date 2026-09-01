import type { RendererInput, RendererOutput } from "../../plugin/types.js";
import type { DomainProfile } from "../models/meta.js";

/**
 * The renderer every profile has, whatever else it has.
 *
 * A profile with no renderer is not a profile that fails to render. It is a
 * profile whose render request falls through `PluginRuntime.findRenderer`'s
 * last step — "the first renderer matching this target, by insertion order"
 * — and comes back rendered by some other plugin entirely. A UML model
 * returned as a shopping list is worse than a refusal, because it looks
 * like an answer.
 *
 * Core therefore ships one renderer that works for any profile, because it
 * reads nothing but the projection and the profile's own type vocabulary.
 * It is not a substitute for a domain renderer — it cannot be, it knows no
 * domain — but it guarantees the invariant every other part of the system
 * can then rely on: **every profile bears a runnable renderer**.
 */

export const CORE_RENDERER_ID = "core:WorkbookRenderer";
export const CORE_RENDERER_TARGET = "text/markdown";

/** The plugin id the core renderer is registered under. Not a plugin. */
export const CORE_RENDERER_OWNER = "core";

/** The binding every profile carries, so `findRenderer` never falls through. */
export const CORE_RENDERER_BINDING = {
  renderer_id: CORE_RENDERER_ID,
  name: "Workbook",
  output_format: CORE_RENDERER_TARGET,
  output_path: "workbook.md",
  description:
    "Profile-generic Markdown: every primitive grouped by type, every relation, read from the projection alone.",
} as const;

const TITLE_KEYS = ["title", "name", "label", "heading", "summary", "handle", "term"];

/** The best one-line name for an instance, or its id when it has none. */
function instanceTitle(fieldValues: Record<string, unknown>, id: string): string {
  for (const key of TITLE_KEYS) {
    const value = fieldValues[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return id;
}

/** A field value on one line, with Markdown's own characters made inert. */
function renderValue(value: unknown): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "string") return value.trim() === "" ? "—" : escapeCell(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    return value.map((item) => renderValue(item)).join(", ");
  }
  return "`" + escapeCell(JSON.stringify(value)) + "`";
}

/** Every field an instance carries, on one line, for a table cell. */
function renderFields(fieldValues: Record<string, unknown>): string {
  const fields = Object.entries(fieldValues);
  if (fields.length === 0) return "—";
  return fields.map(([field, value]) => `**${field}** ${renderValue(value)}`).join(" · ");
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function labelForType(profile: DomainProfile, typeId: string): string {
  for (const type of profile.primitive_types) {
    if (type.id === typeId) return type.name ?? typeId;
  }
  for (const type of profile.relation_types) {
    if (type.id === typeId) return type.name ?? typeId;
  }
  return typeId;
}

/**
 * Group by `type_id`, ordered by the label a reader sees rather than by the
 * id, so the document reads in the order the section headings are in.
 */
function groupByType<T extends { type_id: string }>(
  items: readonly T[],
  profile: DomainProfile,
): Array<[string, T[]]> {
  const byType = new Map<string, T[]>();
  for (const item of items) {
    const list = byType.get(item.type_id) ?? [];
    list.push(item);
    byType.set(item.type_id, list);
  }
  return [...byType.entries()].sort(([a], [b]) =>
    labelForType(profile, a).localeCompare(labelForType(profile, b)),
  );
}

/**
 * Render any workbook on any profile as Markdown.
 *
 * Deliberately structural rather than clever: headings from the profile's
 * type vocabulary, a definition list per instance, a table of relations. It
 * states what the workbook contains and never infers what it means — a
 * renderer that guessed at domain semantics it was not given would be the
 * same defect this module exists to prevent, one layer up.
 */
export function renderWorkbookMarkdown(input: RendererInput): RendererOutput {
  const { profile, primitives, relations } = input;
  const name = input.workbook?.name ?? input.workbookId;
  const out: string[] = [];

  out.push(`# ${name}`);
  out.push("");
  const meta = [`profile \`${profile.id}\``];
  if (input.workbook?.revision !== undefined) meta.push(`revision ${input.workbook.revision}`);
  meta.push(`${primitives.length} ${primitives.length === 1 ? "primitive" : "primitives"}`);
  meta.push(`${relations.length} ${relations.length === 1 ? "relation" : "relations"}`);
  out.push(`> ${meta.join(" · ")}`);
  out.push("");

  if (primitives.length === 0 && relations.length === 0) {
    // An empty workbook is a fact about the workbook, not a failure of the
    // renderer, and it is reported as one.
    out.push("This workbook is empty.");
    out.push("");
    return markdown(out.join("\n"), name);
  }

  for (const [typeId, items] of groupByType(primitives, profile)) {
    out.push(`## ${labelForType(profile, typeId)}`);
    out.push("");
    for (const item of items) {
      out.push(`### ${instanceTitle(item.field_values, item.id)}`);
      out.push("");
      out.push(`\`${item.id}\``);
      out.push("");
      const fields = Object.entries(item.field_values);
      if (fields.length === 0) {
        out.push("No field carries a value.");
        out.push("");
        continue;
      }
      for (const [field, value] of fields) {
        out.push(`- **${field}** ${renderValue(value)}`);
      }
      out.push("");
    }
  }

  if (relations.length > 0) {
    // A relation's fields are the relation's meaning, not decoration on it.
    // `role`, `assertionKind` and `confidence` are what separate "wrote it"
    // from "performed in it" and a fact from a 0.75 inference; a table that
    // prints only type and endpoints renders those edges as duplicate rows
    // and silently downgrades a marked assertion to an unmarked one.
    //
    // The column is added only when some relation carries a field, so a
    // profile whose edges are bare does not gain a column of em dashes.
    const carriesFields = relations.some(
      (item) => Object.keys(item.field_values).length > 0,
    );
    out.push("## Relations");
    out.push("");
    out.push(carriesFields ? "| Relation | From | To | Fields |" : "| Relation | From | To |");
    out.push(carriesFields ? "| --- | --- | --- | --- |" : "| --- | --- | --- |");
    for (const [typeId, items] of groupByType(relations, profile)) {
      for (const item of items) {
        const row = `| ${escapeCell(labelForType(profile, typeId))} | \`${item.source_id}\` | \`${item.target_id}\` |`;
        out.push(carriesFields ? `${row} ${renderFields(item.field_values)} |` : row);
      }
    }
    out.push("");
  }

  return markdown(out.join("\n"), name);
}

function markdown(text: string, name: string): RendererOutput {
  return {
    bytes: new TextEncoder().encode(text.endsWith("\n") ? text : `${text}\n`),
    contentType: CORE_RENDERER_TARGET,
    filename: `${name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "workbook"}.md`,
  };
}
