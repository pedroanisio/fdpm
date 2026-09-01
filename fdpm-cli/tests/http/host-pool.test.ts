/**
 * Tenant Host pool.
 *
 * `Host` binds one data dir and loads its whole corpus into memory, so
 * the pool is both the isolation boundary and the memory bound. These
 * tests pin: one Host per tenant, data dirs that cannot collide or
 * escape, LRU eviction under a cap, and idle eviction.
 */

import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHostPool, tenantDataDir } from "../../src/http/host-pool.js";
import { FDPMException } from "../../src/core/errors/fdpm-exception.js";

function tmpRoot(): string {
  return mkdtempSync(join(tmpdir(), "fdpm-pool-"));
}

/** A Host stand-in: the pool must not care what it loads. */
function fakeHostFactory() {
  const disposed: string[] = [];
  const factory = vi.fn(async (dataDir: string) => ({
    dataDir,
    dispose: async () => {
      disposed.push(dataDir);
    },
  }));
  return { factory, disposed };
}

describe("tenantDataDir", () => {
  it("gives each tenant its own directory under the root", () => {
    expect(tenantDataDir("/data", "acme")).toBe(join("/data", "tenants", "acme"));
    expect(tenantDataDir("/data", "beta")).not.toBe(tenantDataDir("/data", "acme"));
  });

  it("refuses a tenant id that would escape the root", () => {
    for (const bad of ["..", "../etc", "a/b", "/abs"]) {
      expect(() => tenantDataDir("/data", bad)).toThrow(FDPMException);
    }
  });
});

describe("createHostPool", () => {
  it("loads a Host once per tenant and reuses it", async () => {
    const root = tmpRoot();
    const { factory } = fakeHostFactory();
    const pool = createHostPool({ rootDir: root, maxHosts: 4, idleMs: 60_000, factory });

    const a1 = await pool.acquire("acme");
    const a2 = await pool.acquire("acme");

    expect(a1).toBe(a2);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(pool.size()).toBe(1);
    rmSync(root, { recursive: true, force: true });
  });

  it("keeps tenants on separate Hosts and separate data dirs", async () => {
    const root = tmpRoot();
    const { factory } = fakeHostFactory();
    const pool = createHostPool({ rootDir: root, maxHosts: 4, idleMs: 60_000, factory });

    const a = (await pool.acquire("acme")) as { dataDir: string };
    const b = (await pool.acquire("beta")) as { dataDir: string };

    expect(a).not.toBe(b);
    expect(a.dataDir).not.toBe(b.dataDir);
    expect(pool.size()).toBe(2);
    rmSync(root, { recursive: true, force: true });
  });

  it("coalesces concurrent acquires of the same tenant onto one load", async () => {
    const root = tmpRoot();
    const { factory } = fakeHostFactory();
    const pool = createHostPool({ rootDir: root, maxHosts: 4, idleMs: 60_000, factory });

    const [x, y, z] = await Promise.all([
      pool.acquire("acme"),
      pool.acquire("acme"),
      pool.acquire("acme"),
    ]);

    expect(factory).toHaveBeenCalledTimes(1);
    expect(x).toBe(y);
    expect(y).toBe(z);
    rmSync(root, { recursive: true, force: true });
  });

  it("evicts the least recently used Host beyond the cap", async () => {
    const root = tmpRoot();
    const { factory, disposed } = fakeHostFactory();
    const pool = createHostPool({ rootDir: root, maxHosts: 2, idleMs: 60_000, factory });

    await pool.acquire("one");
    await pool.acquire("two");
    await pool.acquire("one"); // refreshes "one"; "two" is now LRU
    await pool.acquire("three");

    expect(pool.size()).toBe(2);
    expect(disposed).toEqual([tenantDataDir(root, "two")]);
    rmSync(root, { recursive: true, force: true });
  });

  it("evicts Hosts idle beyond the TTL and reports how many went", async () => {
    const root = tmpRoot();
    const { factory, disposed } = fakeHostFactory();
    const pool = createHostPool({ rootDir: root, maxHosts: 8, idleMs: 1_000, factory });

    await pool.acquire("acme");
    // Deterministic: the sweep takes "now" as an argument, no wall clock.
    expect(pool.sweep(Date.now() + 5_000)).toBe(1);
    expect(pool.size()).toBe(0);
    expect(disposed).toEqual([tenantDataDir(root, "acme")]);
    rmSync(root, { recursive: true, force: true });
  });

  it("does not evict a Host that is still pinned by a live session", async () => {
    const root = tmpRoot();
    const { factory } = fakeHostFactory();
    const pool = createHostPool({ rootDir: root, maxHosts: 8, idleMs: 1_000, factory });

    await pool.acquire("acme");
    pool.pin("acme");

    expect(pool.sweep(Date.now() + 5_000)).toBe(0);
    expect(pool.size()).toBe(1);

    pool.unpin("acme");
    expect(pool.sweep(Date.now() + 5_000)).toBe(1);
    rmSync(root, { recursive: true, force: true });
  });

  it("refuses to acquire a Host for an invalid tenant id", async () => {
    const root = tmpRoot();
    const { factory } = fakeHostFactory();
    const pool = createHostPool({ rootDir: root, maxHosts: 4, idleMs: 60_000, factory });

    await expect(pool.acquire("../escape")).rejects.toThrow(FDPMException);
    expect(factory).not.toHaveBeenCalled();
    rmSync(root, { recursive: true, force: true });
  });

  it("is not ready until it can reach its root, and is ready after a load", async () => {
    const root = tmpRoot();
    const { factory } = fakeHostFactory();
    const pool = createHostPool({ rootDir: root, maxHosts: 4, idleMs: 60_000, factory });
    expect(pool.ready()).toBe(true);
    rmSync(root, { recursive: true, force: true });
    expect(pool.ready()).toBe(false);
  });

  it("disposes every Host on shutdown", async () => {
    const root = tmpRoot();
    const { factory, disposed } = fakeHostFactory();
    const pool = createHostPool({ rootDir: root, maxHosts: 4, idleMs: 60_000, factory });
    await pool.acquire("one");
    await pool.acquire("two");
    await pool.dispose();
    expect(disposed.sort()).toEqual(
      [tenantDataDir(root, "one"), tenantDataDir(root, "two")].sort(),
    );
    expect(pool.size()).toBe(0);
    rmSync(root, { recursive: true, force: true });
  });
});
