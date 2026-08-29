import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  FDPM_ENV_VARS,
  FDPM_ENV_VAR_NAMES,
} from "../src/core/config/env.js";
import { DEFAULT_CATALOG_BUDGET } from "../src/mcp/catalog.js";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && full.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("FDPM env contract", () => {
  it("documents every env var consumed by the TypeScript runtime", () => {
    const discovered = new Set<string>();
    for (const file of walk(join(process.cwd(), "src"))) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/["'`](FDPM_[A-Z_]+)["'`]/g)) {
        discovered.add(match[1]!);
      }
    }
    expect([...discovered].sort()).toEqual([...FDPM_ENV_VAR_NAMES].sort());
  });

  it("keeps .env.example, README.md, and MANUAL.md in sync with the env contract", () => {
    const surfaces = [
      readFileSync(join(process.cwd(), ".env.example"), "utf8"),
      readFileSync(join(process.cwd(), "..", "README.md"), "utf8"),
      readFileSync(join(process.cwd(), "MANUAL.md"), "utf8"),
    ];
    for (const spec of FDPM_ENV_VARS) {
      for (const surface of surfaces) {
        expect(surface).toContain(spec.name);
      }
    }
  });
});

/**
 * The sync test above asserts each variable's NAME appears on every doc
 * surface. It cannot see a wrong value — which is how the registry came to
 * advertise a 28000-byte catalog budget while `DEFAULT_CATALOG_BUDGET` was
 * 26_000, propagating to README.md and MANUAL.md unchallenged until the
 * 2026-08-29 doc-hygiene pass.
 *
 * Documented defaults are only worth documenting if they are the real ones,
 * so where a registry entry mirrors a constant, assert the two agree.
 */
describe("FDPM env contract — documented defaults match the code", () => {
  it("FDPM_MCP_CATALOG_BUDGET_BYTES documents DEFAULT_CATALOG_BUDGET.total_bytes", () => {
    const spec = FDPM_ENV_VARS.find((v) => v.name === "FDPM_MCP_CATALOG_BUDGET_BYTES");
    expect(spec, "FDPM_MCP_CATALOG_BUDGET_BYTES is missing from the registry").toBeDefined();
    expect(spec!.defaultValue).toBe(String(DEFAULT_CATALOG_BUDGET.total_bytes));
  });
});
