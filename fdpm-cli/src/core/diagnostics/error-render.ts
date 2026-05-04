/**
 * Human-mode error rendering for the bin handler.
 *
 * The CLI's `--json` mode is the machine contract: it dumps the full
 * `FDPMException` envelope (including every finding and every evidence
 * field) for downstream parsers. Human mode is a different contract —
 * it has to produce a scannable terminal output where the operator can
 * tell *what's wrong* without scrolling through hundreds of pretty-
 * printed JSON objects.
 *
 * Pre-fix, the bin handler called `JSON.stringify(err.findings, null, 2)`
 * and `JSON.stringify(err.evidence, null, 2)` directly, which is fine
 * for 1–2 findings but unusable when (e.g.) `validate` returns 200
 * findings or the §8 verification gate attaches a 50-item Zod issues
 * array. This module produces a compact summary by default and offers
 * `--verbose` (or `FDPM_VERBOSE=1`) as the escape hatch when an
 * operator wants the full dump in human mode.
 *
 * Information is never lost — the same operator can either:
 *   - re-run the failing command with `--verbose` to see everything,
 *   - re-run with `--json` to get the structured envelope.
 *
 * `--json` mode is unaffected — that path doesn't go through this
 * module.
 */
import type { FDPMException } from "../errors/fdpm-exception.js";
import type { ValidationFinding } from "../models/instance.js";

const FINDING_HEAD_LIMIT = 5;
const ARRAY_PREVIEW_LIMIT = 3;

/** Whether the operator asked for full verbose output. */
export function isVerbose(argv: readonly string[] = process.argv): boolean {
  if (argv.includes("--verbose")) return true;
  const env = process.env["FDPM_VERBOSE"];
  return env !== undefined && env !== "" && env !== "0" && env !== "false";
}

/**
 * Render a single ValidationFinding as a single line.
 *
 * `<level> <rule_id> @ <target_id>[<field_path>]: <message>`
 *
 * The format is designed to be greppable: a stable column-ish layout
 * where the level is leftmost and the message is rightmost.
 */
export function renderFindingLine(f: ValidationFinding): string {
  const field = f.field_path ? `[${f.field_path}]` : "";
  return `${f.level.padEnd(7)} ${f.rule_id} @ ${f.target_id}${field}: ${f.message}`;
}

/**
 * Render a findings array.
 *
 * Verbose: pretty-printed JSON (legacy behaviour preserved verbatim so
 *   a `--verbose` flag is a clean superset of the old default).
 * Non-verbose: up to FINDING_HEAD_LIMIT compact lines, then a "+K more"
 *   tail with the hint to re-run.
 */
export function renderFindings(
  findings: readonly ValidationFinding[],
  opts: { verbose: boolean },
): string {
  if (findings.length === 0) return "";
  if (opts.verbose) {
    return `findings: ${JSON.stringify(findings, null, 2)}`;
  }
  const head = findings.slice(0, FINDING_HEAD_LIMIT);
  const lines = ["findings:"];
  for (const f of head) lines.push(`  - ${renderFindingLine(f)}`);
  const remainder = findings.length - head.length;
  if (remainder > 0) {
    lines.push(
      `  (+${remainder} more — re-run with --verbose to see all)`,
    );
  }
  return lines.join("\n");
}

/**
 * Compact rendering for an evidence value.
 *
 * - Primitive values (string/number/boolean/null): inline.
 * - Arrays: if 1..ARRAY_PREVIEW_LIMIT items, inline JSON; otherwise
 *   `<N> items — first <K>: [...]`.
 * - Objects: inline JSON if it fits comfortably on one line (< 80 chars);
 *   otherwise pretty-printed but indented under the key.
 */
function renderEvidenceValue(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    if (value.length <= ARRAY_PREVIEW_LIMIT) {
      return JSON.stringify(value);
    }
    const preview = value.slice(0, ARRAY_PREVIEW_LIMIT);
    return `${value.length} items — first ${ARRAY_PREVIEW_LIMIT}: ${JSON.stringify(preview)}`;
  }
  // Object — inline if short, otherwise pretty.
  const inline = JSON.stringify(value);
  if (inline.length <= 80) return inline;
  return JSON.stringify(value, null, 2);
}

/**
 * Render an evidence map.
 *
 * Verbose: pretty-printed JSON of the whole map (legacy behaviour).
 * Non-verbose: one `key: <compact-value>` line per top-level key.
 */
export function renderEvidence(
  evidence: Record<string, unknown> | undefined,
  opts: { verbose: boolean },
): string {
  if (!evidence || Object.keys(evidence).length === 0) return "";
  if (opts.verbose) {
    return `evidence: ${JSON.stringify(evidence, null, 2)}`;
  }
  const lines = ["evidence:"];
  for (const [k, v] of Object.entries(evidence)) {
    const rendered = renderEvidenceValue(v);
    // If the rendered value is multi-line (e.g. a long object kept as
    // pretty JSON), indent each line so the key prefix stays scannable.
    if (rendered.includes("\n")) {
      const indented = rendered.split("\n").map((l) => `    ${l}`).join("\n");
      lines.push(`  ${k}:\n${indented}`);
    } else {
      lines.push(`  ${k}: ${rendered}`);
    }
  }
  return lines.join("\n");
}

/**
 * Render a complete FDPMException for human-mode stderr output.
 *
 * Returns a string with embedded newlines but NO trailing newline; the
 * caller appends `\n` (matching the bin handler's existing style).
 */
export function renderHumanError(
  err: FDPMException,
  opts: { verbose: boolean },
): string {
  const parts = [`error: [${err.category}] ${err.message}`];
  const findings = renderFindings(err.findings as ValidationFinding[] | undefined ?? [], opts);
  if (findings.length > 0) parts.push(findings);
  const evidence = renderEvidence(err.evidence, opts);
  if (evidence.length > 0) parts.push(evidence);
  return parts.join("\n");
}
