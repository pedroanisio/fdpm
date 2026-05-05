/**
 * Cross-capability registrations for the formal-specification plugin.
 *
 * Wires the plugin into capability slots beyond `cap:profile` and
 * `cap:renderer`:
 *
 *   - `cap:validator` — three code-side checks that complement the
 *     declarative CEL rules in `validation_rules.ts` (the host CEL
 *     pipeline evaluates those; these run alongside).
 *   - `cap:expr-helper` — `fn.fdpm.formal-specification.section-depth`,
 *     a deterministic length count for fs:Section ids.
 *   - `cap:transformer` — `fs:Theorem`/`fs:FormalProperty` -> `fs:Invariant`
 *     emission scaffold, registered for future `runTransformer` calls.
 *   - `cap:importer` / `cap:exporter` — `fs-jsonl` round-trip for
 *     bundling the plugin's primitive subset of a workbook.
 */
import type {
  PrimitiveInstance,
  RelationInstance,
  ProjectTransfer,
  ValidationFinding,
} from "../../src/core/models/instance.js";
import type {
  PluginContext,
  ImporterFn,
  ExporterFn,
  TransformerFn,
} from "../../src/plugin/types.js";

const TEXT_DECODER = new TextDecoder("utf-8", { fatal: true });
const TEXT_ENCODER = new TextEncoder();

function isTrivial(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

function finding(
  ruleId: string,
  level: "error" | "warning" | "info",
  target: string,
  field: string | null,
  message: string,
): ValidationFinding {
  return { rule_id: ruleId, level, target_id: target, field_path: field, message };
}

export function registerFormalSpecificationCapabilities(ctx: PluginContext): void {
  // ── cap:validator ────────────────────────────────────────────────
  // Code-side checks beyond the declarative CEL rules. These run
  // through the per-instance validator dispatcher, so they only see
  // primitives whose type_id matches.

  // (1) fs:Invariant.enforcement=CI MUST be backed by a non-trivial
  // justification — a CI-enforced invariant without a stated reason
  // is a tripwire with no semantics.
  ctx.registerValidator({
    type_id: "fs:Invariant",
    rule_id: "fs:val:ci-invariant-justified",
    fn: (instance) => {
      const fv = (instance as PrimitiveInstance).field_values;
      if (fv["enforcement"] !== "CI") return [];
      if (!isTrivial(fv["justification"])) return [];
      return [
        finding(
          "fs:val:ci-invariant-justified",
          "error",
          instance.id,
          "field_values.justification",
          "fs:Invariant with enforcement=CI must declare a non-empty justification.",
        ),
      ];
    },
  });

  // (2) fs:Section descriptions over 4000 chars are a smell; warn so
  // the operator splits them.
  ctx.registerValidator({
    type_id: "fs:Section",
    rule_id: "fs:val:section-length-cap",
    fn: (instance) => {
      const fv = (instance as PrimitiveInstance).field_values;
      const body = fv["body"];
      if (typeof body !== "string" || body.length <= 4000) return [];
      return [
        finding(
          "fs:val:section-length-cap",
          "warning",
          instance.id,
          "field_values.body",
          `fs:Section body is ${body.length} chars; consider splitting (>4000).`,
        ),
      ];
    },
  });

  // (3) fs:Citation that declares a DOI must use the canonical
  // `https://doi.org/<suffix>` form; bare `10.x/y` strings are
  // ambiguous when copy-pasted into renderers.
  ctx.registerValidator({
    type_id: "fs:Citation",
    rule_id: "fs:val:doi-canonical-url",
    fn: (instance) => {
      const fv = (instance as PrimitiveInstance).field_values;
      const doi = fv["doi"];
      if (doi == null || doi === "") return [];
      if (typeof doi !== "string") return [];
      if (doi.startsWith("https://doi.org/")) return [];
      return [
        finding(
          "fs:val:doi-canonical-url",
          "warning",
          instance.id,
          "field_values.doi",
          `fs:Citation.doi should start with "https://doi.org/"; got "${doi}".`,
        ),
      ];
    },
  });

  // ── cap:expr-helper ──────────────────────────────────────────────
  // Returns the colon-separated depth of a fs:Section id (e.g.
  // "section:intro:overview" → 2). Useful for declarative rules that
  // want to bound nesting without an external traversal.
  ctx.registerExprHelper({
    helperId: "fn.fdpm.formal-specification.section-depth",
    arity: 1,
    fn: (id: unknown): number => {
      if (typeof id !== "string" || id.length === 0) return 0;
      const parts = id.split(":");
      return parts.length > 1 ? parts.length - 1 : 0;
    },
  });

  // ── cap:transformer ──────────────────────────────────────────────
  // Workbook an fs:FormalProperty into an emit-ops scaffold for an
  // fs:Invariant. The runtime does not yet drive these emissions, so
  // we return the proposed payload deterministically; a future
  // host.runTransformer caller will consume it.
  const formalPropertyToInvariant: TransformerFn = (input) => {
    const src = input.source as PrimitiveInstance;
    const stmt = src.field_values["statement"];
    if (typeof stmt !== "string" || stmt.length === 0) return [];
    return [
      {
        kind: "primitive.create",
        payload: {
          type_id: "fs:Invariant",
          field_values: {
            name: `derived-from-${src.id}`,
            statement: stmt,
            extent: "global",
            enforcement: "Review",
          },
        },
      },
    ];
  };
  ctx.registerTransformer({
    fromTypeId: "fs:FormalProperty",
    toTypeId: "fs:Invariant",
    name: "fs:formal-property-to-invariant",
    fn: formalPropertyToInvariant,
  });

  // ── cap:importer ─────────────────────────────────────────────────
  // `fs-jsonl` carries one JSON record per line and reconstructs a
  // ProjectTransfer using only this plugin's primitive types. The
  // host then validates the result against the canonical schema.
  const fsJsonlImporter: ImporterFn = (raw, options) => {
    const text =
      typeof raw === "string"
        ? raw
        : raw instanceof Uint8Array
          ? TEXT_DECODER.decode(raw)
          : raw && typeof raw === "object" && "text" in raw && typeof (raw as { text: unknown }).text === "string"
            ? ((raw as { text: string }).text)
            : (() => {
                throw new Error("fs-jsonl: raw must be string|Uint8Array|{text:string}");
              })();

    const primitives: PrimitiveInstance[] = [];
    const relations: RelationInstance[] = [];
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      const record = JSON.parse(trimmed) as { kind: string; data: unknown };
      if (record.kind === "primitive") {
        primitives.push(record.data as PrimitiveInstance);
      } else if (record.kind === "relation") {
        relations.push(record.data as RelationInstance);
      }
    }
    const workbookId = options?.workbookId ?? "fs-imported";
    const transfer: ProjectTransfer = {
      spec_core: "1.1.0",
      workbook: {
        id: workbookId,
        name: options?.projectName ?? workbookId,
        profile_id: "profile:formal-specification:3.0",
        created_at: new Date().toISOString(),
        revision: 0,
        ...(options?.projectDescription != null && {
          description: options.projectDescription,
        }),
      },
      primitives,
      relations,
      templates: [],
      test_suites: [],
    };
    return transfer;
  };
  ctx.registerImporter({ format: "fs-jsonl", fn: fsJsonlImporter });

  // ── cap:exporter ─────────────────────────────────────────────────
  const fsJsonlExporter: ExporterFn = (transfer) => {
    const lines: string[] = [];
    for (const p of transfer.primitives) {
      if (!p.type_id.startsWith("fs:")) continue;
      lines.push(JSON.stringify({ kind: "primitive", data: p }));
    }
    for (const r of transfer.relations) {
      if (!r.type_id.startsWith("fs:")) continue;
      lines.push(JSON.stringify({ kind: "relation", data: r }));
    }
    return TEXT_ENCODER.encode(lines.join("\n") + (lines.length > 0 ? "\n" : ""));
  };
  ctx.registerExporter({ format: "fs-jsonl", fn: fsJsonlExporter });
}
