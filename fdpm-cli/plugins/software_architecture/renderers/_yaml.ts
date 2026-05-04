/**
 * Minimal, dependency-free YAML 1.2 emitter for the OpenAPI renderer.
 *
 * Scope is intentionally narrow — it covers exactly what the OpenAPI emitter
 * needs: nested string-keyed maps, arrays, strings, numbers, booleans, and
 * `null`. It is NOT a general-purpose YAML library.
 *
 * Quoting rules (conservative; `js-yaml`-compatible subset):
 *  - keys are emitted unquoted only when they match `[A-Za-z_][A-Za-z0-9_./-]*`
 *    AND are not a YAML reserved bareword (true/false/null/yes/no/~);
 *    otherwise double-quoted.
 *  - string values are double-quoted whenever they contain any of:
 *    `:`, `#`, leading/trailing whitespace, control characters, look like a
 *    number/bool/null, are empty, start with a YAML indicator
 *    (`-`, `?`, `&`, `*`, `!`, `|`, `>`, `'`, `"`, `%`, `@`, `\``).
 *  - inside double-quoted strings, `"` and `\` are backslash-escaped and
 *    control characters are emitted as `\xHH`.
 */

const INDENT = "  ";

const RESERVED_BAREWORDS = new Set([
  "true", "false", "null", "True", "False", "Null", "TRUE", "FALSE", "NULL",
  "yes", "no", "Yes", "No", "YES", "NO", "on", "off", "On", "Off", "ON", "OFF",
  "~",
]);

// Keys may start with `/` (OpenAPI paths), `$` (e.g. `$ref`), or `[A-Za-z_]`.
// Subsequent chars allow letters, digits, `_`, `.`, `/`, `-`. Anything else
// → double-quoted.
const SAFE_KEY = /^[A-Za-z_/$][A-Za-z0-9_./-]*$/;
const NUMBER_LIKE = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;
const INDICATORS = new Set(["-", "?", "&", "*", "!", "|", ">", "'", "\"", "%", "@", "`"]);

function needsQuoting(s: string): boolean {
  if (s.length === 0) return true;
  if (RESERVED_BAREWORDS.has(s)) return true;
  if (NUMBER_LIKE.test(s)) return true;
  if (INDICATORS.has(s[0]!)) return true;
  if (s !== s.trim()) return true;
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (code < 0x20 || code === 0x7f) return true;
    if (ch === ":" || ch === "#" || ch === "\n") return true;
  }
  return false;
}

function quoteString(s: string): string {
  let out = "\"";
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (ch === "\\") out += "\\\\";
    else if (ch === "\"") out += "\\\"";
    else if (code === 0x0a) out += "\\n";
    else if (code === 0x0d) out += "\\r";
    else if (code === 0x09) out += "\\t";
    else if (code < 0x20 || code === 0x7f) {
      out += "\\x" + code.toString(16).padStart(2, "0").toUpperCase();
    } else out += ch;
  }
  return out + "\"";
}

function emitKey(k: string): string {
  if (SAFE_KEY.test(k) && !RESERVED_BAREWORDS.has(k)) return k;
  return quoteString(k);
}

function emitScalar(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return ".nan";
    return String(v);
  }
  if (typeof v === "string") {
    return needsQuoting(v) ? quoteString(v) : v;
  }
  // Fallback — should never hit for the OpenAPI shape, but be safe.
  return quoteString(String(v));
}

export type YamlValue =
  | null
  | undefined
  | boolean
  | number
  | string
  | YamlValue[]
  | { [k: string]: YamlValue };

function isPlainObject(v: unknown): v is { [k: string]: YamlValue } {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function emit(value: YamlValue, depth: number, lines: string[]): void {
  const pad = INDENT.repeat(depth);
  if (Array.isArray(value)) {
    if (value.length === 0) {
      // Inline empty sequence — only valid as a value (caller handles).
      lines.push(pad + "[]");
      return;
    }
    for (const item of value) {
      if (Array.isArray(item) || isPlainObject(item)) {
        lines.push(pad + "-");
        emit(item, depth + 1, lines);
      } else {
        lines.push(pad + "- " + emitScalar(item));
      }
    }
    return;
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    if (keys.length === 0) {
      lines.push(pad + "{}");
      return;
    }
    for (const k of keys) {
      const v = value[k];
      const kk = emitKey(k);
      if (Array.isArray(v)) {
        if (v.length === 0) {
          lines.push(`${pad}${kk}: []`);
        } else {
          lines.push(`${pad}${kk}:`);
          emit(v, depth, lines); // arrays sit at the same indent as the key
        }
      } else if (isPlainObject(v)) {
        if (Object.keys(v).length === 0) {
          lines.push(`${pad}${kk}: {}`);
        } else {
          lines.push(`${pad}${kk}:`);
          emit(v, depth + 1, lines);
        }
      } else {
        lines.push(`${pad}${kk}: ${emitScalar(v)}`);
      }
    }
    return;
  }
  // Top-level scalar (rare).
  lines.push(pad + emitScalar(value));
}

export function dumpYaml(value: YamlValue): string {
  const lines: string[] = [];
  emit(value, 0, lines);
  return lines.join("\n") + "\n";
}
