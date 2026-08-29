# uml-roadmap — Agent Board

> Profile: `profile:planning:0.1` v0.1.0. 12 tasks. Generated at 2026-08-29T03:43:26.617Z.

## 🎯 Available to claim

- `task:uml-phase-4-common-behavior` _(Either/P1)_ — Trigger, CallEvent, ChangeEvent, SignalEvent, TimeEvent, AnyReceiveEvent (Behavior and Event are abstract). Measured: 35 attributes, 24 edge names - the smallest behavioural package, and the prerequisite for Phases 6, 7 and 8.
- `task:uml-phase-5-use-cases` _(Either/P1)_ — Actor, UseCase and ExtensionPoint as primitives; Include and Extend as relations. Measured: 28 attributes, 22 edge names, 1 z.any() field, no unions - the cheapest visible win after Foundation.

---

## Unassigned

### Ready (2)

- `task:uml-phase-4-common-behavior` _(Either/P1)_ — Trigger, CallEvent, ChangeEvent, SignalEvent, TimeEvent, AnyReceiveEvent (Behavior and Event are abstract). Measured: 35 attributes, 24 edge names - the smallest behavioural package, and the prerequisite for Phases 6, 7 and 8.
- `task:uml-phase-5-use-cases` _(Either/P1)_ — Actor, UseCase and ExtensionPoint as primitives; Include and Extend as relations. Measured: 28 attributes, 22 edge names, 1 z.any() field, no unions - the cheapest visible win after Foundation.

### Backlog (7)

- `task:uml-phase-3-packages-profiles` _(Either/P2)_ — ElementImport, PackageImport, PackageMerge, Profile, ProfileApplication, Stereotype, Extension, ExtensionEnd. A UML Profile modelled inside an FDPM profile; stereotype application is how users extend UML. Prerequisite for a faithful XMI round-trip.
- `task:uml-phase-6-state-machines` _(Either/P2)_ — StateMachine, Region, State, Transition, Pseudostate, FinalState, ConnectionPointReference, ProtocolStateMachine, ProtocolTransition (Vertex abstract). Measured: 77 attributes, 40 edge names, 11 z.any() fields - guards and invariants each need a decision.
- `task:uml-phase-7-interactions` _(Either/P2)_ — Interaction, Lifeline, Message, MessageOccurrenceSpecification, CombinedFragment, InteractionOperand, InteractionUse, Gate, GeneralOrdering, BehaviorExecutionSpecification (3 abstract). Measured: 65 attributes, 40 edge names, 3 z.any() fields.
- `task:uml-phase-8-activities` _(Either/P3)_ — 27 metaclasses, 8 abstract. Measured: 211 attributes, 349 edge occurrences over 60 names, 15 z.any() fields, and both embedded-element cases. Larger than Phases 5, 6 and 7 combined; split into control nodes, object nodes and pins, actions, then regions.
- `task:uml-phase-9-xmi-roundtrip` _(Either/P2)_ — Importer and exporter so modelling tools interoperate: XMI to workbook to XMI. The reversible snake\_case mapping exists for this. Best after Phase 3 - stereotypes are pervasive in real XMI files.
- `task:uml-phase-10-renderers` _(Either/P3)_ — The outline renderer is class-diagram shaped. A state machine, a sequence and an activity each need their own view; nothing generic reads well.
- `task:uml-phase-11-composition` _(Either/P3)_ — A composition profile extending the package profiles so one workbook holds a whole model, mirroring document\_plan / document\_plan\_dnis.

### Done (3)

- `task:uml-phase-0-foundation` _(Either/P0)_ — profile:uml:2.5 with 14 concrete structural metaclasses and 12 typed edges, bridge-derived from a normalisation of schemas-lib. Ingest lifts containment into primitives; the outline renderer prints UML notation.
- `task:uml-phase-1-abstract-policy` _(Either/P0)_ — Classify all 110 source metaclasses (26 abstract in UML 2.5.1) and enforce it at activation and at ingest; add Signal and Reception with uml:OwnsReception and uml:Signals; ship the uml/model\_a\_domain MCP prompt. Every later phase inherits the policy.
- `task:uml-phase-2-components` _(Either/P2)_ — StructuredClassifiers: Component, Port, Connector, ConnectorEnd, Artifact and AssociationClass as primitives with ten typed edges; ComponentRealization is a relation. Ingest enforces the two-end rule; the renderer prints ports, contracts and connector wiring.
