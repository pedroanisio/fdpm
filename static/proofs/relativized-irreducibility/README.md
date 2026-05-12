---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Opus 4.7 via Claude Code"
  date: "2026-05-12"
---

# Relativized Irreducibility — Machine-Checked Theorems

## Disclaimer

This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](../../../DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.

## What this is

A Lean 4 formalization of three structural theorems for the framework of
"Relativized Irreducibility and Emergence Pressure (Rev5)":

| Theorem | Statement | Lean name |
|---|---|---|
| T1 | `ResidualIrreducibility` is monotonically non-increasing in `L` | `residual_irreducibility_monotone` |
| T2 | Residual is bounded below by `K(S) − cover − c_L` (asymptotic) | `residual_lower_bound_via_kolmogorov` |
| T3 | Residual information is subadditive under system composition | `residual_information_subadditive` |
| T3′ | T3 lifted to `ResidualIrreducibility` for subadditive compressors | `residual_irreducibility_subadditive` |

No `sorry`. All proofs check.

## Building

```bash
# First time only — install elan (Lean version manager):
curl -sSf https://elan.lean-lang.org/elan-init.sh | sh -s -- -y --default-toolchain none

# Build:
export PATH="$HOME/.elan/bin:$PATH"
lake build
```

`lake build` downloads Lean 4.15.0 on first invocation (~200 MB toolchain).

## Axiom audit

Every axiom these proofs depend on is explicit in the source
(grep `^axiom`). The build emits an `#print axioms` audit:

- **T1** depends on: `propext`, `System`, `Task`, `total`.
- **T2** depends additionally on: `kolmogorov`, `kolmogorov_decomposition`.
- **T3** depends additionally on: `compose`, `joinCost`, `total_compose_le`, `cover_compose_ge`.

The Lean kernel's `propext` and `Quot.sound` are foundational; everything
else is paper-specific and must be defended in prose. The defenses live in
[../../proposition-B.json](../../../proposition-B.json) under
`defn-residual-irreducibility` and the relevant claim primitives.

## Concrete compressor instances

To anchor the abstract typeclass-style theorems, two `SubadditiveCompressor`
instances are provided:

- `identityCompressor` — `length n = n`. The information-theoretic
  "do nothing" baseline. Trivially monotone, zero-preserving, subadditive
  (with equality).
- `scaledCompressor k` — `length n = k * n` for a fixed multiplier.
  Represents fixed-rate channel codes; subadditivity follows from `Nat.mul_add`.

`SubadditiveCompressor` is thus provably inhabited; the file ships an
`Inhabited SubadditiveCompressor` instance using `identityCompressor`.
Two `example` bindings instantiate T1 and T3 on these concrete witnesses
to confirm the abstract theorems compose correctly with concrete data.

A concrete realistic compressor (e.g., a schema-aware encoder for the
six-axis backend fragment, or a gzip wrapper proving subadditivity up to
a constant on sufficiently long inputs) is downstream work — the existing
`SubadditiveCompressor` structure is the interface it would need to inhabit.

## What this is NOT

- A claim that the framework's empirical pillars (Cost_m, threshold
  conjecture, mutation catch rate) are now machine-verified. Those are
  empirical hypotheses; the Lean file only formalizes the structural
  math underneath them.
- A formalization of Kolmogorov complexity. `K` is axiomatic; we use
  only the decomposition property `K(S) ≤ cover + residual + c`, which
  is itself the asymptotic upper-bound semantics, not a constructive
  computation of `K`.
- A formalization of a realistic compressor (gzip, CTW, schema-aware).
  The two shipped instances (`identityCompressor`, `scaledCompressor`)
  are baselines that demonstrate the structures are inhabited; they
  do not, on their own, "compress" anything information-theoretically.

## Wiring into FDPM

This artifact is registered in workbook `relativized-irreducibility-rev5`
as `acad:Work:ri-proofs-lean` (`kind: software`). Each theorem corresponds
to an `acad:Evidence{kind: derivation}` entry pointing into this file.
