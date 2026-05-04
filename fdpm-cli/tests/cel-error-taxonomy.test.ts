import { describe, it, expect } from "vitest";
import {
  CELValidationError,
  CELParseError,
  CELRuntimeError,
} from "../src/core/validation/cel/errors.js";
import { FDPMException } from "../src/core/errors/fdpm-exception.js";

/**
 * Issue-A regression tests.
 *
 * CEL errors must extend `FDPMException` so a CEL failure escaping the
 * local catch in the validation pipeline still surfaces through the
 * canonical error sink (bin handler → JSON envelope) instead of being
 * treated as an unknown internal error with a stack trace.
 *
 * What this file pins:
 *  1. `instanceof FDPMException` holds for every CEL error class.
 *  2. Subclass identity is preserved (the pipeline relies on
 *     `err instanceof CELParseError` to pick the §4.3 fallback path).
 *  3. Categories match the agreed taxonomy:
 *       parse   → verification (operator-fixable bad predicate input)
 *       runtime → internal     (predicate parsed but raised; host/rule bug)
 *  4. `rule_id` is exposed both as a typed field and via `evidence.rule_id`
 *     so JSON consumers can attribute the failure without parsing the
 *     message.
 *  5. `toEnvelope()` round-trips the category, message, and evidence.
 */

describe("CEL error taxonomy — issue A", () => {
  describe("instance hierarchy", () => {
    it("CELParseError is an FDPMException", () => {
      const err = new CELParseError("bad syntax", "rule:x");
      expect(err).toBeInstanceOf(FDPMException);
      expect(err).toBeInstanceOf(CELValidationError);
      expect(err).toBeInstanceOf(CELParseError);
      expect(err).toBeInstanceOf(Error);
    });

    it("CELRuntimeError is an FDPMException", () => {
      const err = new CELRuntimeError("runtime-error", "null deref", "rule:y");
      expect(err).toBeInstanceOf(FDPMException);
      expect(err).toBeInstanceOf(CELValidationError);
      expect(err).toBeInstanceOf(CELRuntimeError);
    });

    it("subclass identities remain disjoint (the pipeline depends on this)", () => {
      const parse = new CELParseError("p");
      const runtime = new CELRuntimeError("runtime-error", "r");
      expect(parse).not.toBeInstanceOf(CELRuntimeError);
      expect(runtime).not.toBeInstanceOf(CELParseError);
    });
  });

  describe("category mapping", () => {
    it("CELParseError → verification", () => {
      const err = new CELParseError("unexpected token");
      expect(err.category).toBe("verification");
    });

    it("CELRuntimeError → internal", () => {
      const err = new CELRuntimeError("unknown-name", "undefined variable foo");
      expect(err.category).toBe("internal");
    });
  });

  describe("closed runtime code set", () => {
    it("captures parse-error on CELParseError", () => {
      const err = new CELParseError("unexpected token", "rule:p");
      expect(err.expr_code).toBe("parse-error");
    });

    it("captures the structured runtime code on CELRuntimeError", () => {
      const err = new CELRuntimeError("permission-denied", "blocked", "rule:q");
      expect(err.expr_code).toBe("permission-denied");
    });
  });

  describe("rule_id propagation", () => {
    it("exposes rule_id as a typed field", () => {
      const err = new CELParseError("bad", "rule:abc");
      expect(err.rule_id).toBe("rule:abc");
    });

    it("mirrors rule_id into evidence so JSON consumers can read it", () => {
      const err = new CELRuntimeError("runtime-error", "oops", "rule:def");
      expect(err.evidence).toEqual({ rule_id: "rule:def", expr_code: "runtime-error" });
    });

    it("omits rule_id from evidence when not provided", () => {
      const err = new CELParseError("bad");
      expect(err.rule_id).toBeUndefined();
      // We allow either omitted-evidence or empty-evidence; assert no rule_id key.
      expect(err.evidence?.["rule_id"]).toBeUndefined();
    });
  });

  describe("envelope serialization", () => {
    it("toEnvelope() round-trips category, message, and evidence", () => {
      const err = new CELParseError("predicate failed type-check", "rule:z");
      const envelope = err.toEnvelope();
      expect(envelope).toEqual({
        category: "verification",
        message: "predicate failed type-check",
        evidence: { rule_id: "rule:z", expr_code: "parse-error" },
      });
    });

    it("runtime error envelope reports internal category", () => {
      const err = new CELRuntimeError("runtime-error", "graph helper raised", "rule:q");
      const envelope = err.toEnvelope();
      expect(envelope.category).toBe("internal");
      expect(envelope.message).toBe("graph helper raised");
      expect(envelope.evidence).toEqual({ rule_id: "rule:q", expr_code: "runtime-error" });
    });
  });

  describe("error name field (for log/console output)", () => {
    it("preserves the most-specific class name", () => {
      expect(new CELParseError("p").name).toBe("CELParseError");
      expect(new CELRuntimeError("runtime-error", "r").name).toBe("CELRuntimeError");
    });
  });
});
