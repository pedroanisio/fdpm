/**
 * `knowledge-cartridge/build_cartridge` — the seven-pass generator protocol as
 * an MCP prompt.
 *
 * `GENERATOR.md` in this directory is the full protocol and stays the source
 * of truth. This is its executable face: an agent asking `prompts/get` should
 * receive the call order over real FDPM tools, not a link to a document it has
 * to go and read. §5 of that file ("THE SHORT FORM") is the irreducible core
 * and most of what follows is its expansion against this profile's type ids.
 *
 * The body is budgeted. A procedural specification is re-sent on every step of
 * a run, so its size is a recurring cost — the same argument, and the same
 * ratchet discipline, as `plugins/loop_forward/prompts.ts`.
 */
import type { PromptRegistration } from "../../src/plugin/types.js";
import {
  CARTRIDGE_RENDERER_ID,
  CITATION_INDEX_RENDERER_ID,
  LAYER_MAP_RENDERER_ID,
  PROFILE_ID,
  R,
  T,
} from "./ids.js";

/**
 * Measured ceiling for the rendered body, in UTF-8 bytes.
 *
 * Evidence: the body renders 4,511 B with every optional argument supplied.
 * The ceiling is 5,000 B — about 11 % headroom, the same ratchet the MCP tool
 * catalog carries. It is far under the host's `PROMPT_BODY_BUDGET_BYTES`
 * (16,384) on purpose: that is the outer limit for any prompt, whereas a
 * procedural specification is re-sent on every step of a run, so its size is a
 * recurring cost. A ceiling with 37 % slack would pass while the body grew by
 * half. Raising this needs a CHANGELOG line and a reason.
 */
export const KC_PROMPT_BODY_CEILING_BYTES = 5_000;

export const BUILD_CARTRIDGE_PROMPT: PromptRegistration = {
  promptId: "knowledge-cartridge/build_cartridge",
  title: "Build a talent cartridge",
  description:
    "Use to compress a corpus into a six-layer competence cartridge — invariants, constants, procedures, diagnostics, judgement — where every claim carries a KEY:ordinal and every hole is declared, not filled.",
  arguments: [
    { name: "workbook_id", description: "Workbook to build in.", required: true },
    { name: "subject", description: "The craft; narrow beats broad." },
    { name: "archetype", description: "Whose 10,000 hours." },
  ],
  render: ({ args }) => {
    const wb = args["workbook_id"]!;
    const subject = args["subject"] ?? "<subject>";
    const archetype = args["archetype"] ?? "<archetype>";
    const text = [
      `# Build a talent cartridge — workbook ${wb}`,
      `Subject: ${subject}. Archetype: ${archetype}.`,
      ``,
      `## When to use`,
      `When a corpus must become something a practitioner can act, diagnose and deviate from. A cartridge is not a summary, a glossary or a tutorial: summaries preserve proportion, cartridges destroy it deliberately. Not for reading one document (read it) and not for a reference sheet (this profile would be overhead).`,
      ``,
      `## Call order`,
      `1. fdpm.workbook.get(workbook_id: "${wb}") — confirm profile_id is ${PROFILE_ID}.`,
      `2. PASS 0, ENVELOPE — before any retrieval. Create ${T.EnvelopeItem} rows: what is covered, and what is excluded. Derive both from the archetype, never from what the corpus turns out to hold. At least two exclusions must name things a reasonable person would expect included; an envelope drawn to fit the corpus makes the gap audit vacuous.`,
      `3. PASS 1, SURVEY — create one ${T.Source} per document with its citation_key, tier and sentence_count. Tier by hand: primary, practitioner, tooling and strategy make incompatible claims and must never co-rank. If the top retrieval ranks agree past three significant figures, rank is saturated and discriminates nothing — stop using it. Record every defect as ${T.CorpusDefect}.`,
      `4. PASS 2, HARVEST — query in the imperative mood, six probes per subtopic: quantity, constraint, ordering, failure, condition, preference. Locate with snippets, then EXTRACT with a ranged read of ±20-40 sentences; snippets alone yield a cartridge of stubs. Write every passage as ${T.Harvest} with its citation_key, ordinal, verbatim text and probe.`,
      `5. PASS 3, TRANSPOSE — each passage becomes exactly one of ${T.Invariant}, ${T.Constant}, ${T.Step}, ${T.Diagnostic} or ${T.Override}, or it is discarded. Patch the discarded ${T.Harvest} rows to retained:false with a discard_reason — keep them, because that is what makes the discard rate a count rather than a claim. Expect 70% discard; under 50% you are summarising.`,
      `6. Wire provenance as you go: ${R.CitesSource} from each layer item to its ${T.Source} carrying the ordinal, ${R.DerivedFrom} to the harvest row it came from, and ${R.OverridesInvariant} from every ${T.Override} to the rule it suspends.`,
      `7. PASS 4, AUDIT — for every covered envelope item with no harvest behind it, create a ${T.Gap} and a ${R.GapOnEnvelopeItem} edge. Where two sources give different values for one quantity, create a ${T.Conflict} with both attributed. Do not average and do not silently pick.`,
      `8. PASS 5, COMPOSE — create the ${T.Cartridge} header last, so its counting validators see a finished graph. Batch the writes with fdpm.primitive.create_batch then fdpm.relation.create_batch.`,
      `9. PASS 6, VERIFY — fdpm.primitive.search over each layer to confirm counts, then read fdpm://workbook/${wb}/render/text/html#${CITATION_INDEX_RENDERER_ID} for the scoreboard, fdpm://workbook/${wb}/render/image/svg+xml#${LAYER_MAP_RENDERER_ID} for layer depth, and fdpm://workbook/${wb}/render/text/markdown#${CARTRIDGE_RENDERER_ID} for the artifact. Confirm with fdpm.log.tail(workbook_id: "${wb}") that every write landed.`,
      ``,
      `## Failure modes`,
      `- GAP FILLING is the dangerous one: faced with a hole a model produces a fluent uncited claim inside a document whose every other claim is cited. kc:val:normative-claim-cited refuses the ${T.Cartridge} header while any claim is uncited — layer items are writable, the header is the gate. The gap is the deliverable: declare it, never fill it.`,
      `- kc:val:invariant-falsifiable — an invariant needs a concrete instance that would violate it. If you cannot write one it is a theme, not a constraint; discard it.`,
      `- kc:val:harvest-retention-arm — a discarded row needs a discard_reason and a retained row must not carry one.`,
      `- kc:val:step-constrains-next — in L3 the ordering is the content; say why the step must precede the next.`,
      `- kc:val:override-suspends-a-rule — an override wired to no invariant is an opinion.`,
      `- kc:val:diagnostic-minimum / kc:val:judgement-non-empty — fewer than 8 diagnostics, or no L5 at all, means under-harvested. A cartridge without L4 and L5 has encoded a textbook, not a practitioner.`,
      `- kc:val:discard-rate — below 50% the transposition pass has failed; re-run it with the five-arm test applied strictly.`,
      `- Three Pass-6 checks cannot be made from the graph — ordinal resolution, compression ratio, and quotation length. The citation index prints them as UNCHECKED. Unchecked is not passed.`,
      `- ok:false with isError:false means validation rejected the write and nothing was written; read validation_report.findings[] for rule_id and field_path, fix, retry.`,
    ].join("\n");
    return [{ role: "user", content: { type: "text", text } }];
  },
};

export const KNOWLEDGE_CARTRIDGE_PROMPTS: readonly PromptRegistration[] = [BUILD_CARTRIDGE_PROMPT];
