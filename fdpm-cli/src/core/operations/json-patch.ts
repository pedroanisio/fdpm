import { FDPMException } from "../errors/fdpm-exception.js";

/**
 * §9.7.4 RFC-6902 subset for `:field-patch`.
 *
 * Allowed: add, remove, replace, move, copy, test.
 * Path syntax: RFC-6901 against the document.
 *
 * Returns the patched document AND the inverse operations (for §9.8.4
 * `:undo` of `*.field-patch` kinds).
 */

export type JsonPatchOp =
  | { op: "add"; path: string; value: unknown }
  | { op: "remove"; path: string }
  | { op: "replace"; path: string; value: unknown }
  | { op: "move"; path: string; from: string }
  | { op: "copy"; path: string; from: string }
  | { op: "test"; path: string; value: unknown };

function decodeToken(t: string): string {
  return t.replace(/~1/g, "/").replace(/~0/g, "~");
}

function parsePointer(path: string): string[] {
  if (path === "") return [];
  if (!path.startsWith("/"))
    throw new FDPMException("verification", `JSON Pointer must start with /: ${path}`);
  return path.slice(1).split("/").map(decodeToken);
}

function deepClone<T>(v: T): T {
  return v === undefined ? v : JSON.parse(JSON.stringify(v));
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function getAt(doc: unknown, tokens: string[]): { parent: unknown; key: string | number; value: unknown } {
  if (tokens.length === 0) return { parent: null, key: "", value: doc };
  let cur: unknown = doc;
  for (let i = 0; i < tokens.length - 1; i++) {
    const t = tokens[i]!;
    if (Array.isArray(cur)) {
      const idx = parseInt(t, 10);
      if (Number.isNaN(idx) || idx < 0 || idx >= cur.length)
        throw new FDPMException("verification", `array index out of bounds: ${t}`);
      cur = cur[idx];
    } else if (cur && typeof cur === "object") {
      cur = (cur as Record<string, unknown>)[t];
    } else {
      throw new FDPMException("verification", `cannot traverse ${t} on non-container`);
    }
  }
  const last = tokens[tokens.length - 1]!;
  const parent = cur;
  if (Array.isArray(parent)) {
    const key = last === "-" ? parent.length : parseInt(last, 10);
    if (last !== "-" && (Number.isNaN(key) || (key as number) < 0))
      throw new FDPMException("verification", `array index invalid: ${last}`);
    return { parent, key, value: parent[key as number] };
  }
  if (parent && typeof parent === "object") {
    return { parent, key: last, value: (parent as Record<string, unknown>)[last] };
  }
  throw new FDPMException("verification", `cannot access ${last} on non-container`);
}

export function applyPatch(
  doc: Record<string, unknown>,
  ops: JsonPatchOp[],
  forbiddenTopKeys: string[] = [],
): { result: Record<string, unknown>; inverse: JsonPatchOp[] } {
  const root = deepClone(doc);
  const inverse: JsonPatchOp[] = [];

  for (const op of ops) {
    const tokens = parsePointer(op.path);
    if (tokens.length > 0 && forbiddenTopKeys.includes(tokens[0]!)) {
      throw new FDPMException(
        "verification",
        `path targets immutable field: /${tokens[0]}`,
      );
    }
    if ("from" in op && op.from !== undefined) {
      const fromTokens = parsePointer(op.from);
      if (fromTokens.length > 0 && forbiddenTopKeys.includes(fromTokens[0]!)) {
        throw new FDPMException(
          "verification",
          `from targets immutable field: /${fromTokens[0]}`,
        );
      }
    }

    switch (op.op) {
      case "test": {
        const { value } = getAt(root, tokens);
        if (!deepEqual(value, op.value)) {
          throw new FDPMException("verification", `test failed at ${op.path}`);
        }
        break;
      }
      case "add": {
        const { parent, key } = getAt(root, tokens);
        if (Array.isArray(parent)) {
          const idx = key as number;
          parent.splice(idx, 0, deepClone(op.value));
          inverse.unshift({ op: "remove", path: op.path });
        } else if (parent && typeof parent === "object") {
          const obj = parent as Record<string, unknown>;
          const k = key as string;
          const had = Object.prototype.hasOwnProperty.call(obj, k);
          const prior = obj[k];
          obj[k] = deepClone(op.value);
          if (had) inverse.unshift({ op: "replace", path: op.path, value: deepClone(prior) });
          else inverse.unshift({ op: "remove", path: op.path });
        } else if (tokens.length === 0) {
          // replace whole document — not really meaningful for field_values
          throw new FDPMException("verification", "add at root not supported");
        }
        break;
      }
      case "remove": {
        const { parent, key, value } = getAt(root, tokens);
        if (Array.isArray(parent)) {
          parent.splice(key as number, 1);
          inverse.unshift({ op: "add", path: op.path, value: deepClone(value) });
        } else if (parent && typeof parent === "object") {
          const obj = parent as Record<string, unknown>;
          if (!Object.prototype.hasOwnProperty.call(obj, key as string))
            throw new FDPMException("verification", `path not found: ${op.path}`);
          const prior = obj[key as string];
          delete obj[key as string];
          inverse.unshift({ op: "add", path: op.path, value: deepClone(prior) });
        }
        break;
      }
      case "replace": {
        const { parent, key, value: prior } = getAt(root, tokens);
        if (Array.isArray(parent)) {
          parent[key as number] = deepClone(op.value);
        } else if (parent && typeof parent === "object") {
          const obj = parent as Record<string, unknown>;
          if (!Object.prototype.hasOwnProperty.call(obj, key as string))
            throw new FDPMException("verification", `path not found: ${op.path}`);
          obj[key as string] = deepClone(op.value);
        }
        inverse.unshift({ op: "replace", path: op.path, value: deepClone(prior) });
        break;
      }
      case "move": {
        const fromTokens = parsePointer(op.from);
        const removed = getAt(root, fromTokens);
        const value = deepClone(removed.value);
        // Apply remove then add via recursion (not strictly required but
        // keeps the inverse capture simple).
        const tmp = applyPatch(root, [
          { op: "remove", path: op.from },
          { op: "add", path: op.path, value },
        ], forbiddenTopKeys);
        Object.keys(root).forEach((k) => delete (root as Record<string, unknown>)[k]);
        Object.assign(root, tmp.result);
        inverse.unshift(...tmp.inverse);
        break;
      }
      case "copy": {
        const fromTokens = parsePointer(op.from);
        const { value } = getAt(root, fromTokens);
        const tmp = applyPatch(root, [
          { op: "add", path: op.path, value: deepClone(value) },
        ], forbiddenTopKeys);
        Object.keys(root).forEach((k) => delete (root as Record<string, unknown>)[k]);
        Object.assign(root, tmp.result);
        inverse.unshift(...tmp.inverse);
        break;
      }
    }
  }
  return { result: root, inverse };
}

/**
 * Compute the set of top-level field-name keys touched by a JSON-Patch
 * operation list. Used by `:field-patch` to scope the §7 validation
 * pipeline to only the fields the patch actually changes — without
 * this, a patch on field B is rejected when field A (untouched) has a
 * pre-existing violation, which makes editing imported third-party
 * data impractical.
 *
 * The "top-level" path is the first segment of each operation's RFC-6901
 * pointer. For `move`/`copy` operations, both the destination `path`
 * and the source `from` count as touched (move removes from one and
 * adds to the other; copy reads from one and writes to the other).
 *
 * Patches with the empty path "" or pointers that target the document
 * root yield an empty top-level segment "" — meaning the whole document
 * is touched, so the caller should fall back to full revalidation.
 */
export function touchedTopLevelPaths(ops: readonly JsonPatchOp[]): Set<string> {
  const out = new Set<string>();
  for (const op of ops) {
    addTopLevelOf(op.path, out);
    if ("from" in op && op.from !== undefined) addTopLevelOf(op.from, out);
  }
  return out;
}

function addTopLevelOf(pointer: string, set: Set<string>): void {
  const tokens = parsePointer(pointer);
  if (tokens.length === 0) {
    // Root pointer "" — treat as "whole document" by adding a sentinel.
    // Callers that see this sentinel must fall back to full revalidation.
    set.add("");
    return;
  }
  set.add(tokens[0]!);
}
