---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Opus 4.7 (1M context) via Claude Code"
  date: "2026-05-04"
---

# Software Architecture Plugin

`fdpm.software-architecture` — a server-side FDPM CLI plugin that contributes
the **Software Architecture** domain profile: a typed vocabulary for
documenting software systems including domain models, services, APIs, state
machines, decisions, and operational behavior.

| Field             | Value                                                                      |
| ----------------- | -------------------------------------------------------------------------- |
| Plugin id         | `fdpm.software-architecture`                                               |
| Plugin version    | `1.0.0`                                                                    |
| Spec version      | `1.1.0` (FDPM plugin manifest spec)                                        |
| Profile id        | `profile:software-architecture:1.0`                                        |
| Kind              | `server`                                                                   |
| Host compat.      | `fdpm >=1.1, <2`                                                           |
| License           | MIT                                                                        |
| Entry point       | [`index.ts`](./index.ts)                                                   |
| Manifest          | [`fdpm-plugin.json`](./fdpm-plugin.json)                                   |
| Source provenance | Port of `src/fdpm/plugins/software_architecture.py`                        |

## Disclaimer

This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](../../../DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.

---

## Table of contents

1. [What this plugin contributes](#what-this-plugin-contributes)
2. [Capabilities (manifest)](#capabilities-manifest)
3. [Domain profile](#domain-profile)
4. [Categories](#categories)
5. [Scopes](#scopes)
6. [Primitive types](#primitive-types)
7. [Relation types](#relation-types)
8. [Validation rules](#validation-rules)
9. [Templates](#templates)
10. [Renderer bindings](#renderer-bindings)
11. [What this plugin does *not* contribute](#what-this-plugin-does-not-contribute)
12. [Installation & activation](#installation--activation)
13. [Usage from the CLI](#usage-from-the-cli)
14. [File layout](#file-layout)
15. [Versioning](#versioning)
16. [Verification contract](#verification-contract)
17. [See also](#see-also)

---

## What this plugin contributes

When activated against an FDPM host, this plugin registers:

- **1** `DomainProfile` (`profile:software-architecture:1.0`)
- **5** primitive categories
- **4** scopes (no scope sets — see note below)
- **23** primitive types under the `sw:` namespace
  (15 ported from the Python source + 8 added in the [pass-2 gap audit](#pass-2-gap-audit))
- **23** relation types (15 source + 8 pass-2)
- **12** validation rules (7 source + 5 pass-2). Predicates ship in two
  forms: a legacy DSL `predicate` string (preserved for documentation) and
  a CEL `expression` evaluated by the §7 host pipeline per
  [SPEC-CEL-VALIDATOR](../../../docs/specs/SPEC-CEL-VALIDATOR.md).
- **5** document templates (3 source + 2 binding the renderers below)
- **2** renderer bindings backed by **2 executable `cap:renderer`
  capabilities**:
  - `sw:OpenAPIRenderer` → `application/x-yaml` (OpenAPI 3.1 spec from
    `sw:Endpoint` + `sw:Schema` + `sw:Contract` + `sw:Service`)
  - `sw:ADRRenderer` → `text/markdown` (one ADR section per `sw:Decision`,
    with `sw:Supersedes` chains and `sw:Justifies` evidence)

Activation logs:

```
software-architecture activated: 23 primitive types, 23 relation types, 12 validators, 2 renderers (sw:OpenAPIRenderer/yaml, sw:ADRRenderer/md)
```

---

## Capabilities (manifest)

Declared in [`fdpm-plugin.json`](./fdpm-plugin.json). The host must grant:

- `read:projects`
- `read:primitives`
- `read:relations`
- `render:server` — required for the two `cap:renderer` capabilities below.

Capabilities exposed:

| Capability id        | Local name              | Entry            | Notes                                                            |
| -------------------- | ----------------------- | ---------------- | ---------------------------------------------------------------- |
| `cap:profile`        | `software-architecture` | `PROFILE`        | The exported `DomainProfile`.                                    |
| `cap:renderer`       | `openapi`               | `renderOpenApi`  | Registered as `(target=application/x-yaml, rendererId=sw:OpenAPIRenderer)`. |
| `cap:renderer`       | `adr`                   | `renderAdr`      | Registered as `(target=text/markdown, rendererId=sw:ADRRenderer)`. **Disambiguate with `--renderer-id sw:ADRRenderer`** when the host also has `fdpm.formal-specification` active (which registers a `text/markdown` renderer too). |
| `cap:lifecycle-hook` | `on-enable`             | `onEnable`       | Fires after the plugin is enabled.                               |

---

## Domain profile

Exported as `PROFILE` from [`index.ts`](./index.ts):

```ts
{
  id: "profile:software-architecture:1.0",
  version: "1.0.0",
  name: "Software Architecture",
  label: "Software Architecture",
  extends: [],
  categories,           // 5 entries
  scopes,                // 4 entries
  primitive_types,       // 23 entries (15 source + 8 pass-2)
  relation_types,        // 23 entries (15 source + 8 pass-2)
  validation_rules,      // 12 entries (7 source + 5 pass-2; CEL-evaluated)
  renderers,             // 2 RendererBinding entries (sw:OpenAPIRenderer, sw:ADRRenderer)
  templates,             // 5 entries (3 source + 2 pass-2)
  scope_sets: {},        // empty — preserved from Python source
  default_scope_set: "", // empty — preserved from Python source
  inline_structs: [],    // profile-level; primitives carry their own
  renderer_bindings: [], // legacy slot, intentionally empty
}
```

The host calls `ctx.registerProfile(PROFILE)` during `activate`.

---

## Categories

Defined in [`categories.ts`](./categories.ts).

| Id              | Name       | Purpose                                   |
| --------------- | ---------- | ----------------------------------------- |
| `cat:identity`  | Identity   | What exists in the system.                |
| `cat:semantics` | Semantics  | Meaning and constraints.                  |
| `cat:behavior`  | Behavior   | What happens in the system.               |
| `cat:interface` | Interface  | How systems interact.                     |
| `cat:evidence`  | Evidence   | Why claims should be trusted.             |

---

## Scopes

Defined in [`scopes.ts`](./scopes.ts). Scopes carry an explicit `rank` so the
host can order document sections deterministically.

| Rank | Id                       | Name           | Description                                                |
| ---: | ------------------------ | -------------- | ---------------------------------------------------------- |
| 1    | `scope:sw:domain`        | Domain         | Business rules, ubiquitous language, domain invariants.    |
| 2    | `scope:sw:runtime`       | Runtime        | Operational behavior under load, latency, throughput.      |
| 3    | `scope:sw:deployment`    | Deployment     | Infrastructure, topology, regions, environments.           |
| 4    | `scope:sw:organizational`| Organizational | Teams, ownership, process, governance.                     |

> **No scope sets.** `SCOPE_SETS = {}` and `DEFAULT_SCOPE_SET = ""`. This is
> deliberate parity with the Python source, which does not declare scope
> sets — adding a synthetic "default" set would diverge from the source dump.

---

## Primitive types

All primitive ids use the `sw:` namespace. Definitions live under
[`primitives/`](./primitives/), one file per category.

> **No partition unit.** Unlike
> [`fdpm.formal-specification`](../formal_specification/) (where
> `fs:Section` is `is_partition_unit: true`), no primitive in this profile
> sets that flag. Projects on this profile cannot be split along primitive
> boundaries by the host's partition mechanism.

### `cat:identity` — [`identity.ts`](./primitives/identity.ts)

| Id              | Description                                                                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `sw:Entity`     | A named, bounded thing. `kind ∈ {DomainAggregate, DomainValue, Service, Component, Module, Infrastructure, ExternalSystem}`; `lifecycle ∈ {Proposed, Active, Deprecated, Retired}`. Scoped. |
| `sw:Decision`   | Recorded architectural / design choice. Required: `status ∈ {Proposed, Accepted, Superseded, Deprecated}`, `title`, `context`, `rationale`, `alternatives` (single-valued `StructField[Alternative]` with `min_items=1` — see note below), `consequences`. Scoped. |
| `sw:Concept`    | A named idea requiring shared understanding (ubiquitous language). Required: `name`, `definition`. Scoped.                                      |

### `cat:semantics` — [`semantics.ts`](./primitives/semantics.ts)

| Id              | Description                                                                                                            |
| --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `sw:Invariant`  | Property that must always hold. `enforcement ∈ {Compile, Test, Runtime, Process, Manual}`. Scoped.                     |
| `sw:Constraint` | A quantitative or qualitative bound. Required: `statement`; optional `metric` (machine-readable). Scoped.              |
| `sw:Assumption` | A condition taken as true but not guaranteed. Required: `statement`, `invalidation`. Scoped.                           |
| `sw:Guarantee`  | A commitment to consumers. Required: `statement`, `conditions`. Scoped.                                                |

### `cat:behavior` — [`behavior.ts`](./primitives/behavior.ts)

| Id               | Description                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sw:State`       | Distinguishable condition of an entity. Required: `entity_id` (`stableId` → `sw:Entity`), `name`, `terminal: bool`. Optional: `entry_conditions`. Not scoped. |
| `sw:Transition`  | Named change between states. Required: `from_state` (`stableId` → `sw:State`), `to_state` (`stableId` → `sw:State`), `trigger`. Optional: `guard`, `action`. Inline type-constraint `no_self_transition: not_equal(from_state, to_state)` (level=error). Not scoped. |
| `sw:FailureMode` | A known way the system can fail. Required: `entity_id` (`stableId` → `sw:Entity`), `description`, `detection`, `mitigation`, `severity ∈ {Critical, High, Medium, Low}`. Not scoped. |

### `cat:interface` — [`interface.ts`](./primitives/interface.ts)

| Id            | Description                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sw:Endpoint` | Single addressable interaction point. Required: `name`, `protocol ∈ {HTTP, gRPC, GraphQL, Event, CLI}`. Optional: `method`, `path`. Not scoped.   |
| `sw:Schema`   | Named data shape. Required: `name`, `fields` (single-valued `StructField[SchemaField]` with `min_items=1`), `format ∈ {JSONSchema, Protobuf, Avro, TypeScript, Custom}`. Not scoped. |
| `sw:Contract` | Binding agreement provider↔consumer. Required: `provider`/`consumer` (`stableId` → `sw:Entity`), `preconditions` (`ConstrainedText[]`, `min_items=1`), `postconditions` (`ConstrainedText[]`, `min_items=1`), `error_conditions` (single-valued `StructField[ErrorCondition]`). Not scoped. |
| `sw:Event`    | Observable occurrence. Required: `name`, `source` (`stableId` → `sw:Entity`), `schema_id` (`stableId` → `sw:Schema`), `ordering ∈ {Unordered, PartiallyOrdered, TotallyOrdered, PartitionOrdered}`. Not scoped. |

### `cat:evidence` — [`evidence.ts`](./primitives/evidence.ts)

| Id            | Description                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sw:Evidence` | Traceable justification — *why should this be trusted?* Required: `kind ∈ {Test, Metric, Review, Proof, Certification, Reference}`, `source`, `description`. Optional: `timestamp` (ISO 8601). Not scoped. |

Field schemas are encoded through helpers in [`_common.ts`](./_common.ts):
`str`, `text`, `textList`, `bool`, `iso`, `enumOf`, `strList`, `struct`,
`stableId`, plus `idTemplate`, `primitive`, and `inlineStruct`.

**Inline structs.** Profile-level `inline_structs` is `[]`; three primitives
carry their own component-local nested types:

- `sw:Decision` → `Alternative` (`name`, `reason_rejected`)
- `sw:Schema` → `SchemaField` (`name`, `type`, `required`, `description`, optional `constraints` string list)
- `sw:Contract` → `ErrorCondition` (`name`, `condition`, `response`)

> **Single-valued `StructField` quirk.** The Python source uses
> `StructField[X]` (no `[]` list suffix) for `Decision.alternatives`,
> `Schema.fields`, and `Contract.error_conditions`, sometimes paired with
> `min_items` even though the legacy type is technically a *single* struct
> value. The TypeScript port mirrors this verbatim for byte-faithful
> parity — see [`_common.ts`](./_common.ts) lines 147–176. Treat these
> fields as collections in practice; the legacy_type spelling is a known
> source-dump idiosyncrasy.

**Entity references via `stableId`.** Five primitives —
`sw:State.entity_id`, `sw:Transition.from_state` / `to_state`,
`sw:FailureMode.entity_id`, `sw:Contract.provider` / `consumer`,
`sw:Event.source` / `schema_id` — declare typed cross-primitive references
through the `stableId(field, description, target_type_id)` helper. The
helper attaches a `{ kind: "references", value: <type-id>, level: "error" }`
field validation. **The CLI v1.1 Core does not enforce `references`
validations**; downstream tooling reads them. These are field-level links,
not graph relations.

---

## Relation types

Defined in [`relations.ts`](./relations.ts). Every relation declares
`source_types` and `target_types`; some use the wildcard `"*"` (any source
primitive).

| Id                  | Source → Target                                                                              | Notes                                                          |
| ------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `sw:DependsOn`      | `sw:Entity` → `sw:Entity`                                                                    | Transitive. `kind ∈ {compile, runtime, data}` metadata.        |
| `sw:Constrains`     | `sw:Invariant, sw:Constraint` → `sw:Entity, sw:Endpoint, sw:Schema, sw:Contract`             | Semantic primitive bounds the target.                          |
| `sw:Implements`     | `sw:Entity` → `sw:Contract`                                                                  | Entity fulfills a contract.                                    |
| `sw:Consumes`       | `sw:Entity` → `sw:Endpoint`                                                                  | Entity calls an endpoint. Optional `frequency` metadata.       |
| `sw:Produces`       | `sw:Entity` → `sw:Event`                                                                     | Entity emits an event.                                         |
| `sw:TriggeredBy`    | `sw:Transition` → `sw:Event, sw:Endpoint`                                                    | Transition fires in response.                                  |
| `sw:Supersedes`     | `sw:Decision` → `sw:Decision`                                                                | Transitive. New decision replaces old.                         |
| `sw:Justifies`      | `sw:Evidence` → `sw:Invariant, sw:Constraint, sw:Guarantee, sw:Decision`                     | Evidence supports a claim.                                     |
| `sw:BelongsTo`      | `sw:State, sw:FailureMode` → `sw:Entity`                                                     | Cardinality `source_min=1, source_max=1`. Required ownership.  |
| `sw:InputTo`        | `sw:Schema` → `sw:Endpoint`                                                                  | Schema is the input shape.                                     |
| `sw:OutputOf`       | `sw:Schema` → `sw:Endpoint`                                                                  | Schema is the output shape.                                    |
| `sw:Mitigates`      | `sw:FailureMode` → `sw:Guarantee`                                                            | Failure-mode handling preserves a guarantee.                   |
| `sw:Assumes`        | `*` (any primitive) → `sw:Assumption`                                                        | Primitive depends on an assumption.                            |
| `sw:Exposes`        | `sw:Entity` → `sw:Endpoint`                                                                  | Entity serves an endpoint.                                     |
| `sw:RefersTo`       | `*` (any primitive) → `sw:Concept`                                                           | Use of a defined ubiquitous-language term.                     |

> **Wildcard sources.** `sw:Assumes` and `sw:RefersTo` declare
> `source_types: "*"` (a literal wildcard string, not an array). The host
> normalises this at registration.

---

## Validation rules

Defined in [`validation_rules.ts`](./validation_rules.ts). Each rule ships
two predicate forms:

- A **legacy DSL `predicate`** string preserved from the Python source
  (`min_items`, `non_trivial`, `field`, `when`, `has_relation`) — kept for
  documentation provenance.
- A **CEL `expression`** evaluated by the host's §7 ValidationPipeline per
  [SPEC-CEL-VALIDATOR](../../../docs/specs/SPEC-CEL-VALIDATOR.md). Rule
  findings are real findings — they appear in `fdpm validate` output at
  the declared `level` (`error` or `warning`).

The 5 pass-2 rules and 6 of the 7 source rules evaluate against the
canonical activation environment (`{ instance, instance_type, profile,
graph }`). One rule, `sw:val:non-terminal-state-has-transition`, ships
with `expression: "true"` because its predicate cannot be expressed under
the current activation contract — see the note below.

| Rule id                                       | Level    | Applies to        | CEL `expression`                                                                                          |
| --------------------------------------------- | -------- | ----------------- | --------------------------------------------------------------------------------------------------------- |
| `sw:val:decision-has-alternatives`            | error    | `sw:Decision`     | `instance.field_values.alternatives.size() >= 1`                                                          |
| `sw:val:decision-has-rationale`               | error    | `sw:Decision`     | `instance.field_values.rationale.trim().size() > 0`                                                       |
| `sw:val:assumption-has-invalidation`          | error    | `sw:Assumption`   | `instance.field_values.invalidation.trim().size() > 0`                                                    |
| `sw:val:invariant-not-manual`                 | warning  | `sw:Invariant`    | `instance.field_values.enforcement != "Manual"`                                                           |
| `sw:val:contract-has-conditions`              | error    | `sw:Contract`     | preconditions + postconditions both `>= 1`                                                                |
| `sw:comp:active-entity-constrained`           | warning  | `sw:Entity`       | active → `graph.incoming("sw:Constrains").size() >= 1`                                                    |
| `sw:val:non-terminal-state-has-transition`    | warning  | `sw:State`        | `true` (no-op — see note)                                                                                 |
| `sw:val:decision-superseded-has-successor`    | error    | `sw:Decision`     | superseded → `graph.incoming("sw:Supersedes").size() >= 1`                                                |
| `sw:val:risk-high-impact-has-mitigation`      | error    | `sw:Risk`         | high → `mitigation.trim().size() > 0`                                                                     |
| `sw:comp:capability-realized`                 | warning  | `sw:Capability`   | `graph.outgoing("sw:RealizedBy").size() >= 1`                                                             |
| `sw:comp:active-entity-deployed`              | warning  | `sw:Entity`       | active → `graph.outgoing("sw:DeployedTo").size() >= 1`                                                    |
| `sw:val:deprecated-endpoint-has-successor`    | warning  | `sw:Endpoint`     | deprecated → `graph.outgoing("sw:DeprecatedBy").size() >= 1`                                              |

> **`sw:val:non-terminal-state-has-transition` is a documented no-op.**
> Its predicate ("non-terminal state must have an outbound Transition")
> requires looking up *primitives* (`sw:Transition`) by a *field reference*
> (`Transition.from_state == self.id`). The CEL activation contract
> exposes `graph` for relation queries and `instance` for the current
> primitive — there is no helper for primitive-by-field lookup. Until
> SPEC-CEL-VALIDATOR adds such a helper (open question outside v0.1
> scope), the rule's `expression` is `"true"` and it can never fire as a
> violation. The legacy `predicate` string preserves the original intent.

> **`sw:Transition.no_self_transition`** is *not* in the table above — it
> is a primitive-level type constraint declared inline on the
> [`sw:Transition`](./primitives/behavior.ts) definition rather than a
> profile validation rule. The v1.1 Core does not evaluate type constraints
> either; the predicate is preserved verbatim.

---

## Templates

Defined in [`templates.ts`](./templates.ts).

| Template id                      | Name                  | Voice  | Tense   | Person | Target renderer |
| -------------------------------- | --------------------- | ------ | ------- | ------ | --------------- |
| `sw:tpl:architecture-overview`   | Architecture Overview | active | present | third  | `markdown`      |
| `sw:tpl:api-reference`           | API Reference         | active | present | second | `markdown`      |
| `sw:tpl:failure-catalog`         | Failure Catalog       | active | present | third  | `markdown`      |

All templates render with `max_section_depth = 3`, `language = "en"`, and
`include_metadata = false`.

---

## Renderer bindings

Catalogue declarations live in [`renderer_bindings.ts`](./renderer_bindings.ts).
**Each binding is now paired with an executable `cap:renderer` capability**
registered by [`activate`](./index.ts) (see [`renderers/`](./renderers/)).

| `renderer_id`         | Output format        | Output path           | Implementation                                  |
| --------------------- | -------------------- | --------------------- | ----------------------------------------------- |
| `sw:OpenAPIRenderer`  | `application/x-yaml` | `openapi.yaml`        | [`renderers/openapi.ts`](./renderers/openapi.ts) |
| `sw:ADRRenderer`      | `text/markdown`      | `decisions.md`        | [`renderers/adr.ts`](./renderers/adr.ts)        |

### What the renderers cover

- **`sw:OpenAPIRenderer`** emits an OpenAPI 3.1 document from the project's
  interface primitives:
  - `sw:Endpoint` (with `protocol = "HTTP"`, `method`, `path`) → `paths.{path}.{method}`
  - `sw:Schema` → `components.schemas.{name}` (field types best-effort
    mapped to OpenAPI primitive types via [`renderers/openapi.ts:mapFieldType`](./renderers/openapi.ts))
  - `sw:Exposes` (`Service` → `Endpoint`) → operation `tags`
  - `sw:InputTo` / `sw:OutputOf` (`Schema` → `Endpoint`) → `requestBody` / `responses.200`
  - `sw:Implements` (`Service` → `Contract`) + `Contract.error_conditions` → `responses.{4xx,5xx}` (status code inferred from error name)
  - Endpoints with `protocol ≠ HTTP` or missing `method`/`path` are
    excluded and listed under `info.x-fdpm-excluded-endpoints` so the
    omission is auditable rather than silent.

- **`sw:ADRRenderer`** emits a single Markdown bundle, one section per
  `sw:Decision`, with:
  - Index of all decisions linking to anchored sections.
  - Status, supersedes / superseded-by chains drawn from `sw:Supersedes`.
  - Context, Decision, Consequences blocks rendered from the Decision's
    own fields.
  - Alternatives considered (from `Decision.alternatives`).
  - Evidence drawn from `sw:Justifies` edges (Evidence → Decision).

### Invoking from the CLI

```bash
# OpenAPI (binary-treated MIME — must use -o)
fdpm render <project> application/x-yaml \
  --renderer-id sw:OpenAPIRenderer -o openapi.yaml

# ADRs — disambiguate against other text/markdown renderers
fdpm render <project> text/markdown \
  --renderer-id sw:ADRRenderer -o decisions.md
```

### Verification posture

Both renderers go through the §6.5 host gate: declared `contentType` must
equal the registered `target`, output must respect `FDPM_MAX_RENDER_BYTES`,
and `text/*` output must be valid UTF-8. End-to-end coverage lives in
[`tests/software-architecture-renderers.test.ts`](../../tests/software-architecture-renderers.test.ts).

---

## What this plugin does *not* contribute

In contrast to [`fdpm.formal-specification`](../formal_specification/),
this plugin's `activate` is intentionally minimal:

- **No `cap:validator` registrations.** Validation rules are evaluated
  by the host's CEL pipeline (per
  [SPEC-CEL-VALIDATOR](../../../docs/specs/SPEC-CEL-VALIDATOR.md)) using
  the `expression` field on each rule — no plugin-side adapter code is
  required. One rule
  (`sw:val:non-terminal-state-has-transition`) ships as a documented
  no-op (`expression: "true"`) because its predicate cannot be expressed
  under the current activation contract; see
  [§Validation rules](#validation-rules).
- **No type-constraint evaluation.** The `no_self_transition` constraint on
  `sw:Transition` is stored verbatim but not enforced by the Core.
- **No `references` enforcement.** `stableId` fields attach a
  `kind: "references"` field validation, but the Core does not check that
  the referenced primitive id exists or has the declared type.
- **No scope sets.** `SCOPE_SETS = {}`, `DEFAULT_SCOPE_SET = ""`.
- **No partition unit.** No primitive sets `is_partition_unit: true`.

The 15 Python-source primitive types remain byte-faithful with
`src/fdpm/plugins/software_architecture.py`. The 8 pass-2 primitive types
(`sw:Capability`, `sw:Actor`, `sw:Stakeholder`, `sw:Node`,
`sw:QualityAttribute`, `sw:Risk`, `sw:Viewpoint`, `sw:View`), the 8 pass-2
relation types, and the 5 pass-2 validation rules are TypeScript-side
extensions documented under their `// gap-pass-2` markers in source. They
do not change the shape of any pre-existing primitive; existing exports
still validate.

---

## Installation & activation

The plugin lives under `fdpm-cli/plugins/software_architecture/` and is loaded
by the FDPM CLI host through the standard plugin discovery path. The host:

1. Reads `fdpm-plugin.json`.
2. Imports the entry module ([`index.ts`](./index.ts)) and resolves
   `manifest`, `activate`, and the `onEnable` lifecycle hook.
3. Calls `activate(ctx)`, which registers `PROFILE`,
   `sw:OpenAPIRenderer`, and `sw:ADRRenderer`, then logs the activation
   summary.

No host configuration beyond standard plugin enablement is required.

---

## Usage from the CLI

Once active, the FDPM CLI exposes the profile, primitives, and relations
as first-class citizens. Example invocations (consult the top-level CLI
[`README.md`](../../README.md) and [`MANUAL.md`](../../MANUAL.md) for
authoritative flag reference):

```bash
# Create a project bound to this profile
fdpm project create --id my-system --name "My System" \
  --profile profile:software-architecture:1.0 --json

# Add primitives
cat <<'JSON' | fdpm primitive create my-system -f - --json
{
  "id": "entity:order-service",
  "type_id": "sw:Entity",
  "scope_id": "scope:sw:runtime",
  "field_values": {
    "kind": "Service",
    "name": "OrderService",
    "lifecycle": "Active",
    "description": "Owns order lifecycle."
  }
}
JSON

cat <<'JSON' | fdpm primitive create my-system -f - --json
{
  "id": "endpoint:place-order",
  "type_id": "sw:Endpoint",
  "field_values": {
    "name": "PlaceOrder",
    "protocol": "HTTP",
    "method": "POST",
    "path": "/orders"
  }
}
JSON

cat <<'JSON' | fdpm primitive create my-system -f - --json
{
  "id": "decision:postgres",
  "type_id": "sw:Decision",
  "scope_id": "scope:sw:domain",
  "field_values": {
    "status": "Accepted",
    "title": "Use Postgres",
    "context": "Relational consistency is a hard requirement.",
    "rationale": "The domain needs transactional integrity.",
    "alternatives": [
      {
        "name": "Document store",
        "reason_rejected": "Weak fit for cross-aggregate transactions."
      }
    ],
    "consequences": "Operational complexity is accepted for stronger consistency."
  }
}
JSON

# Connect with relations
cat <<'JSON' | fdpm relation create my-system -f - --json
{
  "id": "rel:order-service-exposes-place-order",
  "type_id": "sw:Exposes",
  "source_id": "entity:order-service",
  "target_id": "endpoint:place-order",
  "field_values": {}
}
JSON

# Validate
fdpm validate my-system --json

# Render
fdpm render my-system application/x-yaml --renderer-id sw:OpenAPIRenderer -o openapi.yaml
fdpm render my-system text/markdown --renderer-id sw:ADRRenderer -o adr.md
```

> **Rendering note.** This plugin ships two executable renderers:
> `sw:OpenAPIRenderer` for `application/x-yaml` and `sw:ADRRenderer` for
> `text/markdown`.
## File layout

```
software_architecture/
├── README.md                # This file
├── fdpm-plugin.json         # Plugin manifest (capabilities, permissions)
├── index.ts                 # Entry: assembles PROFILE, activate, hooks
├── categories.ts            # 5 CategoryDef
├── scopes.ts                # 4 ScopeDef + empty SCOPE_SETS
├── relations.ts             # 15 RelationTypeDef
├── validation_rules.ts      # 7 ValidationRuleDef (declarative)
├── renderer_bindings.ts     # 2 RendererBinding (catalogue entries)
├── templates.ts             # 3 TemplateDef
├── _common.ts               # FieldDef helpers (str/text/bool/iso/enumOf/
│                            #   strList/textList/struct/stableId/...)
├── primitives/
│   ├── identity.ts          # Entity, Decision, Concept
│   ├── semantics.ts         # Invariant, Constraint, Assumption, Guarantee
│   ├── behavior.ts          # State, Transition (no_self_transition), FailureMode
│   ├── interface.ts         # Endpoint, Schema, Contract, Event
│   └── evidence.ts          # Evidence
└── renderers/
    ├── _yaml.ts             # Minimal dependency-free YAML 1.2 emitter
    ├── openapi.ts           # sw:OpenAPIRenderer  → application/x-yaml
    └── adr.ts               # sw:ADRRenderer      → text/markdown
```

The decomposition follows SPEC-PLUGGABLE §6.1 / §9.1: one file per primitive
category; one file each for relations, rules, bindings, templates; helpers
in underscore-prefixed modules.

---

## Versioning

The **profile id** is held stable at `profile:software-architecture:1.0`;
the **manifest version** (`1.0.0`, in [`fdpm-plugin.json`](./fdpm-plugin.json))
increments under semantic versioning when the contributed profile is
extended in a backwards-compatible way. Breaking changes will bump the
profile id (e.g. `:1.0` → `:2.0`).

The initial port (1.0.0) was byte-faithful to the Python source dump at
`src/fdpm/plugins/software_architecture.py`. Subsequent revisions are
additive only — the 15 source primitive types, 15 source relation types,
and 7 source validation rules retain their original shape. The pass-2 gap
audit added 8 primitive types, 8 relation types, 5 validation rules, and
2 templates; SPEC-CEL-VALIDATOR migrated all 12 rules to CEL canonical
form.

---

## Verification contract

```
ARCHITECTURAL REQUIREMENT (PALS's LAW): LLMs will always produce some form of error.
Absence of output verification is a design defect, not a runtime bug.
All LLM output must be treated as untrusted and validated explicitly.
```

This plugin contributes a *vocabulary* and a *minimal enforcement surface*:

- The 12 validation rules are evaluated by the host's CEL pipeline at
  every Host write. Rule findings appear in `fdpm validate` output at
  the declared level; field-shape constraints (`max_length`, `min_items`,
  `references`) apply to every primitive shape.
- The 2 renderers (`sw:OpenAPIRenderer`, `sw:ADRRenderer`) are pure
  functions of the project graph; they do not introduce hidden
  validation but they do filter (e.g. dropping non-HTTP endpoints from
  OpenAPI output and recording the omission under
  `info.x-fdpm-excluded-endpoints`).

Two gaps remain worth documenting explicitly:

- One rule (`sw:val:non-terminal-state-has-transition`) cannot be
  evaluated under the current activation contract — see the §Validation
  rules note.
- `references` field validations on `stableId` fields are stored but not
  enforced by the v1.1 Core. Downstream tooling (or a sister plugin) is
  responsible for cross-primitive id resolution.

Skipping verification on a project that uses this profile — bypassing
`fdpm validate` or ignoring its findings — is still an architectural
omission, not a workflow shortcut.

---

## See also

- Top-level CLI: [`../../README.md`](../../README.md), [`../../MANUAL.md`](../../MANUAL.md)
- Sibling plugins:
  - [`../formal_specification/`](../formal_specification/) — formal-specification profile (full executable validators + Markdown / HTML / PDF renderers)
  - [`../fs_v3_importer/`](../fs_v3_importer/) — importer for legacy v3 documents
- Project root: [`../../../README.md`](../../../README.md), [`../../../PURPOSE.md`](../../../PURPOSE.md), [`../../../DISCLAIMER.md`](../../../DISCLAIMER.md)
