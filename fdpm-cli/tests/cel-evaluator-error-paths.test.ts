import { describe, it, expect } from "vitest";
import { evaluateCEL } from "../src/core/validation/cel/evaluator.js";
import {
  CELParseError,
  CELRuntimeError,
} from "../src/core/validation/cel/errors.js";
import { FDPMException } from "../src/core/errors/fdpm-exception.js";
import type { PrimitiveInstance } from "../src/core/models/instance.js";
import type { PrimitiveTypeDef, DomainProfile } from "../src/core/models/meta.js";

/**
 * Issue-A integration tests.
 *
 * Exercise `evaluateCEL` end-to-end and assert that the errors it
 * actually throws satisfy the new FDPMException contract — both the
 * `instanceof` chain (so the bin handler's typed branch fires) and the
 * envelope shape (so JSON consumers can attribute the failure).
 *
 * These tests pin the wiring between the evaluator and the CEL error
 * classes, complementing the pure-class assertions in
 * `cel-error-taxonomy.test.ts`.
 */

const TYPE: PrimitiveTypeDef = {
  id: "test:section",
  fields: [{ name: "title", kind: "string", required: false, validations: [] }],
  id_format: { pattern: "^.*$", uniqueness: "project" },
  inline_structs: [],
  is_partition_unit: false,
};

const PROFILE: DomainProfile = {
  id: "test:cel",
  version: "1.0.0",
  label: "CEL Eval Test",
  extends: [],
  categories: [],
  scopes: [],
  primitive_types: [TYPE],
  relation_types: [],
  validation_rules: [],
  renderer_bindings: [],
  inline_structs: [],
};

const INSTANCE: PrimitiveInstance = {
  id: "section:a",
  type_id: "test:section",
  field_values: { title: "hello" },
  revision: 0,
};

describe("evaluateCEL — error paths reach FDPMException", () => {
  it("returns true for a satisfied predicate", () => {
    const ok = evaluateCEL(
      'instance.field_values.title == "hello"',
      INSTANCE,
      TYPE,
      PROFILE,
      [],
      "rule:happy",
    );
    expect(ok).toBe(true);
  });

  it("returns false for an unsatisfied predicate (no throw)", () => {
    const ok = evaluateCEL(
      'instance.field_values.title == "other"',
      INSTANCE,
      TYPE,
      PROFILE,
      [],
      "rule:miss",
    );
    expect(ok).toBe(false);
  });

  it("throws CELParseError (= FDPMException, verification) on malformed syntax", () => {
    let caught: unknown;
    try {
      evaluateCEL("this is not (valid CEL", INSTANCE, TYPE, PROFILE, [], "rule:bad-syntax");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CELParseError);
    expect(caught).toBeInstanceOf(FDPMException);
    const fdpm = caught as FDPMException & { rule_id?: string };
    expect(fdpm.category).toBe("verification");
    expect(fdpm.rule_id).toBe("rule:bad-syntax");
    expect(fdpm.evidence).toMatchObject({ rule_id: "rule:bad-syntax" });
  });

  it("envelopes the parse error with category=verification and rule_id evidence", () => {
    let caught: unknown;
    try {
      evaluateCEL("(((", INSTANCE, TYPE, PROFILE, [], "rule:envelope");
    } catch (err) {
      caught = err;
    }
    const fdpm = caught as FDPMException;
    const env = fdpm.toEnvelope();
    expect(env.category).toBe("verification");
    expect(typeof env.message).toBe("string");
    expect(env.message.length).toBeGreaterThan(0);
    expect(env.evidence).toMatchObject({ rule_id: "rule:envelope" });
  });

  it("does not double-wrap: a CELParseError thrown internally is rethrown as-is", () => {
    // The evaluator's catch block has `if (err instanceof CELParseError) throw err;`
    // — verify a re-thrown parse error keeps its rule_id rather than gaining
    // a second wrapper layer.
    let caught: unknown;
    try {
      evaluateCEL("@@@@", INSTANCE, TYPE, PROFILE, [], "rule:no-double-wrap");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CELParseError);
    expect((caught as CELParseError).rule_id).toBe("rule:no-double-wrap");
    // Cause chain should not nest a CELParseError inside another CELParseError.
    expect((caught as Error & { cause?: unknown }).cause).not.toBeInstanceOf(
      CELParseError,
    );
  });

  it("CELRuntimeError class envelope reports category=internal", () => {
    // The current cel-js runtime tends to coerce missing fields rather than
    // raise, so we assert the *contract* on a directly-constructed runtime
    // error. The pure-class test file pins the constructor; this test pins
    // the contract that any runtime error escaping the evaluator would
    // satisfy if/when one is raised.
    const err = new CELRuntimeError("runtime-error", "simulated runtime failure", "rule:rt");
    expect(err).toBeInstanceOf(FDPMException);
    expect(err.category).toBe("internal");
    expect(err.toEnvelope()).toEqual({
      category: "internal",
      message: "simulated runtime failure",
      evidence: { rule_id: "rule:rt", expr_code: "runtime-error" },
    });
  });

  it("a generic catch(FDPMException) at the bin boundary handles CEL errors", () => {
    // This is the actual property issue A is about: if a CEL error escapes
    // the local pipeline catch, the bin handler's `instanceof FDPMException`
    // branch (bin/fdpm.ts) must fire — not the generic internal fallback.
    let caught: unknown;
    try {
      evaluateCEL("not.a.valid.expr(", INSTANCE, TYPE, PROFILE, [], "rule:bin-boundary");
    } catch (err) {
      caught = err;
    }
    // Simulate the bin handler's type discrimination.
    if (caught instanceof FDPMException) {
      const env = caught.toEnvelope();
      expect(env.category).toBe("verification");
      expect(env.evidence?.["rule_id"]).toBe("rule:bin-boundary");
    } else {
      // Pre-fix behaviour would land here (plain Error → generic 'internal').
      expect.fail(
        "CEL error did not satisfy `instanceof FDPMException` — issue A regression",
      );
    }
  });

  it("classifies unknown names as CELRuntimeError with expr_code=unknown-name", () => {
    let caught: unknown;
    try {
      evaluateCEL("missing == 1", INSTANCE, TYPE, PROFILE, [], "rule:unknown-name");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CELRuntimeError);
    expect((caught as CELRuntimeError).expr_code).toBe("unknown-name");
  });

  it("classifies unknown helpers as CELRuntimeError with expr_code=unknown-helper", () => {
    let caught: unknown;
    try {
      evaluateCEL('fn.missing.helper("x") == "x"', INSTANCE, TYPE, PROFILE, [], "rule:unknown-helper");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CELRuntimeError);
    expect((caught as CELRuntimeError).expr_code).toBe("unknown-helper");
  });

  it("classifies helper arity mismatches as CELRuntimeError with expr_code=arity-error", () => {
    let caught: unknown;
    try {
      evaluateCEL('fn.upper("x", "y") == "X"', INSTANCE, TYPE, PROFILE, [], "rule:arity");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CELRuntimeError);
    expect((caught as CELRuntimeError).expr_code).toBe("arity-error");
  });

  it("enforces the list-iteration cap with expr_code=bound-exceeded", () => {
    const huge = Array.from({ length: 1001 }, (_, index) => ({
      id: `section:${index}`,
      type_id: "test:section",
      fields: { title: `${index}` },
      revision: 0,
    }));
    let caught: unknown;
    try {
      evaluateCEL(
        'fn.sortBy(project.primitives, item, item.fields.title).size() > 0',
        INSTANCE,
        TYPE,
        PROFILE,
        [],
        "rule:bound",
        {
          project: {
            project: {
              id: "p",
              name: "P",
              profile_id: "test:cel",
              created_at: new Date().toISOString(),
              revision: 0,
            },
            primitives: Object.fromEntries(
              huge.map((entry) => [
                entry.id,
                {
                  id: entry.id,
                  type_id: entry.type_id,
                  field_values: entry.fields,
                  revision: 0,
                },
              ]),
            ),
            relations: {},
            templates: {},
            test_suites: {},
            scope_membership: {},
          },
          projectFingerprint: "fp:bound",
        } as any,
      );
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CELRuntimeError);
    expect((caught as CELRuntimeError).expr_code).toBe("bound-exceeded");
  });
});
