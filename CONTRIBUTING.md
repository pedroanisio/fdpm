# Contributing to FDPM

Thank you for improving FDPM. This repository treats specifications, runtime
behavior, generated artifacts, documentation, and tests as one contract. A
change is complete only when those surfaces agree.

## Contribution intake status

FDPM is licensed under the Apache License, Version 2.0 (SPDX `Apache-2.0`);
the text is in [`LICENSE`](LICENSE) and is copied byte-for-byte into both
package roots. Section 5 of that license sets the contributor terms: any
contribution intentionally submitted for inclusion is licensed under the same
terms, with no additional terms or conditions, so there is no separate
contributor agreement. The remaining public-release steps are tracked in
[`docs/PUBLIC-READINESS.md`](docs/PUBLIC-READINESS.md).

## Before you start

- Read [`PURPOSE.md`](PURPOSE.md) for the product boundary.
- Read [`CLAUDE.md`](CLAUDE.md) and [`AGENTS.md`](AGENTS.md) for repository
  engineering rules. They apply to human and agent-authored changes.
- Search existing issues before opening a duplicate.
- Open an issue before a breaking contract change, a new plugin capability,
  or work that changes a normative specification.
- Report vulnerabilities through the private process in
  [`SECURITY.md`](SECURITY.md), never through a public issue.

## Development setup

FDPM requires Node.js 20 or newer. npm and `package-lock.json` are the canonical
package manager and lockfile.

```sh
git clone https://github.com/pedroanisio/fdpm-cli.git
cd fdpm-cli/fdpm-cli
npm ci
npm run build
npm test
```

Do not commit `node_modules`, local data directories, test output, credentials,
or machine-specific symlinks. Use the repository-root `_tmp/` directory for
disposable local work.

## Making a change

1. Branch from the current `main`.
2. Add a regression test that fails for the missing behavior or defect.
3. Implement the smallest complete change that makes it pass.
4. Update every affected contract surface: public exports, schemas, generated
   artifacts, examples, documentation, SDK, CLI, and MCP where applicable.
5. Run focused checks after each slice, then the full validation set.
6. Use a Conventional Commit subject such as `fix: ...`, `feat: ...`, or
   `docs: ...`.

Generated files must be changed through their source generator. If a plugin
contains `scripts/run-bridge.ts`, run it in `--check` mode before submitting;
regenerate through the same script when the check reports drift.

## Required validation

From `fdpm-cli/`:

```sh
npm run typecheck
npm test
npm run build
npm run test:public-readiness
npm audit --omit=dev --audit-level=high
```

Run `npm run public:check` for release-facing changes. It must report zero
findings; among other things it verifies that the three `LICENSE` files are
identical and that both package manifests carry the SPDX expression.

Renderer changes also require the relevant visual or artifact acceptance
tests. A passing TypeScript build is not evidence that a PDF, HTML page, SVG,
or generated consumer project works.

## Pull requests

A pull request should state:

- the user-visible problem and the chosen behavior;
- the specifications, schemas, or generated artifacts affected;
- the exact validation commands and results;
- known limitations or follow-up work;
- whether AI tools materially authored the change and how their output was
  verified.

Keep unrelated changes out of the branch. Do not rewrite another contributor's
work or absorb pre-existing dirty files into your commit.

## Review standard

Maintainers review for behavioral correctness, compatibility, security,
test quality, and agreement with the repository's source-of-truth artifacts.
Review may request a smaller change, an ADR, a migration path, or additional
runtime evidence. Passing CI is necessary but does not by itself establish
that a change is ready to merge.

Participation is governed by [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
