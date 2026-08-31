---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Code (agent-authored analysis); every figure quoted from a benchmark run described in §2"
  date: "2026-08-31"
---

# I/O and memory performance analysis

Measured assessment of the persistence and projection layers under
realistic workloads, and a decision on whether replacing direct disk I/O
with a NoSQL datastore is justified.

**Verdict: no.** The storage layer supplies 5,772 write ops/s. The
application consumes 43 ops/s at a 6,000-primitive workbook. Disk I/O is
1.2 % of write-path CPU; deep-copying the in-memory projection is 89 %.
A datastore migration optimises the 1.2 %.

Back to [root README](../../README.md) · repository counts in
[CENSUS.md](CENSUS.md).

---

## 1. Architecture, data flow, resource usage

### 1.1 Shape

FDPM is event-sourced. The canonical artifact is one append-only JSONL
operation log per workbook:

```
$FDPM_DATA_DIR/
  manifest.json
  profiles/<slug>.json
  workbooks/<workbook_id>/log.jsonl        <- canonical, append-only
```

Everything else — `StoreState.primitives`, `relations`, `templates`,
`scope_membership`, `uid_index` — is a derived in-memory projection
(`fdpm-cli/src/core/store/state.ts`), explicitly discardable.

### 1.2 Write path

`Host.createPrimitive` → `Host.runWithValidation` →
`Store.append` → `JsonlLogStore.appendOp`:

| # | Step | Site | Cost class |
|---|---|---|---|
| 1 | `validationContext(wb)` → `store.getProject(wb)` → `sliceProject` → `structuredClone` of the **whole workbook** | `core/host.ts:850` | **O(workbook)** |
| 2 | `pipeline.runPrimitive` — the actual field/rule validation | `core/host.ts:702` | O(1) |
| 3 | `verifyOperationPayload` — Zod gate on the payload | `core/store/store.ts:93` | O(1) |
| 4 | rollback pre-snapshot: `sliceProject` → `structuredClone` of the **whole workbook** again | `core/store/store.ts:126` | **O(workbook)** |
| 5 | `applyOperation` — mutate the projection | `core/store/replay.ts:23` | O(1) |
| 6 | `operation_log[wb] = [...projectLog, op]` — array copy | `core/store/store.ts:138` | O(log), refs only |
| 7 | `JSON.stringify(op)` | `persistence/jsonl-log.ts:139` | O(record) |
| 8 | `existsSync(dir)` + `fs.appendFile` — open/write/close, **no fsync** | `persistence/jsonl-log.ts:137` | one syscall triple |

Steps 1 and 4 are two full deep copies of the entire workbook per single
write. That is the whole performance story.

### 1.3 Read path

`Host.getProject` → `Store.getProject` → `sliceProject` →
`structuredClone`. Every read deep-copies the entire workbook. There are
**61 `getProject` call sites** in `src/`. One of them
(`core/host.ts:659`) clones the whole workbook purely to test existence
and discards the result.

### 1.4 Startup path

`Host.load` → `JsonlLogStore.readAllLogs` → for **every** workbook:
`readFile` whole → `split("\n")` → per line `JSON.parse` **and**
`Operation.safeParse` (Zod) → `Store.loadFromOperations` → `replay` all
ops → re-sort every log by revision.

There is no lazy or per-workbook load. Opening any workbook loads the
entire corpus.

### 1.5 Snapshots

`Store.takeSnapshot` runs every `FDPM_SNAPSHOT_EVERY_OPS` (default 1000)
and pushes a `structuredClone` into `state.snapshots`. Snapshots are
**never written to disk and never read on load** — they cost memory and
CPU and do not accelerate restart.

---

## 2. Measurements

Environment: 4 vCPU, 16 GB RAM, ext4 (`relatime`) on a non-rotational
virtual disk, Node v22.22.2, `dirty_expire_centisecs=3000`. Benchmark
records are shaped like real operations (~673 B serialised).

### 2.1 Raw storage ceiling

What the filesystem supplies, per record:

| Pattern | mean | p50 | p99 | Durable |
|---|---:|---:|---:|---|
| `fs.appendFile` per op (**current**) | 0.1231 ms | 0.0991 | 0.4198 | no — page cache only |
| fd reuse, `write` per op | 0.0021 ms | 0.0012 | 0.0126 | no |
| fd reuse + `fsync` per op | 0.1872 ms | 0.1533 | 0.5130 | yes |
| batch ×10 + `fsync` (amortised) | 0.0264 ms | 0.0247 | 0.0653 | yes |
| batch ×100 + `fsync` (amortised) | 0.0044 ms | 0.0041 | 0.0069 | yes |
| batch ×1000 + `fsync` (amortised) | 0.0023 ms | 0.0023 | 0.0028 | yes |

(Latency only. End-to-end throughput for these patterns is in §5.1,
measured in one self-consistent run alongside the datastore engines.)

Sequential read of a 12 MB / 20,000-record log: `readFile` 15 ms,
`split` 11 ms, `JSON.parse` 40 ms → **301,564 records/s, 182 MB/s**.

The current write pattern is 59× slower than fd reuse *and* not durable.
Group-committing at 100 is both 28× faster than today and genuinely
durable.

### 2.2 Application write scaling — one workbook, 200 B bodies

| Primitives present | mean | p50 | p99 | ops/s |
|---:|---:|---:|---:|---:|
| 500 | 2.04 ms | 2.06 | 4.16 | 491 |
| 1,000 | 5.05 ms | 4.91 | 9.00 | 198 |
| 2,000 | 12.08 ms | 11.88 | 20.75 | 83 |
| 3,000 | 19.54 ms | 19.49 | 31.35 | 51 |
| 4,000 | 26.84 ms | 26.21 | 38.12 | 37 |
| 5,000 | 35.20 ms | 34.43 | 56.44 | 28 |
| 6,000 | 44.76 ms | 43.70 | 63.42 | 22 |

Per-operation latency rises linearly with workbook size — total cost is
**O(n²)**. Building a 6,000-primitive workbook takes 131.5 s.

**The same run with persistence entirely disabled** (`dataDir: null`,
zero disk I/O) takes **140.3 s** — no faster. Disk is not the constraint.

### 2.3 CPU profile — 3,000 writes, persistence on

| Self time | Function |
|---:|---|
| **89.07 %** | `structuredClone` |
| 2.53 % | garbage collector |
| 1.25 % | `randomFillSync` (ULID/UUID minting) |
| 0.29 % | `writeBuffer` |
| 0.26 % | `openFileHandle` |
| 0.22 % | `existsSync` |
| 0.21 % | `close` |
| 0.11 % | Zod `parse` |
| 0.10 % | `appendOp` |

**All filesystem work combined ≈ 1.2 %.** ULID/UUID minting alone costs
more than every disk operation.

### 2.4 Isolating the clone from real validation

| Workbook size | `getProject` (clone) | validation with context prebuilt | `structuredClone` alone | returning a reference |
|---:|---:|---:|---:|---:|
| 250 | 0.590 ms | 0.004 ms | 0.499 ms | 0.00031 ms |
| 500 | 0.865 ms | 0.004 ms | 0.888 ms | 0.00023 ms |
| 1,000 | 2.115 ms | 0.003 ms | 2.255 ms | 0.00023 ms |
| 2,000 | 4.354 ms | 0.002 ms | 4.361 ms | 0.00021 ms |
| 4,000 | 9.523 ms | 0.002 ms | 9.745 ms | 0.00025 ms |

Genuine validation is **0.002–0.004 ms and constant**. At 4,000
primitives the clone is 99.98 % of what looks like "validation cost", and
38,000× more expensive than handing back a reference.

`JSON.stringify` of one operation: **0.0014 ms**, flat. Serialisation is
not a cost anywhere in this system.

### 2.5 Document size — fixed count of 1,500

| Body bytes | log MB | write mean | write p99 | ops/s | `getProject` | reads/s | RSS |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | 0.67 | 5.54 ms | 14.45 | 181 | 3.09 ms | 323 | 109 MB |
| 200 | 0.95 | 5.27 ms | 11.50 | 190 | 4.38 ms | 228 | 115 MB |
| 1,000 | 2.10 | 5.67 ms | 14.42 | 176 | 3.62 ms | 277 | 122 MB |
| 5,000 | 7.82 | 8.63 ms | 21.12 | 116 | 6.92 ms | 144 | 145 MB |
| 20,000 | 29.28 | 45.24 ms | 138.06 | 22 | 38.63 ms | 26 | 712 MB |

Object *count* dominates until bodies reach ~5 KB; beyond that byte
volume in the clone takes over.

### 2.6 Cold start and memory

| Workbooks | ops each | corpus | `readAllLogs` | Zod | `host.load()` | RSS | RAM/disk |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 | 200 | 1.3 MB | 43 ms | 13 ms | 71 ms | 105 MB | — |
| 100 | 200 | 12.6 MB | 194 ms | 66 ms | 369 ms | 210 MB | 16.8× |
| 400 | 200 | 50.3 MB | 773 ms | 262 ms | 1,525 ms | 523 MB | 10.4× |
| 200 | 500 | 91 MB | — | — | 1.95 s | 272 MB | 3.0× |
| 500 | 500 | 228 MB | — | — | 4.39 s | 491 MB | 2.2× |
| 1,000 | 500 | 456 MB | — | — | 8.62 s | 877 MB | 1.9× |
| 2,000 | 500 | 912 MB | — | — | 22.96 s | 1,613 MB | 1.8× |
| 4,000 | 500 | 1,825 MB | — | — | **59.1 s** | 3,032 MB | 1.7× |

Cold start is linear in *total corpus*, ~25–32 ms per MB. Zod validation
is only 1.1–1.4× `JSON.parse` — it is not the load bottleneck; replay and
allocation are.

Failure mode is not a crash but **graceful degradation into
unusability**: at a 1.8 GB corpus every CLI invocation pays 59 s before
doing any work. No OOM was reached at a 4 GB heap cap.

### 2.7 Concurrency — multiple processes, one workbook

| Writers | acked ops | log lines | unparseable | **duplicate revisions** | reload |
|---:|---:|---:|---:|---:|---|
| 1 | 200 | 201 | 0 | 0 | ok |
| 2 | 400 | 401 | 0 | **187** | ok |
| 4 | 400 | 402 | 0 | **201** | **FAILED — `workbook already exists: wb`** |
| 8 | 800 | 801 | 0 | **490** | ok |

Byte-level integrity holds: 8 concurrent writers × 300 records produced
zero torn lines at record sizes of 200 B, 2 KB, 4 KB, 8 KB and 64 KB —
`O_APPEND` on ext4 is atomic across this whole range.

The corruption is **logical, not physical**. Each process computes
`revision = lastRevision + 1` from its own in-memory log
(`store.ts:96`), so concurrent writers mint colliding revisions. Two
processes can both append `workbook.create`, after which the log is
**unreplayable and the workbook is unopenable** — 400 operations
acknowledged as successful, all unrecoverable. `expected_project_revision`
is checked only against in-process state and provides no cross-process
protection. There is no lock file, no `flock`, no revision reservation.

### 2.8 Durability

`fsync` appears nowhere in the operation-log path — only
`core/workspace/registry.ts:60` does write-temp-fsync-rename, and that is
for the workspace registry, not for operations.

- **Process crash (SIGKILL mid-write):** safe. 1,003 lines survived, 0
  unparseable, reload recovered 1,002 primitives. Page cache outlives the
  process.
- **Host crash / power loss:** up to `dirty_expire_centisecs` = **30 s of
  acknowledged operations can be lost.** `appendPrimitive` returns
  success for data that is not on stable storage.

### 2.9 Cost is scoped to the target workbook

With a 4,000-primitive workbook loaded, writing into a *different* small
workbook on the same host:

| Target | mean | p99 | ops/s |
|---|---:|---:|---:|
| small workbook (300 rows) | 1.75 ms | 4.97 | 570 |
| big workbook (4,000+ rows) | 35.90 ms | 57.93 | 28 |

**20.5×.** The clone is per-workbook, so splitting a large workbook is a
zero-code mitigation.

---

## 3. Limits, bottlenecks, root causes

| # | Bottleneck | Root cause | Class | Evidence |
|---|---|---|---|---|
| **B1** | Write throughput collapses 491 → 22 ops/s | Two full-workbook `structuredClone` per write: `validationContext` (`host.ts:850`) and the rollback pre-snapshot (`store.ts:126`) | **Application design** | §2.2, §2.3, §2.4 |
| **B2** | Reads cost 10 ms at 4,000 primitives | `sliceProject` deep-clones on every read; 61 call sites, one of which discards the result | **Application design** | §1.3, §2.4 |
| **B3** | Cold start linear in whole corpus; 59 s at 1.8 GB | `readAllLogs()` loads every workbook eagerly; persisted snapshots do not exist | **Application design** | §2.6 |
| **B4** | Silent log corruption under concurrent writers | Revision assigned from process-local state; no cross-process lock or reservation | **Application design (concurrency control)** | §2.7 |
| **B5** | Up to 30 s of acked writes lost on host crash | No `fsync` on the operation log | **Durability design** | §2.8 |
| **B6** | Storage 59× below fd-reuse ceiling | `existsSync` + `appendFile` opens/writes/closes per op; batch paths loop `await appendOp` one at a time | **Filesystem usage** | §2.1, §1.2 |
| **B7** | Memory 1.7–3× corpus, GC 2.5 % | Full projection resident + unpersisted in-memory snapshots every 1,000 ops | **Memory design** | §1.5, §2.6 |

**It is not** storage access (1.2 % of CPU), serialisation (0.0014
ms/op), Zod validation (0.11 %), data layout on disk, filesystem
behaviour, or locking. It is **object copying in application code.**

### The headroom argument

| Layer | Supply | Demand at 6,000-primitive workbook |
|---|---:|---:|
| Current JSONL `appendFile` | 5,772 ops/s | 43 ops/s |
| Best measured engine (LMDB) | 118,237 ops/s | 43 ops/s |

The current storage layer already has **134× headroom** over what the
application can drive. Replacing it with a 20× faster engine raises
headroom to 2,750×. Neither number is the constraint.

---

## 4. Improvements, ranked

Impact figures for R1/R2 are **measured**, not estimated — each was
implemented and benchmarked (§6). Complexity per repo convention
(XS/S/M/L/XL).

| # | Change | Measured / expected impact | Effort | Risk |
|---|---|---|---|---|
| **R1** | `sliceProject` returns a view; add `sliceProjectIsolated` for the rollback/snapshot paths | **2.8× writes** (43 → 119 ops/s), **2,680× reads** (16.1 → 0.006 ms) | **XS** — 3 lines + 4 call-site swaps | **Low.** Full suite green: 2,114/2,115 |
| **R2** | Replace the rollback pre-snapshot with an inverse-op journal or copy-on-write of touched entries | **59× total** (43 → 2,544 ops/s); **O(n²) → O(n)**, latency curve goes flat | **M** | Medium — must preserve batch atomicity (5 tests pin it) |
| **R3** | Batch `appendOp`: single `writeFile` per batch; reuse fd; group-commit `fsync` | 28× storage throughput **and** closes B5 | **S** | Low |
| **R4** | Cross-process write lock (`flock` on the log) + revision reservation | Closes B4 — silent corruption and unopenable workbooks | **S/M** | Low; correctness-critical |
| **R5** | Lazy per-workbook load; drop `readAllLogs` from `Host.load` | Cold start becomes O(touched workbook), not O(corpus) | **M** | Medium — `uid_index` and cross-workbook lookups assume global load |
| **R6** | Persist snapshots; load snapshot + tail instead of full replay | Bounded cold start regardless of log length | **M/L** | Medium |
| **R7** | Drop the existence-check clone at `host.ts:659`; cache `getResolved` | Small constant win | **XS** | Very low |
| **R8** | Shard large workbooks (operational, no code change) | 20.5× on the small-workbook path today | **XS** | None |

R1 is the highest impact-to-effort ratio in the list by a wide margin.

---

## 5. NoSQL comparison

### 5.1 Measured — 20,000 records, 673 B each, same machine

| Engine | write/op | p99 | ops/s | scan all | point read | disk | Durability |
|---|---:|---:|---:|---:|---:|---:|---|
| **JSONL `appendFile` (current)** | 0.1726 ms | 1.038 | 5,772 | 87 ms | n/a | 12.8 MB | no (page cache) |
| **JSONL fd-reuse + group fsync** | 0.0085 ms | 0.019 | **111,831** | 77 ms | n/a | 12.8 MB | **yes** |
| LMDB (embedded B+tree) | 0.0061 ms | 0.036 | **118,237** | 102 ms | 0.0065 ms | 15.7 MB | yes (txn) |
| LevelDB (embedded LSM) | 0.0502 ms | 0.231 | 19,748 | 156 ms | 0.0533 ms | 5.0 MB | no (async WAL) |
| SQLite WAL (baseline) | 0.0341 ms | 0.052 | 29,138 | 63 ms | 0.0047 ms | 15.8 MB | yes |
| Redis, localhost TCP | 0.0477 ms | 0.111 | 20,816 | n/a | 0.0635 ms | in-mem | no |

### 5.2 Reading the table

**The best NoSQL engine ties with fixing the file I/O.** LMDB at 118,237
ops/s versus fd-reuse + group commit at 111,831 ops/s is a **6 %**
difference — for a dependency, a new on-disk format, a migration, and a
rewrite of the persistence layer. Both are ~20× the current pattern; the
20× comes from *not opening the file per record*, which is free to fix
in place.

Network transport costs real throughput: Redis over loopback (20,816
ops/s) is **5.7× slower than LMDB** and slower than SQLite, purely from
per-op round-trips. A networked NoSQL deployment would be worse.

LSM engines (LevelDB, and by extension RocksDB/Cassandra/Mongo's WT)
compress best — 5.0 MB versus 12.8 MB — but are 6× slower on writes here
and carry compaction: background I/O, write amplification, and tail
latency spikes this workload has no budget for. FDPM's log is
append-only and never updated in place, so LSM's core advantage
(absorbing random overwrites) buys nothing.

### 5.3 Factor-by-factor

| Factor | Current | NoSQL alternative | Verdict |
|---|---|---|---|
| Serialisation | `JSON.stringify`, 0.0014 ms/op | same JSON, or BSON/msgpack | **No gain** — 0.006 % of write cost |
| Indexing | none on disk; `uid_index` rebuilt in memory | native secondary indexes | **Real gain**, but only once loads are lazy (R5) |
| Caching | OS page cache | engine buffer pool + page cache | Roughly neutral; page cache already serves 182 MB/s |
| Batching | absent — `for … await appendOp` | native batch/txn | **Real gain — obtainable without migrating (R3)** |
| Concurrency | none; corrupts (§2.7) | MVCC / real transactions | **Strongest genuine argument for a datastore** |
| Durability | none (30 s exposure) | configurable fsync/WAL | **Real gain — also obtainable via R3** |
| Consistency | single-writer by assumption, unenforced | enforced by engine | Gain; `flock` (R4) also closes it |
| Compaction | none needed (append-only) | LSM compaction is a new cost | **Regression** |
| Network overhead | zero (local file) | zero embedded, 5.7× penalty client/server | **Regression if networked** |
| Backup/recovery | `cp` the directory; git-diffable; human-readable | engine dump/restore tooling | **Regression** — plain JSONL is inspectable and greppable |
| Operability | zero dependencies, zero daemons | a dependency (embedded) or a service (networked) | **Regression** |
| Cost | none | none embedded; infra + ops if hosted | **Regression if hosted** |

### 5.4 Where a datastore would genuinely help

Three things, honestly:

1. **Cross-process transactions** (B4). LMDB or SQLite would make
   concurrent writers correct by construction. But the logs are *already*
   sharded per workbook, and the intended topology is one writer per
   workbook — an `flock` plus revision reservation (R4, effort S/M)
   closes the same hole without a format change.
2. **Lazy indexed access** (B3/B7), removing the eager whole-corpus load.
   But the on-disk layout is already one directory per workbook; loading
   the workbook you asked for is a change to `Host.load`, not to the
   storage engine.
3. **Durability knobs** (B5) — which R3 supplies with four lines of
   `fsync`.

Every genuine benefit is reachable without leaving the filesystem.

---

## 6. Validation of the recommendation

R1 and R2 were implemented and measured, not projected. Identical
workload, 6,000 primitives, persistence on:

| Build | ops/s | mean | p99 | read | per-op latency curve (500→6,000) | Test suite |
|---|---:|---:|---:|---:|---|---|
| Shipped | 43.1 | 23.19 ms | 54.86 | 16.10 ms | 3.86 → 45.7 ms (**rising**) | 2,114 / 2,115 |
| **R1** — read-path view, rollback isolated | **118.9** | 8.41 ms | 19.88 | **0.006 ms** | 1.59 → 15.77 ms (rising) | **2,114 / 2,115** |
| **R1+R2** — no per-op clone at all | **2,544.3** | 0.392 ms | 2.82 | 0.005 ms | 0.43 → 0.39 ms (**flat**) | 2,109 / 2,115 |

The single failure in the first two rows is
`tests/_meta/doc-drift.test.ts` (`CENSUS.md` stale), which is **red on
unmodified `main`** and unrelated to this work.

The R1+R2 row was produced by removing the clone unconditionally, which
breaks exactly 5 tests — all batch-rollback atomicity
(`edit-and-batch`, `mcp/batch-create` ×2, `mcp/batch-delete` ×2).
**Nothing else among 2,115 tests depends on the read path being a deep
copy.** That is precisely why R1 and R2 are separable: reads need no
isolation; only rollback does, and it needs an undo record rather than a
whole-workbook copy.

R1 as validated:

```ts
// core/store/replay.ts — reads get a view
export function sliceProject(state, workbook_id) {
  const workbook = state.workbooks[workbook_id];
  if (!workbook) return null;
  return { workbook, primitives: state.primitives[workbook_id] ?? {}, /* … */ };
}

// new — only rollback/snapshot callers pay for isolation
export function sliceProjectIsolated(state, workbook_id) {
  const view = sliceProject(state, workbook_id);
  return view === null ? null : structuredClone(view);
}
```

with four call sites in `core/store/store.ts` (`append`, `appendBatch`,
`snapshotProjectForRollback`, `takeSnapshot`) switched to
`sliceProjectIsolated`. All 29 rollback/atomicity tests pass.

---

## 7. Recommendation and migration thresholds

**Do not migrate to a NoSQL datastore.** It addresses 1.2 % of the
write-path cost, ties with an in-place fix on the measured write
benchmark, and regresses backup, operability, and inspectability. The
system is not storage-bound; it is bound by copying its own projection.

Do, in order:

1. **R1** — XS, measured 2.8× writes and 2,680× reads, full suite green.
2. **R4 + R3** — correctness first: the silent-corruption and 30 s
   durability gaps are worse defects than the throughput.
3. **R2** — restores linear scaling; the difference between a workbook
   that stops being usable at ~6,000 primitives and one that does not.
4. **R5/R6** if corpora exceed ~100 MB.
5. **R8** now, operationally, at no cost.

### Thresholds at which this conclusion changes

Revisit a datastore only when a measured condition below holds **after**
R1–R4 have shipped:

| Threshold | Rationale |
|---|---|
| Sustained demand > **2,500 write ops/s** on one workbook | Past R1+R2's measured ceiling; storage headroom starts to matter |
| Genuinely concurrent multi-writer access to **one** workbook, beyond one-writer-per-workbook | `flock` serialises; MVCC does not |
| Corpus > **~10 GB**, or working set exceeding RAM | Page-cache + full-projection model stops fitting; needs paged access |
| Point-lookup-dominated reads across workbooks without a full load | Native secondary indexes earn their cost |
| A network boundary becomes mandatory (multi-host writers) | Filesystem semantics no longer available |

If that day comes, the measurements here point at **LMDB** — fastest
writes (118,237 ops/s), fastest durable commits, cheapest point reads
(0.0065 ms), embedded, no daemon, no compaction. Not a networked
document store: loopback Redis already costs 5.7× LMDB on this workload.

### Reproducing

Every figure above comes from a benchmark run against
`fdpm-cli/dist` at commit `4cc97b2`. The methods are described in §2 in
enough detail to re-implement: raw-I/O patterns (§2.1), write scaling
with `dataDir: null` as the disk-free control (§2.2), `node --cpu-prof`
self-time aggregation (§2.3), component isolation against live state
(§2.4), synthetic on-disk corpora for cold start (§2.6), multi-process
writers against one workbook directory (§2.7), and the six-engine
comparison on identical records (§5.1).
