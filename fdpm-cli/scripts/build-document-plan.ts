/**
 * Ingest a DocumentPlan (v3.1.0) JSON file as an FDPM workbook on
 * profile:document-plan-dnis:3.1.
 *
 * Usage:
 *   npx tsx fdpm-cli/scripts/build-document-plan.ts <plan.json> \
 *       [--workbook-id <id>] [--name <name>] [--json]
 *
 * Then render the outline:
 *   npx tsx fdpm-cli/src/bin/fdpm.ts render <id> text/markdown \
 *       --renderer-id docplan:PlanOutlineRenderer -o plan-outline.md
 *
 * Data dir follows the usual precedence (--data-dir is not accepted here;
 * set FDPM_DATA_DIR or FDPM_WORKSPACE). The plan is validated by the full
 * DocumentPlanSchema before anything is written (PALS's LAW); a rejected
 * plan exits with the `verification` exit code and prints every issue.
 */
import { readFileSync } from "node:fs";
import { openHost } from "../src/sdk.js";
import { EXIT_CODE_FOR_CATEGORY, FDPMException } from "../src/core/errors/fdpm-exception.js";
import { buildDocumentPlanWorkbook } from "../plugins/document_plan_dnis/build.js";
import { PLAN_OUTLINE_RENDERER_ID } from "../plugins/document_plan_dnis/index.js";

interface Args {
  file: string;
  workbookId?: string;
  name?: string;
  json: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const positional: string[] = [];
  const out: Args = { file: "", json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]!;
    if (a === "--workbook-id") out.workbookId = argv[++i];
    else if (a === "--name") out.name = argv[++i];
    else if (a === "--json") out.json = true;
    else if (a.startsWith("--")) throw new Error(`unknown flag ${a}`);
    else positional.push(a);
  }
  if (positional.length !== 1) {
    throw new Error("usage: build-document-plan.ts <plan.json> [--workbook-id <id>] [--name <name>] [--json]");
  }
  out.file = positional[0]!;
  return out;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "document-plan";
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const raw: unknown = JSON.parse(readFileSync(args.file, "utf8"));
  const title = typeof raw === "object" && raw !== null ? (raw as { title?: unknown }).title : undefined;
  const workbookId = args.workbookId ?? slugify(typeof title === "string" ? title : "document-plan");

  const host = await openHost();
  const report = await buildDocumentPlanWorkbook(host, raw, {
    workbookId,
    ...(args.name !== undefined ? { workbookName: args.name } : {}),
  });

  if (args.json) {
    process.stdout.write(JSON.stringify(report) + "\n");
    return;
  }
  console.log(`workbook ${report.workbookId} on ${report.profileId}`);
  console.log(`  plan:        ${report.planId}`);
  console.log(`  primitives:  ${report.primitives}`);
  console.log(`  relations:   ${report.relations}`);
  console.log(`  nodes:       ${report.nodes} (dnis:Document ${report.dnisDocumentId})`);
  if (report.coherence_warnings.length > 0) {
    console.log("");
    console.log("coherence warnings (" + report.coherence_warnings.length + ") — docplan:coherence.comparative-claim-without-baseline:");
    for (const w of report.coherence_warnings) console.log("  - " + w.message);
  }
  console.log("");
  console.log("render the outline with:");
  console.log(
    `  npx tsx fdpm-cli/src/bin/fdpm.ts render ${report.workbookId} text/markdown --renderer-id ${PLAN_OUTLINE_RENDERER_ID} -o plan-outline.md`,
  );
}

main().catch((err: unknown) => {
  if (err instanceof FDPMException) {
    process.stderr.write(JSON.stringify({ error: err.toEnvelope() }, null, 2) + "\n");
    process.exit(EXIT_CODE_FOR_CATEGORY[err.category]);
  }
  process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(70);
});
