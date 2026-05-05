/**
 * Central registry of per-subcommand metadata for the SPEC-REPL §10.2
 * freshness gate and the SPEC-MCP-SERVER tool dispatch.
 *
 * Every command module under `src/commands/` exports a
 * `commandMetadata: CommandMetadataMap`. This file merges them into
 * one map keyed by full subcommand path. Both the REPL and MCP-server
 * dispatchers look up by the literal command line they're about to
 * dispatch (e.g. `"primitive create"`, `"render"`).
 *
 * Adding a new command module: import its `commandMetadata` and spread
 * it below. The CI check at `tests/_meta/command-metadata-presence.test.ts`
 * fails the build if any module under `src/commands/` other than
 * `util.ts`, `metadata.ts`, and this file omits the export.
 */
import { type CommandMetadataMap } from "./metadata.js";

import { commandMetadata as completionsMetadata } from "./completions.js";
import { commandMetadata as diffMetadata } from "./diff.js";
import { commandMetadata as dnisMetadata } from "./dnis.js";
import { commandMetadata as editMetadata } from "./edit.js";
import { commandMetadata as healthMetadata } from "./health.js";
import { commandMetadata as logMetadata } from "./log.js";
import { commandMetadata as migrateMetadata } from "./migrate.js";
import { commandMetadata as pluginMetadata } from "./plugin.js";
import { commandMetadata as primitiveMetadata } from "./primitive.js";
import { commandMetadata as profileMetadata } from "./profile.js";
import { commandMetadata as projectMetadata } from "./project.js";
import { commandMetadata as relationMetadata } from "./relation.js";
import { commandMetadata as renderMetadata } from "./render.js";
import { commandMetadata as replMetadata } from "./repl.js";
import { commandMetadata as structureMetadata } from "./structure.js";
import { commandMetadata as templateMetadata } from "./template.js";
import { commandMetadata as testSuiteMetadata } from "./test-suite.js";
import { commandMetadata as transferMetadata } from "./transfer.js";
import { commandMetadata as validateMetadata } from "./validate.js";
import { commandMetadata as workspaceMetadata } from "./workspace.js";

export const ALL_COMMAND_METADATA: CommandMetadataMap = {
  ...completionsMetadata,
  ...diffMetadata,
  ...dnisMetadata,
  ...editMetadata,
  ...healthMetadata,
  ...logMetadata,
  ...migrateMetadata,
  ...pluginMetadata,
  ...primitiveMetadata,
  ...profileMetadata,
  ...projectMetadata,
  ...relationMetadata,
  ...renderMetadata,
  ...replMetadata,
  ...structureMetadata,
  ...templateMetadata,
  ...testSuiteMetadata,
  ...transferMetadata,
  ...validateMetadata,
  ...workspaceMetadata,
};

export {
  type CommandMetadataMap,
  type SubcommandMetadata,
  type ProjectIdsFromArgv,
  type ProjectIdsFromJson,
} from "./metadata.js";
