import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  renderHumanError,
  renderFindings,
  renderEvidence,
  renderFindingLine,
  isVerbose,
} from "../src/core/diagnostics/error-render.js";
import { FDPMException } from "../src/core/errors/fdpm-exception.js";
import type { ValidationFinding } from "../src/core/models/instance.js";

/**
 * Issue-H regression tests.
 *
 * Pre-fix, the bin handler emitted `JSON.stringify(findings, null, 2)`
 * and `JSON.stringify(evidence, null, 2)` directly to a human terminal.
 * For a 200-finding `validate` failure or a 50-issue Zod evidence
 * array, the result was an unscrollable wall of JSON.
 *
 * Post-fix, the renderer:
 *   - Produces a one-line headline plus a compact summary by default.
 *   - Caps the visible findings at 5 and tells the operator how many
 *     are hidden + how to expand them.
 *   - Renders evidence keys inline; previews long arrays as `N items
 *     — first K: [...]`.
 *   - Restores the legacy verbatim JSON dump under `--verbose` or
 *     `FDPM_VERBOSE=1`, so no information is lost.
 *
 * `--json` mode is unaffected (different code path in bin/fdpm.ts).
 */

function makeFinding(overrides: Partial<ValidationFinding> = {}): ValidationFinding {
  return {
    level: "error",
    rule_id: "core:test",
    target_id: "section:a",
    field_path: null,
    message: "boom",
    ...overrides,
  };
}

describe("Issue-H — renderFindingLine produces a one-line, greppable summary", () => {
  it("includes level (padded), rule_id, target_id, and message", () => {
    const line = renderFindingLine(
      makeFinding({ level: "warning", rule_id: "core:title", target_id: "section:b" }),
    );
    expect(line).toBe("warning core:title @ section:b: boom");
  });

  it("includes [field_path] when present", () => {
    const line = renderFindingLine(
      makeFinding({ field_path: "field_values.title", message: "too long" }),
    );
    expect(line).toBe(
      "error   core:test @ section:a[field_values.title]: too long",
    );
  });

  it("renders one line — no embedded newlines", () => {
    const line = renderFindingLine(makeFinding({ message: "multi\nline\nmessage" }));
    // The renderer doesn't strip newlines from messages (those are the
    // operator's content) — but the *layout* is one line, so any
    // embedded newlines come from the input. Document the contract.
    const layoutBeforeMessage = line.split(": ")[0]!;
    expect(layoutBeforeMessage).not.toContain("\n");
  });
});

describe("Issue-H — renderFindings caps human output at 5 with a tail hint", () => {
  it("returns empty string when there are no findings", () => {
    expect(renderFindings([], { verbose: false })).toBe("");
    expect(renderFindings([], { verbose: true })).toBe("");
  });

  it("renders all findings when there are 5 or fewer (no tail)", () => {
    const fs = Array.from({ length: 5 }, (_, i) =>
      makeFinding({ rule_id: `r:${i}` }),
    );
    const out = renderFindings(fs, { verbose: false });
    expect(out.startsWith("findings:\n")).toBe(true);
    for (let i = 0; i < 5; i++) expect(out).toContain(`r:${i}`);
    expect(out).not.toMatch(/\+\d+ more/);
  });

  it("truncates to 5 when there are more, with `(+K more — re-run with --verbose to see all)`", () => {
    const fs = Array.from({ length: 12 }, (_, i) =>
      makeFinding({ rule_id: `r:${i}` }),
    );
    const out = renderFindings(fs, { verbose: false });
    // First 5 visible, last 7 hidden behind the tail hint.
    for (let i = 0; i < 5; i++) expect(out).toContain(`r:${i}`);
    for (let i = 5; i < 12; i++) expect(out).not.toContain(`r:${i}`);
    expect(out).toContain("(+7 more — re-run with --verbose to see all)");
  });

  it("verbose mode falls back to the legacy pretty-printed JSON dump", () => {
    const fs = Array.from({ length: 10 }, (_, i) =>
      makeFinding({ rule_id: `r:${i}` }),
    );
    const out = renderFindings(fs, { verbose: true });
    expect(out.startsWith("findings: ")).toBe(true);
    // Verbose dump must include every rule_id in full.
    for (let i = 0; i < 10; i++) expect(out).toContain(`r:${i}`);
    // And it preserves the legacy pretty-printed shape (multi-line JSON).
    expect(out).toContain("[\n");
  });
});

describe("Issue-H — renderEvidence summarizes long arrays + nested objects", () => {
  it("returns empty string for null / empty evidence", () => {
    expect(renderEvidence(undefined, { verbose: false })).toBe("");
    expect(renderEvidence({}, { verbose: false })).toBe("");
  });

  it("renders primitive values inline as `key: <json>`", () => {
    const out = renderEvidence(
      { observed: 1024, cap: 100, unit: "bytes", env: "FDPM_X" },
      { verbose: false },
    );
    expect(out).toContain("observed: 1024");
    expect(out).toContain("cap: 100");
    expect(out).toContain('unit: "bytes"');
    expect(out).toContain('env: "FDPM_X"');
  });

  it("inlines short arrays (≤3 items)", () => {
    const out = renderEvidence(
      { issues: [{ path: "a" }, { path: "b" }] },
      { verbose: false },
    );
    expect(out).toContain('issues: [{"path":"a"},{"path":"b"}]');
  });

  it("summarizes long arrays as `N items — first 3: [...]`", () => {
    const issues = Array.from({ length: 23 }, (_, i) => ({ idx: i }));
    const out = renderEvidence({ issues }, { verbose: false });
    expect(out).toContain("issues: 23 items — first 3:");
    expect(out).toContain('[{"idx":0},{"idx":1},{"idx":2}]');
    // Items 3..22 must NOT leak into the compact view.
    expect(out).not.toContain('"idx":15');
  });

  it("verbose mode falls back to the legacy pretty-printed JSON dump", () => {
    const issues = Array.from({ length: 23 }, (_, i) => ({ idx: i }));
    const out = renderEvidence({ issues }, { verbose: true });
    expect(out.startsWith("evidence: ")).toBe(true);
    // All 23 items present in verbose mode.
    expect(out).toContain('"idx": 22');
  });

  it("indents multi-line nested objects under their key", () => {
    const out = renderEvidence(
      {
        node: {
          this: "is",
          a: "very",
          long: "object",
          with: "many",
          keys: "that",
          push: "the",
          inline: "renderer",
          past: "80",
          chars: "_____________",
        },
      },
      { verbose: false },
    );
    // Header line for the key.
    expect(out).toMatch(/^evidence:\n {2}node:\n/);
    // Subsequent lines must be indented (4 spaces under the key prefix).
    const lines = out.split("\n");
    const after = lines.slice(2);
    for (const l of after) {
      if (l.length > 0) expect(l.startsWith("    ")).toBe(true);
    }
  });
});

describe("Issue-H — renderHumanError composes headline + sections", () => {
  it("produces exactly the headline when there are no findings or evidence", () => {
    const err = new FDPMException("not_found", "primitive not found: section:a");
    const out = renderHumanError(err, { verbose: false });
    expect(out).toBe("error: [not_found] primitive not found: section:a");
  });

  it("appends findings then evidence in that order", () => {
    const err = new FDPMException("validation", "validation failed for section:a", {
      findings: [makeFinding()],
      evidence: { workbook_id: "p1" },
    });
    const out = renderHumanError(err, { verbose: false });
    const lines = out.split("\n");
    expect(lines[0]).toBe("error: [validation] validation failed for section:a");
    const findingsIdx = lines.findIndex((l) => l.startsWith("findings:"));
    const evidenceIdx = lines.findIndex((l) => l.startsWith("evidence:"));
    expect(findingsIdx).toBeGreaterThan(0);
    expect(evidenceIdx).toBeGreaterThan(findingsIdx);
  });

  it("does NOT embed a trailing newline (caller adds one)", () => {
    const err = new FDPMException("internal", "boom");
    const out = renderHumanError(err, { verbose: false });
    expect(out.endsWith("\n")).toBe(false);
  });

  it("verbose mode preserves all findings and full evidence — no information lost", () => {
    const findings = Array.from({ length: 30 }, (_, i) =>
      makeFinding({ rule_id: `r:${i}` }),
    );
    const issues = Array.from({ length: 12 }, (_, i) => ({ idx: i }));
    const err = new FDPMException("verification", "schema violation", {
      findings,
      evidence: { issues },
    });
    const out = renderHumanError(err, { verbose: true });
    // Every finding and every issue must appear in verbose mode.
    for (let i = 0; i < 30; i++) expect(out).toContain(`r:${i}`);
    for (let i = 0; i < 12; i++) expect(out).toContain(`"idx": ${i}`);
  });

  it("non-verbose mode bounds the output (regression test for terminal-flooding)", () => {
    // 200 findings and a 50-issue Zod array would have produced ~3000+
    // lines pre-fix. The summary must be small.
    const findings = Array.from({ length: 200 }, (_, i) =>
      makeFinding({ rule_id: `r:${i}` }),
    );
    const issues = Array.from({ length: 50 }, (_, i) => ({ idx: i }));
    const err = new FDPMException("verification", "schema violation", {
      findings,
      evidence: { issues },
    });
    const out = renderHumanError(err, { verbose: false });
    const lines = out.split("\n");
    // Headline + "findings:" + 5 finding lines + "(+K more...)" tail
    // + "evidence:" + 1 evidence-line. Bound generously at 20 lines.
    expect(lines.length).toBeLessThan(20);
    // Operator gets the count and the discovery hint.
    expect(out).toContain("+195 more");
    expect(out).toContain("--verbose");
  });
});

describe("Issue-H — isVerbose() detection", () => {
  // process.env mutation — restore in afterEach.
  let originalEnv: string | undefined;
  beforeEach(() => {
    originalEnv = process.env["FDPM_VERBOSE"];
    delete process.env["FDPM_VERBOSE"];
  });
  afterEach(() => {
    if (originalEnv === undefined) delete process.env["FDPM_VERBOSE"];
    else process.env["FDPM_VERBOSE"] = originalEnv;
  });

  it("returns true when --verbose is in argv", () => {
    expect(isVerbose(["node", "fdpm", "validate", "--verbose"])).toBe(true);
  });

  it("returns true when FDPM_VERBOSE is truthy", () => {
    process.env["FDPM_VERBOSE"] = "1";
    expect(isVerbose(["node", "fdpm", "validate"])).toBe(true);
  });

  it("returns false when neither is set", () => {
    expect(isVerbose(["node", "fdpm", "validate"])).toBe(false);
  });

  it("treats explicit falsy env values as not-verbose", () => {
    for (const v of ["", "0", "false"]) {
      process.env["FDPM_VERBOSE"] = v;
      expect(isVerbose(["node", "fdpm", "validate"])).toBe(false);
    }
  });
});
