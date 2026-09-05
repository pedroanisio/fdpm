/**
 * The pure part of the Codex wrapper driver: what a stage is handed from a
 * wrapper envelope, and what is refused.
 */
import { describe, expect, it } from "vitest";
import { unwrapWrapperEnvelope } from "../../src/loop/drivers.js";

describe("unwrapWrapperEnvelope", () => {
  const envelope = JSON.stringify({ mode: "attempt", validated: true, return: { status: "computed", claims: [] } });

  it("hands over the envelope by default and the payload when asked, keeping the verdict as evidence", () => {
    const kept = unwrapWrapperEnvelope(envelope, false);
    expect(kept.error).toBeUndefined();
    expect(JSON.parse(kept.outputText)).toHaveProperty("validated", true);
    expect(kept.evidence["wrapper_mode"]).toBe("attempt");

    const unwrapped = unwrapWrapperEnvelope(envelope, true);
    expect(JSON.parse(unwrapped.outputText)).toEqual({ status: "computed", claims: [] });
    expect(unwrapped.evidence["wrapper_validated"]).toBe(true);
    expect(unwrapped.evidence["envelope_digest"]).toMatch(/^[a-f0-9]{64}$/);
  });

  it("refuses anything that is not a validated envelope, as a driver error rather than output", () => {
    expect(unwrapWrapperEnvelope("OpenAI Codex v0.153.2\n{...}", true).error).toContain("not JSON");
    expect(unwrapWrapperEnvelope(JSON.stringify({ mode: "attempt", validated: false, return: {} }), true).error).toContain("validated:true");
    expect(unwrapWrapperEnvelope(JSON.stringify({ status: "computed" }), true).error).toContain("lacks");
  });
});
