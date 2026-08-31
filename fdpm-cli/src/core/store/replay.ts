import type { StoreState, ProjectStateSlice } from "./state.js";
import { emptyState } from "./state.js";
import type { Operation } from "../operations/operation.js";
import { FDPMException } from "../errors/fdpm-exception.js";
import { applyPatch, type JsonPatchOp } from "../operations/json-patch.js";
import { upcastPayload } from "../operations/upcast.js";
import { CURRENT_PAYLOAD_SCHEMA_VERSION } from "../operations/payloads.js";
import type {
  PrimitiveInstance,
  RelationInstance,
  Workbook,
  ProjectTemplate,
  TestSuite,
} from "../models/instance.js";

/**
 * §5.5.3 The replay function — pure, deterministic, Core-owned.
 *
 * `replay(log)` MUST produce byte-equal output every run. No plugin
 * contributions. Any drift between two implementations of replay is
 * the worst kind of drift (the log is supposed to be authoritative).
 */
export function applyOperation(state: StoreState, op: Operation): void {
  const payload =
    op.schema_version === CURRENT_PAYLOAD_SCHEMA_VERSION
      ? op.payload
      : upcastPayload(op.kind, op.schema_version, op.payload, op);

  switch (op.kind) {
    case "workbook.create":
      applyProjectCreate(state, op, payload);
      break;
    case "workbook.delete":
      applyProjectDelete(state, payload as { workbook_id: string });
      break;
    case "workbook.split":
      applyProjectSplit(state, op, payload);
      break;
    case "workbook.clone":
      applyProjectClone(state, op, payload);
      break;
    case "primitive.create":
      applyPrimitiveCreate(state, op, payload);
      break;
    case "primitive.replace":
      applyPrimitiveReplace(state, op, payload);
      break;
    case "primitive.patch":
      applyPrimitivePatch(state, op, payload);
      break;
    case "primitive.field-patch":
      applyPrimitiveFieldPatch(state, op, payload);
      break;
    case "primitive.delete":
      applyPrimitiveDelete(state, op, payload);
      break;
    case "relation.create":
      applyRelationCreate(state, op, payload);
      break;
    case "relation.replace":
      applyRelationReplace(state, op, payload);
      break;
    case "relation.patch":
      applyRelationPatch(state, op, payload);
      break;
    case "relation.field-patch":
      applyRelationFieldPatch(state, op, payload);
      break;
    case "relation.delete":
      applyRelationDelete(state, op, payload);
      break;
    case "structure.reorder":
      applyStructureReorder(state, op, payload);
      break;
    case "structure.reparent":
      applyStructureReparent(state, op, payload);
      break;
    case "template.create":
      applyTemplateCreate(state, op, payload);
      break;
    case "template.delete":
      applyTemplateDelete(state, op, payload);
      break;
    case "template.apply":
      // template.apply is expanded into per-primitive operations under
      // one parent_op_id at append time; the parent operation itself is
      // a no-op at replay (its children carry the effect).
      break;
    case "test_suite.create":
      applyTestSuiteCreate(state, op, payload);
      break;
    case "test_suite.replace":
      applyTestSuiteReplace(state, op, payload);
      break;
    case "test_suite.delete":
      applyTestSuiteDelete(state, op, payload);
      break;
    case "transfer.import":
      // transfer.import is expanded into per-primitive operations.
      break;
  }
}

function projectExists(state: StoreState, id: string): boolean {
  return id in state.workbooks;
}

function ensureProjectMaps(state: StoreState, id: string): void {
  state.primitives[id] ??= {};
  state.relations[id] ??= {};
  state.templates[id] ??= {};
  state.test_suites[id] ??= {};
  state.suite_runs[id] ??= {};
  state.scope_membership[id] ??= {};
}

function applyProjectCreate(state: StoreState, op: Operation, payload: any): void {
  const p = payload as {
    workbook_id: string;
    name: string;
    profile_id: string;
    description?: string;
  };
  if (projectExists(state, p.workbook_id))
    throw new FDPMException("conflict", `workbook already exists: ${p.workbook_id}`);
  const workbook: Workbook = {
    id: p.workbook_id,
    name: p.name,
    profile_id: p.profile_id,
    created_at: op.timestamp,
    revision: op.revision,
    ...(p.description != null && { description: p.description }),
  };
  state.workbooks[p.workbook_id] = workbook;
  ensureProjectMaps(state, p.workbook_id);
}

function applyProjectDelete(state: StoreState, payload: { workbook_id: string }): void {
  // Drop every uid_index entry that points at this workbook before
  // wiping the projection — otherwise --by-uid would resolve phantoms.
  for (const [uid, entry] of Object.entries(state.uid_index)) {
    if (entry.workbook_id === payload.workbook_id) delete state.uid_index[uid];
  }
  delete state.workbooks[payload.workbook_id];
  delete state.primitives[payload.workbook_id];
  delete state.relations[payload.workbook_id];
  delete state.templates[payload.workbook_id];
  delete state.test_suites[payload.workbook_id];
  delete state.suite_runs[payload.workbook_id];
  delete state.scope_membership[payload.workbook_id];
}

function applyProjectSplit(state: StoreState, op: Operation, payload: any): void {
  // The split's effect is encoded as the source workbook's deletion plus
  // per-target workbook.create operations expanded as children. The
  // top-level split op itself is a no-op at replay; child ops carry the
  // effect. (Append-time logic in store.ts emits the children.)
  void state; void op; void payload;
}

function applyProjectClone(state: StoreState, op: Operation, payload: any): void {
  // Same pattern as split — clone expands into a workbook.create on the
  // new workbook plus per-primitive/relation creates.
  void state; void op; void payload;
}

function applyPrimitiveCreate(state: StoreState, op: Operation, payload: any): void {
  const p = payload as {
    id: string;
    uid: string;
    type_id: string;
    field_values: Record<string, unknown>;
    scope_id?: string;
  };
  ensureProjectMaps(state, op.workbook_id);
  const prims = state.primitives[op.workbook_id]!;
  if (p.id in prims)
    throw new FDPMException("conflict", `primitive id collision: ${p.id}`);
  if (p.uid in state.uid_index)
    throw new FDPMException("conflict", `uid collision: ${p.uid}`, {
      evidence: { uid: p.uid, existing: state.uid_index[p.uid] },
    });
  const inst: PrimitiveInstance = {
    id: p.id,
    uid: p.uid,
    type_id: p.type_id,
    field_values: { ...p.field_values },
    revision: op.revision,
    ...(p.scope_id != null && { scope_id: p.scope_id }),
  };
  prims[p.id] = inst;
  state.uid_index[p.uid] = {
    workbook_id: op.workbook_id,
    kind: "primitive",
    id: p.id,
  };
  if (p.scope_id) {
    const memberships = state.scope_membership[op.workbook_id]!;
    const list = memberships[p.scope_id] ?? [];
    list.push(p.id);
    memberships[p.scope_id] = list;
  }
  bumpProjectRevision(state, op);
}

function applyPrimitiveReplace(state: StoreState, op: Operation, payload: any): void {
  const p = payload as {
    id: string;
    type_id: string;
    field_values: Record<string, unknown>;
    scope_id?: string;
    uid?: string;
  };
  const prims = state.primitives[op.workbook_id];
  if (!prims || !(p.id in prims))
    throw new FDPMException("not_found", `primitive not found: ${p.id}`);
  const existing = prims[p.id]!;
  if (existing.type_id !== p.type_id)
    throw new FDPMException("conflict", "type_id is immutable");
  // SPEC-UID §4 principle 2 — uid is immutable. If the payload happens
  // to carry one (operator copy-pasted; round-tripped through SDK), it
  // MUST equal the pre-state uid.
  if (p.uid != null && p.uid !== existing.uid)
    throw new FDPMException("verification", "uid is immutable; replace cannot change it", {
      evidence: { id: p.id, stored_uid: existing.uid, payload_uid: p.uid },
    });
  prims[p.id] = {
    ...existing,
    field_values: { ...p.field_values },
    revision: op.revision,
    ...(p.scope_id != null && { scope_id: p.scope_id }),
  };
  bumpProjectRevision(state, op);
}

function applyPrimitivePatch(state: StoreState, op: Operation, payload: any): void {
  const p = payload as {
    id: string;
    field_values: Record<string, unknown>;
    scope_id?: string;
  };
  const prims = state.primitives[op.workbook_id];
  if (!prims || !(p.id in prims))
    throw new FDPMException("not_found", `primitive not found: ${p.id}`);
  const existing = prims[p.id]!;
  prims[p.id] = {
    ...existing,
    field_values: { ...existing.field_values, ...p.field_values },
    revision: op.revision,
    ...(p.scope_id != null && { scope_id: p.scope_id }),
  };
  bumpProjectRevision(state, op);
}

function applyPrimitiveFieldPatch(state: StoreState, op: Operation, payload: any): void {
  const p = payload as { id: string; operations: JsonPatchOp[] };
  const prims = state.primitives[op.workbook_id];
  if (!prims || !(p.id in prims))
    throw new FDPMException("not_found", `primitive not found: ${p.id}`);
  const existing = prims[p.id]!;
  const { result } = applyPatch(existing.field_values, p.operations, ["id", "type_id"]);
  prims[p.id] = { ...existing, field_values: result, revision: op.revision };
  bumpProjectRevision(state, op);
}

function applyPrimitiveDelete(state: StoreState, op: Operation, payload: any): void {
  const p = payload as { id: string };
  const prims = state.primitives[op.workbook_id];
  if (!prims || !(p.id in prims)) return; // idempotent on missing
  const existing = prims[p.id]!;
  delete prims[p.id];
  delete state.uid_index[existing.uid];
  if (existing.scope_id) {
    const list = state.scope_membership[op.workbook_id]?.[existing.scope_id];
    if (list) {
      const idx = list.indexOf(p.id);
      if (idx >= 0) list.splice(idx, 1);
    }
  }
  // Cascade: drop any relations touching this primitive (and their uids).
  const rels = state.relations[op.workbook_id] ?? {};
  for (const rid of Object.keys(rels)) {
    const r = rels[rid]!;
    if (r.source_id === p.id || r.target_id === p.id) {
      delete state.uid_index[r.uid];
      delete rels[rid];
    }
  }
  bumpProjectRevision(state, op);
}

function applyRelationCreate(state: StoreState, op: Operation, payload: any): void {
  const r = payload as {
    id: string;
    uid: string;
    type_id: string;
    source_id: string;
    target_id: string;
    field_values?: Record<string, unknown>;
  };
  ensureProjectMaps(state, op.workbook_id);
  const rels = state.relations[op.workbook_id]!;
  if (r.id in rels)
    throw new FDPMException("conflict", `relation id collision: ${r.id}`);
  if (r.uid in state.uid_index)
    throw new FDPMException("conflict", `uid collision: ${r.uid}`, {
      evidence: { uid: r.uid, existing: state.uid_index[r.uid] },
    });
  rels[r.id] = {
    id: r.id,
    uid: r.uid,
    type_id: r.type_id,
    source_id: r.source_id,
    target_id: r.target_id,
    field_values: { ...(r.field_values ?? {}) },
    revision: op.revision,
  };
  state.uid_index[r.uid] = {
    workbook_id: op.workbook_id,
    kind: "relation",
    id: r.id,
  };
  bumpProjectRevision(state, op);
}

function applyRelationReplace(state: StoreState, op: Operation, payload: any): void {
  const r = payload as {
    id: string;
    type_id: string;
    field_values: Record<string, unknown>;
  };
  const rels = state.relations[op.workbook_id];
  if (!rels || !(r.id in rels))
    throw new FDPMException("not_found", `relation not found: ${r.id}`);
  const existing = rels[r.id]!;
  if (existing.type_id !== r.type_id)
    throw new FDPMException("conflict", "type_id is immutable");
  rels[r.id] = {
    ...existing,
    field_values: { ...r.field_values },
    revision: op.revision,
  };
  bumpProjectRevision(state, op);
}

function applyRelationPatch(state: StoreState, op: Operation, payload: any): void {
  const r = payload as { id: string; field_values: Record<string, unknown> };
  const rels = state.relations[op.workbook_id];
  if (!rels || !(r.id in rels))
    throw new FDPMException("not_found", `relation not found: ${r.id}`);
  const existing = rels[r.id]!;
  rels[r.id] = {
    ...existing,
    field_values: { ...existing.field_values, ...r.field_values },
    revision: op.revision,
  };
  bumpProjectRevision(state, op);
}

function applyRelationFieldPatch(state: StoreState, op: Operation, payload: any): void {
  const r = payload as { id: string; operations: JsonPatchOp[] };
  const rels = state.relations[op.workbook_id];
  if (!rels || !(r.id in rels))
    throw new FDPMException("not_found", `relation not found: ${r.id}`);
  const existing = rels[r.id]!;
  const { result } = applyPatch(existing.field_values, r.operations, [
    "id",
    "type_id",
    "source_id",
    "target_id",
  ]);
  rels[r.id] = { ...existing, field_values: result, revision: op.revision };
  bumpProjectRevision(state, op);
}

function applyRelationDelete(state: StoreState, op: Operation, payload: any): void {
  const r = payload as { id: string };
  const rels = state.relations[op.workbook_id];
  if (!rels) return;
  delete rels[r.id];
  bumpProjectRevision(state, op);
}

function applyStructureReorder(state: StoreState, op: Operation, payload: any): void {
  const p = payload as { scope_id: string; ordering: string[] };
  const memberships = state.scope_membership[op.workbook_id];
  if (!memberships)
    throw new FDPMException("not_found", `workbook not found: ${op.workbook_id}`, {
      evidence: { workbook_id: op.workbook_id },
    });
  const current = memberships[p.scope_id] ?? [];
  // Reordering MUST be a permutation of current membership.
  const cur = new Set(current);
  const inc = new Set(p.ordering);
  if (cur.size !== inc.size || ![...cur].every((x) => inc.has(x)))
    throw new FDPMException("verification", "reorder must be a permutation");
  memberships[p.scope_id] = [...p.ordering];
  bumpProjectRevision(state, op);
}

function applyStructureReparent(state: StoreState, op: Operation, payload: any): void {
  const p = payload as {
    primitive_id: string;
    from_scope_id: string;
    to_scope_id: string;
    position?: number;
  };
  const memberships = state.scope_membership[op.workbook_id];
  const prims = state.primitives[op.workbook_id];
  if (!memberships || !prims)
    throw new FDPMException("not_found", `workbook not found: ${op.workbook_id}`, {
      evidence: { workbook_id: op.workbook_id },
    });
  if (!(p.primitive_id in prims))
    throw new FDPMException("not_found", `primitive not found: ${p.primitive_id}`, {
      evidence: { primitive_id: p.primitive_id, workbook_id: op.workbook_id },
    });
  const fromList = memberships[p.from_scope_id] ?? [];
  const idx = fromList.indexOf(p.primitive_id);
  if (idx < 0)
    throw new FDPMException(
      "validation",
      `primitive ${p.primitive_id} not in scope ${p.from_scope_id}`,
    );
  fromList.splice(idx, 1);
  memberships[p.from_scope_id] = fromList;
  memberships[p.to_scope_id] ??= [];
  const toList = memberships[p.to_scope_id]!;
  const pos = p.position ?? toList.length;
  toList.splice(pos, 0, p.primitive_id);
  prims[p.primitive_id] = { ...prims[p.primitive_id]!, scope_id: p.to_scope_id, revision: op.revision };
  bumpProjectRevision(state, op);
}

function applyTemplateCreate(state: StoreState, op: Operation, payload: any): void {
  const t = (payload as { template: ProjectTemplate }).template;
  ensureProjectMaps(state, op.workbook_id);
  state.templates[op.workbook_id]![t.id] = t;
  bumpProjectRevision(state, op);
}

function applyTemplateDelete(state: StoreState, op: Operation, payload: any): void {
  const p = payload as { template_id: string };
  if (state.templates[op.workbook_id]) delete state.templates[op.workbook_id]![p.template_id];
  bumpProjectRevision(state, op);
}

function applyTestSuiteCreate(state: StoreState, op: Operation, payload: any): void {
  const s = (payload as { suite: TestSuite }).suite;
  ensureProjectMaps(state, op.workbook_id);
  state.test_suites[op.workbook_id]![s.id] = s;
  bumpProjectRevision(state, op);
}

function applyTestSuiteReplace(state: StoreState, op: Operation, payload: any): void {
  const p = payload as { suite_id: string; suite: TestSuite };
  if (!state.test_suites[op.workbook_id])
    throw new FDPMException("not_found", `workbook not found: ${op.workbook_id}`, {
      evidence: { workbook_id: op.workbook_id },
    });
  state.test_suites[op.workbook_id]![p.suite_id] = p.suite;
  bumpProjectRevision(state, op);
}

function applyTestSuiteDelete(state: StoreState, op: Operation, payload: any): void {
  const p = payload as { suite_id: string };
  if (state.test_suites[op.workbook_id]) delete state.test_suites[op.workbook_id]![p.suite_id];
  bumpProjectRevision(state, op);
}

function bumpProjectRevision(state: StoreState, op: Operation): void {
  const proj = state.workbooks[op.workbook_id];
  if (proj) proj.revision = op.revision;
}

/**
 * §5.5.3 replay — applies an operation log from empty.
 */
export function replay(log: Operation[], from?: StoreState): StoreState {
  const state = from ?? emptyState();
  // Sort by (revision, op_id) per workbook, but the log is appended in
  // order so a stable sort by op_id preserves global ordering.
  const sorted = [...log].sort((a, b) =>
    a.revision === b.revision ? a.op_id.localeCompare(b.op_id) : a.revision - b.revision,
  );
  for (const op of sorted) applyOperation(state, op);
  return state;
}

/**
 * Slice the projection for one project — used by `GET /projects/{id}/at`
 * and as the snapshot used for batch rollback. Deep-cloned so mutations
 * to the live projection do not bleed into the snapshot.
 */
export function sliceProject(state: StoreState, workbook_id: string): ProjectStateSlice | null {
  const workbook = state.workbooks[workbook_id];
  if (!workbook) return null;
  return {
    workbook,
    primitives: state.primitives[workbook_id] ?? {},
    relations: state.relations[workbook_id] ?? {},
    templates: state.templates[workbook_id] ?? {},
    test_suites: state.test_suites[workbook_id] ?? {},
    scope_membership: state.scope_membership[workbook_id] ?? {},
  };
}

/**
 * Deep-copied slice, detached from live state.
 *
 * `sliceProject` deliberately returns a *view*: it is on the read path
 * (`Store.getProject`, and through it `Host.validationContext`), which
 * runs at least twice per write and once per read. Deep-copying there
 * made every read O(workbook) and every write O(workbook) — a measured
 * 89 % of write-path CPU and an O(n^2) build cost for a workbook.
 * See `docs/architecture/PERFORMANCE-IO-ANALYSIS.md`.
 *
 * Callers that must retain a slice across subsequent mutation of the
 * projection use this instead. Rollback does NOT: it restores by
 * replaying the workbook's log (`Store.rollbackProject`), which costs
 * nothing on the happy path.
 */
export function sliceProjectIsolated(
  state: StoreState,
  workbook_id: string,
): ProjectStateSlice | null {
  const view = sliceProject(state, workbook_id);
  return view === null ? null : structuredClone(view);
}

/**
 * Drop every projection entry belonging to one workbook, including its
 * `uid_index` entries.
 *
 * The uid sweep is the part that is easy to forget and impossible to
 * detect later: `applyPrimitiveCreate`/`applyRelationCreate` reject a
 * uid already present in the index, so a projection discarded without
 * its uids cannot be rebuilt from its own log — every create replays
 * into a spurious `uid collision`. `applyProjectDelete` has always done
 * this sweep; rebuild and rollback now share it.
 */
export function clearProjectProjection(state: StoreState, workbook_id: string): void {
  delete state.workbooks[workbook_id];
  delete state.primitives[workbook_id];
  delete state.relations[workbook_id];
  delete state.templates[workbook_id];
  delete state.test_suites[workbook_id];
  delete state.scope_membership[workbook_id];
  for (const [uid, entry] of Object.entries(state.uid_index)) {
    if (entry.workbook_id === workbook_id) delete state.uid_index[uid];
  }
}
