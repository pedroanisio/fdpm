/**
 * The six relation types of the agent-memory profile.
 *
 * Five mirror the contract's `RELATION_SPECS`. The sixth,
 * `am:EpisodeHolds`, is the contract's `episode_id` field lifted to an
 * edge — see `primitives.ts` RULE 2 for why.
 *
 * DIRECTION IS THE CONTRACT. `am:SupersededBy` runs from the stale fact
 * to the fact that replaced it, so the edge reads in its own direction:
 * SOURCE is superseded BY TARGET. The contract carried the same edge
 * under the name `supersedes`, which asserted the inverse of what it
 * encoded — an agent reading the type surface would emit the edge
 * backwards and be refused with a message that read as nonsense. The
 * name here is the one the contract settled on; it is not a synonym to
 * be normalized away by a later reader.
 *
 * ENDPOINT CHECKS ARE THE HOST'S. `source_types` and `target_types` are
 * what make the contract's referential rules ("this relation starts at a
 * fact, not an action"; "that endpoint does not exist") enforced per
 * write rather than restated in a validator. `validators.ts` covers only
 * what these cannot: cardinality per source, acyclicity, the partition
 * boundary, step ordering and the evidence rules.
 */
import type { RelationTypeDef } from "../../src/core/models/meta.js";
import { HELD_TYPES, R, T } from "./ids.js";

function edge(args: {
  id: string;
  name: string;
  description: string;
  source: string;
  target: string | readonly string[];
  cardinality?: RelationTypeDef["cardinality"];
}): RelationTypeDef {
  return {
    id: args.id,
    name: args.name,
    description: args.description,
    source_types: [args.source],
    target_types: typeof args.target === "string" ? [args.target] : [...args.target],
    cardinality: args.cardinality ?? "many-to-one",
    fields: [],
    symmetric: false,
    transitive: false,
  };
}

export const RELATIONS: RelationTypeDef[] = [
  edge({
    id: R.EpisodeHolds,
    name: "EpisodeHolds",
    description:
      "Composition: the held primitive dies with the episode. Exactly one of these targets each non-episode instance — a second is refused by am:val:episode-partition, because two owners make the partition, and therefore every rule built on it, undefined.",
    source: T.Episode,
    target: HELD_TYPES,
    cardinality: "one-to-many",
  }),
  edge({
    id: R.SupersededBy,
    name: "SupersededBy",
    description:
      "SOURCE is superseded BY TARGET. At most one leaves any fact, the chain may not close on itself, and the target must have been observed strictly later than the source — which is what makes the chain a history rather than a set of pointers.",
    source: T.Fact,
    target: T.Fact,
    cardinality: "many-to-one",
  }),
  edge({
    id: R.Supports,
    name: "Supports",
    description:
      "This fact is evidence for the hypothesis. A confirmed hypothesis needs at least one of these whose source is not itself superseded.",
    source: T.Fact,
    target: T.Hypothesis,
    cardinality: "many-to-many",
  }),
  edge({
    id: R.Refutes,
    name: "Refutes",
    description: "This fact is evidence against the hypothesis. A refuted hypothesis needs at least one.",
    source: T.Fact,
    target: T.Hypothesis,
    cardinality: "many-to-many",
  }),
  edge({
    id: R.Produced,
    name: "Produced",
    description: "The action established this fact. Provenance for anything sourced from the environment.",
    source: T.Action,
    target: T.Fact,
    cardinality: "one-to-many",
  }),
  edge({
    id: R.DerivedFrom,
    name: "DerivedFrom",
    description:
      "The decision rested on this fact. Following it to a superseded fact is how a decision made on stale grounds is found.",
    source: T.Decision,
    target: T.Fact,
    cardinality: "many-to-many",
  }),
];
