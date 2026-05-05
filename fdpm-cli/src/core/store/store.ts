import { mintUid } from "../identity/uid.js";
import { v7 as uuidv7 } from "uuid";
import type { Operation } from "../operations/operation.js";
import type { OperationKind } from "../operations/kinds.js";
import { CURRENT_PAYLOAD_SCHEMA_VERSION } from "../operations/payloads.js";
import { verifyOperationPayload } from "../gate/verification-gate.js";
import { applyOperation, replay, sliceProject } from "./replay.js";
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
  project_id: string;
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
   * across a project log because op_ids are globally unique by
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

export class Store {
  private state: StoreState;
  private readonly snapshotEvery: number;

  constructor(snapshotEvery = SNAPSHOT_EVERY_OPS) {
    this.state = emptyState();
    this.snapshotEvery = snapshotEvery;
  }

  /** §6.5: discard projection and replay log from start (or snapshot). */
  rebuildFromLog(): void {
    const allLogs = Object.values(this.state.operation_log).flat();
    this.state = replay(allLogs);
  }

  rebuildProject(project_id: string): void {
    const log = this.state.operation_log[project_id] ?? [];
    // Discard projection for this project.
    delete this.state.projects[project_id];
    delete this.state.primitives[project_id];
    delete this.state.relations[project_id];
    delete this.state.templates[project_id];
    delete this.state.test_suites[project_id];
    delete this.state.scope_membership[project_id];
    // Snapshots are perf optimisation; safe to discard.
    delete this.state.snapshots[project_id];
    // Replay only this project's log.
    for (const op of [...log].sort((a, b) => a.revision - b.revision)) {
      applyOperation(this.state, op);
    }
  }

  /**
   * §6.3 append — the serialisation point.
   *
   * Acquires the (single-threaded JS event-loop equivalent of an) RLock,
   * runs the §8 gate, assigns revision, sets timestamp, applies to the
   * projection, persists. Either all of it happens or none does.
   */
  append(input: AppendInput): AppendOutput {
    verifyOperationPayload({ kind: input.kind, payload: input.payload });

    const projectLog = this.state.operation_log[input.project_id] ?? [];
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
      project_id: input.project_id,
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

    // Try-apply with rollback: snapshot the projection slice for this
    // project, attempt the apply, on failure restore the slice.
    const before = sliceProject(this.state, input.project_id);
    const beforeMembership = this.state.scope_membership[input.project_id]
      ? structuredClone(this.state.scope_membership[input.project_id]!)
      : undefined;
    try {
      applyOperation(this.state, op);
    } catch (err) {
      // Restore prior projection.
      this.restoreSlice(input.project_id, before, beforeMembership);
      throw err;
    }
    // Now commit the op to the log.
    this.state.operation_log[input.project_id] = [...projectLog, op];

    // Snapshot cadence per §5.5.5.
    if (op.revision % this.snapshotEvery === 0) {
      this.takeSnapshot(input.project_id, op.revision);
    }

    const finalRevision = this.state.projects[input.project_id]?.revision ?? op.revision;
    return { op, project_revision: finalRevision };
  }

  /** Append many under one request_id (§9.7.5 batch atomicity). */
  appendBatch(inputs: AppendInput[]): AppendOutput[] {
    if (inputs.length === 0) return [];
    const project_id = inputs[0]!.project_id;
    const request_id = inputs[0]!.request_id ?? uuidv7();
    if (inputs.some((i) => i.project_id !== project_id))
      throw new FDPMException("verification", "batch must target a single project");

    // Snapshot for rollback.
    const before = sliceProject(this.state, project_id);
    const beforeMembership = this.state.scope_membership[project_id]
      ? structuredClone(this.state.scope_membership[project_id]!)
      : undefined;
    const beforeLog = [...(this.state.operation_log[project_id] ?? [])];

    const outputs: AppendOutput[] = [];
    try {
      for (const input of inputs) {
        outputs.push(this.append({ ...input, request_id }));
      }
      return outputs;
    } catch (err) {
      // Roll back: restore projection AND log.
      this.restoreSlice(project_id, before, beforeMembership);
      this.state.operation_log[project_id] = beforeLog;
      throw err;
    }
  }

  private restoreSlice(
    project_id: string,
    before: ProjectStateSlice | null,
    beforeMembership?: Record<string, string[]>,
  ): void {
    if (before) {
      // before is already a deep clone; assigning is safe and isolates
      // the live state from the snapshot's references.
      this.state.projects[project_id] = before.project;
      this.state.primitives[project_id] = before.primitives;
      this.state.relations[project_id] = before.relations;
      this.state.templates[project_id] = before.templates;
      this.state.test_suites[project_id] = before.test_suites;
      this.state.scope_membership[project_id] = beforeMembership ?? before.scope_membership;
    } else {
      delete this.state.projects[project_id];
      delete this.state.primitives[project_id];
      delete this.state.relations[project_id];
      delete this.state.templates[project_id];
      delete this.state.test_suites[project_id];
      delete this.state.scope_membership[project_id];
    }
  }

  /**
   * Snapshot a project's slice + scope_membership for rollback by an
   * outer orchestrator (e.g. `Host.appendBatchWithCausation`, which
   * appends entries one at a time so each can validate against the
   * projection that includes prior entries). The complementary restore
   * is `restoreFromBatchSnapshot`.
   *
   * The returned snapshot is fully detached from live state.
   */
  snapshotProjectForRollback(project_id: string): {
    slice: ProjectStateSlice | null;
    membership: Record<string, string[]> | undefined;
  } {
    const slice = sliceProject(this.state, project_id);
    const membership = this.state.scope_membership[project_id]
      ? structuredClone(this.state.scope_membership[project_id]!)
      : undefined;
    return { slice, membership };
  }

  /**
   * Inverse of `snapshotProjectForRollback` plus a log restore. Used by
   * `Host.appendBatchWithCausation` to undo a partially-applied batch
   * when a later entry fails validation. Persistence is not touched
   * because the orchestrator only persists after the in-memory batch
   * succeeds end-to-end.
   */
  restoreFromBatchSnapshot(
    project_id: string,
    beforeLog: Operation[],
    snapshot: {
      slice: ProjectStateSlice | null;
      membership: Record<string, string[]> | undefined;
    },
  ): void {
    this.restoreSlice(project_id, snapshot.slice, snapshot.membership);
    this.state.operation_log[project_id] = [...beforeLog];
  }

  // -- Read API --------------------------------------------------------

  listProjects(): { id: string; name: string; profile_id: string; revision: number }[] {
    return Object.values(this.state.projects).map((p) => ({
      id: p.id,
      name: p.name,
      profile_id: p.profile_id,
      revision: p.revision,
    }));
  }

  getProject(id: string): ProjectStateSlice {
    const slice = sliceProject(this.state, id);
    if (!slice) throw new FDPMException("not_found", `project not found: ${id}`);
    return slice;
  }

  /** SPEC-UID §14: O(1) host-level uid → location lookup. */
  lookupUid(
    uid: string,
  ): { project_id: string; kind: "primitive" | "relation"; id: string } | null {
    return this.state.uid_index[uid] ?? null;
  }

  getOperationLog(project_id: string): Operation[] {
    return [...(this.state.operation_log[project_id] ?? [])];
  }

  getProjectAt(project_id: string, revision: number): ProjectStateSlice {
    const log = this.state.operation_log[project_id];
    if (!log) throw new FDPMException("not_found", `project not found: ${project_id}`);
    const slice = log.filter((op) => op.revision <= revision);
    const tempState = replay(slice);
    const result = sliceProject(tempState, project_id);
    if (!result)
      throw new FDPMException(
        "not_found",
        `project ${project_id} did not exist at revision ${revision}`,
      );
    return result;
  }

  takeSnapshot(project_id: string, revision: number): void {
    const slice = sliceProject(this.state, project_id);
    if (!slice) return;
    this.state.snapshots[project_id] ??= [];
    this.state.snapshots[project_id]!.push({
      project_id,
      revision,
      state: structuredClone(slice),
    });
  }

  getSnapshots(project_id: string): ProjectSnapshot[] {
    return [...(this.state.snapshots[project_id] ?? [])];
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
      const list = this.state.operation_log[op.project_id] ?? [];
      list.push(op);
      this.state.operation_log[op.project_id] = list;
    }
    // Sort each project's log by revision for stable iteration.
    for (const id of Object.keys(this.state.operation_log)) {
      this.state.operation_log[id]!.sort((a, b) => a.revision - b.revision);
    }
  }

  /**
   * SPEC-REPL §10.2 incremental tail-replay primitive.
   *
   * Apply a contiguous sequence of operations to the existing state
   * for one project, asserting that each op's `revision` strictly
   * succeeds the in-memory log's last revision (no gaps, no reorder).
   * Used by `Host.reloadProjectTail` after detecting an out-of-band
   * append and reading the log fresh from disk; the caller passes
   * only the suffix that's missing from the in-memory projection.
   *
   * Validation:
   *   - Every op's `project_id` MUST equal the supplied project_id.
   *   - The first new op's `revision` MUST equal `current + 1` where
   *     `current` is the last in-memory op's revision (or 0 if none).
   *   - Subsequent ops MUST be revision-contiguous.
   *
   * Throws `host_compat` on any mismatch — this surfaces a torn or
   * rewritten log to the operator instead of silently writing past
   * a divergent prefix.
   */
  appendReplayedOps(project_id: string, newOps: readonly Operation[]): void {
    if (newOps.length === 0) return;
    const log = this.state.operation_log[project_id] ?? [];
    const currentRev = log.length > 0 ? log[log.length - 1]!.revision : 0;

    for (let i = 0; i < newOps.length; i += 1) {
      const op = newOps[i]!;
      if (op.project_id !== project_id) {
        throw new FDPMException(
          "host_compat",
          `appendReplayedOps: op[${i}] project_id mismatch (got ${op.project_id}, expected ${project_id})`,
          { evidence: { index: i, expected: project_id, got: op.project_id } },
        );
      }
      const expectedRev = currentRev + i + 1;
      if (op.revision !== expectedRev) {
        throw new FDPMException(
          "host_compat",
          `appendReplayedOps: revision gap for ${project_id} at index ${i} (got rev=${op.revision}, expected ${expectedRev})`,
          { evidence: { index: i, expected: expectedRev, got: op.revision, current: currentRev } },
        );
      }
      applyOperation(this.state, op);
      const list = this.state.operation_log[project_id] ?? [];
      list.push(op);
      this.state.operation_log[project_id] = list;
    }
  }
}
