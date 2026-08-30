# Governance

FDPM currently uses a maintainer-led governance model.

## Roles

**Maintainer.** Pedro Anisio Silva (`@pedroanisio`) owns repository
administration, release credentials, security response, merge decisions, and
the interpretation of project scope.

**Contributor.** Anyone who submits issues, reviews, documentation, tests, or
code under the repository's contribution and conduct policies.

Additional maintainers may be appointed after a sustained record of sound
technical judgment, reliable review, respectful collaboration, and attention
to security and compatibility.

## Decisions

Routine changes are decided through pull-request review. Breaking changes,
normative specification changes, persistence-format changes, trust-boundary
changes, and new release channels require an issue or ADR that records:

- the problem and evidence;
- the options considered;
- compatibility and migration consequences;
- security and maintenance consequences;
- the final decision and owner.

The maintainer makes the final decision after considering technical evidence
and contributor feedback. Lack of response is not approval.

## Releases

Only maintainers with the required GitHub and npm permissions may publish.
Every release must follow [`RELEASING.md`](RELEASING.md), pass the repository
release gate, and preserve provenance. Package publication and a GitHub tag are
separate evidence; neither should be inferred from the other.

## Policy changes

Changes to governance, conduct, security, contribution terms, or licensing
receive the same review as code and are recorded in version control. If the
project becomes multi-maintainer, this document should be revised before
authority is delegated informally.
