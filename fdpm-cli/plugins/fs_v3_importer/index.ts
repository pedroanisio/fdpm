/**
 * fs-v3 importer — `cap:importer` plugin.
 *
 * Translates the legacy `{primitives, relations}` dump shape (used by
 * the formal-specification roadmap exports) into a canonical
 * ProjectTransfer that the Core import path accepts.
 *
 * The transformation is documented in fdpm-plugin.json `description`.
 * Round-trip property: every primitive/relation in the source surfaces
 * as a corresponding instance in the output, with provenance preserved
 * either as a structured field_value (relations) or dropped explicitly
 * (primitives — Core's PrimitiveInstance has no metadata slot).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { z } from "zod";
import type {
  PluginContext,
  PluginEntryModule,
  ImporterOptions,
} from "../../src/plugin/types.js";
import type { PluginManifest } from "../../src/plugin/manifest.js";
import type {
  ProjectTransfer,
  PrimitiveInstance,
  RelationInstance,
} from "../../src/core/models/instance.js";
import { FDPMException } from "../../src/core/errors/fdpm-exception.js";
import { mintUid } from "../../src/core/identity/uid.js";
import { PROFILE_ID as FORMAL_SPEC_PROFILE_ID } from "../formal_specification/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// -- Source schema (the dump shape) ---------------------------------------

const FsV3Primitive = z
  .object({
    id: z.string().min(1),
    type_id: z.string().min(1),
    profile_id: z.string().min(1).optional(),
    scope: z.string().nullable().optional(),
    fields: z.record(z.unknown()).default({}),
    metadata: z.record(z.unknown()).optional(),
  })
  .passthrough();

const FsV3Relation = z
  .object({
    id: z.string().min(1),
    type_id: z.string().min(1),
    source: z.string().min(1),
    target: z.string().min(1),
    metadata: z.record(z.unknown()).optional(),
    strength: z.string().optional(),
  })
  .passthrough();

const FsV3Dump = z
  .object({
    primitives: z.array(FsV3Primitive),
    relations: z.array(FsV3Relation),
  })
  .strict();
export type FsV3Dump = z.infer<typeof FsV3Dump>;

// -- Defaults --------------------------------------------------------------

export const FS_V3_DEFAULTS = {
  projectId: "fs-v3-import",
  projectName: "FS-v3 Import",
  profileId: FORMAL_SPEC_PROFILE_ID,
} as const;

// -- Importer --------------------------------------------------------------

export function fsV3Importer(
  raw: unknown,
  options?: ImporterOptions,
): ProjectTransfer {
  const parsed = FsV3Dump.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    // Throw a typed FDPMException(verification) so the runtime's
    // exception barrier can recognise this as input-shape rejection
    // (the operator handed the wrong file) rather than a plugin
    // defect, and skip the quarantine path. A plain Error here would
    // be caught by the §6.4 barrier and quarantine this importer
    // every time the operator typo'd a file path — wrong outcome.
    throw new FDPMException(
      "verification",
      `fs-v3 importer: input does not match {primitives,relations} shape (${
        issue ? `${issue.path.join(".")}: ${issue.message}` : "no detail"
      })`,
      {
        evidence: {
          issues: parsed.error.issues,
          format: "fs-v3",
        },
      },
    );
  }
  const dump = parsed.data;

  // Profile id: prefer explicit option, then the most common profile_id
  // in the primitives, then the documented default.
  const declaredProfile = pickDominantProfileId(dump);
  const profileId =
    (options?.extra?.["profileId"] as string | undefined) ??
    declaredProfile ??
    FS_V3_DEFAULTS.profileId;

  const projectId = options?.projectId ?? FS_V3_DEFAULTS.projectId;
  const projectName = options?.projectName ?? FS_V3_DEFAULTS.projectName;

  const primitives: PrimitiveInstance[] = dump.primitives.map(toPrimitive);
  const relations: RelationInstance[] = dump.relations.map(toRelation);

  const transfer: ProjectTransfer = {
    spec_core: "1.1",
    project: {
      id: projectId,
      name: projectName,
      profile_id: profileId,
      created_at: new Date().toISOString(),
      revision: 0,
      ...(options?.projectDescription != null && {
        description: options.projectDescription,
      }),
    },
    primitives,
    relations,
    templates: [],
    test_suites: [],
  };
  return transfer;
}

function pickDominantProfileId(dump: FsV3Dump): string | undefined {
  const counts = new Map<string, number>();
  for (const p of dump.primitives) {
    if (p.profile_id) counts.set(p.profile_id, (counts.get(p.profile_id) ?? 0) + 1);
  }
  let best: string | undefined;
  let bestN = -1;
  for (const [id, n] of counts) {
    if (n > bestN) {
      bestN = n;
      best = id;
    }
  }
  return best;
}

function toPrimitive(p: z.infer<typeof FsV3Primitive>): PrimitiveInstance {
  // PrimitiveInstance.scope_id is optional; drop null/undefined silently.
  // Per-record metadata (created_at/provenance/etc.) has no Core slot —
  // dropping it explicitly is a documented part of the contract above.
  //
  // field_values pass through unvalidated here. The downstream caller
  // (`host-extra.ts importTransfer`) issues a `primitive.create`
  // operation per primitive, which runs the §7 validation pipeline
  // against the active profile. Any field shape, enum, or required-
  // field violation surfaces as a `validation`-category FDPMException
  // at import time — not silently accepted by the importer.
  //
  // SPEC-UID: legacy fs-v3 records carry no uid. The importer mints a
  // fresh ULID here so the resulting ProjectTransfer satisfies the v1.2
  // schema. Operators pulling fs-v3 data are starting fresh from a
  // legacy export — there's no upstream uid to preserve.
  return {
    id: p.id,
    uid: mintUid(),
    type_id: p.type_id,
    field_values: p.fields ?? {},
    revision: 0,
    ...(p.scope != null && p.scope !== "" && { scope_id: p.scope }),
  };
}

function toRelation(r: z.infer<typeof FsV3Relation>): RelationInstance {
  // Fold metadata + strength into field_values so nothing is lost. If
  // either collides with a future relation-type field, the operator can
  // strip them via field-patch.
  const field_values: Record<string, unknown> = {};
  if (r.metadata && Object.keys(r.metadata).length > 0)
    field_values["_metadata"] = r.metadata;
  if (r.strength != null) field_values["_strength"] = r.strength;
  return {
    id: r.id,
    uid: mintUid(),
    type_id: r.type_id,
    source_id: r.source,
    target_id: r.target,
    field_values,
    revision: 0,
  };
}

// -- Plugin entry ----------------------------------------------------------

const manifestRaw = readFileSync(join(__dirname, "fdpm-plugin.json"), "utf8");
export const manifest: PluginManifest = JSON.parse(manifestRaw) as PluginManifest;

export async function activate(ctx: PluginContext): Promise<void> {
  ctx.registerImporter({ format: "fs-v3", fn: fsV3Importer });
  ctx.logger.info("fs-v3 importer registered");
}

const entry: PluginEntryModule = { manifest, activate };
export default entry;
