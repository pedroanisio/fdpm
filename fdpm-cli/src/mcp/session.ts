/**
 * MCP per-session state — SPEC-MCP-SERVER §9.3 / §10 / §21.
 *
 * Three responsibilities live here:
 *
 *   1. The token bucket (§9.3 / §21 per-session rate limit). One session
 *      per spawned MCP server process in v0.1 (stdio is inherently
 *      single-client). Drips at `maxPerMinute / 60` tokens per second
 *      with capacity `maxPerMinute`.
 *
 *   2. The freshness map (§10 / §21 freshness gate). Tracks the last
 *      observed `(mtime_ns, size)` tuple for every workbook log this
 *      session has touched. The dispatcher consults this map per call
 *      to detect out-of-band writes since the last invocation. A `null`
 *      stat (workbook log file does not exist) is recorded as the
 *      `MISSING_LOG` sentinel so a later "the log appeared" transition
 *      is still detected as drift.
 *
 *      Strict tuple equality on the bigint pair is intentional: we are
 *      not measuring time deltas, we are detecting "did the bytes on
 *      disk change at all since I last looked?". Any change → stale.
 *
 *      The map is purely in-memory; the platform reload signal
 *      (SIGHUP on macOS/Linux, SIGBREAK on Windows) / `Host.reload()`
 *      clears it (see `clearFreshnessMap`) so the next call re-seeds.
 *
 *   3. The Tier-3 idempotency cache (§8.7). `(tool, idempotency_key)` →
 *      the first execution's result, TTL-bounded and capped, so a retried
 *      delete replays instead of running twice. See `IdempotencyCache`.
 */

import { mintUid } from "../core/identity/uid.js";
import type { Host } from "../core/host.js";

export interface TokenBucketLike {
  /** Attempt to consume one token. Returns true if a token was taken. */
  consume(): boolean;
  /** Diagnostic: number of tokens currently available (fractional). */
  available(): number;
}

/**
 * Sentinel for a workbook log that did not exist when last seen. Stored
 * in the freshness map so that a subsequent `null` → real-stat
 * transition (the log was created out of band) is detected as drift.
 */
const MISSING_LOG_MTIME = -1n;
const MISSING_LOG_SIZE = -1n;

interface FreshnessEntry {
  mtime_ns: bigint;
  size: bigint;
}

/**
 * Idempotency cache for Tier-3 calls (SPEC-MCP-SERVER §8.7).
 *
 * Keyed by `(tool, idempotency_key)`; each entry pins the args hash it
 * was first seen with and a promise of the dispatcher's final
 * `CallToolResult`. A pending promise lets concurrent same-key calls
 * coalesce onto one execution; a settled one is replayed. Entries
 * expire after `ttlMs` (pruned lazily on access) and the map is capped
 * (oldest evicted) so a long session cannot grow it without bound.
 */
export interface IdempotencyEntry<R = unknown> {
  args_hash: string;
  first_seen_at: number;
  promise: Promise<R>;
}

export interface IdempotencyCache<R = unknown> {
  /** Look up a live entry; expired entries are pruned first. */
  lookup(key: string): IdempotencyEntry<R> | undefined;
  /** Register a pending execution under `key`. */
  register(key: string, args_hash: string, promise: Promise<R>): void;
  /** Number of live entries. */
  size(): number;
  /** Maximum number of entries retained. */
  capacity(): number;
  /** Time-to-live in milliseconds. */
  ttlMs(): number;
}

export const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000;
export const IDEMPOTENCY_CAPACITY = 1_000;

export interface McpSession {
  readonly id: string;
  readonly firstSeen: number;
  readonly rateLimiter: TokenBucketLike;
  /** Tier-3 idempotency cache (§8.7). */
  readonly idempotency: IdempotencyCache;
  /**
   * Record (or refresh) the (mtime_ns, size) tuple for each workbook_id.
   * Called on first encounter and after a successful tail-replay /
   * operator-triggered reload.
   */
  recordSeen(host: Host, project_ids: readonly string[]): void;
  /**
   * Compare each workbook's current on-disk stat to the recorded value.
   * `stale` is the subset whose tuple differs; `fresh` is the subset
   * either equal or never seen before. Workbooks not previously seen are
   * recorded fresh and reported under `fresh`.
   */
  checkFreshness(
    host: Host,
    project_ids: readonly string[],
  ): { stale: string[]; fresh: string[] };
  /**
   * Re-record the on-disk stat for each id. Idempotent. Used after
   * lenient tail-replay so the next call's freshness check sees the
   * post-replay tuple as the reference.
   */
  markFresh(host: Host, project_ids: readonly string[]): void;
  /**
   * Empty the freshness map. Used after `Host.reload()` so the entire
   * data dir is re-scanned on next encounter.
   */
  clearFreshnessMap(): void;
  /**
   * Diagnostic / test seam — the underlying map. NOT part of the
   * dispatcher's public protocol.
   */
  freshnessSnapshot(): ReadonlyMap<string, FreshnessEntry>;
}

class TokenBucket implements TokenBucketLike {
  private tokens: number;
  private last: number;
  private readonly capacity: number;
  private readonly perSecond: number;

  constructor(maxPerMinute: number) {
    if (!Number.isFinite(maxPerMinute) || maxPerMinute <= 0) {
      throw new Error(
        `TokenBucket: maxPerMinute must be a positive finite number, got ${maxPerMinute}`,
      );
    }
    this.capacity = maxPerMinute;
    this.perSecond = maxPerMinute / 60;
    this.tokens = maxPerMinute;
    this.last = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsedSec = (now - this.last) / 1000;
    if (elapsedSec > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + elapsedSec * this.perSecond);
      this.last = now;
    }
  }

  consume(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  available(): number {
    this.refill();
    return this.tokens;
  }
}

class IdempotencyCacheImpl implements IdempotencyCache {
  private readonly entries = new Map<string, IdempotencyEntry>();
  private readonly ttl: number;
  private readonly cap: number;

  constructor(ttlMs: number, capacity: number) {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new Error(`IdempotencyCache: ttlMs must be a positive finite number, got ${ttlMs}`);
    }
    this.ttl = ttlMs;
    this.cap = capacity;
  }

  private prune(now: number): void {
    for (const [key, entry] of this.entries) {
      if (now - entry.first_seen_at > this.ttl) this.entries.delete(key);
    }
  }

  lookup(key: string): IdempotencyEntry | undefined {
    this.prune(Date.now());
    return this.entries.get(key);
  }

  register(key: string, args_hash: string, promise: Promise<unknown>): void {
    const now = Date.now();
    this.prune(now);
    this.entries.set(key, { args_hash, first_seen_at: now, promise });
    // Map iteration is insertion-ordered: evict the oldest beyond the cap.
    while (this.entries.size > this.cap) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  size(): number {
    this.prune(Date.now());
    return this.entries.size;
  }

  capacity(): number {
    return this.cap;
  }

  ttlMs(): number {
    return this.ttl;
  }
}

class SessionImpl implements McpSession {
  readonly id: string;
  readonly firstSeen: number;
  readonly rateLimiter: TokenBucketLike;
  readonly idempotency: IdempotencyCache;
  private readonly freshness: Map<string, FreshnessEntry>;

  constructor(opts: { maxPerMinute: number; idempotencyTtlMs?: number; idempotencyCapacity?: number }) {
    this.id = mintUid();
    this.firstSeen = Date.now();
    this.rateLimiter = new TokenBucket(opts.maxPerMinute);
    this.idempotency = new IdempotencyCacheImpl(
      opts.idempotencyTtlMs ?? IDEMPOTENCY_TTL_MS,
      opts.idempotencyCapacity ?? IDEMPOTENCY_CAPACITY,
    );
    this.freshness = new Map();
  }

  recordSeen(host: Host, project_ids: readonly string[]): void {
    for (const id of project_ids) {
      const stat = host.statProjectLog(id);
      this.freshness.set(id, statOrSentinel(stat));
    }
  }

  checkFreshness(
    host: Host,
    project_ids: readonly string[],
  ): { stale: string[]; fresh: string[] } {
    const stale: string[] = [];
    const fresh: string[] = [];
    for (const id of project_ids) {
      const observed = statOrSentinel(host.statProjectLog(id));
      const cached = this.freshness.get(id);
      if (cached === undefined) {
        // First encounter — seed and report fresh.
        this.freshness.set(id, observed);
        fresh.push(id);
        continue;
      }
      if (cached.mtime_ns === observed.mtime_ns && cached.size === observed.size) {
        fresh.push(id);
      } else {
        stale.push(id);
      }
    }
    return { stale, fresh };
  }

  markFresh(host: Host, project_ids: readonly string[]): void {
    for (const id of project_ids) {
      const stat = host.statProjectLog(id);
      this.freshness.set(id, statOrSentinel(stat));
    }
  }

  clearFreshnessMap(): void {
    this.freshness.clear();
  }

  freshnessSnapshot(): ReadonlyMap<string, FreshnessEntry> {
    return new Map(this.freshness);
  }
}

function statOrSentinel(
  stat: { mtime_ns: bigint; size: bigint } | null,
): FreshnessEntry {
  if (stat === null) {
    return { mtime_ns: MISSING_LOG_MTIME, size: MISSING_LOG_SIZE };
  }
  return { mtime_ns: stat.mtime_ns, size: stat.size };
}

export function createSession(opts: {
  maxPerMinute: number;
  /** Tier-3 idempotency TTL; default IDEMPOTENCY_TTL_MS (5 min). Test seam. */
  idempotencyTtlMs?: number;
  /** Tier-3 idempotency cache cap; default IDEMPOTENCY_CAPACITY (1,000). Test seam. */
  idempotencyCapacity?: number;
}): McpSession {
  return new SessionImpl(opts);
}
