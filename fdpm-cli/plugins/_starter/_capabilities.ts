/**
 * Cross-capability registrations for the starter plugin.
 *
 * EDUCATIONAL NOTE — why a separate _capabilities.ts file?
 *   The DomainProfile (in index.ts) declares profile + primitives +
 *   relations + CEL rules. Everything else — code-side validators,
 *   expression helpers, transformers, importers, exporters — is
 *   registered IMPERATIVELY against the PluginContext during activate().
 *   Splitting these into _capabilities.ts keeps index.ts focused on
 *   the declarative profile shape and makes the imperative
 *   registrations easy to spot.
 *
 *   Pattern across in-tree plugins:
 *     - planning has _capabilities.ts (3 validators, 1 expr-helper,
 *       1 transformer, 1 importer, 1 exporter)
 *     - formal_specification has _capabilities.ts (similar mix)
 *     - dnis does NOT — it has zero non-profile capabilities
 *
 *   Follow the planning pattern. Even if you only have one validator
 *   to register today, _capabilities.ts is the right place to put it.
 *
 * EDUCATIONAL NOTE — what's an importer for?
 *   Importers convert a raw byte payload (JSONL, CSV, your custom
 *   format) into a ProjectTransfer the host can ingest as a workbook.
 *   The exporter is the inverse. Ship them as a pair so you can
 *   round-trip workbooks without data loss.
 *
 *   The starter ships a `recipe-jsonl` importer/exporter. The format is
 *   trivial: one JSON object per line, each `{kind: "primitive"|"relation",
 *   data: <PrimitiveInstance|RelationInstance>}`. Real-world plugins
 *   usually want a richer format (e.g., CSV with column mapping, an
 *   XML schema). Same shape, more parsing code.
 */
import type {
  PrimitiveInstance,
  ProjectTransfer,
  RelationInstance,
  ValidationFinding,
} from "../../src/core/models/instance.js";
import type {
  ExporterFn,
  ImporterFn,
  PluginContext,
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

export function registerStarterCapabilities(ctx: PluginContext): void {
  // ── cap:validator ────────────────────────────────────────────────
  //
  // EDUCATIONAL NOTE — why this is a code validator, not a CEL rule:
  //   The check is "every Recipe SHOULD have at least one outbound
  //   recipe:Uses edge". A naive CEL rule
  //
  //     graph.outgoing("recipe:Uses").size() >= 1
  //
  //   would fire AT CREATE TIME, before the relation has been created
  //   yet — rejecting every newly-created Recipe. (See the validation_rules.ts
  //   educational note about the "create-time graph trap".)
  //
  //   We have three options:
  //     A. Register it as a CEL rule with level: "warning". Validate-
  //        project picks it up later; create-time doesn't reject.
  //     B. Use a code validator that the host runs the same way it runs
  //        CEL rules but where we can express "skip the check if the
  //        primitive was just created seconds ago." (We'd need a way to
  //        detect this; not generally available.)
  //     C. Use a code validator that simply emits a WARNING — same as
  //        A but lets us tune the message and check additional things
  //        (e.g., "recipes with method that mentions 'oil' should
  //        probably have an oil ingredient").
  //
  //   The starter chooses C. Read the validation_rules.ts comment for
  //   why CEL rule + warning level is also fine — this is a stylistic
  //   choice, not a correctness one.
  ctx.registerValidator({
    type_id: "recipe:Recipe",
    rule_id: "recipe:val:has-at-least-one-ingredient",
    fn: (instance) => {
      // Code validators receive the instance only, not the full graph,
      // so this validator cannot actually walk recipe:Uses edges.
      // What we CAN check: that the recipe declares a `method` that
      // mentions food. We use it as a soft heuristic.
      //
      // EDUCATIONAL NOTE — code validator scope:
      //   A code validator's `fn` gets the instance and returns
      //   findings. It cannot read other primitives or relations. If
      //   you need graph access, write a CEL rule (which gets a
      //   `graph.*` helper) instead.
      const fv = (instance as PrimitiveInstance).field_values;
      const method = fv["method"];
      if (typeof method !== "string" || method.trim().length === 0) {
        return [
          finding(
            "recipe:val:has-at-least-one-ingredient",
            "warning",
            instance.id,
            "field_values.method",
            "Recipe has no method described. The shopping-list renderer will produce a thin entry. Consider adding a `method` field; it doesn't have to be long.",
          ),
        ];
      }
      return [];
    },
  });

  // ── cap:expr-helper ──────────────────────────────────────────────
  //
  // EDUCATIONAL NOTE — what an expression helper buys you:
  //   CEL rules can call back into JS via registered helpers. This
  //   lets you do work CEL can't express (regex, complex math, lookups
  //   into external data). Helpers MUST be deterministic and
  //   side-effect-free — the host caches their results within a
  //   validation pass.
  //
  //   The starter registers `fn.fdpm.starter.minutes-to-hours`, a
  //   trivial demo. A real plugin's helper would do something
  //   domain-meaningful (e.g., `fn.fdpm.recipe.total-time`,
  //   `fn.fdpm.recipe.is-vegan-from-tags`).
  ctx.registerExprHelper({
    helperId: "fn.fdpm.starter.minutes-to-hours",
    arity: 1,
    fn: (minutes: unknown): number => {
      if (typeof minutes !== "number" || !Number.isFinite(minutes)) return 0;
      return Math.round((minutes / 60) * 100) / 100;
    },
  });

  // ── cap:transformer ──────────────────────────────────────────────
  //
  // EDUCATIONAL NOTE — what a transformer is for:
  //   A transformer takes a primitive and emits a list of host
  //   operations (primitive.create, relation.create). Use it to
  //   scaffold related primitives based on an existing one. The
  //   transformer doesn't apply the operations itself — the host
  //   schedules them through the normal write path with full
  //   validation, so a buggy transformer can't bypass invariants.
  //
  //   This transformer is intentionally trivial: given a Recipe, emit
  //   one Ingredient with the recipe's name as a placeholder. A real
  //   transformer might parse the recipe's `method` field for
  //   ingredients (NLP or regex), emit them all, and link them via
  //   recipe:Uses. The shape is the same.
  const recipeToShoppingList: TransformerFn = (input) => {
    const src = input.source as PrimitiveInstance;
    if (src.type_id !== "recipe:Recipe") return [];
    const placeholderId = `ingredient:placeholder-for-${src.id.replace(/[^a-z0-9-]/g, "-")}`;
    return [
      {
        kind: "primitive.create",
        payload: {
          type_id: "recipe:Ingredient",
          id: placeholderId,
          field_values: {
            name: `Placeholder for ${src.id}`,
            default_unit: "piece",
          },
        },
      },
      {
        kind: "relation.create",
        payload: {
          type_id: "recipe:Uses",
          source_id: src.id,
          target_id: placeholderId,
          field_values: { quantity: 1, unit: "piece" },
        },
      },
    ];
  };
  ctx.registerTransformer({
    fromTypeId: "recipe:Recipe",
    toTypeId: "recipe:Ingredient",
    name: "recipe:to-shopping-list",
    fn: recipeToShoppingList,
  });

  // ── cap:importer ─────────────────────────────────────────────────
  //
  // EDUCATIONAL NOTE — input flexibility:
  //   The host calls importers with `raw` of various shapes. Always
  //   handle string, Uint8Array, AND the {text: string} envelope —
  //   different host call paths produce each shape, and refusing one
  //   makes your importer brittle to caller changes.
  const recipeJsonlImporter: ImporterFn = (raw, options) => {
    const text =
      typeof raw === "string"
        ? raw
        : raw instanceof Uint8Array
          ? TEXT_DECODER.decode(raw)
          : raw && typeof raw === "object" && "text" in raw && typeof (raw as { text: unknown }).text === "string"
            ? (raw as { text: string }).text
            : (() => {
                throw new Error("recipe-jsonl: raw must be string|Uint8Array|{text:string}");
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

    const workbookId = options?.workbookId ?? "recipe-imported";
    const transfer: ProjectTransfer = {
      spec_core: "1.1.0",
      workbook: {
        id: workbookId,
        name: options?.projectName ?? workbookId,
        profile_id: "profile:starter:0.1",
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
  ctx.registerImporter({ format: "recipe-jsonl", fn: recipeJsonlImporter });

  // ── cap:exporter ─────────────────────────────────────────────────
  //
  // EDUCATIONAL NOTE — symmetry with the importer:
  //   The exporter MUST produce output the importer can reconsume
  //   without loss. This is "round-trip equivalence." The starter
  //   tests exercise this: import → export → import should be
  //   idempotent (modulo timestamps).
  //
  //   The filter `r.type_id.startsWith("recipe:")` keeps exports
  //   plugin-scoped — your plugin's exporter shouldn't dump primitives
  //   from OTHER plugins' profiles, even if they happen to be in the
  //   workbook.
  const recipeJsonlExporter: ExporterFn = (transfer) => {
    const lines: string[] = [];
    for (const p of transfer.primitives) {
      if (!p.type_id.startsWith("recipe:")) continue;
      lines.push(JSON.stringify({ kind: "primitive", data: p }));
    }
    for (const r of transfer.relations) {
      if (!r.type_id.startsWith("recipe:")) continue;
      lines.push(JSON.stringify({ kind: "relation", data: r }));
    }
    return TEXT_ENCODER.encode(lines.join("\n") + (lines.length > 0 ? "\n" : ""));
  };
  ctx.registerExporter({ format: "recipe-jsonl", fn: recipeJsonlExporter });
}
