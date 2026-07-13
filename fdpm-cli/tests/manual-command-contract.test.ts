import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MANUAL = readFileSync(resolve(process.cwd(), "MANUAL.md"), "utf8");

describe("MANUAL command coverage", () => {
  it("documents the live P2 command surface that is easy to drift silently", () => {
    const requiredPhrases = [
      "fdpm render",
      "fdpm validate",
      "fdpm diff",
      "fdpm migrate normalize-metadata",
      "fdpm plugin list",
      "fdpm transfer import-as",
      "fdpm log undo",
    ];
    for (const phrase of requiredPhrases) {
      expect(MANUAL).toContain(phrase);
    }
  });

  it("keeps the table of contents aligned with the added render/validate/diff sections", () => {
    expect(MANUAL).toContain("[Rendering workbook output](#16-rendering-workbook-output)");
    expect(MANUAL).toContain("[Workbook-wide validation](#17-workbook-wide-validation)");
    expect(MANUAL).toContain("[Diffing and migration](#18-diffing-and-migration)");
    expect(MANUAL).toContain("## 16. Rendering workbook output");
    expect(MANUAL).toContain("## 17. Workbook-wide validation");
    expect(MANUAL).toContain("## 18. Diffing and migration");
  });

  it("links back to the repository README from the nested CLI package", () => {
    expect(MANUAL).toContain("[`README.md`](../README.md)");
    expect(MANUAL).not.toContain("[`README.md`](README.md)");
  });
});
