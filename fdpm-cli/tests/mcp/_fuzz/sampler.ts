/**
 * Hand-rolled JSON Schema sampler for the MCP schema-fuzz harness.
 *
 * SPEC-MCP-SERVER §22.5 / §26: the goal is to detect drift between
 * the JSON Schema advertised to the MCP client and the runtime Zod
 * validator. We sample inputs from the advertised JSON Schema, then
 * assert the runtime Zod validator accepts every one. Any rejection
 * of a JSON-Schema-valid input is drift.
 *
 * This sampler is deliberately small and dependency-free. It supports
 * the JSON Schema 7 subset that `zod-to-json-schema` produces from
 * the Zod schemas used in the MCP tool manifest:
 *
 *   - object (with `properties`, `required`, `additionalProperties`)
 *   - string (with optional `minLength`, `maxLength`, `enum`, `const`)
 *   - number / integer (with optional `minimum`, `maximum`)
 *   - boolean
 *   - array (with `items`, optional `minItems`, `maxItems`)
 *   - enum, const
 *   - anyOf / oneOf / allOf (picks one branch)
 *   - $ref-free (zod-to-json-schema is configured with $refStrategy:"none")
 *   - nullable via `type: ["x", "null"]`
 *
 * Format-specific Zod refinements (e.g. ULID, regex'd id_format) are
 * NOT modelled by JSON Schema's `format` keyword in the converter
 * output, so the sampler may produce strings that Zod rejects. That
 * is acceptable — the harness filters samples via an Ajv pre-check
 * and only asserts on the JSON-Schema-valid subset.
 *
 * Random source: a small seeded PRNG so failures reproduce locally.
 */

export type JsonSchema = Record<string, unknown>;

export class SeededRandom {
  private state: number;
  constructor(seed: number) {
    // Mulberry32 — small, fast, deterministic, no deps.
    this.state = seed >>> 0;
  }
  next(): number {
    let t = (this.state += 0x6d2b79f5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  pick<T>(arr: ReadonlyArray<T>): T {
    return arr[Math.floor(this.next() * arr.length)] as T;
  }
  bool(): boolean {
    return this.next() < 0.5;
  }
}

/**
 * Generate one sample value for the given JSON Schema fragment.
 * Best-effort: for unknown / unsupported keywords, returns a
 * reasonable default (`null` or empty object). The Ajv post-filter
 * discards samples that are not actually schema-valid.
 */
export function sample(schema: JsonSchema, rng: SeededRandom, depth = 0): unknown {
  if (depth > 6) return null;

  // Const wins.
  if ("const" in schema) return (schema as { const: unknown }).const;

  // Enum: pick one.
  if (Array.isArray((schema as { enum?: unknown[] }).enum)) {
    return rng.pick((schema as { enum: unknown[] }).enum);
  }

  // Combinators: pick one branch.
  for (const k of ["oneOf", "anyOf"] as const) {
    const branches = (schema as Record<string, unknown>)[k];
    if (Array.isArray(branches) && branches.length > 0) {
      const branch = rng.pick(branches as JsonSchema[]);
      return sample(branch, rng, depth + 1);
    }
  }
  if (Array.isArray((schema as { allOf?: unknown[] }).allOf)) {
    // Best-effort merge: sample from the first branch. The Ajv
    // post-filter removes samples that don't satisfy the rest.
    const allOf = (schema as { allOf: JsonSchema[] }).allOf;
    if (allOf.length > 0) return sample(allOf[0]!, rng, depth + 1);
  }

  // Type may be a string or an array (e.g. ["string","null"]).
  const typeField = (schema as { type?: unknown }).type;
  let type: string | undefined;
  if (typeof typeField === "string") {
    type = typeField;
  } else if (Array.isArray(typeField) && typeField.length > 0) {
    const filtered = (typeField as string[]).filter((t) => t !== "null");
    if (filtered.length === 0) return null;
    if (rng.next() < 0.1) return null;
    type = rng.pick(filtered);
  }

  switch (type) {
    case "object":
      return sampleObject(schema, rng, depth);
    case "array":
      return sampleArray(schema, rng, depth);
    case "string":
      return sampleString(schema, rng);
    case "integer":
      return sampleInteger(schema, rng);
    case "number":
      return sampleNumber(schema, rng);
    case "boolean":
      return rng.bool();
    case "null":
      return null;
  }

  // No type — pick something innocuous.
  return null;
}

function sampleObject(schema: JsonSchema, rng: SeededRandom, depth: number): unknown {
  const properties = ((schema as { properties?: Record<string, JsonSchema> })
    .properties ?? {}) as Record<string, JsonSchema>;
  const required = new Set<string>(
    ((schema as { required?: string[] }).required ?? []) as string[],
  );
  const additionalAllowed =
    (schema as { additionalProperties?: unknown }).additionalProperties !== false;

  const out: Record<string, unknown> = {};
  for (const [key, propSchema] of Object.entries(properties)) {
    const include = required.has(key) || rng.next() < 0.7;
    if (!include) continue;
    out[key] = sample(propSchema, rng, depth + 1);
  }
  // Occasionally inject an extra key when allowed; otherwise the
  // strict-schema rejection path is never exercised.
  if (additionalAllowed && rng.next() < 0.05) {
    out[`__extra_${rng.int(0, 9999)}`] = rng.bool();
  }
  return out;
}

function sampleArray(schema: JsonSchema, rng: SeededRandom, depth: number): unknown {
  const items = (schema as { items?: JsonSchema | JsonSchema[] }).items;
  const minItems = (schema as { minItems?: number }).minItems ?? 0;
  const maxItems = Math.min((schema as { maxItems?: number }).maxItems ?? 5, 5);
  const len = rng.int(minItems, Math.max(minItems, maxItems));
  const out: unknown[] = [];
  for (let i = 0; i < len; i++) {
    if (Array.isArray(items)) {
      const itemSchema = items[i % items.length];
      if (itemSchema) out.push(sample(itemSchema, rng, depth + 1));
    } else if (items) {
      out.push(sample(items, rng, depth + 1));
    } else {
      out.push(null);
    }
  }
  return out;
}

function sampleString(schema: JsonSchema, rng: SeededRandom): string {
  const minLen = (schema as { minLength?: number }).minLength ?? 1;
  const maxLen = Math.min((schema as { maxLength?: number }).maxLength ?? 12, 12);
  const len = rng.int(Math.max(minLen, 1), Math.max(minLen, maxLen));
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789-_";
  let s = "";
  for (let i = 0; i < len; i++) {
    s += alphabet[rng.int(0, alphabet.length - 1)];
  }
  return s;
}

function sampleInteger(schema: JsonSchema, rng: SeededRandom): number {
  const min = (schema as { minimum?: number }).minimum ?? -1000;
  const max = (schema as { maximum?: number }).maximum ?? 1000;
  return rng.int(min, max);
}

function sampleNumber(schema: JsonSchema, rng: SeededRandom): number {
  const min = (schema as { minimum?: number }).minimum ?? -1000;
  const max = (schema as { maximum?: number }).maximum ?? 1000;
  return min + rng.next() * (max - min);
}
