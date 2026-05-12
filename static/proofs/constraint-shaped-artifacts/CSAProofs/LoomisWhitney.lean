/-
  CSAProofs.LoomisWhitney
  =======================

  Theorem A5: Axis-product bound for finite n-fold products.

  The paper invokes Loomis–Whitney (1949) for the bound
        |A|^{n-1} ≤ ∏_i |π_i(A)|
  in §3.4, where the projections are to (n−1)-dimensional coordinate
  hyperplanes. The full theorem is non-trivial for n ≥ 3 and requires
  Shearer's inequality; Mathlib v4.15.0 does not formalize it.

  This file proves the related — and for the paper's structural argument,
  the operative — bound:
        |A| ≤ ∏_i |π_i(A)|
  where π_i is the projection to the i-th coordinate axis (not to an
  (n−1)-d hyperplane). For n = 2 the two formulations coincide
  (|A|^1 = |A|, and each "(n−1)-d hyperplane" is a 1-d axis).
  For n > 2 the axis-product bound is strictly weaker than the full
  Loomis–Whitney; the paper's invocation of "joint bounded by marginals"
  is the axis-product form, so this is what A5 covers.

  Reference: Loomis & Whitney, "An inequality related to the
  isoperimetric inequality", Bull. AMS 55 (1949): 961–962.
-/

import Mathlib.Data.Finset.Card
import Mathlib.Data.Finset.Image
import Mathlib.Data.Finset.Prod
import Mathlib.Data.Fintype.Pi
import Mathlib.Data.Fintype.BigOperators

namespace CSAProofs.LoomisWhitney

open Finset

/-! ### A5 — Axis-product bound (general n-fold product)

For any finite subset `A` of an n-fold dependent product `∀ i : ι, δ i`,
the cardinality of `A` is bounded by the product of the cardinalities of
its coordinate-axis projections. Proof: `A` is contained in the product
of its axis projections, and `card` is monotone; the cardinality of the
product equals the product of cardinalities. -/

theorem loomis_whitney_axes
    {ι : Type*} [DecidableEq ι] [Fintype ι]
    {δ : ι → Type*} [∀ i, DecidableEq (δ i)]
    (A : Finset (∀ i, δ i)) :
    A.card ≤ ∏ i, (A.image (fun a => a i)).card := by
  have h_sub : A ⊆ Fintype.piFinset (fun i => A.image (fun a => a i)) := by
    intro a ha
    rw [Fintype.mem_piFinset]
    intro i
    exact Finset.mem_image.mpr ⟨a, ha, rfl⟩
  calc A.card
      ≤ (Fintype.piFinset (fun i => A.image (fun a => a i))).card :=
        Finset.card_le_card h_sub
    _ = ∏ i, (A.image (fun a => a i)).card :=
        Fintype.card_piFinset _

/-! ### Corollary — the n = 2 case

For `A ⊆ α × β`, the cardinality of `A` is bounded by the product of the
cardinalities of its two coordinate projections. This is the exact form
the paper invokes for the (artifact, configuration) joint and is what
Loomis–Whitney degenerates to when n = 2 (the two formulations of the
inequality coincide at n = 2). -/

theorem loomis_whitney_2d
    {α β : Type*} [DecidableEq α] [DecidableEq β]
    (A : Finset (α × β)) :
    A.card ≤ (A.image Prod.fst).card * (A.image Prod.snd).card := by
  have h_sub : A ⊆ (A.image Prod.fst) ×ˢ (A.image Prod.snd) := by
    intro p hp
    rw [Finset.mem_product]
    refine ⟨?_, ?_⟩
    · exact Finset.mem_image.mpr ⟨p, hp, rfl⟩
    · exact Finset.mem_image.mpr ⟨p, hp, rfl⟩
  calc A.card
      ≤ ((A.image Prod.fst) ×ˢ (A.image Prod.snd)).card :=
        Finset.card_le_card h_sub
    _ = (A.image Prod.fst).card * (A.image Prod.snd).card :=
        Finset.card_product _ _

end CSAProofs.LoomisWhitney
