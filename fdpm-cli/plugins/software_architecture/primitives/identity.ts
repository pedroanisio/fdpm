import type { PrimitiveTypeDef } from "../../../src/core/models/meta.js";
import {
  enumOf,
  idTemplate,
  inlineStruct,
  iso,
  primitive,
  stableId,
  str,
  strList,
  struct,
  text,
} from "../_common.js";

/**
 * Identity category — what exists in the system.
 * Mirrors §"--- Identity ---" of src/fdpm/plugins/software_architecture.py:
 *   sw:Entity, sw:Decision, sw:Concept.
 */
export const IDENTITY_PRIMITIVES: PrimitiveTypeDef[] = [
  primitive({
    id: "sw:Entity",
    name: "Entity",
    category: "cat:identity",
    description: "A named, bounded thing in the system's domain or architecture.",
    scoped: true,
    id_format: idTemplate("{scope}:{kind}:{name}"),
    fields: [
      enumOf(
        "kind",
        "The architectural role of this entity.",
        [
          "DomainAggregate",
          "DomainValue",
          "Service",
          "Component",
          "Module",
          "Library",
          "DataStore",
          "Infrastructure",
          "ExternalSystem",
        ],
      ),
      str("name", "Human-readable display name."),
      enumOf("lifecycle", "Current lifecycle stage.", [
        "Proposed",
        "Active",
        "Deprecated",
        "Retired",
      ]),
      text("description", "What is this and what role does it play?", {
        maxLength: 280,
      }),
    ],
  }),

  primitive({
    id: "sw:Decision",
    name: "Decision",
    category: "cat:identity",
    description: "A recorded architectural or design choice that constrains the system.",
    scoped: true,
    id_format: idTemplate("decision:{sequence}"),
    fields: [
      enumOf("status", "Current decision status.", [
        "Proposed",
        "Accepted",
        "Superseded",
        "Deprecated",
      ]),
      str("title", "Imperative verb phrase."),
      text("context", "Forces and situation that motivated this decision.", {
        maxLength: 500,
      }),
      text("rationale", "Why this option was chosen over alternatives.", {
        maxLength: 500,
      }),
      struct(
        "alternatives",
        "At least one rejected alternative with reason.",
        "Alternative",
        { minItems: 1 },
      ),
      text("consequences", "What changes as a result of this decision.", {
        maxLength: 500,
      }),
      iso("date", "When this decision was taken (ISO-8601).", { required: false }),
      strList("deciders", "People or roles that approved the decision.", {
        required: false,
      }),
      iso("last_reviewed_at", "When this decision was last reviewed for staleness.", {
        required: false,
      }),
    ],
    inline_structs: [
      inlineStruct("Alternative", [
        str("name", "Alternative name."),
        text("reason_rejected", "Why this alternative was not chosen.", {
          maxLength: 280,
        }),
      ]),
    ],
  }),

  primitive({
    id: "sw:Concept",
    name: "Concept",
    category: "cat:identity",
    description: "A named idea requiring shared understanding — ubiquitous language.",
    scoped: true,
    id_format: idTemplate("concept:{name}"),
    fields: [
      str("name", "The term as used in the system."),
      text("definition", "Precise, unambiguous definition.", { maxLength: 280 }),
    ],
  }),

  // gap-pass-2 #8 — first-class capability primitive (what the system DOES,
  // distinct from sw:Entity which models what the system IS).
  primitive({
    id: "sw:Capability",
    name: "Capability",
    category: "cat:identity",
    description: "A discrete capability the system delivers to its users or other systems.",
    scoped: true,
    id_format: idTemplate("capability:{scope}:{name}"),
    fields: [
      str("name", "Capability name (noun phrase)."),
      text("summary", "One-line description of what the capability does.", {
        maxLength: 280,
      }),
      enumOf("maturity", "Operational maturity.", [
        "Experimental",
        "Beta",
        "GA",
        "Deprecated",
      ]),
    ],
  }),

  // gap-pass-2 #9 — Actor (Person / System / Bot interacting with the system).
  // Distinct from Entity[kind=ExternalSystem] because actors carry intent.
  primitive({
    id: "sw:Actor",
    name: "Actor",
    category: "cat:identity",
    description: "An external person, system, or bot that interacts with the system.",
    scoped: false,
    id_format: idTemplate("actor:{kind}:{name}"),
    fields: [
      str("name", "Actor name."),
      enumOf("kind", "Actor type.", ["Person", "System", "Bot"]),
      text("description", "What this actor does and why they interact.", {
        maxLength: 280,
      }),
    ],
  }),

  // gap-pass-2 #9 — Stakeholder (party with concerns about the system, may
  // never directly interact with it). ISO 42010 §3.4.
  primitive({
    id: "sw:Stakeholder",
    name: "Stakeholder",
    category: "cat:identity",
    description: "A party with interests in the system — typically does not interact directly.",
    scoped: false,
    id_format: idTemplate("stakeholder:{role}:{name}"),
    fields: [
      str("name", "Stakeholder identifier."),
      str("role", "Role label (e.g. Operator, Compliance, Product)."),
      strList("concerns", "Concerns this stakeholder cares about.", { minItems: 1 }),
    ],
  }),

  // gap-pass-2 #17 — ISO/IEC/IEEE 42010 Viewpoint (the *kind* of view) and
  // View (a concrete projection of the system through that viewpoint).
  //
  // A Viewpoint declares concerns it addresses and stakeholders it serves.
  // A View binds a Viewpoint to a filter over the project graph (which
  // categories / scopes / type ids / stakeholders are included).
  primitive({
    id: "sw:Viewpoint",
    name: "Viewpoint",
    category: "cat:identity",
    description: "A reusable viewpoint definition (ISO 42010 §3.7).",
    scoped: false,
    id_format: idTemplate("viewpoint:{name}"),
    fields: [
      str("name", "Viewpoint identifier (e.g. logical, deployment, security)."),
      text("description", "What this viewpoint frames.", { maxLength: 280 }),
      strList("concerns", "Concerns this viewpoint addresses.", { minItems: 1 }),
      strList("model_kinds", "Diagram or model kinds typical of the viewpoint.", {
        required: false,
      }),
    ],
  }),

  primitive({
    id: "sw:View",
    name: "View",
    category: "cat:identity",
    description: "A concrete view governed by a viewpoint, projecting a subset of the system (ISO 42010 §3.6).",
    scoped: false,
    id_format: idTemplate("view:{viewpoint}:{name}"),
    fields: [
      str("name", "View identifier."),
      stableId(
        "viewpoint_id",
        "The sw:Viewpoint this view conforms to.",
        "sw:Viewpoint",
      ),
      text("summary", "One-line description of what the view shows.", {
        maxLength: 280,
      }),
      strList("included_categories", "Category ids included in this view.", {
        required: false,
      }),
      strList("included_scope_ids", "Scope ids included in this view.", {
        required: false,
      }),
      strList(
        "included_type_ids",
        "Primitive type ids included in this view (e.g. sw:Endpoint, sw:Schema).",
        { required: false },
      ),
      strList("stakeholder_ids", "Stakeholder ids whose concerns this view serves.", {
        required: false,
      }),
    ],
  }),

  // gap-pass-2 #10 — Deployment node primitive.
  // Lifted out of `Entity[kind=Infrastructure]` so multiplicity, placement,
  // and topology are first-class (and queryable).
  primitive({
    id: "sw:Node",
    name: "Node",
    category: "cat:identity",
    description: "A deployment target — process, container, host, region, etc.",
    scoped: true,
    id_format: idTemplate("node:{kind}:{name}"),
    fields: [
      str("name", "Node identifier."),
      enumOf("kind", "Topology kind.", [
        "Process",
        "Container",
        "VM",
        "Host",
        "Region",
        "Zone",
        "Cluster",
        "ManagedService",
      ]),
      str("multiplicity", "Replica count or scaling expression (e.g. \"3\", \"N\").", {
        required: false,
      }),
      str("placement", "Region / zone / cluster designator.", { required: false }),
    ],
  }),
];
