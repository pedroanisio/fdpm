/**
 * cap:importer / cap:exporter derivation — schema-driven JSON I/O.
 *
 * Per howto-zod-to-fdpm-plugin §7 / `example:bridge-importer`,
 * `example:bridge-exporter`.
 *
 * Importer behavior:
 *   - parse JSON body (must be an array of objects)
 *   - run schema.safeParse on each element
 *   - on success: emit a PrimitiveCreate intent with id derived via idFrom
 *   - on first failure: halt the whole batch (atomic per
 *     fdpm.primitive.create_batch semantics) and return warnings
 *     using the same rule_id namespacing as the validator
 *
 * Exporter behavior:
 *   - take a workbook view (id + primitives[])
 *   - filter to primitive_type_id
 *   - sort by primitive id (lexicographic)
 *   - serialize with stableStringify so byte-equality holds for
 *     identical primitive sets regardless of input order
 *
 * Round-trip: importer(exporter(W)).intents matches W's primitive set
 * (modulo the host's id derivation via idFrom).
 */

import type { ZodObject, ZodRawShape } from "zod";
import type { Finding } from "./types.js";
import { stableStringify } from "./stable-stringify.js";

// ===========================================================================
// Importer
// ===========================================================================

export interface PrimitiveCreateIntent {
  id: string;
  type_id: string;
  field_values: Record<string, unknown>;
}

export interface ImporterOptions<T> {
  primitive_type_id: string;
  idFrom: (parsed: T) => string;
  pluginId: string;
  /** Lowercase entity name for rule_id namespacing (e.g. "customer"). */
  typeName: string;
}

export interface ImporterCapability {
  capability_id: "cap:importer";
  local_name: string;
  entry: string;
  metadata: {
    format_id: string;
    accepts_mime: ReadonlyArray<string>;
    file_extensions: ReadonlyArray<string>;
  };
}

export type ImporterResult =
  | { kind: "ok"; intents: PrimitiveCreateIntent[] }
  | { kind: "error"; warnings: Finding[]; partialIntents: PrimitiveCreateIntent[] };

export interface ImporterEmission<T> {
  importer: (body: string) => ImporterResult;
  capability: ImporterCapability;
}

export function zodSchemaToImporter<T>(
  schema: ZodObject<ZodRawShape>,
  opts: ImporterOptions<T>,
): ImporterEmission<T> {
  const importer = (body: string): ImporterResult => {
    let raw: unknown;
    try {
      raw = JSON.parse(body);
    } catch (e) {
      return {
        kind: "error",
        warnings: [
          {
            rule_id: `${opts.pluginId}:zod.${opts.typeName}.import.parse-failed`,
            level: "error",
            message: `JSON parse failed: ${e instanceof Error ? e.message : String(e)}`,
          },
        ],
        partialIntents: [],
      };
    }
    if (!Array.isArray(raw)) {
      return {
        kind: "error",
        warnings: [
          {
            rule_id: `${opts.pluginId}:zod.${opts.typeName}.import.not-array`,
            level: "error",
            message: "import body must be a JSON array of entity objects",
          },
        ],
        partialIntents: [],
      };
    }
    const intents: PrimitiveCreateIntent[] = [];
    const warnings: Finding[] = [];
    for (let i = 0; i < raw.length; i++) {
      const elt = raw[i];
      const parsed = schema.safeParse(elt);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          warnings.push({
            rule_id: `${opts.pluginId}:zod.${opts.typeName}.${issue.code}${issue.path.length ? "." + issue.path.join(".") : ""}`,
            level: "error",
            path: [String(i), ...issue.path.map(String)],
            message: issue.message,
          });
        }
        // Atomic — halt on first failure per the workbook contract.
        return { kind: "error", warnings, partialIntents: intents };
      }
      const id = opts.idFrom(parsed.data as T);
      intents.push({
        id,
        type_id: opts.primitive_type_id,
        field_values: parsed.data as Record<string, unknown>,
      });
    }
    return { kind: "ok", intents };
  };

  const tail = opts.primitive_type_id.split(":").pop() ?? "entity";
  const formatId = `${opts.pluginId}:json`;
  return {
    importer,
    capability: {
      capability_id: "cap:importer",
      local_name: `${tail.toLowerCase()}-json`,
      entry: `${tail[0]!.toLowerCase() + tail.slice(1)}Importer`,
      metadata: {
        format_id: formatId,
        accepts_mime: ["application/json"],
        file_extensions: [".json"],
      },
    },
  };
}

// ===========================================================================
// Exporter
// ===========================================================================

export interface WorkbookView {
  id: string;
  primitives: ReadonlyArray<{
    id: string;
    type_id: string;
    field_values: Record<string, unknown>;
  }>;
}

export interface ExporterOptions {
  primitive_type_id: string;
  filename: (workbook: WorkbookView) => string;
  pluginId?: string;
}

export interface ExporterCapability {
  capability_id: "cap:exporter";
  local_name: string;
  entry: string;
  metadata: {
    format_id: string;
    produces_mime: "application/json";
  };
}

export interface ExporterEmission {
  exporter: (workbook: WorkbookView) => { filename: string; body: string };
  capability: ExporterCapability;
}

export function zodSchemaToExporter(
  _schema: ZodObject<ZodRawShape>,
  opts: ExporterOptions,
): ExporterEmission {
  const exporter = (workbook: WorkbookView): { filename: string; body: string } => {
    const filtered = workbook.primitives.filter(
      (p) => p.type_id === opts.primitive_type_id,
    );
    // Sort by primitive id so the body is byte-stable across input
    // orderings of the same set.
    const sorted = [...filtered].sort((a, b) => a.id.localeCompare(b.id));
    const items = sorted.map((p) => p.field_values);
    const body = stableStringify(items);
    return { filename: opts.filename(workbook), body };
  };

  const tail = opts.primitive_type_id.split(":").pop() ?? "entity";
  const pluginId = opts.pluginId ?? opts.primitive_type_id.split(":")[0] ?? "plugin";
  return {
    exporter,
    capability: {
      capability_id: "cap:exporter",
      local_name: `${tail.toLowerCase()}-json`,
      entry: `${tail[0]!.toLowerCase() + tail.slice(1)}Exporter`,
      metadata: {
        format_id: `${pluginId}:json`,
        produces_mime: "application/json",
      },
    },
  };
}
