/**
 * Ingest the Coma Void cartographic aesthetic into an FDPM workbook on
 * `profile:style:3.1`.
 *
 * The source is `_ingest_bin/coma-void-style.ts` — a `StyleDefinition`
 * literal written against `_ingest_bin/style-schema.ts` v3.1.0. A
 * `StyleDefinition` is one style; a workbook is one `StyleRegistry`, the
 * closed world inside which every `MovementId` and `StyleId` must resolve
 * (plugins/style/README.md, "A workbook is one StyleRegistry"). So this
 * script's whole job is to wrap the one style in the registry the profile
 * models, declare the two movements its identity points at, and hand the
 * result to the plugin's verification boundary.
 *
 * ARCHITECTURAL REQUIREMENT: LLMs will always produce some form of error.
 * Absence of output verification is a design defect, not a runtime bug.
 * All LLM output must be treated as untrusted and validated explicitly.
 *
 * Nothing here validates the style itself, and that is deliberate: the
 * registry is untrusted input to `buildStyleWorkbook`, which owns the five
 * controls (strict typed parse, cross-reference resolution, projection
 * invariants, a `verification` FDPMException on any failure, and no write
 * until all of them pass). This script adds one post-condition on top —
 * it re-runs the cross-entity invariant set against what actually landed
 * in the store, so a workbook that was written is also a workbook that was
 * checked.
 *
 * Run (against your default data dir, ~/.fdpm-cli):
 *   npx tsx fdpm-cli/scripts/build-coma-void-style.ts
 *
 * Against a throwaway store:
 *   FDPM_DATA_DIR=/tmp/fdpm-coma-void npx tsx \
 *     fdpm-cli/scripts/build-coma-void-style.ts
 *
 * Re-run over an existing workbook (deletes it first):
 *   npx tsx fdpm-cli/scripts/build-coma-void-style.ts --replace
 *
 * Read it back:
 *   fdpm render style-coma-void text/markdown \
 *     --renderer-id style:StyleOutlineRenderer
 */

import { resolve } from "node:path";
import { openHost } from "../src/sdk.js";
import { buildStyleWorkbook } from "../plugins/style/ingest.js";
import { validateStyleWorkbook } from "../plugins/style/invariants.js";
import comaVoidStyle from "../../_ingest_bin/coma-void-style.js";

const WORKBOOK_ID = "style-coma-void";

/**
 * The movements `comaVoidStyle.identity` points at.
 *
 * `parentMovement` and `negatedMovements` are cross-references, and the
 * registry is a closed world: a pointer with no entry is a rejection, not
 * a dangling id. Both entries carry an OPEN period with a null start —
 * "origin unknown" in the schema's own words (plugins/style/schemas/
 * style.ts:637). That is the honest encoding: the style file dates its
 * exemplars (Hevelius 1690, de Lapparent 1986) but dates neither
 * tradition, and a start year invented here would be an unsourced claim
 * stored as data.
 */
const MOVEMENTS = [
  {
    id: "celestial-cartography",
    name: "Celestial cartography",
    aliases: ["Uranography", "Star charting"],
    period: { kind: "open" as const, start: null },
    parentMovement: null,
  },
  {
    id: "pictorial-constellation-atlas",
    name: "Pictorial constellation atlas",
    aliases: ["Figurative star atlas"],
    period: { kind: "open" as const, start: null },
    parentMovement: null,
  },
];

async function main(): Promise<void> {
  const replace = process.argv.includes("--replace");

  const host = await openHost({
    builtinDirs: [resolve(import.meta.dirname, "..", "plugins")],
  });

  if (replace && host.listProjects().some((p) => p.id === WORKBOOK_ID)) {
    await host.deleteProject(WORKBOOK_ID);
    process.stdout.write(`deleted existing workbook ${WORKBOOK_ID}\n`);
  }

  const registry = {
    schemaVersion: comaVoidStyle.schemaVersion,
    locale: comaVoidStyle.locale,
    provenance: {
      createdBy: comaVoidStyle.provenance.createdBy,
      createdAt: comaVoidStyle.provenance.createdAt,
      sourceSystem: "fdpm-cli/scripts/build-coma-void-style.ts",
    },
    movements: MOVEMENTS,
    styles: [comaVoidStyle],
  };

  const report = await buildStyleWorkbook(host, registry, {
    workbookId: WORKBOOK_ID,
    workbookName: "Style registry — Coma Void cartographic aesthetic",
    description:
      "StyleRegistry 3.1.0 — the Coma Void cartographic aesthetic, " +
      "ingested from _ingest_bin/coma-void-style.ts.",
  });

  // Post-condition. `buildStyleWorkbook` validates the PROJECTION before
  // it writes; this validates what the STORE now holds, which is the thing
  // a reader will actually see. A discrepancy would mean the write path
  // altered the graph, and that must be loud rather than discovered later.
  const slice = host.getProject(WORKBOOK_ID);
  const result = validateStyleWorkbook(
    Object.values(slice.primitives),
    Object.values(slice.relations),
  );
  if (!result.ok) {
    for (const v of result.violations) {
      process.stderr.write(`${v.rule_id} ${v.target_id ?? "<registry>"}: ${v.message}\n`);
    }
    throw new Error(
      `workbook ${WORKBOOK_ID} was written but violates ${result.violations.length} cross-entity invariant(s)`,
    );
  }

  process.stdout.write(
    [
      `workbook   ${report.workbookId}`,
      `profile    ${report.profileId}`,
      `styles     ${report.styleIds.join(", ")}`,
      `primitives ${report.primitives}`,
      `relations  ${report.relations}`,
      "by type",
      ...Object.entries(report.byType)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([type, n]) => `  ${type.padEnd(28)} ${n}`),
      `invariants ok (${Object.keys(slice.primitives).length} primitives re-checked)`,
      "",
    ].join("\n"),
  );
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  process.exitCode = 1;
});
