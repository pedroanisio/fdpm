---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Opus 4.7 (1M context) via Claude Code"
  date: "2026-05-04"
revision: "1.1.1 — final-pass cleanup: title and v1.0/v1.1 wording; see §20"
---

# SPEC — FDPM Pluggable Architecture v1.1

> **ARCHITECTURAL REQUIREMENT (PALS's LAW):** LLMs will always produce some
> form of error. Absence of output verification is a design defect, not a
> runtime bug. All LLM output must be treated as untrusted and validated
> explicitly. This SPEC inherits that contract for every extension point
> defined below: a plugin's declared schema, validators, and renderer
> output are inputs to the host and MUST be validated.

## Disclaimer

This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](../../DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.

---

## 0. Document Status

| Field          | Value                                                                |
| -------------- | -------------------------------------------------------------------- |
| Spec ID        | `spec:fdpm:pluggable-architecture:1.1`                               |
| Version        | 1.1.1                                                                |
| Status         | Draft (event-sourcing alignment + final-pass cleanup)                |
| Spec audience  | FDPM core maintainers, plugin authors                                |
| Implements     | `@PURPOSE.md` (universal, domain-agnostic)                           |
| Companion SPEC | `spec:fdpm:core:1.1` (defines the host this SPEC's plugins consume)  |
| Supersedes     | None                                                                 |
| Required reads | `CLAUDE.md`, `PURPOSE.md`, `DISCLAIMER.md`, `SPEC-CORE.md`           |

Revisions 1.0.1 through 1.0.5 over 1.0.0 were clarification passes
in lockstep with SPEC-CORE 1.0.x. **Revision 1.1.0 is a real minor
bump**, mirroring SPEC-CORE 1.1.0's adoption of event sourcing. The
plugin-visible surface gains very little new — plugins emit operations
through their existing write paths, and the operation log subsumes
the audit log — but the *meaning* of those existing surfaces changes
enough to warrant a SPEC bump. The runtime-reported `spec_version`
for plugin manifests advances from `"1.0"` to `"1.1"`; existing
manifests targeting `"1.0.0"` continue to load on a 1.1 host because
of the major-pinned `pattern: ^1\\.\\d+\\.\\d+$` rule (§5.1). See
§20 for the per-paragraph diff.

---

## 1. Motivation

### 1.1 Current state (verified)

The codebase ships with a *plugin folder* but not a *plugin system*:

- `src/fdpm/plugins/{formal_specification, narrative, software_architecture}.py` are statically imported in `src/fdpm/main.py:45-50` inside the FastAPI lifespan.
- Each module exports a single `register(store)` function that mutates the global `store` (`src/fdpm/store.py:42`).
- API routers in `src/fdpm/api/*.py` are equally hardcoded into `main.py:23-33` and `main.py:142-152`. No router contributed by a plugin can join the app at runtime.
- `pyproject.toml` declares no `[workbook.entry-points]` group. Third-party packages cannot register a profile, validator, renderer, or route without editing core source.
- Plugin internals are monolithic data literals (e.g. `formal_specification.py` is one 3,251-line `DomainProfile(...)` expression).
- The frontend (`frontend/src/`) has no plugin awareness: API surface, primitive forms, renderers, and explorer panels are compiled into the React bundle. A new profile cannot contribute UI without editing `frontend/src/components/**`.

### 1.2 Conflict with `@PURPOSE.md`

`@PURPOSE.md` declares FDPM "universal, domain-agnostic". A system that requires a core-source edit to add a domain is, by definition, not domain-agnostic at the architectural level. The current design is *domain-parametric* (one parameter per profile, supplied at compile time) — not *domain-pluggable*.

### 1.3 Goal

Transform FDPM into a system in which **a third-party Python wheel and a third-party JavaScript bundle, installed without modifying core, can together contribute a complete, end-to-end domain experience** — primitive types, validators, server routes, server-side renderers, and frontend UI — gated only by signed manifest contracts and host-enforced verification.

This SPEC defines the contracts, data flow, registry, lifecycle, security model, and migration plan for that transformation.

---

## 2. Definitions

| Term                      | Definition                                                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Host**                  | The FDPM core process: FastAPI app + frontend shell.                                                             |
| **Plugin**                | A self-contained extension package contributing one or more capabilities to the host.                            |
| **Capability**            | A typed, versioned extension point exposed by the host. See §4.                                                  |
| **Manifest**              | Machine-readable declaration shipped with every plugin. Schema in §5.                                            |
| **Profile**               | A `DomainProfile` (existing concept; see `src/fdpm/models/core.py:312`). Becomes one capability among many.      |
| **Server plugin**         | Python wheel discovered via entry points; runs in the host process.                                              |
| **Frontend plugin**       | Static JS/CSS bundle discovered via the host's plugin registry; loaded into the SPA at runtime.                  |
| **Plugin Registry (PR)**  | Authoritative in-memory index of installed plugins, their manifests, capabilities, and lifecycle states.         |
| **Verification gate**     | A host-enforced check applied to every artefact a plugin contributes (PALS's LAW). The Core SPEC (§8) defines the broader gate; this SPEC details the plugin-specific rules. |
| **Pluggable boundary**    | A code-level interface across which the host and a plugin communicate without sharing private types.             |

A plugin **MAY** contribute server-only capabilities, frontend-only capabilities, or both. The two halves of a "full-stack plugin" are independent artefacts joined by a shared `plugin.id` and `plugin.version`.

---

## 3. Design Principles

These rank-ordered principles resolve conflicts between competing requirements.

1. **Contract over convention.** Every extension point is a declared, versioned interface. Convention-only extension (e.g. "name your function `register`") is forbidden.
2. **Verification at every boundary.** Every artefact crossing a plugin/host boundary is validated (manifest schema, output schema, renderer output, RBAC). PALS's LAW is structural, not advisory.
3. **Host owns all routing decisions.** Plugins request mounts; the host grants them under a namespace it controls. Plugins MUST NOT mount on arbitrary paths.
4. **Failure isolation.** A faulty plugin MUST NOT crash the host. Failures are reported, the offending capability is quarantined, the host continues.
5. **Discoverability is declarative.** The host learns what a plugin does from the manifest, not from import-time side effects.
6. **No global mutation.** Plugins receive a scoped `PluginContext`. Direct mutation of `store` (current pattern) is removed in favour of registration calls on the context.
7. **Frontend and backend are symmetric.** Both have a registry, manifests, capability points, and lifecycle. Neither is a special case.
8. **Loud breakage over silent shims.** The legacy `register(store)` pattern is removed atomically when the plugin runtime lands. No compatibility shim, no deprecation window. In-tree consumers are updated in the same PR; CI is the merge gate. (This supersedes the v1.0.0 "one-release shim" plan — see §20 and SPEC-CORE §9.6 for the operator decision driving this.)

---

## 4. Capability Catalogue

A capability is an interface a plugin MAY implement. The host MUST support exactly the capabilities listed below in v1.1. New capabilities MUST be added by minor-version SPEC bump.

### 4.1 Server capabilities

| Capability ID                | Contributes                                                              | Cardinality per plugin |
| ---------------------------- | ------------------------------------------------------------------------ | ---------------------- |
| `cap:profile`                | A `DomainProfile` (primitives, relations, scopes, categories, rules). Profiles MAY mark primitive types as Section partition units via `PrimitiveTypeDef.is_partition_unit` (Core SPEC §5.4.3) so workbooks on this profile can be split (`POST /workbooks/{id}:split`). | 0..N                   |
| `cap:validator`              | A custom `ValidationRuleDef` implementation.                             | 0..N                   |
| `cap:renderer`               | A server-side renderer (e.g. PDF, Markdown, HTML, DOCX) for a target.   | 0..N                   |
| `cap:route`                  | A namespaced `APIRouter` mounted under `/plugins/{plugin.id}/...`.       | 0..1                   |
| `cap:transformer`            | A primitive→primitive transform whose output is an **edit-operation list** consumed by Core SPEC §9.7.5 (batch edits). Each emitted operation becomes an immutable record in the per-workbook operation log (Core SPEC §5.5) — the transformer's invocation, its emitted operation list, and the resulting log entries are causally chained via `request_id` and `plugin_id` so the operator can audit "what did plugin X do to this workbook, when, in response to what call." The transformer never mutates the store directly; Core re-runs §7 on every emitted operation before append. | 0..N                   |
| `cap:importer`               | A `ProjectTransfer` ingest format (e.g. JSON, YAML, Markdown variants). | 0..N                   |
| `cap:exporter`               | A `ProjectTransfer` egress format.                                       | 0..N                   |
| `cap:lifecycle-hook`         | One or more lifecycle callbacks: `on_install`, `on_enable`, `on_disable`, `on_uninstall`. See §4.4. | 0..4 (one per event)   |

### 4.2 Frontend capabilities

| Capability ID                | Contributes                                                              | Cardinality per plugin |
| ---------------------------- | ------------------------------------------------------------------------ | ---------------------- |
| `cap:ui:primitive-form`      | Custom React form for a specific `primitive_type_id`. The form MUST submit through one of the four edit surfaces in Core SPEC §9.7.2 (whole-record, field-level, batch, structural); plugin authors do not invent new edit endpoints. | 0..N                   |
| `cap:ui:primitive-card`      | Custom card/listing component for a `primitive_type_id`.                 | 0..N                   |
| `cap:ui:explorer-panel`      | A panel mounted in the Explorer side rail or document outline.           | 0..N                   |
| `cap:ui:renderer-preview`    | A preview component for a server renderer's output.                      | 0..N                   |
| `cap:ui:menu-action`         | A command added to workbook, primitive, or global menus.                  | 0..N                   |
| `cap:ui:route`               | A top-level page mounted at `/p/{plugin.id}/...`.                        | 0..N                   |
| `cap:ui:theme`               | A CSS layer (light/dark/print) the user can opt into.                    | 0..1                   |
| `cap:ui:i18n`                | A locale bundle scoped to the plugin's UI.                               | 0..N per locale        |

### 4.3 Capability identity rule

Each capability instance MUST declare a stable `capability_instance_id` of the form:

```
{plugin.id}:{capability_id}:{local_name}
```

Example: `acme.legal-spec:cap:profile:contract-law`.

Conflicts (same `capability_instance_id` from two plugins) are a hard manifest error and abort installation. Within a single plugin, the `(capability_id, local_name)` pair MUST be unique; the manifest's JSON Schema enforces this via §5.1's `uniqueItems` constraint on the capabilities array (keyed on the pair).

### 4.4 Lifecycle hooks (cap:lifecycle-hook)

A plugin MAY register up to one callback per lifecycle event. The four events and their firing rules are:

| Event             | Fires on transition                                                              | Receives                                  |
| ----------------- | -------------------------------------------------------------------------------- | ----------------------------------------- |
| `on_install`      | First time the plugin is `discovered → registered` after host install/restart.   | `PluginContext` (read-only; no `register_*` allowed inside this hook — installation is bookkeeping only). |
| `on_enable`       | `registered → active` and `disabled → active`.                                   | `PluginContext` with `register_*` allowed. This is where contributions land. |
| `on_disable`      | `active → disabled` and `active → quarantined` (orderly shutdown path only).     | `PluginContext` (read-only; the host has already torn down `register_*` contributions). |
| `on_uninstall`    | Plugin removed from disk / entry points before the next discovery pass.          | `PluginContext` (read-only; persistence cleanup hook). |

In the manifest, four hooks are declared as four separate capability entries, one per event:

```json
{ "capability_id": "cap:lifecycle-hook", "local_name": "on-install",   "entry": "acme_legal.lifecycle:on_install" }
```

The `local_name` MUST match the event name in kebab-case (`on-install`, `on-enable`, `on-disable`, `on-uninstall`); the host uses this to dispatch. A `cap:lifecycle-hook` entry whose `local_name` is not one of these four values is rejected by the gate.

If a hook raises, the host treats it as a capability error per §6.4 (the plugin moves to `quarantined`). `on_install` and `on_enable` failures are install-time / activate-time rejections; `on_disable` and `on_uninstall` failures are logged but do not block the transition (the plugin is already leaving the active set).

---

## 5. Manifest Schema

Every plugin (server or frontend) ships a single `fdpm-plugin.json` at the package root. The schema below is normative.

### 5.1 Schema (JSON Schema, v1.0.0)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://fdpm.dev/schemas/plugin-manifest/1.0.0.json",
  "title": "FDPMPluginManifest",
  "type": "object",
  "required": ["id", "version", "spec_version", "kind", "capabilities", "host_compatibility"],
  "additionalProperties": false,
  "properties": {
    "id":            { "type": "string", "pattern": "^[a-z0-9]+(\\.[a-z0-9-]+)+$" },
    "version":       { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+(-[A-Za-z0-9.-]+)?$" },
    "spec_version":  { "type": "string", "pattern": "^1\\.\\d+\\.\\d+$",
                       "description": "Major-pinned to the SPEC's major version. The host's supported-set check is performed in code, not by JSON Schema, so a v1.x host can load a v1.y plugin where y ≤ x." },
    "kind":          { "enum": ["server", "frontend", "fullstack"] },
    "name":          { "type": "string", "maxLength": 80 },
    "description":   { "type": "string", "maxLength": 500 },
    "authors":       { "type": "array", "items": { "type": "string" }, "minItems": 1 },
    "license":       { "type": "string" },
    "homepage":      { "type": "string", "format": "uri" },
    "host_compatibility": {
      "type": "object",
      "required": ["fdpm"],
      "properties": {
        "fdpm":     { "type": "string", "description": "PEP 440 / SemVer range, e.g. '>=3.1,<4'" },
        "frontend": { "type": "string", "description": "Same form as fdpm" }
      }
    },
    "capabilities": {
      "type": "array",
      "minItems": 1,
      "items": { "$ref": "#/$defs/Capability" },
      "uniqueItems": false,
      "description": "Within-plugin uniqueness on (capability_id, local_name) is enforced by the host's manifest validator; expressing it in pure JSON Schema would require draft-2020-12 unevaluatedProperties tricks that confuse generators."
    },
    "permissions": {
      "type": "array",
      "items": { "enum": [
        "read:workbooks", "write:workbooks",
        "read:primitives", "write:primitives",
        "read:relations", "write:relations",
        "read:audit",
        "render:server", "render:client",
        "import:workbook", "export:workbook",
        "menu:contribute",
        "network:outbound", "filesystem:read", "filesystem:write"
      ]}
    },
    "trust": {
      "type": "object",
      "properties": {
        "signed_by":       { "type": "string" },
        "signature":       { "type": "string", "format": "byte" },
        "supply_chain_sbom": { "type": "string" }
      }
    },
    "dependencies": {
      "type": "object",
      "properties": {
        "plugins": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["id", "version"],
            "properties": {
              "id":      { "type": "string" },
              "version": { "type": "string" }
            }
          }
        }
      }
    }
  },
  "$defs": {
    "Capability": {
      "type": "object",
      "required": ["capability_id", "local_name"],
      "properties": {
        "capability_id": { "enum": [
          "cap:profile", "cap:validator", "cap:renderer", "cap:route",
          "cap:transformer", "cap:importer", "cap:exporter", "cap:lifecycle-hook",
          "cap:ui:primitive-form", "cap:ui:primitive-card", "cap:ui:explorer-panel",
          "cap:ui:renderer-preview", "cap:ui:menu-action", "cap:ui:route",
          "cap:ui:theme", "cap:ui:i18n"
        ]},
        "local_name":   { "type": "string", "pattern": "^[a-z0-9-]+$" },
        "entry":        { "type": "string", "description": "Python entry-point name OR JS module path" },
        "config_schema":{ "type": "object", "description": "JSON Schema for capability-level config" },
        "metadata":     { "type": "object" }
      }
    }
  }
}
```

**Why `spec_version` is a `pattern`, not a `const`.** A v1.0.0 manifest must be loadable by a v1.1 host (additive minor bumps preserve compatibility). A `const "1.0.0"` would have made every minor bump a breaking change for plugin authors. The host's actual supported-set check happens in code at discovery time and may be stricter than the schema (e.g. a v1.1 host MAY refuse v1.2-targeted plugins it can't meet). The schema enforces only the major-version invariant.

### 5.2 Permissions table

Every permission gates exactly one class of operation. A plugin requesting a permission it does not need is a manifest review concern; a plugin attempting an operation without the required permission raises `PermissionError` at runtime.

| Permission           | Gates                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------- |
| `read:workbooks`      | `PluginContext.list_projects`, `get_project`; reading workbook metadata via the Core API.                |
| `write:workbooks`     | Workbook creation/update/delete via plugin code path; required by `cap:importer`.                        |
| `read:primitives`    | `PluginContext.list_primitives`, `get_primitive`; reading primitives in plugin code.                    |
| `write:primitives`   | Mutating primitives via plugin code path; required by `cap:transformer` whose target type creates/changes primitives. |
| `read:relations`     | Symmetric to `read:primitives` for relations.                                                           |
| `write:relations`    | Symmetric to `write:primitives` for relations.                                                          |
| `read:audit`         | Read access to the operation log (Core SPEC §5.5 / §9.8.1, unified with §13.3 audit records). With this permission the plugin can call `GET /workbooks/{id}/log` for any workbook, with full filter support; without it, log access is denied even for the plugin's own emitted operations. (v1.0 framed this as "own actions only"; v1.1's unified log makes per-actor filtering a query parameter, so the permission is now binary: holders see all, non-holders see none.) |
| `render:server`      | Required by `cap:renderer`. Validators (`cap:validator`) and exporters (`cap:exporter`) do **not** require this — see §5.3. |
| `render:client`      | Required by `cap:ui:renderer-preview`.                                                                  |
| `import:workbook`     | Required by `cap:importer`; implies `write:workbooks` + `write:primitives` + `write:relations` for the duration of the import. |
| `export:workbook`     | Required by `cap:exporter`; implies `read:workbooks` + `read:primitives` + `read:relations`.             |
| `menu:contribute`    | Required by `cap:ui:menu-action` to contribute commands to Core menus.                                  |
| `network:outbound`   | Plugin code makes HTTP calls to external hosts. Logged per request; no sandbox enforcement in v1.0.    |
| `filesystem:read`    | Plugin reads files outside its package root.                                                            |
| `filesystem:write`   | Plugin writes files outside its package root.                                                           |

### 5.3 Capabilities that require no permission

Some capabilities are unprivileged because they cannot mutate state or escape the plugin's own namespace:

- **`cap:validator`** — additive only. A validator emits findings; it cannot mutate state. A validator that raises is contained by the Core SPEC §7.1 step-6 exception barrier.
- **`cap:profile`** — registers a `DomainProfile`. The act of contributing a profile is structural; it does not by itself read or mutate workbook content.
- **`cap:lifecycle-hook`** — runs in the host's plugin lifecycle context; what the hook *does* may require permissions, which the hook claims through normal `PluginContext` calls.
- **`cap:ui:*`** (form, card, panel, route, theme, i18n) — all run in the SPA's own context with its own permissions; the scoped API client (§7.5) is the runtime gate.

### 5.4 Manifest example (full-stack plugin)

```json
{
  "id": "acme.legal-spec",
  "version": "0.4.2",
  "spec_version": "1.0.0",
  "kind": "fullstack",
  "name": "Legal Specification",
  "description": "Contract-law primitives, citation validators, and brief renderers.",
  "authors": ["Acme Legal Engineering <eng@acme.example>"],
  "license": "Apache-2.0",
  "host_compatibility": { "fdpm": ">=3.1,<4", "frontend": ">=2.0,<3" },
  "permissions": ["read:workbooks", "write:primitives", "render:server", "menu:contribute"],
  "capabilities": [
    { "capability_id": "cap:profile",          "local_name": "contract-law", "entry": "acme_legal.profile:PROFILE" },
    { "capability_id": "cap:validator",        "local_name": "citation",     "entry": "acme_legal.validators:citation_validator" },
    { "capability_id": "cap:renderer",         "local_name": "brief-pdf",    "entry": "acme_legal.render:render_brief_pdf" },
    { "capability_id": "cap:route",            "local_name": "api",          "entry": "acme_legal.api:router" },
    { "capability_id": "cap:lifecycle-hook",   "local_name": "on-enable",    "entry": "acme_legal.lifecycle:on_enable" },
    { "capability_id": "cap:ui:primitive-form","local_name": "clause-form",  "entry": "./dist/forms/Clause.js",
      "metadata": { "primitive_type_id": "law:Clause" } },
    { "capability_id": "cap:ui:explorer-panel","local_name": "citation-graph","entry": "./dist/panels/CitationGraph.js" }
  ]
}
```

---

## 6. Server-side architecture

### 6.1 New package layout

```
src/fdpm/
├── plugin/                       # NEW — host-side plugin runtime
│   ├── __init__.py
│   ├── registry.py               # PluginRegistry, PluginRecord
│   ├── manifest.py               # Manifest model + JSON Schema validation
│   ├── discovery.py              # Entry-point discovery + filesystem fallback
│   ├── lifecycle.py              # install/enable/disable/uninstall + quarantine
│   ├── context.py                # PluginContext — scoped registration API
│   ├── capabilities/             # one module per capability_id
│   │   ├── profile.py
│   │   ├── validator.py
│   │   ├── renderer.py
│   │   ├── route.py
│   │   ├── transformer.py
│   │   ├── importer.py
│   │   ├── exporter.py
│   │   └── lifecycle_hook.py
│   ├── verification.py           # PALS's-LAW verification gate
│   └── errors.py                 # PluginError taxonomy
├── api/
│   ├── plugins.py                # NEW — /plugins admin API
│   └── ...                       # existing routers unchanged
├── plugins/                      # REORGANISED — built-in plugins (one dir each)
│   ├── formal_specification/     # was monolithic .py, now decomposed
│   │   ├── __init__.py
│   │   ├── fdpm-plugin.json
│   │   ├── _common.py
│   │   ├── categories.py
│   │   ├── scopes.py
│   │   └── primitives/
│   │       ├── structure.py
│   │       ├── type_system.py
│   │       ├── semantics.py
│   │       ├── process.py
│   │       ├── assurance.py
│   │       ├── mathematics.py
│   │       ├── architecture.py
│   │       ├── empirical.py
│   │       └── bibliography.py
│   ├── narrative/                # same shape
│   └── software_architecture/    # same shape
└── ...
```

The current monolithic `src/fdpm/plugins/formal_specification.py` MUST be decomposed during this work; no SPEC item is complete while a 3k-line literal remains.

### 6.2 PluginContext (replaces direct `store` mutation)

`PluginContext` is the only object a plugin's registration code receives. It exposes a typed, narrow API. Plugins MUST NOT import or mutate `fdpm.store.store` directly.

```python
class PluginContext(Protocol):
    plugin_id: str
    plugin_version: str
    logger: logging.Logger
    config: Mapping[str, Any]            # validated against capability.config_schema
    permissions: frozenset[str]          # from manifest
    api: CoreReadClient                  # see §6.2.1

    def register_profile(self, profile: DomainProfile) -> None: ...
    def register_validator(self, name: str, fn: ValidatorFn) -> None: ...
    def register_renderer(self, target: RendererTarget, fn: RendererFn) -> None: ...
    def register_router(self, router: APIRouter) -> None:
        """Mounts under /plugins/{plugin_id}/. Router prefix MUST be empty."""
    def register_transformer(self, src: str, dst: str, fn: TransformerFn) -> None: ...
    def register_importer(self, fmt: str, fn: ImporterFn) -> None: ...
    def register_exporter(self, fmt: str, fn: ExporterFn) -> None: ...

    # Read-only views — plugins observe but do not mutate global state
    def list_profiles(self) -> Sequence[DomainProfile]: ...
    def get_profile(self, profile_id: str) -> DomainProfile | None: ...
    def list_projects(self) -> Sequence[Workbook]: ...     # requires read:workbooks
    def get_project(self, workbook_id: str) -> Workbook | None: ...
    def list_primitives(self, workbook_id: str) -> Sequence[PrimitiveInstance]: ...
    def get_primitive(self, workbook_id: str, primitive_id: str) -> PrimitiveInstance | None: ...

    # No PluginContext.audit(...) write path in v1.1.
    # Audit emission is automatic: every plugin-originated write produces
    # an Operation in the log (Core SPEC §5.5) tagged with this plugin's id.
    # Read access to the log is permission-gated by `read:audit`.
```

The host MUST inject `PluginContext` at lifecycle events. Each call is recorded on `PluginRecord.contributions` so a plugin's contributions can be torn down on disable/uninstall without leaks. Read methods that touch workbook content require the corresponding `read:*` permission and raise `PermissionError` otherwise.

> **Migration note (1.0 → 1.1).** The `PluginContext.audit(...)` write
> method introduced in pluggable 1.0.1 is **removed in 1.1.0**.
> Plugins do not need a separate audit-write call: every operation
> they emit via `cap:transformer` (or any other write path) is
> already an audit record in the unified log (Core SPEC §13.3).
> Plugins that called `audit(...)` to emit *bookkeeping* records
> not tied to a state change — there were no known users in v1.0 —
> should now emit an explicit operation, or accept that the
> bookkeeping is not in the log.

#### 6.2.1 `CoreClient`

For Python plugins that need to call Core platform endpoints (Core SPEC §9.1) rather than reading the store directly, `PluginContext.api` is a typed in-process client wrapping the same handlers. Calls go through the same auth / verification / audit chain as external requests. The client exposes:

- **Read endpoints** matching the plugin's `read:*` permissions (Core SPEC §9.1 GET routes for workbooks, primitives, relations, profiles, views).
- **Edit endpoints** (Core SPEC §9.7) matching the plugin's `write:*` permissions:
  - `write:primitives` → `POST /workbooks/{pid}/primitives`, `PUT`/`PATCH /workbooks/{pid}/primitives/{id}`, `PATCH .../primitives/{id}:field-patch`, `DELETE /workbooks/{pid}/primitives/{id}`.
  - `write:relations` → analogous endpoints under `/relations/...`.
  - `write:workbooks` → `POST /workbooks/{pid}/structure:reorder`, `POST /workbooks/{pid}/structure:reparent`, `POST /workbooks/{id}:split`, `POST /workbooks/{id}:clone`.
  - `POST /workbooks/{pid}/edits` (batch transactions) — the endpoint itself requires authentication only; **each operation in the batch is checked under its per-resource permission** per Core SPEC §9.7.5. A plugin holding only `write:workbooks` cannot use the batch endpoint to mutate primitives; it must additionally hold `write:primitives` (and/or `write:relations`) for the operation kinds it submits.

Calling an endpoint without the matching permission raises `PermissionError`. The client refuses paths outside `/workbooks/...`, `/profiles/...`, `/plugins/{self.id}/...` — i.e. it cannot reach another plugin's namespace, the `/plugins/{other}/...` admin surface, or `/_*` reserved sub-namespaces.

This is the **only** path by which a plugin may write to workbook state. Direct `store` mutation remains forbidden (§6.2). A `cap:transformer` whose output is a list of §9.7.5 batch operations submits them through this client; the host re-runs the §7 validation pipeline against each operation just as it does for external requests.

### 6.3 Discovery

Two discovery sources, evaluated in this order:

1. **Python entry points.** Group: `fdpm.plugins`. The entry point's value MUST resolve to a Python object exposing a function `def get_manifest() -> dict` (the parsed `fdpm-plugin.json`) and a function `def activate(ctx: PluginContext) -> None`.
2. **Filesystem fallback.** Directories under `$FDPM_PLUGIN_PATH` (colon-separated, default `~/.fdpm/plugins`) containing `fdpm-plugin.json`. Used for built-ins shipped in-tree and for user-installed plugins without a wheel.

`pyproject.toml` MUST add:

```toml
[workbook.entry-points."fdpm.plugins"]
formal-specification  = "fdpm.plugins.formal_specification:plugin"
narrative             = "fdpm.plugins.narrative:plugin"
software-architecture = "fdpm.plugins.software_architecture:plugin"
```

### 6.4 Lifecycle state machine

```
                      ┌──── enable ────┐
                      │                ▼
   discovered ──validate──► registered ──enable──► active
       │                       │                      │
       │                       │  trust=community     ├── disable ──► disabled
       │                       │  or unknown          │                  │
       │                       └─────────────────────►│                  │
       │                                              │                  │
       └──► rejected                                  │                  │
                                                      │  capability      │
                                                      │  error           │
                                                      ▼                  │
                                                quarantined ◄────────────┤
                                                      │                  │
                                                      │ quarantine-clear │
                                                      └─────────────────►┘
```

| State           | Meaning                                                           | Transitions out                                       |
| --------------- | ----------------------------------------------------------------- | ----------------------------------------------------- |
| `discovered`    | Found by discovery, manifest not yet validated.                   | → `registered`, → `rejected`                          |
| `rejected`      | Manifest invalid, host-incompatible, or duplicate id.             | terminal until next discovery pass                    |
| `registered`    | Manifest valid, capabilities indexed, no contributions yet.       | → `active` (operator enable, or auto for trust=core/verified), → `disabled` (auto for trust=community/unknown), → `rejected` (re-validation failure on reload) |
| `active`        | `activate()` succeeded, contributions live.                       | → `disabled` (operator), → `quarantined` (capability error) |
| `disabled`      | Manually disabled, auto-disabled (community/unknown default), or returned from quarantine. Contributions removed. | → `active` (operator enable)            |
| `quarantined`   | Capability raised an unhandled error during use.                  | → `disabled` (`quarantine-clear`)                     |

Quarantine is the failure-isolation boundary required by Principle 4. The host MUST install an exception barrier around every plugin-supplied callable; the **first** unhandled exception in a capability moves the *whole plugin* to `quarantined` and removes its contributions. The barrier does not catch verification errors raised by the host itself — those are normal request errors. A `quarantine-clear` operator action transitions the plugin to `disabled`; re-enabling requires a normal `disabled → active` operator action.

The auto-`disabled` edge from `registered` exists for `community` and `unknown` trust tiers (§10.1): valid plugins of those tiers do not auto-activate.

### 6.5 Verification gate (PALS's LAW)

Every artefact a plugin contributes MUST pass through the host's verification gate before the host accepts it. Verification is non-negotiable.

| Artefact              | Verification rule                                                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Manifest              | Validates against §5.1 JSON Schema; `(capability_id, local_name)` uniqueness within the plugin enforced in code.                  |
| `DomainProfile`       | Pydantic model construction succeeds; ID format rules check; no ID collision with other profiles; no Core-reserved namespace use (Core SPEC §11.3). |
| Validator function    | Conforms to the `ValidatorFn` `Protocol` at registration time. The "never raises" property is enforced at runtime by the Core SPEC §7.1 step-6 exception barrier — **not** asserted at registration, because no static check can prove a callable never raises. Repeated raises trigger quarantine per Core SPEC's `FDPM_VALIDATOR_QUARANTINE_THRESHOLD`. |
| Renderer output       | MIME type matches declared target; size below `FDPM_MAX_RENDER_BYTES` (default 50 MiB); UTF-8 if textual.                         |
| Router                | Prefix is empty (host imposes its own); no overlap with reserved sub-namespaces (Core SPEC §9.3) or Core platform paths (Core SPEC §9.1, §9.4). |
| Transformer output    | Result satisfies destination primitive type's schema (re-runs the Core validation pipeline).                                      |
| Importer/exporter     | Round-trip property test on a synthetic workbook (host-generated fixture) MUST pass at install time.                               |

A failure in the gate yields a `PluginError` with category `verification` and moves the plugin to `rejected` (install time) or `quarantined` (runtime).

### 6.6 Admin API surface

A new router `src/fdpm/api/plugins.py` exposes:

| Method | Path                                                 | Purpose                                                  |
| ------ | ---------------------------------------------------- | -------------------------------------------------------- |
| GET    | `/plugins`                                           | List plugins with state, manifest summary, capabilities. |
| GET    | `/plugins/{id}`                                      | Full record.                                             |
| GET    | `/plugins/{id}/manifest`                             | Raw manifest.                                            |
| POST   | `/plugins/{id}:enable`                               | Transition to `active`.                                  |
| POST   | `/plugins/{id}:disable`                              | Transition to `disabled`.                                |
| POST   | `/plugins/{id}:reload`                               | Re-discover + revalidate.                                |
| POST   | `/plugins/{id}:quarantine-clear`                     | Force `quarantined` → `disabled` (audit-logged).         |
| GET    | `/plugins/{id}/capabilities`                         | All capability instances.                                |
| ANY    | `/plugins/{plugin_id}/<plugin-defined-path>`         | Plugin-contributed `cap:route` mount. Subject to Core SPEC §9.3 reserved sub-namespaces (`/_admin/*`, `/_telemetry/*`, `/static/*`) and §9.4 forbidden patterns. |

Permissions: all `:enable`, `:disable`, `:reload`, `:quarantine-clear` require an admin scope (deferred to the existing auth model — see §17 open question 1).

### 6.7 Configuration precedence

1. Environment variables (`FDPM_PLUGIN_*`) — operator override.
2. Per-plugin `config.json` in `$FDPM_PLUGIN_CONFIG_DIR`.
3. Manifest defaults.

Resolution happens at lifecycle transition `registered → active` and is frozen for the duration of `active`.

### 6.8 Startup gate budget

Verification is parallelised across plugins. Per-plugin budget is `FDPM_PLUGIN_GATE_BUDGET_MS` (default 200 ms). A plugin exceeding the budget is logged but not rejected — the budget is alertable, not a hard gate. The Core SPEC's `/readyz` endpoint waits for plugin discovery and verification to complete with a global cap of `FDPM_PLUGIN_GATE_BUDGET_TOTAL_MS` (default 30 s); past that, `/readyz` returns ready and any still-verifying plugins are reported with state `discovered` and surfaced via the admin API.

---

## 7. Frontend architecture

### 7.1 New module layout

```
frontend/src/
├── plugin/                       # NEW — host-side plugin runtime
│   ├── registry.ts               # FrontendPluginRegistry
│   ├── manifest.ts               # Manifest type + zod schema
│   ├── loader.ts                 # dynamic import + integrity check
│   ├── context.ts                # PluginContext (frontend)
│   ├── capabilities/
│   │   ├── primitive-form.ts
│   │   ├── primitive-card.ts
│   │   ├── explorer-panel.ts
│   │   ├── renderer-preview.ts
│   │   ├── menu-action.ts
│   │   ├── route.ts
│   │   ├── theme.ts
│   │   └── i18n.ts
│   ├── slots/                    # React components that consume contributions
│   │   ├── PrimitiveFormSlot.tsx
│   │   ├── ExplorerPanelSlot.tsx
│   │   └── ...
│   └── verification.ts
├── components/
│   └── ...                       # existing — refactored to use slots
└── ...
```

### 7.2 Frontend `PluginContext`

```ts
export interface PluginContext {
  pluginId: string;
  pluginVersion: string;
  config: Readonly<Record<string, unknown>>;
  api: ScopedApiClient;            // see §7.5 — covers plugin namespace + read-side Core endpoints
  registerPrimitiveForm(args: { primitiveTypeId: string; component: React.ComponentType<PrimitiveFormProps> }): void;
  registerPrimitiveCard(args: { primitiveTypeId: string; component: React.ComponentType<PrimitiveCardProps> }): void;
  registerExplorerPanel(args: { id: string; title: string; component: React.ComponentType }): void;
  registerRendererPreview(args: { rendererTarget: string; component: React.ComponentType<PreviewProps> }): void;
  registerMenuAction(args: MenuActionSpec): void;
  registerRoute(args: { path: `/p/${string}/${string}`; component: React.ComponentType }): void;
  registerTheme(args: { id: string; cssHref: string; mode: "light" | "dark" | "print" }): void;
  registerLocale(args: { locale: string; messages: Record<string, string> }): void;
}
```

A frontend plugin's entry module MUST default-export:

```ts
export default {
  manifest: PluginManifest;
  activate(ctx: PluginContext): void | Promise<void>;
  deactivate?(ctx: PluginContext): void | Promise<void>;
};
```

### 7.3 Loader

The loader uses `import()` with the plugin's `entry` URL fetched from `GET /plugins/{id}/static/{entry}` (served by the host). The host MUST set `Content-Type: text/javascript` and `X-FDPM-Plugin-Id`. The loader MUST verify:

- Manifest plugin id matches header.
- Default export shape (zod schema).
- Subresource integrity hash (`integrity` field added to manifest in v1.1).

A failed verification removes the plugin from the frontend registry; the React tree continues to render with the slot showing a non-fatal `PluginUnavailable` banner.

### 7.4 Slot pattern and conflict resolution

Existing UI components are refactored to consume contributions via slots. Example: the primitive form switcher.

```tsx
// frontend/src/plugin/slots/PrimitiveFormSlot.tsx
export function PrimitiveFormSlot({ primitiveTypeId, ...props }: PrimitiveFormSlotProps) {
  const Plugin = useFrontendPlugin(s => s.byCapability("cap:ui:primitive-form", primitiveTypeId));
  if (Plugin) return <Plugin {...props} />;
  return <DefaultPrimitiveForm primitiveTypeId={primitiveTypeId} {...props} />;
}
```

The default form is the existing generic form; plugin-contributed forms override it for matching `primitive_type_id`.

**Slot keys are exact match only.** A plugin MUST declare a concrete `primitive_type_id` (or other slot key); pattern matching, prefix matching, and wildcards are out of scope for v1.0. **Two plugins MUST NOT register the same `(capability_id, slot_key)` pair**; conflicts are surfaced to the admin API and the second registration is rejected. The "first registration wins" rule is deterministic and follows the registry's plugin-load order, which itself follows manifest dependency-topological sort.

### 7.5 API client scoping

`frontend/src/lib/api.ts` is split:

- `lib/api/core.ts` — host-owned endpoints used directly by the shell.
- `lib/api/plugin-client.ts` — `createPluginApiClient(pluginId, permissions)` returns a `ScopedApiClient` with five allow-lists:
  - **Plugin namespace.** All paths under `/plugins/{pluginId}/...` are allowed.
  - **Core read-side endpoints.** The Core SPEC §9.1 read endpoints whose required permission is in the plugin's manifest `permissions` (e.g. `GET /workbooks`, `GET /workbooks/{id}/primitives` if `read:workbooks` and `read:primitives` are held) are allowed.
  - **Core edit endpoints (Core SPEC §9.7).** The four edit surfaces — whole-record (`PUT`/`PATCH .../primitives/{id}`, `.../relations/{id}`), field-level (`:field-patch`), batch (`POST /workbooks/{pid}/edits`), and structural (`/workbooks/{pid}/structure:reorder`, `:reparent`) — are allowed when the matching `write:*` permission is held. The client automatically forwards `If-Match` / `expected_revision` headers when the caller supplies them, and surfaces `412 precondition_failed` to the calling component as a typed `RevisionMismatch` error so plugin forms can prompt the user to refresh. Each successful call corresponds to one `Operation` appended to the log (Core SPEC §5.5).
  - **Core graph operations (Core SPEC §5.4).** `POST /workbooks/{id}:split` and `POST /workbooks/{id}:clone` are allowed when `write:workbooks` is held. Both are destructive at the workbook level — split deletes the source, clone creates a new workbook — so they are gated by the same permission as `DELETE /workbooks/{id}` and `POST /workbooks`. Plugin UI that exposes these as user actions SHOULD show a confirmation dialog given the irreversibility (Core does not block on user confirmation; that is a UX concern).
  - **Core event-sourced endpoints (Core SPEC §9.8).** `GET /workbooks/{id}/log` and `GET /workbooks/{id}/at` are allowed when `read:audit` and `read:workbooks` are held respectively. `POST /workbooks/{id}:undo` is allowed when the matching `write:*` permission for the target operation's kind is held — practically, plugin UI that exposes "undo" SHOULD use the same permission check as the original action's submitter form. The operator-only `:rebuild-from-log` endpoint is **never** allowed for plugin clients regardless of permission set.

  Calls outside all five lists fail client-side with a typed error and are also rejected server-side (defence in depth).

A `cap:ui:primitive-form` plugin uses this client to submit edits; it does **not** open a parallel write path. The Core SPEC §9.7.8 round-trip — every meta-model field type editable through default forms — applies equally to plugin-supplied forms because they call the same endpoints.

This enforces Principle 3 at the network layer while letting plugin UI compose against Core data without going through their own backend.

### 7.6 Progressive disclosure

The frontend MUST render a useful UI even when no plugin loads (host-only mode, see Core SPEC §10.2). Plugin failure is observability (a banner + admin API entry), not a UX dead-end.

### 7.7 First-paint and bundle budgets

Frontend plugins are loaded asynchronously after the shell paints. Per the Core SPEC §10.4:

- A plugin whose `activate(ctx)` does not resolve within `FDPM_FE_PLUGIN_BUDGET_MS` (default 2000 ms) does not block the shell — the slot resolves to its default and the plugin is reported as `slow-activate` in the admin API.
- Per-plugin compressed-bundle size SHOULD stay under `FDPM_FE_PLUGIN_MAX_BYTES` (default 2 MiB); the loader emits a warning above this and refuses to load above 4× this value.

Total budget across N plugins is N × `FDPM_FE_PLUGIN_BUDGET_MS`, parallelised; a runaway plugin cannot starve siblings.

---

## 8. End-to-end data flow

### 8.1 Server boot

```
process start
  ├─ FastAPI lifespan begin
  ├─ PluginRegistry.discover()
  │    ├─ entry_points(group="fdpm.plugins")  →  candidates
  │    └─ scan $FDPM_PLUGIN_PATH               →  candidates
  ├─ for each candidate (parallel up to FDPM_PLUGIN_GATE_BUDGET_TOTAL_MS):
  │    ├─ load manifest
  │    ├─ verify manifest (gate; per-plugin budget FDPM_PLUGIN_GATE_BUDGET_MS)
  │    ├─ resolve dependencies (topological sort)
  │    └─ index capabilities → PluginRecord
  ├─ for each registered plugin (in dependency order):
  │    ├─ if trust=community/unknown → state = disabled, skip activate
  │    ├─ instantiate PluginContext
  │    ├─ call cap:lifecycle-hook on_install if first-time and trust=core/verified
  │    ├─ call activate(ctx) inside exception barrier
  │    │    └─ inside activate: invoke cap:lifecycle-hook on_enable if registered
  │    ├─ verify each contribution as it is registered
  │    └─ on first error → quarantine + tear-down
  ├─ mount cap:route routers under /plugins/{id}/
  ├─ mount /plugins admin router
  └─ FastAPI ready (/readyz returns 200)
```

### 8.2 Frontend boot

```
SPA mount
  ├─ render shell (host-only paint)            ◄── never blocked by plugins
  ├─ fetch GET /plugins  (state=active, kind in {frontend,fullstack})
  ├─ for each plugin (parallel, FDPM_FE_PLUGIN_BUDGET_MS each):
  │    ├─ for each cap:ui:* capability:
  │    │    ├─ dynamic import(/plugins/{id}/static/{entry})
  │    │    ├─ verify default-export shape (zod)
  │    │    └─ activate(ctx)  inside try/catch
  │    └─ on error or timeout → admin entry, default-slot fallback
  └─ slots resolve to plugin (when ready) or default
```

### 8.3 Failure path

A render error in a plugin component is caught by an `<ErrorBoundary>` per slot. The boundary:
1. Reports to `POST /plugins/{id}/_telemetry/render-error`.
2. Falls back to the default slot content.
3. Emits a single visible toast per session (not per error).

---

## 9. Built-in plugin migration

The three current built-ins MUST be migrated to the new shape **as part of this SPEC**, not deferred.

| Current file                                             | New layout                                                                  |
| -------------------------------------------------------- | --------------------------------------------------------------------------- |
| `src/fdpm/plugins/formal_specification.py` (3,251 LOC)   | `src/fdpm/plugins/formal_specification/` package (decomposed per §6.1)      |
| `src/fdpm/plugins/narrative.py` (1,111 LOC)              | `src/fdpm/plugins/narrative/` package                                       |
| `src/fdpm/plugins/software_architecture.py` (1,571 LOC)  | `src/fdpm/plugins/software_architecture/` package                           |

Each becomes a fullstack plugin in v1.1; in v1.0 they are server-only and the existing built-in frontend code remains in place, behind slots.

### 9.1 Decomposition rules for `formal_specification`

- One file per category of primitives (max ~400 LOC per file).
- Repeated `FieldValidation(rule="max_length", value=N)` patterns extracted into helpers in `_common.py` (e.g. `text(name, max_len, *, required=True, description)`).
- The aggregating `__init__.py` imports the lists and assembles the single `DomainProfile`.
- The plugin entry exposes `plugin = ServerPlugin(manifest=..., activate=...)`.

A file in this plugin MAY exceed 400 LOC only with a `# noqa: monolith` comment justifying why decomposition would harm clarity. The current 3,251-LOC literal does not qualify.

### 9.2 No legacy `register(store)` shim

The legacy `def register(store)` pattern is **removed atomically** when the plugin runtime lands. There is no compatibility shim, no deprecation window, no `_legacy.py`. Rationale (operator decision, aligned with SPEC-CORE §9.6 and CLAUDE.md Rule 8):

- Only three in-tree call sites exist (`main.py:45-50`); they are updated in the same PR that introduces the runtime.
- No third-party plugins exist at v1.0 that would consume a shim.
- A shim that lasts "one minor release" is permanent in practice; better to break loud than rot quiet.

PRs that introduce the runtime without simultaneously removing all `register(store)` call sites and converting the three built-ins fail the `core-store-001` test (Core SPEC §18) and are not mergeable.

### 9.3 Migration ordering

Aligned with Core SPEC §19.4:

1. Stand up `src/fdpm/plugin/` runtime behind feature flag `FDPM_PLUGGABLE_V1`.
2. Migrate `software_architecture` (smallest LOC) end-to-end as the canary.
3. Migrate `narrative` and `formal_specification`.
4. Migrate the three Core-violating routers (`narrative.py`, `spec_parser.py`, `export_pdf.py`) into the relevant plugins per Core SPEC §19.3 and §19.5 — same PR, no redirects.
5. Flip `FDPM_PLUGGABLE_V1` default to on; remove the flag and any temporary code in the next minor.

No migration step ships with the host in a half-migrated state visible to users (Principle 4 + CLAUDE.md Rule 8).

---

## 10. Security model

### 10.1 Trust tiers

| Tier        | Source                                                                              | Default state on `registered` |
| ----------- | ----------------------------------------------------------------------------------- | ----------------------------- |
| `core`      | Built-ins shipped with FDPM.                                                        | auto-`active`                 |
| `verified`  | Signature in manifest matches a key the operator added to `$FDPM_TRUSTED_KEYS`.     | auto-`active`                 |
| `community` | Discovered, valid manifest, no signature.                                           | `disabled` (operator must enable) |
| `unknown`   | Any other state.                                                                    | `disabled` (operator must enable) |

Tier transitions are explicit operator actions. No plugin auto-promotes. The lifecycle state machine §6.4 shows the auto-`disabled` edge from `registered` for community/unknown.

### 10.2 Permissions enforcement

The `permissions` array in the manifest is the upper bound. The host:

- For server plugins, wraps `PluginContext` so unpermitted operations raise `PermissionError`.
- For frontend plugins, the `ScopedApiClient` (§7.5) refuses out-of-scope paths client-side and the host re-checks server-side (defence in depth).

A plugin requesting a permission it does not need is a manifest review concern, not a runtime block. The host MUST log the highest privilege used per request and expose it in `/plugins/{id}` for audit.

### 10.3 Sandboxing

V1.0 does **not** sandbox Python plugins (Python lacks a portable trustworthy in-process sandbox); the trust tier is the primary control. V1.0 frontend plugins run in the SPA's JS context with no extra sandbox; CSP MUST forbid inline scripts and restrict `script-src` to the host origin so the host serves all plugin JS.

A future SPEC (`SPEC-PLUGIN-SANDBOX`) MAY add wasm-based isolation. Not in scope here.

### 10.4 Supply-chain hygiene

- Manifests MAY include `trust.supply_chain_sbom` — a path or URL to a CycloneDX SBOM.
- The admin API MUST surface plugin SBOMs verbatim. The host does not interpret them; the operator does.

---

## 11. Observability

The host MUST emit, for each plugin:

| Metric                                        | Type        |
| --------------------------------------------- | ----------- |
| `fdpm_plugin_state{id,version}`               | gauge       |
| `fdpm_plugin_activate_duration_seconds{id}`   | histogram   |
| `fdpm_plugin_capability_call_total{id,cap}`   | counter     |
| `fdpm_plugin_capability_error_total{id,cap}`  | counter     |
| `fdpm_plugin_quarantine_total{id,reason}`     | counter     |
| `fdpm_plugin_gate_duration_seconds{id}`       | histogram   |
| `fdpm_plugin_gate_budget_breach_total{id}`    | counter — increments when a plugin exceeds `FDPM_PLUGIN_GATE_BUDGET_MS` |
| `fdpm_render_bytes{id,cap}`                   | histogram   |

Frontend equivalents are reported via `POST /plugins/_telemetry/frontend` and translated to the same metric names (with `surface=frontend` label).

Logs include `plugin_id` and `capability_instance_id` on every record produced inside a plugin context.

---

## 12. Versioning

| Artefact                       | Versioning                                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| This SPEC                      | SemVer; major bump removes a capability or breaks a manifest field.                                                 |
| `spec_version` field           | Tracks SPEC SemVer with major-pinned `pattern: ^1\.\d+\.\d+$` (§5.1). The host's supported-set check is performed in code at discovery; mismatches → `rejected`. |
| Plugin `version`               | SemVer; advisory.                                                                                                   |
| Capability IDs                 | Stable strings. Adding a capability is a SPEC minor bump. Removing one is a major bump.                             |
| Host `host_compatibility.fdpm` | The plugin's supported FDPM range. Host MUST refuse plugins whose range excludes its version.                       |
| Document revision (e.g. 1.0.2) | Editorial only; does not affect `spec_version`. Revision history at §20.                                            |

---

## 13. Acceptance Criteria

The SPEC is **implemented** when all the following hold against `main`:

1. **Discovery.** Adding a Python wheel that declares `fdpm.plugins` entry points causes the plugin to appear in `GET /plugins` after host restart, **without editing core source.**
2. **Built-ins migrated.** The three built-in profiles are packages, not single files; each ships an `fdpm-plugin.json`; each loads via the discovery path. Direct imports in `main.py` for `register_*` are removed atomically (no shim, per §9.2).
3. **Decomposition.** No file under `src/fdpm/plugins/` exceeds 600 LOC except via `# noqa: monolith`. `formal_specification` is split per §6.1 / §9.1.
4. **Frontend slots.** The Explorer's primitive form rendering goes through `PrimitiveFormSlot`; loading a frontend plugin contributing `cap:ui:primitive-form` for a primitive type overrides the default form **without rebuilding the SPA.**
5. **Admin API.** `/plugins`, `/plugins/{id}`, `:enable`, `:disable`, `:reload`, `:quarantine-clear` exist and pass tests.
6. **Failure isolation.** A plugin whose `activate()` raises moves to `quarantined`; the host stays up; admin API reflects the state; subsequent requests to other plugins succeed.
7. **Verification gate.** Tests demonstrate manifest validation, profile validation, renderer output validation, and importer/exporter round-trip property tests, each with a passing and failing case.
8. **Permissions.** A plugin without `write:primitives` cannot register a transformer that mutates primitives; an attempt raises `PermissionError` and is observable in metrics. Each permission listed in §5.2 has at least one passing/failing test pair.
9. **No global mutation.** A grep for `from fdpm.store import store` inside `src/fdpm/plugins/**` returns zero matches. Plugins receive `PluginContext`. (Identical to Core SPEC `core-store-001`.)
10. **Conformance suite.** A reference `examples/plugins/echo-plugin/` ships, exercises every capability, has a passing manifest, and is the basis of the conformance pytest suite.
11. **Coverage.** `src/fdpm/plugin/**` ≥ 80 % line coverage; `frontend/src/plugin/**` ≥ 80 %.
12. **Docs.** `docs/plugin-author-guide.md` exists, derived from this SPEC, with at least one full-stack tutorial and the manifest reference.
13. **Manifest cross-version compatibility.** A v1.0.0 manifest loads on a v1.1.0 host (forward-compat test); a v1.2.0 manifest is rejected on a v1.0.0 host (the host's supported-set is the gate, not the JSON Schema).
14. **Lifecycle hooks.** Each of the four `cap:lifecycle-hook` events fires at the transition declared in §4.4; tests assert correct dispatch and quarantine behaviour on hook failure.
15. **Slot conflicts.** Two plugins registering the same `(capability_id, slot_key)` pair → second is rejected; admin API surfaces the conflict.
16. **Frontend scoped client.** A plugin with `read:workbooks` can call `GET /api/workbooks` from its UI; a plugin without it gets a typed client-side rejection AND a server-side 403; tests cover both legs.
17. **First-paint budget.** A synthetic frontend plugin that delays `activate()` past `FDPM_FE_PLUGIN_BUDGET_MS` does not block shell paint; the slot falls back; the admin API marks the plugin `slow-activate`.

Each criterion MUST be backed by a test in the corresponding test suite. A criterion without a test is not acceptable evidence.

---

## 14. Out of scope (explicitly deferred to operator authority)

The following are intentionally **not** in v1.1. They are listed so reviewers can confirm absence is deliberate, not omission. Authority to defer rests with the operator; an AI agent MUST NOT add these without explicit instruction.

- WASM/process sandboxing (`SPEC-PLUGIN-SANDBOX`).
- Hot reload of server plugins without process restart.
- Cross-plugin event bus / pub-sub.
- Plugin marketplace / signed registry service.
- Per-plugin database isolation (current store is in-memory; out of scope until persistence lands).
- Multi-tenant plugin permissions (current FDPM is single-tenant).
- Pattern/wildcard slot keys (§7.4 — exact-match only in v1.0).
- Subresource integrity (`integrity` field) on frontend bundles — added in v1.1 per §7.3.
- A `cap:shared-constants` capability addressing the Python↔TypeScript drift surface flagged in `drift-risk-map.md` findings #1, #5–#8. The plugin migration alone does not eliminate that surface; a future SPEC will.
- A `cap:workbook-event` capability letting plugins subscribe to operation-log events (any `Operation.kind` from Core SPEC §5.5.1) without polling. Core SPEC §5.4.4 / §5.5.8 documents the deferral. Plugins that need to react to operations in v1.1 must poll `GET /workbooks/{id}/log` under the `read:audit` permission. Polling is intentionally awkward; the awkwardness is the signal that `cap:workbook-event` belongs in a future SPEC.
- A `cap:projection` capability letting plugins build their own derived views over the operation log (e.g. a domain-specific search index, materialised relation aggregate, or alternative diff view). The natural "free feature" event sourcing unlocks; deferred to the same future SPEC as `cap:project-event`.
- Plugin contributions to the graph operations themselves (Core SPEC §5.4 split/clone). These are Core-implemented; plugins observe via the operation log, never implement alternate semantics.
- Plugin-defined operation kinds. The kind set (Core SPEC §5.5.1) is closed and Core-owned. Plugins emit operations of existing kinds via `cap:transformer`; they cannot register new ones. Adding a kind is a Core SPEC minor bump.
- Plugin-supplied upcasters (Core SPEC §5.5.6). Old `schema_version` payload definitions belong to the SPEC version that defined them; upcasting is Core-owned because the operation set is Core-closed.

---

## 15. Risks and trade-offs

| Risk                                                                                       | Mitigation                                                                                                |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Verification gate adds latency to startup.                                                 | Verification is parallelised across plugins; per-plugin budget `FDPM_PLUGIN_GATE_BUDGET_MS = 200 ms`; total cap `FDPM_PLUGIN_GATE_BUDGET_TOTAL_MS = 30 s`; both alertable. |
| Plugins contributing routes can shadow each other accidentally.                            | Host-imposed prefix `/plugins/{id}/` makes shadowing impossible across plugins.                           |
| Frontend plugins can break the SPA bundle with circular CSS or global side effects.        | CSP forbids inline scripts; theme CSS is loaded via `<link>` and scoped under `[data-fdpm-plugin]`; first-paint budget (§7.7). |
| Removing the `register(store)` pattern atomically breaks any external code depending on it. | Accepted by design (§9.2). No external consumers exist at v1.0; in-tree consumers updated in the same PR; CI is the gate. |
| Permissions enforcement in Python is best-effort, not adversarial-safe.                    | Documented in §10.3. Adversarial isolation deferred to `SPEC-PLUGIN-SANDBOX`.                             |
| Capability set may be incomplete for real plugin authors.                                  | Capability addition is a minor SPEC bump; v1.0 is the minimum, not the maximum.                           |
| Manifest `spec_version` semantic — early choice (`const`) made minor bumps breaking.       | Fixed in revision 1.0.2 — `pattern: ^1\.\d+\.\d+$` plus runtime supported-set check (§5.1).               |
| Validator quality — a plugin validator that raises could be mistaken for a host bug.       | Host's exception barrier (Core SPEC §7.1 step 6) converts raises to error findings with a clearly attributable `rule_id`; quarantine threshold prevents repeat flooding. |
| Lifecycle-hook semantics ambiguity (when does `on_install` fire?).                         | Fixed in revision 1.0.2 — §4.4 enumerates the four events, their transitions, and dispatch rules.        |

---

## 16. Implementation plan

Sized using complexity buckets per `CLAUDE.md` ("Never provide time estimates"). Each step is independently mergeable and shipped behind feature flag `FDPM_PLUGGABLE_V1`.

| Step | Complexity | Deliverable                                                                                                                                  |
| ---- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | M          | `src/fdpm/plugin/` skeleton: `manifest.py`, `registry.py`, `errors.py`. JSON Schema validator (with §5.1 `pattern` for `spec_version`). Tests against §5. |
| 2    | M          | `discovery.py` + entry-point fallback + `$FDPM_PLUGIN_PATH` scanner. Tests with synthetic plugin fixtures.                                   |
| 3    | L          | `lifecycle.py` + `context.py` + verification gate. Exception barrier. State-machine tests including the `registered → disabled` auto edge for community/unknown. |
| 4    | L          | Capability handlers (`profile`, `validator`, `renderer`, `route`, `transformer`, `importer`, `exporter`, `lifecycle-hook` with all four event variants). Tests each. |
| 5    | M          | `api/plugins.py` admin router. Tests for every endpoint listed in §6.6.                                                                      |
| 6    | L          | Decompose `formal_specification` per §6.1 + §9.1. Replace `main.py:45-50` with discovery in the same PR; **no shim** (§9.2). The PR fails if any `register(store)` call survives. |
| 7    | M          | Decompose `narrative` and `software_architecture` similarly.                                                                                 |
| 8    | M          | `frontend/src/plugin/` skeleton: registry, manifest zod, loader, scoped api client (with Core read-side allow-list per §7.5).                 |
| 9    | L          | Frontend capability handlers + slot components. Refactor existing primitive form rendering through `PrimitiveFormSlot`. First-paint budget enforcement. |
| 10   | M          | Reference plugin `examples/plugins/echo-plugin/` exercising every capability, including all four lifecycle hooks. Conformance pytest suite consumes it. |
| 11   | S          | Metrics + structured logging. Wire into existing observability if present; otherwise stdout JSON.                                            |
| 12   | M          | `docs/plugin-author-guide.md` + manifest reference + tutorial. Derived from this SPEC.                                                       |
| 13   | M          | Migrate the three Core-violating routers (`narrative.py`, `spec_parser.py`, `export_pdf.py`) into the relevant plugins per Core SPEC §19.5 — same-PR frontend update; contract test is the gate. |
| 14   | S          | Flip `FDPM_PLUGGABLE_V1` default to on. Remove the flag in v1.1. (No legacy shim removal — there was no shim.)                              |

Each step ends with the tests, lints, and type checks passing. No step ships with TODOs or placeholders (Core Principle 3).

Step 14 was rebucketed from S to S — confirmed: with no shim to coordinate, this is genuinely a one-line default flip + flag removal. Step 13 was upgraded to M because it is a same-PR atomic move with frontend coordination, not a flag flip.

---

## 17. Open questions

These require operator input before implementation begins. They are the only items in this SPEC that are **not** pre-resolved.

1. **Auth model for the admin API.** This SPEC assumes "admin scope" exists; the current codebase uses a simple API-key auth (`frontend/src/lib/auth.ts`). Operator: extend existing scheme, or introduce role separation now?
2. **Persistence boundary.** The store is in-memory (`store.py:19-38`). Should plugin contributions survive a restart by re-running `activate()` (current SPEC assumption), or do plugin-side workbooks/state need a per-plugin persistence layer? If yes, that becomes a capability (`cap:storage`) and lands in v1.1.
3. **Signature scheme.** Manifest `trust.signature` is unspecified beyond "byte string". Operator preference: minisign, sigstore, GPG?

Each open question has exactly one operator-decision point. The SPEC does not pre-empt them.

---

## 18. Conformance test outline

The conformance suite (Acceptance Criterion 10) MUST verify:

- Manifest schema: 14 invalid manifests (one per failure mode in §5.1, including `spec_version` major-mismatch and within-plugin duplicate `(capability_id, local_name)`) → all rejected with the right error code.
- Discovery: an entry-point plugin and a filesystem plugin both reach `registered`.
- Lifecycle: each transition listed in §6.4 is exercised, including the auto-`disabled` edge from `registered` for community/unknown trust tiers and the `quarantined → disabled` clear path.
- Lifecycle hooks: each of the four events (`on_install`, `on_enable`, `on_disable`, `on_uninstall`) fires at its declared transition; a hook that raises during `on_enable` quarantines the plugin; a hook that raises during `on_disable` is logged but does not block the transition.
- Verification: profile collisions, oversized renderer output, non-UTF8 textual renderer output, router prefix violation, Core-reserved-namespace violation — all rejected.
- Permissions: each operation in §5.2 with permission missing → `PermissionError`; with permission present → success.
- Failure isolation: an `activate()` raising `RuntimeError` quarantines only its plugin.
- Frontend: a stub plugin contributing `cap:ui:primitive-form` overrides the default form for a chosen `primitive_type_id` end-to-end (Playwright or equivalent).
- Frontend scoped client: read-side Core endpoints are reachable when listed in `permissions`; same endpoints rejected when not.
- Manifest cross-version: v1.0.0 manifest loads on v1.1.0 host (mocked); v1.2.0 manifest rejected on v1.0.0 host.

The reference echo plugin is the positive baseline; intentionally broken siblings (`echo-plugin-bad-manifest`, `echo-plugin-bad-renderer`, `echo-plugin-bad-spec-version`, `echo-plugin-duplicate-cap`, …) are the negative baselines.

---

## 19. References

- `@PURPOSE.md` — the universality mandate this SPEC implements.
- `@CLAUDE.md` — process and verification rules this SPEC inherits.
- `@DISCLAIMER.md` — epistemic commitments.
- Companion SPEC: `docs/specs/SPEC-CORE.md` — defines the host this SPEC's plugins consume; sections referenced directly: §5.4 (graph operations: split/clone), §5.5 (event sourcing — kind set, replay, upcasting), §7.1 (validation pipeline), §8 (verification gate), §9 (platform endpoints + §9.6 no-compat-window + §9.7 document-editing API + §9.8 time-travel/undo), §10.4 (frontend plugin budgets), §11.3 (Core-reserved namespaces), §13.3 (audit log unified with operation log).
- `drift-risk-map.md` — current coupling/drift inventory; informs §14 out-of-scope.
- `src/fdpm/main.py` — current static plugin loading (lines 23–33, 45–50, 142–152).
- `src/fdpm/store.py` — current registration target (line 42).
- `src/fdpm/models/core.py` — `DomainProfile`, `PrimitiveTypeDef`, `RelationTypeDef`, `RendererBinding`, `ValidationRuleDef` definitions.
- `pyproject.toml` — currently lacks `[workbook.entry-points]`; this SPEC adds the `fdpm.plugins` group.
- PEP 660 / `importlib.metadata.entry_points` — Python entry-point mechanism this SPEC relies on.
- JSON Schema 2020-12 — manifest schema dialect.

---

## 20. Revision history

### 1.1.1 — 2026-05-04 — final-pass cleanup

Editorial revision; no normative invariant change. Mirrors SPEC-CORE 1.1.1's
final-pass cleanup of stale wording introduced by the 1.1.0 bump.

| § | Change | Reason |
| - | ------ | ------ |
| 0 | Bumped revision; status appended; document title `# SPEC — FDPM Pluggable Architecture v1.0` corrected to `v1.1` to match the version bump in §0. | Final-pass finding: the title was stale after the 1.1.0 bump. |
| 14 | Lede "intentionally not in v1.0" corrected to "v1.1". | Final-pass finding: same staleness pattern. |

No invariant changed; no plugin author or operator action required.

### 1.1.0 — 2026-05-04 — alignment with SPEC-CORE 1.1.0 event sourcing

**A real SPEC minor bump.** SPEC-CORE 1.1.0 adopted event sourcing
as the canonical persistence model: every state change is now an
immutable `Operation` appended to a per-workbook log, and the store
is a derived projection. Plugin authors gain very little new
capability — they emit operations through their existing write
paths — but the *meaning* of those paths shifts enough to warrant
a SPEC bump on this side too.

| § | Change | Reason |
| - | ------ | ------ |
| 0 | Bumped to 1.1.0; spec id to `spec:fdpm:pluggable-architecture:1.1`. Lede rewritten to mark the bump and explain why plugin manifests can stay at `"1.0.0"`. | Honest versioning. |
| 4.1 | `cap:transformer` description now explains the operation log: each emitted operation is an immutable record traceable back to the transformer call via `request_id` and `plugin_id`. | The transformer's wire-protocol output is unchanged but its persistence consequence is new. |
| 5.2 | `read:audit` permission entry rewritten: it now covers `GET /workbooks/{id}/log` (the unified operation log endpoint per Core SPEC §9.8.1), and per-actor filtering became a query parameter — so the permission is now binary (holders see all, non-holders see none) rather than the v1.0 "own actions only" framing. | Mirrors the audit-log unification in Core SPEC §13.3. |
| 6.2 | `PluginContext.audit(...)` removed. Plugin-emitted operations *are* their audit records. Migration note added for any plugin that called `audit(...)` for non-state-change bookkeeping (no known users in v1.0). | Audit-log unification eliminates the parallel write path. |
| 7.5 | `ScopedApiClient` allow-list grew a fifth bucket: Core event-sourced endpoints (Core SPEC §9.8). `GET /log` (gated by `read:audit`), `GET /at` (gated by `read:workbooks`), `:undo` (gated by the same permission as the original op). `:rebuild-from-log` is operator-only and never plugin-accessible. | Plugin UI needs documented access to the new endpoints. |
| 14 | Out-of-scope expanded: `cap:project-event` description widened (any operation kind, not just split/clone); `cap:projection` added; plugin-defined operation kinds explicitly forbidden; plugin-supplied upcasters explicitly forbidden. | Make the new boundary auditable — what plugins cannot do, despite event sourcing tempting authors to ask. |
| 19 | Cross-reference list adds Core §5.5 (event sourcing) and §9.8 (time-travel/undo). | Traceability. |

**No new permission was introduced.** `read:audit` already existed
(its meaning sharpened); operations ride on the same `write:*`
permissions that gated their pre-1.1 endpoints. **No new capability
was introduced.** The kind set is closed in Core; `cap:transformer`
is the existing surface plugins use to emit operations.

**Plugin manifests targeting `spec_version: "1.0.0"` continue to
load on a 1.1 host** because of the major-pinned `pattern` rule
(§5.1). Plugin authors who want to consume 1.1-only Core endpoints
(`/log`, `/at`, `:undo`) should set `host_compatibility.fdpm` to
include the 1.1 host range; recommended form `>=1.0,<2`.

### 1.0.5 — 2026-05-04 — final-pass: batch-edit per-operation permission gating

Editorial revision; no normative invariant change. Mirrors SPEC-CORE 1.0.4's
final-pass clarification of batch-edit permissions in `CoreClient`.

| § | Change | Reason |
| - | ------ | ------ |
| 0 | Bumped revision; intro updated to note 1.0.5 mirrors SPEC-CORE 1.0.4. | Pair traceability. |
| 6.2.1 | The `CoreClient` permission map split: `write:workbooks` now lists only workbook-level operations (`structure:reorder`, `structure:reparent`, `:split`, `:clone`); `POST /workbooks/{pid}/edits` is its own row with the per-operation permission rule (each op checked under its per-resource permission per Core SPEC §9.7.5). | Final-pass finding: the previous map made `write:workbooks` a backdoor to per-resource mutation via the batch endpoint. |

No invariant changed; existing manifests targeting any prior 1.0.x are
unaffected. The clarification narrows what the batch endpoint allows
through the in-process client, matching what Core has always enforced
on the wire.

### 1.0.4 — 2026-05-04 — alignment with SPEC-CORE §5.4 (graph operations)

SPEC-CORE 1.0.3 added two workbook-level graph operations
(`POST /workbooks/{id}:split`, `POST /workbooks/{id}:clone`) and one
optional meta-model field (`PrimitiveTypeDef.is_partition_unit`).
This revision wires those into the pluggable surface: profile
authors now have a clear way to declare partition units, and
plugin UI can call `:split` / `:clone` through the scoped client
under `write:workbooks`.

| § | Change | Reason |
| - | ------ | ------ |
| 0 | Bumped revision; lede notes that this is a pluggable-side alignment for SPEC-CORE 1.0.3, not a normative change to this SPEC. | Honest versioning. |
| 4.1 | `cap:profile` description notes that profiles MAY mark primitive types as partition units via `is_partition_unit` (Core SPEC §5.4.3). | New meta-model field is profile-authored content; plugin authors need to know it exists. |
| 7.5 | `ScopedApiClient` allow-list grew a fourth bucket: Core graph operations (`:split`, `:clone`) under `write:workbooks`. SHOULD-confirmation note for irreversible actions. | Plugin UI needs a documented way to trigger these without inventing parallel paths. |
| 14 | Added two out-of-scope entries: `cap:workbook-event` (deferred per Core §5.4.4) and "plugin contributions to graph operations" (Core-implemented; plugins observe via audit). | Make absences auditable. |
| 19 | Cross-reference list adds Core SPEC §5.4. | Traceability. |

No new permission was introduced. `:split` and `:clone` ride on
existing `write:workbooks`; observation rides on existing
`read:audit`. No invariant in §17.2 (Core) or in this SPEC's
acceptance criteria changed. Existing plugin manifests targeting
`spec_version: "1.0.0"` remain valid.

### 1.0.3 — 2026-05-04 — alignment with SPEC-CORE §9.7 (document-editing API)

Editorial revision; no normative invariant change. Aligns the companion
SPEC with SPEC-CORE 1.0.2's newly-formalised document-editing API
(SPEC-CORE §9.7). Plugin authors gain a clear, single answer to "how do
plugins write?": through Core's edit endpoints, not parallel paths.

| § | Change | Reason |
| - | ------ | ------ |
| 0 | Bumped revision; companion-SPEC link unchanged. | Pair traceability. |
| 4.1 | `cap:transformer` description tightened: output is a SPEC-CORE §9.7.5 batch operation list; transformer never mutates the store directly. | Resolves ambiguity introduced by Core §9.7: was the transformer's output an in-process mutation or an edit-pipeline submission? Now explicit. |
| 4.2 | `cap:ui:primitive-form` description tightened: forms MUST submit through one of the four edit surfaces in SPEC-CORE §9.7.2; no parallel write paths. | Prevents plugin authors from inventing edit endpoints. |
| 6.2.1 | Renamed `CoreReadClient` → `CoreClient`. The client now exposes both read endpoints (matching `read:*` permissions) and edit endpoints (matching `write:*` permissions, covering all four §9.7 surfaces). The §9.7 round-trip discipline applies. | Pair-review finding from Core §9.7 review: the read-only client made `cap:transformer` impossible to implement coherently. |
| 7.5 | `ScopedApiClient` allow-list grew a third bucket: Core edit endpoints under matching `write:*` permissions. The client forwards `If-Match` / `expected_revision` and surfaces `412 precondition_failed` as a typed `RevisionMismatch`. Plugin-supplied `cap:ui:primitive-form` components inherit the §9.7.8 round-trip discipline because they call the same endpoints as the default form. | Pair-review finding: a frontend plugin form had no documented way to write back. |

No invariant changed. Plugin authors targeting `spec_version: "1.0.0"`
or `"1.0.2"` are unaffected; the changes are clarifications of
existing capabilities (`cap:transformer`, `cap:ui:primitive-form`) and
a documented expansion of `PluginContext.api` to the write side that
was always implicit in §5.2's `write:*` permissions.

### 1.0.2 — 2026-05-04 — no-compat-window alignment with SPEC-CORE

Operator decision: removed the `register(store)` compatibility shim
(formerly §9.2), aligning this SPEC with SPEC-CORE 1.0.2's no-redirects
policy. Same-PR atomic conversion is now the rule; CI is the gate.

| § | Change | Reason |
| - | ------ | ------ |
| 0 | Bumped revision; clarified that `spec_version` reported at runtime is `"1.0"` (major.minor). | Document revisions decoupled from runtime version. |
| 3 | Principle 8 reframed: "Loud breakage over silent shims." | Aligns with SPEC-CORE §9.6 and CLAUDE.md Rule 8. |
| 9.2 | Replaced "Compatibility shim (one minor release)" with "No legacy shim — atomic removal in the migration PR." | Operator decision; same rationale as SPEC-CORE 1.0.2. |
| 9.3 (formerly 9.2 post-renumber) | Migration ordering re-aligned: same-PR atomic moves, no flag-flip-then-shim-removal sequence. | Aligns with SPEC-CORE §19.4. |
| 13 | Acceptance criterion 2 says "removed atomically (no shim, per §9.2)." | Reflects §9.2 change. |
| 14 | Out-of-scope unchanged conceptually but adds `cap:shared-constants` cross-reference to drift-risk-map. | Visibility of residual drift surface. |
| 15 | Risk-row "Existing third-party callers depending on direct register(store) break" replaced with "Removing register(store) atomically breaks any external code depending on it; accepted by design." | Reflects §9.2 change. |
| 16 | Step 6 explicitly says "no shim"; new Step 13 covers the Core-violating router migration; rebucketed Step 14. | Reflects §9.2 + alignment with SPEC-CORE §19.4. |

### 1.0.1 — 2026-05-04 — review-pass fixes

Editorial revision; no normative invariant change. Resolves issues raised in
the SPEC pair-review of 1.0.0.

| § | Change | Reason |
| - | ------ | ------ |
| 0 | Added document-revision field; companion-SPEC link. | Pair traceability. |
| 4.1 | `cap:lifecycle-hook` cardinality changed from `0..1` to `0..4 (one per event)`. | Pair-review finding: original `0..1` contradicted §6.4's four lifecycle events. |
| 4.4 (new) | Concrete dispatch rules for each of the four lifecycle hooks, with `local_name` enforced as the kebab-case event name. | Pair-review finding: hooks were under-specified. |
| 5.1 | `spec_version` changed from `const "1.0.0"` to `pattern: ^1\.\d+\.\d+$`; `(capability_id, local_name)` uniqueness moved to in-code check with explanatory note. | Pair-review finding: `const` made every minor bump break all prior plugins. |
| 5.2 (new) | Permissions table now exhaustive. Added `read:audit`, `import:workbook`, `export:workbook`, `menu:contribute`. | Pair-review finding: capabilities (`cap:exporter`, `cap:ui:menu-action`) had no matching permission. |
| 5.3 (new) | Explicit list of capabilities that require no permission (`cap:validator`, `cap:profile`, `cap:lifecycle-hook`, `cap:ui:*`). | Pair-review finding: previously implicit; reviewers asked which caps were unprivileged. |
| 6.2 | Added Core-read methods to `PluginContext` (`list_projects`, `get_primitive`, etc.) and `audit()`. | Pair-review finding: plugins routinely need read access; the v1.0.0 context was too narrow. |
| 6.2.1 (new) | `CoreReadClient` available via `PluginContext.api` (renamed `CoreClient` in 1.0.3 when write endpoints were added). | Same. |
| 6.4 | State-machine diagram and table now include the `registered → disabled` edge for community/unknown. | Pair-review finding: the edge was unreachable but not drawn. |
| 6.5 | Validator-function row reworded to match Core SPEC §7.1 step 6 (registration verifies signature; runtime enforces non-raises via exception barrier). | Pair-review finding: registration cannot prove a callable never raises. |
| 6.6 | Plugin-delegated `ANY /plugins/{id}/<plugin-defined-path>` row clarified with explicit cross-reference to Core SPEC §9.3 / §9.4. | Pair-review finding. |
| 6.8 (new) | Startup gate budget surfaced as a config variable + `/readyz` semantics. | Pair-review finding: 200 ms cap was mentioned in risks but not in normative text. |
| 7.4 | Slot keys are exact-match only (no patterns); deterministic conflict-resolution rule. | Pair-review finding. |
| 7.5 | Scoped API client allows the read-side §9.1 Core endpoints declared in `permissions`, in addition to the plugin namespace. | Pair-review finding: the v1.0.0 client forbade what plugins routinely need. |
| 7.7 (new) | First-paint and bundle-size budgets surfaced. | Pair-review finding: SPA bloat risk was underweighted. |
| 8.1 | Server boot flow includes lifecycle-hook dispatch and trust-tier auto-disable. | §4.4 + §10.1 alignment. |
| 13 | Acceptance criteria 13–17 added: cross-version compat, lifecycle hooks, slot conflicts, scoped client, first-paint budget. | Each new clarification needs a paired test (CLAUDE.md Core Principle 3). |
| 15 | Risk table expanded: `spec_version` early-choice mistake + lifecycle ambiguity, both noted as fixed in this revision. | Visibility. |
| 18 | Conformance suite adds tests for `spec_version` mismatch, duplicate `(cap, local)` pairs, lifecycle-hook variants, scoped-client allow/deny, cross-version compat. | Acceptance-criteria alignment. |

No invariant changed. Plugin authors targeting `spec_version: "1.0.0"`
need no manifest changes; the old `const "1.0.0"` schema rejected
non-1.0.0 strings, but no v1.0.0 manifest in the wild used a
non-`"1.0.0"` value, so the relaxation is purely additive.
