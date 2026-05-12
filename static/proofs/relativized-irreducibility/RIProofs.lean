/-
  Relativized Irreducibility — Machine-Checked Theorems
  =====================================================

  Lean 4 formalization of three structural theorems for the framework of
  "Relativized Irreducibility and Emergence Pressure (Rev5)":

    T1.  ResidualIrreducibility is monotonically non-increasing in the
         obligation language L.
    T2.  Asymptotic Kolmogorov lower bound on residual information.
    T3.  Subadditivity of residual information under system composition.

  Strategy
  --------
  Systems, obligation languages, compressors, and Kolmogorov complexity are
  modelled at the structural level only — opaque types and axioms encode
  the minimum content the theorems need. Anything that depends on the
  specific instantiation (gzip, CTW, schema-aware coding) lives outside
  this file; the proofs hold for every Compressor satisfying the stated
  monotonicity property.

  ARCHITECTURAL REQUIREMENT (PALS's LAW):
    The proofs in this file are checked by Lean's kernel. The axioms they
    rely on are explicit (search `axiom` below). Any caller of these
    theorems inherits the axioms — they are not implicitly safe.
-/

namespace RIProofs

/-- Abstract universe of systems under analysis. -/
axiom System : Type
/-- Existence witness so `System` carries an `Inhabited` instance —
needed for downstream definitions whose codomain is `System`. -/
axiom System.witness : System
noncomputable instance : Inhabited System := ⟨System.witness⟩

/-- Information content, measured in non-negative integer units (bits or nats). -/
abbrev Information : Type := Nat

/-- Total information content of a system. Axiomatic: the framework does not
prescribe how this is computed; only that every system has one. -/
axiom total : System → Information

/-- An obligation language `L` provides a canonical-coverage functional:
how much of `S`'s information content is captured by the obligations
expressible in `L`. Coverage is bounded by total information. -/
structure ObligationLanguage where
  cover : System → Information
  cover_le_total : ∀ S, cover S ≤ total S

/-- A task `T` is carried as a parameter. Its semantic role is in the
empirical claims (which task is being performed by which observer under
which resources); the structural theorems are task-uniform. -/
axiom Task : Type
axiom Task.witness : Task
noncomputable instance : Inhabited Task := ⟨Task.witness⟩

/-- A compressor / description-length class `K` is a monotone length
functional on `Information`. Concrete instances (gzip, CTW, schema-aware
encoders) are NOT formalized here — the theorems hold for any compressor
satisfying these axioms. -/
structure Compressor where
  length        : Information → Nat
  length_mono   : ∀ a b, a ≤ b → length a ≤ length b
  length_zero   : length 0 = 0

/-- Residual information: what remains of `S`'s information content after
the obligation language `L` has covered everything it can. Uses Nat
truncated subtraction; well-defined because `cover S ≤ total S`.

Declared `abbrev` so it reduces in tactic contexts (omega, simp). -/
noncomputable abbrev residualInformation (S : System) (L : ObligationLanguage) : Information :=
  total S - L.cover S

/-- `ResidualIrreducibility(S, L, T) := ℓ_K(S \ repr_L(S))`. The compressor
`K` must be declared per measurement; residual values are not comparable
across compressor classes. -/
noncomputable abbrev ResidualIrreducibility
    (K : Compressor) (S : System) (L : ObligationLanguage) (_T : Task) : Nat :=
  K.length (residualInformation S L)

/-- `L'` extends `L` when it covers at least as much on every system. -/
def LanguageExtends (L' L : ObligationLanguage) : Prop :=
  ∀ S, L.cover S ≤ L'.cover S

/-! ### Theorem 1 — Monotonicity in the obligation language

If the obligation language is enriched (more obligations expressible),
residual information cannot increase, and therefore `ResidualIrreducibility`
under any compressor cannot increase either.

This is the formal counterpart of the methodological claim that
"closure adequacy is a property of (S, L, T) and improving L can only
shrink the residual." -/

theorem residual_information_monotone
    (S : System) (L L' : ObligationLanguage)
    (h : LanguageExtends L' L) :
    residualInformation S L' ≤ residualInformation S L := by
  unfold residualInformation
  exact Nat.sub_le_sub_left (h S) (total S)

theorem residual_irreducibility_monotone
    (K : Compressor) (S : System) (T : Task)
    (L L' : ObligationLanguage)
    (h : LanguageExtends L' L) :
    ResidualIrreducibility K S L' T ≤ ResidualIrreducibility K S L T := by
  unfold ResidualIrreducibility
  exact K.length_mono _ _ (residual_information_monotone S L L' h)

/-! ### Theorem 2 — Asymptotic Kolmogorov lower bound

Kolmogorov complexity `K(S)` is non-computable; we treat it as an axiomatic
functional. The decomposition axiom says: for any obligation language `L`,
the sum of `L`-coverage and residual information dominates `K(S)` up to
an `L`-specific additive constant. This expresses that every uniquely-S
descriptor must encode at least `K(S)` bits, so the residual cannot drop
below `K(S) − cover − c_L`.

This justifies the citation chain in the definition: Kolmogorov complexity
appears only as the non-computable upper bound on what any compressor can
achieve; the operational form uses MDL. -/

axiom kolmogorov : System → Nat

axiom kolmogorov_decomposition (L : ObligationLanguage) :
  ∃ c : Nat, ∀ S, kolmogorov S ≤ L.cover S + residualInformation S L + c

theorem residual_information_dominates_kolmogorov_gap (L : ObligationLanguage) :
    ∃ c : Nat, ∀ S, kolmogorov S ≤ L.cover S + residualInformation S L + c :=
  kolmogorov_decomposition L

/-- Reformulation: residual + cover + constant is an upper bound on K(S).
Equivalently, the residual is bounded below by K(S) − cover − c (in the
truncated-subtraction sense). -/
theorem residual_lower_bound_via_kolmogorov (L : ObligationLanguage) :
    ∃ c : Nat, ∀ S, kolmogorov S - L.cover S ≤ residualInformation S L + c := by
  obtain ⟨c, hc⟩ := kolmogorov_decomposition L
  refine ⟨c, fun S => ?_⟩
  have h := hc S
  omega

/-! ### Theorem 3 — Subadditivity under system composition

Systems compose with a join cost: `total(S₁ ⊕ S₂) ≤ total(S₁) + total(S₂)
+ joinCost(S₁, S₂)`. The coverage of an obligation language is at least
additive over composition: `cover L (S₁ ⊕ S₂) ≥ cover L S₁ + cover L S₂`
(language obligations don't lose strength under composition).

From these, residual information is subadditive — formally justifying
the architectural practice of decomposing a system into separately-specified
parts and summing the residual budgets. This is what underwrites treating
the six axes (D, O, B, I, X, N) as independently specifiable.

Lifting subadditivity from residual information to `ResidualIrreducibility`
requires the compressor itself to be subadditive — a property natural
codes (concatenation-based) satisfy; we expose it via a refined structure. -/

axiom compose : System → System → System
axiom joinCost : System → System → Nat

axiom total_compose_le (S₁ S₂ : System) :
  total (compose S₁ S₂) ≤ total S₁ + total S₂ + joinCost S₁ S₂

axiom cover_compose_ge (L : ObligationLanguage) (S₁ S₂ : System) :
  L.cover S₁ + L.cover S₂ ≤ L.cover (compose S₁ S₂)

/-- Pure Nat lemma extracted from the subadditivity proof. Stated on
naked Nat variables so `omega` sees pure arithmetic with no structure
projections — those defeated direct invocation. -/
private theorem nat_subadditive_helper
    (a b c d t k j : Nat)
    (ht : t ≤ a + c + j)
    (hk : b + d ≤ k)
    (h₁ : b ≤ a) (h₂ : d ≤ c)
    (h_c : k ≤ t) :
    t - k ≤ (a - b) + (c - d) + j := by
  omega

theorem residual_information_subadditive
    (L : ObligationLanguage) (S₁ S₂ : System) :
    residualInformation (compose S₁ S₂) L
      ≤ residualInformation S₁ L + residualInformation S₂ L + joinCost S₁ S₂ :=
  nat_subadditive_helper
    (total S₁) (L.cover S₁) (total S₂) (L.cover S₂)
    (total (compose S₁ S₂)) (L.cover (compose S₁ S₂)) (joinCost S₁ S₂)
    (total_compose_le S₁ S₂)
    (cover_compose_ge L S₁ S₂)
    (L.cover_le_total S₁) (L.cover_le_total S₂)
    (L.cover_le_total (compose S₁ S₂))

/-- Compressors whose length function is subadditive over addition.
Most concatenation-based codes (including any prefix-free encoding
applied after MDL-optimal coding) satisfy this. Gzip-as-MDL-proxy
satisfies it up to a constant for sufficiently long inputs. -/
structure SubadditiveCompressor extends Compressor where
  length_subadditive : ∀ a b, length (a + b) ≤ length a + length b

theorem residual_irreducibility_subadditive
    (K : SubadditiveCompressor) (L : ObligationLanguage) (T : Task)
    (S₁ S₂ : System) :
    ResidualIrreducibility K.toCompressor (compose S₁ S₂) L T
      ≤ ResidualIrreducibility K.toCompressor S₁ L T
        + ResidualIrreducibility K.toCompressor S₂ L T
        + K.length (joinCost S₁ S₂) := by
  unfold ResidualIrreducibility
  calc K.length (residualInformation (compose S₁ S₂) L)
      ≤ K.length (residualInformation S₁ L + residualInformation S₂ L + joinCost S₁ S₂) :=
        K.length_mono _ _ (residual_information_subadditive L S₁ S₂)
    _ ≤ K.length (residualInformation S₁ L + residualInformation S₂ L)
          + K.length (joinCost S₁ S₂) :=
        K.length_subadditive _ _
    _ ≤ (K.length (residualInformation S₁ L) + K.length (residualInformation S₂ L))
          + K.length (joinCost S₁ S₂) :=
        Nat.add_le_add_right (K.length_subadditive _ _) _

/-! ### Concrete compressor instances

The theorems above are stated for any `Compressor` or `SubadditiveCompressor`.
This section provides two trivial-but-real instances so the abstract
results have inhabited witnesses. They are *baselines*, not realistic
compressors — concrete instances modelling gzip / CTW / schema-aware
encoding belong in a downstream file.

This section also establishes that `SubadditiveCompressor` is inhabited,
which is the structural prerequisite for the framework to even speak of
subadditivity in the residual. -/

/-- The identity compressor: `length n = n`. The information-theoretic
'do nothing' baseline. Trivially monotone, zero-preserving, and
subadditive (with equality). -/
def identityCompressor : SubadditiveCompressor where
  length            := id
  length_mono _ _ h := h
  length_zero       := rfl
  length_subadditive _ _ := Nat.le_refl _

/-- The linear-scaling compressor: `length n = k * n` for a fixed
multiplier `k`. Represents the family of codes whose output length is
proportional to input length (e.g., a fixed-rate channel code). -/
def scaledCompressor (k : Nat) : SubadditiveCompressor where
  length              := fun n => k * n
  length_mono _ _ h   := Nat.mul_le_mul_left k h
  length_zero         := Nat.mul_zero k
  length_subadditive a b := by
    show k * (a + b) ≤ k * a + k * b
    rw [Nat.mul_add]
    exact Nat.le_refl _

/-- The identity-compressor specialization of T1: under the identity
compressor, `ResidualIrreducibility` is exactly `residualInformation`,
and the monotonicity bound carries over verbatim. -/
example
    (S : System) (T : Task) (L L' : ObligationLanguage)
    (h : LanguageExtends L' L) :
    ResidualIrreducibility identityCompressor.toCompressor S L' T
      ≤ ResidualIrreducibility identityCompressor.toCompressor S L T :=
  residual_irreducibility_monotone identityCompressor.toCompressor S T L L' h

/-- The scaled-compressor specialization of T3 (subadditivity). For
multiplier `k`, the residual budget under composition is bounded by the
sum of per-component residual budgets plus `k * joinCost`. -/
example
    (k : Nat) (L : ObligationLanguage) (T : Task) (S₁ S₂ : System) :
    ResidualIrreducibility (scaledCompressor k).toCompressor (compose S₁ S₂) L T
      ≤ ResidualIrreducibility (scaledCompressor k).toCompressor S₁ L T
        + ResidualIrreducibility (scaledCompressor k).toCompressor S₂ L T
        + k * joinCost S₁ S₂ :=
  residual_irreducibility_subadditive (scaledCompressor k) L T S₁ S₂

/-- Witness that `SubadditiveCompressor` is inhabited. Required for any
existential consumer that needs to pick a compressor. -/
instance : Inhabited SubadditiveCompressor := ⟨identityCompressor⟩

end RIProofs

/-! ### Axiom audit

Each theorem's full dependency set, printed by Lean's kernel. Anything
beyond `propext`, `Classical.choice`, `Quot.sound` is paper-specific and
must be defended. -/

#print axioms RIProofs.residual_irreducibility_monotone
#print axioms RIProofs.residual_lower_bound_via_kolmogorov
#print axioms RIProofs.residual_information_subadditive
#print axioms RIProofs.residual_irreducibility_subadditive
