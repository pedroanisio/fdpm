/**
 * Type ids, categories, scopes and closed vocabularies for the
 * knowledge-cartridge profile.
 *
 * Every id the profile, the validators and the three renderers address is
 * declared here once. A renderer that hard-codes `"kc:Invariant"` inline
 * cannot be found by a grep for the type it reads, and a rename then leaves
 * the renderer silently matching nothing — the failure mode is an empty page,
 * not an error.
 *
 * The vocabularies below are transcribed from `GENERATOR.md`, not invented:
 * the six probes are its Pass-2 table, the four source tiers its Pass-1
 * method, the four corpus defects its §4 table, and the five transposition
 * arms its Pass-3 test. Where this file and that document disagree, the
 * document is right and this file is a bug.
 */
import type { CategoryDef, ScopeDef } from "../../src/core/models/meta.js";

export const VENDOR = "kc" as const;
export const PROFILE_ID = "profile:knowledge-cartridge:1.0" as const;
export const PLUGIN_ID = "fdpm.knowledge-cartridge" as const;
export const PLUGIN_VERSION = "0.1.0" as const;
export const PROFILE_VERSION = "1.0.0" as const;
export const HOST_COMPATIBILITY = ">=1.1,<2" as const;

/** Primitive type ids. Six layers, plus the envelope and the provenance set. */
export const T = {
  // Envelope and corpus
  Cartridge: "kc:Cartridge",
  EnvelopeItem: "kc:EnvelopeItem",
  Source: "kc:Source",
  CorpusDefect: "kc:CorpusDefect",
  Harvest: "kc:Harvest",
  // The six layers
  Primitive: "kc:Primitive",
  Invariant: "kc:Invariant",
  Constant: "kc:Constant",
  Step: "kc:Step",
  Diagnostic: "kc:Diagnostic",
  Override: "kc:Override",
  // Audit output
  Gap: "kc:Gap",
  Conflict: "kc:Conflict",
} as const;

/** Relation type ids. */
export const R = {
  CitesSource: "kc:CitesSource",
  DerivedFrom: "kc:DerivedFrom",
  OverridesInvariant: "kc:OverridesInvariant",
  GapOnEnvelopeItem: "kc:GapOnEnvelopeItem",
  ConflictBetweenSources: "kc:ConflictBetweenSources",
  DefectOnSource: "kc:DefectOnSource",
} as const;

/** Renderer ids. Declared here so `prompts.ts` can name them without an
 *  import cycle through `index.ts`. */
export const CARTRIDGE_RENDERER_ID = "kc:CartridgeRenderer" as const;
export const CITATION_INDEX_RENDERER_ID = "kc:CitationIndexRenderer" as const;
export const LAYER_MAP_RENDERER_ID = "kc:LayerMapRenderer" as const;

export const CAT = {
  envelope: "cat:knowledge-cartridge:envelope",
  corpus: "cat:knowledge-cartridge:corpus",
  layers: "cat:knowledge-cartridge:layers",
  audit: "cat:knowledge-cartridge:audit",
} as const;

/**
 * Four categories, matching the four questions a cartridge answers: what
 * competence is claimed, what it was built from, what a practitioner does,
 * and what the corpus could not supply.
 */
export const CATEGORIES: CategoryDef[] = [
  {
    id: CAT.envelope,
    name: "Envelope",
    description:
      "The cartridge header and the boundary of claimed competence — what is covered and, mandatorily, what is not.",
  },
  {
    id: CAT.corpus,
    name: "Corpus",
    description:
      "Tiered sources, the defects found in them, and the harvest rows — retained and discarded — drawn from them.",
  },
  {
    id: CAT.layers,
    name: "Layers",
    description:
      "The six layers deliberate practice deposits: primitives, invariants, constants, procedures, diagnostics and judgement.",
  },
  {
    id: CAT.audit,
    name: "Audit",
    description:
      "Declared gaps and unreconciled source conflicts. The gap is a deliverable, not an omission.",
  },
];

export const SCOPES: ScopeDef[] = [
  {
    id: "scope:knowledge-cartridge:workbook",
    name: "Workbook",
    rank: 1,
    description: "Workbook-level scope; every knowledge-cartridge primitive lives here.",
  },
];

export const SCOPE_ID = "scope:knowledge-cartridge:workbook" as const;
export const SCOPE_SETS: Record<string, string[]> = {};
export const DEFAULT_SCOPE_SET = "";

// ── Closed vocabularies, transcribed from GENERATOR.md ───────────────

/** Pass 2, the six probes. Querying in the imperative mood. */
export const PROBE = [
  "quantity",
  "constraint",
  "ordering",
  "failure",
  "condition",
  "preference",
] as const;

/** Pass 1, the four source tiers. These make incompatible claims and must
 *  never co-rank. */
export const SOURCE_TIER = ["primary", "practitioner", "tooling", "strategy"] as const;

/** Pass 0, the two dispositions of an envelope item. */
export const DISPOSITION = ["covered", "excluded"] as const;

/** §4, the four corpus defects observed in practice. */
export const DEFECT_KIND = [
  "duplicate_ingestion",
  "metadata_failure",
  "outline_extraction_failure",
  "rank_saturation",
] as const;

/** Pass 4, the two attention grades a finding carries. */
export const FINDING_GRADE = ["low", "decision"] as const;

/** The retrieval substrates Pass 2's method varies by. */
export const SUBSTRATE = ["doc-ray", "vector_store", "filesystem", "web"] as const;
