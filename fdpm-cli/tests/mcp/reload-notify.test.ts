/**
 * Operator reload (SIGHUP) must tell connected clients that the
 * live-computed lists changed.
 *
 * `resources/list` and `prompts/list` are computed from the live Host on
 * every request (`src/bin/fdpm-mcp.ts` — ListResourcesRequestSchema /
 * ListPromptsRequestSchema handlers), so a workbook created after a
 * client connected is enumerable the moment `Host.reload()` finishes.
 * MCP clients cache both lists and only re-fetch on
 * `notifications/{resources,prompts}/list_changed`; without that
 * notification the workbook is readable by URI but invisible in the
 * client's list — observed against the live server after building the
 * `spec-document-plan` workbook.
 *
 * `tools/list` is deliberately NOT notified: the advertised tool array is
 * frozen at boot (it is the same array the catalog budget was measured
 * against), so a reload cannot change it.
 *
 * Failure paths matter as much as the happy one: a reload that rejects
 * leaves the pre-reload Host serving (Host.reload's contract), so the
 * client's cached list is still correct and MUST NOT be invalidated.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Host } from "../../src/core/host.js";
import { FDPMException } from "../../src/core/errors/fdpm-exception.js";
import {
  MCP_RELOAD_ADVICE,
  handleReload,
  reloadSignalForPlatform,
  type ReloadableHost,
} from "../../src/mcp/reload.js";
import { listResources } from "../../src/mcp/resources/registry.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { NODE_COMMAND, tsxArgs } from "../_helpers/process.js";

const FS_PROFILE = "profile:formal-specification:3.0";

let dataDir: string;
beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "fdpm-reload-notify-"));
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

async function freshHost(): Promise<Host> {
  const host = new Host({ dataDir, builtinDirs: [resolve(process.cwd(), "plugins")] });
  await host.load();
  return host;
}

interface Recorder {
  calls: string[];
  sendResourceListChanged(): Promise<void>;
  sendPromptListChanged(): Promise<void>;
}
function recordingNotifier(): Recorder {
  const calls: string[] = [];
  return {
    calls,
    sendResourceListChanged: async () => void calls.push("resources"),
    sendPromptListChanged: async () => void calls.push("prompts"),
  };
}

interface AuditSink {
  entries: Record<string, unknown>[];
  write(entry: Record<string, unknown>): void;
}
function auditSink(): AuditSink {
  const entries: Record<string, unknown>[] = [];
  return { entries, write: (e) => void entries.push(e) };
}

function sessionStub(): { cleared: number; clearFreshnessMap(): void } {
  return {
    cleared: 0,
    clearFreshnessMap(): void {
      this.cleared += 1;
    },
  };
}

/** Swallow the handler's operator log so vitest output stays readable. */
const quiet = (): void => {};

describe("platform-native reload controls", () => {
  it("uses SIGHUP on POSIX and SIGBREAK on Windows", () => {
    expect(reloadSignalForPlatform("linux")).toBe("SIGHUP");
    expect(reloadSignalForPlatform("darwin")).toBe("SIGHUP");
    expect(reloadSignalForPlatform("win32")).toBe("SIGBREAK");
  });

  it("gives operators recovery instructions for both platform families", () => {
    expect(MCP_RELOAD_ADVICE).toContain("SIGHUP");
    expect(MCP_RELOAD_ADVICE).toContain("SIGBREAK");
    expect(MCP_RELOAD_ADVICE).toContain("restart");
  });
});

describe("handleReload — successful reload", () => {
  it("enumerates the new workbook and notifies resources + prompts", async () => {
    const host = await freshHost();
    const before = listResources(host).map((r) => r.uri);
    expect(before.some((u) => u.includes("workbook/wb-late/"))).toBe(false);

    // Out-of-band writer: a second Host on the same data dir, exactly
    // what a `build-*.ts` script or another agent session is.
    const writer = await freshHost();
    await writer.createProject({
      workbook_id: "wb-late",
      name: "Created after the client connected",
      profile_id: FS_PROFILE,
    });

    const notifier = recordingNotifier();
    const audit = auditSink();
    const session = sessionStub();
    const outcome = await handleReload({ host, audit, session, notifier, log: quiet });

    expect(outcome).toBe("ok");
    const after = listResources(host).map((u) => u.uri);
    expect(after.some((u) => u.includes("workbook/wb-late/"))).toBe(true);
    expect(notifier.calls).toEqual(["resources", "prompts"]);
    expect(session.cleared).toBe(1);
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({ phase: "reload", outcome: "ok" });
  });
});

describe("handleReload — rejected reload keeps the client's cache valid", () => {
  const failing = (err: unknown): ReloadableHost => ({
    reload: () => Promise.reject(err),
    listProjects: () => [],
  });

  it("host_compat: no notification, no freshness clear, audited", async () => {
    const notifier = recordingNotifier();
    const audit = auditSink();
    const session = sessionStub();
    const outcome = await handleReload({
      host: failing(new FDPMException("host_compat", "log rewritten under us")),
      audit,
      session,
      notifier,
      log: quiet,
    });
    expect(outcome).toBe("host_compat");
    expect(notifier.calls).toEqual([]);
    expect(session.cleared).toBe(0);
    expect(audit.entries[0]).toMatchObject({ phase: "reload", outcome: "host_compat" });
    expect(audit.entries[0]!["error_message"]).toContain("log rewritten under us");
  });

  it("internal: no notification, no freshness clear, audited", async () => {
    const notifier = recordingNotifier();
    const audit = auditSink();
    const session = sessionStub();
    const outcome = await handleReload({
      host: failing(new Error("plugin dir vanished")),
      audit,
      session,
      notifier,
      log: quiet,
    });
    expect(outcome).toBe("internal");
    expect(notifier.calls).toEqual([]);
    expect(session.cleared).toBe(0);
    expect(audit.entries[0]).toMatchObject({ phase: "reload", outcome: "internal" });
  });
});

describe("handleReload — notification transport failure", () => {
  it("a closed transport does not reject the reload, and is reported", async () => {
    const host = await freshHost();
    const audit = auditSink();
    const session = sessionStub();
    const lines: string[] = [];
    const outcome = await handleReload({
      host,
      audit,
      session,
      notifier: {
        sendResourceListChanged: () => Promise.reject(new Error("transport closed")),
        sendPromptListChanged: () => Promise.reject(new Error("transport closed")),
      },
      log: (l) => void lines.push(l),
    });
    // The reload itself succeeded; only the client hint was lost.
    expect(outcome).toBe("ok");
    expect(session.cleared).toBe(1);
    expect(audit.entries[0]).toMatchObject({ phase: "reload", outcome: "ok" });
    expect(lines.join("")).toContain("transport closed");
  });

  it("logs the signal that actually triggered the reload", async () => {
    const host = await freshHost();
    const lines: string[] = [];
    await handleReload({
      host,
      audit: auditSink(),
      session: sessionStub(),
      notifier: recordingNotifier(),
      signal: "SIGBREAK",
      log: (line) => void lines.push(line),
    });
    expect(lines.join("")).toContain("SIGBREAK received");
  });
});

/**
 * The notification is only useful if the client is told it may arrive:
 * the MCP SDK refuses to send a `list_changed` the server never
 * declared, and clients that do not see `listChanged: true` are free to
 * cache the list forever.
 */
describe("fdpm-mcp over stdio — declared list-changed capabilities", () => {
  it(
    "declares listChanged on the live-computed lists and not on the frozen tool list",
    async () => {
      const transport = new StdioClientTransport({
        command: NODE_COMMAND,
        args: tsxArgs([
          join(process.cwd(), "src", "bin", "fdpm-mcp.ts"),
          "--data-dir",
          dataDir,
        ]),
        env: {
          ...Object.fromEntries(
            Object.entries(process.env).filter(
              ([k, v]) => v !== undefined && !k.startsWith("FDPM_"),
            ),
          ) as Record<string, string>,
          FDPM_DATA_DIR: dataDir,
          FDPM_NO_PLUGINS: "1",
        },
        stderr: "pipe",
      });
      const client = new Client({ name: "reload-notify-test", version: "0.0.0" });
      await client.connect(transport);
      transport.stderr?.on("data", () => {});
      try {
        const caps = client.getServerCapabilities();
        expect(caps?.resources).toMatchObject({ listChanged: true });
        expect(caps?.prompts).toMatchObject({ listChanged: true });
        expect(caps?.tools).toBeDefined();
        expect((caps?.tools as { listChanged?: boolean } | undefined)?.listChanged).toBeUndefined();
      } finally {
        await client.close();
      }
    },
    60_000,
  );
});
