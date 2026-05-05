/**
 * SPEC-MCP-SERVER §22.5 / §26 — schema-fuzz harness.
 *
 * For every tool in MANIFEST, sample inputs from the *advertised* JSON
 * Schema (the artifact a generic MCP client sees) and assert that
 * every JSON-Schema-valid sample is also accepted by the runtime Zod
 * validator. The failure case is drift between the two: a permissive
 * advertised schema with a stricter runtime validator (the LLM sends
 * “valid” inputs that the handler rejects), or the reverse.
 *
 * The reverse direction (runtime stricter than advertised) is the
 * category this test catches. The opposite (runtime more permissive
 * than advertised) is silently safe for v0.1: an LLM that does not
 * trust the advertised schema can in principle send extra-valid
 * inputs the handler accepts. SPEC §26 calls out the asymmetry.
 *
 * Sampling strategy:
 *   - Hand-rolled sampler (`./_fuzz/sampler.ts`), seeded for repro.
 *   - 10⁴ samples per tool. Multi-tool runtime is ~5s on a workstation;
 *     halve to 1000 only if the wider suite stays under the 60-s budget.
 *   - Filter samples through Ajv against the advertised JSON Schema;
 *     only assert on the JSON-Schema-valid subset. Samples Ajv rejects
 *     are discarded (they exercise corners the JSON Schema does not
 *     advertise as valid — not interesting for drift detection).
 */

import { describe, it, expect } from "vitest";
import Ajv from "ajv";
import { MANIFEST } from "../../src/mcp/manifest.js";
import { toJsonSchema } from "../../src/mcp/schemas.js";
import { sample, SeededRandom, type JsonSchema } from "./_fuzz/sampler.js";

const SAMPLES_PER_TOOL = 10_000;

interface DriftReport {
  tool: string;
  sample: unknown;
  zodIssues: string[];
}

describe("MCP schema-fuzz — advertised JSON Schema ⇒ runtime Zod (SPEC §22.5)", () => {
  it(`every JSON-Schema-valid sample is accepted by Zod across all ${MANIFEST.length} tool(s)`, () => {
    const ajv = new Ajv({
      strict: false, // zod-to-json-schema emits some extra keywords
      allErrors: true,
    });

    const drift: DriftReport[] = [];
    let totalAttempted = 0;
    let totalSchemaValid = 0;

    for (const tool of MANIFEST) {
      const jsonSchema = toJsonSchema(tool.input) as JsonSchema;
      const validate = ajv.compile(jsonSchema);
      // Seed per tool so failures reproduce across runs.
      const seed = hash32(tool.name);
      const rng = new SeededRandom(seed);

      for (let i = 0; i < SAMPLES_PER_TOOL; i++) {
        totalAttempted++;
        const candidate = sample(jsonSchema, rng);
        // Only assert on samples that the advertised JSON Schema
        // actually accepts. The sampler is best-effort; Ajv is the
        // authoritative pre-filter.
        if (!validate(candidate)) continue;
        totalSchemaValid++;

        const zodResult = tool.input.safeParse(candidate);
        if (!zodResult.success) {
          drift.push({
            tool: tool.name,
            sample: candidate,
            zodIssues: zodResult.error.issues.map(
              (iss) => `${iss.path.join(".")}: ${iss.message}`,
            ),
          });
          // Cap drift report size to keep failure output readable.
          if (drift.length >= 10) break;
        }
      }
      if (drift.length >= 10) break;
    }

    expect(
      drift,
      drift.length === 0
        ? `ok — ${totalSchemaValid} schema-valid samples (of ${totalAttempted} attempted) accepted by Zod across ${MANIFEST.length} tool(s)`
        : `Drift detected: advertised JSON Schema accepted samples that runtime Zod rejected:\n${drift
            .map(
              (d) =>
                `  ${d.tool}\n    sample: ${JSON.stringify(d.sample)}\n    zod: ${d.zodIssues.join("; ")}`,
            )
            .join("\n")}`,
    ).toEqual([]);

    // Sanity: at least one sample per tool should pass the JSON
    // Schema filter, otherwise the sampler is broken (not the drift
    // we want to flag).
    expect(totalSchemaValid).toBeGreaterThan(MANIFEST.length);
  }, 30_000);
});

/** Tiny non-crypto string hash for deterministic per-tool seeding. */
function hash32(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
