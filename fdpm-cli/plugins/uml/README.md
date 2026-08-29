---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Fable 5 via Claude Code"
  date: "2026-08-28"
---

# fdpm.uml — UML 2.5.1 (Foundation subset)

## Disclaimer

This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](../../../DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.

A UML model as a typed, event-sourced FDPM workbook: fourteen metaclasses
as primitives, twelve typed edges, one Zod validator per metaclass, and a
renderer that prints the model back in UML notation.

| | |
|---|---|
| Profile | `profile:uml:2.5` |
| Derived from | [`schemas/uml-foundation.ts`](./schemas/uml-foundation.ts), a normalisation of `schemas-lib/src/schemas/domains/uml` (UML 2.5.1, OMG formal/2017-12-05) |
| Metaclasses | Package, Model, Class, Interface, DataType, PrimitiveType, Enumeration, EnumerationLiteral, Property, Operation, Parameter, Association, Signal, Reception, Constraint, Comment, **AssociationClass**, **Component**, **Port**, **Connector**, **ConnectorEnd**, **Artifact** |
| Relations | `uml:Owns`, `uml:OwnsAttribute`, `uml:OwnsOperation`, `uml:OwnsParameter`, `uml:OwnsLiteral`, `uml:OwnsReception`, `uml:Signals`, `uml:Specializes`, `uml:Realizes`, `uml:DependsOn`, `uml:TypedBy`, `uml:MemberEnd`, `uml:Annotates`, `uml:Constrains`, **`uml:OwnsPort`**, **`uml:OwnsConnector`**, **`uml:OwnsConnectorEnd`**, **`uml:ConnectorRole`**, **`uml:PartWithPort`**, **`uml:Provides`**, **`uml:Requires`**, **`uml:RealizesComponent`**, **`uml:Manifests`**, **`uml:NestsArtifact`** |
| Coverage | UML packages CommonStructure, Classification, SimpleClassifiers, StructuredClassifiers (incl. internal structure) and part of Packages — roadmap Phases 0–2 |
| MCP prompt | `uml/model_a_domain` — which metaclass to reach for, how features and ends are wired, what will be refused |

## Abstract metaclasses are not types

UML 2.5.1 defines **26 of the source library's 110 metaclasses as
abstract** — `Element`, `NamedElement`, `Classifier`, `Feature`,
`Vertex`, `ActivityNode` and their kind exist to be specialised and have
no instances. Their fields reach the model through the concrete
metaclasses that specialise them, which is how this plugin carries them:
as shared field groups in
[`schemas/uml-foundation.ts`](./schemas/uml-foundation.ts), never as
primitive types.

The source records abstractness only in prose doc comments, so nothing
downstream can read it. [`abstract.ts`](./abstract.ts) is the machine-
readable classification — all 110 metaclasses, each with the clause the
source library cites — and it is enforced in three places:

| Where | What happens |
|---|---|
| Activation | `assertNoAbstractPrimitiveTypes` runs before the profile is served. A package profile that names `uml:Classifier` fails at **load**, naming every offender. |
| Ingest | A model whose `xmi:type` is abstract is refused with the rule and the concrete alternatives: *"`uml:Classifier` is abstract in UML 2.5.1 and has no instances — use uml:Class, uml:Interface, uml:DataType, uml:Enumeration, uml:Signal or uml:Association."* |
| Tests | The classification is proved complete against [`fixtures/uml-metaclasses.source.json`](../../tests/plugins/uml/fixtures/uml-metaclasses.source.json), a pinned inventory of the source with its sha256, so a metaclass added upstream fails the suite until it is classified. |

Every later package profile inherits this policy by importing
`isAbstractMetaclass` — it is the reason a mechanical derivation over
all 110 molecules cannot be shipped as-is.

## Signals and receptions

`Signal` (§11.3) is a classifier whose instances are asynchronous
communications; its owned attributes are the payload, so it is
packageable, may own attributes, may specialise another signal and may
type a property. `Reception` (§11.4) declares that a classifier reacts
to one, joined by `uml:OwnsReception` from its owner and `uml:Signals`
to the signal. The outline renderer prints a reception the way UML does,
as a «signal»-stereotyped feature:

```markdown
#### «class» OrderHandler
- `«signal» OrderPlaced`
```

`Dependency` and `InterfaceRealization` are the other concrete
metaclasses of these packages, and both are deliberately **relations**
(`uml:DependsOn`, `uml:Realizes`) rather than primitives — adding them
again as elements would put the same fact in two places.

## Internal structure: ports, connectors and their ends

A `Component` (§11.6) is only interesting because of what happens inside
it. That structure is a graph, not a field:

- a **Port** (§11.3) is an interaction point on the boundary, owned via
  `uml:OwnsPort`, typed by `uml:TypedBy`, with its contract stated as
  `uml:Provides` / `uml:Requires` edges to `uml:Interface`;
- a **Connector** (§11.2) joins roles, owned via `uml:OwnsConnector`,
  and **must own at least two `uml:ConnectorEnd`** — the ingest gate
  enforces the rule, because a connector with one end is not a model;
- each **ConnectorEnd** attaches to its role with `uml:ConnectorRole`
  (a plain `uml:Property` part *or* a `uml:Port` — one edge, two legal
  target types) and names the containing part with `uml:PartWithPort`;
- an **Artifact** (§19.2) embodies elements via `uml:Manifests` and
  nests others via `uml:NestsArtifact`;
- an **AssociationClass** (§11.5) is both: member ends like an
  association, owned attributes like a class.

`ComponentRealization` follows the rule Phase 1 set for
`Dependency`, `Generalization` and `InterfaceRealization`: it is a
DirectedRelationship, so it becomes the edge `uml:RealizesComponent`
rather than a primitive.

Rendered, a component reads as its contract and its wiring:

```markdown
#### «component» OrderService
_provides:_ OrderIntake
_realized by:_ OrderStore
- `«port» intake : OrderIntake` — provides: OrderIntake
- `«port» payments : PaymentGateway` — requires: PaymentGateway _{conjugated}_
- `«connector» storeLink` (delegation): intake ↔ store
```

**No endpoint in this profile is a wildcard.** Widening an existing edge
for a new metaclass is done by naming it, and a test asserts the whole
profile stays free of `"*"` — the difference between a profile that
means something and the mechanical derivation that merely assembles.

## Why the source schemas cannot be bridged as they stand

Three host rules forbid it, each verifiable rather than argued:

| Blocker | Evidence | Resolution |
|---|---|---|
| **Field names.** UML is camelCase and uses `xmi:id` / `xmi:type`. | `FieldDef.name` must match `^[a-z][a-z0-9_]*$` — `src/core/models/meta.ts`. `DomainProfile.safeParse` rejects `ownedComment`. 1,375 of the source's 2,032 fields are affected. | Every field snake_cased; `xmi:id` → `xmi_id`. Mechanical and reversible, so an XMI round-trip keeps its names. |
| **`z.any()` value specifications.** `defaultValue`, `specification`, `lowerValue`, `upperValue` are `z.lazy(() => z.any())`. | The bridge throws `unsupported Zod node type: any` — 65 such fields block 33 of the source's 110 metaclasses. | Modelled as the closed `ValueSpecification` struct of UML 2.5.1 §8.3 (literal arms + `opaque_expression`). |
| **`UnlimitedNatural`.** `upper` is `number \| "*"`. | A field-level union becomes `format: "json-union"`, an opaque string the host's kind check and the Zod validator cannot both accept. | `upper` is an integer; `UNLIMITED` (`-1`) is UML's `*`. |

## Why containment is relations, not nested fields

`Class.ownedAttribute` embeds whole `Property` objects while
`Association.memberEnd` addresses properties by id. Left inline, the same
association end would exist as a struct inside the class *and* as an id
the association points at — two objects, one of which the host cannot
validate or traverse. [`ingest.ts`](./ingest.ts) lifts every containment
array into its own primitive joined by an owning relation, so there is
exactly one `uml:Property` primitive and both edges point at it. This is
asserted directly in
[`tests/plugins/uml/ingest-and-render.test.ts`](../../tests/plugins/uml/ingest-and-render.test.ts).

Relation types are author-declared in [`sidecar.ts`](./sidecar.ts) rather
than derived from the sidecar's `references`, because UML's references
are polymorphic — a package owns any PackageableElement — and
`ReferenceSpec` emits a single `target_type_id`
([`sidecar-orchestrator.ts`](../../packages/zod-bridge/src/sidecar-orchestrator.ts),
pass D). `RelationTypeDef.source_types` / `target_types` accept a list,
so the host can express what the sidecar cannot. `finalizeProfile()`
merges them, and the drift gate covers them like everything else.

## Process — model → workbook → document

```bash
# 1. Regenerate the bridge artefacts after any schema/sidecar edit and
#    let the --check gate prove nothing drifted.
cd fdpm-cli && npx tsx plugins/uml/scripts/run-bridge.ts
npx tsx plugins/uml/scripts/run-bridge.ts --check

# 2. Ingest a model. UmlModelInput parses it (unknown fields rejected),
#    then id uniqueness, referential validity and the ≥2-ends rule are
#    asserted. A rejected model writes nothing.
FDPM_DATA_DIR=/tmp/fdpm-uml npx tsx -e '
  import { openHost } from "./src/sdk.js";
  import { buildUmlWorkbook } from "./plugins/uml/ingest.js";
  import { readFileSync } from "node:fs";
  const host = await openHost();
  console.log(await buildUmlWorkbook(host,
    JSON.parse(readFileSync("tests/plugins/uml/fixtures/library.model.json","utf8")),
    { workbookId: "uml-library" }));
'

# 3. Validate and render.
FDPM_DATA_DIR=/tmp/fdpm-uml npx tsx src/bin/fdpm.ts validate uml-library
FDPM_DATA_DIR=/tmp/fdpm-uml npx tsx src/bin/fdpm.ts render uml-library text/markdown \
  --renderer-id uml:ModelOutlineRenderer -o uml-model.md
```

The outline renderer resolves `uml:TypedBy` and multiplicity into UML's
own notation — `+ keywords : String [0..*]` — and prints generalisation,
realisation, dependency, association ends, constraints and comments where
they belong, so the rendered file is review material rather than a dump.
The bridge's per-metaclass renderers
(`fdpm.uml:ClassMarkdownRenderer`, …) print field tables instead.

## Declared losses

Recorded in [`generated/audit.json`](./generated/audit.json): field-name
normalisation, the ValueSpecification restriction, the `UnlimitedNatural`
sentinel, the identity of relationship elements (a `Generalization`'s own
`xmi:id` is not preserved when it becomes `uml:Specializes`), UML's
derived unions (`member`, `inheritedMember`, `feature`, `attribute` — 
derivable by traversal, so storing them would duplicate truth), and the
subset scope itself: StateMachines, Activities, Interactions, UseCases,
Components, Deployments and Profiles/Stereotypes are not modelled. The
source library carries 110 metaclasses; this profile realises 14.

## Using it from an agent (MCP)

The profile is reachable over MCP like any other
(`fdpm.profile.get(profile_id: "profile:uml:2.5")`,
`fdpm.profile.type_info(type_id: "uml:Class")`), and the rendered model
is a resource:
`fdpm://workbook/<id>/render/text/markdown#uml:ModelOutlineRenderer`.

What tool descriptions cannot carry — that an attribute is a
`uml:Property` joined by `uml:OwnsAttribute` and typed by `uml:TypedBy`,
that an association end is the *same* Property the association owns, or
that `uml:Classifier` will be refused — is shipped as the MCP prompt
**`uml/model_a_domain`** (SPEC-MCP-SERVER §13.5):

```bash
# List and render it from the CLI
npx tsx src/bin/fdpm.ts plugin prompts
npx tsx src/bin/fdpm.ts plugin prompt uml/model_a_domain \
  --arg workbook_id=uml-library --arg subject="order fulfilment"
```

Over MCP it is `prompts/list` → `prompts/get`. Its body names only ids
that exist in the registered profile;
[`tests/plugins/uml/prompt.test.ts`](../../tests/plugins/uml/prompt.test.ts)
cross-checks every one, so the procedure cannot drift from the profile
it teaches.

## Tests and CI

[`tests/plugins/uml/`](../../tests/plugins/uml/) — bridge determinism and
`--check`, manifest ↔ sidecar parity, activation and relation endpoints,
per-metaclass validator accept/reject, the three normalisations asserted
against the host rules that force them, and the fixture model ingested,
validated and rendered end to end, with every rejection path of the
ingest gate exercised (unresolved reference, duplicate `xmi:id`,
single-ended association, non-classifier type, unknown field, malformed
ULID, and "a rejected model writes nothing").
Phase 1 adds `abstract-policy.test.ts` (classification complete and
disjoint over the pinned inventory; the guard catches a whole-domain
derivation and names all 26 offenders; the ingest scan's boundaries),
`structural-completion.test.ts` (Signal and Reception end to end,
including the two-layer contract where the host tolerates an undeclared
field as `core:field:undeclared` drift while the ingest gate refuses
it), and `prompt.test.ts`.
CI: [`.github/workflows/plugin-uml.yml`](../../.github/workflows/plugin-uml.yml).

[← fdpm-cli](../../README.md)
