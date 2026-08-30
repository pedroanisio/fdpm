/**
 * §12.1 Identifier rules — colon-separated namespaced strings, with an
 * optional dot-separated version suffix on the last segment.
 *
 * The Core ID pattern: `^[a-z0-9-]+(:[A-Za-z0-9.-_]+)+$`. At least one
 * colon — a top-level namespace (lowercase) plus at least one segment.
 *
 * Per SPEC §12.1, segments after the first may carry a "version suffix
 * where applicable" (dots allowed) and may use mixed case so profile
 * vocabularies can use CamelCase type ids like "fs:Section" while the
 * top-level namespace stays canonical lowercase.
 */
export const CORE_ID_PATTERN = /^[a-z0-9-]+(:[A-Za-z0-9._-]+)+$/;
export const SIMPLE_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const WINDOWS_RESERVED_DEVICE_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** §11.3 reserved namespaces — Core-owned. */
export const RESERVED_NAMESPACE_PREFIXES = ["core:", "fdpm:"] as const;

export function isCoreReserved(id: string): boolean {
  return RESERVED_NAMESPACE_PREFIXES.some((p) => id.startsWith(p));
}

export function isValidCoreId(id: string): boolean {
  return CORE_ID_PATTERN.test(id);
}

/**
 * Workbook IDs are flat slugs, not colon-namespaced (operator-friendly).
 * They also become directory names, so names reserved by Windows are invalid
 * on every platform to keep workbooks portable between hosts.
 */
export function isValidProjectId(id: string): boolean {
  return (
    SIMPLE_ID_PATTERN.test(id) &&
    id.length <= 128 &&
    !WINDOWS_RESERVED_DEVICE_NAME.test(id)
  );
}
