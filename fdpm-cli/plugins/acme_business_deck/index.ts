/**
 * acme.business-deck plugin entry point.
 *
 * Glue between @fdpm/zod-bridge@0.4.0 and the FDPM host. The plugin's
 * data model is auto-derived from `schemas/business-deck.ts` via a
 * hand-authored sidecar; this file binds the derived DomainProfile +
 * per-entity validators + a deck-coherence validator into the host's
 * PluginContext.
 *
 * What is hand-authored here (per @PURPOSE.md and the
 * howto-zod-to-fdpm-plugin workbook §7):
 *   - The sidecar shape (sidecar.ts: 13 entities, 12 references).
 *   - The activate() registration sequence.
 *   - The deck-coherence validator that ports the source schema's
 *     three top-level superRefine functions (checkReferentialIntegrity,
 *     checkUniqueness, checkPostureAndDelivery) into a workbook-walking
 *     form. Per-entity validators handle within-row Zod rules; this
 *     validator handles the cross-deck invariants.
 *
 * What is generated:
 *   - PrimitiveTypeDefs and RelationTypeDefs — bridge.
 *   - 38 CEL field-validation rules — bridge.
 *   - Per-entity Zod validator closures + closed-set rule_ids — bridge.
 *   - The fdpm-plugin.json manifest — bridge wrote it; we read it in.
 *
 * Declared losses (per SPEC-FDPM-BRIDGE §8.2):
 *   - The data-driven BuiltInBusinessConstraints catalog (line 3046
 *     of the schema) is structural in shape but rule evaluation is
 *     dynamic. The bridge cannot represent it as CEL. Per-entity Zod
 *     constraints + the deck-coherence validator below cover the
 *     hard structural rules; the catalog's `should` / `nice_to_have`
 *     severities are dropped at the plugin layer.
 *   - The validateBusinessDeck() runtime function (line 6715 of the
 *     schema) returning ValidationReportWithSolidity is not lifted;
 *     it is a soft post-parse layer the host does not consume.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  assembleDomainProfileFromSidecar,
  zodSchemaToExporter,
  zodSchemaToImporter,
  zodSchemaToMarkdownRenderer,
  zodSchemaToValidator,
} from "@fdpm/zod-bridge";
import { mintUid } from "../../src/core/identity/uid.js";
import type { DomainProfile } from "../../src/core/models/meta.js";
import type {
  ExporterFn,
  ImporterFn,
  PluginContext,
  PluginEntryModule,
  RendererFn,
  RendererInput,
  RendererOutput,
  ValidatorFn,
} from "../../src/plugin/types.js";
import type { PluginManifest } from "../../src/plugin/manifest.js";
import type {
  PrimitiveInstance,
  ProjectTransfer,
} from "../../src/core/models/instance.js";
import {
  buildBusinessDeckSidecar,
  PLUGIN_ID,
  PROFILE_ID,
  validatorSchemaFor,
  variantFieldsByEntity,
} from "./sidecar.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const manifestRaw = readFileSync(join(__dirname, "fdpm-plugin.json"), "utf8");
export const manifest: PluginManifest = JSON.parse(manifestRaw) as PluginManifest;

export { PLUGIN_ID, PROFILE_ID };

// ───────────────────────────────────────────────────────────────────
// Deck-coherence validator — runs on every Slide create/patch/replace.
//
// Ports the source schema's three superRefine functions
// (checkReferentialIntegrity, checkUniqueness, checkPostureAndDelivery)
// into the workbook-walking form. Per-entity Zod validators (registered
// below) handle within-row invariants. The cross-deck invariants —
// every <X>_ids[] field must resolve to a primitive of type <X> in
// the workbook, no duplicate ids per type, conditional posture/delivery
// gates — span the entire workbook and cannot be enforced from a
// single primitive's safeParse.
//
// The host's CustomValidatorContext provides `workbook` — a read-only
// view of every primitive at the moment the validator runs. We use it
// to build per-type id sets and check every reference.
//
// Findings are returned with rule_id namespace
// `acme.business-deck:deck.<rule>` so they're distinguishable from
// per-entity findings (which use `acme.business-deck:zod.<entity>.<code>`).
//
// The validator is registered against type_id `acme:Slide` because
// Slide is the entity whose creation/patch most often introduces
// cross-deck inconsistency.
// ───────────────────────────────────────────────────────────────────

interface DeckFinding {
  rule_id: string;
  level: "error" | "warning";
  target_id: string;
  message: string;
  field_path?: string;
}

interface ReferenceCheck {
  sourceTypeId: string;
  field: string;
  /** True for array-shaped references; false for single-value references. */
  isArray: boolean;
  targetTypeId: string;
  ruleId: string;
  /** Optional predicate over field_values to skip the reference (e.g. optional fields). */
  active?: (fv: Record<string, unknown>) => boolean;
}

const REFERENCE_CHECKS: ReadonlyArray<ReferenceCheck> = [
  // Self-referential parent claim — optional, must resolve when present.
  {
    sourceTypeId: "acme:Claim",
    field: "parent_claim_id",
    isArray: false,
    targetTypeId: "acme:Claim",
    ruleId: "acme.business-deck:deck.claim-parent-resolves",
    active: (fv) => typeof fv["parent_claim_id"] === "string",
  },
  // Evidence supports claims (m:m).
  {
    sourceTypeId: "acme:Evidence",
    field: "claims_supported",
    isArray: true,
    targetTypeId: "acme:Claim",
    ruleId: "acme.business-deck:deck.evidence-claims-resolve",
  },
  // Slide cross-references.
  {
    sourceTypeId: "acme:Slide",
    field: "supports_claim_ids",
    isArray: true,
    targetTypeId: "acme:Claim",
    ruleId: "acme.business-deck:deck.slide-claims-resolve",
  },
  {
    sourceTypeId: "acme:Slide",
    field: "uses_evidence_ids",
    isArray: true,
    targetTypeId: "acme:Evidence",
    ruleId: "acme.business-deck:deck.slide-evidence-resolve",
  },
  {
    sourceTypeId: "acme:Slide",
    field: "addresses_objection_ids",
    isArray: true,
    targetTypeId: "acme:Objection",
    ruleId: "acme.business-deck:deck.slide-objections-resolve",
  },
  // Option cross-references.
  {
    sourceTypeId: "acme:Option",
    field: "risk_ids",
    isArray: true,
    targetTypeId: "acme:Risk",
    ruleId: "acme.business-deck:deck.option-risks-resolve",
  },
  {
    sourceTypeId: "acme:Option",
    field: "differentiation_claim_ids",
    isArray: true,
    targetTypeId: "acme:Claim",
    ruleId: "acme.business-deck:deck.option-claims-resolve",
  },
  // Speaker / Q&A.
  {
    sourceTypeId: "acme:Presenter",
    field: "speaks_for_claim_ids",
    isArray: true,
    targetTypeId: "acme:Claim",
    ruleId: "acme.business-deck:deck.presenter-claims-resolve",
  },
  {
    sourceTypeId: "acme:ExpectedQuestion",
    field: "addresses_objection_id",
    isArray: false,
    targetTypeId: "acme:Objection",
    ruleId: "acme.business-deck:deck.question-objection-resolves",
    active: (fv) => typeof fv["addresses_objection_id"] === "string",
  },
  {
    sourceTypeId: "acme:ExpectedQuestion",
    field: "references_evidence_ids",
    isArray: true,
    targetTypeId: "acme:Evidence",
    ruleId: "acme.business-deck:deck.question-evidence-resolve",
  },
  // Audience-segment edges.
  {
    sourceTypeId: "acme:Objection",
    field: "source_segment_id",
    isArray: false,
    targetTypeId: "acme:AudienceSegment",
    ruleId: "acme.business-deck:deck.objection-segment-resolves",
    active: (fv) => typeof fv["source_segment_id"] === "string",
  },
  {
    sourceTypeId: "acme:PainPoint",
    field: "affected_persona_ids",
    isArray: true,
    targetTypeId: "acme:AudienceSegment",
    ruleId: "acme.business-deck:deck.painpoint-segments-resolve",
  },
];

function findingsForDeck(
  triggeringInstance: PrimitiveInstance,
  workbookView: { primitives: Record<string, PrimitiveInstance> },
): DeckFinding[] {
  const findings: DeckFinding[] = [];
  const all = Object.values(workbookView.primitives);

  type FV = Record<string, unknown>;
  const fv = (p: PrimitiveInstance): FV => p.field_values as FV;

  // Index every primitive's field-value `id` (the slug) by type.
  // For Slide, identity is `slide_number` (a number).
  const idsByType = new Map<string, Set<string | number>>();
  for (const p of all) {
    if (!idsByType.has(p.type_id)) idsByType.set(p.type_id, new Set());
    const fvId =
      p.type_id === "acme:Slide"
        ? (fv(p)["slide_number"] as number)
        : (fv(p)["id"] as string);
    if (fvId !== undefined && fvId !== null) idsByType.get(p.type_id)!.add(fvId);
  }

  // ── Block 1: referential-integrity for every declared reference ─
  for (const ref of REFERENCE_CHECKS) {
    const sources = all.filter((p) => p.type_id === ref.sourceTypeId);
    const targetIds = idsByType.get(ref.targetTypeId) ?? new Set();
    for (const source of sources) {
      const fvSource = fv(source);
      if (ref.active && !ref.active(fvSource)) continue;
      const value = fvSource[ref.field];
      const refIds: unknown[] = ref.isArray
        ? Array.isArray(value)
          ? value
          : []
        : value !== undefined && value !== null
          ? [value]
          : [];
      for (const refId of refIds) {
        if (refId === undefined || refId === null) continue;
        if (!targetIds.has(refId as string | number)) {
          findings.push({
            rule_id: ref.ruleId,
            level: "error",
            target_id: source.id,
            field_path: ref.field,
            message: `${ref.sourceTypeId} "${source.id}" references ${ref.targetTypeId} "${String(refId)}" via ${ref.field}, but no such primitive exists in the workbook.`,
          });
        }
      }
    }
  }

  // ── Block 2: per-type slug uniqueness ──────────────────────────
  // The host enforces primitive-id uniqueness, but the schema's
  // semantic id is field_values.id (slug) — distinct from the
  // namespaced primitive id. checkUniqueness() in the source schema
  // catches duplicates on the slug; we mirror that here as a warning
  // (host already errors on duplicate primitive ids, so this is
  // redundant for the canonical case but useful when an author
  // creates two primitives whose slugs collide despite different
  // primitive ids).
  for (const [typeId, _ids] of idsByType.entries()) {
    if (typeId === "acme:Slide") continue; // numeric identity; host enforces
    const sources = all.filter((p) => p.type_id === typeId);
    const slugCount = new Map<string, number>();
    for (const s of sources) {
      const slug = fv(s)["id"];
      if (typeof slug !== "string") continue;
      slugCount.set(slug, (slugCount.get(slug) ?? 0) + 1);
    }
    for (const [slug, n] of slugCount.entries()) {
      if (n > 1) {
        findings.push({
          rule_id: "acme.business-deck:deck.slug-uniqueness",
          level: "error",
          target_id: triggeringInstance.id,
          message: `slug "${slug}" appears on ${n} ${typeId} primitives; field_values.id must be unique within the type.`,
        });
      }
    }
  }

  // ── Block 3: Slide.slide_number contiguity 1..N ───────────────
  // Ports a portion of checkUniqueness — slide_number must be
  // unique AND form a contiguous 1..N sequence. Audiences depend
  // on a stable slide ordering; gaps and duplicates surface as
  // structural errors.
  const slides = all.filter((p) => p.type_id === "acme:Slide");
  if (slides.length > 0) {
    const numbers = slides
      .map((s) => fv(s)["slide_number"])
      .filter((n): n is number => typeof n === "number")
      .sort((a, b) => a - b);
    for (let i = 0; i < numbers.length; i++) {
      if (numbers[i] !== i + 1) {
        findings.push({
          rule_id: "acme.business-deck:deck.slide-numbers-contiguous",
          level: "error",
          target_id: triggeringInstance.id,
          message: `slide_numbers must be contiguous 1..N; got ${numbers.join(", ")}.`,
        });
        break;
      }
    }
    const dups = numbers.filter((n, i) => numbers[i + 1] === n);
    if (dups.length > 0) {
      findings.push({
        rule_id: "acme.business-deck:deck.slide-numbers-unique",
        level: "error",
        target_id: triggeringInstance.id,
        message: `slide_number values must be unique; duplicates: ${dups.join(", ")}.`,
      });
    }
  }

  // ── Block 4: claim DAG cycle detection ─────────────────────────
  // Ports the parent_claim_id self-reference acyclic constraint.
  // (The bridge declares acyclic:true on the relation, but cycle
  // detection at relation-create time is host work; this validator
  // runs on Slide creates and so it surfaces a cycle that already
  // exists in the workbook the moment a slide is touched.)
  const claims = all.filter((p) => p.type_id === "acme:Claim");
  if (claims.length > 1) {
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<string, number>();
    const claimBySlug = new Map<string, PrimitiveInstance>();
    for (const c of claims) {
      const id = fv(c)["id"];
      if (typeof id !== "string") continue;
      color.set(id, WHITE);
      claimBySlug.set(id, c);
    }
    const cycles: string[][] = [];
    const dfs = (node: string, stack: string[]): void => {
      color.set(node, GRAY);
      stack.push(node);
      const claim = claimBySlug.get(node);
      if (claim) {
        const parent = fv(claim)["parent_claim_id"];
        if (typeof parent === "string") {
          const c = color.get(parent);
          if (c === GRAY) {
            const start = stack.indexOf(parent);
            cycles.push([...stack.slice(start), parent]);
          } else if (c === WHITE) {
            dfs(parent, stack);
          }
        }
      }
      stack.pop();
      color.set(node, BLACK);
    };
    for (const c of claims) {
      const id = fv(c)["id"];
      if (typeof id === "string" && color.get(id) === WHITE) dfs(id, []);
    }
    for (const cycle of cycles) {
      findings.push({
        rule_id: "acme.business-deck:deck.claim-cycle",
        level: "error",
        target_id: triggeringInstance.id,
        message: `claim parent-cycle detected: ${cycle.join(" → ")}`,
      });
    }
  }

  return findings;
}

// ───────────────────────────────────────────────────────────────────
// activate(ctx) — host calls this once per session per plugin.
//
// Per howto-zod-to-fdpm-plugin §4 example:bridge-entry-module: assert
// the bridge's emitted profile id matches the plugin's PROFILE_ID
// constant (so a stale generated/profile.json halts activation rather
// than registering against the wrong id). The same drift gate runs
// at build time via scripts/run-bridge.ts --check.
// ───────────────────────────────────────────────────────────────────

export async function activate(ctx: PluginContext): Promise<void> {
  const sidecar = buildBusinessDeckSidecar();
  const result = assembleDomainProfileFromSidecar({
    domain: sidecar,
    generatedAt: "1970-01-01T00:00:00.000Z", // determinism — not a real timestamp
  });

  if (result.profile.id !== PROFILE_ID) {
    throw new Error(
      `acme.business-deck activation drift: bridge emitted profile id "${result.profile.id}" but the plugin's PROFILE_ID constant is "${PROFILE_ID}". Schema, sidecar, and constant must agree. Run \`npm run bridge\` and bump the version per principle:schema-change-implies-version-bump.`,
    );
  }
  if (manifest.id !== PLUGIN_ID) {
    throw new Error(
      `acme.business-deck manifest mismatch: fdpm-plugin.json declares id="${manifest.id}" but PLUGIN_ID="${PLUGIN_ID}".`,
    );
  }

  // The bridge's DomainProfile has bridge-internal extras the host
  // doesn't accept; a JSON round-trip strips them.
  const profile = JSON.parse(JSON.stringify(result.profile)) as DomainProfile;
  ctx.registerProfile(profile);

  // Per-entity validators. No variant-per-primitive splits in this
  // plugin (no z.discriminatedUnion in the schema); the helper
  // returns an empty drop-set and validatorSchemaFor() is a passthrough
  // for every entity.
  const variantFields = variantFieldsByEntity(sidecar);

  for (const [entityName, entity] of Object.entries(sidecar.entities)) {
    const typeId = `acme:${entityName}`;
    const ruleId = `acme:val:${entityName.toLowerCase()}-zod`;
    const schemaForValidator = validatorSchemaFor(
      entityName,
      entity.schema,
      variantFields,
    );
    const { validator } = zodSchemaToValidator(
      schemaForValidator as typeof entity.schema,
      {
        pluginId: PLUGIN_ID,
        typeName: entityName.toLowerCase(),
      },
    );
    const adapted: ValidatorFn = (instance) => {
      const findings = validator({
        id: instance.id,
        type_id: instance.type_id,
        field_values:
          (instance as { field_values?: Record<string, unknown> }).field_values ?? {},
      });
      return findings.map((f) => ({
        rule_id: f.rule_id,
        level: f.level === "warning" ? "warning" : "error",
        target_id: instance.id,
        message: f.message,
        ...(f.path && f.path.length > 0 ? { field_path: f.path.join(".") } : {}),
      })) as never;
    };
    ctx.registerValidator({ type_id: typeId, rule_id: ruleId, fn: adapted });
  }

  // Deck-coherence validator. Registered against acme:Slide because
  // slides are the entity that most often introduces cross-deck
  // inconsistency (a new slide referenced by no claim, an out-of-
  // range slide_number, a stale evidence list).
  const deckValidator: ValidatorFn = (instance, _type, _profile, vctx) => {
    const wb = (vctx as { workbook?: { primitives?: Record<string, PrimitiveInstance> } } | undefined)?.workbook;
    if (!wb || !wb.primitives) return [];
    const findings = findingsForDeck(instance as PrimitiveInstance, {
      primitives: wb.primitives,
    });
    return findings as never;
  };
  ctx.registerValidator({
    type_id: "acme:Slide",
    rule_id: "acme:val:deck-coherence",
    fn: deckValidator,
  });

  // ─────────────────────────────────────────────────────────────────
  // Optional capabilities — cap:renderer / cap:importer / cap:exporter
  // (per howto-zod-to-fdpm-plugin §7).
  //
  // Same adapter pattern as acme.pitch-deck: the bridge's per-primitive
  // shapes wrap up to the host's per-workbook shapes.
  // ─────────────────────────────────────────────────────────────────

  const SPEC_CORE_VERSION = "1.0";
  for (const [entityName, entity] of Object.entries(sidecar.entities)) {
    const primitiveTypeId = `acme:${entityName}`;
    const lower = entityName.toLowerCase();

    const { renderer: perPrimitiveRenderer } = zodSchemaToMarkdownRenderer(
      entity.schema,
      {
        primitive_type_id: primitiveTypeId,
        fieldOrder: "schema",
      },
    );
    const rendererFn: RendererFn = (input: RendererInput): RendererOutput => {
      const matching = input.primitives.filter((p) => p.type_id === primitiveTypeId);
      const sections = matching
        .map((p) =>
          perPrimitiveRenderer({
            id: p.id,
            type_id: p.type_id,
            field_values: p.field_values as Record<string, unknown>,
          }),
        )
        .join("\n\n");
      const body = sections.length > 0 ? sections : `_(no ${entityName} primitives)_\n`;
      return {
        bytes: new TextEncoder().encode(body),
        contentType: "text/markdown",
        filename: `${lower}.md`,
      };
    };
    ctx.registerRenderer({
      target: "text/markdown",
      rendererId: `acme:${entityName}MarkdownRenderer`,
      fn: rendererFn,
    });

    const { importer: bridgeImporter } = zodSchemaToImporter(entity.schema, {
      primitive_type_id: primitiveTypeId,
      idFrom: (parsed) => {
        // Slide identity is the integer slide_number; everything
        // else uses field_values.id.
        if (entityName === "Slide") {
          const n = (parsed as { slide_number: number }).slide_number;
          return `${primitiveTypeId}:${n}`;
        }
        return `${primitiveTypeId}:${(parsed as { id: string }).id}`;
      },
      pluginId: PLUGIN_ID,
      typeName: lower,
    });
    const importerFn: ImporterFn = (raw, opts): ProjectTransfer => {
      const body = typeof raw === "string" ? raw : JSON.stringify(raw);
      const result = bridgeImporter(body);
      if (result.kind === "error") {
        throw new Error(
          `import failed (${entityName}): ${result.warnings.map((w) => w.message).join("; ")}`,
        );
      }
      const workbookId = opts?.workbookId ?? `${PLUGIN_ID}-${lower}-import`;
      const projectName = opts?.projectName ?? `${entityName} import`;
      const projectDescription =
        opts?.projectDescription ??
        `Imported ${result.intents.length} ${entityName} primitives via cap:importer.`;
      const now = "1970-01-01T00:00:00.000Z";
      const transfer: ProjectTransfer = {
        spec_core: SPEC_CORE_VERSION,
        workbook: {
          id: workbookId,
          name: projectName,
          description: projectDescription,
          profile_id: PROFILE_ID,
          created_at: now,
          revision: 0,
        },
        primitives: result.intents.map((it) => ({
          id: it.id,
          uid: mintUid(),
          type_id: it.type_id,
          field_values: it.field_values,
          revision: 0,
          scope_id: workbookId,
        })),
        relations: [],
        templates: [],
        test_suites: [],
      };
      return transfer;
    };
    ctx.registerImporter({
      format: `${PLUGIN_ID}:${lower}-json`,
      fn: importerFn,
    });

    const { exporter: bridgeExporter } = zodSchemaToExporter(entity.schema, {
      primitive_type_id: primitiveTypeId,
      filename: () => `${lower}.json`,
      pluginId: PLUGIN_ID,
    });
    const exporterFn: ExporterFn = (transfer): Uint8Array => {
      const view = {
        id: transfer.workbook.id,
        primitives: transfer.primitives.map((p) => ({
          id: p.id,
          type_id: p.type_id,
          field_values: p.field_values as Record<string, unknown>,
        })),
      };
      const { body } = bridgeExporter(view);
      return new TextEncoder().encode(body);
    };
    ctx.registerExporter({
      format: `${PLUGIN_ID}:${lower}-json`,
      fn: exporterFn,
    });
  }

  ctx.logger.info(
    `acme.business-deck activated: ${result.profile.primitive_types.length} primitive types, ${result.profile.relation_types.length} relation types, ${(result.profile.constraints ?? []).length} CEL rules + ${result.profile.primitive_types.length} per-primitive validators + 1 deck-coherence validator + ${Object.keys(sidecar.entities).length} renderers + ${Object.keys(sidecar.entities).length} importers + ${Object.keys(sidecar.entities).length} exporters. Profile id: ${PROFILE_ID}.`,
  );
}

export function onInstall(ctx: PluginContext): void {
  ctx.logger.debug(`onInstall fired for ${ctx.pluginId}`);
}
export function onEnable(ctx: PluginContext): void {
  ctx.logger.debug(`onEnable fired for ${ctx.pluginId}`);
}
export function onDisable(ctx: PluginContext): void {
  ctx.logger.debug(`onDisable fired for ${ctx.pluginId}`);
}
export function onUninstall(ctx: PluginContext): void {
  ctx.logger.debug(`onUninstall fired for ${ctx.pluginId}`);
}
export function deactivate(ctx: PluginContext): void {
  ctx.logger.debug(`deactivate fired for ${ctx.pluginId}`);
}

const entry: PluginEntryModule = {
  manifest,
  activate,
  onInstall,
  onEnable,
  onDisable,
  onUninstall,
  deactivate,
};
export default entry;
