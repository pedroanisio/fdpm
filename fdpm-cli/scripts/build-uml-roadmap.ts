/**
 * The UML coverage backlog as a planning workbook — the system of record
 * for the eleven phases of mapping schemas-lib's UML domain into FDPM.
 *
 * A markdown checklist would rot the moment a phase moved. This is a
 * typed graph on profile:planning:0.1: every phase is a plan:Task with a
 * status the validators police, dependencies are plan:DependsOn edges
 * (so "Phase 6 needs Phase 4" is checkable rather than prose), and each
 * phase carries the acceptance criterion that closes it.
 *
 * Scope numbers are measured, not estimated: they come from the
 * per-package sweep over the source library recorded in the plugin
 * README and the phase list.
 *
 * Run with:
 *   npx tsx fdpm-cli/scripts/build-uml-roadmap.ts
 * Render the board:
 *   npx tsx fdpm-cli/src/bin/fdpm.ts render uml-roadmap text/markdown \
 *     --renderer-id plan:AgentBoardRenderer -o docs/planning/uml-roadmap.md
 */
import { openHost } from "../src/sdk.js";
import { defineProject, type PrimitiveSpec, type RelationSpec } from "../src/sdk.js";
import { EXIT_CODE_FOR_CATEGORY, FDPMException } from "../src/core/errors/fdpm-exception.js";

const WORKBOOK_ID = "uml-roadmap";

export interface Phase {
  slug: string;
  name: string;
  summary: string;
  status: "Backlog" | "Ready" | "In_progress" | "Done";
  priority: "P0" | "P1" | "P2" | "P3";
  kind: "Implementation" | "Documentation" | "Investigation";
  criterion: string;
  criterionStatus: "open" | "met";
  dependsOn?: string[];
}

/** The eleven phases, with scope measured from the source library. */
export const PHASES: readonly Phase[] = [
  {
    slug: "uml-phase-0-foundation",
    name: "Phase 0 — Foundation subset",
    summary:
      "profile:uml:2.5 with 14 concrete structural metaclasses and 12 typed edges, bridge-derived from a normalisation of schemas-lib. Ingest lifts containment into primitives; the outline renderer prints UML notation.",
    status: "Done",
    priority: "P0",
    kind: "Implementation",
    criterion:
      "profile:uml:2.5 registers 14 metaclasses and 12 relation types; the library fixture ingests, validates 0/0/0 and renders; run-bridge --check reports no drift.",
    criterionStatus: "met",
  },
  {
    slug: "uml-phase-1-abstract-policy",
    name: "Phase 1 — Abstract-metaclass policy and structural completion",
    summary:
      "Classify all 110 source metaclasses (26 abstract in UML 2.5.1) and enforce it at activation and at ingest; add Signal and Reception with uml:OwnsReception and uml:Signals; ship the uml/model_a_domain MCP prompt. Every later phase inherits the policy.",
    status: "Done",
    priority: "P0",
    kind: "Implementation",
    criterion:
      "The classification covers the pinned source inventory exactly; a profile naming an abstract metaclass fails at activation; ingest refuses an abstract xmi:type with concrete alternatives; Signal and Reception ingest and render; the MCP prompt works on the wire.",
    criterionStatus: "met",
    dependsOn: ["uml-phase-0-foundation"],
  },
  {
    slug: "uml-phase-2-components",
    name: "Phase 2 — Components, ports and connectors",
    summary:
      "StructuredClassifiers: Component, Port, Connector, ConnectorEnd, Artifact and AssociationClass as primitives with ten typed edges; ComponentRealization is a relation. Ingest enforces the two-end rule; the renderer prints ports, contracts and connector wiring.",
    status: "Done",
    priority: "P2",
    kind: "Implementation",
    criterion:
      "Each metaclass registers with typed endpoints (no wildcard targets), ingests from the source shape, validates 0/0/0 and renders; run-bridge --check clean.",
    criterionStatus: "met",
    dependsOn: ["uml-phase-1-abstract-policy"],
  },
  {
    slug: "uml-phase-3-packages-profiles",
    name: "Phase 3 — Packages, profiles and stereotypes",
    summary:
      "ElementImport, PackageImport, PackageMerge, Profile, ProfileApplication, Stereotype, Extension, ExtensionEnd. A UML Profile modelled inside an FDPM profile; stereotype application is how users extend UML. Prerequisite for a faithful XMI round-trip.",
    status: "Backlog",
    priority: "P2",
    kind: "Implementation",
    criterion:
      "Stereotype application round-trips through ingest and render; the profile and stereotype metaclasses validate 0/0/0; run-bridge --check clean.",
    criterionStatus: "open",
    dependsOn: ["uml-phase-1-abstract-policy"],
  },
  {
    slug: "uml-phase-4-common-behavior",
    name: "Phase 4 — CommonBehavior",
    summary:
      "Trigger, CallEvent, ChangeEvent, SignalEvent, TimeEvent, AnyReceiveEvent (Behavior and Event are abstract). Measured: 35 attributes, 24 edge names - the smallest behavioural package, and the prerequisite for Phases 6, 7 and 8.",
    status: "Ready",
    priority: "P1",
    kind: "Implementation",
    criterion:
      "The six concrete event metaclasses register with typed endpoints and validate; a trigger referencing a signal event ingests and renders; run-bridge --check clean.",
    criterionStatus: "open",
    dependsOn: ["uml-phase-1-abstract-policy"],
  },
  {
    slug: "uml-phase-5-use-cases",
    name: "Phase 5 — UseCases",
    summary:
      "Actor, UseCase and ExtensionPoint as primitives; Include and Extend as relations. Measured: 28 attributes, 22 edge names, 1 z.any() field, no unions - the cheapest visible win after Foundation.",
    status: "Ready",
    priority: "P1",
    kind: "Implementation",
    criterion:
      "A use-case model with actors, includes and extends ingests, validates 0/0/0 and renders as a use-case listing; run-bridge --check clean.",
    criterionStatus: "open",
    dependsOn: ["uml-phase-1-abstract-policy"],
  },
  {
    slug: "uml-phase-6-state-machines",
    name: "Phase 6 — StateMachines",
    summary:
      "StateMachine, Region, State, Transition, Pseudostate, FinalState, ConnectionPointReference, ProtocolStateMachine, ProtocolTransition (Vertex abstract). Measured: 77 attributes, 40 edge names, 11 z.any() fields - guards and invariants each need a decision.",
    status: "Backlog",
    priority: "P2",
    kind: "Implementation",
    criterion:
      "A state machine with regions, transitions, guards and triggers ingests, validates 0/0/0 and renders; run-bridge --check clean.",
    criterionStatus: "open",
    dependsOn: ["uml-phase-4-common-behavior"],
  },
  {
    slug: "uml-phase-7-interactions",
    name: "Phase 7 — Interactions",
    summary:
      "Interaction, Lifeline, Message, MessageOccurrenceSpecification, CombinedFragment, InteractionOperand, InteractionUse, Gate, GeneralOrdering, BehaviorExecutionSpecification (3 abstract). Measured: 65 attributes, 40 edge names, 3 z.any() fields.",
    status: "Backlog",
    priority: "P2",
    kind: "Implementation",
    criterion:
      "A sequence with lifelines, messages and a combined fragment ingests, validates 0/0/0 and renders in message order; run-bridge --check clean.",
    criterionStatus: "open",
    dependsOn: ["uml-phase-4-common-behavior"],
  },
  {
    slug: "uml-phase-8-activities",
    name: "Phase 8 — Activities",
    summary:
      "27 metaclasses, 8 abstract. Measured: 211 attributes, 349 edge occurrences over 60 names, 15 z.any() fields, and both embedded-element cases. Larger than Phases 5, 6 and 7 combined; split into control nodes, object nodes and pins, actions, then regions.",
    status: "Backlog",
    priority: "P3",
    kind: "Implementation",
    criterion:
      "An activity with control flow, object flow, pins and a structured region ingests, validates 0/0/0 and renders; the two embedded-element fields become relations.",
    criterionStatus: "open",
    dependsOn: ["uml-phase-4-common-behavior"],
  },
  {
    slug: "uml-phase-9-xmi-roundtrip",
    name: "Phase 9 — XMI round-trip",
    summary:
      "Importer and exporter so modelling tools interoperate: XMI to workbook to XMI. The reversible snake_case mapping exists for this. Best after Phase 3 - stereotypes are pervasive in real XMI files.",
    status: "Backlog",
    priority: "P2",
    kind: "Implementation",
    criterion:
      "A model exported from a real tool imports, and re-exporting produces XMI that reimports to a workbook rendering byte-identically.",
    criterionStatus: "open",
    dependsOn: ["uml-phase-3-packages-profiles"],
  },
  {
    slug: "uml-phase-10-renderers",
    name: "Phase 10 — Per-package renderers",
    summary:
      "The outline renderer is class-diagram shaped. A state machine, a sequence and an activity each need their own view; nothing generic reads well.",
    status: "Backlog",
    priority: "P3",
    kind: "Implementation",
    criterion:
      "Each behavioural package that has landed has a renderer whose output is asserted against a fixture model.",
    criterionStatus: "open",
    dependsOn: ["uml-phase-6-state-machines"],
  },
  {
    slug: "uml-phase-11-composition",
    name: "Phase 11 — Full composition profile",
    summary:
      "A composition profile extending the package profiles so one workbook holds a whole model, mirroring document_plan / document_plan_dnis.",
    status: "Backlog",
    priority: "P3",
    kind: "Implementation",
    criterion:
      "A workbook on the composition profile holds structural and behavioural elements together and validates 0/0/0.",
    criterionStatus: "open",
    dependsOn: ["uml-phase-8-activities"],
  },
];

async function main(): Promise<void> {
  const primitives: PrimitiveSpec[] = [
    {
      id: "wbs:uml-coverage",
      type: "plan:WorkBreakdown",
      fields: {
        name: "UML coverage",
        summary:
          "Mapping schemas-lib's UML 2.5.1 domain (110 metaclasses) into FDPM profiles, package by package with typed relation endpoints rather than one mechanical derivation.",
        status: "Active",
      },
    },
  ];
  const relations: RelationSpec[] = [];

  for (const phase of PHASES) {
    primitives.push({
      id: `task:${phase.slug}`,
      type: "plan:Task",
      fields: {
        name: phase.name,
        summary: phase.summary,
        kind: phase.kind,
        executor_kind: "Either",
        // plan:val:done-task-has-ac checks the graph at write time, so a
        // task cannot be born Done — its plan:Verifies edge does not
        // exist yet. Land it In_review and transition once the edges do.
        status: phase.status === "Done" ? "In_review" : phase.status,
        priority: phase.priority,
        // plan:val:non-root-task-has-deps runs on the post-state of THIS
        // write, before the plan:Contains edge exists. is_root is the
        // documented create-time exemption; it is replaced off below
        // once the WorkBreakdown owns the task.
        is_root: true,
      },
    });
    primitives.push({
      id: `ac:${phase.slug}`,
      type: "plan:AcceptanceCriterion",
      fields: { criterion: phase.criterion, status: phase.criterionStatus },
    });
  }
  for (const phase of PHASES) {
    relations.push({
      id: `plan:contains:${phase.slug}`,
      type: "plan:Contains",
      from: "wbs:uml-coverage",
      to: `task:${phase.slug}`,
    });
    relations.push({
      id: `plan:verifies:${phase.slug}`,
      type: "plan:Verifies",
      from: `task:${phase.slug}`,
      to: `ac:${phase.slug}`,
    });
    for (const dep of phase.dependsOn ?? []) {
      relations.push({
        id: `plan:depends:${phase.slug}:${dep}`,
        type: "plan:DependsOn",
        from: `task:${phase.slug}`,
        to: `task:${dep}`,
      });
    }
  }

  const host = await openHost();
  const commit = await defineProject(host, {
    id: WORKBOOK_ID,
    name: "UML coverage roadmap",
    profile: "profile:planning:0.1",
    description:
      "The eleven phases of mapping schemas-lib's UML 2.5.1 domain into FDPM profiles. Scope figures are measured from the source library, not estimated.",
  })
    .primitives(primitives)
    .relations(relations)
    .commit();

  // Now that plan:Contains and plan:Verifies exist,each task can drop the
  // create-time root exemption and the completed phases can take their
  // real status.
  let promoted = 0;
  for (const phase of PHASES) {
    const fields: Record<string, unknown> = { is_root: false };
    if (phase.status === "Done") {
      fields["status"] = "Done";
      promoted += 1;
    }
    await host.patchPrimitive(WORKBOOK_ID, { id: `task:${phase.slug}`, field_values: fields });
  }

  const report = host.validateProject(WORKBOOK_ID);
  console.log(`workbook ${WORKBOOK_ID}: ${commit.primitives_created} primitives, ${commit.relations_created} relations`);
  console.log(`validate: ${JSON.stringify(report.summary)} at revision ${report.revision}`);
  console.log(`done: ${promoted}/${PHASES.length} phases`);
}

const isEntrypoint = process.argv[1]?.endsWith("build-uml-roadmap.ts") === true;

if (isEntrypoint) {
  main().catch((err: unknown) => {
    if (err instanceof FDPMException) {
      process.stderr.write(JSON.stringify({ error: err.toEnvelope() }, null, 2) + "\n");
      process.exit(EXIT_CODE_FOR_CATEGORY[err.category]);
    }
    process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
    process.exit(70);
  });
}
