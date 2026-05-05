import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { newHost } from "./fixtures.js";
import {
  FDPMException,
  EXIT_CODE_FOR_CATEGORY,
} from "../src/core/errors/fdpm-exception.js";
import { verifyMaxRequestBytes } from "../src/core/gate/verification-gate.js";

/**
 * Issue-G regression tests — numeric-cap throws carry structured evidence.
 *
 * The audit found that every `FDPMException("quota", ...)` site embedded
 * the observed and cap values in the message string, forcing JSON
 * consumers to regex-parse the message to react. Post-fix, every quota
 * throw attaches `evidence: { observed, cap, unit, env? }` so:
 *
 *   - Machine consumers extract structured fields from `error.evidence`
 *     directly via the JSON envelope.
 *   - Operators see the same numbers in the human message (unchanged).
 *   - The `env` field tells the operator which environment variable to
 *     bump if they want a higher cap — this is information that *was*
 *     already documented in fdpm.ts's --help, but never surfaced at the
 *     point of failure.
 *
 * Sites covered:
 *   - core/gate/verification-gate.ts :: verifyMaxRequestBytes
 *   - commands/util.ts :: readJSONInput (FDPM_MAX_REQUEST_BYTES)
 *   - core/host-extra.ts :: applyBatch (FDPM_MAX_BATCH_OPS)
 *   - core/host.ts :: fieldPatchPrimitive (FDPM_MAX_FIELD_PATCH_OPS)
 */

describe("Issue-G — `quota` throws expose evidence", () => {
  describe("verifyMaxRequestBytes (verification-gate.ts)", () => {
    it("throws FDPMException(quota) with {observed, cap, unit} when over the limit", () => {
      let caught: unknown;
      try {
        verifyMaxRequestBytes(1024, 100);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(FDPMException);
      const fdpm = caught as FDPMException;
      expect(fdpm.category).toBe("quota");
      expect(EXIT_CODE_FOR_CATEGORY[fdpm.category]).toBe(8);
      expect(fdpm.evidence).toEqual({ observed: 1024, cap: 100, unit: "bytes" });
      // Headline message still embeds the numbers so the human read is intact.
      expect(fdpm.message).toContain("1024");
      expect(fdpm.message).toContain("100");
    });

    it("does not throw when the size is within the cap", () => {
      expect(() => verifyMaxRequestBytes(50, 100)).not.toThrow();
      expect(() => verifyMaxRequestBytes(100, 100)).not.toThrow(); // boundary is inclusive
    });
  });

  describe("fieldPatchPrimitive over-cap (host.ts)", () => {
    let originalEnv: string | undefined;
    beforeEach(() => {
      originalEnv = process.env["FDPM_MAX_FIELD_PATCH_OPS"];
      process.env["FDPM_MAX_FIELD_PATCH_OPS"] = "2";
    });
    afterEach(() => {
      if (originalEnv === undefined) delete process.env["FDPM_MAX_FIELD_PATCH_OPS"];
      else process.env["FDPM_MAX_FIELD_PATCH_OPS"] = originalEnv;
    });

    it("evidence carries observed, cap, unit=ops, and env=FDPM_MAX_FIELD_PATCH_OPS", async () => {
      const host = await newHost();
      await host.createProject({ workbook_id: "p1", name: "P1", profile_id: "test:demo" });
      await host.createPrimitive("p1", {
        id: "section:a",
        type_id: "test:section",
        field_values: { title: "A", number: 1 },
      });
      const tooManyOps = [
        { op: "replace", path: "/title", value: "B" },
        { op: "replace", path: "/title", value: "C" },
        { op: "replace", path: "/title", value: "D" }, // 3 > cap 2
      ];

      let caught: unknown;
      try {
        await host.fieldPatchPrimitive("p1", {
          id: "section:a",
          operations: tooManyOps,
        });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(FDPMException);
      const fdpm = caught as FDPMException;
      expect(fdpm.category).toBe("quota");
      expect(fdpm.evidence).toEqual({
        observed: 3,
        cap: 2,
        unit: "ops",
        env: "FDPM_MAX_FIELD_PATCH_OPS",
      });
    });
  });

  describe("appendBatch over-cap (host-extra.ts)", () => {
    let originalEnv: string | undefined;
    beforeEach(() => {
      originalEnv = process.env["FDPM_MAX_BATCH_OPS"];
      process.env["FDPM_MAX_BATCH_OPS"] = "1";
    });
    afterEach(() => {
      if (originalEnv === undefined) delete process.env["FDPM_MAX_BATCH_OPS"];
      else process.env["FDPM_MAX_BATCH_OPS"] = originalEnv;
    });

    it("evidence carries observed, cap, unit=ops, and env=FDPM_MAX_BATCH_OPS", async () => {
      // Drive the cap directly via the entry point used by the CLI:
      // batchEdit in host-extra.
      const { batchEdit } = await import("../src/core/host-extra.js");
      const host = await newHost();
      await host.createProject({ workbook_id: "p1", name: "P1", profile_id: "test:demo" });

      // Two operations against a cap of 1.
      const ops = [
        {
          kind: "primitive.create" as const,
          payload: {
            id: "section:a",
            type_id: "test:section",
            field_values: { title: "A", number: 1 },
          },
        },
        {
          kind: "primitive.create" as const,
          payload: {
            id: "section:b",
            type_id: "test:section",
            field_values: { title: "B", number: 2 },
          },
        },
      ];

      let caught: unknown;
      try {
        await batchEdit(host, "p1", ops);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(FDPMException);
      const fdpm = caught as FDPMException;
      expect(fdpm.category).toBe("quota");
      expect(fdpm.evidence).toEqual({
        observed: 2,
        cap: 1,
        unit: "ops",
        env: "FDPM_MAX_BATCH_OPS",
      });
    });
  });
});

describe("Issue-G corpus invariant — every `quota` throw carries evidence", () => {
  // Walk src/ for every FDPMException("quota", ...) call and assert the
  // call has a third argument (i.e. extras with evidence). This catches
  // future drift: any new quota throw without evidence fails this test.
  const HERE = dirname(fileURLToPath(import.meta.url));
  const ROOT = join(HERE, "..");

  async function* walk(dir: string): AsyncGenerator<string> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.name === "node_modules" || e.name === "dist" || e.name === "tests") continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) yield* walk(full);
      else if (e.name.endsWith(".ts")) yield full;
    }
  }

  it("no `FDPMException(\"quota\", ...)` site in src/ omits its third arg", async () => {
    // Match `new FDPMException("quota", <message>` and capture everything
    // up to the closing ')' on that statement to inspect whether a third
    // argument was supplied. Multi-line statements are common, so we read
    // the file as a whole and scan for the opening signature, then walk
    // forward to balance parentheses.
    const offenders: string[] = [];
    for await (const path of walk(join(ROOT, "src"))) {
      const text = await fs.readFile(path, "utf8");
      const re = /new FDPMException\(\s*"quota"\s*,/g;
      let match: RegExpExecArray | null;
      while ((match = re.exec(text)) !== null) {
        // Walk forward from match.index to find the matching ')'.
        let depth = 0;
        let i = match.index + match[0].length;
        let body = "";
        for (; i < text.length; i++) {
          const c = text[i];
          if (c === "(") depth++;
          else if (c === ")") {
            if (depth === 0) break;
            depth--;
          }
          body += c;
        }
        // body now holds what's between `("quota",` and the matching `)`.
        // A site with evidence has a third top-level argument, which means
        // there must be a comma at top-level (depth 0 within body) AFTER
        // the message argument. Count top-level commas.
        let topCommas = 0;
        let bDepth = 0;
        let inBacktick = false;
        let inSingle = false;
        let inDouble = false;
        for (let j = 0; j < body.length; j++) {
          const c = body[j];
          const prev = j > 0 ? body[j - 1] : "";
          if (!inSingle && !inDouble && c === "`" && prev !== "\\") inBacktick = !inBacktick;
          else if (!inBacktick && !inDouble && c === "'" && prev !== "\\") inSingle = !inSingle;
          else if (!inBacktick && !inSingle && c === '"' && prev !== "\\") inDouble = !inDouble;
          if (inBacktick || inSingle || inDouble) continue;
          if (c === "(" || c === "{" || c === "[") bDepth++;
          else if (c === ")" || c === "}" || c === "]") bDepth--;
          else if (c === "," && bDepth === 0) topCommas++;
        }
        if (topCommas < 1) {
          // Top-level commas in `body` count separators AFTER the
          // message. <1 means no third argument → no evidence.
          const lineNo = text.slice(0, match.index).split("\n").length;
          offenders.push(`${path}:${lineNo}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
