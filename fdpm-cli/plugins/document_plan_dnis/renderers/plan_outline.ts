/**
 * `text/markdown` renderer for a document-plan workbook: the plan
 * outline as the author reads it.
 *
 * This renders the PLAN, not the manuscript. Every field the schema marks
 * as planning text is printed here on purpose — the output is addressed to
 * the author, the way the plan is. A manuscript renderer would read
 * MANUSCRIPT_TEXT_FIELDS and print only those; this one prints the
 * scaffolding so it can be reviewed.
 *
 * Walk order: header → structure (front matter, body numbered §N.M.K by
 * DFS over dnis:Node parent/position, back matter lettered) → threads →
 * concepts → sources → people → milestones → dependencies. Relations
 * contributed by the composition profile (docplan:NodeCites, …) are the
 * source of the per-node evidence/concept/thread/owner lines; the node
 * content JSON is the fallback when a relation is absent.
 */
import type { RendererFn, RendererOutput } from "../../../src/plugin/types.js";
import type { PrimitiveInstance, RelationInstance } from "../../../src/core/models/instance.js";
import type { RenderFinding } from "../../../src/core/render/template.js";

export const PLAN_OUTLINE_RENDERER_ID = "docplan:PlanOutlineRenderer" as const;

type FV = Record<string, unknown>;
type Region = "front_matter" | "body" | "back_matter";
const REGIONS: readonly Region[] = ["front_matter", "body", "back_matter"];

interface NodeContent {
  region?: Region;
  slug?: string;
  title?: string;
  subtitle?: string;
  content?: {
    claim?: string;
    reasoning?: string | null;
    evidence?: { source_id: string; locator?: string; supports?: string; note?: string }[];
    counter_arguments?: string[];
  };
  through_line?: string;
  narrative_function?: string;
  target_words?: number;
  status?: string;
  notes?: string;
}

interface Ctx {
  byId: Map<string, PrimitiveInstance>;
  outgoing: Map<string, RelationInstance[]>;
  findings: RenderFinding[];
}

function fv<T = unknown>(p: PrimitiveInstance, key: string): T | undefined {
  return (p.field_values as FV)[key] as T | undefined;
}
function str(v: unknown): string {
  if (v === undefined || v === null) return "";
  return typeof v === "string" ? v : String(v);
}
function esc(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
function finding(ctx: Ctx, rule: string, message: string): void {
  ctx.findings.push({ kind: "render-error", templateId: rule, line: 0, column: 0, expression: rule, message });
}

function parseNodeContent(ctx: Ctx, node: PrimitiveInstance): NodeContent {
  const raw = fv(node, "content");
  if (typeof raw !== "string") return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as NodeContent) : {};
  } catch (err) {
    finding(ctx, "docplan:render:node-content-unparsable", `dnis:Node ${node.id}: content is not JSON (${(err as Error).message})`);
    return {};
  }
}

function buildCtx(primitives: readonly PrimitiveInstance[], relations: readonly RelationInstance[]): Ctx {
  const byId = new Map<string, PrimitiveInstance>();
  for (const p of primitives) byId.set(p.id, p);
  const outgoing = new Map<string, RelationInstance[]>();
  for (const r of relations) {
    if (!outgoing.has(r.source_id)) outgoing.set(r.source_id, []);
    outgoing.get(r.source_id)!.push(r);
  }
  return { byId, outgoing, findings: [] };
}

function targets(ctx: Ctx, sourceId: string, typeId: string): { rel: RelationInstance; target: PrimitiveInstance }[] {
  const out: { rel: RelationInstance; target: PrimitiveInstance }[] = [];
  for (const rel of ctx.outgoing.get(sourceId) ?? []) {
    if (rel.type_id !== typeId) continue;
    const target = ctx.byId.get(rel.target_id);
    if (target) out.push({ rel, target });
  }
  return out;
}

function sourceLabel(p: PrimitiveInstance): string {
  const key = str(fv(p, "citation_key"));
  const title = str(fv(p, "title"));
  return key ? `[${key}] ${title}` : title || p.id;
}

// ── Header ─────────────────────────────────────────────────────────

function renderHeader(plan: PrimitiveInstance, lines: string[]): void {
  const metadata = (fv<FV>(plan, "metadata") ?? {}) as FV;
  const audience = (fv<FV>(plan, "audience") ?? {}) as FV;
  const style = (fv<FV>(plan, "style") ?? {}) as FV;
  const constraints = (fv<FV>(plan, "constraints") ?? {}) as FV;
  const date = str(metadata["modified_at"] ?? metadata["created_at"]).slice(0, 10) || "1970-01-01";
  lines.push(
    "---",
    "disclaimer:",
    "  notice: >-",
    "    No information within this document should be taken for granted.",
    "    Any statement or premise not backed by a real logical definition",
    "    or verifiable reference may be invalid, erroneous, or a hallucination.",
    `  generated_by: "fdpm.document-plan-dnis / ${PLAN_OUTLINE_RENDERER_ID}"`,
    `  date: "${date}"`,
    "generated:",
    "  warning: >-",
    "    Rendered from an FDPM workbook. Edit the workbook, not this file.",
    "---",
    "",
    `# ${str(fv(plan, "title")) || "(untitled plan)"}`,
    "",
  );
  const subtitle = str(fv(plan, "subtitle"));
  if (subtitle) lines.push(`_${subtitle}_`, "");
  lines.push(
    "> **Plan outline.** Planning text addressed to the author — what the manuscript must establish, not its wording. Only `title`, `subtitle`, node titles, concept terms, asset captions and sources reach the page (MANUSCRIPT_TEXT_FIELDS).",
    "",
    "## Work",
    "",
    "| Field | Value |",
    "|---|---|",
    `| Plan id | \`${esc(str(fv(plan, "id")))}\` |`,
    `| Schema version | ${esc(str(fv(plan, "schema_version")))} |`,
    `| Work type | ${esc(str(fv(plan, "work_type")))} |`,
    `| Purpose | ${esc(str(fv(plan, "purpose")) + (fv(plan, "purpose_other") ? ` — ${str(fv(plan, "purpose_other"))}` : ""))} |`,
    `| Language | ${esc(str(fv(plan, "language")))} |`,
    `| Status | ${esc(str(metadata["status"]))} (revision ${esc(str(metadata["revision"]))}) |`,
    `| Audience | ${esc(str(audience["primary"]))} · ${esc(str(audience["knowledge_level"]))}${audience["includes_decision_makers"] ? " · includes decision-makers" : ""} |`,
    `| Tone | ${esc(str(style["tone"]))}${style["voice"] ? ` · ${esc(str(style["voice"]))}` : ""}${style["citation_style"] ? ` · citations: ${esc(str(style["citation_style"]))}` : ""} |`,
    `| Word budget | ${constraints["min_words"] !== undefined ? `${str(constraints["min_words"])}–` : ""}${str(constraints["max_words"]) || "—"} words (tolerance ${str(constraints["word_budget_tolerance"] ?? "0.1")}) |`,
    `| Deadline | ${esc(str(constraints["deadline"])) || "—"} |`,
    `| Format | ${esc(str(constraints["format"])) || "—"} |`,
    "",
  );
  const description = str(fv(plan, "description"));
  if (description) lines.push(description, "");
  lines.push(`**Thesis.** ${str(fv(plan, "thesis"))}`, "");
  const criteria = (fv<string[]>(plan, "success_criteria") ?? []) as string[];
  if (criteria.length) {
    lines.push("**Success criteria.**", "");
    for (const c of criteria) lines.push(`- ${c}`);
    lines.push("");
  }
  const oos = (fv<string[]>(plan, "out_of_scope") ?? []) as string[];
  if (oos.length) {
    lines.push("**Out of scope.**", "");
    for (const c of oos) lines.push(`- ${c}`);
    lines.push("");
  }
}

// ── Structure ──────────────────────────────────────────────────────

interface TreeNode {
  prim: PrimitiveInstance;
  content: NodeContent;
  children: TreeNode[];
}

function buildTree(ctx: Ctx, nodes: readonly PrimitiveInstance[]): Map<Region, TreeNode[]> {
  const byParent = new Map<string, PrimitiveInstance[]>();
  for (const n of nodes) {
    const parent = str(fv(n, "parent_node_id"));
    if (!byParent.has(parent)) byParent.set(parent, []);
    byParent.get(parent)!.push(n);
  }
  for (const group of byParent.values()) {
    group.sort((a, b) => str(fv(a, "position")).localeCompare(str(fv(b, "position"))));
  }
  const make = (p: PrimitiveInstance): TreeNode => ({
    prim: p,
    content: parseNodeContent(ctx, p),
    children: (byParent.get(p.uid) ?? []).map(make),
  });
  const roots = (byParent.get("") ?? []).map(make);
  const byRegion = new Map<Region, TreeNode[]>();
  for (const r of REGIONS) byRegion.set(r, []);
  for (const root of roots) {
    const region = root.content.region;
    if (region && byRegion.has(region)) byRegion.get(region)!.push(root);
    else {
      finding(ctx, "docplan:render:node-region-missing", `dnis:Node ${root.prim.id} has no region; rendered under body`);
      byRegion.get("body")!.push(root);
    }
  }
  return byRegion;
}

function renderNode(ctx: Ctx, node: TreeNode, label: string, depth: number, lines: string[]): void {
  const c = node.content;
  const hashes = "#".repeat(Math.min(2 + depth, 6));
  const title = c.title ?? str(fv(node.prim, "kind"));
  lines.push(`${hashes} ${label ? `${label} ` : ""}${title}`, "");
  if (c.subtitle) lines.push(`_${c.subtitle}_`, "");

  const meta: string[] = [str(fv(node.prim, "kind"))];
  if (c.status) meta.push(c.status);
  if (c.target_words !== undefined) meta.push(`${c.target_words} words`);
  if (c.narrative_function) meta.push(`role: ${c.narrative_function}`);
  const owners = targets(ctx, node.prim.id, "docplan:NodeOwnedBy");
  if (owners.length) meta.push(`owner: ${owners.map((o) => str(fv(o.target, "name"))).join(", ")}`);
  lines.push(`_${meta.join(" · ")}_`, "");

  if (c.content?.claim) lines.push(`**Claim.** ${c.content.claim}`, "");
  if (c.content && "reasoning" in c.content) {
    if (c.content.reasoning === null) lines.push("**Reasoning.** Asserted without reasoning, by design.", "");
    else if (c.content.reasoning) lines.push(`**Reasoning.** ${c.content.reasoning}`, "");
  }
  if (c.through_line) lines.push(`**Through-line.** ${c.through_line}`, "");
  if (c.content?.counter_arguments?.length) {
    lines.push("**Objections the prose must survive.**", "");
    for (const ca of c.content.counter_arguments) lines.push(`- ${ca}`);
    lines.push("");
  }

  const cites = targets(ctx, node.prim.id, "docplan:NodeCites");
  if (cites.length) {
    lines.push("**Evidence.**", "");
    for (const { rel, target } of cites) {
      const locator = str((rel.field_values as FV)["locator"]);
      const supports = str((rel.field_values as FV)["supports"]);
      lines.push(`- ${sourceLabel(target)}${locator ? ` — ${locator}` : ""}${supports && supports !== "asserts" ? ` (${supports})` : ""}`);
    }
    lines.push("");
  } else if (c.content?.evidence?.length) {
    // Fallback: no relation materialised — resolve from the node content.
    lines.push("**Evidence.**", "");
    for (const ev of c.content.evidence) {
      const src = ctx.byId.get(`docplan:ContentSource:${ev.source_id}`);
      lines.push(`- ${src ? sourceLabel(src) : ev.source_id}${ev.locator ? ` — ${ev.locator}` : ""}`);
    }
    lines.push("");
  }

  const concepts = targets(ctx, node.prim.id, "docplan:NodeUsesConcept").map((t) => str(fv(t.target, "term")));
  const threads = targets(ctx, node.prim.id, "docplan:NodeAdvancesThread").map((t) => str(fv(t.target, "name")));
  const tags: string[] = [];
  if (concepts.length) tags.push(`**Concepts.** ${concepts.join(", ")}`);
  if (threads.length) tags.push(`**Threads.** ${threads.join(", ")}`);
  if (tags.length) lines.push(tags.join(" · "), "");
  if (c.notes) lines.push(`**Notes.** ${c.notes}`, "");

  node.children.forEach((child, i) => {
    renderNode(ctx, child, label ? `${label}.${i + 1}` : String(i + 1), depth + 1, lines);
  });
}

function renderStructure(ctx: Ctx, nodes: readonly PrimitiveInstance[], lines: string[]): void {
  const byRegion = buildTree(ctx, nodes);
  lines.push("## Structure", "");
  if (nodes.length === 0) {
    finding(ctx, "docplan:render:no-nodes", "workbook holds no active dnis:Node primitives");
    lines.push("_(no section tree)_", "");
    return;
  }
  const front = byRegion.get("front_matter")!;
  if (front.length) {
    lines.push("### Front matter", "");
    front.forEach((n) => renderNode(ctx, n, "", 2, lines));
  }
  const body = byRegion.get("body")!;
  body.forEach((n, i) => renderNode(ctx, n, `${i + 1}.`.replace(/\.$/, ""), 0, lines));
  const back = byRegion.get("back_matter")!;
  if (back.length) {
    lines.push("### Back matter", "");
    back.forEach((n, i) => {
      const isAppendix = str(fv(n.prim, "kind")) === "appendix";
      renderNode(ctx, n, isAppendix ? `Appendix ${String.fromCharCode(65 + i)}:` : "", 2, lines);
    });
  }
}

// ── Registries ─────────────────────────────────────────────────────

function renderRegistries(ctx: Ctx, primitives: readonly PrimitiveInstance[], plan: PrimitiveInstance, lines: string[]): void {
  const ofType = (t: string) =>
    primitives.filter((p) => p.type_id === t).slice().sort((a, b) => a.id.localeCompare(b.id));

  const threads = ofType("docplan:Thread");
  if (threads.length) {
    lines.push("## Threads", "", "| Thread | Carries | Resolution |", "|---|---|---|");
    for (const t of threads) {
      lines.push(`| ${esc(str(fv(t, "name")))} | ${esc(str(fv(t, "description")))} | ${esc(str(fv(t, "resolution"))) || "left open"} |`);
    }
    lines.push("");
  }

  const concepts = ofType("docplan:Concept");
  if (concepts.length) {
    lines.push("## Concepts", "", "| Term | Definition | Introduced in |", "|---|---|---|");
    for (const c of concepts) {
      const intro = targets(ctx, c.id, "docplan:ConceptIntroducedIn")[0];
      const introTitle = intro ? parseNodeContent(ctx, intro.target).title ?? intro.target.id : str(fv(c, "introduced_in"));
      const aliases = (fv<string[]>(c, "aliases") ?? []) as string[];
      lines.push(`| ${esc(str(fv(c, "term")))}${aliases.length ? ` (${esc(aliases.join(", "))})` : ""} | ${esc(str(fv(c, "definition")))} | ${esc(introTitle)} |`);
    }
    lines.push("");
  }

  const sources = ofType("docplan:ContentSource");
  if (sources.length) {
    lines.push("## Sources", "", "| Key | Title | Authors | Date | Identifier |", "|---|---|---|---|---|");
    for (const s of sources) {
      const ident = fv<FV>(s, "identifier");
      const identStr = ident && typeof ident === "object" ? `${str(ident["kind"])}: ${str(ident["value"])}` : "";
      const authors = (fv<string[]>(s, "authors") ?? []) as string[];
      lines.push(`| ${esc(str(fv(s, "citation_key")))} | ${esc(str(fv(s, "title")))} | ${esc(authors.join("; "))} | ${esc(str(fv(s, "publication_date")))} | ${esc(identStr)} |`);
    }
    lines.push("");
  }

  const assets = ofType("docplan:Asset");
  if (assets.length) {
    lines.push("## Assets", "", "| Kind | Caption | Placed in | Rights |", "|---|---|---|---|");
    for (const a of assets) {
      const placed = targets(ctx, a.id, "docplan:AssetPlacedIn")[0];
      const where = placed ? parseNodeContent(ctx, placed.target).title ?? placed.target.id : str(fv(a, "node_id"));
      lines.push(`| ${esc(str(fv(a, "kind")))} | ${esc(str(fv(a, "caption")))} | ${esc(where)} | ${esc(str(fv(a, "rights_status")))} |`);
    }
    lines.push("");
  }

  const people = ofType("docplan:Person");
  if (people.length) {
    lines.push("## People", "", "| Name | Role |", "|---|---|");
    for (const p of people) {
      const role = str(fv(p, "role"));
      lines.push(`| ${esc(str(fv(p, "name")))} | ${esc(role === "other" ? str(fv(p, "role_other")) : role)} |`);
    }
    lines.push("");
  }

  const milestones = (fv<FV[]>(plan, "milestones") ?? []) as FV[];
  if (milestones.length) {
    lines.push("## Milestones", "", "| Milestone | Due | Nodes | Target status |", "|---|---|---|---|");
    for (const m of [...milestones].sort((a, b) => str(a["due"]).localeCompare(str(b["due"])))) {
      lines.push(`| ${esc(str(m["label"]))} | ${esc(str(m["due"]))} | ${esc(((m["node_ids"] as string[]) ?? []).join(", "))} | ${esc(str(m["target_status"]))} |`);
    }
    lines.push("");
  }

  const deps = (fv<FV[]>(plan, "dependencies") ?? []) as FV[];
  if (deps.length) {
    lines.push("## Dependencies", "");
    for (const d of deps) {
      lines.push(`- \`${esc(str(d["section_id"]))}\` depends on ${((d["depends_on"] as string[]) ?? []).map((x) => `\`${esc(x)}\``).join(", ")}${d["reason"] ? ` (${esc(str(d["reason"]))})` : ""}`);
    }
    lines.push("");
  }
}

// ── Entry ──────────────────────────────────────────────────────────

export const renderPlanOutline: RendererFn = (input): RendererOutput => {
  const ctx = buildCtx(input.primitives, input.relations);
  const lines: string[] = [];

  const plans = input.primitives
    .filter((p) => p.type_id === "docplan:DocumentPlan")
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));
  const plan = plans[0];
  if (!plan) {
    finding(ctx, "docplan:render:no-plan", "workbook holds no docplan:DocumentPlan primitive");
    lines.push("_(no docplan:DocumentPlan primitive in this workbook)_", "");
  } else {
    if (plans.length > 1) {
      finding(ctx, "docplan:render:multiple-plans", `workbook holds ${plans.length} docplan:DocumentPlan primitives; rendering ${plan.id}`);
    }
    renderHeader(plan, lines);
  }

  const nodes = input.primitives.filter(
    (p) => p.type_id === "dnis:Node" && !str(fv(p, "retired_at")),
  );
  renderStructure(ctx, nodes, lines);
  if (plan) renderRegistries(ctx, input.primitives, plan, lines);

  const text = lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
  return {
    bytes: new TextEncoder().encode(text),
    contentType: "text/markdown",
    filename: "plan-outline.md",
    findings: ctx.findings,
  };
};
