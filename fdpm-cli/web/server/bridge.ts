/**
 * FDPM Web Bridge — HTTP shim over the `fdpm` CLI.
 *
 * Endpoints:
 *   GET  /api/health                            -> { ok, workbooks }
 *   GET  /api/workbooks                         -> { workbooks: [...] }
 *   GET  /api/workbooks/:id                     -> { workbook, primitives, relations? }
 *   GET  /api/plugins                           -> { plugins: [...] }
 *   GET  /api/plugins/:id                       -> { ...plugin record, capabilities, contributions, source }
 *   GET  /api/plugins/:id/manifest              -> raw fdpm-plugin.json
 *   GET  /api/plugins/:id/readme                -> { markdown } or 404
 *   GET  /api/profiles                          -> { profiles: [...] }
 *   GET  /api/profiles/:id                      -> resolved profile (types, fields)
 *
 *   POST /api/planning/:verb                    -> { ok, status, revision, ... }
 *     body: { workbook, taskId }
 *     verb in PLANNING_VERBS allowlist (mark-ready, mark-done, etc.)
 *     This is the ONLY write surface. Mutations go through `fdpm planning`
 *     subcommands which call the strict-by-default planning SDK helpers.
 *
 * Each request spawns `fdpm <args> --json` and forwards parsed stdout.
 * Spawn-per-request is fine for a local dev tool; the CLI is fast enough
 * and this avoids holding a stale projection across edits made elsewhere.
 */

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import http from "node:http";
import { join } from "node:path";
import { URL } from "node:url";

const PORT = Number(process.env.FDPM_BRIDGE_PORT ?? 5174);
const HOST = process.env.FDPM_BRIDGE_HOST ?? "127.0.0.1";
const FDPM_BIN = process.env.FDPM_BIN ?? "fdpm";
const DATA_DIR = process.env.FDPM_DATA_DIR;

type CliResult =
  | { ok: true; data: unknown }
  | { ok: false; status: number; body: { error: string; detail?: unknown } };

function runFdpm(args: readonly string[]): Promise<CliResult> {
  return new Promise((resolve) => {
    const fullArgs = DATA_DIR ? ["--data-dir", DATA_DIR, ...args] : [...args];
    const child = spawn(FDPM_BIN, fullArgs, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b: Buffer) => (stdout += b.toString("utf8")));
    child.stderr.on("data", (b: Buffer) => (stderr += b.toString("utf8")));

    child.on("error", (err) => {
      resolve({
        ok: false,
        status: 500,
        body: {
          error: "fdpm_spawn_failed",
          detail: { message: err.message, bin: FDPM_BIN },
        },
      });
    });

    child.on("close", (code) => {
      if (code !== 0) {
        // CLI emits structured error envelopes on stderr in --json mode.
        let parsedStderr: unknown = stderr.trim();
        try {
          parsedStderr = JSON.parse(stderr.trim());
        } catch {
          /* keep raw text */
        }
        resolve({
          ok: false,
          status: code === 4 ? 404 : 500,
          body: { error: "fdpm_exit_nonzero", detail: { code, stderr: parsedStderr } },
        });
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        resolve({ ok: true, data: parsed });
      } catch (err) {
        resolve({
          ok: false,
          status: 500,
          body: {
            error: "fdpm_json_parse_failed",
            detail: { message: (err as Error).message, stdout: stdout.slice(0, 4096) },
          },
        });
      }
    });
  });
}

function send(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
  });
  res.end(payload);
}

const WORKBOOK_ID_RE = /^[a-zA-Z0-9._:-]{1,128}$/;
const PLUGIN_ID_RE = /^[a-zA-Z0-9._-]{1,128}$/;
const PROFILE_ID_RE = /^[a-zA-Z0-9._:-]{1,128}$/;

/**
 * Look up the plugin's source root via `plugin get`, then try to read
 * README.md from there. Falls back to (-1, null) if either step fails.
 * Read errors are swallowed — a missing README is the common case.
 */
async function readPluginReadme(id: string): Promise<string | null> {
  const r = await runFdpm(["plugin", "get", id, "--json"]);
  if (!r.ok) return null;
  const data = r.data as { source?: { root?: unknown } };
  const root = data?.source?.root;
  if (typeof root !== "string") return null;
  try {
    return await readFile(join(root, "README.md"), "utf8");
  } catch {
    return null;
  }
}

/**
 * Allowlist of planning verbs. Each maps directly to a `fdpm planning <verb>`
 * subcommand. Adding a verb here without adding the corresponding CLI
 * subcommand will produce an `fdpm_exit_nonzero` error to the caller.
 */
const PLANNING_VERBS: ReadonlySet<string> = new Set([
  "mark-ready",
  "mark-in-progress",
  "mark-in-review",
  "mark-done",
  "mark-cancelled",
  "release-claim",
]);

const TASK_ID_RE = /^[a-zA-Z0-9._:-]{1,256}$/;
const VERB_RE = /^[a-z][a-z0-9-]{0,40}$/;

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    total += buf.length;
    if (total > 65536) {
      throw new Error("request_body_too_large");
    }
    chunks.push(buf);
  }
  if (total === 0) return {};
  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`invalid_json: ${(err as Error).message}`);
  }
}

async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const method = req.method ?? "GET";
  const url = new URL(req.url ?? "/", `http://${HOST}`);
  const path = url.pathname;

  // POST /api/planning/:verb — the one and only mutating surface.
  if (method === "POST") {
    const planningMatch = path.match(/^\/api\/planning\/([^/]+)$/);
    if (!planningMatch) {
      send(res, 404, { error: "not_found", detail: { method, path } });
      return;
    }
    const verb = decodeURIComponent(planningMatch[1]);
    if (!VERB_RE.test(verb) || !PLANNING_VERBS.has(verb)) {
      send(res, 400, { error: "invalid_verb", detail: { verb, allowed: [...PLANNING_VERBS] } });
      return;
    }
    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch (err) {
      send(res, 400, { error: (err as Error).message });
      return;
    }
    const { workbook, taskId } = (body ?? {}) as { workbook?: unknown; taskId?: unknown };
    if (typeof workbook !== "string" || !WORKBOOK_ID_RE.test(workbook)) {
      send(res, 400, { error: "invalid_workbook", detail: { workbook } });
      return;
    }
    if (typeof taskId !== "string" || !TASK_ID_RE.test(taskId)) {
      send(res, 400, { error: "invalid_task_id", detail: { taskId } });
      return;
    }
    const r = await runFdpm(["planning", verb, workbook, taskId, "--json"]);
    if (!r.ok) {
      send(res, r.status, r.body);
      return;
    }
    send(res, 200, r.data);
    return;
  }

  if (method !== "GET") {
    send(res, 405, { error: "method_not_allowed", detail: { method } });
    return;
  }

  if (path === "/api/health") {
    const r = await runFdpm(["workbook", "list", "--json"]);
    if (!r.ok) {
      send(res, r.status, r.body);
      return;
    }
    const wbs = (r.data as { workbooks?: unknown[] }).workbooks ?? [];
    send(res, 200, { ok: true, workbooks: wbs.length });
    return;
  }

  if (path === "/api/workbooks") {
    const r = await runFdpm(["workbook", "list", "--json"]);
    if (!r.ok) {
      send(res, r.status, r.body);
      return;
    }
    send(res, 200, r.data);
    return;
  }

  const detailMatch = path.match(/^\/api\/workbooks\/([^/]+)$/);
  if (detailMatch) {
    const id = decodeURIComponent(detailMatch[1]);
    if (!WORKBOOK_ID_RE.test(id)) {
      send(res, 400, { error: "invalid_workbook_id", detail: { id } });
      return;
    }
    const r = await runFdpm(["workbook", "get", id, "--json"]);
    if (!r.ok) {
      send(res, r.status, r.body);
      return;
    }
    send(res, 200, r.data);
    return;
  }

  if (path === "/api/plugins") {
    const r = await runFdpm(["plugin", "list", "--json"]);
    if (!r.ok) {
      send(res, r.status, r.body);
      return;
    }
    send(res, 200, r.data);
    return;
  }

  // Order matters: `/api/plugins/:id/manifest` and `/.../readme` must be
  // tried before the bare `/api/plugins/:id` match.
  const pluginManifestMatch = path.match(/^\/api\/plugins\/([^/]+)\/manifest$/);
  if (pluginManifestMatch) {
    const id = decodeURIComponent(pluginManifestMatch[1]);
    if (!PLUGIN_ID_RE.test(id)) {
      send(res, 400, { error: "invalid_plugin_id", detail: { id } });
      return;
    }
    const r = await runFdpm(["plugin", "manifest", id, "--json"]);
    if (!r.ok) {
      send(res, r.status, r.body);
      return;
    }
    send(res, 200, r.data);
    return;
  }

  const pluginReadmeMatch = path.match(/^\/api\/plugins\/([^/]+)\/readme$/);
  if (pluginReadmeMatch) {
    const id = decodeURIComponent(pluginReadmeMatch[1]);
    if (!PLUGIN_ID_RE.test(id)) {
      send(res, 400, { error: "invalid_plugin_id", detail: { id } });
      return;
    }
    const md = await readPluginReadme(id);
    if (md == null) {
      send(res, 404, { error: "readme_not_found", detail: { id } });
      return;
    }
    send(res, 200, { markdown: md });
    return;
  }

  const pluginDetailMatch = path.match(/^\/api\/plugins\/([^/]+)$/);
  if (pluginDetailMatch) {
    const id = decodeURIComponent(pluginDetailMatch[1]);
    if (!PLUGIN_ID_RE.test(id)) {
      send(res, 400, { error: "invalid_plugin_id", detail: { id } });
      return;
    }
    const r = await runFdpm(["plugin", "get", id, "--json"]);
    if (!r.ok) {
      send(res, r.status, r.body);
      return;
    }
    send(res, 200, r.data);
    return;
  }

  if (path === "/api/profiles") {
    const r = await runFdpm(["profile", "list", "--json"]);
    if (!r.ok) {
      send(res, r.status, r.body);
      return;
    }
    send(res, 200, r.data);
    return;
  }

  const profileDetailMatch = path.match(/^\/api\/profiles\/([^/]+)$/);
  if (profileDetailMatch) {
    const id = decodeURIComponent(profileDetailMatch[1]);
    if (!PROFILE_ID_RE.test(id)) {
      send(res, 400, { error: "invalid_profile_id", detail: { id } });
      return;
    }
    const r = await runFdpm(["profile", "get", id, "--json"]);
    if (!r.ok) {
      send(res, r.status, r.body);
      return;
    }
    send(res, 200, r.data);
    return;
  }

  send(res, 404, { error: "not_found", detail: { path } });
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    send(res, 500, { error: "bridge_internal", detail: { message: (err as Error).message } });
  });
});

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`[fdpm-bridge] listening on http://${HOST}:${PORT}  (fdpm=${FDPM_BIN}${DATA_DIR ? `, data-dir=${DATA_DIR}` : ""})`);
});
