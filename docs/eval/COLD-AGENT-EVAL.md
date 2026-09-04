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

# Cold-agent eval — the three-arm differential, as code

## Disclaimer

This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](../../DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.

[PURPOSE.md](../../PURPOSE.md) says the verb / resource / prompt / expression
architecture is a hypothesis and that the first eval — three arms, one
instruction set, one model snapshot — is the falsifiable contract. Until
2026-09-04 that eval existed as a paragraph in the README and a row in the
status table. This document describes the runner that now ships under
`fdpm-cli/src/eval/`, the fifty-instruction test set it runs, what each arm
lets the agent see, how an instruction is scored, and what has and has not
been measured.

## What has been verified, and what has not

- **Verified.** The runner, scorer, arms and report have unit and
  integration tests under `fdpm-cli/tests/eval/` (7 files, 47 tests on
  2026-09-04). The integration test spawns the real `fdpm-mcp` over stdio,
  drives it with a scripted model, and checks the receipt written to disk.
  `npm run eval:reference` executed every fixture and every reference
  solution of `eval/cold-agent-v1.json` through the real server and scored
  them from the Host: **50/50 pass all four criteria** (run on 2026-09-04;
  the same check is `tests/eval/test-set.test.ts`, so it runs in CI).
- **Not verified.** No model has been run through the harness yet. There is
  no first-try success rate for any arm and no differential. Every number
  in this document is a count of instructions or a threshold from the
  README; none is a measurement of an agent.

## Running it

From `fdpm-cli/`:

```sh
# Prove the test set is sound: fixtures accepted, references pass, no model, no cost.
npm run eval:reference

# Smoke the per-instruction pipeline with the reference driver (no model).
npx tsx scripts/run-cold-agent-eval.ts --driver reference --arms tools --limit 3

# The measurement. Needs Anthropic credentials (ANTHROPIC_API_KEY or an
# `ant auth login` profile). 50 instructions × 3 arms; spends tokens.
npm run eval:cold-agent -- --model claude-opus-5
```

The measurement writes `eval/runs/<run-id>/receipt.json` (every result, the
bounds, the model id, the SHA-256 of the test set), `report.md` (the tables
below) and one transcript per instruction and arm. Flags: `--arms`,
`--ids`, `--categories`, `--limit`, `--effort`, `--max-turns`,
`--max-tool-calls`, `--max-wall-ms`, `--threshold-pp`, `--acceptable-rate`,
`--keep-data`, `--out`, `--work-dir`, `--json`.

The runner preflights the model id with the Models API before spending a
token and refuses to start otherwise. Server-side refusal fallbacks are
deliberately off: a fallback would let a second model answer part of a run,
and the premise of the eval is one snapshot per run. A refusal is recorded
as the terminal reason and scores as a failure.

## The three arms, on the surface that ships

The README names the arms as *verbs only*, *verbs + discovery*, and *verbs
+ discovery + prompts*. Two of the things those names assume do not exist
yet: per-verb plugin MCP tools are a deliberate stub
(`src/mcp/plugin-tools.ts` returns `[]`), and the discovery tools of
PURPOSE.md (`list_verbs`, `describe_verb`, `applicable_operations`,
`list_resources`) are v2 work. What does exist is the 32-tool core catalog,
`initialize.instructions` (mirrored at `fdpm://guide`), the resource surface,
and plugin-shipped prompts. The arms are therefore three client-side views
of one unmodified server, defined in `src/eval/arms.ts`:

| Arm | Server tools | System prompt | Meta-tools |
| --- | --- | --- | --- |
| `tools` | the catalog minus `fdpm.profile.list`, `fdpm.profile.get`, `fdpm.profile.type_info` | operator policy only | none |
| `tools_discovery` | the full catalog | policy + `initialize.instructions` | `mcp_list_resources`, `mcp_read_resource` |
| `tools_discovery_prompts` | the full catalog | policy + `initialize.instructions` | + `mcp_list_prompts`, `mcp_get_prompt` |

Arm 1 hides the three tools that teach the vocabulary; the agent has the
generic CRUD tools and the instruction text. Arm 2 gives it the server's own
cold-start orientation and the profile resources. Arm 3 adds `prompts/list`
and `prompts/get`, so the planning plugin's `planning/triage_iteration`
procedure is reachable. The operator policy is the same three sentences in
every arm and says nothing about refusing, because refusal cases are scored
on the log, not on what the model says.

When per-verb tools and the discovery tools land, the arm definitions are
the only thing to change: `excluded_tools` per arm, plus which meta-tools are
exposed.

## The test set

`eval/cold-agent-v1.json` is generated by
`scripts/build-cold-agent-test-set.ts` and drift-gated by
`tests/eval/test-set.test.ts`. Fifty instructions against
`profile:planning:0.1`, in the README's five categories:

| Category | Count | What it exercises |
| --- | ---: | --- |
| `simple` | 12 | one primitive, no graph traversal (create a task, patch a status) |
| `multi_step` | 12 | chained writes across primitives, in the order the validators demand (an AI task must verify a criterion before it can be AI) |
| `batch` | 10 | high-cardinality writes that one batch call expresses atomically; the verb budget punishes doing them one by one |
| `ambiguity` | 8 | the agent must resolve a reference ("the task about the login page", "the only P3 task") or choose patch over replace |
| `refusal` | 8 | out-of-scope, impossible, or unsafe requests; the log must stay untouched |

Every instruction carries:

- `setup` — tool calls the runner executes through the real server before
  the agent connects; a rejected setup call marks the instruction
  `invalid_setup`, which counts as a failure of the set, not of the model;
- `instruction` — the text the agent receives, with the ids and values it
  needs stated explicitly so the terminal state is deterministic;
- `expected.assertions` — `primitive_exists` (with a field subset),
  `primitive_absent`, `relation_exists`, `relation_absent`,
  `primitive_count`, `workbook_exists`;
- `expected.destructive` — the delete kinds and ids the instruction
  authorises (empty by default);
- `expected.max_new_operations` — `0` for refusal cases;
- `reference_solution` — the human-baseline call sequence. The runner's
  reference driver executes it through the same pipeline; it must pass all
  four criteria, and its write count is the baseline for criterion 4.

Only one workbook id per instruction, so the reference suite can run all
fifty against a single server without one fixture touching another.

## Scoring — README "Pass criteria", all four required

Scoring reads the Host projection, the workbook's operation log and the
`mcp-audit.jsonl` entries written while the agent was connected. It never
reads the model's text. `src/eval/score.ts`:

1. **terminal_state** — every assertion holds; for refusal cases, no
   operation was appended after setup.
2. **replay** — the operation log replayed from empty
   (`replay()` / `sliceProject()` from `src/core/store/replay.ts`) yields
   the same primitives, relations and scope membership the live projection
   holds. A workbook whose state depends on anything outside its log fails
   here.
3. **destructive_scope** — no `primitive.delete`, `relation.delete` or
   `workbook.delete` after setup outside `expected.destructive`.
4. **verb_budget** — write tool calls (the Tier-2 and Tier-3 tools, derived
   from the manifest so the set cannot drift) ≤ 2 × the reference
   solution's writes. Rejected attempts count: a wasted verb is a verb. A
   refusal case has a budget of zero.

Per instruction the score also records tool calls, reads, rejections,
protocol errors, resource reads, new operations, and the audit report's
error classes (`<tool> <label>`), which the report aggregates per arm — the
seed set SPEC-MCP-SERVER §9.5 says the eval takes from the audit report.

## The report and the kill criterion

`src/eval/report.ts` computes per arm: first-try success rate (an
unscorable instruction counts as a failure), the rate per category, the
count of failures per criterion, terminal reasons, token usage, and the top
error classes. Then:

- **differential**: arm 3 − arm 2 in percentage points against the README
  threshold of **15 pp** → `prompts_paid_off`;
- **kill criterion**: arm 3's rate against `--acceptable-rate` (default
  0.7; the README leaves the acceptable rate to the operator) → whether the
  post-v2 roadmap is reopened.

The verdict sentence names which rule decided it. Both rules are computed
from scored results and nothing else.

## Verification boundary of the runner itself

The driver (`src/eval/driver.ts`) is the one place a model's output enters
the system, and it carries the Silent Acceptance banner because it is the
boundary:

1. every `tool_use.input` is parsed as a JSON object or rejected with an
   `is_error` result; a tool name outside the arm's surface never reaches
   the server;
2. the server validates every write against the profile, and the scorer
   validates the terminal state against the instruction;
3. a bad block, a thrown executor, or an API failure has a named path —
   `is_error` result, bounded retry on 429/5xx/connection errors, then a
   terminal `api_error`; nothing is coerced or defaulted;
4. `tests/eval/driver.test.ts` feeds non-object inputs, unknown tools,
   throwing executors, endless tool loops, oversized results, refusals and
   API errors, and asserts each path;
5. turns, tool calls, wall clock, retries and result size are bounds owned
   by `DriveBounds` (defaults: 40 turns, 60 tool calls, 15 minutes, 3
   retries, 24,000 characters); the model cannot extend them.

The model's final text is kept in the transcript for a human to read and is
never an input to any criterion.

## Bounds and cost

Per instruction the defaults allow 40 model turns; a run of 50 × 3 is at
most 6,000 turns, in practice far fewer because most instructions finish in
two to six turns. Every turn resends the system prompt and the tool
catalog (about 28 KB of tool schemas plus 4.7 KB of instructions in arms 2
and 3), so the per-run input volume is dominated by the catalog. There is no
measured cost yet; the receipt records `usage` per arm so the first run
produces the number.

## Where this sits in the repository

- `fdpm-cli/src/eval/` — `schema.ts` (test-set contract), `arms.ts`,
  `driver.ts`, `mcp-client.ts`, `score.ts`, `report.ts`, `runner.ts`.
- `fdpm-cli/scripts/run-cold-agent-eval.ts` — the CLI; `npm run
  eval:cold-agent`, `npm run eval:reference`.
- `fdpm-cli/scripts/build-cold-agent-test-set.ts` → `fdpm-cli/eval/cold-agent-v1.json`;
  `npm run eval:test-set` regenerates, `--check` detects drift.
- `fdpm-cli/tests/eval/` — schema, arms, driver, report, score (against a
  real Host), runner over stdio, and the test-set suite.
- [README.md](../../README.md) — the product overview links here;
  [docs/architecture/DESIGN.md](../architecture/DESIGN.md) carries the
  original "Eval design" section and the status table this implements.
