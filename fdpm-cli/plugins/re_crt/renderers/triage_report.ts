/**
 * `text/markdown` — the §4.9 triage as a reading order.
 *
 * This is the view the protocol exists to produce: which open leaves are worth
 * attacking, which are blocked, and which are blocked but have a validated way
 * round. In the source ontology the same classification is an OWL definition
 * that derives nothing on open data; here it is computed, so the report is
 * always total.
 */
import type { RendererInput, RendererOutput } from "../../../src/plugin/types.js";
import { classifyOpenLeaves, type ObstructionType, type OpenLeafStatus } from "../triage.js";

interface Prim {
  id: string;
  type_id: string;
  field_values: Record<string, unknown>;
}
const str = (p: Prim | undefined, k: string): string => {
  const v = p?.field_values?.[k];
  return typeof v === "string" ? v : v === undefined || v === null ? "" : String(v);
};

const HEADINGS: Record<OpenLeafStatus, { title: string; gloss: string }> = {
  unblocked: {
    title: "Unblocked",
    gloss: "No active barrier explains these. The most promising targets.",
  },
  blocked_but_bypassed: {
    title: "Blocked but bypassed",
    gloss:
      "Every barrier explaining these is defeated by a validated bypass, so they are reinstated — reachable, but only by the specific approach the bypass names.",
  },
  blocked_no_bypass: {
    title: "Blocked",
    gloss: "At least one barrier stands undefeated. The hardest targets.",
  },
  undecided: {
    title: "Undecided",
    gloss:
      "Blocking status rests on a defeat cycle, so the grounded labelling cannot decide it. This section is empty unless the defeat relation is malformed — see recrt:val.defeat-bipartite.",
  },
};

export function renderTriageReport(input: RendererInput): RendererOutput {
  const prims = input.primitives as unknown as Prim[];
  const rels = input.relations as unknown as {
    type_id: string;
    source_id: string;
    target_id: string;
  }[];
  const byId = new Map(prims.map((p) => [p.id, p]));

  const openLeaves = prims
    .filter((p) => p.type_id === "recrt:ProofNode" && str(p, "node_type") === "open")
    .map((p) => ({ id: p.id, kind: "open" as const }));

  const obstructions = prims
    .filter((p) => p.type_id === "recrt:ObstructionNode")
    .map((p) => ({ id: p.id, obstructionType: str(p, "obstruction_type") as ObstructionType }));

  const status = classifyOpenLeaves({
    openLeaves,
    obstructions,
    explainedByBarrier: rels
      .filter((r) => r.type_id === "recrt:ExplainedByBarrier")
      .map((r) => ({ leaf: r.source_id, barrier: r.target_id })),
    bypassDefeatsBarrier: rels
      .filter((r) => r.type_id === "recrt:BypassDefeatsBarrier")
      .map((r) => ({ bypass: r.source_id, barrier: r.target_id })),
  });

  const barriersOf = new Map<string, string[]>();
  for (const r of rels) {
    if (r.type_id !== "recrt:ExplainedByBarrier") continue;
    barriersOf.set(r.source_id, [...(barriersOf.get(r.source_id) ?? []), r.target_id]);
  }

  const L: string[] = [`# Open-leaf triage`, ""];
  const dag = prims.find((p) => p.type_id === "recrt:ReasonDAG");
  if (dag) L.push(`_${str(dag, "title")}_`, "");
  L.push(
    `${openLeaves.length} open ${openLeaves.length === 1 ? "leaf" : "leaves"}, ` +
      `${obstructions.length} obstruction node${obstructions.length === 1 ? "" : "s"}.`,
    "",
  );

  const order: OpenLeafStatus[] = [
    "unblocked",
    "blocked_but_bypassed",
    "blocked_no_bypass",
    "undecided",
  ];
  for (const bucket of order) {
    const members = openLeaves.filter((l) => status.get(l.id) === bucket);
    if (members.length === 0 && bucket === "undecided") continue;
    const h = HEADINGS[bucket];
    L.push(`## ${h.title} (${members.length})`, "", h.gloss, "");
    if (members.length === 0) {
      L.push("_None._", "");
      continue;
    }
    for (const m of members) {
      const node = byId.get(m.id);
      L.push(`- **${str(node, "payload") || m.id}**`);
      const open = str(node, "open_payload");
      if (open) L.push(`  - Remaining: ${open}`);
      for (const b of barriersOf.get(m.id) ?? []) {
        const barrier = byId.get(b);
        L.push(
          `  - Barrier (${str(barrier, "obstruction_type")}): ${str(barrier, "payload") || b}`,
        );
      }
    }
    L.push("");
  }

  return {
    bytes: new TextEncoder().encode(L.join("\n").replace(/\n{3,}/g, "\n\n") + "\n"),
    contentType: "text/markdown",
    filename: `${input.workbookId}-triage.md`,
  };
}
