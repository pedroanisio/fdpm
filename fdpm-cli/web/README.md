---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Opus 4.7 (1M context) via Claude Code"
  date: "2026-05-05"
---

# @fdpm/web — FDPM Workbooks browser

A read-only React frontend that loads FDPM workbooks from your local
machine and renders them as browseable workbook pages.

## Disclaimer

This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](../../../DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.

## Architecture

```
Browser (Vite + React + TS, port 5173)
        │  fetch /api/*
        ▼  (proxied by Vite)
Bridge  (Node HTTP server, port 5174)
        │  spawn fdpm <args> --json
        ▼
fdpm CLI  →  local FDPM workbook store
```

- **Bridge** (`server/bridge.ts`) — minimal Node HTTP shim that spawns
  `fdpm` per request and returns parsed JSON. Read-only by construction:
  only `workbook list` and `workbook get` are wired.
- **Frontend** (`src/`) — React app with two views: a workbook list and a
  workbook detail page that groups primitives by `type_id` and shows
  their fields.

The bridge talks to whatever `fdpm` your `PATH` resolves to. To target a
specific binary or a non-default data dir, set `FDPM_BIN` and
`FDPM_DATA_DIR` (see *Configuration* below).

## Prerequisites

- Node ≥ 20
- `fdpm` on your `PATH` (or `FDPM_BIN` set to its absolute location).
  Verify with `fdpm workbook list --json`.

## Quick start

```bash
cd fdpm-cli/web
npm install
npm run dev
```

This starts the bridge on `http://127.0.0.1:5174` and Vite on
`http://127.0.0.1:5173`. Open the Vite URL — `/api/*` calls are proxied
to the bridge automatically.

To run the two pieces separately (e.g. for debugging):

```bash
npm run dev:bridge   # terminal 1
npm run dev:vite     # terminal 2
```

## Configuration

| Env var            | Default       | Effect                                                  |
| ------------------ | ------------- | ------------------------------------------------------- |
| `FDPM_BIN`         | `fdpm`        | Path to the `fdpm` binary to spawn                      |
| `FDPM_DATA_DIR`    | (CLI default) | Forwarded as `--data-dir` to every `fdpm` invocation    |
| `FDPM_BRIDGE_PORT` | `5174`        | Bridge HTTP port (Vite proxy reads this on startup)     |
| `FDPM_BRIDGE_HOST` | `127.0.0.1`   | Bridge bind host                                        |

## API surface (bridge)

| Method | Path                  | Returns                                                  |
| ------ | --------------------- | -------------------------------------------------------- |
| GET    | `/api/health`         | `{ ok, workbooks }` — proves the CLI is reachable        |
| GET    | `/api/workbooks`      | `{ workbooks: [{ id, name, profile_id, revision }] }`    |
| GET    | `/api/workbooks/:id`  | `{ workbook, primitives, relations? }` (full snapshot)   |

Errors are surfaced as `{ error, detail? }`. For unknown workbooks, the
bridge maps the CLI's `not_found` envelope (exit code 4) to HTTP 404
and forwards the structured envelope under `detail.stderr`.

## What this does NOT do

- **Write operations.** No create/patch/delete endpoints. Mutating a
  workbook still goes through `fdpm` directly.
- **Live updates.** The bridge spawns a fresh CLI per request, so each
  view reflects the on-disk state at the time it was loaded. Refresh
  the browser to pick up edits made elsewhere.
- **Auth.** The bridge binds to `127.0.0.1` and assumes single-user
  local trust. Do not expose it on a network interface as-is.
- **Custom renderers.** This is a JSON-driven view. To use a registered
  renderer (Markdown, HTML, PDF), use the `fdpm://workbook/{id}/render/{target}`
  MCP resource or `fdpm render` directly.

## Files

```
web/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── server/
│   └── bridge.ts          # Node HTTP shim over `fdpm` CLI
└── src/
    ├── main.tsx
    ├── App.tsx            # routing via location.hash
    ├── api.ts             # typed fetch client
    ├── types.ts           # Workbook / Primitive / Relation
    ├── styles.css
    ├── components/
    │   ├── WorkbookList.tsx
    │   ├── WorkbookDetail.tsx     # selects a template by profile_id
    │   └── PrimitiveCard.tsx      # generic-template card
    └── templates/
        ├── index.ts                       # profile_id → renderer registry
        ├── Math.tsx                       # KaTeX-backed <MathBlock> / <MathInline>
        ├── ProseWithMath.tsx              # split prose on $...$ / $$...$$
        ├── FormalSpecificationView.tsx    # profile:formal-specification:*
        └── PlanningView.tsx               # profile:planning:*
```

## Math rendering

Templates that need to render math import `<MathBlock>` (display) or
`<MathInline>` from [`src/templates/Math.tsx`](./src/templates/Math.tsx).
Both wrap [KaTeX](https://katex.org)'s `renderToString`:

- KaTeX runs synchronously and bundles its fonts as base64 in
  `katex/dist/katex.min.css` (imported once in `main.tsx`), so there is
  no font-loading flash.
- Parse failures are caught and surfaced inline as a red badge with
  the original source — better than crashing the surrounding card.
  KaTeX's own `errorColor` is also wired so partial failures in
  mostly-valid expressions are visually marked.
- Security: the imperative API is called with `trust: false` (the
  default) and `strict: "warn"`. KaTeX's output is a sanitised HTML
  string by construction.

`fs:Equation` cards use this for any equation whose `notation` field is
`"latex"`; other notations (`mathml`, `pseudocode`, `ascii`) fall back
to the original `<pre><code>` block. The LaTeX source is also exposed
under a collapsible `<details>` for copy/paste and verification.

### Inline math in prose

Prose fields (`fs:Definition.formal`/`informal`, `fs:FormalProperty.claim`/
`intuition`/`caveat`, `fs:Assumption.statement`, `fs:Limitation.description`,
`fs:FailureMode.condition`/`recovery`, `fs:Phase.*` text fields,
`fs:Section.description`) run through `<ProseWithMath>` ([source](./src/templates/ProseWithMath.tsx)),
which splits the input on:

- `$$ ... $$` — display math (centred block, may span newlines)
- `$ ... $` — inline math (single-line; rejects empty bodies)

Both delimiters render through KaTeX. A literal dollar sign can be
written as `\$` (the backslash is consumed, not shown). Unclosed
dollars are treated as plain text — `$5 each` stays as `$5 each` —
so the parser is robust against false positives.

Newlines in the surrounding text are preserved as `<br>`.

## Templates

A *template* is a profile-aware React renderer for a workbook. The
[template registry](./src/templates/index.ts) maps `workbook.profile_id`
(by `startsWith` prefix) to a component. When `WorkbookDetail` loads a
workbook, it looks up the template; if none matches it falls back to
the generic group-by-type view.

| Profile prefix                     | Template                                                                        | What it does |
| ---------------------------------- | ------------------------------------------------------------------------------- | ------------ |
| `profile:formal-specification:`    | [`FormalSpecificationView`](./src/templates/FormalSpecificationView.tsx)        | Renders sections in number order with a sticky table of contents; opinionated cards for `fs:Equation` (KaTeX-rendered display math with collapsible LaTeX source + variables table), `fs:Phase` (input/output/procedure grid + Precedes chain), `fs:Definition`, `fs:FormalProperty` (claim/intuition/caveat), `fs:Assumption` (kind+status badges), `fs:Limitation`, `fs:FailureMode` (severity + OccursIn link), `fs:Citation` (DOI link), `fs:Actor`. All prose fields run through `<ProseWithMath>`, so `$M_\odot$` inside a definition or claim renders as math. Surfaces `fs:Cites` cross-references inline. Primitives outside any section land in an "Unfiled" section so nothing is hidden. |
| `profile:planning:`                | [`PlanningView`](./src/templates/PlanningView.tsx)                              | Iteration board: sticky TOC of iterations + milestones; per-iteration kanban grouped by status (In_progress / Blocked / Ready / In_review / Backlog / Done / Cancelled). Per-task cards show priority/executor/duration badges and inline cross-refs for `plan:DependsOn`, `plan:Verifies` (with AC status pill), and `plan:BlockedBy`. Top strip surfaces WorkBreakdown roots and Milestones; active blockers get a callout panel above the board. Tasks not bound to an iteration land in a "(no iteration)" column. |
| (any other)                        | generic group-by-type view                                                      | The original card grid — every primitive's fields rendered as a flat key/value list, grouped by `type_id`. |

### Adding a template

1. Create `src/templates/MyProfileView.tsx` exporting a default
   component that takes `{ data: WorkbookDetailResponse }`.
2. Register it in `src/templates/index.ts` with the `prefix` that
   matches the target `profile_id` (e.g. `profile:planning:` for any
   minor revision of the planning profile).
3. Add CSS scoped under a `.my-profile-` prefix in `styles.css` — the
   existing template uses `.fs-` for namespace isolation.
4. Run `npm run typecheck` and `npm run dev` to verify.

The template only sees the JSON the bridge returns (workbook +
primitives + relations). It cannot mutate state or call additional
endpoints; cross-profile reasoning that needs more than one workbook
should go through `fdpm` directly.
