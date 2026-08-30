/**
 * `uml/model_a_domain` — the how-to-think layer for profile:uml:2.5
 * (SPEC-MCP-SERVER §13.5).
 *
 * The tool descriptions can say what `fdpm.primitive.create` does; they
 * cannot say that a UML attribute is a `uml:Property` joined by
 * `uml:OwnsAttribute` and typed by `uml:TypedBy`, that an association
 * end is the *same* Property the association owns, or that
 * `uml:Classifier` is abstract and will be refused. That is what this
 * prompt carries.
 *
 * tests/plugins/uml/prompt.test.ts cross-checks every type id, relation
 * id and metaclass name in the body against the profile the plugin
 * actually registers, so the procedure cannot drift from what it
 * teaches.
 */
import type { PromptRegistration } from "../../src/plugin/types.js";
import { REL } from "./sidecar.js";

export const MODEL_A_DOMAIN_PROMPT: PromptRegistration = {
  promptId: "uml/model_a_domain",
  title: "Model a domain in UML",
  description:
    "Use when building or extending a UML 2.5.1 model as an FDPM workbook: which metaclass to reach for, how attributes, operations, associations, receptions, ports and connectors are wired as relations, and which metaclasses are abstract and will be refused.",
  arguments: [
    { name: "workbook_id", description: "The UML workbook to build or extend.", required: true },
    { name: "subject", description: "What the model is about, e.g. \"order fulfilment\"." },
  ],
  render: ({ args }) => {
    const wb = args["workbook_id"]!;
    const subject = args["subject"];
    const text = [
      `# Modelling ${subject ? `"${subject}"` : "a domain"} in UML — workbook ${wb}`,
      ``,
      `## When to use`,
      `When a domain must be captured as a UML 2.5.1 model that other tools and reviewers can read: classes and their features, the associations between them, packages, signals and receptions. Not for planning work (profile:planning:0.1) and not for prose specifications (profile:spec-authoring:0.1). If a whole model already exists as JSON, prefer the ingest path (plugins/uml/ingest.ts, buildUmlWorkbook) over element-by-element writes — it validates the model as a whole first.`,
      ``,
      `## Call order`,
      `1. fdpm.workbook.get(workbook_id: "${wb}") — confirm profile_id is profile:uml:2.5 and note the revision.`,
      `2. fdpm.profile.type_info(profile_id: "profile:uml:2.5", type_id: "uml:Class") before your first write of any metaclass: it returns the id_pattern your \`id\` must match and the required fields. Every element id is \`uml:<Metaclass>:<ULID>\` and every element carries \`xmi_id\` (the same 26-character ULID).`,
      `3. Create containers first: a uml:Model or uml:Package, then the classifiers it owns, joined by ${REL.Owns} (source: the package, target: the classifier).`,
      `4. Classifiers: uml:Class, uml:Interface, uml:DataType, uml:PrimitiveType, uml:Enumeration, uml:Signal, uml:Association. Names are \`name\`; \`visibility\` is public|private|protected|package; \`is_abstract\` marks an abstract class.`,
      `5. Features are separate primitives, never fields:`,
      `   - an attribute is a uml:Property joined by ${REL.OwnsAttribute} (classifier → property, \`position\` = declaration order) and typed by ${REL.TypedBy} (property → classifier);`,
      `   - an operation is a uml:Operation joined by ${REL.OwnsOperation}, and each argument is a uml:Parameter joined by ${REL.OwnsParameter} with \`direction\` in|inout|out|return;`,
      `   - an enumeration value is a uml:EnumerationLiteral joined by ${REL.OwnsLiteral};`,
      `   - a reception is a uml:Reception joined by ${REL.OwnsReception}, pointed at its signal by ${REL.Signals} (reception → uml:Signal).`,
      `6. Multiplicity lives on the property or parameter: \`lower\` (integer) and \`upper\` (integer, where -1 means UML's \`*\`). Never write "*" — the field is numeric.`,
      `7. Associations: create the uml:Association, then ONE uml:Property per end. Join each end to the association with BOTH ${REL.OwnsAttribute} and ${REL.MemberEnd} (\`position\` 0 and 1, \`is_navigable\`), and type it with ${REL.TypedBy} at the classifier it points to. The end is one primitive with one id — do not create a second copy for the member-end edge.`,
      `8. Internal structure (§11.2, §11.3, §11.6). A uml:Component owns interaction points and the links between them:`,
      `   - a port is a uml:Port joined by ${REL.OwnsPort}, typed by ${REL.TypedBy}, with its contract as ${REL.Provides} / ${REL.Requires} edges to uml:Interface;`,
      `   - a connector is a uml:Connector joined by ${REL.OwnsConnector} with \`kind\` assembly|delegation, and it MUST own at least two uml:ConnectorEnd via ${REL.OwnsConnectorEnd};`,
      `   - each end attaches to its role with ${REL.ConnectorRole} (a uml:Property part, or a uml:Port), and names the containing part with ${REL.PartWithPort} when the role is a port;`,
      `   - a classifier implementing a component is joined by ${REL.RealizesComponent} (classifier → component); a uml:Artifact embodies elements via ${REL.Manifests} and nests others via ${REL.NestsArtifact}.`,
      `9. A uml:AssociationClass is both: give it member ends like an association AND owned attributes like a class.`,
      `10. Relationships between classifiers are relations, not elements: ${REL.Specializes} (specific → general, \`is_substitutable\`), ${REL.Realizes} (class → interface), ${REL.DependsOn} (client → supplier, \`kind\` dependency|usage|abstraction|realization).`,
      `11. Documentation and rules: a uml:Comment joined by ${REL.Annotates} (comment → element), a uml:Constraint joined by ${REL.Constrains} (constraint → element). A constraint's \`specification\` is a ValueSpecification struct: { kind: "opaque_expression", body: "self.x > 0", language: "OCL" }.`,
      `12. Batch related writes: fdpm.primitive.create_batch then fdpm.relation.create_batch (primitives before the relations that point at them; both are all-or-nothing).`,
      `13. Read the result as a document: fdpm://workbook/${wb}/render/text/markdown#uml:ModelOutlineRenderer prints the containment tree with features in UML notation (\`+ name : Type [0..*]\`). Verify the write itself with fdpm.log.tail(workbook_id: "${wb}").`,
      ``,
      `## Failure modes`,
      `- "is abstract in UML 2.5.1 and has no instances" — you named an abstract metaclass (uml:Classifier, uml:Feature, uml:Element, uml:Vertex, uml:ActivityNode and 21 more). Use the concrete specialisation the message names; the full classification is plugins/uml/abstract.ts.`,
      `- uml:val:<metaclass>-zod — the per-metaclass Zod validator rejected a field: check xmi_id is a 26-character ULID, visibility is in the enum, and \`upper\` is a number (-1, not "*").`,
      `- core:id:pattern — the primitive id does not match \`uml:<Metaclass>:<ULID>\`; the ULID in the id and in xmi_id must be the same.`,
      `- core:relation:endpoint-type — the relation's endpoints are not allowed by the profile, e.g. ${REL.OwnsAttribute} pointed at anything but a uml:Property, ${REL.Signals} at a classifier that is not a uml:Signal, ${REL.OwnsPort} from an interface (only a component, class or association class has internal structure), or ${REL.Provides} at anything but a uml:Interface.`,
      `- "requires at least 2" — a uml:Connector was given fewer than two ends (§11.2); a connector joins roles, so one end is never a model.`,
      `- core:field:undeclared (warning) — a field the metaclass does not define is tolerated but never validated; remove it or model it properly.`,
      `- permission/stale_state — another process changed the log; ask the operator to send SIGHUP on macOS/Linux or press Ctrl+Break (SIGBREAK) on Windows (restart if no console is attached), then re-read from step 1.`,
      `- ok:false with isError:false means the write was REJECTED and nothing was written: read validation_report.findings[], fix, retry.`,
    ].join("\n");
    return [{ role: "user", content: { type: "text", text } }];
  },
};

export const UML_PROMPTS: readonly PromptRegistration[] = [MODEL_A_DOMAIN_PROMPT];
