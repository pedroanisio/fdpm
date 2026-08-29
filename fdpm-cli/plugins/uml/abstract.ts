/**
 * Which UML metaclasses are abstract — the policy every later package
 * profile inherits.
 *
 * UML 2.5.1 defines a large part of its metamodel as abstract: Element,
 * NamedElement, Classifier, Feature, Vertex, ActivityNode and their
 * kind exist to be specialised and have no instances of their own.
 * Their fields reach the model through the concrete metaclasses that
 * specialise them, which is exactly how this plugin carries them — as
 * shared field groups in schemas/uml-foundation.ts, not as types.
 *
 * The source library records abstractness only in prose doc comments,
 * so nothing downstream can read it. Without this table a bridge
 * derivation over all 110 molecules would register `uml:Classifier`
 * and `uml:Vertex` as instantiable primitive types and the host would
 * cheerfully accept instances the specification forbids.
 *
 * `clause` is the section the SOURCE LIBRARY cites for that metaclass
 * (its `@see UML 2.5.1 Section N` comment), carried through so a reader
 * can check the classification against the specification. It is
 * evidence of what the library claims, not an independent citation.
 *
 * Completeness is enforced by tests/plugins/uml/abstract-policy.test.ts
 * against tests/plugins/uml/fixtures/uml-metaclasses.source.json, so a
 * metaclass added upstream fails the suite until it is classified here.
 */

export interface MetaclassRecord {
  /** True when UML 2.5.1 defines the metaclass as abstract. */
  abstract: boolean;
  /** Clause the source library cites for this metaclass. */
  clause: string;
  /** Why it is classified this way, where that is not obvious. */
  note?: string;
}

export const METACLASS_ABSTRACTNESS: Readonly<Record<string, MetaclassRecord>> = {
  AcceptEventAction: { abstract: false, clause: "16.10" },
  Action: { abstract: true, clause: "16.2" },
  ActivityEdge: { abstract: true, clause: "15.2" },
  ActivityFinalNode: { abstract: false, clause: "15.3" },
  ActivityGroup: { abstract: true, clause: "15.5" },
  ActivityNode: { abstract: true, clause: "15.2" },
  ActivityPartition: { abstract: false, clause: "15.5" },
  Activity: { abstract: false, clause: "15.2" },
  Actor: { abstract: false, clause: "18.2" },
  AnyReceiveEvent: { abstract: false, clause: "13.3" },
  Artifact: { abstract: false, clause: "19.2" },
  AssociationClass: { abstract: false, clause: "11.5" },
  AssociationEnd: { abstract: false, clause: "11.5", note: "Not an OMG metaclass. UML 2.5.1 models association ends as Properties (§11.5); this entry is a source-library convenience and is deliberately not surfaced as a primitive type." },
  Association: { abstract: false, clause: "11.5" },
  BehaviorExecutionSpecification: { abstract: false, clause: "17.4" },
  Behavior: { abstract: true, clause: "13.2" },
  BehavioralFeature: { abstract: true, clause: "9.4" },
  CallAction: { abstract: true, clause: "16.3" },
  CallBehaviorAction: { abstract: false, clause: "16.3" },
  CallEvent: { abstract: false, clause: "13.3" },
  CallOperationAction: { abstract: false, clause: "16.3" },
  ChangeEvent: { abstract: false, clause: "13.3" },
  Class: { abstract: false, clause: "11.4" },
  Classifier: { abstract: true, clause: "9.2" },
  CombinedFragment: { abstract: false, clause: "17.6" },
  Comment: { abstract: false, clause: "7.2" },
  ComponentRealization: { abstract: false, clause: "11.6" },
  Component: { abstract: false, clause: "11.6" },
  ConnectionPointReference: { abstract: false, clause: "14.2" },
  ConnectorEnd: { abstract: false, clause: "11.2" },
  Connector: { abstract: false, clause: "11.2" },
  Constraint: { abstract: false, clause: "7.6" },
  ControlFlow: { abstract: false, clause: "15.2" },
  ControlNode: { abstract: true, clause: "15.3" },
  DataType: { abstract: false, clause: "10.2" },
  DecisionNode: { abstract: false, clause: "15.3" },
  Dependency: { abstract: false, clause: "7.7" },
  DirectedRelationship: { abstract: true, clause: "7.2" },
  ElementImport: { abstract: false, clause: "12.4" },
  Element: { abstract: true, clause: "7.2", note: "Root of the metaclass hierarchy; its fields are carried by every concrete metaclass instead." },
  EnumerationLiteral: { abstract: false, clause: "10.2" },
  Enumeration: { abstract: false, clause: "10.2" },
  Event: { abstract: true, clause: "13.3" },
  ExecutionSpecification: { abstract: true, clause: "17.4" },
  ExpansionRegion: { abstract: false, clause: "16.12" },
  Extend: { abstract: false, clause: "18.2" },
  ExtensionEnd: { abstract: false, clause: "12.3" },
  ExtensionPoint: { abstract: false, clause: "18.2" },
  Extension: { abstract: false, clause: "12.3" },
  Feature: { abstract: true, clause: "9.4" },
  FinalState: { abstract: false, clause: "14.2" },
  FlowFinalNode: { abstract: false, clause: "15.3" },
  ForkNode: { abstract: false, clause: "15.3" },
  Gate: { abstract: false, clause: "17.3" },
  GeneralOrdering: { abstract: false, clause: "17.3" },
  Generalization: { abstract: false, clause: "9.2" },
  Include: { abstract: false, clause: "18.2" },
  InitialNode: { abstract: false, clause: "15.3" },
  InputPin: { abstract: false, clause: "16.2" },
  InteractionFragment: { abstract: true, clause: "17.3" },
  InteractionOperand: { abstract: false, clause: "17.6" },
  InteractionUse: { abstract: false, clause: "17.6" },
  Interaction: { abstract: false, clause: "17.2" },
  InterfaceRealization: { abstract: false, clause: "10.4" },
  Interface: { abstract: false, clause: "10.4" },
  InterruptibleActivityRegion: { abstract: false, clause: "15.5" },
  JoinNode: { abstract: false, clause: "15.3" },
  Lifeline: { abstract: false, clause: "17.3" },
  MergeNode: { abstract: false, clause: "15.3" },
  MessageEnd: { abstract: true, clause: "17.4" },
  MessageOccurrenceSpecification: { abstract: false, clause: "17.4" },
  Message: { abstract: false, clause: "17.4" },
  Model: { abstract: false, clause: "12.4" },
  MultiplicityElement: { abstract: true, clause: "7.5" },
  NamedElement: { abstract: true, clause: "7.4" },
  Namespace: { abstract: true, clause: "7.4" },
  ObjectFlow: { abstract: false, clause: "15.2" },
  ObjectNode: { abstract: true, clause: "15.4" },
  Operation: { abstract: false, clause: "9.6" },
  OutputPin: { abstract: false, clause: "16.2" },
  PackageImport: { abstract: false, clause: "12.4" },
  PackageMerge: { abstract: false, clause: "12.4" },
  Package: { abstract: false, clause: "12.4" },
  Parameter: { abstract: false, clause: "9.4" },
  Pin: { abstract: true, clause: "16.2", note: "Superclass of InputPin and OutputPin." },
  Port: { abstract: false, clause: "11.3" },
  PrimitiveType: { abstract: false, clause: "10.2" },
  ProfileApplication: { abstract: false, clause: "12.3" },
  Profile: { abstract: false, clause: "12.3" },
  Property: { abstract: false, clause: "9.5" },
  ProtocolStateMachine: { abstract: false, clause: "14.3" },
  ProtocolTransition: { abstract: false, clause: "14.3" },
  Pseudostate: { abstract: false, clause: "14.2" },
  Reception: { abstract: false, clause: "10.2" },
  RedefinableElement: { abstract: true, clause: "7.5" },
  Region: { abstract: false, clause: "14.2" },
  Relationship: { abstract: true, clause: "7.2" },
  SendSignalAction: { abstract: false, clause: "16.3" },
  SignalEvent: { abstract: false, clause: "13.3" },
  Signal: { abstract: false, clause: "10.3" },
  StateMachine: { abstract: false, clause: "14.2" },
  State: { abstract: false, clause: "14.2" },
  Stereotype: { abstract: false, clause: "12.3" },
  StructuralFeature: { abstract: true, clause: "9.4" },
  TimeEvent: { abstract: false, clause: "13.3" },
  Transition: { abstract: false, clause: "14.2" },
  Trigger: { abstract: false, clause: "13.3" },
  TypedElement: { abstract: true, clause: "7.5" },
  UseCase: { abstract: false, clause: "18.2" },
  Vertex: { abstract: true, clause: "14.2", note: "Superclass of State and Pseudostate; a state machine graph node is always one of those." },
};

/** Metaclasses UML 2.5.1 defines as abstract — never primitive types. */
export const ABSTRACT_METACLASSES: ReadonlySet<string> = new Set(
  Object.entries(METACLASS_ABSTRACTNESS)
    .filter(([, r]) => r.abstract)
    .map(([name]) => name),
);

/** Metaclasses that may be instantiated, and so may become primitive types. */
export const CONCRETE_METACLASSES: ReadonlySet<string> = new Set(
  Object.entries(METACLASS_ABSTRACTNESS)
    .filter(([, r]) => !r.abstract)
    .map(([name]) => name),
);

/**
 * `true` for an abstract metaclass. An unknown name is NOT abstract:
 * the classification is proved complete over the source inventory by
 * test, so an unknown name is a name from outside UML, and refusing it
 * here would be the wrong error in the wrong place.
 */
export function isAbstractMetaclass(name: string): boolean {
  return METACLASS_ABSTRACTNESS[name]?.abstract === true;
}

/** `uml:Class` / `Class` -> `Class`. */
function metaclassOf(typeId: string): string {
  return typeId.split(":").pop() ?? typeId;
}

/**
 * The nearest concrete metaclass an author probably meant, for the
 * error message. Only the unambiguous cases are named; the rest get the
 * generic advice.
 */
const CONCRETE_HINT: Readonly<Record<string, string>> = {
  Classifier: "uml:Class, uml:Interface, uml:DataType, uml:Enumeration, uml:Signal or uml:Association",
  Element: "any concrete metaclass",
  NamedElement: "any concrete named metaclass, e.g. uml:Class",
  Namespace: "uml:Package or uml:Class",
  TypedElement: "uml:Property or uml:Parameter",
  MultiplicityElement: "uml:Property or uml:Parameter",
  RedefinableElement: "uml:Property, uml:Operation or uml:Class",
  Relationship: "uml:Association, or the uml:DependsOn / uml:Specializes relations",
  DirectedRelationship: "the uml:DependsOn / uml:Specializes / uml:Realizes relations",
  Feature: "uml:Property, uml:Operation or uml:Reception",
  StructuralFeature: "uml:Property",
  BehavioralFeature: "uml:Operation or uml:Reception",
  Behavior: "uml:StateMachine, uml:Activity or uml:Interaction (not in this profile yet)",
  Event: "uml:CallEvent, uml:SignalEvent, uml:TimeEvent or uml:ChangeEvent (not in this profile yet)",
  Vertex: "uml:State or uml:Pseudostate (not in this profile yet)",
  Pin: "uml:InputPin or uml:OutputPin (not in this profile yet)",
};

/** The advice half of an abstract-metaclass rejection. */
export function concreteAlternativesFor(name: string): string {
  return CONCRETE_HINT[name] ?? "one of its concrete specialisations";
}

/**
 * Guard for profile assembly: a DomainProfile must not declare a
 * primitive type for an abstract metaclass. Called by activate() so a
 * later package profile fails at load rather than silently accepting
 * instances UML 2.5.1 forbids.
 */
export function assertNoAbstractPrimitiveTypes(profile: {
  id?: string;
  primitive_types?: ReadonlyArray<{ id: string }>;
}): void {
  const offenders = (profile.primitive_types ?? [])
    .map((t) => t.id)
    .filter((id) => isAbstractMetaclass(metaclassOf(id)));
  if (offenders.length > 0) {
    throw new Error(
      `${profile.id ?? "profile"} declares ${offenders.length} primitive type(s) for abstract UML metaclasses: ${offenders.join(", ")}. ` +
        "UML 2.5.1 defines these as abstract — they have no instances. Carry their fields on the concrete metaclasses that specialise them (see plugins/uml/abstract.ts).",
    );
  }
}
