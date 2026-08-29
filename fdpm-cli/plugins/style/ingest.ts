/**
 * Ingest a StyleRegistry — in the source schema's own shape — into an FDPM
 * workbook on profile:style:3.1.
 *
 * ARCHITECTURAL REQUIREMENT: LLMs will always produce some form of error.
 * Absence of output verification is a design defect, not a runtime bug.
 * All LLM output must be treated as untrusted and validated explicitly.
 *
 * ⚠ ARCHITECTURAL CONTRACT (PALS's LAW) — the registry is untrusted input
 * regardless of who produced it (an authoring CLI, a hand-written JSON
 * file, or a model asked to describe a style). Nothing here trusts the
 * caller. The five controls:
 *
 *  1. TYPED PARSE. `StyleRegistryInput` is a strict Zod surface —
 *     `.strict()` on every object, so an unknown field is a rejection, not
 *     a silently dropped value. A `Record<string, unknown>` passed onward
 *     would not be a parse.
 *  2. SEMANTIC VALIDATION. `parseStyleRegistry` asserts what the shape
 *     cannot: id uniqueness across styles, movements and references;
 *     referential validity of every `parentMovement`, `negatedMovements`,
 *     `influencedStyles`, `exemplars` and `testsRule` pointer. Then the
 *     projected workbook is run through `validateStyleWorkbook`, the full
 *     cross-entity invariant set, BEFORE a single write.
 *  3. DEFINED FAILURE PATH. Any failure throws a `verification`
 *     FDPMException naming every offending path, and writes nothing. There
 *     is no coercion, no defaulting, no truncation, no `catch {}`.
 *  4. FAILURE-PATH TESTS. tests/plugins/style/invariants.test.ts and
 *     ingest-and-render.test.ts feed malformed, incomplete and
 *     adversarial registries and assert the rejection.
 *  5. DETERMINISTIC BOUNDS. There is no loop here whose termination
 *     depends on the input's content: every traversal is over a
 *     finite parsed array, and the recursion in `validateStyleWorkbook`'s
 *     movement walk carries its own visited-set bound.
 *
 * After all that, every write still runs the host's §7 pipeline, which
 * re-validates each primitive against the generated Zod validator. The
 * checks here are not a substitute for that; they exist because the host
 * validates one primitive at a time and cannot see the graph.
 */

import { z } from "zod";
import type { Host } from "../../src/core/host.js";
import { FDPMException } from "../../src/core/errors/fdpm-exception.js";
import { defineProject, type PrimitiveSpec, type RelationSpec } from "../../src/sdk.js";
import { PROFILE_ID, REL, VENDOR, primitiveId, type EntityName } from "./sidecar.js";
import {
  GRAMMAR_SECTIONS,
  SECTION_ENTITY,
  type GrammarSection,
} from "./schemas/style.js";
import {
  validateStyleWorkbook,
  type PrimitiveLike,
  type RelationLike,
  type Violation,
} from "./invariants.js";

// ── Input surface: the source schema's own shape (camelCase) ───────────
//
// Deliberately permissive about *values* and strict about *structure*: the
// entity schemas re-check every value at write time, so duplicating their
// regexes here would put the same fact in two places. What this surface
// owns is the shape — an unknown key is a rejection.

const Str = z.string();
const Num = z.number();

const PeriodIn = z
  .object({ kind: z.enum(["open", "closed"]), start: Num.nullable(), end: Num.optional() })
  .strict();

const MediumComponentIn = z.object({ family: Str, process: Str.optional() }).strict();

const OriginMediumIn = z
  .object({
    kind: z.enum(["single", "mixed"]),
    family: Str.optional(),
    process: Str.optional(),
    components: z.array(MediumComponentIn).optional(),
  })
  .strict();

const ProvenanceIn = z
  .object({
    createdBy: Str,
    createdAt: Str,
    modifiedBy: Str.optional(),
    modifiedAt: Str.optional(),
    sourceSystem: Str.optional(),
  })
  .strict();

const AxiomIn = z.object({ statement: Str, source: Str }).strict();

const RuleIn = z
  .object({
    id: Str,
    kind: z.enum(["requires", "forbids"]),
    statement: Str,
    weight: z.enum(["defining", "strong", "advisory"]),
    exemplars: z.array(Str).optional(),
  })
  .strict();

/** Every grammar section carries the `Ruled` base plus its own fields. */
const RuledIn = {
  rules: z.array(RuleIn).default([]),
  prohibitions: z.array(RuleIn).default([]),
};

const LineGrammarIn = z
  .object({
    ...RuledIn,
    kind: z.enum(["lines", "no-lines"]),
    stroke: z
      .object({
        kind: z.enum(["uniform", "calligraphic", "expressive"]),
        weight: Num.optional(),
        weightMin: Num.optional(),
        weightMax: Num.optional(),
      })
      .strict()
      .optional(),
    strokeRoles: z.array(Str).optional(),
    quality: Str.optional(),
    contourHierarchy: Str.optional(),
  })
  .strict();

const ColorGrammarIn = z
  .object({
    ...RuledIn,
    applicationMethods: z.array(Str),
    gradients: Str,
    lighting: z
      .object({ kind: Str, sources: z.array(Str).optional(), treatment: Str.optional() })
      .strict(),
    palette: z
      .array(
        z
          .object({ name: Str, hex: Str, role: Str, printingOrigin: Str.optional() })
          .strict(),
      )
      .default([]),
    forbiddenColors: z
      .array(z.object({ name: Str, hex: Str.optional(), reason: Str, prohibitedBy: Str }).strict())
      .default([]),
    paletteDerivationRule: Str.nullable(),
    colorRelationships: z.array(Str),
    paletteLimit: z.object({ kind: Str, max: Num.optional() }).strict(),
  })
  .strict();

const FormGrammarIn = z
  .object({
    ...RuledIn,
    primitives: z.array(Str),
    proportionSystem: Str,
    symmetry: Str,
    edgeTreatment: Str,
    structuralExposure: Str,
  })
  .strict();

const SpatialGrammarIn = z
  .object({
    ...RuledIn,
    perspectiveSystem: Str,
    depthEncoding: z.object({ kind: Str, methods: z.array(Str).optional() }).strict(),
    frameBehavior: Str,
  })
  .strict();

const SurfaceGrammarIn = z
  .object({
    ...RuledIn,
    renderingMethods: z.array(Str),
    materialHonesty: Str,
    dominantTexture: Str,
  })
  .strict();

const TypefaceSpecIn = z
  .object({
    classification: Str,
    exemplars: z.array(Str).default([]),
    weightRange: z.object({ min: Num, span: Num }).strict(),
    permitsItalic: z.boolean(),
    casing: Str,
  })
  .strict();

const TypographyGrammarIn = z
  .object({
    ...RuledIn,
    typefaces: z.record(Str, TypefaceSpecIn),
    typeImageRelation: Str,
    baselineGrid: z.object({ kind: Str, unit: Num.optional() }).strict(),
    letterSpacing: Str,
  })
  .strict();

const CompositionGrammarIn = z
  .object({
    ...RuledIn,
    layout: z
      .object({
        kind: Str,
        columns: Num.optional(),
        gutter: Num.optional(),
        axis: Str.optional(),
        angleDegrees: Num.optional(),
      })
      .strict(),
    hierarchyMethods: z.array(Str),
    negativeSpace: Str,
    permitsBleed: z.boolean(),
  })
  .strict();

const ContrastGrammarIn = z
  .object({ ...RuledIn, tonalRange: Str, contrastRoles: z.array(Str).default([]) })
  .strict();

const IconographyGrammarIn = z
  .object({
    ...RuledIn,
    motifs: z.array(z.object({ name: Str, description: Str, frequency: Str }).strict()).default([]),
    figureTreatment: Str,
    figureTreatmentsBySubgenre: z
      .array(z.object({ subgenre: Str, treatment: Str, dominance: Str }).strict())
      .optional(),
  })
  .strict();

const MotionGrammarIn = z
  .object({
    ...RuledIn,
    kind: z.enum(["static", "animated"]),
    character: Str.optional(),
    usesSquashStretch: z.boolean().optional(),
    usesMotionBlur: z.boolean().optional(),
    usesKineticMarks: z.boolean().optional(),
  })
  .strict();

const ProductionTokensIn = z
  .object({
    colors: z
      .object({ kind: z.enum(["omitted", "rendered"]), tokens: z.record(Str, Str).optional() })
      .strict(),
    typography: z
      .object({
        kind: z.enum(["omitted", "rendered"]),
        fontStacks: z.record(Str, Str).optional(),
        scaleTokens: z.record(Str, Num).optional(),
        lineHeights: z.record(Str, Num).optional(),
        letterSpacingTokens: z.record(Str, Num).optional(),
        weightMap: z.record(Str, Num).optional(),
      })
      .strict(),
    spacing: z
      .object({
        kind: z.enum(["omitted", "rendered"]),
        baseUnit: Num.optional(),
        scale: z.record(Str, Num).optional(),
      })
      .strict(),
    shape: z
      .object({
        kind: z.enum(["omitted", "rendered"]),
        borderRadius: z.record(Str, Num).optional(),
        strokeWeight: Num.optional(),
        strokeAlignment: Str.optional(),
      })
      .strict(),
    motion: z
      .object({
        kind: z.enum(["omitted", "rendered"]),
        timingMap: z.record(Str, Str).optional(),
        defaultDurationMs: Num.optional(),
      })
      .strict(),
    promptFragment: z
      .object({
        kind: z.enum(["omitted", "rendered"]),
        positive: Str.optional(),
        negative: Str.optional(),
      })
      .strict(),
    accessibility: z
      .object({
        kind: z.enum(["omitted", "wcag"]),
        version: Str.optional(),
        level: Str.optional(),
        contrastPairs: z
          .array(z.object({ foreground: Str, background: Str, usage: Str }).strict())
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const CanonicalReferenceIn = z
  .object({
    id: Str,
    title: Str,
    creators: z.array(Str),
    year: Num.nullable(),
    medium: Str,
    exemplifies: Str,
    source: Str,
  })
  .strict();

const ComplianceCheckIn = z
  .object({
    kind: z.enum(["binary", "threshold", "qualitative"]),
    id: Str,
    testsRule: Str,
    description: Str,
    weight: z.enum(["defining", "strong", "advisory"]),
    threshold: z
      .object({ metric: Str, operator: Str, value: Num, unit: Str.optional() })
      .strict()
      .optional(),
    criteria: Str.optional(),
  })
  .strict();

const StyleDefinitionIn = z
  .object({
    schemaVersion: Str,
    locale: Str,
    provenance: ProvenanceIn,
    identity: z
      .object({
        id: Str,
        code: Str,
        name: Str,
        aliases: z.array(Str).default([]),
        period: PeriodIn,
        geographicCenters: z.array(Str).default([]),
        parentMovement: Str.nullable(),
        negatedMovements: z.array(Str).default([]),
        influencedStyles: z.array(Str).default([]),
        originMedium: OriginMediumIn,
      })
      .strict(),
    philosophy: z
      .object({
        ornamentStance: Str,
        machineAttitude: Str,
        formFunctionRelation: Str,
        humanRelation: Str,
        axioms: z.array(AxiomIn),
      })
      .strict(),
    grammar: z
      .object({
        line: LineGrammarIn,
        color: ColorGrammarIn,
        form: FormGrammarIn,
        space: SpatialGrammarIn,
        surface: SurfaceGrammarIn,
        typography: TypographyGrammarIn,
        composition: CompositionGrammarIn,
        contrast: ContrastGrammarIn,
        iconography: IconographyGrammarIn,
        motion: MotionGrammarIn,
      })
      .strict(),
    tokens: ProductionTokensIn,
    compliance: z
      .object({ minimumPassRatio: Num, checks: z.array(ComplianceCheckIn) })
      .strict(),
    references: z
      .object({
        primary: z.array(CanonicalReferenceIn),
        secondary: z.array(CanonicalReferenceIn).default([]),
        counterExamples: z.array(CanonicalReferenceIn),
      })
      .strict(),
  })
  .strict();

const MovementEntryIn = z
  .object({
    id: Str,
    name: Str,
    aliases: z.array(Str).default([]),
    period: PeriodIn,
    parentMovement: Str.nullable(),
  })
  .strict();

/** The closed world: every cross-reference must resolve inside it. */
export const StyleRegistryInput = z
  .object({
    schemaVersion: Str,
    locale: Str,
    provenance: ProvenanceIn,
    movements: z.array(MovementEntryIn).default([]),
    styles: z.array(StyleDefinitionIn),
  })
  .strict();

export type StyleRegistryInputType = z.infer<typeof StyleRegistryInput>;
type StyleIn = z.infer<typeof StyleDefinitionIn>;

// ── Step 2: semantic validation the shape cannot express ───────────────

interface Finding {
  path: string;
  message: string;
}

/**
 * Parse and check a registry. Returns the typed registry or throws a
 * `verification` FDPMException carrying every finding.
 */
export function parseStyleRegistry(input: unknown): StyleRegistryInputType {
  const parsed = StyleRegistryInput.safeParse(input);
  if (!parsed.success) {
    throw new FDPMException(
      "verification",
      `style registry rejected by StyleRegistryInput (${parsed.error.issues.length} issue(s)); first: ${parsed.error.issues[0]?.path.join(".") || "<root>"}: ${parsed.error.issues[0]?.message ?? ""}`,
      { findings: parsed.error.issues, evidence: { issue_count: parsed.error.issues.length } },
    );
  }
  const registry = parsed.data;
  const findings: Finding[] = [];

  // Registry-level id uniqueness.
  const movementIds = new Set<string>();
  registry.movements.forEach((m, i) => {
    if (movementIds.has(m.id)) findings.push({ path: `movements[${i}].id`, message: `duplicate MovementId "${m.id}"` });
    movementIds.add(m.id);
  });

  const styleIds = new Set<string>();
  registry.styles.forEach((s, i) => {
    if (styleIds.has(s.identity.id)) {
      findings.push({ path: `styles[${i}].identity.id`, message: `duplicate StyleId "${s.identity.id}"` });
    }
    styleIds.add(s.identity.id);
  });

  // Rule-13 closed world: every cross-document pointer resolves.
  registry.movements.forEach((m, i) => {
    if (m.parentMovement !== null && !movementIds.has(m.parentMovement)) {
      findings.push({
        path: `movements[${i}].parentMovement`,
        message: `"${m.parentMovement}" is not a movement in this registry`,
      });
    }
  });

  registry.styles.forEach((s, i) => {
    const at = `styles[${i}]`;
    if (s.identity.parentMovement !== null && !movementIds.has(s.identity.parentMovement)) {
      findings.push({
        path: `${at}.identity.parentMovement`,
        message: `"${s.identity.parentMovement}" is not a movement in this registry`,
      });
    }
    s.identity.negatedMovements.forEach((id, j) => {
      if (!movementIds.has(id)) {
        findings.push({
          path: `${at}.identity.negatedMovements[${j}]`,
          message: `"${id}" is not a movement in this registry`,
        });
      }
    });
    s.identity.influencedStyles.forEach((id, j) => {
      if (!styleIds.has(id)) {
        findings.push({
          path: `${at}.identity.influencedStyles[${j}]`,
          message: `"${id}" is not a style in this registry`,
        });
      }
    });

    // Intra-document pointers: exemplars and testsRule.
    const refIds = new Set(
      [...s.references.primary, ...s.references.secondary, ...s.references.counterExamples].map((r) => r.id),
    );
    const ruleIds = new Set(collectRules(s).map(({ rule }) => rule.id));
    for (const { rule, section } of collectRules(s)) {
      for (const ex of rule.exemplars ?? []) {
        if (!refIds.has(ex)) {
          findings.push({
            path: `${at}.grammar.${section}`,
            message: `rule ${rule.id}: exemplar "${ex}" is not a reference of this style`,
          });
        }
      }
    }
    s.compliance.checks.forEach((c, j) => {
      if (!ruleIds.has(c.testsRule)) {
        findings.push({
          path: `${at}.compliance.checks[${j}].testsRule`,
          message: `"${c.testsRule}" is not a rule declared by this style's grammar`,
        });
      }
    });
  });

  if (findings.length > 0) {
    throw new FDPMException(
      "verification",
      `style registry failed referential validation (${findings.length} finding(s)); first: ${findings[0]!.path}: ${findings[0]!.message}`,
      { findings, evidence: { finding_count: findings.length } },
    );
  }
  return registry;
}

/** Every rule of a style, tagged with the section that declares it. */
function collectRules(s: StyleIn): { rule: z.infer<typeof RuleIn>; section: GrammarSection }[] {
  const out: { rule: z.infer<typeof RuleIn>; section: GrammarSection }[] = [];
  for (const section of GRAMMAR_SECTIONS) {
    const g = s.grammar[section] as { rules: z.infer<typeof RuleIn>[]; prohibitions: z.infer<typeof RuleIn>[] };
    for (const rule of g.rules) out.push({ rule, section });
    for (const rule of g.prohibitions) out.push({ rule, section });
  }
  return out;
}

// ── Normalisation helpers (transformations 2, 3 and 4) ─────────────────

/** Drop undefined values so a field is absent rather than explicitly null. */
function drop<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

/** Transformation 4: `Record<K, V>` -> a keyed entry list. */
function entries<V>(
  record: Record<string, V> | undefined,
  keyName: string,
  valueName: string,
): Array<Record<string, unknown>> | undefined {
  if (record === undefined) return undefined;
  return Object.entries(record).map(([k, v]) => ({ [keyName]: k, [valueName]: v }));
}

/** As `entries`, but the key is numeric (weight steps). */
function numericEntries(
  record: Record<string, number> | undefined,
  keyName: string,
  valueName: string,
): Array<Record<string, unknown>> | undefined {
  if (record === undefined) return undefined;
  return Object.entries(record).map(([k, v]) => ({ [keyName]: Number(k), [valueName]: v }));
}

/** Slugify a rule or check id for use in a primitive id segment. */
function idSlug(raw: string): string {
  return raw.replace(/[^A-Za-z0-9._-]+/g, "-");
}

// ── Projection: registry -> primitives + relations ─────────────────────

export interface IngestOptions {
  workbookId: string;
  workbookName?: string;
  description?: string;
}

export interface IngestReport {
  workbookId: string;
  profileId: string;
  styleIds: string[];
  primitives: number;
  relations: number;
  /** Entity type id → count, so a caller can assert what landed. */
  byType: Record<string, number>;
}

interface Projection {
  primitives: PrimitiveSpec[];
  relations: RelationSpec[];
  byType: Record<string, number>;
  styleIds: string[];
}

/**
 * Pure projection of a parsed registry onto the profile's primitives and
 * relations. Exported so tests and callers can inspect (and validate) the
 * projection without touching a Host.
 */
export function projectStyleRegistry(registry: StyleRegistryInputType): Projection {
  const primitives: PrimitiveSpec[] = [];
  const relations: RelationSpec[] = [];
  const byType: Record<string, number> = {};
  const styleIds: string[] = [];

  const add = (entity: EntityName, slug: string, fields: Record<string, unknown>): string => {
    const id = primitiveId(entity, slug);
    const type = `${VENDOR}:${entity}`;
    primitives.push({ id, type, fields: drop(fields) });
    byType[type] = (byType[type] ?? 0) + 1;
    return id;
  };

  const rel = (type: string, from: string, to: string, fields?: Record<string, unknown>): void => {
    const name = type.split(":").pop()!.toLowerCase();
    const suffix = `${from.split(":").slice(1).join("-")}--${to.split(":").slice(1).join("-")}`;
    relations.push({
      id: `${VENDOR}:${name}:${idSlug(suffix)}`,
      type,
      from,
      to,
      ...(fields && Object.keys(fields).length > 0 ? { fields: drop(fields) } : {}),
    });
  };

  // ── Movements first: styles point at them. ──
  const movementPrimitive = new Map<string, string>();
  for (const m of registry.movements) {
    const id = add("Movement", m.id, {
      movement_id: m.id,
      name: m.name,
      aliases: m.aliases,
      period: drop({ kind: m.period.kind, start: m.period.start, end: m.period.end }),
    });
    movementPrimitive.set(m.id, id);
  }
  for (const m of registry.movements) {
    if (m.parentMovement !== null) {
      rel(REL.ParentMovement, movementPrimitive.get(m.id)!, movementPrimitive.get(m.parentMovement)!);
    }
  }

  // ── Styles. ──
  const stylePrimitive = new Map<string, string>();
  for (const s of registry.styles) {
    stylePrimitive.set(s.identity.id, primitiveId("Style", s.identity.id));
  }

  for (const s of registry.styles) {
    const styleId = stylePrimitive.get(s.identity.id)!;
    const t = s.tokens;
    const acc = t.accessibility;

    add("Style", s.identity.id, {
      style_id: s.identity.id,
      schema_version: s.schemaVersion,
      locale: s.locale,
      code: s.identity.code,
      name: s.identity.name,
      aliases: s.identity.aliases,
      period: drop({ kind: s.identity.period.kind, start: s.identity.period.start, end: s.identity.period.end }),
      geographic_centers: s.identity.geographicCenters,
      origin_medium: drop({
        kind: s.identity.originMedium.kind,
        family: s.identity.originMedium.family,
        process: s.identity.originMedium.process,
        components: s.identity.originMedium.components,
      }),
      provenance: drop({
        created_by: s.provenance.createdBy,
        created_at: s.provenance.createdAt,
        modified_by: s.provenance.modifiedBy,
        modified_at: s.provenance.modifiedAt,
        source_system: s.provenance.sourceSystem,
      }),
      ornament_stance: s.philosophy.ornamentStance,
      machine_attitude: s.philosophy.machineAttitude,
      form_function_relation: s.philosophy.formFunctionRelation,
      human_relation: s.philosophy.humanRelation,
      axioms: s.philosophy.axioms,
      minimum_pass_ratio: s.compliance.minimumPassRatio,

      tokens_colors_kind: t.colors.kind,
      tokens_colors: entries(t.colors.tokens, "name", "value"),

      tokens_typography_kind: t.typography.kind,
      tokens_font_stacks: entries(t.typography.fontStacks, "role", "stack"),
      tokens_scale: entries(t.typography.scaleTokens, "name", "value"),
      tokens_line_heights: entries(t.typography.lineHeights, "name", "value"),
      tokens_letter_spacing: entries(t.typography.letterSpacingTokens, "name", "value"),
      tokens_weight_map: numericEntries(t.typography.weightMap, "step", "weight"),

      tokens_spacing_kind: t.spacing.kind,
      tokens_base_unit: t.spacing.baseUnit,
      tokens_spacing_scale: entries(t.spacing.scale, "name", "value"),

      tokens_shape_kind: t.shape.kind,
      tokens_border_radius: entries(t.shape.borderRadius, "name", "value"),
      tokens_stroke_weight: t.shape.strokeWeight,
      tokens_stroke_alignment: t.shape.strokeAlignment,

      tokens_motion_kind: t.motion.kind,
      tokens_timing_map: entries(t.motion.timingMap, "character", "timing"),
      tokens_default_duration_ms: t.motion.defaultDurationMs,

      tokens_prompt_kind: t.promptFragment.kind,
      tokens_prompt_positive: t.promptFragment.positive,
      tokens_prompt_negative: t.promptFragment.negative,

      tokens_accessibility_kind: acc?.kind ?? "omitted",
      tokens_accessibility_version: acc?.version,
      tokens_accessibility_level: acc?.level,
      tokens_contrast_pairs: acc?.contrastPairs,
    });
    styleIds.push(styleId);

    // Lineage.
    if (s.identity.parentMovement !== null) {
      rel(REL.BelongsToMovement, styleId, movementPrimitive.get(s.identity.parentMovement)!);
    }
    for (const m of s.identity.negatedMovements) {
      rel(REL.NegatesMovement, styleId, movementPrimitive.get(m)!);
    }
    for (const other of s.identity.influencedStyles) {
      rel(REL.InfluencesStyle, styleId, stylePrimitive.get(other)!);
    }

    // References, one edge per bucket.
    const referencePrimitive = new Map<string, string>();
    for (const [role, bucket] of [
      ["primary", s.references.primary],
      ["secondary", s.references.secondary],
      ["counter-example", s.references.counterExamples],
    ] as const) {
      for (const r of bucket) {
        let refId = referencePrimitive.get(r.id);
        if (refId === undefined) {
          refId = add("CanonicalReference", r.id, {
            reference_id: r.id,
            title: r.title,
            creators: r.creators,
            year: r.year,
            medium: r.medium,
            exemplifies: r.exemplifies,
            source: r.source,
          });
          referencePrimitive.set(r.id, refId);
        }
        rel(REL.HasReference, styleId, refId, { role });
      }
    }

    // Grammar sections, their rules, and the rules' exemplars.
    const rulePrimitive = new Map<string, string>();
    for (const section of GRAMMAR_SECTIONS) {
      const entity = SECTION_ENTITY[section];
      const slug = `${s.identity.id}-${section}`;
      const grammarId = add(entity, slug, {
        grammar_id: slug,
        ...grammarFields(section, s),
      });
      rel(REL.HasGrammar, styleId, grammarId, { section });

      const g = s.grammar[section] as { rules: z.infer<typeof RuleIn>[]; prohibitions: z.infer<typeof RuleIn>[] };
      for (const rule of [...g.rules, ...g.prohibitions]) {
        const ruleId = add("Rule", idSlug(rule.id), {
          rule_id: rule.id,
          kind: rule.kind,
          section,
          statement: rule.statement,
          weight: rule.weight,
        });
        rulePrimitive.set(rule.id, ruleId);
        rel(REL.DeclaresRule, grammarId, ruleId);
        for (const ex of rule.exemplars ?? []) {
          const refId = referencePrimitive.get(ex);
          if (refId !== undefined) rel(REL.CitesExemplar, ruleId, refId);
        }
      }
    }

    // Compliance checks.
    for (const c of s.compliance.checks) {
      const checkId = add("ComplianceCheck", idSlug(c.id), {
        check_id: c.id,
        kind: c.kind,
        description: c.description,
        weight: c.weight,
        threshold_metric: c.threshold?.metric,
        threshold_operator: c.threshold?.operator,
        threshold_value: c.threshold?.value,
        threshold_unit: c.threshold?.unit,
        criteria: c.criteria,
      });
      rel(REL.DeclaresCheck, styleId, checkId);
      const target = rulePrimitive.get(c.testsRule);
      if (target !== undefined) rel(REL.TestsRule, checkId, target);
    }
  }

  return { primitives, relations, byType, styleIds };
}

/** Transformations 2 and 3 for one grammar section. */
function grammarFields(section: GrammarSection, s: StyleIn): Record<string, unknown> {
  const g = s.grammar;
  switch (section) {
    case "line": {
      const l = g.line;
      return {
        kind: l.kind,
        stroke_kind: l.stroke?.kind,
        stroke_weight: l.stroke?.weight,
        stroke_weight_min: l.stroke?.weightMin,
        stroke_weight_max: l.stroke?.weightMax,
        stroke_roles: l.strokeRoles,
        quality: l.quality,
        contour_hierarchy: l.contourHierarchy,
      };
    }
    case "color": {
      const c = g.color;
      return {
        application_methods: c.applicationMethods,
        gradients: c.gradients,
        lighting_kind: c.lighting.kind,
        lighting_sources: c.lighting.sources,
        lighting_treatment: c.lighting.treatment,
        palette: c.palette.map((p) =>
          drop({ name: p.name, hex: p.hex, role: p.role, printing_origin: p.printingOrigin }),
        ),
        forbidden_colors: c.forbiddenColors.map((f) =>
          drop({ name: f.name, hex: f.hex, reason: f.reason, prohibited_by: f.prohibitedBy }),
        ),
        palette_derivation_rule: c.paletteDerivationRule,
        color_relationships: c.colorRelationships,
        palette_limit_kind: c.paletteLimit.kind,
        palette_limit_max: c.paletteLimit.max,
      };
    }
    case "form": {
      const f = g.form;
      return {
        primitives: f.primitives,
        proportion_system: f.proportionSystem,
        symmetry: f.symmetry,
        edge_treatment: f.edgeTreatment,
        structural_exposure: f.structuralExposure,
      };
    }
    case "space": {
      const sp = g.space;
      return {
        perspective_system: sp.perspectiveSystem,
        depth_encoding_kind: sp.depthEncoding.kind,
        depth_encoding_methods: sp.depthEncoding.methods,
        frame_behavior: sp.frameBehavior,
      };
    }
    case "surface": {
      const sf = g.surface;
      return {
        rendering_methods: sf.renderingMethods,
        material_honesty: sf.materialHonesty,
        dominant_texture: sf.dominantTexture,
      };
    }
    case "typography": {
      const ty = g.typography;
      return {
        typefaces: Object.entries(ty.typefaces).map(([role, spec]) => ({
          role,
          classification: spec.classification,
          exemplars: spec.exemplars,
          weight_min: spec.weightRange.min,
          weight_span: spec.weightRange.span,
          permits_italic: spec.permitsItalic,
          casing: spec.casing,
        })),
        type_image_relation: ty.typeImageRelation,
        baseline_grid_kind: ty.baselineGrid.kind,
        baseline_grid_unit: ty.baselineGrid.unit,
        letter_spacing: ty.letterSpacing,
      };
    }
    case "composition": {
      const cp = g.composition;
      return {
        layout_kind: cp.layout.kind,
        layout_columns: cp.layout.columns,
        layout_gutter: cp.layout.gutter,
        layout_axis: cp.layout.axis,
        layout_angle_degrees: cp.layout.angleDegrees,
        hierarchy_methods: cp.hierarchyMethods,
        negative_space: cp.negativeSpace,
        permits_bleed: cp.permitsBleed,
      };
    }
    case "contrast": {
      const ct = g.contrast;
      return { tonal_range: ct.tonalRange, contrast_roles: ct.contrastRoles };
    }
    case "iconography": {
      const ic = g.iconography;
      return {
        motifs: ic.motifs,
        figure_treatment: ic.figureTreatment,
        figure_treatments_by_subgenre: ic.figureTreatmentsBySubgenre,
      };
    }
    case "motion": {
      const mo = g.motion;
      return {
        kind: mo.kind,
        character: mo.character,
        uses_squash_stretch: mo.usesSquashStretch,
        uses_motion_blur: mo.usesMotionBlur,
        uses_kinetic_marks: mo.usesKineticMarks,
      };
    }
  }
}

/**
 * Run the full cross-entity invariant set over a projection, before any
 * write. Throws a `verification` FDPMException listing every violation.
 */
export function assertProjectionInvariants(projection: Projection): void {
  const primitives: PrimitiveLike[] = projection.primitives.map((p) => ({
    id: p.id,
    type_id: p.type,
    field_values: p.fields,
  }));
  const relations: RelationLike[] = projection.relations.map((r) => ({
    id: r.id,
    type_id: r.type,
    source_id: r.from,
    target_id: r.to,
    field_values: r.fields ?? {},
  }));
  const result = validateStyleWorkbook(primitives, relations);
  if (!result.ok) {
    throw new FDPMException(
      "verification",
      `style registry violates ${result.violations.length} cross-entity invariant(s); first: ${result.violations[0]!.rule_id}: ${result.violations[0]!.message}`,
      {
        findings: result.violations satisfies Violation[],
        evidence: { violation_count: result.violations.length },
      },
    );
  }
}

/**
 * Parse, verify, project, verify again, then write. Nothing reaches the
 * host until every check above has passed.
 */
export async function buildStyleWorkbook(
  host: Host,
  input: unknown,
  opts: IngestOptions,
): Promise<IngestReport> {
  const registry = parseStyleRegistry(input);
  const projection = projectStyleRegistry(registry);
  assertProjectionInvariants(projection);

  await defineProject(host, {
    id: opts.workbookId,
    name: opts.workbookName ?? `Style registry (${registry.styles.length} style(s))`,
    profile: PROFILE_ID,
    description:
      opts.description ??
      `StyleRegistry ${registry.schemaVersion} — ${registry.styles.map((s) => s.identity.name).join(", ")}.`,
  })
    .primitives(projection.primitives)
    .relations(projection.relations)
    .commit();

  const slice = host.getProject(opts.workbookId);
  return {
    workbookId: opts.workbookId,
    profileId: PROFILE_ID,
    styleIds: projection.styleIds,
    primitives: Object.keys(slice.primitives).length,
    relations: Object.keys(slice.relations).length,
    byType: projection.byType,
  };
}

