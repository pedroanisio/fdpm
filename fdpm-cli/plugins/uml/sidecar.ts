/**
 * UML Foundation plugin sidecar — the single source of truth for the
 * bridge derivation, shared by activate() at runtime and
 * scripts/run-bridge.ts at build time.
 *
 * WHAT THE BRIDGE SEES. Fourteen entities, each identified by its
 * `xmi_id` (ULID). Every entity holds intrinsic attributes only.
 *
 * WHAT THE BRIDGE DOES NOT SEE, AND WHY. UML's cross-element structure
 * is polymorphic: `Package::ownedMember` holds any PackageableElement,
 * `Comment::annotatedElement` any Element. The sidecar's `ReferenceSpec`
 * emits one relation with a single `target_type_id`
 * (packages/zod-bridge/src/sidecar-orchestrator.ts, pass D), which
 * cannot express that. The host can — `RelationTypeDef.source_types` /
 * `target_types` accept a list or `"*"` (src/core/models/meta.ts) — so
 * the twelve relation types are author-declared here and merged into the
 * generated profile by finalizeProfile(). They are covered by the same
 * drift gate as everything else the bridge writes.
 */

import { z } from "zod";
import { defineDomain } from "@fdpm/zod-bridge";
import { Schemas, UmlId, UML_VERSION, DependencyKind } from "./schemas/uml-foundation.js";

export const PROFILE_ID = "profile:uml:2.5" as const;
export const PLUGIN_ID = "fdpm.uml" as const;
export const PLUGIN_VERSION = "0.1.0" as const;
export const HOST_COMPATIBILITY = ">=1.2,<2" as const;
export const VENDOR = "uml" as const;

export const ENTITY_SCHEMAS = Schemas;
export type EntityName = keyof typeof ENTITY_SCHEMAS;
export const ENTITY_NAMES = Object.keys(ENTITY_SCHEMAS) as EntityName[];

/** `uml:<Entity>` — the PrimitiveTypeDef id the bridge emits. */
export function primitiveTypeId(name: EntityName): string {
  return `${VENDOR}:${name}`;
}

/** `uml:<Entity>:<ulid>` — matches the bridge's `{slug}` id template. */
export function primitiveId(name: EntityName, xmiId: string): string {
  return `${VENDOR}:${name}:${xmiId}`;
}

/** Classifiers: everything a Property/Parameter can be typed by, or that can specialise. */
export const CLASSIFIER_TYPES = [
  "uml:Class",
  "uml:Interface",
  "uml:DataType",
  "uml:PrimitiveType",
  "uml:Enumeration",
  "uml:Association",
] as const;

/** PackageableElements a Package/Model may own (UML 2.5.1 §12.2.3). */
export const PACKAGEABLE_TYPES = [
  "uml:Package",
  "uml:Model",
  ...CLASSIFIER_TYPES,
  "uml:Constraint",
] as const;

/** Everything — the target set for annotation, constraint and dependency. */
export const ALL_TYPES = ENTITY_NAMES.map(primitiveTypeId);

/** Feature owners: classifiers that may own attributes or operations. */
export const FEATURE_OWNER_TYPES = [
  "uml:Class",
  "uml:Interface",
  "uml:DataType",
  "uml:PrimitiveType",
  "uml:Enumeration",
] as const;

export const REL = {
  Owns: "uml:Owns",
  OwnsAttribute: "uml:OwnsAttribute",
  OwnsOperation: "uml:OwnsOperation",
  OwnsParameter: "uml:OwnsParameter",
  OwnsLiteral: "uml:OwnsLiteral",
  Specializes: "uml:Specializes",
  Realizes: "uml:Realizes",
  DependsOn: "uml:DependsOn",
  TypedBy: "uml:TypedBy",
  MemberEnd: "uml:MemberEnd",
  Annotates: "uml:Annotates",
  Constrains: "uml:Constrains",
} as const;

export type RelationName = keyof typeof REL;

interface RelationTypeSpec {
  id: string;
  name: string;
  description: string;
  source_types: readonly string[];
  target_types: readonly string[];
  cardinality: "one-to-one" | "one-to-many" | "many-to-one" | "many-to-many";
  fields: ReadonlyArray<Record<string, unknown>>;
}

/**
 * The twelve typed edges of the Foundation subset. Each names the UML
 * 2.5.1 clause it realises, because the field it replaces is gone from
 * the entity schema and this is the only place the correspondence is
 * written down.
 */
export const RELATION_TYPES: readonly RelationTypeSpec[] = [
  {
    id: REL.Owns,
    name: "owns",
    description:
      "Namespace ownership — Package::packagedElement (§12.2.3). The owned element is deleted with its owner.",
    source_types: ["uml:Package", "uml:Model"],
    target_types: PACKAGEABLE_TYPES,
    cardinality: "one-to-many",
    fields: [],
  },
  {
    id: REL.OwnsAttribute,
    name: "owns_attribute",
    description: "Classifier::ownedAttribute (§9.2.3) — the classifier's structural features, in order.",
    source_types: [...FEATURE_OWNER_TYPES, "uml:Association"],
    target_types: ["uml:Property"],
    cardinality: "one-to-many",
    fields: [
      {
        name: "position",
        kind: "integer",
        required: false,
        description: "0-based declaration order inside the owner.",
        validations: [],
      },
    ],
  },
  {
    id: REL.OwnsOperation,
    name: "owns_operation",
    description: "Classifier::ownedOperation (§9.6) — the classifier's behavioral features, in order.",
    source_types: FEATURE_OWNER_TYPES,
    target_types: ["uml:Operation"],
    cardinality: "one-to-many",
    fields: [
      {
        name: "position",
        kind: "integer",
        required: false,
        description: "0-based declaration order inside the owner.",
        validations: [],
      },
    ],
  },
  {
    id: REL.OwnsParameter,
    name: "owns_parameter",
    description: "BehavioralFeature::ownedParameter (§9.4) — the operation's signature, in order.",
    source_types: ["uml:Operation"],
    target_types: ["uml:Parameter"],
    cardinality: "one-to-many",
    fields: [
      {
        name: "position",
        kind: "integer",
        required: false,
        description: "0-based position in the signature.",
        validations: [],
      },
    ],
  },
  {
    id: REL.OwnsLiteral,
    name: "owns_literal",
    description: "Enumeration::ownedLiteral (§10.5.3) — the enumeration's values, in order.",
    source_types: ["uml:Enumeration"],
    target_types: ["uml:EnumerationLiteral"],
    cardinality: "one-to-many",
    fields: [
      {
        name: "position",
        kind: "integer",
        required: false,
        description: "0-based order of the literal.",
        validations: [],
      },
    ],
  },
  {
    id: REL.Specializes,
    name: "specializes",
    description:
      "Generalization (§9.9): source is the specific classifier, target the general one. The Generalization element's own xmi:id is not preserved — see declaredLoss.",
    source_types: CLASSIFIER_TYPES,
    target_types: CLASSIFIER_TYPES,
    cardinality: "many-to-many",
    fields: [
      {
        name: "is_substitutable",
        kind: "boolean",
        required: false,
        description: "Whether the specific classifier can substitute for the general one.",
        validations: [],
      },
    ],
  },
  {
    id: REL.Realizes,
    name: "realizes",
    description: "InterfaceRealization (§10.4.4) — the classifier implements the interface's contract.",
    source_types: ["uml:Class", "uml:DataType"],
    target_types: ["uml:Interface"],
    cardinality: "many-to-many",
    fields: [],
  },
  {
    id: REL.DependsOn,
    name: "depends_on",
    description:
      "Dependency (§7.8) — the client requires the supplier. `kind` carries the standard specialisation.",
    source_types: ALL_TYPES,
    target_types: ALL_TYPES,
    cardinality: "many-to-many",
    fields: [
      {
        name: "kind",
        kind: "enum",
        required: false,
        description: "Dependency specialisation (§7.8.4).",
        enum_values: DependencyKind.options,
        validations: [],
      },
    ],
  },
  {
    id: REL.TypedBy,
    name: "typed_by",
    description: "TypedElement::type (§7.7) — the classifier that types this property, parameter or result.",
    source_types: ["uml:Property", "uml:Parameter", "uml:Operation"],
    target_types: CLASSIFIER_TYPES,
    cardinality: "many-to-one",
    fields: [],
  },
  {
    id: REL.MemberEnd,
    name: "member_end",
    description:
      "Association::memberEnd (§11.5.3) — the two or more properties that are the association's ends.",
    source_types: ["uml:Association"],
    target_types: ["uml:Property"],
    cardinality: "one-to-many",
    fields: [
      {
        name: "position",
        kind: "integer",
        required: false,
        description: "0-based end order; end 0 is the source end by convention.",
        validations: [],
      },
      {
        name: "is_navigable",
        kind: "boolean",
        required: false,
        description: "Whether the end is navigable from the opposite end.",
        validations: [],
      },
    ],
  },
  {
    id: REL.Annotates,
    name: "annotates",
    description: "Comment::annotatedElement (§7.3.3) — the elements the comment is attached to.",
    source_types: ["uml:Comment"],
    target_types: ALL_TYPES,
    cardinality: "many-to-many",
    fields: [],
  },
  {
    id: REL.Constrains,
    name: "constrains",
    description: "Constraint::constrainedElement (§7.6.3) — the elements the condition applies to.",
    source_types: ["uml:Constraint"],
    target_types: ALL_TYPES,
    cardinality: "many-to-many",
    fields: [],
  },
];

export const PROFILE_NAME = "UML" as const;
export const PROFILE_LABEL = "UML 2.5.1 (Foundation subset)" as const;
export const PROFILE_DESCRIPTION =
  "Bridge-generated from schemas/uml-foundation.ts — a normalisation of schemas-lib src/schemas/domains/uml (UML 2.5.1). Fourteen metaclasses as primitives (Package, Model, Class, Interface, DataType, PrimitiveType, Enumeration, EnumerationLiteral, Property, Operation, Parameter, Association, Constraint, Comment) and twelve typed edges for ownership, typing, generalisation, realisation, dependency, association ends, annotation and constraint." as const;

/**
 * The bridge emits id / primitive_types / relation_types (+ extras). This
 * adds the profile identity the host lists by, and merges the
 * author-declared relation types. Applied by BOTH scripts/run-bridge.ts
 * (into generated/profile.json) and activate(), so the drift test proves
 * the runtime profile is the file on disk.
 */
export function finalizeProfile<T extends { id: string; relation_types?: readonly unknown[] }>(
  profile: T,
): T & { version: string; name: string; label: string; description: string } {
  const clean = JSON.parse(JSON.stringify(profile)) as T;
  const generated = Array.isArray(clean.relation_types) ? clean.relation_types : [];
  return {
    ...clean,
    relation_types: [...generated, ...JSON.parse(JSON.stringify(RELATION_TYPES))],
    version: UML_VERSION,
    name: PROFILE_NAME,
    label: PROFILE_LABEL,
    description: PROFILE_DESCRIPTION,
  };
}

function asEntity(schema: z.ZodType): z.ZodObject<z.ZodRawShape> {
  return schema as unknown as z.ZodObject<z.ZodRawShape>;
}

const DOC: Record<EntityName, string> = {
  Package: "A namespace that groups packageable elements (§12.2). Owns its members via uml:Owns.",
  Model: "A Package capturing one view of the system under a viewpoint (§12.3).",
  Class: "A classifier of objects with structural and behavioral features (§11.4).",
  Interface: "A declared contract; implementers are joined by uml:Realizes (§10.4).",
  DataType: "A classifier whose instances are identified by value alone (§10.2).",
  PrimitiveType: "A DataType with no internal structure (§10.3).",
  Enumeration: "A DataType whose values are its owned literals (§10.5).",
  EnumerationLiteral: "One named value of an Enumeration (§10.5.3).",
  Property: "A structural feature — a classifier attribute or an association end (§9.5).",
  Operation: "A behavioral feature invocable on its classifier (§9.6).",
  Parameter: "One argument slot of an operation's signature (§9.4).",
  Association: "A classifier of links between typed instances; its ends are Properties (§11.5).",
  Constraint: "A condition the constrained elements must satisfy (§7.6).",
  Comment: "A textual annotation carrying no semantics (§7.3).",
};

export function buildUmlSidecar() {
  const entities = Object.fromEntries(
    ENTITY_NAMES.map((name) => [
      name,
      {
        schema: asEntity(ENTITY_SCHEMAS[name]),
        identityKind: "id-field" as const,
        idField: "xmi_id",
        idSchema: UmlId,
        doc: DOC[name],
      },
    ]),
  );

  return defineDomain({
    __sidecarSpec: "0.1",
    entities,
    aggregates: [
      {
        root: "Package",
        parts: ["Class", "Interface", "DataType", "PrimitiveType", "Enumeration", "Association", "Constraint"],
        doc: "A package owns its packaged elements; deleting the package deletes them.",
      },
      {
        root: "Class",
        parts: ["Property", "Operation"],
        doc: "A classifier owns its features; deleting the classifier deletes them.",
      },
      {
        root: "Operation",
        parts: ["Parameter"],
        doc: "An operation owns its parameters.",
      },
      {
        root: "Enumeration",
        parts: ["EnumerationLiteral"],
        doc: "An enumeration owns its literals.",
      },
    ],
    declaredLoss: [
      {
        feature: "uml.field-name-normalisation",
        kind: "soundness-loss",
        classification: "complete-but-not-sound",
        reason:
          "FieldDef.name must match ^[a-z][a-z0-9_]*$ (src/core/models/meta.ts), so every camelCase UML property is snake_cased and xmi:id / xmi:type become xmi_id / xmi_type. The mapping is mechanical and reversible; an XMI importer must apply the inverse.",
      },
      {
        feature: "uml.value-specification",
        kind: "completeness-loss",
        classification: "sound-but-not-complete",
        reason:
          "The source schemas model defaultValue / specification / lowerValue / upperValue as z.lazy(() => z.any()), which the bridge rejects. They are modelled here as a closed ValueSpecification struct (UML 2.5.1 §8.3) limited to the literal arms plus opaque_expression; Expression trees with operands are not representable.",
      },
      {
        feature: "uml.unlimited-natural",
        kind: "soundness-loss",
        classification: "complete-but-not-sound",
        reason:
          "UnlimitedNatural (number | \"*\") is a field-level union, which the bridge stores as an opaque json-union string the host's kind check rejects. `upper` is an integer with -1 meaning unlimited; a consumer printing UML notation must map -1 back to '*'.",
      },
      {
        feature: "uml.generalization-identity",
        kind: "completeness-loss",
        classification: "sound-but-not-complete",
        reason:
          "Generalization, InterfaceRealization and Dependency are Elements with their own xmi:id in UML. They are modelled as relations (uml:Specializes, uml:Realizes, uml:DependsOn) carrying their attributes, so the relationship element's own identity and its comments are not preserved.",
      },
      {
        feature: "uml.derived-unions",
        kind: "completeness-loss",
        classification: "sound-but-not-complete",
        reason:
          "UML's derived unions (Namespace::member, Classifier::inheritedMember / feature / attribute, Namespace::importedMember) are not stored. They are derivable by traversing uml:Owns / uml:OwnsAttribute / uml:Specializes, and storing them would duplicate truth the host cannot keep consistent.",
      },
      {
        feature: "uml.subset-scope",
        kind: "completeness-loss",
        classification: "sound-but-not-complete",
        reason:
          "This profile realises the Foundation packages (CommonStructure, Classification, SimpleClassifiers, StructuredClassifiers, Packages). StateMachines, Activities, Interactions, UseCases, Components, Deployments and Profiles/Stereotypes are out of scope; the source library carries 110 metaclasses in total.",
      },
    ],
    fdpm: {
      pluginId: PLUGIN_ID,
      vendor: VENDOR,
      profileId: PROFILE_ID,
      pluginVersion: PLUGIN_VERSION,
      hostCompatibility: HOST_COMPATIBILITY,
    },
  });
}
