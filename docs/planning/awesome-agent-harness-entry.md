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

# awesome-agent-harness entry for fdpm

Prepared material for listing fdpm in
[Picrew/awesome-agent-harness](https://github.com/Picrew/awesome-agent-harness).
The list's format was read from its raw README on 2026-09-04: entries are
rows of a five-column table, `| Project | Link | Stars | Tags | Summary |`,
grouped under `###` headings. No CONTRIBUTING file or entry-format rules
were visible in the README, so the row below copies the shape of the
existing rows exactly.

## 1. The entry

Place under `### Guardrails, Security & Governance`
(anchor `guardrails-security-governance`), alphabetically or at the end
of that table, whichever the maintainers use:

```markdown
| fdpm | [GitHub](https://github.com/pedroanisio/fdpm) | [![star](https://img.shields.io/badge/star-0-f4b400?style=flat-square)](https://github.com/pedroanisio/fdpm) | schema-enforcement, event-sourcing, mcp, verification-boundary | Schema-enforced, event-sourced MCP workbench for agent output: every write is validated against a domain profile and rejected with typed findings that name the rule that failed, appended to a replayable log, and summarised in an audit report by error class. |
```

The star badge carries the count the GitHub API returned on 2026-09-04
(`stargazers_count: 0`). The existing rows' badge values look
tool-maintained; if the maintainers regenerate badges, the number does not
matter.

**Why this section and not "Reference Harness Implementations".** That
section lists complete agent runtimes: OpenClaw, Hermes Agent, Claude Code.
fdpm runs no model loop and orchestrates no tools; it is the boundary an
agent's output has to cross before it is accepted, which is a governance
control. The closest alternative is "Protocols, Tool Interfaces & Agent
Contracts", because fdpm exposes its contract over MCP; if the maintainers
prefer that placement the row is unchanged.

## 2. Pull request

**Title:** `Add fdpm to Guardrails, Security & Governance`

**Body:**

```markdown
Adds fdpm, a schema-enforced, event-sourced MCP workbench for agent output.

An agent authors into a workbook over MCP tools; every write is validated
against a declared domain profile and either appended to an append-only,
replayable operation log or rejected with typed findings that name the
rule that failed and the field it failed on. An audit report resource
summarises tool-call outcomes by error class. The architecture states its
own falsification test: a three-arm cold-agent eval whose pass rule is a
15-percentage-point first-try-success differential between the discovery
and prompt arms.

Apache-2.0, TypeScript, public source; npm packages not yet published.
```

## 3. Operator action

Opening the PR publishes under the operator's GitHub identity, so it is
the operator's action, not an agent's. Commands, from any directory:

```sh
gh repo fork Picrew/awesome-agent-harness --clone
cd awesome-agent-harness
git checkout -b add-fdpm
# Insert the row from section 1 under "### Guardrails, Security & Governance" in README.md.
git add README.md
git commit -m "Add fdpm to Guardrails, Security & Governance"
git push -u origin add-fdpm
gh pr create --repo Picrew/awesome-agent-harness \
  --title "Add fdpm to Guardrails, Security & Governance" \
  --body-file pr-body.md   # the body from section 2, saved locally first
```

If the list's Category Overview table carries per-category counts, bump
the "Guardrails, Security & Governance" count by one in the same commit.

---

Back to the [repository root](../../README.md).
