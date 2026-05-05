/**
 * generate-build-from-transfer.ts — Code-generate a SDK-based workbook
 * builder script from a ProjectTransfer JSON file.
 *
 * Usage:
 *   npx tsx scripts/generate-build-from-transfer.ts <transfer.json> <output.ts>
 *
 * Produces a 4-file artifact set, all derived from <output.ts>:
 *   <output>.ts             — entry script (imports + main)
 *   <output>.primitives.ts  — `export const PRIMITIVES: PrimitiveSpec[] = [...]`
 *   <output>.relations.ts   — `export const RELATIONS: RelationSpec[]  = [...]`
 *   <output>.summary.md     — human summary (type counts, validity report)
 *
 * The split keeps the entry script reviewable (a few hundred lines)
 * while the bulk data lives in sibling files that diff cleanly. Run
 * `<output>.ts` exactly as before:
 *   FDPM_DATA_DIR=/tmp/rebuild npx tsx <path-to>/<output>.ts
 *   FDPM_DATA_DIR=/tmp/rebuild npx tsx <path-to>/<output>.ts --skip-invalid
 *
 * Transformations applied during generation:
 *   - Relations carrying the legacy `field_values._metadata.*` envelope
 *     have those keys lifted to the top of `field_values`. The SDK
 *     uses §7-validated `host.createRelation`, which checks declared
 *     fields at the top level. The lift mirrors `migrate
 *     normalize-metadata` performed eagerly at script-author time.
 *   - The legacy `_strength` field (not declared by any in-tree
 *     relation type) is dropped.
 *   - Each primitive/relation's `revision` is omitted — the SDK
 *     creates fresh and the host assigns revisions deterministically.
 *
 * The generator does NOT attempt to fix oversized field values or
 * id-format violations. The generated script will fail at commit time
 * for primitives that violate the active profile's validation rules.
 * Run with `--skip-invalid` to elide a hard-coded set of known-bad
 * primitives (the generator emits this set into the script header).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Host } from "../src/core/host.js";
import { mintUidFromSeed } from "../src/core/identity/uid.js";
import type {
  PrimitiveInstance,
  RelationInstance,
} from "../src/core/models/instance.js";

interface TransferPrimitive {
  id: string;
  type_id: string;
  scope_id?: string;
  field_values: Record<string, unknown>;
  revision?: number;
}

interface TransferRelation {
  id: string;
  type_id: string;
  source_id: string;
  target_id: string;
  field_values: Record<string, unknown>;
  revision?: number;
}

interface Transfer {
  spec_core: string;
  workbook: {
    id: string;
    name: string;
    profile_id: string;
    description?: string;
    created_at: string;
    revision: number;
  };
  primitives: TransferPrimitive[];
  relations: TransferRelation[];
}

/**
 * Lift `field_values._metadata.*` to top-level field_values, drop the
 * `_metadata` envelope and the undeclared `_strength` field.
 */
function normalizeRelationFields(fv: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fv)) {
    if (k === "_metadata" || k === "_strength") continue;
    out[k] = v;
  }
  const meta = fv["_metadata"];
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    for (const [k, v] of Object.entries(meta as Record<string, unknown>)) {
      if (!(k in out)) out[k] = v;
    }
  }
  return out;
}

/** JSON.stringify with stable key order for diff-friendly output. */
function stableJson(value: unknown, indent: number): string {
  return JSON.stringify(value, null, indent);
}

/**
 * Identify primitives whose field shapes will be rejected by the §7
 * validation pipeline at commit time.
 *
 * Boots a temporary in-memory Host with the same plugin set the
 * generated script will use, then runs the §7 pipeline against each
 * primitive without committing. Every primitive that produces an
 * error-level finding is added to the skip set. Far more accurate
 * than the prior string-length heuristic, which missed id-format
 * violations on non-Definition types.
 */
async function findKnownInvalid(transfer: Transfer): Promise<{
  primitives: string[];
  relations: string[];
}> {
  const host = new Host({ dataDir: null });
  await host.load();
  if (!host.profiles.has(transfer.workbook.profile_id)) {
    const available = host.profiles
      .listRaw()
      .map((p) => p.id)
      .sort()
      .join(", ");
    throw new Error(
      `Transfer references profile "${transfer.workbook.profile_id}" but it is not registered. ` +
        `Available profiles: ${available || "(none)"}. ` +
        `Ensure the plugin that defines this profile is built and discoverable, then retry.`,
    );
  }
  const profile = host.profiles.getResolved(transfer.workbook.profile_id);
  // Build a typed primitives map up front so it can be reused for
  // both the per-primitive validate pass (no use today, but cheap)
  // and the per-relation validate pass (endpoint-existence and
  // endpoint-type checks rely on it).
  // Pre-flight only validates shape; it never persists. Mint a
  // deterministic placeholder uid from the stable id (matching the
  // SPEC-UID upcaster pattern in src/core/operations/upcast.ts) so the
  // PrimitiveInstance schema's required-uid contract is satisfied
  // without coupling pre-flight to runtime uid minting.
  const primMap = new Map<string, PrimitiveInstance>();
  for (const p of transfer.primitives) {
    const inst: PrimitiveInstance = {
      id: p.id,
      uid: mintUidFromSeed(p.id),
      type_id: p.type_id,
      field_values: p.field_values,
      revision: 0,
      ...(p.scope_id !== undefined && { scope_id: p.scope_id }),
    };
    primMap.set(p.id, inst);
  }
  const badPrimitives: string[] = [];
  for (const p of transfer.primitives) {
    const report = host.pipeline.runPrimitive(primMap.get(p.id)!, profile);
    if (!report.accepted) badPrimitives.push(p.id);
  }
  const badRelations: string[] = [];
  for (const r of transfer.relations) {
    const proposed: RelationInstance = {
      id: r.id,
      uid: mintUidFromSeed(r.id),
      type_id: r.type_id,
      source_id: r.source_id,
      target_id: r.target_id,
      field_values: normalizeRelationFields(r.field_values),
      revision: 0,
    };
    const report = host.pipeline.runRelation(proposed, profile, primMap);
    if (!report.accepted) badRelations.push(r.id);
  }
  return {
    primitives: badPrimitives.sort(),
    relations: badRelations.sort(),
  };
}

async function generate(transferPath: string, outPath: string): Promise<void> {
  let raw: string;
  try {
    raw = readFileSync(transferPath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Transfer file not found: ${transferPath}`);
    }
    throw err;
  }
  let transfer: Transfer;
  try {
    transfer = JSON.parse(raw) as Transfer;
  } catch (err) {
    throw new Error(
      `Transfer file is not valid JSON: ${transferPath}: ${(err as Error).message}`,
    );
  }
  if (
    transfer === null ||
    typeof transfer !== "object" ||
    typeof transfer.workbook?.profile_id !== "string" ||
    !Array.isArray(transfer.primitives) ||
    !Array.isArray(transfer.relations)
  ) {
    throw new Error(
      `Transfer file does not have the expected ProjectTransfer shape: ${transferPath}`,
    );
  }
  // Use the basename of the source transfer as a stable label in the
  // generated docstring. Including absolute paths or timestamps makes
  // the output non-deterministic — re-running the generator would
  // produce a noisy diff with no semantic change, defeating CI drift
  // detection.
  const sourceLabel = basename(transferPath);
  const outLabel = basename(outPath);

  // Sibling artifact paths derived from <outPath>. The entry script
  // and the data files share a stem so they show up next to each
  // other in `ls`; the .summary.md goes in the same directory.
  if (!/\.tsx?$/.test(outPath)) {
    throw new Error(
      `Output path must end in .ts or .tsx (got: ${outLabel}). The generator emits four sibling artifacts derived from this path.`,
    );
  }
  const stem = outPath.replace(/\.tsx?$/, "");
  const stemBase = basename(stem);
  const primitivesPath = `${stem}.primitives.ts`;
  const relationsPath = `${stem}.relations.ts`;
  const summaryPath = `${stem}.summary.md`;

  // Compute the import path from the output script's location to the
  // SDK module, so the generated script works wherever the user puts
  // it (not only under fdpm-cli/scripts/). The generator lives in
  // fdpm-cli/scripts/, the SDK lives at fdpm-cli/src/sdk.ts. We compute relative
  // from the *output's directory* to the resolved sdk source path.
  const here = dirname(fileURLToPath(import.meta.url)); // fdpm-cli/scripts/
  const sdkSrcPath = resolve(here, "..", "src", "sdk.js");
  let sdkImport = relative(dirname(outPath), sdkSrcPath);
  // Node ESM imports require an explicit "./" or "../" prefix and the
  // path must use forward slashes even on Windows.
  if (!sdkImport.startsWith(".")) sdkImport = "./" + sdkImport;
  sdkImport = sdkImport.split("\\").join("/");

  const primitiveSpecs = transfer.primitives.map((p) => {
    const spec: Record<string, unknown> = {
      id: p.id,
      type: p.type_id,
      fields: p.field_values,
    };
    if (p.scope_id !== undefined) spec.scope = p.scope_id;
    return spec;
  });

  const relationSpecs = transfer.relations.map((r) => ({
    id: r.id,
    type: r.type_id,
    from: r.source_id,
    to: r.target_id,
    fields: normalizeRelationFields(r.field_values),
  }));

  const known = await findKnownInvalid(transfer);
  const knownInvalidPrimitives = known.primitives;
  const knownInvalidRelations = known.relations;

  // ---- File 1: <stem>.primitives.ts -----------------------------------
  const primitivesFile = `/**
 * AUTO-GENERATED by scripts/generate-build-from-transfer.ts.
 * Source: ${sourceLabel}
 *
 * Primitive specs for ${transfer.primitives.length} entities, in source
 * order. Imported by ${stemBase}.ts. Do not hand-edit — regenerate
 * from the source transfer.
 */

import type { PrimitiveSpec } from "${sdkImport}";

export const PRIMITIVES: PrimitiveSpec[] = ${stableJson(primitiveSpecs, 2)};
`;

  // ---- File 2: <stem>.relations.ts ------------------------------------
  const relationsFile = `/**
 * AUTO-GENERATED by scripts/generate-build-from-transfer.ts.
 * Source: ${sourceLabel}
 *
 * Relation specs for ${transfer.relations.length} edges, in source
 * order. Imported by ${stemBase}.ts. Do not hand-edit — regenerate
 * from the source transfer.
 */

import type { RelationSpec } from "${sdkImport}";

export const RELATIONS: RelationSpec[] = ${stableJson(relationSpecs, 2)};
`;

  // ---- File 3: <stem>.ts (entry) --------------------------------------
  const script = `/**
 * AUTO-GENERATED by scripts/generate-build-from-transfer.ts.
 * Source: ${sourceLabel}
 *
 * Recreates the workbook through the @fdpm/cli SDK. Output is
 * deterministic per (source-transfer, generator-version, active-
 * profile) — re-running the generator on the same input yields a
 * byte-identical script, so CI can detect drift via \`git diff\`.
 *
 * Companion artifacts (regenerated together):
 *   ${stemBase}.primitives.ts  — PRIMITIVES array
 *   ${stemBase}.relations.ts   — RELATIONS array
 *   ${stemBase}.summary.md     — human summary, type counts, validity
 *
 * Transformations applied at generation time:
 *   - Relation field_values._metadata.* lifted to top-level fields.
 *   - Legacy _strength field dropped.
 *   - Primitive/relation revision fields omitted (SDK assigns fresh).
 *
 * Known-invalid primitives (${knownInvalidPrimitives.length}) and
 * known-invalid relations (${knownInvalidRelations.length}) are
 * enumerated below. They will fail §7 validation under the active
 * profile (oversized fields, id-format mismatches, enum mismatches,
 * etc.). Pass --skip-invalid to elide them from the commit. When
 * primitives are skipped, any relation pointing at a skipped id is
 * also elided automatically.
 *
 * Run (substitute the actual path to this file as needed):
 *   FDPM_DATA_DIR=/tmp/rebuild npx tsx <path-to>/${outLabel}
 *   FDPM_DATA_DIR=/tmp/rebuild npx tsx <path-to>/${outLabel} --skip-invalid
 */

import { openHost, defineProject } from "${sdkImport}";
import { PRIMITIVES } from "./${stemBase}.primitives.js";
import { RELATIONS } from "./${stemBase}.relations.js";

const PROJECT_ID = ${JSON.stringify(transfer.workbook.id)};
const PROJECT_NAME = ${JSON.stringify(transfer.workbook.name)};
// Profile id inlined from the source transfer. The generator does not
// import a typed PROFILE_ID constant from a specific plugin — that
// would tie the generated script to one profile only. If you rename
// this profile, regenerate.
const PROFILE_ID = ${JSON.stringify(transfer.workbook.profile_id)};

/**
 * Primitive ids whose field shapes are known to violate the active
 * profile's validation rules. Run with --skip-invalid to elide them.
 * The list is stable per generation; if the source transfer changes,
 * regenerate this script.
 */
const KNOWN_INVALID_PRIMITIVES = new Set<string>(${stableJson(knownInvalidPrimitives, 2)});

/** Same, for relations (typically: enum mismatches on \`kind\`). */
const KNOWN_INVALID_RELATIONS = new Set<string>(${stableJson(knownInvalidRelations, 2)});

async function main() {
  const skipInvalid = process.argv.includes("--skip-invalid");
  const host = await openHost();
  const primitives = skipInvalid
    ? PRIMITIVES.filter((p) => !KNOWN_INVALID_PRIMITIVES.has(p.id))
    : PRIMITIVES;
  // Relations are elided in two cases when --skip-invalid is set:
  //   1. Their source or target points at a skipped primitive (avoids
  //      core:relation:source-missing / target-missing).
  //   2. They're explicitly in KNOWN_INVALID_RELATIONS (typically
  //      enum mismatches on \`kind\`).
  const presentIds = new Set(primitives.map((p) => p.id));
  let skippedRelByEnum = 0;
  let skippedRelByEndpoint = 0;
  const relations = skipInvalid
    ? RELATIONS.filter((r) => {
        if (KNOWN_INVALID_RELATIONS.has(r.id)) {
          skippedRelByEnum++;
          return false;
        }
        if (!presentIds.has(r.from) || !presentIds.has(r.to)) {
          skippedRelByEndpoint++;
          return false;
        }
        return true;
      })
    : RELATIONS;
  if (skipInvalid) {
    const skippedP = PRIMITIVES.length - primitives.length;
    if (skippedP > 0 || skippedRelByEnum > 0 || skippedRelByEndpoint > 0) {
      console.error(
        \`--skip-invalid: skipped \${skippedP} primitive(s), \${skippedRelByEnum} relation(s) by KNOWN_INVALID, \${skippedRelByEndpoint} relation(s) by missing-endpoint cascade.\`,
      );
    }
  }
  const result = await defineProject(host, {
    id: PROJECT_ID,
    name: PROJECT_NAME,
    profile: PROFILE_ID,
  })
    .primitives(primitives)
    .relations(relations)
    .commit({ rollbackOnError: true });
  console.log("Built workbook:", result.workbook_id);
  console.log("  primitives:", result.primitives_created);
  console.log("  relations: ", result.relations_created);
  console.log("  revision:  ", result.revision);
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : String(e));
  if (e && typeof e === "object" && "findings" in e) {
    console.error(
      "Findings:",
      JSON.stringify((e as { findings: unknown }).findings, null, 2),
    );
  }
  process.exit(1);
});
`;

  // ---- File 4: <stem>.summary.md --------------------------------------
  const summary = renderSummary({
    workbook: transfer.workbook,
    sourceLabel,
    outLabel,
    stemBase,
    primitives: transfer.primitives,
    relations: transfer.relations,
    knownInvalidPrimitives,
    knownInvalidRelations,
  });

  writeFileSync(primitivesPath, primitivesFile);
  writeFileSync(relationsPath, relationsFile);
  writeFileSync(outPath, script);
  writeFileSync(summaryPath, summary);
  console.log(`Wrote ${outPath}`);
  console.log(`  + ${primitivesPath}`);
  console.log(`  + ${relationsPath}`);
  console.log(`  + ${summaryPath}`);
  console.log(`  primitives: ${transfer.primitives.length} (${knownInvalidPrimitives.length} known-invalid)`);
  console.log(`  relations:  ${transfer.relations.length} (${knownInvalidRelations.length} known-invalid)`);
}

interface SummaryInput {
  workbook: Transfer["workbook"];
  sourceLabel: string;
  outLabel: string;
  stemBase: string;
  primitives: TransferPrimitive[];
  relations: TransferRelation[];
  knownInvalidPrimitives: string[];
  knownInvalidRelations: string[];
}

function tally<T>(items: T[], key: (t: T) => string): Array<[string, number]> {
  const map = new Map<string, number>();
  for (const it of items) {
    const k = key(it);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function mdTable(headers: string[], rows: string[][]): string {
  const head = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
  return [head, sep, body].join("\n");
}

function renderSummary(s: SummaryInput): string {
  const today = new Date().toISOString().slice(0, 10);
  const primTypes = tally(s.primitives, (p) => p.type_id);
  const relTypes = tally(s.relations, (r) => r.type_id);
  const invalidByType = tally(
    s.primitives.filter((p) => s.knownInvalidPrimitives.includes(p.id)),
    (p) => p.type_id,
  );
  const invalidPrimRows = s.knownInvalidPrimitives
    .map((id) => {
      const p = s.primitives.find((x) => x.id === id);
      return p ? [`\`${id}\``, `\`${p.type_id}\``] : [`\`${id}\``, "—"];
    });
  const invalidRelRows = s.knownInvalidRelations
    .map((id) => {
      const r = s.relations.find((x) => x.id === id);
      return r ? [`\`${id}\``, `\`${r.type_id}\``] : [`\`${id}\``, "—"];
    });

  const validP = s.primitives.length - s.knownInvalidPrimitives.length;
  const validR = s.relations.length - s.knownInvalidRelations.length;

  return `---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "scripts/generate-build-from-transfer.ts"
  date: "${today}"
---

# ${s.workbook.name} — build summary

Auto-generated companion to [\`${s.outLabel}\`](./${s.outLabel}). Re-run the
generator to refresh; do not hand-edit.

## Workbook

| Field | Value |
| --- | --- |
| id | \`${s.workbook.id}\` |
| name | ${s.workbook.name} |
| profile_id | \`${s.workbook.profile_id}\` |
| primitives | ${s.primitives.length} (${validP} valid, ${s.knownInvalidPrimitives.length} known-invalid) |
| relations | ${s.relations.length} (${validR} valid, ${s.knownInvalidRelations.length} known-invalid) |
| source | \`${s.sourceLabel}\` |

## Files

| File | Role |
| --- | --- |
| \`${s.stemBase}.ts\` | Entry script — \`openHost\` + \`defineProject\` + \`commit\` |
| \`${s.stemBase}.primitives.ts\` | \`PRIMITIVES\` array (${s.primitives.length} entries) |
| \`${s.stemBase}.relations.ts\` | \`RELATIONS\` array (${s.relations.length} entries) |
| \`${s.stemBase}.summary.md\` | This file |

## Primitives by type

${mdTable(["type_id", "count"], primTypes.map(([k, n]) => [`\`${k}\``, String(n)]))}

## Relations by type

${mdTable(["type_id", "count"], relTypes.map(([k, n]) => [`\`${k}\``, String(n)]))}

## Validity

${s.knownInvalidPrimitives.length === 0 && s.knownInvalidRelations.length === 0
  ? "All entities pass §7 validation under the active profile. \`--skip-invalid\` is a no-op for this workbook."
  : `Run with \`--skip-invalid\` to elide the entries below; relations pointing at skipped primitives are cascade-elided.

### Known-invalid primitives by type

${invalidByType.length === 0 ? "_None._" : mdTable(["type_id", "count"], invalidByType.map(([k, n]) => [`\`${k}\``, String(n)]))}

### Known-invalid primitive ids

${invalidPrimRows.length === 0 ? "_None._" : mdTable(["id", "type_id"], invalidPrimRows)}

### Known-invalid relation ids

${invalidRelRows.length === 0 ? "_None._" : mdTable(["id", "type_id"], invalidRelRows)}`}

## Run

\`\`\`bash
FDPM_DATA_DIR=/tmp/rebuild npx tsx scripts/${s.outLabel}
FDPM_DATA_DIR=/tmp/rebuild npx tsx scripts/${s.outLabel} --skip-invalid
\`\`\`
`;
}

const args = process.argv.slice(2);
if (args.length !== 2) {
  console.error("usage: generate-build-from-transfer.ts <transfer.json> <output.ts>");
  process.exit(2);
}
generate(resolve(args[0]!), resolve(args[1]!)).catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
