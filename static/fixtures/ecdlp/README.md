---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Opus 5 (1M context) via Claude Code"
  date: "2026-09-18"
---

# ECDLP fixture — the FrontierMath open-problem instance

## Disclaimer

This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](../../../DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.

Back to the [root README](../../../README.md) · [static fixture provenance](../README.md).

| File | What it is |
|---|---|
| `challenge.json` | The curve `y² = x³ + a·x + b` over `F_p`, the points `P` and `Q` of prime order `n`, and the cofactor `h = 5`, copied from the public problem statement at <https://epoch.ai/frontiermath/open-problems/elliptic-curve-discrete-logarithm>. Not retyped by a model: the file is the operator's verbatim copy. |
| `verify.py` | The instance certifier and bounded-search evidence runner (authored by GPT-6 via Codex, 2026-09-04). Exact arithmetic only; asserts primality of `p` and `n`, nonsingularity, membership and order of `P` and `Q`, `#E = 5n`, and screens the standard special cases. Needs Python 3 with SymPy and Z3 and PARI/GP on `PATH`. Exit status non-zero on any failed check. |

This fixture is the problem instance the frontier-proof-loop seed
(`fdpm-cli/scripts/frontier-proof-loop/seed.ts`) registers as its first
pursuit. It is an input, not a result: no scalar `x` is recorded here, and a
run's evidence bundles are written under the host data dir, never into this
directory.
