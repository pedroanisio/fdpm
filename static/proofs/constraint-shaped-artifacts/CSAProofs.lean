/-
  Constraint-Shaped Artifacts — Machine-Checked Theorems
  =====================================================

  Lean 4 formalization for the framework of "Constraint-Shaped Artifacts:
  A Compatibility-Relation Framework".

  Outline:
    A1.  Joint-symmetric Bayes coherence    (core Lean, this file)
    A2.  Marginal sum consistency           (core Lean, this file)
    A3.  Conditional-flip identity          (core Lean, this file)
    A4.  Mutual-information symmetry        (Mathlib, see Mathlib/)
    A5.  Loomis–Whitney bound               (Mathlib, see Mathlib/)
    A6.  Tikhonov ≡ Gaussian MAP            (Mathlib, see Mathlib/)

  The core-Lean theorems (A1–A3) live in this top-level module so they
  can be type-checked without the Mathlib dependency. The Mathlib-heavy
  results (A4–A6) live under CSAProofs/* and are imported only when
  Mathlib is built.
-/

import CSAProofs.Discrete
import CSAProofs.MutualInfo
import CSAProofs.LoomisWhitney
import CSAProofs.Tikhonov

/-! ### Axiom audit

Every theorem's full dependency set, printed by Lean's kernel. Anything
beyond `propext`, `Classical.choice`, `Quot.sound` is paper-specific. -/

#print axioms CSAProofs.Discrete.bayes_coherence_symmetric
#print axioms CSAProofs.Discrete.total_mass_axis_independent
#print axioms CSAProofs.Discrete.conditional_flip
#print axioms CSAProofs.MutualInfo.mutual_information_symmetric
#print axioms CSAProofs.LoomisWhitney.loomis_whitney_axes
#print axioms CSAProofs.LoomisWhitney.loomis_whitney_2d
#print axioms CSAProofs.Tikhonov.tikhonov_eq_scaled_gaussian_map_energy
#print axioms CSAProofs.Tikhonov.tikhonov_minimizer_iff_gaussian_map_energy_minimizer
#print axioms CSAProofs.Tikhonov.tikhonov1D_eq_scaled_gaussian_map_energy1D
#print axioms CSAProofs.Tikhonov.neg_log_gaussian_product_eq_energy_plus_const
#print axioms CSAProofs.Tikhonov.tikhonov1D_minimizer_iff_true_gaussian_map_minimizer
