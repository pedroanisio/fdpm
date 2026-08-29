/**
 * StyleDefinition 3.1.0 — normalised for FDPM.
 *
 * PROVENANCE. Derived from `_ingest_bin/style-schema.ts` v3.1.0 (3717
 * lines of type-level TypeScript). This is a *normalisation*, not a copy:
 * the source is plain `interface` / `type` declarations, which are erased
 * at runtime and therefore invisible to @fdpm/zod-bridge. Five
 * transformations are applied, each forced by a checkable host or bridge
 * rule. Every one is declared in ../sidecar.ts `declaredLoss`.
 *
 *  1. TYPE LAYER → ZOD. The source's branded types (HexColor, Ratio,
 *     Length, StyleId, RuleId, …) and their twelve smart constructors are
 *     compile-time only; the source says so itself (PIPELINE NOTE,
 *     style-schema.ts:96-107). Each brand becomes a Zod schema carrying
 *     the same regex or numeric bound, read from CONSTRAINTS below, which
 *     is a verbatim port of the source's CONSTRAINTS manifest.
 *
 *  2. FIELD NAMES. `DomainProfile.FieldDef.name` must match
 *     `^[a-z][a-z0-9_]*$` (src/core/models/meta.ts). The source is
 *     camelCase throughout, so every field is snake_cased. The mapping is
 *     mechanical and reversible.
 *
 *  3. UNIONS FLATTENED ON THEIR DISCRIMINANT. The source carries 47
 *     discriminated unions. A field-level union reaches the host as an
 *     opaque `format: "json-union"` string
 *     (packages/zod-bridge/src/field-mapping.ts:66-77) — untyped,
 *     unqueryable storage. Each union is therefore flattened to its
 *     `kind` discriminant plus the arms' fields made optional, and a
 *     `superRefine` re-imposes the arm discipline: the fields of the
 *     selected arm are required, every other arm's fields are rejected.
 *     Nothing invalid is stored; the *storage shape* is wider than the
 *     source type, which is the declared soundness loss.
 *
 *  4. RECORDS → KEYED ENTRY LISTS. `z.record(K, V)` reaches the host as
 *     an opaque `format: "json-record"` string (field-mapping.ts:187-192).
 *     Every `Record` / `Partial<Record>` in the source token layer becomes
 *     an array of entry structs with a key field, and key uniqueness is
 *     enforced by `superRefine`. A Record and a key-unique entry list are
 *     isomorphic, so this is lossless.
 *
 *  5. CROSS-ELEMENT REFERENCES → RELATIONS. `identity.influencedStyles`,
 *     `identity.parentMovement`, `identity.negatedMovements`,
 *     `Rule.exemplars`, `ComplianceCheck.testsRule` and the three
 *     `references` buckets are NOT fields here. In the source they are
 *     branded ids resolved against a closed-world StyleRegistry; in FDPM
 *     they are relations, declared in ../sidecar.ts and enforced by the
 *     host's relation pipeline, which rejects a relation whose endpoint
 *     does not exist (src/core/validation/pipeline.ts:682-690). Keeping
 *     them out of the entity schemas is what makes the registry's
 *     closed-world rule (source Rule 13) a host invariant rather than a
 *     prose promise.
 *
 * WHAT IS NOT HERE. `RenderedStyle` and `CssArtifacts` are derived
 * artefacts behind a content hash — the source keeps them out of
 * StyleDefinition for exactly the reason FDPM keeps them out of a
 * profile: they are a renderer's output, not stored truth. `SCHEMA_SCOPE`,
 * `SCHEMA_CONVENTIONS`, `SCHEMA_CHANGELOG` and `GRAPH_TOPOLOGY` are
 * documentation manifests, carried to ../sidecar.ts as profile metadata
 * and relation topology rather than as fields.
 *
 * The cross-field invariants the source implements in
 * `validateStyleDefinition()` / `validateStyleRegistry()` (991 lines) are
 * split by scope: those confined to one entity live in that entity's
 * `superRefine` here; those spanning entities live in ../invariants.ts.
 */

import { z } from "zod";

/** Source schema version this transcription realises. */
export const STYLE_SCHEMA_VERSION = "3.1.0" as const;

/** Major the profile accepts; a document from another major is rejected. */
export const SUPPORTED_SCHEMA_MAJOR = 3 as const;

// ── Regex patterns ─────────────────────────────────────────────────────
//
// The source imports HEX_COLOR_REGEX and SEMVER_REGEX from
// `../shared/primitives`, a module that does not exist in this repository
// (the ingest dropped it; `tsc` fails on that import alone). Both patterns
// are inlined here so the plugin has no dangling dependency. The remaining
// patterns are verbatim from style-schema.ts:288-296.

/** 3-, 4-, 6- or 8-digit hex with a leading `#`. */
export const HEX_COLOR_REGEX = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
/** Semantic version, `major.minor.patch`. */
export const SEMVER_REGEX = /^\d+\.\d+\.\d+$/;
export const STYLE_ID_REGEX = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
export const STYLE_CODE_REGEX = /^[A-Z][A-Z0-9]{1,11}$/;
export const RULE_ID_REGEX = /^[A-Z][A-Z0-9]*-[A-Z]+-P?\d{1,3}$/;
export const CHECK_ID_REGEX = /^CC-[A-Z][A-Z0-9]*-\d{1,3}$/;
export const ISO_DATE_TIME_UTC_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
export const SHA256_HEX_REGEX = /^[0-9a-f]{64}$/;
export const LOCALE_TAG_REGEX = /^[a-z]{2,3}(-[A-Z]{2})?$/;
export const CSS_CUBIC_BEZIER_REGEX =
  /^cubic-bezier\(\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*\)$/;
/** MovementId and ReferenceId share the StyleId slug shape in the source. */
export const MOVEMENT_ID_REGEX = STYLE_ID_REGEX;
export const REFERENCE_ID_REGEX = STYLE_ID_REGEX;

/**
 * Numeric and structural bounds — a verbatim port of the source's
 * CONSTRAINTS manifest (style-schema.ts:298-356). Every bound appears
 * once, here, and both the Zod schemas and ../invariants.ts read it from
 * this object. Widening `lineHeight` or `letterSpacingEm` is an editorial
 * decision the source explicitly permits; `wcagContrastMinima` are W3C
 * normative values and MUST NOT be widened.
 */
export const CONSTRAINTS = {
  lineHeight: { min: 0.8, max: 3.0, unit: "ratio-of-font-size" },
  letterSpacingEm: { min: -0.2, max: 2.0, unit: "em" },
  promptFragment: { maxCodePoints: 1000 },
  diagonalAngleDegrees: { minExclusive: -90, maxExclusive: 90, excludesZero: true },
  styleCode: { minLength: 2, maxLength: 12 },
  idNumericSuffix: { min: 1, max: 999 },
  derivationToleranceRatio: 1e-6,
  /**
   * WCAG 2.x contrast minima. Sources: SC 1.4.3 Contrast (Minimum, AA),
   * SC 1.4.6 Contrast (Enhanced, AAA), SC 1.4.11 Non-text Contrast
   * (AA, WCAG >= 2.1). Normative — do not widen.
   */
  wcagContrastMinima: {
    aa: { "normal-text": 4.5, "large-text": 3.0, "ui-component": 3.0 },
    aaa: { "normal-text": 7.0, "large-text": 4.5, "ui-component": 3.0 },
  },
} as const;

/**
 * Section letter each grammar section contributes to its rule ids
 * (style-schema.ts:357-368). `BAU-L-P01` is prohibition 1 of the line
 * section of the style whose code is BAU.
 */
export const RULE_SECTION_CODES = {
  line: "L",
  color: "C",
  form: "F",
  space: "SP",
  surface: "SF",
  typography: "T",
  composition: "CP",
  contrast: "CT",
  iconography: "I",
  motion: "M",
} as const;

export type GrammarSection = keyof typeof RULE_SECTION_CODES;
export const GRAMMAR_SECTIONS = Object.keys(RULE_SECTION_CODES) as GrammarSection[];

// ── Scalar carriers (source brands 1:1) ────────────────────────────────

export const StyleId = z
  .string()
  .regex(STYLE_ID_REGEX, "StyleId must be a lowercase hyphen slug")
  .describe("Machine-readable style identifier. Immutable once published.");

export const MovementId = z
  .string()
  .regex(MOVEMENT_ID_REGEX, "MovementId must be a lowercase hyphen slug")
  .describe("Machine-readable movement identifier. Immutable once published.");

export const ReferenceId = z
  .string()
  .regex(REFERENCE_ID_REGEX, "ReferenceId must be a lowercase hyphen slug")
  .describe("Machine-readable canonical-reference identifier. Immutable.");

export const StyleCode = z
  .string()
  .regex(STYLE_CODE_REGEX, "StyleCode must be 2-12 uppercase alphanumerics starting with a letter")
  .describe("Uppercase namespace that prefixes every RuleId and CheckId of the style.");

export const RuleId = z
  .string()
  .regex(RULE_ID_REGEX, "RuleId must be <CODE>-<SECTION>-<n> or <CODE>-<SECTION>-P<n>")
  .describe("Rule identifier, namespaced by style code and grammar section.");

export const CheckId = z
  .string()
  .regex(CHECK_ID_REGEX, "CheckId must be CC-<CODE>-<n>")
  .describe("Compliance-check identifier, namespaced by style code.");

export const HexColor = z
  .string()
  .regex(HEX_COLOR_REGEX, "HexColor must be #RGB, #RGBA, #RRGGBB or #RRGGBBAA");

export const SemVer = z.string().regex(SEMVER_REGEX, "must be major.minor.patch");

export const LocaleTag = z
  .string()
  .regex(LOCALE_TAG_REGEX, "LocaleTag must be a 2-3 letter language, optionally -REGION");

export const IsoDateTimeUtc = z
  .string()
  .regex(ISO_DATE_TIME_UTC_REGEX, "must be an ISO-8601 UTC instant, e.g. 2026-08-28T12:00:00Z");

/** [0, 1] inclusive. */
export const Ratio = z.number().min(0).max(1);
/** Abstract length in base units; non-negative and finite. */
export const Length = z.number().min(0).finite();
/** CSS pixels; non-negative and finite. */
export const Px = z.number().min(0).finite();
export const LineHeight = z.number().min(CONSTRAINTS.lineHeight.min).max(CONSTRAINTS.lineHeight.max);
export const Em = z
  .number()
  .min(CONSTRAINTS.letterSpacingEm.min)
  .max(CONSTRAINTS.letterSpacingEm.max);
export const PositiveInteger = z.number().int().min(1);
/** Gregorian year; the source imposes no bound beyond integrality. */
export const Year = z.number().int();
export const NonBlank = z.string().min(1).refine((s) => s.trim().length > 0, "must not be blank");

// ── Vocabulary (values verbatim from the source) ───────────────────────

export const MediumFamily = z.enum([
  "intaglio",
  "relief",
  "planographic",
  "stencil",
  "direct-application",
  "photographic",
  "animation-cel",
  "digital",
  "fabrication",
  "architecture",
  "installation",
]);

export const OrnamentStance = z.enum([
  "prohibited",
  "structural-only",
  "geometric",
  "celebratory",
  "subversive",
  "organic",
  "arbitrary",
]);

export const MachineAttitude = z.enum([
  "collaborative",
  "subservient",
  "aestheticized",
  "revolutionary",
  "confrontational",
  "aspirational",
  "irrelevant",
]);

export const FormFunctionRelation = z.enum([
  "form-follows-function",
  "form-is-function",
  "form-over-function",
  "form-against-function",
  "form-independent",
]);

export const HumanRelation = z.enum([
  "body-conforming",
  "body-indifferent",
  "body-confronting",
  "body-aspirational",
]);

export const RuleWeight = z.enum(["defining", "strong", "advisory"]);
export const RuleKind = z.enum(["requires", "forbids"]);

export const StrokeRole = z.enum([
  "contour",
  "internal-detail",
  "hatching",
  "structural",
  "speed-line",
  "leader",
]);

export const LineQuality = z.enum(["mechanical", "gestural", "brush", "scratchy", "clean"]);
export const StrokeWeightKind = z.enum(["uniform", "calligraphic", "expressive"]);
export const LineGrammarKind = z.enum(["lines", "no-lines"]);
export const ContourHierarchy = z.enum(["uniform", "hierarchical"]);

export const ColorRole = z.enum(["primary", "secondary", "accent", "neutral", "background"]);
export const PrintingOrigin = z.enum([
  "cmyk-process",
  "pantone",
  "ral",
  "traditional-pigment",
  "screen-rgb",
]);
export const ApplicationMethod = z.enum([
  "flat",
  "tonal",
  "halftone",
  "screentone",
  "atmospheric",
  "local-color",
  "divided-brushwork",
]);
export const ColorRelationship = z.enum([
  "complementary",
  "analogous",
  "monochromatic",
  "triadic",
  "achromatic",
  "restricted-primary",
  "arbitrary",
]);
export const LightSource = z.enum(["cast", "ambient-occlusion", "specular"]);
export const ShadowTreatment = z.enum([
  "spot-black",
  "hard-edge",
  "soft-gradient",
  "hatched",
  "screentone",
]);
export const LightingKind = z.enum(["none", "implied", "rendered", "full-pbr"]);
export const GradientPolicy = z.enum(["forbidden", "permitted", "motif-only"]);
export const PaletteLimitKind = z.enum(["unlimited", "capped"]);

export const FormPrimitive = z.enum([
  "circle",
  "square",
  "rectangle",
  "triangle",
  "ellipse",
  "biomorphic",
  "freeform",
  "polygon",
  "tubular",
]);
export const ProportionSystem = z.enum([
  "golden-ratio",
  "modular-grid",
  "heroic-anatomy",
  "cartoon-anatomy",
  "skeleton-less",
  "photographic",
  "geometric-reduction",
  "arbitrary",
]);
export const Symmetry = z.enum([
  "bilateral-dominant",
  "asymmetric-dominant",
  "rotational",
  "no-preference",
]);
export const EdgeTreatment = z.enum(["hard", "soft", "variable", "absent"]);
export const StructuralExposure = z.enum([
  "maximally-exposed",
  "partially-exposed",
  "concealed",
]);

export const PerspectiveSystem = z.enum([
  "single-point",
  "two-point",
  "three-point",
  "isometric",
  "flat",
  "forced-perspective",
  "cinematic",
  "inconsistent",
  "absent",
]);
export const DepthEncodingMethod = z.enum([
  "size-diminution",
  "overlap",
  "atmospheric",
  "line-weight",
]);
export const DepthEncodingKind = z.enum(["none", "encoded"]);
export const FrameBehavior = z.enum(["respected", "punctured", "dissolved", "arbitrary"]);

export const RenderingMethod = z.enum([
  "flat-fill",
  "painted-light",
  "cross-hatching",
  "airbrushed",
  "screentone",
  "ink-wash",
  "digital-flat",
  "photographic",
]);
export const MaterialHonesty = z.enum(["required", "encouraged", "irrelevant", "subverted"]);
export const Texture = z.enum(["smooth", "grain", "mechanical", "imperfect", "absent"]);

export const TYPE_ROLES = ["heading", "body", "caption", "display", "monospace"] as const;
export const TypeRole = z.enum(TYPE_ROLES);

export const TypeClassification = z.enum([
  "latin-geometric-sans",
  "latin-grotesque-sans",
  "latin-humanist-sans",
  "latin-slab-serif",
  "latin-transitional-serif",
  "latin-old-style-serif",
  "latin-display-decorative",
  "latin-blackletter",
  "latin-handwritten",
  "latin-comic-lettering",
  "arabic-kufic",
  "arabic-naskh",
  "arabic-thuluth",
  "arabic-diwani",
  "arabic-ruqah",
  "devanagari-display",
  "devanagari-body",
  "cjk-seal",
  "cjk-clerical",
  "cjk-regular",
  "cjk-semi-cursive",
  "cjk-cursive",
  "cjk-sans",
  "cjk-serif",
  "monospace",
]);

export const Casing = z.enum([
  "required-uppercase",
  "required-lowercase",
  "sentence-case",
  "free",
]);
export const TypeImageRelation = z.enum([
  "integrated",
  "separate",
  "subordinate",
  "dominant",
  "absent",
]);
export const LetterSpacing = z.enum(["tracked-wide", "normal", "tight", "arbitrary"]);
export const BaselineGridKind = z.enum(["none", "grid"]);

export const HierarchyMethod = z.enum([
  "size",
  "weight",
  "color",
  "position",
  "isolation",
  "disruption",
]);
export const NegativeSpace = z.enum(["generous", "compressed", "functional", "arbitrary"]);
export const LayoutKind = z.enum([
  "modular-grid",
  "panel-grid",
  "axial",
  "radial",
  "diagonal",
  "free",
  "hierarchical",
]);
export const LayoutAxis = z.enum(["horizontal", "vertical"]);

export const TonalRange = z.enum(["full", "high-key", "low-key", "compressed", "bimodal"]);
export const ContrastRole = z.enum(["volume", "emphasis", "mood", "information"]);

export const MotifFrequency = z.enum(["ubiquitous", "frequent", "occasional"]);
export const FigureTreatment = z.enum([
  "idealized",
  "caricatured",
  "abstracted",
  "realistic",
  "absent",
  "symbolic",
  "atmospherically-dissolved",
]);
export const SubgenreDominance = z.enum(["primary", "minority"]);

export const MOTION_CHARACTERS = [
  "mechanical",
  "organic",
  "anticipatory",
  "snappy",
  "elastic",
  "viscous",
] as const;
export const MotionCharacter = z.enum(MOTION_CHARACTERS);
export const MotionGrammarKind = z.enum(["static", "animated"]);

export const CSS_TIMING_KEYWORDS = [
  "linear",
  "ease",
  "ease-in",
  "ease-out",
  "ease-in-out",
] as const;

export const TokenSectionKind = z.enum(["omitted", "rendered"]);
export const StrokeAlignment = z.enum(["inside", "center", "outside"]);
export const WcagVersion = z.enum(["2.0", "2.1", "2.2"]);
export const WcagConformanceLevel = z.enum(["aa", "aaa"]);
export const WcagContrastUsage = z.enum(["normal-text", "large-text", "ui-component"]);
export const AccessibilityKind = z.enum(["omitted", "wcag"]);
export const ComplianceCheckKind = z.enum(["binary", "threshold", "qualitative"]);
export const ThresholdOperator = z.enum(["<", "<=", "=", ">=", ">"]);
export const PeriodKind = z.enum(["open", "closed"]);
export const OriginMediumKind = z.enum(["single", "mixed"]);
export const ReferenceRole = z.enum(["primary", "secondary", "counter-example"]);

/** Abstract typographic weight, 1..9 (source WeightStep). */
export const WeightStep = z.number().int().min(1).max(9);
/** Steps above `min`; `min + span <= 9` is checked by the validator. */
export const WeightSpan = z.number().int().min(0).max(8);
/** OpenType / CSS font-weight axis. */
export const OpenTypeWeight = z
  .number()
  .int()
  .refine((n) => n % 100 === 0 && n >= 100 && n <= 900, "must be one of 100..900 in steps of 100");

/**
 * CSS timing function in CANONICAL form: a keyword, or
 * `cubic-bezier(x1,y1,x2,y2)` with no interior whitespace and both x
 * coordinates in [0, 1]. Ported from the source's
 * `isCanonicalCssTimingFunction` (style-schema.ts:1655-1690).
 */
export function isCanonicalCssTimingFunction(value: string): boolean {
  if ((CSS_TIMING_KEYWORDS as readonly string[]).includes(value)) return true;
  if (/\s/.test(value)) return false;
  const match = CSS_CUBIC_BEZIER_REGEX.exec(value);
  if (!match) return false;
  const [x1, y1, x2, y2] = [match[1], match[2], match[3], match[4]].map(Number);
  return (
    [x1, y1, x2, y2].every((n) => Number.isFinite(n)) &&
    x1! >= 0 && x1! <= 1 && x2! >= 0 && x2! <= 1
  );
}

export const CssTimingFunction = z
  .string()
  .refine(isCanonicalCssTimingFunction, "must be a CSS timing keyword or canonical cubic-bezier(x1,y1,x2,y2)");

// ── Shared helpers ─────────────────────────────────────────────────────

/** Report duplicates in a list of comparable keys. */
export function duplicates<T>(values: readonly T[]): T[] {
  const seen = new Set<T>();
  const dupes = new Set<T>();
  for (const v of values) {
    if (seen.has(v)) dupes.add(v);
    seen.add(v);
  }
  return [...dupes];
}

/** Duplicate detection on trimmed, case-folded strings (source semantics). */
export function duplicateStrings(values: readonly string[]): string[] {
  return duplicates(values.map((v) => v.trim().toLocaleLowerCase("en-US")));
}

function rejectDuplicates(
  ctx: z.RefinementCtx,
  values: readonly string[] | undefined,
  path: (string | number)[],
  label = "value",
): void {
  if (!values) return;
  for (const d of duplicateStrings(values)) {
    ctx.addIssue({ code: "custom", path, message: `duplicate ${label} "${d}"` });
  }
}

/**
 * Enforce a flattened discriminated union: exactly the fields of the
 * selected arm are present. `arms` maps each discriminant value to the
 * field names that arm requires; every field mentioned in any arm but not
 * in the selected one must be absent. This is transformation 3's control.
 */
function refineArms(
  ctx: z.RefinementCtx,
  value: Record<string, unknown>,
  discriminant: string,
  arms: Record<string, readonly string[]>,
): void {
  const kind = value[discriminant] as string | undefined;
  if (kind === undefined || !(kind in arms)) return;
  const required = new Set(arms[kind]);
  const all = new Set(Object.values(arms).flat());
  for (const field of required) {
    if (value[field] === undefined) {
      ctx.addIssue({
        code: "custom",
        path: [field],
        message: `required when ${discriminant} is "${kind}"`,
      });
    }
  }
  for (const field of all) {
    if (!required.has(field) && value[field] !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: [field],
        message: `must be absent when ${discriminant} is "${kind}"`,
      });
    }
  }
}

// ── Shared structs ─────────────────────────────────────────────────────

/**
 * Who authored a document, when, from which system. `modified_by` and
 * `modified_at` are both-or-neither and `modified_at >= created_at`
 * (source invariant "provenance ordering").
 */
export const Provenance = z
  .strictObject({
    created_by: NonBlank.describe("Actor id or system name that authored the document."),
    created_at: IsoDateTimeUtc.describe("Creation instant."),
    modified_by: NonBlank.optional().describe("Last-modification actor."),
    modified_at: IsoDateTimeUtc.optional().describe("Last-modification instant; >= created_at."),
    source_system: NonBlank.optional().describe(
      "Authoring tool or system of record. Absence means unrecorded, not manual.",
    ),
  })
  .superRefine((v, ctx) => {
    const hasWho = v.modified_by !== undefined;
    const hasWhen = v.modified_at !== undefined;
    if (hasWho !== hasWhen) {
      ctx.addIssue({
        code: "custom",
        path: ["modified_at"],
        message: "modified_by and modified_at are both-or-neither",
      });
    }
    if (hasWhen && v.modified_at! < v.created_at) {
      ctx.addIssue({
        code: "custom",
        path: ["modified_at"],
        message: "modified_at must be at or after created_at",
      });
    }
  });

/**
 * Approximate date range. Flattened from the source `Period` union:
 * `open` carries a nullable start, `closed` requires start <= end.
 */
export const Period = z
  .strictObject({
    kind: PeriodKind,
    start: Year.nullable().describe("Origin year. Null on an open period means unknown origin."),
    end: Year.optional().describe("Terminal year. Present only on a closed period."),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "closed") {
      if (v.start === null) {
        ctx.addIssue({ code: "custom", path: ["start"], message: "a closed period requires a start year" });
      }
      if (v.end === undefined) {
        ctx.addIssue({ code: "custom", path: ["end"], message: "a closed period requires an end year" });
      }
      if (v.start !== null && v.end !== undefined && v.start > v.end) {
        ctx.addIssue({ code: "custom", path: ["end"], message: "end must be at or after start" });
      }
    } else if (v.end !== undefined) {
      ctx.addIssue({ code: "custom", path: ["end"], message: "an open period must not carry an end year" });
    }
  });

export const MediumComponent = z.strictObject({
  family: MediumFamily,
  process: NonBlank.optional().describe(
    "Specific technique within the family. Absence means the family alone characterises the origin.",
  ),
});

/**
 * Medium of origin. Flattened from the source union: `single` carries the
 * component inline, `mixed` carries an explicit component list so that
 * "mixed" never becomes an information sink.
 */
export const OriginMedium = z
  .strictObject({
    kind: OriginMediumKind,
    family: MediumFamily.optional(),
    process: NonBlank.optional(),
    components: z.array(MediumComponent).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "single") {
      if (v.family === undefined) {
        ctx.addIssue({ code: "custom", path: ["family"], message: 'required when kind is "single"' });
      }
      if (v.components !== undefined) {
        ctx.addIssue({ code: "custom", path: ["components"], message: 'must be absent when kind is "single"' });
      }
    } else {
      if (v.family !== undefined || v.process !== undefined) {
        ctx.addIssue({ code: "custom", path: ["family"], message: 'must be absent when kind is "mixed"' });
      }
      if (!v.components || v.components.length === 0) {
        ctx.addIssue({ code: "custom", path: ["components"], message: "at least one component is required" });
      } else {
        rejectDuplicates(
          ctx,
          v.components.map((c) => `${c.family}::${c.process ?? ""}`),
          ["components"],
          "component",
        );
      }
    }
  });

/** A tenet of the style, with a mandatory primary-source citation. */
export const Axiom = z.strictObject({
  statement: NonBlank.describe("The tenet, stated in the document locale."),
  source: NonBlank.describe("Citation of the primary source. Required — unattributed axioms are the failure mode the schema exists to prevent."),
});

// ═══════════════════════════════════════════════════════════════════════
// ENTITY — Movement
// ═══════════════════════════════════════════════════════════════════════

/**
 * A movement or school. Intentionally thin: identity and lineage only.
 * `parentMovement` is a relation (style:ParentMovement), not a field.
 */
export const Movement = z
  .strictObject({
    movement_id: MovementId,
    name: NonBlank.describe("Canonical human-readable name, in the registry locale."),
    aliases: z.array(NonBlank).describe("Alternative names. Set; order insignificant."),
    period: Period,
  })
  .superRefine((v, ctx) => rejectDuplicates(ctx, v.aliases, ["aliases"], "alias"));

// ═══════════════════════════════════════════════════════════════════════
// ENTITY — CanonicalReference
// ═══════════════════════════════════════════════════════════════════════

/**
 * A named artifact from which the grammar can be reverse-engineered, or
 * against which its boundary is drawn. The bucket a reference occupies
 * (primary / secondary / counter-example) is carried by the
 * style:HasReference relation, not by a field, because the same work can
 * be primary for one style and a counter-example for another.
 */
export const CanonicalReference = z
  .strictObject({
    reference_id: ReferenceId,
    title: NonBlank,
    creators: z.array(NonBlank).min(1).describe("One or more creators. Set; order insignificant."),
    year: Year.nullable().describe("Null for works with disputed or unknown dates."),
    medium: NonBlank,
    exemplifies: NonBlank.describe("What this specific work exemplifies about the style."),
    source: NonBlank.describe(
      "Publicly accessible citation: a museum accession record, a catalogue raisonné entry, or a peer-reviewed monograph.",
    ),
  })
  .superRefine((v, ctx) => rejectDuplicates(ctx, v.creators, ["creators"], "creator"));

// ═══════════════════════════════════════════════════════════════════════
// ENTITY — Rule
// ═══════════════════════════════════════════════════════════════════════

/**
 * A requirement or a prohibition. The source keeps the two in separate
 * arrays so they cannot be swapped; here the `kind` discriminant plus the
 * RuleId's P-form carry the same fact, and ../invariants.ts enforces that
 * the two agree (`forbids` <=> P-form id).
 *
 * `exemplars` is a relation (style:CitesExemplar), so a defining rule's
 * exemplar requirement is checked against primitives that provably exist.
 */
export const Rule = z.strictObject({
  rule_id: RuleId,
  kind: RuleKind.describe('"requires" = the artifact MUST exhibit the property; "forbids" = MUST NOT.'),
  section: z.enum(GRAMMAR_SECTIONS as [GrammarSection, ...GrammarSection[]]).describe(
    "Grammar section that owns the rule. Must agree with the section letter in rule_id.",
  ),
  statement: NonBlank.describe("The rule, stated so that an artifact can be judged against it."),
  weight: RuleWeight.describe(
    "defining = failure disqualifies; strong = heavily weighted; advisory = non-conformance-affecting.",
  ),
});

// ═══════════════════════════════════════════════════════════════════════
// ENTITY — ComplianceCheck
// ═══════════════════════════════════════════════════════════════════════

/**
 * A falsifiable criterion operationalising exactly one Rule, reached by
 * the style:TestsRule relation. Flattened from the source's three-arm
 * union; `refineArms` keeps the arms disjoint.
 */
export const ComplianceCheck = z
  .strictObject({
    check_id: CheckId,
    kind: ComplianceCheckKind,
    description: NonBlank,
    weight: RuleWeight.describe("Must equal the weight of the rule this check tests."),
    threshold_metric: NonBlank.optional().describe('Free-form metric name; "threshold" arm only.'),
    threshold_operator: ThresholdOperator.optional(),
    threshold_value: z.number().finite().optional(),
    threshold_unit: NonBlank.optional().describe("Absence means the metric is dimensionless."),
    criteria: NonBlank.optional().describe('Human-judgement criteria; "qualitative" arm only.'),
  })
  .superRefine((v, ctx) => {
    refineArms(ctx, v, "kind", {
      binary: [],
      threshold: ["threshold_metric", "threshold_operator", "threshold_value"],
      qualitative: ["criteria"],
    });
    // threshold_unit is optional *within* the threshold arm, so it is not
    // in the arm's required list and needs its own exclusion check.
    if (v.kind !== "threshold" && v.threshold_unit !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["threshold_unit"],
        message: 'must be absent when kind is not "threshold"',
      });
    }
  });

// ═══════════════════════════════════════════════════════════════════════
// ENTITY — grammar sections (ten)
//
// Every section is a primitive in its own right, joined to its Style by
// style:HasGrammar and to its rules by style:DeclaresRule. `rules` and
// `prohibitions` from the source's `Ruled` base are therefore relations,
// not fields.
// ═══════════════════════════════════════════════════════════════════════

/** Fields every grammar section carries. */
const grammarBase = {
  grammar_id: NonBlank.describe("Identifier of this grammar section, unique within the workbook."),
};

/**
 * LineGrammar — discriminated on whether lines exist at all. A `no-lines`
 * style carries no stroke, roles, quality or hierarchy: information is
 * entirely in fill.
 */
export const LineGrammar = z
  .strictObject({
    ...grammarBase,
    kind: LineGrammarKind,
    stroke_kind: StrokeWeightKind.optional(),
    stroke_weight: Length.optional().describe('Uniform profile only.'),
    stroke_weight_min: Length.optional().describe("Variable profiles only."),
    stroke_weight_max: Length.optional().describe("Variable profiles only."),
    stroke_roles: z.array(StrokeRole).optional(),
    quality: LineQuality.optional(),
    contour_hierarchy: ContourHierarchy.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "no-lines") {
      for (const f of [
        "stroke_kind",
        "stroke_weight",
        "stroke_weight_min",
        "stroke_weight_max",
        "stroke_roles",
        "quality",
        "contour_hierarchy",
      ] as const) {
        if (v[f] !== undefined) {
          ctx.addIssue({ code: "custom", path: [f], message: 'must be absent when kind is "no-lines"' });
        }
      }
      return;
    }
    for (const f of ["stroke_kind", "stroke_roles", "quality", "contour_hierarchy"] as const) {
      if (v[f] === undefined) {
        ctx.addIssue({ code: "custom", path: [f], message: 'required when kind is "lines"' });
      }
    }
    if (!v.stroke_roles || v.stroke_roles.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["stroke_roles"],
        message: 'at least one role is required when kind is "lines"',
      });
    } else {
      rejectDuplicates(ctx, v.stroke_roles, ["stroke_roles"], "role");
    }
    if (v.stroke_kind === "uniform") {
      if (v.stroke_weight === undefined) {
        ctx.addIssue({ code: "custom", path: ["stroke_weight"], message: 'required when stroke_kind is "uniform"' });
      }
      for (const f of ["stroke_weight_min", "stroke_weight_max"] as const) {
        if (v[f] !== undefined) {
          ctx.addIssue({ code: "custom", path: [f], message: 'must be absent when stroke_kind is "uniform"' });
        }
      }
    } else if (v.stroke_kind !== undefined) {
      if (v.stroke_weight !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["stroke_weight"],
          message: "must be absent on a variable stroke profile; use stroke_weight_min/max",
        });
      }
      for (const f of ["stroke_weight_min", "stroke_weight_max"] as const) {
        if (v[f] === undefined) {
          ctx.addIssue({ code: "custom", path: [f], message: `required when stroke_kind is "${v.stroke_kind}"` });
        }
      }
      if (
        v.stroke_weight_min !== undefined &&
        v.stroke_weight_max !== undefined &&
        v.stroke_weight_min > v.stroke_weight_max
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["stroke_weight_max"],
          message: "stroke_weight_max must be at or above stroke_weight_min",
        });
      }
    }
  });

export const ColorPaletteEntry = z.strictObject({
  name: NonBlank,
  hex: HexColor,
  role: ColorRole,
  printing_origin: PrintingOrigin.optional().describe(
    "Absence means the pigment or process origin is unrecorded — not 'digital by default'.",
  ),
});

/**
 * A colour called out as forbidden. `prohibited_by` names the Rule that
 * forbids it; because the rule is a separate primitive, the linkage is
 * checked by ../invariants.ts rather than by the host relation pipeline.
 */
export const ForbiddenColor = z.strictObject({
  name: NonBlank,
  hex: HexColor.optional().describe("Absence means a categorical prohibition, e.g. 'any saturated yellow'."),
  reason: NonBlank,
  prohibited_by: RuleId.describe("The prohibition that forbids this colour. Must exist and have kind=forbids."),
});

/**
 * ColorGrammar. `lighting` is the single source of truth for light and
 * shadow depiction — the source merged v2's two encodings here precisely
 * to make the contradiction "lighting: none with shadows: cast"
 * unrepresentable.
 */
export const ColorGrammar = z
  .strictObject({
    ...grammarBase,
    application_methods: z.array(ApplicationMethod).min(1).describe("Ordered dominant → secondary."),
    gradients: GradientPolicy,
    lighting_kind: LightingKind,
    lighting_sources: z.array(LightSource).optional().describe('"rendered" arm only.'),
    lighting_treatment: ShadowTreatment.optional().describe('"rendered" arm only.'),
    palette: z.array(ColorPaletteEntry),
    forbidden_colors: z.array(ForbiddenColor),
    palette_derivation_rule: NonBlank.nullable().describe("Free-form rule for open palettes; null for fixed palettes."),
    color_relationships: z.array(ColorRelationship).min(1).describe("Ordered dominant → secondary."),
    palette_limit_kind: PaletteLimitKind,
    palette_limit_max: PositiveInteger.optional().describe('"capped" arm only.'),
  })
  .superRefine((v, ctx) => {
    rejectDuplicates(ctx, v.application_methods, ["application_methods"], "method");
    rejectDuplicates(ctx, v.color_relationships, ["color_relationships"], "relationship");
    rejectDuplicates(ctx, v.palette.map((p) => p.name), ["palette"], "colour name");
    rejectDuplicates(ctx, v.forbidden_colors.map((f) => f.name), ["forbidden_colors"], "colour name");

    refineArms(ctx, v, "lighting_kind", {
      none: [],
      implied: [],
      rendered: ["lighting_sources", "lighting_treatment"],
      "full-pbr": [],
    });
    if (v.lighting_kind === "rendered") {
      if (v.lighting_sources && v.lighting_sources.length === 0) {
        ctx.addIssue({ code: "custom", path: ["lighting_sources"], message: "at least one source is required" });
      }
      rejectDuplicates(ctx, v.lighting_sources, ["lighting_sources"], "source");
    }

    refineArms(ctx, v, "palette_limit_kind", { unlimited: [], capped: ["palette_limit_max"] });
    if (v.palette_limit_kind === "capped" && v.palette_limit_max !== undefined) {
      if (v.palette.length > v.palette_limit_max) {
        ctx.addIssue({
          code: "custom",
          path: ["palette"],
          message: `palette holds ${v.palette.length} entries but palette_limit_max is ${v.palette_limit_max}`,
        });
      }
    }

    // Source: "provide a palette or a paletteDerivationRule".
    if (v.palette.length === 0 && v.palette_derivation_rule === null) {
      ctx.addIssue({
        code: "custom",
        path: ["palette"],
        message: "provide a palette or a palette_derivation_rule",
      });
    }
  });

export const FormGrammar = z
  .strictObject({
    ...grammarBase,
    primitives: z.array(FormPrimitive).min(1),
    proportion_system: ProportionSystem,
    symmetry: Symmetry,
    edge_treatment: EdgeTreatment,
    structural_exposure: StructuralExposure,
  })
  .superRefine((v, ctx) => rejectDuplicates(ctx, v.primitives, ["primitives"], "primitive"));

export const SpatialGrammar = z
  .strictObject({
    ...grammarBase,
    perspective_system: PerspectiveSystem,
    depth_encoding_kind: DepthEncodingKind,
    depth_encoding_methods: z.array(DepthEncodingMethod).optional().describe('"encoded" arm only.'),
    frame_behavior: FrameBehavior,
  })
  .superRefine((v, ctx) => {
    refineArms(ctx, v, "depth_encoding_kind", { none: [], encoded: ["depth_encoding_methods"] });
    if (v.depth_encoding_kind === "encoded") {
      if (v.depth_encoding_methods && v.depth_encoding_methods.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["depth_encoding_methods"],
          message: "at least one method is required",
        });
      }
      rejectDuplicates(ctx, v.depth_encoding_methods, ["depth_encoding_methods"], "method");
    }
  });

export const SurfaceGrammar = z
  .strictObject({
    ...grammarBase,
    rendering_methods: z.array(RenderingMethod).min(1).describe("Ordered dominant → secondary."),
    material_honesty: MaterialHonesty,
    dominant_texture: Texture,
  })
  .superRefine((v, ctx) => rejectDuplicates(ctx, v.rendering_methods, ["rendering_methods"], "method"));

/**
 * A typeface assignment. The source keys these by TypeRole in a
 * `Partial<Record<...>>`; transformation 4 turns that into a role-keyed
 * entry list with uniqueness enforced below.
 */
export const TypefaceSpec = z
  .strictObject({
    role: TypeRole,
    classification: TypeClassification,
    exemplars: z.array(NonBlank).describe("Specific typeface names, for reference. May not be commercially available."),
    weight_min: WeightStep.describe("Lowest abstract weight step used at this role."),
    weight_span: WeightSpan.describe("Steps above weight_min. 0 = a single weight."),
    permits_italic: z.boolean(),
    casing: Casing,
  })
  .superRefine((v, ctx) => {
    rejectDuplicates(ctx, v.exemplars, ["exemplars"], "exemplar");
    if (v.weight_min + v.weight_span > 9) {
      ctx.addIssue({
        code: "custom",
        path: ["weight_span"],
        message: `weight_min + weight_span must not exceed 9; got ${v.weight_min} + ${v.weight_span}`,
      });
    }
  });

export const TypographyGrammar = z
  .strictObject({
    ...grammarBase,
    typefaces: z.array(TypefaceSpec).describe("One entry per type role in use; roles are unique."),
    type_image_relation: TypeImageRelation,
    baseline_grid_kind: BaselineGridKind,
    baseline_grid_unit: Length.optional().describe('"grid" arm only.'),
    letter_spacing: LetterSpacing,
  })
  .superRefine((v, ctx) => {
    rejectDuplicates(ctx, v.typefaces.map((t) => t.role), ["typefaces"], "role");
    refineArms(ctx, v, "baseline_grid_kind", { none: [], grid: ["baseline_grid_unit"] });
  });

export const CompositionGrammar = z
  .strictObject({
    ...grammarBase,
    layout_kind: LayoutKind,
    layout_columns: PositiveInteger.optional().describe('"modular-grid" arm only.'),
    layout_gutter: Length.optional().describe('"modular-grid" and "panel-grid" arms only.'),
    layout_axis: LayoutAxis.optional().describe('"axial" arm only.'),
    layout_angle_degrees: z.number().finite().optional().describe('"diagonal" arm only; open interval (-90, 90), zero excluded.'),
    hierarchy_methods: z.array(HierarchyMethod).min(1).describe("Ordered dominant → secondary."),
    negative_space: NegativeSpace,
    permits_bleed: z
      .boolean()
      .describe(
        "Whether the composition is intended to continue past its own frame (tiling, implied extension). NOT the same as forms touching the edge.",
      ),
  })
  .superRefine((v, ctx) => {
    rejectDuplicates(ctx, v.hierarchy_methods, ["hierarchy_methods"], "method");
    refineArms(ctx, v, "layout_kind", {
      "modular-grid": ["layout_columns", "layout_gutter"],
      "panel-grid": ["layout_gutter"],
      axial: ["layout_axis"],
      radial: [],
      diagonal: ["layout_angle_degrees"],
      free: [],
      hierarchical: [],
    });
    if (v.layout_kind === "diagonal" && v.layout_angle_degrees !== undefined) {
      const a = v.layout_angle_degrees;
      const { minExclusive, maxExclusive } = CONSTRAINTS.diagonalAngleDegrees;
      if (!(a > minExclusive && a < maxExclusive) || a === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["layout_angle_degrees"],
          message: `must lie in the open interval (${minExclusive}, ${maxExclusive}) excluding zero; 0° is axial-horizontal and ±90° axial-vertical`,
        });
      }
    }
  });

export const ContrastGrammar = z
  .strictObject({
    ...grammarBase,
    tonal_range: TonalRange,
    contrast_roles: z
      .array(ContrastRole)
      .describe("Ordered dominant → secondary. Empty = tonal contrast plays no functional role."),
  })
  .superRefine((v, ctx) => rejectDuplicates(ctx, v.contrast_roles, ["contrast_roles"], "role"));

export const Motif = z.strictObject({
  name: NonBlank,
  description: NonBlank,
  frequency: MotifFrequency,
});

export const FigureTreatmentBySubgenre = z.strictObject({
  subgenre: NonBlank.describe('Free-form subgenre name, e.g. "bijin-ga", "yakusha-e".'),
  treatment: FigureTreatment,
  dominance: SubgenreDominance,
});

export const IconographyGrammar = z
  .strictObject({
    ...grammarBase,
    motifs: z.array(Motif).describe("Set keyed by unique name; order insignificant."),
    figure_treatment: FigureTreatment.describe(
      "Headline treatment. When a subgenre breakdown is present this is the derived headline of it, not an override.",
    ),
    figure_treatments_by_subgenre: z
      .array(FigureTreatmentBySubgenre)
      .optional()
      .describe("Absence means the tradition is internally uniform."),
  })
  .superRefine((v, ctx) => {
    rejectDuplicates(ctx, v.motifs.map((m) => m.name), ["motifs"], "motif name");
    const breakdown = v.figure_treatments_by_subgenre;
    if (breakdown === undefined) return;
    if (breakdown.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["figure_treatments_by_subgenre"],
        message: "omit the field rather than supplying an empty breakdown",
      });
      return;
    }
    rejectDuplicates(ctx, breakdown.map((b) => b.subgenre), ["figure_treatments_by_subgenre"], "subgenre");
    const primaries = breakdown.filter((b) => b.dominance === "primary");
    if (primaries.length !== 1) {
      ctx.addIssue({
        code: "custom",
        path: ["figure_treatments_by_subgenre"],
        message: `exactly one entry must have dominance "primary"; found ${primaries.length}`,
      });
      return;
    }
    if (primaries[0]!.treatment !== v.figure_treatment) {
      ctx.addIssue({
        code: "custom",
        path: ["figure_treatment"],
        message: `must equal the primary subgenre's treatment "${primaries[0]!.treatment}"`,
      });
    }
  });

export const MotionGrammar = z
  .strictObject({
    ...grammarBase,
    kind: MotionGrammarKind,
    character: MotionCharacter.optional().describe('"animated" arm only.'),
    uses_squash_stretch: z.boolean().optional(),
    uses_motion_blur: z.boolean().optional(),
    uses_kinetic_marks: z.boolean().optional(),
  })
  .superRefine((v, ctx) =>
    refineArms(ctx, v, "kind", {
      static: [],
      animated: ["character", "uses_squash_stretch", "uses_motion_blur", "uses_kinetic_marks"],
    }),
  );

// ═══════════════════════════════════════════════════════════════════════
// ENTITY — Style
//
// The document head: identity, philosophy, provenance, the production
// token layer, and the compliance pass ratio. Grammar sections, rules,
// checks, references and lineage are relations.
// ═══════════════════════════════════════════════════════════════════════

/** Transformation 4: `Record<string, HexColor>` as a keyed entry list. */
export const ColorTokenEntry = z.strictObject({ name: NonBlank, value: HexColor });
export const PxTokenEntry = z.strictObject({ name: NonBlank, value: Px });
export const EmTokenEntry = z.strictObject({ name: NonBlank, value: Em });
export const FontStackEntry = z.strictObject({ role: TypeRole, stack: NonBlank });
export const WeightMapEntry = z.strictObject({ step: WeightStep, weight: OpenTypeWeight });
export const TimingMapEntry = z.strictObject({ character: MotionCharacter, timing: CssTimingFunction });
export const LineHeightEntry = z.strictObject({
  name: z.enum(["tight", "base", "loose"]),
  value: LineHeight,
});

/**
 * A declared foreground/background pairing held to the WCAG minimum for
 * its usage. Both names are keys into the colour token list; both
 * referenced colours must be fully opaque. Resolution and the ratio
 * itself are checked in ../invariants.ts, which owns the arithmetic.
 */
export const WcagContrastPair = z.strictObject({
  foreground: NonBlank.describe("Colour token name."),
  background: NonBlank.describe("Colour token name."),
  usage: WcagContrastUsage,
});

/** True iff the colour is 6-digit, or 8-digit with alpha "ff". */
export function isOpaqueHexColor(color: string): boolean {
  return color.length === 7 || (color.length === 9 && color.slice(7, 9).toLowerCase() === "ff");
}

/** Count Unicode code points, not UTF-16 units (source promptFragment cap). */
export function codePointLength(s: string): number {
  return [...s].length;
}

export const Style = z
  .strictObject({
    style_id: StyleId,
    schema_version: SemVer.describe("Source schema version of the document. Immutable."),
    locale: LocaleTag.describe(
      "Authoring locale of every free-prose field. Immutable; localised editions are separate documents.",
    ),
    code: StyleCode.describe("Uppercase namespace prefixing every RuleId and CheckId. Immutable."),
    name: NonBlank.describe("Canonical human-readable name, in the document locale."),
    aliases: z.array(NonBlank),
    period: Period,
    geographic_centers: z
      .array(NonBlank)
      .describe("Empty means geographically diffuse — not that the geography is unknown."),
    origin_medium: OriginMedium,
    provenance: Provenance,

    // philosophy
    ornament_stance: OrnamentStance,
    machine_attitude: MachineAttitude,
    form_function_relation: FormFunctionRelation,
    human_relation: HumanRelation,
    axioms: z.array(Axiom).min(1).describe("At least one axiom is required."),

    // compliance
    minimum_pass_ratio: Ratio.describe(
      "Minimum fraction of weighted non-defining checks that must pass. A single defining failure disqualifies regardless.",
    ),

    // ── production tokens ──
    tokens_colors_kind: TokenSectionKind,
    tokens_colors: z.array(ColorTokenEntry).optional(),

    tokens_typography_kind: TokenSectionKind,
    tokens_font_stacks: z.array(FontStackEntry).optional(),
    tokens_scale: z.array(PxTokenEntry).optional().describe("Type scale in px; semantic names."),
    tokens_line_heights: z.array(LineHeightEntry).optional(),
    tokens_letter_spacing: z.array(EmTokenEntry).optional(),
    tokens_weight_map: z.array(WeightMapEntry).optional(),

    tokens_spacing_kind: TokenSectionKind,
    tokens_base_unit: Px.optional().describe("The concrete meaning of one abstract Length unit."),
    tokens_spacing_scale: z.array(PxTokenEntry).optional(),

    tokens_shape_kind: TokenSectionKind,
    tokens_border_radius: z.array(PxTokenEntry).optional(),
    tokens_stroke_weight: Px.optional().describe(
      "DERIVED from grammar.line.stroke × tokens_base_unit; ../invariants.ts enforces the derivation.",
    ),
    tokens_stroke_alignment: StrokeAlignment.optional(),

    tokens_motion_kind: TokenSectionKind,
    tokens_timing_map: z.array(TimingMapEntry).optional(),
    tokens_default_duration_ms: z.number().min(0).finite().optional(),

    tokens_prompt_kind: TokenSectionKind,
    tokens_prompt_positive: z.string().optional(),
    tokens_prompt_negative: z.string().optional().describe("May be empty: a style with no forbidden vocabulary."),

    tokens_accessibility_kind: AccessibilityKind.default("omitted").describe(
      "Absence is identical to omitted — every pre-3.1 document.",
    ),
    tokens_accessibility_version: WcagVersion.optional(),
    tokens_accessibility_level: WcagConformanceLevel.optional(),
    tokens_contrast_pairs: z.array(WcagContrastPair).optional(),
  })
  .superRefine((v, ctx) => {
    rejectDuplicates(ctx, v.aliases, ["aliases"], "alias");
    rejectDuplicates(ctx, v.geographic_centers, ["geographic_centers"], "centre");

    if (!SEMVER_REGEX.test(v.schema_version)) return;
    const major = Number(v.schema_version.split(".", 1)[0]);
    if (major !== SUPPORTED_SCHEMA_MAJOR) {
      ctx.addIssue({
        code: "custom",
        path: ["schema_version"],
        message: `unsupported major version "${v.schema_version}"; expected ${SUPPORTED_SCHEMA_MAJOR}.x.x`,
      });
    }

    // ── token sections: arm discipline ──
    refineArms(ctx, v, "tokens_colors_kind", { omitted: [], rendered: ["tokens_colors"] });
    refineArms(ctx, v, "tokens_typography_kind", {
      omitted: [],
      rendered: [
        "tokens_font_stacks",
        "tokens_scale",
        "tokens_line_heights",
        "tokens_letter_spacing",
        "tokens_weight_map",
      ],
    });
    refineArms(ctx, v, "tokens_spacing_kind", {
      omitted: [],
      rendered: ["tokens_base_unit", "tokens_spacing_scale"],
    });
    refineArms(ctx, v, "tokens_shape_kind", {
      omitted: [],
      rendered: ["tokens_border_radius", "tokens_stroke_weight", "tokens_stroke_alignment"],
    });
    refineArms(ctx, v, "tokens_motion_kind", {
      omitted: [],
      rendered: ["tokens_timing_map", "tokens_default_duration_ms"],
    });
    refineArms(ctx, v, "tokens_prompt_kind", {
      omitted: [],
      rendered: ["tokens_prompt_positive", "tokens_prompt_negative"],
    });
    refineArms(ctx, v, "tokens_accessibility_kind", {
      omitted: [],
      wcag: ["tokens_accessibility_version", "tokens_accessibility_level", "tokens_contrast_pairs"],
    });

    // ── token content ──
    if (v.tokens_colors_kind === "rendered") {
      if (!v.tokens_colors || v.tokens_colors.length === 0) {
        ctx.addIssue({ code: "custom", path: ["tokens_colors"], message: "at least one colour token is required" });
      }
      rejectDuplicates(ctx, v.tokens_colors?.map((t) => t.name), ["tokens_colors"], "token name");
    }
    if (v.tokens_typography_kind === "rendered") {
      if (!v.tokens_scale || v.tokens_scale.length === 0) {
        ctx.addIssue({ code: "custom", path: ["tokens_scale"], message: "at least one scale token is required" });
      }
      rejectDuplicates(ctx, v.tokens_scale?.map((t) => t.name), ["tokens_scale"], "token name");
      rejectDuplicates(ctx, v.tokens_letter_spacing?.map((t) => t.name), ["tokens_letter_spacing"], "token name");
      rejectDuplicates(ctx, v.tokens_font_stacks?.map((t) => t.role), ["tokens_font_stacks"], "role");
      rejectDuplicates(
        ctx,
        v.tokens_weight_map?.map((t) => String(t.step)),
        ["tokens_weight_map"],
        "weight step",
      );
      const names = (v.tokens_line_heights ?? []).map((l) => l.name);
      for (const required of ["tight", "base", "loose"] as const) {
        if (!names.includes(required)) {
          ctx.addIssue({
            code: "custom",
            path: ["tokens_line_heights"],
            message: `missing required line-height "${required}"`,
          });
        }
      }
      rejectDuplicates(ctx, names, ["tokens_line_heights"], "line-height name");
    }
    if (v.tokens_spacing_kind === "rendered") {
      rejectDuplicates(ctx, v.tokens_spacing_scale?.map((t) => t.name), ["tokens_spacing_scale"], "token name");
    }
    if (v.tokens_shape_kind === "rendered") {
      rejectDuplicates(ctx, v.tokens_border_radius?.map((t) => t.name), ["tokens_border_radius"], "token name");
    }
    if (v.tokens_motion_kind === "rendered") {
      const present = (v.tokens_timing_map ?? []).map((t) => t.character);
      for (const character of MOTION_CHARACTERS) {
        if (!present.includes(character)) {
          ctx.addIssue({
            code: "custom",
            path: ["tokens_timing_map"],
            message: `missing timing for motion character "${character}"; required when motion renders`,
          });
        }
      }
      rejectDuplicates(ctx, present, ["tokens_timing_map"], "motion character");
    }
    if (v.tokens_prompt_kind === "rendered") {
      const cap = CONSTRAINTS.promptFragment.maxCodePoints;
      if (v.tokens_prompt_positive !== undefined && v.tokens_prompt_positive.trim().length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["tokens_prompt_positive"],
          message: 'must not be empty when tokens_prompt_kind is "rendered"',
        });
      }
      for (const f of ["tokens_prompt_positive", "tokens_prompt_negative"] as const) {
        const value = v[f];
        if (value !== undefined && codePointLength(value) > cap) {
          ctx.addIssue({
            code: "custom",
            path: [f],
            message: `must be at most ${cap} Unicode code points; got ${codePointLength(value)}`,
          });
        }
      }
    }

    // ── WCAG contrast contract ──
    if (v.tokens_accessibility_kind === "wcag") {
      const pairs = v.tokens_contrast_pairs ?? [];
      if (pairs.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["tokens_contrast_pairs"],
          message: "a declared contract requires at least one pair; a pairless contract asserts nothing falsifiable",
        });
      }
      rejectDuplicates(
        ctx,
        pairs.map((p) => `${p.foreground}|${p.background}|${p.usage}`),
        ["tokens_contrast_pairs"],
        "pair",
      );
      // SC 1.4.11 exists only from WCAG 2.1.
      if (v.tokens_accessibility_version === "2.0") {
        pairs.forEach((p, i) => {
          if (p.usage === "ui-component") {
            ctx.addIssue({
              code: "custom",
              path: ["tokens_contrast_pairs", i, "usage"],
              message: 'usage "ui-component" requires WCAG 2.1 or later (SC 1.4.11)',
            });
          }
        });
      }
      // A contract binds to rendered colour tokens; without them it
      // cannot be evaluated at all.
      if (v.tokens_colors_kind !== "rendered") {
        ctx.addIssue({
          code: "custom",
          path: ["tokens_accessibility_kind"],
          message: 'a WCAG contract requires tokens_colors_kind "rendered" — it binds to rendered colours',
        });
      }
    }
  });

// ═══════════════════════════════════════════════════════════════════════
// The bundle @fdpm/zod-bridge consumes.
// ═══════════════════════════════════════════════════════════════════════

export const Schemas = {
  Movement,
  Style,
  LineGrammar,
  ColorGrammar,
  FormGrammar,
  SpatialGrammar,
  SurfaceGrammar,
  TypographyGrammar,
  CompositionGrammar,
  ContrastGrammar,
  IconographyGrammar,
  MotionGrammar,
  Rule,
  ComplianceCheck,
  CanonicalReference,
} as const;

export type StyleEntityName = keyof typeof Schemas;

/** Grammar entity name for each section, for id derivation and rendering. */
export const SECTION_ENTITY: Record<GrammarSection, StyleEntityName> = {
  line: "LineGrammar",
  color: "ColorGrammar",
  form: "FormGrammar",
  space: "SpatialGrammar",
  surface: "SurfaceGrammar",
  typography: "TypographyGrammar",
  composition: "CompositionGrammar",
  contrast: "ContrastGrammar",
  iconography: "IconographyGrammar",
  motion: "MotionGrammar",
};

export type StyleT = z.infer<typeof Style>;
export type MovementT = z.infer<typeof Movement>;
export type RuleT = z.infer<typeof Rule>;
export type ComplianceCheckT = z.infer<typeof ComplianceCheck>;
export type CanonicalReferenceT = z.infer<typeof CanonicalReference>;
export type ColorGrammarT = z.infer<typeof ColorGrammar>;
export type LineGrammarT = z.infer<typeof LineGrammar>;
export type MotionGrammarT = z.infer<typeof MotionGrammar>;
export type TypographyGrammarT = z.infer<typeof TypographyGrammar>;
export type ContrastGrammarT = z.infer<typeof ContrastGrammar>;
export type CompositionGrammarT = z.infer<typeof CompositionGrammar>;
export type IconographyGrammarT = z.infer<typeof IconographyGrammar>;
