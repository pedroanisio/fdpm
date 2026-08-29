/**
 * UML 2.5.1 — Foundation subset, normalised for FDPM.
 *
 * PROVENANCE. Derived from schemas-lib
 * `src/schemas/domains/uml/` (molecules + vocabulary, UML 2.5.1, OMG
 * formal/2017-12-05). This is a *normalisation*, not a copy: the source
 * schemas cannot be handed to @fdpm/zod-bridge unchanged. Three
 * transformations are applied, each forced by a checkable host rule:
 *
 *  1. FIELD NAMES. `DomainProfile.FieldDef.name` must match
 *     `^[a-z][a-z0-9_]*$` (src/core/models/meta.ts). UML is camelCase and
 *     uses `xmi:id` / `xmi:type`, so every field is snake_cased and the
 *     XMI keys become `xmi_id` / `xmi_type`. The mapping is mechanical
 *     and reversible, so an XMI round-trip keeps its names.
 *  2. VALUE SPECIFICATIONS. The source models `defaultValue`,
 *     `specification`, `lowerValue` and `upperValue` as
 *     `z.lazy(() => z.any())`; the bridge rejects `any`
 *     (`unsupported Zod node type`). UML 2.5.1 §8.3 defines
 *     ValueSpecification as a real metaclass, so it is modelled here as
 *     a closed struct — kind + literal payload — which the bridge maps
 *     and the host stores.
 *  3. MULTIPLICITY UPPER BOUND. `UnlimitedNatural` is
 *     `number | "*"`; a field-level union becomes an opaque
 *     `format: "json-union"` string that the host's kind check and the
 *     Zod validator cannot both accept. It is normalised to an integer
 *     with `-1` meaning unlimited, and `UNLIMITED` is the named constant.
 *
 * WHAT IS NOT HERE. Cross-element structure (ownership, typing,
 * generalisation, association ends, annotation) is NOT a field. In UML
 * those are references between elements with their own identity; in FDPM
 * they are relations, declared in ../sidecar.ts and enforced by the
 * host's relation pipeline. Keeping them out of the entity schemas is
 * what stops the same Property existing twice — once embedded in
 * `Class.ownedAttribute`, once addressed by `Association.memberEnd`.
 */

import { z } from "zod";

/** Pinned OMG specification version this subset realises. */
export const UML_VERSION = "2.5.1" as const;

/** Crockford Base32 ULID, as `schemas-lib` core/atoms/branded-id.ts defines it. */
export const UML_ID_PATTERN = /^[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{26}$/;

export const UmlId = z
  .string()
  .regex(UML_ID_PATTERN, "Must be a valid ULID (26 Crockford Base32 characters)")
  .describe("XMI identity of the element — 26-character ULID, stable across moves.");

/** `upper` sentinel for UML's `*` (unlimited). */
export const UNLIMITED = -1 as const;

// ── Vocabulary (values verbatim from the source; only the carrier changes) ──

export const VisibilityKind = z.enum(["public", "private", "protected", "package"]);
export const AggregationKind = z.enum(["none", "shared", "composite"]);
export const ParameterDirectionKind = z.enum(["in", "inout", "out", "return"]);
export const ParameterEffectKind = z.enum(["create", "read", "update", "delete"]);
export const CallConcurrencyKind = z.enum(["sequential", "guarded", "concurrent"]);
/** UML 2.5.1 §7.8.4 — the standard `Dependency` specialisations we keep. */
export const DependencyKind = z.enum(["dependency", "usage", "abstraction", "realization"]);
/** UML 2.5.1 §8.3 — ValueSpecification, closed to the literal arms. */
/** UML 2.5.1 §11.2 — how a connector joins its ends. */
export const ConnectorKind = z.enum(["assembly", "delegation"]);

export const ValueSpecificationKind = z.enum([
  "literal_boolean",
  "literal_integer",
  "literal_real",
  "literal_string",
  "literal_unlimited_natural",
  "literal_null",
  "opaque_expression",
]);

/**
 * ValueSpecification — replaces the source's `z.lazy(() => z.any())`.
 * `body` carries the literal in its printed form; `language` is set only
 * for `opaque_expression` (UML 2.5.1 §8.3.3).
 */
export const ValueSpecification = z
  .object({
    kind: ValueSpecificationKind,
    body: z.string().max(4000).default(""),
    language: z.string().max(80).optional(),
  })
  .describe("UML ValueSpecification (§8.3): the kind of literal plus its printed body.");

// ── Shared field groups ────────────────────────────────────────────────

/** Every UML Element: XMI identity. */
const element = {
  xmi_id: UmlId,
  xmi_type: z.string().max(120).optional(),
} as const;

/** NamedElement (§7.4). */
const named = {
  name: z.string().min(1).max(200).optional(),
  qualified_name: z.string().max(1000).optional(),
  visibility: VisibilityKind.default("public"),
} as const;

/** MultiplicityElement (§7.5), with the union normalised away. */
const multiplicity = {
  is_ordered: z.boolean().default(false),
  is_unique: z.boolean().default(true),
  lower: z.number().int().nonnegative().default(1),
  upper: z
    .number()
    .int()
    .min(-1)
    .default(1)
    .describe("Multiplicity upper bound; -1 (UNLIMITED) is UML's `*`."),
} as const;

/** Classifier (§9.2) — the shared classifier attributes. */
const classifier = {
  is_abstract: z.boolean().default(false),
  is_final_specialization: z.boolean().default(false),
  is_leaf: z.boolean().default(false),
} as const;

// ── Entities ───────────────────────────────────────────────────────────

export const Package = z
  .object({ ...element, ...named, uri: z.string().max(2000).optional() })
  .describe("A Package groups elements and provides a namespace (§12.2).");

export const Model = z
  .object({ ...element, ...named, viewpoint: z.string().max(200).optional() })
  .describe("A Model captures a view of a system under a viewpoint (§12.3).");

export const Class = z
  .object({ ...element, ...named, ...classifier, is_active: z.boolean().default(false) })
  .describe("A Class classifies objects and specifies their features (§11.4).");

export const Interface = z
  .object({ ...element, ...named, ...classifier })
  .describe("An Interface declares a contract its implementers meet (§10.4).");

export const DataType = z
  .object({ ...element, ...named, ...classifier })
  .describe("A DataType's instances are identified only by value (§10.2).");

export const PrimitiveType = z
  .object({ ...element, ...named, ...classifier })
  .describe("A PrimitiveType has no internal structure (§10.3).");

export const Enumeration = z
  .object({ ...element, ...named, ...classifier })
  .describe("An Enumeration is a DataType whose values are named literals (§10.5).");

export const EnumerationLiteral = z
  .object({ ...element, ...named })
  .describe("A user-defined value of an Enumeration (§10.5.3).");

export const Property = z
  .object({
    ...element,
    ...named,
    ...multiplicity,
    aggregation: AggregationKind.default("none"),
    is_read_only: z.boolean().default(false),
    is_derived: z.boolean().default(false),
    is_derived_union: z.boolean().default(false),
    is_static: z.boolean().default(false),
    is_id: z.boolean().default(false),
    default_value: ValueSpecification.optional(),
  })
  .describe("A Property is a StructuralFeature — an attribute or an association end (§9.5).");

export const Operation = z
  .object({
    ...element,
    ...named,
    ...multiplicity,
    is_abstract: z.boolean().default(false),
    is_static: z.boolean().default(false),
    is_query: z.boolean().default(false),
    concurrency: CallConcurrencyKind.default("sequential"),
  })
  .describe("An Operation is a BehavioralFeature invocable on its classifier (§9.6).");

export const Parameter = z
  .object({
    ...element,
    ...named,
    ...multiplicity,
    direction: ParameterDirectionKind.default("in"),
    effect: ParameterEffectKind.optional(),
    is_exception: z.boolean().default(false),
    is_stream: z.boolean().default(false),
    default_value: ValueSpecification.optional(),
  })
  .describe("A Parameter is one argument slot of a BehavioralFeature (§9.4).");

export const Association = z
  .object({
    ...element,
    ...named,
    ...classifier,
    is_derived: z.boolean().default(false),
  })
  .describe("An Association classifies links between typed instances (§11.5).");

export const Component = z
  .object({
    ...element,
    ...named,
    ...classifier,
    is_active: z.boolean().default(false),
    is_indirectly_instantiated: z
      .boolean()
      .default(true)
      .describe("Whether the component is instantiated indirectly, through its realizing classifiers (§11.6)."),
  })
  .describe(
    "A Component is a modular part of a system whose contents are replaceable within its environment (§11.6). Its contract is the interfaces its ports provide and require.",
  );

export const Port = z
  .object({
    ...element,
    ...named,
    ...multiplicity,
    aggregation: AggregationKind.default("composite"),
    is_read_only: z.boolean().default(false),
    is_derived: z.boolean().default(false),
    is_static: z.boolean().default(false),
    is_behavior: z
      .boolean()
      .default(false)
      .describe("Requests arriving at the port are handled by the classifier's own behavior (§11.3)."),
    is_conjugated: z
      .boolean()
      .default(false)
      .describe("The provided and required interfaces are inverted relative to the port's type (§11.3)."),
    is_service: z
      .boolean()
      .default(true)
      .describe("The port is part of the classifier's published contract rather than an implementation detail (§11.3)."),
    default_value: ValueSpecification.optional(),
  })
  .describe(
    "A Port is a property of a classifier specifying a distinct interaction point between it and its environment (§11.3).",
  );

export const Connector = z
  .object({
    ...element,
    ...named,
    kind: ConnectorKind.default("assembly"),
    is_static: z.boolean().default(false),
  })
  .describe(
    "A Connector specifies a link between two or more instances playing roles in a classifier's internal structure (§11.2).",
  );

export const ConnectorEnd = z
  .object({ ...element, ...multiplicity })
  .describe(
    "A ConnectorEnd is an endpoint of a connector, attached to the role it connects (§11.2). A connector has at least two.",
  );

export const Artifact = z
  .object({
    ...element,
    ...named,
    ...classifier,
    file_name: z
      .string()
      .max(1000)
      .optional()
      .describe("Physical location of the artifact, relative to the deployment (§19.2)."),
  })
  .describe("An Artifact is a physical piece of information produced or used by a development process (§19.2).");

export const AssociationClass = z
  .object({
    ...element,
    ...named,
    ...classifier,
    is_active: z.boolean().default(false),
    is_derived: z.boolean().default(false),
  })
  .describe(
    "An AssociationClass is both an Association and a Class: the links it classifies carry their own features (§11.5).",
  );

export const Signal = z
  .object({ ...element, ...named, ...classifier })
  .describe(
    "A Signal is a classifier whose instances are asynchronous communications between objects (§11.3). Its owned attributes are the payload the communication carries.",
  );

export const Reception = z
  .object({
    ...element,
    ...named,
    is_static: z.boolean().default(false),
  })
  .describe(
    "A Reception declares that a classifier is prepared to react to a Signal (§11.4). The signal itself is joined by uml:Signals.",
  );

export const Constraint = z
  .object({
    ...element,
    ...named,
    specification: ValueSpecification,
  })
  .describe("A Constraint is a condition its constrained elements must satisfy (§7.6).");

export const Comment = z
  .object({ ...element, body: z.string().max(8000) })
  .describe("A Comment is an annotation carrying no semantics (§7.3).");

/** Every entity the bridge sees, in profile order. */
export const Schemas = {
  Package,
  Model,
  Class,
  Interface,
  DataType,
  PrimitiveType,
  Enumeration,
  EnumerationLiteral,
  Property,
  Operation,
  Parameter,
  Association,
  AssociationClass,
  Component,
  Port,
  Connector,
  ConnectorEnd,
  Artifact,
  Signal,
  Reception,
  Constraint,
  Comment,
} as const;

export type UmlEntityName = keyof typeof Schemas;
export type PackageType = z.infer<typeof Package>;
export type ClassType = z.infer<typeof Class>;
export type PropertyType = z.infer<typeof Property>;
export type OperationType = z.infer<typeof Operation>;
export type ParameterType = z.infer<typeof Parameter>;
export type AssociationType = z.infer<typeof Association>;
export type SignalType = z.infer<typeof Signal>;
export type ComponentType = z.infer<typeof Component>;
export type PortType = z.infer<typeof Port>;
export type ConnectorType = z.infer<typeof Connector>;
export type ConnectorEndType = z.infer<typeof ConnectorEnd>;
export type ArtifactType = z.infer<typeof Artifact>;
export type AssociationClassType = z.infer<typeof AssociationClass>;
export type ReceptionType = z.infer<typeof Reception>;
export type ValueSpecificationType = z.infer<typeof ValueSpecification>;
