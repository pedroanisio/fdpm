/**
 * `fact-fiction/ground_fiction` — the grounding audit as a skill.
 *
 * Teaches the two invariants agents trip over in this profile: sources
 * are shared primitives (cite, don't duplicate) and grounding is
 * edges, not prose. tests/plugins/fact_fiction/prompts.test.ts
 * cross-checks every tool name against the MCP manifest and every
 * `ff:` id against this plugin's sources, so the procedure cannot
 * drift from the validators it teaches.
 */
import type { PromptRegistration } from "../../src/plugin/types.js";

export const GROUND_FICTION_PROMPT: PromptRegistration = {
  promptId: "fact-fiction/ground_fiction",
  title: "Ground the fiction",
  description:
    "Use after drafting facts and fiction elements in a fact-fiction workbook to audit grounding: cite sources, assess facts, and couple fiction to its factual anchors without tripping the ff: validators.",
  arguments: [
    { name: "workbook_id", description: "The fact-fiction workbook to audit.", required: true },
    { name: "element_id", description: "Restrict to one ff:FictionElement id (default: every element)." },
  ],
  render: ({ args }) => {
    const wb = args["workbook_id"]!;
    const element = args["element_id"];
    const scope = element ? `element ${element}` : "every fiction element";
    const text = [
      `# Ground the fiction — workbook ${wb} (${scope})`,
      ``,
      `## When to use`,
      `After drafting facts, sources, and fiction elements, when the epistemic bookkeeping must catch up with the prose: uncited facts, unassessed facts, and fiction elements whose relationship to the record exists only in their description. Not for authoring the manuscript structure (arcs/chapters/scenes) and not for renaming or deleting — this skill only adds evidence and edges.`,
      ``,
      `## Call order`,
      `1. fdpm.workbook.get(workbook_id: "${wb}") — confirm the profile is profile:fact-fiction:0.1.`,
      `2. Read the review document: resources/read fdpm://workbook/${wb}/render/text/markdown — facts flagged **UNCITED** / **UNASSESSED** / **DISPUTED** and constraints flagged **UNSUPPORTED** are the work queue.`,
      `3. fdpm.primitive.search(workbook_id: "${wb}", type_id: "ff:FictionElement")${element ? ` — keep only "${element}"` : ""}; then fdpm.relation.list(workbook_id: "${wb}", type_id: "ff:BasedOn") and type_id "ff:CouplesTo" — an element graded anything but fully_invented with no edge of either type is ungrounded.`,
      `4. Before inventing a new ff:Source, search for an existing one: fdpm.primitive.search(workbook_id: "${wb}", type_id: "ff:Source"). Sources are SHARED — many facts cite one source via ff:Cites edges. Never create a duplicate source to satisfy a second fact.`,
      `5. Cite: fdpm.relation.create(workbook_id: "${wb}", relation: { type_id: "ff:Cites", source_id: "<fact>", target_id: "<source>", field_values: { locator: "<where>" } }). Batch several with fdpm.relation.create_batch.`,
      `6. Assess: fdpm.primitive.create(workbook_id: "${wb}", primitive: { type_id: "ff:Assessment", field_values: { fact_id, assessor, confidence_level and/or confidence_score, source_id? } }) — fact_id and source_id are id-refs the core resolves, so the fact and source must already exist.`,
      `7. Couple: fdpm.relation.create with type_id "ff:CouplesTo" (fiction → fact) and field_values { relation: one of directly_depends_on/plausibly_extends/dramatizes/fills_gap_in/reframes/compresses/contradicts, explanation: why }. Use ff:BasedOn for plain "draws upon" without a typed claim, and ff:ConstrainedBy / ff:SupportedBy for the constraint layer.`,
      `8. Verify: fdpm.workbook.get again, re-read the render resource, and confirm the flags you targeted are gone; remaining warnings (ff:val:fact-cited and friends) show in the validation report.`,
      ``,
      `## Failure modes`,
      `- core:field:id-ref — an ff:Assessment fact_id/source_id names a missing primitive or one of the wrong type: create the target first (step 6 order).`,
      `- ff:val:assessment-has-confidence — neither confidence_level nor confidence_score set: state at least one.`,
      `- ff:val:disputed-fact-has-note — disputed=true without dispute_note: summarize the disagreement in the same write.`,
      `- ff:val:fact-cited / ff:val:constraint-supported — warnings, not rejections: they clear when the ff:Cites / ff:SupportedBy edge lands.`,
      `- ff:val:fiction-grounded — an element not fully_invented with no ff:BasedOn or ff:CouplesTo edge: add the edge (step 7) or regrade honestly to fully_invented.`,
      `- ff:val:scene-anchored — a scene with no ff:Depicts/ff:Features edge; out of scope here, note it for the structure pass.`,
      `- ok:false envelopes carry validation_report.findings[] with the rule_id: fix the input and retry; nothing was written.`,
    ].join("\n");
    return [{ role: "user", content: { type: "text", text } }];
  },
};

export const FACT_FICTION_PROMPTS: PromptRegistration[] = [GROUND_FICTION_PROMPT];
