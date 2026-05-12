/-
  CSAProofs.Discrete
  ==================

  Discrete-distribution theorems for "Constraint-Shaped Artifacts".
  These are the symmetric-formalism results: given a finite joint
  distribution `j : S → F → ℚ`, the design direction and the
  decomposition direction operate on the same object, and no arrow is
  built into the formalism.

  Imports Mathlib for ℚ field tactics and `Finset` big-operator API.

  Theorems
  --------
    A1.  Bayes coherence:      cond_AF f a * margin_F f = j a f
                                                        = cond_FA a f * margin_S a.
    A2.  Marginal consistency: ∑_f j a f = margin_S a;
                               ∑_a j a f = margin_F f.
    A3.  Conditional flip:     cond_AF f a * margin_F f
                                 = cond_FA a f * margin_S a.

  None of these is novel — they are textbook identities. Their point in
  this artifact is that the FORMALISM has the symmetric structure the
  paper claims. Lean checks that no hidden directional axiom is needed.
-/

import Mathlib.Data.Rat.Defs
import Mathlib.Algebra.BigOperators.Group.Finset
import Mathlib.Tactic.FieldSimp
import Mathlib.Tactic.Ring

namespace CSAProofs.Discrete

open Finset

variable {S F : Type*}

/-- A discrete joint distribution on `S × F` over rationals.
We keep this minimal: just a function `j : S → F → ℚ`. The unitarity
condition `∑ j = 1` is NOT required for the structural theorems below;
those follow from the definition of conditionals and marginals alone. -/
abbrev Joint (S F : Type*) : Type _ := S → F → ℚ

/-- Marginal over `S`: sum over the F-fibre. -/
def marginS [Fintype F] (j : Joint S F) (a : S) : ℚ :=
  ∑ f, j a f

/-- Marginal over `F`: sum over the S-fibre. -/
def marginF [Fintype S] (j : Joint S F) (f : F) : ℚ :=
  ∑ a, j a f

/-- Conditional `P(F = f | S = a)`. Defined as `j a f / marginS j a`;
zero when the marginal is zero. -/
def condFA [Fintype F] (j : Joint S F) (a : S) (f : F) : ℚ :=
  if marginS j a = 0 then 0 else j a f / marginS j a

/-- Conditional `P(S = a | F = f)`. Defined as `j a f / marginF j f`;
zero when the marginal is zero. -/
def condAF [Fintype S] (j : Joint S F) (f : F) (a : S) : ℚ :=
  if marginF j f = 0 then 0 else j a f / marginF j f

/-! ### A1 — Bayes coherence

If neither marginal is zero, then `cond_AF f a * margin_F f = j a f`
and `cond_FA a f * margin_S a = j a f`. The joint is recoverable from
EITHER conditional times its marginal — neither direction is privileged. -/

theorem bayes_coherence_forward [Fintype F]
    (j : Joint S F) (a : S) (f : F)
    (h_S : marginS j a ≠ 0) :
    condFA j a f * marginS j a = j a f := by
  unfold condFA
  rw [if_neg h_S]
  field_simp

theorem bayes_coherence_backward [Fintype S]
    (j : Joint S F) (a : S) (f : F)
    (h_F : marginF j f ≠ 0) :
    condAF j f a * marginF j f = j a f := by
  unfold condAF
  rw [if_neg h_F]
  field_simp

/-- A1, packaged: both directions reproduce the joint. The "no preferred
direction" headline of the framework, in formal form. -/
theorem bayes_coherence_symmetric [Fintype S] [Fintype F]
    (j : Joint S F) (a : S) (f : F)
    (h_S : marginS j a ≠ 0) (h_F : marginF j f ≠ 0) :
    condFA j a f * marginS j a = condAF j f a * marginF j f := by
  rw [bayes_coherence_forward j a f h_S]
  rw [bayes_coherence_backward j a f h_F]

/-! ### A2 — Marginal sum consistency

Marginals are sums of the joint over the complementary axis. Definitional;
included so downstream proofs can chain `margin = ∑ ...` without unfolding. -/

theorem margin_S_eq_sum [Fintype F] (j : Joint S F) (a : S) :
    marginS j a = ∑ f, j a f := rfl

theorem margin_F_eq_sum [Fintype S] (j : Joint S F) (f : F) :
    marginF j f = ∑ a, j a f := rfl

/-- Total mass is computable from either marginal — the joint sum is
independent of which axis you sum out first. This is Fubini for finite
sums. -/
theorem total_mass_axis_independent [Fintype S] [Fintype F] (j : Joint S F) :
    ∑ a, marginS j a = ∑ f, marginF j f := by
  unfold marginS marginF
  exact Finset.sum_comm

/-! ### A3 — Conditional flip identity

A direct, normalization-free restatement of A1's symmetric form:
the two-conditional products are equal, which is exactly Bayes's theorem
in its joint-coherent form. -/

theorem conditional_flip [Fintype S] [Fintype F]
    (j : Joint S F) (a : S) (f : F)
    (h_S : marginS j a ≠ 0) (h_F : marginF j f ≠ 0) :
    condFA j a f * marginS j a = condAF j f a * marginF j f :=
  bayes_coherence_symmetric j a f h_S h_F

end CSAProofs.Discrete
