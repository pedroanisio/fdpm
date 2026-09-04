# Releasing FDPM

FDPM is a two-package npm workspace:

- `@fdpm/zod-bridge` from `fdpm-cli/packages/zod-bridge/`
- `@fdpm/cli` from `fdpm-cli/`, which depends on the bridge by semver

The bridge must be available at the version required by the CLI before the CLI
is published.

## Hard prerequisites

Do not publish while any item below is unresolved:

1. The license is the Apache License, Version 2.0 (SPDX `Apache-2.0`). The
   `LICENSE` files at the repository root and both package roots must stay
   byte-identical copies of the canonical text, and both package manifests
   must carry `"license": "Apache-2.0"`; `npm run test:public-readiness`
   pins the canonical digest and `npm run public:check` compares the copies.
2. Run `npm run public:check` from `fdpm-cli/` with zero findings.
3. Make the GitHub repository public and set its description, topics, and
   homepage.
4. Enable private vulnerability reporting, dependency alerts, secret
   scanning, and branch protection for `main`.
5. Confirm the package versions are not already present in the npm registry.

## Local release verification

Use Node.js 24 and npm 11.5.1 or newer for provenance-capable publication.

```sh
cd fdpm-cli
npm ci
npm run release:check
npm pack --dry-run --json --workspace @fdpm/zod-bridge
npm pack --dry-run --json
```

Inspect both manifests and tarball file lists. In clean consumer directories,
install the bridge tarball first and then the CLI tarball. Verify:

```sh
fdpm version --json
fdpm health readyz
test -x node_modules/.bin/fdpm-mcp
```

The install must not resolve a `file:`, `link:`, or `workspace:` dependency.

## First npm publication

npm trusted publishing can only be configured for an existing package, so each
package's first publication is a controlled bootstrap step:

1. Sign in to the npm account that owns the `@fdpm` scope with two-factor
   authentication enabled.
2. Publish the bridge from the clean, verified checkout:

   ```sh
   npm publish --access public --provenance --workspace @fdpm/zod-bridge
   ```

3. Confirm the exact bridge version is visible on npm, then publish the CLI:

   ```sh
   npm publish --access public --provenance
   ```

4. Create and push the signed `v<cli-version>` tag only after both registry
   entries and their provenance attestations are visible.

The checked-in `release.yml` workflow validates release inputs and tarball
manifests only. It has read-only permissions and cannot publish. Adding npm
trusted publishing or any other persistent publication authority requires a
separate, explicit supply-chain review. Never put a long-lived npm token in a
workflow or repository secret.

## Subsequent releases

1. Update package versions and changelogs. Publish a new bridge version first
   when its public contract changed; update the CLI dependency range.
2. Run the local release verification above.
3. Merge through protected `main` with CI green.
4. Run the root **Release readiness** workflow against that commit and verify
   its read-only checks.
5. Publish the bridge manually with `--access public --provenance` when its
   version changed, verify it in the registry, then publish the CLI the same
   way.
6. Create and push a signed `v<cli-version>` tag on the exact published commit.
7. Create the GitHub release notes and verify both npm package pages,
   provenance attestations, tarball contents, and the tag's commit.

If any publication step fails, do not retag or overwrite a published version.
Fix forward with a new version after identifying whether the failure is in the
source tree, npm trusted-publisher configuration, registry state, or GitHub
workflow permissions.
