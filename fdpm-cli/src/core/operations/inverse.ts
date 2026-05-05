import type { Operation } from "./operation.js";
import type { OperationKind } from "./kinds.js";
import type { StoreState } from "../store/state.js";
import { sliceProject, replay } from "../store/replay.js";
import { applyPatch, type JsonPatchOp } from "./json-patch.js";
import { FDPMException } from "../errors/fdpm-exception.js";

/**
 * §9.8.4 Per-kind inverse computation.
 *
 * Returns an `AppendInput`-shaped descriptor (kind + payload + workbook_id)
 * that, when appended, undoes the effect of `target` against the current
 * state. If the target cannot be cleanly inverted, throws conflict.
 */
export interface InverseDescriptor {
  kind: OperationKind;
  workbook_id: string;
  payload: Record<string, unknown>;
  causation_op_id: string;
}

export function computeInverse(
  target: Operation,
  state: StoreState,
  fullLog: Operation[],
): InverseDescriptor {
  const workbook_id = target.workbook_id;
  const cur = sliceProject(state, workbook_id);
  // Reconstruct pre-target state for kinds that need before-values.
  const preLog = fullLog.filter((o) => o.revision < target.revision);
  const preState = replay(preLog);
  const pre = sliceProject(preState, workbook_id);

  switch (target.kind) {
    case "primitive.create": {
      const id = (target.payload as { id: string }).id;
      if (!cur || !(id in cur.primitives))
        throw new FDPMException("conflict", `cannot undo primitive.create: ${id} no longer present`);
      return {
        kind: "primitive.delete",
        workbook_id,
        payload: { id },
        causation_op_id: target.op_id,
      };
    }
    case "primitive.delete": {
      const id = (target.payload as { id: string }).id;
      const prior = pre?.primitives[id];
      if (!prior)
        throw new FDPMException("conflict", "cannot undo primitive.delete: pre-state missing");
      return {
        kind: "primitive.create",
        workbook_id,
        payload: {
          id: prior.id,
          type_id: prior.type_id,
          field_values: prior.field_values,
          ...(prior.scope_id != null && { scope_id: prior.scope_id }),
        },
        causation_op_id: target.op_id,
      };
    }
    case "primitive.replace":
    case "primitive.patch": {
      const id = (target.payload as { id: string }).id;
      const prior = pre?.primitives[id];
      if (!prior)
        throw new FDPMException("conflict", "cannot undo: pre-state missing");
      return {
        kind: "primitive.replace",
        workbook_id,
        payload: {
          id: prior.id,
          type_id: prior.type_id,
          field_values: prior.field_values,
          ...(prior.scope_id != null && { scope_id: prior.scope_id }),
        },
        causation_op_id: target.op_id,
      };
    }
    case "primitive.field-patch": {
      const p = target.payload as { id: string; operations: JsonPatchOp[] };
      const id = p.id;
      const prior = pre?.primitives[id];
      if (!prior)
        throw new FDPMException("conflict", "cannot undo field-patch: pre-state missing");
      // Recompute inverse by re-running the original patch on prior values.
      const { inverse } = applyPatch(prior.field_values, p.operations, ["id", "type_id"]);
      return {
        kind: "primitive.field-patch",
        workbook_id,
        payload: { id, operations: inverse },
        causation_op_id: target.op_id,
      };
    }
    case "relation.create": {
      const id = (target.payload as { id: string }).id;
      return {
        kind: "relation.delete",
        workbook_id,
        payload: { id },
        causation_op_id: target.op_id,
      };
    }
    case "relation.delete": {
      const id = (target.payload as { id: string }).id;
      const prior = pre?.relations[id];
      if (!prior)
        throw new FDPMException("conflict", "cannot undo relation.delete: pre-state missing");
      return {
        kind: "relation.create",
        workbook_id,
        payload: {
          id: prior.id,
          type_id: prior.type_id,
          source_id: prior.source_id,
          target_id: prior.target_id,
          field_values: prior.field_values,
        },
        causation_op_id: target.op_id,
      };
    }
    case "relation.replace":
    case "relation.patch": {
      const id = (target.payload as { id: string }).id;
      const prior = pre?.relations[id];
      if (!prior) throw new FDPMException("conflict", "cannot undo: pre-state missing");
      return {
        kind: "relation.replace",
        workbook_id,
        payload: {
          id: prior.id,
          type_id: prior.type_id,
          field_values: prior.field_values,
        },
        causation_op_id: target.op_id,
      };
    }
    case "relation.field-patch": {
      const p = target.payload as { id: string; operations: JsonPatchOp[] };
      const prior = pre?.relations[p.id];
      if (!prior)
        throw new FDPMException("conflict", "cannot undo: pre-state missing");
      const { inverse } = applyPatch(prior.field_values, p.operations, [
        "id",
        "type_id",
        "source_id",
        "target_id",
      ]);
      return {
        kind: "relation.field-patch",
        workbook_id,
        payload: { id: p.id, operations: inverse },
        causation_op_id: target.op_id,
      };
    }
    case "structure.reorder": {
      const p = target.payload as { scope_id: string; ordering: string[] };
      const priorOrdering = pre?.scope_membership[p.scope_id] ?? [];
      return {
        kind: "structure.reorder",
        workbook_id,
        payload: { scope_id: p.scope_id, ordering: priorOrdering },
        causation_op_id: target.op_id,
      };
    }
    case "structure.reparent": {
      const p = target.payload as {
        primitive_id: string;
        from_scope_id: string;
        to_scope_id: string;
        position?: number;
      };
      const priorList = pre?.scope_membership[p.from_scope_id] ?? [];
      const priorPos = priorList.indexOf(p.primitive_id);
      return {
        kind: "structure.reparent",
        workbook_id,
        payload: {
          primitive_id: p.primitive_id,
          from_scope_id: p.to_scope_id,
          to_scope_id: p.from_scope_id,
          position: priorPos >= 0 ? priorPos : 0,
        },
        causation_op_id: target.op_id,
      };
    }
    case "workbook.create": {
      return {
        kind: "workbook.delete",
        workbook_id,
        payload: { workbook_id },
        causation_op_id: target.op_id,
      };
    }
    case "workbook.clone": {
      const p = target.payload as { target_workbook_id: string };
      return {
        kind: "workbook.delete",
        workbook_id: p.target_workbook_id,
        payload: { workbook_id: p.target_workbook_id },
        causation_op_id: target.op_id,
      };
    }
    default:
      throw new FDPMException(
        "conflict",
        `inverse not defined or not undo-able for kind ${target.kind}`,
      );
  }
}
