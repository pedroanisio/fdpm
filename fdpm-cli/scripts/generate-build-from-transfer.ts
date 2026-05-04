/**
 * generate-build-from-transfer.ts — Code-generate a SDK-based project
 * builder script from a ProjectTransfer JSON file.
 *
 * Usage:
 *   npx tsx scripts/generate-build-from-transfer.ts <transfer.json> <output.ts>
 *
 * Produces a runnable script that, when executed, calls
 * `defineProject(host, ...).primitives([...]).relations([...]).commit()`
 * to recreate the project's contents through the SDK.
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
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Host } from "../src/core/host.js";
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
  project: {
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
  if (!host.profiles.has(transfer.project.profile_id)) {
    const available = host.profiles
      .listRaw()
      .map((p) => p.id)
      .sort()
      .join(", ");
    throw new Error(
      `Transfer references profile "${transfer.project.profile_id}" but it is not registered. ` +
        `Available profiles: ${available || "(none)"}. ` +
        `Ensure the plugin that defines this profile is built and discoverable, then retry.`,
    );
  }
  const profile = host.profiles.getResolved(transfer.project.profile_id);
  // Build a typed primitives map up front so it can be reused for
  // both the per-primitive validate pass (no use today, but cheap)
  // and the per-relation validate pass (endpoint-existence and
  // endpoint-type checks rely on it).
  const primMap = new Map<string, PrimitiveInstance>();
  for (const p of transfer.primitives) {
    const inst: PrimitiveInstance = {
      id: p.id,
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
    typeof transfer.project?.profile_id !== "string" ||
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
  const sourceLabel = transferPath.replace(/.*[\\/]/, "");
  const outLabel = outPath.replace(/.*[\\/]/, "");

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

  const script = `/**
 * AUTO-GENERATED by scripts/generate-build-from-transfer.ts.
 * Source: ${sourceLabel}
 *
 * Recreates the project through the @fdpm/cli SDK. Output is
 * deterministic per (source-transfer, generator-version, active-
 * profile) — re-running the generator on the same input yields a
 * byte-identical script, so CI can detect drift via \`git diff\`.
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

import {
  openHost,
  defineProject,
  type PrimitiveSpec,
  type RelationSpec,
} from "${sdkImport}";

const PROJECT_ID = ${JSON.stringify(transfer.project.id)};
const PROJECT_NAME = ${JSON.stringify(transfer.project.name)};
// Profile id inlined from the source transfer. The generator does not
// import a typed PROFILE_ID constant from a specific plugin — that
// would tie the generated script to one profile only. If you rename
// this profile, regenerate.
const PROFILE_ID = ${JSON.stringify(transfer.project.profile_id)};

/**
 * Primitive ids whose field shapes are known to violate the active
 * profile's validation rules. Run with --skip-invalid to elide them.
 * The list is stable per generation; if the source transfer changes,
 * regenerate this script.
 */
const KNOWN_INVALID_PRIMITIVES = new Set<string>(${stableJson(knownInvalidPrimitives, 2)});

/** Same, for relations (typically: enum mismatches on \`kind\`). */
const KNOWN_INVALID_RELATIONS = new Set<string>(${stableJson(knownInvalidRelations, 2)});

const PRIMITIVES: PrimitiveSpec[] = ${stableJson(primitiveSpecs, 2)};

const RELATIONS: RelationSpec[] = ${stableJson(relationSpecs, 2)};

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
  console.log("Built project:", result.project_id);
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

  writeFileSync(outPath, script);
  console.log(`Wrote ${outPath}`);
  console.log(`  primitives: ${transfer.primitives.length} (${knownInvalidPrimitives.length} known-invalid)`);
  console.log(`  relations:  ${transfer.relations.length} (${knownInvalidRelations.length} known-invalid)`);
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
