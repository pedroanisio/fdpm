/**
 * The thirteen primitive types of the knowledge-cartridge profile.
 *
 * Six of them are the layers. That is the whole design decision, and it is
 * taken from GENERATOR.md §0 rather than from taste: deliberate practice
 * performs four conversions — chunking, automaticity, pattern recognition,
 * adaptive expertise — and the six-layer schema is the shape of what those
 * conversions produce. A cartridge missing L4 or L5 "has encoded a textbook,
 * not a practitioner".
 *
 * Why six types rather than one `kc:Item` with a `layer` field: Pass 6 asks
 * "L4 has >= 8 rows" and "L5 exists and is non-empty". Against a polymorphic
 * type those are filters over a string column, and nothing stops a diagnostic
 * shipping without a correction. Against six types they are cardinality checks
 * and each layer's mandatory register is a required field.
 *
 * The remaining seven carry provenance and audit. `kc:Harvest` is the one
 * worth explaining: it keeps DISCARDED passages, not only retained ones.
 * Pass 3 requires a >= 70 % discard rate and Pass 6 checks >= 50 %. If the
 * workbook held only what survived, that rate would be a number its author
 * asserted — which is exactly the SELF-CERTIFICATION failure Pass 6 exists to
 * prevent. Keeping both arms makes it arithmetic.
 */
import type { PrimitiveTypeDef } from "../../src/core/models/meta.js";
import {
  boolField,
  enumOf,
  idTemplate,
  intField,
  jsonField,
  primitive,
  shortText,
  str,
  strList,
} from "./_common.js";
import {
  CAT,
  DEFECT_KIND,
  DISPOSITION,
  FINDING_GRADE,
  PROBE,
  SOURCE_TIER,
  SUBSTRATE,
  T,
} from "./ids.js";

// ── Envelope ─────────────────────────────────────────────────────────

export const CARTRIDGE: PrimitiveTypeDef = primitive({
  id: T.Cartridge,
  name: "Cartridge",
  category: CAT.envelope,
  description:
    "The cartridge header. One per workbook. Carries the four input slots the generator refuses to default (subject, archetype, corpus substrate, exclusions live on kc:EnvelopeItem) plus the snapshot date and the source token estimate the compression ratio is measured against.",
  scoped: true,
  id_format: idTemplate("kc:cartridge:{slug}"),
  fields: [
    shortText("cartridge_id", "Stable short id, e.g. TC-TYP-001.", 32),
    str("subject", "The craft. Narrow beats broad: 'typesetting' over 'design'."),
    str(
      "archetype",
      "Whose 10,000 hours. A book typographer, a type designer and a web typographer share a subject and almost no rules; this is what decides which rules survive transposition.",
    ),
    enumOf("substrate", "Retrieval substrate the harvest was drawn through.", SUBSTRATE),
    str("snapshot_date", "ISO-8601 date the corpus was read. A cartridge is a snapshot and dates itself."),
    intField(
      "source_token_estimate",
      "Estimated token count of the source corpus. The denominator of the compression ratio; 0 means not estimated.",
    ),
    str(
      "disclaimer",
      "Paraphrase not quotation; defaults are starting positions not tolerances; unreviewed by a domain expert.",
    ),
  ],
});

export const ENVELOPE_ITEM: PrimitiveTypeDef = primitive({
  id: T.EnvelopeItem,
  name: "EnvelopeItem",
  category: CAT.envelope,
  description:
    "One line of the competence envelope, either covered or excluded. Written in Pass 0 BEFORE the first retrieval call, so that 'gap' is a meaningful word. Exclusions must be non-empty — an envelope drawn to match whatever the corpus happened to contain makes the gap audit vacuous.",
  scoped: true,
  id_format: idTemplate("kc:envelope:{slug}"),
  fields: [
    enumOf("disposition", "Whether the cartridge claims this or explicitly disclaims it.", DISPOSITION),
    str("statement", "What is covered, or what is excluded."),
  ],
});

// ── Corpus ───────────────────────────────────────────────────────────

export const SOURCE: PrimitiveTypeDef = primitive({
  id: T.Source,
  name: "Source",
  category: CAT.corpus,
  description:
    "One corpus document with its citation KEY and its tier. Tiers are not a ranking — primary authority, practitioner, tooling and strategy tiers make incompatible claims and must never co-rank. Retrieval rank measures lexical fit, not standing.",
  scoped: true,
  id_format: idTemplate("kc:source:{slug}"),
  fields: [
    shortText("citation_key", "Short KEY used in every citation, e.g. BRING.", 24),
    str("title", "Document title as it should be cited."),
    enumOf("tier", "Authority tier. Assigned by hand, never by retrieval rank.", SOURCE_TIER),
    intField("sentence_count", "Addressable sentence count, so coverage is measurable. 0 if unknown."),
    str("document_id", "Substrate-native document id, e.g. a doc-ray documentId.", { required: false }),
    str("authorship", "Author or editor.", { required: false }),
    str("edition_date", "Publication or edition date. A cartridge inherits its corpus's recency.", {
      required: false,
    }),
  ],
});

export const CORPUS_DEFECT: PrimitiveTypeDef = primitive({
  id: T.CorpusDefect,
  name: "CorpusDefect",
  category: CAT.corpus,
  description:
    "A defect found in the corpus during Pass 1. Not housekeeping: a document held under a numeric title is invisible to every title search, so defects change what the cartridge can contain.",
  scoped: true,
  id_format: idTemplate("kc:defect:{slug}"),
  fields: [
    enumOf("kind", "Which of the four observed defect classes this is.", DEFECT_KIND),
    str("signal", "What made it detectable."),
    str("fix", "The known remedy."),
    enumOf("grade", "Attention required: mechanical, or a decision.", FINDING_GRADE),
  ],
});

export const HARVEST: PrimitiveTypeDef = primitive({
  id: T.Harvest,
  name: "Harvest",
  category: CAT.corpus,
  description:
    "One harvested passage, verbatim and addressed. Retained rows became a layer item; discarded rows record why they did not. Both are kept so the discard rate is counted rather than asserted — an asserted rate is the self-certification Pass 6 forbids.",
  scoped: true,
  id_format: idTemplate("kc:harvest:{slug}"),
  fields: [
    shortText("citation_key", "KEY of the kc:Source this came from.", 24),
    intField("ordinal", "Sentence ordinal within that source. Together with the KEY this is the address."),
    str("verbatim", "The passage as written. Verbatim at harvest; paraphrase happens at transposition."),
    enumOf("probe", "Which of the six imperative-mood probes surfaced it.", PROBE),
    boolField("retained", "True when the passage transposed into a layer item; false when discarded."),
    str(
      "discard_reason",
      "Why the passage failed the transposition test. Required when retained is false, forbidden when it is true.",
      { required: false },
    ),
  ],
});

// ── The six layers ───────────────────────────────────────────────────

export const L0_PRIMITIVE: PrimitiveTypeDef = primitive({
  id: T.Primitive,
  name: "Primitive",
  category: CAT.layers,
  description:
    "L0. Definitions only — units, notation, and the three or four measurements everything else is expressed in.",
  scoped: true,
  id_format: idTemplate("kc:primitive:{slug}"),
  fields: [
    shortText("term", "The term being defined.", 96),
    str("definition", "What it means, in the craft's own vocabulary."),
    str("unit", "Unit or notation, where the term names a measurement.", { required: false }),
  ],
});

export const L1_INVARIANT: PrimitiveTypeDef = primitive({
  id: T.Invariant,
  name: "Invariant",
  category: CAT.layers,
  description:
    "L1. One falsifiable rule. `falsifier` is mandatory and is the whole point: a constraint you cannot point at a page and violate is a theme, not a constraint, and belongs nowhere in a cartridge.",
  scoped: true,
  id_format: idTemplate("kc:invariant:{slug}"),
  fields: [
    str("rule", "The rule, in the imperative."),
    str("value", "The bound, threshold or range the rule asserts."),
    str(
      "falsifier",
      "A concrete instance that would violate this rule. If you cannot write one, the rule is a theme — delete it.",
    ),
  ],
});

export const L2_CONSTANT: PrimitiveTypeDef = primitive({
  id: T.Constant,
  name: "Constant",
  category: CAT.layers,
  description:
    "L2. A number, ratio or scale. If a number appears as prose anywhere else in the cartridge it is in the wrong layer.",
  scoped: true,
  id_format: idTemplate("kc:constant:{slug}"),
  fields: [
    shortText("name", "What the quantity is called.", 96),
    str("value", "The value, as written. A range is a value."),
    str("unit", "Unit or dimensionless ratio."),
    jsonField("worked_example", "Optional worked arithmetic, serialized.", { required: false }),
  ],
});

export const L3_STEP: PrimitiveTypeDef = primitive({
  id: T.Step,
  name: "Step",
  category: CAT.layers,
  description:
    "L3. One position in an ordering. The ordering IS the content, so `constrains_next` is required: a step that does not constrain the one after it is a list item, not a procedure.",
  scoped: true,
  id_format: idTemplate("kc:step:{slug}"),
  fields: [
    intField("position", "1-based position in the procedure."),
    str("action", "What the practitioner does."),
    str("constrains_next", "Why this step must precede the next one."),
    str("procedure", "Name of the procedure this step belongs to.", { required: false }),
  ],
});

export const L4_DIAGNOSTIC: PrimitiveTypeDef = primitive({
  id: T.Diagnostic,
  name: "Diagnostic",
  category: CAT.layers,
  description:
    "L4. Symptom, cause, correction — in that order, because the practitioner meets the symptom and not the cause. This is the layer that encodes pattern recognition, and a craft with fewer than eight known failure modes has been under-harvested.",
  scoped: true,
  id_format: idTemplate("kc:diagnostic:{slug}"),
  fields: [
    str("symptom", "What is seen, first. Never lead with the cause."),
    str("cause", "Why it happens."),
    str("correction", "What to change."),
  ],
});

export const L5_OVERRIDE: PrimitiveTypeDef = primitive({
  id: T.Override,
  name: "Override",
  category: CAT.layers,
  description:
    "L5. A condition for ignoring a rule — the adaptive-expertise layer. Prose is permitted here and only here, because this layer is explicitly non-executable. An override must point at the kc:Invariant it suspends; one that suspends nothing is an opinion.",
  scoped: true,
  id_format: idTemplate("kc:override:{slug}"),
  fields: [
    str("condition", "When the rule does not apply."),
    str("rationale", "Why the exception holds."),
  ],
});

// ── Audit ────────────────────────────────────────────────────────────

export const GAP: PrimitiveTypeDef = primitive({
  id: T.Gap,
  name: "Gap",
  category: CAT.audit,
  description:
    "A covered envelope item with no harvest backing it. The gap is the deliverable: faced with a hole a model will reach for training-data knowledge and produce a confident uncited claim, which is the most dangerous failure in the protocol. Declaring the hole is the countermeasure.",
  scoped: true,
  id_format: idTemplate("kc:gap:{slug}"),
  fields: [
    str("statement", "What the envelope claims and the corpus did not supply."),
    str("why_unbacked", "What was searched and what came back empty."),
    enumOf("grade", "Attention required: mechanical, or a decision.", FINDING_GRADE),
  ],
});

export const CONFLICT: PrimitiveTypeDef = primitive({
  id: T.Conflict,
  name: "Conflict",
  category: CAT.audit,
  description:
    "Two sources giving different values for the same quantity. Both are recorded with attribution: do not average, do not silently pick. An unreconciled conflict is information; a reconciled one that hid the disagreement is not.",
  scoped: true,
  id_format: idTemplate("kc:conflict:{slug}"),
  fields: [
    str("quantity", "What the two sources disagree about."),
    shortText("key_a", "Citation KEY of the first source.", 24),
    str("value_a", "What the first source says."),
    shortText("key_b", "Citation KEY of the second source.", 24),
    str("value_b", "What the second source says."),
    strList("notes", "Anything a reader needs to weigh the two.", { required: false }),
  ],
});

export const ALL_PRIMITIVES: PrimitiveTypeDef[] = [
  CARTRIDGE,
  ENVELOPE_ITEM,
  SOURCE,
  CORPUS_DEFECT,
  HARVEST,
  L0_PRIMITIVE,
  L1_INVARIANT,
  L2_CONSTANT,
  L3_STEP,
  L4_DIAGNOSTIC,
  L5_OVERRIDE,
  GAP,
  CONFLICT,
];

/** The layer types, in layer order. Renderers and validators walk this. */
export const LAYER_TYPE_IDS = [
  T.Primitive,
  T.Invariant,
  T.Constant,
  T.Step,
  T.Diagnostic,
  T.Override,
] as const;

/**
 * The layers that make normative claims about the corpus and therefore
 * require a citation. L5 is excluded on purpose: an override is a
 * practitioner's condition for setting a rule aside, not a claim the corpus
 * is being asked to support.
 */
export const NORMATIVE_TYPE_IDS = [
  T.Primitive,
  T.Invariant,
  T.Constant,
  T.Step,
  T.Diagnostic,
] as const;
