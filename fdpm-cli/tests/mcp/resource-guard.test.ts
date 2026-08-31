/**
 * The resource surface carries the same controls as the tool surface.
 *
 * `dispatcher.call` was wired to `tools/call` only. `resources/read` went
 * straight to the provider loop, so the surface that actually moves document
 * content — `fdpm://workbook/{id}/render/{target}` serves a whole rendered
 * workbook — had no rate limit, produced no audit entry, and had no size
 * ceiling. Tool calls were carefully gated and the reads were not.
 *
 * Three controls apply to a read, and only three. Tier gating, the
 * confirmation token and idempotency are all write-side concerns: a read has
 * no tier to refuse, nothing to confirm and nothing to replay. Routing reads
 * through the tool dispatcher would therefore have meant threading four
 * inapplicable gates through a code path that needs none of them, so the
 * shared controls live in `readGuard` and both surfaces call what applies.
 *
 * The fourth case here is a contract, not a control. Exactly one provider
 * reads workbook state (`render`), and it refreshed by hand while the others
 * had nothing to refresh — correct, but by accident. A provider added later
 * that reads workbook state and forgets would serve stale content with nothing
 * to catch it. `ResourceProvider.readsWorkbookState` makes the claim explicit
 * and the guard acts on it, so the next provider inherits freshness or
 * declares that it does not need it.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Host } from "../../src/core/host.js";
import { McpAuditLog, type McpAuditEntry } from "../../src/persistence/mcp-audit-log.js";
import { RESOURCE_PROVIDERS, dispatchRead } from "../../src/mcp/resources/registry.js";
import {
  DEFAULT_MAX_RESOURCE_BYTES,
  MAX_RESOURCE_BYTES_ENV,
  createReadGuard,
  resolveMaxResourceBytes,
} from "../../src/mcp/read-guard.js";
import { createSession } from "../../src/mcp/session.js";
import { GUIDE_URI } from "../../src/mcp/resources/guide.js";
import { CORE_EMPTY_PROFILE } from "../../src/core/profile/core-empty.js";

let dataDir: string;
beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "fdpm-resguard-"));
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

function auditEntries(dir: string): McpAuditEntry[] {
  const p = join(dir, "mcp-audit.jsonl");
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as McpAuditEntry);
}

async function hostWithWorkbook(): Promise<Host> {
  const host = new Host({ dataDir, noPlugins: true });
  await host.load();
  await host.createProject({
    workbook_id: "guarded",
    name: "Guarded",
    profile_id: CORE_EMPTY_PROFILE.id,
  });
  return host;
}

function guardFor(host: Host, opts?: { maxBytes?: number; callsPerMinute?: number }) {
  const session = createSession({ maxPerMinute: opts?.callsPerMinute ?? 120 });
  const audit = new McpAuditLog(dataDir);
  return {
    session,
    guard: createReadGuard({
      host,
      session,
      audit,
      maxResourceBytes: opts?.maxBytes ?? DEFAULT_MAX_RESOURCE_BYTES,
    }),
  };
}

// ── The audit trail ──────────────────────────────────────────────────

describe("resources/read — audit trail", () => {
  it("records a resource_read entry for a successful read", async () => {
    const host = await hostWithWorkbook();
    const { guard } = guardFor(host);
    await guard.read(GUIDE_URI);

    const reads = auditEntries(dataDir).filter((e) => e.phase === "resource_read");
    expect(reads).toHaveLength(1);
    expect(reads[0]).toMatchObject({ uri: GUIDE_URI, ok: true });
    expect((reads[0] as { bytes: number }).bytes).toBeGreaterThan(0);
    expect((reads[0] as { duration_ms: number }).duration_ms).toBeGreaterThanOrEqual(0);
  });

  it("records a failed read with its error category, not silence", async () => {
    const host = await hostWithWorkbook();
    const { guard } = guardFor(host);
    await expect(guard.read("fdpm://nope/nothing")).rejects.toThrow();

    const reads = auditEntries(dataDir).filter((e) => e.phase === "resource_read");
    expect(reads).toHaveLength(1);
    expect(reads[0]).toMatchObject({ ok: false, error_category: "not_found" });
  });

  it("never records the served bytes, only their size", async () => {
    // The audit log is reviewed by people who are not entitled to the
    // content; a log that embedded the render would defeat the point.
    const host = await hostWithWorkbook();
    const { guard } = guardFor(host);
    await guard.read(GUIDE_URI);
    const raw = readFileSync(join(dataDir, "mcp-audit.jsonl"), "utf8");
    expect(raw).not.toContain("Workflow");
    expect(raw).toMatch(/"bytes":\s*\d+/);
  });
});

// ── The rate limit ───────────────────────────────────────────────────

describe("resources/read — rate limit", () => {
  it("shares one budget with tool calls rather than opening a second one", async () => {
    const host = await hostWithWorkbook();
    const { session, guard } = guardFor(host, { callsPerMinute: 3 });
    await guard.read(GUIDE_URI);
    await guard.read(GUIDE_URI);
    // A read consumes from the same bucket a tool call would.
    expect(session.rateLimiter.available()).toBeLessThan(2);
  });

  it("refuses past the limit with permission / rate_limited", async () => {
    const host = await hostWithWorkbook();
    const { guard } = guardFor(host, { callsPerMinute: 2 });
    await guard.read(GUIDE_URI);
    await guard.read(GUIDE_URI);
    await expect(guard.read(GUIDE_URI)).rejects.toThrow(/rate limit/i);
  });

  it("audits the refusal, so exhaustion is visible after the fact", async () => {
    const host = await hostWithWorkbook();
    const { guard } = guardFor(host, { callsPerMinute: 1 });
    await guard.read(GUIDE_URI);
    await expect(guard.read(GUIDE_URI)).rejects.toThrow();
    const reads = auditEntries(dataDir).filter((e) => e.phase === "resource_read");
    expect(reads).toHaveLength(2);
    expect(reads[1]).toMatchObject({ ok: false, error_reason: "rate_limited" });
  });
});

// ── The size ceiling ─────────────────────────────────────────────────

describe("resources/read — byte ceiling", () => {
  it("defaults to 1 MiB and reads the operator override", () => {
    expect(DEFAULT_MAX_RESOURCE_BYTES).toBe(1_048_576);
    expect(resolveMaxResourceBytes({})).toBe(DEFAULT_MAX_RESOURCE_BYTES);
    expect(resolveMaxResourceBytes({ [MAX_RESOURCE_BYTES_ENV]: "2048" })).toBe(2048);
  });

  it("refuses a malformed override at resolution rather than serving unbounded", () => {
    expect(() => resolveMaxResourceBytes({ [MAX_RESOURCE_BYTES_ENV]: "banana" })).toThrow();
    expect(() => resolveMaxResourceBytes({ [MAX_RESOURCE_BYTES_ENV]: "0" })).toThrow();
    expect(() => resolveMaxResourceBytes({ [MAX_RESOURCE_BYTES_ENV]: "-5" })).toThrow();
  });

  it("rejects an oversized payload with a quota envelope carrying both numbers", async () => {
    const host = await hostWithWorkbook();
    const { guard } = guardFor(host, { maxBytes: 16 });
    await expect(guard.read(GUIDE_URI)).rejects.toMatchObject({ category: "quota" });
    const reads = auditEntries(dataDir).filter((e) => e.phase === "resource_read");
    expect(reads[0]).toMatchObject({ ok: false, error_category: "quota" });
  });

  it("measures the payload actually served, base64 expansion included", async () => {
    // A blob resource is base64 in the JSON-RPC frame, so a cap applied to
    // the raw bytes would let a binary render through at ~1.33x the ceiling.
    const host = await hostWithWorkbook();
    const { guard } = guardFor(host, { maxBytes: 1_048_576 });
    const out = await guard.read(GUIDE_URI);
    const served = out.text !== undefined ? Buffer.byteLength(out.text, "utf8") : (out.blob ?? "").length;
    const reads = auditEntries(dataDir).filter((e) => e.phase === "resource_read");
    expect((reads[0] as { bytes: number }).bytes).toBe(served);
  });

  it("lets a payload at exactly the ceiling through", async () => {
    const host = await hostWithWorkbook();
    const { guard: probe } = guardFor(host, { maxBytes: 1_048_576 });
    const out = await probe.read(GUIDE_URI);
    const exact = Buffer.byteLength(out.text ?? "", "utf8");

    rmSync(join(dataDir, "mcp-audit.jsonl"), { force: true });
    const { guard } = guardFor(host, { maxBytes: exact });
    await expect(guard.read(GUIDE_URI)).resolves.toBeDefined();
  });
});

// ── The freshness contract ───────────────────────────────────────────

describe("resource providers — declared workbook-freshness contract", () => {
  it("every provider declares whether it reads workbook state", () => {
    expect(RESOURCE_PROVIDERS.length).toBeGreaterThan(0);
    for (const p of RESOURCE_PROVIDERS) {
      expect(
        typeof p.readsWorkbookState,
        `${p.id} must declare readsWorkbookState`,
      ).toBe("boolean");
    }
  });

  it("fdpm.render is the one that reads workbook state; the rest declare false", () => {
    const reading = RESOURCE_PROVIDERS.filter((p) => p.readsWorkbookState).map((p) => p.id);
    expect(reading).toEqual(["fdpm.render"]);
  });

  it("refreshes before a provider that reads workbook state", async () => {
    const host = await hostWithWorkbook();
    const seen: string[] = [];
    const original = host.reloadProjectTail.bind(host);
    host.reloadProjectTail = async (id: string) => {
      seen.push(id);
      return original(id);
    };
    const { guard } = guardFor(host);
    await guard.read("fdpm://workbook/guarded/render/text/markdown").catch(() => undefined);
    expect(seen).toContain("guarded");
  });

  it("does not refresh for a provider that declares it reads no workbook state", async () => {
    const host = await hostWithWorkbook();
    let calls = 0;
    host.reloadProjectTail = async () => {
      calls += 1;
      return { revision: 0 } as never;
    };
    const { guard } = guardFor(host);
    await guard.read(GUIDE_URI);
    expect(calls).toBe(0);
  });
});

// ── The unguarded path is gone ───────────────────────────────────────

describe("resources/read — no unguarded path remains", () => {
  it("dispatchRead still resolves a URI, so the guard composes rather than replaces", async () => {
    const host = await hostWithWorkbook();
    const out = await dispatchRead(host, GUIDE_URI);
    expect(out.uri).toBe(GUIDE_URI);
  });

  it("the guard returns exactly what the provider returned on success", async () => {
    const host = await hostWithWorkbook();
    const direct = await dispatchRead(host, GUIDE_URI);
    const { guard } = guardFor(host);
    const guarded = await guard.read(GUIDE_URI);
    expect(guarded).toEqual(direct);
  });
});
