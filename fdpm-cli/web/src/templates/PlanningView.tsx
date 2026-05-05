/**
 * Planning template.
 *
 * Renders a `profile:planning:*` workbook as an iteration board:
 *   - Sticky left rail of iterations + a "no iteration" pseudo-column
 *     for tasks that aren't bound to one yet.
 *   - Per iteration, a kanban-style grid of tasks grouped by status
 *     (Backlog / Ready / In_progress / Blocked / In_review / Done /
 *     Cancelled).
 *   - Each task card shows badges (priority, executor_kind, kind,
 *     ai_minutes), and a footer of `DependsOn → ...` cross-refs and
 *     `Verifies → AC` cross-refs. AC status (open / met / blocked) is
 *     surfaced inline so progress is visible at a glance.
 *   - WorkBreakdown roots and Milestones land in a top "Overview"
 *     strip. Active blockers (any task with status=Blocked) get a
 *     callout panel above the board.
 *
 * Falls back to a generic card for any plan:* type not enumerated.
 */
import { useState } from "react";
import type { Primitive, Relation, WorkbookDetailResponse } from "../types";
import { TaskActions } from "./TaskActions";
import { GanttView } from "./GanttView";

type PlanningTab = "board" | "gantt";

interface Props {
  data: WorkbookDetailResponse;
  /**
   * Re-fetch the workbook detail. The TaskActions menu calls this after
   * a successful mutation; without it, action buttons are hidden.
   */
  onRefresh?: () => Promise<void> | void;
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function asRelationArray(
  rels: WorkbookDetailResponse["relations"],
): Relation[] {
  if (!rels) return [];
  if (Array.isArray(rels)) return rels;
  return Object.values(rels);
}

function relSrc(r: Relation): string | undefined {
  return r.src_id ?? r.source_id;
}
function relTgt(r: Relation): string | undefined {
  return r.dst_id ?? r.target_id;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function anchorFor(primId: string): string {
  return `plan-${primId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

const STATUS_ORDER = [
  "In_progress",
  "Blocked",
  "Ready",
  "In_review",
  "Backlog",
  "Done",
  "Cancelled",
] as const;

function PrimLink({
  primId,
  data,
  fallbackKey,
}: {
  primId: string;
  data: WorkbookDetailResponse;
  fallbackKey?: string;
}) {
  const target = data.primitives[primId];
  const label = target
    ? asString(target.field_values?.["name"]) ||
      asString(target.field_values?.[fallbackKey ?? "name"]) ||
      primId
    : primId;
  return (
    <a className="plan-xref" href={`#${anchorFor(primId)}`}>
      {label}
    </a>
  );
}

// ---------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------

function TaskCard({
  primitive,
  data,
  rels,
  onRefresh,
}: {
  primitive: Primitive;
  data: WorkbookDetailResponse;
  rels: Relation[];
  onRefresh?: () => Promise<void> | void;
}) {
  const f = primitive.field_values ?? {};
  const status = asString(f["status"]);
  const priority = asString(f["priority"]);
  const executor = asString(f["executor_kind"]);
  const kind = asString(f["kind"]);
  const aiMin = f["ai_minutes"];
  const hEst = asString(f["human_estimate"]);

  const dependsOn = rels.filter(
    (r) => r.type_id === "plan:DependsOn" && relSrc(r) === primitive.id,
  );
  const verifies = rels.filter(
    (r) => r.type_id === "plan:Verifies" && relSrc(r) === primitive.id,
  );
  const blockers = rels.filter(
    (r) => r.type_id === "plan:BlockedBy" && relSrc(r) === primitive.id,
  );

  return (
    <article
      id={anchorFor(primitive.id)}
      className={`plan-card plan-task plan-task-status-${status}`}
    >
      <header className="plan-card-header">
        <h4>{asString(f["name"]) || primitive.id}</h4>
        <code className="plan-card-id">{primitive.id}</code>
        {onRefresh && (
          <TaskActions task={primitive} data={data} onRefresh={onRefresh} />
        )}
      </header>
      {asString(f["summary"]) && (
        <p className="plan-task-summary">{asString(f["summary"])}</p>
      )}
      <div className="plan-badges">
        {priority && <span className={`plan-badge plan-badge-pri-${priority}`}>{priority}</span>}
        {executor && (
          <span className={`plan-badge plan-badge-exec-${executor}`}>{executor}</span>
        )}
        {kind && <span className="plan-badge">{kind}</span>}
        {aiMin != null && (
          <span className="plan-badge plan-badge-est">{String(aiMin)}m</span>
        )}
        {hEst && <span className="plan-badge plan-badge-est">{hEst}</span>}
      </div>
      {(dependsOn.length > 0 || verifies.length > 0 || blockers.length > 0) && (
        <footer className="plan-task-footer">
          {dependsOn.length > 0 && (
            <div className="plan-meta-line">
              <span className="plan-meta-label">depends on:</span>{" "}
              {dependsOn.map((r, i) => {
                const tgt = relTgt(r);
                if (!tgt) return null;
                return (
                  <span key={r.id ?? `${primitive.id}-d${i}`}>
                    {i > 0 && ", "}
                    <PrimLink primId={tgt} data={data} />
                  </span>
                );
              })}
            </div>
          )}
          {verifies.length > 0 && (
            <div className="plan-meta-line">
              <span className="plan-meta-label">verified by:</span>{" "}
              {verifies.map((r, i) => {
                const tgt = relTgt(r);
                if (!tgt) return null;
                const ac = data.primitives[tgt];
                const acStatus = ac
                  ? asString(ac.field_values?.["status"])
                  : "";
                return (
                  <span key={r.id ?? `${primitive.id}-v${i}`}>
                    {i > 0 && ", "}
                    <PrimLink primId={tgt} data={data} fallbackKey="criterion" />
                    {acStatus && (
                      <span className={`plan-ac-status plan-ac-status-${acStatus}`}>
                        {acStatus}
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
          )}
          {blockers.length > 0 && (
            <div className="plan-meta-line">
              <span className="plan-meta-label">blocked by:</span>{" "}
              {blockers.map((r, i) => {
                const tgt = relTgt(r);
                if (!tgt) return null;
                return (
                  <span key={r.id ?? `${primitive.id}-b${i}`}>
                    {i > 0 && ", "}
                    <PrimLink primId={tgt} data={data} fallbackKey="description" />
                  </span>
                );
              })}
            </div>
          )}
        </footer>
      )}
    </article>
  );
}

function ACCard({ primitive }: { primitive: Primitive }) {
  const f = primitive.field_values ?? {};
  const status = asString(f["status"]);
  return (
    <article
      id={anchorFor(primitive.id)}
      className={`plan-card plan-ac plan-ac-status-${status}`}
    >
      <header className="plan-card-header">
        <h4>
          {asString(f["ordinal"]) && (
            <span className="plan-ac-ord">#{asString(f["ordinal"])}</span>
          )}{" "}
          {asString(f["criterion"]) || primitive.id}
        </h4>
        <code className="plan-card-id">{primitive.id}</code>
      </header>
      <div className="plan-badges">
        <span className={`plan-badge plan-ac-status-${status}`}>{status}</span>
      </div>
    </article>
  );
}

function MilestoneCard({ primitive }: { primitive: Primitive }) {
  const f = primitive.field_values ?? {};
  const status = asString(f["status"]);
  const target = asString(f["target_date"]);
  return (
    <article
      id={anchorFor(primitive.id)}
      className={`plan-card plan-milestone plan-ms-status-${status}`}
    >
      <header className="plan-card-header">
        <h4>★ {asString(f["name"]) || primitive.id}</h4>
        <code className="plan-card-id">{primitive.id}</code>
      </header>
      {asString(f["summary"]) && (
        <p className="plan-task-summary">{asString(f["summary"])}</p>
      )}
      <div className="plan-badges">
        <span className={`plan-badge plan-ms-status-${status}`}>{status}</span>
        {target && <span className="plan-badge plan-badge-est">{target.slice(0, 10)}</span>}
      </div>
    </article>
  );
}

function WBSCard({ primitive }: { primitive: Primitive }) {
  const f = primitive.field_values ?? {};
  const status = asString(f["status"]);
  return (
    <article
      id={anchorFor(primitive.id)}
      className="plan-card plan-wbs"
    >
      <header className="plan-card-header">
        <h4>📋 {asString(f["name"]) || primitive.id}</h4>
        <code className="plan-card-id">{primitive.id}</code>
      </header>
      {asString(f["summary"]) && (
        <p className="plan-task-summary">{asString(f["summary"])}</p>
      )}
      <div className="plan-badges">
        {status && <span className={`plan-badge plan-wbs-status-${status}`}>{status}</span>}
      </div>
    </article>
  );
}

function BlockerCard({ primitive }: { primitive: Primitive }) {
  const f = primitive.field_values ?? {};
  const sev = asString(f["severity"]);
  return (
    <article
      id={anchorFor(primitive.id)}
      className={`plan-card plan-blocker plan-blocker-sev-${sev}`}
    >
      <header className="plan-card-header">
        <h4>⚠ {asString(f["description"]).slice(0, 80) || primitive.id}</h4>
        <code className="plan-card-id">{primitive.id}</code>
      </header>
      <div className="plan-badges">
        <span className={`plan-badge plan-sev-${sev}`}>{sev}</span>
        {asString(f["discovered_at"]) && (
          <span className="plan-badge plan-badge-est">
            since {asString(f["discovered_at"]).slice(0, 10)}
          </span>
        )}
      </div>
    </article>
  );
}

function GenericPlanCard({ primitive }: { primitive: Primitive }) {
  const f = primitive.field_values ?? {};
  const otherKeys = Object.keys(f);
  return (
    <article id={anchorFor(primitive.id)} className="plan-card plan-generic">
      <header className="plan-card-header">
        <h4>{asString(f["name"]) || asString(f["title"]) || primitive.id}</h4>
        <code className="plan-card-id">
          {primitive.id}{" "}
          <span className="plan-card-type">({primitive.type_id})</span>
        </code>
      </header>
      {otherKeys.length > 0 && (
        <dl className="plan-generic-fields">
          {otherKeys.map((k) => {
            const v = f[k];
            if (v == null || v === "") return null;
            const display =
              typeof v === "string" || typeof v === "number" || typeof v === "boolean"
                ? String(v)
                : JSON.stringify(v);
            return (
              <div key={k} className="field">
                <dt>{k}</dt>
                <dd>{display}</dd>
              </div>
            );
          })}
        </dl>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------
// Top-level
// ---------------------------------------------------------------------

interface IterationBucket {
  iteration: Primitive | null; // null = "no iteration"
  tasks: Primitive[];
}

function buildBoard(
  data: WorkbookDetailResponse,
  rels: Relation[],
): IterationBucket[] {
  const tasks = Object.values(data.primitives).filter(
    (p) => p.type_id === "plan:Task",
  );
  const iterations = Object.values(data.primitives)
    .filter((p) => p.type_id === "plan:Iteration")
    .sort((a, b) => {
      const sa = asString(a.field_values?.["start_date"]);
      const sb = asString(b.field_values?.["start_date"]);
      return sa.localeCompare(sb);
    });

  const inIter = rels.filter((r) => r.type_id === "plan:InIteration");
  const taskToIter = new Map<string, string>();
  for (const r of inIter) {
    const src = relSrc(r);
    const tgt = relTgt(r);
    if (src && tgt) taskToIter.set(src, tgt);
  }

  const buckets = new Map<string, Primitive[]>();
  for (const t of tasks) {
    const iterId = taskToIter.get(t.id) ?? "__none__";
    const list = buckets.get(iterId) ?? [];
    list.push(t);
    buckets.set(iterId, list);
  }

  const out: IterationBucket[] = [];
  for (const it of iterations) {
    out.push({
      iteration: it,
      tasks: (buckets.get(it.id) ?? []).sort((a, b) =>
        asString(a.field_values?.["name"]).localeCompare(
          asString(b.field_values?.["name"]),
        ),
      ),
    });
  }
  const orphaned = (buckets.get("__none__") ?? []).sort((a, b) =>
    asString(a.field_values?.["name"]).localeCompare(
      asString(b.field_values?.["name"]),
    ),
  );
  if (orphaned.length > 0) {
    out.push({ iteration: null, tasks: orphaned });
  }
  return out;
}

function groupByStatus(tasks: Primitive[]): Map<string, Primitive[]> {
  const out = new Map<string, Primitive[]>();
  for (const t of tasks) {
    const s = asString(t.field_values?.["status"]) || "Backlog";
    const list = out.get(s) ?? [];
    list.push(t);
    out.set(s, list);
  }
  // Sort by canonical status order; unknown statuses go to end alphabetically.
  return new Map(
    [...out.entries()].sort(([a], [b]) => {
      const ai = STATUS_ORDER.indexOf(a as (typeof STATUS_ORDER)[number]);
      const bi = STATUS_ORDER.indexOf(b as (typeof STATUS_ORDER)[number]);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    }),
  );
}

export function PlanningView({ data, onRefresh }: Props) {
  const [tab, setTab] = useState<PlanningTab>("board");
  const rels = asRelationArray(data.relations);
  const board = buildBoard(data, rels);

  const wbsRoots = Object.values(data.primitives).filter(
    (p) => p.type_id === "plan:WorkBreakdown",
  );
  const milestones = Object.values(data.primitives)
    .filter((p) => p.type_id === "plan:Milestone")
    .sort((a, b) =>
      asString(a.field_values?.["target_date"]).localeCompare(
        asString(b.field_values?.["target_date"]),
      ),
    );
  const blockers = Object.values(data.primitives).filter(
    (p) => p.type_id === "plan:Blocker",
  );
  const acs = Object.values(data.primitives).filter(
    (p) => p.type_id === "plan:AcceptanceCriterion",
  );

  const knownTypes = new Set([
    "plan:Task",
    "plan:Iteration",
    "plan:WorkBreakdown",
    "plan:Milestone",
    "plan:Blocker",
    "plan:AcceptanceCriterion",
  ]);
  const unknown = Object.values(data.primitives).filter(
    (p) => !knownTypes.has(p.type_id),
  );

  return (
    <>
      <nav className="plan-tabs" role="tablist" aria-label="Planning views">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "board"}
          className={tab === "board" ? "plan-tab plan-tab-active" : "plan-tab"}
          onClick={() => setTab("board")}
        >
          Board
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "gantt"}
          className={tab === "gantt" ? "plan-tab plan-tab-active" : "plan-tab"}
          onClick={() => setTab("gantt")}
        >
          Gantt
        </button>
      </nav>
      {tab === "gantt" ? (
        <GanttView data={data} />
      ) : (
    <div className="plan-doc">
      <nav className="plan-toc" aria-label="Iterations">
        <div className="plan-toc-title">Iterations</div>
        <ol className="plan-toc-list">
          {board.map(({ iteration, tasks }) => (
            <li key={iteration?.id ?? "__none__"}>
              <a
                href={`#${anchorFor(iteration?.id ?? "__none__")}`}
              >
                <span className="plan-toc-name">
                  {iteration
                    ? asString(iteration.field_values?.["name"])
                    : "(no iteration)"}
                </span>
                <span className="plan-toc-count">{tasks.length}</span>
              </a>
            </li>
          ))}
        </ol>
        {milestones.length > 0 && (
          <>
            <div className="plan-toc-title">Milestones</div>
            <ol className="plan-toc-list">
              {milestones.map((m) => (
                <li key={m.id}>
                  <a href={`#${anchorFor(m.id)}`}>
                    <span className="plan-toc-name">
                      ★ {asString(m.field_values?.["name"])}
                    </span>
                    <span className="plan-toc-count">
                      {asString(m.field_values?.["target_date"]).slice(0, 10)}
                    </span>
                  </a>
                </li>
              ))}
            </ol>
          </>
        )}
      </nav>

      <div className="plan-body">
        {(wbsRoots.length > 0 || milestones.length > 0) && (
          <section className="plan-overview">
            <div className="plan-overview-grid">
              {wbsRoots.map((p) => (
                <WBSCard key={p.id} primitive={p} />
              ))}
              {milestones.map((p) => (
                <MilestoneCard key={p.id} primitive={p} />
              ))}
            </div>
          </section>
        )}

        {blockers.length > 0 && (
          <section className="plan-blockers">
            <h3>⚠ Active blockers ({blockers.length})</h3>
            <div className="plan-blockers-grid">
              {blockers.map((b) => (
                <BlockerCard key={b.id} primitive={b} />
              ))}
            </div>
          </section>
        )}

        {board.map(({ iteration, tasks }) => {
          const groups = groupByStatus(tasks);
          const goal = iteration
            ? asString(iteration.field_values?.["goal"])
            : "";
          const start = iteration
            ? asString(iteration.field_values?.["start_date"])
            : "";
          const end = iteration
            ? asString(iteration.field_values?.["end_date"])
            : "";
          return (
            <section
              key={iteration?.id ?? "__none__"}
              id={anchorFor(iteration?.id ?? "__none__")}
              className="plan-iteration"
            >
              <header className="plan-iteration-header">
                <h3>
                  {iteration
                    ? asString(iteration.field_values?.["name"])
                    : "(no iteration)"}{" "}
                  <span className="plan-iteration-count">
                    {tasks.length} task{tasks.length === 1 ? "" : "s"}
                  </span>
                </h3>
                {(start || end) && (
                  <div className="plan-meta-line">
                    <span className="plan-meta-label">window:</span>{" "}
                    <code>
                      {start.slice(0, 10)} → {end.slice(0, 10)}
                    </code>
                  </div>
                )}
                {goal && <p className="plan-iteration-goal">{goal}</p>}
              </header>
              {tasks.length === 0 ? (
                <p className="plan-iteration-empty">No tasks bound to this iteration.</p>
              ) : (
                <div className="plan-status-columns">
                  {[...groups.entries()].map(([status, items]) => (
                    <div
                      key={status}
                      className={`plan-status-col plan-task-status-${status}`}
                    >
                      <div className="plan-status-col-header">
                        <span>{status}</span>
                        <span className="plan-status-col-count">{items.length}</span>
                      </div>
                      <div className="plan-status-col-body">
                        {items.map((t) => (
                          <TaskCard
                            key={t.id}
                            primitive={t}
                            data={data}
                            rels={rels}
                            onRefresh={onRefresh}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}

        {acs.length > 0 && (
          <section className="plan-acs">
            <h3>Acceptance criteria ({acs.length})</h3>
            <div className="plan-acs-grid">
              {acs.map((p) => (
                <ACCard key={p.id} primitive={p} />
              ))}
            </div>
          </section>
        )}

        {unknown.length > 0 && (
          <section className="plan-unknown">
            <h3>Other primitives ({unknown.length})</h3>
            <div className="plan-overview-grid">
              {unknown.map((p) => (
                <GenericPlanCard key={p.id} primitive={p} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
      )}
    </>
  );
}
