/**
 * Resolve a cited locator and compare the title found there with the title
 * the model wrote. A citation that reads plausibly but cannot be retrieved is
 * exactly the failure the Capability-Detection Asymmetry (Silent Acceptance
 * v2.1.0 §7.1) predicts, and it is rejected regardless of how correct the
 * surrounding work is.
 *
 * ARCHITECTURAL REQUIREMENT: LLMs will always produce some form of error.
 * Absence of output verification is a design defect, not a runtime bug.
 * All LLM output must be treated as untrusted and validated explicitly.
 *
 * Network access is injected so the logic is testable with canned responses;
 * `httpFetcher` is the production implementation.
 */

export interface FetchedText {
  status: number;
  text: string;
  finalUrl: string;
}

export type Fetcher = (url: string, headers: Record<string, string>) => Promise<FetchedText>;

export interface Resolution {
  ok: boolean;
  /** How the locator was classified. */
  scheme: "doi" | "arxiv" | "https" | "unknown";
  /** The URL that was actually fetched, when one was. */
  url?: string;
  /** The title as found at the locator, when one was. */
  found_title?: string;
  reason?: string;
}

const DOI_RE = /^(?:doi:|https?:\/\/(?:dx\.)?doi\.org\/)(10\.\d{4,9}\/\S+)$/i;
const ARXIV_RE = /^(?:arxiv:|https?:\/\/(?:export\.)?arxiv\.org\/(?:abs|pdf)\/)(\d{4}\.\d{4,5}(?:v\d+)?|[a-z-]+(?:\.[A-Z]{2})?\/\d{7}(?:v\d+)?)$/i;

export function classifyLocator(locator: string): { scheme: Resolution["scheme"]; id: string } {
  const trimmed = locator.trim();
  const doi = DOI_RE.exec(trimmed);
  if (doi) return { scheme: "doi", id: doi[1]! };
  const arxiv = ARXIV_RE.exec(trimmed);
  if (arxiv) return { scheme: "arxiv", id: arxiv[1]! };
  if (/^https:\/\//i.test(trimmed)) return { scheme: "https", id: trimmed };
  return { scheme: "unknown", id: trimmed };
}

/** Lowercase, strip everything but letters and digits, collapse. Titles differ in punctuation and casing across indexes; they do not differ in words. */
export function normalizeTitle(title: string): string {
  return title
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function titleFromAtom(xml: string): string | undefined {
  // The feed's own <title> comes first; the entry's title is inside <entry>.
  const entry = /<entry>([\s\S]*?)<\/entry>/i.exec(xml)?.[1];
  if (!entry) return undefined;
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(entry)?.[1];
  return title === undefined ? undefined : decodeEntities(title);
}

function titleFromHtml(html: string): string | undefined {
  const og = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1];
  if (og) return decodeEntities(og);
  const citation = /<meta[^>]+name=["']citation_title["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1];
  if (citation) return decodeEntities(citation);
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  return title === undefined ? undefined : decodeEntities(title);
}

function titleFromCsl(json: string): string | undefined {
  try {
    const parsed = JSON.parse(json) as { title?: unknown };
    return typeof parsed.title === "string" ? parsed.title.trim() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Fetch the locator and extract a title. DOIs are resolved through content
 * negotiation (CSL JSON), arXiv ids through the export API, and plain HTTPS
 * through the page's metadata. Anything else is unknown and fails.
 */
export async function resolveReference(locator: string, fetcher: Fetcher): Promise<Resolution> {
  const { scheme, id } = classifyLocator(locator);
  try {
    if (scheme === "doi") {
      const url = `https://doi.org/${id}`;
      const res = await fetcher(url, { Accept: "application/vnd.citationstyles.csl+json" });
      if (res.status < 200 || res.status >= 300) return { ok: false, scheme, url, reason: `HTTP ${res.status}` };
      const title = titleFromCsl(res.text);
      return title === undefined ? { ok: false, scheme, url, reason: "no title in CSL record" } : { ok: true, scheme, url, found_title: title };
    }
    if (scheme === "arxiv") {
      const url = `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}&max_results=1`;
      const res = await fetcher(url, {});
      if (res.status < 200 || res.status >= 300) return { ok: false, scheme, url, reason: `HTTP ${res.status}` };
      const title = titleFromAtom(res.text);
      return title === undefined ? { ok: false, scheme, url, reason: "no entry for that arXiv id" } : { ok: true, scheme, url, found_title: title };
    }
    if (scheme === "https") {
      const res = await fetcher(id, { Accept: "text/html" });
      if (res.status < 200 || res.status >= 300) return { ok: false, scheme, url: id, reason: `HTTP ${res.status}` };
      const title = titleFromHtml(res.text);
      return title === undefined ? { ok: false, scheme, url: id, reason: "no title in page" } : { ok: true, scheme, url: id, found_title: title };
    }
    return { ok: false, scheme, reason: "locator is not a DOI, an arXiv id or an https URL" };
  } catch (err) {
    return { ok: false, scheme, reason: err instanceof Error ? err.message : String(err) };
  }
}

export interface ReferenceCheck {
  locator: string;
  title: string;
}

export interface ReferenceVerdict extends Resolution {
  locator: string;
  cited_title: string;
  /** True when the locator resolved AND the titles agree after normalisation. */
  matches: boolean;
}

export async function checkReference(ref: ReferenceCheck, fetcher: Fetcher): Promise<ReferenceVerdict> {
  const resolution = await resolveReference(ref.locator, fetcher);
  const matches = resolution.ok && resolution.found_title !== undefined && normalizeTitle(resolution.found_title) === normalizeTitle(ref.title);
  return { ...resolution, locator: ref.locator, cited_title: ref.title, matches };
}

/** Production fetcher over the global fetch, with a hard timeout and redirects followed. */
export function httpFetcher(timeoutMs = 15_000): Fetcher {
  return async (url, headers) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers: { "User-Agent": "fdpm-loop-forward/1.0 (reference check)", ...headers }, redirect: "follow", signal: controller.signal });
      return { status: res.status, text: await res.text(), finalUrl: res.url };
    } finally {
      clearTimeout(timer);
    }
  };
}
