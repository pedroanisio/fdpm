---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Opus 4.7 via Claude Code"
  date: "2026-05-04"
---

# Changelog

All notable changes to `@fdpm/cli` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this workbook adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
The SDK surface re-exported from `src/sdk.ts` carries its own
`0.x` stability note documented inside the file; breaking changes to
the SDK shape are still recorded here so embedders see them on
upgrade.

## [Unreleased]

> **Release state.** No `@fdpm/cli` version has ever been released or tagged.
> `package.json` now reads `1.2.0`, aligned with the runtime's
> `HOST_VERSION`, as the first public-release candidate. The earlier `1.1.0`
> value was a development version rather than a shipped release, so there is
> still no truthful historical boundary at which to split this section.
> `@fdpm/zod-bridge` is versioned separately and does have releases; its
> newest git tag is `@fdpm/zod-bridge@0.2.0` while the package is at `0.4.0`,
> so **0.3.0 and 0.4.0 are documented but untagged**. Cutting tags remains an
> operator action. The 2026-08-29 doc-hygiene finding is preserved here with
> the 2026-08-30 candidate state made explicit rather than inferred.


### Added

#### `id-ref` fields are now resolved, and a delete says what it would orphan

`kind: "id-ref"` with a mandatory `ref_type_id` has been in the meta-model
since the beginning — `meta.ts` rejects a profile that declares one without
the other — but nothing ever resolved the value. A field could name a
primitive that did not exist, or one of the wrong type, and the write was
accepted. Deleting the referent then stranded the pointer, and `--dry-run`
called that deletion clean because `previewPrimitiveDelete` only ever
examined `source_id` / `target_id`.

This matters wherever n-ary structure is reified. Relations here are
strictly binary, so an n-ary rule is modelled as a primitive plus binary
pairs carrying a `rule_id` back-reference — and that back-reference was
exactly the unchecked kind. Reification was expressible but not safe.

- **`core:field:id-ref`.** A new pipeline rule resolves each `id-ref`
  against the workbook: the value must name a live primitive, and that
  primitive's `type_id` must match the declared `ref_type_id`. Lists of
  references are checked per element, and the finding's `field_path`
  carries the index (`field_values.antecedent_ids[1]`) so a caller can
  find the offending entry instead of re-checking the list by hand.
- **Skipped, not failed, without a workbook.** Resolution needs the
  workbook slice, which only some call paths carry. Where it is absent the
  check does nothing, because inventing a dangling-reference finding
  when the validator cannot see the workbook would reject valid writes.
- **`PrimitiveDeletePreview.referencing_fields`.** Alongside
  `referencing_relations`, a preview now lists every record whose `id-ref`
  field names the doomed primitive, as `{kind, id, type_id, field_path}`.
  Driven by the profile rather than by scanning strings: a field is a
  reference because its type says so, and matching raw values would report
  coincidental equality as a dependency.

No version bump. §5.5.1 declares the operation-kind set closed, so adding
to it is a minor bump by construction; nothing makes the same claim about
the §7 rule set, and this adds no kind, endpoint or payload.

Existing data is unaffected: validation runs when an operation is appended,
not when the log is replayed, so no stored workbook is re-judged. New
writes carrying a dangling reference are now rejected, which is the point.
In practice nothing in tree changes behaviour — `idRef()` is defined in the
knowledge-cartridge and loop-forward plugins and called **zero** times.

### Security

#### Token issuer was never checked, and the scope catalogue was published wholesale

Three findings from assessing the remote transport against the MCP
knowledge cartridge (`wb-mcp-cartridge`), whose invariants carry
falsifiers and citations back to primary specification text.

- **`iss` is now validated.** `kc:invariant:audience-check` requires
  checking the audience against this server's URL **and** the issuer
  against the expected authorization server. Only the audience was
  checked. Audience alone is insufficient: anyone who controls any
  authorization server can mint a token naming this server as its
  audience, and it would have been accepted. Introspection responses now
  reject a mismatched `iss` with `unauthenticated` /
  `evidence.reason: "issuer_mismatch"`.
- **The advertised scope set is now minimal.** `kc:invariant:scope-minimization`:
  publish the minimum and elevate on challenge, never the whole catalogue
  up front. Protected resource metadata advertised all three scopes;
  it now advertises `fdpm.read` alone by default, configurable through
  `FDPM_MCP_ADVERTISED_SCOPES`, and the `401` challenge carries a
  `scope` parameter so a client learns what to request. Advertisement is
  separate from enforcement — every tier remains gated on its scope
  regardless of what is advertised.
- **The server binds loopback by default.** `kc:invariant:origin-validation`
  ends "when running locally, servers SHOULD bind only to 127.0.0.1
  rather than 0.0.0.0". The default was `0.0.0.0`, which is right for a
  container and wrong for the local run the MANUAL documents. The default
  is now `127.0.0.1`; the Dockerfile and the StatefulSet opt in
  explicitly.

Recorded as SPEC-MCP-SERVER requirements r-013, r-014 and r-015.

#### Protocol revision targeting is now explicit

The same assessment established that MCP revision **2026-07-28** exists and
makes the protocol stateless — removing the `initialize` handshake
(SEP-2575) and the `Mcp-Session-Id` header (SEP-2567), carrying
capabilities in `_meta` per request, mandating `server/discover`, and
withdrawing SSE resumption in favour of the Tasks extension. This server
implements **2025-11-25**, which is what the installed SDK advertises
(`LATEST_PROTOCOL_VERSION`) and what Claude's connector infrastructure
accepts, so nothing is broken today.

Migration is deliberately deferred: v2 of the TypeScript SDK is
pre-release, and its `createMcpHandler` serves both eras from one server,
so the move will not fork the codebase. When it happens the per-session
model and the ingress session affinity both retire, because a stateless
protocol routes round-robin. r-013 records the position so the next
reader does not have to rediscover it.

### Added

#### `fdpm-mcp-http` — the MCP server can be reached over a network

`fdpm-mcp` speaks stdio and is spawned by the client that uses it, which
rules out every hosted client: Claude Connectors and ChatGPT both need a
public HTTPS endpoint. The binary went further than not supporting one —
it refused to start if you passed `--http-port`, pointing at a v0.2
deferral. This is that v0.2.

`fdpm-mcp-http` serves the same tools, resources and prompts over MCP
Streamable HTTP. Both binaries build their server with the same factory
(`src/mcp/build-server.ts`), which the stdio binary was refactored to use
in this change, so there is one implementation of the tool surface rather
than one per transport.

**No new runtime dependency.** `@modelcontextprotocol/sdk@^1.30.0` was
already installed and already ships `StreamableHTTPServerTransport`; the
HTTP layer is built on `node:http`.

- **Endpoints.** `POST/GET/DELETE /mcp`; `GET /healthz` and `GET /readyz`
  for probes, which are unauthenticated by design because Kubernetes
  cannot speak MCP; `GET /.well-known/oauth-protected-resource` serving
  RFC 9728 metadata, and its path-suffixed fallback form.
- **The 401 handshake.** An unauthenticated call is answered `401` with
  `WWW-Authenticate: Bearer resource_metadata="…"`. This is not a
  stylistic choice: Claude does not honour that header on a `200`, and a
  server that answers otherwise is undiscoverable — it fails with a
  message about not reaching the server, which sends operators hunting in
  the wrong place.
- **Identity.** A verified bearer becomes a `Principal` (`sub`, `tenant`,
  `scopes`, `clientId`), carried on the new optional `DispatchCtx.principal`.
  The bearer token itself is never projected onto the principal, so it
  cannot reach the audit log.
- **Authorization.** Each tier requires one scope: `fdpm.read`,
  `fdpm.write`, `fdpm.admin`. They are deliberately not hierarchical —
  a token granted deletion but never modification is a misconfiguration
  worth surfacing. Refusals reuse the existing `permission` category with
  `evidence.reason: "insufficient_scope"`. A destructive *dry run* still
  requires `fdpm.admin`: previewing a delete reveals what exists, which is
  itself an authorization decision.
- **Tenancy.** One `Host` per tenant, in an LRU pool with idle eviction,
  each bound to `$FDPM_DATA_DIR/tenants/<id>`. The tenant comes from a
  verified token claim and never from a tool argument; ids are constrained
  to `^[a-z0-9][a-z0-9-]{0,63}$` and validated again where the path is
  built. `FDPM_MCP_SINGLE_TENANT` pins every caller to one tenant, which
  is the single-tenant deployment as a degenerate case of the pool rather
  than a second code path.
- **Sessions.** One `Server` + transport + `McpSession` per
  `Mcp-Session-Id`, so the token bucket, freshness map and Tier-3
  idempotency cache are per client instead of per process. A session's
  tenant is fixed at creation; presenting another tenant's token against
  an existing session is refused with `session_tenant_mismatch`.
- **Token verification.** Two verifiers: `introspection` (RFC 7662, with
  a short positive cache, `active !== true` rejected, expiry checked, and
  RFC 8707 audience matching) and `static` (a shared secret of at least 32
  characters, compared in constant time).
- **Transport security.** DNS-rebinding protection with a required
  `FDPM_MCP_ALLOWED_HOSTS` — an empty allow-list would refuse every
  request, so the server refuses to start instead of failing invisibly.
  Origin allow-listing that admits requests with no `Origin` at all,
  because native clients send none and its absence is not evidence of
  anything. Body size cap, no server banner, and internal errors that
  never leak a message or stack to a network caller.
- **Deployment.** `Dockerfile` (non-root, read-only root filesystem) and
  `k8s/` (StatefulSet, headless Service, Ingress, NetworkPolicy).

**The topology is a correctness constraint, not a preference.** The JSONL
store's write lock takes over a peer's lock when it is "same host and a
dead pid, **or** older than 30 s" — and across pods the pid check can
never apply, so age is the only signal. A pod legitimately holding a lock
past `LOCK_STALE_MS` can have it broken. The shipped manifests therefore
use per-pod ReadWriteOnce volumes and tenant affinity, giving one writer
per data directory by construction. A stateless Deployment over shared
RWX storage will work under light load and corrupt under contention.

57 tests were added across five suites, including an end-to-end suite that
drives a real MCP client over a real socket against a real Host, and a
tenancy suite asserting that two tenants can hold the same workbook id
without seeing each other's data.

#### `workbook.update` — a workbook's name and description stopped being write-once

Every mutable thing in the model was event-sourced except two: a
workbook's `name` and its `description`. Both were set at
`workbook.create` and then unreachable. The only way to correct a name
that had gone wrong, or a description that had gone stale, was to delete
the workbook and recreate it — which discards the operation log, the
thing the system exists to keep. In practice descriptions rotted in
place: a workbook whose contents had been corrected still advertised the
framing it was created with.

SPEC-CORE §5.5.1's Operation kind set is closed and Core-owned, so
adding to it is a minor bump by construction; SPEC-CORE goes **1.2.0 →
1.3.0** and `CONFORMANCE_RANGE.max` follows.

- **Core.** New `workbook.update` kind and `ProjectUpdatePayload`
  (`workbook_id` plus at least one of `name`, `description`). An update
  naming neither field is rejected at the §8 verification gate rather
  than appended as a no-op. `description: null` clears the field; omitting
  it leaves the stored value alone — `undefined` and `null` are different
  intents and only one of them survives JSON.
- **Inverse.** `:undo` of a `workbook.update` restores the prior values of
  exactly the fields the target touched, so undoing a rename leaves a
  later description edit intact. Undoing a cleared description restores it.
- **`profile_id` is not updatable.** Every primitive and relation in the
  workbook validates against that profile; re-binding it would invalidate
  the projection without revalidating a single instance. That is a
  migration, not an edit.
- **CLI.** `fdpm workbook update <id> [--name] [--description]
  [--clear-description] [--json]`. The two description flags are mutually
  exclusive.
- **MCP.** `fdpm.workbook.update`, Tier 2 (validating-write, not
  destructive — it is advertised without `--enable-destructive`). Manifest
  **0.4.0 → 0.5.0**.

`DEFAULT_CATALOG_BUDGET.total_bytes` ratcheted **26,000 → 27,000**. A
Tier-2 tool cannot be added without catalog growth, and the teaching
contract independently requires Tier-2 descriptions of ≥ 200 chars. The
catalog measures 26,178 B with Tier-3 disabled (the worst case: the
disabled banners are longer than the descriptions they replace) against
25,188 B enabled. The new headroom is ~3 % rather than the previous ~10 %,
deliberately: the next addition should be a reviewed decision too.
`FDPM_MCP_CATALOG_BUDGET_BYTES` and its `.env.example`/`MANUAL.md` rows
move with it.

### Fixed

#### Batch validation reports described intermediate states, not the workbook the batch produced

A 57-entry `fdpm.primitive.create_batch` returned `ok: true` carrying a
warning that its L4 layer held zero diagnostics — in the same batch that
created four of them. The report was not merely stale; it was a
confident false statement about a workbook that was fine, and an agent
acting on it goes and fixes a problem that does not exist.

`Host.appendBatchWithCausation` interleaves validation with synthesis so
that a later entry can reference an earlier one — `create A`, then
`relate to A` has to work. Each entry was therefore validated against the
projection as it stood *at that entry*, and an entry validated first was
judged against a workbook missing every entry after it. A cross-entity
validator on entry 0 emitted findings the same batch immediately
falsified.

After the commit loop the host now re-validates every target against the
settled projection and replaces its report. Two behaviours follow, and
the second is a change, not only a repair:

- A finding the batch itself falsified is gone.
- A finding that only exists once the batch is complete rejects the
  batch. Four items created under a header that permits three are each
  individually valid; the violation is collective and belongs to the
  header, which was validated first against zero items. Such a batch is
  now rejected and rolled back through the existing snapshot path, where
  it previously committed and reported success.

Every entry is re-checked, not only those that already carried findings:
a finding can appear at settle time as well as vanish, and re-checking
only the dirty entries would catch the vanishing case while keeping the
appearing one. A target the settled projection no longer holds was
deleted by a later entry in the same batch; its mid-batch report is the
only one there can be and it stands.

The settled pass runs the pipeline once more per entry, so the
validation half of a batch write does twice the work it did; the
complexity class is unchanged and the pass adds no I/O, since it reads
the projection already in memory and runs before anything is persisted.

`tests/batch-settled-validation.test.ts` covers both directions,
order-independence, rollback, and the asymmetric case that forces
re-validating all entries. `tests/mcp/batch-settled-stdio.test.ts` proves
the same two directions over a spawned `fdpm-mcp`, on
`profile:knowledge-cartridge:1.0` — whose header validator counts the
rest of the graph and is what emitted the original warning. The host test
alone would not show that an agent ever receives the settled reports. The two MCP batch tool descriptions and
`initialize.instructions` now state the settled-report contract; MANUAL
§9.1 documents it. `fdpm edit` is unaffected — it returns per-operation
outcomes, not validation reports.

#### Write path: O(n^2) writes, undurable appends, and log corruption under concurrent writers

Four defects on the persistence and projection path, measured and
re-measured in `docs/architecture/PERFORMANCE-IO-ANALYSIS.md`.

**Writes were quadratic in workbook size.** Every write deep-copied the
entire workbook twice — once building the validation context, once as a
pre-emptive rollback snapshot — so throughput fell from 491 ops/s at 500
primitives to 22 ops/s at 6,000. Disk was never the constraint: the same
run with persistence disabled was no faster, and a CPU profile put
`structuredClone` at 89 % of write-path time against 1.2 % for every
filesystem call combined. Reads paid the same copy across 61 call sites.

`sliceProject` now returns a view. Rollback no longer pre-copies: it
replays the workbook's log, which is canonical and still describes the
pre-operation state at the moment a failure occurs. Writes are now
~800 ops/s at 6,000 primitives with a flat latency curve — O(n) rather
than O(n^2) — reads went 16.1 ms to 0.006 ms, and peak RSS fell from
243 MB to 129 MB. Document size stopped mattering: a 20 KB body costs
1.44 ms where it cost 45.24 ms.

**Acknowledged writes were not durable.** `fs.appendFile` with no fsync
left up to 30 s of acknowledged operations in the page cache, recoverable
from a process crash but not a host crash. Appends now reuse one handle
per workbook, batches commit as a single write, and every commit is
fsynced. `FDPM_FSYNC=0` opts out for bulk import.

**Concurrent writers corrupted the log.** Each process computed the next
revision from its own in-memory log, so two, four and eight writers
produced 187, 201 and 490 duplicate revisions; at four writers the log
held two `workbook.create` operations and could not be replayed at all —
400 operations acknowledged and none recoverable. The bytes were never
torn; `O_APPEND` held at every record size tested up to 64 KB. It was the
agreement that was missing. Writes now take a cross-process lock on the
workbook and reconcile the in-memory log against the file before minting
a revision. Eight concurrent writers over ten runs now produce zero
duplicates and every acknowledged operation replays.

**`rebuildProject` could not rebuild.** It discarded a workbook's
projection without its `uid_index` entries, so replaying its own log
tripped the uid-collision guard on the first `primitive.create`. The same
omission leaked uids on rollback, poisoning them permanently.

##### Breaking for embedders

`sliceProject` (exported from `src/index.ts`) now returns a **live view**
of projection state rather than a detached deep copy. Reading it is
unchanged; mutating the returned object now mutates store state, and the
result reflects later writes instead of being a point-in-time snapshot.
No caller in this repository mutated it. Callers that need a detached
copy should use the new `sliceProjectIsolated`.

`Host` gains `persistOps` and `close`; `JsonlLogStore` gains `appendOps`,
`withWorkbookLock`, `close` and `openHandleCount`.
`Store.snapshotProjectForRollback` now returns `{ log }` instead of a
copied slice.

#### Deleting a primitive silently removed the relations pointing at it

**Breaking.** `Host.deletePrimitive` checked only that the primitive
existed and appended. Replay then cascaded, dropping every relation whose
source or target was the deleted primitive. Nothing warned, nothing
refused, and the caller learned what had gone only by looking afterwards.

The cascade itself is correct — it is what keeps the projection free of
dangling endpoints, since relation creation rejects a missing source or
target as an `error`-level finding. Performing it unasked was the
problem: no other write on the Host removes data the caller did not name.

A delete is now refused when relations reference the primitive, and the
refusal names them. `cascade: true` takes them with it. The single-entry
path, the batch path (`primitive.delete` intents), the CLI
(`--cascade`), the MCP tool and the SDK all carry the option, so a batch
of one is not a way around the check. Refusal and
`previewPrimitiveDelete` read the same function, so a preview can never
report a clean delete that the delete then rejects.

The policy sits at the write boundary only. Replay is unchanged, so a log
already containing a cascading delete still rebuilds — a policy decides
what may enter the log, it does not retroactively invalidate what is in
it.

Migration: a caller deleting a referenced primitive now receives
`conflict` with `evidence.referencing_relations`. Add `cascade: true`
(CLI `--cascade`) to keep the previous behaviour, or delete the relations
first.

#### `structure.reparent` bypassed validation

A reparent changes a primitive's `scope_id`, and a profile rule can
constrain what belongs in which scope — but the operation appended
directly rather than going through the validation pipeline. It was the
one write on the Host that could place an instance into a state a direct
edit would have been refused for. It now validates the moved primitive
against its profile before appending.

`reorder` remains unvalidated by design: it permutes scope membership
without changing any instance, so an instance-scoped pipeline has nothing
to judge. Its own invariant — that the new ordering is a permutation of
the current one — is enforced in replay.

#### Opening one workbook read the entire corpus

`Host.load()` called `readAllLogs()`: every workbook in the data
directory was read, Zod-parsed and replayed before `load()` returned, so
a CLI invocation touching one document paid for all of them — 369 ms at
100 workbooks, 1,451 ms at 400, 59 s at a 1.8 GB corpus, on every process
start.

Workbooks are now materialised on first access. `load()` is flat at ~8 ms
from 1.2 MB to 626 MB of corpus, and opening a single workbook costs
2–8 ms where reading 50 MB of corpus cost 1,451 ms. `listProjects` and
`lookupUid` still materialise everything, because their answers span
workbooks; that work simply moved out of `load()`, where it used to
happen unconditionally.

Persisted snapshots were evaluated and not built: they can only remove
the replay half of a load (measured 50.3 % of 1,303 ms for a
100,001-operation workbook), because the full log must still be read to
keep `operation_log` complete for `getOperationLog`, `getProjectAt`,
`rebuildProject` and `reloadProjectTail`. A 2.01× ceiling on a rare
workload did not justify a new on-disk format in the rollback and audit
paths. `docs/architecture/PERFORMANCE-IO-ANALYSIS.md` §6.6 records it.

##### Added for embedders

`Store.attachLoader`, `Store.markMaterialised`,
`Store.materialisedProjectIds`, and the `ProjectLoader` interface;
`JsonlLogStore.readLogSync` and `listProjectIdsSync`. A Store with no
loader attached behaves exactly as before.

#### Clean checkouts could not typecheck or build

`@fdpm/zod-bridge` resolves to `./dist`, which is git-ignored, and the
package declared no `prepare` script — so `npm ci` linked a workspace
package with no build output and `npm run typecheck` failed with 42
errors across seven plugins. CI ran exactly that sequence. Adding
`prepare` makes a fresh clone build and typecheck cleanly.

### Added

#### The MCP resource surface is gated like the tool surface

`createDispatcher` gated `tools/call`. `ReadResourceRequestSchema` called
`dispatchRead` directly, one handler away, so `resources/read` had **no rate
limit, no audit entry and no size ceiling** — and it is the surface that moves
the most content, since `fdpm://workbook/{id}/render/{target}` serves an entire
rendered workbook. The careful gating was on the smaller surface.

Found auditing `fdpm-mcp` against the `KC-MCP-001` knowledge cartridge, whose
`kc:invariant:consent-before-data` reads: *"a server must not transmit resource
data without permission."*

`src/mcp/read-guard.ts` now carries the three controls that apply to a read:

- **Rate limit** — the *same* `session.rateLimiter` bucket tool calls draw on.
  A second bucket would let a caller spend the tool budget and the read budget
  in one minute and stay inside both, which is not a limit.
- **Audit trail** — one `resource_read` entry per read, successful or refused,
  carrying URI, provider, duration and byte count. Never the content: the audit
  log is reviewed by people not necessarily entitled to it, and a log that
  embedded renders would become a second copy of every workbook it polices.
- **Byte ceiling** — `FDPM_MCP_MAX_RESOURCE_BYTES`, default 1 MiB, refusing
  with a `quota` envelope that names both the size and the cap. Measured on the
  string that crosses the wire, so a base64 blob cannot slip through at 1.33x.
  A malformed value is a startup refusal (exit 2), not a silent fallback.

**Not routed through the tool dispatcher.** Four of its seven gates are
write-side by construction — a read has no tier to refuse, nothing to confirm,
no idempotency key to replay, no post-write freshness stamp. Threading them
through would have meant four branches that are always false.

**A declared freshness contract.** `ResourceProvider.readsWorkbookState` is now
required. Exactly one provider reads workbook state (`fdpm.render`) and it
refreshed by hand while the other four had nothing to refresh — correct, but by
accident. The guard performs the tail replay for any provider declaring `true`,
so the next one inherits freshness or states in one word that it does not need
it. This replaced the "freshness parity" fix originally proposed: investigation
showed `audit` reads from disk each call, `profile` reads the in-memory
registry, and `schema`/`guide` are static, so there was no staleness bug to
fix — only an undeclared contract.

**Audit report.** `AuditEntry` gains a `resource_read` arm and `AuditReport` a
`resources` summary (reads, ok, failed, bytes_served, refused-by-reason).
Without the parse arm every resource read would have counted as `skipped`, the
counter that means *this log is corrupt* — a healthy server would have looked
damaged.

22 tests: 17 in process over the guard, 5 spawning the real `fdpm-mcp` and
speaking MCP through the SDK client. The stdio suite exists because the binary
*was* the defect — a unit test alone would have passed against the bug it was
written to catch.

#### `fdpm.agent-memory` — the agent-memory v2 contract as `profile:agent-memory:2.0`

Episode-scoped memory for an autonomous agent: six primitive types
(`am:Episode`, `am:Fact`, `am:Hypothesis`, `am:Artifact`, `am:Action`,
`am:Decision`) and six relation types, with 19 validator registrations
carrying the rules a per-field schema cannot express — the partition
boundary, supersession shape and ordering, the evidence a settled
hypothesis owes, and the refusal of any write into a settled episode.

The import makes three departures from the source contract, each argued
in the file where it lands and summarised in
`plugins/agent_memory/README.md`: the contract's discriminated union
becomes six types rather than one flattened type; `episode_id` becomes
the `am:EpisodeHolds` edge so endpoint existence and kind are the host's
checks rather than restated rules; and the `superseded` boolean is
dropped, because in a graph the edge already is the index and carrying
both would need policing no write order can satisfy.

Limits are recorded in the plugin README rather than implied: reopening a
settled episode is not refused (a validator never sees the instance it
replaces), there is no retrieval surface, no memory tiering and no
valid-time axis, and the vendored contract's provenance cannot be
self-checked because its source lives in another repository.

### Fixed

#### CLI, MCP, build, and test paths are portable across Linux, macOS, and Windows

The release candidate no longer assumes POSIX shell utilities, `/tmp`, colon-
separated search paths, XDG state directories, or `SIGHUP`. Build and test
subprocesses now launch through Node, temporary paths use the host operating
system, plugin search paths use the native delimiter, workspace registries use
XDG state on Linux, Application Support on macOS, and LocalAppData on Windows,
and MCP reload uses `SIGBREAK` on Windows. CI now runs the supported Node 24
path on macOS and Windows in addition to the Linux Node 20/22/24 matrix, and
the Python renderer is exercised on all three operating systems.

Each Node matrix job now packs `@fdpm/zod-bridge` and `@fdpm/cli`, installs
both tarballs into an isolated consumer project, and invokes npm's generated
`fdpm` and `fdpm-mcp` command shims. This covers the Windows `.cmd` launch path
and catches missing packaged files or unresolved workspace dependencies that
source-tree binary smoke tests cannot expose. Before installation, the same
gate inspects npm's exact file list and rejects Windows-reserved or otherwise
invalid path components, overlong components, and case or Unicode-normalization
collisions that default macOS and Windows filesystems cannot materialize.

Workbook IDs now reject the Windows-reserved device basenames `con`, `prn`,
`aux`, `nul`, `com1` through `com9`, and `lpt1` through `lpt9`; the existing
128-character limit is also enforced consistently by operation and lifecycle
payload schemas. This is an intentional compatibility restriction for the
first public-release candidate because workbook IDs become directory names.

Persisted profiles now use a bounded lowercase slug plus a SHA-256 suffix from
the original profile ID. Distinct IDs can no longer overwrite each other when
punctuation is normalized or when a macOS/Windows filesystem folds case, and
long IDs no longer exceed a filesystem component limit. Existing legacy
profile `.json` filenames remain discoverable and require no migration.

#### Custom validators registered against a relation type were never dispatched

`ValidationPipeline.runRelation` ran the core checks — type resolution,
endpoint existence, endpoint kind, field shape, extra fields — and
returned. It had no Step 6, so a `cap:validator` capability naming a
relation type id was accepted by the manifest, registered by the plugin
context, and then never called. It also took no `CustomValidatorContext`,
so even once dispatched a relation validator could not see the workbook's
other relations or primitives.

No plugin in the tree had registered a relation validator, so no test
failed and the gap was silent by construction. It surfaced when
`fdpm.agent-memory` registered four relation-level rules and watched every
one of them accept a graph it forbids.

`runRelation` now dispatches custom validators behind the same exception
barrier and the same `validatorAppliesToProfile` scoping the primitive
path uses, and `Host` supplies the validation context at all five
`runRelation` call sites. `runRelationFieldPatch` forwards it too.
`ValidatorContext` additionally declares the `workbook` field that `Host`
was already passing, so a cross-primitive rule reads a typed contract
rather than casting over an undocumented shape.

Regression: `tests/relation-custom-validators.test.ts`, written against
the core pipeline and independent of any plugin.

#### The four `fdpm.uixo` views rendered the document but did not present it

Reported by the operator, and correct on every count. The four renderers
were four containers around one generic tree dump, and one of them was
corrupting text.

**Characters the fonts can draw were being destroyed.** `toWinAnsi`
replaced every code point above U+00FF with `?`. WinAnsi encodes the em
dash, en dash, bullet, ellipsis and curly quotes perfectly well, so this
was corruption of valid data, not a font limitation: **111 substitutions**
on the 346-entity reference document, in prose that had nothing wrong with
it. The 5×7 raster face had the mirror defect, silently dropping anything
it had no glyph for — `≤ 767px` became `767px`, a bound that reads as a
value. One shared `ASCII_FOLD` table now holds the readings (`→` is `->`,
`⌘` is `Cmd`) and each encoder applies its own keep-set; the raster face
gained the 19 glyphs it was missing (`< > = + , ; ! ? % & * [ ] _ ' " @`).
`tests/render-text-fold.test.ts` asserts both directions, including that
`toWinAnsi` never emits a code point `drawText` would throw on. Remaining
`?` in the reference render: 13, all of them genuine question marks.

**Every value was flattened to one comma-separated line.** The whole
payload — prose, CSS custom properties, hex colours, measured contrast
ratios — arrived as grey run-on text. The new `renderers/_present.ts`
classifies values by shape and by the ontology's own naming, so a colour
draws as a swatch, a status as a badge, a reference as a link and prose as
prose. It also unpacks `extensions`, the `z.record` that carries the
writing (`description` on all 346 entities, `spec` on 100), instead of
stringifying it.

Per view:

- **HTML** gained a sticky index, a palette of 22 swatches (11 declared
  directly plus a dark-theme override that was previously invisible
  because its hexes sit in a nested map), a findings table, and entity
  cards where prose is prose and `spec` is an aligned definition list.
- **PDF** was 41 pages of undifferentiated grey with an 80%-empty title
  page and no contents. It now has a title page, a contents page with
  leader dots and folios, a printed palette, a findings section, a
  structure section with a measure capped near 72 characters and depth
  shown by a left rule, census tables, and a running head.
- **SVG and PNG** drew 118 identical pills 15,000 pixels tall — less
  information than the markdown outline. They now share
  `renderers/_poster.ts`: palette, a breakpoint scale, findings chips,
  and only the roots that actually nest as boxes, with standalone
  entities grouped by class as chips. A bug found while drawing it:
  `contentMaxWidthPx` was being read as a range bound, which drew the
  topmost breakpoint backwards.

Verified by rendering `_ingest_bin/claude-app_uixo.json` and looking at
every output. 40 tests across `tests/plugins/uixo/renderers.test.ts` and
`tests/render-text-fold.test.ts`; full suite 187 files / 1861 tests.

### Added

#### `fdpm.knowledge-cartridge` 0.1.0 — talent cartridges as a typed graph

`profile:knowledge-cartridge:1.0`: a corpus compressed into an executable
competence module. 13 primitive types, 6 relation types, 9 validator rule ids,
3 renderers and 1 MCP prompt.

The schema is a transcription, not an invention. `plugins/knowledge_cartridge/GENERATOR.md`
— the seven-pass protocol, moved into the plugin from an untracked scratch path
and now its source of truth — already specifies row shapes rather than prose:
its Pass-5 layer contracts give L1 "one line per rule: ID, rule, value,
citation", L4 "three columns: symptom / cause / correction", and L5 the only
layer where "prose is permitted here and only here". Its Pass-3 transposition
test is a five-arm discriminated union.

**Six layers are six primitive types**, not one polymorphic item with a `layer`
string. Pass 6 asks "L4 has >= 8 rows" and "L5 exists and is non-empty"; against
a polymorphic type those are filters over a column and nothing stops a
diagnostic shipping without a correction. Against six types they are cardinality
checks and each register is a required field.

**Discarded harvest is kept.** `kc:Harvest.retained` records the passages that
failed the transposition test alongside the ones that passed, so the >= 50 %
discard rate Pass 6 checks is arithmetic over the graph rather than a number its
author asserted. That assertion is the SELF-CERTIFICATION failure Pass 6 exists
to prevent, and it is the one place this plugin adds something the document did
not ask for.

**Where the citation check fires is forced, not chosen.** A citation is a
`kc:CitesSource` edge, an edge needs both endpoints to exist, and the host
validates each write against the proposed post-state — so a layer type demanding
an inbound citation at creation could never be created, in a batch or otherwise.
`kc:val:normative-claim-cited` therefore gates the `kc:Cartridge` header, which
Pass 5 creates last: the header cannot be written while any normative claim is
uncited, and the finding names every offender. Layer items stay writable
throughout Pass 3, which is the only sequence that works.

**Three Pass-6 checks cannot run in a validator** — ordinal resolution (a
network call to the retrieval substrate), compression ratio (its numerator is
the artifact, which post-dates validation), and quotation length (a heuristic
would flag the ranged reads stored verbatim on purpose). They are declared in
`KC_UNENFORCEABLE_CHECKS` and printed as `UNCHECKED` by the citation index. A
scoreboard showing only enforceable checks would be the self-certification the
protocol warns about.

Renderers: `kc:CartridgeRenderer` (text/markdown) emits the artifact with
declared gaps and unreconciled conflicts in the back matter — a view that
printed the rules and hid the gaps would look perfectly fine and be the audit
failure; `kc:CitationIndexRenderer` (text/html) inverts the evidence source by
source plus the Pass-6 scoreboard; `kc:LayerMapRenderer` (image/svg+xml) shows
depth per layer against its floor, hatched as well as coloured so an
under-harvested layer survives a greyscale print.

`knowledge-cartridge/build_cartridge` ships the protocol as an MCP prompt.
Listing 554 B (budget 600 B), body 4,602 B against a pinned 5,000 B ceiling —
about 11 % headroom, the ratchet `tests/mcp/catalog-budget.test.ts` applies to
the tool catalog. No new MCP tool; catalog cost 0 bytes.

65 tests across four suites: profile shape, Pass-6 validators including every
failure path, the three renderers against a real Host with determinism
assertions, and the prompt with a drift gate cross-checking every `kc:` id and
`fdpm.*` tool name it cites against the plugin's own sources.

#### `fdpm.loop-forward`: two MCP prompts — how to author a pipeline, and how to audit one

The profile could describe a pipeline and render five design-graph views
of it. Neither told an agent how to **build** one or how to decide
whether one was **safe to run**, and the plugin shipped zero prompts. It
now ships two (SPEC-MCP-SERVER §13.5, ADR `decision:0010`):

| Prompt id | Use it when |
|---|---|
| `loop-forward/author_pipeline` | Building a new bounded multi-stage pipeline, or extending one with a stage or a loop. |
| `loop-forward/audit_pipeline` | Before running, approving or inheriting a pipeline you did not author. |

`author_pipeline` teaches the order the graph actually requires: relation
endpoints are resolved at write time, so every primitive is named before
the relations over it — templates before `lf:TemplateDeclaresVariable`,
stages before `lf:PipelineHasStage`, carries before `lf:LoopHasCarry`. An
agent that batches edges first gets a wall of `not_found` and no partial
write. Its failure-modes section names all eight validator rule ids
(`lf:val:binding-source-arm` … `lf:val:example-reason`).

`audit_pipeline` routes review through the five renderers as resources
rather than reconstructing the graph by hand, and says what each view is
evidence *of*: an unexpected carry back edge is unbounded context growth;
a stage with no `lf:OutputValidator` consumes model output unchecked; a
`lf:LoopConfig` budget under the structural bound means the loop can only
ever end `exhausted`.

No new surface was needed. `prompts/list`, `prompts/get`, `fdpm plugin
prompts`, `fdpm plugin prompt` and the SDK's `listPrompts` /
`renderPrompt` are all plugin-generic, so registration in `activate()` is
the entire wiring — the server now advertises 4 prompts where it
advertised 2.

Two gates ship with them, both in
`tests/plugins/loop_forward/prompts.test.ts`:

- **A drift gate.** Every `lf:` identifier a prompt body cites is
  cross-checked against the plugin's own sources, and every `fdpm.*` tool
  name against the MCP manifest. A prompt that teaches a renamed type is
  worse than no prompt: it is a confident instruction to write something
  the validators will reject.
- **A byte ratchet.** `LOOP_FORWARD_PROMPT_BODY_CEILING_BYTES` is 4,500 B
  against measured bodies of 4,089 B and 3,023 B — about 10 % headroom,
  the same discipline `tests/mcp/catalog-budget.test.ts` applies to the
  tool catalog. A procedural specification is re-sent on every step of a
  run, so its size is a recurring cost rather than a one-off; the host's
  own `PROMPT_BODY_BUDGET_BYTES` (16,384) would have left 47 % slack and
  passed while the body doubled. Raising this ceiling requires a
  CHANGELOG line and a reason.

`tests/plugins/loop_forward/prompts-surfaces.test.ts` adds the transport
regression: the CLI binary and a spawned `fdpm-mcp` are exercised against
a fresh data dir, so a plugin that registered prompts only after some
earlier in-process load would fail there rather than pass silently.

**Refactor riding along.** The five `*_RENDERER_ID` constants moved from
`plugins/loop_forward/index.ts` to `plugins/loop_forward/ids.ts`, whose
docstring already claimed to hold every id the plugin addresses.
`prompts.ts` names them in the audit procedure and `index.ts` imports
`prompts.ts`, so leaving them in `index.ts` would have closed an import
cycle. `index.ts` re-exports them; no public name changed.

#### `fdpm.uixo` 0.1.0 → 0.2.0: HTML, PDF, SVG and PNG views of an interaction document

712 typed classes and 210 relation types rendered as one markdown list. A
UI component tree drawn as nested boxes *is* a wireframe, so that is the
view the ontology was missing. Four renderers join the outline:

| Target | Renderer id | What it is |
|---|---|---|
| `text/html` | `uixo:DocumentHtmlRenderer` | The reviewable page — containment nests as real elements, every entity gets an anchor and every cross-link is a resolving `href`, so a reviewer can send a URL that lands on the node under discussion. |
| `application/pdf` | `uixo:DocumentPdfRenderer` | The paginated artefact that leaves the workbook: title page with counts and provenance, the forest as an indented outline, both censuses, page numbers. |
| `image/svg+xml` | `uixo:ComponentTreeRenderer` | The wireframe as vectors, depth colour-keyed, plus edge-property and class censuses as proportional bars. |
| `image/png` | `uixo:ComponentSheetRenderer` | The same wireframe as pixels — a thumbnail for a ticket or a visual diff between revisions. |

**`hasChildComponent` alone was not containment.** The outline renderer
walks that one property, and on a real 346-entity document that reaches a
handful of buttons and strands everything else as "unreachable from any
root" — because the chain runs `InteractionSystem → Screen → Layout →
Region → Container` through five *different* properties. Deriving
containment from the name instead would be a convention masquerading as a
rule: 145 properties begin with `has`, and a node whose only in-edge is
spelled differently would vanish.

So `renderers/_model.ts` builds a **spanning forest over every edge**. A
node's parent is one incoming edge, roots are the nodes with none, and
every edge the tree does not consume becomes a cross-link on its source
and a back-link on its target — nothing dropped, nothing drawn twice.
Name shape only breaks a tie. This forest is a *view*, not a claim the
ontology makes, and the markdown outline is left as the literal reading.

**One layout, two rasterisations.** `renderers/_wireframe.ts` computes the
nesting once; the SVG emits it as vectors and the PNG paints it as pixels,
so the bitmap cannot disagree with its own vector. Layout is
measure-then-place — a painter that discovers its own extent as it goes is
a painter that clips. A box too narrow for a legible caption stops nesting
and reports its remaining descendants as `+N nested` rather than dropping
them.

31 new tests in `tests/plugins/uixo/renderers.test.ts`, including the two
failures that are invisible without them: pdf-lib's StandardFonts are
WinAnsi and `drawText` **throws** on a code point they cannot encode, so a
single exotic character in a label would fail a render of data that
validated cleanly; and an SVG does not complain about ink outside its
viewBox, it clips. Both are asserted. The PDF is byte-deterministic — its
creation and modification dates are pinned, so two renders of one workbook
are comparable.

Verified end to end against `_ingest_bin/claude-app_uixo.json` (346
entities, 340 edges): 245 KB HTML, 124 KB PDF, 144 KB SVG, 195 KB PNG at
1120×15245.

#### `src/core/render/png.ts` and `src/core/render/pdf.ts` — shared rendering primitives

The PNG encoder shipped inside `plugins/style` and moved to
`src/core/render` the moment `plugins/uixo` needed it: a plugin reaching
into another plugin's private module is a dependency the manifest does not
record and the loader does not enforce, and a second copy of an encoder is
a second copy of its bugs. `plugins/style` imports it from the new
location; nothing else about that plugin changed.

`src/core/render/pdf.ts` is new and holds the three places a pdf-lib
renderer silently produces a wrong document: WinAnsi sanitisation (an
unencodable code point makes `drawText` throw), width-aware wrapping (text
past the measure runs off the page, and a PDF has no overflow to report),
and a cursor that breaks pages before drawing below the bottom margin.
`plugins/formal_specification/renderers/pdf.ts` still carries its own
copies of the first two, written before this module existed; it is not
re-pointed here, because rewriting a large, visually tuned renderer is not
part of adding a second one.

#### `fdpm.style` 0.1.0 → 0.2.0: HTML, SVG and PNG views of a style registry

The profile stored a palette, a WCAG contract and a stroke weight, and
rendered all three as table cells. A table saying `#D2232A` asks the
reader to imagine the thing the document is *for*. Three renderers join
the markdown outline, each rendering the measurable part of a style as
what it means:

| Target | Renderer id | What it is |
|---|---|---|
| `text/html` | `style:StyleHtmlRenderer` | The specification page: palette and forbidden colours painted as chips, colour tokens as a copyable `:root {}` block, and every WCAG pair with its **measured** ratio, its required minimum and a pass/fail verdict. |
| `image/svg+xml` | `style:StyleSpecimenRenderer` | One specimen plate per style — palette, contrast pairs drawn as the two colours actually combine, a stroke specimen at the declared weight, the rule census as a proportional bar, ten grammar badges. |
| `image/png` | `style:PaletteSheetRenderer` | The palette as pixels: a chip sheet for a picker, an eyedropper, or a diff against last release. |

`fdpm render <workbook> image/png --renderer-id style:PaletteSheetRenderer -o style.png`.
Binary targets require `-o`; the CLI already refuses to stream them to a
terminal.

**One walk, not four.** The new `renderers/_model.ts` owns the
graph → `RegistryView` reassembly and resolves what the graph only points
at — a rule's exemplars become titles, a contrast pair's token names
become hexes carrying a ratio and a verdict. Four independent walks over
fifteen primitive types is how four views of one registry drift into
disagreeing about it.

**No image dependency.** `src/core/render/png.ts` encodes the sheet in-repo:
8-bit truecolour, filter type 0, `node:zlib` for the deflate, a 5×7
bitmap face for labels. The only raster this plugin produces is flat
rectangles and monospaced text; a rasteriser earns its place when it has
to resolve fonts, curves and blending, and none of that appears here.
Correctness is not "a viewer opened it" — the suite parses the chunk
stream, verifies each CRC against an independent implementation, inflates
IDAT, and reads the declared palette colours back out of the pixels at
coordinates the exported `paletteSheetLayout` supplies.

Three properties are asserted rather than assumed, because each fails
silently:

- **Self-contained.** No script, no stylesheet link, no `@import`, no
  absolute URL in the HTML; only generic font families in the SVG. A
  specification is the kind of document that gets mailed around and opened
  offline.
- **Escaped.** Every author-supplied string passes through the format's
  escape, and values reaching a CSS context are additionally matched
  against the hex or ident grammar — escaping protects the HTML parser,
  not the CSS one.
- **In-bounds and deterministic.** The SVG's predicted plate height is
  checked against every emitted coordinate, because an SVG does not
  complain about ink outside its viewBox, it clips. Nothing reads a clock
  or an environment, so two renders of one workbook are byte-equal.

26 new tests in `tests/plugins/style/renderers.test.ts`. The manifest's
`cap:renderer` entries are declared in `plugins/style/scripts/run-bridge.ts`
and regenerated; `bridge-drift.test.ts` now asserts the manifest advertises
exactly the four views `index.ts` registers and that each names a real
export. `PROFILE_ID` is unchanged at `profile:style:3.1` — no primitive
type, relation type or field moved, and a 0.1.0 workbook renders under
0.2.0 without migration.

#### `scripts/build-coma-void-style.ts` — the first style ingested through `buildStyleWorkbook`

`plugins/style` shipped with an ingest boundary and a test fixture but no
worked example against a real `StyleDefinition`. This script is that
example: it wraps `_ingest_bin/coma-void-style.ts` — the Coma Void
cartographic aesthetic, authored against `_ingest_bin/style-schema.ts`
v3.1.0 — in the one-style `StyleRegistry` the profile models, declares the
two movements its identity cross-references (`celestial-cartography`,
`pictorial-constellation-atlas`, both with an open period and a null start,
because neither tradition is dated by the source), and hands the result to
`buildStyleWorkbook`.

It lands 47 primitives and 72 relations in workbook `style-coma-void` on
`profile:style:3.1`: 1 Style, 10 grammar sections, 2 Movements, 15 Rules,
12 ComplianceChecks and 7 CanonicalReferences. `--replace` re-runs it over
an existing workbook; `FDPM_DATA_DIR` targets a throwaway store.

The script adds one post-condition the ingest does not have.
`buildStyleWorkbook` runs `validateStyleWorkbook` against the *projection*,
before writing; this re-runs it against the *stored slice*, after. The two
should agree, and a disagreement would mean the write path altered the
graph — which is worth a loud failure rather than a later discovery.

### Fixed

#### `plan:GanttSvgRenderer` drew three quarters of its output outside the viewBox

`chartWidth` was `LEFT_GUTTER + DAY_WIDTH × totalDays + RIGHT_MARGIN` — the
timeline and nothing else — while the renderer also draws a title, a subtitle,
date labels, gutter labels, an empty-state note and the whole unscheduled
footer, none of which the timeline bounds. SVG clips at its viewport in
silence, so every glyph past `chartWidth` was composed, written to the file
and then discarded by whatever opened it, with no finding, no warning and no
way for a reader to tell that anything was missing.

Measured against the real `studio-legacy-web-consolidation` workbook (22
undated tasks, 0 scheduled): `viewBox="0 0 424 556"` with 27 of 35 text
elements clipped, the worst overrunning by ~1390 units. The same workbook now
renders at `696 × 556` with none clipped.

- **The canvas is sized from the text.** `textWidth` bounds a string's advance
  from per-class glyph maxima calibrated against DejaVu Sans — the widest
  common `sans-serif` fallback, so the bound holds for Arial and Helvetica
  too. `chartWidth` is now `max(timeline, widest drawn string + margin)`.
- **Footer rows are elided, not clipped.** A row is bounded to a 620-unit
  measure so one paragraph-length `summary` cannot stretch the canvas to
  thousands of units, and the full row rides along as a `<title>` tooltip
  rather than being lost.
- **Gutter labels stay in the gutter.** A `task:` id longer than 232 units
  used to run under the bars; it is elided to the column instead.
- **Date labels no longer overprint each other.** The old rule aimed at ~12
  labels whatever their width, which on a 7-day chart drew a 69-unit date
  every 24 units. Spacing is now derived from the label's own width, and the
  always-drawn final label is skipped when it would land on its neighbour.
- **The empty-state note has a ground.** With nothing scheduled the note sits
  inside the grid band and had day rules struck through it; the grid is
  knocked out behind it.

Covered by 8 tests in `tests/planning-renderers.test.ts` that measure each
drawn string with a deliberately independent (and lower) 0.5 em/char estimate,
so a viewBox that fails to contain even that bound is clipping for certain. Six
of the eight fail against the previous renderer.

#### `_ingest_bin/` was unloadable — a dangling import and a missing module type

Three defects, each of which stopped the staging area from being ingestible
at all:

- `_ingest_bin/style-schema.ts:109` imported `../shared/primitives`, a path
  *above the repository root*. The module is now `_ingest_bin/shared/
  primitives.ts`, carrying `HEX_COLOR_REGEX` and `SEMVER_REGEX` copied
  verbatim from `plugins/style/schemas/style.ts:84-86`, where the Zod
  transcription had already inlined them for this reason.
- `_ingest_bin/coma-void-style.ts:54` imported `./style-schema-1`, a file
  that has never existed. It now imports `./style-schema.js`, which exports
  exactly the eighteen smart constructors it names.
- `_ingest_bin/` had no `package.json`, so Node resolved its ESM-syntax
  `.ts` files as CommonJS. An ESM caller in `fdpm-cli/` received
  `module.exports` in place of the default export — silently, as an object
  whose every field read `undefined`. A `{"type": "module"}` marker
  declares what those files already are.

`npm run typecheck` (`src/` + `plugins/`) is unaffected and passes. The
unwired `tsconfig.scripts.json` — already failing before this change, on
`scripts/business-plan-bridge-dryrun.ts` — now also reports
`noUncheckedIndexedAccess` violations inside `_ingest_bin/style-schema.ts`,
which were previously unreachable because `tsc` stopped at the dangling
import. Hardening that vendored schema is a separate piece of work.

### Changed

#### Renderers: the generic field tables are gone; every profile renders as a document

103 renderers were registered, and 88 of them were the same generated
field table — one per entity across six plugins. They described records;
none rendered the thing the records make. Two profiles could render
nothing at all.

**Withdrawn: 88 per-entity field tables** — academic-paper (24), uml
(22), style (15), acme-business-deck (13), acme-pitch-deck (8),
document-plan (6). uixo's single generic class table went with them: it
was one renderer rather than 712, which was the right call against that
alternative, but it still described records.

**Added, where a profile had no document renderer:**

| Profile | Renderer | Targets |
|---|---|---|
| `software-requirements:0.2` | `srs:SrsDocumentRenderer` / `srs:SrsHtmlRenderer` | markdown, HTML |
| `academic-paper:0.4.1` | `acad:PaperDocumentRenderer` / `acad:PaperHtmlRenderer` | markdown, HTML |
| `acme-business-deck:0.1` | `acme:DeckRunningOrderRenderer` / `acme:DeckContactSheetRenderer` | markdown, SVG |
| `acme-pitch-deck:0.1` | `acme.pitch-deck:RunningOrderRenderer` / `acme.pitch-deck:PhaseMapRenderer` | markdown, SVG |
| `document-plan:3.1` | `docplan:PlanBriefRenderer` | markdown |

Each renders what the domain *is*, not what its records contain. An SRS
puts scope boundaries before requirements and orders those by priority,
carrying rationale, acceptance criteria and traceability resolved to
names. A paper reads as sections with claims and their evidence, then
findings and references. A deck is a running order plus a visual — a
contact sheet whose load bars show where the deck crowds, or a phase map
whose block widths are speaking budgets, so pacing is visible before
anyone rehearses. The HTML artefacts are single files with inline styles,
print rules and a dark-mode palette, because they travel on their own.

`software-requirements` had **no renderer of any kind** — eight
metaclasses, seventeen relation types, and no way to read a workbook.

**Net effect:** 103 renderers → 22, and the MCP resource surface shrinks
with them (1,567 entries, largely workbooks × renderers). Every profile
now has a document-level renderer, and six offer more than one target
where markdown alone had been the whole story.

Fixed while proving the outline renderers were better than what they
replaced: `style:StyleOutlineRenderer` rendered a list-of-struct field as
`[object Object]` — the same defect the generated renderer had, in the
hand-written one that was supposed to be free of it. A struct now prints
as inline key/value pairs, so a palette entry reads
`name: ink, hex: #1A1A1A`.

### Changed

#### The generated per-entity renderer now produces readable output

88 of the 103 renderers registered across this repo come from
`zodSchemaToMarkdownRenderer` — every entity of academic-paper (24),
uml (22), style (15), acme-business-deck (13), acme-pitch-deck (8) and
document-plan (6). What it emitted was therefore what most profiles
looked like:

```
# uml:Class uml:Class:01HQ8Z3K7M4N5P6R7S8T9V0011
| Field | Value |
| xmi_id | 01HQ8Z3K7M4N5P6R7S8T9V0011 |
| xmi_type |  |
| visibility |  |
```

A machine identifier as the title, the type printed twice, the id
repeated in the body, and a blank row for every field the instance did
not set — a 30-field entity with four values rendered 26 empty cells.
The same entity now reads:

```
## Publication

`uml:Class`

| Field | Value |
|---|---|
| Xmi id | 01HQ8Z3K7M4N5P6R7S8T9V0011 |
| Qualified name | Library::lending::Publication |
| Is abstract | yes |
```

- The heading **names** the entity, falling back through `name`, `title`,
  `label`, `headline`, `summary`, and only then to the type plus the id's
  own slug. The type moves to a subtitle. Headings start at `##`, leaving
  `#` for whoever assembles fragments into a document.
- Unset fields are omitted. `false` and `0` are values and stay.
- Values are formatted for a reader: booleans as yes/no, lists
  comma-joined, structs as inline key/value pairs. Pipes are escaped so a
  value cannot break the table.
- Labels read as words: `qualified_name` renders "Qualified name".

This retires a defect the style plugin had documented and asserted: a
list-of-struct field (`palette`, `typefaces`, `tokens_colors`) rendered
as `[object Object]`, with a note promising the test would fail the day
the bridge fixed it. It did; the note is out and the test now asserts the
palette hexes.

All seven bridge plugins regenerated, drift gates clean. Determinism is
unchanged: the renderer remains a pure function of (schema, options,
target).

### Fixed

#### Documentation that counted the repository is now generated, not typed

A doc-hygiene audit of all 67 tracked documents found that the architecture
snapshot published on 2026-08-28 carried **six hand-typed figures that were
all wrong within twenty-four hours**: plugin directories (14 claimed, 17
actual), `FDPM_*` variables (21 claimed, 22 actual), CI workflows (2 claimed,
4 actual), the passing-test count, the LOC census, and the tracked/untracked
status of `docs/goal-repo.md`.

The figures were not the defect — typing them was.

- **`scripts/build-arch-census.ts`** (new) generates
  `docs/architecture/CENSUS.md`: source volume by area, plugin directories,
  `FDPM_*` count, CI workflows, `SPEC-*.md` count, distinct MCP tool ids.
  The architecture snapshot now links to it and states no figure it cannot
  regenerate. Line counts are rounded to the nearest thousand so the drift
  gate fires on meaningful movement rather than on every commit.
- **`scripts/build-env-docs.ts`** (new) generates the `FDPM_*` tables in
  `README.md` and `MANUAL.md` and the body of `.env.example` from
  `FDPM_ENV_VARS`. Four hand-synchronised copies of one list is a drift
  generator; they agreed only by coincidence.
- **`tests/_meta/doc-drift.test.ts`** (new) fails the build on five
  conditions: a stale census, stale env docs, a `docs/specs/SPEC-*.md` path
  cited from a doc that does not resolve, a plugin directory with no README,
  and a bridge-generated README that does not name its own bundle's profile id.

#### `FDPM_MCP_CATALOG_BUDGET_BYTES` documented a default the code does not use

`FDPM_ENV_VARS` advertised `28000`; `DEFAULT_CATALOG_BUDGET.total_bytes` in
`src/mcp/catalog.ts` is `26_000`. The wrong value had propagated to
`MANUAL.md`. The existing `tests/env-contract.test.ts` could not catch it —
it asserts each variable's **name** appears on every doc surface, never its
value. Registry corrected to `26000`, and that test now also asserts the
documented default equals the constant.

#### Two SPEC citations marked `verified` pointed at files that have never existed

`SPEC-DOCUMENT-PLAN.md` cited `SPEC-FDPM-BRIDGE-ZOD` and `SPEC-DOMAIN-SIDECAR`
as peer SPECs under `docs/specs/`, with `verification: "verified"`. Neither
document has ever existed in this repository — a direct violation of the
evidence rule in `DISCLAIMER.md` and of `CLAUDE.md`'s prohibition on
unverifiable citations.

Corrected at the source (`scripts/build-spec-document-plan.ts`) and
regenerated: the peer reference is now
`fdpm-cli/packages/zod-bridge/README.md`, which exists and is what the
document_plan plugin is actually generated under. `@fdpm/zod-bridge` cites
these three off-tree SPECs sixteen further times in source comments, tests and
its own CHANGELOG, including one rendered as a Markdown link to a missing
file. The dead links are removed and the package README now states plainly
that the documents are not in this repository, so a reader stops hunting.

### Added

#### `FDPM_MCP_REQUIRE_CONFIRMATION_TOKEN` is now reachable (SPEC-MCP-SERVER §9.3)

§9.3 states that Tier 2/3 tools "may additionally be gated by
`FDPM_MCP_REQUIRE_CONFIRMATION_TOKEN=1` — opt-in defense for high-trust
deployments", and §9.5's threat model names confirmation-token mode as one of
four controls bounding the blast radius of indirect prompt injection.

`dispatch.ts` has always enforced the gate from `ctx.requireConfirmationToken`
/ `ctx.confirmationToken`. **The bin entry never read the environment**, so no
operator could switch the control on — only an embedder constructing a context
by hand. The variable appeared in one TSDoc comment, in no registry, in no
`.env.example`, and was read by nothing. A documented security control that
cannot be enabled is not a control.

- New `src/mcp/confirmation-token.ts` resolves the policy; `src/bin/fdpm-mcp.ts`
  wires it into `DispatchCtx` and reports it in the startup banner.
- Exactly `"1"` enables the gate, matching `FDPM_MCP_ENABLE_DESTRUCTIVE`. A
  security control must not be on for `"true"` in one deployment and off for
  `"yes"` in another.
- Enabling the gate without `FDPM_MCP_CONFIRMATION_TOKEN` is a **startup
  refusal** (exit 2), not a silent downgrade. `dispatch.ts` compares the
  caller's token against `ctx.confirmationToken`; were that `undefined`, every
  Tier 2/3 call would be refused with `confirmation_required` and no token
  could ever satisfy it — the operator would be locked out of their own
  workbook.
- Both variables are registered in `FDPM_ENV_VARS`, so they reach `--help`,
  `README.md`, `MANUAL.md` and `.env.example` through the generator.

#### READMEs for the seven plugins that had none

`academic_paper_v0_4_1`, `dnis`, `document_plan_dnis`,
`formal_specification_dnis`, `software_requirements`, `spec_authoring` and
`spec_authoring_dnis` shipped no README — 7 of 17 plugin directories. Every
figure in the new pages is taken from plugin activation output or the
manifest. Two carry warnings worth repeating here: `academic_paper_v0_4_1` has
a `run-bridge.ts --check` drift gate but **no CI workflow to run it**, and
`software_requirements` has generated artifacts with **no `run-bridge.ts` at
all**, so nothing mechanically proves its `generated/profile.json` still
matches its schema.

#### `fdpm.uixo` — match the source ontology: run its oracle, and stop inventing orphans

Validating one real 346-entity document (`claude-app_uixo.json`) against
both showed the plugin rejecting what the source accepts. The source
oracle returns `ok: true` — zero issues across all four tiers — while the
plugin produced 221 findings. Every difference was ours.

- **The oracle now gates ingest.** `uixo-native.ts` exports
  `validateUixoDocument`, 41 coded checks with a remediation each. It was
  vendored and never called. It now runs as the first control, and a
  rejection carries the source's own E-code, tier and fix, so an operator
  can look it up in `UIXO_ERRORS`. This recovers the state-machine,
  status-family, conditional and policy rules the profile does not carry
  — the plugin previously enforced roughly 14 of the 41.
- **Envelope.** Ingest demanded `nodes`; the source's document shape
  declares `entities`, and ingest is `.strict()`, so a valid document
  could not be read at all. The envelope is the source's to define.
- **`extensions` was un-ingestable in either direction.** The bridge
  mapped `z.record` to `kind: "string", format: "json-record"` — "an
  opaque JSON-encoded string; let the validator enforce key/value rules".
  That intent cannot hold: the profile then demands a string while the
  validator generated from the same record demands a record. Records now
  map to the host's `json` field kind (`validation/pipeline.ts` treats it
  as an object), so the value is stored as an object and the validator
  checks it for real. 712 uixo fields were affected; no other plugin uses
  a record, and no workbook held one.
- **221 false orphans.** The source counts an entity reachable through
  soft links anywhere inside `extensions`; our walk saw none, because the
  links were locked in an opaque string. The invariant now reads them
  back and resolves them through `field_values.id`. False positives are
  worse than missing checks — they teach an operator to ignore the
  validator.

The declared losses were corrected rather than left standing:
`uixo.document-oracle-not-ported` becomes
`uixo.document-oracle-gate-at-ingest` (the oracle runs at ingest; the
per-write path is still narrower, because the host validates one write at
a time and cannot see the document), and `uixo.extensions-opaque` becomes
`uixo.extensions-untyped` (validated as an object now; its soft links are
still not typed relations).

The operator's document now ingests: 346 primitives, 340 relations,
`validate` clean. 54 uixo tests (9 new), full suite 178 files / 1664
tests.


#### `FieldDef.name`: enforce what SPEC-CORE actually requires, not a house style

The three legacy exemptions added hours earlier are gone, and so are the
warnings on every command. Investigating what it would cost to rename
5,665 camelCase fields turned up the better answer: **the rule was the
defect.**

- SPEC-CORE states exactly one requirement of a field name — "Every
  `FieldDef` has a `name` unique within its containing primitive or
  struct". It says nothing about characters. The `^[a-z][a-z0-9_]*$`
  pattern in `models/meta.ts` was a house style presented as a contract.
- Nothing in the host depends on the shape: a name is an opaque key into
  `field_values` (`validation/pipeline.ts:396,408,602`), and core
  contains no case conversion at all.
- Three independent parts of the codebase contradicted it — the host's
  own profile compiler (`_item`), the Zod bridge (`<field>Item`), and
  three domains whose vocabularies are camelCase in their own literature
  (`epistemicMethod`, `hasSeverity`, `ownedAttribute`). A rule the
  generator, the compiler and the domains all break is not protecting
  anything; it cost a 1,375-field renaming in the UML derivation.

So `FieldDef.name` now requires an **identifier** —
`^[A-Za-z_][A-Za-z0-9_]*$` — which forbids exactly what would break:
dots, brackets, quotes and spaces make `field_path: "field_values.<name>"`
ambiguous or unparseable. Measured before changing it: the only
non-conforming characters anywhere in the 18 registered profiles were
uppercase letters.

And the rule SPEC-CORE *does* state is now enforced, which nothing
checked: **field names must be unique within their primitive type or
struct**. A duplicate is not cosmetic — `field_values` is keyed by name,
so the second definition silently shadows the first and its validations
never run. No registered profile has one today; the check guards the
future.

`LEGACY_UNVALIDATED_PROFILES` is deleted. Plugin profile registration
validates unconditionally, like every other entry point. `fdpm profile
list` prints 18 profiles with versions, real labels, and no warnings.
snake_case remains the convention for new work — the generators emit it —
but it is a convention, not a gate.


#### Plugin-contributed profiles are now validated like every other kind

`fdpm profile list` showed `VERSION undefined` for three profiles
(operator report, 2026-08-29). The cause was not three careless plugins:
`registerPluginProfile` was the only entry point that never parsed
against `DomainProfile`. `fdpm profile register`, the MCP
`fdpm.profile.register` tool and the persisted-profile loader all
validate; the plugin path did not, so a plugin could register a profile
the operator could not — and that the host would refuse to reload from
disk. **Eleven of seventeen registered profiles failed their own
schema.**

Four defects hid in that gap, each fixed at its source:

- **`version` was absent.** It is REQUIRED by the schema, and the CLI
  interpolated the missing value straight into the table. The bridge now
  emits `version` for every profile it generates — from the sidecar's new
  `profileVersion`, else `pluginVersion` — plus a readable `label`
  (`profileLabel`, else derived from the id: `profile:acme-pitch-deck:0.1`
  → `Acme Pitch Deck 0.1`). No bridge plugin can ship without identity
  again.
- **The bridge minted illegal field names.** Array element fields were
  named `` `${field}Item` `` — camelCase, which violates `FieldDef.name`'s
  `^[a-z][a-z0-9_]*$`, the rule the host enforces on every hand-written
  profile. Now `` `${field}_item` ``.
- **So did the host's own profile compiler.** `compileProfile` synthesised
  `item_field.name = "_item"` for legacy `T[]` fields — a leading
  underscore, which the same rule forbids. Now `"item"`. This affected
  six hand-written profiles (dnis, planning, formal-specification,
  software-architecture, spec-authoring, starter).
- **The bridge emitted two keys the strict schema did not model.**
  `format` (`iso-8601`, `json-union`, …) and `nullable` are generator
  metadata the bridge's own view-page and product-page artefacts read;
  the host does not interpret them. They are now declared on `FieldDef`,
  making a long-standing tolerance explicit.

Enforcement is a **ratchet, not a cliff**. `LEGACY_UNVALIDATED_PROFILES`
exempts exactly three domains whose Zod schemas use camelCase field names
— academic-paper (128), acme-pitch-deck (99) and uixo (5,438). Those names
are stored in live workbooks' `field_values`, so clearing them is a schema
rename plus a data migration of every workbook on that profile, not a code
edit. They register with a startup warning that states the count; anything
else that fails to parse is now a hard error. A test asserts the list
contains exactly those three, that each is registered, and that each still
fails — so an entry that becomes clean must be removed rather than left to
rot, and a fourth cannot be quietly appended.

All seven bridge plugins were regenerated (drift gates clean). Verified:
`fdpm profile list` shows a version and a real label for all 18 profiles;
the MCP server starts and reports 18/18 with versions.


#### build: `copy-plugin-assets` now prunes, so a deleted plugin actually disappears

Deleting `plugins/academic_paper/` removed `profile:academic-paper:0.3`
from the source tree, but `fdpm profile list` kept showing it. Plugin
discovery resolves relative to itself — `dist/src/plugin/discovery.js` →
`dist/plugins` — and the build step only ever *copied*: nothing removed
a destination file whose source was gone, and `tsc` does not delete emit
for a vanished `.ts`. The deleted plugin therefore survived in
`dist/plugins/` (45 files) and every built binary went on registering a
profile the operator had removed. The MCP server has the same
resolution, so it was serving it too.

`copyPluginAssets` now mirrors rather than accumulates: after copying it
prunes every destination file the source no longer justifies — an asset
must exist in source, and compiled output (`.js`, `.js.map`, `.d.ts`,
`.d.ts.map`) must have its `.ts` source — then removes the directories
left empty. Four tests in `tests/plugin-asset-copy.test.ts` cover a
removed plugin, surviving emit whose source lives, stale emit whose
source was deleted, and idempotence.

### Removed

#### `web/` — the Vite browser and its Node bridge are retired

The `fdpm-cli/web` workspace is deleted: 48 tracked files, its own
`package.json` / `package-lock.json` dependency set (React, Vite,
KaTeX, marked, Playwright, `@axe-core/playwright`), its `vitest` unit
suite, and its `playwright` end-to-end suite with six committed
screenshot baselines.

What went with it:

- **The HTTP surface.** `server/bridge.ts` spawned `fdpm <args> --json`
  per request behind nine read endpoints plus one allow-listed write
  family, `POST /api/planning/:verb`. FDPM now ships no HTTP front, and
  the process-per-request front is gone from the concurrency picture —
  the long-lived fronts are the REPL and `fdpm-mcp`, both of which
  detect out-of-band appends by the log's `(mtime_ns, size)` tuple.
- **The two React views** (workbook list, workbook detail) and the
  per-profile templates (`PlanningView`, `GanttView`,
  `FormalSpecificationView`, `SoftwareArchitectureView`,
  `ProseWithMath`, `Math`) that lived in `web/src/templates/`.
- **The Playwright accessibility suite** added days earlier
  (`e2e/ux.spec.ts`, axe-core across three viewports in both themes).

Nothing in the host depended on it. The web workspace was never a
dependency of `@fdpm/cli`: it declared its own package graph, was
absent from the host `tsconfig.json` include, was excluded by the host
`vitest` include (`tests/**/*.test.ts`), and was named by none of the
four GitHub workflows. `npx tsc -p tsconfig.json --noEmit` is clean and
the host suite is unchanged by the removal.

Two contracts outlive their only consumer and are now dead code rather
than integration points, recorded here so they are not mistaken for
live surfaces:

- `HTTP_STATUS_FOR_CATEGORY` (`src/core/errors/fdpm-exception.ts:55`)
  maps the 10-category error taxonomy to HTTP status. The bridge was
  its only caller.
- `BridgeResult.viewPage` (`ViewPageDescriptor`) is still emitted by
  `@fdpm/zod-bridge` into `plugins/<id>/generated/view-page.json` and
  is still held byte-stable by the CI drift gate, but the host
  registers no `fdpm://plugin/<id>/view-page` resource and no client
  reads it.

`PURPOSE.md` is unaffected: it describes the web UI in the future tense
throughout ("A web UI *will* sit on top of the same MCP surface") and
states that HTTP is out of scope for the CLI runtime. The README's
implementation-status table already listed "Web UI (humans on the same
MCP surface)" as `Future`. Retiring the prototype removes the one place
where the tree claimed more than those documents do.

Two untracked whole-repository review artefacts that happened to live
under `web/` — the 2026-07-13 strengths/weaknesses pair, whose declared
scope is the git root, not the web app — were moved to
`docs/reviews/repo-review-20260713-{strengths,weaknesses}.json` rather
than deleted; `docs/architecture/FDPM-ARCHITECTURE-2026-08-28.md` cites
them as evidence.

#### `fdpm.academic-paper` — `profile:academic-paper:0.3` withdrawn

The plugin registering `profile:academic-paper:0.3` is deleted. A
structural diff against `profile:academic-paper:0.4.1` found the two
profiles identical: 24 primitive types, 61 relation types, 279 CEL
constraints, 22 enum defs and 33 validation rules, all byte-identical
once the vendor prefix (`acad:` vs `acad041:`) and the plugin-id prefix
on rule ids are normalised. The only raw difference — `validation_rules`
at 11,027 vs 11,489 bytes — was exactly 33 rules x 2 id fields x the 7
characters of `-v0-4-1`.

What 0.4.1 adds is not in the profile at all: three checks inside the
Zod `superRefine` — a `Quotation.translatedFrom` self-loop, and
transitive cycle detection for `Claim.supersededBy` and
`Quotation.translatedFrom` — bringing the typed-graph integrity layer to
parity with the rev3 SHACL mirror. Those bite at write time and are
invisible to `fdpm.profile.get` / `type_info`, which is why the two
profiles read as identical over MCP.

- No workbook was bound to 0.3 (checked against the live data dir before
  removal), so nothing is stranded and no migration is required.
- The deleted plugin's own version numbers disagreed with each other:
  `package.json` 0.1.0, manifest 0.4.0, profile id 0.3 — and its rules
  carried `[since 0.4]` descriptions, so the `0.3` label was already
  stale.
- The surviving plugin **reclaims the `acad:` vendor namespace**. Its
  `acad041:` prefix existed only so two plugins could declare
  `acad:Paper` without colliding at registration; with the older plugin
  withdrawn the discriminator discriminated nothing. All 24 primitive
  type ids, 61 relation type ids and the `id_format` patterns move
  `acad041:` → `acad:`; the profile id stays
  `profile:academic-paper:0.4.1`.
- Downstream tooling therefore keeps working with a one-line change
  each: `acad_validate.py`, `test_acad_validate.py` and
  `scripts/fdpm_to_latex.py` had only their profile-id constant
  repointed at 0.4.1 — their 100 `acad:Type` strings are untouched and
  all of them resolve against the live profile (verified). Python suite:
  83 passed, 2 skipped.
- Still carrying the old discriminator: the plugin **id**
  (`fdpm.academic-paper-v0-4-1`, which prefixes the 33 rule ids) and its
  directory name (`plugins/academic_paper_v0_4_1`). Neither is addressed
  by the Python tooling, so both were left alone.

### Added

#### `fdpm.uixo` 0.1.0 — UIXO v11 interaction ontology, with its graph edges made enforceable

712 ontology classes as primitive types and **210 relation types derived
from the ontology's own hierarchy**, from a vendored
[`schemas/uixo-native.ts`](plugins/uixo/schemas/uixo-native.ts) v1.2.0
(source ontology `uixo_tbox_full_v11`, sha256 `bd808d51...`).

- **The defect this fixes, measured.** `uixo-native.ts` is already Zod and
  `@fdpm/zod-bridge` accepts it unchanged - 712 primitive types in 100 ms.
  That result is worthless: the source models every graph edge as
  `z.array(UixoEntityIdSchema)`, so the bridge emitted **0 relation types
  and 1,653 list fields of opaque id strings**, and a Button written with
  `hasChildComponent: ["ex:does-not-exist"]` was **accepted with zero
  findings**. 712 typed boxes and no graph.
- **[`derive.ts`](plugins/uixo/derive.ts)** lifts all 1,653 edge fields out
  of the entity schemas and re-expresses them as relation types. Nothing is
  hand-maintained: each edge's RDF range comes from its own `.describe()`
  (present on 1,653 of 1,653) and the classes satisfying that range from
  `CLASS_PARENT`, the ontology's 712-entry hierarchy. 1,653 occurrences
  collapse to 210 properties - `hasChildComponent` is one property that 272
  classes carry, not 272 relations. Target sets stay precise: median 1,
  p90 45, max 272. Lifting uses `.omit()` on the strict source object, so
  writing a lifted field is now a **rejection**, not a silently stored list.
- **The host now enforces, per write:** endpoint existence, `owl:range`
  (`hasLayout` refuses a Button) and `owl:domain` (`uixo:Canvas` declares no
  `hasChildComponent`, so it cannot source one - this caught a wrong
  assumption in the first test fixture).
- **Prefixed class names.** Five local names are declared in two namespaces
  each (`InlineCode`, `LanguageSelector`, `NavigationItem`,
  `PromptComposer`, `VisualLayer`); unprefixed, ten distinct classes would
  silently become five. Field names, by contrast, pass through unchanged -
  for an RDF vocabulary the camelCase property name is the name.
- **Vendoring is a script**, not a hand-edit:
  [`scripts/vendor-uixo.ts`](plugins/uixo/scripts/vendor-uixo.ts) prepends a
  header and applies five recorded type annotations (upstream exports whose
  inferred types exceed TS7056's declaration-emit limit). `--check`
  reverses them and re-hashes, so an in-place edit of the vendored body
  fails. The upstream sha256 is asserted by test.
- **[`invariants.ts`](plugins/uixo/invariants.ts)** ports the source
  oracle's graph-level v1.1/v1.2 deltas - one InteractionSystem root,
  reachability, containment as a tree with reciprocal edges and unique
  `orderIndex`, non-blank labels - because a per-primitive `ValidatorFn`
  receives one instance and the relations, never the sibling primitives.
  The semantic and policy tiers are **not** ported and are declared as such.
- **Ingest** carries all five PALS's-LAW controls; **two** renderers, not
  712 - a class table that dispatches on `type_id`, and a document outline
  that walks the containment tree back out of the relations.
- Scale is a non-issue for the host (register 1 ms, 0.3 MB heap), but
  `generated/profile.json` is **7.1 MB**, which makes
  `FDPM_MCP_MAX_RESOURCE_BYTES` (`task:p1-sizecap`, still Backlog) a
  prerequisite rather than a nicety.
- 45 tests; seven declared losses in `generated/audit.json`.

ARCHITECTURAL REQUIREMENT (PALS's LAW): LLMs will always produce some form of error.
Absence of output verification is a design defect, not a runtime bug.
All LLM output must be treated as untrusted and validated explicitly.

#### `fdpm.uml` 0.3.0 — components, ports and connectors (roadmap Phase 2)

UML 2.5.1 StructuredClassifiers: the internal structure of a component,
modelled as a graph rather than as fields.

- Six metaclasses: **Component** (§11.6), **Port** (§11.3), **Connector**
  and **ConnectorEnd** (§11.2), **Artifact** (§19.2) and
  **AssociationClass** (§11.5). Profile grows 16 → 22 primitive types.
- Ten edges: `uml:OwnsPort`, `uml:OwnsConnector`, `uml:OwnsConnectorEnd`,
  `uml:ConnectorRole`, `uml:PartWithPort`, `uml:Provides`,
  `uml:Requires`, `uml:RealizesComponent`, `uml:Manifests`,
  `uml:NestsArtifact`. Profile grows 14 → 24 relation types.
- `ComponentRealization` is a **relation**, not a primitive — the rule
  Phase 1 set for `Dependency`, `Generalization` and
  `InterfaceRealization`, asserted by test.
- `uml:ConnectorRole` is one edge with two legal target types
  (`uml:Property` or `uml:Port`), because in UML a port *is* a property
  — the encapsulated kind.
- Five existing edges were widened by naming the new types
  (`uml:TypedBy` now accepts Port and Connector as sources;
  `uml:MemberEnd` accepts AssociationClass; `uml:Realizes` and
  `uml:OwnsReception` accept Component). A regression test asserts the
  profile still contains **no wildcard endpoint anywhere**, and that a
  port owned by an interface is still refused.
- Ingest enforces UML's own rule that a connector joins **at least two
  ends** (§11.2), that a connector end's role is a property or port, and
  that provided/required name an interface — each with a message that
  cites the clause.
- The outline renderer prints the component contract, its ports with
  provided/required interfaces, and each connector as the pair of roles
  it joins.
- **MCP:** `uml/model_a_domain` now teaches internal structure; its
  drift test checks all 24 relation ids against the registered profile.
- **Migration: none.** Purely additive — nothing renamed or removed, and
  the Phase 0 library fixture ingests to the same 25 primitives and
  validates 0/0/0 (asserted by regression test). Plugin 0.2.0 → 0.3.0.
- 24 new tests (86 → 107 for the plugin); full suite 172 files / 1591
  tests green.


#### `fdpm.style` 0.1.0 — StyleDefinition 3.1.0 as a bridge-derived profile

A visual style registry as a typed, event-sourced workbook.
[`plugins/style/schemas/style.ts`](plugins/style/schemas/style.ts) is a
**transcription**, not a copy, of `_ingest_bin/style-schema.ts` v3.1.0:
the source is 3717 lines of type-level TypeScript — 36 `interface`s, 83
`type` aliases, 30 smart constructors — and `@fdpm/zod-bridge` walks
runtime Zod nodes, so nothing of the source survives erasure for the
bridge to read.

- **Fifteen entities as primitives** — `Style`, `Movement`, the ten
  grammar sections (line, colour, form, space, surface, typography,
  composition, contrast, iconography, motion), `Rule`,
  `ComplianceCheck`, `CanonicalReference` — and **ten typed edges**
  (`style:HasGrammar`, `style:DeclaresRule`, `style:DeclaresCheck`,
  `style:TestsRule`, `style:CitesExemplar`, `style:HasReference`,
  `style:BelongsToMovement`, `style:NegatesMovement`,
  `style:InfluencesStyle`, `style:ParentMovement`). `HasGrammar` is
  polymorphic over ten target types and `DeclaresRule` over ten *source*
  types, which the sidecar's single-`target_type_id` `ReferenceSpec`
  cannot express, so both are author-declared and merged by
  `finalizeProfile`.
- **A workbook is one `StyleRegistry`.** The source defines the registry
  as the closed world for cross-document resolution; that is what a
  workbook is. Every cross-reference is therefore a relation, and the §7
  pipeline rejects a relation whose endpoint does not exist — the
  registry's closed-world rule became an invariant of every write instead
  of a function someone has to remember to call.
- **Zero opaque fields.** The source carries 47 discriminated unions and
  a `Record`-shaped token layer; both reach the host as opaque
  `json-union` / `json-record` strings. Each union is flattened onto its
  `kind` discriminant and each `Record` becomes a key-bearing entry list,
  so all fifteen primitive types store typed, queryable values. Asserted
  by test: the emitted profile contains no `json-union` and no
  `json-record` field. Flattening widens the *storage* type, which is a
  declared soundness loss closed by each entity's `superRefine`; every
  entity is a `z.strictObject`, so an unknown field is a rejection rather
  than the host's default `core:field:undeclared` warning.
- **The 991-line cross-field validator is ported, split by scope.**
  Invariants confined to one entity live in that entity's `superRefine`
  and run on every host write. Those spanning entities — rule/check
  weight alignment, defining-rule exemplar coverage, non-advisory check
  coverage, rule-id namespace and P-form agreement, grammar↔token kind
  agreement, the stroke-weight derivation, the WCAG contrast arithmetic,
  forbidden-colour prohibition linkage, grammar-section completeness, the
  movement forest — live in
  [`plugins/style/invariants.ts`](plugins/style/invariants.ts), because a
  `ValidatorFn` receives one instance and the relations, never the
  sibling primitives. **Known gap, declared:** a workbook built by direct
  primitive writes rather than through `buildStyleWorkbook()` is
  field-valid but not invariant-checked until `validateStyleWorkbook()`
  is run against it.
- **Ingest** (`plugins/style/ingest.ts`) carries all five PALS's-LAW
  controls: strict typed parse, referential validation of the closed
  world, a `verification` `FDPMException` that writes nothing on failure,
  a failure-path suite, and input-independent loop bounds.
- **Renderer** `style:StyleOutlineRenderer` reassembles the graph the
  ingest took apart into a reviewable document.
- 123 tests; 95% statements / 80% branches over the plugin. Eight
  declared losses are emitted into `generated/audit.json`.

ARCHITECTURAL REQUIREMENT (PALS's LAW): LLMs will always produce some form of error.
Absence of output verification is a design defect, not a runtime bug.
All LLM output must be treated as untrusted and validated explicitly.

#### `fdpm.uml` 0.2.0 — abstract-metaclass policy, signals and receptions (roadmap Phase 1)

The first of the eleven UML phases: the policy every later package
profile inherits, plus the two concrete structural metaclasses the
Foundation subset left behind.

- **Abstract-metaclass policy.** UML 2.5.1 defines 26 of the source
  library's 110 metaclasses as abstract — `Element`, `Classifier`,
  `Feature`, `Vertex`, `ActivityNode` and their kind have no instances.
  The library records that only in prose, so
  [`plugins/uml/abstract.ts`](plugins/uml/abstract.ts) is the
  machine-readable classification of all 110, each carrying the clause
  the source cites. It is enforced at **activation**
  (`assertNoAbstractPrimitiveTypes` refuses to serve a profile that
  names one, listing every offender) and at **ingest** (a model whose
  `xmi:type` is abstract is rejected with the concrete alternatives by
  name, not a generic enum mismatch). Completeness is proved against a
  pinned inventory of the source library with its sha256, so a
  metaclass added upstream fails the suite until it is classified.
- **`uml:Signal`** (§11.3) — a packageable classifier that may own
  attributes, specialise another signal and type an element — and
  **`uml:Reception`** (§11.4), joined by the new **`uml:OwnsReception`**
  and **`uml:Signals`** edges. The outline renderer prints receptions in
  UML's own notation (`` `«signal» OrderPlaced` ``).
- `Dependency` and `InterfaceRealization`, the other concrete metaclasses
  of these packages, remain **relations** (`uml:DependsOn`,
  `uml:Realizes`) rather than primitives; modelling them twice would put
  the same fact in two places. Asserted by test.
- **MCP surface:** the plugin now ships the prompt
  **`uml/model_a_domain`** (SPEC-MCP-SERVER §13.5) carrying what tool
  descriptions cannot — which metaclass to reach for, how attributes,
  operations, association ends and receptions are wired as relations,
  that multiplicity is numeric (`-1`, never `"*"`), and which
  metaclasses will be refused. `tests/plugins/uml/prompt.test.ts`
  cross-checks every type and relation id in its body against the
  registered profile, so it cannot drift from what it teaches.
- Profile grows from 14 to 16 metaclasses and 12 to 14 relation types.
  **Migration: none.** The change is additive — no field, type or
  relation was renamed or removed, and existing `uml-library` workbooks
  validate unchanged. Plugin version 0.1.0 → 0.2.0; the profile version
  tracks the UML specification (2.5.1) and is unchanged.
- 26 new tests (60 → 86 for the plugin); full suite 166 files / 1436
  tests green.


#### `fdpm.uml` — UML 2.5.1 Foundation subset as a bridge-derived profile

Answers "can `schemas-lib/src/schemas/domains/uml` be mapped into an FDPM
profile?" with a working plugin rather than an opinion. `profile:uml:2.5`
carries fourteen metaclasses (Package, Model, Class, Interface, DataType,
PrimitiveType, Enumeration, EnumerationLiteral, Property, Operation,
Parameter, Association, Constraint, Comment) and twelve typed edges.

- [`schemas/uml-foundation.ts`](plugins/uml/schemas/uml-foundation.ts) is
  a *normalisation* of the source library, not a copy. Three host rules
  make that unavoidable, and each is asserted in the tests against the
  rule that forces it: `FieldDef.name` must match `^[a-z][a-z0-9_]*$`
  (1,375 of the source's 2,032 fields are camelCase or `xmi:id`); the
  bridge rejects `z.any()` (65 value-specification fields block 33 of the
  source's 110 metaclasses), so `ValueSpecification` is modelled per UML
  2.5.1 §8.3; and `UnlimitedNatural` (`number | "*"`) would become an
  opaque `json-union` string, so `upper` is an integer with `-1` =
  unlimited.
- Relation types are author-declared in
  [`sidecar.ts`](plugins/uml/sidecar.ts) and merged by
  `finalizeProfile()`: UML's references are polymorphic (a package owns
  any PackageableElement) and the sidecar's `ReferenceSpec` emits a
  single `target_type_id`, while `RelationTypeDef.target_types` accepts a
  list. Same drift gate as the generated files.
- [`ingest.ts`](plugins/uml/ingest.ts) accepts a model in the source
  library's own shape (camelCase, `xmi:id`, nested containment, `"*"`
  bounds) and lifts every containment array into its own primitive, so
  the `Property` a class owns and the one an association names as a
  member end are one primitive — not two copies. PALS's LAW: unknown
  fields are rejected, then id uniqueness, referential validity and UML's
  ≥2-ends rule are asserted; a rejected model writes nothing.
- [`renderers/model_outline.ts`](plugins/uml/renderers/model_outline.ts)
  prints the model in UML notation (`+ keywords : String [0..*]`) with
  generalisation, realisation, dependency, ends, constraints and comments
  in place — the bridge's per-metaclass renderers print field tables.
- Tests: [`tests/plugins/uml/`](tests/plugins/uml/) — 34 across bridge
  drift/`--check`, manifest parity, activation and relation endpoints,
  validator accept/reject, the three normalisations, and the fixture
  model ingested, validated and rendered end to end with every ingest
  rejection path exercised. CI:
  [`.github/workflows/plugin-uml.yml`](.github/workflows/plugin-uml.yml).
- Out of scope, declared as losses in `generated/audit.json`:
  StateMachines, Activities, Interactions, UseCases, Components,
  Deployments, Profiles/Stereotypes; relationship-element identity; UML's
  derived unions.

### Fixed

#### `spec:SpecMarkdownRenderer` — references without optional fields rendered a `[[render-error]]` marker into the SPEC

`spec:Reference.locator` and `.verification_note` are optional (the note
is required only for `unverified` / `cannot_verify`). `REFERENCE_ITEM_TEMPLATE`
guarded both with `${if: doc.fields.<field>}`, but the guard is evaluated
by CEL, where reading an absent map key is an **error**, not a falsy
value. Every reference that omitted either field therefore emitted
`[[render-error: doc.fields.verification_note :: No such key …]]` into
the rendered document and pushed a render finding.

- Both guards now use the CEL presence macro (`${if: has(doc.fields.…)}`).
- Re-rendered from source, marker-free: SPEC-CEL-VALIDATOR, SPEC-CORE,
  SPEC-DOCUMENT-PLAN, SPEC-EXPRESSION-RUNTIME, SPEC-MCP-SERVER,
  SPEC-RENDER-DSL, SPEC-REPL. The SPEC-EXPRESSION-RUNTIME re-render also
  absorbs a pre-existing column-alignment drift in the §M activation
  table (the committed file predated a build-script change; the
  determinism test compares two fresh builds, never the committed file,
  so the drift was invisible to it).
- Test: `tests/spec-md-body-eval.test.ts` renders one reference with
  neither optional field and one with both — no marker, no findings,
  optional parts omitted rather than emptied.


#### `fdpm-mcp` — connected clients never heard about workbooks created after connect (SPEC-MCP-SERVER §10.1, §15.4)

`resources/list` and `prompts/list` are computed from the live `Host` on
every request, but the server declared neither `resources.listChanged`
nor `prompts.listChanged` and sent no notification after a SIGHUP
reload. MCP clients cache both lists, so a workbook built while a client
was connected stayed invisible in its resource list — readable by URI,
missing from the listing. Observed against the live server after
building the `spec-document-plan` workbook: `fdpm.workbook.list` and
`fdpm.workbook.get` saw it; the client's `resources/list` showed 20 of
21 workbooks.

- Capabilities now declare `resources: { listChanged: true }` and
  `prompts: { listChanged: true }`. `tools.listChanged` stays
  undeclared: the advertised tool array is frozen at boot (it is the
  array the §8.5 byte budget was measured against), so a reload cannot
  change it.
- The SIGHUP handler moved out of the binary into
  [`src/mcp/reload.ts`](src/mcp/reload.ts) (`handleReload`), which after
  a successful `Host.reload()` clears the freshness map, writes the
  `reload` audit entry, then sends
  `notifications/resources/list_changed` and
  `notifications/prompts/list_changed`.
- A rejected reload (`host_compat` / `internal`) notifies nothing and
  leaves the freshness map intact — the pre-reload Host is still what
  the server serves, so the client's cached lists are still correct.
  A notification that cannot be delivered (transport closed mid-reload)
  is reported on stderr and never fails the reload or the process.
- SPEC-MCP-SERVER 0.1.8 adds §10.1 and §15.4 and corrects §15.3, which
  claimed SIGHUP drained and exited; §20 now lists the invariants it
  always declared it would, including
  `spec:inv:reload-notifies-list-changed`.
- Tests: [`tests/mcp/reload-notify.test.ts`](tests/mcp/reload-notify.test.ts)
  — a workbook created out-of-band becomes enumerable and both
  notifications fire; both failure paths notify nothing; a throwing
  notifier does not fail the reload; and the wire-level `initialize`
  response declares the two `listChanged` capabilities and not a third.

### Added

#### `fdpm-mcp` — plugin-shipped prompts as skills; `planning/triage_iteration` (SPEC-MCP-SERVER §13.5)

PURPOSE.md's third layer: prompts carry the domain "how to think" that
tool descriptions cannot. Shipped as skills, not templates.

- Plugin API: `ctx.registerPrompt(reg)` → runtime prompt registry
  (validated at install, `promptId` unique across plugins, listed
  sorted, torn down on deactivate). `PromptRegistration` =
  `{ promptId: "<plugin>/<slug>", title, description, arguments, render }`.
- Skill contract ([`src/mcp/prompts.ts`](src/mcp/prompts.ts)): the
  description must say *when* to use the prompt (40..300 chars); the
  listing entry is ≤ 600 B (progressive disclosure — `prompts/list` is
  metadata only); the rendered body must contain "When to use", "Call
  order" and "Failure modes" and stay ≤ 16 KB; arguments are resolved
  and type-checked; the plugin's render output is validated before it
  reaches a client (PALS's LAW).
- `fdpm-mcp` declares the `prompts` capability and serves
  `prompts/list` and `prompts/get`.
- `planning/triage_iteration`: when to use, a nine-step call order over
  real tools and resources, failure modes by real `plan:val:*` ids —
  tests cross-check both against the manifest and the plugin sources.
- CLI `fdpm plugin prompts` / `fdpm plugin prompt <id> --arg k=v`;
  SDK / package root `listPrompts(host)`, `renderPrompt(host, { id, args })`.
- Tests (+45): contract, registry, prompt content, CLI E2E, SDK, stdio
  E2E (capability declared, empty with plugins off, list/get with
  plugins on).

#### `fdpm-mcp` — audit report: error classes from `mcp-audit.jsonl` (SPEC-MCP-SERVER §9.5)

The audit log recorded every call's outcome but nothing read it, so
nothing said which tool, reason or rule fails most. This closes the
flywheel — instrument where tools fail, set a success SLO, turn the
error classes into eval cases — the way Honeycomb ran its MCP server.

- Tier-2 rejections now record the distinct `rule_ids` they fired on
  the audit `complete` entry: the error class a §7 rejection belongs to.
- [`src/persistence/mcp-audit-report.ts`](src/persistence/mcp-audit-report.ts)
  — typed parse of the JSONL (malformed lines are counted in
  `source.skipped`, never coerced), per-tool outcomes (`ok` / `failed` /
  `rejected` / `replayed` / `dry_run`), error classes (`<tool>
  category/reason` for protocol errors, `<tool> rule:<id>` for
  rejections) with count and share, success-rate SLO with the shortfall
  in calls, nearest-rank p50/p95 latency, absolute (`since`/`until`) or
  relative (`1h` | `24h` | `7d` | `all`) windows.
- Three surfaces, one implementation: resource
  `fdpm://audit/report[/{window}]` (reads go through resources — no
  catalog bytes), `fdpm mcp audit-report [--window|--since|--until|--top|--slo|--json]`,
  SDK / package-root `auditReport(host, opts)`.
- `Host.dataDir` read-only getter (classified not-exposed).
- Tests (+30): aggregator, resource (incl. a live rejection becoming a
  `rule:` class), CLI E2E on the real binary, SDK, audit-log `rule_ids`,
  stdio E2E reading the report over the wire.

#### `fdpm-mcp` — Tier-3 hardening: `dry_run` previews, mandatory idempotency keys, pre-execution audit (SPEC-MCP-SERVER §8.7)

A delete is not retry-safe unless the server can recognise a duplicate,
and an agent cannot show an operator what a delete will do without
running it. Both now hold on every Tier-3 tool.

- [`src/core/operations/delete-preview.ts`](src/core/operations/delete-preview.ts)
  — would-affect previews as pure reads: a primitive's type and every
  relation that references it; a relation's endpoints; a workbook's
  counts; batch variants with the first-missing-id `not_found` contract.
  One implementation behind three surfaces: MCP `dry_run`, CLI
  `--dry-run`, SDK `previewPrimitiveDelete` / `previewRelationDelete` /
  `previewWorkbookDelete` (also at the package root).
- Every Tier-3 tool accepts `dry_run` and `idempotency_key`.
  `dry_run: true` (strict boolean) returns
  `{ ok, dry_run, would_affect, post_state_summary }` with no
  `operation`, passes the destructive and confirmation gates (it has no
  side effect), and needs no key — PURPOSE.md's approval preview.
- A real destructive call without `idempotency_key` is refused
  (`validation` / `idempotency_key_required`). The session keeps
  `(tool, key) → result` for 5 minutes (cap 1,000): same key + same
  args replays the recorded outcome (handler errors included; audit
  `replayed: true`); same key + different args is refused (`conflict`
  / `idempotency_key_reused`); concurrent same-key calls coalesce onto
  one execution; gate refusals are never cached.
- Audit: the `start` entry is the intent record, written before the
  handler runs; for Tier-3 it carries `tier`, `idempotency_key`,
  `dry_run`; `complete` entries carry `replayed` / `dry_run`.
- CLI: `fdpm workbook|primitive|relation delete --dry-run`.
- Tests (+45): core previews, `tier3-dry-run`, `tier3-idempotency`
  (replay, conflict, per-tool scope, coalescing, TTL, cap, audit),
  pre-execution audit, stdio E2E dry-run through the disabled gate, SDK
  previews, CLI dry-run.

#### `fdpm-mcp` — server instructions and `fdpm://guide` (SPEC-MCP-SERVER §8.6)

The cold-start orientation layer. PURPOSE.md's eval asks whether a cold
agent, given only the server, can drive a workbook on first contact;
until plugin-shipped MCP prompts land (v0.2), `initialize.instructions`
is the server's answer.

- [`src/mcp/instructions.ts`](src/mcp/instructions.ts) — `SERVER_INSTRUCTIONS`,
  a static (per-manifest, no runtime state) text sent once per session:
  the cold-start workflow (list → `type_info` → write → read via
  resources), the response contract (`isError` vs `ok:false`,
  `validation_report.findings[]`, the recovery loop), the protocol-error
  categories and `evidence.reason`s (`destructive_disabled`,
  `stale_state`, `rate_limited`, `confirmation_required`), and the
  common `rule_id`s. `INSTRUCTIONS_BUDGET_BYTES` (4,000) caps it;
  `checkInstructionsBudget()` is enforced in CI and at boot (exit 2).
- New resource `fdpm://guide` (`text/markdown`,
  [`src/mcp/resources/guide.ts`](src/mcp/resources/guide.ts)) serves the
  same bytes for clients that ignore `initialize.instructions`.
- `fdpm.health` returns `instructions_bytes` (additive).
- CI: [`tests/mcp/instructions.test.ts`](tests/mcp/instructions.test.ts)
  (content contract, budget, every registry URI template named, no
  unknown tool named), [`tests/mcp/resources-guide.test.ts`](tests/mcp/resources-guide.test.ts),
  dedup contract in `tool-descriptions.test.ts`, and the stdio E2E checks
  `client.getInstructions()` and `fdpm://guide` are byte-identical.

#### `fdpm-mcp` — tool-catalog byte budget and schema-by-resource (SPEC-MCP-SERVER §8.5)

The `tools/list` catalog is now a measured, capped quantity. Every MCP
session pays for the whole registry (name + description + JSON Schema
per tool) before the agent does any work; on manifest 0.1.0 that was
33,929 bytes for 30 tools, 8,809 of them the `DomainProfile` schema
inlined into `fdpm.profile.register` (26 % of the catalog).

- [`src/mcp/catalog.ts`](src/mcp/catalog.ts) — `buildToolsListEntries`,
  `advertisedCatalog`, `measureCatalog`, `checkCatalogBudget`,
  `buildCatalogReport`, `resolveCatalogBudget`. `DEFAULT_CATALOG_BUDGET`
  is 28,000 bytes total / 2,000 bytes per tool — a ratchet on the
  measured size plus ~10 % headroom; raising it is a reviewed change
  that needs a CHANGELOG line.
- `fdpm-mcp` builds the advertised catalog once at boot (Core manifest
  followed by `discoverPluginTools` output, so plugin verbs are measured
  against the same budget and can never bulk-advertise past it),
  measures it, and **refuses to start with exit 2** when over budget,
  printing each violation. `tools/list` carries `_meta.catalog_bytes`
  and `_meta.catalog_budget_bytes`; the ready banner prints both.
- `FDPM_MCP_CATALOG_BUDGET_BYTES` (default `28000`) raises the total for
  a deployment that knowingly accepts the token cost. The per-tool
  limit is not tunable: an oversized tool is a defect in the tool.
- `fdpm.health` returns `catalog: { tool_count, total_bytes,
  budget_total_bytes, budget_per_tool_bytes, within_budget }`.
- New resource provider `fdpm://schema/{schema_id}`
  ([`src/mcp/resources/schema.ts`](src/mcp/resources/schema.ts)); first
  member `fdpm://schema/profile` serves the DomainProfile JSON Schema
  (`application/schema+json`), derived at read time from the same Zod
  schema the server validates with — resource and validator cannot drift.
- CI: [`tests/mcp/catalog-budget.test.ts`](tests/mcp/catalog-budget.test.ts)
  fails the build when the Core catalog exceeds the budget in either
  destructive mode or any tool exceeds the per-tool cap;
  [`tests/mcp/fdpm-mcp-stdio.test.ts`](tests/mcp/fdpm-mcp-stdio.test.ts)
  spawns the real binary over stdio and checks the boot gate, `_meta`,
  `fdpm.health.catalog`, the schema resource, and a wire-level Tier-2
  rejection. 48 new tests.

#### `@fdpm/zod-bridge@0.2.0` — Hybrid lift detection (Entity vs ValueObject)

Closes the architectural gap surfaced by the v0.1.0 trial: identity
must be declared, not inferred from shape. The new classifier
([`src/classifier.ts`](packages/zod-bridge/src/classifier.ts))
implements a three-pass detection borrowed from
[`usl-ng-core`](https://github.com/pedroanisio/usl-ng-core)'s
Zod ingester (Lean-verified upstream):

  1. **Convention.** `{Name}` + `{Name}Id` companion → Entity.
  2. **Explicit list.** `BridgeOptions.entities: string[]` promotes
     additional schemas to Entity.
  3. **Default.** Everything else is ValueObject.

The bridge now emits one `PrimitiveTypeDef` per schema-map key
(previously collapsed into one). Audit log surfaces candidate
promotions but never auto-applies them.

Trial re-run against `pitch-deck.schema.v2.ts`: **9 primitives**
(was 1), **85 fields** (was 17), **115 constraints** (was 13).
Workbook `howto-zod-to-fdpm-plugin@180` documents the convention
and records Option A (USL-NG Core upstream) as the v1.x direction.

72/72 tests passing.

### Changed

#### Server instructions budget ratcheted 4,000 → 4,500 B; PROMPTS block

- `INSTRUCTIONS_BUDGET_BYTES` 4,000 → 4,500 after the audit (§9.5) and
  prompts (§13.5) lines; measured 4,219 B. The ratchet is a reviewed
  change, recorded here.
- No manifest bump (a capability was added; no tool changed — 0.4.0).

#### Audit log gains `rule_ids`; server instructions name the audit resource

- `McpAuditCompleteEntry.rule_ids?: string[]` on Tier-2 rejections
  (additive; older readers ignore it). Instructions 3,964 B / 4,000.
- No manifest bump: a resource was added, no tool changed (0.4.0).

#### `fdpm-mcp` — MCP tool manifest `0.3.0` → `0.4.0`; Tier-3 calls require `idempotency_key`

- Tier-3 input schemas gained optional `dry_run` and `idempotency_key`
  (minor). A real (non-dry-run) Tier-3 call without a key is now
  refused — a behavioural tightening on the destructive surface only.
- Server instructions grew to 3,887 B (budget 4,000); catalog 25,312 B
  destructive off / 24,322 B on (budget 26,000).
- Roadmap task `p2-audit-gates` asked for a 100 ms same-workbook
  debounce; it is deliberately **not** implemented — with keys
  mandatory it would only refuse legitimate distinct deletes and make
  tests timing-dependent (ADR `decision:0008`).

**Migration.** Agents and scripts issuing Tier-3 calls must add
`idempotency_key` (any unique string; reuse it to retry). Preview first
with `dry_run: true`. Nothing changes for Tier-1/2 tools, the CLI
(`--dry-run` is additive), or the SDK (new exports only).

#### `fdpm-mcp` — MCP tool manifest `0.2.0` → `0.3.0`; descriptions deduplicated; catalog budget ratcheted

- The generic prose that thirteen Tier-2 descriptions repeated ("on
  rejection the response is `isError: false`, `ok: false` … read those,
  fix the input, retry"; "Returns the standard Tier-2 envelope") and the
  gating sentence five Tier-3 descriptions repeated now live once in
  `initialize.instructions`. Descriptions keep only tool-specific facts
  (what `type_info` must be consulted for, what rejects, batch
  preference, immutability rules). Catalog: 25,699 B → **23,567 B**
  (destructive off), 24,709 → 22,577 B (on).
- `DEFAULT_CATALOG_BUDGET.total_bytes` ratcheted **28,000 → 26,000**
  (~10 % headroom over the new measurement). `FDPM_MCP_CATALOG_BUDGET_BYTES`
  default in the docs follows.
- Manifest `0.3.0`: additive `fdpm.health.instructions_bytes`, new
  resource family, no tool/argument changes.

**Migration.** No client change is required. Clients that cached tool
descriptions keyed by manifest version see new text under `0.3.0`.
Operators who pinned `FDPM_MCP_CATALOG_BUDGET_BYTES=28000` explicitly may
keep it; the new default is lower, not higher.

#### `fdpm-mcp` — MCP tool manifest `0.1.0` → `0.2.0`

- `fdpm.profile.register` advertises an **opaque** `profile` object
  (`{ type: "object" }`; 8,809 → ~300 bytes of schema). The shape is
  served by `fdpm://schema/profile` and enforced server-side with the
  same Zod schema. A malformed profile is now a Tier-2 **rejection** —
  `isError: false`, `ok: false`, one `validation_report.findings[]` entry
  per Zod issue with `rule_id: "core:profile-schema"` and `field_path` —
  instead of a protocol-level `validation` error. Nothing is registered
  on rejection. The `extends` contract the description always claimed
  (parents registered first, else `not_found`) is now enforced; before,
  a dangling parent surfaced only at `fdpm.workbook.create`.
- `fdpm.health` output gained the `catalog` object (additive).
- `Host.registerPluginProfile` classified as not-exposed in
  [`src/mcp/not-exposed.ts`](src/mcp/not-exposed.ts) (plugin-activation
  path; never LLM-facing).

**Migration.** Clients that send a valid profile see no change. Clients
that branched on `isError: true` + `category: "validation"` for a
malformed profile must branch on `structuredContent.ok === false` and
read `validation_report.findings[]` — the same loop as every other Tier-2
tool. Operators whose catalog must exceed 28,000 bytes (many plugin
tools) set `FDPM_MCP_CATALOG_BUDGET_BYTES` explicitly; otherwise the
server refuses to start and prints the violations. Measured catalog after
this change: 25,699 B (destructive off) / 24,709 B (on).

### Fixed

#### `@fdpm/zod-bridge@0.1.1` — six trial-surfaced correctness fixes

A trial run of `@fdpm/zod-bridge@0.1.0` against a real production
schema (`static/schemas/pitch-deck.schema.v2.ts`) surfaced six bugs.
All fixed with paired regression tests; full narrative at
[`docs/journals/zod-bridge-pitch-deck-trial.md`](../docs/journals/zod-bridge-pitch-deck-trial.md);
documentation workbook at MCP `trial-zod-bridge-pitch-deck` (rev 32).

  - Decoupled lazy-recursion bound from object nesting depth.
  - Fixed quadratic struct-name compounding in nested objects.
  - Accepted `.transform()`/`.pipe()` per `flag:zod-pipe-transform`.
  - Field-level `z.union` and `z.discriminatedUnion` now fall back to
    payload-blob (`format: 'json-union'`) instead of throwing.
  - Added a `z.record` branch (`format: 'json-record'`).
  - Disambiguated array-element struct ids by parent field name.

61/61 tests passing (was 49/49).

### Added

#### `@fdpm/zod-bridge@0.1.0` — Zod v4 → FDPM plugin reference package

New workspace-sibling package at [`packages/zod-bridge/`](packages/zod-bridge/).
Deterministic, one-way translation from Zod v4 schemas into FDPM
`PrimitiveTypeDef`s, CEL constraints, validators, and approval-page
descriptors. Companion to the workbook `howto-zod-to-fdpm-plugin`
(rev 179) which is the normative spec.

  - **Public API** (`src/index.ts`): `assembleDomainProfile`,
    `zodSchemaToPrimitiveType`, `zodSchemaToValidator`,
    `zodSchemaToCelConstraints`, `buildViewPageDescriptor`,
    `buildProductPageBundle`, `stableStringify`, `BridgeError`.
  - **23-rule CEL translation table** (`src/cel.ts`) capped at the
    verified host CEL surface (`@marcbachmann/cel-js@^7` operators
    + helper-set v1.2.0 from `src/core/expr/std.ts` +
    `graph.*` helpers). Rule 8 (`z.iso.datetime()`) emits
    `timestamp(self.<f>).getFullYear() > 0` because cel-js v7 rejects
    `Timestamp != null` at type-check; the workbook's table uses
    `!= null` and will be patched in a follow-up rev.
  - **Validator equivalence** (`src/validator.ts`): the derived
    `ValidatorFn`'s findings are 1:1 with `schema.safeParse` issues
    modulo namespaced rule_id rewriting
    (`<plugin-id>:zod.<type>.<code>[.<path>]`). Rule_id closed set is
    enumerated at build time and goes verbatim into
    `manifest.capabilities[].metadata.rule_ids`.
  - **Determinism** (`src/stable-stringify.ts`): same input → byte-equal
    output across runs and processes. The CI snapshot gate
    (`generated/profile.json` matches a fresh bridge run) is the
    intended consumer; mismatches block the commit.
  - **Auto-emitted approval pages**: `buildViewPageDescriptor` emits
    one panel per primitive type with fields in schema-declared order,
    `buildProductPageBundle` emits the structured fact bundle that
    drives the README's Product Page. Eliminates schema-vs-page drift
    by construction.
  - **Feature-flag snapshot** (`DEFAULT_FEATURE_FLAG_STATES`): captures
    the 13 `fs:Limitation`/`fs:DesignDecision` pairs from the workbook
    at rev 179. One `enabled`, seven `behind-flag`, five `disabled`.
    Each flag carries an explicit transition contract; advancing a
    flag requires a paired bridge release and a workbook revision.
  - **Tests** (`tests/`, 49 passing): mapping-table coverage,
    cel-translation soundness (evaluated against the host CEL
    runtime), validator equivalence, importer/exporter round-trip,
    output determinism. Tested against `zod@4.4.3` +
    `@marcbachmann/cel-js@7.6.1`.

Deferred to `v0.2.0`: optional-cap factories
(`zodSchemaToMarkdownRenderer`, `zodSchemaToImporter`,
`zodSchemaToExporter`, `zodSchemaToExprHelper`). The workbook §7 shows
how to hand-author them; bridge core is sufficient to ship a useful
plugin today.

#### SPEC-WORKSPACE v0.1 — Workspace as first-class primitive

> ARCHITECTURAL REQUIREMENT (PALS's LAW): LLMs will always produce some
> form of error. Absence of output verification is a design defect, not
> a runtime bug. All LLM output must be treated as untrusted and
> validated explicitly.

The FDPM data directory is now a typed, identified, registered
container. Phase 1 of the R2 remote-server roadmap: the interface
boundary that a future `RemoteWorkspace` will plug into without
breaking local consumers. Backup/restore, the operator subcommand
suite, and MCP-bin precedence are all in this slice.

  - **`Workspace` interface** (`src/core/workspace/types.ts`): `id`,
    `name`, `path | null`, `getStore()`, `getProfileRegistry()`,
    `getPluginRuntime()`, `appendOp()`, `getOperationLog()`,
    `statProjectLog()`, `listProjects()`, `backup()`. Strict zod
    schemas for `WorkspaceIdentity` and `WorkspaceRegistry` (unknown
    fields rejected at parse time — typos surface as `verification`
    errors with a clear `evidence.field_path`).

  - **`LocalWorkspace`** (`src/core/workspace/local.ts`):
    `LocalWorkspace.open()` reads or auto-mints `workspace.json` on
    first touch, upserts the registry entry, exposes the Workspace
    interface backed by the existing `JsonlLogStore`. Auto-mint emits a
    one-process-one-warning host warning per dataDir (Principle 4 —
    plugin failures never crash the host). `LocalWorkspace#rename()`
    mutates `workspace.json`'s `name`, clears `_minted`, and updates
    the registry.

  - **Operator-local registry** (`src/core/workspace/registry.ts`):
    XDG-located catalog at
    `${FDPM_REGISTRY_PATH:-${XDG_STATE_HOME:-~/.local/state}/fdpm/workspaces.json}`.
    Atomic temp+rename writes; tolerant reads (missing file → empty
    registry); upsert-by-id, lookup-by-id/name, unique-name suffixing
    on collision.

  - **§8.3 precedence resolution** (`src/core/workspace/resolve.ts`):
    `--data-dir > FDPM_DATA_DIR > FDPM_WORKSPACE > registry.current >
    defaultDataDir()`. `FDPM_WORKSPACE` and `registry.current`
    misses surface as `not_found`; an absent default returns
    `{dataDir: null, source: "default"}` so callers can fall through
    to the legacy path.

  - **Backup** (`src/core/workspace/backup.ts`): streaming `.fdpmbak`
    writer (zip via `archiver`). Manifest at offset 0 — operators can
    `unzip -p bundle backup-manifest.json | jq .` without scanning the
    archive. Per-file sha256, manifest carries workspace identity,
    host version, spec_core version. §13 compression policy:
    text/json/jsonl/yaml/svg deflated; pre-compressed types
    (pdf/png/jpeg/etc.) stored. `LocalWorkspace#backup()` updates the
    registry's `last_backup` on success.

  - **Restore** (`src/core/workspace/restore.ts`): five-step pipeline:
    (1) read manifest via random-access central directory;
    (2) identity-collision check against the registry;
    (3) verify all sha256s — STREAMING; no bytes touch the target
        until every entry passes;
    (4) write to `${target}.tmp/` then atomic rename to `${target}`
        (cross-fs detected via EXDEV and refused with `verification` +
        `evidence.reason: "cross_fs_rename"`);
    (5) `Host.load()` round-trip — proves the bundle is replayable
        against this host; opt-out via `--skip-verify`.
    `--force-overwrite` replaces an existing `workspace_id`;
    `--name <new>` mints a fresh ULID for side-by-side restores.
    Uses `yauzl` for random-access reads.

  - **`fdpm workspace` subcommand suite** (`src/commands/workspace.ts`):
    `init / list / info / switch / rename / forget / backup / restore /
    verify`. Wired through `buildProgram` and `ALL_COMMAND_METADATA`.
    All subcommands carry SPEC-REPL §10.2 metadata as
    `NO_PROJECT_ARGV` / `NO_PROJECT_JSON` because workspace ops never
    touch workbook logs (the freshness gate has nothing to stat).
    `verify` does an out-of-band `Host.load()` round-trip and reports
    workbook count + elapsed_ms.

  - **Host integration** (`src/core/host.ts`): `host.workspace:
    Workspace | null` populated after `load()` / `reload()` /
    `reloadPlugins()`. `host.persistence` continues to point at the
    underlying `JsonlLogStore` so existing tier-bypass callers
    (`host-extra.ts`, `mcp-audit-log.ts`) work unchanged
    (Principle 7: plugin call sites unchanged).

  - **bin precedence** — `src/bin/fdpm.ts` and `src/bin/fdpm-mcp.ts`
    both resolve through `resolveWorkspaceDataDir`, so MCP servers
    honour `FDPM_WORKSPACE` and `registry.current` the same way the
    one-shot CLI does.

  - **New env vars**: `FDPM_WORKSPACE` (workspace id or name to
    resolve via the registry; ignored when `FDPM_DATA_DIR` is set),
    `FDPM_REGISTRY_PATH` (override for the registry file path).
    Documented in README, MANUAL, `.env.example`, and the env-contract
    test gate.

  - **New deps**: `archiver ^7.0.1` (MIT, ~3 MB transitive, no native
    build), `yauzl ^3.3.0` (MIT, random-access zip reader).

  - **Tests** (48 new across 3 suites):
    - `tests/workspace.test.ts` (24): identity round-trip, registry
      CRUD, atomic write, malformed-JSON refusal, unique-name
      suffixing, lookup by id/name, auto-mint stable id across loads,
      registry upsert, basename-derived name with `-2` suffix on
      collision, schema strictness, plugin-call invariance
      (`host.workspace.getStore() === host.store` etc.), reload
      preserves workspace identity, all five §8.3 precedence rules
      plus not_found failure modes.
    - `tests/workspace-backup-restore.test.ts` (15): bundle layout
      with manifest at offset 0, sha256 per file, identity collision
      policy under no flags / `--name` / `--force-overwrite`,
      `sha256_mismatch` refusal with target untouched, `--skip-verify`,
      missing-manifest refusal, registry `last_backup` update, rename
      clears `_minted` + rejects empty names.
    - `tests/workspace-subcommands.test.ts` (9): full subcommand
      smoke through `npx tsx src/bin/fdpm.ts` so emit()'s fd-1 sync
      write path is exercised end-to-end.

  - **SPEC** — `docs/specs/SPEC-WORKSPACE.md` (96 KB; 212 primitives,
    120 relations; `validate` clean: 0 errors / 0 warnings). Source
    in `fdpm-cli/scripts/build-spec-workspace.ts`; path constants in
    `fdpm-cli/scripts/_spec-paths.ts`.

#### SPEC-MCP-SERVER v0.1 — slice B-final + Phase C (freshness gate, Tier-2 surface, audit completion)

> ARCHITECTURAL REQUIREMENT (PALS's LAW): LLMs will always produce some
> form of error. Absence of output verification is a design defect, not
> a runtime bug. All LLM output must be treated as untrusted and
> validated explicitly.

Slice B-final wires the per-call freshness gate (SPEC-MCP-SERVER §10
/ §21) and adds the remaining Tier-1 read-only tools. Phase C adds the
Tier-2 validating-write surface with a `validation_report` envelope on
every response. The two ship together because the freshness map
(B-final) is required to make Tier-2 stale-state refusal work, and
the validation-report envelope (Phase C) is required to keep §7
rejections from leaking out as MCP-protocol errors.

  - **Per-session freshness map** (`src/mcp/session.ts`):
    `recordSeen` / `checkFreshness` / `markFresh` /
    `clearFreshnessMap`. Tracks `(mtime_ns, size)` for every workbook
    log this session has touched. Strict bigint-tuple equality on the
    pair; "not seen yet" → not stale (recorded fresh on first
    encounter). The map is purely in-memory; SIGHUP-triggered
    `Host.reload()` clears it.

  - **Per-call freshness gate** (`src/mcp/dispatch.ts`): resolves a
    `projectIdsFromJson` extractor (`src/mcp/tool-metadata-map.ts`)
    against each tool's raw args, expands `["*"]` wildcards via
    `host.listProjects()` (with a stderr warning), and either
    tail-replays silently (Tier-1 lenient) or refuses with
    `permission` + `evidence.reason: "stale_state"` (Tier-2/3 strict)
    when `(mtime_ns, size)` differs from the recorded tuple.
    `host_compat` from `Host.reloadProjectTail` propagates as an MCP
    error envelope. Successful Tier-2/3 writes re-seed the freshness
    map so the same session can issue consecutive writes against the
    same workbook.

  - **Six new Tier-1 read-only tools**: `fdpm.primitive.search`,
    `fdpm.primitive.get`, `fdpm.relation.list`, `fdpm.relation.get`,
    `fdpm.log.tail`, `fdpm.log.diff`. All wrap existing
    `Host.searchPrimitives` / `Host.searchRelations` / `Host.getLog`
    / `Host.getProject` reads — no new Host methods required.

  - **Eleven Tier-2 validating-write tools**: `fdpm.profile.register`,
    `fdpm.workbook.create`, `fdpm.primitive.create`,
    `fdpm.primitive.replace`, `fdpm.primitive.patch`,
    `fdpm.primitive.field_patch`, `fdpm.relation.create`,
    `fdpm.relation.replace`, `fdpm.relation.patch`,
    `fdpm.structure.reorder`, `fdpm.structure.reparent`. Each returns
    the SPEC §8.2 envelope `{ ok, operation, validation_report,
    post_state_summary }`. The dispatcher branches on
    `validation_report.accepted`:
      - `true`  → `isError: false`, `ok: true`.
      - `false` → `isError: false`, `ok: false` (per SPEC §12: the
        protocol call succeeded; the operation was rejected by Core
        validation).
      - genuine `FDPMException` (not_found, conflict, etc.) →
        `isError: true` with the typed envelope.

  - **`Host.*` validation throws are caught** by the dispatcher and
    mapped to the rejected-envelope shape so a §7 rejection always
    surfaces with `validation_report.findings` populated, never as a
    bare `validation`-category error envelope.

  - **SIGHUP handler** (`src/bin/fdpm-mcp.ts`): replaces the prior
    log-and-continue stub. Calls `host.reload()`, clears the session
    freshness map, and audits the reload as a `phase: "reload"` entry
    (`outcome: "ok" | "host_compat" | "internal"`). Reload failure
    leaves the previous Host intact per `Host.reload()`'s contract;
    the server keeps serving against the pre-reload state.

  - **Audit log enrichment** (`src/persistence/mcp-audit-log.ts`):
    new `McpAuditReloadEntry` for SIGHUP events;
    `validation_status` populated as `"pass" | "fail"` for Tier-2
    completes (was previously always `"n/a"` because Tier-2 hadn't
    landed). Tier-1 stays `"n/a"`.

  - **Tool ↔ command-metadata mapping** (`src/mcp/tool-metadata-map.ts`):
    explicit table that maps every MCP tool name to either an
    `ALL_COMMAND_METADATA` key, `null` (no workbook state), or an
    inline `ProjectIdsFromJson` extractor (used for the `log.*`
    tools whose closest CLI peer key isn't a 1:1 name match).
    Boot-time assertion in `manifest.ts` fails server start if any
    advertised tool lacks a mapping row.

  - **Tests**: 15 new tests across `tests/mcp/`:
      - `tier1-freshness.test.ts` — silent tail-replay,
        `host_compat` propagation, `["*"]` wildcard scan + stderr
        warning.
      - `tier2-validation-report.test.ts` — happy paths populate
        `validation_report`; §7 rejections surface with
        `isError: false`/`ok: false`.
      - `tier2-stale-state.test.ts` — strict-mode refusal on OOB
        write; success after `host.reload()` analogue.
      - `audit-log.test.ts` — 200 rapid calls produce 400 paired
        start/complete entries with correct `validation_status`.
      - `conformance-23-4.test.ts` — verbatim SPEC §23.4
        end-to-end.

#### SPEC-MCP-SERVER v0.1 — slice D (Tier 3 destructive surface, fuzz harness, plugin-tool stub)

> ARCHITECTURAL REQUIREMENT (PALS's LAW): LLMs will always produce some
> form of error. Absence of output verification is a design defect, not
> a runtime bug. All LLM output must be treated as untrusted and
> validated explicitly.

Phase D ships the destructive tool surface, the schema-fuzz CI gate,
and the plugin-tool exposure stub. SPEC-MCP-SERVER acceptance items
§22.3, §22.5, §22.7 (partial), and conformance items §23.1, §23.5
are now testable end-to-end in `tests/mcp/`.

  - **Tier 3 tools** (off by default; opt in via `--enable-destructive`
    / `FDPM_MCP_ENABLE_DESTRUCTIVE=1`):
    - `fdpm.workbook.delete` — wraps `Host.deleteProject`.
    - `fdpm.primitive.delete` — wraps `Host.deletePrimitive`.
    - `fdpm.relation.delete` — wraps `Host.deleteRelation`.

    All three carry `annotations.destructiveHint: true` and return a
    thin envelope `{ ok: true, operation, post_state_summary }`
    (no `validation_report` — the underlying Host methods return
    `AppendOutput`, not the validation envelope).

  - **Tier 3 manifest filtering**: `advertisedTools(...)` excludes
    Tier 3 tools when `enableDestructive` is false. The dispatcher's
    tier gate is the authoritative refusal point — defense-in-depth
    against a client that somehow learns the names regardless.
    `manifest.ts` `EXPOSED_HOST_METHODS` now lists `deleteProject`,
    `deletePrimitive`, `deleteRelation`; their entries in
    `not-exposed.ts` were removed (SPEC §22.3 / §23.1).

  - **Confirmation-token mode** (SPEC §9.3, opt-in): new optional
    fields `requireConfirmationToken` and `confirmationToken` on
    `DispatchCtx`. When true, Tier 2/3 calls without a matching
    `_confirmation_token` argument refuse with `permission` +
    `evidence.reason: "confirmation_required"`. The dispatcher
    strips the token from the args before strict-schema validation.
    The bin entry will wire `FDPM_MCP_REQUIRE_CONFIRMATION_TOKEN`
    in a follow-up; the gate itself ships now.

  - **Schema-fuzz CI gate** (SPEC §22.5 / §26): hand-rolled JSON
    Schema sampler under `tests/mcp/_fuzz/sampler.ts` plus a
    fuzz suite at `tests/mcp/schema-fuzz.test.ts`. Generates 10⁴
    inputs per tool per run, filters them through Ajv against the
    advertised JSON Schema, and asserts that every JSON-Schema-valid
    sample is also accepted by the runtime Zod validator. Catches
    drift between the advertised schema and the runtime contract.
    Runs in <2 s for the 25 currently-shipping tools.
    Adds `ajv@^8.17.1` to devDependencies.

  - **Plugin-tool exposure stub** (SPEC §13 / §22.7): new module
    `src/mcp/plugin-tools.ts` with a `discoverPluginTools()`
    function that returns `[]` unconditionally and emits a
    structured warning via `emitHostWarning(...)` when the operator
    opts in. The amendment to SPEC-PLUGGABLE-ARCHITECTURE adding the
    `mcp_tool` capability kind is deferred to v0.1.1; until it lands
    no plugin tools leak into the manifest. Conformance test at
    `tests/mcp/plugin-tools-stub.test.ts` guards the security posture.

  - **HTTP transport refusal conformance** (SPEC §23.5): new test
    `tests/mcp/conformance-23-5.test.ts` spawns the built
    `dist/src/bin/fdpm-mcp.js` with `--http-port`, `--http-host`,
    and `--sse` and asserts each exits non-zero with a stderr
    pointer to §6.1 / v0.2.

  - **Defense-in-depth in `resolveProjectIds`**: the freshness-step
    helper now treats a tool name absent from `TOOL_TO_COMMAND_METADATA`
    as "no workbook state" instead of throwing. The boot-time check in
    `manifest.ts` still rejects manifest drift; the runtime fallback
    only matters for synthetic test tools injected via the
    `resolveTool` seam.

#### SPEC-MCP-SERVER v0.1 — slice B-prelim (Tier 1 read-only surface)

> ARCHITECTURAL REQUIREMENT (PALS's LAW): LLMs will always produce some
> form of error. Absence of output verification is a design defect, not
> a runtime bug. All LLM output must be treated as untrusted and
> validated explicitly.

New `fdpm-mcp` binary implementing the SPEC-MCP-SERVER v0.1 stdio
transport with five Tier 1 read-only tools:

  - `fdpm.health` — server liveness + manifest version + counts.
  - `fdpm.profile.list` — registered DomainProfiles.
  - `fdpm.profile.get` — fetch a profile by id.
  - `fdpm.workbook.list` — loaded workbooks.
  - `fdpm.workbook.get` — workbook row + primitive/relation counts.

Architecture follows SPEC-MCP-SERVER §4 (Architectural Principles), §8
(Tool Surface tiers), §11 (Zod source of truth, JSON Schema derived),
§12 (Error Model — reuses FDPMException taxonomy), §15 (Lifecycle).

  - **Dependency**: `@modelcontextprotocol/sdk@^1.29.0` (pinned minor)
    plus `zod-to-json-schema@^3.25.2` for advertisement-time schema
    derivation.
  - **Binary**: `bin.fdpm-mcp` registered in `package.json`; `build`
    `chmod +x`s both `fdpm` and `fdpm-mcp`.
  - **HTTP transport refusal**: passing `--http-port`, `--http-host`,
    or `--sse` causes the process to refuse to start with a clear
    pointer to SPEC-MCP-SERVER §6.1 (deferred to v0.2). Conformance §5.
  - **Per-session rate limit**: token-bucket implementation in
    `src/mcp/session.ts` defaulting to 120 calls/minute
    (`--max-calls-per-minute` / `FDPM_MCP_MAX_CALLS_PER_MINUTE`).
    Excess calls return `permission` + `evidence.reason: "rate_limited"`.
  - **Tier gate**: `--enable-destructive` /
    `FDPM_MCP_ENABLE_DESTRUCTIVE=1` is required to expose Tier 3 tools.
    Slice B-prelim ships zero Tier 3 tools, but the gate logic is
    runtime-tested via a synthetic Tier 3 entry in the test fixture
    (see `tests/mcp/dispatch.test.ts`).
  - **Audit log**: append-only JSONL at
    `$FDPM_DATA_DIR/mcp-audit.jsonl` with one `start` and one
    `complete` entry per call. Args are sha256-hashed by default;
    `--audit-full-args` / `FDPM_MCP_AUDIT_FULL_ARGS=1` opts into full
    args for debugging.
  - **CI gates** (both mandatory):
    - `tests/mcp-classification.test.ts` — every public Host method
      is either wrapped by an MCP tool (named in
      `EXPOSED_HOST_METHODS`) or explicitly listed in
      `src/mcp/not-exposed.ts`. Adding a new public Host method
      breaks the build until classified.
    - `tests/mcp-source-imports.test.ts` — tool-handler modules
      under `src/mcp/tools/` MUST NOT import `host.persistence`,
      `host.store`, `node:child_process`, `node:vm`, or call `eval`
      / `new Function(`. SPEC-MCP-SERVER §6.1 compliance.

Known gaps deferred to slice B-final / slice C:

  - **Freshness check** — the dispatcher's freshness step is a no-op
    in slice B-prelim. Tier 1 tools are safe under this relaxation
    (they take an explicit `workbook_id` for a pure read or touch no
    workbook state). Tier 2 / Tier 3 tools cannot land until the
    freshness mechanism is wired (REPL track step 3+5; the
    `Host.reload` and `Host.statProjectLog` primitives exist but the
    dispatcher does not yet consult them). See the `SLICE-B-FINAL`
    marker in `src/mcp/dispatch.ts`.
  - **SIGHUP host.reload** — slice B-prelim logs the SIGHUP and
    continues; `Host.reload()` invocation is wired in slice B-final.
  - **Plugin tools** — `--enable-plugins` is parsed and threaded
    through `DispatchCtx` but no plugin tools ship in this slice.
    Plugin-tool exposure follows SPEC-MCP-SERVER §13 / the plugin
    manifest amendment.

New env vars (`FDPM_NO_PLUGINS`, `FDPM_MCP_ENABLE_DESTRUCTIVE`,
`FDPM_MCP_ENABLE_PLUGINS`, `FDPM_MCP_MAX_CALLS_PER_MINUTE`,
`FDPM_MCP_AUDIT_FULL_ARGS`) are registered in
`src/core/config/env.ts` and reflected in `.env.example`,
`README.md`, and `MANUAL.md` per the env-contract test.

#### SPEC-CORE 1.2 — SPEC-DNIS adoption (§5.6)

The Core SPEC is bumped 1.1.1 → 1.2.0. New §5.6 "Document Node
Identity — SPEC-DNIS adoption" makes SPEC-DNIS a normative extension
of §5 The Instance Model: an FDPM-CLI host claiming SPEC-CORE 1.2
conformance MUST register the built-in `profile:dnis:0.1` plus the
composition profile `profile:spec-authoring-dnis:0.1`, and MUST
expose the host adapter that maps SPEC-DNIS Operations onto SPEC-CORE
op-log entries. The integration is structural, not opaque — the
pre-1.2 "MAY layer on top of SPEC-CORE" wording is superseded.

`SPEC_CORE_VERSION` constant in `src/core/version/spec.ts` is now
`"1.2"` (was `"1.1"`); `HOST_VERSION` is `"1.2.0"`. `exportTransfer`
reports the runtime version instead of the previous hardcoded
`"1.1"`. The `core-versioning-001` regression test asserts the new
version explicitly.

#### DNIS — `profile:dnis:0.1` and the host adapter

New built-in plugin under `plugins/dnis/` registers `dnis:Document`,
`dnis:Node`, `dnis:DerivedFrom`, and `dnis:MigratedFrom` types per
SPEC-DNIS §5.6.1. The runtime adapter at `src/core/dnis/adapter.ts`
routes SPEC-DNIS Operations through `Host.appendBatchWithCausation`
(new method on `Host`) so each Operation materialises as one or more
SPEC-CORE op-log entries sharing a `causation_op_id`. The §8
OperationResult idempotency map is a deterministic projection of the
op log — no parallel persistence surface.

Test surface:
- `tests/dnis-store.test.ts` — TV-1..TV-7 against `InMemoryDnisStore`.
- `tests/dnis-host-adapter.test.ts` — §5.6.6 conformance fixture:
  TV-1, TV-3 (with op-log causation chaining + 5-entry split atomic
  batch), TV-5, TV-7 evidence shape, idempotency replay, document
  round-trip — all against a real `Host` instance.

CLI: `fdpm dnis create-doc | create-node | edit | move | list |
resolve` subcommands wired through the adapter. `split`, `merge`,
`compact` remain SDK-only (their payloads are JSON-shaped and the
CLI surface would be a thin pass-through).

#### Composition profile — `profile:spec-authoring-dnis:0.1`

New built-in plugin under `plugins/spec_authoring_dnis/` declares a
profile that `extends` both `profile:spec-authoring:0.1` and
`profile:dnis:0.1`. Build scripts that opt in get spec-authoring's
typed primitives AND DNIS's `dnis:Document`/`dnis:Node` registered
in the same workbook. The §4.3 profile-resolution merge handles the
extends chain; existing `profile:spec-authoring:0.1` workbooks are
unaffected.

#### SPEC-SECTIONS-TREE v0.2 — sections as DNIS Nodes

The `spec:SpecMarkdownRenderer` gains a DNIS-backed section path:
when a workbook contains a `dnis:Document` and one or more active
`dnis:Node` primitives of `kind: "section"`, the renderer DFS-walks
the dnis:Node graph (parent_node_id, sorted by SPEC-DNIS Position)
and derives §N.M.K headings from the path. The legacy
`spec:Section`/`spec:HasSection` path is preserved verbatim for
unmigrated workbooks; mixed-mode workbooks emit a
`spec:render:mixed-mode-sections` warning and the DNIS path wins.

The `dnis:Node` `content` JSON shape supports four optional fields
beyond `title` and `body_md`:
- `dispatch_kind` — keys into the existing `KIND_RENDERERS` table
  (e.g. `"adr"`, `"references"`, `"open_questions"`).
- `depth_override` — explicit heading depth (default: derived from
  DFS path length).
- `ref_slug` — author-supplied stable handle for fn.section_of.
  Survives title rewrites.
- `eval_body` — opt-in to body_md template evaluation through
  `ctx.renderDsl.renderTemplate`. Default off preserves byte-equal
  output for prose containing literal `${…}` documentation.
- `number_override` — literal §-label that overrides both the
  rendered heading and the section_index value. Use only when DFS
  can't represent the structure (letter appendices, mid-chain
  inserts that must keep stable labels).

#### `fn.section_of` helper (helper-set v1.2.0)

New CEL helper `fn.section_of(node_id)` in the standard inventory.
Resolves a dnis:Node id (NID, slug-form primitive id, author-
supplied `section:<ref-slug>`, or title-derived
`section:<lowercased-hyphenated>`) to its rendered §N.M.K heading
via the render-time `doc.section_index` Tier-A binding. Throws
`unknown-name` on miss — never silently coerces to `''` (PALS-LAW
Principle 4).

Helper-set version 1.1.0 → 1.2.0 (additive minor per §M14 bump
rules). The Tier-A activation gains `doc.section_index:
map<string, string>`, populated by the spec_md renderer's DFS at
render time, empty for validate-time and DNIS-less renders.
SPEC-RENDER-DSL bumped 0.1.5 → 0.1.6; SPEC-EXPRESSION-RUNTIME bumped
0.1.7 → 0.1.8.

#### Codemods — SPEC-CORE and SPEC-DNIS migrated to DNIS-backed sections

Both `scripts/build-spec-core.ts` and `scripts/build-spec-dnis.ts`
now target `profile:spec-authoring-dnis:0.1` and emit their section
trees via `DnisHostAdapter`. SPEC-CORE §5.6 becomes a child of §5
with `number_override: "5.6"`; SPEC-DNIS §A and §B carry
`number_override: "A"` and `"B"`. **Both renders are byte-identical
to the pre-migration baseline** (106299 bytes for SPEC-CORE, 69651
bytes for SPEC-DNIS).

The spec_md renderer's closing-references-section detection was
extended to recognise `dnis:Node` sections of `dispatch_kind:
"references"` so migrated workbooks retain their authored references
section without re-emitting the closing block.

#### `Host.appendBatchWithCausation`

New public method on `Host` for atomic multi-entry SPEC-CORE op-log
batches with shared `causation_op_id`. Pre-mints `op_id`s, sets the
lead entry's id as every entry's `causation_op_id`, runs §7
validation per entry against the in-progress projection (so a later
entry can validate against earlier entries' commits within the same
batch), atomic rollback on any failure. The DNIS adapter is the
intended caller; ordinary plugin/transformer code continues to use
`createPrimitive` / `createRelation` directly.

`AppendInput.op_id` is now caller-pre-mintable for SPEC-CORE 1.2
§5.6.1's "uid == NID" pin; ordinary callers leave it undefined.

#### Tooling — scripts/ type-checking

New `tsconfig.scripts.json` extends the workbook tsconfig and scopes
`scripts/**/*.ts` under `"types": ["node"]` so build scripts type-
check (and the IDE stops reporting `process` as undefined). Surfaced
two real type errors in `scripts/generate-build-from-transfer.ts`
that the workbook tsconfig was hiding (`PrimitiveInstance` /
`RelationInstance` literals were missing `uid`); both fixed by
seeding via `mintUidFromSeed` (matches the SPEC-UID upcaster
pattern).

#### Tests

- `tests/expr-section-of-helper.test.ts` (4 tests) — helper-set
  v1.2.0: NID/slug/ref-slug lookup, unknown-id render-error, empty-
  index validate-time semantics, end-to-end against a real DNIS
  document.
- `tests/spec-md-dnis-sections.test.ts` (6 tests) — DNIS section
  path coverage including title-collision disambiguation
  (`section:open-questions` / `-2` / `-3` in DFS order) and
  `number_override` for letter-appendix + mid-chain-insert cases.
- `tests/spec-md-body-eval.test.ts` (4 tests) — opt-in body_md
  template evaluation: default-off preserves literal `${…}`,
  opt-in resolves `${doc.fields.title}` and
  `${fn.section_of("section:foo")}`, unknown slug surfaces a
  render-error finding.
- `tests/dnis-host-adapter.test.ts` (6 tests) — §5.6.6 conformance
  against a real Host: TV-1, TV-3 with 5-entry causation chain
  + shared request_id, TV-5, TV-7 ordered evidence array, retry
  idempotency, document round-trip.

#### SDK — edit helpers

Standalone, flat-args helpers wrapping the Host's edit / delete
methods using the same operator-friendly aliases (`fields`, `scope`,
`expectedRevision`, `workbook`) as `defineProject`. They live alongside
`ProjectBuilder` rather than on it because the builder is documented
as append-only / greenfield-only, and edits to a persisted workbook are
a different workflow.

- `patchPrimitive(host, { workbook, id, fields, scope?, expectedRevision?, fullValidate? }) → { revision, report }`
- `patchRelation(host, { workbook, id, fields, expectedRevision?, fullValidate? }) → { revision, report }`
- `deletePrimitive(host, { workbook, id }) → { revision }`
- `deleteRelation(host, { workbook, id }) → { revision }`
- New types: `PatchPrimitiveInput`, `PatchRelationInput`,
  `PatchResult`, `DeleteResult` (re-exported from the package root).

#### SDK — referential pre-flight on `commit()`

`ProjectBuilder.commit()` now runs a queue-time check for dangling
relation references **before** `createProject` is called. When a
relation's `from` or `to` doesn't resolve to a queued primitive,
commit fails fast with a `verification`-category `FDPMException`
listing every dangling ref at once, no workbook is created, no rollback
is needed, and the builder is sealed against retry.

Failure carries `evidence.dangling_refs: Array<{ relation_id, missing,
side: "from" | "to" }>` and a `partial_commit` envelope with
`failed_at: "preflight"`.

#### SDK — `partial_commit` evidence on commit failures

Every `FDPMException` thrown from `commit()` now carries an
`evidence.partial_commit` object so embedders can inspect what
persisted before the failure without walking the host slice manually.
Survives the rollback success path AND the rollback-failure wrap.

```ts
export interface PartialCommitFailure {
  workbook_id: string;
  primitives_created: number;   // count of persisted primitives
  relations_created: number;    // count of persisted relations
  failed_at: "workbook" | "primitive" | "relation" | "preflight";
  failed_id?: string;           // id of the spec that triggered the failure
}
```

`PartialCommitFailure` is exported from the package root.

#### SDK — generic `fields` typing on specs

`PrimitiveSpec` and `RelationSpec` now take an optional generic
parameter `F extends Record<string, unknown>` defaulting to the
untyped record. Profile-aware callers can narrow per call:

```ts
type SectionFields = { title: string; number: number };
type SectionSpec = PrimitiveSpec<SectionFields>;
```

`ProjectBuilder.primitives` / `relations` propagate the generic per
call so a single builder can mix narrowed and untyped specs. Runtime
behaviour is unchanged — narrowing is an IDE convenience, not a
security boundary, and the §7 validation pipeline remains the source
of truth.

#### SDK — alias-convention documentation

The SDK's file-level docstring now formalizes the alias convention so
future helpers stay consistent:

- INPUT shapes drop `_id` / `Id` suffixes
  (`workbook_id` → `workbook`, `type_id` → `type`, `scope_id` → `scope`,
  `source_id` → `from`, `target_id` → `to`, `rendererId` → `renderer`).
- INPUT shapes rename `field_values` → `fields`.
- INPUT shapes use camelCase for snake_case Host fields
  (`expected_revision` → `expectedRevision`).
- OUTPUT shapes (`CommitResult`, `RenderResult`,
  `PartialCommitFailure`) intentionally keep the Host-flavoured names
  because they document provenance precisely.

#### Errors — `cause` chain on `FDPMException`

`FDPMException` constructor now accepts an optional `cause` in its
extras bag and forwards it to `super()` via the standard `Error`
options object. Used by the SDK's rollback-failure wrap to preserve
the original validation error reachable via `Error.cause`.

#### Tests

- `tests/sdk-edit.test.ts` — 15 cases covering the four new edit helpers (happy-path patch with revision bump + `ValidationReport` shape, `scope` alias forwarding, `expectedRevision` → `conflict`, validation errors → `validation`, `not_found` for unknown ids, `fullValidate` flag forwarding, no-op patch on a fields-less relation, delete success, delete on unknown workbook, end-to-end create→patch→delete roundtrip).
- `tests/sdk-public-surface.test.ts` — 3 cases pinning the package-root export contract (SDK helpers, host-extra functions referenced by the SDK docstring, `Host`/`FDPMException` value exports).
- `tests/sdk-p2.test.ts` — 15 cases for generic `fields` narrowing, the cross-namespace id-sharing rejection, referential pre-flight, and `partial_commit` evidence on every failure path (including survival through rollback success and rollback-failure wrap).
- `tests/sdk-p3.test.ts` — 11 cases pinning the `RenderOptions` rename and the alias-convention rules across every SDK input shape via `expectTypeOf`.
- `tests/sdk-pass2.test.ts` — 4 new P0 regression cases (double-commit guard on success path, double-commit guard on rolled-back failure, sealed-builder rejection of `primitives()`/`relations()` after commit, empty-workbook rollback edge case, cause-chain preservation through rollback-failure wrap).

### Changed

#### SDK — rollback wrap preserves cause chain and findings

When `commit({ rollbackOnError: true })` and the rollback itself
fails, the wrapping `internal`-category `FDPMException` now:

- Attaches the original error via `Error.cause` (was: only message
  text in `evidence.original_error`).
- Preserves the original error's `findings` array on the wrapper so
  type-narrowing on `FDPMException` still surfaces structured
  validation findings.
- Carries both the original and rollback error messages in
  `evidence.original_error` / `evidence.rollback_error`, plus any
  pre-existing evidence keys from the original error.

### Removed / Renamed (breaking)

#### SDK — `RenderOptions.rendererId` renamed to `renderer`

The SDK alias convention drops `Id` suffixes on input shapes. The
output envelope (`RenderResult`) keeps `rendererId` and `pluginId`
because those are provenance fields, not aliases.

```diff
- await renderProject(host, { workbook, target, rendererId: "fs:SpecRenderer" });
+ await renderProject(host, { workbook, target, renderer: "fs:SpecRenderer" });
```

`RenderResult.rendererId` and `RenderResult.pluginId` are unchanged.

### Rejected proposals

The following items were proposed during the SDK audit and **rejected
with documented rationale** (regression tests pin the rejection):

- **Cross-namespace ID uniqueness.** Forbidding a primitive and a
  relation from sharing an id at the SDK boundary was rejected:
  primitives and relations live in **separate id namespaces** in the
  host data model (see `Host.deletePrimitive` vs `Host.deleteRelation`
  at `src/core/host.ts:282` / `:457`). Forbidding overlap would block
  legitimate import workflows from systems with shared id namespaces.
  Pinned by `tests/sdk-p2.test.ts › "rejected: cross-namespace id
  sharing is allowed by design"`.
- **`workbookId` / `targetMimeType` renames on `RenderOptions`.** The
  audit proposed these as a consistency fix, but they go in the wrong
  direction — `workbook` is *already* the SDK alias (it strips `_id`
  from `workbook_id`), and `target` accepts both MIME types and
  symbolic ids per `RendererRegistration.target`. The real consistency
  issue was `rendererId` keeping the `Id` suffix, which is fixed
  above.
- **Builder methods `removePrimitive` / `patchPrimitive` on
  `ProjectBuilder`.** The builder is documented as append-only /
  greenfield-only. Adding edit / delete to it would conflate two
  workflows. The standalone `patchPrimitive` / `deletePrimitive` etc.
  helpers above provide the same capability without the conflation.

[Unreleased]: https://example.invalid/compare/v1.1.0...HEAD
