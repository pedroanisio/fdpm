---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "scripts/generate-build-from-transfer.ts"
  date: "2026-05-05"
---

# Roadmap Unified v0.5.1 — build summary

Auto-generated companion to [`build-roadmap-v0.5.2.ts`](./build-roadmap-v0.5.2.ts). Re-run the
generator to refresh; do not hand-edit.

## Workbook

| Field | Value |
| --- | --- |
| id | `roadmap-v051` |
| name | Roadmap Unified v0.5.1 |
| profile_id | `profile:formal-specification:3.0` |
| primitives | 438 (360 valid, 78 known-invalid) |
| relations | 552 (552 valid, 0 known-invalid) |
| source | `roadmap-v0.5.2.transfer.json` |

## Files

| File | Role |
| --- | --- |
| `build-roadmap-v0.5.2.ts` | Entry script — `openHost` + `defineProject` + `commit` |
| `build-roadmap-v0.5.2.primitives.ts` | `PRIMITIVES` array (438 entries) |
| `build-roadmap-v0.5.2.relations.ts` | `RELATIONS` array (552 entries) |
| `build-roadmap-v0.5.2.summary.md` | This file |

## Primitives by type

| type_id | count |
| --- | --- |
| `fs:Assumption` | 27 |
| `fs:ChangeRecord` | 18 |
| `fs:Citation` | 54 |
| `fs:Contract` | 15 |
| `fs:Definition` | 42 |
| `fs:DesignDecision` | 54 |
| `fs:FailureMode` | 23 |
| `fs:FormalProperty` | 9 |
| `fs:Invariant` | 69 |
| `fs:Limitation` | 12 |
| `fs:Phase` | 22 |
| `fs:Principle` | 73 |
| `fs:Section` | 13 |
| `fs:TypeDefinition` | 7 |

## Relations by type

| type_id | count |
| --- | --- |
| `fs:ContainedIn` | 180 |
| `fs:Enforces` | 69 |
| `fs:GovernsTransition` | 15 |
| `fs:OccursIn` | 46 |
| `fs:Precedes` | 22 |
| `fs:References` | 208 |
| `fs:SupersededBy` | 1 |
| `fs:Validates` | 11 |

## Validity

Run with `--skip-invalid` to elide the entries below; relations pointing at skipped primitives are cascade-elided.

### Known-invalid primitives by type

| type_id | count |
| --- | --- |
| `fs:Assumption` | 2 |
| `fs:Definition` | 22 |
| `fs:Invariant` | 54 |

### Known-invalid primitive ids

| id | type_id |
| --- | --- |
| `assumption:h:05.02` | `fs:Assumption` |
| `assumption:h:19.01` | `fs:Assumption` |
| `invariant:i-01.02` | `fs:Invariant` |
| `invariant:i-01.05` | `fs:Invariant` |
| `invariant:i-02.01` | `fs:Invariant` |
| `invariant:i-02.03` | `fs:Invariant` |
| `invariant:i-03.01` | `fs:Invariant` |
| `invariant:i-03.02` | `fs:Invariant` |
| `invariant:i-03.03` | `fs:Invariant` |
| `invariant:i-04.01` | `fs:Invariant` |
| `invariant:i-04.02` | `fs:Invariant` |
| `invariant:i-05.01` | `fs:Invariant` |
| `invariant:i-05.02` | `fs:Invariant` |
| `invariant:i-05.03` | `fs:Invariant` |
| `invariant:i-05.04` | `fs:Invariant` |
| `invariant:i-06.01` | `fs:Invariant` |
| `invariant:i-06.02` | `fs:Invariant` |
| `invariant:i-07.01` | `fs:Invariant` |
| `invariant:i-07.02` | `fs:Invariant` |
| `invariant:i-07.03` | `fs:Invariant` |
| `invariant:i-07.04` | `fs:Invariant` |
| `invariant:i-07.05` | `fs:Invariant` |
| `invariant:i-08.01` | `fs:Invariant` |
| `invariant:i-08.02` | `fs:Invariant` |
| `invariant:i-08.03` | `fs:Invariant` |
| `invariant:i-08.04` | `fs:Invariant` |
| `invariant:i-08.05` | `fs:Invariant` |
| `invariant:i-09.01` | `fs:Invariant` |
| `invariant:i-09.02` | `fs:Invariant` |
| `invariant:i-10.01` | `fs:Invariant` |
| `invariant:i-10.02` | `fs:Invariant` |
| `invariant:i-10.03` | `fs:Invariant` |
| `invariant:i-11.01` | `fs:Invariant` |
| `invariant:i-11.02` | `fs:Invariant` |
| `invariant:i-12.01` | `fs:Invariant` |
| `invariant:i-12.02` | `fs:Invariant` |
| `invariant:i-12.03` | `fs:Invariant` |
| `invariant:i-12.04` | `fs:Invariant` |
| `invariant:i-13.01` | `fs:Invariant` |
| `invariant:i-13.02` | `fs:Invariant` |
| `invariant:i-14.01` | `fs:Invariant` |
| `invariant:i-14.02` | `fs:Invariant` |
| `invariant:i-14.03` | `fs:Invariant` |
| `invariant:i-15.01` | `fs:Invariant` |
| `invariant:i-15.02` | `fs:Invariant` |
| `invariant:i-16.01` | `fs:Invariant` |
| `invariant:i-16.02` | `fs:Invariant` |
| `invariant:i-16.03` | `fs:Invariant` |
| `invariant:i-17.01` | `fs:Invariant` |
| `invariant:i-17.02` | `fs:Invariant` |
| `invariant:i-18.01` | `fs:Invariant` |
| `invariant:i-18.03` | `fs:Invariant` |
| `invariant:i-19.01` | `fs:Invariant` |
| `invariant:i-20.01` | `fs:Invariant` |
| `invariant:i-20.02` | `fs:Invariant` |
| `invariant:i-21.01` | `fs:Invariant` |
| `statecomp:s-activation` | `fs:Definition` |
| `statecomp:s-architecture` | `fs:Definition` |
| `statecomp:s-backend` | `fs:Definition` |
| `statecomp:s-cloud` | `fs:Definition` |
| `statecomp:s-compliance` | `fs:Definition` |
| `statecomp:s-data` | `fs:Definition` |
| `statecomp:s-design_system` | `fs:Definition` |
| `statecomp:s-foundation` | `fs:Definition` |
| `statecomp:s-identity` | `fs:Definition` |
| `statecomp:s-integrations` | `fs:Definition` |
| `statecomp:s-launch` | `fs:Definition` |
| `statecomp:s-launch_readiness` | `fs:Definition` |
| `statecomp:s-marketing` | `fs:Definition` |
| `statecomp:s-mobile` | `fs:Definition` |
| `statecomp:s-observability` | `fs:Definition` |
| `statecomp:s-performance` | `fs:Definition` |
| `statecomp:s-problem_frame` | `fs:Definition` |
| `statecomp:s-product_def` | `fs:Definition` |
| `statecomp:s-sales` | `fs:Definition` |
| `statecomp:s-security_audit` | `fs:Definition` |
| `statecomp:s-testing` | `fs:Definition` |
| `statecomp:s-web` | `fs:Definition` |

### Known-invalid relation ids

_None._

## Run

```bash
FDPM_DATA_DIR=/tmp/rebuild npx tsx scripts/build-roadmap-v0.5.2.ts
FDPM_DATA_DIR=/tmp/rebuild npx tsx scripts/build-roadmap-v0.5.2.ts --skip-invalid
```
