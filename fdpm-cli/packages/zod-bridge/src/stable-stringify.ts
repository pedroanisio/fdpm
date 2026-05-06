/**
 * Deterministic JSON serializer: same input -> byte-equal output.
 * - Object keys are sorted alphabetically at every depth.
 * - Arrays preserve order (insertion order is semantically meaningful).
 * - Indentation is fixed at two spaces.
 * - undefined values and function values are omitted (mirroring JSON.stringify).
 *
 * Used by the CI snapshot gate (failure:bridge:schema-drift-no-bump) and by
 * testcase:bridge-determinism.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(normalize(value), null, 2);
}

function normalize(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  const keys = Object.keys(value as Record<string, unknown>).sort();
  for (const k of keys) {
    const v = (value as Record<string, unknown>)[k];
    if (v === undefined || typeof v === "function") continue;
    out[k] = normalize(v);
  }
  return out;
}
