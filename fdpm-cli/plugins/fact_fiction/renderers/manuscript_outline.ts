/**
 * `text/markdown` manuscript-outline renderer for fact-fiction workbooks.
 *
 * The review document: the thing a historical consultant reads. It owns
 * the two read-side responsibilities the graph cannot express
 * declaratively:
 *
 *   1. STYLE CASCADE — effective narrative style per scene, merged
 *      work → arc → chapter → scene from the style_override JSON
 *      blobs, most specific wins, scalar replace (the spike's
 *      NarrativeStyleOverrideSchema semantics).
 *   2. EPISTEMIC SURFACING — facts with no ff:Cites edge print
 *      UNCITED, facts with no ff:Assessment print UNASSESSED,
 *      disputed facts print DISPUTED. These mirror the warning rules
 *      ff:val:fact-cited etc., so the document and validateProject
 *      tell the same story.
 *
 * Determinism: iteration is sorted by id or by the explicit `order`
 * edge metadata (ties broken by target id); no clock, no randomness.
 */
import type { RendererFn, RendererOutput } from "../../../src/plugin/types.js";
import type {
  PrimitiveInstance,
  RelationInstance,
} from "../../../src/core/models/instance.js";

const STYLE_KEYS = [
  "pov",
  "temporal_mode",
  "tone_primary",
  "narrator_distance",
  "narrative_reliability",
  "archaic_level",
  "modern_intrusion_allowed",
  "idiomatic_freedom",
  "real_figures_inner_thoughts_allowed",
  "invented_inner_thoughts_allowed",
] as const;

function fv<T = unknown>(p: PrimitiveInstance, key: string): T | undefined {
  return (p.field_values as Record<string, unknown>)[key] as T | undefined;
}

function relFv<T = unknown>(r: RelationInstance, key: string): T | undefined {
  return (r.field_values as Record<string, unknown>)[key] as T | undefined;
}

function escapeMd(s: string): string {
  return s.replace(/([\\`*_\[\]<])/g, "\\$1");
}

/**
 * A field value for prose. `String(undefined)` is "undefined", which a
 * malformed or half-built workbook then prints into the review document;
 * a missing value reads as an em dash instead.
 */
function show(v: unknown): string {
  return v === undefined || v === null ? "—" : String(v);
}

type Style = Record<string, unknown>;

/** Overlay a style_override blob; supplied keys replace, others inherit. */
function mergeStyle(base: Style, p: PrimitiveInstance | undefined): Style {
  const override = p ? fv<Record<string, unknown>>(p, "style_override") : undefined;
  if (!override || typeof override !== "object" || Array.isArray(override)) return base;
  const merged: Style = { ...base };
  for (const key of STYLE_KEYS) {
    if (key in override && override[key] != null) merged[key] = override[key];
  }
  return merged;
}

/** The style keys that changed vs the work's global style, else a summary. */
function styleLine(effective: Style, global_: Style): string {
  const parts: string[] = [];
  for (const key of STYLE_KEYS) {
    if (effective[key] !== global_[key]) parts.push(`${key}: ${show(effective[key])}`);
  }
  return parts.length > 0 ? `style: ${parts.join(", ")} (inherited otherwise)` : "style: inherited";
}

export const renderManuscriptOutline: RendererFn = (input): RendererOutput => {
  const { primitives, relations } = input;

  const byId = new Map<string, PrimitiveInstance>();
  for (const p of primitives) byId.set(p.id, p);
  const ofType = (typeId: string): PrimitiveInstance[] =>
    primitives.filter((p) => p.type_id === typeId).sort((a, b) => a.id.localeCompare(b.id));
  const edges = (typeId: string): RelationInstance[] =>
    relations.filter((r) => r.type_id === typeId);
  const outgoing = (typeId: string, sourceId: string): RelationInstance[] =>
    edges(typeId)
      .filter((r) => r.source_id === sourceId)
      .sort(
        (a, b) =>
          (Number(relFv(a, "order") ?? 0) - Number(relFv(b, "order") ?? 0)) ||
          a.target_id.localeCompare(b.target_id),
      );

  const works = ofType("ff:Work");
  const facts = ofType("ff:Fact");
  const sources = ofType("ff:Source");
  const assessments = ofType("ff:Assessment");
  const fictions = ofType("ff:FictionElement");
  const constraints = ofType("ff:Constraint");

  const lines: string[] = [];
  const label = (id: string, key = "label"): string => {
    const p = byId.get(id);
    if (!p) return id;
    return escapeMd(String(fv(p, key) ?? fv(p, "title") ?? fv(p, "label") ?? id));
  };

  for (const work of works) {
    lines.push(`# ${escapeMd(String(fv(work, "title") ?? work.id))}`);
    lines.push("");
    lines.push(`*${escapeMd(String(fv(work, "historical_period") ?? ""))}*`);
    const start = fv<string>(work, "world_start");
    const end = fv<string>(work, "world_end");
    if (start || end) lines.push(`World boundary: ${escapeMd(start ?? "…")} → ${escapeMd(end ?? "…")}`);
    const regions = fv<string[]>(work, "regions");
    if (regions?.length) lines.push(`Regions: ${regions.map(escapeMd).join(", ")}`);
    lines.push("");
    const globalStyle: Style = {};
    for (const key of STYLE_KEYS) globalStyle[key] = fv(work, key);
    lines.push(
      `Global style: ${STYLE_KEYS.map((k) => `${k}: ${show(globalStyle[k])}`).join(", ")}`,
    );
    lines.push("");

    // ── Factual layer ──────────────────────────────────────────────
    lines.push("## Factual layer");
    lines.push("");
    for (const fact of facts) {
      const cites = edges("ff:Cites").filter((r) => r.source_id === fact.id);
      const assessed = assessments.filter((a) => fv(a, "fact_id") === fact.id);
      const flags: string[] = [];
      if (fv(fact, "disputed") === true) flags.push("DISPUTED");
      if (cites.length === 0) flags.push("UNCITED");
      if (assessed.length === 0) flags.push("UNASSESSED");
      const flagStr = flags.length > 0 ? ` — **${flags.join(", ")}**` : "";
      lines.push(`### ${label(fact.id)}${flagStr}`);
      lines.push(escapeMd(String(fv(fact, "description") ?? "")));
      const ds = fv<string>(fact, "date_start");
      const de = fv<string>(fact, "date_end");
      if (ds || de) lines.push(`Dates: ${escapeMd(ds ?? "…")}${de ? ` → ${escapeMd(de)}` : ""}`);
      if (fv(fact, "disputed") === true && fv(fact, "dispute_note")) {
        lines.push(`Dispute: ${escapeMd(String(fv(fact, "dispute_note")))}`);
      }
      for (const c of cites.sort((a, b) => a.target_id.localeCompare(b.target_id))) {
        const locator = relFv<string>(c, "locator");
        lines.push(
          `- cites ${label(c.target_id, "citation")}${locator ? ` (${escapeMd(locator)})` : ""}`,
        );
      }
      for (const a of assessed) {
        const level = fv<string>(a, "confidence_level");
        const score = fv<number>(a, "confidence_score");
        const conf = [level, score != null ? String(score) : null].filter(Boolean).join(" / ");
        lines.push(`- assessed by ${escapeMd(String(fv(a, "assessor") ?? a.id))}: ${conf}`);
      }
      lines.push("");
    }
    if (facts.length === 0) lines.push("(no facts)\n");

    // ── Sources ────────────────────────────────────────────────────
    if (sources.length > 0) {
      lines.push("## Sources");
      lines.push("");
      for (const s of sources) {
        const citedBy = edges("ff:Cites").filter((r) => r.target_id === s.id).length;
        lines.push(
          `- ${escapeMd(String(fv(s, "citation") ?? s.id))} — ${show(fv(s, "type"))}, reliability ${show(fv(s, "reliability"))}, cited by ${citedBy} fact${citedBy === 1 ? "" : "s"}`,
        );
      }
      lines.push("");
    }

    // ── Fiction layer ──────────────────────────────────────────────
    if (fictions.length > 0) {
      lines.push("## Fiction layer");
      lines.push("");
      for (const fe of fictions) {
        lines.push(
          `### ${label(fe.id)} — ${show(fv(fe, "mechanism"))}, ${show(fv(fe, "historicity"))}`,
        );
        lines.push(escapeMd(String(fv(fe, "description") ?? "")));
        for (const r of outgoing("ff:BasedOn", fe.id)) {
          lines.push(`- based on ${label(r.target_id)}`);
        }
        for (const r of outgoing("ff:ConstrainedBy", fe.id)) {
          lines.push(`- constrained by ${label(r.target_id)}`);
        }
        lines.push("");
      }
    }

    // ── Constraints ────────────────────────────────────────────────
    if (constraints.length > 0) {
      lines.push("## Constraints");
      lines.push("");
      for (const c of constraints) {
        const support = outgoing("ff:SupportedBy", c.id).map((r) => label(r.target_id));
        lines.push(
          `- ${label(c.id)} (${show(fv(c, "kind"))}, ${show(fv(c, "severity"))})${support.length ? ` — supported by ${support.join(", ")}` : " — **UNSUPPORTED**"}`,
        );
      }
      lines.push("");
    }

    // ── Coupling layer ─────────────────────────────────────────────
    const couples = edges("ff:CouplesTo").sort((a, b) => a.id.localeCompare(b.id));
    if (couples.length > 0) {
      lines.push("## Coupling layer");
      lines.push("");
      lines.push("| Fiction | Relation | Fact | Explanation |");
      lines.push("|---|---|---|---|");
      for (const link of couples) {
        lines.push(
          `| ${label(link.source_id)} | ${show(relFv(link, "relation"))} | ${label(link.target_id)} | ${escapeMd(String(relFv(link, "explanation") ?? ""))} |`,
        );
      }
      lines.push("");
    }

    // ── Structure with the style cascade ───────────────────────────
    lines.push("## Structure");
    lines.push("");
    for (const arcEdge of outgoing("ff:HasArc", work.id)) {
      const arc = byId.get(arcEdge.target_id);
      if (!arc) continue;
      const arcStyle = mergeStyle(globalStyle, arc);
      lines.push(`### Arc: ${label(arc.id, "title")}`);
      for (const chEdge of outgoing("ff:HasChapter", arc.id)) {
        const chapter = byId.get(chEdge.target_id);
        if (!chapter) continue;
        const chapterStyle = mergeStyle(arcStyle, chapter);
        lines.push(`#### Chapter: ${label(chapter.id, "title")}`);
        for (const scEdge of outgoing("ff:HasScene", chapter.id)) {
          const scene = byId.get(scEdge.target_id);
          if (!scene) continue;
          const sceneStyle = mergeStyle(chapterStyle, scene);
          lines.push(`##### Scene: ${label(scene.id, "title")}`);
          lines.push(escapeMd(String(fv(scene, "summary") ?? "")));
          lines.push(styleLine(sceneStyle, globalStyle));
          const depicts = outgoing("ff:Depicts", scene.id).map((r) => label(r.target_id));
          if (depicts.length) lines.push(`depicts: ${depicts.join(", ")}`);
          const features = outgoing("ff:Features", scene.id).map((r) => label(r.target_id));
          if (features.length) lines.push(`features: ${features.join(", ")}`);
          lines.push("");
        }
      }
    }
  }

  if (works.length === 0) {
    lines.push("# (no ff:Work in this workbook)");
    lines.push("");
  }

  const text = lines.join("\n").trimEnd() + "\n";
  return {
    bytes: new TextEncoder().encode(text),
    contentType: "text/markdown",
    filename: "outline.md",
  };
};
