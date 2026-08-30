# `@fdpm/cli`

`@fdpm/cli` is the executable and embeddable runtime for FDPM workbooks:
typed graphs whose mutations are validated, appended to an operation log, and
replayable. The package ships two binaries, a JavaScript API, the built-in
plugin set, and a Model Context Protocol server.

The repository's [main README](https://github.com/pedroanisio/fdpm-cli#readme)
describes the architecture, implementation status, trust model, and
specification mapping. The
[user manual](https://github.com/pedroanisio/fdpm-cli/blob/main/fdpm-cli/MANUAL.md)
is the task-oriented command reference.

## Status

The source package is at version `1.2.0`. Neither `@fdpm/cli` nor its
`@fdpm/zod-bridge` workspace has completed its first npm publication. Until
that release exists, install and run from a checkout as shown below. The
release process is documented in
[`RELEASING.md`](https://github.com/pedroanisio/fdpm-cli/blob/main/RELEASING.md).

## Requirements

- Node.js 20 or newer
- npm 10 or newer for development from the workspace

## Install from source

```sh
git clone https://github.com/pedroanisio/fdpm-cli.git
cd fdpm-cli/fdpm-cli
npm ci
npm run build
node dist/src/bin/fdpm.js version --json
```

After the first public npm release, the global install will be:

```sh
npm install --global @fdpm/cli
fdpm version --json
```

## CLI quick start

```sh
export FDPM_DATA_DIR="$PWD/.fdpm-data"

fdpm health readyz
fdpm profile list --json
fdpm workbook create --json \
  --id demo \
  --name "Demo" \
  --profile core:empty
fdpm workbook list --json
```

Run `fdpm --help` for the command groups and `fdpm <group> --help` for a
specific surface. State is persisted under `FDPM_DATA_DIR` (or the resolved
FDPM workspace) as an append-only JSONL operation log.

## MCP server

The `fdpm-mcp` binary speaks MCP over stdio. It exposes read-only and
validating-write tools by default. Destructive tools are advertised with a
disabled warning and refuse dispatch unless the operator explicitly enables
them.

```json
{
  "mcpServers": {
    "fdpm": {
      "command": "fdpm-mcp",
      "env": {
        "FDPM_DATA_DIR": "/absolute/path/to/fdpm-data"
      }
    }
  }
}
```

Set `FDPM_MCP_ENABLE_DESTRUCTIVE=1` only for sessions that are authorized to
delete workbook data. See the repository's
[`SECURITY.md`](https://github.com/pedroanisio/fdpm-cli/blob/main/SECURITY.md)
for vulnerability reporting and the current trust boundary.

## JavaScript API

```ts
import { openHost, defineProject } from "@fdpm/cli";

const host = await openHost({ dataDir: null });
const project = defineProject({
  id: "demo",
  name: "Demo",
  profileId: "core:empty",
});

await project.commit(host);
```

The package root exports the `Host`, store and profile primitives, operation
helpers, DNIS surface, and the higher-level SDK facade. Public types are
emitted into `dist/` during `npm run build`.

## Development and validation

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run test:public-readiness
```

`npm run public:check` additionally checks repository governance files,
package metadata, tracked local artifacts and absolute symlinks, nested
workflow placement, and credential-shaped content. Release publication runs
that stricter gate and a production dependency audit.

## Contributing and support

- [Contributing guide](https://github.com/pedroanisio/fdpm-cli/blob/main/CONTRIBUTING.md)
- [Support policy](https://github.com/pedroanisio/fdpm-cli/blob/main/SUPPORT.md)
- [Security policy](https://github.com/pedroanisio/fdpm-cli/blob/main/SECURITY.md)
- [Governance](https://github.com/pedroanisio/fdpm-cli/blob/main/GOVERNANCE.md)

## License

An open-source license has not yet been selected. The source is visible when
the repository is public, but redistribution and open-source use are not
granted until a license file and matching SPDX metadata are added. The
public-release gate intentionally blocks publication in this state.
