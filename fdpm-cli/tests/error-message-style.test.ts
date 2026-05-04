import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { newHost } from "./fixtures.js";
import { FDPMException } from "../src/core/errors/fdpm-exception.js";

/**
 * Issue-F regression tests — error-message style invariants.
 *
 * The original audit found four `not_found` throws in `replay.ts` using
 * the inverted form `<thing> <id> not found` while the rest of the
 * codebase uses the canonical form `<thing> not found: <id>`. Today the
 * inverted form is gone — this file pins the invariant so future drift
 * is caught at test time instead of at audit time.
 *
 * Strategy: scan the actual source corpus (`src/`, `plugins/`) for every
 * `FDPMException("not_found", ...)` call site and check that none of
 * them match the inverted shape. This is a structural invariant — it
 * catches new violations regardless of where they appear.
 *
 * It also includes a small set of integration tests that DRIVE the
 * canonical not-found path (via `replay.ts` reorder/reparent) and
 * assert the message + evidence shape.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

async function* walkSourceFiles(dir: string): AsyncGenerator<string> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === "dist" || e.name === "tests") continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      yield* walkSourceFiles(full);
    } else if (e.name.endsWith(".ts")) {
      yield full;
    }
  }
}

async function readSourceCorpus(): Promise<{ path: string; text: string }[]> {
  const files: { path: string; text: string }[] = [];
  for await (const path of walkSourceFiles(join(ROOT, "src"))) {
    files.push({ path, text: await fs.readFile(path, "utf8") });
  }
  for await (const path of walkSourceFiles(join(ROOT, "plugins"))) {
    files.push({ path, text: await fs.readFile(path, "utf8") });
  }
  return files;
}

describe("Issue-F — `not_found` message corpus is on canonical form", () => {
  it("no source file uses the inverted `<thing> ${id} not found` shape", async () => {
    // Canonical:    `primitive not found: ${id}`
    // Inverted:     `primitive ${id} not found`
    //
    // The regex matches a backtick-template-literal that starts with a
    // bare word, then `${...}`, then literal ` not found`. That is
    // exactly the form we want to forbid for `not_found` throws.
    //
    // We do NOT match the canonical form (which has `:` between the
    // word and `${...}`), and we explicitly skip this test file so its
    // own example strings don't trip the check.
    const inverted = /`[a-z]+\s+\$\{[^}]+\}\s+not\s+found`/i;
    const offenders: string[] = [];
    const files = await readSourceCorpus();
    for (const { path, text } of files) {
      if (path.includes("error-message-style")) continue;
      const lines = text.split("\n");
      lines.forEach((line, idx) => {
        if (inverted.test(line)) {
          offenders.push(`${path}:${idx + 1}: ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it("every `not_found` throw using the simple <thing>+<id> shape uses the canonical colon-suffix form", async () => {
    // Inspect the source corpus for `FDPMException("not_found", ...)` and,
    // for the simple shape (a single `${id}` interpolation), assert the
    // canonical form `<words>: ${id}`.
    //
    // We deliberately exempt MULTI-interpolation messages because those
    // carry richer context (e.g. revisions, qualifiers) that doesn't fit
    // the colon-suffix template — those are sentence-form messages and
    // are allowed to remain sentences.
    const callPattern =
      /FDPMException\(\s*"not_found"\s*,\s*(`[^`]*`|"[^"]*")/g;

    const violations: string[] = [];
    const files = await readSourceCorpus();
    for (const { path, text } of files) {
      if (path.includes("error-message-style")) continue;
      let match: RegExpExecArray | null;
      while ((match = callPattern.exec(text)) !== null) {
        const msg = match[1]!;
        // Plain double-quoted string with no interpolation → always fine.
        if (msg.startsWith('"')) continue;
        const interpCount = (msg.match(/\$\{/g) ?? []).length;
        if (interpCount === 0) continue; // pure-literal template, fine.
        if (interpCount > 1) continue;    // sentence-form, exempt by design.
        // Single-interpolation: must be `<words>: ${id}` shape.
        const firstInterp = msg.indexOf("${");
        const head = msg.slice(0, firstInterp);
        if (!/:\s+$/.test(head)) {
          violations.push(`${path} :: ${msg}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

describe("Issue-F — replay paths surface canonical messages with evidence", () => {
  it("structure.reorder on a missing project: canonical message + evidence", async () => {
    const host = await newHost();
    let caught: unknown;
    try {
      // §5.4 reorder against a project that doesn't exist exercises the
      // memberships-missing branch in replay.ts at the top of
      // applyStructureReorder.
      await host.appendAndPersist({
        kind: "structure.reorder",
        project_id: "ghost",
        payload: { scope_id: "test:scope:doc", ordering: [] },
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(FDPMException);
    const fdpm = caught as FDPMException;
    expect(fdpm.category).toBe("not_found");
    expect(fdpm.message).toBe("project not found: ghost");
    expect(fdpm.evidence).toEqual({ project_id: "ghost" });
  });

  it("structure.reparent on a missing primitive: canonical message + evidence", async () => {
    const host = await newHost();
    await host.createProject({ project_id: "p1", name: "P1", profile_id: "test:demo" });
    let caught: unknown;
    try {
      await host.appendAndPersist({
        kind: "structure.reparent",
        project_id: "p1",
        payload: {
          primitive_id: "section:ghost",
          from_scope_id: "test:scope:doc",
          to_scope_id: "test:scope:appendix",
        },
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(FDPMException);
    const fdpm = caught as FDPMException;
    expect(fdpm.category).toBe("not_found");
    expect(fdpm.message).toBe("primitive not found: section:ghost");
    expect(fdpm.evidence).toEqual({
      primitive_id: "section:ghost",
      project_id: "p1",
    });
  });
});
