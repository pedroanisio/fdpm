---
disclaimer:
  notice: >-
    No statement or premise not backed by a real logical definition
    or verifiable reference should be taken for granted. A claim is
    reliable to the extent that it names what verifies it: a logical
    definition, a test that ran, a measurement, or a reference that
    resolves. A claim that names none of these is unverified and is to
    be read as a claim, not as a fact. Where a document states what was
    verified and how, that statement is its verification boundary.
  generated_by: "Claude Fable 5.1 via Claude Code"
  date: "2026-09-04"
---

# External evidence paragraphs — ready to paste

## Disclaimer

This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](../../DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.

Two documents outside this repository were identified as places where fdpm
is evidence: the Silent Acceptance specification (a v2.1 revision) and the
PG × PA thesis (its "built and proved" evidence table). Both live in other
repositories with their own governance, checkers and publication pipelines
(`~/codebases/pals-check` — published to Zenodo, section numbers hard-coded
in its audit tool; `~/github-mirror/_framework/repo2dsl/docs/build_thesis.py`
— a reportlab build). Neither was modified from this repository. The text
below is drafted to their formats so the operator can paste it in the
revision that carries it. Every claim in the drafts is checkable against
this repository at the paths named.

## 1. Silent Acceptance v2.1 — one paragraph for §10 (Practitioner Artifacts)

Suggested placement: a new §10.6, "A reference implementation of a declared
boundary", after the CI check (§10.5). Alternative: the last paragraph of
§8.7, where the harness evidence is qualified.

> **10.6 A reference implementation of a declared boundary.** The artifacts
> above declare a boundary in prose and check it in CI; `fdpm`
> (https://github.com/pedroanisio/fdpm, Apache-2.0) is a runtime that
> enforces one. It is an MCP server in which an agent's every write is
> validated against a closed schema before it is appended to an
> append-only log: a malformed write is rejected whole and the rejection
> names the rule that failed and the field it failed on
> (`validation_report.findings[].rule_id`), so the retry is aimed rather
> than guessed. The server's audit report (`fdpm://audit/report`,
> SPEC-MCP-SERVER §9.5) computes per-tool success rates, a success-rate SLO
> with its shortfall, and *error classes* — `rule:<rule_id>` for
> validation rejections, `category/reason` for protocol errors — from the
> log of what agents actually did; that is the runtime half of what
> `silent-acceptance-lint` checks statically, and the classes are the
> input to the next change of a tool description or instruction. The same
> repository ships the measurement of its own boundary: a three-arm
> cold-agent eval (`fdpm-cli/src/eval/`, fifty instructions whose
> reference solutions are themselves verified against the server) scores
> an agent on the terminal state, the replay of the log from empty, the
> absence of unauthorised deletes, and a write budget, and never on the
> agent's text. It is cited here as a worked example of Corollary 6
> (§9.7): the verifier — schema, log, scorer — is outside the boundary the
> agent can reach, which is the MCP tool surface. At the time of writing
> the eval's design and runner exist and its reference suite passes
> (50/50 on 2026-09-04); no model has yet been measured, so the
> repository is evidence of a declared boundary, not of a result.

Citation line for §11.5 or the references: *fdpm — schema-enforced,
event-sourced MCP workbench. Source: https://github.com/pedroanisio/fdpm
(Apache-2.0). No npm release at the time of citation; cite the commit.*

## 2. PG × PA thesis — row E10 for table "4b · Construído e provado"

The table's columns are (artefato, prova, número), in Portuguese. Draft row,
in the file's tuple form:

```python
("UIXO → FDPM (zod-bridge, E10)",
 "perfil profile:uixo:1.2 gerado de uma ontologia Zod em uma direção, "
 "determinístico; ontologia-fonte fixada por hash de conteúdo; gate de "
 "drift do bridge falha se o gerado divergir da fonte",
 "712 tipos primitivos · 210 tipos de relação derivados de 1.653 campos-"
 "aresta · 712 validadores gerados, nenhum mantido à mão (nem pode ser)"),
```

English gloss, for the thesis prose if a sentence is wanted: *E10 — the
UIXO interaction ontology compiled once into an FDPM profile: 712 classes
become primitive types, 210 relation types are derived from the ontology's
1,653 graph-edge fields, the source is pinned by content hash, and the 712
validators that enforce it are generated, not maintained. This is the
PG × PA thesis instantiated: the repeated part (the validator set) is
compiled once from the specification and cannot be hand-edited into drift.*

Sources in this repository: `docs/architecture/PROFILES.md` (generated
atlas; lines for `profile:uixo:1.2`), `fdpm-cli/plugins/uixo/`
(`generated/schema-hash.json` is the content-hash pin),
`fdpm-cli/packages/zod-bridge/README.md` (the one-way generation contract
and its snapshot gates).

## 3. What was verified for these drafts

- The counts are read from `docs/architecture/PROFILES.md`, which
  `fdpm-cli/scripts/build-profile-atlas.ts` generates from the running host
  and `fdpm-cli/tests/_meta/doc-drift.test.ts` gates.
- The audit-report fields are those of
  `fdpm-cli/src/persistence/mcp-audit-report.ts` (`error_classes`, `slo`,
  `per_tool`).
- The eval facts are those of `docs/eval/COLD-AGENT-EVAL.md`; the 50/50
  figure is the output of `npm run eval:reference` on 2026-09-04.
- Not verified: how the receiving documents will number the sections in
  their next revisions; the section labels above are proposals.
