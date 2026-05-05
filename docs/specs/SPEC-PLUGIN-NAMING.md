---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Opus 4.7 (1M context) via Claude Code"
  date: "2026-05-05"
status: "Proposal"
audience: "Plugin authors (internal + external), maintainers reviewing PRs"
companion_specs:
  - "docs/specs/SPEC-PLUGGABLE-ARCHITECTURE.md"
  - "docs/specs/SPEC-CORE.md"
---

# SPEC — FDPM Plugin Naming Convention v0.1.4

_Two structural axes per plugin (subject path in §3, structural shape in §4), a small enumerated shape catalogue (§4), and the syntactic rules for the five identifier surfaces a plugin produces (§5)._

## Disclaimer

This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](../../DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.

---

## 0. Document Status

| Field | Value |
| --- | --- |
| Spec ID | spec:fdpm:plugin-naming:0.1 |
| Version | 0.1.4 |
| Status | Proposal |
| Audience | Plugin authors (internal + external), maintainers reviewing PRs |
| Scope | Three layers: the **subject axis** every plugin sits on (§3, a path through a subject taxonomy), the **structural-shape axis** that makes profile composition machine-checkable (§4), and the **syntactic rules** for the five identifier surfaces every plugin produces (§5). |
| Authority | Grounds the normative SPEC-PLUGGABLE-ARCHITECTURE §5.1 manifest-id regex (already enforced); strengthens it with a path requirement and a global leaf-uniqueness rule; introduces two new manifest fields (`structural_shape`, `composes_with_shapes`) that turn the existing `extends` chain from a free-form list into a host-validated contract. |
| Companion specs | [SPEC-PLUGGABLE-ARCHITECTURE.md](./SPEC-PLUGGABLE-ARCHITECTURE.md), [SPEC-CORE.md](./SPEC-CORE.md) |

---

## 1. The three-layered problem

Every plugin name encodes three independent facts. Earlier drafts of this SPEC (0.1.0, 0.1.1) conflated the first two and missed the third.

- **Subject (§3).** *What is this plugin about?* A path through a subject-matter taxonomy: `<vendor>.<rung1>.<rung2>...<leaf>`. Encoded in the manifest `id`. Each rung is a real subject noun. Authors usually reach for this first.
- **Structural shape (§4).** *What kind of structure does this plugin's profile type?* A small enumerated value drawn from a platform-defined catalogue. Encoded in two new manifest fields, not in the path. Shape determines whether two plugins can compose via `extends`.
- **Syntax (§5).** *How is the path written at every identifier surface?* Manifest id, directory tree, profile id, primitive/relation type prefix, capability local name. Mechanical derivation from the path's leaf.

The shape axis is the substantive new claim of v0.1.2+ and the reason this SPEC has Pass-2 standing. It surfaces a structural fact the earlier "domain noun" rule could not express:

> **DNIS composes cleanly with `formal-specification` and `spec-authoring` but not with `software-architecture` or `planning`.** The rule for which is which is structural, not nominal — DNIS, as a `node-tree` provider, attaches naturally to `prose-tree` plugins, not to `system-graph` or `dependency-graph` plugins. Splitting subject from shape lets the host validate composition mechanically (§4.3, §8.2) instead of trusting the `extends` field.

Each layer has a different enforcement model: syntax is mechanical (CI), shape composition is mechanical (host runtime), subject judgment is human (PR review). The structural axes are placed first in this document because they are the contract a plugin name signs with future readers; syntax is downstream.

### 1.1 Surface inconsistencies in the seven existing plugins

The seven plugins shipped today produce five identifiers each, in three case styles, with no rule for the type prefix:

| Plugin | Directory | Manifest id | Profile id | Type prefix |
| --- | --- | --- | --- | --- |
| Software Architecture | `software_architecture` | `fdpm.software-architecture` | `profile:software-architecture:1.0` | `sw` |
| Spec Authoring | `spec_authoring` | `fdpm.spec-authoring` | `profile:spec-authoring:0.1` | `spec` |
| Formal Specification | `formal_specification` | `fdpm.formal-specification` | `profile:formal-specification:3.0` | `fs` |
| Planning | `planning` | `fdpm.planning` | `profile:planning:0.1` | `plan` |
| DNIS | `dnis` | `fdpm.dnis` | `profile:dnis:0.1` | `dnis` |
| Spec Authoring DNIS (composition) | `spec_authoring_dnis` | `fdpm.spec-authoring-dnis` | `profile:spec-authoring-dnis:0.1` | (none) |
| Formal Specification DNIS (composition) | `formal_specification_dnis` | `fdpm.formal-specification-dnis` | `profile:formal-specification-dnis:0.1` | (none) |

Three syntactic problems:

- **Case-style drift.** `snake_case` (directory), `kebab-case` (id), unconstrained (prefix). A `grep` for one form misses the other two.
- **Type prefix is invented per-plugin** with no rule. `sw` from `software-architecture`, `fs` from `formal-specification`, `spec` (not `sa`) from `spec-authoring`, `plan` from `planning`, `dnis` kept whole. An author cannot predict which form the prefix will take.
- **No reserved-prefix policy.** Any plugin author can collide with the built-in prefixes; the host has no machine-checkable reservation.

The deeper structural inconsistency — that the seven names belong to **four different categories** (domain, artefact-kind, activity, SPEC-as-name) — is documented in the §3.5 audit. The combined diagnosis (syntactic + structural) is what this SPEC's three layers are designed to fix going forward.

---

## 2. External evidence

Three authoritative plugin-id conventions converge on a single shape: lowercase, namespace-separator, workbook-controlled prefix, kebab-case feature name.

| Convention | Form | Source |
| --- | --- | --- |
| OSGi `Bundle-SymbolicName` (1998–) | reverse-DNS, dot-separated, e.g. `com.example.feature` | [OSGi Core Specification §3 (Module Layer)](https://docs.osgi.org/specification/osgi.core/8.0.0/framework.module.html) |
| OSGi convention rationale | Bundle-SymbolicName uses the reverse domain name of the plug-in author, mirroring Java packages | [bnd Bundle-SymbolicName reference](https://bnd.bndtools.org/heads/bundle_symbolicname.html) |
| VS Code extension id (2015–) | `<publisher>.<name>`, both kebab-case, lowercase | [Visual Studio Code Extension Manifest](https://code.visualstudio.com/api/references/extension-manifest) |
| VS Code uniqueness rule | Publisher id immutable; full id `<publisher>.<extension>` is the global unique key | [Visual Studio Code Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) |
| npm package | `@scope/name`, all lowercase, kebab-case, no leading `.`/`_` | [npm Package Name Guidelines](https://docs.npmjs.com/package-name-guidelines/) |
| npm scopes | Scope is granted at user/org signup, used as namespace for related packages | [npm About Scopes](https://docs.npmjs.com/about-scopes/) |

The FDPM SPEC-PLUGGABLE-ARCHITECTURE §5.1 regex `^[a-z0-9]+(\.[a-z0-9-]+)+$` (already enforced for `manifest.id`) is precisely this shape and accommodates multi-rung paths without modification. This SPEC strengthens the regex with a taxonomy constraint (§3) and adds the structural rule the regex cannot enforce (§4).

---

## 3. The subject axis — `id` is a path

> **NORMATIVE.** A plugin's `id` MUST be a dotted path through the FDPM subject taxonomy: `<vendor>.<rung1>.<rung2>...<leaf>`, with **at least one non-leaf rung** between the vendor and the leaf (the minimum form is `<vendor>.<rung>.<leaf>`, e.g., `fdpm.software.architecture`). Every non-leaf rung MUST be a noun naming a subject-matter category drawn from the SPEC-declared rung set (§3.4). The leaf MUST be a noun describing the plugin's specific subject. **The leaf MUST be globally unique across the entire FDPM taxonomy** (§3.6), not merely under its parent rung — this is what lets the §5 leaf-only profile id be unambiguous.

The minimum is two non-vendor rungs (one category + the leaf), not one. A single-segment path like `fdpm.dnis` collapses path-as-namespace into flat-name-with-a-vendor-prefix, defeating §3.1's sibling-visibility property.

### 3.1 Why a path, not a flat name

Earlier drafts treated `<feat>` as a single token (`software-architecture`). That works at the manifest-id level but loses three things a path provides:

- **Sibling visibility.** `fdpm.documents.specifications` and `fdpm.documents.research` make their kinship obvious at the id level. `fdpm.spec-authoring` and `fdpm.formal-specification` do not.
- **Predictable taxonomy growth.** A new author asks *"where does my plugin go?"* and reads the existing tree. With flat names, every plugin invents its own placement convention.
- **Directory parity.** `plugins/documents/specifications/` mirrors the path; `plugins/spec_authoring/` does not.

The path **is** the namespace. The leaf is the name. This is the same split OSGi-style reverse-DNS naming uses.

### 3.2 Rung naming rules

Rungs are full words, not abbreviations:

- **Required**: `software`, `documents`, `work`, `infrastructure` (and any §3.4 SPEC-declared addition).
- **Forbidden**: `sw`, `doc`, `infra`, `arch`, etc. The arguments against shortening are the same as §5.3's: discoverability, collision risk, search cost. Generic rung names must remain reusable for sibling plugins; abbreviating them burns the namespace.

Rungs are nouns, not verbs or adjectives. `documents` (noun, ✓), `documenting` (gerund, ✗), `formal` (adjective, ✗ as a rung — may appear in a leaf if the SPEC escape hatch applies).

### 3.3 Leaf naming rules

The leaf MUST be:

- a noun or noun phrase describing the plugin's specific subject (`architecture`, `research`, `plans`);
- globally unique across the entire FDPM taxonomy (§3.6 — not merely under its parent rung);
- specific enough to distinguish the plugin from any sibling under the same parent.

The leaf MUST NOT be:

- a gerund (`planning` ✗ — would have to leaf as `plans`);
- a verb-noun describing the user's activity (`spec-authoring` ✗ — would have to leaf as `specifications`);
- an artefact-kind dressed as a subject (`formal-specification` ✗ — `formal` is an adjective; `specification` is the artefact, not the domain).

Failures of these rules are caught at PR review (§8.3), not by CI — they are semantic, not syntactic.

### 3.4 The taxonomy is part of the SPEC

Top-level rungs and the leaves under them are SPEC-declared, not author-chosen. A plugin name that fits no existing rung MAY introduce a new top-level rung — but only with a SPEC amendment that:

- justifies the rung's necessity (an existing plugin or a concrete proposed plugin needs it);
- confirms it does not overlap an existing rung;
- declares whether existing leaves under existing rungs would more honestly belong here (and grandfathers them with a §3.7 disclosure).

The rung set is the contract. Without it, every author invents their own taxonomy and the §3 path collapses to a flat-name-with-extra-dots.

### 3.5 The escape hatch — SPEC-defined leaves

There is exactly one escape from §3.3. **If a plugin's subject has no widely-understood common noun but is defined by a normative SPEC published in this repository, the plugin MAY use the SPEC's short identifier as its leaf**, with a per-plugin disclosure in the README citing the normative SPEC.

The escape hatch sits at the leaf, not at the rung — the parent rung MUST still be a real subject-matter category. `dnis` is the canonical example: the subject is "node trees with stable identity over revisions" (no community-standard short noun); the precise name is the SPEC that defines it (SPEC-DNIS); the rung is `infrastructure` (cross-cutting structural primitives); the path becomes `fdpm.infrastructure.dnis`.

Reviewers verify the README citation; absence of a citation rejects the escape hatch claim.

### 3.6 Global leaf uniqueness — and why

The leaf MUST be unique across the entire taxonomy, not merely under its parent rung. This is stricter than the obvious "no sibling collisions" rule.

Reason: profile ids in §5 use the leaf only (`profile:<leaf>:<version>`). If two plugins under different parent rungs both leaf at `architecture`, they would both produce `profile:architecture:1.0` — a runtime collision the host could not reconcile.

Two design alternatives were rejected:

- **Per-rung leaf uniqueness + path-encoded profile ids** (`profile:software.architecture:1.0`). Rejected: profile ids appear in op-log entries, error messages, and command output; longer ids degrade readability for no semantic gain at the call site.
- **Per-rung leaf uniqueness + leaf-disambiguating suffix on collision**. Rejected: forces the second author into a worse name to accommodate the first; turns naming order into a design constraint.

Global leaf uniqueness is a real restriction on §3.3 (the obvious "sibling" rule doesn't suffice) and is enforced by CI (§8.1).

### 3.7 Audit of the existing seven plugins

The audit shows each plugin's current state on both axes (subject, shape) and the path-and-shape it would have under this SPEC if applied retroactively. Existing plugins are grandfathered (§3.8); the audit is a permanent record of *which patterns are not models for plugin #8*.

| Plugin | Current `id` | Subject verdict | Structural shape | `composes_with_shapes` | Path under §3 (informational) | Leaf under §3 (informational) |
| --- | --- | --- | --- | --- | --- | --- |
| `fdpm.software-architecture` | flat | ✓ subject is a domain noun | `system-graph` | `[system-graph]` | `fdpm.software.architecture` | `architecture` |
| `fdpm.formal-specification` | flat | ✗ leaf is an artefact-kind, not a subject | `prose-tree` | `[prose-tree, node-tree]` | `fdpm.documents.research` | `research` |
| `fdpm.spec-authoring` | flat | ✗ leaf is an activity (`*-authoring`) | `prose-tree` | `[prose-tree, node-tree]` | `fdpm.documents.specifications` | `specifications` |
| `fdpm.planning` | flat | ✗ leaf is a bare gerund | `dependency-graph` | `[dependency-graph, node-tree]` | `fdpm.work.plans` | `plans` |
| `fdpm.dnis` | flat | ✓ via §3.5 SPEC escape hatch | `node-tree` | `[node-tree, prose-tree, dependency-graph]` | `fdpm.infrastructure.dnis` | `dnis` |
| `fdpm.spec-authoring-dnis` | flat composition | ✗ inherits parent | `null` | (validated against parents per §4.3) | `fdpm.composed.dnis-specifications` | `dnis-specifications` |
| `fdpm.formal-specification-dnis` | flat composition | ✗ inherits parent | `null` | (validated against parents per §4.3) | `fdpm.composed.dnis-research` | `dnis-research` |

Reading the audit:

- **Three of seven plugins fail the subject axis.** The two largest plugins (`formal-specification`, ~32 primitive types; `spec-authoring`, ~29) are both among the failures. The most productive plugins were named first, when no convention existed.
- **All four leaf-only candidate names are globally unique** under the proposed taxonomy: `architecture`, `research`, `specifications`, `plans`, `dnis`. No accidental cross-rung collision.
- **`software-architecture` × `dnis` is a category mistake** at the shape level: `system-graph` × `node-tree` is not a composable pair under §4. The path-rewrite proposal `fdpm.composed.architecture-dnis` would *also* be rejected by the §8.2 host gate, regardless of how the path were spelled.

### 3.8 Grandfathering

The seven plugins shipped at the time this SPEC moves to Active retain:

- their **current flat `id`s** (e.g., `fdpm.software-architecture`, not `fdpm.software.architecture`) — the path requirement of §3 applies to plugin **#8 onward**;
- their **current subject names** regardless of the §3.7 audit verdict — the subject-noun rule applies to new plugins;
- their **current type prefixes**: the four legacy abbreviations (`sw:`, `fs:`, `plan:`, `spec:`) are grandfathered, and `dnis:` is forward-compatible per §3.5 (it is the leaf and the SPEC-escape-hatch acronym, not a legacy shortening) — the §5.3 leaf-prefix rule applies to new plugins;
- their **current directories** (`plugins/spec_authoring/`, etc.) — the §5.2 path-mirroring directory layout applies to new plugins.

Existing plugins MUST, however, **declare `structural_shape` and `composes_with_shapes` in their next minor release**. This is the only structural ask of grandfathered plugins under this SPEC; everything else is deferred to a future ADR if a maintainer chooses to migrate.

The §3.7 audit is a permanent part of this SPEC. Plugin-review checklists (§8.3) MUST cite it when reviewing a new plugin's name to prevent existing patterns from being treated as model.

### 3.9 Enforcement summary for §3

| Rule | Layer | Enforcement |
| --- | --- | --- |
| `id` matches `<vendor>.<rung>...<leaf>` regex | syntactic | CI (§8.1) — already enforced by SPEC-PLUGGABLE-ARCHITECTURE §5.1 regex; strengthened by the rung-set check below |
| Each non-leaf rung is in the §3.4 SPEC-declared rung set | syntactic | CI (§8.1) |
| Leaf is globally unique across the taxonomy | syntactic | CI (§8.1) — scans every `fdpm-plugin.json`, asserts no duplicate leaves |
| Leaf is "a real subject-matter noun" | semantic | PR review (§8.3) |
| Escape hatch (§3.5) cites a normative SPEC | semantic | PR review (§8.3) |

---

## 4. The structural-shape axis — `structural_shape` and `composes_with_shapes`

> **NORMATIVE.** Every plugin's manifest MUST declare a `structural_shape` field drawn from the §4.1 catalogue (or `null` for composition profiles per §5.4). Every plugin's manifest MUST declare a `composes_with_shapes` array listing which shapes its profile can compose with — including its own. The host validates `extends` chains against these fields at profile-load time (§8.2); a mismatch rejects the load with a `verification`-category error.

### 4.1 The four shapes (v0.1.4)

| Shape | Defines | Example primitives | `composes_with_shapes` typical default |
| --- | --- | --- | --- |
| `prose-tree` | A tree of prose containers (Document → Section → Subsection) where each node carries free-form text and the tree is the document's outline. | `Document`, `Section`, `ADR`, `Requirement`, `Citation`, `Reference` | `[prose-tree, node-tree]` |
| `node-tree` | A tree of structurally-typed nodes whose identity is stable across revisions and whose shape is independent of the prose content. The "scaffold" that prose-trees and dependency-graphs can be hung on for revision-stable cross-references. | `Node`, `DerivedFrom`, `MigratedFrom` (DNIS) | `[node-tree, prose-tree, dependency-graph]` |
| `system-graph` | A directed typed graph of system components and their relationships. Not a tree — components reference each other in arbitrary topology, with cardinality bounds enforced by the profile. | `Component`, `ServiceContract`, `StateMachine`, `DeployedTo`, `Constrains` | `[system-graph]` |
| `dependency-graph` | A directed acyclic graph of work-items, dependencies, and gates. Distinct from `system-graph` because the topology is acyclic by contract; deps and blockers form a partial order. | `Task`, `Goal`, `DependsOn`, `Blocks`, `Gate` | `[dependency-graph, node-tree]` |

The `composes_with_shapes` defaults are **typical**, not required. A plugin MAY narrow its array (e.g., `software-architecture` declares only `[system-graph]`, not `[system-graph, node-tree]`, because its design has not surfaced a need for node-tree composition). A plugin MAY NOT widen beyond `composes_with_shapes` values that are themselves in the §4.1 catalogue.

A fifth informal shape — `flat-set` — describes profiles that type unstructured collections (a flat list of typed instances with no inherent structure). No current plugin uses it; reserved for future enumeration plugins (terminology dictionaries, controlled vocabularies). Not promoted to the v0.1.3 catalogue until a real plugin needs it.

### 4.2 Why these shapes and not more

Earlier drafts considered a richer enumeration (`document`, `model`, `plan`, etc.), but those terms describe *what the plugin is for*, not *what structure it types*. Two plugins both labelled `model` could have wildly different structures (a `system-graph` and a `dependency-graph` are both "models") and would falsely appear composable.

The four shapes here are picked from the ground up: *what does the typed instance graph actually look like for each existing plugin?* — and the answer turns out to be small and stable.

### 4.3 Composition rule

Two plugins A and B compose (one `extends` the other, or both extend a third) **iff** B's `structural_shape` appears in A's `composes_with_shapes`. The host validates this at profile-load time and rejects with `category: "verification"` and `evidence.reason: "shape_incompatible_extends"` if the rule is violated.

This is the substantive new enforcement mechanism v0.1.3 introduces. Today's `extends` is rubber-stamped; under §4.3 it becomes a typed contract.

### 4.4 Adding a shape

A SPEC amendment adding a new shape MUST:

- name the shape with a hyphenated noun phrase (e.g., `flat-set`, `event-stream`);
- describe the structural primitives the shape implies (cardinality, ordering, identity stability);
- list at least one concrete plugin that needs the new shape (no speculative shapes);
- declare composability with each existing shape (which existing shapes it can compose with, and vice versa).

This makes the catalogue grow only under structural pressure, not naming preference.

---

## 5. The syntactic layer — five identifier surfaces

Once §3 has produced a path and §4 has produced a shape, this section says how the path is written at every surface. The *leaf* of the path is the source of truth for every identifier surface except the manifest `id` and the directory tree, which use the full path.

### 5.1 The path tokens

A path consists of a `<vendor>` and one or more `<rung>` tokens, the last of which is the `<leaf>`. Every token follows the same regex:

`^[a-z][a-z0-9-]{1,31}$`

— lowercase, kebab-case, 2–32 characters, starts with a letter. Vendors, rungs, and leaves all share this regex; the difference is positional, not lexical.

### 5.2 The five derived identifiers

Given a path `<vendor>.<rung1>.<rung2>...<leaf>`:

| Surface | Form | Example (`<vendor>=fdpm`, path=`fdpm.software.architecture`) |
| --- | --- | --- |
| **Manifest `id`** | the full path, dot-separated | `fdpm.software.architecture` |
| **Directory** | `plugins/<rung1>/<rung2>/.../<leaf>/` (each rung a directory) | `plugins/software/architecture/` |
| **Profile id** | `profile:<leaf>:<major>.<minor>` (leaf only — see §5.5) | `profile:architecture:1.0` |
| **Type prefix** | `<leaf>:` (leaf only, full word) | `architecture:Component`, `architecture:DependsOn` |
| **Capability `local_name`** | `<leaf>` for the primary instance per capability kind; `<leaf>-<sub>` for additional instances | `local_name: "architecture"` |

A two-rung path (`software.architecture`) is the minimum after the vendor; longer paths are permitted but each additional rung adds verbosity. **The leaf is globally unique** (§3.6), which is what lets the leaf-only profile id be unambiguous without path encoding.

### 5.3 Why type prefixes use the full leaf, not a shortening

The seven existing plugins shortened their type prefixes (`sw:`, `fs:`, `plan:`, `spec:`); the rule going forward is **the prefix is the leaf, full word**. Three reasons:

- **Discoverability.** An author cannot predict `sw` from `software.architecture` or `fs` from `documents.research`. The full leaf is mechanically derivable from the path; the abbreviation is a convention to memorize.
- **Collision risk.** Two-character prefixes have a small namespace. `sw:` collides with `swarm`, `swift`, `sweep`; `fs:` collides with the conventional shorthand for "filesystem"; `plan:` collides with `plan9`. The full leaf has the namespace size of the leaf itself.
- **Search cost.** `grep architecture:` finds every reference to architecture-typed primitives; `grep "sw:"` finds noise across the codebase that has nothing to do with the plugin.

Type-id length is not a real cost: ids are constructed by tools, validated against `id_format`, and rendered in URLs; they are never typed by the user. A 30-character id is no worse than a 12-character id at the surfaces where ids appear.

**A targeted exception:** the §3.5 SPEC escape hatch produces a leaf that may be an acronym (`dnis`). When the leaf is an acronym, the type prefix is the acronym — so `dnis:Node`, not `node-trees:Node`. This is consistent with the "prefix is the leaf" rule; it just acknowledges that the leaf can be an acronym under §3.5.

### 5.4 Composition profiles

Composition profiles (`extends` two or more parents and contribute no new types) live under a dedicated `composed` rung:

- Manifest id: `fdpm.composed.<combined-leaf>`
- Profile id: `profile:<combined-leaf>:<major>.<minor>`
- Directory: `plugins/composed/<combined-leaf>/`
- Type prefix: **none** — composition profiles add no types
- `structural_shape`: `null` (the composition contributes no own structure)
- `composes_with_shapes`: **REQUIRED**, MUST contain each parent's `structural_shape`. The §4.3 host gate validates the composition's `extends` array against this list at profile-load: every parent's shape MUST appear in the composition's `composes_with_shapes`, otherwise the composition is rejected. The `null` `structural_shape` exempts the composition from being a parent itself, not from declaring what it composes with.

**`<combined-leaf>` construction rule:** the leaves of the parents, in alphabetical order, hyphen-joined. Example: composing `documents.specifications` (leaf=`specifications`) with `infrastructure.dnis` (leaf=`dnis`) produces leaf `dnis-specifications`, manifest id `fdpm.composed.dnis-specifications`. Alphabetical ordering eliminates the question of which parent comes first and makes the leaf deterministic from the parents.

Putting compositions under their own rung makes the taxonomy honest: a composition is structurally distinct from a leaf plugin (it ships no new types); the path makes that visible. `fdpm.composed.dnis-specifications` cannot be mistaken for a peer of `fdpm.documents.specifications`.

### 5.5 Why the profile id uses the leaf only

The profile id is `profile:<leaf>:<version>`, not `profile:<full-path>:<version>`. Two reasons:

1. **The path is the namespace; the leaf is the name.** The same split OSGi-style reverse-DNS package naming uses: `com.example.foo.bar.MyClass` is the fully-qualified name, but at the use site callers reference `MyClass` because the namespace is established by context. The full path is for navigation; the leaf is for identification.
2. **Profile ids appear in user-facing places** — op-log entries, error messages, command output. `profile:architecture:1.0` is readable; `profile:software.architecture:1.0` adds verbosity without conveying additional information at the call site.

Leaf-only profile ids are unambiguous because **leaves are globally unique** (§3.6). This is why §3.6's restriction is stricter than the obvious per-rung uniqueness rule.

The version tail uses `<major>.<minor>`, NOT `<major>.<minor>.<patch>` — patch-level releases that don't change the type catalogue should not produce profile-id churn.

### 5.6 The `profile:` prefix is normative

Profile ids share the namespaced-id schema (`^[a-z0-9-]+(:[A-Za-z0-9._-]+)+$`, defined as `CORE_ID_PATTERN` in [src/core/identity/id-rules.ts:13](../../fdpm-cli/src/core/identity/id-rules.ts#L13) and consumed as `NamespacedId` in [src/core/models/meta.ts:57](../../fdpm-cli/src/core/models/meta.ts#L57)) with several adjacent identifier kinds:

| Identifier kind | Example | Where it appears |
| --- | --- | --- |
| Primitive type id | `architecture:Component` | `DomainProfile.primitive_types[].id` |
| Relation type id | `dnis:DerivedFrom` | `DomainProfile.relation_types[].id` |
| Scope id | `scope:dnis:document` | `DomainProfile.scopes[].id` |
| Category id | `cat:dnis:document` | `DomainProfile.categories[].id` |
| State id | `state:<entity>:<name>` | software-architecture state-machine primitives |
| Profile id | `profile:architecture:1.0` | `DomainProfile.id`, `Workbook.profile_id`, `extends[]` |

The Zod schema accepts any string matching the namespaced-id regex; it does not require a specific leading word. The `profile:` prefix is a convention enforced by every built-in plugin and made normative here because:

- **Self-documentation in op logs and error messages.** The leading word disambiguates profile ids from primitive-type, scope, category, and state ids that share the namespaced-id shape.
- **Pattern consistency.** `scope:`, `cat:`, `state:`, `invariant:` are already de-facto leading words for their respective namespaces; profile ids should join them rather than be the lone exception.
- **Future-proofing.** A future cross-namespace lookup (`host.lookupAnything(id)`) needs a discriminator; the leading word is the cheap one.

Codifying it is free — every existing profile id already follows the convention. The codification turns the schema's accidental permissiveness into a documented constraint.

---

## 6. Reserved namespaces

The `<vendor>` namespace `fdpm` is reserved for built-in plugins shipped from this repository. Third-party authors MUST use a `<vendor>` they control under one of:

- a domain they own (reverse-DNS short form: `acme` for `acme.com`)
- their npm scope or VS Code publisher id
- their GitHub organization name

This mirrors VS Code (publisher) and npm (scope) registration. The host MAY in v0.2 enforce a registry of `<vendor>` claims; v0.1.3 enforces only the regex shape from SPEC-PLUGGABLE-ARCHITECTURE §5.1 plus the reserved-vendor rule (§8.1).

---

## 7. Migration cost (existing seven plugins)

Per §3.8, the only migration this SPEC requires of grandfathered plugins is the **structural-shape backfill (§7.1)**. Everything else in §7 is informational — it documents what a hypothetical retroactive migration would entail, and explicitly recommends against undertaking one.

### 7.1 Structural-shape backfill (S, REQUIRED)

Each of the seven plugins MUST add `structural_shape` and `composes_with_shapes` to its `fdpm-plugin.json` in its next minor release. Values follow the §3.7 audit:

| Plugin | `structural_shape` | `composes_with_shapes` |
| --- | --- | --- |
| `fdpm.software-architecture` | `system-graph` | `[system-graph]` |
| `fdpm.formal-specification` | `prose-tree` | `[prose-tree, node-tree]` |
| `fdpm.spec-authoring` | `prose-tree` | `[prose-tree, node-tree]` |
| `fdpm.planning` | `dependency-graph` | `[dependency-graph, node-tree]` |
| `fdpm.dnis` | `node-tree` | `[node-tree, prose-tree, dependency-graph]` |
| `fdpm.spec-authoring-dnis` | `null` | (informational) |
| `fdpm.formal-specification-dnis` | `null` | (informational) |

Effort: one declaration per manifest. The §8.2 host gate becomes effective once all seven manifests carry the new fields.

### 7.2 Path migration (M, NOT RECOMMENDED)

Existing plugin `id`s are flat (single rung after `fdpm.`). Under §3 they would become paths:

| Plugin | Current `id` | Path under §3 (informational) |
| --- | --- | --- |
| `fdpm.software-architecture` | flat | `fdpm.software.architecture` |
| `fdpm.formal-specification` | flat | `fdpm.documents.research` |
| `fdpm.spec-authoring` | flat | `fdpm.documents.specifications` |
| `fdpm.planning` | flat | `fdpm.work.plans` |
| `fdpm.dnis` | flat | `fdpm.infrastructure.dnis` |
| `fdpm.spec-authoring-dnis` | flat | `fdpm.composed.dnis-specifications` |
| `fdpm.formal-specification-dnis` | flat | `fdpm.composed.dnis-research` |

Per §3.8 grandfathering, existing plugins MAY retain their flat `id`s. A maintainer who chooses to migrate owns: the manifest rewrite, the directory rename (§7.4), every test reference, every committed `.md` under `docs/specs/` that references a profile id, every `extends` clause across the plugin set, every audit-log entry that records a profile id (operationally these survive but lose continuity with the new id).

### 7.3 Type-prefix migration (M, NOT RECOMMENDED)

Existing plugins use shortened prefixes (`sw:`, `fs:`, `plan:`, `spec:`, `dnis:`). Under §5.3 the prefix is the leaf:

| Plugin | Current prefix | Leaf-prefix under §5 (informational) |
| --- | --- | --- |
| `fdpm.software-architecture` | `sw:` | `architecture:` |
| `fdpm.formal-specification` | `fs:` | `research:` |
| `fdpm.spec-authoring` | `spec:` | `specifications:` |
| `fdpm.planning` | `plan:` | `plans:` |
| `fdpm.dnis` | `dnis:` | `dnis:` (unchanged — §3.5 escape hatch) |

The `spec:` → `specifications:` migration would be the most expensive: every rendered SPEC document in `docs/specs/` references `spec:doc:*`, `spec:sec:*` ids. The other prefixes are visible primarily in tests, build scripts, and renderers.

Per §3.8 grandfathering, existing prefixes are kept. Plugin #8 onward uses the full leaf prefix. The four legacy prefixes (`sw`, `fs`, `plan`, `spec`) become **permanently reserved** under §8.1 to prevent collision with future leaves.

### 7.4 Directory rename (S, NOT RECOMMENDED but partially trivial)

`plugins/foo_bar/` → `plugins/foo-bar/` is a pure case-style fix:

| Plugin | Current directory | Kebab-case directory (informational) | Path-mirroring directory (informational) |
| --- | --- | --- | --- |
| `fdpm.software-architecture` | `plugins/software_architecture/` | `plugins/software-architecture/` | `plugins/software/architecture/` |
| `fdpm.spec-authoring` | `plugins/spec_authoring/` | `plugins/spec-authoring/` | `plugins/documents/specifications/` |
| `fdpm.formal-specification` | `plugins/formal_specification/` | `plugins/formal-specification/` | `plugins/documents/research/` |
| `fdpm.planning` | `plugins/planning/` | `plugins/planning/` (unchanged) | `plugins/work/plans/` |
| `fdpm.dnis` | `plugins/dnis/` | `plugins/dnis/` (unchanged) | `plugins/infrastructure/dnis/` |

Two distinct migrations are possible:

- **(a) Snake-to-kebab only.** Trivial; aligns directory case style with manifest id case style. Recommended as **§9 step 1** because it reduces drift without touching the path system.
- **(b) Path-mirroring tree.** Implies §7.2 path migration as a prerequisite. NOT recommended without (a) being a partial step toward (b).

---

## 8. Enforcement

Three mechanisms, matching the SPEC's three layers.

### 8.1 Syntactic gates (CI, machine-checkable)

| Gate | Mechanism |
| --- | --- |
| Manifest id matches `^[a-z0-9]+(\.[a-z0-9-]+)+$` | Already enforced by SPEC-PLUGGABLE-ARCHITECTURE §5.1 JSON Schema. |
| `id` is a path: at least `<vendor>.<leaf>`; rungs in §3.4 declared set | New: parse each manifest `id`, assert non-leaf rungs are in the SPEC-declared rung set. Plugin #8 onward; grandfathered plugins exempt via a small whitelist. |
| Leaf is globally unique across the taxonomy | New: scan every `fdpm-plugin.json`, extract leaves, assert no duplicates (excluding the legacy-prefix whitelist). |
| Directory mirrors the path (or matches the legacy whitelist) | New: scan `plugins/**/fdpm-plugin.json`, assert path matches directory tree. Grandfathered plugins covered by whitelist. |
| Profile id matches the leaf | New: import each plugin's `PROFILE_ID`, parse as `profile:<leaf>:<version>`, assert `<leaf>` matches the manifest id's leaf. |
| Type prefix matches the leaf OR is in the legacy whitelist (`sw`, `fs`, `plan`, `spec`) | New: walk each profile's `primitive_types` and `relation_types`, extract prefix, assert it is in `{<leaf>, ...legacy_whitelist}`. |
| `structural_shape` is in the §4.1 catalogue or `null` | New: assert each manifest's `structural_shape` field. |
| `composes_with_shapes` is a subset of the §4.1 catalogue | New: assert each manifest's array. |
| `<vendor>` is `fdpm` only for built-in plugins; third-party plugins claim a different vendor | New: prevents third-party plugins from claiming `fdpm.*`. |

All gates land in two new test files (`tests/plugin-naming-syntax.test.ts`, `tests/plugin-naming-shape.test.ts`) plus a shared `LEGACY_WHITELIST` constant naming the seven existing plugins.

### 8.2 Structural composition gate (host runtime, machine-checkable)

The §4.3 composition rule is enforced at profile-load time, not in CI. When the host loads a profile that `extends` parents:

- For each parent, the host reads the parent's `structural_shape`.
- The host checks that the parent's shape appears in this profile's `composes_with_shapes`.
- If any parent fails, the host rejects the profile load with `category: "verification"` and `evidence.reason: "shape_incompatible_extends"`, citing the offending parent and the expected/observed shapes.

The check is O(parents) per profile, runs once per session at load time, and is the substantive new mechanism v0.1.3 introduces.

A grandfathered plugin with `structural_shape: null` is exempt from being a parent under this check (a `null`-shape parent is never rejected). This is the only role of the `null` value — once §7.1 backfill completes, `null` values disappear from leaf plugins and remain only on composition profiles.

### 8.3 Subject-noun gate (PR review, human-checkable)

The §3.3 leaf-naming rule (real subject noun, not a gerund / activity / artefact-kind) is not machine-checkable. Enforced at PR time by a one-question review:

> *"Is the proposed leaf a subject-matter noun? Does the proposed parent rung exist in the §3.4 SPEC-declared rung set? If the leaf claims the §3.5 escape hatch, does the README cite a normative SPEC?"*

The review checklist MUST cite the §3.7 audit table. The audit is the substantive record of *which existing names are not models*; without referencing it, a reviewer might treat `planning` or `formal-specification` as precedent for plugin #8.

A new plugin whose name fails the §3.3 rule is rejected at PR review with a one-line reason. This is the only enforcement mechanism for §3.3 subject judgment, and that is by design — the cost of human review on plugin-naming PRs is low (these PRs are rare), and the false-positive cost of a regex-based "subject-noun lint" would be much higher.

---

## 9. Recommended next steps

Six discrete asks, ranked by leverage. Items 1–4 are immediately actionable. Item 5 (host gate) depends on item 1 (shape backfill) but does NOT require this SPEC to be Active. Item 6 is the Active-status promotion itself.

1. **(S) Backfill `structural_shape` and `composes_with_shapes`** in the seven existing manifests, per §7.1. Required by this SPEC.
2. **(S) Snake-to-kebab directory rename** (§7.4 path (a)). Pure case-style fix; no semantic change.
3. **(S) Add the §8.1 syntactic CI gates.** Two new test files plus a `LEGACY_WHITELIST` constant covering the seven existing plugins.
4. **(S) Add the §8.3 subject-noun review checklist line** to PR-template / CONTRIBUTING.md. The §3.7 audit table is part of this SPEC; the reviewer's checklist MUST reference it.
5. **(M) Wire the §8.2 host runtime composition gate.** The host's profile loader reads `structural_shape` from each parent and validates against the child's `composes_with_shapes`. Smallest correct change to the existing `extends` validation. Effective once §7.1 backfill completes.
6. **(S) This document becomes normative.** Either keep `SPEC-PLUGIN-NAMING.md` as a peer to SPEC-PLUGGABLE-ARCHITECTURE, or fold §3, §4, §5 into new SPEC-PLUGGABLE-ARCHITECTURE subsections. Status moves from "Proposal" to "Active." Sized S because it is primarily a status-field change plus optional structural inlining; the substantive M-sized work (the §8.2 host gate) is item 5.

The renames implied by §7.2 (path migration), §7.3 (leaf prefix migration), and §7.4 path (b) (path-mirroring directories) are explicitly **NOT** in this list. They are documented in §7 as deferred and recommended-against; a future maintainer who wishes to undertake any of them owns the migration cost and SHOULD propose the rename via an ADR rather than this SPEC.

---

## 10. Sources

External:

- [Visual Studio Code Extension Manifest](https://code.visualstudio.com/api/references/extension-manifest) — canonical `<publisher>.<name>` shape.
- [Visual Studio Code Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) — uniqueness and immutability of publisher id.
- [npm Package Name Guidelines](https://docs.npmjs.com/package-name-guidelines/) — lowercase, kebab-case, no leading dots/underscores.
- [npm About Scopes](https://docs.npmjs.com/about-scopes/) — `@scope/name` form.
- [OSGi Core Specification §3 (Module Layer)](https://docs.osgi.org/specification/osgi.core/8.0.0/framework.module.html) — Bundle-SymbolicName rules; reverse-DNS path-as-namespace pattern.
- [bnd Bundle-SymbolicName reference](https://bnd.bndtools.org/heads/bundle_symbolicname.html) — reverse-DNS convention rationale.

Internal:

- [SPEC-PLUGGABLE-ARCHITECTURE.md §5.1](./SPEC-PLUGGABLE-ARCHITECTURE.md) — already-normative manifest-id regex.
- [SPEC-CORE.md](./SPEC-CORE.md) — `extends`, `DomainProfile`, namespaced-id schema.
- [`fdpm-cli/plugins/*/fdpm-plugin.json`](../../fdpm-cli/plugins/) — current state of all seven plugin manifests, surveyed at authoring time.
- [`fdpm-cli/src/core/models/meta.ts`](../../fdpm-cli/src/core/models/meta.ts) — `NamespacedId` regex and `DomainProfile` Zod schema.

---

## 11. Revision history

| Version | Date | Title | Affected sections |
| --- | --- | --- | --- |
| 0.1.0 | 2026-05-05 | Initial proposal — five identifier surfaces, single-axis "domain noun" rule. | all |
| 0.1.1 | 2026-05-05 | Pass-1 amendment — added `profile:` normative prefix rationale. | §3.5 (was) |
| 0.1.2 | 2026-05-05 | Two-axis amendment — split structural shape from subject; introduced the shape catalogue and host-runtime composition gate; reframed earlier rules accordingly. | §3, §4, §8 |
| 0.1.3 | 2026-05-05 | **Pass-2 refinement.** Resolved cross-section inconsistencies introduced by 0.1.2: leaf vs. flat-name confusion in §5.2 and §7; profile-id global-uniqueness rule (§3.6) made explicit; composition-leaf construction rule (alphabetical hyphen-join, §5.4) added; type-prefix rationale (§5.3) tightened to use leaves consistently; legacy whitelist (`sw`, `fs`, `plan`, `spec`) explicitly named for §8.1; §1.2 audit folded into §3.7 to remove redundancy; `composes_with_shapes` defaults documented in §4.1 with the typical-not-required distinction; error-envelope category aligned (`verification` everywhere, no longer mixed with `unsupported_media`); migration framing in §7 inverted to put the only required migration (§7.1 shape backfill) first. | §1, §3, §4, §5, §7, §8 |
| 0.1.4 | 2026-05-05 | **Pass-3 stabilization.** Codebase ground-truth pass against the actual repo: (a) §5.6 `NamespacedId` regex corrected from a guessed form to the actual `CORE_ID_PATTERN` (`^[a-z0-9-]+(:[A-Za-z0-9._-]+)+$`) at `src/core/identity/id-rules.ts:13`, with a second citation linking the consuming `NamespacedId` in `meta.ts:57`. (b) §3 NORMATIVE block and §5.2 minimum-path claim now agree on **two non-vendor rungs minimum** (`<vendor>.<rung>.<leaf>`); the earlier contradiction (one vs. two) is resolved with a load-bearing explanation that single-rung paths defeat §3.1's sibling-visibility property. (c) §3.7 audit's two composition leaves (`research-dnis`, `specifications-dnis`) corrected to alphabetical-hyphen-join form (`dnis-research`, `dnis-specifications`) per §5.4. (d) §5.4 composition profiles' `composes_with_shapes` corrected from "informational" to **REQUIRED** with explicit §4.3 host-gate semantics — composition's `composes_with_shapes` MUST contain each parent's shape; `null` `structural_shape` only exempts being a parent, not declaring composability. (e) §3.8 wording disentangled `dnis:` from legacy abbreviations — `dnis:` is forward-compatible (the §3.5 escape-hatch leaf), not grandfathered. (f) §9 step 6 re-sized from L to S (status promotion is mostly stamping; substantive work is item 5). (g) §9 lede clarified that item 5 depends on item 1, not on Active status. | §3, §5, §9, §11 |
