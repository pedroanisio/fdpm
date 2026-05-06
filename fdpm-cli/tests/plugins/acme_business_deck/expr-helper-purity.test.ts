/**
 * testcase:expr-helper-purity for acme.business-deck.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { zodSchemaToExprHelper } from "@fdpm/zod-bridge";
import {
  ClaimSchema,
  EvidenceSchema,
} from "../../../plugins/acme_business_deck/schemas/business-deck.js";

describe("acme.business-deck — expr-helper purity", () => {
  let dateSpy: ReturnType<typeof vi.spyOn>;
  let randomSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dateSpy = vi.spyOn(Date, "now");
    randomSpy = vi.spyOn(Math, "random");
  });
  afterEach(() => {
    dateSpy.mockRestore();
    randomSpy.mockRestore();
  });

  const validClaim = {
    id: "c1",
    kind: "core",
    text: "We win when audit-grade evidence is required.",
  };

  it("isValidClaim returns the same value across two invocations on equal inputs", () => {
    const { fn: helper } = zodSchemaToExprHelper(ClaimSchema, {
      function_name: "acme.isValidClaim",
      arity: 1,
      arg_types: ["object"],
      return_type: "boolean",
    });
    const a = helper(validClaim);
    const b = helper(validClaim);
    expect(a).toBe(b);
    expect(a).toBe(true);
  });

  it("isValidClaim returns false for missing-required-field input", () => {
    const { fn: helper } = zodSchemaToExprHelper(ClaimSchema, {
      function_name: "acme.isValidClaim",
      arity: 1,
      arg_types: ["object"],
      return_type: "boolean",
    });
    expect(helper({})).toBe(false);
  });

  it("does not call Date.now or Math.random during invocation", () => {
    const { fn: helper } = zodSchemaToExprHelper(ClaimSchema, {
      function_name: "acme.isValidClaim",
      arity: 1,
      arg_types: ["object"],
      return_type: "boolean",
    });
    helper(validClaim);
    helper({});
    expect(dateSpy).not.toHaveBeenCalled();
    expect(randomSpy).not.toHaveBeenCalled();
  });

  it("emits the documented capability shape", () => {
    const { capability } = zodSchemaToExprHelper(EvidenceSchema, {
      function_name: "acme.isValidEvidence",
      arity: 1,
      arg_types: ["object"],
      return_type: "boolean",
    });
    expect(capability.capability_id).toBe("cap:expr-helper");
    expect(capability.metadata?.function_name).toBe("acme.isValidEvidence");
    expect(capability.metadata?.pure).toBe(true);
  });
});
