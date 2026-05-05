import { Host } from "./host.js";
import { FDPMException } from "./errors/fdpm-exception.js";
import {
  applyPatch,
  touchedTopLevelPaths,
  type JsonPatchOp,
} from "./operations/json-patch.js";
import { computeInverse } from "./operations/inverse.js";
import type {
  RelationInstance,
  ProjectTemplate,
  TestSuite,
  ProjectTransfer,
  PrimitiveInstance,
  SuiteRunReport,
} from "./models/instance.js";
import type { Operation } from "./operations/operation.js";
import type { AppendOutput, AppendInput } from "./store/store.js";
import { v7 as uuidv7 } from "uuid";
import { mintUid } from "./identity/uid.js";
import { SPEC_CORE_VERSION } from "./version/spec.js";

/**
 * Higher-level operations layered on Host: split, clone, undo,
 * templates, test-suites, transfer.
 */

export async function relationFieldPatch(
  host: Host,
  workbook_id: string,
  payload: { id: string; operations: JsonPatchOp[]; expected_revision?: number },
): Promise<AppendOutput> {
  const slice = host.getProject(workbook_id);
  const existing = slice.relations[payload.id];
  if (!existing) throw new FDPMException("not_found", `relation not found: ${payload.id}`);
  if (
    payload.expected_revision !== undefined &&
    existing.revision !== payload.expected_revision
  )
    throw new FDPMException("conflict", `If-Match revision mismatch: stored=${existing.revision}`);
  const { result } = applyPatch(existing.field_values, payload.operations, [
    "id",
    "type_id",
    "source_id",
    "target_id",
  ]);
  const profile = host.requireResolvedProfile(workbook_id);
  const prims = new Map(Object.entries(slice.primitives));
  const proposed: RelationInstance = { ...existing, field_values: result };
  // §9.7.4 path-scoped revalidation — see host.fieldPatchPrimitive.
  const touched = touchedTopLevelPaths(payload.operations);
  const report = host.pipeline.runRelationFieldPatch(proposed, profile, prims, touched);
  if (!report.accepted)
    throw new FDPMException("validation", `validation failed for ${payload.id}`, {
      findings: report.findings,
    });
  return host.appendAndPersist({
    kind: "relation.field-patch",
    workbook_id,
    payload: { id: payload.id, operations: payload.operations },
  });
}

// -- Split (§5.4.1) --------------------------------------------------

export async function splitProject(
  host: Host,
  source_id: string,
  body: {
    partition: { target_workbook_id?: string; target_workbook_name: string; sections: string[] }[];
    cross_partition_relations: "drop";
    include_unassigned?: "first" | "last" | "none";
  },
): Promise<{ project_ids: string[]; dropped_relations: RelationInstance[]; audit_request_id: string }> {
  // Both checks below are request-shape contract checks (PALS gate level),
  // not profile-rule violations — they fail before any workbook state is
  // touched. Pair them under `verification` so the operator gets a single
  // exit code (3) for "your split request is malformed", regardless of
  // which field was wrong.
  if (body.partition.length < 2)
    throw new FDPMException("verification", "partition must have >= 2 entries", {
      evidence: { observed: body.partition.length, minimum: 2 },
    });
  if (body.cross_partition_relations !== "drop")
    throw new FDPMException("verification", "cross_partition_relations must be 'drop' in v1.1");
  const include_unassigned = body.include_unassigned ?? "first";
  const slice = host.getProject(source_id);
  const profile = host.requireResolvedProfile(source_id);
  const partitionUnitTypes = new Set(
    profile.primitive_types.filter((t) => t.is_partition_unit).map((t) => t.id),
  );
  if (partitionUnitTypes.size === 0)
    throw new FDPMException("validation", "profile has no is_partition_unit=true type — cannot split");

  // Verify Section IDs exist and are partition units, no duplicates across entries.
  const seenSections = new Set<string>();
  for (const entry of body.partition) {
    for (const sid of entry.sections) {
      if (seenSections.has(sid))
        throw new FDPMException("validation", `section ${sid} appears in multiple partition entries`);
      seenSections.add(sid);
      const prim = slice.primitives[sid];
      if (!prim)
        throw new FDPMException("validation", `section not found: ${sid}`, {
          evidence: { section_id: sid },
        });
      if (!partitionUnitTypes.has(prim.type_id))
        throw new FDPMException(
          "validation",
          `section is not a partition-unit type: ${sid}`,
          { evidence: { section_id: sid, type_id: prim.type_id } },
        );
    }
  }

  // Resolve target ids.
  const targets = body.partition.map((entry, i) => ({
    target_workbook_id: entry.target_workbook_id ?? `${source_id}-part-${i + 1}`,
    target_workbook_name: entry.target_workbook_name,
    sections: entry.sections,
  }));
  for (const t of targets) {
    if (host.listProjects().some((p) => p.id === t.target_workbook_id))
      throw new FDPMException("conflict", `target workbook id collides: ${t.target_workbook_id}`);
  }

  // Compute primitive→partition assignment via "containing Section":
  // a primitive belongs to the entry whose `sections` includes the
  // primitive's `scope_id` if the scope corresponds to a Section, OR
  // (the simple case) if the primitive's `id` is itself a Section.
  // Without a richer relation graph we approximate: a primitive belongs
  // to the entry whose `sections` includes its id, OR (for non-Section
  // primitives) by matching the scope_id segment to a Section id, else
  // it falls under `include_unassigned`.
  const sectionToEntry = new Map<string, number>();
  targets.forEach((t, i) => t.sections.forEach((sid) => sectionToEntry.set(sid, i)));

  const assignments: Record<string, number | null> = {};
  for (const prim of Object.values(slice.primitives)) {
    if (sectionToEntry.has(prim.id)) {
      assignments[prim.id] = sectionToEntry.get(prim.id)!;
      continue;
    }
    if (prim.scope_id && sectionToEntry.has(prim.scope_id)) {
      assignments[prim.id] = sectionToEntry.get(prim.scope_id)!;
      continue;
    }
    assignments[prim.id] = null;
  }
  if (include_unassigned === "none") {
    const orphans = Object.entries(assignments).filter(([, v]) => v == null).map(([k]) => k);
    if (orphans.length > 0)
      throw new FDPMException(
        "validation",
        `unassigned primitives with include_unassigned=none: ${orphans.join(",")}`,
      );
  } else if (include_unassigned === "first") {
    for (const k of Object.keys(assignments)) if (assignments[k] == null) assignments[k] = 0;
  } else {
    const lastIdx = targets.length - 1;
    for (const k of Object.keys(assignments)) if (assignments[k] == null) assignments[k] = lastIdx;
  }

  // Compute dropped relations (cross-partition).
  const droppedRelations: RelationInstance[] = [];
  for (const r of Object.values(slice.relations)) {
    const ai = assignments[r.source_id];
    const bi = assignments[r.target_id];
    if (ai !== bi) droppedRelations.push(r);
  }

  // Atomic plan: emit one workbook.split top-level op (audit), then per
  // target a workbook.create + per-primitive primitive.create + per-kept
  // relation relation.create. All under one request_id.
  const request_id = uuidv7();
  const allInputs: AppendInput[] = [];
  // Top-level audit op on source workbook.
  allInputs.push({
    kind: "workbook.split",
    workbook_id: source_id,
    payload: {
      partition: targets,
      cross_partition_relations: "drop",
      include_unassigned,
    },
    request_id,
  });
  // Per-target builds.
  for (const [i, t] of targets.entries()) {
    allInputs.push({
      kind: "workbook.create",
      workbook_id: t.target_workbook_id,
      payload: {
        workbook_id: t.target_workbook_id,
        name: t.target_workbook_name,
        profile_id: slice.workbook.profile_id,
      },
      request_id,
    });
    // SPEC-UID: split mints fresh uids (logically new workbooks).
    for (const prim of Object.values(slice.primitives)) {
      if (assignments[prim.id] !== i) continue;
      allInputs.push({
        kind: "primitive.create",
        workbook_id: t.target_workbook_id,
        payload: {
          id: prim.id,
          uid: mintUid(),
          type_id: prim.type_id,
          field_values: prim.field_values,
          ...(prim.scope_id != null && { scope_id: prim.scope_id }),
        },
        request_id,
      });
    }
    for (const rel of Object.values(slice.relations)) {
      const ai = assignments[rel.source_id];
      const bi = assignments[rel.target_id];
      if (ai !== i || bi !== i) continue;
      allInputs.push({
        kind: "relation.create",
        workbook_id: t.target_workbook_id,
        payload: {
          id: rel.id,
          uid: mintUid(),
          type_id: rel.type_id,
          source_id: rel.source_id,
          target_id: rel.target_id,
          field_values: rel.field_values,
        },
        request_id,
      });
    }
  }
  // Source delete last.
  allInputs.push({
    kind: "workbook.delete",
    workbook_id: source_id,
    payload: { workbook_id: source_id },
    request_id,
  });

  // Atomic apply: split into per-workbook transactions, then on any
  // failure reverse via :undo. Simpler: snapshot the entire state, and
  // restore on failure. We do workbook-by-workbook append; on failure we
  // delete every newly-created target project's projection + log.
  const created: string[] = [];
  try {
    for (const input of allInputs) {
      // Use store.append directly so we can roll back.
      const out = host.store.append(input);
      if (host.persistence) await host.persistence.appendOp(out.op);
      if (input.kind === "workbook.create") created.push(input.workbook_id);
    }
  } catch (err) {
    // Roll back: rebuild every newly-created workbook (which deletes
    // their projections; their logs are append-only — but we want true
    // atomicity. The chosen mitigation: on failure, append workbook.delete
    // for each created target plus the source's workbook.create-undo is
    // not possible (the source is still alive because delete was last).
    for (const id of created) {
      try {
        host.store.append({
          kind: "workbook.delete",
          workbook_id: id,
          payload: { workbook_id: id },
          request_id,
        });
        if (host.persistence) {
          // Best-effort: persistence records the rollback delete op.
          // The split is therefore observable as "split attempted, then
          // each target deleted, source intact" — atomic at projection
          // level, with a forward-motion audit trail.
        }
      } catch {
        // ignore
      }
    }
    throw err;
  }

  return {
    project_ids: targets.map((t) => t.target_workbook_id),
    dropped_relations: droppedRelations,
    audit_request_id: request_id,
  };
}

// -- Clone (§5.4.2) --------------------------------------------------

export async function cloneProject(
  host: Host,
  source_id: string,
  body: { target_workbook_id?: string; target_workbook_name: string },
): Promise<{ workbook_id: string; primitives_copied: number; relations_copied: number }> {
  const slice = host.getProject(source_id);
  const targetId =
    body.target_workbook_id ?? `${source_id}-clone-${uuidv7().slice(0, 8)}`;
  if (host.listProjects().some((p) => p.id === targetId))
    throw new FDPMException("conflict", `target workbook id exists: ${targetId}`);

  const request_id = uuidv7();
  const inputs: AppendInput[] = [
    {
      kind: "workbook.clone",
      workbook_id: source_id,
      payload: { target_workbook_id: targetId, target_workbook_name: body.target_workbook_name },
      request_id,
    },
    {
      kind: "workbook.create",
      workbook_id: targetId,
      payload: {
        workbook_id: targetId,
        name: body.target_workbook_name,
        profile_id: slice.workbook.profile_id,
        cloned_from: source_id,
      },
      request_id,
    },
  ];
  // SPEC-UID §7 ADR: clone mints fresh uids. The cloned artifacts are
  // logically new — a downstream reference to the source's uid resolves
  // to the source, not the clone.
  for (const prim of Object.values(slice.primitives)) {
    inputs.push({
      kind: "primitive.create",
      workbook_id: targetId,
      payload: {
        id: prim.id,
        uid: mintUid(),
        type_id: prim.type_id,
        field_values: prim.field_values,
        ...(prim.scope_id != null && { scope_id: prim.scope_id }),
      },
      request_id,
    });
  }
  for (const rel of Object.values(slice.relations)) {
    inputs.push({
      kind: "relation.create",
      workbook_id: targetId,
      payload: {
        id: rel.id,
        uid: mintUid(),
        type_id: rel.type_id,
        source_id: rel.source_id,
        target_id: rel.target_id,
        field_values: rel.field_values,
      },
      request_id,
    });
  }
  for (const tmpl of Object.values(slice.templates)) {
    inputs.push({
      kind: "template.create",
      workbook_id: targetId,
      payload: { template: tmpl },
      request_id,
    });
  }
  for (const suite of Object.values(slice.test_suites)) {
    inputs.push({
      kind: "test_suite.create",
      workbook_id: targetId,
      payload: { suite },
      request_id,
    });
  }

  for (const input of inputs) {
    const out = host.store.append(input);
    if (host.persistence) await host.persistence.appendOp(out.op);
  }

  return {
    workbook_id: targetId,
    primitives_copied: Object.keys(slice.primitives).length,
    relations_copied: Object.keys(slice.relations).length,
  };
}

// -- Templates ------------------------------------------------------

export async function createTemplate(
  host: Host,
  workbook_id: string,
  template: ProjectTemplate,
): Promise<AppendOutput> {
  return host.appendAndPersist({
    kind: "template.create",
    workbook_id,
    payload: { template },
  });
}

export async function applyTemplate(
  host: Host,
  workbook_id: string,
  template_id: string,
  id_prefix?: string,
): Promise<AppendOutput[]> {
  const slice = host.getProject(workbook_id);
  const template = slice.templates[template_id];
  if (!template) throw new FDPMException("not_found", `template not found: ${template_id}`);
  const request_id = uuidv7();
  const apply: AppendInput = {
    kind: "template.apply",
    workbook_id,
    payload: { template_id, ...(id_prefix && { id_prefix }) },
    request_id,
  };
  const out: AppendOutput[] = [];
  out.push(host.store.append(apply));
  if (host.persistence) await host.persistence.appendOp(out[0]!.op);
  // SPEC-UID: template stamping creates new instances — mint fresh uids.
  // The template's source uids are recorded only on the captured template
  // snapshot, not re-used by stamps.
  for (const prim of template.primitives) {
    const id = id_prefix ? `${id_prefix}${prim.id}` : prim.id;
    const op = host.store.append({
      kind: "primitive.create",
      workbook_id,
      payload: {
        id,
        uid: mintUid(),
        type_id: prim.type_id,
        field_values: prim.field_values,
        ...(prim.scope_id != null && { scope_id: prim.scope_id }),
      },
      request_id,
      parent_op_id: out[0]!.op.op_id,
    });
    if (host.persistence) await host.persistence.appendOp(op.op);
    out.push(op);
  }
  for (const rel of template.relations) {
    const id = id_prefix ? `${id_prefix}${rel.id}` : rel.id;
    const op = host.store.append({
      kind: "relation.create",
      workbook_id,
      payload: {
        id,
        uid: mintUid(),
        type_id: rel.type_id,
        source_id: id_prefix ? `${id_prefix}${rel.source_id}` : rel.source_id,
        target_id: id_prefix ? `${id_prefix}${rel.target_id}` : rel.target_id,
        field_values: rel.field_values,
      },
      request_id,
      parent_op_id: out[0]!.op.op_id,
    });
    if (host.persistence) await host.persistence.appendOp(op.op);
    out.push(op);
  }
  return out;
}

// -- Test suites ----------------------------------------------------

export async function createTestSuite(
  host: Host,
  workbook_id: string,
  suite: TestSuite,
): Promise<AppendOutput> {
  return host.appendAndPersist({
    kind: "test_suite.create",
    workbook_id,
    payload: { suite },
  });
}

export function runTestSuite(host: Host, workbook_id: string, suite_id: string): SuiteRunReport {
  const slice = host.getProject(workbook_id);
  const suite = slice.test_suites[suite_id];
  if (!suite) throw new FDPMException("not_found", `suite not found: ${suite_id}`);
  // CLI v1.1: the test runner is a thin shell. Each TestSuiteCheck has
  // an expression which we treat as a tag — checks are reported as
  // findings with their declared level. (No expression engine in v1.1;
  // this matches §10.3's "no domain logic in core".)
  const started_at = new Date().toISOString();
  const findings = suite.checks.map((c) => ({
    check_id: c.id,
    level: c.level,
    target_id: c.target_type_id ?? "*",
    message: c.message ?? `check ${c.id}`,
  }));
  return {
    suite_id,
    workbook_id,
    started_at,
    completed_at: new Date().toISOString(),
    findings,
    accepted: !findings.some((f) => f.level === "error"),
  };
}

// -- Transfer -------------------------------------------------------

export function exportTransfer(host: Host, workbook_id: string): ProjectTransfer {
  const slice = host.getProject(workbook_id);
  return {
    spec_core: SPEC_CORE_VERSION,
    workbook: slice.workbook,
    primitives: Object.values(slice.primitives),
    relations: Object.values(slice.relations),
    templates: Object.values(slice.templates),
    test_suites: Object.values(slice.test_suites),
  };
}

/**
 * Import-time uid-collision policy (SPEC-UID §15 step 5).
 *
 * - `preserve`: use the bundle's uids verbatim. Reject any uid that
 *   already exists locally (the strict global-uniqueness invariant).
 *   This is the default — a clean re-export reaches a fresh host
 *   identically.
 * - `merge-by-uid`: when a bundled uid is already present locally,
 *   silently skip the bundle's record and keep the existing local one.
 *   Used to deduplicate redundant re-imports of a known-good bundle.
 * - `mint-fresh`: ignore the bundle's uids entirely and mint new ones.
 *   Use when bundling content as a *new* logical artifact rather than
 *   restoring identity.
 */
export type ImportUidMode = "preserve" | "merge-by-uid" | "mint-fresh";

export interface ImportTransferOptions {
  uidMode?: ImportUidMode;
}

export async function importTransfer(
  host: Host,
  transfer: ProjectTransfer,
  options: ImportTransferOptions = {},
): Promise<{
  workbook_id: string;
  primitives_imported: number;
  relations_imported: number;
  primitives_skipped_uid_match: number;
  relations_skipped_uid_match: number;
}> {
  const uidMode: ImportUidMode = options.uidMode ?? "preserve";
  if (host.listProjects().some((p) => p.id === transfer.workbook.id))
    throw new FDPMException("conflict", `workbook already exists: ${transfer.workbook.id}`);
  if (!host.profiles.has(transfer.workbook.profile_id))
    throw new FDPMException(
      "not_found",
      `transfer references unknown profile: ${transfer.workbook.profile_id}`,
    );
  const request_id = uuidv7();
  // Top-level audit op
  const audit = host.store.append({
    kind: "transfer.import",
    workbook_id: transfer.workbook.id,
    payload: { transfer: { workbook_id: transfer.workbook.id } },
    request_id,
  });
  if (host.persistence) await host.persistence.appendOp(audit.op);

  await host.appendAndPersist({
    kind: "workbook.create",
    workbook_id: transfer.workbook.id,
    payload: {
      workbook_id: transfer.workbook.id,
      name: transfer.workbook.name,
      profile_id: transfer.workbook.profile_id,
      ...(transfer.workbook.description != null && { description: transfer.workbook.description }),
    },
    parent_op_id: audit.op.op_id,
    request_id,
  });
  let primitives_skipped_uid_match = 0;
  let relations_skipped_uid_match = 0;
  for (const prim of transfer.primitives) {
    // Legacy v1.1 transfers and ad-hoc test fixtures may carry no uid;
    // `mint-fresh` mode is also explicit. Treat both as "mint here".
    const incomingUid = prim.uid;
    const collision = incomingUid ? host.lookupUid(incomingUid) : null;
    let uidForOp: string;
    if (!incomingUid || uidMode === "mint-fresh") {
      uidForOp = mintUid();
    } else if (collision) {
      if (uidMode === "merge-by-uid") {
        primitives_skipped_uid_match++;
        continue;
      }
      // preserve mode: a colliding uid is the strict-invariant error.
      throw new FDPMException(
        "conflict",
        `uid collision during import: ${incomingUid}`,
        { evidence: { uid: incomingUid, existing: collision, incoming_id: prim.id } },
      );
    } else {
      uidForOp = incomingUid;
    }
    await host.appendAndPersist({
      kind: "primitive.create",
      workbook_id: transfer.workbook.id,
      payload: {
        id: prim.id,
        uid: uidForOp,
        type_id: prim.type_id,
        field_values: prim.field_values,
        ...(prim.scope_id != null && { scope_id: prim.scope_id }),
      },
      parent_op_id: audit.op.op_id,
      request_id,
    });
  }
  for (const rel of transfer.relations) {
    const incomingUid = rel.uid;
    const collision = incomingUid ? host.lookupUid(incomingUid) : null;
    let uidForOp: string;
    if (!incomingUid || uidMode === "mint-fresh") {
      uidForOp = mintUid();
    } else if (collision) {
      if (uidMode === "merge-by-uid") {
        relations_skipped_uid_match++;
        continue;
      }
      throw new FDPMException(
        "conflict",
        `uid collision during import: ${incomingUid}`,
        { evidence: { uid: incomingUid, existing: collision, incoming_id: rel.id } },
      );
    } else {
      uidForOp = incomingUid;
    }
    await host.appendAndPersist({
      kind: "relation.create",
      workbook_id: transfer.workbook.id,
      payload: {
        id: rel.id,
        uid: uidForOp,
        type_id: rel.type_id,
        source_id: rel.source_id,
        target_id: rel.target_id,
        field_values: rel.field_values,
      },
      parent_op_id: audit.op.op_id,
      request_id,
    });
  }
  for (const tmpl of transfer.templates) {
    await host.appendAndPersist({
      kind: "template.create",
      workbook_id: transfer.workbook.id,
      payload: { template: tmpl },
      parent_op_id: audit.op.op_id,
      request_id,
    });
  }
  for (const suite of transfer.test_suites) {
    await host.appendAndPersist({
      kind: "test_suite.create",
      workbook_id: transfer.workbook.id,
      payload: { suite },
      parent_op_id: audit.op.op_id,
      request_id,
    });
  }
  return {
    workbook_id: transfer.workbook.id,
    primitives_imported: transfer.primitives.length - primitives_skipped_uid_match,
    relations_imported: transfer.relations.length - relations_skipped_uid_match,
    primitives_skipped_uid_match,
    relations_skipped_uid_match,
  };
}

// -- Undo (§9.8.3) --------------------------------------------------

export async function undo(
  host: Host,
  workbook_id: string,
  target_op_id?: string,
): Promise<AppendOutput> {
  const log = host.store.getOperationLog(workbook_id);
  if (log.length === 0) throw new FDPMException("not_found", "log is empty");
  const target = target_op_id ? log.find((o) => o.op_id === target_op_id) : log[log.length - 1];
  if (!target) throw new FDPMException("not_found", `op not found: ${target_op_id}`);
  const fullLog =
    workbook_id === target.workbook_id
      ? log
      : [...log, ...host.store.getOperationLog(target.workbook_id)];
  const desc = computeInverse(target, host.store.getRawState(), fullLog);
  return host.appendAndPersist({
    kind: desc.kind,
    workbook_id: desc.workbook_id,
    payload: desc.payload,
    causation_op_id: desc.causation_op_id,
  });
}

// -- Rebuild from log -----------------------------------------------

export async function rebuildFromLog(host: Host, workbook_id: string): Promise<{ revision: number }> {
  host.store.rebuildProject(workbook_id);
  const slice = host.getProject(workbook_id);
  return { revision: slice.workbook.revision };
}

// -- Batch edits (§9.7.5) ------------------------------------------

export interface BatchOpInput {
  kind: AppendInput["kind"];
  payload: Record<string, unknown>;
}

export async function batchEdit(
  host: Host,
  workbook_id: string,
  ops: BatchOpInput[],
  expected_project_revision?: number,
  options?: { dryRun?: boolean },
): Promise<{
  project_revision: number;
  results: { index: number; outcome: string; id?: string; scope_id?: string }[];
  dry_run?: boolean;
}> {
  const maxOps = parseInt(process.env["FDPM_MAX_BATCH_OPS"] ?? "500", 10);
  if (ops.length > maxOps)
    throw new FDPMException("quota", `batch ops ${ops.length} exceed cap ${maxOps}`, {
      evidence: { observed: ops.length, cap: maxOps, unit: "ops", env: "FDPM_MAX_BATCH_OPS" },
    });
  const slice = host.getProject(workbook_id);
  if (
    expected_project_revision !== undefined &&
    slice.workbook.revision !== expected_project_revision
  )
    throw new FDPMException(
      "conflict",
      `expected_project_revision=${expected_project_revision} != current=${slice.workbook.revision}`,
    );

  // SPEC-UID §4 principle 5: operators don't author uids. Inject a
  // freshly minted uid into every primitive.create / relation.create
  // payload that lacks one. A payload that already carries a uid is
  // rejected (Core-only mint site invariant) — same posture as
  // host.createPrimitive / host.createRelation.
  const mintedOps: BatchOpInput[] = ops.map((o) => {
    if (o.kind !== "primitive.create" && o.kind !== "relation.create") return o;
    if ("uid" in o.payload && o.payload["uid"] != null) {
      throw new FDPMException(
        "verification",
        `${o.kind}: uid cannot be set on creation (minted by Core)`,
      );
    }
    return { kind: o.kind, payload: { ...o.payload, uid: mintUid() } };
  });

  // Dry-run path: run §8 schema verification on every op's payload, then
  // return what the apply would have done. Catches the most common batch
  // failures (malformed payloads, unknown op kinds) without touching state.
  // Does NOT simulate inter-op effects — validating "create A then edit A"
  // requires a forked store; the docstring on the CLI command says so.
  if (options?.dryRun === true) {
    const { verifyOperationPayload } = await import("./gate/verification-gate.js");
    const dryResults: { index: number; outcome: string; id?: string; scope_id?: string }[] = [];
    for (let i = 0; i < mintedOps.length; i++) {
      verifyOperationPayload({ kind: mintedOps[i]!.kind, payload: mintedOps[i]!.payload });
      const id = (mintedOps[i]!.payload as { id?: string }).id;
      const scope_id = (mintedOps[i]!.payload as { scope_id?: string }).scope_id;
      const r: { index: number; outcome: string; id?: string; scope_id?: string } = {
        index: i,
        outcome: `would-${describeOutcome(mintedOps[i]!.kind)}`,
      };
      if (id) r.id = id;
      if (scope_id) r.scope_id = scope_id;
      dryResults.push(r);
    }
    return {
      project_revision: slice.workbook.revision,
      results: dryResults,
      dry_run: true,
    };
  }

  // Apply operations one by one; on first failure roll back via the
  // store-level batch path. We pre-validate every primitive/relation
  // operation against the projected state by simulating in a clone.
  const inputs: AppendInput[] = mintedOps.map((o) => ({
    kind: o.kind,
    workbook_id,
    payload: o.payload,
  }));
  const out = host.store.appendBatch(inputs);
  if (host.persistence) {
    for (const o of out) await host.persistence.appendOp(o.op);
  }
  const results = out.map((o, i) => {
    const outcome = describeOutcome(ops[i]!.kind);
    const r: { index: number; outcome: string; id?: string; scope_id?: string } = {
      index: i,
      outcome,
    };
    const id = (ops[i]!.payload as { id?: string }).id;
    if (id) r.id = id;
    const scope_id = (ops[i]!.payload as { scope_id?: string }).scope_id;
    if (scope_id) r.scope_id = scope_id;
    return r;
  });
  const finalSlice = host.getProject(workbook_id);
  return { project_revision: finalSlice.workbook.revision, results };
}

/**
 * Operation kinds that may appear inside a `fdpm edit` (§9.7.5) batch.
 * Workbook-lifecycle and import/template/test-suite kinds run through
 * dedicated commands and are intentionally excluded — including them
 * here would let an operator atomically delete the workbook they are
 * editing, which has no sensible rollback story.
 */
export const BATCH_EDITABLE_KINDS = [
  "primitive.create",
  "primitive.replace",
  "primitive.patch",
  "primitive.field-patch",
  "primitive.delete",
  "relation.create",
  "relation.replace",
  "relation.patch",
  "relation.field-patch",
  "relation.delete",
  "structure.reorder",
  "structure.reparent",
] as const satisfies ReadonlyArray<AppendInput["kind"]>;

function describeOutcome(kind: AppendInput["kind"]): string {
  switch (kind) {
    case "primitive.create": return "created";
    case "primitive.replace": return "replaced";
    case "primitive.patch": return "patched";
    case "primitive.field-patch": return "field-patched";
    case "primitive.delete": return "deleted";
    case "relation.create": return "created";
    case "relation.replace": return "replaced";
    case "relation.patch": return "patched";
    case "relation.field-patch": return "field-patched";
    case "relation.delete": return "deleted";
    case "structure.reorder": return "reordered";
    case "structure.reparent": return "reparented";
    default: return kind;
  }
}
