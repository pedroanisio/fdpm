"""FDPM Domain Profile Plugin: Software Architecture v1.0.

This module defines the complete software architecture profile as a
DomainProfile instance that can be registered with the framework.
All primitives, relations, scopes, categories, and validation rules
from FDPM v2 are expressed through the v3 meta-framework.
"""

from fdpm.models.core import (
    Cardinality,
    CategoryDef,
    DomainProfile,
    FieldDef,
    FieldValidation,
    IDFormatRule,
    InlineStructDef,
    PrimitiveTypeDef,
    RelationTypeDef,
    RendererBinding,
    RenderingRules,
    ScopeDef,
    TemplateDef,
    TypeConstraint,
    ValidationLevel,
    ValidationRuleDef,
)
from fdpm.store import Store

SOFTWARE_ARCHITECTURE_PROFILE: DomainProfile = DomainProfile(
    id="profile:software-architecture:1.0",
    name="Software Architecture",
    version="1.0.0",
    description=(
        "Primitives, relations, and validation rules for "
        "documenting software systems including domain models, "
        "services, APIs, state machines, decisions, and "
        "operational behavior."
    ),
    extends=[],

    # --- Categories ------------------------------------------------
    categories=[
        CategoryDef(
            id="cat:identity",
            name="Identity",
            description="What exists in the system.",
        ),
        CategoryDef(
            id="cat:semantics",
            name="Semantics",
            description="Meaning and constraints.",
        ),
        CategoryDef(
            id="cat:behavior",
            name="Behavior",
            description="What happens in the system.",
        ),
        CategoryDef(
            id="cat:interface",
            name="Interface",
            description="How systems interact.",
        ),
        CategoryDef(
            id="cat:evidence",
            name="Evidence",
            description=(
                "Why claims should be trusted."
            ),
        ),
    ],

    # --- Scopes ----------------------------------------------------
    scopes=[
        ScopeDef(
            id="scope:sw:domain",
            name="Domain",
            rank=1,
            description=(
                "Business rules, ubiquitous language, "
                "domain invariants."
            ),
        ),
        ScopeDef(
            id="scope:sw:runtime",
            name="Runtime",
            rank=2,
            description=(
                "Operational behavior under load, "
                "latency, throughput."
            ),
        ),
        ScopeDef(
            id="scope:sw:deployment",
            name="Deployment",
            rank=3,
            description=(
                "Infrastructure, topology, regions, "
                "environments."
            ),
        ),
        ScopeDef(
            id="scope:sw:organizational",
            name="Organizational",
            rank=4,
            description=(
                "Teams, ownership, process, governance."
            ),
        ),
    ],

    # --- Primitive Types -------------------------------------------
    primitive_types=[

        # --- Identity ---

        PrimitiveTypeDef(
            id="sw:Entity",
            name="Entity",
            category="cat:identity",
            description=(
                "A named, bounded thing in the system's "
                "domain or architecture."
            ),
            scoped=True,
            id_format=IDFormatRule(
                pattern="{scope}:{kind}:{name}",
                uniqueness="global",
            ),
            fields=[
                FieldDef(
                    name="kind",
                    type=(
                        'Enum["DomainAggregate", '
                        '"DomainValue", '
                        '"Service", "Component", "Module", '
                        '"Infrastructure", '
                        '"ExternalSystem"]'
                    ),
                    required=True,
                    description=(
                        "The architectural role of "
                        "this entity."
                    ),
                ),
                FieldDef(
                    name="name",
                    type="string",
                    required=True,
                    description=(
                        "Human-readable display name."
                    ),
                ),
                FieldDef(
                    name="lifecycle",
                    type=(
                        'Enum["Proposed", "Active", '
                        '"Deprecated", "Retired"]'
                    ),
                    required=True,
                    description=(
                        "Current lifecycle stage."
                    ),
                ),
                FieldDef(
                    name="description",
                    type="ConstrainedText",
                    required=True,
                    description=(
                        "What is this and what role "
                        "does it play?"
                    ),
                    validation=[
                        FieldValidation(
                            rule="max_length",
                            value=280,
                        ),
                    ],
                ),
            ],
        ),

        PrimitiveTypeDef(
            id="sw:Decision",
            name="Decision",
            category="cat:identity",
            description=(
                "A recorded architectural or design "
                "choice that constrains the system."
            ),
            scoped=True,
            id_format=IDFormatRule(
                pattern="decision:{sequence}",
                uniqueness="global",
            ),
            fields=[
                FieldDef(
                    name="status",
                    type=(
                        'Enum["Proposed", "Accepted", '
                        '"Superseded", "Deprecated"]'
                    ),
                    required=True,
                    description=(
                        "Current decision status."
                    ),
                ),
                FieldDef(
                    name="title",
                    type="string",
                    required=True,
                    description=(
                        "Imperative verb phrase."
                    ),
                ),
                FieldDef(
                    name="context",
                    type="ConstrainedText",
                    required=True,
                    description=(
                        "Forces and situation that "
                        "motivated this decision."
                    ),
                    validation=[
                        FieldValidation(
                            rule="max_length",
                            value=500,
                        ),
                    ],
                ),
                FieldDef(
                    name="rationale",
                    type="ConstrainedText",
                    required=True,
                    description=(
                        "Why this option was chosen "
                        "over alternatives."
                    ),
                    validation=[
                        FieldValidation(
                            rule="max_length",
                            value=500,
                        ),
                    ],
                ),
                FieldDef(
                    name="alternatives",
                    type="StructField[Alternative]",
                    required=True,
                    description=(
                        "At least one rejected "
                        "alternative with reason."
                    ),
                    validation=[
                        FieldValidation(
                            rule="min_items",
                            value=1,
                        ),
                    ],
                ),
                FieldDef(
                    name="consequences",
                    type="ConstrainedText",
                    required=True,
                    description=(
                        "What changes as a result "
                        "of this decision."
                    ),
                    validation=[
                        FieldValidation(
                            rule="max_length",
                            value=500,
                        ),
                    ],
                ),
            ],
            inline_structs=[
                InlineStructDef(
                    name="Alternative",
                    fields=[
                        FieldDef(
                            name="name",
                            type="string",
                            required=True,
                            description=(
                                "Alternative name."
                            ),
                        ),
                        FieldDef(
                            name="reason_rejected",
                            type="ConstrainedText",
                            required=True,
                            description=(
                                "Why this alternative "
                                "was not chosen."
                            ),
                            validation=[
                                FieldValidation(
                                    rule="max_length",
                                    value=280,
                                ),
                            ],
                        ),
                    ],
                ),
            ],
        ),

        PrimitiveTypeDef(
            id="sw:Concept",
            name="Concept",
            category="cat:identity",
            description=(
                "A named idea requiring shared "
                "understanding \u2014 "
                "ubiquitous language."
            ),
            scoped=True,
            id_format=IDFormatRule(
                pattern="concept:{name}",
                uniqueness="global",
            ),
            fields=[
                FieldDef(
                    name="name",
                    type="string",
                    required=True,
                    description=(
                        "The term as used in the system."
                    ),
                ),
                FieldDef(
                    name="definition",
                    type="ConstrainedText",
                    required=True,
                    description=(
                        "Precise, unambiguous definition."
                    ),
                    validation=[
                        FieldValidation(
                            rule="max_length",
                            value=280,
                        ),
                    ],
                ),
            ],
        ),

        # --- Semantics ---

        PrimitiveTypeDef(
            id="sw:Invariant",
            name="Invariant",
            category="cat:semantics",
            description=(
                "A property that must always hold "
                "within its scope."
            ),
            scoped=True,
            id_format=IDFormatRule(
                pattern="invariant:{scope}:{name}",
                uniqueness="global",
            ),
            fields=[
                FieldDef(
                    name="statement",
                    type="ConstrainedText",
                    required=True,
                    description=(
                        "The invariant as a "
                        "falsifiable predicate."
                    ),
                    validation=[
                        FieldValidation(
                            rule="max_length",
                            value=280,
                        ),
                    ],
                ),
                FieldDef(
                    name="enforcement",
                    type=(
                        'Enum["Compile", "Test", '
                        '"Runtime", "Process", "Manual"]'
                    ),
                    required=True,
                    description=(
                        "How this invariant is enforced."
                    ),
                ),
            ],
        ),

        PrimitiveTypeDef(
            id="sw:Constraint",
            name="Constraint",
            category="cat:semantics",
            description=(
                "A quantitative or qualitative bound "
                "on system behavior."
            ),
            scoped=True,
            id_format=IDFormatRule(
                pattern="constraint:{scope}:{name}",
                uniqueness="global",
            ),
            fields=[
                FieldDef(
                    name="statement",
                    type="ConstrainedText",
                    required=True,
                    description=(
                        "The bound, expressed measurably "
                        "where possible."
                    ),
                    validation=[
                        FieldValidation(
                            rule="max_length",
                            value=280,
                        ),
                    ],
                ),
                FieldDef(
                    name="metric",
                    type="string",
                    required=False,
                    description=(
                        "Machine-readable metric "
                        "expression."
                    ),
                ),
            ],
        ),

        PrimitiveTypeDef(
            id="sw:Assumption",
            name="Assumption",
            category="cat:semantics",
            description=(
                "A condition taken as true but not "
                "guaranteed to hold."
            ),
            scoped=True,
            id_format=IDFormatRule(
                pattern="assumption:{scope}:{name}",
                uniqueness="global",
            ),
            fields=[
                FieldDef(
                    name="statement",
                    type="ConstrainedText",
                    required=True,
                    description="What is assumed.",
                    validation=[
                        FieldValidation(
                            rule="max_length",
                            value=280,
                        ),
                    ],
                ),
                FieldDef(
                    name="invalidation",
                    type="ConstrainedText",
                    required=True,
                    description=(
                        "What would make this "
                        "assumption false."
                    ),
                    validation=[
                        FieldValidation(
                            rule="max_length",
                            value=280,
                        ),
                    ],
                ),
            ],
        ),

        PrimitiveTypeDef(
            id="sw:Guarantee",
            name="Guarantee",
            category="cat:semantics",
            description=(
                "A commitment the system makes "
                "to its consumers."
            ),
            scoped=True,
            id_format=IDFormatRule(
                pattern="guarantee:{scope}:{name}",
                uniqueness="global",
            ),
            fields=[
                FieldDef(
                    name="statement",
                    type="ConstrainedText",
                    required=True,
                    description=(
                        "What is guaranteed."
                    ),
                    validation=[
                        FieldValidation(
                            rule="max_length",
                            value=280,
                        ),
                    ],
                ),
                FieldDef(
                    name="conditions",
                    type="ConstrainedText",
                    required=True,
                    description=(
                        "Under what conditions "
                        "the guarantee holds."
                    ),
                    validation=[
                        FieldValidation(
                            rule="max_length",
                            value=280,
                        ),
                    ],
                ),
            ],
        ),

        # --- Behavior ---

        PrimitiveTypeDef(
            id="sw:State",
            name="State",
            category="cat:behavior",
            description=(
                "A named, distinguishable condition "
                "of an entity."
            ),
            scoped=False,
            id_format=IDFormatRule(
                pattern="state:{entity}:{name}",
                uniqueness="global",
            ),
            fields=[
                FieldDef(
                    name="entity_id",
                    type="StableID",
                    required=True,
                    description=(
                        "The entity this state "
                        "belongs to."
                    ),
                    validation=[
                        FieldValidation(
                            rule="references",
                            value="sw:Entity",
                        ),
                    ],
                ),
                FieldDef(
                    name="name",
                    type="string",
                    required=True,
                    description=(
                        "Human-readable state name."
                    ),
                ),
                FieldDef(
                    name="entry_conditions",
                    type="ConstrainedText",
                    required=False,
                    description=(
                        "What must be true to "
                        "enter this state."
                    ),
                    validation=[
                        FieldValidation(
                            rule="max_length",
                            value=280,
                        ),
                    ],
                ),
                FieldDef(
                    name="terminal",
                    type="boolean",
                    required=True,
                    description=(
                        "Whether this is a final state."
                    ),
                ),
            ],
        ),

        PrimitiveTypeDef(
            id="sw:Transition",
            name="Transition",
            category="cat:behavior",
            description=(
                "A named change from one state "
                "to another."
            ),
            scoped=False,
            id_format=IDFormatRule(
                pattern="transition:{from}:{to}",
                uniqueness="global",
            ),
            fields=[
                FieldDef(
                    name="from_state",
                    type="StableID",
                    required=True,
                    description="Source state.",
                    validation=[
                        FieldValidation(
                            rule="references",
                            value="sw:State",
                        ),
                    ],
                ),
                FieldDef(
                    name="to_state",
                    type="StableID",
                    required=True,
                    description="Target state.",
                    validation=[
                        FieldValidation(
                            rule="references",
                            value="sw:State",
                        ),
                    ],
                ),
                FieldDef(
                    name="trigger",
                    type="ConstrainedText",
                    required=True,
                    description=(
                        "What causes this transition."
                    ),
                    validation=[
                        FieldValidation(
                            rule="max_length",
                            value=280,
                        ),
                    ],
                ),
                FieldDef(
                    name="guard",
                    type="ConstrainedText",
                    required=False,
                    description=(
                        "Condition that must be true "
                        "for the transition to fire."
                    ),
                    validation=[
                        FieldValidation(
                            rule="max_length",
                            value=280,
                        ),
                    ],
                ),
                FieldDef(
                    name="action",
                    type="ConstrainedText",
                    required=False,
                    description=(
                        "Side effect of the transition."
                    ),
                    validation=[
                        FieldValidation(
                            rule="max_length",
                            value=280,
                        ),
                    ],
                ),
            ],
            constraints=[
                TypeConstraint(
                    name="no_self_transition",
                    expression=(
                        "not_equal(from_state, to_state)"
                    ),
                    level=ValidationLevel.ERROR,
                    message=(
                        "A transition cannot have the "
                        "same source and target state."
                    ),
                ),
            ],
        ),

        PrimitiveTypeDef(
            id="sw:FailureMode",
            name="FailureMode",
            category="cat:behavior",
            description=(
                "A known way the system can fail."
            ),
            scoped=False,
            id_format=IDFormatRule(
                pattern="failure:{entity}:{name}",
                uniqueness="global",
            ),
            fields=[
                FieldDef(
                    name="entity_id",
                    type="StableID",
                    required=True,
                    description=(
                        "The entity that fails."
                    ),
                    validation=[
                        FieldValidation(
                            rule="references",
                            value="sw:Entity",
                        ),
                    ],
                ),
                FieldDef(
                    name="description",
                    type="ConstrainedText",
                    required=True,
                    description=(
                        "How the failure manifests."
                    ),
                    validation=[
                        FieldValidation(
                            rule="max_length",
                            value=500,
                        ),
                    ],
                ),
                FieldDef(
                    name="detection",
                    type="ConstrainedText",
                    required=True,
                    description=(
                        "How to detect this failure."
                    ),
                    validation=[
                        FieldValidation(
                            rule="max_length",
                            value=280,
                        ),
                    ],
                ),
                FieldDef(
                    name="mitigation",
                    type="ConstrainedText",
                    required=True,
                    description=(
                        "How to recover from "
                        "this failure."
                    ),
                    validation=[
                        FieldValidation(
                            rule="max_length",
                            value=500,
                        ),
                    ],
                ),
                FieldDef(
                    name="severity",
                    type=(
                        'Enum["Critical", "High", '
                        '"Medium", "Low"]'
                    ),
                    required=True,
                    description="Impact severity.",
                ),
            ],
        ),

        # --- Interface ---

        PrimitiveTypeDef(
            id="sw:Endpoint",
            name="Endpoint",
            category="cat:interface",
            description=(
                "A single addressable "
                "interaction point."
            ),
            scoped=False,
            id_format=IDFormatRule(
                pattern="endpoint:{method}:{path}",
                uniqueness="global",
            ),
            fields=[
                FieldDef(
                    name="name",
                    type="string",
                    required=True,
                    description=(
                        "Human-readable endpoint name."
                    ),
                ),
                FieldDef(
                    name="protocol",
                    type=(
                        'Enum["HTTP", "gRPC", '
                        '"GraphQL", "Event", "CLI"]'
                    ),
                    required=True,
                    description="Interaction protocol.",
                ),
                FieldDef(
                    name="method",
                    type="string",
                    required=False,
                    description=(
                        "HTTP method, gRPC method, etc."
                    ),
                ),
                FieldDef(
                    name="path",
                    type="string",
                    required=False,
                    description=(
                        "Route, topic, or "
                        "command string."
                    ),
                ),
            ],
        ),

        PrimitiveTypeDef(
            id="sw:Schema",
            name="Schema",
            category="cat:interface",
            description=(
                "A named data shape for API inputs, "
                "outputs, or events."
            ),
            scoped=False,
            id_format=IDFormatRule(
                pattern="schema:{name}",
                uniqueness="global",
            ),
            fields=[
                FieldDef(
                    name="name",
                    type="string",
                    required=True,
                    description="Schema name.",
                ),
                FieldDef(
                    name="fields",
                    type="StructField[SchemaField]",
                    required=True,
                    description=(
                        "Ordered list of data fields."
                    ),
                    validation=[
                        FieldValidation(
                            rule="min_items",
                            value=1,
                        ),
                    ],
                ),
                FieldDef(
                    name="format",
                    type=(
                        'Enum["JSONSchema", "Protobuf", '
                        '"Avro", "TypeScript", "Custom"]'
                    ),
                    required=True,
                    description=(
                        "Serialization format."
                    ),
                ),
            ],
            inline_structs=[
                InlineStructDef(
                    name="SchemaField",
                    fields=[
                        FieldDef(
                            name="name",
                            type="string",
                            required=True,
                            description="Field name.",
                        ),
                        FieldDef(
                            name="type",
                            type="string",
                            required=True,
                            description=(
                                "Field data type."
                            ),
                        ),
                        FieldDef(
                            name="required",
                            type="boolean",
                            required=True,
                            description=(
                                "Whether mandatory."
                            ),
                        ),
                        FieldDef(
                            name="description",
                            type="ConstrainedText",
                            required=True,
                            description=(
                                "Field purpose."
                            ),
                            validation=[
                                FieldValidation(
                                    rule="max_length",
                                    value=140,
                                ),
                            ],
                        ),
                        FieldDef(
                            name="constraints",
                            type="string[]",
                            required=False,
                            description=(
                                "Validation constraints."
                            ),
                        ),
                    ],
                ),
            ],
        ),

        PrimitiveTypeDef(
            id="sw:Contract",
            name="Contract",
            category="cat:interface",
            description=(
                "A binding agreement between a "
                "provider and consumer."
            ),
            scoped=False,
            id_format=IDFormatRule(
                pattern=(
                    "contract:{provider}:{consumer}"
                ),
                uniqueness="global",
            ),
            fields=[
                FieldDef(
                    name="provider",
                    type="StableID",
                    required=True,
                    description=(
                        "The entity that fulfills "
                        "the contract."
                    ),
                    validation=[
                        FieldValidation(
                            rule="references",
                            value="sw:Entity",
                        ),
                    ],
                ),
                FieldDef(
                    name="consumer",
                    type="StableID",
                    required=True,
                    description=(
                        "The entity that depends "
                        "on the contract."
                    ),
                    validation=[
                        FieldValidation(
                            rule="references",
                            value="sw:Entity",
                        ),
                    ],
                ),
                FieldDef(
                    name="preconditions",
                    type="ConstrainedText[]",
                    required=True,
                    description=(
                        "What must be true "
                        "before invocation."
                    ),
                    validation=[
                        FieldValidation(
                            rule="min_items",
                            value=1,
                        ),
                    ],
                ),
                FieldDef(
                    name="postconditions",
                    type="ConstrainedText[]",
                    required=True,
                    description=(
                        "What will be true after "
                        "successful invocation."
                    ),
                    validation=[
                        FieldValidation(
                            rule="min_items",
                            value=1,
                        ),
                    ],
                ),
                FieldDef(
                    name="error_conditions",
                    type=(
                        "StructField[ErrorCondition]"
                    ),
                    required=True,
                    description=(
                        "Named failure responses."
                    ),
                ),
            ],
            inline_structs=[
                InlineStructDef(
                    name="ErrorCondition",
                    fields=[
                        FieldDef(
                            name="name",
                            type="string",
                            required=True,
                            description="Error name.",
                        ),
                        FieldDef(
                            name="condition",
                            type="ConstrainedText",
                            required=True,
                            description=(
                                "When this error occurs."
                            ),
                            validation=[
                                FieldValidation(
                                    rule="max_length",
                                    value=280,
                                ),
                            ],
                        ),
                        FieldDef(
                            name="response",
                            type="ConstrainedText",
                            required=True,
                            description=(
                                "What is returned "
                                "to the consumer."
                            ),
                            validation=[
                                FieldValidation(
                                    rule="max_length",
                                    value=280,
                                ),
                            ],
                        ),
                    ],
                ),
            ],
        ),

        PrimitiveTypeDef(
            id="sw:Event",
            name="Event",
            category="cat:interface",
            description=(
                "An observable occurrence emitted "
                "by the system."
            ),
            scoped=False,
            id_format=IDFormatRule(
                pattern="event:{source}:{name}",
                uniqueness="global",
            ),
            fields=[
                FieldDef(
                    name="name",
                    type="string",
                    required=True,
                    description="Event name.",
                ),
                FieldDef(
                    name="source",
                    type="StableID",
                    required=True,
                    description=(
                        "The entity that emits "
                        "this event."
                    ),
                    validation=[
                        FieldValidation(
                            rule="references",
                            value="sw:Entity",
                        ),
                    ],
                ),
                FieldDef(
                    name="schema_id",
                    type="StableID",
                    required=True,
                    description=(
                        "Reference to the event's "
                        "payload schema."
                    ),
                    validation=[
                        FieldValidation(
                            rule="references",
                            value="sw:Schema",
                        ),
                    ],
                ),
                FieldDef(
                    name="ordering",
                    type=(
                        'Enum["Unordered", '
                        '"PartiallyOrdered", '
                        '"TotallyOrdered", '
                        '"PartitionOrdered"]'
                    ),
                    required=True,
                    description=(
                        "Event ordering guarantee."
                    ),
                ),
            ],
        ),

        # --- Evidence ---

        PrimitiveTypeDef(
            id="sw:Evidence",
            name="Evidence",
            category="cat:evidence",
            description=(
                "A traceable justification "
                "\u2014 answers 'why should "
                "this be trusted?'"
            ),
            scoped=False,
            id_format=IDFormatRule(
                pattern="evidence:{kind}:{name}",
                uniqueness="global",
            ),
            fields=[
                FieldDef(
                    name="kind",
                    type=(
                        'Enum["Test", "Metric", '
                        '"Review", "Proof", '
                        '"Certification", "Reference"]'
                    ),
                    required=True,
                    description=(
                        "Nature of the evidence."
                    ),
                ),
                FieldDef(
                    name="source",
                    type="string",
                    required=True,
                    description=(
                        "Where the evidence "
                        "comes from."
                    ),
                ),
                FieldDef(
                    name="timestamp",
                    type="ISO8601",
                    required=False,
                    description=(
                        "When the evidence was "
                        "last verified."
                    ),
                ),
                FieldDef(
                    name="description",
                    type="ConstrainedText",
                    required=True,
                    description=(
                        "What this evidence "
                        "demonstrates."
                    ),
                    validation=[
                        FieldValidation(
                            rule="max_length",
                            value=280,
                        ),
                    ],
                ),
            ],
        ),
    ],

    # --- Relation Types --------------------------------------------
    relation_types=[
        RelationTypeDef(
            id="sw:DependsOn",
            name="DependsOn",
            description=(
                "Source requires target to function."
            ),
            source_types=["sw:Entity"],
            target_types=["sw:Entity"],
            cardinality=Cardinality(
                source_min=0, target_min=0,
            ),
            metadata_schema=[
                FieldDef(
                    name="kind",
                    type=(
                        'Enum["compile", '
                        '"runtime", "data"]'
                    ),
                    required=True,
                    description="Dependency kind.",
                ),
            ],
            transitive=True,
        ),
        RelationTypeDef(
            id="sw:Constrains",
            name="Constrains",
            description=(
                "Semantic primitive bounds "
                "the target."
            ),
            source_types=[
                "sw:Invariant",
                "sw:Constraint",
            ],
            target_types=[
                "sw:Entity",
                "sw:Endpoint",
                "sw:Schema",
                "sw:Contract",
            ],
        ),
        RelationTypeDef(
            id="sw:Implements",
            name="Implements",
            description=(
                "Entity fulfills a contract."
            ),
            source_types=["sw:Entity"],
            target_types=["sw:Contract"],
        ),
        RelationTypeDef(
            id="sw:Consumes",
            name="Consumes",
            description=(
                "Entity calls an endpoint."
            ),
            source_types=["sw:Entity"],
            target_types=["sw:Endpoint"],
            metadata_schema=[
                FieldDef(
                    name="frequency",
                    type="string",
                    required=False,
                    description="Call frequency.",
                ),
            ],
        ),
        RelationTypeDef(
            id="sw:Produces",
            name="Produces",
            description="Entity emits an event.",
            source_types=["sw:Entity"],
            target_types=["sw:Event"],
        ),
        RelationTypeDef(
            id="sw:TriggeredBy",
            name="TriggeredBy",
            description=(
                "Transition fires in response "
                "to event or endpoint."
            ),
            source_types=["sw:Transition"],
            target_types=[
                "sw:Event",
                "sw:Endpoint",
            ],
        ),
        RelationTypeDef(
            id="sw:Supersedes",
            name="Supersedes",
            description=(
                "New decision replaces old."
            ),
            source_types=["sw:Decision"],
            target_types=["sw:Decision"],
            transitive=True,
        ),
        RelationTypeDef(
            id="sw:Justifies",
            name="Justifies",
            description=(
                "Evidence supports a claim."
            ),
            source_types=["sw:Evidence"],
            target_types=[
                "sw:Invariant",
                "sw:Constraint",
                "sw:Guarantee",
                "sw:Decision",
            ],
        ),
        RelationTypeDef(
            id="sw:BelongsTo",
            name="BelongsTo",
            description=(
                "State or failure mode is "
                "part of an entity."
            ),
            source_types=[
                "sw:State",
                "sw:FailureMode",
            ],
            target_types=["sw:Entity"],
            cardinality=Cardinality(
                source_min=1, source_max=1,
            ),
        ),
        RelationTypeDef(
            id="sw:InputTo",
            name="InputTo",
            description=(
                "Schema is the input shape "
                "for an endpoint."
            ),
            source_types=["sw:Schema"],
            target_types=["sw:Endpoint"],
        ),
        RelationTypeDef(
            id="sw:OutputOf",
            name="OutputOf",
            description=(
                "Schema is the output shape "
                "of an endpoint."
            ),
            source_types=["sw:Schema"],
            target_types=["sw:Endpoint"],
        ),
        RelationTypeDef(
            id="sw:Mitigates",
            name="Mitigates",
            description=(
                "Failure mode handling "
                "preserves a guarantee."
            ),
            source_types=["sw:FailureMode"],
            target_types=["sw:Guarantee"],
        ),
        RelationTypeDef(
            id="sw:Assumes",
            name="Assumes",
            description=(
                "Primitive depends on an "
                "assumption holding."
            ),
            source_types="*",
            target_types=["sw:Assumption"],
        ),
        RelationTypeDef(
            id="sw:Exposes",
            name="Exposes",
            description=(
                "Entity serves an endpoint."
            ),
            source_types=["sw:Entity"],
            target_types=["sw:Endpoint"],
        ),
        RelationTypeDef(
            id="sw:RefersTo",
            name="RefersTo",
            description=(
                "Primitive uses a defined concept "
                "from the ubiquitous language."
            ),
            source_types="*",
            target_types=["sw:Concept"],
        ),
    ],

    # --- Validation Rules ------------------------------------------
    validation_rules=[
        ValidationRuleDef(
            id="sw:val:decision-has-alternatives",
            name=(
                "Decision must have alternatives"
            ),
            description=(
                "Every Decision must list at least "
                "one rejected alternative."
            ),
            level=ValidationLevel.ERROR,
            applies_to=["sw:Decision"],
            predicate=(
                'min_items(alternatives, 1)'
            ),
        ),
        ValidationRuleDef(
            id="sw:val:decision-has-rationale",
            name=(
                "Decision rationale must "
                "be substantive"
            ),
            description=(
                "Decision rationale cannot "
                "be placeholder text."
            ),
            level=ValidationLevel.ERROR,
            applies_to=["sw:Decision"],
            predicate='non_trivial(rationale)',
        ),
        ValidationRuleDef(
            id="sw:val:assumption-has-invalidation",
            name=(
                "Assumption must have "
                "invalidation condition"
            ),
            description=(
                "Every Assumption must describe "
                "what would make it false."
            ),
            level=ValidationLevel.ERROR,
            applies_to=["sw:Assumption"],
            predicate=(
                'non_trivial(invalidation)'
            ),
        ),
        ValidationRuleDef(
            id="sw:val:invariant-not-manual",
            name=(
                "Invariants should not rely "
                "on manual enforcement"
            ),
            description=(
                "Invariants with Manual enforcement "
                "are a code smell."
            ),
            level=ValidationLevel.WARNING,
            applies_to=["sw:Invariant"],
            predicate=(
                'field("enforcement") != "Manual"'
            ),
        ),
        ValidationRuleDef(
            id="sw:val:contract-has-conditions",
            name=(
                "Contract must have pre "
                "and postconditions"
            ),
            description=(
                "Every Contract must define at "
                "least one pre and one "
                "postcondition."
            ),
            level=ValidationLevel.ERROR,
            applies_to=["sw:Contract"],
            predicate=(
                'min_items(preconditions, 1) '
                'and min_items(postconditions, 1)'
            ),
        ),
        ValidationRuleDef(
            id="sw:comp:active-entity-constrained",
            name=(
                "Active entities should "
                "be constrained"
            ),
            description=(
                "Active entities should have at "
                "least one Constraint/Invariant."
            ),
            level=ValidationLevel.WARNING,
            applies_to=["sw:Entity"],
            predicate=(
                'when(field("lifecycle") == "Active", '
                'has_relation(self, "sw:Constrains", 1, '
                "direction: inbound))"
            ),
        ),
        ValidationRuleDef(
            id=(
                "sw:val:"
                "non-terminal-state-has-transition"
            ),
            name=(
                "Non-terminal state should have "
                "outbound transition"
            ),
            description=(
                "Non-terminal states should have "
                "at least one outbound transition."
            ),
            level=ValidationLevel.WARNING,
            applies_to=["sw:State"],
            predicate=(
                'when(field("terminal") == false, '
                "has_relation(self, "
                '"sw:Transition", 1, '
                "field: from_state))"
            ),
        ),
    ],

    # --- Renderers -------------------------------------------------
    renderers=[
        RendererBinding(
            renderer_id="sw:OpenAPIRenderer",
            name="OpenAPI Specification",
            output_format="application/x-yaml",
            output_path="openapi.yaml",
            description=(
                "Generates OpenAPI 3.x spec "
                "from interface primitives."
            ),
        ),
        RendererBinding(
            renderer_id="sw:ADRRenderer",
            name="ADR Documents",
            output_format="text/markdown",
            output_path="decisions/{id}.md",
            description=(
                "Generates individual ADR "
                "markdown files."
            ),
        ),
    ],

    # --- Templates -------------------------------------------------
    templates=[
        TemplateDef(
            id="sw:tpl:architecture-overview",
            name="Architecture Overview",
            description=(
                "Narrative document covering "
                "entities, decisions, constraints."
            ),
            rendering_rules=RenderingRules(
                voice="active",
                tense="present",
                person="third",
            ),
            target_renderer="markdown",
        ),
        TemplateDef(
            id="sw:tpl:api-reference",
            name="API Reference",
            description=(
                "Endpoint catalog with schemas "
                "and contracts."
            ),
            rendering_rules=RenderingRules(
                voice="active",
                tense="present",
                person="second",
            ),
            target_renderer="markdown",
        ),
        TemplateDef(
            id="sw:tpl:failure-catalog",
            name="Failure Catalog",
            description=(
                "Table of known failure modes "
                "with detection and mitigation."
            ),
            rendering_rules=RenderingRules(
                voice="active",
                tense="present",
                person="third",
            ),
            target_renderer="markdown",
        ),
    ],
)


def register(store: Store) -> None:
    """Register this profile with the store."""
    store.register_profile(SOFTWARE_ARCHITECTURE_PROFILE)
