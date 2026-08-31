import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import {
  existsSync,
  mkdirSync,
  statSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { homedir, hostname } from "node:os";
import { AsyncLocalStorage } from "node:async_hooks";
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

function lockPathFor(dataDir: string, workbook_id: string): string {
  return join(dataDir, "workbooks", workbook_id, "log.lock");
}

/**
 * Durability switch for the operation log.
 *
 * Default on. `fs.appendFile` alone leaves an acknowledged operation in
 * the page cache: a process crash is survivable, but a host crash or
 * power loss discards everything not yet written back — up to
 * `vm.dirty_expire_centisecs`, 30 s on a stock Linux. Returning success
 * for an operation that is not on stable storage is a durability bug,
 * not a tuning choice, so the fsync is default-on and the escape hatch
 * is explicit.
 *
 * Set `FDPM_FSYNC=0` for bulk import or throwaway workspaces, where
 * losing the tail on a host crash is acceptable and the import can be
 * re-run.
 */
function fsyncEnabled(): boolean {
  const raw = process.env["FDPM_FSYNC"];
  return raw !== "0" && raw !== "false";
}

interface LockHolder {
  pid: number;
  host: string;
  acquired_at: string;
}

/**
 * Ceiling on simultaneously-open log handles.
 *
 * Reusing a handle is what makes appends cheap, but a long-lived process
 * that touches many workbooks would otherwise hold one descriptor per
 * workbook for its lifetime and eventually hit the process fd limit.
 * Beyond this many, the least-recently-used handle is closed; reopening
 * costs one `open` and correctness never depends on the cache.
 */
const MAX_OPEN_LOGS = 64;

/** A lock older than this is treated as abandoned by a dead writer. */
const LOCK_STALE_MS = 30_000;
/** Total time to wait for a peer to release before giving up. */
const LOCK_TIMEOUT_MS = 10_000;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Workbook ids whose lock the current async context already holds.
 * Propagates across awaits, so a helper called from inside a critical
 * section is recognised as nested while an unrelated concurrent caller
 * is not.
 */
const LOCK_CONTEXT = new AsyncLocalStorage<Set<string>>();

export interface DataLayout {
  dataDir: string;
}

export class JsonlLogStore {
  /** Open append handles, one per workbook; see `handleFor`. */
  private readonly handles = new Map<string, fs.FileHandle>();
  /**
   * In-process serialisation, one promise chain per workbook. The file
   * lock excludes other processes; this excludes concurrent callers
   * inside this one, which would otherwise queue on the file lock and
   * waste a syscall round-trip apiece.
   */
  private readonly lockChain = new Map<string, Promise<void>>();

  constructor(public readonly dataDir: string) {}

  init(): void {
    if (!existsSync(this.dataDir)) mkdirSync(this.dataDir, { recursive: true });
    if (!existsSync(manifestPath(this.dataDir))) {
      const manifest = { spec_core: "1.1", host: "fdpm-cli", workbooks: [] as string[] };
      mkdirSync(this.dataDir, { recursive: true });
      // Synchronous on purpose, and the signature is the reason: `init()`
      // returns void, so every caller is entitled to read the manifest the
      // moment it returns. The promise-based `fs.writeFile` was called here
      // and floated behind a `no-floating-promises` disable, which broke that
      // contract two ways — a caller could read the manifest before it
      // existed, and a write that failed rejected with nobody holding the
      // promise. In the test suite that surfaced as an unhandled ENOENT when
      // the write landed after the temp directory had been removed, which
      // exited the whole run non-zero while every test passed.
      writeFileSync(manifestPath(this.dataDir), JSON.stringify(manifest, null, 2));
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

  /**
   * Synchronous sibling of `listProjectIds`, for the lazy loader.
   *
   * The projection is read through synchronous entry points
   * (`Store.getProject` and friends), so the load that backs them has to
   * be synchronous too. Making those async instead would push `await`
   * through the entire read surface for a cost paid once per workbook
   * per process.
   */
  listProjectIdsSync(): string[] {
    if (!existsSync(this.dataDir)) return [];
    const root = join(this.dataDir, "workbooks");
    if (!existsSync(root)) return [];
    return readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  }

  /** Synchronous sibling of `readLog`; same parsing and same errors. */
  readLogSync(workbook_id: string): Operation[] {
    const path = logPathFor(this.dataDir, workbook_id);
    if (!existsSync(path)) return [];
    return parseLogText(readFileSync(path, "utf8"), path);
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
    return parseLogText(await fs.readFile(path, "utf8"), path);
  }

  /**
   * Append one operation. Equivalent to `appendOps([op])`; kept as the
   * single-op entry point because most callers have exactly one.
   */
  async appendOp(op: Operation): Promise<void> {
    await this.appendOps([op]);
  }

  /**
   * Append a run of operations for one workbook as a single write plus a
   * single fsync (group commit).
   *
   * Two things this replaces, both measured in
   * `docs/architecture/PERFORMANCE-IO-ANALYSIS.md`:
   *
   *   - `fs.appendFile` per operation, which opens, writes and closes the
   *     file every time. Reusing one handle is ~59x cheaper per record;
   *     the open/close pair, not the write, was the cost.
   *   - a per-operation loop in every batch caller, which turned an
   *     N-operation batch into N of those syscall triples. One write and
   *     one fsync per batch amortises durability to the point where the
   *     durable path is still an order of magnitude faster than the old
   *     non-durable one.
   *
   * All operations MUST target the same workbook; a batch spanning
   * workbooks cannot be one atomic write and is rejected rather than
   * silently split.
   */
  async appendOps(ops: readonly Operation[]): Promise<void> {
    if (ops.length === 0) return;
    const workbook_id = ops[0]!.workbook_id;
    for (const op of ops) {
      if (op.workbook_id !== workbook_id) {
        throw new FDPMException(
          "verification",
          "appendOps requires a single workbook per call",
          { evidence: { expected: workbook_id, got: op.workbook_id } },
        );
      }
    }
    const handle = await this.handleFor(workbook_id);
    let payload = "";
    for (const op of ops) payload += JSON.stringify(op) + "\n";
    await handle.write(payload, null, "utf8");
    if (fsyncEnabled()) await handle.sync();
  }

  /**
   * Open-once, append-many handle for a workbook's log.
   *
   * Opened with "a", so every write lands at the true end of file even
   * when another process appends concurrently — O_APPEND makes the
   * seek-and-write atomic, which is why concurrent writers never tore a
   * line even at 64 KB records. What O_APPEND does not provide is
   * agreement on revision numbers; that is `withWorkbookLock`'s job.
   */
  private async handleFor(workbook_id: string): Promise<fs.FileHandle> {
    const cached = this.handles.get(workbook_id);
    if (cached) {
      // Re-insert to mark most-recently-used; Map iterates in insertion order.
      this.handles.delete(workbook_id);
      this.handles.set(workbook_id, cached);
      return cached;
    }
    const path = logPathFor(this.dataDir, workbook_id);
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const handle = await fs.open(path, "a");
    this.handles.set(workbook_id, handle);
    while (this.handles.size > MAX_OPEN_LOGS) {
      const oldest = this.handles.keys().next();
      if (oldest.done || oldest.value === workbook_id) break;
      await this.closeHandle(oldest.value);
    }
    return handle;
  }

  /** How many log handles are currently open. Diagnostics and tests. */
  openHandleCount(): number {
    return this.handles.size;
  }

  /** Close and forget one workbook's write handle. */
  private async closeHandle(workbook_id: string): Promise<void> {
    const handle = this.handles.get(workbook_id);
    if (!handle) return;
    this.handles.delete(workbook_id);
    await handle.close();
  }

  /**
   * Close every cached write handle. Callers that keep a Host alive for
   * the process lifetime need not call this — the OS closes handles on
   * exit and every write is already flushed — but a long-lived embedder
   * that opens many workspaces should.
   */
  async close(): Promise<void> {
    const ids = [...this.handles.keys()];
    await Promise.all(ids.map((id) => this.closeHandle(id)));
  }

  /**
   * Run `fn` holding an exclusive cross-process lock on one workbook's
   * log.
   *
   * Why this exists: a workbook's next revision is computed from the
   * writer's own in-memory log. Two processes therefore both compute
   * `lastRevision + 1` and both write it. Measured with 2, 4 and 8
   * concurrent writers, that produced 187, 201 and 490 duplicate
   * revisions respectively, and at four writers two `workbook.create`
   * operations landed in one log and left it unreplayable — 400
   * operations acknowledged as successful and none of them recoverable.
   * The bytes were never corrupt; the agreement was.
   *
   * The lock is an O_EXCL marker file holding the writer's pid, host and
   * acquisition time. A holder whose pid is gone on this host, or whose
   * lock has outlived `LOCK_STALE_MS`, is treated as abandoned and
   * broken — a crashed writer must not wedge a workbook permanently.
   *
   * Re-entrant within one store instance: a batch that locks and then
   * calls a helper that locks again does not deadlock against itself.
   */
  async withWorkbookLock<T>(workbook_id: string, fn: () => Promise<T>): Promise<T> {
    const held = LOCK_CONTEXT.getStore();
    if (held?.has(workbook_id)) {
      // Genuinely nested: this call is running inside the critical
      // section for the same workbook, so it already has exclusion.
      // Async-context membership is what makes that a fact rather than
      // an inference — a depth counter cannot tell a nested call from a
      // concurrent one, and hands the second the lock it never took.
      return fn();
    }

    const previous = this.lockChain.get(workbook_id) ?? Promise.resolve();
    let releaseChain: () => void = () => undefined;
    const mine = new Promise<void>((resolve) => {
      releaseChain = resolve;
    });
    this.lockChain.set(
      workbook_id,
      previous.then(() => mine),
    );
    await previous;

    try {
      const path = await this.acquireWorkbookLock(workbook_id);
      try {
        const scope = new Set(held ?? []);
        scope.add(workbook_id);
        return await LOCK_CONTEXT.run(scope, fn);
      } finally {
        try {
          unlinkSync(path);
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
        }
      }
    } finally {
      releaseChain();
      if (this.lockChain.get(workbook_id) === undefined) {
        this.lockChain.delete(workbook_id);
      }
    }
  }

  /** Block until this process owns the workbook's lock file. */
  private async acquireWorkbookLock(workbook_id: string): Promise<string> {
    const path = lockPathFor(this.dataDir, workbook_id);
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    let backoff = 2;
    for (;;) {
      try {
        await acquireLockFile(path);
        return path;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
        if (this.breakIfAbandoned(path)) continue;
        if (Date.now() >= deadline) {
          throw new FDPMException(
            "conflict",
            `timed out after ${LOCK_TIMEOUT_MS}ms waiting for the write lock on workbook ${workbook_id}`,
            { evidence: { workbook_id, lock_path: path, holder: readHolder(path) } },
          );
        }
        await sleep(backoff);
        backoff = Math.min(backoff * 2, 100);
      }
    }
  }

  /**
   * Remove a lock whose holder is provably gone: same host and a dead
   * pid, or older than `LOCK_STALE_MS`. An unreadable or malformed lock
   * file is also abandoned — it cannot identify a live holder.
   * Returns true when a lock was broken and the caller should retry.
   */
  private breakIfAbandoned(path: string): boolean {
    const holder = readHolder(path);
    if (holder === null) {
      // The file is unreadable — either the holder released it between our
      // EEXIST and this read, or it is genuinely corrupt. Do NOT unlink on
      // the strength of that: an unreadable lock is not a proven-abandoned
      // one, and deleting it steals a live lock. This exact branch let
      // waiters into an occupied critical section, which is how two
      // processes ended up minting the same revision even with the lock
      // in place. Fall back to the file's own age, which is a fact about
      // the lock rather than a guess about its holder.
      return breakIfOlderThan(path, LOCK_STALE_MS);
    }
    const age = Date.now() - Date.parse(holder.acquired_at);
    if (Number.isFinite(age) && age > LOCK_STALE_MS) return unlinkQuietly(path);
    if (holder.host === hostname() && !pidAlive(holder.pid)) return unlinkQuietly(path);
    return false;
  }

  async deleteProject(workbook_id: string): Promise<void> {
    await this.closeHandle(workbook_id);
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

/**
 * Claim `path`, or throw EEXIST if someone already holds it.
 *
 * `wx` is O_CREAT|O_EXCL: the create either wins or fails, so two
 * processes cannot both believe they hold the lock. The holder record is
 * written immediately afterwards, which leaves a brief window in which a
 * waiter can read the file empty — that window is safe only because an
 * unreadable lock is never treated as abandoned (see `breakIfAbandoned`).
 * Getting that wrong is what let waiters into an occupied critical
 * section; the ordering here and the rule there are one mechanism.
 */
async function acquireLockFile(path: string): Promise<void> {
  const holder: LockHolder = {
    pid: process.pid,
    host: hostname(),
    acquired_at: new Date().toISOString(),
  };
  await fs.writeFile(path, JSON.stringify(holder), { encoding: "utf8", flag: "wx" });
}

function readHolder(path: string): LockHolder | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as LockHolder).pid === "number" &&
      typeof (parsed as LockHolder).host === "string" &&
      typeof (parsed as LockHolder).acquired_at === "string"
    ) {
      return parsed as LockHolder;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Break a lock we cannot attribute to a holder, but only once it is old
 * enough that no live writer could still be inside its critical section.
 * A vanished file needs no unlink — the caller simply retries.
 */
function breakIfOlderThan(path: string, ms: number): boolean {
  try {
    const stats = statSync(path);
    if (Date.now() - stats.mtimeMs <= ms) return false;
  } catch {
    return true;
  }
  return unlinkQuietly(path);
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means the process exists but belongs to another user.
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

function unlinkQuietly(path: string): boolean {
  try {
    unlinkSync(path);
    return true;
  } catch (err) {
    // Another waiter broke the same lock first; either way, retry.
    return (err as NodeJS.ErrnoException).code === "ENOENT";
  }
}

/**
 * Parse JSONL log text into operations, rejecting the first bad line.
 *
 * Bad bytes on disk are invalid input to the replay reader, not a host
 * logic bug — the operator can repair the log. A corrupt line and a
 * schema-violating line surface with the same exit code.
 */
function parseLogText(text: string, path: string): Operation[] {
  const lines = text.split("\n").filter((l) => l.length > 0);
  const out: Operation[] = [];
  for (const [i, line] of lines.entries()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (err) {
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
