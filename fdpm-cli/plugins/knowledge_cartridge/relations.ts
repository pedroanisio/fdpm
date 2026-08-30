/**
 * The six relation types of the knowledge-cartridge profile.
 *
 * One of them carries the load. `kc:CitesSource` is the KEY:ordinal that
 * Pass 6 checks on every normative claim, and it is an EDGE WITH A FIELD
 * rather than a pair of string columns on each layer type. Three reasons:
 *
 *   - a claim can rest on several passages, and often does — the leading
 *     rule in TC-TYP-001 needed five modifiers from one ranged read;
 *   - the citation index renderer walks edges once instead of unioning six
 *     differently-shaped columns;
 *   - `kc:val:normative-claim-cited` becomes a graph question ("does this
 *     node have an outgoing CitesSource edge") rather than a per-type field
 *     check that has to be written six times and kept in step.
 *
 * `kc:DerivedFrom` is deliberately separate from `kc:CitesSource`. A layer
 * item cites the SOURCE it makes a claim about; it derives from the HARVEST
 * row it was transposed out of. Collapsing the two would lose the audit trail
 * from artifact back through transposition to the verbatim passage, which is
 * the only thing that makes a discard rate meaningful.
 */
import type { RelationTypeDef } from "../../src/core/models/meta.js";
import { intField, str } from "./_common.js";
import { R, T } from "./ids.js";
import { LAYER_TYPE_IDS, NORMATIVE_TYPE_IDS } from "./primitives.js";

function edge(args: {
  id: string;
  name: string;
  description: string;
  source: string | readonly string[];
  target: string | readonly string[];
  cardinality?: RelationTypeDef["cardinality"];
  fields?: RelationTypeDef["fields"];
}): RelationTypeDef {
  return {
    id: args.id,
    name: args.name,
    description: args.description,
    source_types: typeof args.source === "string" ? [args.source] : [...args.source],
    target_types: typeof args.target === "string" ? [args.target] : [...args.target],
    cardinality: args.cardinality ?? "many-to-one",
    fields: args.fields ?? [],
    symmetric: false,
    transitive: false,
  };
}

export const RELATIONS: RelationTypeDef[] = [
  edge({
    id: R.CitesSource,
    name: "CitesSource",
    description:
      "The KEY:ordinal. Attaches a layer item to the source passage that supports it. Many-to-many because one claim may rest on several passages and one passage may support several claims. `ordinal` is on the edge, not the node, for exactly that reason.",
    source: [...LAYER_TYPE_IDS],
    target: T.Source,
    cardinality: "many-to-many",
    fields: [
      intField("ordinal", "Sentence ordinal within the cited source."),
      str("locator", "Optional page or section, where the substrate offers one.", { required: false }),
    ],
  }),
  edge({
    id: R.DerivedFrom,
    name: "DerivedFrom",
    description:
      "Transposition provenance: the layer item on the left came out of the harvest row on the right. Distinct from CitesSource — this records what the passage BECAME, which is what lets a reader audit the discard decision rather than take the rate on trust.",
    source: [...LAYER_TYPE_IDS],
    target: T.Harvest,
    cardinality: "many-to-many",
  }),
  edge({
    id: R.OverridesInvariant,
    name: "OverridesInvariant",
    description:
      "L5 suspends L1. An override with no such edge suspends nothing and is an opinion; the validator says so.",
    source: T.Override,
    target: T.Invariant,
    cardinality: "many-to-many",
  }),
  edge({
    id: R.GapOnEnvelopeItem,
    name: "GapOnEnvelopeItem",
    description:
      "The declared gap on the left is the unmet half of the covered envelope item on the right. Pass 4's envelope-vs-harvest diff, recorded as an edge so coverage is computable.",
    source: T.Gap,
    target: T.EnvelopeItem,
    cardinality: "many-to-one",
  }),
  edge({
    id: R.ConflictBetweenSources,
    name: "ConflictBetweenSources",
    description:
      "Attaches an unreconciled conflict to each source that holds one side of it. Two edges per conflict, so neither side can be dropped by editing one node.",
    source: T.Conflict,
    target: T.Source,
    cardinality: "many-to-many",
  }),
  edge({
    id: R.DefectOnSource,
    name: "DefectOnSource",
    description:
      "The Pass-1 defect on the left was found in the source on the right. A duplicate-ingestion defect points at both copies.",
    source: T.CorpusDefect,
    target: T.Source,
    cardinality: "many-to-many",
  }),
];

/** Exported so the citation validator and the renderers agree on which
 *  layers a missing citation is an error for. */
export { NORMATIVE_TYPE_IDS };
