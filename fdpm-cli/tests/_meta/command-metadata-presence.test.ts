/**
 * CI gate: every command module under `src/commands/` MUST export
 * `commandMetadata: CommandMetadataMap`. SPEC-REPL §10.2 freshness
 * check and SPEC-MCP-SERVER tool dispatch both depend on this.
 *
 * This test enumerates the directory at vitest-collection time and
 * dynamically imports each module, asserting the export's presence
 * and that every entry has the required shape (`readOnly: boolean`,
 * `projectIdsFromArgv: function`, `projectIdsFromJson: function`).
 *
 * The test fails the build if a contributor adds a new command file
 * without wiring its metadata. Excludes `util.ts`, `metadata.ts`,
 * `index.ts` (helpers / registry, not commands themselves).
 */
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const COMMANDS_DIR = resolve(__dirname, "..", "..", "src", "commands");
const HELPER_FILES = new Set(["util.ts", "metadata.ts", "index.ts"]);

function listCommandModules(): string[] {
  return readdirSync(COMMANDS_DIR)
    .filter((f) => f.endsWith(".ts") && !HELPER_FILES.has(f))
    .sort();
}

describe("CI: every src/commands/*.ts exports commandMetadata", () => {
  const modules = listCommandModules();

  for (const file of modules) {
    it(`${file} exports a non-empty commandMetadata`, async () => {
      // Build the import path in a separate statement so the dynamic
      // import target is a single bare identifier — keeps Vite's
      // static analyzer quiet without changing runtime behaviour.
      const stem = file.replace(/\.ts$/, ".js");
      const url = `../../src/commands/${stem}`;
      const mod = await import(/* @vite-ignore */ url);
      expect(
        mod.commandMetadata,
        `${file} is missing the required 'commandMetadata' export. ` +
          `Add per-subcommand metadata per src/commands/metadata.ts. ` +
          `See SPEC-REPL §10.2 (freshness check needs readOnly + projectIdsFromArgv ` +
          `for every dispatchable subcommand).`,
      ).toBeDefined();
      expect(typeof mod.commandMetadata).toBe("object");
      expect(Object.keys(mod.commandMetadata).length).toBeGreaterThan(0);

      for (const [key, entry] of Object.entries(
        mod.commandMetadata as Record<string, unknown>,
      )) {
        expect(entry, `${file}: ${key} entry is null`).not.toBeNull();
        const e = entry as Record<string, unknown>;
        expect(typeof e["readOnly"], `${file}: ${key}.readOnly`).toBe("boolean");
        expect(typeof e["projectIdsFromArgv"], `${file}: ${key}.projectIdsFromArgv`).toBe(
          "function",
        );
        expect(typeof e["projectIdsFromJson"], `${file}: ${key}.projectIdsFromJson`).toBe(
          "function",
        );
      }
    });
  }

  it("the central registry imports every module's commandMetadata", async () => {
    const { ALL_COMMAND_METADATA } = await import("../../src/commands/index.js");
    expect(Object.keys(ALL_COMMAND_METADATA).length).toBeGreaterThan(20);
  });

  it("every entry's projectIdsFromArgv and projectIdsFromJson return arrays", async () => {
    const { ALL_COMMAND_METADATA } = await import("../../src/commands/index.js");
    for (const [key, entry] of Object.entries(ALL_COMMAND_METADATA)) {
      const argvResult = entry.projectIdsFromArgv([]);
      const jsonResult = entry.projectIdsFromJson({});
      expect(Array.isArray(argvResult), `${key}: projectIdsFromArgv returned non-array`).toBe(
        true,
      );
      expect(Array.isArray(jsonResult), `${key}: projectIdsFromJson returned non-array`).toBe(
        true,
      );
    }
  });
});
