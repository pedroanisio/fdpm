---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "GPT-5 Codex via OpenAI Codex"
  date: "2026-05-04"
---

# Repository Purpose

## Disclaimer

This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](./DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.

## Why This Repository Exists

This repository exists to package FDPM Core as a local, auditable operator
tool. The executable runtime lives under [`fdpm-cli/`](./fdpm-cli/), where the
event-sourced core, validation pipeline, transfer surface, and plugin runtime
are assembled into a TypeScript CLI.

The point of the repository is not to describe the core abstractly. It is to
ship an executable host, the supporting specs, and the regression suite needed
to keep the operator surface aligned with the underlying contracts.

## What It Provides

- A CLI runtime for creating, inspecting, validating, diffing, migrating, transferring, and rendering FDPM projects.
- Bundled plugin content that exercises the host against real domains such as formal specification, planning, software architecture, and spec authoring.
- Project-level specs and references that make the implementation auditable against its stated contracts.
- A persistence and replay surface where the operation log remains the source of truth.

## Who It Is For

- **FDPM core maintainers** who need an executable host for the core contracts.
- **Plugin authors** who need a real runtime for profile, validator, renderer, importer, and exporter work.
- **Operators and automation** that need local, scriptable access to FDPM projects without standing up an HTTP service.

## Non-Goals

- This repository is not an HTTP server deployment.
- It is not a general NLP or story-generation product surface.
- It does not redefine FDPM separately from the core and companion specs it ships.
