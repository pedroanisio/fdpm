/**
 * Profile revision identity — `(id, version)`.
 *
 * A DomainProfile id is not unique on its own: the same id may be
 * registered several times, once per `version`, and every consumer that
 * addresses a profile addresses one of those revisions. The reference
 * syntax is `id@version`; `@` cannot appear in an id (CORE_ID_PATTERN),
 * so the split is unambiguous and no escaping is required.
 *
 * A bare id means "the newest revision" everywhere EXCEPT a workbook
 * binding written before pinning existed — see
 * `resolveProfileForWorkbook`, which deliberately resolves an unpinned
 * workbook to the OLDEST revision so registering a newer one never
 * re-validates history against a schema that did not exist when the
 * operations were appended.
 *
 * `DomainProfile.version` is `^\d+\.\d+\.\d+$` (meta.ts) — no prerelease
 * or build metadata — so ordering is a numeric compare of three fields
 * and needs no semver dependency.
 */

export interface ProfileRef {
  id: string;
  version?: string;
}

/** Split `id@version`; a bare id yields `{ id }` with no version. */
export function parseProfileRef(ref: string): ProfileRef {
  const at = ref.indexOf("@");
  if (at < 0) return { id: ref };
  const id = ref.slice(0, at);
  const version = ref.slice(at + 1);
  return version.length > 0 ? { id, version } : { id };
}

/** Render a revision key. Inverse of `parseProfileRef` for pinned refs. */
export function formatProfileRef(id: string, version: string): string {
  return `${id}@${version}`;
}

/**
 * Numeric ordering over `major.minor.patch`. Returns <0, 0, >0.
 *
 * A lexical compare would sort `1.10.0` before `1.9.0`, which would make
 * "newest revision" wrong exactly when a profile has been revised enough
 * times to need the ordering.
 */
export function compareProfileVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10));
  const pb = b.split(".").map((n) => parseInt(n, 10));
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
}
