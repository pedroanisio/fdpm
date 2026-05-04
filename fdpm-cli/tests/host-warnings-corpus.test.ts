import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Issue-E corpus invariant.
 *
 * Forbid raw `process.stderr.write("warning: ...")` and similar bypass
 * patterns in `src/`. Every host-side non-fatal diagnostic MUST go
 * through `emitHostWarning(...)` so the JSON-mode contract holds
 * uniformly. This test fails at test time on any new bypass.
 *
 * Allowed exceptions:
 *  - The `bin/fdpm.ts` error sink itself writes to stderr — that's the
 *    canonical FDPMException renderer, not a warning.
 *  - The plugin logger in `plugin/context.ts` writes to stderr — that's
 *    the user-controlled `FDPM_LOG_LEVEL` channel, also distinct from
 *    host warnings.
 *  - The diagnostics helper in `core/diagnostics/warnings.ts` writes to
 *    stderr by design — that's the funnel we just installed.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === "dist") continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (e.name.endsWith(".ts")) yield full;
  }
}

const ALLOWED_STDERR_FILES = new Set([
  // Canonical error sink for FDPMException → JSON envelope or human text.
  join(ROOT, "src/bin/fdpm.ts"),
  // Plugin-controlled log channel; routed by FDPM_LOG_LEVEL.
  join(ROOT, "src/plugin/context.ts"),
  // The diagnostics helper itself — it's the funnel everyone else uses.
  join(ROOT, "src/core/diagnostics/warnings.ts"),
]);

describe("Issue-E — host warnings funnel", () => {
  it("no `src/` file outside the allowlist writes raw `warning:` text to stderr", async () => {
    const offenders: string[] = [];
    for await (const path of walk(join(ROOT, "src"))) {
      if (ALLOWED_STDERR_FILES.has(path)) continue;
      const text = await fs.readFile(path, "utf8");
      // Heuristic: any direct call to process.stderr.write that contains
      // the literal substring `warning:` is a bypass.
      // The helper's own implementation lives in the allowlist above.
      const bypass =
        /process\.stderr\.write\(\s*[`"][^`"]*warning:/i.test(text) ||
        /process\.stderr\.write\(\s*`[^`]*warning:/i.test(text);
      if (bypass) {
        offenders.push(path);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no `src/` file outside the allowlist writes raw `plugin <id>` diagnostic text to stderr", async () => {
    // The plugin-runtime sites used to emit lines like:
    //   `plugin foo QUARANTINED: ...`
    //   `plugin manifest rejected at ...`
    //   `plugin foo onDisable raised ...`
    // — without a `warning:` prefix but still bypassing JSON mode. Catch
    // those too.
    const offenders: string[] = [];
    for await (const path of walk(join(ROOT, "src"))) {
      if (ALLOWED_STDERR_FILES.has(path)) continue;
      const text = await fs.readFile(path, "utf8");
      // Match process.stderr.write where the message contains a literal
      // "plugin " token at the start of human prose. We tolerate
      // structured logger formats like `[plugin:${id}]` (those stay in
      // context.ts) by requiring a space, not a colon, after "plugin".
      const stderrCalls = text.matchAll(
        /process\.stderr\.write\(\s*([`"][^`"]*[`"]|`[^`]*`)/g,
      );
      for (const m of stderrCalls) {
        const literal = m[1] ?? "";
        if (/plugin\s/i.test(literal) && !/\[plugin:/.test(literal)) {
          offenders.push(`${path} :: ${literal.slice(0, 80)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the diagnostics helper exists and exports `emitHostWarning`", async () => {
    const helperPath = join(ROOT, "src/core/diagnostics/warnings.ts");
    const text = await fs.readFile(helperPath, "utf8");
    expect(text).toMatch(/export function emitHostWarning\(/);
  });
});
