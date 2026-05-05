/**
 * Field projection for response-heavy Tier-1 read tools.
 *
 * Real-world signal that prompted this: an LLM client invoked
 * `fdpm.profile.get` against a composed profile and received 66 KB
 * of JSON — large enough that the client harness diverted it to
 * disk before the model saw it. SPEC-MCP-SERVER §11.3 marks "new
 * optional argument" as a minor bump, so adding `fields?: string[]`
 * is in-spec for v0.1.x.
 *
 * Semantics: top-level key projection only. The LLM passes a list
 * of top-level keys it wants; the server returns those keys plus
 * a `_projected: true` marker so callers can distinguish a partial
 * response from a full one. Nested-path projection (`fields[].id`,
 * `categories.0.id`) is deliberately NOT implemented — JSON Pointer
 * or JMESPath-flavored paths are a v0.2 question.
 *
 * Unknown keys in `fields` are silently dropped (not an error). An
 * empty `fields: []` is treated identically to omitting the field
 * (full response). This makes it cheap for clients to build the
 * argument programmatically without branching.
 */

const PROJECTION_MARKER_KEY = "_projected";

export interface ProjectionResult {
  readonly value: Record<string, unknown>;
  readonly applied: boolean;
}

export function applyFieldsProjection(
  full: Record<string, unknown>,
  fields: readonly string[] | undefined,
): ProjectionResult {
  if (!fields || fields.length === 0) {
    return { value: full, applied: false };
  }
  const out: Record<string, unknown> = {};
  for (const key of fields) {
    if (key in full) out[key] = full[key];
  }
  out[PROJECTION_MARKER_KEY] = true;
  return { value: out, applied: true };
}
