/**
 * Cross-capability registrations for the software-architecture plugin.
 *
 * Adds:
 *   - `cap:validator` — three code-side checks complementing the
 *     declarative CEL rules in `validation_rules.ts`.
 *   - `cap:expr-helper` —
 *     `fn.fdpm.software-architecture.endpoint-route` builds a
 *     deterministic display label `METHOD path` from an Endpoint's
 *     fields. Useful for renderers and rules.
 *   - `cap:transformer` — `sw:Capability` → `sw:Endpoint` scaffold.
 *   - `cap:importer` / `cap:exporter` — `sw-jsonl` round-trip.
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

function finding(
  ruleId: string,
  level: "error" | "warning" | "info",
  target: string,
  field: string | null,
  message: string,
): ValidationFinding {
  return { rule_id: ruleId, level, target_id: target, field_path: field, message };
}

const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

export function registerSoftwareArchitectureCapabilities(ctx: PluginContext): void {
  // ── cap:validator ────────────────────────────────────────────────

  // (1) HTTP endpoints declaring a method MUST use one of the seven
  // canonical verbs. Lower-case or non-standard verbs break OpenAPI
  // emission.
  ctx.registerValidator({
    type_id: "sw:Endpoint",
    rule_id: "sw:val:http-method-canonical",
    fn: (instance) => {
      const fv = (instance as PrimitiveInstance).field_values;
      if (fv["protocol"] !== "HTTP") return [];
      const method = fv["method"];
      if (method == null || method === "") return [];
      if (typeof method === "string" && HTTP_METHODS.has(method)) return [];
      return [
        finding(
          "sw:val:http-method-canonical",
          "error",
          instance.id,
          "field_values.method",
          `sw:Endpoint.method must be one of ${[...HTTP_METHODS].join(", ")}; got ${JSON.stringify(method)}.`,
        ),
      ];
    },
  });

  // (2) Endpoint deprecated=true must declare deprecated_since;
  // operators need an audit trail.
  ctx.registerValidator({
    type_id: "sw:Endpoint",
    rule_id: "sw:val:deprecated-since-required",
    fn: (instance) => {
      const fv = (instance as PrimitiveInstance).field_values;
      if (fv["deprecated"] !== true) return [];
      const since = fv["deprecated_since"];
      if (typeof since === "string" && since.trim().length > 0) return [];
      return [
        finding(
          "sw:val:deprecated-since-required",
          "error",
          instance.id,
          "field_values.deprecated_since",
          "sw:Endpoint with deprecated=true must declare deprecated_since.",
        ),
      ];
    },
  });

  // (3) sw:Decision should not stay in `Proposed` indefinitely.
  // Warn when status is Proposed but `decided_at` is set — a
  // contradiction the renderer will display oddly.
  ctx.registerValidator({
    type_id: "sw:Decision",
    rule_id: "sw:val:proposed-no-decided-at",
    fn: (instance) => {
      const fv = (instance as PrimitiveInstance).field_values;
      if (fv["status"] !== "Proposed") return [];
      const decidedAt = fv["decided_at"];
      if (decidedAt == null || decidedAt === "") return [];
      return [
        finding(
          "sw:val:proposed-no-decided-at",
          "warning",
          instance.id,
          "field_values.decided_at",
          "sw:Decision with status=Proposed should not have decided_at set; advance the status or clear the date.",
        ),
      ];
    },
  });

  // ── cap:expr-helper ──────────────────────────────────────────────
  ctx.registerExprHelper({
    helperId: "fn.fdpm.software-architecture.endpoint-route",
    arity: 2,
    fn: (method: unknown, path: unknown): string => {
      const m = typeof method === "string" && method.length > 0 ? method.toUpperCase() : "*";
      const p = typeof path === "string" && path.length > 0 ? path : "/";
      return `${m} ${p}`;
    },
  });

  // ── cap:transformer ──────────────────────────────────────────────
  // sw:Capability → sw:Endpoint scaffold. Emits a single
  // primitive.create with a placeholder route so the operator can
  // refine method/path. Conservative: only fires when the capability
  // declares `interaction_kind=API` (common pattern).
  const capabilityToEndpoint: TransformerFn = (input) => {
    const src = input.source as PrimitiveInstance;
    const fv = src.field_values;
    if (fv["interaction_kind"] !== "API") return [];
    return [
      {
        kind: "primitive.create",
        payload: {
          type_id: "sw:Endpoint",
          field_values: {
            name: `${src.field_values["name"] ?? src.id} endpoint`,
            protocol: "HTTP",
            method: "GET",
            path: `/${String(src.id).replace(/[^a-z0-9-]/gi, "-").toLowerCase()}`,
          },
        },
      },
    ];
  };
  ctx.registerTransformer({
    fromTypeId: "sw:Capability",
    toTypeId: "sw:Endpoint",
    name: "sw:capability-to-endpoint",
    fn: capabilityToEndpoint,
  });

  // ── cap:importer ─────────────────────────────────────────────────
  const swJsonlImporter: ImporterFn = (raw, options) => {
    const text =
      typeof raw === "string"
        ? raw
        : raw instanceof Uint8Array
          ? TEXT_DECODER.decode(raw)
          : raw && typeof raw === "object" && "text" in raw && typeof (raw as { text: unknown }).text === "string"
            ? ((raw as { text: string }).text)
            : (() => {
                throw new Error("sw-jsonl: raw must be string|Uint8Array|{text:string}");
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
    const workbookId = options?.workbookId ?? "sw-imported";
    const transfer: ProjectTransfer = {
      spec_core: "1.1.0",
      workbook: {
        id: workbookId,
        name: options?.projectName ?? workbookId,
        profile_id: "profile:software-architecture:1.0",
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
  ctx.registerImporter({ format: "sw-jsonl", fn: swJsonlImporter });

  // ── cap:exporter ─────────────────────────────────────────────────
  const swJsonlExporter: ExporterFn = (transfer) => {
    const lines: string[] = [];
    for (const p of transfer.primitives) {
      if (!p.type_id.startsWith("sw:")) continue;
      lines.push(JSON.stringify({ kind: "primitive", data: p }));
    }
    for (const r of transfer.relations) {
      if (!r.type_id.startsWith("sw:")) continue;
      lines.push(JSON.stringify({ kind: "relation", data: r }));
    }
    return TEXT_ENCODER.encode(lines.join("\n") + (lines.length > 0 ? "\n" : ""));
  };
  ctx.registerExporter({ format: "sw-jsonl", fn: swJsonlExporter });
}
