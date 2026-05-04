/**
 * Cross-capability registrations for the spec-authoring plugin.
 *
 * The plugin already wires `cap:validator` (24 implementations) via
 * `_register_validators.ts`. This module covers the four remaining
 * capability slots:
 *
 *   - `cap:expr-helper` —
 *     `fn.fdpm.spec-authoring.section-number` formats a numeric depth
 *     trail (e.g. [1,2,3] → "1.2.3") for renderers.
 *   - `cap:transformer` — `spec:Requirement` → `spec:AcceptanceCriterion`
 *     scaffold (every requirement deserves at least one AC).
 *   - `cap:importer` / `cap:exporter` — `spec-jsonl` round-trip.
 */
import type {
  PrimitiveInstance,
  RelationInstance,
  ProjectTransfer,
} from "../../src/core/models/instance.js";
import type {
  PluginContext,
  ImporterFn,
  ExporterFn,
  TransformerFn,
} from "../../src/plugin/types.js";

const TEXT_DECODER = new TextDecoder("utf-8", { fatal: true });
const TEXT_ENCODER = new TextEncoder();

export function registerSpecAuthoringExtraCapabilities(ctx: PluginContext): void {
  // ── cap:expr-helper ──────────────────────────────────────────────
  // Stringify a list of integers as a dotted section number.
  // Example: [1,2,3] → "1.2.3". Defensive against ragged inputs.
  ctx.registerExprHelper({
    helperId: "fn.fdpm.spec-authoring.section-number",
    arity: 1,
    fn: (parts: unknown): string => {
      if (!Array.isArray(parts)) return "";
      const segments: string[] = [];
      for (const p of parts) {
        if (typeof p === "number" && Number.isInteger(p) && p >= 0) {
          segments.push(String(p));
        } else if (typeof p === "string" && /^\d+$/.test(p)) {
          segments.push(p);
        } else {
          return "";
        }
      }
      return segments.join(".");
    },
  });

  // ── cap:transformer ──────────────────────────────────────────────
  // spec:Requirement → spec:AcceptanceCriterion scaffold. Emits one
  // AC per Requirement so the SPEC author has a concrete target.
  const requirementToAc: TransformerFn = (input) => {
    const src = input.source as PrimitiveInstance;
    const text = src.field_values["text"];
    if (typeof text !== "string" || text.length === 0) return [];
    return [
      {
        kind: "primitive.create",
        payload: {
          type_id: "spec:AcceptanceCriterion",
          field_values: {
            label: `AC for ${src.id}`,
            given_when_then: `Given the system, when ${text.slice(0, 80)}, then the requirement holds.`,
          },
        },
      },
    ];
  };
  ctx.registerTransformer({
    fromTypeId: "spec:Requirement",
    toTypeId: "spec:AcceptanceCriterion",
    name: "spec:requirement-to-ac",
    fn: requirementToAc,
  });

  // ── cap:importer ─────────────────────────────────────────────────
  const specJsonlImporter: ImporterFn = (raw, options) => {
    const text =
      typeof raw === "string"
        ? raw
        : raw instanceof Uint8Array
          ? TEXT_DECODER.decode(raw)
          : raw && typeof raw === "object" && "text" in raw && typeof (raw as { text: unknown }).text === "string"
            ? ((raw as { text: string }).text)
            : (() => {
                throw new Error("spec-jsonl: raw must be string|Uint8Array|{text:string}");
              })();

    const primitives: PrimitiveInstance[] = [];
    const relations: RelationInstance[] = [];
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      const record = JSON.parse(trimmed) as { kind: string; data: unknown };
      if (record.kind === "primitive") primitives.push(record.data as PrimitiveInstance);
      else if (record.kind === "relation") relations.push(record.data as RelationInstance);
    }
    const projectId = options?.projectId ?? "spec-imported";
    const transfer: ProjectTransfer = {
      spec_core: "1.1.0",
      project: {
        id: projectId,
        name: options?.projectName ?? projectId,
        profile_id: "profile:spec-authoring:0.1",
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
  ctx.registerImporter({ format: "spec-jsonl", fn: specJsonlImporter });

  // ── cap:exporter ─────────────────────────────────────────────────
  const specJsonlExporter: ExporterFn = (transfer) => {
    const lines: string[] = [];
    for (const p of transfer.primitives) {
      if (!p.type_id.startsWith("spec:")) continue;
      lines.push(JSON.stringify({ kind: "primitive", data: p }));
    }
    for (const r of transfer.relations) {
      if (!r.type_id.startsWith("spec:")) continue;
      lines.push(JSON.stringify({ kind: "relation", data: r }));
    }
    return TEXT_ENCODER.encode(lines.join("\n") + (lines.length > 0 ? "\n" : ""));
  };
  ctx.registerExporter({ format: "spec-jsonl", fn: specJsonlExporter });
}
