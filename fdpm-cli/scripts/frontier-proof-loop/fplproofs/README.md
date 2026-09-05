---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Fable 5.1 via Claude Code"
  date: "2026-09-05"
---

# fplproofs — the Lean 4 project for `lean4` artifacts

## Disclaimer

This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](../../../../DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.

A Lake project depending on mathlib, created with `lake new fplproofs math`.
`fpl.formal_artifact_check` runs `lake env lean <artifact>` with this
directory as the working directory, under bubblewrap, so a `lean4` artifact a
solver returns is checked against mathlib rather than against an empty
environment.

```bash
elan default stable        # Lean 4.33.1 at the time of writing (see lean-toolchain)
lake exe cache get         # downloads the prebuilt mathlib oleans into .lake/ (several GB, not committed)
printf 'import Mathlib.NumberTheory.LSeries.RiemannZeta\n#check riemannZeta\n' > /tmp/smoke.lean
lake env lean /tmp/smoke.lean   # riemannZeta (a : ℂ) : ℂ
```

`.lake/` is git-ignored. `lake-manifest.json` pins the mathlib revision, so a
fresh checkout reproduces the same environment.

[Back to the frontier proof loop](../README.md) · [Repository README](../../../../README.md)
