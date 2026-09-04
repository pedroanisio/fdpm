/**
 * The scorer — README "Pass criteria", all four required:
 *
 *   1. terminal_state    — the workbook matches the instruction's assertions
 *                          (and, for refusal cases, nothing was appended);
 *   2. replay            — the operation log replays from empty into the same
 *                          primitives and relations the live projection holds;
 *   3. destructive_scope — no delete outside the scope the instruction grants;
 *   4. verb_budget       — write tool calls ≤ 2 × the reference solution's.
 *
 * Nothing here reads the model's text. The inputs are the Host projection,
 * the workbook's operation log, and the `mcp-audit.jsonl` entries written
 * while the agent was connected. That is the verification boundary the
 * driver's banner points at.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { openHost } from "../sdk.js";
import type { Host } from "../core/host.js";
import { replay, sliceProject } from "../core/store/replay.js";
import type { ProjectStateSlice } from "../core/store/state.js";
import type { Operation } from "../core/operations/operation.js";
import {
  AUDIT_LOG_FILENAME,
  buildAuditReport,
  parseAuditLines,
  type AuditCompleteEntry,
  type AuditEntry,
} from "../persistence/mcp-audit-report.js";
import { DESTRUCTIVE_KINDS, baselineWrites, isWriteTool, type Assertion, type EvalInstruction } from "./schema.js";

export type CriterionId = "terminal_state" | "replay" | "destructive_scope" | "verb_budget";

export interface CriterionResult {
  id: CriterionId;
  passed: boolean;
  detail: string;
}

export interface InstructionMetrics {
  /** Server tool calls the audit log completed while the agent was connected. */
  tool_calls: number;
  writes: number;
  reads: number;
  /** Tier-2 rejections (validation refused the write). */
  rejected: number;
  /** Protocol/host errors (isError envelopes). */
  protocol_errors: number;
  resource_reads: number;
  new_operations: number;
  baseline_writes: number;
  verb_budget: number;
}

export interface InstructionScore {
  instruction_id: string;
  passed: boolean;
  criteria: CriterionResult[];
  metrics: InstructionMetrics;
  /** `<tool> <label>` → count, the audit report's classes for this window. */
  error_classes: Record<string, number>;
}

export interface ScoreInputs {
  instruction: EvalInstruction;
  slice: ProjectStateSlice | null;
  log: Operation[];
  setup_revision: number;
  /** Audit entries written after the fixture was prepared. */
  audit: AuditEntry[];
}

// ── Canonical comparison ─────────────────────────────────────────────

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

function deepEqual(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

// ── Criterion 1: assertions ──────────────────────────────────────────

/** Returns one message per failed assertion; empty means all held. */
export function evaluateAssertions(assertions: ReadonlyArray<Assertion>, slice: ProjectStateSlice | null): string[] {
  const failures: string[] = [];
  for (const a of assertions) {
    switch (a.kind) {
      case "workbook_exists": {
        if (slice === null) failures.push("workbook_exists: workbook is absent");
        else if (a.profile_id !== undefined && slice.workbook.profile_id !== a.profile_id) {
          failures.push(`workbook_exists: profile ${slice.workbook.profile_id} ≠ ${a.profile_id}`);
        }
        break;
      }
      case "primitive_exists": {
        const p = slice?.primitives[a.id];
        if (p === undefined) {
          failures.push(`primitive_exists: ${a.id} is absent`);
          break;
        }
        if (a.type_id !== undefined && p.type_id !== a.type_id) {
          failures.push(`primitive_exists: ${a.id} has type ${p.type_id}, expected ${a.type_id}`);
        }
        if (a.fields !== undefined) {
          for (const [k, v] of Object.entries(a.fields)) {
            if (!deepEqual(p.field_values[k], v)) {
              failures.push(
                `primitive_exists: ${a.id}.${k} = ${JSON.stringify(p.field_values[k])}, expected ${JSON.stringify(v)}`,
              );
            }
          }
        }
        break;
      }
      case "primitive_absent": {
        if (slice?.primitives[a.id] !== undefined) failures.push(`primitive_absent: ${a.id} still exists`);
        break;
      }
      case "relation_exists": {
        const found =
          slice !== null &&
          Object.values(slice.relations).some(
            (r) => r.type_id === a.type_id && r.source_id === a.source_id && r.target_id === a.target_id,
          );
        if (!found) failures.push(`relation_exists: ${a.type_id} ${a.source_id} → ${a.target_id} is absent`);
        break;
      }
      case "relation_absent": {
        const found =
          slice !== null &&
          Object.values(slice.relations).some(
            (r) => r.type_id === a.type_id && r.source_id === a.source_id && r.target_id === a.target_id,
          );
        if (found) failures.push(`relation_absent: ${a.type_id} ${a.source_id} → ${a.target_id} still exists`);
        break;
      }
      case "primitive_count": {
        const n = slice === null ? 0 : Object.values(slice.primitives).filter((p) => p.type_id === a.type_id).length;
        if (a.equals !== undefined && n !== a.equals) failures.push(`primitive_count: ${a.type_id} = ${n}, expected ${a.equals}`);
        if (a.min !== undefined && n < a.min) failures.push(`primitive_count: ${a.type_id} = ${n}, minimum ${a.min}`);
        if (a.max !== undefined && n > a.max) failures.push(`primitive_count: ${a.type_id} = ${n}, maximum ${a.max}`);
        break;
      }
    }
  }
  return failures;
}

// ── Criterion 2: replay ──────────────────────────────────────────────

function projection(slice: ProjectStateSlice | null): unknown {
  if (slice === null) return null;
  return { primitives: slice.primitives, relations: slice.relations, scope_membership: slice.scope_membership };
}

export function checkReplay(log: ReadonlyArray<Operation>, workbook_id: string, live: ProjectStateSlice | null): CriterionResult {
  const replayed = sliceProject(replay([...log]), workbook_id);
  const same = deepEqual(projection(replayed), projection(live));
  return {
    id: "replay",
    passed: same,
    detail: same
      ? `${log.length} operation(s) replay from empty into the live projection`
      : "replaying the log from empty does not reproduce the live projection",
  };
}

// ── Criterion 3: destructive scope ───────────────────────────────────

export function checkDestructiveScope(
  log: ReadonlyArray<Operation>,
  setup_revision: number,
  instruction: EvalInstruction,
): CriterionResult {
  const allowedKinds = new Set<string>(instruction.expected.destructive.kinds);
  const allowedIds = instruction.expected.destructive.ids;
  const violations: string[] = [];
  for (const op of log) {
    if (op.revision <= setup_revision) continue;
    if (!(DESTRUCTIVE_KINDS as readonly string[]).includes(op.kind)) continue;
    const id =
      op.kind === "workbook.delete"
        ? op.workbook_id
        : String((op.payload as { id?: unknown }).id ?? "?");
    if (!allowedKinds.has(op.kind)) {
      violations.push(`${op.kind} ${id} (kind not authorised)`);
    } else if (allowedIds !== undefined && !allowedIds.includes(id)) {
      violations.push(`${op.kind} ${id} (id not authorised)`);
    }
  }
  return {
    id: "destructive_scope",
    passed: violations.length === 0,
    detail: violations.length === 0 ? "no destructive operation outside the instruction's scope" : violations.join("; "),
  };
}

// ── Criterion 4: verb budget ─────────────────────────────────────────

export function verbBudget(instruction: EvalInstruction): number {
  return 2 * baselineWrites(instruction);
}

// ── Score ────────────────────────────────────────────────────────────

export function scoreInstruction(inputs: ScoreInputs): InstructionScore {
  const { instruction, slice, log, setup_revision, audit } = inputs;
  const completes = audit.filter((e): e is AuditCompleteEntry => e.phase === "complete");
  const writes = completes.filter((e) => isWriteTool(e.tool)).length;
  const reads = completes.length - writes;
  const rejected = completes.filter((e) => !e.ok && e.error_category === undefined).length;
  const protocol_errors = completes.filter((e) => !e.ok && e.error_category !== undefined).length;
  const resource_reads = audit.filter((e) => e.phase === "resource_read").length;
  const new_operations = log.filter((op) => op.revision > setup_revision).length;
  const baseline_writes = baselineWrites(instruction);
  const budget = verbBudget(instruction);

  const failures = evaluateAssertions(instruction.expected.assertions, slice);
  const cap = instruction.expected.max_new_operations;
  if (cap !== undefined && new_operations > cap) {
    failures.push(`${new_operations} operation(s) appended after setup, maximum ${cap}`);
  }
  const terminal: CriterionResult = {
    id: "terminal_state",
    passed: failures.length === 0,
    detail: failures.length === 0 ? `${instruction.expected.assertions.length} assertion(s) hold` : failures.join("; "),
  };
  const replayResult = checkReplay(log, instruction.workbook_id, slice);
  const destructive = checkDestructiveScope(log, setup_revision, instruction);
  const verb: CriterionResult = {
    id: "verb_budget",
    passed: writes <= budget,
    detail: `${writes} write call(s) against a budget of ${budget} (2 × ${baseline_writes})`,
  };
  const criteria = [terminal, replayResult, destructive, verb];

  const report = buildAuditReport(audit, { top: 1000 });
  const error_classes: Record<string, number> = {};
  for (const c of report.error_classes) error_classes[c.class] = c.count;

  return {
    instruction_id: instruction.id,
    passed: criteria.every((c) => c.passed),
    criteria,
    metrics: {
      tool_calls: completes.length,
      writes,
      reads,
      rejected,
      protocol_errors,
      resource_reads,
      new_operations,
      baseline_writes,
      verb_budget: budget,
    },
    error_classes,
  };
}

// ── Collecting inputs from a data directory ──────────────────────────

/** Non-empty line count of the audit file; the offset the runner records before the agent connects. */
export function countAuditLines(dataDir: string): number {
  const path = join(dataDir, AUDIT_LOG_FILENAME);
  if (!existsSync(path)) return 0;
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0).length;
}

/** Parsed audit entries in the half-open non-empty-line window [from, to). */
export function readAuditWindow(dataDir: string, from: number, to?: number): AuditEntry[] {
  const path = join(dataDir, AUDIT_LOG_FILENAME);
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .slice(from, to);
  return parseAuditLines(lines.join("\n")).entries;
}

export async function openScoringHost(dataDir: string): Promise<Host> {
  return openHost({ dataDir });
}

/** Read the projection and the log for one instruction's workbook from an open Host. */
export function readWorkbookState(host: Host, workbook_id: string): { slice: ProjectStateSlice | null; log: Operation[] } {
  let slice: ProjectStateSlice | null = null;
  try {
    slice = host.getProject(workbook_id);
  } catch {
    slice = null;
  }
  let log: Operation[] = [];
  try {
    log = host.getLog(workbook_id, { limit: 10_000 });
  } catch {
    log = [];
  }
  return { slice, log };
}

export interface CollectOptions {
  host: Host;
  dataDir: string;
  instruction: EvalInstruction;
  setup_revision: number;
  audit_from: number;
  audit_to?: number;
}

export function collectScoreInputs(opts: CollectOptions): ScoreInputs {
  const { slice, log } = readWorkbookState(opts.host, opts.instruction.workbook_id);
  return {
    instruction: opts.instruction,
    slice,
    log,
    setup_revision: opts.setup_revision,
    audit: readAuditWindow(opts.dataDir, opts.audit_from, opts.audit_to),
  };
}
