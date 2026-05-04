import { describe, it, expect } from "vitest";
import { OPERATION_KINDS } from "../src/core/operations/kinds.js";
import { PAYLOAD_SCHEMAS } from "../src/core/operations/payloads.js";

describe("operation kind/schema contract", () => {
  it("keeps PAYLOAD_SCHEMAS in one-to-one lockstep with OPERATION_KINDS", () => {
    expect(Object.keys(PAYLOAD_SCHEMAS).sort()).toEqual([...OPERATION_KINDS].sort());
  });
});
