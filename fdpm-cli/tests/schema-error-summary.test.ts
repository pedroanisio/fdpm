import { describe, it, expect } from "vitest";
import { verifyOperationPayload } from "../src/core/gate/verification-gate.js";
import { FDPMException } from "../src/core/errors/fdpm-exception.js";

/**
 * #4 — `payload schema violation` errors include a path:message summary.
 *
 * Original behaviour: every malformed payload produced the same opaque
 * message ("payload schema violation for primitive.patch") and the
 * operator had to inspect `evidence.issues` (or grep the source) to
 * discover the actual problem. The summary lifts the first 1-3 issues
 * into the headline so the error is actionable on its own.
 */
describe("§8 verification gate — error message includes Zod issue summary", () => {
  it("missing required field surfaces the field name in the message", () => {
    try {
      verifyOperationPayload({
        kind: "primitive.patch",
        // Missing `id` — required.
        payload: { field_values: { x: 1 } },
      });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(FDPMException);
      const fdpm = err as FDPMException;
      expect(fdpm.category).toBe("verification");
      expect(fdpm.message).toMatch(/payload schema violation/);
      // The Zod path for the missing required `id` should appear in the
      // summary (e.g. `id: Required` or `id: ...`).
      expect(fdpm.message).toMatch(/\bid\b/i);
    }
  });

  it("multiple issues are summarized and capped", () => {
    try {
      verifyOperationPayload({
        kind: "primitive.create",
        // Several missing/invalid fields.
        payload: { foo: 1 },
      });
      throw new Error("expected throw");
    } catch (err) {
      const fdpm = err as FDPMException;
      // At least two distinct issues should be summarised in the message
      // (separated by `;`) — exact count depends on schema strictness.
      expect(fdpm.message.split(";").length).toBeGreaterThanOrEqual(2);
    }
  });

  it("evidence.issues retains the full Zod issues array for tooling", () => {
    try {
      verifyOperationPayload({ kind: "primitive.patch", payload: {} });
      throw new Error("expected throw");
    } catch (err) {
      const fdpm = err as FDPMException;
      expect(fdpm.evidence).toBeDefined();
      expect(Array.isArray((fdpm.evidence as Record<string, unknown>)["issues"])).toBe(true);
    }
  });

  it("unknown operation kind has its own crisp message (not the schema summary)", () => {
    expect(() =>
      verifyOperationPayload({ kind: "primitive.fictional" as never, payload: {} }),
    ).toThrow(/unknown operation kind/);
  });
});
