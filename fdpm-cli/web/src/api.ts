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
};
