import type { RelationTypeDef } from "../../src/core/models/meta.js";
import { enumOf, str } from "./_common.js";

/**
 * Relation types — mirrors the `relation_types=[...]` block of
 * src/fdpm/plugins/software_architecture.py:1184-1372.
 *
 * Python uses `Cardinality(source_min=..., target_min=..., ...)` —
 * mapped to the CLI's `cardinality_bounds`. The few relations whose
 * Python source omits cardinality use the default bounds (0..unbounded).
 */
export const RELATIONS: RelationTypeDef[] = [
  {
    id: "sw:DependsOn",
    name: "DependsOn",
    description: "Source requires target to function.",
    source_types: ["sw:Entity"],
    target_types: ["sw:Entity"],
    cardinality_bounds: {
      source_min: 0,
      source_max: null,
      target_min: 0,
      target_max: null,
    },
    metadata_schema: [
      // gap-pass-2 #5 — widen kinds and add direction-of-dataflow.
      enumOf("kind", "Dependency kind.", [
        "compile",
        "runtime",
        "data",
        "network",
        "build",
        "test-only",
        "dev",
        "optional",
      ]),
      enumOf(
        "direction",
        "Direction of data flow (forward = src → tgt, reverse = tgt → src).",
        ["forward", "reverse", "bidirectional"],
        { required: false },
      ),
    ],
    fields: [],
    symmetric: false,
    transitive: true,
  },
  {
    id: "sw:Constrains",
    name: "Constrains",
    description: "Semantic primitive bounds the target.",
    source_types: ["sw:Invariant", "sw:Constraint"],
    target_types: ["sw:Entity", "sw:Endpoint", "sw:Schema", "sw:Contract"],
    fields: [],
    symmetric: false,
    transitive: false,
  },
  {
    id: "sw:Implements",
    name: "Implements",
    description: "Entity fulfills a contract.",
    source_types: ["sw:Entity"],
    target_types: ["sw:Contract"],
    fields: [],
    symmetric: false,
    transitive: false,
  },
  {
    id: "sw:Consumes",
    name: "Consumes",
    description: "Entity calls an endpoint.",
    source_types: ["sw:Entity"],
    target_types: ["sw:Endpoint"],
    metadata_schema: [str("frequency", "Call frequency.", { required: false })],
    fields: [],
    symmetric: false,
    transitive: false,
  },
  {
    id: "sw:Produces",
    name: "Produces",
    description: "Entity emits an event.",
    source_types: ["sw:Entity"],
    target_types: ["sw:Event"],
    fields: [],
    symmetric: false,
    transitive: false,
  },
  {
    id: "sw:TriggeredBy",
    name: "TriggeredBy",
    description: "Transition fires in response to event or endpoint.",
    source_types: ["sw:Transition"],
    target_types: ["sw:Event", "sw:Endpoint"],
    fields: [],
    symmetric: false,
    transitive: false,
  },
  {
    id: "sw:Supersedes",
    name: "Supersedes",
    description: "New decision replaces old.",
    source_types: ["sw:Decision"],
    target_types: ["sw:Decision"],
    fields: [],
    symmetric: false,
    transitive: true,
  },
  {
    id: "sw:Justifies",
    name: "Justifies",
    description: "Evidence supports a claim.",
    source_types: ["sw:Evidence"],
    target_types: [
      "sw:Invariant",
      "sw:Constraint",
      "sw:Guarantee",
      "sw:Decision",
    ],
    fields: [],
    symmetric: false,
    transitive: false,
  },
  {
    id: "sw:BelongsTo",
    name: "BelongsTo",
    description: "State or failure mode is part of an entity.",
    source_types: ["sw:State", "sw:FailureMode"],
    target_types: ["sw:Entity"],
    cardinality_bounds: {
      source_min: 1,
      source_max: 1,
      target_min: 0,
      target_max: null,
    },
    fields: [],
    symmetric: false,
    transitive: false,
  },
  {
    id: "sw:InputTo",
    name: "InputTo",
    description: "Schema is the input shape for an endpoint.",
    source_types: ["sw:Schema"],
    target_types: ["sw:Endpoint"],
    fields: [],
    symmetric: false,
    transitive: false,
  },
  {
    id: "sw:OutputOf",
    name: "OutputOf",
    description: "Schema is the output shape of an endpoint.",
    source_types: ["sw:Schema"],
    target_types: ["sw:Endpoint"],
    fields: [],
    symmetric: false,
    transitive: false,
  },
  {
    id: "sw:Mitigates",
    name: "Mitigates",
    description: "Failure mode handling preserves a guarantee.",
    source_types: ["sw:FailureMode"],
    target_types: ["sw:Guarantee"],
    fields: [],
    symmetric: false,
    transitive: false,
  },
  {
    id: "sw:Assumes",
    name: "Assumes",
    description: "Primitive depends on an assumption holding.",
    source_types: "*",
    target_types: ["sw:Assumption"],
    fields: [],
    symmetric: false,
    transitive: false,
  },
  {
    id: "sw:Exposes",
    name: "Exposes",
    description: "Entity serves an endpoint.",
    source_types: ["sw:Entity"],
    target_types: ["sw:Endpoint"],
    fields: [],
    symmetric: false,
    transitive: false,
  },
  {
    id: "sw:RefersTo",
    name: "RefersTo",
    description: "Primitive uses a defined concept from the ubiquitous language.",
    source_types: "*",
    target_types: ["sw:Concept"],
    fields: [],
    symmetric: false,
    transitive: false,
  },

  // ---------------------------------------------------------------------
  // Pass-2 relation additions (gap audit). Each one is named by the gap
  // it closes; the corresponding new primitive is documented in
  // primitives/identity.ts or primitives/semantics.ts.
  // ---------------------------------------------------------------------

  // gap-pass-2 #8 — Capability ownership. Service entity delivers a capability.
  {
    id: "sw:Delivers",
    name: "Delivers",
    description: "Entity delivers a capability to consumers.",
    source_types: ["sw:Entity"],
    target_types: ["sw:Capability"],
    fields: [],
    symmetric: false,
    transitive: false,
  },

  // gap-pass-2 #8 — Capability realization through interfaces.
  {
    id: "sw:RealizedBy",
    name: "RealizedBy",
    description: "Capability is realized by an endpoint or event.",
    source_types: ["sw:Capability"],
    target_types: ["sw:Endpoint", "sw:Event"],
    fields: [],
    symmetric: false,
    transitive: false,
  },

  // gap-pass-2 #9 — Stakeholder linkage to decisions / quality attrs / risks.
  {
    id: "sw:HasConcern",
    name: "HasConcern",
    description: "Stakeholder has a concern about a decision, quality attribute, or risk.",
    source_types: ["sw:Stakeholder"],
    target_types: ["sw:Decision", "sw:QualityAttribute", "sw:Risk"],
    fields: [],
    symmetric: false,
    transitive: false,
  },

  // gap-pass-2 #9 — Actor interaction with the system.
  {
    id: "sw:InteractsWith",
    name: "InteractsWith",
    description: "Actor interacts with an entity, endpoint, or capability.",
    source_types: ["sw:Actor"],
    target_types: ["sw:Entity", "sw:Endpoint", "sw:Capability"],
    fields: [],
    symmetric: false,
    transitive: false,
  },

  // gap-pass-2 #10 — Deployment topology binding.
  {
    id: "sw:DeployedTo",
    name: "DeployedTo",
    description: "Entity is deployed to a topology node.",
    source_types: ["sw:Entity"],
    target_types: ["sw:Node"],
    metadata_schema: [
      str("instance_count", "Number of instances on this node (default: 1).", {
        required: false,
      }),
    ],
    fields: [],
    symmetric: false,
    transitive: false,
  },

  // gap-pass-2 #11 — Event consumer side (mirror of sw:Produces).
  {
    id: "sw:Subscribes",
    name: "Subscribes",
    description: "Entity subscribes to (consumes) an event.",
    source_types: ["sw:Entity"],
    target_types: ["sw:Event"],
    metadata_schema: [
      enumOf(
        "delivery",
        "Delivery semantics expected by the subscriber.",
        ["at-most-once", "at-least-once", "exactly-once"],
        { required: false },
      ),
      str("ordering_required", "Whether subscriber requires ordered delivery.", {
        required: false,
      }),
    ],
    fields: [],
    symmetric: false,
    transitive: false,
  },

  // gap-pass-2 #7 — anything can carry a known risk.
  {
    id: "sw:Risks",
    name: "Risks",
    description: "Primitive carries a known architectural risk.",
    source_types: "*",
    target_types: ["sw:Risk"],
    fields: [],
    symmetric: false,
    transitive: false,
  },

  // gap-pass-2 #12 — versioned-deprecation chain. Mirror of sw:Supersedes for
  // interface-layer primitives.
  {
    id: "sw:DeprecatedBy",
    name: "DeprecatedBy",
    description: "Interface element is deprecated in favor of another.",
    source_types: ["sw:Endpoint", "sw:Schema"],
    target_types: ["sw:Endpoint", "sw:Schema"],
    fields: [],
    symmetric: false,
    transitive: true,
  },

  // ---------------------------------------------------------------------
  // v1.1 additions — close the inverse-of-Mitigates gap and the
  // Stakeholder-Actor identity gap surfaced by the rust-cli-greet review.
  // ---------------------------------------------------------------------

  // v1.1 #1 — failure-side of the FailureMode/Guarantee link. Authors
  // routinely reach for sw:Mitigates in the wrong direction when wiring a
  // failure to the guarantee it endangers. Without an inverse predicate
  // they either invert sw:Mitigates (semantic bug) or drop the edge
  // (graph hole). sw:Threatens makes the threat side a first-class edge.
  {
    id: "sw:Threatens",
    name: "Threatens",
    description:
      "Failure mode endangers a stated guarantee, invariant, or constraint. Inverse intuition of sw:Mitigates: Mitigates says 'this failure is handled in a way that preserves X'; Threatens says 'this failure, if unhandled, would violate X'.",
    source_types: ["sw:FailureMode"],
    target_types: ["sw:Guarantee", "sw:Invariant", "sw:Constraint"],
    fields: [],
    symmetric: false,
    transitive: false,
  },

  // v1.1 #6 — close the loop between concern-bearing Stakeholders and
  // runtime-invoking Actors. The two often coincide (an end user is both
  // a stakeholder and an actor) but until v1.1 nothing in the graph said
  // so. sw:EmbodiedBy answers the query 'is this stakeholder also a
  // runtime actor?' from the relations alone.
  {
    id: "sw:EmbodiedBy",
    name: "EmbodiedBy",
    description:
      "Stakeholder is embodied at runtime by an Actor. Distinct from sw:HasConcern (which links a stakeholder to what they care about); EmbodiedBy links a stakeholder to who-they-are when interacting with the system.",
    source_types: ["sw:Stakeholder"],
    target_types: ["sw:Actor"],
    fields: [],
    symmetric: false,
    transitive: false,
  },
];
