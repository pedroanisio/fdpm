/**
 * Cross-entity invariants for profile:style:3.1.
 *
 * WHY THIS FILE EXISTS. The source schema implements 991 lines of
 * cross-field checks in `validateStyleDefinition()` /
 * `validateStyleRegistry()` over one whole `StyleDefinition` object graph.
 * In FDPM that graph is fifteen primitive types joined by ten relations,
 * and a `ValidatorFn` receives ONE instance plus the relations — never the
 * sibling primitives (src/plugin/types.ts `ValidatorContext`). So the
 * invariants split by scope:
 *
 *   - Confined to one entity  -> that entity's `superRefine` in
 *     schemas/style.ts, which the host runs on every write via safeParse
 *     (packages/zod-bridge/src/validator.ts:21).
 *   - Spanning entities       -> here.
 *
 * WHAT RUNS THEM. `buildStyleWorkbook()` runs `validateStyleWorkbook()`
 * before it writes anything, so an ingested workbook is invariant-clean by
 * construction. A workbook assembled by direct primitive writes is
 * field-valid but NOT invariant-checked until this is run against it; that
 * gap is declared in sidecar.ts `declaredLoss` under
 * `style.cross-entity-invariants`.
 *
 * The checks below are a port, not a redesign. Each carries the source
 * construct it realises so a reviewer can diff the two lists; the source's
 * own inventory is at style-schema.ts:2299-2318.
 */

import {
  CONSTRAINTS,
  HEX_COLOR_REGEX,
  RULE_SECTION_CODES,
  SECTION_ENTITY,
  GRAMMAR_SECTIONS,
  isOpaqueHexColor,
  type GrammarSection,
} from "./schemas/style.js";
import { GRAMMAR_ENTITIES, REL, VENDOR, type EntityName } from "./sidecar.js";

// ── Input surface ──────────────────────────────────────────────────────
//
// Deliberately structural rather than importing the host's
// PrimitiveInstance: these functions are also called on a not-yet-written
// projection during ingest, before any host object exists.

export interface PrimitiveLike {
  id: string;
  type_id: string;
  field_values: Record<string, unknown>;
}

export interface RelationLike {
  id: string;
  type_id: string;
  source_id: string;
  target_id: string;
  field_values?: Record<string, unknown>;
}

/** One invariant violation, addressed to the primitive that carries it. */
export interface Violation {
  /** Stable, greppable identifier of the invariant that fired. */
  rule_id: string;
  /** Primitive the violation is attributed to, or null for registry-wide. */
  target_id: string | null;
  message: string;
}

export interface WorkbookValidationResult {
  ok: boolean;
  violations: Violation[];
}

const RULE = (slug: string): string => `${VENDOR}:inv.${slug}`;

// ── Small helpers ──────────────────────────────────────────────────────

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function arr<T = unknown>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function entityOf(typeId: string): EntityName {
  return typeId.split(":").pop() as EntityName;
}

/**
 * WCAG 2.x relative luminance of an opaque sRGB colour, per the normative
 * definition. The channel-linearisation constants are the metric's
 * DEFINITION, fixed by the W3C, not editorial bounds — which is why they
 * are inline here and not in CONSTRAINTS, exactly as the source argues.
 * Returns undefined for a colour that has no WCAG-defined luminance.
 */
export function relativeLuminance(color: string): number | undefined {
  if (!HEX_COLOR_REGEX.test(color) || !isOpaqueHexColor(color)) return undefined;
  const linearChannel = (offset: number): number => {
    const c = parseInt(color.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linearChannel(1) + 0.7152 * linearChannel(3) + 0.0722 * linearChannel(5);
}

/** WCAG 2.x contrast ratio in [1, 21]. Symmetric in its arguments. */
export function contrastRatio(a: string, b: string): number | undefined {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === undefined || lb === undefined) return undefined;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** The applicable minimum from CONSTRAINTS.wcagContrastMinima. */
export function wcagMinimumContrast(level: "aa" | "aaa", usage: string): number | undefined {
  const row = CONSTRAINTS.wcagContrastMinima[level] as Record<string, number>;
  return row[usage];
}

/** Source `isHistoricalYear`: an integer, and never year zero. */
export function isHistoricalYear(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value !== 0;
}

// ── Indexed view of a workbook ─────────────────────────────────────────

interface Index {
  byId: Map<string, PrimitiveLike>;
  byEntity: Map<EntityName, PrimitiveLike[]>;
  /** relation type -> edges */
  edges: Map<string, RelationLike[]>;
  /** relation type -> source id -> targets */
  out: Map<string, Map<string, string[]>>;
  /** relation type -> target id -> sources */
  incoming: Map<string, Map<string, string[]>>;
}

function buildIndex(primitives: readonly PrimitiveLike[], relations: readonly RelationLike[]): Index {
  const byId = new Map<string, PrimitiveLike>();
  const byEntity = new Map<EntityName, PrimitiveLike[]>();
  for (const p of primitives) {
    byId.set(p.id, p);
    const e = entityOf(p.type_id);
    const bucket = byEntity.get(e);
    if (bucket) bucket.push(p);
    else byEntity.set(e, [p]);
  }
  const edges = new Map<string, RelationLike[]>();
  const out = new Map<string, Map<string, string[]>>();
  const incoming = new Map<string, Map<string, string[]>>();
  for (const r of relations) {
    const bucket = edges.get(r.type_id);
    if (bucket) bucket.push(r);
    else edges.set(r.type_id, [r]);

    let o = out.get(r.type_id);
    if (!o) out.set(r.type_id, (o = new Map()));
    const os = o.get(r.source_id);
    if (os) os.push(r.target_id);
    else o.set(r.source_id, [r.target_id]);

    let i = incoming.get(r.type_id);
    if (!i) incoming.set(r.type_id, (i = new Map()));
    const is = i.get(r.target_id);
    if (is) is.push(r.source_id);
    else i.set(r.target_id, [r.source_id]);
  }
  return { byId, byEntity, edges, out, incoming };
}

function targetsOf(ix: Index, relType: string, sourceId: string): string[] {
  return ix.out.get(relType)?.get(sourceId) ?? [];
}


// ═══════════════════════════════════════════════════════════════════════
// The entry point.
// ═══════════════════════════════════════════════════════════════════════

/**
 * Every cross-entity invariant of the profile, over a whole workbook.
 *
 * A workbook is one StyleRegistry: `Movement` and `CanonicalReference`
 * primitives are the registry's shared vocabulary, and each `Style` is one
 * document within it. Registry-level checks (id uniqueness, the movement
 * forest, self-influence) run once; document-level checks run per style.
 */
export function validateStyleWorkbook(
  primitives: readonly PrimitiveLike[],
  relations: readonly RelationLike[],
): WorkbookValidationResult {
  const ix = buildIndex(primitives, relations);
  const v: Violation[] = [];

  checkRegistryIdentity(ix, v);
  checkMovementForest(ix, v);

  for (const style of ix.byEntity.get("Style") ?? []) {
    checkGrammarComposition(ix, style, v);
    checkRules(ix, style, v);
    checkChecks(ix, style, v);
    checkReferences(ix, style, v);
    checkForbiddenColors(ix, style, v);
    checkCoherence(ix, style, v);
    checkStrokeDerivation(ix, style, v);
    checkWcagContract(ix, style, v);
    checkInfluence(ix, style, v);
  }

  return { ok: v.length === 0, violations: v };
}

// ── Registry identity and lineage ──────────────────────────────────────

/**
 * Source `validateStyleRegistry`: style ids, style codes, movement ids and
 * reference ids are each unique across the registry, and every reference id
 * sits in the lowercase namespace of the style that owns it (checked in
 * checkReferences).
 */
function checkRegistryIdentity(ix: Index, v: Violation[]): void {
  const seenCode = new Map<string, string>();
  for (const s of ix.byEntity.get("Style") ?? []) {
    const code = str(s.field_values.code);
    if (code === undefined) continue;
    const prior = seenCode.get(code);
    if (prior !== undefined) {
      v.push({
        rule_id: RULE("registry.duplicate-style-code"),
        target_id: s.id,
        message: `style code "${code}" is already used by ${prior}; codes namespace rule and check ids and must be unique across the registry`,
      });
    } else {
      seenCode.set(code, s.id);
    }
  }
  // Primitive ids are unique by construction in a workbook (the host keys
  // on them), so style_id / movement_id / reference_id uniqueness follows
  // from the id template — except where two primitives carry the same
  // logical id under different type prefixes, which the templates prevent.
}

/**
 * Source GRAPH_TOPOLOGY.parentMovement: cycles FORBIDDEN, shape "forest".
 * A movement may have at most one parent, and following parents must
 * terminate.
 */
function checkMovementForest(ix: Index, v: Violation[]): void {
  const movements = ix.byEntity.get("Movement") ?? [];
  for (const m of movements) {
    const parents = targetsOf(ix, REL.ParentMovement, m.id);
    if (parents.length > 1) {
      v.push({
        rule_id: RULE("movement.multiple-parents"),
        target_id: m.id,
        message: `a movement has at most one parent; found ${parents.length} (${parents.join(", ")})`,
      });
    }
    if (parents.includes(m.id)) {
      v.push({
        rule_id: RULE("movement.self-parent"),
        target_id: m.id,
        message: "a movement cannot be its own parent",
      });
    }
  }
  // Cycle detection over the parent edges.
  const state = new Map<string, "visiting" | "done">();
  const walk = (id: string, path: string[]): void => {
    const mark = state.get(id);
    if (mark === "done") return;
    if (mark === "visiting") {
      const cycle = [...path.slice(path.indexOf(id)), id].join(" -> ");
      v.push({
        rule_id: RULE("movement.parent-cycle"),
        target_id: id,
        message: `GRAPH_TOPOLOGY forbids cycles in parent_movement; found ${cycle}`,
      });
      return;
    }
    state.set(id, "visiting");
    for (const parent of targetsOf(ix, REL.ParentMovement, id)) {
      if (parent !== id) walk(parent, [...path, id]);
    }
    state.set(id, "done");
  };
  for (const m of movements) walk(m.id, []);
}

/**
 * Source GRAPH_TOPOLOGY.influencedStyles: cycles PERMITTED (reciprocal
 * avant-garde exchange is attested), self-loops are not.
 */
function checkInfluence(ix: Index, style: PrimitiveLike, v: Violation[]): void {
  if (targetsOf(ix, REL.InfluencesStyle, style.id).includes(style.id)) {
    v.push({
      rule_id: RULE("style.self-influence"),
      target_id: style.id,
      message: "a style cannot influence itself",
    });
  }
}

// ── Grammar composition ────────────────────────────────────────────────

/**
 * The source models `grammar` as an object with ten required keys, so a
 * style is structurally incapable of missing one. As relations that
 * guarantee has to be asserted: exactly one edge per section, and the
 * edge's `section` field must match the target's entity type.
 */
function checkGrammarComposition(ix: Index, style: PrimitiveLike, v: Violation[]): void {
  const edges = (ix.edges.get(REL.HasGrammar) ?? []).filter((e) => e.source_id === style.id);
  const bySection = new Map<string, RelationLike[]>();
  for (const e of edges) {
    const section = str(e.field_values?.section) ?? "<missing>";
    const bucket = bySection.get(section);
    if (bucket) bucket.push(e);
    else bySection.set(section, [e]);
  }
  for (const section of GRAMMAR_SECTIONS) {
    const found = bySection.get(section) ?? [];
    if (found.length === 0) {
      v.push({
        rule_id: RULE("grammar.section-missing"),
        target_id: style.id,
        message: `no grammar section "${section}"; a style declares all ten (${GRAMMAR_SECTIONS.join(", ")})`,
      });
      continue;
    }
    if (found.length > 1) {
      v.push({
        rule_id: RULE("grammar.section-duplicated"),
        target_id: style.id,
        message: `grammar section "${section}" is declared ${found.length} times; exactly one is permitted`,
      });
    }
    const expected = SECTION_ENTITY[section];
    for (const e of found) {
      const target = ix.byId.get(e.target_id);
      if (!target) continue; // host relation pipeline rejects this first
      const actual = entityOf(target.type_id);
      if (actual !== expected) {
        v.push({
          rule_id: RULE("grammar.section-type-mismatch"),
          target_id: e.target_id,
          message: `edge declares section "${section}" (expects ${expected}) but the target is a ${actual}`,
        });
      }
    }
  }
  for (const section of bySection.keys()) {
    if (!(GRAMMAR_SECTIONS as string[]).includes(section)) {
      v.push({
        rule_id: RULE("grammar.section-unknown"),
        target_id: style.id,
        message: `unknown grammar section "${section}"`,
      });
    }
  }
}

/** Every grammar primitive reachable from a style, keyed by section. */
function grammarOf(ix: Index, style: PrimitiveLike): Map<GrammarSection, PrimitiveLike> {
  const out = new Map<GrammarSection, PrimitiveLike>();
  for (const e of ix.edges.get(REL.HasGrammar) ?? []) {
    if (e.source_id !== style.id) continue;
    const section = str(e.field_values?.section) as GrammarSection | undefined;
    const target = ix.byId.get(e.target_id);
    if (section && target && !out.has(section)) out.set(section, target);
  }
  return out;
}

/** Every rule declared by any grammar section of a style. */
function rulesOf(ix: Index, style: PrimitiveLike): { rule: PrimitiveLike; section: GrammarSection }[] {
  const found: { rule: PrimitiveLike; section: GrammarSection }[] = [];
  for (const [section, grammar] of grammarOf(ix, style)) {
    for (const ruleId of targetsOf(ix, REL.DeclaresRule, grammar.id)) {
      const rule = ix.byId.get(ruleId);
      if (rule) found.push({ rule, section });
    }
  }
  return found;
}

// ── Rules ──────────────────────────────────────────────────────────────

/**
 * Source: rule bucket kind/namespace/section/P-form agreement, the
 * defining-rule exemplar requirement, global rule-id uniqueness within a
 * style, and "at least one requirement or prohibition is required".
 */
function checkRules(ix: Index, style: PrimitiveLike, v: Violation[]): void {
  const code = str(style.field_values.code);
  const rules = rulesOf(ix, style);

  if (rules.length === 0) {
    v.push({
      rule_id: RULE("rule.none-declared"),
      target_id: style.id,
      message: "at least one requirement or prohibition is required across the grammar",
    });
  }

  const seen = new Map<string, string>();
  for (const { rule, section } of rules) {
    const id = str(rule.field_values.rule_id) ?? rule.id;
    const kind = str(rule.field_values.kind);
    const declaredSection = str(rule.field_values.section);

    const prior = seen.get(id);
    if (prior !== undefined && prior !== rule.id) {
      v.push({
        rule_id: RULE("rule.duplicate-id"),
        target_id: rule.id,
        message: `duplicate RuleId "${id}"; rule ids are globally unique within a style`,
      });
    }
    seen.set(id, rule.id);

    // The section a rule declares must be the section that declares it.
    if (declaredSection !== undefined && declaredSection !== section) {
      v.push({
        rule_id: RULE("rule.section-disagreement"),
        target_id: rule.id,
        message: `rule declares section "${declaredSection}" but is declared by the "${section}" grammar`,
      });
    }

    // Namespace: <CODE>-<SECTION LETTER>-[P]<n>.
    if (code !== undefined && !id.startsWith(`${code}-`)) {
      v.push({
        rule_id: RULE("rule.code-namespace"),
        target_id: rule.id,
        message: `RuleId "${id}" must use the style code namespace "${code}-"`,
      });
    }
    const letter = RULE_SECTION_CODES[section];
    const expectedPrefix = code !== undefined ? `${code}-${letter}-` : `-${letter}-`;
    if (code !== undefined && !id.startsWith(expectedPrefix)) {
      v.push({
        rule_id: RULE("rule.section-namespace"),
        target_id: rule.id,
        message: `RuleId "${id}" must use the section namespace "${expectedPrefix}"`,
      });
    }

    // P-form <-> prohibition.
    const isPForm = /-P\d{1,3}$/.test(id);
    if (kind === "forbids" && !isPForm) {
      v.push({
        rule_id: RULE("rule.prohibition-p-form"),
        target_id: rule.id,
        message: `prohibition "${id}" must use the P-number form, e.g. ${expectedPrefix}P01`,
      });
    }
    if (kind === "requires" && isPForm) {
      v.push({
        rule_id: RULE("rule.requirement-p-form"),
        target_id: rule.id,
        message: `requirement "${id}" must not use the P-number form; P is reserved for prohibitions`,
      });
    }

    // A defining rule must cite at least one exemplar. The claims that can
    // disqualify an artifact are exactly the ones anchored to a named work.
    if (str(rule.field_values.weight) === "defining") {
      if (targetsOf(ix, REL.CitesExemplar, rule.id).length === 0) {
        v.push({
          rule_id: RULE("rule.defining-without-exemplar"),
          target_id: rule.id,
          message: `defining rule "${id}" must cite at least one canonical reference as an exemplar`,
        });
      }
    }

    // Exemplar dedup.
    const exemplars = targetsOf(ix, REL.CitesExemplar, rule.id);
    const dupes = exemplars.filter((e, i) => exemplars.indexOf(e) !== i);
    for (const d of new Set(dupes)) {
      v.push({
        rule_id: RULE("rule.duplicate-exemplar"),
        target_id: rule.id,
        message: `duplicate exemplar edge to ${d}`,
      });
    }
  }
}

// ── Compliance checks ──────────────────────────────────────────────────

/**
 * Source: compliance id namespace, `testsRule` existence, weight alignment
 * between a check and the rule it tests, and non-advisory rule coverage.
 */
function checkChecks(ix: Index, style: PrimitiveLike, v: Violation[]): void {
  const code = str(style.field_values.code);
  const checkIds = targetsOf(ix, REL.DeclaresCheck, style.id);
  const checks = checkIds.map((id) => ix.byId.get(id)).filter((p): p is PrimitiveLike => p !== undefined);

  if (checks.length === 0) {
    v.push({
      rule_id: RULE("check.none-declared"),
      target_id: style.id,
      message: "compliance requires at least one check",
    });
  }

  const rules = rulesOf(ix, style);
  const rulesByPrimitiveId = new Map(rules.map((r) => [r.rule.id, r.rule]));
  const testedRuleIds = new Set<string>();
  const seen = new Map<string, string>();

  for (const check of checks) {
    const id = str(check.field_values.check_id) ?? check.id;

    const prior = seen.get(id);
    if (prior !== undefined && prior !== check.id) {
      v.push({
        rule_id: RULE("check.duplicate-id"),
        target_id: check.id,
        message: `duplicate CheckId "${id}"`,
      });
    }
    seen.set(id, check.id);

    if (code !== undefined && !id.startsWith(`CC-${code}-`)) {
      v.push({
        rule_id: RULE("check.code-namespace"),
        target_id: check.id,
        message: `CheckId "${id}" must use the style code namespace "CC-${code}-"`,
      });
    }

    const tested = targetsOf(ix, REL.TestsRule, check.id);
    if (tested.length !== 1) {
      v.push({
        rule_id: RULE("check.tests-exactly-one-rule"),
        target_id: check.id,
        message: `a check operationalises exactly one rule; found ${tested.length}`,
      });
      continue;
    }
    const rulePrimitiveId = tested[0]!;
    testedRuleIds.add(rulePrimitiveId);

    const rule = rulesByPrimitiveId.get(rulePrimitiveId);
    if (!rule) {
      v.push({
        rule_id: RULE("check.tests-foreign-rule"),
        target_id: check.id,
        message: `tests ${rulePrimitiveId}, which is not a rule declared by this style's grammar`,
      });
      continue;
    }
    const checkWeight = str(check.field_values.weight);
    const ruleWeight = str(rule.field_values.weight);
    if (checkWeight !== ruleWeight) {
      v.push({
        rule_id: RULE("check.weight-misaligned"),
        target_id: check.id,
        message: `check weight "${checkWeight}" must equal the weight of the rule it tests ("${ruleWeight}")`,
      });
    }
  }

  // Every conformance-affecting rule must have at least one check.
  for (const { rule } of rules) {
    const weight = str(rule.field_values.weight);
    if (weight !== "advisory" && !testedRuleIds.has(rule.id)) {
      v.push({
        rule_id: RULE("rule.uncovered-by-check"),
        target_id: rule.id,
        message: `${weight} rule "${str(rule.field_values.rule_id) ?? rule.id}" has no corresponding compliance check`,
      });
    }
  }
}

// ── Canonical references ───────────────────────────────────────────────

/**
 * Source: at least one primary reference and one counter-example, the
 * lowercase-code reference namespace, historical-year validity, and
 * exemplar resolution — an exemplar must be a primary or secondary
 * reference of the same style, never a counter-example.
 */
function checkReferences(ix: Index, style: PrimitiveLike, v: Violation[]): void {
  const code = str(style.field_values.code);
  const edges = (ix.edges.get(REL.HasReference) ?? []).filter((e) => e.source_id === style.id);

  const byRole = new Map<string, string[]>();
  for (const e of edges) {
    const role = str(e.field_values?.role) ?? "<missing>";
    const bucket = byRole.get(role);
    if (bucket) bucket.push(e.target_id);
    else byRole.set(role, [e.target_id]);
  }

  if ((byRole.get("primary") ?? []).length === 0) {
    v.push({
      rule_id: RULE("reference.primary-required"),
      target_id: style.id,
      message: "at least one primary canonical reference is required",
    });
  }
  if ((byRole.get("counter-example") ?? []).length === 0) {
    v.push({
      rule_id: RULE("reference.counter-example-required"),
      target_id: style.id,
      message: "at least one counter-example is required — boundary definition matters",
    });
  }

  // A work occupies exactly one bucket for a given style.
  const bucketOf = new Map<string, string>();
  for (const [role, ids] of byRole) {
    for (const id of ids) {
      const prior = bucketOf.get(id);
      if (prior !== undefined && prior !== role) {
        v.push({
          rule_id: RULE("reference.multiple-buckets"),
          target_id: id,
          message: `reference occupies both the "${prior}" and "${role}" buckets of this style`,
        });
      } else {
        bucketOf.set(id, role);
      }
    }
  }

  const lowerPrefix = code !== undefined ? `${code.toLocaleLowerCase("en-US")}-` : undefined;
  for (const id of bucketOf.keys()) {
    const ref = ix.byId.get(id);
    if (!ref) continue;
    const refId = str(ref.field_values.reference_id) ?? "";
    if (lowerPrefix !== undefined && !refId.startsWith(lowerPrefix)) {
      v.push({
        rule_id: RULE("reference.code-namespace"),
        target_id: id,
        message: `ReferenceId "${refId}" must use the lowercase style-code namespace "${lowerPrefix}"`,
      });
    }
    const year = ref.field_values.year;
    if (year !== null && year !== undefined && !isHistoricalYear(year)) {
      v.push({
        rule_id: RULE("reference.invalid-year"),
        target_id: id,
        message: `invalid historical year ${String(year)}; year zero does not exist in the proleptic calendar`,
      });
    }
  }

  // Exemplars resolve against primary + secondary only.
  const exemplarBaseline = new Set([...(byRole.get("primary") ?? []), ...(byRole.get("secondary") ?? [])]);
  for (const { rule } of rulesOf(ix, style)) {
    for (const exemplar of targetsOf(ix, REL.CitesExemplar, rule.id)) {
      if (!exemplarBaseline.has(exemplar)) {
        const bucket = bucketOf.get(exemplar);
        v.push({
          rule_id: RULE("rule.exemplar-unresolved"),
          target_id: rule.id,
          message:
            bucket === undefined
              ? `exemplar ${exemplar} is not a reference of this style`
              : `exemplar ${exemplar} is a "${bucket}" of this style; exemplars must be primary or secondary`,
        });
      }
    }
  }
}

// ── Forbidden colours ──────────────────────────────────────────────────

/**
 * Source: a ForbiddenColor's `prohibitedBy` must name an existing
 * prohibition of the SAME colour section. This closes the loop between the
 * palette and the prohibitions array.
 */
function checkForbiddenColors(ix: Index, style: PrimitiveLike, v: Violation[]): void {
  const color = grammarOf(ix, style).get("color");
  if (!color) return;

  const prohibitions = new Set<string>();
  for (const ruleId of targetsOf(ix, REL.DeclaresRule, color.id)) {
    const rule = ix.byId.get(ruleId);
    if (rule && str(rule.field_values.kind) === "forbids") {
      const id = str(rule.field_values.rule_id);
      if (id !== undefined) prohibitions.add(id);
    }
  }

  for (const fc of arr<Record<string, unknown>>(color.field_values.forbidden_colors)) {
    const by = str(fc.prohibited_by);
    const name = str(fc.name) ?? "<unnamed>";
    if (by === undefined) continue;
    if (!prohibitions.has(by)) {
      v.push({
        rule_id: RULE("color.forbidden-without-prohibition"),
        target_id: color.id,
        message: `forbidden colour "${name}": prohibited_by "${by}" is not a prohibition declared by this colour grammar`,
      });
    }
  }
}

// ── Grammar <-> token coherence ────────────────────────────────────────

/**
 * Source "Token kind discriminators must agree with grammar activeness"
 * plus the bimodal/lighting tonal-coherence rule.
 */
function checkCoherence(ix: Index, style: PrimitiveLike, v: Violation[]): void {
  const g = grammarOf(ix, style);
  const f = style.field_values;

  // Motion: the two discriminators are the same fact.
  const motion = g.get("motion");
  if (motion) {
    const animated = str(motion.field_values.kind) === "animated";
    const rendered = str(f.tokens_motion_kind) === "rendered";
    if (animated !== rendered) {
      v.push({
        rule_id: RULE("coherence.motion-kind"),
        target_id: style.id,
        message: `grammar motion kind "${str(motion.field_values.kind)}" does not agree with tokens_motion_kind "${str(f.tokens_motion_kind)}"`,
      });
    }
  }

  // Typography: declared typefaces require a rendered type token section.
  const typography = g.get("typography");
  if (typography) {
    const typefaces = arr<Record<string, unknown>>(typography.field_values.typefaces);
    const rendered = str(f.tokens_typography_kind) === "rendered";
    if (typefaces.length > 0 && !rendered) {
      v.push({
        rule_id: RULE("coherence.typography-omitted"),
        target_id: style.id,
        message: 'grammar declares typefaces but tokens_typography_kind is "omitted"',
      });
    }
    if (typefaces.length === 0 && rendered) {
      v.push({
        rule_id: RULE("coherence.typography-rendered"),
        target_id: style.id,
        message: 'tokens_typography_kind is "rendered" but the grammar declares no typefaces',
      });
    }
    // Each declared role needs a font stack, and each weight step in the
    // role's range needs a weight-map entry.
    if (rendered) {
      const stacks = new Set(
        arr<Record<string, unknown>>(f.tokens_font_stacks).map((s) => str(s.role) ?? ""),
      );
      const weights = new Set(
        arr<Record<string, unknown>>(f.tokens_weight_map).map((w) => num(w.step) ?? -1),
      );
      for (const tf of typefaces) {
        const role = str(tf.role);
        if (role === undefined) continue;
        if (!stacks.has(role)) {
          v.push({
            rule_id: RULE("coherence.font-stack-missing"),
            target_id: style.id,
            message: `tokens_font_stacks has no entry for the declared typeface role "${role}"`,
          });
        }
        const min = num(tf.weight_min);
        const span = num(tf.weight_span);
        if (min === undefined || span === undefined) continue;
        // Clamp so an already-reported overflow does not spray extra errors.
        const max = Math.min(min + span, 9);
        for (let step = min; step <= max; step += 1) {
          if (!weights.has(step)) {
            v.push({
              rule_id: RULE("coherence.weight-map-missing"),
              target_id: style.id,
              message: `tokens_weight_map has no entry for step ${step}, required by typeface role "${role}"`,
            });
          }
        }
      }
    }
  }

  // Colour: a non-empty palette requires rendered colour tokens.
  const color = g.get("color");
  if (color) {
    const palette = arr(color.field_values.palette);
    if (palette.length > 0 && str(f.tokens_colors_kind) !== "rendered") {
      v.push({
        rule_id: RULE("coherence.colors-omitted"),
        target_id: style.id,
        message: 'grammar colour palette is non-empty but tokens_colors_kind is "omitted"',
      });
    }
  }

  // Spacing: any grammar that speaks in abstract Length needs a base unit.
  const line = g.get("line");
  const composition = g.get("composition");
  const usesAbstractLength =
    (line !== undefined && str(line.field_values.kind) === "lines") ||
    (typography !== undefined && str(typography.field_values.baseline_grid_kind) === "grid") ||
    (composition !== undefined &&
      ["modular-grid", "panel-grid"].includes(str(composition.field_values.layout_kind) ?? ""));
  if (usesAbstractLength && str(f.tokens_spacing_kind) !== "rendered") {
    v.push({
      rule_id: RULE("coherence.spacing-omitted"),
      target_id: style.id,
      message: 'the grammar uses abstract Length values but tokens_spacing_kind is "omitted"',
    });
  }

  // Tonal coherence: value endpoints only cannot render continuous shading.
  const contrast = g.get("contrast");
  if (contrast && color && str(contrast.field_values.tonal_range) === "bimodal") {
    const lightingKind = str(color.field_values.lighting_kind);
    const treatment = str(color.field_values.lighting_treatment);
    const continuous = lightingKind === "full-pbr" || (lightingKind === "rendered" && treatment === "soft-gradient");
    if (continuous) {
      v.push({
        rule_id: RULE("coherence.bimodal-continuous-shading"),
        target_id: style.id,
        message: `tonal_range "bimodal" (value endpoints only) is incompatible with continuous shading (lighting ${lightingKind === "full-pbr" ? '"full-pbr"' : 'treatment "soft-gradient"'})`,
      });
    }
  }
}

/**
 * Source: `tokens.shape.strokeWeight` is a DERIVED-CACHED rendering of the
 * grammar stroke, not an independent fact. Tolerance is
 * CONSTRAINTS.derivationToleranceRatio.
 */
function checkStrokeDerivation(ix: Index, style: PrimitiveLike, v: Violation[]): void {
  const f = style.field_values;
  if (str(f.tokens_shape_kind) !== "rendered") return;
  const sw = num(f.tokens_stroke_weight);
  if (sw === undefined) return;

  const line = grammarOf(ix, style).get("line");
  if (!line) return;
  const lineKind = str(line.field_values.kind);

  if (lineKind === "no-lines") {
    if (sw !== 0) {
      v.push({
        rule_id: RULE("derivation.stroke-weight-no-lines"),
        target_id: style.id,
        message: `grammar line kind is "no-lines" so tokens_stroke_weight must be 0 (UI hairlines are an implementing-medium concern); got ${sw}`,
      });
    }
    return;
  }

  if (str(f.tokens_spacing_kind) !== "rendered") return;
  const base = num(f.tokens_base_unit);
  if (base === undefined || base <= 0) return;

  const tol = CONSTRAINTS.derivationToleranceRatio;
  const strokeKind = str(line.field_values.stroke_kind);
  if (strokeKind === "uniform") {
    const weight = num(line.field_values.stroke_weight);
    if (weight === undefined) return;
    const expected = weight * base;
    if (Math.abs(sw - expected) > tol * Math.max(1, Math.abs(expected))) {
      v.push({
        rule_id: RULE("derivation.stroke-weight-uniform"),
        target_id: style.id,
        message: `tokens_stroke_weight (${sw}) must equal grammar stroke ${weight} × base unit ${base} = ${expected}`,
      });
    }
    return;
  }

  const lo = num(line.field_values.stroke_weight_min);
  const hi = num(line.field_values.stroke_weight_max);
  if (lo === undefined || hi === undefined) return;
  const loPx = lo * base;
  const hiPx = hi * base;
  const slack = tol * Math.max(1, Math.abs(hiPx));
  if (sw < loPx - slack || sw > hiPx + slack) {
    v.push({
      rule_id: RULE("derivation.stroke-weight-band"),
      target_id: style.id,
      message: `tokens_stroke_weight (${sw}) must lie within the grammar stroke band [${loPx}, ${hiPx}] px (stroke_weight_min/max × base unit)`,
    });
  }
}

// ── WCAG contrast contract ─────────────────────────────────────────────

/**
 * Source "WCAG contrast contract" invariants that need the colour token
 * table: pair resolution, opacity, and the ratio itself. The pair-level
 * checks that do not need arithmetic (dedup, the SC 1.4.11 version gate,
 * the rendered-colours dependency) are already in the Style superRefine;
 * this adds what only the numbers can decide.
 */
function checkWcagContract(ix: Index, style: PrimitiveLike, v: Violation[]): void {
  const f = style.field_values;
  if (str(f.tokens_accessibility_kind) !== "wcag") return;
  const level = str(f.tokens_accessibility_level) as "aa" | "aaa" | undefined;
  if (level === undefined) return;

  const tokens = new Map<string, string>();
  for (const t of arr<Record<string, unknown>>(f.tokens_colors)) {
    const name = str(t.name);
    const value = str(t.value);
    if (name !== undefined && value !== undefined) tokens.set(name, value);
  }

  arr<Record<string, unknown>>(f.tokens_contrast_pairs).forEach((pair, i) => {
    const fg = str(pair.foreground);
    const bg = str(pair.background);
    const usage = str(pair.usage);
    if (fg === undefined || bg === undefined || usage === undefined) return;
    const path = `tokens_contrast_pairs[${i}]`;

    if (fg === bg) {
      v.push({
        rule_id: RULE("wcag.same-token"),
        target_id: style.id,
        message: `${path}: foreground and background reference the same token "${fg}"`,
      });
      return;
    }

    let resolvable = true;
    for (const [side, name] of [
      ["foreground", fg],
      ["background", bg],
    ] as const) {
      const value = tokens.get(name);
      if (value === undefined) {
        v.push({
          rule_id: RULE("wcag.token-unresolved"),
          target_id: style.id,
          message: `${path}.${side}: no colour token named "${name}"`,
        });
        resolvable = false;
        continue;
      }
      if (!HEX_COLOR_REGEX.test(value)) {
        // Already reported by the Style validator; the ratio is
        // uncomputable, so skip it quietly here.
        resolvable = false;
      } else if (!isOpaqueHexColor(value)) {
        v.push({
          rule_id: RULE("wcag.translucent-token"),
          target_id: style.id,
          message: `${path}.${side}: token "${name}" (${value}) is translucent — WCAG contrast requires opaque colours; composite against the backdrop first`,
        });
        resolvable = false;
      }
    }
    if (!resolvable) return;

    const observed = contrastRatio(tokens.get(fg)!, tokens.get(bg)!);
    const minimum = wcagMinimumContrast(level, usage);
    if (observed === undefined || minimum === undefined) return;
    if (observed < minimum) {
      v.push({
        rule_id: RULE("wcag.below-minimum"),
        target_id: style.id,
        message: `${path}: contrast ${observed.toFixed(2)}:1 between "${fg}" and "${bg}" is below the WCAG ${level.toUpperCase()} ${usage} minimum of ${minimum}:1`,
      });
    }
  });
}

/** Entity names that carry a grammar section, for consumers of this module. */
export { GRAMMAR_ENTITIES };
