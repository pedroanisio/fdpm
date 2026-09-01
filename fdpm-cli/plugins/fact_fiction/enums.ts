/**
 * Closed value sets, carried over verbatim from the fact-fiction Zod
 * spike (~/spikes/schemas/narrative/fact-fiction/enums.ts, spec 0.2.0).
 * The names are snake_cased field vocabulary, not TypeScript enums:
 * the core's Enum[...] field check is the enforcement point.
 */

/** Epistemic grading of a narrative element vs the historical record. */
export const HISTORICITY_LEVELS = [
  "documented_fact",
  "strong_inference",
  "plausible_inference",
  "invented_but_constrained",
  "fully_invented",
] as const;

/** Point-of-view mode for the narrative voice. */
export const NARRATIVE_POVS = [
  "first_person",
  "third_person_limited",
  "third_person_omniscient",
  "epistolary",
  "multi_pov",
  "documentary",
  "unreliable_narrator",
] as const;

/** How the narrative handles temporal ordering of events. */
export const TEMPORAL_MODES = [
  "linear",
  "framed_retelling",
  "flashback",
  "non_linear",
  "archival_reconstruction",
] as const;

/** Dominant emotional register of the prose. */
export const TONES = [
  "lyrical",
  "plain",
  "scholarly",
  "dramatic",
  "intimate",
  "detached",
  "satirical",
  "grim",
  "romantic",
] as const;

/** The specific kind of literary invention applied. */
export const FICTION_MECHANISMS = [
  "invented_character",
  "invented_dialogue",
  "invented_scene",
  "invented_motivation",
  "invented_private_thought",
  "compressed_timeline",
  "composite_character",
  "speculative_gap_fill",
] as const;

/** Classification of the historical source material. */
export const SOURCE_TYPES = [
  "primary_source",
  "secondary_source",
  "archaeological",
  "oral_history",
  "scholarly_consensus",
  "author_assumption",
] as const;

/** Domain a historical constraint applies to. */
export const CONSTRAINT_KINDS = [
  "chronology",
  "geography",
  "material_culture",
  "social_norm",
  "political_structure",
  "language_register",
  "technology_limit",
  "religious_custom",
  "legal_constraint",
] as const;

/** Typed edge between a fiction element and a factual anchor. */
export const LINK_RELATIONS = [
  "directly_depends_on",
  "plausibly_extends",
  "dramatizes",
  "fills_gap_in",
  "reframes",
  "compresses",
  "contradicts",
] as const;

/** Qualitative reliability assessment of a historical source. */
export const RELIABILITY_LEVELS = ["high", "medium", "low", "unknown"] as const;

/** Hard = anachronism/impossibility; soft = implausibility. */
export const CONSTRAINT_SEVERITIES = ["hard", "soft"] as const;

/** Qualitative confidence band (core/epistemics ConfidenceLevelEnum). */
export const CONFIDENCE_LEVELS = [
  "very_low",
  "low",
  "moderate",
  "high",
  "verified",
] as const;

/** Degree of archaic diction in the prose. */
export const ARCHAIC_LEVELS = ["none", "light", "moderate", "high"] as const;

/** How freely modern idioms may appear. */
export const IDIOMATIC_FREEDOMS = ["low", "medium", "high"] as const;

/** Psychic distance between narrator and narrated events. */
export const NARRATOR_DISTANCES = ["close", "medium", "distant"] as const;

/** Narrator reliability, scoped to historical fiction. */
export const NARRATIVE_RELIABILITIES = [
  "reliable",
  "partially_reliable",
  "unreliable",
] as const;
