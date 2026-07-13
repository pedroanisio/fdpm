---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Opus 4.7 (1M context) via Claude Code"
  date: "2026-05-04"
---

# Formal Specification Plugin

`fdpm.formal-specification` — a server-side FDPM CLI plugin that contributes
the **Formal Specification** domain profile: a typed vocabulary for modeling
formal specifications, technical / scientific papers, and typed execution
roadmaps as graphs of primitives connected by relations, validated by rules,
and rendered to Markdown, HTML, or PDF.

| Field             | Value                                                                             |
| ----------------- | --------------------------------------------------------------------------------- |
| Plugin id         | `fdpm.formal-specification`                                                       |
| Plugin version    | `3.1.0`                                                                           |
| Spec version      | `1.1.0` (FDPM plugin manifest spec)                                               |
| Profile id        | `profile:formal-specification:3.0`                                                |
| Kind              | `server`                                                                          |
| Host compat.      | `fdpm >=1.1, <2`                                                                  |
| License           | MIT                                                                               |
| Entry point       | [`index.ts`](./index.ts)                                                          |
| Manifest          | [`fdpm-plugin.json`](./fdpm-plugin.json)                                          |

## Disclaimer

This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](../../../DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.

---

## Table of contents

1. [What this plugin contributes](#what-this-plugin-contributes)
2. [Capabilities (manifest)](#capabilities-manifest)
3. [Domain profile](#domain-profile)
4. [Categories](#categories)
5. [Scopes & scope sets](#scopes--scope-sets)
6. [Primitive types](#primitive-types)
7. [Relation types](#relation-types)
8. [Validation rules](#validation-rules)
9. [Renderers](#renderers)
10. [Templates](#templates)
11. [Renderer bindings](#renderer-bindings)
12. [Installation & activation](#installation--activation)
13. [Usage from the CLI](#usage-from-the-cli)
14. [File layout](#file-layout)
15. [Versioning & changelog](#versioning--changelog)
16. [Verification contract](#verification-contract)
17. [See also](#see-also)

---

## What this plugin contributes

When activated against an FDPM host, this plugin registers:

- **1** `DomainProfile` (`profile:formal-specification:3.0`)
- **9** primitive categories
- **8** scopes organised in **2** scope sets (`process`, `paper`)
- **32** primitive types under the `fs:` namespace
- **30** relation types (graph edges between primitives)
- **23** validation rules (executable predicates, registered as `cap:validator`)
- **3** renderers — Markdown, HTML, PDF — under `cap:renderer`
- **3** renderer bindings (legacy / metadata declarations)
- **3** document templates

Activation logs:

```
formal-specification activated: 32 primitive types, 30 relation types,
23 validators, 3 renderers (md/html/pdf)
```

---

## Capabilities (manifest)

Declared in [`fdpm-plugin.json`](./fdpm-plugin.json). The host must grant:

- `read:workbooks`
- `read:primitives`
- `read:relations`
- `render:server`

Capabilities exposed:

| Capability id        | Local name              | Entry           | Notes                                |
| -------------------- | ----------------------- | --------------- | ------------------------------------ |
| `cap:profile`        | `formal-specification`  | `PROFILE`       | The exported `DomainProfile`.        |
| `cap:lifecycle-hook` | `on-enable`             | `onEnable`      | Fires after the plugin is enabled.   |
| `cap:renderer`       | `spec-md`               | `renderMarkdown`| `renderer_id: fs:SpecRenderer`       |
| `cap:renderer`       | `spec-html`             | `renderHtml`    | `renderer_id: fs:SpecHtmlRenderer`   |
| `cap:renderer`       | `spec-pdf`              | `renderPdf`     | `renderer_id: fs:SpecPdfRenderer`    |

Validators are registered programmatically inside `activate(ctx)` rather than
declared in the manifest — see [`_register_validators.ts`](./_register_validators.ts).

---

## Domain profile

Exported as `PROFILE` from [`index.ts`](./index.ts):

```ts
{
  id: "profile:formal-specification:3.0",
  version: "3.1.0",
  name: "Formal Specification",
  label: "Formal Specification",
  extends: [],
  categories,           // 9 entries
  scopes,                // 8 entries
  primitive_types,       // 32 entries
  relation_types,        // 30 entries
  validation_rules,      // 23 entries
  renderers,             // 3 RendererBinding entries
  templates,             // 3 entries
  scope_sets,            // { process, paper }
  default_scope_set: "process",
}
```

The host calls `ctx.registerProfile(PROFILE)` during `activate`.

---

## Categories

Defined in [`categories.ts`](./categories.ts).

| Id                 | Name          | Purpose                                                       |
| ------------------ | ------------- | ------------------------------------------------------------- |
| `cat:structure`    | Structure     | Document organisation and composition                         |
| `cat:type-system`  | Type System   | Formal type definitions and schemas                           |
| `cat:semantics`    | Semantics     | Definitions, principles, and meaning                          |
| `cat:process`      | Process       | Sequential procedures and phases                              |
| `cat:assurance`    | Assurance     | Properties, contracts, failures, guidance                     |
| `cat:mathematics`  | Mathematics   | Equations, complexity analyses, and formal mathematical objects |
| `cat:architecture` | Architecture  | Components, modules, hyperparameters, and configurations      |
| `cat:empirical`    | Empirical     | Datasets, experiments, results, and ablation studies          |
| `cat:bibliography` | Bibliography  | External citations and references                             |

---

## Scopes & scope sets

Defined in [`scopes.ts`](./scopes.ts). Scopes carry an explicit `rank` so the
host can order document sections deterministically.

### Scopes

| Rank | Id                            | Name           | Description                                                     |
| ---: | ----------------------------- | -------------- | --------------------------------------------------------------- |
| 1    | `scope:fs:specification`      | Specification  | The formal document structure                                   |
| 2    | `scope:fs:method`             | Method         | The method being specified                                      |
| 3    | `scope:fs:practice`           | Practice       | Practical usage and guidance                                    |
| 4    | `scope:fs:paper:theory`       | Theory         | Mathematical foundations and complexity analysis                |
| 5    | `scope:fs:paper:architecture` | Architecture   | Model structure, components, configuration                      |
| 6    | `scope:fs:paper:training`     | Training       | Optimisation, regularisation, schedule                          |
| 7    | `scope:fs:paper:evaluation`   | Evaluation     | Experiments, benchmarks, ablation studies                       |
| 8    | `scope:fs:execution`          | Execution      | Typed execution roadmap with state components and ledgers       |

### Scope sets

| Set       | Members                                                                                    |
| --------- | ------------------------------------------------------------------------------------------ |
| `process` | `specification`, `method`, `practice`, `execution` (default)                               |
| `paper`   | `paper:theory`, `paper:architecture`, `paper:training`, `paper:evaluation`                 |

Default scope set: **`process`**.

---

## Primitive types

All primitive ids use the `fs:` namespace. Definitions live under
[`primitives/`](./primitives/), one file per category.

### `cat:structure` — [`structure.ts`](./primitives/structure.ts)

| Id                  | Description                                                                       |
| ------------------- | --------------------------------------------------------------------------------- |
| `fs:Section`        | Numbered top-level section. **Partition unit** (`is_partition_unit: true`); scoped. |
| `fs:ChangeRecord`   | A version change entry referencing affected primitives.                           |
| `fs:Requirement`    | An external requirement; priority ∈ `{must, should, may}` (RFC 2119).             |
| `fs:Audience`       | An audience tag; visibility ∈ `{public, internal, restricted}`.                   |
| `fs:Figure`         | Figure / diagram with `depicts` references; kind ∈ `{architecture_diagram, data_flow, attention_map, chart, table, other}`. |

### `cat:type-system` — [`type_system.ts`](./primitives/type_system.ts)

| Id                  | Description                                              |
| ------------------- | -------------------------------------------------------- |
| `fs:TypeDefinition` | A formal type definition.                                |
| `fs:Notation`       | Mathematical / formal notation.                          |
| `fs:EnumDef`        | An enumerated set of values.                             |

### `cat:semantics` — [`semantics.ts`](./primitives/semantics.ts)

| Id                  | Description                                              |
| ------------------- | -------------------------------------------------------- |
| `fs:Definition`     | A formal definition.                                     |
| `fs:Principle`      | A guiding principle.                                     |
| `fs:Example`        | An illustrative example (must have `content`).           |
| `fs:DesignDecision` | An architecture / design decision with alternatives.     |
| `fs:Assumption`     | An assumption with a lifecycle status (assumed, …).      |

### `cat:process` — [`process.ts`](./primitives/process.ts)

| Id                  | Description                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| `fs:Phase`          | A phase of a method. Required: `number`, `name`, `question`, `inputs`, `outputs`, `procedure` (≥1), `exit_condition`. v3.1 optional: `domain`, `state_component`, `objective`. v3.2 optional: `reads`, `writes` (StateComponents struct), `formality_level`, `revisit_label`. Scoped. |
| `fs:Actor`          | A role or agent; kind ∈ `{human, automated, hybrid}`.                                          |

### `cat:assurance` — [`assurance.ts`](./primitives/assurance.ts)

| Id                  | Description                                              |
| ------------------- | -------------------------------------------------------- |
| `fs:Contract`       | Pre/postcondition contract.                              |
| `fs:FormalProperty` | A formally stated property.                              |
| `fs:FailureMode`    | A failure mode with `recovery`.                          |
| `fs:Limitation`     | An acknowledged limitation.                              |
| `fs:Guideline`      | A practitioner-facing guideline.                         |
| `fs:Invariant`      | A property that must hold (with `enforcement` level).    |
| `fs:TestCase`       | A test case with `expected_output`.                      |

### `cat:mathematics` — [`mathematics.ts`](./primitives/mathematics.ts)

| Id                     | Description                                           |
| ---------------------- | ----------------------------------------------------- |
| `fs:Equation`          | An equation; declares its `variables`.                |
| `fs:ComplexityAnalysis`| Time / space / sample-complexity analysis.            |

### `cat:architecture` — [`architecture.ts`](./primitives/architecture.ts)

| Id                  | Description                                              |
| ------------------- | -------------------------------------------------------- |
| `fs:Component`      | A model / system component (declares `inputs`/`outputs`).|
| `fs:Hyperparameter` | A named hyperparameter.                                  |
| `fs:Configuration`  | An assignment of hyperparameter values.                  |

### `cat:empirical` — [`empirical.ts`](./primitives/empirical.ts)

| Id                  | Description                                              |
| ------------------- | -------------------------------------------------------- |
| `fs:Dataset`        | An evaluation / training dataset.                        |
| `fs:Experiment`     | A single experimental run.                               |
| `fs:Result`         | A reported metric / outcome.                             |
| `fs:AblationStudy`  | A study contrasting variations.                          |

### `cat:bibliography` — [`bibliography.ts`](./primitives/bibliography.ts)

| Id                  | Description                                              |
| ------------------- | -------------------------------------------------------- |
| `fs:Citation`       | External citation. Required: `key`, `authors` (≥1), `title`, `year`. Optional: `venue`, `url`, `category ∈ {standard, framework, regulation, vendor, book, paper}`, `currency_date` (ISO date). |

Field schemas (`required`, `kind`, `enum_values`, validators) are encoded
through helpers in [`_common.ts`](./_common.ts): `str`, `text`, `int`, `bool`,
`iso`, `enumOf`, `strList`, `structList`, `struct`, `json`, plus `idTemplate`,
`primitive`, and `inlineStruct`. Common id-list expansions used by relation
sources/targets live in [`_id-lists.ts`](./_id-lists.ts).

**Inline structs.** Several primitives carry their own `inline_structs` —
component-local nested types not exposed at the profile level
(`PROFILE.inline_structs` is intentionally `[]`):

- `fs:Component` → `TensorSpec`
- `fs:Configuration` → `ParamValue`
- `fs:TypeDefinition` → `TypeField`
- `fs:Equation` → `Variable`
- `fs:ComplexityAnalysis` → `ComplexityEntry`
- `fs:Phase` → `StateComponents` (v3.2)
- `fs:AblationStudy` → `Variation`
- `fs:DesignDecision` → `Alternative`

---

## Relation types

Defined in [`relations.ts`](./relations.ts). Every relation declares
`source_types` and `target_types` arrays (rather than single ids); the host's
`compileProfile` step normalises this at registration time.

| Id                    | Source → Target                          | Notes                                           |
| --------------------- | ---------------------------------------- | ----------------------------------------------- |
| `fs:ContainedIn`        | `CONTAINABLE_IDS` → `fs:Section`                                          | `CONTAINABLE_IDS = ALL_PRIMITIVE_IDS \ {fs:Section}`. `is_primary`, `order` metadata; required ≥1. |
| `fs:DependsOn`          | `fs:Section` → `fs:Section`                                               | Transitive.                                                  |
| `fs:References`         | `ALL_PRIMITIVE_IDS` → `ALL_PRIMITIVE_IDS`                                         | `kind ∈ {uses, refines, overrides, see_also}`, `context`.    |
| `fs:Precedes`           | `fs:Phase` → `fs:Phase`                                                   | Transitive — phase ordering.                                 |
| `fs:GovernsTransition`  | `fs:Contract` → `fs:Phase`                                                | Contract governs a phase boundary.                           |
| `fs:Validates`          | `fs:FormalProperty` → `fs:Phase, fs:Definition, fs:TypeDefinition, fs:Section` | Property validates a target.                                 |
| `fs:Mitigates`          | `fs:Guideline, fs:FormalProperty` → `fs:FailureMode, fs:Limitation`       | Mitigation edge.                                             |
| `fs:Illustrates`        | `fs:Example` → `ALL_PRIMITIVE_IDS`                                            | Attaches an example.                                         |
| `fs:Amends`             | `fs:ChangeRecord` → `ALL_PRIMITIVE_IDS`                                       | Versioning trail.                                            |
| `fs:Verifies`           | `fs:TestCase` → `fs:FormalProperty, fs:Contract, fs:Invariant`            | Test coverage edge.                                          |
| `fs:Satisfies`          | `fs:Phase, fs:Contract, fs:Definition` → `fs:Requirement`                 | Trace to external requirements.                              |
| `fs:Performs`           | `fs:Actor` → `fs:Phase`                                                   | Role assignment.                                             |
| `fs:VisibleTo`          | `ALL_PRIMITIVE_IDS` → `fs:Audience`                                           | Audience tagging.                                            |
| `fs:TermRelation`       | `fs:Definition` → `fs:Definition`                                         | `kind ∈ {synonym, specializes, equivalent, antonym}`.        |
| `fs:Implements`         | `fs:Component` → `fs:Equation`                                            | Component implements an equation.                            |
| `fs:ComposedOf`         | `fs:Component` → `fs:Component`                                           | `order`, `repeat` metadata; required acyclic.                |
| `fs:ParameterOf`        | `fs:Hyperparameter` → `fs:Component`                                      | Parametrisation edge.                                        |
| `fs:EvaluatedOn`        | `fs:Experiment` → `fs:Dataset`                                            |                                                              |
| `fs:ProducedBy`         | `fs:Result` → `fs:Experiment`                                             |                                                              |
| `fs:ComparesTo`         | `fs:Result` → `fs:Result`                                                 | `metric`, `delta` metadata.                                  |
| `fs:AblationOf`         | `fs:AblationStudy` → `fs:Configuration`                                   | Ablation of a configuration.                                 |
| `fs:Cites`              | `ALL_PRIMITIVE_IDS` → `fs:Citation`                                           | Optional `claim` metadata.                                   |
| `fs:Depicts`            | `fs:Figure` → `ALL_PRIMITIVE_IDS`                                             |                                                              |
| `fs:DataFlow`           | `fs:Component` → `fs:Component`                                           | `tensor`, `is_residual` metadata.                            |
| `fs:SharedWeights`      | `fs:Component` → `fs:Component`                                           | Transitive; `parameter_name` metadata.                       |
| `fs:DerivedFrom`        | `fs:Equation` → `fs:Equation`                                             | `derivation_kind ∈ {specialises, combines, approximates}`.   |
| `fs:OccursIn` (v3.1)    | `fs:FailureMode` → `fs:Phase`                                             | Closes orphan FailureMode nodes; required for phase ledger.  |
| `fs:Qualifies` (v3.1)   | `fs:Limitation, fs:FormalProperty` → `fs:Phase, fs:Section`               | Qualifies validity scope of target.                          |
| `fs:SupersededBy` (v3.1)| `fs:Assumption` → `fs:Assumption`                                         | Forward pointer; pairs with `Assumption.superseded_by`.      |
| `fs:Enforces` (v3.1)    | `fs:Invariant` → `fs:Phase, fs:Section, fs:Contract`                      | `enforcement ∈ {CI, Review}` metadata. Stronger than `Validates`. |

Cardinality bounds (`source_min`/`source_max`/`target_min`/`target_max`),
metadata schemas, `symmetric`, and `transitive` flags are declared per
relation in the source file.

---

## Validation rules

Defined in [`validation_rules.ts`](./validation_rules.ts) and **executed** by
the validators registered in [`_register_validators.ts`](./_register_validators.ts).
Each rule is recorded with its DSL `predicate` (kept verbatim for tooling
introspection) and an executable `cap:validator` that emits exactly **one**
finding when the predicate fails. The pipeline suppresses the step-5
informational duplicate so each logical check produces a single finding.

| Rule id                                       | Level    | Applies to            | Predicate                                          |
| --------------------------------------------- | -------- | --------------------- | -------------------------------------------------- |
| `fs:val:phase-has-question`                   | error    | `fs:Phase`            | `non_trivial(question)`                            |
| `fs:val:contract-complete`                    | error    | `fs:Contract`         | `non_trivial(precondition) and non_trivial(postcondition)` |
| `fs:val:property-has-intuition`               | warning  | `fs:FormalProperty`   | `non_trivial(intuition)`                           |
| `fs:val:failure-has-recovery`                 | error    | `fs:FailureMode`      | `non_trivial(recovery)`                            |
| `fs:val:example-has-content`                  | error    | `fs:Example`          | `non_trivial(content)`                             |
| `fs:val:invariant-has-statement`              | error    | `fs:Invariant`        | `non_trivial(statement)`                           |
| `fs:val:testcase-has-expected`                | error    | `fs:TestCase`         | `non_trivial(expected_output)`                     |
| `fs:val:decision-has-alternatives`            | warning  | `fs:DesignDecision`   | `min_items(alternatives, 1)`                       |
| `fs:val:equation-has-variables`               | error    | `fs:Equation`         | `min_items(variables, 1)`                          |
| `fs:val:component-has-io`                     | error    | `fs:Component`        | `min_items(inputs,1) and min_items(outputs,1)`     |
| `fs:val:experiment-has-result`                | warning  | `fs:Experiment`       | `has_incoming(fs:ProducedBy)`                      |
| `fs:val:result-has-comparison`                | warning  | `fs:Result`           | `has_outgoing(fs:ComparesTo) or field(is_external_baseline)==true` |
| `fs:val:config-has-values`                    | error    | `fs:Configuration`    | `min_items(values, 1)`                             |
| `fs:val:ablation-has-variations`              | error    | `fs:AblationStudy`    | `min_items(variations, 2)`                         |
| `fs:val:citation-has-year`                    | error    | `fs:Citation`         | `non_trivial(year)`                                |
| `fs:val:figure-has-depicts`                   | warning  | `fs:Figure`           | `min_items(depicts, 1)`                            |
| `fs:val:component-acyclic`                    | error    | `fs:Component`        | `acyclic(fs:ComposedOf)`                           |
| `fs:val:invariant-has-enforcement`            | error    | `fs:Invariant`        | `non_trivial(enforcement)`                         |
| `fs:val:assumption-has-status`                | warning  | `fs:Assumption`       | `non_trivial(status)`                              |
| `fs:val:assumption-assumed-needs-owner`       | error    | `fs:Assumption`       | `field(status)!='assumed' or non_trivial(risk_owner)` |
| `fs:val:assumption-superseded-needs-pointer`  | error    | `fs:Assumption`       | `field(status)!='superseded' or non_trivial(superseded_by)` |
| `fs:val:phase-has-failure-mode`               | warning  | `fs:Phase`            | `has_incoming(fs:OccursIn)`                        |
| `fs:val:citation-not-stale`                   | warning  | `fs:Citation`         | `non_trivial(currency_date)`                       |

Predicate evaluator helpers (`checkNonTrivial`, `checkMinItems`, `fieldEquals`,
`hasIncoming`, `hasOutgoing`, `acyclicFrom`, `isTrivial`) are exported by
[`_validators.ts`](./_validators.ts) and reused across rule registrations.

> **PALS's Law applies** to any LLM-assisted authoring on top of these
> primitives: validators are mandatory, not optional. Treat all generated
> primitive instances as untrusted until they pass validation.

---

## Renderers

The plugin contributes three executable renderers, registered through
`ctx.registerRenderer({ target, rendererId, fn })`:

| Target            | `renderer_id`           | Function          | File                                       |
| ----------------- | ----------------------- | ----------------- | ------------------------------------------ |
| `text/markdown`   | `fs:SpecRenderer`       | `renderMarkdown`  | [`renderers/markdown.ts`](./renderers/markdown.ts) |
| `text/html`       | `fs:SpecHtmlRenderer`   | `renderHtml`      | [`renderers/html.ts`](./renderers/html.ts) |
| `application/pdf` | `fs:SpecPdfRenderer`    | `renderPdf`       | [`renderers/pdf.ts`](./renderers/pdf.ts)   |

Cross-cutting layout / ordering logic — section iteration, scope ranking,
metadata expansion — is shared via [`renderers/_common.ts`](./renderers/_common.ts).

The Markdown and HTML renderers produce inline strings; the PDF renderer
streams a binary buffer. All three honour the host's `RenderRequest` shape
and the profile's scope ordering.

---

## Templates

Defined in [`templates.ts`](./templates.ts).

| Template id                  | Name              | Voice   | Tense   | Person | Target renderer |
| ---------------------------- | ----------------- | ------- | ------- | ------ | --------------- |
| `fs:tpl:full-specification`  | Full Specification| passive | present | third  | `markdown`      |
| `fs:tpl:type-catalog`        | Type Catalog      | active  | present | second | `markdown`      |
| `fs:tpl:phase-walkthrough`   | Phase Walkthrough | active  | present | second | `markdown`      |

All templates render with `max_section_depth = 3`, `language = "en"`, and
`include_metadata = false`.

---

## Renderer bindings

Legacy / metadata-only declarations consumed by the FDPM host's renderer
registry. Defined in [`renderer_bindings.ts`](./renderer_bindings.ts).

| `renderer_id`           | Output format      | Output path  | Description                                           |
| ----------------------- | ------------------ | ------------ | ----------------------------------------------------- |
| `fs:SpecRenderer`       | `text/markdown`    | `spec.md`    | Full specification as markdown.                       |
| `fs:SpecHtmlRenderer`   | `text/html`        | `spec.html`  | Self-contained HTML specification document.           |
| `fs:SpecPdfRenderer`    | `application/pdf`  | `spec.pdf`   | A4 PDF specification document.                        |

---

## Installation & activation

The plugin lives under `fdpm-cli/plugins/formal_specification/` and is loaded by
the FDPM CLI host through the standard plugin discovery path. The host:

1. Reads `fdpm-plugin.json`.
2. Imports the entry module (`index.ts`) and resolves `manifest`, `activate`,
   and lifecycle hooks (`onEnable`).
3. Calls `activate(ctx)`, which:
   - registers `PROFILE` via `ctx.registerProfile(...)`;
   - calls `registerFormalSpecValidators(ctx)` to wire all 23 validators;
   - registers the three renderers via `ctx.registerRenderer(...)`;
   - logs the activation summary.

No host configuration beyond standard plugin enablement is required.

---

## Usage from the CLI

Once the plugin is active, the FDPM CLI exposes its profile, primitives,
relations, and renderers as first-class citizens. Example invocations
(consult the repository [`README.md`](../../../README.md) and
[`fdpm-cli/MANUAL.md`](../../MANUAL.md)
for authoritative flag reference):

```bash
# Create a workbook bound to this profile
fdpm workbook create --id my-spec --name "My Spec" \
  --profile profile:formal-specification:3.0 --json

# Add primitives
cat <<'JSON' | fdpm primitive create my-spec -f - --json
{
  "id": "phase:discovery",
  "type_id": "fs:Phase",
  "scope_id": "scope:fs:execution",
  "field_values": {
    "number": 1,
    "name": "Discovery",
    "question": "What problem are we solving?",
    "inputs": ["problem statement"],
    "outputs": ["validated problem framing"],
    "procedure": ["collect evidence", "state assumptions"],
    "exit_condition": "The problem statement is explicit."
  }
}
JSON

cat <<'JSON' | fdpm primitive create my-spec -f - --json
{
  "id": "inv:core-soundness",
  "type_id": "fs:Invariant",
  "field_values": {
    "statement": "Every emitted artifact must trace back to a validated primitive.",
    "enforcement": "Runtime"
  }
}
JSON

# Connect with relations
cat <<'JSON' | fdpm relation create my-spec -f - --json
{
  "id": "rel:phase-improves-invariant",
  "type_id": "fs:Improves",
  "source_id": "phase:discovery",
  "target_id": "inv:core-soundness",
  "field_values": {}
}
JSON

# Validate (runs all 23 validators)
fdpm validate my-spec --json

# Render
fdpm render my-spec text/markdown --renderer-id fs:SpecRenderer -o spec.md
fdpm render my-spec text/html --renderer-id fs:SpecHtmlRenderer -o spec.html
fdpm render my-spec application/pdf --renderer-id fs:SpecPdfRenderer -o spec.pdf
```

---

## File layout

```
formal_specification/
├── README.md                    # This file
├── fdpm-plugin.json             # Plugin manifest (capabilities, permissions)
├── index.ts                     # Entry: assembles PROFILE, activate, hooks
├── categories.ts                # 9 CategoryDef
├── scopes.ts                    # 8 ScopeDef + 2 scope sets
├── relations.ts                 # 30 RelationTypeDef
├── validation_rules.ts          # 23 ValidationRuleDef (declarative)
├── renderer_bindings.ts         # 3 RendererBinding (metadata)
├── templates.ts                 # 3 TemplateDef
├── _common.ts                   # FieldDef helpers (str/bool/int/enumOf/...)
├── _id-lists.ts                 # ALL_PRIMITIVE_IDS / CONTAINABLE_IDS
├── _validators.ts               # Predicate evaluator helpers
├── _register_validators.ts      # Wires 23 cap:validator entries
├── primitives/
│   ├── structure.ts             # Section, ChangeRecord, Requirement, Audience, Figure
│   ├── type_system.ts           # TypeDefinition, Notation, EnumDef
│   ├── semantics.ts             # Definition, Principle, Example, DesignDecision, Assumption
│   ├── process.ts               # Phase, Actor
│   ├── assurance.ts             # Contract, FormalProperty, FailureMode, Limitation,
│   │                            # Guideline, Invariant, TestCase
│   ├── mathematics.ts           # Equation, ComplexityAnalysis
│   ├── architecture.ts          # Component, Hyperparameter, Configuration
│   ├── empirical.ts             # Dataset, Experiment, Result, AblationStudy
│   └── bibliography.ts          # Citation
└── renderers/
    ├── _common.ts               # Shared layout helpers
    ├── markdown.ts              # text/markdown — fs:SpecRenderer
    ├── html.ts                  # text/html     — fs:SpecHtmlRenderer
    └── pdf.ts                   # application/pdf — fs:SpecPdfRenderer
```

The decomposition follows SPEC-PLUGGABLE §6.1 / §9.1: one file per primitive
category; one file each for relations, rules, bindings, templates; helpers
in underscore-prefixed modules.

---

## Versioning & changelog

The **profile id** is held stable at `profile:formal-specification:3.0`;
the **manifest version** (`3.1.0`, in [`fdpm-plugin.json`](./fdpm-plugin.json))
increments under semantic versioning as the contributed profile is extended
in a backwards-compatible way. Breaking changes will bump the profile id
(e.g. `:3.0` → `:4.0`).

> **Header alignment caveat.** The on-disk manifest version is `3.1.0` and
> [`relations.ts`](./relations.ts) and most primitive files document v3.1
> additions. [`primitives/process.ts`](./primitives/process.ts) documents
> a further v3.2 increment (Phase read/write declarations, the
> `StateComponents` inline struct, `formality_level`, and `revisit_label`)
> for Bernstein-condition parallelism analysis. These v3.2 fields **are
> live** in the registered profile even though the manifest version has
> not yet been bumped to match.

### v3.1 additions

- **Invariant enforcement**: `fs:Invariant` now requires an `enforcement`
  field (CI-enforced "hard" vs. review-enforced "soft"); validated by
  `fs:val:invariant-has-enforcement`.
- **Assumption Ledger**: full lifecycle fields on `fs:Assumption`
  (`status`, `risk_owner`, `superseded_by`); three new validators
  (`assumption-has-status`, `assumption-assumed-needs-owner`,
  `assumption-superseded-needs-pointer`).
- **DesignDecision lifecycle** fields completed on `fs:DesignDecision`
  (with the `Alternative` inline struct).
- **Phase**: `domain`, `state_component`, and `objective` fields added
  on `fs:Phase`; new validator `fs:val:phase-has-failure-mode`.
- **Citation**: `category` and `currency_date` added on `fs:Citation`;
  new validator `fs:val:citation-not-stale`.
- **Four new relation types**: `fs:OccursIn`, `fs:Qualifies`,
  `fs:SupersededBy`, `fs:Enforces`.
- **Four enum corrections** vs. the v3.0 Python source.

### v3.2 additions (CLI port, post-v0.5.1 review)

- **Phase read/write declarations**: `reads` and `writes` fields, both
  carrying a `StateComponents` inline struct (string list of
  state-component ids such as `S.foundation`, `S.product_def`).
  Foundation for Bernstein-condition parallelism analysis (RAW/WAW/WAR
  edge derivation).
- **Phase formality classification**: `formality_level` (e.g. `structural`).
- **Phase revisit metadata**: `revisit_label` — heterogeneous JSON,
  declared at kind level only (no schema enforcement).

---

## Verification contract

```
ARCHITECTURAL REQUIREMENT (PALS's LAW): LLMs will always produce some form of error.
Absence of output verification is a design defect, not a runtime bug.
All LLM output must be treated as untrusted and validated explicitly.
```

This plugin is a verification surface: every primitive type, relation type,
and rule it contributes exists so that downstream content — whether
human-authored or LLM-assisted — can be checked against an explicit,
declarative contract. Skipping `fdpm validate` on a workbook that uses this
profile is an architectural omission, not a workflow shortcut.

---

## See also

- Top-level CLI: [`../../../README.md`](../../../README.md), [`../../MANUAL.md`](../../MANUAL.md)
- Sibling plugins:
  - [`../software_architecture/`](../software_architecture/) — software architecture profile
- Workbook root: [`../../../README.md`](../../../README.md), [`../../../PURPOSE.md`](../../../PURPOSE.md), [`../../../DISCLAIMER.md`](../../../DISCLAIMER.md)
