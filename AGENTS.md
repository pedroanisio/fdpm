---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Opus 4.7 (1M context) via Claude Code"
  date: "2026-05-05"
---

@CLAUDE.md

# AGENTS.md

Programmatic CLI / tooling reference for AI agents working with this
repository. Operator-facing docs live in `README.md` and
`fdpm-cli/MANUAL.md`.

## Disclaimer

This work is subject to the methodological caveats and commitments
described in [@DISCLAIMER.md](./DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or
> verifiable reference should be taken for granted.

---

## `fdpm repl` — agent-driven REPL surface

`fdpm repl` is the SPEC-REPL §8 in-process REPL — a long-lived process
holding one `Host` for its lifetime that re-parses each input line
through the same Commander tree the one-shot CLI uses. An LLM agent
can drive it via stdin/stdout pipes (no TTY) and inherits every Core
boundary the one-shot CLI provides; the REPL adds **no new trust
boundary that bypasses Core** (SPEC-REPL Principle 1).

### Invocation

```bash
fdpm repl [--data-dir <path>] [--no-persist] [--no-banner] \
          [--script <file>] [--exit-on-error] [--json]
```

For agent integrations, the canonical form is:

```bash
fdpm repl --no-banner --json --script <commands.txt> --exit-on-error
```

`--no-banner` and `--script` are required when stdin is not a TTY (the
banner would interleave with the JSON stream; without `--script`, the
REPL reads stdin until EOF, which is also fine but slower for batch
runs).

### Input format

One command per line. POSIX shell-word splitting (single quotes,
double quotes, backslash escape) — **no variable expansion, command
substitution, or glob expansion** (SPEC-REPL §8.4). Lines starting
with `#` are comments; blank lines are ignored. Meta-commands are
prefixed with `:` and never reach Commander.

### Output framing (the agent contract)

| Stream | Content | Format |
|---|---|---|
| `stdout` | One JSON value per command response | Compact (no pretty-printing) |
| `stdout` | `{"summary": {ok, error, duration_ms}}` at session end | Compact |
| `stderr` | Banners, prompts, error envelopes, deprecation warnings | Plain text |

In `--json` mode, `stdout` is a stream of newline-delimited JSON —
one value per line. **Agents can `JSON.parse` line-by-line** without
buffering. The `stderr` stream is for humans (or for an agent to log
verbatim); it does not need to be parsed.

The session-end summary is always the LAST line on stdout and always
has shape `{"summary":{"ok":N,"error":M,"duration_ms":T}}`. Agents
should match it as the trailing line and use `ok`/`error` as the
ground truth for "did this batch succeed" rather than parsing
individual lines for errors.

### Error envelope

When a command fails with `FDPMException`, the envelope has shape:

```json
{
  "error": {
    "category": "validation | verification | not_found | conflict |
                permission | unauthenticated | quota |
                unsupported_media | host_compat | internal",
    "message": "human-readable summary",
    "evidence": { /* category-specific structured data */ }
  }
}
```

Errors go to `stderr` (not `stdout`). The session continues; the next
input line is dispatched normally unless `--exit-on-error` is set, in
which case the REPL exits with `EXIT_CODE_FOR_CATEGORY[category]`
(see below).

### Exit codes

| Category | Exit code |
|---|---|
| (none — clean exit) | 0 |
| `validation` | 2 |
| `verification` | 3 |
| `not_found` | 4 |
| `conflict` | 5 |
| `permission` | 6 |
| `unauthenticated` | 7 |
| `quota` | 8 |
| `unsupported_media` | 9 |
| `host_compat` | 10 |
| `internal` | 70 |

In scripted mode, without `--exit-on-error`, the process exit code is
the highest category code observed across the session (or 0 if every
command succeeded). With `--exit-on-error`, the process exits at the
first failing command with that command's exit code.

### Freshness gate (out-of-band write detection)

The REPL holds one in-memory projection per project. When a second
process appends to a project's JSONL log on disk (via a concurrent
one-shot `fdpm` invocation, MCP server, or hand-edit), the REPL
detects the change before dispatching the next command:

- **Read-only commands** (`primitive list`, `validate`, `render`,
  `dnis list`, etc.): incremental tail-replay. The REPL reads the new
  ops from disk, applies them to its in-memory state, then dispatches.
  No envelope, no operator action required.
- **Write-capable commands** (`primitive create`, `primitive patch`,
  `relation delete`, etc.): refusal with a `permission` envelope
  carrying `evidence.reason: "stale_state"` and
  `evidence.advice: "run :reload or restart the REPL"`. The
  underlying op is NOT appended.

After a `permission`+`stale_state` refusal, an agent should:

1. Surface the staleness to the operator (or to its own decision
   loop if it manages its own freshness).
2. Issue `:reload` to rebuild the Host against the on-disk log.
3. Re-issue the original command.

### Meta-commands

| Command | Effect |
|---|---|
| `:help` | List meta-commands and top-level subcommands |
| `:quit` / `:exit` | Clean shutdown |
| `:reload` | Full Host reload (re-runs `load()` + plugin discovery + activation) |
| `:reload plugins` | Re-run plugin discovery + activation only |
| `:pwd` | Print process cwd |
| `:env` | Print `FDPM_*` environment variables |
| `:json on \| off` | Toggle session-wide JSON mode |
| `:history` | (note about history persistence) |
| `:time` | (not implemented in v0.1) |

Forbidden in v0.1: `:cd`, `:!<shell-cmd>`. Both produce an error
envelope with a SPEC-REPL §8.5 reference.

### Worked example

A typical agent script:

```text
# agent-batch.txt
project list
profile list
primitive create my-proj -f /tmp/payload.json
:quit
```

Run with:

```bash
fdpm repl --script agent-batch.txt --no-banner --json --exit-on-error
```

The agent reads `stdout` line-by-line:

```text
{"projects":[...]}
{"profiles":[...]}
{"id":"...","op_id":"...","project_revision":2,"report":{...}}
{"summary":{"ok":3,"error":0,"duration_ms":287}}
```

If the third command had failed (e.g., the payload referenced an
unknown profile_id), the agent would observe:

- `stderr`:
  `{"error":{"category":"not_found","message":"profile not found: profile:...","evidence":{...}}}`
- `stdout`: just the first two responses + the summary line.
- Process exit code: `4` (not_found, because `--exit-on-error` is set).

### What the REPL deliberately does NOT provide

- **Streaming partial responses.** Commands are request/response only
  in v0.1. Long renders return one bundle.
- **Multi-line command continuation.** One command per line.
- **Natural-language command interpretation.** Input is CLI syntax
  only.
- **A daemon / IPC surface.** The REPL is in-process, TTY/pipe only.

These are all SPEC-REPL §14.2 deferrals; revisit when the slice ships.

---

## SPEC-MCP-SERVER — `fdpm-mcp` (in-progress)

The MCP server (`fdpm-mcp` binary, `src/mcp/`) is under active
development. It shares the freshness primitives (`Host.statProjectLog`,
`Host.reloadProjectTail`, `staleStateException`) and per-subcommand
metadata registry (`src/commands/index.ts` exports
`ALL_COMMAND_METADATA`) with the REPL. See `src/mcp/` for the
in-progress manifest, classification gate, and dispatch shape.

### Resources surface

Beyond the tool list, `fdpm-mcp` advertises **resources** —
read-only addressable views of project state that an agent can pin
to context without burning a tool call. Slice 1 ships the **render**
provider:

```
fdpm://project/{project_id}/render/{target}[#{renderer_id}]
```

| Segment | Meaning |
|---|---|
| `project_id` | A project visible via `host.listProjects()` |
| `target` | A renderer target (MIME type or symbolic id, e.g. `text/markdown`, `text/html`, `application/pdf`) |
| `#{renderer_id}` | **Optional** disambiguator — only required when more than one registered renderer advertises the same `target` (e.g. both `fs:SpecRenderer` and `spec:SpecMarkdownRenderer` register `text/markdown`). `resources/list` emits the fragment automatically when needed. |

The `target` segment may itself contain `/` (most renderer targets
are MIME types). The URI parser treats everything after `/render/`
as one opaque target, splitting at `#` for the optional fragment.

#### `resources/list`

Returns one entry per `(project, registered renderer target)` pair.
For collisions (multiple plugins advertising the same target), each
entry carries the disambiguating fragment. The response shape per
the MCP spec:

```json
{
  "resources": [
    {
      "uri": "fdpm://project/spec-core/render/text/markdown",
      "name": "spec-core → text/markdown",
      "description": "spec:SpecMarkdownRenderer (plugin fdpm.spec-authoring) rendering of project spec-core",
      "mimeType": "text/markdown"
    }
  ]
}
```

#### `resources/read`

Invokes the renderer against the project's current state. Before
running the renderer, the server runs a **lenient tail-replay**
(SPEC-REPL §10.2): if another process has appended to the project's
log on disk since this server last read it, the new ops are
incrementally applied first. Read is read-only, so no
`staleStateException` is thrown — the freshest available state is
rendered. (A `host_compat` throw from `reloadProjectTail` —
truncated or rewritten log — propagates verbatim.)

Response shape:

```json
{
  "contents": [
    {
      "uri": "fdpm://project/spec-core/render/text/markdown",
      "mimeType": "text/markdown",
      "text": "# spec-core\n\n> Profile: ..."
    }
  ]
}
```

For binary outputs (`application/pdf`, `image/svg+xml`, etc.) the
content carries `blob` (base64-encoded) instead of `text`. The MCP
SDK serialises both correctly.

#### Error envelopes

| Category | Cause |
|---|---|
| `not_found` | Unknown URI shape, unknown project, unknown renderer target |
| `host_compat` | The project's log was truncated or rewritten (SPEC-REPL §10.2 divergent-log path) |
| Other categories | Propagated verbatim from the renderer (e.g. `verification` from a renderer that rejects malformed primitives) |

#### What's deferred

- **Subscriptions.** `notifications/resources/updated` would let the
  server push fresh renders when a project changes. The freshness
  primitives are already in place; a watcher loop is slice 2 work.
- **Other resource families.** Project transfer, validate report,
  per-primitive views are obvious next providers. Each is ~50 lines
  added under `src/mcp/resources/<name>.ts` plus one entry in the
  registry.
- **Defensive `fdpm.render` tool.** Some MCP clients only know
  tools, not resources. Claude Code supports resources; if a
  resource-blind client materialises, a tool wrapper around the
  same `dispatchRead` is straightforward to add.

---

## Project guidelines

This file is the entry point for agent-specific reference. The
binding behavioral rules live in:

- `CLAUDE.md` — process and standards (PALS's LAW, formalization
  means research, English over Portuguese, Markdown over DOCX,
  TypeScript over JavaScript, mandatory disclaimer headers, etc.)
- `PURPOSE.md` — why the project exists
- `DISCLAIMER.md` — methodological caveats

When in doubt, defer to the explicit binding constraints in
CLAUDE.md.
