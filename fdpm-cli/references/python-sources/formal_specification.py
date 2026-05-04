"""FDPM Domain Profile Plugin: Formal Specification v2.0.

This module defines the formal specification profile as a DomainProfile
instance that can be registered with the framework. It models the
content types found in formal specification documents (sections, type
definitions, definitions, principles, phases, contracts, properties,
failure modes, limitations, guidelines, examples, invariants, change
records, design decisions, assumptions, notations, test cases,
requirements, actors, audience tags, and enum definitions) so that
spec documents become rendered output from a primitive graph rather
than hand-maintained markdown files.
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
    ValidationLevel,
    ValidationRuleDef,
)
from fdpm.store import Store

# ─── Reusable type-ID lists ──────────────────────────────────────────
_ALL_PRIMITIVE_IDS: list[str] = [
    "fs:AblationStudy",
    "fs:Actor",
    "fs:Assumption",
    "fs:Audience",
    "fs:ChangeRecord",
    "fs:Citation",
    "fs:ComplexityAnalysis",
    "fs:Component",
    "fs:Configuration",
    "fs:Contract",
    "fs:Dataset",
    "fs:Definition",
    "fs:DesignDecision",
    "fs:EnumDef",
    "fs:Equation",
    "fs:Example",
    "fs:Experiment",
    "fs:FailureMode",
    "fs:Figure",
    "fs:FormalProperty",
    "fs:Guideline",
    "fs:Hyperparameter",
    "fs:Invariant",
    "fs:Limitation",
    "fs:Notation",
    "fs:Phase",
    "fs:Principle",
    "fs:Requirement",
    "fs:Result",
    "fs:Section",
    "fs:TestCase",
    "fs:TypeDefinition",
]

_CONTAINABLE_IDS: list[str] = [
    t for t in _ALL_PRIMITIVE_IDS if t != "fs:Section"
]


FORMAL_SPECIFICATION_PROFILE: DomainProfile = DomainProfile(
    id="profile:formal-specification:3.0",
    name="Formal Specification",
    version="3.1.0",                              # CHANGED: 3.0.0 → 3.1.0
    description=(
        "Primitives, relations, and validation rules for modeling "
        "formal specifications, technical papers, and typed "
        "execution roadmaps. v3.1: adds enforcement to Invariant, "
        "full Assumption Ledger fields, DesignDecision lifecycle, "
        "Phase domain/state-component/objective, Citation category, "
        "four new relation types, and corrects four enum mismatches."
    ),
    extends=[],

    # ─── Categories ───────────────────────────────────────────────
    categories=[
        CategoryDef(
            id="cat:structure",
            name="Structure",
            description="Document organization and composition.",
        ),
        CategoryDef(
            id="cat:type-system",
            name="Type System",
            description="Formal type definitions and schemas.",
        ),
        CategoryDef(
            id="cat:semantics",
            name="Semantics",
            description="Definitions, principles, and meaning.",
        ),
        CategoryDef(
            id="cat:process",
            name="Process",
            description="Sequential procedures and phases.",
        ),
        CategoryDef(
            id="cat:assurance",
            name="Assurance",
            description="Properties, contracts, failures, guidance.",
        ),
        CategoryDef(
            id="cat:mathematics",
            name="Mathematics",
            description=(
                "Equations, complexity analyses, and "
                "formal mathematical objects."
            ),
        ),
        CategoryDef(
            id="cat:architecture",
            name="Architecture",
            description=(
                "Components, modules, hyperparameters, "
                "and configurations."
            ),
        ),
        CategoryDef(
            id="cat:empirical",
            name="Empirical",
            description=(
                "Datasets, experiments, results, "
                "and ablation studies."
            ),
        ),
        CategoryDef(
            id="cat:bibliography",
            name="Bibliography",
            description=(
                "External citations and references "
                "to prior work."
            ),
        ),
    ],

    # ─── Scopes ───────────────────────────────────────────────────
    scopes=[
        ScopeDef(
            id="scope:fs:specification",
            name="Specification",
            rank=1,
            description="The formal document structure.",
        ),
        ScopeDef(
            id="scope:fs:method",
            name="Method",
            rank=2,
            description="The method being specified.",
        ),
        ScopeDef(
            id="scope:fs:practice",
            name="Practice",
            rank=3,
            description="Practical usage and guidance.",
        ),
        ScopeDef(
            id="scope:fs:paper:theory",
            name="Theory",
            rank=4,
            description=(
                "Mathematical foundations and "
                "complexity analysis."
            ),
        ),
        ScopeDef(
            id="scope:fs:paper:architecture",
            name="Architecture",
            rank=5,
            description=(
                "Model structure, components, configuration."
            ),
        ),
        ScopeDef(
            id="scope:fs:paper:training",
            name="Training",
            rank=6,
            description=(
                "Optimisation, regularisation, schedule."
            ),
        ),
        ScopeDef(
            id="scope:fs:paper:evaluation",
            name="Evaluation",
            rank=7,
            description=(
                "Experiments, benchmarks, ablation studies."
            ),
        ),
        # ADDED: execution scope for typed roadmap / state-transition content
        ScopeDef(
            id="scope:fs:execution",
            name="Execution",
            rank=8,
            description=(
                "Typed execution roadmap steps with state "
                "components, increments, and assumption ledger."
            ),
        ),
    ],

    # ─── Primitive Types ──────────────────────────────────────────
    primitive_types=[

        # --- Structure ---

        PrimitiveTypeDef(
            id="fs:Section",
            name="Section",
            category="cat:structure",
            description=(
                "A numbered top-level section of the specification."
            ),
            scoped=True,
            id_format=IDFormatRule(
                pattern="section:{number}",
                uniqueness="global",
            ),
            fields=[
                FieldDef(
                    name="number",
                    type="integer",
                    required=True,
                    description="Section number.",
                ),
                FieldDef(
                    name="title",
                    type="string",
                    required=True,
                    description="Section heading.",
                ),
                FieldDef(
                    name="status",
                    type='Enum["stable", "draft", "deprecated"]',
                    required=True,
                    description="Current section status.",
                ),
                FieldDef(
                    name="version",
                    type="string",
                    required=True,
                    description="Spec version for this section.",
                ),
                FieldDef(
                    name="description",
                    type="ConstrainedText",
                    required=True,
                    description="Summary of what this section covers.",
                    validation=[
                        FieldValidation(
                            rule="max_length", value=500,
                        ),
                    ],
                ),
            ],
        ),

        PrimitiveTypeDef(
            id="fs:ChangeRecord",
            name="ChangeRecord",
            category="cat:structure",
            description=(
                "A version change entry tracking spec modifications."
            ),
            scoped=False,
            id_format=IDFormatRule(
                pattern="change:{version}:{sequence}",
                uniqueness="global",
            ),
            fields=[
                FieldDef(
                    name="version",
                    type="string",
                    required=True,
                    description="Version this change belongs to.",
                ),
                FieldDef(
                    name="date",
                    type="ISO8601",
                    required=True,
                    description="Date of the change.",
                ),
                FieldDef(
                    name="author",
                    type="string",
                    required=True,
                    description="Who made the change.",
                ),
                FieldDef(
                    name="summary",
                    type="ConstrainedText",
                    required=True,
                    description="Summary of what changed.",
                    validation=[
                        FieldValidation(
                            rule="max_length", value=500,
                        ),
                    ],
                ),
                FieldDef(
                    name="affected_primitives",
                    type="string[]",
                    required=True,
                    description="IDs of primitives affected.",
                ),
            ],
        ),

        PrimitiveTypeDef(
            id="fs:Requirement",
            name="Requirement",
            category="cat:structure",
            description=(
                "An external requirement this spec satisfies."
            ),
            scoped=False,
            id_format=IDFormatRule(
                pattern="requirement:{source}:{sequence}",
                uniqueness="global",
            ),
            fields=[
                FieldDef(
                    name="source",
                    type="string",
                    required=True,
                    description="Origin (e.g. RFC number, backlog ID).",
                ),
                FieldDef(
                    name="statement",
                    type="ConstrainedText",
                    required=True,
                    description="The requirement statement.",
                    validation=[
                        FieldValidation(
                            rule="max_length", value=500,
                        ),
                    ],
                ),
                FieldDef(
                    name="priority",
                    type='Enum["must", "should", "may"]',
                    required=True,
                    description="Priority per RFC 2119.",
                ),
            ],
        ),

        PrimitiveTypeDef(
            id="fs:Audience",
            name="Audience",
            category="cat:structure",
            description=(
                "An audience or visibility tag for filtering."
            ),
            scoped=False,
            id_format=IDFormatRule(
                pattern="audience:{name}",
                uniqueness="global",
            ),
            fields=[
                FieldDef(
                    name="name",
                    type="string",
                    required=True,
                    description="Audience name.",
                ),
                FieldDef(
                    name="visibility",
                    type=(
                        'Enum["public", "internal", "restricted"]'
                    ),
                    required=True,
                    description="Visibility level.",
                ),
                FieldDef(
                    name="description",
                    type="ConstrainedText",
                    required=True,
                    description="Who this audience represents.",
                    validation=[
                        FieldValidation(
                            rule="max_length", value=280,
                        ),
                    ],
                ),
            ],
        ),

        # --- Type System ---

        PrimitiveTypeDef(
            id="fs:TypeDefinition",
            name="TypeDefinition",
            category="cat:type-system",
            description=(
                "A formal data structure or schema definition."
            ),
            scoped=False,
            id_format=IDFormatRule(
                pattern="type:{name}",
                uniqueness="global",
            ),
            fields=[
                FieldDef(
                    name="name",
                    type="string",
                    required=True,
                    description="Type name (e.g. Token, ToolCall).",
                ),
                FieldDef(
                    name="description",
                    type="ConstrainedText",
                    required=True,
                    description="What this type represents.",
                    validation=[
                        FieldValidation(
                            rule="max_length", value=500,
                        ),
                    ],
                ),
                FieldDef(
                    name="schema",
                    type="ConstrainedText",
                    required=True,
                    description="The type schema as structured text.",
                    validation=[
                        FieldValidation(
                            rule="max_length", value=2000,
                        ),
                    ],
                ),
                FieldDef(
                    name="fields",
                    type="StructField[TypeField][]",
                    required=True,
                    description="Typed fields of this definition.",
                    validation=[
                        FieldValidation(
                            rule="min_items", value=1,
                        ),
                    ],
                ),
            ],
            inline_structs=[
                InlineStructDef(
                    name="TypeField",
                    fields=[
                        FieldDef(
                            name="name",
                            type="string",
                            required=True,
                            description="Field name.",
                        ),
                        FieldDef(
                            name="field_type",
                            type="string",
                            required=True,
                            description="Field type specification.",
                        ),
                        FieldDef(
                            name="required",
                            type="boolean",
                            required=True,
                            description="Whether the field is required.",
                        ),
                        FieldDef(
                            name="description",
                            type="string",
                            required=True,
                            description="Field description.",
                        ),
                    ],
                ),
            ],
        ),

        PrimitiveTypeDef(
            id="fs:Notation",
            name="Notation",
            category="cat:type-system",
            description=(
                "A formal notation or language used in the spec."
            ),
            scoped=False,
            id_format=IDFormatRule(
                pattern="notation:{name}",
                uniqueness="global",
            ),
            fields=[
                FieldDef(
                    name="name",
                    type="string",
                    required=True,
                    description="Notation name.",
                ),
                FieldDef(
                    name="description",
                    type="ConstrainedText",
                    required=True,
                    description="What this notation is used for.",
                    validation=[
                        FieldValidation(
                            rule="max_length", value=500,
                        ),
                    ],
                ),
                FieldDef(
                    name="syntax_reference",
                    type="string",
                    required=True,
                    description="URL or section ID for syntax docs.",
                ),
                FieldDef(
                    name="used_in",
                    type="string[]",
                    required=True,
                    description="Primitive IDs using this notation.",
                ),
            ],
        ),

        PrimitiveTypeDef(
            id="fs:EnumDef",
            name="EnumDef",
            category="cat:type-system",
            description=(
                "A reusable enumeration definition."
            ),
            scoped=False,
            id_format=IDFormatRule(
                pattern="enum:{name}",
                uniqueness="global",
            ),
            fields=[
                FieldDef(
                    name="name",
                    type="string",
                    required=True,
                    description="Enum name.",
                ),
                FieldDef(
                    name="values",
                    type="string[]",
                    required=True,
                    description="The enumeration values.",
                    validation=[
                        FieldValidation(
                            rule="min_items", value=1,
                        ),
                    ],
                ),
                FieldDef(
                    name="description",
                    type="ConstrainedText",
                    required=True,
                    description="What this enumeration represents.",
                    validation=[
                        FieldValidation(
                            rule="max_length", value=500,
                        ),
                    ],
                ),
            ],
        ),

        # --- Semantics ---

        PrimitiveTypeDef(
            id="fs:Definition",
            name="Definition",
            category="cat:semantics",
            description=(
                "A formal definition of a concept or term."
            ),
            scoped=False,
            id_format=IDFormatRule(
                pattern="def:{term}",
                uniqueness="global",
            ),
            fields=[
                FieldDef(
                    name="term",
                    type="string",
                    required=True,
                    description="The defined term.",
                ),
                FieldDef(
                    name="formal",
                    type="ConstrainedText",
                    required=True,
                    description="Formal definition.",
                    validation=[
                        FieldValidation(
                            rule="max_length", value=1000,
                        ),
                    ],
                ),
                FieldDef(
                    name="informal",
                    type="ConstrainedText",
                    required=False,
                    description="Plain-English gloss.",
                    validation=[
                        FieldValidation(
                            rule="max_length", value=500,
                        ),
                    ],
                ),
            ],
        ),

        PrimitiveTypeDef(
            id="fs:Principle",
            name="Principle",
            category="cat:semantics",
            description=(
                "A guiding design principle of the specification."
            ),
            scoped=False,
            id_format=IDFormatRule(
                pattern="principle:{name}",
                uniqueness="global",
            ),
            fields=[
                FieldDef(
                    name="name",
                    type="string",
                    required=True,
                    description="Principle name.",
                ),
                FieldDef(
                    name="statement",
                    type="ConstrainedText",
                    required=True,
                    description="What this principle requires.",
                    validation=[
                        FieldValidation(
                            rule="max_length", value=500,
                        ),
                    ],
                ),
            ],
        ),

        PrimitiveTypeDef(
            id="fs:Example",
            name="Example",
            category="cat:semantics",
            description=(
                "A concrete example or counterexample "
                "illustrating a primitive."
            ),
            scoped=False,
            id_format=IDFormatRule(
                pattern="example:{name}",
                uniqueness="global",
            ),
            fields=[
                FieldDef(
                    name="name",
                    type="string",
                    required=True,
                    description="Example name.",
                ),
                FieldDef(
                    name="content",
                    type="ConstrainedText",
                    required=True,
                    description="The example content.",
                    validation=[
                        FieldValidation(
                            rule="max_length", value=2000,
                        ),
                    ],
                ),
                FieldDef(
                    name="is_counter",
                    type="boolean",
                    required=True,
                    description="Whether this is a counterexample.",
                ),
            ],
        ),

        PrimitiveTypeDef(
            id="fs:DesignDecision",
            name="DesignDecision",
            category="cat:semantics",
            description=(
                "A recorded design decision with alternatives."
            ),
            scoped=False,
            id_format=IDFormatRule(
                pattern="decision:{name}",
                uniqueness="global",
            ),
            fields=[
                FieldDef(
                    name="name",
                    type="string",
                    required=True,
                    description="Decision name.",
                ),
                FieldDef(
                    name="context",
                    type="ConstrainedText",
                    required=True,
                    description="Context motivating this decision.",
                    validation=[
                        FieldValidation(
                            rule="max_length", value=500,
                        ),
                    ],
                ),
                FieldDef(
                    name="decision",
                    type="ConstrainedText",
                    required=True,
                    description="The chosen approach.",
                    validation=[
                        FieldValidation(
                            rule="max_length", value=500,
                        ),
                    ],
                ),
                FieldDef(
                    name="alternatives",
                    type="StructField[Alternative][]",
                    required=True,
                    description="Alternatives that were considered.",
                    validation=[
                        FieldValidation(
                            rule="min_items", value=1,
                        ),
                    ],
                ),
                FieldDef(
                    name="consequences",
                    type="ConstrainedText",
                    required=True,
                    description="Consequences of the decision.",
                    validation=[
                        FieldValidation(
                            rule="max_length", value=500,
                        ),
                    ],
                ),
                # ADDED: ADR lifecycle and attribution fields
                FieldDef(
                    name="status",
                    type=(
                        'Enum["Proposed", "Accepted", '
                        '"Deprecated", "Superseded"]'
                    ),
                    required=False,
                    description=(
                        "Lifecycle status of this decision. "
                        "Omit only for informal decisions."
                    ),
                ),
                FieldDef(
                    name="decision_authority",
                    type="string",
                    required=False,
                    description=(
                        "Named person or role with final "
                        "authority (DA). Compound DAs use "
                        "'Role A + Role B' convention."
                    ),
                ),
                FieldDef(
                    name="structured_id",
                    type="string",
                    required=False,
                    description=(
                        "Structured ledger identifier in "
                        "D-NN.kk form (step + within-step index)."
                    ),
                ),
            ],
            inline_structs=[
                InlineStructDef(
                    name="Alternative",
                    fields=[
                        FieldDef(
                            name="option",
                            type="string",
                            required=True,
                            description="Alternative option name.",
                        ),
                        FieldDef(
                            name="rejected_because",
                            type="string",
                            required=True,
                            description="Why this was rejected.",
                        ),
                    ],
                ),
            ],
        ),

        PrimitiveTypeDef(
            id="fs:Assumption",
            name="Assumption",
            category="cat:semantics",
            description=(
                "An assumption, axiom, or tracked hypothesis "
                "with lifecycle status. Serves as both a static "
                "axiom record and a live Assumption Ledger entry "
                "(H-NN.kk) in execution roadmaps."
            ),
            scoped=False,
            id_format=IDFormatRule(
                pattern="assumption:{name}",
                uniqueness="global",
            ),
            fields=[
                FieldDef(
                    name="name",
                    type="string",
                    required=True,
                    description="Assumption name.",
                ),
                FieldDef(
                    name="statement",
                    type="ConstrainedText",
                    required=True,
                    description="Falsifiable claim or axiom statement.",
                    validation=[
                        FieldValidation(
                            rule="max_length", value=500,
                        ),
                    ],
                ),
                FieldDef(
                    name="kind",
                    type=(
                        'Enum["axiom", "assumption", '
                        '"hypothesis", "prerequisite"]'  # CHANGED: added "hypothesis"
                    ),
                    required=True,
                    description=(
                        "Classification: axiom (taken as given), "
                        "assumption (believed true), "
                        "hypothesis (to be tested), "
                        "prerequisite (external dependency)."
                    ),
                ),
                FieldDef(
                    name="falsifiable",
                    type="boolean",
                    required=True,
                    description="Whether this can be disproved.",
                ),
                # ADDED: Assumption Ledger fields (H-NN.kk support)
                FieldDef(
                    name="status",
                    type=(
                        'Enum["verified", "unverified", '
                        '"assumed", "invalidated", "superseded"]'
                    ),
                    required=False,
                    description=(
                        "Ledger status. 'assumed' requires "
                        "risk_owner. 'superseded' requires "
                        "superseded_by."
                    ),
                ),
                FieldDef(
                    name="risk_owner",
                    type="string",
                    required=False,
                    description=(
                        "Named person responsible for an "
                        "'assumed' entry."
                    ),
                ),
                FieldDef(
                    name="superseded_by",
                    type="string",
                    required=False,
                    description=(
                        "ID of the assumption that replaced "
                        "this one. Required when status is "
                        "'superseded'."
                    ),
                ),
                FieldDef(
                    name="last_reviewed_in_step",
                    type="string",
                    required=False,
                    description=(
                        "Step identifier of the last projection "
                        "pass that examined this entry."
                    ),
                ),
                FieldDef(
                    name="structured_id",
                    type="string",
                    required=False,
                    description=(
                        "Ledger identifier in H-NN.kk form "
                        "(step of origin + within-step index)."
                    ),
                ),
            ],
        ),

        # --- Process ---

        PrimitiveTypeDef(
            id="fs:Phase",
            name="Phase",
            category="cat:process",
            description=(
                "A sequential processing phase of the method."
            ),
            scoped=True,
            id_format=IDFormatRule(
                pattern="phase:{number}",
                uniqueness="global",
            ),
            fields=[
                FieldDef(
                    name="number",
                    type="integer",
                    required=True,
                    description="Phase number.",
                ),
                FieldDef(
                    name="name",
                    type="string",
                    required=True,
                    description="Phase name.",
                ),
                FieldDef(
                    name="question",
                    type="ConstrainedText",
                    required=True,
                    description="The question this phase answers.",
                    validation=[
                        FieldValidation(
                            rule="max_length", value=280,
                        ),
                    ],
                ),
                FieldDef(
                    name="inputs",
                    type="ConstrainedText",
                    required=True,
                    description="What this phase consumes.",
                    validation=[
                        FieldValidation(
                            rule="max_length", value=500,
                        ),
                    ],
                ),
                FieldDef(
                    name="outputs",
                    type="ConstrainedText",
                    required=True,
                    description="What this phase produces.",
                    validation=[
                        FieldValidation(
                            rule="max_length", value=500,
                        ),
                    ],
                ),
                FieldDef(
                    name="procedure",
                    type="string[]",          # CHANGED: ConstrainedText → string[]
                    required=True,
                    description="Ordered list of steps in this phase.",
                    validation=[
                        FieldValidation(
                            rule="min_items", value=1,
                        ),
                    ],
                ),
                FieldDef(
                    name="exit_condition",
                    type="ConstrainedText",
                    required=True,
                    description="When this phase is considered done.",
                    validation=[
                        FieldValidation(
                            rule="max_length", value=500,
                        ),
                    ],
                ),
                FieldDef(
                    name="parallel_with",
                    type="string[]",
                    required=False,
                    description="IDs of concurrent phases.",
                ),
                FieldDef(
                    name="branch_condition",
                    type="ConstrainedText",
                    required=False,
                    description="Condition for conditional flow.",
                    validation=[
                        FieldValidation(
                            rule="max_length", value=500,
                        ),
                    ],
                ),
                # ADDED: roadmap execution fields
                FieldDef(
                    name="domain",
                    type="string",
                    required=False,
                    description=(
                        "Functional domain responsible for this "
                        "phase (e.g. Strategy, Engineering, Security)."
                    ),
                ),
                FieldDef(
                    name="state_component",
                    type="string",
                    required=False,
                    description=(
                        "State component this phase owns under the "
                        "single-writer discipline (e.g. S.problem_frame)."
                    ),
                ),
                FieldDef(
                    name="objective",
                    type="ConstrainedText",
                    required=False,
                    description=(
                        "Prose objective — what this phase "
                        "must accomplish."
                    ),
                    validation=[
                        FieldValidation(
                            rule="max_length", value=500,
                        ),
                    ],
                ),
            ],
        ),

        PrimitiveTypeDef(
            id="fs:Actor",
            name="Actor",
            category="cat:process",
            description=(
                "A role or agent that participates in a phase."
            ),
            scoped=False,
            id_format=IDFormatRule(
                pattern="actor:{name}",
                uniqueness="global",
            ),
            fields=[
                FieldDef(
                    name="name",
                    type="string",
                    required=True,
                    description="Actor or role name.",
                ),
                FieldDef(
                    name="kind",
                    type=(
                        'Enum["human", "automated", "hybrid"]'
                    ),
                    required=True,
                    description="Type of actor.",
                ),
                FieldDef(
                    name="responsibilities",
                    type="ConstrainedText",
                    required=True,
                    description="What this actor is responsible for.",
                    validation=[
                        FieldValidation(
                            rule="max_length", value=500,
                        ),
                    ],
                ),
            ],
        ),

        # --- Assurance ---

        PrimitiveTypeDef(
            id="fs:Contract",
            name="Contract",
            category="cat:assurance",
            description=(
                "A pre/postcondition contract between phases."
            ),
            scoped=False,
            id_format=IDFormatRule(
                pattern="contract:{transition}",
                uniqueness="global",
            ),
            fields=[
                FieldDef(
                    name="transition",
                    type="string",
                    required=True,
                    description="Phase transition (e.g. Phase 0 to 1).",
                ),
                FieldDef(
                    name="precondition",
                    type="ConstrainedText",
                    required=True,
                    description="What must hold before transition.",
                    validation=[
                        FieldValidation(
                            rule="max_length", value=500,
                        ),
                    ],
                ),
                FieldDef(
                    name="postcondition",
                    type="ConstrainedText",
                    required=True,
                    description="What must hold after transition.",
                    validation=[
                        FieldValidation(
                            rule="max_length", value=500,
                        ),
                    ],
                ),
            ],
        ),

        PrimitiveTypeDef(
            id="fs:FormalProperty",
            name="FormalProperty",
            category="cat:assurance",
            description=(
                "A formal claim about the method with justification."
            ),
            scoped=False,
            id_format=IDFormatRule(
                pattern="property:{name}",
                uniqueness="global",
            ),
            fields=[
                FieldDef(
                    name="name",
                    type="string",
                    required=True,
                    description="Property name.",
                ),
                FieldDef(
                    name="claim",
                    type="ConstrainedText",
                    required=True,
                    description="The formal claim.",
                    validation=[
                        FieldValidation(
                            rule="max_length", value=1000,
                        ),
                    ],
                ),
                FieldDef(
                    name="intuition",
                    type="ConstrainedText",
                    required=True,
                    description="Why this property holds.",
                    validation=[
                        FieldValidation(
                            rule="max_length", value=500,
                        ),
                    ],
                ),
                FieldDef(
                    name="caveat",
                    type="ConstrainedText",
                    required=False,
                    description="Conditions under which it may fail.",
                    validation=[
                        FieldValidation(
                            rule="max_length", value=500,
                        ),
                    ],
                ),
            ],
        ),

        PrimitiveTypeDef(
            id="fs:FailureMode",
            name="FailureMode",
            category="cat:assurance",
            description=(
                "A failure mode with recovery strategy."
            ),
            scoped=False,
            id_format=IDFormatRule(
                pattern="failure:{phase}:{slug}",
                uniqueness="global",
            ),
            fields=[
                FieldDef(
                    name="phase",
                    type="string",
                    required=True,
                    description="Which phase this affects.",
                ),
                FieldDef(
                    name="slug",
                    type="string",
                    required=True,
                    description="Short kebab-case identifier.",
                    validation=[
                        FieldValidation(
                            rule="max_length", value=40,
                        ),
                    ],
                ),
                FieldDef(
                    name="condition",
                    type="ConstrainedText",
                    required=True,
                    description="What triggers this failure.",
                    validation=[
                        FieldValidation(
                            rule="max_length", value=280,
                        ),
                    ],
                ),
                FieldDef(
                    name="recovery",
                    type="ConstrainedText",
                    required=True,
                    description="How to recover from this failure.",
                    validation=[
                        FieldValidation(
                            rule="max_length", value=500,
                        ),
                    ],
                ),
                FieldDef(
                    name="severity",
                    type='Enum["halts", "degrades", "warns"]',  # FIXED: "flags" → "warns"
                    required=True,
                    description="Impact severity.",
                ),
            ],
        ),

        PrimitiveTypeDef(
            id="fs:Limitation",
            name="Limitation",
            category="cat:assurance",
            description="A known limitation or open question.",
            scoped=False,
            id_format=IDFormatRule(
                pattern="limitation:{kind}:{sequence}",
                uniqueness="global",
            ),
            fields=[
                FieldDef(
                    name="description",
                    type="ConstrainedText",
                    required=True,
                    description="What the limitation is.",
                    validation=[
                        FieldValidation(
                            rule="max_length", value=500,
                        ),
                    ],
                ),
                FieldDef(
                    name="kind",
                    type=(
                        'Enum["limitation", "open-problem", '  # FIXED: was "open_question","strength"
                        '"known-issue"]'
                    ),
                    required=True,
                    description="Classification of this item.",
                ),
            ],
        ),

        PrimitiveTypeDef(
            id="fs:Guideline",
            name="Guideline",
            category="cat:assurance",
            description=(
                "A practical usage guideline or recommendation."
            ),
            scoped=True,
            id_format=IDFormatRule(
                pattern="guideline:{name}",
                uniqueness="global",
            ),
            fields=[
                FieldDef(
                    name="name",
                    type="string",
                    required=True,
                    description="Guideline name.",
                ),
                FieldDef(
                    name="description",
                    type="ConstrainedText",
                    required=True,
                    description="What the guideline recommends.",
                    validation=[
                        FieldValidation(
                            rule="max_length", value=500,
                        ),
                    ],
                ),
                FieldDef(
                    name="kind",
                    type=(
                        'Enum["when_to_use", "when_not_to_use", '
                        '"reporting"]'
                    ),
                    required=True,
                    description="Guideline category.",
                ),
            ],
        ),

        PrimitiveTypeDef(
            id="fs:Invariant",
            name="Invariant",
            category="cat:assurance",
            description=(
                "A property that must hold across all phases or "
                "within a named scope. Supports both global spec "
                "invariants and per-phase roadmap invariants "
                "(I-NN.kk) with explicit enforcement classification."
            ),
            scoped=False,
            id_format=IDFormatRule(
                pattern="invariant:{name}",
                uniqueness="global",
            ),
            fields=[
                FieldDef(
                    name="name",
                    type="string",
                    required=True,
                    description="Invariant name.",
                ),
                FieldDef(
                    name="statement",
                    type="ConstrainedText",
                    required=True,
                    description="The invariant statement.",
                    validation=[
                        FieldValidation(
                            rule="max_length", value=1000,
                        ),
                    ],
                ),
                FieldDef(
                    name="extent",                # FIXED: was "scope" — shadows primitive scope attr
                    type='Enum["global", "phase-local"]',  # FIXED: was "phase_local" (snake_case)
                    required=True,
                    description=(
                        "Whether this invariant holds globally "
                        "across all phases or only within a "
                        "specific phase."
                    ),
                ),
                FieldDef(
                    name="enforcement",           # ADDED: hard/soft classification
                    type='Enum["CI", "Review"]',
                    required=True,
                    description=(
                        "CI: machine-enforced (hard invariant, "
                        "gates pipeline). "
                        "Review: human-enforced (soft invariant, "
                        "checked in retro-validation pass)."
                    ),
                ),
                FieldDef(
                    name="justification",
                    type="ConstrainedText",
                    required=False,
                    description="Why this invariant holds.",
                    validation=[
                        FieldValidation(
                            rule="max_length", value=500,
                        ),
                    ],
                ),
                FieldDef(
                    name="origin_phase",          # ADDED: step provenance
                    type="string",
                    required=False,
                    description=(
                        "ID of the phase that first establishes "
                        "this invariant (e.g. 'phase:1'). "
                        "Derivable from structured_id NN component."
                    ),
                ),
            ],
        ),

        PrimitiveTypeDef(
            id="fs:TestCase",
            name="TestCase",
            category="cat:assurance",
            description=(
                "A verification case for a property or contract."
            ),
            scoped=False,
            id_format=IDFormatRule(
                pattern="testcase:{name}",
                uniqueness="global",
            ),
            fields=[
                FieldDef(
                    name="name",
                    type="string",
                    required=True,
                    description="Test case name.",
                ),
                FieldDef(
                    name="description",
                    type="ConstrainedText",
                    required=True,
                    description="What this test verifies.",
                    validation=[
                        FieldValidation(
                            rule="max_length", value=500,
                        ),
                    ],
                ),
                FieldDef(
                    name="input",
                    type="ConstrainedText",
                    required=True,
                    description="Test input data.",
                    validation=[
                        FieldValidation(
                            rule="max_length", value=1000,
                        ),
                    ],
                ),
                FieldDef(
                    name="expected_output",
                    type="ConstrainedText",
                    required=True,
                    description="Expected output or result.",
                    validation=[
                        FieldValidation(
                            rule="max_length", value=1000,
                        ),
                    ],
                ),
                FieldDef(
                    name="method",
                    type='Enum["manual", "automated", "proof"]',
                    required=True,
                    description="Verification method.",
                ),
            ],
        ),

        # --- Mathematics (CR-001) ---

        PrimitiveTypeDef(
            id="fs:Equation",
            name="Equation",
            category="cat:mathematics",
            description=(
                "A named mathematical expression with "
                "declared variables."
            ),
            scoped=False,
            id_format=IDFormatRule(
                pattern="equation:{name}",
                uniqueness="global",
            ),
            fields=[
                FieldDef(
                    name="name",
                    type="string",
                    required=True,
                    description="Equation name or label.",
                ),
                FieldDef(
                    name="number",
                    type="integer",
                    required=False,
                    description=(
                        "Display number as it appears "
                        "in the paper."
                    ),
                ),
                FieldDef(
                    name="expression",
                    type="ConstrainedText",
                    required=True,
                    description=(
                        "The mathematical expression in "
                        "a declared notation."
                    ),
                    validation=[
                        FieldValidation(
                            rule="max_length", value=2000,
                        ),
                    ],
                ),
                FieldDef(
                    name="notation",
                    type=(
                        'Enum["latex", "mathml", '
                        '"pseudocode", "ascii"]'
                    ),
                    required=True,
                    description=(
                        "Notation format used in expression."
                    ),
                ),
                FieldDef(
                    name="variables",
                    type="StructField[Variable][]",
                    required=True,
                    description="Variables used in equation.",
                    validation=[
                        FieldValidation(
                            rule="min_items", value=1,
                        ),
                    ],
                ),
                FieldDef(
                    name="domain_constraints",
                    type="ConstrainedText",
                    required=False,
                    description=(
                        "Domain restrictions on inputs."
                    ),
                    validation=[
                        FieldValidation(
                            rule="max_length", value=1000,
                        ),
                    ],
                ),
                FieldDef(
                    name="derivation",
                    type="ConstrainedText",
                    required=False,
                    description=(
                        "Informal justification or "
                        "derivation sketch."
                    ),
                    validation=[
                        FieldValidation(
                            rule="max_length", value=2000,
                        ),
                    ],
                ),
            ],
            inline_structs=[
                InlineStructDef(
                    name="Variable",
                    fields=[
                        FieldDef(
                            name="name",
                            type="string",
                            required=True,
                            description="Variable name.",
                        ),
                        FieldDef(
                            name="shape",
                            type="string",
                            required=True,
                            description="Type or shape.",
                        ),
                        FieldDef(
                            name="description",
                            type="string",
                            required=True,
                            description="Variable description.",
                        ),
                    ],
                ),
            ],
        ),

        PrimitiveTypeDef(
            id="fs:ComplexityAnalysis",
            name="ComplexityAnalysis",
            category="cat:mathematics",
            description=(
                "A comparative complexity analysis of "
                "multiple mechanisms."
            ),
            scoped=False,
            id_format=IDFormatRule(
                pattern="complexity:{name}",
                uniqueness="global",
            ),
            fields=[
                FieldDef(
                    name="name",
                    type="string",
                    required=True,
                    description="Analysis name.",
                ),
                FieldDef(
                    name="entries",
                    type="StructField[ComplexityEntry][]",
                    required=True,
                    description=(
                        "One entry per mechanism compared."
                    ),
                    validation=[
                        FieldValidation(
                            rule="min_items", value=1,
                        ),
                    ],
                ),
                FieldDef(
                    name="dimensions",
                    type="string[]",
                    required=True,
                    description=(
                        "Complexity dimensions measured."
                    ),
                    validation=[
                        FieldValidation(
                            rule="min_items", value=1,
                        ),
                    ],
                ),
                FieldDef(
                    name="conclusion",
                    type="ConstrainedText",
                    required=False,
                    description="Summary finding.",
                    validation=[
                        FieldValidation(
                            rule="max_length", value=500,
                        ),
                    ],
                ),
            ],
            inline_structs=[
                InlineStructDef(
                    name="ComplexityEntry",
                    fields=[
                        FieldDef(
                            name="mechanism",
                            type="string",
                            required=True,
                            description="Mechanism name.",
                        ),
                        FieldDef(
                            name="values",
                            type="string[]",
                            required=True,
                            description=(
                                "Complexity values per dimension."
                            ),
                        ),
                        FieldDef(
                            name="notes",
                            type="string",
                            required=True,
                            description="Additional notes.",
                        ),
                    ],
                ),
            ],
        ),

        # --- Architecture (CR-001) ---

        PrimitiveTypeDef(
            id="fs:Component",
            name="Component",
            category="cat:architecture",
            description=(
                "An architectural component or module "
                "with typed I/O."
            ),
            scoped=True,
            id_format=IDFormatRule(
                pattern="component:{name}",
                uniqueness="global",
            ),
            fields=[
                FieldDef(
                    name="name",
                    type="string",
                    required=True,
                    description="Component name.",
                ),
                FieldDef(
                    name="description",
                    type="ConstrainedText",
                    required=True,
                    description="What this component does.",
                    validation=[
                        FieldValidation(
                            rule="max_length", value=1000,
                        ),
                    ],
                ),
                FieldDef(
                    name="inputs",
                    type="StructField[TensorSpec][]",
                    required=True,
                    description="Input tensor specifications.",
                    validation=[
                        FieldValidation(
                            rule="min_items", value=1,
                        ),
                    ],
                ),
                FieldDef(
                    name="outputs",
                    type="StructField[TensorSpec][]",
                    required=True,
                    description="Output tensor specifications.",
                    validation=[
                        FieldValidation(
                            rule="min_items", value=1,
                        ),
                    ],
                ),
                FieldDef(
                    name="parameters",
                    type="string[]",
                    required=False,
                    description=(
                        "Hyperparameter IDs that configure "
                        "this component."
                    ),
                ),
                FieldDef(
                    name="sub_components",
                    type="string[]",
                    required=False,
                    description=(
                        "IDs of child fs:Component instances."
                    ),
                ),
                FieldDef(
                    name="repeat_count",
                    type="string",
                    required=False,
                    description=(
                        "Expression for stacking count."
                    ),
                ),
                FieldDef(
                    name="implements",
                    type="string",
                    required=False,
                    description=(
                        "ID of the fs:Equation this "
                        "component realises."
                    ),
                ),
            ],
            inline_structs=[
                InlineStructDef(
                    name="TensorSpec",
                    fields=[
                        FieldDef(
                            name="name",
                            type="string",
                            required=True,
                            description="Tensor name.",
                        ),
                        FieldDef(
                            name="shape",
                            type="string",
                            required=True,
                            description="Tensor shape.",
                        ),
                        FieldDef(
                            name="dtype",
                            type="string",
                            required=True,
                            description="Data type.",
                        ),
                        FieldDef(
                            name="description",
                            type="string",
                            required=True,
                            description="Tensor description.",
                        ),
                    ],
                ),
            ],
        ),

        PrimitiveTypeDef(
            id="fs:Hyperparameter",
            name="Hyperparameter",
            category="cat:architecture",
            description=(
                "A named hyperparameter with type and "
                "default value."
            ),
            scoped=False,
            id_format=IDFormatRule(
                pattern="hyperparam:{symbol}",
                uniqueness="global",
            ),
            fields=[
                FieldDef(
                    name="name",
                    type="string",
                    required=True,
                    description="Human-readable name.",
                ),
                FieldDef(
                    name="symbol",
                    type="string",
                    required=True,
                    description="Mathematical symbol.",
                ),
                FieldDef(
                    name="dtype",
                    type=(
                        'Enum["integer", "float", '
                        '"boolean", "string"]'
                    ),
                    required=True,
                    description="Value type.",
                ),
                FieldDef(
                    name="default_value",
                    type="string",
                    required=True,
                    description="Default value as string.",
                ),
                FieldDef(
                    name="valid_range",
                    type="ConstrainedText",
                    required=False,
                    description=(
                        "Valid range or constraint."
                    ),
                    validation=[
                        FieldValidation(
                            rule="max_length", value=200,
                        ),
                    ],
                ),
                FieldDef(
                    name="sensitivity",
                    type="ConstrainedText",
                    required=False,
                    description=(
                        "Notes on effect of varying "
                        "this parameter."
                    ),
                    validation=[
                        FieldValidation(
                            rule="max_length", value=500,
                        ),
                    ],
                ),
            ],
        ),

        PrimitiveTypeDef(
            id="fs:Configuration",
            name="Configuration",
            category="cat:architecture",
            description=(
                "A named configuration bundle assigning "
                "hyperparameter values."
            ),
            scoped=False,
            id_format=IDFormatRule(
                pattern="config:{name}",
                uniqueness="global",
            ),
            fields=[
                FieldDef(
                    name="name",
                    type="string",
                    required=True,
                    description="Configuration name.",
                ),
                FieldDef(
                    name="description",
                    type="ConstrainedText",
                    required=False,
                    description=(
                        "What distinguishes this configuration."
                    ),
                    validation=[
                        FieldValidation(
                            rule="max_length", value=500,
                        ),
                    ],
                ),
                FieldDef(
                    name="values",
                    type="StructField[ParamValue][]",
                    required=True,
                    description=(
                        "Concrete hyperparameter assignments."
                    ),
                    validation=[
                        FieldValidation(
                            rule="min_items", value=1,
                        ),
                    ],
                ),
                FieldDef(
                    name="training_cost",
                    type="ConstrainedText",
                    required=False,
                    description=(
                        "Estimated training cost."
                    ),
                    validation=[
                        FieldValidation(
                            rule="max_length", value=200,
                        ),
                    ],
                ),
            ],
            inline_structs=[
                InlineStructDef(
                    name="ParamValue",
                    fields=[
                        FieldDef(
                            name="hyperparameter",
                            type="string",
                            required=True,
                            description=(
                                "Hyperparameter ID."
                            ),
                        ),
                        FieldDef(
                            name="value",
                            type="string",
                            required=True,
                            description=(
                                "Assigned value."
                            ),
                        ),
                    ],
                ),
            ],
        ),

        # --- Empirical (CR-001) ---

        PrimitiveTypeDef(
            id="fs:Dataset",
            name="Dataset",
            category="cat:empirical",
            description=(
                "A dataset used for training or evaluation."
            ),
            scoped=False,
            id_format=IDFormatRule(
                pattern="dataset:{name}",
                uniqueness="global",
            ),
            fields=[
                FieldDef(
                    name="name",
                    type="string",
                    required=True,
                    description="Dataset name.",
                ),
                FieldDef(
                    name="description",
                    type="ConstrainedText",
                    required=True,
                    description="Content, domain, source.",
                    validation=[
                        FieldValidation(
                            rule="max_length", value=500,
                        ),
                    ],
                ),
                FieldDef(
                    name="size",
                    type="string",
                    required=True,
                    description=(
                        "Number of examples or relevant "
                        "size metric."
                    ),
                ),
                FieldDef(
                    name="preprocessing",
                    type="ConstrainedText",
                    required=False,
                    description=(
                        "Tokenisation, cleaning, filtering."
                    ),
                    validation=[
                        FieldValidation(
                            rule="max_length", value=500,
                        ),
                    ],
                ),
                FieldDef(
                    name="splits",
                    type="string[]",
                    required=False,
                    description="Named splits.",
                ),
                FieldDef(
                    name="vocabulary",
                    type="ConstrainedText",
                    required=False,
                    description=(
                        "Vocabulary construction details."
                    ),
                    validation=[
                        FieldValidation(
                            rule="max_length", value=300,
                        ),
                    ],
                ),
            ],
        ),

        PrimitiveTypeDef(
            id="fs:Experiment",
            name="Experiment",
            category="cat:empirical",
            description=(
                "A training or evaluation experiment."
            ),
            scoped=False,
            id_format=IDFormatRule(
                pattern="experiment:{name}",
                uniqueness="global",
            ),
            fields=[
                FieldDef(
                    name="name",
                    type="string",
                    required=True,
                    description="Experiment name.",
                ),
                FieldDef(
                    name="configuration",
                    type="string",
                    required=True,
                    description=(
                        "ID of the fs:Configuration used."
                    ),
                ),
                FieldDef(
                    name="dataset",
                    type="string",
                    required=True,
                    description=(
                        "ID of the fs:Dataset used."
                    ),
                ),
                FieldDef(
                    name="hardware",
                    type="ConstrainedText",
                    required=False,
                    description=(
                        "Hardware description."
                    ),
                    validation=[
                        FieldValidation(
                            rule="max_length", value=300,
                        ),
                    ],
                ),
                FieldDef(
                    name="training_time",
                    type="string",
                    required=False,
                    description="Wall-clock training time.",
                ),
                FieldDef(
                    name="optimiser",
                    type="ConstrainedText",
                    required=False,
                    description=(
                        "Optimiser and schedule description."
                    ),
                    validation=[
                        FieldValidation(
                            rule="max_length", value=500,
                        ),
                    ],
                ),
                FieldDef(
                    name="procedure",
                    type="ConstrainedText",
                    required=False,
                    description=(
                        "Training procedure details."
                    ),
                    validation=[
                        FieldValidation(
                            rule="max_length", value=1000,
                        ),
                    ],
                ),
            ],
        ),

        PrimitiveTypeDef(
            id="fs:Result",
            name="Result",
            category="cat:empirical",
            description=(
                "A benchmark result from an experiment."
            ),
            scoped=False,
            id_format=IDFormatRule(
                pattern="result:{experiment}:{metric}",
                uniqueness="global",
            ),
            fields=[
                FieldDef(
                    name="name",
                    type="string",
                    required=True,
                    description="Result identifier.",
                ),
                FieldDef(
                    name="experiment",
                    type="string",
                    required=True,
                    description=(
                        "ID of the fs:Experiment that "
                        "produced this."
                    ),
                ),
                FieldDef(
                    name="metric",
                    type="string",
                    required=True,
                    description="Metric name.",
                ),
                FieldDef(
                    name="value",
                    type="string",
                    required=True,
                    description="Measured value.",
                ),
                FieldDef(
                    name="is_external_baseline",
                    type="boolean",
                    required=True,
                    description=(
                        "True if reported by an external "
                        "paper rather than produced here."
                    ),
                ),
                FieldDef(
                    name="is_state_of_art",
                    type="boolean",
                    required=False,
                    description=(
                        "Whether this set a new "
                        "state-of-the-art."
                    ),
                ),
            ],
        ),

        PrimitiveTypeDef(
            id="fs:AblationStudy",
            name="AblationStudy",
            category="cat:empirical",
            description=(
                "An ablation study comparing variations "
                "of a configuration."
            ),
            scoped=False,
            id_format=IDFormatRule(
                pattern="ablation:{name}",
                uniqueness="global",
            ),
            fields=[
                FieldDef(
                    name="name",
                    type="string",
                    required=True,
                    description="Ablation study name.",
                ),
                FieldDef(
                    name="base_configuration",
                    type="string",
                    required=True,
                    description=(
                        "ID of the baseline configuration."
                    ),
                ),
                FieldDef(
                    name="variations",
                    type="StructField[Variation][]",
                    required=True,
                    description=(
                        "Each row of the ablation table."
                    ),
                    validation=[
                        FieldValidation(
                            rule="min_items", value=2,
                        ),
                    ],
                ),
                FieldDef(
                    name="conclusion",
                    type="ConstrainedText",
                    required=False,
                    description="Summary finding.",
                    validation=[
                        FieldValidation(
                            rule="max_length", value=500,
                        ),
                    ],
                ),
            ],
            inline_structs=[
                InlineStructDef(
                    name="Variation",
                    fields=[
                        FieldDef(
                            name="label",
                            type="string",
                            required=True,
                            description="Variation label.",
                        ),
                        FieldDef(
                            name="changes",
                            type="string",
                            required=True,
                            description=(
                                "What was changed."
                            ),
                        ),
                        FieldDef(
                            name="result_metric",
                            type="string",
                            required=True,
                            description="Metric name.",
                        ),
                        FieldDef(
                            name="result_value",
                            type="string",
                            required=True,
                            description="Metric value.",
                        ),
                    ],
                ),
            ],
        ),

        # --- Structure additions (CR-001) ---

        PrimitiveTypeDef(
            id="fs:Figure",
            name="Figure",
            category="cat:structure",
            description=(
                "A figure or diagram in the document."
            ),
            scoped=False,
            id_format=IDFormatRule(
                pattern="figure:{number}",
                uniqueness="global",
            ),
            fields=[
                FieldDef(
                    name="number",
                    type="integer",
                    required=True,
                    description="Figure number.",
                ),
                FieldDef(
                    name="caption",
                    type="ConstrainedText",
                    required=True,
                    description="Figure caption.",
                    validation=[
                        FieldValidation(
                            rule="max_length", value=500,
                        ),
                    ],
                ),
                FieldDef(
                    name="kind",
                    type=(
                        'Enum["architecture_diagram", '
                        '"data_flow", "attention_map", '
                        '"chart", "table", "other"]'
                    ),
                    required=True,
                    description="Figure type.",
                ),
                FieldDef(
                    name="depicts",
                    type="string[]",
                    required=True,
                    description=(
                        "IDs of primitives depicted."
                    ),
                    validation=[
                        FieldValidation(
                            rule="min_items", value=1,
                        ),
                    ],
                ),
                FieldDef(
                    name="asset_path",
                    type="string",
                    required=False,
                    description=(
                        "Path to image asset if available."
                    ),
                ),
            ],
        ),

        # --- Bibliography (CR-001) ---

        PrimitiveTypeDef(
            id="fs:Citation",
            name="Citation",
            category="cat:bibliography",
            description=(
                "An external citation or reference "
                "to prior work."
            ),
            scoped=False,
            id_format=IDFormatRule(
                pattern="citation:{key}",
                uniqueness="global",
            ),
            fields=[
                FieldDef(
                    name="key",
                    type="string",
                    required=True,
                    description="Citation key.",
                ),
                FieldDef(
                    name="authors",
                    type="string[]",
                    required=True,
                    description="Author names.",
                    validation=[
                        FieldValidation(
                            rule="min_items", value=1,
                        ),
                    ],
                ),
                FieldDef(
                    name="title",
                    type="string",
                    required=True,
                    description="Work title.",
                ),
                FieldDef(
                    name="venue",
                    type="string",
                    required=False,
                    description="Publication venue.",
                ),
                FieldDef(
                    name="year",
                    type="integer",
                    required=True,
                    description="Publication year.",
                ),
                FieldDef(
                    name="url",
                    type="string",
                    required=False,
                    description="URL or DOI.",
                ),
                # ADDED: classification and currency tracking
                FieldDef(
                    name="category",
                    type=(
                        'Enum["standard", "framework", '
                        '"regulation", "vendor", "book", "paper"]'
                    ),
                    required=False,
                    description=(
                        "Reference category for bibliography "
                        "grouping and validity scoping."
                    ),
                ),
                FieldDef(
                    name="currency_date",
                    type="ISO8601",
                    required=False,
                    description=(
                        "Date at which this citation was verified "
                        "current. Supports references_currency "
                        "discipline — stale entries are flagged "
                        "after this date."
                    ),
                ),
            ],
        ),
    ],

    # ─── Relation Types ───────────────────────────────────────────
    relation_types=[
        RelationTypeDef(
            id="fs:ContainedIn",
            name="ContainedIn",
            description="Content belongs to a section.",
            source_types=_CONTAINABLE_IDS,
            target_types=["fs:Section"],
            cardinality=Cardinality(
                source_min=1,
                source_max=None,
                target_min=1,
            ),
            metadata_schema=[
                FieldDef(
                    name="is_primary",
                    type="boolean",
                    required=True,
                    description="Primary containment location.",
                ),
                FieldDef(
                    name="order",
                    type="integer",
                    required=True,
                    description="Rendering order within section.",
                ),
            ],
        ),
        RelationTypeDef(
            id="fs:DependsOn",
            name="DependsOn",
            description="Section depends on another section.",
            source_types=["fs:Section"],
            target_types=["fs:Section"],
            metadata_schema=[
                FieldDef(
                    name="reason",
                    type="string",
                    required=True,
                    description="Why this dependency exists.",
                ),
            ],
            transitive=True,
        ),
        RelationTypeDef(
            id="fs:References",
            name="References",
            description="Content cross-references another primitive.",
            source_types=_ALL_PRIMITIVE_IDS,
            target_types=_ALL_PRIMITIVE_IDS,
            metadata_schema=[
                FieldDef(
                    name="kind",
                    type=(
                        'Enum["uses", "refines", '
                        '"overrides", "see_also"]'
                    ),
                    required=True,
                    description="Reference semantics.",
                ),
                FieldDef(
                    name="context",
                    type="string",
                    required=False,
                    description="Context of the reference.",
                ),
            ],
        ),
        RelationTypeDef(
            id="fs:Precedes",
            name="Precedes",
            description="Phase ordering.",
            source_types=["fs:Phase"],
            target_types=["fs:Phase"],
            transitive=True,
        ),
        RelationTypeDef(
            id="fs:GovernsTransition",
            name="GovernsTransition",
            description="Contract governs a phase boundary.",
            source_types=["fs:Contract"],
            target_types=["fs:Phase"],
        ),
        RelationTypeDef(
            id="fs:Validates",
            name="Validates",
            description="Property validates a mechanism, phase, or section.",
            source_types=["fs:FormalProperty"],
            target_types=[
                "fs:Phase",
                "fs:Definition",
                "fs:TypeDefinition",
                "fs:Section",              # ADDED: properties can validate sections
            ],
        ),
        RelationTypeDef(
            id="fs:Mitigates",
            name="Mitigates",
            # FIXED: was source=FailureMode, target=Limitation — semantically backwards.
            # FailureModes are problems, not mitigations. Corrected direction:
            # a Guideline or FormalProperty mitigates a FailureMode or Limitation.
            description=(
                "Guideline or formal property mitigates a "
                "failure mode or known limitation."
            ),
            source_types=["fs:Guideline", "fs:FormalProperty"],
            target_types=["fs:FailureMode", "fs:Limitation"],
        ),

        # --- New relation types ---

        RelationTypeDef(
            id="fs:Illustrates",
            name="Illustrates",
            description=(
                "Attaches an example to the primitive "
                "it illustrates."
            ),
            source_types=["fs:Example"],
            target_types=_ALL_PRIMITIVE_IDS,
        ),
        RelationTypeDef(
            id="fs:Amends",
            name="Amends",
            description=(
                "Links a change record to modified primitives."
            ),
            source_types=["fs:ChangeRecord"],
            target_types=_ALL_PRIMITIVE_IDS,
        ),
        RelationTypeDef(
            id="fs:Verifies",
            name="Verifies",
            description=(
                "Links a test case to the property it verifies."
            ),
            source_types=["fs:TestCase"],
            target_types=[
                "fs:FormalProperty",
                "fs:Contract",
                "fs:Invariant",
            ],
        ),
        RelationTypeDef(
            id="fs:Satisfies",
            name="Satisfies",
            description=(
                "Traces spec elements to external requirements."
            ),
            source_types=[
                "fs:Phase",
                "fs:Contract",
                "fs:Definition",
            ],
            target_types=["fs:Requirement"],
        ),
        RelationTypeDef(
            id="fs:Performs",
            name="Performs",
            description="Assigns an actor or role to a phase.",
            source_types=["fs:Actor"],
            target_types=["fs:Phase"],
        ),
        RelationTypeDef(
            id="fs:VisibleTo",
            name="VisibleTo",
            description=(
                "Tags a primitive with audience visibility."
            ),
            source_types=_ALL_PRIMITIVE_IDS,
            target_types=["fs:Audience"],
        ),
        RelationTypeDef(
            id="fs:TermRelation",
            name="TermRelation",
            description=(
                "Semantic relationship between definitions."
            ),
            source_types=["fs:Definition"],
            target_types=["fs:Definition"],
            metadata_schema=[
                FieldDef(
                    name="kind",
                    type=(
                        'Enum["synonym", "specializes", '
                        '"equivalent", "antonym"]'
                    ),
                    required=True,
                    description="Terminological relationship kind.",
                ),
            ],
        ),

        # --- CR-001 relation types ---

        RelationTypeDef(
            id="fs:Implements",
            name="Implements",
            description=(
                "Component implements an equation."
            ),
            source_types=["fs:Component"],
            target_types=["fs:Equation"],
        ),
        RelationTypeDef(
            id="fs:ComposedOf",
            name="ComposedOf",
            description=(
                "Component contains a sub-component."
            ),
            source_types=["fs:Component"],
            target_types=["fs:Component"],
            metadata_schema=[
                FieldDef(
                    name="order",
                    type="integer",
                    required=True,
                    description="Order within parent.",
                ),
                FieldDef(
                    name="repeat",
                    type="string",
                    required=False,
                    description="Repeat expression.",
                ),
            ],
        ),
        RelationTypeDef(
            id="fs:ParameterOf",
            name="ParameterOf",
            description=(
                "Hyperparameter parametrises a component."
            ),
            source_types=["fs:Hyperparameter"],
            target_types=["fs:Component"],
        ),
        RelationTypeDef(
            id="fs:EvaluatedOn",
            name="EvaluatedOn",
            description=(
                "Experiment evaluated on a dataset."
            ),
            source_types=["fs:Experiment"],
            target_types=["fs:Dataset"],
        ),
        RelationTypeDef(
            id="fs:ProducedBy",
            name="ProducedBy",
            description=(
                "Result produced by an experiment."
            ),
            source_types=["fs:Result"],
            target_types=["fs:Experiment"],
        ),
        RelationTypeDef(
            id="fs:ComparesTo",
            name="ComparesTo",
            description=(
                "Result compared to another result."
            ),
            source_types=["fs:Result"],
            target_types=["fs:Result"],
            metadata_schema=[
                FieldDef(
                    name="metric",
                    type="string",
                    required=True,
                    description="Comparison metric.",
                ),
                FieldDef(
                    name="delta",
                    type="string",
                    required=True,
                    description="Difference value.",
                ),
            ],
        ),
        RelationTypeDef(
            id="fs:AblationOf",
            name="AblationOf",
            description=(
                "Ablation study of a configuration."
            ),
            source_types=["fs:AblationStudy"],
            target_types=["fs:Configuration"],
        ),
        RelationTypeDef(
            id="fs:Cites",
            name="Cites",
            description=(
                "Any primitive cites a citation."
            ),
            source_types=_ALL_PRIMITIVE_IDS,
            target_types=["fs:Citation"],
            metadata_schema=[
                FieldDef(
                    name="claim",
                    type="string",
                    required=False,
                    description="Claim being supported.",
                ),
            ],
        ),
        RelationTypeDef(
            id="fs:Depicts",
            name="Depicts",
            description=(
                "Figure depicts one or more primitives."
            ),
            source_types=["fs:Figure"],
            target_types=_ALL_PRIMITIVE_IDS,
        ),
        RelationTypeDef(
            id="fs:DataFlow",
            name="DataFlow",
            description=(
                "Data flows between components."
            ),
            source_types=["fs:Component"],
            target_types=["fs:Component"],
            metadata_schema=[
                FieldDef(
                    name="tensor",
                    type="string",
                    required=True,
                    description="Tensor being passed.",
                ),
                FieldDef(
                    name="is_residual",
                    type="boolean",
                    required=True,
                    description=(
                        "Whether this is a residual "
                        "connection."
                    ),
                ),
            ],
        ),
        RelationTypeDef(
            id="fs:SharedWeights",
            name="SharedWeights",
            description=(
                "Components share weight parameters."
            ),
            source_types=["fs:Component"],
            target_types=["fs:Component"],
            metadata_schema=[
                FieldDef(
                    name="parameter_name",
                    type="string",
                    required=True,
                    description="Shared parameter name.",
                ),
            ],
            transitive=True,
        ),
        RelationTypeDef(
            id="fs:DerivedFrom",
            name="DerivedFrom",
            description=(
                "Equation derived from another equation."
            ),
            source_types=["fs:Equation"],
            target_types=["fs:Equation"],
            metadata_schema=[
                FieldDef(
                    name="derivation_kind",
                    type=(
                        'Enum["specialises", "combines", '
                        '"approximates"]'
                    ),
                    required=True,
                    description="Kind of derivation.",
                ),
            ],
        ),

        # ADDED: four relation types closing gaps from representation assessment

        RelationTypeDef(
            id="fs:OccursIn",
            name="OccursIn",
            description=(
                "Failure mode can occur within the given phase. "
                "Resolves orphan FailureMode nodes that previously "
                "had no relation to the phase graph."
            ),
            source_types=["fs:FailureMode"],
            target_types=["fs:Phase"],
        ),
        RelationTypeDef(
            id="fs:Qualifies",
            name="Qualifies",
            description=(
                "Limitation or formal property qualifies the "
                "validity scope of a phase or section — i.e., "
                "the target is valid only under the constraint "
                "expressed by the source."
            ),
            source_types=["fs:Limitation", "fs:FormalProperty"],
            target_types=["fs:Phase", "fs:Section"],
        ),
        RelationTypeDef(
            id="fs:SupersededBy",
            name="SupersededBy",
            description=(
                "Assumption has been superseded by a newer "
                "assumption. Preserves the ledger trail: the "
                "source entry is not deleted but marked with a "
                "forward pointer. Pairs with Assumption.superseded_by "
                "field for bi-directional traceability."
            ),
            source_types=["fs:Assumption"],
            target_types=["fs:Assumption"],
        ),
        RelationTypeDef(
            id="fs:Enforces",
            name="Enforces",
            description=(
                "Invariant must be upheld by the target phase, "
                "section, or contract. Stronger than fs:Validates "
                "(which expresses property verification); "
                "fs:Enforces expresses obligation. "
                "Enforcement level is carried in metadata."
            ),
            source_types=["fs:Invariant"],
            target_types=["fs:Phase", "fs:Section", "fs:Contract"],
            metadata_schema=[
                FieldDef(
                    name="enforcement",
                    type='Enum["CI", "Review"]',
                    required=True,
                    description=(
                        "How this invariant is enforced at "
                        "the target: CI (automated gate) or "
                        "Review (human retro-validation)."
                    ),
                ),
            ],
        ),
    ],

    # ─── Validation Rules ─────────────────────────────────────────
    validation_rules=[
        ValidationRuleDef(
            id="fs:val:phase-has-question",
            name="Phase must have a question",
            description=(
                "Every phase must state the question it answers."
            ),
            level=ValidationLevel.ERROR,
            applies_to=["fs:Phase"],
            predicate="non_trivial(question)",
        ),
        ValidationRuleDef(
            id="fs:val:contract-complete",
            name="Contract must have pre and postcondition",
            description=(
                "A contract requires both pre and postcondition."
            ),
            level=ValidationLevel.ERROR,
            applies_to=["fs:Contract"],
            predicate=(
                "non_trivial(precondition) and "
                "non_trivial(postcondition)"
            ),
        ),
        ValidationRuleDef(
            id="fs:val:property-has-intuition",
            name="Property should explain intuition",
            description=(
                "Formal properties should explain why they hold."
            ),
            level=ValidationLevel.WARNING,
            applies_to=["fs:FormalProperty"],
            predicate="non_trivial(intuition)",
        ),
        ValidationRuleDef(
            id="fs:val:failure-has-recovery",
            name="Failure mode must specify recovery",
            description=(
                "Every failure mode must describe a recovery."
            ),
            level=ValidationLevel.ERROR,
            applies_to=["fs:FailureMode"],
            predicate="non_trivial(recovery)",
        ),
        ValidationRuleDef(
            id="fs:val:example-has-content",
            name="Example must have content",
            description=(
                "Every example must have non-trivial content."
            ),
            level=ValidationLevel.ERROR,
            applies_to=["fs:Example"],
            predicate="non_trivial(content)",
        ),
        ValidationRuleDef(
            id="fs:val:invariant-has-statement",
            name="Invariant must have statement",
            description=(
                "Every invariant must state what must hold."
            ),
            level=ValidationLevel.ERROR,
            applies_to=["fs:Invariant"],
            predicate="non_trivial(statement)",
        ),
        ValidationRuleDef(
            id="fs:val:testcase-has-expected",
            name="TestCase must have expected output",
            description=(
                "Every test case must define expected output."
            ),
            level=ValidationLevel.ERROR,
            applies_to=["fs:TestCase"],
            predicate="non_trivial(expected_output)",
        ),
        ValidationRuleDef(
            id="fs:val:decision-has-alternatives",
            name="DesignDecision should have alternatives",
            description=(
                "Design decisions should list alternatives."
            ),
            level=ValidationLevel.WARNING,
            applies_to=["fs:DesignDecision"],
            predicate="min_items(alternatives, 1)",
        ),

        # --- CR-001 validation rules ---

        ValidationRuleDef(
            id="fs:val:equation-has-variables",
            name="Equation must declare variables",
            description=(
                "Every equation must declare at least "
                "one variable."
            ),
            level=ValidationLevel.ERROR,
            applies_to=["fs:Equation"],
            predicate="min_items(variables, 1)",
        ),
        ValidationRuleDef(
            id="fs:val:component-has-io",
            name="Component must have inputs and outputs",
            description=(
                "Every component must specify inputs "
                "and outputs."
            ),
            level=ValidationLevel.ERROR,
            applies_to=["fs:Component"],
            predicate=(
                "min_items(inputs, 1) and "
                "min_items(outputs, 1)"
            ),
        ),
        ValidationRuleDef(
            id="fs:val:experiment-has-result",
            name="Experiment should have results",
            description=(
                "Every experiment should have at least "
                "one associated result."
            ),
            level=ValidationLevel.WARNING,
            applies_to=["fs:Experiment"],
            predicate="has_incoming(fs:ProducedBy)",
        ),
        ValidationRuleDef(
            id="fs:val:result-has-comparison",
            name="Result should have comparison",
            description=(
                "Non-baseline results should compare "
                "to at least one other result."
            ),
            level=ValidationLevel.WARNING,
            applies_to=["fs:Result"],
            predicate=(
                "has_outgoing(fs:ComparesTo) or "
                "field(is_external_baseline) == true"
            ),
        ),
        ValidationRuleDef(
            id="fs:val:config-has-values",
            name="Configuration must assign values",
            description=(
                "A configuration must assign at least "
                "one hyperparameter value."
            ),
            level=ValidationLevel.ERROR,
            applies_to=["fs:Configuration"],
            predicate="min_items(values, 1)",
        ),
        ValidationRuleDef(
            id="fs:val:ablation-has-variations",
            name="Ablation must have variations",
            description=(
                "An ablation must contain at least two "
                "variations to be meaningful."
            ),
            level=ValidationLevel.ERROR,
            applies_to=["fs:AblationStudy"],
            predicate="min_items(variations, 2)",
        ),
        ValidationRuleDef(
            id="fs:val:citation-has-year",
            name="Citation must have year",
            description=(
                "Every citation must include a "
                "publication year."
            ),
            level=ValidationLevel.ERROR,
            applies_to=["fs:Citation"],
            predicate="non_trivial(year)",
        ),
        ValidationRuleDef(
            id="fs:val:figure-has-depicts",
            name="Figure should reference depicted primitives",
            description=(
                "Figures should reference the primitives "
                "they depict."
            ),
            level=ValidationLevel.WARNING,
            applies_to=["fs:Figure"],
            predicate="min_items(depicts, 1)",
        ),
        ValidationRuleDef(
            id="fs:val:component-acyclic",
            name="Component composition must be acyclic",
            description=(
                "The fs:ComposedOf relation graph must "
                "be a DAG."
            ),
            level=ValidationLevel.ERROR,
            applies_to=["fs:Component"],
            predicate="acyclic(fs:ComposedOf)",
        ),

        # ADDED: validation rules for v3.1 fields and relations

        ValidationRuleDef(
            id="fs:val:invariant-has-enforcement",
            name="Invariant must declare enforcement level",
            description=(
                "Every invariant must specify whether it is "
                "CI-enforced (hard) or review-enforced (soft). "
                "Without this, the Invariant Ledger is not auditable."
            ),
            level=ValidationLevel.ERROR,
            applies_to=["fs:Invariant"],
            predicate="non_trivial(enforcement)",
        ),
        ValidationRuleDef(
            id="fs:val:assumption-has-status",
            name="Assumption should declare ledger status",
            description=(
                "Assumptions used in execution roadmaps should "
                "carry a lifecycle status to make the Assumption "
                "Ledger queryable."
            ),
            level=ValidationLevel.WARNING,
            applies_to=["fs:Assumption"],
            predicate="non_trivial(status)",
        ),
        ValidationRuleDef(
            id="fs:val:assumption-assumed-needs-owner",
            name="'assumed' entry requires risk_owner",
            description=(
                "An assumption with status 'assumed' must name "
                "a risk owner. An ownerless assumed entry is an "
                "unaccountable risk."
            ),
            level=ValidationLevel.ERROR,
            applies_to=["fs:Assumption"],
            predicate=(
                "field(status) != 'assumed' or "
                "non_trivial(risk_owner)"
            ),
        ),
        ValidationRuleDef(
            id="fs:val:assumption-superseded-needs-pointer",
            name="'superseded' entry requires superseded_by",
            description=(
                "An assumption with status 'superseded' must "
                "carry a forward pointer to its replacement, "
                "preserving the ledger trail."
            ),
            level=ValidationLevel.ERROR,
            applies_to=["fs:Assumption"],
            predicate=(
                "field(status) != 'superseded' or "
                "non_trivial(superseded_by)"
            ),
        ),
        ValidationRuleDef(
            id="fs:val:phase-has-failure-mode",
            name="Phase should have at least one failure mode",
            description=(
                "Every phase should document at least one "
                "failure mode via an fs:OccursIn relation. "
                "Phases without failure modes are under-specified."
            ),
            level=ValidationLevel.WARNING,
            applies_to=["fs:Phase"],
            predicate="has_incoming(fs:OccursIn)",
        ),
        ValidationRuleDef(
            id="fs:val:citation-not-stale",
            name="Citation should have a currency_date",
            description=(
                "Citations used in documents with a "
                "references_currency discipline should carry "
                "a currency_date so stale references can be flagged."
            ),
            level=ValidationLevel.WARNING,
            applies_to=["fs:Citation"],
            predicate="non_trivial(currency_date)",
        ),
    ],

    # ─── Renderers ────────────────────────────────────────────────
    renderers=[
        RendererBinding(
            renderer_id="fs:SpecRenderer",
            name="Specification Documents",
            output_format="text/markdown",
            output_path="spec/{section}.md",
            description=(
                "Generates full spec as ordered markdown sections."
            ),
        ),
        RendererBinding(
            renderer_id="fs:TypeCatalogRenderer",
            name="Type Catalog",
            output_format="text/markdown",
            output_path="types.md",
            description=(
                "Generates a type definitions reference."
            ),
        ),

        # --- CR-001 renderers ---

        RendererBinding(
            renderer_id="fs:ArchitectureRenderer",
            name="Architecture Reference",
            output_format="text/markdown",
            output_path="architecture.md",
            description=(
                "Generates component hierarchy with "
                "tensor shapes and equations."
            ),
        ),
        RendererBinding(
            renderer_id="fs:ExperimentLogRenderer",
            name="Experiment Log",
            output_format="text/markdown",
            output_path="experiments.md",
            description=(
                "Generates experiment matrix with "
                "configurations, datasets, and results."
            ),
        ),
        RendererBinding(
            renderer_id="fs:BibliographyRenderer",
            name="Bibliography",
            output_format="text/markdown",
            output_path="bibliography.md",
            description=(
                "Generates a formatted reference list "
                "from fs:Citation primitives."
            ),
        ),
    ],

    # ─── Templates ────────────────────────────────────────────────
    templates=[
        TemplateDef(
            id="fs:tpl:full-specification",
            name="Full Specification",
            description="Complete ordered spec document.",
            rendering_rules=RenderingRules(
                voice="passive",
                tense="present",
                person="third",
            ),
            target_renderer="markdown",
        ),
        TemplateDef(
            id="fs:tpl:type-catalog",
            name="Type Catalog",
            description="Type definitions reference document.",
            rendering_rules=RenderingRules(
                voice="active",
                tense="present",
                person="second",
            ),
            target_renderer="markdown",
        ),
        TemplateDef(
            id="fs:tpl:phase-walkthrough",
            name="Phase Walkthrough",
            description="Phase-by-phase guide to the method.",
            rendering_rules=RenderingRules(
                voice="active",
                tense="present",
                person="second",
            ),
            target_renderer="markdown",
        ),
    ],

    # ─── Scope Sets ──────────────────────────────────────────────
    scope_sets={
        "process": [
            "scope:fs:specification",
            "scope:fs:method",
            "scope:fs:practice",
            "scope:fs:execution",     # ADDED: typed roadmap / state-transition content
        ],
        "paper": [
            "scope:fs:paper:theory",
            "scope:fs:paper:architecture",
            "scope:fs:paper:training",
            "scope:fs:paper:evaluation",
        ],
    },
    default_scope_set="process",
)


def register(store: Store) -> None:
    """Register this profile with the store."""
    store.register_profile(FORMAL_SPECIFICATION_PROFILE)