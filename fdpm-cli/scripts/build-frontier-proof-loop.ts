/**
 * Build the frontier-proof loop: register profile:frontier-proof-loop:0.1
 * and seed the orchestration workbook plus the first pursuit's re-crt and
 * logical-knowledge-base workbooks.
 *
 * ARCHITECTURAL REQUIREMENT: LLMs will always produce some form of error.
 * Absence of output verification is a design defect, not a runtime bug.
 * All LLM output must be treated as untrusted and validated explicitly.
 *
 * Run against a fresh data dir:
 *   FDPM_DATA_DIR=<dir> npx tsx fdpm-cli/scripts/build-frontier-proof-loop.ts
 *
 * Run against the data dir the fdpm MCP server serves (the default,
 * ~/.fdpm-cli), then send the server SIGHUP so it reloads:
 *   npx tsx fdpm-cli/scripts/build-frontier-proof-loop.ts
 *
 * Print the profile and the three seeds as JSON without touching any host:
 *   npx tsx fdpm-cli/scripts/build-frontier-proof-loop.ts --print
 *
 * Every write goes through the Host's validation pipeline; a rejected
 * record aborts the build with the host's findings. The vitest gate
 * (tests/frontier-proof-loop.test.ts) builds into a temporary data dir and
 * asserts zero findings at every level.
 */
import { pathToFileURL } from "node:url";
import type { Host } from "../src/core/host.js";
import { formatProfileRef } from "../src/core/profile/version.js";
import { defineProject, openHost } from "../src/sdk.js";
import { PROFILE } from "./frontier-proof-loop/profile.js";
import { allSeeds, type WorkbookSeed } from "./frontier-proof-loop/seed.js";

export interface BuildReport {
  profile_id: string;
  profile: "registered" | "already-present";
  workbooks: Array<{ id: string; profile: string; primitives: number; relations: number }>;
}

export async function buildFrontierProofLoop(host: Host, seeds: WorkbookSeed[] = allSeeds()): Promise<BuildReport> {
  // Re-runnable: the registry rejects a second registration of the same
  // id@version, and overwriting in place would rewrite the schema of every
  // workbook already bound to it. A drifted profile is fixed by a version bump.
  const alreadyRegistered = host.profiles.has(formatProfileRef(PROFILE.id, PROFILE.version));
  if (!alreadyRegistered) await host.registerProfile(PROFILE);
  const workbooks: BuildReport["workbooks"] = [];
  for (const seed of seeds) {
    await defineProject(host, seed.header).primitives(seed.primitives).relations(seed.relations).commit();
    workbooks.push({
      id: seed.header.id,
      profile: seed.header.profile,
      primitives: seed.primitives.length,
      relations: seed.relations.length,
    });
  }
  return { profile_id: PROFILE.id, profile: alreadyRegistered ? "already-present" : "registered", workbooks };
}

async function main(): Promise<void> {
  if (process.argv.includes("--print")) {
    process.stdout.write(`${JSON.stringify({ profile: PROFILE, workbooks: allSeeds() }, null, 2)}\n`);
    return;
  }
  const host = await openHost();
  const report = await buildFrontierProofLoop(host);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err: unknown) => {
    const e = err as Error & { findings?: unknown; evidence?: unknown };
    process.stderr.write(`${e.message}\n`);
    if (e.findings !== undefined) process.stderr.write(`${JSON.stringify(e.findings, null, 2)}\n`);
    if (e.evidence !== undefined) process.stderr.write(`${JSON.stringify(e.evidence, null, 2)}\n`);
    process.exitCode = 1;
  });
}
