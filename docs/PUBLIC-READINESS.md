# Public-release readiness

Assessed: 2026-08-30
Repository: `pedroanisio/fdpm-cli`
Baseline commit inspected: `7729319`
Candidate CLI version: `1.2.0`
Candidate bridge version: `0.4.0`

> **Status update — 2026-09-04.** The live GitHub API now returns
> `visibility=PUBLIC` with a description set (no homepage, no topics, no
> license detected). Operator action 2 below is therefore done and action 3
> is partly done. At the time of this update the license decision was still
> open; the second update below records it. The rest of this document is the
> 2026-08-30 assessment, preserved as written.

> **Status update — 2026-09-04, license selected.** The maintainer chose the
> Apache License, Version 2.0 (SPDX `Apache-2.0`). `LICENSE` at the root,
> `fdpm-cli/LICENSE`, and `fdpm-cli/packages/zod-bridge/LICENSE` are
> byte-identical copies of the canonical apache.org text (SHA-256
> `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30`), both
> package manifests declare `"license": "Apache-2.0"`, and
> `fdpm-cli/tests/_meta/public-readiness.test.mjs` pins that digest and the
> SPDX field. The five license findings listed under "The license decision"
> are resolved, so the "Open-source rights" and "Package contents" rows no
> longer block. `npm run public:check` now reports exactly one finding:
> `fdpm-cli/package.json` version `1.2.0` does not match `HOST_VERSION`
> `1.3.0` (`src/core/version/spec.ts`, bumped on 2026-08-31 in `67b3401`).
> Which side moves is the maintainer's release decision; until it is made the
> gate stays red and "npm availability" stays blocked.

## Verdict

The codebase is prepared for public review but is not yet an open-source
release. Local packaging, security, collaboration, and CI defects identified
in this pass have been repaired. Release remains blocked by one maintainer
decision—selection of the project license—and by external GitHub/npm actions
that cannot be established by files in the checkout.

| Dimension | Current verdict | Evidence |
| --- | --- | --- |
| Architecture and public entry points | Ready for review | `src/index.ts` exports the embedding API; `fdpm` and `fdpm-mcp` are package bins; the command and MCP paths both construct the same `Host`. |
| Package dependency graph | Repaired | The CLI is an npm workspace and depends on `@fdpm/zod-bridge@^0.4.0`, not a consumer-invalid `file:` path. npm is the sole lockfile owner. |
| Dependency advisories | Clean at assessment time | Full and production-only npm audits both reported zero vulnerabilities after patched dependency updates. Advisory state is time-dependent and CI rechecks production dependencies. |
| Package contents | Ready except license | Both dry-run tarballs include their README and compiled public surface. Both omit `LICENSE` because no license has been selected. |
| Repository hygiene | Repaired | Nested inert workflows, a tracked absolute `node_modules` symlink, stale `pnpm-lock.yaml`, unused external PDFs, and local bytecode were removed. Fixture provenance is recorded. |
| Collaboration and support | Prepared | Contribution, conduct, security, support, governance, pull-request, and issue-template policies are present. Contribution merging remains paused until contributor license terms exist. |
| CI and security automation | Prepared, not live-verified | Root CI, CodeQL, Dependabot, and a read-only release-validation workflow are present. They have not run on GitHub from this uncommitted checkout. |
| Open-source rights | **Blocked** | No root/package license files or SPDX manifest fields exist. Source visibility alone does not grant open-source rights. |
| GitHub public state | **Blocked externally** | The live repository is private, has no description, homepage, or topics, and cannot yet enable free public-repository protection features. |
| npm availability | **Blocked externally** | `@fdpm/cli` and `@fdpm/zod-bridge` are not present in the npm registry. |

## Implementation model inspected

The package has three public execution paths over one core:

1. `src/index.ts` re-exports the `Host`, store/profile/operation types, DNIS,
   and the higher-level SDK facade for embedders.
2. `src/bin/fdpm.ts` resolves workspace persistence, loads one `Host`, and
   attaches command groups through `buildProgram`.
3. `src/bin/fdpm-mcp.ts` loads one long-lived `Host`, advertises a curated and
   byte-budgeted MCP manifest, and serves it over stdio. Destructive tools are
   gated at dispatch time.

`Host` composes the event-sourced store, profile registry, validation pipeline,
JSONL persistence/workspace boundary, expression and render runtimes, and
plugin runtime. Plugin discovery is resolved relative to the installed module;
the build copies manifests and non-TypeScript assets beside compiled plugin
entry points. That is why a consumer tarball and clean-install smoke are part
of the release evidence rather than treating `tsc` as sufficient.

## Changes made in this readiness pass

- Added complete npm metadata, workspace semantics, public package READMEs,
  release checks, prepack builds, and package/runtime version alignment.
- Replaced the broken CLI `file:packages/zod-bridge` dependency with the
  publishable semver contract `^0.4.0`.
- Upgraded the direct `shell-quote` dependency, the MCP SDK tree, Vitest,
  Archiver, and vulnerable transitives; regenerated both package locks. The
  Archiver 8 migration removes the deprecated `glob@10` chain, and the only
  dependency install script is covered by a version-pinned `esbuild` approval.
- Added `scripts/check-public-readiness.mjs` and executable regression tests.
  The gate checks required public files, npm metadata, package/runtime version
  identity, local dependency protocols, misplaced workflows, tracked local
  artifacts, absolute symlinks, license-copy equality, and credential-shaped
  text.
- Moved automation to repository-root `.github/`, where GitHub can discover
  it. CI covers Node 20, 22, and 24; CodeQL is scheduled; Dependabot covers npm
  and actions.
- Kept release automation read-only. `release.yml` validates and dry-packs but
  has no token, OIDC permission, tag trigger, or publish command.
- Added public contribution, conduct, security, support, governance, and
  release policies plus issue and pull-request templates.
- Removed the machine-local absolute symlink
  `static/schemas/node_modules`, stale secondary lockfile, ignored Python
  bytecode, and four nested workflows that GitHub never loaded.
- Removed two unused external PDFs: the Einstein archive copy carried separate
  GNU Free Documentation License obligations, and the Danielle Silva paper had
  no explicit redistribution record in the repository. The structured
  relativity fixture remains; `static/fixtures/README.md` records provenance.

All removed tracked files remain recoverable from Git history.

## The license decision

The maintainer must select the license; an automated code-preparation pass
must not make that legal and strategic choice. Common options have materially
different consequences—for example, MIT is short and permissive, Apache-2.0
adds an express patent grant and notice obligations, and GPL-3.0-only requires
distributed derivatives to remain under the GPL. Obtain legal advice when the
choice affects employment, contributor ownership, patents, or third-party
assets.

After selecting the SPDX expression:

1. add the canonical text as `LICENSE`;
2. copy the exact bytes to `fdpm-cli/LICENSE` and
   `fdpm-cli/packages/zod-bridge/LICENSE` so npm ships it;
3. add the same SPDX `license` value to both package manifests;
4. update the license sections in both READMEs and this document;
5. run `npm run public:check` and require zero findings.

The current gate has exactly five expected findings: the three absent license
files and the two absent package SPDX fields. Any additional finding is a new
blocker.

## External operator actions

Perform these only after the license change is committed and the full local
gate is green:

1. Push the candidate branch and review CI/CodeQL from the live GitHub run.
2. Change repository visibility from private to public.
3. Set a concise description, homepage, and topics such as `mcp`, `typescript`,
   `event-sourcing`, `typed-graph`, and `cli`.
4. Enable private vulnerability reporting, dependency alerts, secret scanning,
   push protection, and a `main` ruleset/branch protection policy requiring CI
   and CodeQL plus pull-request review.
5. Confirm the `bug` and `enhancement` labels remain available for the issue
   forms.
6. Follow [`RELEASING.md`](../RELEASING.md) for clean tarball verification and
   first publication. Publish `@fdpm/zod-bridge` before `@fdpm/cli`.
7. Verify the npm package pages, provenance attestations, executable bins,
   GitHub tag, and release notes independently.

At assessment time the live GitHub API returned `visibility=private`, no
description/homepage/topics, no public branch-protection access, and no private
vulnerability-reporting endpoint. The npm registry returned not-found for both
package names.

## Candidate evidence

Fresh evidence collected from the 2026-08-30 candidate tree:

- `npm ci` installed 231 packages from the canonical lockfile and audited 233
  without an advisory finding; npm reported no unreviewed dependency install
  scripts.
- `npm run check` passed typecheck, rebuilt the distribution before testing,
  passed 202 test files and 2,115 tests, then passed all 6 public-readiness
  regression tests.
- `npm run check --workspace @fdpm/zod-bridge` passed typecheck, build, 13 test
  files, and 165 tests.
- Live full-graph and production-only `npm audit` queries both reported zero
  vulnerabilities. The lockfile license inventory found no GPL-, AGPL-, LGPL-,
  SSPL-, BUSL-, or Commons-Clause-identified dependency; the only missing
  license metadata is the deliberately unresolved workspace package.
- All 7 repository-root YAML files parsed successfully. The generated census
  names the 3 root workflows and passes its drift check.
- Actual tarballs—not only dry runs—were installed together in a fresh
  consumer. `@fdpm/zod-bridge@0.4.0` contains 65 entries; `@fdpm/cli@1.2.0`
  contains 1,249 entries and both executable bins. The install resolved the
  bridge at `0.4.0`, discovered 21 profiles, reported host/runtime version
  `1.2.0`, loaded the `Host`, `openHost`, and `defineProject` exports, and
  reported zero vulnerabilities without a deprecation warning.
- The static public gate reports exactly the five license findings documented
  above and no other release-hygiene finding.

## Verification commands

Run from `fdpm-cli/` unless noted:

```sh
npm ci
npm run test:public-readiness
npm run typecheck
npm test
npm run build
npm audit --audit-level=high
npm audit --omit=dev --audit-level=high
npm pack --dry-run --json --workspace @fdpm/zod-bridge
npm pack --dry-run --json
npm run public:check
```

The final command remains intentionally red until the license decision is
implemented. See the handoff summary for the fresh full-suite, tarball, and
clean-consumer results from this candidate tree.
