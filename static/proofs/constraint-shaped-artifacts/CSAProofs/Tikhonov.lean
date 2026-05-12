/-
  CSAProofs.Tikhonov
  ==================

  Theorem A6: Tikhonov regularization ≡ Gaussian MAP estimation.

  The paper invokes the equivalence (e.g., MacKay 2003 §29; Bishop 2006
  §3.3) without proving it. This file proves the equivalence rigorously
  by connecting Tikhonov's quadratic objective to the negative log of an
  actual Gaussian product, using Mathlib's `gaussianPDFReal`.

  Structure
  ---------
    A6a.  Algebraic equivalence (general inner-product-space form):
          2σ² · gaussianMAPEnergy = tikhonovObjective with λ = σ²/τ².
    A6b.  Argmin coincidence (general form):
          x minimizes Tikhonov ⇔ x minimizes gaussianMAPEnergy.
    A6c.  Gaussian-density connection (1D scalar form, via Mathlib):
          -log(gaussianPDFReal(Ax, σ², y) · gaussianPDFReal(0, τ², x))
            = gaussianMAPEnergy1D + C(σ², τ²),  with C independent of x.
    A6d.  Tikhonov ≡ true Gaussian MAP (argmin coincidence, 1D):
          x minimizes the true negative-log Gaussian posterior
            ⇔ x minimizes Tikhonov(λ = σ²/τ²).

  A6a–A6b are the general algebraic content; A6c–A6d ground the
  "Gaussian MAP" name in actual Gaussian densities from Mathlib.
  Mathlib v4.15.0 ships only 1D Gaussian densities — the multivariate
  case is downstream work.

  Reference: MacKay 2003, *Information Theory, Inference, and Learning
  Algorithms*, §29; Bishop 2006, *Pattern Recognition and Machine
  Learning*, §3.3.
-/

import Mathlib.Analysis.InnerProductSpace.Basic
import Mathlib.Probability.Distributions.Gaussian
import Mathlib.Tactic.FieldSimp
import Mathlib.Tactic.Ring
import Mathlib.Tactic.Positivity

namespace CSAProofs.Tikhonov

open Real ProbabilityTheory

/-! ### General inner-product-space form (A6a, A6b)

The energy is the *non-constant* part of `−log(Gaussian likelihood ×
Gaussian prior)`: it is the quadratic form inside the exponent, dropping
the additive normalization constants. We name it `gaussianMAPEnergy`
rather than `negLogGaussianPosterior` to be precise about what the
function is (the connection to actual `-log(density)` is established in
A6c, in the 1D scalar case). -/

variable {E F : Type*}
variable [NormedAddCommGroup E] [InnerProductSpace ℝ E]
variable [NormedAddCommGroup F] [InnerProductSpace ℝ F]

/-- Tikhonov regularization objective: `‖y − A x‖² + λ ‖x‖²`. -/
noncomputable def tikhonovObjective
    (A : E →L[ℝ] F) (y : F) (lam : ℝ) (x : E) : ℝ :=
  ‖y - A x‖^2 + lam * ‖x‖^2

/-- The quadratic energy of a Gaussian MAP problem with likelihood
`N(A x, σ² I)` and prior `N(0, τ² I)`: the exponent of the unnormalized
posterior, divided by `−2`. Equals `‖y − A x‖²/(2σ²) + ‖x‖²/(2τ²)`. -/
noncomputable def gaussianMAPEnergy
    (A : E →L[ℝ] F) (y : F) (sigmaSq tauSq : ℝ) (x : E) : ℝ :=
  ‖y - A x‖^2 / (2 * sigmaSq) + ‖x‖^2 / (2 * tauSq)

/-- Theorem A6a. Under positive variances,
`2σ² · gaussianMAPEnergy = tikhonovObjective` with `λ = σ²/τ²`. -/
theorem tikhonov_eq_scaled_gaussian_map_energy
    (A : E →L[ℝ] F) (y : F) (sigmaSq tauSq : ℝ)
    (h_sigma : 0 < sigmaSq) (h_tau : 0 < tauSq) (x : E) :
    2 * sigmaSq * gaussianMAPEnergy A y sigmaSq tauSq x
      = tikhonovObjective A y (sigmaSq / tauSq) x := by
  unfold gaussianMAPEnergy tikhonovObjective
  have h_sigma_ne : sigmaSq ≠ 0 := ne_of_gt h_sigma
  have h_tau_ne : tauSq ≠ 0 := ne_of_gt h_tau
  field_simp
  ring

/-- Theorem A6b. Under positive variances, a point `x` is a Tikhonov
minimizer (relative to `x'`) iff it is a Gaussian-MAP-energy minimizer. -/
theorem tikhonov_minimizer_iff_gaussian_map_energy_minimizer
    (A : E →L[ℝ] F) (y : F) (sigmaSq tauSq : ℝ)
    (h_sigma : 0 < sigmaSq) (h_tau : 0 < tauSq)
    (x x' : E) :
    tikhonovObjective A y (sigmaSq / tauSq) x
        ≤ tikhonovObjective A y (sigmaSq / tauSq) x' ↔
      gaussianMAPEnergy A y sigmaSq tauSq x
        ≤ gaussianMAPEnergy A y sigmaSq tauSq x' := by
  rw [← tikhonov_eq_scaled_gaussian_map_energy A y sigmaSq tauSq h_sigma h_tau x,
      ← tikhonov_eq_scaled_gaussian_map_energy A y sigmaSq tauSq h_sigma h_tau x']
  have h_pos : 0 < 2 * sigmaSq := by positivity
  exact ⟨fun h => le_of_mul_le_mul_left h h_pos,
         fun h => (mul_le_mul_left h_pos).mpr h⟩

/-! ### 1D Gaussian-density connection (A6c, A6d)

Specialize to the scalar case `x, y, A ∈ ℝ` and connect
`gaussianMAPEnergy` to the actual negative log of `gaussianPDFReal`.

Mathlib's `gaussianPDFReal μ v x = (√(2π v))⁻¹ · exp(−(x − μ)² / (2v))`,
where `v : ℝ≥0` is the variance. Below we set σ² and τ² to NNReal-coerced
real values so we can mix the algebraic form (over ℝ) with Mathlib's
Gaussian (over ℝ≥0). -/

/-- 1D Tikhonov objective (scalar parameter, scalar observation, scalar
linear map). Specialization of `tikhonovObjective` to `E = F = ℝ`. -/
noncomputable def tikhonov1D (A y lam x : ℝ) : ℝ :=
  (y - A * x)^2 + lam * x^2

/-- 1D Gaussian-MAP energy. Specialization of `gaussianMAPEnergy`. -/
noncomputable def gaussianMAPEnergy1D (A y sigmaSq tauSq x : ℝ) : ℝ :=
  (y - A * x)^2 / (2 * sigmaSq) + x^2 / (2 * tauSq)

/-- 1D algebraic equivalence (specialization of A6a). -/
theorem tikhonov1D_eq_scaled_gaussian_map_energy1D
    (A y sigmaSq tauSq : ℝ) (h_sigma : 0 < sigmaSq) (h_tau : 0 < tauSq) (x : ℝ) :
    2 * sigmaSq * gaussianMAPEnergy1D A y sigmaSq tauSq x
      = tikhonov1D A y (sigmaSq / tauSq) x := by
  unfold gaussianMAPEnergy1D tikhonov1D
  have h_sigma_ne : sigmaSq ≠ 0 := ne_of_gt h_sigma
  have h_tau_ne : tauSq ≠ 0 := ne_of_gt h_tau
  field_simp
  ring

/-- Auxiliary: the negative log of a single 1D Gaussian density equals
the per-density energy term plus the normalization log. -/
private theorem neg_log_gaussianPDFReal
    (μ : ℝ) (v : NNReal) (h_v : 0 < (v : ℝ)) (x : ℝ) :
    -Real.log (gaussianPDFReal μ v x)
      = (x - μ)^2 / (2 * v) + Real.log (Real.sqrt (2 * Real.pi * v)) := by
  unfold gaussianPDFReal
  have h_sqrt_pos : 0 < Real.sqrt (2 * Real.pi * v) := by
    apply Real.sqrt_pos.mpr
    have h_pi_pos : 0 < Real.pi := Real.pi_pos
    positivity
  have h_sqrt_ne : Real.sqrt (2 * Real.pi * v) ≠ 0 := ne_of_gt h_sqrt_pos
  have h_inv_pos : 0 < (Real.sqrt (2 * Real.pi * v))⁻¹ := inv_pos.mpr h_sqrt_pos
  have h_exp_pos : 0 < Real.exp (-(x - μ)^2 / (2 * v)) := Real.exp_pos _
  rw [Real.log_mul (ne_of_gt h_inv_pos) (ne_of_gt h_exp_pos)]
  rw [Real.log_inv, Real.log_exp]
  field_simp

/-- Theorem A6c (Gaussian-density connection, 1D). The negative log of
the unnormalized Gaussian posterior — that is, the negative log of the
product `(likelihood) · (prior)` with likelihood `N(A x, σ²)` and prior
`N(0, τ²)` — equals the 1D Gaussian-MAP energy plus an additive constant
that does not depend on `x`. -/
theorem neg_log_gaussian_product_eq_energy_plus_const
    (A y : ℝ) (sigmaSq tauSq : NNReal)
    (h_sigma : 0 < (sigmaSq : ℝ)) (h_tau : 0 < (tauSq : ℝ)) (x : ℝ) :
    -Real.log (gaussianPDFReal (A * x) sigmaSq y * gaussianPDFReal 0 tauSq x)
      = gaussianMAPEnergy1D A y sigmaSq tauSq x
        + (Real.log (Real.sqrt (2 * Real.pi * sigmaSq))
            + Real.log (Real.sqrt (2 * Real.pi * tauSq))) := by
  unfold gaussianMAPEnergy1D
  have h_lik_pos : 0 < gaussianPDFReal (A * x) sigmaSq y := by
    unfold gaussianPDFReal
    have h_sqrt : 0 < Real.sqrt (2 * Real.pi * sigmaSq) :=
      Real.sqrt_pos.mpr (by have := Real.pi_pos; positivity)
    have h_inv : 0 < (Real.sqrt (2 * Real.pi * sigmaSq))⁻¹ := inv_pos.mpr h_sqrt
    have h_exp : 0 < Real.exp (-(y - A * x)^2 / (2 * sigmaSq)) := Real.exp_pos _
    exact mul_pos h_inv h_exp
  have h_prior_pos : 0 < gaussianPDFReal 0 tauSq x := by
    unfold gaussianPDFReal
    have h_sqrt : 0 < Real.sqrt (2 * Real.pi * tauSq) :=
      Real.sqrt_pos.mpr (by have := Real.pi_pos; positivity)
    have h_inv : 0 < (Real.sqrt (2 * Real.pi * tauSq))⁻¹ := inv_pos.mpr h_sqrt
    have h_exp : 0 < Real.exp (-(x - 0)^2 / (2 * tauSq)) := Real.exp_pos _
    exact mul_pos h_inv h_exp
  rw [Real.log_mul (ne_of_gt h_lik_pos) (ne_of_gt h_prior_pos)]
  rw [show -(Real.log (gaussianPDFReal (A * x) sigmaSq y)
              + Real.log (gaussianPDFReal 0 tauSq x))
        = -Real.log (gaussianPDFReal (A * x) sigmaSq y)
            + -Real.log (gaussianPDFReal 0 tauSq x) by ring]
  rw [neg_log_gaussianPDFReal (A * x) sigmaSq h_sigma y,
      neg_log_gaussianPDFReal 0 tauSq h_tau x]
  ring

/-- Theorem A6d (true Gaussian-MAP ≡ Tikhonov, argmin coincidence in 1D).
Under positive variances, `x` minimizes the negative log of the true
unnormalized Gaussian posterior iff `x` minimizes the Tikhonov objective
with `λ = σ²/τ²`. This is the formal statement of "Tikhonov regularization
is equivalent to Gaussian MAP estimation" from MacKay/Bishop. -/
theorem tikhonov1D_minimizer_iff_true_gaussian_map_minimizer
    (A y : ℝ) (sigmaSq tauSq : NNReal)
    (h_sigma : 0 < (sigmaSq : ℝ)) (h_tau : 0 < (tauSq : ℝ))
    (x x' : ℝ) :
    tikhonov1D A y ((sigmaSq : ℝ) / tauSq) x
        ≤ tikhonov1D A y ((sigmaSq : ℝ) / tauSq) x' ↔
      -Real.log (gaussianPDFReal (A * x) sigmaSq y * gaussianPDFReal 0 tauSq x)
        ≤ -Real.log (gaussianPDFReal (A * x') sigmaSq y * gaussianPDFReal 0 tauSq x') := by
  rw [neg_log_gaussian_product_eq_energy_plus_const A y sigmaSq tauSq h_sigma h_tau x,
      neg_log_gaussian_product_eq_energy_plus_const A y sigmaSq tauSq h_sigma h_tau x']
  rw [← tikhonov1D_eq_scaled_gaussian_map_energy1D A y sigmaSq tauSq h_sigma h_tau x,
      ← tikhonov1D_eq_scaled_gaussian_map_energy1D A y sigmaSq tauSq h_sigma h_tau x']
  set C := Real.log (Real.sqrt (2 * Real.pi * sigmaSq))
            + Real.log (Real.sqrt (2 * Real.pi * tauSq))
  have h_pos : 0 < 2 * (sigmaSq : ℝ) := by positivity
  constructor
  · intro h
    have : gaussianMAPEnergy1D A y sigmaSq tauSq x
            ≤ gaussianMAPEnergy1D A y sigmaSq tauSq x' :=
      le_of_mul_le_mul_left h h_pos
    linarith
  · intro h
    have hE : gaussianMAPEnergy1D A y sigmaSq tauSq x
              ≤ gaussianMAPEnergy1D A y sigmaSq tauSq x' := by linarith
    exact (mul_le_mul_left h_pos).mpr hE

end CSAProofs.Tikhonov
