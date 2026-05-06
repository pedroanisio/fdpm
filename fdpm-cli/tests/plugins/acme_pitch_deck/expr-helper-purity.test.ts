/**
 * testcase:expr-helper-purity for acme.pitch-deck.
 *
 * Every Zod-derived CEL helper must be referentially transparent.
 * Same args -> equal return value, no Date.now() / Math.random() / IO
 * reads. The bridge package's own expr-helper-purity test asserts the
 * property at the bridge level; this test asserts the plugin's
 * specific schemas produce helpers that satisfy it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { zodSchemaToExprHelper } from "@fdpm/zod-bridge";
import { Schemas } from "../../../plugins/acme_pitch_deck/schemas/pitch-deck.schema.v2.js";

describe("acme.pitch-deck — expr-helper purity", () => {
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

  const validAudience = {
    id: "cfo",
    label: "CFO",
    primaryQuestion: "What is the financial impact of this proposal?",
    evaluationCriteria: ["roi", "tco"],
    failureMode: "audience-uninterested-in-non-financial-framing",
  };

  it("isValidAudience returns the same value across two invocations on equal inputs", () => {
    const { fn: helper } = zodSchemaToExprHelper(Schemas.Audience, {
      function_name: "acme.isValidAudience",
      arity: 1,
      arg_types: ["object"],
      return_type: "boolean",
    });
    const a = helper(validAudience);
    const b = helper(validAudience);
    expect(a).toBe(b);
    expect(a).toBe(true);
  });

  it("isValidAudience returns false for a missing-required-field input", () => {
    const { fn: helper } = zodSchemaToExprHelper(Schemas.Audience, {
      function_name: "acme.isValidAudience",
      arity: 1,
      arg_types: ["object"],
      return_type: "boolean",
    });
    expect(helper({})).toBe(false);
  });

  it("does not call Date.now or Math.random during invocation", () => {
    const { fn: helper } = zodSchemaToExprHelper(Schemas.Audience, {
      function_name: "acme.isValidAudience",
      arity: 1,
      arg_types: ["object"],
      return_type: "boolean",
    });
    helper(validAudience);
    helper({});
    expect(dateSpy).not.toHaveBeenCalled();
    expect(randomSpy).not.toHaveBeenCalled();
  });

  it("emits the documented capability shape", () => {
    const { capability } = zodSchemaToExprHelper(Schemas.DataPoint, {
      function_name: "acme.isValidDataPoint",
      arity: 1,
      arg_types: ["object"],
      return_type: "boolean",
    });
    expect(capability.capability_id).toBe("cap:expr-helper");
    expect(capability.metadata?.function_name).toBe("acme.isValidDataPoint");
    expect(capability.metadata?.pure).toBe(true);
  });
});
