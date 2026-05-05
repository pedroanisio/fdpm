/**
 * SPEC-MCP-SERVER §6 Compliance — source-import CI gate.
 *
 * Tool-handler modules under `src/mcp/tools/` MUST NOT import or
 * reference any of the patterns below. The list mirrors the SPEC's
 * §6.1 compliance bullet:
 *
 *   - `host.persistence` / `host.store` — bypass the Host's tier
 *     gate; writes must go through Host.* methods.
 *   - `node:child_process` / `node:vm` — shell / sandboxed execution
 *     are forbidden surfaces.
 *   - `eval(`, `new Function(`, `Function(` — same reason.
 *
 * The check is a string-includes scan because (a) the source files
 * are small and tree-stable, and (b) a regex-aware AST parse adds
 * dependency surface for no benefit. False positives are unlikely
 * for the patterns chosen.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOLS_DIR = join(HERE, "..", "src", "mcp", "tools");

const FORBIDDEN: ReadonlyArray<string> = [
  "host.persistence",
  "host.store",
  'from "node:child_process"',
  "from 'node:child_process'",
  'from "node:vm"',
  "from 'node:vm'",
  "eval(",
  "new Function(",
  "Function(",
];

describe("MCP tool source-import gate", () => {
  it("no tool module imports a forbidden surface", () => {
    const files = readdirSync(TOOLS_DIR).filter((f) => f.endsWith(".ts"));
    expect(files.length, "src/mcp/tools/ should contain at least one tool module").toBeGreaterThan(0);

    const offenses: Array<{ file: string; pattern: string }> = [];
    for (const file of files) {
      const path = join(TOOLS_DIR, file);
      const text = readFileSync(path, "utf8");
      for (const pattern of FORBIDDEN) {
        // `Function(` is a sub-pattern of `new Function(`. To avoid
        // double-reporting we only flag bare `Function(` when it is
        // not part of `new Function(`. Cheap check: count occurrences.
        if (pattern === "Function(") {
          const total = (text.match(/Function\(/g) ?? []).length;
          const fromNew = (text.match(/new Function\(/g) ?? []).length;
          if (total - fromNew > 0) offenses.push({ file, pattern });
          continue;
        }
        if (text.includes(pattern)) offenses.push({ file, pattern });
      }
    }

    expect(
      offenses,
      offenses.length === 0
        ? "ok"
        : `forbidden patterns found:\n${offenses
            .map((o) => `  ${o.file}: ${o.pattern}`)
            .join("\n")}`,
    ).toEqual([]);
  });
});
