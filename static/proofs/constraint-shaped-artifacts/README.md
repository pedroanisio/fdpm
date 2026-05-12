---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Opus 4.7 via Claude Code"
  date: "2026-05-12"
---

# Constraint-Shaped Artifacts — Machine-Checked Theorems

## Disclaimer

This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](../../../DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.

## What this is

A Lean 4 formalization of six structural theorems for the framework of
"Constraint-Shaped Artifacts: A Compatibility-Relation Framework":

| Theorem | Statement | Lean module |
|---|---|---|
| A1 | Joint-symmetric Bayes coherence | `CSAProofs.Discrete` |
| A2 | Marginal sum consistency | `CSAProofs.Discrete` |
| A3 | Conditional flip identity | `CSAProofs.Discrete` |
| A4 | Mutual-information symmetry `I(A;F) = I(F;A)` | `CSAProofs.MutualInfo` |
| A5 | Loomis–Whitney bound | `CSAProofs.LoomisWhitney` |
| A6 | Tikhonov ≡ Gaussian MAP equivalence | `CSAProofs.Tikhonov` |

Depends on Mathlib (built once on first invocation; ~213 MB sources,
precompiled `olean` cache fetched via `lake exe cache get`).

## Building

```bash
# First time only — install elan (Lean version manager):
curl -sSf https://elan.lean-lang.org/elan-init.sh | sh -s -- -y --default-toolchain none

# Build:
export PATH="$HOME/.elan/bin:$PATH"
lake update            # fetch Mathlib sources
lake exe cache get     # fetch precompiled Mathlib oleans
lake build             # build our project
```

Without `cache get`, building Mathlib from scratch takes hours. With
cache, the toolchain compiles only the CSAProofs files (seconds).

## Theorem provenance

- **A1, A2, A3** are textbook identities from probability theory; their
  point is that the framework's symmetric formalism doesn't smuggle in
  a directional axiom. Bayes 1763; any probability text.
- **A4** uses Mathlib's `mutualInfo_comm` (Cover & Thomas 2006, Thm 2.4.1).
- **A5** uses Mathlib's `Finset.card_pow_le_prod_card_image_loomisWhitney`
  (Loomis & Whitney 1949).
- **A6** is the algebraic equivalence `2σ² · neg-log-Gaussian-posterior =
  Tikhonov(λ = σ²/τ²)` plus the argmin-coincidence corollary (MacKay 2003;
  Bishop 2006).

## What this is NOT

- A claim that the framework's empirical Predictions A–D are now
  machine-verified. Those are pre-registered hypotheses about
  consistency between independent analyses, dimensional reversal,
  operational unity, and residual symmetry; they are empirical claims
  to be tested, not theorems to be proved.
- A claim that the paper's "four operations are one" framing is
  mathematically derived. That observation is methodological — design,
  decomposition, compliance, and co-evolution all condition on the same
  joint, but they produce different functions; the symmetry is
  structural, not functional.

## Wiring into FDPM

Registered in workbook `constraint-shaped-artifacts` as
`acad:Work:csa-proofs-lean` (`kind: software`). Each theorem corresponds
to an `acad:Evidence{kind: derivation}` entry pointing into this file.
