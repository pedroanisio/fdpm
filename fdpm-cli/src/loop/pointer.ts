/**
 * JSON-pointer resolution over stage output, with a `*` segment that fans
 * out over array elements — the addressing scheme lf:OutputValidator and
 * lf:VariableBinding records use in `path` and `source_path`.
 *
 * An unresolvable pointer yields no values rather than `undefined`, so a
 * validator over `/evidence/*` /path` sees an empty list on an output with no
 * evidence and can decide for itself whether that is a failure.
 */

export function parsePointer(path: string): string[] {
  if (path === "" || path === "/") return [];
  if (!path.startsWith("/")) throw new Error(`JSON pointer must start with "/": ${JSON.stringify(path)}`);
  return path
    .slice(1)
    .split("/")
    .map((seg) => seg.replace(/~1/g, "/").replace(/~0/g, "~"));
}

/** Every value the pointer addresses. `*` fans out over arrays; a missing key contributes nothing. */
export function resolvePointer(value: unknown, path: string): unknown[] {
  let current: unknown[] = [value];
  for (const seg of parsePointer(path)) {
    const next: unknown[] = [];
    for (const v of current) {
      if (seg === "*") {
        if (Array.isArray(v)) next.push(...v);
        continue;
      }
      if (Array.isArray(v)) {
        const index = Number(seg);
        if (Number.isInteger(index) && index >= 0 && index < v.length) next.push(v[index]);
        continue;
      }
      if (v !== null && typeof v === "object" && Object.prototype.hasOwnProperty.call(v, seg)) {
        next.push((v as Record<string, unknown>)[seg]);
      }
    }
    current = next;
  }
  return current;
}

/** The single value at a pointer without wildcards, or `undefined` when absent. */
export function pointerValue(value: unknown, path: string): unknown {
  if (path.includes("*")) throw new Error(`pointerValue does not accept wildcards: ${path}`);
  const found = resolvePointer(value, path);
  return found.length === 0 ? undefined : found[0];
}
