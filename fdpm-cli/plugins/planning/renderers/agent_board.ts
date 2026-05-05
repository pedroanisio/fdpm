import type { RendererFn, RendererOutput } from "../../../src/plugin/types.js";
import type { PrimitiveInstance } from "../../../src/core/models/instance.js";

/**
 * `text/markdown` renderer for AI-agent dispatch.
 *
 * Layout: kanban grouped by assignee, columns by status. The unassigned
 * column collects tasks with no assignee_id; an explicit "Available to
 * claim" pseudo-column lists tasks in `Ready` status with no claim_holder
 * — the queue an idle AI agent should pull from.
 *
 * Emphasis is on what an agent dispatcher needs:
 *  - tasks the agent could pick up (Ready + no claim)
 *  - tasks the agent currently holds (claim_holder_id == self)
 *  - tasks where another holder's claim has expired (claim_until < now;
 *    rendered with a "STALE" marker so a watchdog or the agent itself
 *    knows it can re-claim).
 */

function fv<T = unknown>(p: PrimitiveInstance, key: string): T | undefined {
  return (p.field_values as Record<string, unknown>)[key] as T | undefined;
}

/**
 * Escape only the inline-significant Markdown characters; see roadmap.ts
 * `escapeMd` for the rationale. Same pattern across both renderers — pass-2
 * cleanup.
 */
function escapeMd(s: string): string {
  return s.replace(/([\\`*_\[\]<])/g, "\\$1");
}

const COLUMN_ORDER = [
  "Ready",
  "In_progress",
  "Blocked",
  "In_review",
  "Backlog",
] as const;

export const renderAgentBoard: RendererFn = (input): RendererOutput => {
  const { primitives, workbookId, profile } = input;

  const tasks = primitives.filter((p) => p.type_id === "plan:Task");

  // Renderer pulls "now" from the workbook graph indirectly: each task's
  // claim_until is compared against env.NOW frozen in the activation. CEL
  // evaluator enforces env.NOW determinism. For renderers, we use the
  // wall clock on entry — same string for the lifetime of this render.
  const now = new Date().toISOString();

  const lines: string[] = [];
  lines.push(`# ${workbookId} — Agent Board`);
  lines.push("");
  lines.push(
    `> Profile: \`${profile.id}\` v${profile.version}. ${tasks.length} task${tasks.length === 1 ? "" : "s"}. Generated at ${now}.`,
  );
  lines.push("");

  // Available-to-claim queue.
  const availableToClaim = tasks.filter((t) => {
    const status = fv<string>(t, "status");
    const holder = fv<string>(t, "claim_holder_id");
    const claimUntil = fv<string>(t, "claim_until");
    if (status !== "Ready") return false;
    if (!holder) return true;
    // Stale claim → also available.
    if (claimUntil && claimUntil < now) return true;
    return false;
  });
  lines.push("## 🎯 Available to claim");
  lines.push("");
  if (availableToClaim.length === 0) {
    lines.push("_No tasks available. Either every Ready task is claimed (and within its lease) or there are no Ready tasks._");
  } else {
    for (const t of availableToClaim) {
      const stale =
        fv<string>(t, "claim_holder_id") &&
        (fv<string>(t, "claim_until") ?? "") < now
          ? " 🔄STALE"
          : "";
      lines.push(formatTaskCard(t, stale));
    }
  }
  lines.push("");
  lines.push("---");
  lines.push("");

  // Group tasks by assignee.
  const byAssignee = new Map<string | null, PrimitiveInstance[]>();
  for (const t of tasks) {
    const a = (fv<string>(t, "assignee_id") ?? "").trim() || null;
    const arr = byAssignee.get(a) ?? [];
    arr.push(t);
    byAssignee.set(a, arr);
  }

  // Render assignee sections in deterministic order.
  const assignees = [...byAssignee.keys()].sort((a, b) => {
    if (a === b) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return a.localeCompare(b);
  });

  for (const a of assignees) {
    const xs = byAssignee.get(a) ?? [];
    const heading = a === null ? "## Unassigned" : `## 👤 ${escapeMd(a)}`;
    lines.push(heading);
    lines.push("");

    // Group by column status, in declared order; fall through to the
    // bottom for unknown statuses (Done / Cancelled).
    const byStatus = new Map<string, PrimitiveInstance[]>();
    for (const t of xs) {
      const s = fv<string>(t, "status") ?? "Backlog";
      const arr = byStatus.get(s) ?? [];
      arr.push(t);
      byStatus.set(s, arr);
    }
    let any = false;
    for (const status of COLUMN_ORDER) {
      const ts = byStatus.get(status);
      if (!ts || ts.length === 0) continue;
      any = true;
      lines.push(`### ${status} (${ts.length})`);
      lines.push("");
      for (const t of ts) lines.push(formatTaskCard(t, ""));
      lines.push("");
    }
    // Done / Cancelled at the bottom.
    for (const terminalStatus of ["Done", "Cancelled"]) {
      const ts = byStatus.get(terminalStatus);
      if (!ts || ts.length === 0) continue;
      any = true;
      lines.push(`### ${terminalStatus} (${ts.length})`);
      lines.push("");
      for (const t of ts) lines.push(formatTaskCard(t, ""));
      lines.push("");
    }
    if (!any) {
      lines.push("_No tasks._");
      lines.push("");
    }
  }

  return toOutput(lines);
};

function formatTaskCard(t: PrimitiveInstance, suffix: string): string {
  const id = t.id;
  const name = fv<string>(t, "name") ?? id;
  const summary = (fv<string>(t, "summary") ?? "").trim();
  const exec = fv<string>(t, "executor_kind") ?? "?";
  const priority = fv<string>(t, "priority") ?? "?";
  const ai = fv<number>(t, "ai_minutes");
  const holder = fv<string>(t, "claim_holder_id");
  const until = fv<string>(t, "claim_until");
  const dur = exec === "AI" && typeof ai === "number" ? ` ⏱${ai}m` : "";
  const claim = holder ? ` 🔒${holder}${until ? `→${until}` : ""}` : "";
  return `- \`${id}\` _(${exec}/${priority})_${dur}${claim}${suffix} — ${escapeMd(summary || name)}`;
}

function toOutput(lines: string[]): RendererOutput {
  const text = lines.join("\n");
  return {
    bytes: new TextEncoder().encode(text),
    contentType: "text/markdown",
    filename: "board.md",
  };
}
