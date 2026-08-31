import { mintUid } from "../identity/uid.js";
import { v7 as uuidv7 } from "uuid";
import type { Operation } from "../operations/operation.js";
import type { OperationKind } from "../operations/kinds.js";
import { CURRENT_PAYLOAD_SCHEMA_VERSION } from "../operations/payloads.js";
import { verifyOperationPayload } from "../gate/verification-gate.js";
import {
  applyOperation,
  replay,
  sliceProject,
  sliceProjectIsolated,
  clearProjectProjection,
} from "./replay.js";
import { emptyState, type StoreState, type ProjectStateSlice, type ProjectSnapshot } from "./state.js";
import { FDPMException } from "../errors/fdpm-exception.js";

/**
 * §6 Store — projection over the operation log.
 *
 * The log is canonical; the projection is derived. The single write
 * path is `Store.append(op)`. Direct mutation of the projection maps
 * is forbidden — even by Core handlers (§6.2). The CLI honours this
 * structurally: `Store` exposes only the append path and read methods.
 */

export interface AppendInput {
  kind: OperationKind;
  workbook_id: string;
  payload: Record<string, unknown>;
  actor?: string;
  plugin_id?: string | null;
  parent_op_id?: string | null;
  causation_op_id?: string | null;
  request_id?: string;
  expected_project_revision?: number;
  /**
   * Pre-minted op_id. If provided, the store uses this instead of
   * minting a fresh one. Used by SPEC-CORE §5.6.2 batch atomicity:
   * the DNIS host adapter mints ULIDs for every entry of a multi-op
   * DNIS Operation up front so each entry's `causation_op_id` can be
   * set to the lead entry's `op_id` before any append runs. The id
   * MUST be a fresh ULID; the store does not re-validate uniqueness
   * across a workbook log because op_ids are globally unique by
   * construction.
   */
  op_id?: string;
}

export interface AppendOutput {
  op: Operation;
  project_revision: number;
}

const SNAPSHOT_EVERY_OPS = parseInt(
  process.env["FDPM_SNAPSHOT_EVERY_OPS"] ?? "1000",
  10,
);

/**
 * Backing store for lazily-materialised workbooks.
 *
 * Synchronous by necessity: the projection is read through synchronous
 * entry points, so the load behind them cannot await.
 */
export interface ProjectLoader {
  /** Operations for one workbook, any order. Empty if it has no log. */
  loadProject(workbook_id: string): Operation[];
  /** Every workbook id the backing store knows about. */
  listProjectIds(): string[];
}

export class Store {
  private state: StoreState;
  private readonly snapshotEvery: number;
  private loader: ProjectLoader | null = null;
  /**
   * Workbooks whose log has been materialised into the projection. An id
   * is added *before* its operations are applied, so a load that reaches
   * back into the Store cannot recurse into itself.
   */
  private readonly materialised = new Set<string>();

  constructor(snapshotEvery = SNAPSHOT_EVERY_OPS) {
    this.state = emptyState();
    this.snapshotEvery = snapshotEvery;
  }

  /**
   * Attach a lazy loader. Without one the Store behaves exactly as
   * before: everything it holds was put there by `loadFromOperations`
   * or by `append`.
   *
   * With one, a workbook's log is read the first time something asks for
   * it. `Host.load()` used to read every workbook in the data directory
   * before returning, so opening one workbook cost the whole corpus —
   * 1.5 s at 50 MB, 59 s at 1.8 GB, on every process start. Now it costs
   * the workbook actually touched.
   */
  attachLoader(loader: ProjectLoader): void {
    this.loader = loader;
  }

  /**
   * Workbooks currently materialised in the projection. Diagnostics —
   * and the only way to observe that lazy loading actually stayed lazy.
   */
  materialisedProjectIds(): string[] {
    return [...this.materialised];
  }

  /** Treat these workbooks as already materialised (they were loaded eagerly). */
  markMaterialised(ids: Iterable<string>): void {
    for (const id of ids) this.materialised.add(id);
  }

  /**
   * Materialise one workbook if a loader is attached and it has not been
   * loaded yet. Cheap and idempotent after the first call.
   */
  private ensureLoaded(workbook_id: string): void {
    if (this.loader === null || this.materialised.has(workbook_id)) return;
    this.materialised.add(workbook_id);
    const ops = this.loader.loadProject(workbook_id);
    if (ops.length === 0) return;
    const sorted = [...ops].sort((a, b) => a.revision - b.revision);
    for (const op of sorted) applyOperation(this.state, op);
    this.state.operation_log[workbook_id] = sorted;
  }

  /**
   * Materialise every known workbook. Required by the two operations
   * whose answer depends on workbooks nobody has named — enumerating
   * workbooks, and resolving a uid to whichever workbook holds it.
   */
  private ensureAllLoaded(): void {
    if (this.loader === null) return;
    for (const id of this.loader.listProjectIds()) this.ensureLoaded(id);
  }

  /** §6.5: discard projection and replay log from start (or snapshot). */
  rebuildFromLog(): void {
    this.ensureAllLoaded();
    const allLogs = Object.values(this.state.operation_log).flat();
    this.state = replay(allLogs);
  }

  rebuildProject(workbook_id: string): void {
    this.ensureLoaded(workbook_id);
    const log = this.state.operation_log[workbook_id] ?? [];
    // Discard projection for this project, uid_index entries included —
    // without the uid sweep every create in the log replays into a
    // spurious `uid collision` against the index this rebuild left behind.
    clearProjectProjection(this.state, workbook_id);
    // Snapshots are perf optimisation; safe to discard.
    delete this.state.snapshots[workbook_id];
    // Replay only this workbook's log.
    for (const op of [...log].sort((a, b) => a.revision - b.revision)) {
      applyOperation(this.state, op);
    }
  }

  /**
   * Restore one workbook's projection to whatever its in-memory
   * operation log currently says, discarding any partial mutation an
   * aborted `applyOperation` left behind.
   *
   * This is the rollback primitive. It replaces a pre-emptive
   * whole-workbook `structuredClone` taken before *every* append: that
   * snapshot cost O(workbook) on the happy path to insure against a
   * failure that, by construction, has already been screened by the
   * validation pipeline and the §8 verification gate. Rebuilding from
   * the log instead moves the entire cost onto the failure path, where
   * it is paid only when it is actually needed.
   *
   * Correctness rests on the log being the canonical record and on
   * `append` committing to it only *after* `applyOperation` returns:
   * at the moment of failure the log still describes the pre-op state,
   * so replaying it is exactly the rollback.
   */
  rollbackProject(workbook_id: string): void {
    this.rebuildProject(workbook_id);
  }

  /**
   * §6.3 append — the serialisation point.
   *
   * Acquires the (single-threaded JS event-loop equivalent of an) RLock,
   * runs the §8 gate, assigns revision, sets timestamp, applies to the
   * projection, persists. Either all of it happens or none does.
   */
  append(input: AppendInput): AppendOutput {
    this.ensureLoaded(input.workbook_id);
    verifyOperationPayload({ kind: input.kind, payload: input.payload });

    const projectLog = this.state.operation_log[input.workbook_id] ?? [];
    const lastRevision = projectLog.length > 0 ? projectLog[projectLog.length - 1]!.revision : 0;

    if (
      input.expected_project_revision !== undefined &&
      input.expected_project_revision !== lastRevision
    ) {
      throw new FDPMException(
        "conflict",
        `expected_project_revision=${input.expected_project_revision} does not match current=${lastRevision}`,
        { evidence: { current: lastRevision } },
      );
    }

    const op: Operation = {
      op_id: input.op_id ?? mintUid(),
      kind: input.kind,
      workbook_id: input.workbook_id,
      payload: input.payload,
      actor: input.actor ?? "cli:operator",
      plugin_id: input.plugin_id ?? null,
      timestamp: new Date().toISOString(),
      revision: lastRevision + 1,
      request_id: input.request_id ?? uuidv7(),
      parent_op_id: input.parent_op_id ?? null,
      causation_op_id: input.causation_op_id ?? null,
      schema_version: CURRENT_PAYLOAD_SCHEMA_VERSION,
    };

    // Try-apply with rollback. No snapshot is taken up front: on failure
    // the projection is rebuilt from this workbook's log, which at this
    // point still describes the pre-op state (the op is committed to the
    // log below, only after a successful apply).
    try {
      applyOperation(this.state, op);
    } catch (err) {
      this.rollbackProject(input.workbook_id);
      throw err;
    }
    // Now commit the op to the log.
    this.state.operation_log[input.workbook_id] = [...projectLog, op];

    // Snapshot cadence per §5.5.5.
    if (op.revision % this.snapshotEvery === 0) {
      this.takeSnapshot(input.workbook_id, op.revision);
    }

    const finalRevision = this.state.workbooks[input.workbook_id]?.revision ?? op.revision;
    return { op, project_revision: finalRevision };
  }

  /** Append many under one request_id (§9.7.5 batch atomicity). */
  appendBatch(inputs: AppendInput[]): AppendOutput[] {
    if (inputs.length === 0) return [];
    const workbook_id = inputs[0]!.workbook_id;
    const request_id = inputs[0]!.request_id ?? uuidv7();
    if (inputs.some((i) => i.workbook_id !== workbook_id))
      throw new FDPMException("verification", "batch must target a single workbook");
    this.ensureLoaded(workbook_id);

    // Rollback marker: the pre-batch log. Restoring it and rebuilding
    // reproduces the pre-batch projection exactly, so no deep copy of
    // the workbook is needed to make the batch atomic.
    const beforeLog = [...(this.state.operation_log[workbook_id] ?? [])];

    const outputs: AppendOutput[] = [];
    try {
      for (const input of inputs) {
        outputs.push(this.append({ ...input, request_id }));
      }
      return outputs;
    } catch (err) {
      // Roll back: restore the log, then re-derive the projection from it.
      this.state.operation_log[workbook_id] = beforeLog;
      this.rollbackProject(workbook_id);
      throw err;
    }
  }

  /**
   * Rollback marker for an outer orchestrator (e.g.
   * `Host.appendBatchWithCausation`, which appends entries one at a time
   * so each validates against the projection that includes prior
   * entries). The complementary restore is `restoreFromBatchSnapshot`.
   *
   * The marker is the workbook's operation log, not a copy of its
   * projection: the log is canonical, so restoring it and re-deriving is
   * equivalent to restoring a deep copy — at the cost of one array of
   * references rather than a full `structuredClone`.
   */
  snapshotProjectForRollback(workbook_id: string): { log: Operation[] } {
    this.ensureLoaded(workbook_id);
    return { log: [...(this.state.operation_log[workbook_id] ?? [])] };
  }

  /**
   * Inverse of `snapshotProjectForRollback`. Used by
   * `Host.appendBatchWithCausation` to undo a partially-applied batch
   * when a later entry fails validation. Persistence is not touched
   * because the orchestrator only persists after the in-memory batch
   * succeeds end-to-end.
   *
   * `beforeLog` wins over the marker when both are supplied; they are
   * the same log in every current caller.
   */
  restoreFromBatchSnapshot(
    workbook_id: string,
    beforeLog: Operation[],
    _snapshot?: { log: Operation[] },
  ): void {
    this.state.operation_log[workbook_id] = [...beforeLog];
    this.rollbackProject(workbook_id);
  }

  // -- Read API --------------------------------------------------------

  listProjects(): { id: string; name: string; profile_id: string; revision: number }[] {
    this.ensureAllLoaded();
    return Object.values(this.state.workbooks).map((p) => ({
      id: p.id,
      name: p.name,
      profile_id: p.profile_id,
      revision: p.revision,
    }));
  }

  getProject(id: string): ProjectStateSlice {
    this.ensureLoaded(id);
    const slice = sliceProject(this.state, id);
    if (!slice) throw new FDPMException("not_found", `workbook not found: ${id}`);
    return slice;
  }

  /** SPEC-UID §14: O(1) host-level uid → location lookup. */
  lookupUid(
    uid: string,
  ): { workbook_id: string; kind: "primitive" | "relation"; id: string } | null {
    // A uid names no workbook, so the answer can live in any of them.
    this.ensureAllLoaded();
    return this.state.uid_index[uid] ?? null;
  }

  getOperationLog(workbook_id: string): Operation[] {
    this.ensureLoaded(workbook_id);
    return [...(this.state.operation_log[workbook_id] ?? [])];
  }

  getProjectAt(workbook_id: string, revision: number): ProjectStateSlice {
    this.ensureLoaded(workbook_id);
    const log = this.state.operation_log[workbook_id];
    if (!log) throw new FDPMException("not_found", `workbook not found: ${workbook_id}`);
    const slice = log.filter((op) => op.revision <= revision);
    const tempState = replay(slice);
    const result = sliceProject(tempState, workbook_id);
    if (!result)
      throw new FDPMException(
        "not_found",
        `workbook ${workbook_id} did not exist at revision ${revision}`,
      );
    return result;
  }

  takeSnapshot(workbook_id: string, revision: number): void {
    this.ensureLoaded(workbook_id);
    // Isolated on purpose: a snapshot outlives the mutations that follow
    // it, so it is one of the few places a deep copy is load-bearing.
    const slice = sliceProjectIsolated(this.state, workbook_id);
    if (!slice) return;
    this.state.snapshots[workbook_id] ??= [];
    this.state.snapshots[workbook_id]!.push({ workbook_id, revision, state: slice });
  }

  getSnapshots(workbook_id: string): ProjectSnapshot[] {
    this.ensureLoaded(workbook_id);
    return [...(this.state.snapshots[workbook_id] ?? [])];
  }

  /** Internal: only the persistence layer reads this. */
  getRawState(): StoreState {
    return this.state;
  }

  /** Internal: only the persistence layer writes this on startup. */
  loadFromOperations(ops: Operation[]): void {
    this.state = replay(ops);
    // The replay function applies operations to projections but does
    // not populate operation_log (the log IS the input). Persistence
    // restores it here so subsequent appends see correct revisions.
    for (const op of ops) {
      const list = this.state.operation_log[op.workbook_id] ?? [];
      list.push(op);
      this.state.operation_log[op.workbook_id] = list;
    }
    // Sort each workbook's log by revision for stable iteration.
    for (const id of Object.keys(this.state.operation_log)) {
      this.state.operation_log[id]!.sort((a, b) => a.revision - b.revision);
    }
    // These came from disk already; a lazy loader must not re-apply them.
    this.markMaterialised(Object.keys(this.state.operation_log));
  }

  /**
   * SPEC-REPL §10.2 incremental tail-replay primitive.
   *
   * Apply a contiguous sequence of operations to the existing state
   * for one workbook, asserting that each op's `revision` strictly
   * succeeds the in-memory log's last revision (no gaps, no reorder).
   * Used by `Host.reloadProjectTail` after detecting an out-of-band
   * append and reading the log fresh from disk; the caller passes
   * only the suffix that's missing from the in-memory projection.
   *
   * Validation:
   *   - Every op's `workbook_id` MUST equal the supplied workbook_id.
   *   - The first new op's `revision` MUST equal `current + 1` where
   *     `current` is the last in-memory op's revision (or 0 if none).
   *   - Subsequent ops MUST be revision-contiguous.
   *
   * Throws `host_compat` on any mismatch — this surfaces a torn or
   * rewritten log to the operator instead of silently writing past
   * a divergent prefix.
   */
  appendReplayedOps(workbook_id: string, newOps: readonly Operation[]): void {
    if (newOps.length === 0) return;
    this.ensureLoaded(workbook_id);
    const log = this.state.operation_log[workbook_id] ?? [];
    const currentRev = log.length > 0 ? log[log.length - 1]!.revision : 0;

    for (let i = 0; i < newOps.length; i += 1) {
      const op = newOps[i]!;
      if (op.workbook_id !== workbook_id) {
        throw new FDPMException(
          "host_compat",
          `appendReplayedOps: op[${i}] workbook_id mismatch (got ${op.workbook_id}, expected ${workbook_id})`,
          { evidence: { index: i, expected: workbook_id, got: op.workbook_id } },
        );
      }
      const expectedRev = currentRev + i + 1;
      if (op.revision !== expectedRev) {
        throw new FDPMException(
          "host_compat",
          `appendReplayedOps: revision gap for ${workbook_id} at index ${i} (got rev=${op.revision}, expected ${expectedRev})`,
          { evidence: { index: i, expected: expectedRev, got: op.revision, current: currentRev } },
        );
      }
      applyOperation(this.state, op);
      const list = this.state.operation_log[workbook_id] ?? [];
      list.push(op);
      this.state.operation_log[workbook_id] = list;
    }
  }
}
