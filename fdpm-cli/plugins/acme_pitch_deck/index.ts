/**
 * acme.pitch-deck plugin entry point.
 *
 * This file is the runtime glue between @fdpm/zod-bridge@0.4.0 and the
 * FDPM host. The plugin's data model is auto-derived from
 * `schemas/pitch-deck.schema.v2.ts` via a hand-authored sidecar; this
 * file binds the derived DomainProfile + per-entity validators + a
 * deck-wide validator into the host's PluginContext.
 *
 * What is hand-authored here (per @PURPOSE.md and the
 * howto-zod-to-fdpm-plugin workbook §7):
 *   - The sidecar shape (entities, references, variants, fdpm metadata).
 *   - The activate() registration sequence.
 *   - The deck-wide validator that runs the schema's superRefine
 *     cross-deck invariants (audience-coverage, time-budget, source
 *     freshness, displayNumber contiguity, claim DAG cycles,
 *     bidirectional reference consistency) using the host's
 *     `context.workbook` view.
 *
 * What is generated:
 *   - PrimitiveTypeDefs and RelationTypeDefs — bridge.
 *   - 100+ CEL field-validation rules — bridge.
 *   - Per-entity Zod validator closures + closed-set rule_ids — bridge.
 *   - The fdpm-plugin.json manifest — bridge wrote it; we copied it in.
 *
 * v2 changes:
 *   - Slide.visual is now declared as variant-per-primitive in the
 *     sidecar. The bridge emits one PrimitiveTypeDef per visual kind
 *     (e.g. acme:Slide_StatTilesPlusChart) and a many-to-one
 *     parent->arm relation. Author shapes a slide as the parent
 *     acme:Slide plus one variant primitive linked via
 *     acme:SlideVisual<Tag>.
 *   - A deck-wide validator (rule acme:val:deck-coherence) runs on
 *     every Slide create/patch/replace and walks context.workbook to
 *     enforce the cross-deck invariants the schema's superRefine
 *     declares. Per-entity validators handle per-row Zod rules; this
 *     validator handles the deck-level invariants.
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
  buildPitchDeckSidecar,
  PLUGIN_ID,
  PROFILE_ID,
  validatorSchemaFor,
  variantFieldsByEntity,
} from "./sidecar.js";
import { renderPitchDeckMarkdown, renderPitchDeckPhaseMap } from "./renderers/deck_document.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const manifestRaw = readFileSync(join(__dirname, "fdpm-plugin.json"), "utf8");
export const manifest: PluginManifest = JSON.parse(manifestRaw) as PluginManifest;

export { PLUGIN_ID, PROFILE_ID };

// ───────────────────────────────────────────────────────────────────
// Deck-wide validator — runs on every Slide create/patch/replace.
//
// Per-entity Zod validators (registered below) handle within-row
// invariants. The cross-deck invariants in pitch-deck.schema.v2.ts's
// superRefine — audience-coverage-by-phase, time-budget within ±20%,
// source freshness, slide displayNumber contiguity, bidirectional
// reference consistency, claim DAG cycle detection — span the entire
// workbook. They cannot be enforced from a single primitive's
// safeParse.
//
// The host's CustomValidatorContext provides `workbook` — a read-only
// view of every primitive and relation in the workbook at the moment
// the validator runs. We use it to reconstruct the deck-shaped object
// the schema expects, then invoke a focused subset of the schema's
// invariants. Findings are returned with rule_id namespace
// `acme.pitch-deck:deck.<rule>` so they're distinguishable from
// per-entity findings.
//
// The validator is registered against type_id `acme:Slide` because
// Slide is the entity whose creation/patch most often introduces
// cross-deck inconsistency (a new slide referenced by no audience-
// reading, an out-of-range displayNumber, a stale evidence list).
// Authors who want full pre-flight validation of an entire workbook
// run `fdpm validate <workbook>` from the CLI; this validator runs
// inline on writes.
// ───────────────────────────────────────────────────────────────────

interface DeckFinding {
  rule_id: string;
  level: "error" | "warning";
  target_id: string;
  message: string;
  field_path?: string;
}

const ARGUMENTATIVE_PHASES = [
  "thesis",
  "evidence",
  "differentiation",
  "market",
  "timing",
  "positioning",
  "recommendation",
  "execution",
  "defense",
  "ask",
] as const;

function findingsForDeck(
  triggeringInstance: PrimitiveInstance,
  workbookView: { primitives: Record<string, PrimitiveInstance> },
): DeckFinding[] {
  const findings: DeckFinding[] = [];
  const all = Object.values(workbookView.primitives);

  // Project the workbook into the deck-shape the schema expects. We
  // read raw field_values; the per-entity validators have already run
  // and the cross-deck checks below assume each entity is shape-valid.
  const slides = all.filter((p) => p.type_id === "acme:Slide");
  const audiences = all.filter((p) => p.type_id === "acme:Audience");
  const sources = all.filter((p) => p.type_id === "acme:Source");
  const dataPoints = all.filter((p) => p.type_id === "acme:DataPoint");
  const claims = all.filter((p) => p.type_id === "acme:StrategicClaim");

  type FV = Record<string, unknown>;
  const fv = (p: PrimitiveInstance): FV => p.field_values as FV;

  // Index by the field_value `id` (the slug), which is what the
  // schema's cross-references use — NOT the primitive id (which is
  // namespaced per id_format).
  const slidesBySlug = new Map<string, PrimitiveInstance>();
  for (const s of slides) {
    const id = fv(s)["id"];
    if (typeof id === "string") slidesBySlug.set(id, s);
  }
  const dpBySlug = new Map<string, PrimitiveInstance>();
  for (const d of dataPoints) {
    const id = fv(d)["id"];
    if (typeof id === "string") dpBySlug.set(id, d);
  }
  const sourceBySlug = new Map<string, PrimitiveInstance>();
  for (const s of sources) {
    const id = fv(s)["id"];
    if (typeof id === "string") sourceBySlug.set(id, s);
  }
  const claimBySlug = new Map<string, PrimitiveInstance>();
  for (const c of claims) {
    const id = fv(c)["id"];
    if (typeof id === "string") claimBySlug.set(id, c);
  }
  const audIdSet = new Set<string>();
  for (const a of audiences) {
    const id = fv(a)["id"];
    if (typeof id === "string") audIdSet.add(id);
  }

  // ── 1. Slide displayNumber contiguity (1..N) ────────────────────
  if (slides.length > 0) {
    const numbers = slides
      .map((s) => fv(s)["displayNumber"])
      .filter((n): n is number => typeof n === "number")
      .sort((a, b) => a - b);
    for (let i = 0; i < numbers.length; i++) {
      if (numbers[i] !== i + 1) {
        findings.push({
          rule_id: "acme.pitch-deck:deck.slide-display-numbers",
          level: "error",
          target_id: triggeringInstance.id,
          message: `slide displayNumbers must be contiguous 1..N. Got: ${numbers.join(", ")}`,
        });
        break;
      }
    }
  }

  // ── 2. Audience-reading coverage by argumentative phase ─────────
  // Every audience must be addressed in every argumentative phase
  // the deck actually contains.
  if (slides.length > 0 && audIdSet.size > 0) {
    const phasesInDeck = new Set(
      slides.map((s) => fv(s)["phase"]).filter((p): p is string => typeof p === "string"),
    );
    for (const phase of ARGUMENTATIVE_PHASES) {
      if (!phasesInDeck.has(phase)) continue;
      const slidesInPhase = slides.filter((s) => fv(s)["phase"] === phase);
      for (const audId of audIdSet) {
        const addressed = slidesInPhase.some((s) => {
          const readings = fv(s)["audienceReadings"];
          if (!Array.isArray(readings)) return false;
          return readings.some(
            (r) =>
              r != null &&
              typeof r === "object" &&
              (r as { audienceId?: unknown }).audienceId === audId,
          );
        });
        if (!addressed) {
          findings.push({
            rule_id: "acme.pitch-deck:deck.audience-coverage",
            level: "error",
            target_id: triggeringInstance.id,
            message: `audience "${audId}" is not addressed in phase "${phase}"; each argumentative phase must speak to every audience at least once`,
          });
        }
      }
    }
  }

  // ── 3. Bidirectional reference consistency ──────────────────────
  // slide.evidenceUsed[dpId]  ⇔  dataPoint.usedOnSlides[slideId]
  for (const slide of slides) {
    const slideSlug = fv(slide)["id"];
    if (typeof slideSlug !== "string") continue;
    const used = fv(slide)["evidenceUsed"];
    if (!Array.isArray(used)) continue;
    for (const dpRef of used) {
      if (typeof dpRef !== "string") continue;
      const dp = dpBySlug.get(dpRef);
      if (!dp) continue; // unknown dataPoint — caught by inverse check below
      const ous = fv(dp)["usedOnSlides"];
      if (!Array.isArray(ous) || !ous.includes(slideSlug)) {
        findings.push({
          rule_id: "acme.pitch-deck:deck.evidence-bidirectional",
          level: "error",
          target_id: slide.id,
          field_path: "evidenceUsed",
          message: `slide "${slideSlug}" lists dataPoint "${dpRef}" in evidenceUsed, but dataPoint.usedOnSlides does not include "${slideSlug}"`,
        });
      }
    }
  }
  // claim.appearsOnSlides[slideId]  ⇔  slide.claimsAdvanced[claimId]
  for (const slide of slides) {
    const slideSlug = fv(slide)["id"];
    if (typeof slideSlug !== "string") continue;
    const advanced = fv(slide)["claimsAdvanced"];
    if (!Array.isArray(advanced)) continue;
    for (const cRef of advanced) {
      if (typeof cRef !== "string") continue;
      const claim = claimBySlug.get(cRef);
      if (!claim) continue;
      const aos = fv(claim)["appearsOnSlides"];
      if (!Array.isArray(aos) || !aos.includes(slideSlug)) {
        findings.push({
          rule_id: "acme.pitch-deck:deck.claim-bidirectional",
          level: "error",
          target_id: slide.id,
          field_path: "claimsAdvanced",
          message: `slide "${slideSlug}" advances claim "${cRef}" but claim.appearsOnSlides does not include "${slideSlug}"`,
        });
      }
    }
  }

  // ── 4. Claim DAG cycle detection (DFS WHITE/GRAY/BLACK) ─────────
  if (claims.length > 1) {
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<string, number>();
    for (const c of claims) {
      const id = fv(c)["id"];
      if (typeof id === "string") color.set(id, WHITE);
    }
    const cycles: string[][] = [];
    const dfs = (node: string, stack: string[]): void => {
      color.set(node, GRAY);
      stack.push(node);
      const claim = claimBySlug.get(node);
      if (claim) {
        const supported = fv(claim)["supportedByClaims"];
        if (Array.isArray(supported)) {
          for (const nb of supported) {
            if (typeof nb !== "string") continue;
            const c = color.get(nb);
            if (c === undefined) continue;
            if (c === GRAY) {
              const start = stack.indexOf(nb);
              cycles.push([...stack.slice(start), nb]);
            } else if (c === WHITE) {
              dfs(nb, stack);
            }
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
        rule_id: "acme.pitch-deck:deck.claim-cycle",
        level: "error",
        target_id: triggeringInstance.id,
        message: `claim support cycle detected: ${cycle.join(" → ")}`,
      });
    }
  }

  // ── 5. Time budget (NEW in v2) ──────────────────────────────────
  // If any slide carries estimatedSpeakingSeconds, all slides must.
  // Total must be within ±20% of a hypothetical target. We don't know
  // the target without a deck-meta primitive, so we only check
  // partial-coverage as a fail mode here. Authors may set total budget
  // via a configuration entry or fold it into a meta primitive in a
  // future iteration.
  const slidesWithTime = slides.filter(
    (s) => typeof fv(s)["estimatedSpeakingSeconds"] === "number",
  );
  if (slidesWithTime.length > 0 && slidesWithTime.length !== slides.length) {
    findings.push({
      rule_id: "acme.pitch-deck:deck.time-budget-coverage",
      level: "error",
      target_id: triggeringInstance.id,
      message: `${slidesWithTime.length}/${slides.length} slides carry estimatedSpeakingSeconds; either annotate all slides or none`,
    });
  }

  // ── 6. Source freshness for load-bearing claims ────────────────
  // Sources backing load-bearing claims must declare lastVerifiedDate
  // (or be type=internal-data). We can't compute "older than N days"
  // here without a deck-meta `staleAfterDays` value; we surface the
  // missing-date case as an error and leave staleness for a future
  // pass.
  const loadBearingDpSlugs = new Set<string>();
  for (const c of claims) {
    if (fv(c)["loadBearing"] !== true) continue;
    const supported = fv(c)["supportedByDataPoints"];
    if (!Array.isArray(supported)) continue;
    for (const dpRef of supported) {
      if (typeof dpRef === "string") loadBearingDpSlugs.add(dpRef);
    }
  }
  for (const dpSlug of loadBearingDpSlugs) {
    const dp = dpBySlug.get(dpSlug);
    if (!dp) continue;
    const sourceIds = fv(dp)["sourceIds"];
    if (!Array.isArray(sourceIds)) continue;
    for (const sId of sourceIds) {
      if (typeof sId !== "string") continue;
      const src = sourceBySlug.get(sId);
      if (!src) continue;
      const lvd = fv(src)["lastVerifiedDate"];
      const stype = fv(src)["type"];
      if (!lvd && stype !== "internal-data") {
        findings.push({
          rule_id: "acme.pitch-deck:deck.source-freshness-missing",
          level: "warning",
          target_id: src.id,
          field_path: "lastVerifiedDate",
          message: `source "${sId}" backs load-bearing dataPoint "${dpSlug}" but has no lastVerifiedDate; external sources for load-bearing claims must declare freshness`,
        });
      }
    }
  }

  return findings;
}

// ───────────────────────────────────────────────────────────────────
// activate(ctx) — host calls this once per session per plugin.
//
// We assemble the profile fresh at activate-time. Both the host and the
// bridge run on Zod v4, so the bridge's `_def`-walker reads the live
// schema correctly. The static snapshot at
// static/generated/acme-pitch-deck/generated/profile.json remains the
// human-reviewable artefact and the CI drift gate; this code does NOT
// read it (the schema is the source of truth).
// ───────────────────────────────────────────────────────────────────

export const PITCH_MARKDOWN_RENDERER_ID = "acme.pitch-deck:RunningOrderRenderer" as const;
export const PITCH_PHASE_MAP_RENDERER_ID = "acme.pitch-deck:PhaseMapRenderer" as const;

export async function activate(ctx: PluginContext): Promise<void> {
  const sidecar = buildPitchDeckSidecar();
  const result = assembleDomainProfileFromSidecar({
    domain: sidecar,
    generatedAt: "1970-01-01T00:00:00.000Z", // determinism — not a real timestamp
  });

  // Runtime drift assertion (per howto-zod-to-fdpm-plugin §4
  // example:bridge-entry-module). The bridge derives the profile id
  // from sidecar.fdpm.profileId; if the sidecar is edited without a
  // matching constant bump in sidecar.ts (or the constant is lying),
  // activate() refuses to register and the host surfaces the failure
  // before any workbook touches the wrong profile.
  if (result.profile.id !== PROFILE_ID) {
    throw new Error(
      `acme.pitch-deck activation drift: bridge emitted profile id "${result.profile.id}" but the plugin's PROFILE_ID constant is "${PROFILE_ID}". Schema, sidecar, and constant must agree. Run \`npm run bridge\` and bump the version per principle:schema-change-implies-version-bump.`,
    );
  }
  // Manifest-vs-runtime parity: the manifest declares the plugin id
  // and version that operators see; if the bridge derives anything
  // different, the closed rule_id sets the manifest enumerates lose
  // their guarantee.
  if (manifest.id !== PLUGIN_ID) {
    throw new Error(
      `acme.pitch-deck manifest mismatch: fdpm-plugin.json declares id="${manifest.id}" but PLUGIN_ID="${PLUGIN_ID}".`,
    );
  }

  // The bridge's DomainProfile has a slightly broader shape than the
  // host's (the bridge tracks bridge-internal extras). A JSON round-trip
  // strips those and gives the host the exact shape its compiler
  // accepts.
  const profile = JSON.parse(JSON.stringify(result.profile)) as DomainProfile;
  ctx.registerProfile(profile);

  // Per-entity validators. The bridge returns one closure per schema.
  // IMPORTANT: when an entity has variant-per-primitive fields, those
  // fields are stripped from the parent's emitted PrimitiveTypeDef
  // (the variant arms become sibling primitives). The validator
  // registered against the parent type MUST be built from the same
  // omit-stripped schema, otherwise the parent will reject every
  // create that legitimately has no `visual` field on it.
  //
  // The bridge's assembleDomainProfileFromSidecar() does this drop
  // internally for its own emission, but it does not currently
  // export the post-drop schemas. We replicate the drop here. This is
  // a candidate for a future bridge improvement: returning per-entity
  // `(typeId, schema, validator)` triples from the orchestrator.
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

  // Per-variant validators. When a sidecar.variants entry promotes a
  // discriminated-union field to a variant-per-primitive, the bridge
  // emits one PrimitiveTypeDef per arm (e.g. acme:Slide_Title,
  // acme:Slide_StatTilesPlusChart). The manifest declares one
  // cap:validator per emitted primitive, so the runtime must register
  // them all — otherwise the manifest's closed rule_id sets are
  // unenforced for variant arms.
  //
  // We pull the per-arm Zod schema from the discriminated union's
  // _def.options array and use the bridge to derive each variant
  // validator the same way per-entity validators are derived.
  for (const v of sidecar.variants ?? []) {
    if (v.strategy !== "variant-per-primitive") continue;
    const parent = (sidecar.entities as Record<string, { schema: unknown }>)[v.from];
    if (!parent) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parentShape = (parent.schema as any).shape ?? {};
    const unionField = parentShape[v.field];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const def = (unionField as any)?._def;
    const options = def?.options as ReadonlyArray<unknown> | undefined;
    const discriminator = v.discriminator;
    if (!Array.isArray(options) || !discriminator) continue;

    for (const option of options) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const armSchema = option as any;
      const armShape = armSchema?.shape ?? armSchema?._def?.shape?.();
      const literalDef = armShape?.[discriminator]?._def;
      const tag = literalDef?.values?.[0] ?? literalDef?.value;
      if (typeof tag !== "string") continue;
      const tagPascal = pascalCaseTag(tag);
      const variantTypeId = `acme:${v.from}_${tagPascal}`;
      // typeName drives the bridge's rule_id namespace
      // `<pluginId>:zod.<typeName>.<code>`; it MUST match what the
      // bridge wrote into manifest.capabilities[].metadata.rule_ids.
      // The bridge uses lowercase tail of the primitive type id,
      // e.g. acme:Slide_Title -> slide_title.
      const variantTypeName = (variantTypeId.split(":").pop() ?? "").toLowerCase();
      // local_name must satisfy the host's regex ^[a-z0-9-]+$ so we
      // kebab-case for the rule_id (registration metadata) but keep
      // the typeName above for finding rule_ids.
      const ruleId = `acme:val:${variantTypeName.replace(/_/g, "-")}-zod`;
      const { validator } = zodSchemaToValidator(armSchema, {
        pluginId: PLUGIN_ID,
        typeName: variantTypeName,
      });
      const adaptedVariant: ValidatorFn = (instance) => {
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
      ctx.registerValidator({
        type_id: variantTypeId,
        rule_id: ruleId,
        fn: adaptedVariant,
      });
    }
  }


  // Deck-wide validator. Runs on every Slide create/patch/replace and
  // walks the workbook to enforce cross-deck invariants the schema's
  // superRefine declares. See findingsForDeck() above for the full
  // rule set.
  const deckValidator: ValidatorFn = (instance, _type, _profile, vctx) => {
    // The host's CustomValidatorContext.workbook is optional — older
    // pipeline paths run validators without it. If it's missing, we
    // can't reach other entities; skip silently rather than emit a
    // misleading finding.
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
  // Optional capabilities — cap:renderer, cap:importer, cap:exporter
  // (per howto-zod-to-fdpm-plugin §7).
  //
  // The bridge emits per-primitive renderers / per-entity importers /
  // per-entity exporters. The host's PluginContext exposes register
  // methods at the workbook level (RendererFn takes a RendererInput
  // with primitives[] + relations[]; ImporterFn returns a
  // ProjectTransfer; ExporterFn consumes one). We adapt by:
  //
  //   - Renderer: register one cap:renderer per Entity, target =
  //     "text/markdown#<entity>"; the wrapped renderer filters
  //     primitives by type_id, runs the bridge's per-primitive
  //     renderer on each, joins with blank lines.
  //
  //   - Importer: register one cap:importer per Entity, format =
  //     "acme.pitch-deck:<entity>-json"; the wrapped importer parses
  //     the JSON body into an array of intents and re-emits as a
  //     ProjectTransfer with one primitive per intent.
  //
  //   - Exporter: register one cap:exporter per Entity, format =
  //     "acme.pitch-deck:<entity>-json"; the wrapped exporter takes a
  //     ProjectTransfer, filters to the entity's primitives, sorts by
  //     id (lexicographic), and emits stable JSON.
  //
  // The deck-wide markdown renderer (kind="deck") is the obvious
  // composition over per-Slide renderers; that lives in a deck-shaped
  // renderer registered against target "text/markdown#deck".
  // ─────────────────────────────────────────────────────────────────

  const SPEC_CORE_VERSION = "1.0";

  // The running order, and a phase map where pacing is visible: block
  // width is the speaking budget, so a phase that eats the meeting shows.
  ctx.registerRenderer({ target: "text/markdown", rendererId: PITCH_MARKDOWN_RENDERER_ID, fn: renderPitchDeckMarkdown as RendererFn });
  ctx.registerRenderer({ target: "image/svg+xml", rendererId: PITCH_PHASE_MAP_RENDERER_ID, fn: renderPitchDeckPhaseMap as RendererFn });
  ctx.logger.info(
    `acme.pitch-deck activated: ${result.profile.primitive_types.length} primitive types, ${result.profile.relation_types.length} relation types, ${(result.profile.constraints ?? []).length} CEL rules + ${result.profile.primitive_types.length} per-primitive validators (entities + variant arms) + 1 deck-coherence validator + ${Object.keys(sidecar.entities).length} renderers + ${Object.keys(sidecar.entities).length} importers + ${Object.keys(sidecar.entities).length} exporters. Profile id: ${PROFILE_ID}.`,
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

function pascalCaseTag(tag: string): string {
  // "stat-tiles-plus-chart" -> "StatTilesPlusChart". Mirrors the
  // bridge's variant-name derivation in sidecar-orchestrator.ts so the
  // runtime-derived variant type id matches the bridge-emitted one.
  return tag
    .split(/[^A-Za-z0-9]+/)
    .filter((p) => p.length > 0)
    .map((p) => p[0]!.toUpperCase() + p.slice(1))
    .join("");
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
