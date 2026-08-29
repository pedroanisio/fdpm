/**
 * docplan:coherence.comparative-claim-without-baseline
 *
 * A node whose claim is comparative — "cabe em poucas linhas", "em vez de",
 * "simpler", "instead of", … — asserts that something is smaller, easier or
 * cheaper *than something else*. If nothing earlier in reading order
 * establishes that something else, the reader has no baseline to judge the
 * comparison against. The DocumentPlan schema can express the remedy
 * (`dependencies[].reason: "context" | "logical_prerequisite"` pointing at
 * the baseline node) but cannot detect the omission: this judge does.
 *
 * Lexical heuristic on a documented marker list, so it is a WARNING, never
 * an error. It runs as a cap:validator on every dnis:Node write in a
 * profile:document-plan-dnis workbook, inside `fdpm validate`, and at ingest
 * (build.ts reports `coherence_warnings`).
 */
import type { PrimitiveInstance, ValidationFinding } from "../../../src/core/models/instance.js";
import type { ValidatorFn } from "../../../src/plugin/types.js";

export const COHERENCE_RULE_ID = "docplan:coherence.comparative-claim-without-baseline" as const;

/** Dependency reasons that count as "establishes the baseline". */
export const BASELINE_DEPENDENCY_REASONS: readonly string[] = ["context", "logical_prerequisite"];

/** Lower-cased substrings; pt-BR first, then English. Extend deliberately. */
export const COMPARATIVE_MARKERS: readonly string[] = [
  "mais simples", "mais fácil", "mais rápido", "mais curto", "mais barato",
  "menos código", "menos linhas", "menos passos", "em vez de", "ao invés de",
  "cabe em", "poucas linhas", "sem precisar", "sem declarar", "sem declarações", "dispensa",
  "simpler", "easier", "faster", "cheaper", "fewer", "instead of",
  "in a few lines", "fits in", "without declaring", "without writing",
];

export interface CoherenceFinding {
  rule_id: typeof COHERENCE_RULE_ID;
  level: "warning";
  /** dnis:Node primitive id. */
  target_id: string;
  field_path: "content";
  message: string;
  slug: string;
  markers: string[];
}

type Region = "front_matter" | "body" | "back_matter";
const REGION_RANK: Record<Region, number> = { front_matter: 0, body: 1, back_matter: 2 };

interface NodeView {
  prim: PrimitiveInstance;
  slug: string;
  region: Region;
  claim: string | undefined;
}

interface DependencyView { section_id: string; depends_on: string[]; reason?: string }

function str(v: unknown): string {
  return v === undefined || v === null ? "" : typeof v === "string" ? v : String(v);
}

function parseNodes(primitives: Record<string, PrimitiveInstance>): NodeView[] {
  const out: NodeView[] = [];
  for (const p of Object.values(primitives)) {
    if (p.type_id !== "dnis:Node" || str(p.field_values["retired_at"])) continue;
    const raw = p.field_values["content"];
    if (typeof raw !== "string") continue;
    let c: { slug?: unknown; region?: unknown; content?: { claim?: unknown } };
    try {
      c = JSON.parse(raw) as typeof c;
    } catch {
      continue; // the renderer reports unparsable content; not this rule's job
    }
    const region = (typeof c.region === "string" && c.region in REGION_RANK ? c.region : "body") as Region;
    const claim = typeof c.content?.claim === "string" ? c.content.claim : undefined;
    out.push({ prim: p, slug: typeof c.slug === "string" ? c.slug : p.id, region, claim });
  }
  return out;
}

/** Reading order: regions front → body → back; within a region, DFS over parent_node_id sorted by position. */
function readingOrder(nodes: NodeView[]): Map<string, number> {
  const byParent = new Map<string, NodeView[]>();
  for (const n of nodes) {
    const parent = str(n.prim.field_values["parent_node_id"]);
    if (!byParent.has(parent)) byParent.set(parent, []);
    byParent.get(parent)!.push(n);
  }
  for (const group of byParent.values()) {
    group.sort((a, b) => {
      const ra = REGION_RANK[a.region] - REGION_RANK[b.region];
      return ra !== 0 ? ra : str(a.prim.field_values["position"]).localeCompare(str(b.prim.field_values["position"]));
    });
  }
  const order = new Map<string, number>();
  let i = 0;
  const dfs = (parentUid: string): void => {
    for (const n of byParent.get(parentUid) ?? []) {
      order.set(n.slug, i++);
      dfs(n.prim.uid);
    }
  };
  dfs("");
  return order;
}

function headerDependencies(primitives: Record<string, PrimitiveInstance>): DependencyView[] {
  const header = Object.values(primitives)
    .filter((p) => p.type_id === "docplan:DocumentPlan")
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  const raw = header?.field_values["dependencies"];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((d): d is Record<string, unknown> => !!d && typeof d === "object")
    .map((d) => ({
      section_id: str(d["section_id"]),
      depends_on: Array.isArray(d["depends_on"]) ? (d["depends_on"] as unknown[]).map(str) : [],
      ...(typeof d["reason"] === "string" ? { reason: d["reason"] } : {}),
    }));
}

export function markersIn(claim: string): string[] {
  const lower = claim.toLowerCase();
  return COMPARATIVE_MARKERS.filter((m) => lower.includes(m));
}

/**
 * Pure: every active dnis:Node whose claim carries a comparative marker and
 * has no baseline dependency on an earlier node. Order of findings follows
 * reading order.
 */
export function findComparativeClaimsWithoutBaseline(
  primitives: Record<string, PrimitiveInstance>,
): CoherenceFinding[] {
  const nodes = parseNodes(primitives);
  const order = readingOrder(nodes);
  const deps = headerDependencies(primitives);
  const findings: CoherenceFinding[] = [];

  for (const node of [...nodes].sort((a, b) => (order.get(a.slug) ?? 0) - (order.get(b.slug) ?? 0))) {
    if (!node.claim) continue;
    const markers = markersIn(node.claim);
    if (markers.length === 0) continue;
    const myOrder = order.get(node.slug) ?? 0;
    const candidates = deps.filter(
      (d) => d.section_id === node.slug && d.reason !== undefined && BASELINE_DEPENDENCY_REASONS.includes(d.reason),
    );
    const earlierTargets = candidates.flatMap((d) => d.depends_on).filter((t) => (order.get(t) ?? Infinity) < myOrder);
    if (earlierTargets.length > 0) continue;

    const declared = candidates.flatMap((d) => d.depends_on);
    const quoted = markers.map((m) => `"${m}"`).join(", ");
    const tail =
      declared.length > 0
        ? ` Declared dependency target(s) ${declared.map((t) => `"${t}"`).join(", ")} do not come earlier in reading order — a baseline must precede the claim.`
        : ` Add dependencies[{ section_id: "${node.slug}", depends_on: ["<baseline-slug>"], reason: "context" }] and place that baseline node earlier in reading order.`;
    findings.push({
      rule_id: COHERENCE_RULE_ID,
      level: "warning",
      target_id: node.prim.id,
      field_path: "content",
      message: `Node "${node.slug}" makes a comparative claim (markers: ${quoted}) but no ${BASELINE_DEPENDENCY_REASONS.join("/")} dependency points to an earlier node that establishes the baseline.${tail}`,
      slug: node.slug,
      markers,
    });
  }
  return findings;
}

/**
 * cap:validator entry. Registered against dnis:Node by fdpm.document-plan-dnis;
 * the host scopes it to workbooks on the composition profile. The proposed
 * instance is overlaid on the workbook view so a create/replace is judged in
 * its post-state.
 */
export const comparativeClaimBaselineValidator: ValidatorFn = (instance, _type, _profile, vctx) => {
  if (instance.type_id !== "dnis:Node") return [];
  const wb = (vctx as { workbook?: { primitives?: Record<string, PrimitiveInstance> } } | undefined)?.workbook;
  if (!wb?.primitives) return [];
  const primitives = { ...wb.primitives, [instance.id]: instance as PrimitiveInstance };
  return findComparativeClaimsWithoutBaseline(primitives)
    .filter((f) => f.target_id === instance.id)
    .map<ValidationFinding>((f) => ({
      level: f.level,
      rule_id: f.rule_id,
      target_id: f.target_id,
      field_path: f.field_path,
      message: f.message,
      evidence: { slug: f.slug, markers: f.markers },
    }));
};
