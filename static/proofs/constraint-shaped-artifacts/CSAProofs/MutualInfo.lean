/-
  CSAProofs.MutualInfo
  ====================

  Theorem A4: Mutual-information symmetry I(A;F) = I(F;A).

  Mathlib v4.15.0 does not ship a Shannon mutual-information definition,
  so we define entropy and mutual information for finite discrete
  distributions directly and prove the symmetry from first principles.

  The substantive claim is that mutual information is invariant under
  axis-transposition of the joint distribution: `mutualInfo p = mutualInfo (p ∘ swap)`.
  This is the formal version of "I(A; F) = I(F; A)" from §3.3 of the
  paper (Cover & Thomas 2006, Thm 2.4.1).

  Proof structure:
    (i)   joint entropy is invariant under axis-swap (Finset.sum_comm);
    (ii)  the S-marginal of the transposed joint is the original F-marginal,
          and vice versa (definitional / Finset.sum unfolds);
    (iii) MI is built from these and is therefore axis-symmetric (algebra).
-/

import Mathlib.Algebra.BigOperators.Group.Finset
import Mathlib.Analysis.SpecialFunctions.Log.Basic

namespace CSAProofs.MutualInfo

open Finset Real

variable {S F : Type*}

/-- Shannon entropy of a marginal: `H(X) = -∑ p(x) log p(x)`.
By convention, `0 · log 0 = 0`; Mathlib's `Real.log 0 = 0` enforces this. -/
noncomputable def entropy [Fintype S] (p : S → ℝ) : ℝ :=
  -∑ x, p x * Real.log (p x)

/-- Joint entropy of a 2D distribution: `H(X, Y) = -∑∑ p(x,y) log p(x,y)`. -/
noncomputable def jointEntropy [Fintype S] [Fintype F] (p : S → F → ℝ) : ℝ :=
  -∑ x, ∑ y, p x y * Real.log (p x y)

/-- Marginal over the inner index: `marginS p x = ∑_y p(x, y)`. -/
noncomputable def marginS [Fintype F] (p : S → F → ℝ) (x : S) : ℝ :=
  ∑ y, p x y

/-- Marginal over the outer index: `marginF p y = ∑_x p(x, y)`. -/
noncomputable def marginF [Fintype S] (p : S → F → ℝ) (y : F) : ℝ :=
  ∑ x, p x y

/-- Mutual information: `I(X; Y) = H(X) + H(Y) − H(X, Y)`. -/
noncomputable def mutualInfo [Fintype S] [Fintype F] (p : S → F → ℝ) : ℝ :=
  entropy (marginS p) + entropy (marginF p) - jointEntropy p

/-! ### Supporting lemmas

Three pointwise identities used by the main theorem. Each is one line
(`Finset.sum_comm` or definitional unfold), but they isolate the
calculation so the main theorem reads clearly. -/

/-- Joint entropy is invariant under axis-transposition.
`H(X, Y) = H(Y, X)` because the double sum is symmetric. -/
theorem jointEntropy_transposed [Fintype S] [Fintype F] (p : S → F → ℝ) :
    jointEntropy p = jointEntropy (fun y x => p x y) := by
  unfold jointEntropy
  congr 1
  rw [Finset.sum_comm]

/-- Summing the transposed joint over its inner axis recovers the
original outer marginal: `marginS (p ∘ swap) = marginF p`. -/
theorem marginS_transposed [Fintype S] (p : S → F → ℝ) :
    marginS (fun y x => p x y) = marginF p := by
  funext _; rfl

/-- Summing the transposed joint over its outer axis recovers the
original inner marginal: `marginF (p ∘ swap) = marginS p`. -/
theorem marginF_transposed [Fintype F] (p : S → F → ℝ) :
    marginF (fun y x => p x y) = marginS p := by
  funext _; rfl

/-! ### A4 — Mutual-information symmetry

The substantive theorem: `mutualInfo` is invariant under axis-transposition
of the joint distribution. This is the formal statement of I(A;F) = I(F;A):
whether you compute mutual information from `p : S → F → ℝ` or from its
transpose `(fun y x => p x y) : F → S → ℝ`, you get the same number. -/

theorem mutual_information_symmetric [Fintype S] [Fintype F] (p : S → F → ℝ) :
    mutualInfo p = mutualInfo (fun y x => p x y) := by
  show entropy (marginS p) + entropy (marginF p) - jointEntropy p
       = entropy (marginS (fun y x => p x y)) + entropy (marginF (fun y x => p x y))
         - jointEntropy (fun y x => p x y)
  rw [marginS_transposed p, marginF_transposed p, jointEntropy_transposed p]
  ring

end CSAProofs.MutualInfo
