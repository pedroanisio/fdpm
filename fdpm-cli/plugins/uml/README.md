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
| Metaclasses | Package, Model, Class, Interface, DataType, PrimitiveType, Enumeration, EnumerationLiteral, Property, Operation, Parameter, Association, Constraint, Comment |
| Relations | `uml:Owns`, `uml:OwnsAttribute`, `uml:OwnsOperation`, `uml:OwnsParameter`, `uml:OwnsLiteral`, `uml:Specializes`, `uml:Realizes`, `uml:DependsOn`, `uml:TypedBy`, `uml:MemberEnd`, `uml:Annotates`, `uml:Constrains` |

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

## Tests and CI

[`tests/plugins/uml/`](../../tests/plugins/uml/) — bridge determinism and
`--check`, manifest ↔ sidecar parity, activation and relation endpoints,
per-metaclass validator accept/reject, the three normalisations asserted
against the host rules that force them, and the fixture model ingested,
validated and rendered end to end, with every rejection path of the
ingest gate exercised (unresolved reference, duplicate `xmi:id`,
single-ended association, non-classifier type, unknown field, malformed
ULID, and "a rejected model writes nothing").
CI: [`.github/workflows/plugin-uml.yml`](../../.github/workflows/plugin-uml.yml).

[← fdpm-cli](../../README.md)
