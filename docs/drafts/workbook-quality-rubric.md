---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Opus 4.7 (1M context) via Claude Code"
  date: "2026-05-07"
---

# FDPM Workbook Quality Rubric — 100/100 Golden Standard

**Status:** DRAFT. Local working document. Two open items flagged at end need
operator decision before this rubric is normative.

**Scope:** defines what "100/100" means for an FDPM workbook (an instance
authored against a plugin's profile), plus the derived plugin score (a plugin
is good iff its bundled fixture workbook scores well + its manifest contract
holds). The rubric is **objective and fully automatable** — every check is a
function of `(workbook, profile, host)` with no human judgement.

## Disclaimer

This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](../../DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.

---

## 1. Why workbook-first, not plugin-first

In FDPM:

- A **plugin** registers a **profile** (a typed schema for primitives, relations,
  validators, renderers).
- A **workbook** is an **instance** authored *under* a profile — a graph of typed
  primitives + relations.

A plugin is only useful through the workbooks it enables. Scoring a plugin by
LOC, capability count, or surface area would be a vanity metric. The rubric is
therefore workbook-first: **every plugin is scored via the canonical fixture
workbook(s) it ships, plus a smaller set of plugin-only obligations** (manifest
correctness, manifest-runtime parity, test surface, README).

This mirrors the existing precedent in this codebase: the
[`CaseSolidityReportSchema`](../../static/schemas/business-deck.ts) at line ~2739
already scores the *content* of a business-deck workbook (claim coverage,
objection rebuttals, rehearsal adequacy) and produces a grade ladder
`inadmissible / weak / adequate / strong / airtight`. **This rubric reuses the
exact same grade ladder** so the two scoring systems stay vocabulary-compatible.

---

## 2. L1 — Workbook score (0–100, six axes)

Applied to a single workbook instance. Every check is mechanical.

| # | Axis                          | Pts |  Hard gate? | Computed by                                                                                       |
| - | ----------------------------- | --: | :---------: | ------------------------------------------------------------------------------------------------- |
| A | Schema conformance            |  20 |     YES     | Iterate primitives + relations; parse each field-set against its `PrimitiveTypeDef` / `RelationTypeDef` (Zod) and `metadata_schema` |
| B | Validation pipeline (§7) clean |  20 | YES on errors | `host.validateProject(id)` — 0 error-severity findings; warnings cost 1 pt each, capped at 10        |
| C | Reference integrity            |  15 |     YES     | Every relation's `from`/`to` resolves; primitive fields with `id_format`/`references` resolve; DNIS ancestry acyclic + root-reachable when `dnis` profile composed |
| D | Coverage of profile surface    |  20 |     NO      | Of profile's active primitive types, ≥1 instance of each = full marks; (instantiated/total)·20 otherwise. Same for relation types whose `from_types × to_types` cell can be filled |
| E | Renderability                  |  15 | YES per renderer touched | For each renderer registered for this profile: `host.plugins.runRenderer()` succeeds, output non-empty, output `findings[]` has 0 errors. 5 pts/renderer, capped at 15 |
| F | Determinism & provenance       |  10 |     YES     | Run each renderer twice; SHA-256 of `bytes` must match. Workbook's primitives + relations carry stable UIDs (per SPEC-UID); `_meta` block (when present) records `profile_id` + `profile_version` |

**Excellence signals (each is a boolean):**

- E1: 100% relation-type coverage (axis D == 20)
- E2: 0 warning findings (axis B == 20)
- E3: All renderers byte-deterministic across **3** consecutive runs, not 2
- E4: Bundled Vitest test exists and passes against the workbook
- E5: All instantiated primitive types have non-empty `description` strings on every `field` *(View-Page legibility — `[howto-paraphrased]`)*
- E6: A frozen golden fixture (`generated/<id>.json`) hash matches a re-rendered run

**Grade ladder** (mirrors `CaseSolidityGradeSchema`):

| Grade          | Score   | Conditions                                                              |
| -------------- | ------: | ----------------------------------------------------------------------- |
| `inadmissible` | < gates | Any hard gate failed                                                    |
| `weak`         |  60–74  | Gates pass, multiple soft deductions                                    |
| `adequate`     |  75–89  | Gates pass, no excellence signals                                       |
| `strong`       |  90–98  | Gates pass + ≥3 excellence signals                                      |
| `airtight`     | 99–100  | Gates pass + all excellence signals                                     |

---

## 3. L2 — Plugin score (0–100)

50% inherited from the bundled fixture's L1 score, 50% from plugin-only
obligations grounded in [`plugins/_starter/EDUCATION.md`](../../fdpm-cli/plugins/_starter/EDUCATION.md).

| #   | Axis                       | Pts | Check                                                                                                                                                                                  |
| --- | -------------------------- | --: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Fixture workbook score     |  50 | The plugin's bundled canonical workbook scores `strong+` under L1. Score = `min(50, L1_score / 2)`.                                                                                    |
| P2  | Manifest correctness       |  10 | `parseManifest` accepts the manifest. `host_compatibility.fdpm` satisfied by `SPEC_CORE_VERSION`. No duplicate `(capability_id, local_name)`. Each `cap:lifecycle-hook` `local_name` ∈ `{on-install, on-enable, on-disable, on-uninstall}` |
| P3  | Manifest-runtime parity    |  10 | After `host.load()`, every manifest capability is registered by `activate()` (compare `manifest.capabilities[]` against the plugin's `PluginContributions`).                          |
| P4  | Permission minimality      |   5 | No declared permission is unused. `render:server` declared without any `cap:renderer` registered → −1 per orphan, capped at 5                                                          |
| P5  | Profile-id stability       |   5 | If git history shows the profile's `id` changed, the manifest's `version` major must have bumped. *`[howto-paraphrased]`*                                                              |
| P6  | Test surface               |  10 | `tests/<plugin-id>-plugin.test.ts` (or equivalent) exists and passes the three-tier shape from [tests/starter-plugin.test.ts:13-50](../../fdpm-cli/tests/starter-plugin.test.ts#L13-L50): activation (3) + validation pos+neg (3) + renderer determinism (4) |
| P7  | Documentation obligations  |  10 | `README.md` exists, references `DISCLAIMER.md`, contains a "What it ships" capability table. Every `primitive_types[i].description` non-empty (View-Page satisfaction). *`[howto-paraphrased]`* |

Grade ladder identical to L1.

---

## 4. Open items

These two questions need an operator decision **before** this rubric is locked.

### Q1. `spec-plugin-authoring-howto` workbook source

[`EDUCATION.md`](../../fdpm-cli/plugins/_starter/EDUCATION.md) references a
*workbook* called `spec-plugin-authoring-howto` (loaded via `fdpm workbook get`)
that contains the §7 "Documentation Obligations for Approval" section. The
source artifact for that workbook is **not present** in `docs/specs/` or any
build script under `scripts/`. The wording for items P5, P7 and excellence
signal E5 is therefore paraphrased from `EDUCATION.md` and tagged
*`[howto-paraphrased]`*. **Decision needed:** locate the workbook source (or
elevate `EDUCATION.md`'s wording to normative status) before P5/P7/E5 are
locked.

### Q2. Lifecycle-hook exemption for composition plugins

[`EDUCATION.md`](../../fdpm-cli/plugins/_starter/EDUCATION.md) says the four
`cap:lifecycle-hook` declarations are non-deletable. But the `dnis`,
`formal_specification_dnis`, and `spec_authoring_dnis` plugins — which compose
existing profiles without registering new ones — declare 0–4 hooks
inconsistently. The rubric currently penalises all three under P2/P3.

**Decision needed:** carve out *or* enforce uniformly.

- **Option A (enforce)**: penalty stands; fix the three composition manifests.
- **Option B (carve out)**: P2/P3 sub-rule — lifecycle hooks required only when
  the plugin registers a *root* profile (`extends: []`). Composition profiles
  are exempt.

I will not pick — these bind future plugin authors differently.

---

## 5. Implementation

A single module exposes both scores:

```ts
// src/quality/score-workbook.ts
export interface WorkbookScoreReport { ... }   // see §2
export interface PluginScoreReport   { ... }   // see §3

export async function scoreWorkbook(
  host: Host,
  workbookId: string
): Promise<WorkbookScoreReport>;

export async function scorePlugin(
  host: Host,
  pluginId: string,
  opts?: { fixtureWorkbookId?: string }
): Promise<PluginScoreReport>;
```

CLI surface: `fdpm quality score <workbook-id>` and
`fdpm quality score-plugin <plugin-id>`. Both emit JSON reports + a one-line
human summary. Tests live at `tests/quality-score-contract.test.ts`.

---

## 6. References

- [`src/plugin/manifest.ts`](../../fdpm-cli/src/plugin/manifest.ts) — capability set, lifecycle hook names, permissions
- [`src/plugin/runtime.ts:614`](../../fdpm-cli/src/plugin/runtime.ts#L614) — `runRenderer()` and the §6.5 verification gate
- [`src/core/host.ts:1566`](../../fdpm-cli/src/core/host.ts#L1566) — `validateProject()`, the §7 pipeline entry point
- [`static/schemas/business-deck.ts:2680`](../../static/schemas/business-deck.ts#L2680) — `CaseSolidityGrade` ladder
- [`plugins/_starter/EDUCATION.md`](../../fdpm-cli/plugins/_starter/EDUCATION.md) — §7 documentation obligations (paraphrased)
- [`tests/starter-plugin.test.ts:13-50`](../../fdpm-cli/tests/starter-plugin.test.ts#L13-L50) — three-tier test pattern P6 enforces
