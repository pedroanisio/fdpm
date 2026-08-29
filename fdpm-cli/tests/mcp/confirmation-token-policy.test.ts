/**
 * SPEC-MCP-SERVER §9.3: "Tier 2/3 tools may additionally be gated by
 * `FDPM_MCP_REQUIRE_CONFIRMATION_TOKEN=1` — opt-in defense for high-trust
 * deployments." §9.5's threat model names confirmation-token mode as one of
 * four controls bounding the blast radius of indirect prompt injection.
 *
 * The dispatcher has always honoured `ctx.requireConfirmationToken` /
 * `ctx.confirmationToken` (`src/mcp/dispatch.ts`). The bin entry point never
 * read the environment, so the control could not be switched on by any
 * operator — only by an embedder constructing a context by hand. A doc-hygiene
 * audit (2026-08-29) found the variable documented in a TSDoc comment, absent
 * from `FDPM_ENV_VARS`, absent from `.env.example`, and read by nothing.
 *
 * These tests pin the resolver: the gate turns on only for the exact value
 * "1", a token is mandatory whenever the gate is on (enabling it without one
 * would refuse every Tier 2/3 call and lock the operator out of their own
 * workbook), and a malformed configuration is a startup refusal rather than a
 * silent downgrade to "unprotected".
 */
import { describe, expect, it } from "vitest";

import { resolveConfirmationTokenPolicy } from "../../src/mcp/confirmation-token.js";

describe("resolveConfirmationTokenPolicy — SPEC-MCP-SERVER §9.3", () => {
  it("is off when the variable is absent (v0.1 default behaviour preserved)", () => {
    expect(resolveConfirmationTokenPolicy({})).toEqual({ requireConfirmationToken: false });
  });

  it("is off for '0' and for any value that is not exactly '1'", () => {
    for (const raw of ["0", "", "true", "yes", "2", " 1"]) {
      expect(
        resolveConfirmationTokenPolicy({ FDPM_MCP_REQUIRE_CONFIRMATION_TOKEN: raw }),
        `value ${JSON.stringify(raw)} must not enable the gate`,
      ).toEqual({ requireConfirmationToken: false });
    }
  });

  it("turns on and carries the token when both variables are set", () => {
    expect(
      resolveConfirmationTokenPolicy({
        FDPM_MCP_REQUIRE_CONFIRMATION_TOKEN: "1",
        FDPM_MCP_CONFIRMATION_TOKEN: "s3cret",
      }),
    ).toEqual({ requireConfirmationToken: true, confirmationToken: "s3cret" });
  });

  it("refuses to enable the gate without a token instead of locking the operator out", () => {
    // Enabling the gate with confirmationToken undefined makes dispatch.ts
    // compare every supplied token against `undefined` and refuse — every
    // Tier 2/3 call fails with `confirmation_required` and no token can ever
    // satisfy it. A typed startup error is the only safe outcome.
    expect(() =>
      resolveConfirmationTokenPolicy({ FDPM_MCP_REQUIRE_CONFIRMATION_TOKEN: "1" }),
    ).toThrow(/FDPM_MCP_CONFIRMATION_TOKEN/);
  });

  it("refuses an empty or whitespace-only token", () => {
    for (const raw of ["", "   "]) {
      expect(() =>
        resolveConfirmationTokenPolicy({
          FDPM_MCP_REQUIRE_CONFIRMATION_TOKEN: "1",
          FDPM_MCP_CONFIRMATION_TOKEN: raw,
        }),
      ).toThrow(/FDPM_MCP_CONFIRMATION_TOKEN/);
    }
  });

  it("ignores a token supplied without the gate, rather than half-enabling", () => {
    expect(
      resolveConfirmationTokenPolicy({ FDPM_MCP_CONFIRMATION_TOKEN: "s3cret" }),
    ).toEqual({ requireConfirmationToken: false });
  });
});
