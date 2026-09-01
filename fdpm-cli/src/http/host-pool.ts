/**
 * Tenant Host pool.
 *
 * `Host` binds one data dir and hydrates that dir's whole corpus into
 * memory, so the pool is simultaneously the isolation boundary (two
 * tenants never share a projection, so they cannot name each other's
 * workbooks) and the memory bound (residency is capped and idle-evicted).
 *
 * Pinning exists because a live MCP session holds a Host reference: the
 * sweeper must not dispose a Host that a session is still dispatching
 * against. Sessions pin on create and unpin on close.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { FDPMException } from "../core/errors/fdpm-exception.js";
import { isValidTenantId } from "./principal.js";

/**
 * Anything the pool can hold. Deliberately minimal: `Host` has no
 * `dataDir` property of its own (it hands the directory to a
 * `JsonlLogStore`), so requiring one here would force a wrapper on the
 * real type for no gain. The pool tracks the directory itself.
 */
export interface PooledHost {
  dispose?(): Promise<void>;
}

export interface HostPoolOptions<H extends object = PooledHost> {
  readonly rootDir: string;
  /** Maximum simultaneously loaded Hosts. LRU beyond this. */
  readonly maxHosts: number;
  /** Idle time after which an unpinned Host is evicted. */
  readonly idleMs: number;
  /** Loads a Host for a data dir. Injected so tests need no filesystem corpus. */
  readonly factory: (dataDir: string, tenant: string) => Promise<H>;
}

export interface HostPool<H extends object = PooledHost> {
  acquire(tenant: string): Promise<H>;
  /** Protect a tenant's Host from eviction while a session holds it. */
  pin(tenant: string): void;
  unpin(tenant: string): void;
  /** Evict unpinned Hosts idle since before `now - idleMs`. Returns the count. */
  sweep(now: number): number;
  size(): number;
  ready(): boolean;
  dispose(): Promise<void>;
}

/**
 * Resolve a tenant's data directory. Validation happens here as well as
 * in `toPrincipal` because this function is the one that concatenates a
 * caller-influenced string into a filesystem path — the check belongs
 * where the danger is, not only where the value entered.
 */
export function tenantDataDir(rootDir: string, tenant: string): string {
  if (!isValidTenantId(tenant)) {
    throw new FDPMException(
      "permission",
      `refusing to resolve a data directory for an invalid tenant id`,
      { evidence: { reason: "invalid_tenant_id" } },
    );
  }
  return join(rootDir, "tenants", tenant);
}

interface Entry<H> {
  host: H;
  /** Wall clock, for idle sweeping. */
  lastUsed: number;
  /**
   * Monotonic recency counter, for LRU ordering. Separate from
   * `lastUsed` because `Date.now()` has millisecond resolution: several
   * acquires inside one millisecond tie, and a tie makes LRU pick by map
   * insertion order rather than by use — which evicts the wrong Host.
   */
  seq: number;
  pins: number;
}

export function createHostPool<H extends object = PooledHost>(
  opts: HostPoolOptions<H>,
): HostPool<H> {
  const entries = new Map<string, Entry<H>>();
  // In-flight loads, so N concurrent acquires of one tenant perform one load.
  const loading = new Map<string, Promise<H>>();
  let seqCounter = 0;
  const nextSeq = (): number => ++seqCounter;

  async function disposeHost(host: H): Promise<void> {
    try {
      await (host as PooledHost).dispose?.();
    } catch {
      // A Host that fails to dispose must not wedge the pool; the entry
      // is dropped either way.
    }
  }

  function evictLru(now: number): void {
    while (entries.size > opts.maxHosts) {
      let oldestKey: string | undefined;
      let oldestSeq = Infinity;
      for (const [key, entry] of entries) {
        if (entry.pins > 0) continue;
        if (entry.seq < oldestSeq) {
          oldestSeq = entry.seq;
          oldestKey = key;
        }
      }
      // Every remaining Host is pinned: over the cap, but evicting a
      // Host a live session is using would be worse than exceeding it.
      if (oldestKey === undefined) return;
      const victim = entries.get(oldestKey);
      entries.delete(oldestKey);
      if (victim) void disposeHost(victim.host);
      void now;
    }
  }

  return {
    async acquire(tenant: string): Promise<H> {
      // Validate before touching the map so an invalid id cannot even
      // create a cache entry.
      const dataDir = tenantDataDir(opts.rootDir, tenant);

      const existing = entries.get(tenant);
      if (existing) {
        existing.lastUsed = Date.now();
        existing.seq = nextSeq();
        return existing.host;
      }

      const inFlight = loading.get(tenant);
      if (inFlight) return inFlight;

      const promise = (async () => {
        const host = await opts.factory(dataDir, tenant);
        entries.set(tenant, { host, lastUsed: Date.now(), seq: nextSeq(), pins: 0 });
        evictLru(Date.now());
        return host;
      })().finally(() => {
        loading.delete(tenant);
      });

      loading.set(tenant, promise);
      return promise;
    },

    pin(tenant: string): void {
      const entry = entries.get(tenant);
      if (entry) {
        entry.pins += 1;
        entry.lastUsed = Date.now();
        entry.seq = nextSeq();
      }
    },

    unpin(tenant: string): void {
      const entry = entries.get(tenant);
      if (entry && entry.pins > 0) {
        entry.pins -= 1;
        entry.lastUsed = Date.now();
        entry.seq = nextSeq();
      }
    },

    sweep(now: number): number {
      let evicted = 0;
      for (const [tenant, entry] of [...entries]) {
        if (entry.pins > 0) continue;
        if (now - entry.lastUsed <= opts.idleMs) continue;
        entries.delete(tenant);
        void disposeHost(entry.host);
        evicted += 1;
      }
      return evicted;
    },

    size(): number {
      return entries.size;
    },

    ready(): boolean {
      // Readiness is "can I still reach my storage root". A pod whose
      // volume vanished must leave the load-balancer rotation rather
      // than answer calls it cannot persist.
      return existsSync(opts.rootDir);
    },

    async dispose(): Promise<void> {
      const all = [...entries.values()];
      entries.clear();
      loading.clear();
      await Promise.all(all.map((e) => disposeHost(e.host)));
    },
  };
}
