/**
 * The registry as a reader sees it, assembled once for every renderer.
 *
 * The ingest takes a `StyleDefinition` apart into fifteen primitive types
 * and ten relation types. Every renderer has to put it back together, and
 * doing that walk once per renderer is how four views of the same registry
 * drift into disagreeing about it. This module owns the walk; the
 * renderers own only presentation.
 *
 * The view is deliberately lossy in one direction and lossless in the
 * other: it drops nothing the graph carries, but it resolves what the
 * graph only points at — a rule's exemplars become titles, a contrast
 * pair's token names become hexes with a computed ratio and a verdict.
 * Resolution belongs here because it is a fact about the registry, and a
 * fact stated three times is a fact that can be stated three ways.
 */

import {
  GRAMMAR_SECTIONS,
  RULE_SECTION_CODES,
  type GrammarSection,
} from "../schemas/style.js";
import { REL } from "../sidecar.js";
import { contrastRatio, wcagMinimumContrast } from "../invariants.js";
import type { RendererInput } from "../../../src/plugin/types.js";

// ── Primitive/relation shapes as the host hands them over ──────────────

interface P {
  id: string;
  type_id: string;
  field_values: Record<string, unknown>;
}
interface R {
  type_id: string;
  source_id: string;
  target_id: string;
  field_values?: Record<string, unknown>;
}

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

// ── The view ───────────────────────────────────────────────────────────

export interface PeriodView {
  kind: string;
  start: number | null;
  end?: number;
  /** "1919–1933", "1986–present", "unknown origin". */
  label: string;
}

export interface MovementView {
  id: string;
  movementId: string;
  name: string;
  aliases: string[];
  period: PeriodView;
  parentName?: string;
}

export interface RuleView {
  id: string;
  ruleId: string;
  kind: "requires" | "forbids";
  weight: "defining" | "strong" | "advisory";
  statement: string;
  /** Titles of the canonical references the rule cites. */
  exemplars: string[];
}

export interface GrammarSectionView {
  section: GrammarSection;
  code: string;
  /** False when the workbook holds no grammar primitive for this section. */
  present: boolean;
  /** Declared field values, `grammar_id` removed, in storage order. */
  fields: [string, unknown][];
  rules: RuleView[];
}

export interface PaletteEntryView {
  name: string;
  hex: string;
  role: string;
  printingOrigin?: string;
}

export interface ForbiddenColorView {
  name: string;
  hex?: string;
  reason: string;
  prohibitedBy: string;
}

export interface CheckView {
  checkId: string;
  kind: string;
  weight: string;
  description: string;
  /** `rule_id` of the rule this check tests, when the edge resolves. */
  testsRule?: string;
  /** Threshold expression or qualitative criterion, already flattened. */
  criterion: string;
}

export interface ReferenceView {
  role: "primary" | "secondary" | "counter-example";
  referenceId: string;
  title: string;
  creators: string[];
  year: number | null;
  medium: string;
  exemplifies: string;
  source: string;
}

export interface ContrastPairView {
  foreground: string;
  background: string;
  usage: string;
  /** Resolved from the colour-token table; absent when the name is unknown. */
  foregroundHex?: string;
  backgroundHex?: string;
  /** Present only when both hexes resolved. */
  ratio?: number;
  required?: number;
  pass?: boolean;
}

export interface TokensView {
  colors: { name: string; value: string }[];
  fontStacks: { role: string; stack: string }[];
  scale: { name: string; value: number }[];
  baseUnit?: number;
  strokeWeight?: number;
  timing: { character: string; timing: string }[];
  promptPositive?: string;
  promptNegative?: string;
  wcagVersion?: string;
  wcagLevel?: string;
  contrastPairs: ContrastPairView[];
}

export interface StyleView {
  id: string;
  styleId: string;
  name: string;
  code: string;
  locale: string;
  schemaVersion: string;
  period: PeriodView;
  aliases: string[];
  geographicCenters: string[];
  originMedium: string;
  parentMovement?: string;
  negates: string[];
  influences: string[];
  ornamentStance: string;
  machineAttitude: string;
  formFunctionRelation: string;
  humanRelation: string;
  axioms: { statement: string; source: string }[];
  grammar: GrammarSectionView[];
  palette: PaletteEntryView[];
  forbiddenColors: ForbiddenColorView[];
  typefaces: { role: string; classification: string; exemplars: string[] }[];
  minimumPassRatio?: number;
  checks: CheckView[];
  references: ReferenceView[];
  tokens: TokensView;
  /** Rule counts by weight, across every grammar section. */
  ruleWeights: { defining: number; strong: number; advisory: number };
}

export interface RegistryView {
  workbookId: string;
  profileId: string;
  movements: MovementView[];
  styles: StyleView[];
}

// ── Assembly ───────────────────────────────────────────────────────────

function periodOf(v: unknown): PeriodView {
  const o = (typeof v === "object" && v !== null ? v : {}) as Record<string, unknown>;
  const kind = str(o.kind) ?? "open";
  const start = num(o.start) ?? null;
  const end = num(o.end);
  const label =
    kind === "closed"
      ? `${start ?? "?"}–${end ?? "?"}`
      : start === null
        ? "unknown origin"
        : `${start}–present`;
  return end === undefined ? { kind, start, label } : { kind, start, end, label };
}

function originMediumOf(v: unknown): string {
  if (typeof v !== "object" || v === null) return "—";
  const o = v as Record<string, unknown>;
  const one = (c: Record<string, unknown>): string =>
    c.process ? `${String(c.family)} (${String(c.process)})` : String(c.family);
  if (o.kind === "mixed") {
    const parts = arr<Record<string, unknown>>(o.components).map(one);
    return parts.length > 0 ? parts.join(" + ") : "—";
  }
  return o.family === undefined ? "—" : one(o);
}

/**
 * The criterion a check actually asserts. The source models three arms on
 * one `kind` discriminant; flattening them here keeps every renderer from
 * re-deriving the same three-way branch.
 */
function criterionOf(f: Record<string, unknown>): string {
  switch (str(f.kind)) {
    case "threshold": {
      const unit = str(f.threshold_unit);
      return `${str(f.threshold_metric) ?? "?"} ${str(f.threshold_operator) ?? "?"} ${
        num(f.threshold_value) ?? "?"
      }${unit ? ` ${unit}` : ""}`;
    }
    case "qualitative":
      return str(f.criteria) ?? str(f.description) ?? "";
    default:
      return str(f.description) ?? "";
  }
}

/**
 * Resolve a WCAG pair against the colour-token table and score it.
 *
 * A pair naming a token that does not exist is reported unresolved rather
 * than scored against a substituted colour: a contrast verdict computed
 * from a guess is worse than no verdict, because it looks like a
 * measurement. `validateStyleWorkbook` is what rejects such a pair at
 * ingest; this view only has to avoid inventing one.
 */
function contrastOf(
  pairs: Record<string, unknown>[],
  tokens: Map<string, string>,
  level: string | undefined,
): ContrastPairView[] {
  return pairs.map((p) => {
    const foreground = str(p.foreground) ?? "";
    const background = str(p.background) ?? "";
    const usage = str(p.usage) ?? "";
    const fg = tokens.get(foreground);
    const bg = tokens.get(background);
    const view: ContrastPairView = { foreground, background, usage };
    if (fg !== undefined) view.foregroundHex = fg;
    if (bg !== undefined) view.backgroundHex = bg;
    const ratio = fg !== undefined && bg !== undefined ? contrastRatio(fg, bg) : undefined;
    const required = wcagMinimumContrast(level === "aaa" ? "aaa" : "aa", usage);
    if (ratio !== undefined && required !== undefined) {
      view.ratio = ratio;
      view.required = required;
      view.pass = ratio >= required;
    }
    return view;
  });
}

export function readRegistry(input: RendererInput): RegistryView {
  const primitives = input.primitives as unknown as P[];
  const relations = input.relations as unknown as R[];

  const byId = new Map(primitives.map((p) => [p.id, p]));
  const entity = (p: P): string => p.type_id.split(":").pop() ?? p.type_id;
  const out = (type: string, from: string): R[] =>
    relations.filter((r) => r.type_id === type && r.source_id === from);
  const nameOf = (id: string): string | undefined => str(byId.get(id)?.field_values.name);

  const movements: MovementView[] = primitives
    .filter((p) => entity(p) === "Movement")
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((m) => {
      const parent = out(REL.ParentMovement, m.id)[0];
      const parentName = parent ? nameOf(parent.target_id) : undefined;
      const view: MovementView = {
        id: m.id,
        movementId: str(m.field_values.movement_id) ?? m.id,
        name: str(m.field_values.name) ?? m.id,
        aliases: arr<string>(m.field_values.aliases),
        period: periodOf(m.field_values.period),
      };
      if (parentName !== undefined) view.parentName = parentName;
      return view;
    });

  const rulesOf = (grammarId: string): RuleView[] =>
    out(REL.DeclaresRule, grammarId)
      .map((r) => byId.get(r.target_id))
      .filter((p): p is P => p !== undefined)
      .map((p) => ({
        id: p.id,
        ruleId: str(p.field_values.rule_id) ?? p.id,
        kind: (str(p.field_values.kind) ?? "requires") as RuleView["kind"],
        weight: (str(p.field_values.weight) ?? "advisory") as RuleView["weight"],
        statement: str(p.field_values.statement) ?? "",
        exemplars: out(REL.CitesExemplar, p.id).map(
          (e) => str(byId.get(e.target_id)?.field_values.title) ?? e.target_id,
        ),
      }))
      .sort((a, b) => a.ruleId.localeCompare(b.ruleId));

  const styles: StyleView[] = primitives
    .filter((p) => entity(p) === "Style")
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((style) => {
      const f = style.field_values;

      const grammarBySection = new Map<GrammarSection, P>();
      for (const e of out(REL.HasGrammar, style.id)) {
        const section = str(e.field_values?.section) as GrammarSection | undefined;
        const target = byId.get(e.target_id);
        if (section && target && !grammarBySection.has(section)) grammarBySection.set(section, target);
      }

      const grammar: GrammarSectionView[] = GRAMMAR_SECTIONS.map((section) => {
        const g = grammarBySection.get(section);
        return {
          section,
          code: RULE_SECTION_CODES[section],
          present: g !== undefined,
          fields: g ? Object.entries(g.field_values).filter(([k]) => k !== "grammar_id") : [],
          rules: g ? rulesOf(g.id) : [],
        };
      });

      const colorSection = grammarBySection.get("color");
      const typeSection = grammarBySection.get("typography");

      const ruleWeights = { defining: 0, strong: 0, advisory: 0 };
      for (const section of grammar) {
        for (const rule of section.rules) ruleWeights[rule.weight] += 1;
      }

      const colorTokens = arr<Record<string, unknown>>(f.tokens_colors).map((t) => ({
        name: str(t.name) ?? "",
        value: str(t.value) ?? "",
      }));
      const tokenIndex = new Map(colorTokens.map((t) => [t.name, t.value]));

      const baseUnit = num(f.tokens_base_unit);
      const strokeWeight = num(f.tokens_stroke_weight);
      const promptPositive = str(f.tokens_prompt_positive);
      const promptNegative = str(f.tokens_prompt_negative);
      const wcagVersion = str(f.tokens_accessibility_version);
      const wcagLevel = str(f.tokens_accessibility_level);

      // The optional fields are spread in only when the graph carries them: an
      // absent token is not a token whose value is `undefined`.
      const tokens: TokensView = {
        colors: colorTokens,
        fontStacks: arr<Record<string, unknown>>(f.tokens_font_stacks).map((t) => ({
          role: str(t.role) ?? "",
          stack: str(t.stack) ?? "",
        })),
        scale: arr<Record<string, unknown>>(f.tokens_scale).map((t) => ({
          name: str(t.name) ?? "",
          value: num(t.value) ?? 0,
        })),
        timing: arr<Record<string, unknown>>(f.tokens_timing_map).map((t) => ({
          character: str(t.character) ?? "",
          timing: str(t.timing) ?? "",
        })),
        contrastPairs: contrastOf(
          arr<Record<string, unknown>>(f.tokens_contrast_pairs),
          tokenIndex,
          wcagLevel,
        ),
        ...(baseUnit !== undefined && { baseUnit }),
        ...(strokeWeight !== undefined && { strokeWeight }),
        ...(promptPositive !== undefined && { promptPositive }),
        ...(promptNegative !== undefined && { promptNegative }),
        ...(wcagVersion !== undefined && { wcagVersion }),
        ...(wcagLevel !== undefined && { wcagLevel }),
      };

      const references: ReferenceView[] = out(REL.HasReference, style.id)
        .map((e) => ({ edge: e, ref: byId.get(e.target_id) }))
        .filter((x): x is { edge: R; ref: P } => x.ref !== undefined)
        .map(({ edge, ref }) => ({
          role: (str(edge.field_values?.role) ?? "primary") as ReferenceView["role"],
          referenceId: str(ref.field_values.reference_id) ?? ref.id,
          title: str(ref.field_values.title) ?? ref.id,
          creators: arr<string>(ref.field_values.creators),
          year: num(ref.field_values.year) ?? null,
          medium: str(ref.field_values.medium) ?? "",
          exemplifies: str(ref.field_values.exemplifies) ?? "",
          source: str(ref.field_values.source) ?? "",
        }));

      const checks: CheckView[] = out(REL.DeclaresCheck, style.id)
        .map((r) => byId.get(r.target_id))
        .filter((p): p is P => p !== undefined)
        .map((c) => {
          const tested = out(REL.TestsRule, c.id)[0];
          const testsRule = tested
            ? (str(byId.get(tested.target_id)?.field_values.rule_id) ?? tested.target_id)
            : undefined;
          const view: CheckView = {
            checkId: str(c.field_values.check_id) ?? c.id,
            kind: str(c.field_values.kind) ?? "",
            weight: str(c.field_values.weight) ?? "",
            description: str(c.field_values.description) ?? "",
            criterion: criterionOf(c.field_values),
          };
          if (testsRule !== undefined) view.testsRule = testsRule;
          return view;
        })
        .sort((a, b) => a.checkId.localeCompare(b.checkId));

      const parentEdge = out(REL.BelongsToMovement, style.id)[0];
      const parentMovement = parentEdge ? nameOf(parentEdge.target_id) : undefined;

      const view: StyleView = {
        id: style.id,
        styleId: str(f.style_id) ?? style.id,
        name: str(f.name) ?? style.id,
        code: str(f.code) ?? "",
        locale: str(f.locale) ?? "en",
        schemaVersion: str(f.schema_version) ?? "",
        period: periodOf(f.period),
        aliases: arr<string>(f.aliases),
        geographicCenters: arr<string>(f.geographic_centers),
        originMedium: originMediumOf(f.origin_medium),
        negates: out(REL.NegatesMovement, style.id).map(
          (r) => nameOf(r.target_id) ?? r.target_id,
        ),
        influences: out(REL.InfluencesStyle, style.id).map(
          (r) => nameOf(r.target_id) ?? r.target_id,
        ),
        ornamentStance: str(f.ornament_stance) ?? "",
        machineAttitude: str(f.machine_attitude) ?? "",
        formFunctionRelation: str(f.form_function_relation) ?? "",
        humanRelation: str(f.human_relation) ?? "",
        axioms: arr<Record<string, unknown>>(f.axioms).map((a) => ({
          statement: str(a.statement) ?? "",
          source: str(a.source) ?? "",
        })),
        grammar,
        palette: arr<Record<string, unknown>>(colorSection?.field_values.palette).map((p) => {
          const entry: PaletteEntryView = {
            name: str(p.name) ?? "",
            hex: str(p.hex) ?? "",
            role: str(p.role) ?? "",
          };
          const origin = str(p.printing_origin);
          if (origin !== undefined) entry.printingOrigin = origin;
          return entry;
        }),
        forbiddenColors: arr<Record<string, unknown>>(
          colorSection?.field_values.forbidden_colors,
        ).map((c) => {
          const entry: ForbiddenColorView = {
            name: str(c.name) ?? "",
            reason: str(c.reason) ?? "",
            prohibitedBy: str(c.prohibited_by) ?? "",
          };
          const hex = str(c.hex);
          if (hex !== undefined) entry.hex = hex;
          return entry;
        }),
        typefaces: arr<Record<string, unknown>>(typeSection?.field_values.typefaces).map((t) => ({
          role: str(t.role) ?? "",
          classification: str(t.classification) ?? "",
          exemplars: arr<string>(t.exemplars),
        })),
        checks,
        references,
        tokens,
        ruleWeights,
      };
      if (parentMovement !== undefined) view.parentMovement = parentMovement;
      const ratio = num(f.minimum_pass_ratio);
      if (ratio !== undefined) view.minimumPassRatio = ratio;
      return view;
    });

  return {
    workbookId: input.workbookId,
    profileId: input.profile.id,
    movements,
    styles,
  };
}

// ── Shared presentation helpers ────────────────────────────────────────

/**
 * `#RGB` / `#RGBA` / `#RRGGBB` / `#RRGGBBAA` → the three 0-255 channels.
 *
 * Alpha is dropped rather than composited: every consumer here paints on
 * an opaque ground, and silently compositing against an assumed backdrop
 * would make the swatch a different colour from the one the style
 * declared. Returns null for anything that is not a hex colour, so a
 * caller must decide what to do about it.
 */
export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-fA-F]{3,8})$/.exec(hex);
  if (!m) return null;
  const d = m[1]!;
  const expand = (c: string): number => parseInt(c + c, 16);
  if (d.length === 3 || d.length === 4) {
    return [expand(d[0]!), expand(d[1]!), expand(d[2]!)];
  }
  if (d.length === 6 || d.length === 8) {
    return [
      parseInt(d.slice(0, 2), 16),
      parseInt(d.slice(2, 4), 16),
      parseInt(d.slice(4, 6), 16),
    ];
  }
  return null;
}

/**
 * Ink that stays legible on `hex`: whichever of black or white has the
 * greater contrast ratio against it. Used for the text printed inside a
 * swatch, where the swatch colour is chosen by the style and the label
 * has to survive it.
 */
export function readableInkOn(hex: string): "#000000" | "#FFFFFF" {
  const onBlack = contrastRatio("#000000", hex) ?? 1;
  const onWhite = contrastRatio("#FFFFFF", hex) ?? 1;
  return onBlack >= onWhite ? "#000000" : "#FFFFFF";
}
