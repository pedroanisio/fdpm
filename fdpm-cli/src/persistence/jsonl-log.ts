import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { Operation } from "../core/operations/operation.js";
import { FDPMException } from "../core/errors/fdpm-exception.js";

/**
 * Persistence — JSONL log per workbook.
 *
 * §6.4 commits the operation shape but defers disk persistence to
 * SPEC-CORE-PERSISTENCE. The CLI ships a JSONL writer because a CLI
 * without between-invocation persistence is not useful — but the shape
 * is exactly the locked Operation shape, so a future bytes-on-disk SPEC
 * can supersede this file without changing semantics.
 */

export function defaultDataDir(): string {
  return process.env["FDPM_DATA_DIR"] ?? join(homedir(), ".fdpm-cli");
}

function logPathFor(dataDir: string, workbook_id: string): string {
  return join(dataDir, "workbooks", workbook_id, "log.jsonl");
}

function manifestPath(dataDir: string): string {
  return join(dataDir, "manifest.json");
}

/**
 * Produce a bounded, case-fold-safe filename while retaining a readable
 * prefix. The digest uses the original ID, so punctuation and case variants
 * remain distinct even on case-insensitive filesystems.
 */
export function profileFilenameFor(id: string): string {
  const slug =
    id
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 96) || "profile";
  const digest = createHash("sha256").update(id, "utf8").digest("hex");
  return `${slug}--${digest}.json`;
}

export interface DataLayout {
  dataDir: string;
}

export class JsonlLogStore {
  constructor(public readonly dataDir: string) {}

  init(): void {
    if (!existsSync(this.dataDir)) mkdirSync(this.dataDir, { recursive: true });
    if (!existsSync(manifestPath(this.dataDir))) {
      const manifest = { spec_core: "1.1", host: "fdpm-cli", workbooks: [] as string[] };
      mkdirSync(this.dataDir, { recursive: true });
      // Write atomically.
      // Sync write at startup is fine.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      // node:fs is allowed
      // (we deliberately use sync APIs for the init path only)
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      fs.writeFile(manifestPath(this.dataDir), JSON.stringify(manifest, null, 2));
    }
  }

  /**
   * SPEC-REPL §10.2 freshness check: returns the (mtime_ns, size)
   * pair for a workbook's JSONL log, or `null` if the log file does not
   * yet exist (the workbook has been created but no operation has been
   * persisted, or the workbook is unknown). Used by the REPL and
   * SPEC-MCP-SERVER to detect out-of-band writes by another process
   * between commands; never touches the file's contents and is safe
   * to call hot per-command.
   *
   * Resolution: nanosecond mtime via `stats.mtimeNs` (Node's bigint
   * timestamp). Two writes within the same millisecond are
   * disambiguated. The (mtime_ns, size) tuple together is the
   * freshness key — comparing only one of them misses size-preserving
   * rewrites and ms-aliased writes respectively.
   *
   * Synchronous on purpose: the freshness check runs in the REPL's
   * pre-dispatch path and must not yield to the event loop (a yield
   * could let an in-flight write race ahead of the stat). `statSync`
   * with `bigint: true` returns `mtimeNs` as `bigint`.
   */
  statProjectLog(workbook_id: string): { mtime_ns: bigint; size: bigint } | null {
    const path = logPathFor(this.dataDir, workbook_id);
    try {
      const stats = statSync(path, { bigint: true });
      return { mtime_ns: stats.mtimeNs, size: stats.size };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async listProjectIds(): Promise<string[]> {
    if (!existsSync(this.dataDir)) return [];
    const root = join(this.dataDir, "workbooks");
    if (!existsSync(root)) return [];
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  }

  profileDir(): string {
    return join(this.dataDir, "profiles");
  }

  async listProfileFiles(): Promise<string[]> {
    const dir = this.profileDir();
    if (!existsSync(dir)) return [];
    const entries = await fs.readdir(dir);
    return entries.filter((f) => f.endsWith(".json")).map((f) => join(dir, f));
  }

  async writeProfile(id: string, profile: unknown): Promise<void> {
    const dir = this.profileDir();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    await fs.writeFile(
      join(dir, profileFilenameFor(id)),
      JSON.stringify(profile, null, 2),
      "utf8",
    );
  }

  async readProfileFile(path: string): Promise<unknown> {
    const text = await fs.readFile(path, "utf8");
    return JSON.parse(text);
  }

  async readLog(workbook_id: string): Promise<Operation[]> {
    const path = logPathFor(this.dataDir, workbook_id);
    if (!existsSync(path)) return [];
    const text = await fs.readFile(path, "utf8");
    const lines = text.split("\n").filter((l) => l.length > 0);
    const out: Operation[] = [];
    for (const [i, line] of lines.entries()) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch (err) {
        // Bad bytes on disk are invalid input to the replay reader, not a
        // host logic bug — the operator can repair the log. Mirrors the
        // adjacent `invalid operation` throw so a corrupt log and a
        // schema-violating log surface with the same exit code.
        throw new FDPMException(
          "verification",
          `corrupt log at ${path}:${i + 1}: ${(err as Error).message}`,
          { evidence: { path, line: i + 1, parse_error: (err as Error).message } },
        );
      }
      const result = Operation.safeParse(parsed);
      if (!result.success) {
        throw new FDPMException("verification", `invalid operation at ${path}:${i + 1}`, {
          evidence: { path, line: i + 1, issues: result.error.issues },
        });
      }
      out.push(result.data);
    }
    return out;
  }

  async appendOp(op: Operation): Promise<void> {
    const path = logPathFor(this.dataDir, op.workbook_id);
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    await fs.appendFile(path, JSON.stringify(op) + "\n", "utf8");
  }

  async deleteProject(workbook_id: string): Promise<void> {
    const dir = join(this.dataDir, "workbooks", workbook_id);
    if (existsSync(dir)) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }

  async readAllLogs(): Promise<Operation[]> {
    const ids = await this.listProjectIds();
    const all: Operation[] = [];
    for (const id of ids) all.push(...(await this.readLog(id)));
    return all;
  }
}
