/**
 * cap:renderer derivation — schema-driven markdown renderer.
 *
 * Per howto-zod-to-fdpm-plugin §7 / `example:bridge-renderer`.
 *
 * Output shape (locked by the workbook):
 *
 *   <title>
 *   | Field   | Value         |
 *   |---------|---------------|
 *   | <name>  | <stringified> |
 *   ...
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
  /** Title factory; default: `# <type_id> <id>`. */
  title?: (target: RenderTarget) => string;
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

  const renderer = (target: RenderTarget): string => {
    const title = opts.title
      ? opts.title(target)
      : `# ${opts.primitive_type_id} ${target.id}`;
    const lines: string[] = [];
    lines.push(title);
    lines.push("");
    lines.push("| Field | Value |");
    lines.push("|---|---|");
    for (const field of order) {
      const v = target.field_values[field];
      lines.push(`| ${field} | ${stringifyValue(v)} |`);
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

function stringifyValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.map((x) => String(x)).join(", ");
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
