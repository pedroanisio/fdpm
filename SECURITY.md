# Security Policy

## Supported versions

FDPM has not completed its first public release. Until one exists, security
fixes target the current `main` branch. After publication, the latest released
minor line and `main` will receive security fixes unless a release note states
otherwise.

| Version | Supported |
| --- | --- |
| `main` / prerelease source | Yes |
| npm releases | None published yet |
| Older snapshots and forks | No |

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability.

After the repository is public and private vulnerability reporting is enabled,
use GitHub's **Report a vulnerability** action on the Security tab. If that
action is unavailable, email `pedroanisio@arc4d3.com` with the subject
`[fdpm security]`.

Include, where possible:

- the affected commit or package version;
- the entry point and required configuration;
- a minimal reproduction or proof of concept;
- the security impact and affected data;
- any known mitigation;
- whether the report is subject to a disclosure deadline.

Do not include real third-party secrets or personal data. Use synthetic test
fixtures and state clearly when a reproduction could delete or overwrite data.

## What to expect

The maintainer aims to acknowledge a report within three business days,
provide an initial assessment within ten business days, and coordinate a fix
and disclosure schedule based on severity. These are targets, not a service
level agreement.

You will receive credit in the advisory unless you request anonymity or the
report is not actionable. Please allow a reasonable remediation period before
public disclosure.

## Current trust boundary

- `fdpm-mcp` uses stdio; HTTP and SSE transport are not implemented.
- Destructive MCP operations are disabled by default and still pass a
  dispatch-time authorization gate when advertised.
- Built-in plugins execute in the host process and are trusted code. The
  community and verified trust labels do not provide a sandbox.
- Workbook data and audit logs may contain sensitive source material. The
  operator controls the data directory and its filesystem permissions.
- Importers, renderers, and filesystem plugins process untrusted content and
  should be treated as attack surfaces.

See the [trust model in the README](README.md#trust-model-current-state) for
the broader product boundary.
