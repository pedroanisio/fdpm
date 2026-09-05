/**
 * Build the Codex delegation workbook: register profile:codex-delegation:0.2
 * and seed the pipeline, its delegation modes and its per-stage verification
 * boundaries.
 *
 * ARCHITECTURAL REQUIREMENT: LLMs will always produce some form of error.
 * Absence of output verification is a design defect, not a runtime bug.
 * All LLM output must be treated as untrusted and validated explicitly.
 *
 * Run against a fresh data dir:
 *   FDPM_DATA_DIR=<dir> npx tsx fdpm-cli/scripts/build-codex-delegation.ts
 *
 * Run against the data dir the fdpm MCP server serves (the default,
 * ~/.fdpm-cli), then send the server SIGHUP so it reloads:
 *   npx tsx fdpm-cli/scripts/build-codex-delegation.ts
 *
 * Print the profile and the seed as JSON without touching any host:
 *   npx tsx fdpm-cli/scripts/build-codex-delegation.ts --print
 *
 * Every write goes through the Host's validation pipeline; a rejected record
 * aborts the build with the host's findings. The vitest gate
 * (tests/codex-delegation.test.ts) builds into an in-memory host and asserts
 * both that the workbook is clean and that each blocking rule still rejects
 * the mode it exists to reject.
 */
import { pathToFileURL } from "node:url";
import type { Host } from "../src/core/host.js";
import { formatProfileRef } from "../src/core/profile/version.js";
import { defineProject, openHost } from "../src/sdk.js";
import { PROFILE } from "./codex-delegation/profile.js";
import { allSeeds, type WorkbookSeed } from "./codex-delegation/seed.js";

export interface BuildReport {
  profile_id: string;
  profile: "registered" | "already-present";
  workbooks: Array<{ id: string; profile: string; primitives: number; relations: number }>;
}

export async function buildCodexDelegation(host: Host, seeds: WorkbookSeed[] = allSeeds()): Promise<BuildReport> {
  // The registry rejects a second registration of the same id@version, so a
  // re-run against a data dir that already carries this profile would abort
  // before touching the workbook. Registering is skipped rather than forced:
  // if the registered copy has drifted from this source, overwriting it in
  // place would rewrite the schema of every workbook already bound to it. The
  // fix for a drifted profile is a version bump, which the operator makes.
  const ref = formatProfileRef(PROFILE.id, PROFILE.version);
  const alreadyRegistered = host.profiles.has(ref);
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
  const report = await buildCodexDelegation(host);
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
