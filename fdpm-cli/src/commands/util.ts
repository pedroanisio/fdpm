import { promises as fs, existsSync, writeSync } from "node:fs";
import { FDPMException } from "../core/errors/fdpm-exception.js";

/**
 * Shared helpers for command modules — JSON output, input loading,
 * stdin reading, exit-code mapping.
 */

export interface OutputContext {
  json: boolean;
}

export interface TableColumn<T> {
  header: string;
  value: (row: T) => string | number;
  align?: "left" | "right";
}

export function emit(ctx: OutputContext, payload: unknown, human?: () => string): void {
  // SPEC-REPL §8.2 + SPEC-MCP-SERVER both require one JSON value per
  // line in agent-driven mode. The one-shot CLI keeps its
  // pretty-printed default for human readability; the REPL and MCP
  // dispatchers set `FDPM_JSON_COMPACT=1` at session start so this
  // helper produces line-delimited JSON. The choice is environmental,
  // not per-call, so every command module gets it without API churn.
  const compact = process.env["FDPM_JSON_COMPACT"] === "1";
  const text = ctx.json
    ? JSON.stringify(payload, null, compact ? undefined : 2) + "\n"
    : human
      ? human() + "\n"
      : JSON.stringify(payload, null, compact ? undefined : 2) + "\n";
  writeAllSync(text);
}

export function renderTable<T>(
  rows: readonly T[],
  columns: readonly TableColumn<T>[],
  opts: { empty: string },
): string {
  if (rows.length === 0) return opts.empty;

  const widths = columns.map((column) => {
    const cellWidths = rows.map((row) => String(column.value(row)).length);
    return Math.max(column.header.length, ...cellWidths);
  });

  const formatRow = (cells: readonly string[], isHeader = false): string =>
    cells
      .map((cell, idx) => {
        const align = isHeader ? "left" : (columns[idx]?.align ?? "left");
        return align === "right" ? cell.padStart(widths[idx]!) : cell.padEnd(widths[idx]!);
      })
      .join("  ");

  const header = formatRow(columns.map((column) => column.header), true);
  const body = rows.map((row) =>
    formatRow(columns.map((column) => String(column.value(row)))),
  );
  return [header, ...body].join("\n");
}

/**
 * Synchronously write `text` to stdout, even when stdout is a pipe with
 * a full kernel buffer.
 *
 * Why this matters: `process.stdout.write` returns `false` when the
 * write was buffered but not flushed. A short-lived CLI that exits
 * immediately after writing a large payload to a pipe can lose any
 * bytes still in the buffer. The default pipe buffer on Linux is
 * 64 KiB; large JSON outputs (e.g. `validate --json` on a workbook with
 * hundreds of primitives) silently truncate to that boundary when
 * piped through a slow-ish consumer.
 *
 * Reproducer that exposed this: `fdpm validate roadmap-v052 --json |
 * python3 -c "..."` returned exactly 65,296 bytes regardless of how
 * large the payload actually was; redirecting to a file gave the full
 * 600 KiB. Shorter payloads (~120 KiB `profile get`) and faster
 * consumers (`wc -c` between two short shell commands) didn't trigger
 * it because the pipe drained naturally.
 *
 * Solution: switch to a synchronous fd write. `fs.writeSync` blocks
 * until the kernel accepts the bytes; pipe backpressure surfaces as
 * EAGAIN/EWOULDBLOCK and we retry. Slightly slower than the async
 * path for small writes, but correct for large ones, and the cost is
 * negligible for a CLI that exits immediately after.
 *
 * Note on testing: the bug is environmental (kernel pipe buffer +
 * consumer scheduling) and does not reliably reproduce inside
 * vitest's `spawnSync` test harness — sh-spawned subprocess pipes
 * appear to drain during the parent's `read-to-EOF` wait. Any unit
 * test that "verifies" this by asserting equal byte counts is
 * comparing the synchronous and asynchronous paths in conditions
 * where neither truncates, providing false confidence. The fix is
 * verified by manual reproduction; the regression coverage lives in
 * the manual repro recipe above, not in an automated test.
 *
 * Falls back to the async write if fd-1 isn't writable (TTY edge cases).
 */
function writeAllSync(text: string): void {
  const buf = Buffer.from(text, "utf8");
  let offset = 0;
  const fd = 1; // stdout
  while (offset < buf.length) {
    try {
      const n = writeSync(fd, buf, offset, buf.length - offset);
      if (n <= 0) break;
      offset += n;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "EAGAIN" || code === "EWOULDBLOCK") continue;
      // Fallback: pipe was closed (EPIPE), TTY oddity, etc. Use the
      // async write so Node's stream layer handles it.
      process.stdout.write(buf.subarray(offset));
      return;
    }
  }
}

export async function readInput(path?: string): Promise<unknown> {
  let text: string;
  if (!path || path === "-") {
    text = await readStdin();
  } else {
    if (!existsSync(path)) throw new FDPMException("not_found", `file not found: ${path}`);
    text = await fs.readFile(path, "utf8");
  }
  const max = parseInt(process.env["FDPM_MAX_REQUEST_BYTES"] ?? `${5 * 1024 * 1024}`, 10);
  const observed = Buffer.byteLength(text, "utf8");
  if (observed > max)
    throw new FDPMException("quota", `input ${observed} exceeds cap ${max}`, {
      evidence: { observed, cap: max, unit: "bytes", env: "FDPM_MAX_REQUEST_BYTES" },
    });
  if (text.trim().length === 0) return {};
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new FDPMException("verification", `invalid JSON: ${(err as Error).message}`);
  }
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function parseKindCsv(csv: string | undefined): string[] | undefined {
  if (!csv) return undefined;
  return csv.split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * Parse `--match` / `--match-regex` repeated args into the structured
 * shape `searchPrimitives` / `searchRelations` accepts. Each entry may
 * be a bare needle (search the whole `field_values`) or `path=needle`
 * to restrict to one top-level field key.
 *
 * For `--match-regex` entries, the needle is pre-validated as a real
 * regex pattern up front: invalid syntax surfaces as an FDPMException
 * with `verification` category instead of a raw SyntaxError later from
 * the matcher.
 */
export function parseFieldMatchArgs(
  match: string[] | undefined,
  matchRegex: string[] | undefined,
): Array<{ path?: string; needle: string; regex?: boolean }> {
  const out: Array<{ path?: string; needle: string; regex?: boolean }> = [];
  const split = (raw: string): { path?: string; needle: string } => {
    const eq = raw.indexOf("=");
    if (eq <= 0) return { needle: raw };
    return { path: raw.slice(0, eq), needle: raw.slice(eq + 1) };
  };
  for (const m of match ?? []) out.push(split(m));
  for (const m of matchRegex ?? []) {
    const parts = split(m);
    compileRegexOrThrow(parts.needle, "--match-regex");
    out.push({ ...parts, regex: true });
  }
  return out;
}

/**
 * Compile a user-supplied regex string. Surfaces invalid patterns as a
 * typed FDPMException so the CLI exits cleanly with category `verification`
 * (exit code 2) instead of dumping a JavaScript SyntaxError stack trace.
 */
export function compileRegexOrThrow(pattern: string, source: string): RegExp {
  try {
    return new RegExp(pattern);
  } catch (err) {
    throw new FDPMException(
      "verification",
      `${source}: invalid regex "${pattern}": ${(err as Error).message}`,
    );
  }
}
