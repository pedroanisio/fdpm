/**
 * A3 — `text/html`. What the agents in this workbook are allowed to do,
 * and which pipelines inherit it.
 *
 * Two tables, and the second is the reason the page exists.
 *
 * The first is the direct grant matrix: agents down the side, the seven
 * authority classes across the top, each cell naming the approval
 * boundary. The contract already refuses the two combinations that are
 * always wrong — `write` with no approval, and any authority beyond read
 * or write without per-action approval — so this table shows what got
 * through the gate, not what the gate would stop.
 *
 * The second is the transitive view, and it is not in the contract at
 * all. A pipeline never declares authority; it runs stages, stages name
 * agents, and agents hold grants. So the authority a pipeline actually
 * exercises is a join nothing in the document computes — which means the
 * person approving a promotion has no way to see, from the pipeline, that
 * running it can delete a document. That join is this table.
 */
import type { RendererInput, RendererOutput } from "../../../src/plugin/types.js";
import { TOOL_AUTHORITY } from "../ids.js";
import { cell, esc, findings, page, summary, table, type Verdict } from "./_html.js";
import { readStore, type AgentView, type PipelineView, type StoreView } from "./_model.js";

/** Authority classes ordered by blast radius, not alphabetically. */
const AUTHORITY_ORDER = [...TOOL_AUTHORITY] as const;

/** Anything past `write` cannot be undone by re-running the pipeline. */
const ELEVATED = new Set([
  "destructive",
  "production",
  "external_message",
  "financial",
  "privacy_sensitive",
]);

const APPROVAL_VERDICT: Record<string, Verdict> = {
  none: "bad",
  per_run: "warn",
  per_action: "ok",
};

export interface PipelineAuthorityRow {
  pipelineName: string;
  status: string;
  /** Distinct authorities reachable through this pipeline's stages. */
  authorities: string[];
  elevated: string[];
  /** Agents reached, in stage order, deduplicated. */
  agentNames: string[];
  /** Grants reachable with no approval at all. */
  unapprovedTools: string[];
}

/**
 * Resolve what a pipeline can do by walking stage → agent → grant.
 *
 * A stage whose agent is unresolved contributes nothing and is reported
 * as a finding rather than silently treated as harmless: an unresolved
 * agent is missing information, not an absence of authority.
 */
export function pipelineAuthority(pipeline: PipelineView): PipelineAuthorityRow {
  const authorities = new Set<string>();
  const elevated = new Set<string>();
  const agentNames: string[] = [];
  const unapprovedTools: string[] = [];

  for (const stage of pipeline.stages) {
    const agent = stage.agent;
    if (agent === null) continue;
    if (!agentNames.includes(agent.name)) agentNames.push(agent.name);
    for (const grant of agent.grants) {
      authorities.add(grant.authority);
      if (ELEVATED.has(grant.authority)) elevated.add(grant.authority);
      if (grant.approval === "none" && grant.authority !== "read") {
        unapprovedTools.push(`${grant.toolName} (${grant.authority})`);
      }
    }
  }

  return {
    pipelineName: pipeline.name,
    status: pipeline.status,
    authorities: AUTHORITY_ORDER.filter((authority) => authorities.has(authority)),
    elevated: AUTHORITY_ORDER.filter((authority) => elevated.has(authority)),
    agentNames,
    unapprovedTools,
  };
}

function grantMatrix(agents: readonly AgentView[]): string {
  return table({
    caption:
      "Direct grants. A cell names the approval boundary the agent declared for that authority class; an agent may hold several tools in one class.",
    headers: ["Agent", "Status", ...AUTHORITY_ORDER.map((a) => a.replace(/_/g, " "))],
    empty: "This workbook declares no agent.",
    rows: agents.map((agent) => {
      const cells = AUTHORITY_ORDER.map((authority) => {
        const grants = agent.grants.filter((grant) => grant.authority === authority);
        if (grants.length === 0) return `<span class="muted">·</span>`;
        return grants
          .map((grant) => {
            const verdict = APPROVAL_VERDICT[grant.approval] ?? "muted";
            return `${cell(verdict, grant.approval.replace(/_/g, " "))}<br><code>${esc(grant.toolName)}</code>`;
          })
          .join("<br>");
      });
      return [
        `<strong>${esc(agent.name)}</strong><br><code>${esc(agent.modelId)}</code>`,
        esc(agent.status),
        ...cells,
      ];
    }),
  });
}

function inheritedMatrix(pipelines: readonly PipelineView[]): string {
  const rows = pipelines.map(pipelineAuthority);
  return table({
    caption:
      "Inherited authority: what running the pipeline can do, resolved through stage → agent → grant. The contract does not compute this join, so it is the only place a reviewer can see it.",
    headers: ["Pipeline", "Status", "Agents reached", "Authority exercised", "Elevated"],
    empty: "This workbook declares no pipeline.",
    rows: rows.map((row) => [
      `<strong>${esc(row.pipelineName)}</strong>`,
      esc(row.status),
      row.agentNames.length === 0
        ? `<span class="muted">none resolved</span>`
        : row.agentNames.map((name) => `<code>${esc(name)}</code>`).join(", "),
      row.authorities.length === 0
        ? `<span class="muted">none</span>`
        : row.authorities.map((a) => cell("muted", a.replace(/_/g, " "))).join(" "),
      row.elevated.length === 0
        ? cell("ok", "none")
        : row.elevated.map((a) => cell("bad", a.replace(/_/g, " "))).join(" "),
    ]),
  });
}

function notesFor(store: StoreView): { verdict: Verdict; text: string }[] {
  const notes: { verdict: Verdict; text: string }[] = [];

  for (const pipeline of store.pipelines) {
    const row = pipelineAuthority(pipeline);
    if (row.elevated.length > 0) {
      notes.push({
        verdict: "bad",
        text: `Running "${row.pipelineName}" exercises ${row.elevated.join(", ")} authority through ${row.agentNames.join(", ")}. Nothing on the pipeline itself says so — the authority is inherited from its stages' agents.`,
      });
    }
    for (const tool of row.unapprovedTools) {
      notes.push({
        verdict: "bad",
        text: `"${row.pipelineName}" reaches ${tool} with no approval boundary.`,
      });
    }
    const unresolved = pipeline.stages.filter((stage) => stage.agent === null);
    for (const stage of unresolved) {
      notes.push({
        verdict: "warn",
        text: `Stage "${stage.name}" of "${pipeline.name}" names an agent this workbook does not contain, so its authority cannot be resolved. Treat the row above as a lower bound.`,
      });
    }
  }

  for (const agent of store.agents) {
    if (agent.grants.length === 0) {
      notes.push({
        verdict: "ok",
        text: `Agent "${agent.name}" holds no tool grant: it can only produce text.`,
      });
    }
  }

  return notes;
}

export function renderAuthorityMatrix(input: RendererInput): RendererOutput {
  const store = readStore(input);
  const totalGrants = store.agents.reduce((sum, agent) => sum + agent.grants.length, 0);
  const elevatedGrants = store.agents.reduce(
    (sum, agent) => sum + agent.grants.filter((grant) => ELEVATED.has(grant.authority)).length,
    0,
  );

  const body = [
    summary([
      { key: "Agents", value: String(store.agents.length) },
      { key: "Tool grants", value: String(totalGrants) },
      { key: "Elevated grants", value: String(elevatedGrants) },
      { key: "Pipelines", value: String(store.pipelines.length) },
    ]),
    "<h2>Direct grants</h2>",
    grantMatrix(store.agents),
    "<h2>Inherited by pipeline</h2>",
    inheritedMatrix(store.pipelines),
    "<h2>Findings</h2>",
    findings(notesFor(store)),
  ].join("\n");

  const html = page({
    title: "Authority and approval",
    lede:
      "Which tools the agents may call, at what authority, behind which approval boundary — and what each pipeline inherits by running them.",
    workbookId: store.workbookId,
    body,
  });

  return {
    bytes: new TextEncoder().encode(html),
    contentType: "text/html",
    filename: "authority-matrix.html",
  };
}
