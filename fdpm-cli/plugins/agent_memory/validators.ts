/**
 * The rules a per-field schema cannot express.
 *
 * ARCHITECTURAL REQUIREMENT: LLMs will always produce some form of error.
 * Absence of output verification is a design defect, not a runtime bug.
 * All LLM output must be treated as untrusted and validated explicitly.
 *
 * WHAT IS NOT HERE, AND WHY. The import pushed as much of the contract
 * as it could onto the host: required fields, closed enums and the
 * non-negative step floor come from the PrimitiveTypeDefs; endpoint
 * existence and endpoint kind come from each RelationTypeDef's
 * `source_types`/`target_types`. Restating any of those here would
 * produce two findings for one defect. What remains are the five rules
 * that need to look at more than one record at a time.
 *
 * WHAT A VALIDATOR CAN SEE. The host hands each validator the instance
 * under write, plus a context carrying the workbook's relations and —
 * since `ValidatorContext` gained the field this profile needed — the
 * workbook slice. Two rules read a sibling primitive's fields through
 * it: step ordering across a supersession edge, and whether the owning
 * episode still accepts writes. Neither can be answered from the edge
 * list alone.
 *
 * WHEN THE CONTEXT IS ABSENT the rule that needs it emits an error
 * saying so. It does not pass. A control that quietly stands down when
 * its input is missing is not a control, and the pipeline can be driven
 * from callers that supply no workbook — so the absent case is a real
 * branch with a real test, not a defensive nicety.
 */
import type { PrimitiveInstance, RelationInstance, ValidationFinding } from "../../src/core/models/instance.js";
import type { ValidatorContext, ValidatorFn, ValidatorRegistration } from "../../src/plugin/types.js";
import {
  HELD_TYPES,
  MAX_REPLACEMENTS_PER_FACT,
  R,
  RULE,
  T,
  WRITABLE_STATUS,
} from "./ids.js";

// -- Shared shapes ------------------------------------------------------

function finding(
  ruleId: string,
  targetId: string,
  field: string | null,
  message: string,
): ValidationFinding {
  return {
    level: "error",
    rule_id: ruleId,
    target_id: targetId,
    field_path: field === null ? null : `field_values.${field}`,
    message,
  };
}

const isRelation = (value: PrimitiveInstance | RelationInstance): value is RelationInstance =>
  Object.hasOwn(value, "source_id") && Object.hasOwn(value, "target_id");

/** Relations of one type, with the instance under write folded in if the host has not committed it yet. */
function edgesOfType(
  context: ValidatorContext | undefined,
  typeId: string,
  including?: RelationInstance,
): RelationInstance[] {
  const seen = new Map<string, RelationInstance>();
  for (const relation of context?.relations ?? []) {
    if (relation.type_id === typeId) seen.set(relation.id, relation);
  }
  if (including !== undefined && including.type_id === typeId) seen.set(including.id, including);
  return [...seen.values()];
}

/** The episode holding `instanceId`, or undefined when nothing holds it yet. */
function holderOf(
  context: ValidatorContext | undefined,
  instanceId: string,
  including?: RelationInstance,
): string | undefined {
  for (const edge of edgesOfType(context, R.EpisodeHolds, including)) {
    if (edge.target_id === instanceId) return edge.source_id;
  }
  return undefined;
}

/** A primitive's stored fields, or undefined when the workbook slice was not supplied. */
function primitiveOf(context: ValidatorContext | undefined, id: string): PrimitiveInstance | undefined {
  return context?.workbook?.primitives[id];
}

const CONTEXT_MISSING =
  "the workbook slice was not supplied to this validator, so the rule could not be evaluated; " +
  "it is refused rather than skipped";

// -- am:val:supersede-shape --------------------------------------------

/**
 * The four rules that make a supersession chain a history.
 *
 * A fact may not be superseded by itself; at most one replacement may
 * leave any fact, or "current" is undefined; the chain may not close on
 * itself, for the same reason; and the replacement must have been
 * observed strictly after what it replaces, without which the chain
 * records only that a claim changed, never in what order.
 *
 * The strict ordering also makes a cycle unreachable in a graph that
 * satisfies it. The cycle walk is kept anyway: it is the rule that still
 * holds when the ordering rule cannot run.
 */
export const supersedeShape: ValidatorFn = (instance, _type, _profile, context) => {
  if (!isRelation(instance) || instance.type_id !== R.SupersededBy) return [];
  const edge = instance;
  const findings: ValidationFinding[] = [];
  const at = (message: string, field: string | null = null) =>
    findings.push(finding(RULE.supersedeShape, edge.id, field, message));

  if (edge.source_id === edge.target_id) {
    at(`a fact may not be superseded by itself (${edge.source_id})`, null);
    return findings;
  }

  const chain = edgesOfType(context, R.SupersededBy, edge);

  const leaving = chain.filter((candidate) => candidate.source_id === edge.source_id);
  if (leaving.length > MAX_REPLACEMENTS_PER_FACT) {
    at(
      `fact ${edge.source_id} names ${leaving.length} replacements, above the bound of ` +
        `${MAX_REPLACEMENTS_PER_FACT}; with more than one, "current" is undefined`,
    );
  }

  const next = new Map<string, string>();
  for (const candidate of chain) next.set(candidate.source_id, candidate.target_id);
  const seen = new Set<string>([edge.source_id]);
  let cursor: string | undefined = edge.target_id;
  while (cursor !== undefined) {
    if (seen.has(cursor)) {
      at(`supersession chain through ${edge.source_id} is cyclic`);
      break;
    }
    seen.add(cursor);
    cursor = next.get(cursor);
  }

  const stale = primitiveOf(context, edge.source_id);
  const fresh = primitiveOf(context, edge.target_id);
  if (context?.workbook === undefined) {
    at(`am:SupersededBy step ordering: ${CONTEXT_MISSING}`);
  } else if (stale === undefined || fresh === undefined) {
    // Endpoint existence is the host's check and will already have
    // fired; saying it twice would double the findings for one defect.
    return findings;
  } else {
    const staleStep = stale.field_values["observed_at_step"];
    const freshStep = fresh.field_values["observed_at_step"];
    if (typeof staleStep !== "number" || typeof freshStep !== "number") {
      at(`observed_at_step is not readable on both endpoints of ${edge.id}`);
    } else if (freshStep <= staleStep) {
      at(
        `a replacement must be observed after the fact it replaces: ` +
          `${edge.target_id} at step ${freshStep} does not follow ${edge.source_id} at step ${staleStep}`,
      );
    }
  }

  return findings;
};

// -- am:val:evidence ----------------------------------------------------

/**
 * What a settled hypothesis owes.
 *
 * Liveness is read off the graph: a fact is superseded exactly when an
 * `am:SupersededBy` edge leaves it (see `primitives.ts` RULE 3), so
 * "rests only on superseded facts" is answerable from the edge list
 * alone and needs no workbook slice.
 */
export const evidence: ValidatorFn = (instance, _type, _profile, context) => {
  if (isRelation(instance) || instance.type_id !== T.Hypothesis) return [];
  const findings: ValidationFinding[] = [];
  const at = (message: string, field: string | null) =>
    findings.push(finding(RULE.evidence, instance.id, field, message));

  const status = instance.field_values["status"];
  if (typeof status !== "string") return [];

  const supersededFacts = new Set(
    edgesOfType(context, R.SupersededBy).map((edge) => edge.source_id),
  );
  const sourcesOf = (typeId: string): string[] =>
    edgesOfType(context, typeId)
      .filter((edge) => edge.target_id === instance.id)
      .map((edge) => edge.source_id);

  if (status === "confirmed") {
    const supporting = sourcesOf(R.Supports);
    if (supporting.length === 0) {
      at("a confirmed hypothesis requires at least one supporting fact", "status");
    } else if (supporting.every((id) => supersededFacts.has(id))) {
      at(
        `a confirmed hypothesis rests only on superseded facts (${supporting.join(", ")}); ` +
          "confirm it against a live one or reopen it",
        "status",
      );
    }
  }

  if (status === "refuted" && sourcesOf(R.Refutes).length === 0) {
    at("a refuted hypothesis requires at least one refuting fact", "status");
  }

  if (status !== "open" && instance.field_values["tested_at_step"] === undefined) {
    at(`a ${status} hypothesis must record the step it was tested at`, "tested_at_step");
  }

  return findings;
};

// -- am:val:episode-partition ------------------------------------------

/**
 * The partition boundary.
 *
 * Two rules, both about `am:EpisodeHolds`. Each held instance has
 * exactly one holder, because two make the partition — and every rule
 * built on it — undefined. And no other edge may join instances held by
 * different episodes, which is what lets `am:Episode` claim
 * `is_partition_unit` honestly: a workbook split along episodes cannot
 * sever an edge.
 *
 * An edge drawn before its endpoints are attached is refused. Attach
 * first, then relate — the ordering is documented in the README because
 * it is a real constraint on a batch, not an accident.
 */
export const episodePartition: ValidatorFn = (instance, _type, _profile, context) => {
  if (!isRelation(instance)) return [];
  const edge = instance;
  const findings: ValidationFinding[] = [];
  const at = (message: string) => findings.push(finding(RULE.episodePartition, edge.id, null, message));

  if (edge.type_id === R.EpisodeHolds) {
    const holders = edgesOfType(context, R.EpisodeHolds, edge)
      .filter((candidate) => candidate.target_id === edge.target_id)
      .map((candidate) => candidate.source_id);
    const distinct = [...new Set(holders)];
    if (distinct.length > 1) {
      at(
        `${edge.target_id} is held by ${distinct.length} episodes (${distinct.join(", ")}); ` +
          "exactly one episode holds each instance",
      );
    }
    return findings;
  }

  const sourceEpisode = holderOf(context, edge.source_id);
  const targetEpisode = holderOf(context, edge.target_id);
  if (sourceEpisode === undefined || targetEpisode === undefined) {
    const loose = sourceEpisode === undefined ? edge.source_id : edge.target_id;
    at(
      `${loose} is not held by any episode, so ${edge.id} cannot be placed in the partition; ` +
        "attach both endpoints with am:EpisodeHolds before relating them",
    );
    return findings;
  }
  if (sourceEpisode !== targetEpisode) {
    at(
      `a relation may not cross episodes: ${edge.source_id} is held by ${sourceEpisode} ` +
        `and ${edge.target_id} by ${targetEpisode}`,
    );
  }
  return findings;
};

// -- am:val:episode-writable -------------------------------------------

/**
 * A settled episode accepts no writes.
 *
 * On a held primitive the rule fires only once the instance has a
 * holder: a freshly created instance has none yet, and refusing it there
 * would make it impossible to create anything. The gap closes at attach
 * time, because the same rule runs on `am:EpisodeHolds` — so an instance
 * cannot be attached to a settled episode, and one already attached
 * cannot be patched.
 *
 * WHAT THIS DOES NOT COVER, stated rather than implied: a validator sees
 * the instance being written, never the one it replaces, so an episode
 * moving from `complete` back to `active` is indistinguishable here from
 * one created active. Reopening is therefore NOT refused by this rule.
 * The contract's own merge operator caught it by comparing against
 * stored state, which is a host capability this profile does not have.
 */
function writabilityFor(
  context: ValidatorContext | undefined,
  targetId: string,
  episodeId: string | undefined,
): ValidationFinding[] {
  if (episodeId === undefined) return [];
  if (context?.workbook === undefined) {
    return [finding(RULE.episodeWritable, targetId, null, `am:Episode status: ${CONTEXT_MISSING}`)];
  }
  const episode = primitiveOf(context, episodeId);
  if (episode === undefined) return [];
  const status = episode.field_values["status"];
  if (status === WRITABLE_STATUS) return [];
  return [
    finding(
      RULE.episodeWritable,
      targetId,
      null,
      `episode ${episodeId} is ${String(status)} and accepts no writes`,
    ),
  ];
}

export const episodeWritable: ValidatorFn = (instance, _type, _profile, context) => {
  if (isRelation(instance)) {
    const edge = instance;
    const episodeId =
      edge.type_id === R.EpisodeHolds ? edge.source_id : holderOf(context, edge.source_id, edge);
    return writabilityFor(context, edge.id, episodeId);
  }
  return writabilityFor(context, instance.id, holderOf(context, instance.id));
};

// -- Registrations ------------------------------------------------------

const ALL_RELATION_TYPES = [
  R.EpisodeHolds,
  R.SupersededBy,
  R.Supports,
  R.Refutes,
  R.Produced,
  R.DerivedFrom,
] as const;

/**
 * One registration per (type, rule) pair the host must dispatch.
 *
 * `fdpm-plugin.json` declares the same list; the host emits a
 * `manifest_runtime_mismatch` finding at load if the two disagree, so
 * this array and that file are kept in step by a test rather than by
 * care.
 */
export const ENTITY_VALIDATORS: ValidatorRegistration[] = [
  { type_id: R.SupersededBy, rule_id: RULE.supersedeShape, fn: supersedeShape },
  { type_id: T.Hypothesis, rule_id: RULE.evidence, fn: evidence },
  ...ALL_RELATION_TYPES.map((type_id) => ({
    type_id,
    rule_id: RULE.episodePartition,
    fn: episodePartition,
  })),
  ...ALL_RELATION_TYPES.map((type_id) => ({
    type_id,
    rule_id: RULE.episodeWritable,
    fn: episodeWritable,
  })),
  ...HELD_TYPES.map((type_id) => ({
    type_id,
    rule_id: RULE.episodeWritable,
    fn: episodeWritable,
  })),
];
