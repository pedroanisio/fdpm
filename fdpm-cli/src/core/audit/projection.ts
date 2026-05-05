import type { Operation } from "../operations/operation.js";
import { replay, sliceProject } from "../store/replay.js";

/**
 * §13.3 Audit projection — `AuditRecord` is a derived view of `Operation`.
 *
 * `diff` is computed by replaying the log up to `op_id - 1` to
 * reconstruct pre-state, then computing the structural diff against the
 * effect.
 *
 * `diff` is bounded by FDPM_AUDIT_DIFF_MAX_BYTES (default 32 KiB).
 */

export interface AuditRecord {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  target_id: string;
  diff: Record<string, unknown>;
  plugin_id: string | null;
  request_id: string;
  op_id: string;
}

const DIFF_MAX_BYTES = parseInt(
  process.env["FDPM_AUDIT_DIFF_MAX_BYTES"] ?? `${32 * 1024}`,
  10,
);

let truncatedCount = 0;
export function getAuditTruncatedCount(): number {
  return truncatedCount;
}
export function resetAuditTruncatedCount(): void {
  truncatedCount = 0;
}

function targetIdOf(op: Operation): string {
  const p = op.payload as Record<string, unknown>;
  return (
    (p["id"] as string) ??
    (p["workbook_id"] as string) ??
    (p["template_id"] as string) ??
    (p["suite_id"] as string) ??
    (p["primitive_id"] as string) ??
    op.workbook_id
  );
}

function truncateDiff(diff: Record<string, unknown>): Record<string, unknown> {
  const json = JSON.stringify(diff);
  if (Buffer.byteLength(json, "utf8") <= DIFF_MAX_BYTES) return diff;
  truncatedCount++;
  const out: Record<string, unknown> = { _audit_truncated: true };
  for (const [k, v] of Object.entries(diff)) {
    if (v == null || typeof v !== "object") {
      out[k] = v;
      continue;
    }
    const slot: Record<string, unknown> = {};
    for (const [kk, vv] of Object.entries(v as Record<string, unknown>)) {
      const bytes = Buffer.byteLength(JSON.stringify(vv ?? null), "utf8");
      if (bytes > 256) slot[kk] = { _truncated: true, _original_bytes: bytes };
      else slot[kk] = vv;
    }
    out[k] = slot;
  }
  return out;
}

export function buildAuditRecord(op: Operation, log: Operation[]): AuditRecord {
  const before = log.filter((o) => o.revision < op.revision);
  const beforeState = replay(before);
  const beforeSlice = sliceProject(beforeState, op.workbook_id);
  const after = [...before, op];
  const afterState = replay(after);
  const afterSlice = sliceProject(afterState, op.workbook_id);
  const target_id = targetIdOf(op);

  let diffPayload: Record<string, unknown>;
  if (op.kind.startsWith("primitive.")) {
    diffPayload = {
      before: beforeSlice?.primitives[target_id] ?? null,
      after: afterSlice?.primitives[target_id] ?? null,
    };
  } else if (op.kind.startsWith("relation.")) {
    diffPayload = {
      before: beforeSlice?.relations[target_id] ?? null,
      after: afterSlice?.relations[target_id] ?? null,
    };
  } else if (op.kind.startsWith("workbook.")) {
    diffPayload = {
      before: beforeSlice?.workbook ?? null,
      after: afterSlice?.workbook ?? null,
    };
  } else {
    diffPayload = { before: null, after: op.payload };
  }

  return {
    id: op.op_id,
    op_id: op.op_id,
    timestamp: op.timestamp,
    actor: op.actor,
    action: op.kind,
    target_id,
    diff: truncateDiff(diffPayload),
    plugin_id: op.plugin_id ?? null,
    request_id: op.request_id,
  };
}
