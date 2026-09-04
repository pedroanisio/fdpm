/**
 * The 50-instruction set is sound only if (a) the committed JSON is what
 * the generator emits, (b) it has the README composition, and (c) every
 * fixture and reference solution passes all four criteria against the
 * real `fdpm-mcp`. (c) is the expensive one and the one that matters: an
 * expectation nobody can reach grades every model as a failure.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildColdAgentV1, renderTestSet, TEST_SET_PATH } from "../../scripts/build-cold-agent-test-set.js";
import { COLD_AGENT_V1_COMPOSITION, checkComposition, parseTestSet } from "../../src/eval/schema.js";
import { runReferenceSuite } from "../../src/eval/runner.js";

const SUITE_TIMEOUT_MS = 600_000;

describe("cold-agent-v1 test set", () => {
  it("is the generator's output byte for byte", () => {
    expect(readFileSync(TEST_SET_PATH, "utf8")).toBe(renderTestSet(buildColdAgentV1()));
  });

  it("parses and has the README composition", () => {
    const set = parseTestSet(JSON.parse(readFileSync(TEST_SET_PATH, "utf8")));
    const report = checkComposition(set, COLD_AGENT_V1_COMPOSITION);
    expect(report.issues).toEqual([]);
    expect(report.total).toBe(50);
    expect(report.by_category).toEqual({ simple: 12, multi_step: 12, batch: 10, ambiguity: 8, refusal: 8 });
  });

  it(
    "every fixture and reference solution passes all four criteria against the real server",
    async () => {
      const set = parseTestSet(JSON.parse(readFileSync(TEST_SET_PATH, "utf8")));
      const suite = await runReferenceSuite(set);
      expect(suite.failures, suite.failures.join("\n")).toEqual([]);
      expect(suite.results).toHaveLength(50);
      for (const r of suite.results) {
        expect(r.status).toBe("scored");
        expect(r.score?.passed, `${r.instruction_id}: ${JSON.stringify(r.score?.criteria)}`).toBe(true);
      }
    },
    SUITE_TIMEOUT_MS,
  );
});
