/**
 * The six primitive types of the agent-memory profile.
 *
 * DERIVATION — where these come from, and the two decisions that shape
 * them.
 *
 * `schemas/agent-memory.ts` is a vendored copy of the canonical
 * contract. It models a memory store as ONE root document: a flat
 * `instances[]` discriminated on `kind`, a flat `relations[]`, and a
 * `schema_version`. FDPM's unit is a graph of primitives joined by typed
 * relations, so the import splits that document — and the two rules it
 * follows are the whole design.
 *
 * RULE 1 — the discriminated union becomes SIX TYPES, not one type with
 * a `kind` enum. The contract's union is already exhaustive and closed,
 * every arm carries a disjoint field set, and the contract's own id
 * pattern (`<kind>-[0-9a-f]{8}`) makes the kind readable off the id. A
 * single flattened type would have made eleven of its fifteen fields
 * optional and pushed every arm rule into a validator — the opposite
 * trade from `loop_forward`, where the unions sit in FIELD position and
 * cannot be lifted. Here the union is the instance, so the host's own
 * required-field and enum checks do the work, and `validators.ts` is
 * left with only the rules a per-field schema genuinely cannot express.
 *
 * RULE 2 — `episode_id` becomes an EDGE, not a field. On every
 * non-episode kind the contract carries an `episode_id` string and then
 * spends three semantic rules checking it: that the referent exists,
 * that it is an episode, and that no relation crosses from one episode
 * to another. As a field it is an opaque string the host never reads. As
 * `am:EpisodeHolds` the first two rules are the host's endpoint checks,
 * enforced per write, and the third becomes computable from the graph.
 * See `relations.ts`.
 *
 * WHAT IS NOT HERE. The contract's `MemoryStore` wrapper has no
 * primitive: `schema_version` is a property of the profile, not of an
 * instance, and a workbook carries its profile id already. The contract
 * version this was derived from is recorded on the profile and in
 * `generated/schema-hash.json`.
 */
import type { PrimitiveTypeDef } from "../../src/core/models/meta.js";
import { enumOf, idTemplate, primitive, shortText, stepField, str } from "./_common.js";
import {
  ACTION_OUTCOME,
  ARTIFACT_ROLE,
  CAT,
  EPISODE_STATUS,
  FACT_SOURCE,
  HYPOTHESIS_STATUS,
  T,
} from "./ids.js";

/**
 * The run an agent is having, and the unit everything else belongs to.
 *
 * `is_partition_unit` is true because the episode genuinely is one: no
 * relation may cross an episode boundary (see `relations.ts`), so a
 * workbook split along episodes cannot sever an edge. Every other
 * profile property follows from that — it is a claim the graph makes
 * good on, not a label.
 */
const episode = primitive({
  id: T.Episode,
  name: "Episode",
  category: CAT.partition,
  description:
    "One bounded run: what the agent set out to do, under which skill, and how it ended. Every other primitive belongs to exactly one episode, and only an active episode accepts writes.",
  id_format: idTemplate("am:episode:{slug}"),
  fields: [
    shortText("skill_id", "The skill or capability this run is executing under.", 128),
    str("objective", "What this run set out to accomplish."),
    enumOf(
      "status",
      "Lifecycle. Only `active` accepts writes; the other three are terminal and settle the episode's contents.",
      EPISODE_STATUS,
    ),
    shortText("started_at", "UTC instant the run began.", 32),
    stepField("horizon_step", "The step ceiling declared for this run. Owned by the runtime, never by the model."),
  ],
});

const episodeWithPartition: PrimitiveTypeDef = { ...episode, is_partition_unit: true };

/**
 * Something the agent takes to be the case.
 *
 * RULE 3 — the contract's `superseded` BOOLEAN IS NOT HERE. The contract
 * stores it and then spends a rule enforcing a biconditional: the flag
 * is true exactly when the fact has an outgoing supersession edge. That
 * redundancy exists because the contract's store is a flat document with
 * no index. Here the edge IS the index, so carrying both would mean
 * policing agreement between them — and the policing has a write-ordering
 * hazard with no good answer, since setting the flag and drawing the edge
 * are two writes and whichever lands first violates the biconditional.
 * Liveness is read off the graph instead: a fact is superseded exactly
 * when an `am:SupersededBy` edge leaves it. Nothing is lost, because a
 * contract store where the two disagree is one the contract already
 * rejects.
 *
 * A fact is never deleted or rewritten — it is replaced, and the
 * replacement is recorded, which is what lets a reader explain how a
 * claim changed rather than only what it changed to.
 */
const fact = primitive({
  id: T.Fact,
  name: "Fact",
  category: CAT.observation,
  description:
    "A claim the agent holds, with its provenance and the step it was observed at. Superseded facts are retained: the replacement is an edge, never an overwrite, and liveness is read off the graph rather than stored.",
  id_format: idTemplate("am:fact:{slug}"),
  fields: [
    str("claim", "The claim, as the agent would state it."),
    enumOf("source", "Where the claim came from: the environment, the agent's own reasoning, or the operator.", FACT_SOURCE),
    stepField("observed_at_step", "Step within the episode at which this was observed. A replacement must be observed strictly later than what it replaces."),
  ],
});

/**
 * A claim under test.
 *
 * A settled hypothesis owes evidence: `confirmed` requires at least one
 * supporting fact that is not itself superseded, `refuted` requires at
 * least one refuting fact, and either requires the step it was tested
 * at. `am:val:evidence` enforces all three, because none of them is
 * expressible as a per-field constraint.
 */
const hypothesis = primitive({
  id: T.Hypothesis,
  name: "Hypothesis",
  category: CAT.reasoning,
  description:
    "A claim the agent is testing. Settling it requires live evidence — a confirmed hypothesis resting only on superseded facts is refused.",
  id_format: idTemplate("am:hypothesis:{slug}"),
  fields: [
    str("statement", "The proposition under test."),
    enumOf("status", "Open, or settled in one of two directions.", HYPOTHESIS_STATUS),
    stepField("tested_at_step", "Step at which the hypothesis was settled. Required once status is not `open`.", {
      required: false,
    }),
  ],
});

const artifact = primitive({
  id: T.Artifact,
  name: "Artifact",
  category: CAT.observation,
  description: "A file the run read, wrote or referred to, and the step it was last seen at.",
  id_format: idTemplate("am:artifact:{slug}"),
  fields: [
    str("path", "Path to the artifact, as the run addressed it."),
    enumOf("role", "How the run related to it.", ARTIFACT_ROLE),
    stepField("last_seen_step", "Step at which the run last observed this artifact."),
  ],
});

const action = primitive({
  id: T.Action,
  name: "Action",
  category: CAT.observation,
  description:
    "Something the agent ran against its environment, and how it came out. The facts an action established hang off it by am:Produced.",
  id_format: idTemplate("am:action:{slug}"),
  fields: [
    str("command", "The command or tool call, as issued."),
    enumOf("outcome", "How it came out. `failure` is a command that ran and failed; `error` is one that could not run.", ACTION_OUTCOME),
    stepField("step", "Step at which the action was taken."),
    str("summary", "What the action showed, in one line.", { required: false }),
  ],
});

const decision = primitive({
  id: T.Decision,
  name: "Decision",
  category: CAT.reasoning,
  description:
    "A choice the agent made and the facts it rested on. The facts hang off it by am:DerivedFrom, so a decision whose grounds were later replaced is traceable.",
  id_format: idTemplate("am:decision:{slug}"),
  fields: [
    str("choice", "What was decided."),
    str("rationale", "Why. Absent when the choice was forced rather than reasoned.", { required: false }),
    stepField("step", "Step at which the decision was made."),
  ],
});

export const ALL_PRIMITIVES: PrimitiveTypeDef[] = [
  episodeWithPartition,
  fact,
  hypothesis,
  artifact,
  action,
  decision,
];
