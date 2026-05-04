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
      op_id: mintUid(),
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
}
