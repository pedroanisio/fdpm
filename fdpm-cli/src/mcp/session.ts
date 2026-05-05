/**
 * MCP per-session state — SPEC-MCP-SERVER §9.3 / §10 / §21.
 *
 * Two responsibilities live here:
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
 *      The map is purely in-memory; SIGHUP / `Host.reload()` clears it
 *      (see `clearFreshnessMap`) so the next call re-seeds.
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

export interface McpSession {
  readonly id: string;
  readonly firstSeen: number;
  readonly rateLimiter: TokenBucketLike;
  /**
   * Record (or refresh) the (mtime_ns, size) tuple for each workbook_id.
   * Called on first encounter and after a successful tail-replay /
   * SIGHUP reload.
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

class SessionImpl implements McpSession {
  readonly id: string;
  readonly firstSeen: number;
  readonly rateLimiter: TokenBucketLike;
  private readonly freshness: Map<string, FreshnessEntry>;

  constructor(opts: { maxPerMinute: number }) {
    this.id = mintUid();
    this.firstSeen = Date.now();
    this.rateLimiter = new TokenBucket(opts.maxPerMinute);
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

export function createSession(opts: { maxPerMinute: number }): McpSession {
  return new SessionImpl(opts);
}
