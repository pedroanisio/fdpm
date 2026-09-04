/**
 * `logical-knowledge-base/author_theory` — building a knowledge base without
 * tripping the profile's validators.
 *
 * The three things agents get wrong in this profile: references are EDGES
 * (an `lkb:ref.<field>` relation), not fields; formulas are JSON in the shape
 * of the vendored schema, and the node-shape validator rejects an invented
 * field name at once; and the document-level check only runs against the
 * header, so the last step is always to read the header's validation report.
 * tests/plugins/logical_knowledge_base/profile.test.ts cross-checks every tool
 * name against the MCP manifest and every `lkb:` id against this plugin's
 * sources, so the procedure cannot drift from the validators it teaches.
 */
import type { PromptRegistration } from "../../src/plugin/types.js";
import { HEADER_TYPE_ID, PROFILE_ID } from "./derive.js";

export const AUTHOR_THEORY_PROMPT: PromptRegistration = {
  promptId: "logical-knowledge-base/author_theory",
  title: "Author a logical theory",
  description:
    "Use when adding declarations, statements, rules or arguments to a logical-knowledge-base workbook: order writes so references resolve, keep formulas in schema shape, end with the document check.",
  arguments: [
    { name: "workbook_id", description: "The workbook to author into.", required: true },
    { name: "focus", description: "Optional collection to work on (declarations, rules, proofs, …)." },
  ],
  render: ({ args }) => {
    const wb = args["workbook_id"]!;
    const focus = args["focus"] ? `, focus: ${args["focus"]}` : "";
    const text = [
      `# Author a logical theory — workbook ${wb}${focus}`,
      ``,
      `## When to use`,
      `When a ${PROFILE_ID} workbook needs new nodes — symbols, statements, rules, constraints, queries, proofs, arguments, processes — or an existing LogicalKnowledgeBase JSON document should become a workbook. Not for renaming the schema's vocabulary: field names, kinds and enums are the vendored schema's own and the node-shape validator rejects anything else.`,
      ``,
      `## Call order`,
      `1. fdpm.workbook.get(workbook_id: "${wb}") — confirm the profile is ${PROFILE_ID} and note whether a ${HEADER_TYPE_ID} primitive exists. Exactly one header per workbook; create it first (source_id, schemaVersion "1.0.0", semanticModelVersion "1.0.0") if it is missing.`,
      `2. Importing a whole document instead: fdpm transfer import-as lkb-json -f <file> --workbook-id <id> --workbook-name <name> (CLI). The importer parses the file with the root schema and refuses an invalid document with the issues as evidence; nothing partial is written.`,
      `3. fdpm.profile.type_info(profile_id: "${PROFILE_ID}", type_id: "lkb:<Kind>") before every create. Kinds are PascalCase of the schema kind: predicate_declaration → lkb:PredicateDeclaration. Every node carries source_id (the document identifier, ^[A-Za-z][A-Za-z0-9._~:/#-]*$); the host id is lkb:<kind-kebab>:<slug>.`,
      `4. Declare symbols first: fdpm.primitive.create_batch with lkb:PredicateDeclaration / lkb:FunctionDeclaration / lkb:ConstantDeclaration / lkb:PropositionDeclaration. Arity is checked later against every application, so set arity and parameters together.`,
      `5. Then statements, rules, constraints, queries. A formula field is JSON in schema shape, e.g. {"kind":"predicate_application_formula","predicate":{"kind":"reference","targetId":"<declaration source_id>","resolution":"local"},"arguments":[{"kind":"variable_term","name":"x"}]}. lkb:val:node-shape parses every AST field with the vendored schema; read its message, it names the path.`,
      `6. References are edges, never fields. For a field the schema types as Reference (parentModule, symbol, priorityOver, premiseRefs, conclusionRef, …) create fdpm.relation.create(workbook_id: "${wb}", relation: { type_id: "lkb:ref.<field>", source_id, target_id, field_values: { resolution: "local", position?: n, target_family?: "<family>" } }). Provenance links are lkb:provenance edges to an lkb:ProvenanceRecord with role. Batch with fdpm.relation.create_batch after the primitives exist.`,
      `7. A reference to something outside the document: create an lkb:ExternalTarget (source_id = the referenced identifier, external_uri) and point the edge at it with resolution "imported" or "external".`,
      `8. Proof steps and process elements are their own primitives, contained by lkb:has-step (slot: steps|trace, position) and lkb:has-element (position) edges from the proof or process model.`,
      `9. Usage edges: every local reference INSIDE a formula, struct or binding (the predicate applied, the constant used, the world a scope names) is mirrored by a derived lkb:mentions edge (fields path, count, target_family?). The importer writes them; when you author node by node, create them after the node — fdpm.relation.create with type_id "lkb:mentions" — or accept the lkb:val:mentions-current warning until reconcileMentions() runs. They are what lets "where is P used" be fdpm.relation.list and what makes the host refuse to delete a declaration formulas still cite.`,
      `10. Finish: fdpm.workbook.get again and read the header primitive's validation report, or run fdpm validate ${wb}. lkb:val:document reassembles the workbook into a document and runs the root schema's whole-document checks (unresolved references, duplicate ids, variable scope, side-effect approval, negation-as-failure policy); lkb:val:framework-grounded compares a grounded framework's acceptedArguments with the computed grounded extension. Review the human view: resources/read fdpm://workbook/${wb}/render/text/markdown.`,
      ``,
      `## Failure modes`,
      `- lkb:val:node-shape — a field name, enum value or formula node the schema does not know: the message carries the path; fix the input, do not add a field.`,
      `- core:relation:target-type / lkb:val:reference-resolution — a local reference edge to a missing node or to an lkb:ExternalTarget, or an external one without external_uri: create the target first (step 4 order), or use an ExternalTarget for a non-local one.`,
      `- lkb:val:reference-family — target_family names a family the target kind is not in (a rule edge to a statement, say): drop target_family or point at the right node.`,
      `- lkb:val:arity — a predicate or function application whose argument count disagrees with the declaration; variadic declarations accept at least arity arguments.`,
      `- lkb:val:rule-cycle — priorityOver / overrides edges between rules form a cycle; remove one edge.`,
      `- lkb:val:self-parent — a module, world, jurisdiction, organization or security domain pointing its parent edge at itself.`,
      `- lkb:val:mentions-current — a warning naming the lkb:mentions edges a node's formulas imply but the workbook lacks (or carries stale); add them, or run reconcileMentions().`,
      `- lkb:val:framework-grounded — a warning when a grounded framework's acceptedArguments is not the grounded extension the attacks yield; the message lists the computed set.`,
      `- lkb:val:document — warnings on the header from the whole-document check; they clear when the document assembles cleanly. The lkb-json exporter refuses to export until they do.`,
      `- ok:false envelopes carry validation_report.findings[] with the rule_id: fix the input and retry; nothing was written.`,
    ].join("\n");
    return [{ role: "user", content: { type: "text", text } }];
  },
};

export const LKB_PROMPTS: PromptRegistration[] = [AUTHOR_THEORY_PROMPT];
