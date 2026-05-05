/**
 * Cross-capability registrations for the planning plugin.
 *
 * Adds:
 *   - `cap:validator` — three code-side checks complementing the
 *     declarative CEL rules in `validation_rules.ts`.
 *   - `cap:expr-helper` — `fn.fdpm.planning.minutes-to-hours`, a
 *     deterministic minutes/60 conversion useful in renderers and
 *     forecast rules.
 *   - `cap:transformer` — `plan:Task` → `plan:AcceptanceCriterion`
 *     scaffold for AI tasks missing an AC.
 *   - `cap:importer` / `cap:exporter` — `plan-jsonl` round-trip for
 *     the plugin's primitive subset of a workbook.
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

const AI_MINUTES_BUCKETS = new Set([5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]);

export function registerPlanningCapabilities(ctx: PluginContext): void {
  // ── cap:validator ────────────────────────────────────────────────

  // (1) Defense-in-depth: even though the field shape Enum already
  // bounds ai_minutes, malformed legacy data (e.g. a string "30")
  // would slip past until first re-save. The CEL rule asserts the
  // bucket; this asserts the type.
  ctx.registerValidator({
    type_id: "plan:Task",
    rule_id: "plan:val:ai-minutes-numeric-bucket",
    fn: (instance) => {
      const fv = (instance as PrimitiveInstance).field_values;
      if (fv["executor_kind"] !== "AI") return [];
      const v = fv["ai_minutes"];
      if (typeof v === "number" && AI_MINUTES_BUCKETS.has(v)) return [];
      return [
        finding(
          "plan:val:ai-minutes-numeric-bucket",
          "error",
          instance.id,
          "field_values.ai_minutes",
          `AI task ai_minutes must be a number in {5,...,60} step 5; got ${JSON.stringify(v)}.`,
        ),
      ];
    },
  });

  // (2) plan:Iteration `name` must be non-whitespace. The roadmap and
  // gantt renderers fall back to `it.id` when `name` is missing or
  // blank; that's a usability degradation worth surfacing as a
  // warning even though the schema gate (`name` is `required: true`)
  // catches the literally-missing case.
  //
  // History: prior revisions of this validator checked an undeclared
  // `label` field, which was both wrong (renderers read `name`, not
  // `label`) and self-defeating (adding `label` to satisfy the
  // validator triggered the schema gate's `core:field:undeclared`
  // warning). Renamed from `iteration-label-non-empty` to
  // `iteration-name-non-empty` in 2026-Q2 to make the field switch
  // visible in audit logs.
  ctx.registerValidator({
    type_id: "plan:Iteration",
    rule_id: "plan:val:iteration-name-non-empty",
    fn: (instance) => {
      const fv = (instance as PrimitiveInstance).field_values;
      const name = fv["name"];
      if (typeof name === "string" && name.trim().length > 0) return [];
      return [
        finding(
          "plan:val:iteration-name-non-empty",
          "warning",
          instance.id,
          "field_values.name",
          "plan:Iteration.name is empty or whitespace-only; gantt and roadmap renderers will fall back to the iteration id.",
        ),
      ];
    },
  });

  // (3) plan:Blocker.opened_at must precede env.now lexicographically
  // when present. Catches obvious typos that the renderer would
  // happily display as a future-dated blocker.
  ctx.registerValidator({
    type_id: "plan:Blocker",
    rule_id: "plan:val:blocker-opened-not-future",
    fn: (instance) => {
      const fv = (instance as PrimitiveInstance).field_values;
      const opened = fv["opened_at"];
      if (typeof opened !== "string" || opened.length === 0) return [];
      const now = new Date().toISOString();
      if (opened <= now) return [];
      return [
        finding(
          "plan:val:blocker-opened-not-future",
          "warning",
          instance.id,
          "field_values.opened_at",
          `plan:Blocker.opened_at "${opened}" is after now ("${now}"); likely a typo.`,
        ),
      ];
    },
  });

  // ── cap:expr-helper ──────────────────────────────────────────────
  // Convert a minutes value into hours (rounded to 2 decimals). Used
  // by renderers that summarize per-iteration AI-task budgets.
  ctx.registerExprHelper({
    helperId: "fn.fdpm.planning.minutes-to-hours",
    arity: 1,
    fn: (minutes: unknown): number => {
      if (typeof minutes !== "number" || !Number.isFinite(minutes)) return 0;
      return Math.round((minutes / 60) * 100) / 100;
    },
  });

  // ── cap:transformer ──────────────────────────────────────────────
  // Synthesize a stub plan:AcceptanceCriterion for AI tasks that
  // lack one. Emits a primitive.create + relation.create pair; the
  // operator can then adapt the AC's CEL expression.
  const taskToAcceptanceCriterion: TransformerFn = (input) => {
    const src = input.source as PrimitiveInstance;
    if (src.field_values["executor_kind"] !== "AI") return [];
    const acId = `${src.id}-ac`;
    return [
      {
        kind: "primitive.create",
        payload: {
          type_id: "plan:AcceptanceCriterion",
          id: acId,
          field_values: {
            label: `AC for ${src.id}`,
            expression: "true",
            kind: "machine",
          },
        },
      },
      {
        kind: "relation.create",
        payload: {
          type_id: "plan:Verifies",
          source_id: src.id,
          target_id: acId,
        },
      },
    ];
  };
  ctx.registerTransformer({
    fromTypeId: "plan:Task",
    toTypeId: "plan:AcceptanceCriterion",
    name: "plan:task-to-ac",
    fn: taskToAcceptanceCriterion,
  });

  // ── cap:importer ─────────────────────────────────────────────────
  const planJsonlImporter: ImporterFn = (raw, options) => {
    const text =
      typeof raw === "string"
        ? raw
        : raw instanceof Uint8Array
          ? TEXT_DECODER.decode(raw)
          : raw && typeof raw === "object" && "text" in raw && typeof (raw as { text: unknown }).text === "string"
            ? ((raw as { text: string }).text)
            : (() => {
                throw new Error("plan-jsonl: raw must be string|Uint8Array|{text:string}");
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
    const workbookId = options?.workbookId ?? "plan-imported";
    const transfer: ProjectTransfer = {
      spec_core: "1.1.0",
      workbook: {
        id: workbookId,
        name: options?.projectName ?? workbookId,
        profile_id: "profile:planning:0.1",
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
  ctx.registerImporter({ format: "plan-jsonl", fn: planJsonlImporter });

  // ── cap:exporter ─────────────────────────────────────────────────
  const planJsonlExporter: ExporterFn = (transfer) => {
    const lines: string[] = [];
    for (const p of transfer.primitives) {
      if (!p.type_id.startsWith("plan:")) continue;
      lines.push(JSON.stringify({ kind: "primitive", data: p }));
    }
    for (const r of transfer.relations) {
      if (!r.type_id.startsWith("plan:")) continue;
      lines.push(JSON.stringify({ kind: "relation", data: r }));
    }
    return TEXT_ENCODER.encode(lines.join("\n") + (lines.length > 0 ? "\n" : ""));
  };
  ctx.registerExporter({ format: "plan-jsonl", fn: planJsonlExporter });
}
