import type {
  BridgeError,
  PluginListResponse,
  PluginManifest,
  PluginReadmeResponse,
  PluginRecord,
  ProfileDetail,
  ProfileListResponse,
  WorkbookDetailResponse,
  WorkbookListResponse,
} from "./types";

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { accept: "application/json" } });
  const body = (await res.json().catch(() => ({}))) as T | BridgeError;
  if (!res.ok) {
    const err = body as BridgeError;
    throw new Error(
      `${err.error ?? `http_${res.status}`}${err.detail ? `: ${JSON.stringify(err.detail)}` : ""}`,
    );
  }
  return body as T;
}

/**
 * POST a JSON body and parse the JSON response. On HTTP error, attempts
 * to extract a friendly message from the error envelope's structured
 * `detail.stderr.error.message` (the shape the bridge produces when the
 * fdpm CLI rejects via its JSON error envelope) before falling back to
 * the top-level `error` field.
 */
async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T | BridgeError;
  if (!res.ok) {
    const err = data as BridgeError;
    const cliError = extractCliError(err);
    throw new Error(cliError ?? err.error ?? `http_${res.status}`);
  }
  return data as T;
}

function extractCliError(err: BridgeError): string | null {
  // Bridge wraps a non-zero CLI exit as { error: "fdpm_exit_nonzero",
  //   detail: { code, stderr: { error: { category, message, findings } } } }
  const detail = err.detail as
    | {
        stderr?: {
          error?: { message?: unknown; findings?: Array<{ rule_id?: unknown; message?: unknown }> };
        };
      }
    | undefined;
  const cliErr = detail?.stderr?.error;
  if (!cliErr) return null;
  const baseMsg = typeof cliErr.message === "string" ? cliErr.message : null;
  const findings = Array.isArray(cliErr.findings) ? cliErr.findings : [];
  if (findings.length > 0) {
    const ruleIds = findings
      .map((f) => (typeof f.rule_id === "string" ? f.rule_id : null))
      .filter((s): s is string => !!s);
    return `${baseMsg ?? "validation failed"} (${ruleIds.join(", ")})`;
  }
  return baseMsg;
}

/**
 * Same as `getJson` but treats a 404 as "not present" — returns null
 * instead of throwing. Used for the plugin README endpoint, where
 * absence is expected rather than exceptional.
 */
async function getJsonOrNull<T>(path: string): Promise<T | null> {
  const res = await fetch(path, { headers: { accept: "application/json" } });
  if (res.status === 404) return null;
  const body = (await res.json().catch(() => ({}))) as T | BridgeError;
  if (!res.ok) {
    const err = body as BridgeError;
    throw new Error(
      `${err.error ?? `http_${res.status}`}${err.detail ? `: ${JSON.stringify(err.detail)}` : ""}`,
    );
  }
  return body as T;
}

export interface PlanningActionResult {
  ok: true;
  workbook: string;
  task_id: string;
  verb: string;
  status?: string;
  revision?: number;
}

export type PlanningVerb =
  | "mark-ready"
  | "mark-in-progress"
  | "mark-in-review"
  | "mark-done"
  | "mark-cancelled"
  | "release-claim";

export const api = {
  listWorkbooks: () => getJson<WorkbookListResponse>("/api/workbooks"),
  getWorkbook: (id: string) =>
    getJson<WorkbookDetailResponse>(`/api/workbooks/${encodeURIComponent(id)}`),
  listPlugins: () => getJson<PluginListResponse>("/api/plugins"),
  getPlugin: (id: string) =>
    getJson<PluginRecord>(`/api/plugins/${encodeURIComponent(id)}`),
  getPluginManifest: (id: string) =>
    getJson<PluginManifest>(`/api/plugins/${encodeURIComponent(id)}/manifest`),
  getPluginReadme: (id: string) =>
    getJsonOrNull<PluginReadmeResponse>(`/api/plugins/${encodeURIComponent(id)}/readme`),
  listProfiles: () => getJson<ProfileListResponse>("/api/profiles"),
  getProfile: (id: string) =>
    getJson<ProfileDetail>(`/api/profiles/${encodeURIComponent(id)}`),
  planning: {
    runVerb: (verb: PlanningVerb, args: { workbook: string; taskId: string }) =>
      postJson<PlanningActionResult>(`/api/planning/${verb}`, args),
  },
};
