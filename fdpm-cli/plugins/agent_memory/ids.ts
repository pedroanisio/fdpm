/**
 * Type ids, categories, scopes and closed vocabularies for the
 * agent-memory profile.
 *
 * Every id the profile, the ingest, the validators and the renderer
 * address is declared here once. A validator that hard-codes `"am:Fact"`
 * inline cannot be found by a grep for the type it guards, and a rename
 * then leaves it silently matching nothing — the failure mode is a rule
 * that never fires, not an error.
 */
import type { CategoryDef, ScopeDef } from "../../src/core/models/meta.js";

export const VENDOR = "am" as const;
export const PROFILE_ID = "profile:agent-memory:2.0" as const;
export const PLUGIN_ID = "fdpm.agent-memory" as const;
export const PLUGIN_VERSION = "0.1.0" as const;
export const PROFILE_VERSION = "2.0.0" as const;
export const HOST_COMPATIBILITY = ">=1.1,<2" as const;

/** The contract version this profile was derived from. */
export const CONTRACT_VERSION = "2.0.0" as const;

/** Primitive type ids — one per instance kind the contract defines. */
export const T = {
  Episode: "am:Episode",
  Fact: "am:Fact",
  Hypothesis: "am:Hypothesis",
  Artifact: "am:Artifact",
  Action: "am:Action",
  Decision: "am:Decision",
} as const;

/** The five kinds an episode holds. `am:Episode` is the container, never held. */
export const HELD_TYPES = [T.Fact, T.Hypothesis, T.Artifact, T.Action, T.Decision] as const;

/**
 * Relation type ids.
 *
 * `am:EpisodeHolds` has no counterpart in the contract's relation list:
 * it is the contract's `episode_id` FIELD, lifted to an edge. Left as a
 * field it is an opaque string the host never checks, and the partition
 * rule ("a relation may not cross episodes") has nothing to read. As an
 * edge the host enforces endpoint existence and endpoint kind on every
 * write, and the partition rule becomes computable.
 */
export const R = {
  EpisodeHolds: "am:EpisodeHolds",
  SupersededBy: "am:SupersededBy",
  Supports: "am:Supports",
  Refutes: "am:Refutes",
  Produced: "am:Produced",
  DerivedFrom: "am:DerivedFrom",
} as const;

export const CAT = {
  partition: "cat:agent-memory:partition",
  observation: "cat:agent-memory:observation",
  reasoning: "cat:agent-memory:reasoning",
} as const;

/**
 * Three categories, matching the three questions the contract answers:
 * what run this belongs to, what was seen or done, and what was
 * concluded from it.
 */
export const CATEGORIES: CategoryDef[] = [
  {
    id: CAT.partition,
    name: "Partition",
    description:
      "Episodes. Every other primitive belongs to exactly one, and no relation crosses the boundary.",
  },
  {
    id: CAT.observation,
    name: "Observation",
    description:
      "What the agent saw, ran and touched: facts, the actions that produced them, and the artifacts they refer to.",
  },
  {
    id: CAT.reasoning,
    name: "Reasoning",
    description:
      "What the agent concluded and why: hypotheses standing on live evidence, and decisions derived from facts.",
  },
];

export const SCOPE_ID = "scope:agent-memory:workbook" as const;

export const SCOPES: ScopeDef[] = [
  {
    id: SCOPE_ID,
    name: "Workbook",
    rank: 1,
    description: "Workbook-level scope; every agent-memory primitive lives here.",
  },
];

export const SCOPE_SETS: Record<string, string[]> = {};
export const DEFAULT_SCOPE_SET = "";

// -- Closed vocabularies, mirrored from the contract --------------------

export const EPISODE_STATUS = ["active", "complete", "failed", "abandoned"] as const;
export const FACT_SOURCE = ["observation", "inference", "user"] as const;
export const HYPOTHESIS_STATUS = ["open", "confirmed", "refuted"] as const;
export const ARTIFACT_ROLE = ["input", "output", "reference"] as const;
export const ACTION_OUTCOME = ["success", "failure", "error"] as const;

/** The one episode status that accepts writes. */
export const WRITABLE_STATUS = "active" as const;

/**
 * The bound on replacements leaving one fact, from the contract's
 * `RELATION_SPECS.superseded_by.maxPerSource`. Owned by this code, not
 * by whatever proposes the write.
 */
export const MAX_REPLACEMENTS_PER_FACT = 1;

/** Validator rule ids. Each is quoted in a finding and asserted by a test. */
export const RULE = {
  supersedeShape: "am:val:supersede-shape",
  evidence: "am:val:evidence",
  episodePartition: "am:val:episode-partition",
  episodeWritable: "am:val:episode-writable",
} as const;

/** Renderer id for the supersession-timeline view. */
export const SUPERSESSION_TIMELINE_RENDERER_ID = "am:SupersessionTimelineRenderer" as const;
