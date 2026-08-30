/**
 * fdpm.agent-memory — the agent-memory contract as an FDPM profile.
 *
 * ARCHITECTURAL REQUIREMENT: LLMs will always produce some form of error.
 * Absence of output verification is a design defect, not a runtime bug.
 * All LLM output must be treated as untrusted and validated explicitly.
 *
 * Profile id: profile:agent-memory:2.0
 * Domain:     episode-scoped agent memory — what a run observed, ran,
 *             concluded and decided, with claims replaced rather than
 *             overwritten so the account of how they changed survives.
 *
 * WHERE THE MODEL COMES FROM. `schemas/agent-memory.ts` is a copy of the
 * canonical contract, verbatim but for one mechanical import rewrite
 * performed by `scripts/vendor-agent-memory.ts`. Its digest and the
 * source's are recorded in `generated/schema-hash.json`. The source
 * lives in ANOTHER repository, so `--check` runs only where that
 * repository is present and no CI gate here can prove the copy current —
 * the provenance record is evidence of what was copied, not a guarantee
 * that it is the latest. That limit is stated rather than papered over.
 *
 * HOW THE IMPORT DIFFERS FROM THE CONTRACT. Three decisions, each argued
 * where it lands: the discriminated union becomes six primitive types
 * rather than one flattened type (`primitives.ts` RULE 1); `episode_id`
 * becomes an edge so the host enforces it (RULE 2); and the `superseded`
 * boolean is dropped because the edge already is the index (RULE 3).
 * The contract's own rules survive all three — they move from a merge
 * operator to the host's type checks plus five validators, and
 * `validators.ts` says which rule went where.
 *
 * WHAT IT DOES NOT CARRY. The contract's bounded merge operator has no
 * counterpart here: FDPM's write path is the host's, and the contract's
 * 64-operation ceiling is a property of that operator rather than of the
 * memory model. Episode reopening is likewise unenforced — a validator
 * sees the instance being written, never the one it replaces. Both are
 * named in the README under the same heading rather than left for a
 * reader to discover.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { DomainProfile } from "../../src/core/models/meta.js";
import type { PluginContext, PluginEntryModule } from "../../src/plugin/types.js";
import type { PluginManifest } from "../../src/plugin/manifest.js";
import {
  CATEGORIES,
  CONTRACT_VERSION,
  DEFAULT_SCOPE_SET,
  PLUGIN_ID,
  PROFILE_ID,
  PROFILE_VERSION,
  SCOPES,
  SCOPE_SETS,
} from "./ids.js";
import { ALL_PRIMITIVES } from "./primitives.js";
import { RELATIONS } from "./relations.js";
import { ENTITY_VALIDATORS } from "./validators.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const PROFILE: DomainProfile = {
  id: PROFILE_ID,
  version: PROFILE_VERSION,
  name: "Agent Memory",
  label: "Agent Memory 2.0",
  description:
    "Episode-scoped memory for an autonomous agent: facts with provenance, hypotheses that owe live evidence, the actions that produced them and the decisions derived from them. A claim is never overwritten — it is superseded by a later one, and the chain of replacements is the account of how it changed.",
  extends: [],
  categories: CATEGORIES,
  scopes: SCOPES,
  primitive_types: ALL_PRIMITIVES,
  relation_types: RELATIONS,
  validation_rules: [],
  renderer_bindings: [],
  renderers: [],
  inline_structs: [],
  templates: [],
  scope_sets: SCOPE_SETS,
  default_scope_set: DEFAULT_SCOPE_SET,
};

const manifestRaw = readFileSync(join(__dirname, "fdpm-plugin.json"), "utf8");
export const manifest: PluginManifest = JSON.parse(manifestRaw) as PluginManifest;

/**
 * activate(ctx) — deterministic, idempotent, no clock and no randomness.
 *
 * Manifest-runtime parity: what `fdpm-plugin.json` declares in
 * `capabilities[]` must equal what this function registers, or the host
 * emits a `manifest_runtime_mismatch` finding at load. A test asserts
 * the two lists agree so the parity is checked, not remembered.
 */
export async function activate(ctx: PluginContext): Promise<void> {
  ctx.registerProfile(PROFILE);

  for (const registration of ENTITY_VALIDATORS) {
    ctx.registerValidator(registration);
  }

  ctx.logger.info(
    `${PLUGIN_ID} activated: ${PROFILE.primitive_types.length} primitive types, ` +
      `${PROFILE.relation_types?.length ?? 0} relation types, ` +
      `${ENTITY_VALIDATORS.length} validator registrations. ` +
      `Profile id: ${PROFILE_ID}, derived from contract ${CONTRACT_VERSION}.`,
  );
}

export {
  CONTRACT_VERSION,
  HOST_COMPATIBILITY,
  PLUGIN_ID,
  PLUGIN_VERSION,
  PROFILE_ID,
  PROFILE_VERSION,
  CATEGORIES,
  RULE,
  SCOPES,
  T,
  R,
  VENDOR,
} from "./ids.js";
export { ALL_PRIMITIVES } from "./primitives.js";
export { RELATIONS } from "./relations.js";
export {
  ENTITY_VALIDATORS,
  episodePartition,
  episodeWritable,
  evidence,
  supersedeShape,
} from "./validators.js";

const entry: PluginEntryModule = { manifest, activate };
export default entry;
