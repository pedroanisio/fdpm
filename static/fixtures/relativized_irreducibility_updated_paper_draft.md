---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Rev6 revision (§13.3 corrections, §13.4–§13.8 updates, §14.4 falsifier instantiation) by Claude Fable 5.1 via Claude Code; earlier revisions from the author's workflow"
  date: "2026-09-03"
---

# Relativized Irreducibility and Emergence Pressure

## A Reconciled Framework for Abstraction, Closure Regimes, and Primitive Formation

## Table of Contents

1. Introduction  
2. Epistemic Status and Notation  
3. Assumptions  
4. Motivating Example: Software Systems  
5. Relativized Irreducibility  
6. Emergence Pressure  
7. The Abstraction Cycle  
8. Closure Adequacy  
9. Closure Regimes  
10. Canonical Pattern Bases and Residual Irreducibility  
11. Intentional Encapsulation and Accidental Erasure  
12. Operationalization  
13. Case Study: Six-Axis Backend Specification Language  
14. Failure Modes and Falsifiers  
15. Relation to Existing Work  
16. References  
17. Implications  
18. Conclusion  
19. Provenance and Verification Record

---

## Abstract

Complex systems are often described as reducible or irreducible. The distinction misleads when irreducibility is treated as an intrinsic property of the system alone. A distributed backend, a biological cell, a neural network, or a market may be reducible under one representation and irreducible under another, and what changes is not only the system but the modeling language, the observer, the available resources, and the task.

This paper treats reducibility as a relation among those five terms, `Reducible(S, L, O, R, T)`, and argues that abstraction layers form under **emergence pressure**: the point at which lower-level decomposition becomes too costly, lossy, opaque, or operationally irrelevant for a task. A successful abstraction does not eliminate irreducibility. It relocates it into a **closure regime** whose contracts, validation laws, canonical patterns, and observability surfaces distinguish known obligations from genuinely novel residuals. The concepts that make that distinction checkable are closure adequacy, closure regimes, abstraction debt, runtime escape, canonical pattern bases, and residual irreducibility.

The framework is applied to a six-axis backend specification language with fixed falsification thresholds, and the falsifiers are run against the paper's own worked specification. On the first run they fired. The specification, presented as valid, produced five error-level findings from the validators the case study names, two of them violations of the closure regime the paper itself had declared. Three of the four extension regions the paper had declared open were rejected by the schema. A mutation catch rate previously asserted as 8 of 8 measured 6 of 7 for the statically detectable mutations. The corrections are reported at the point where each claim changed, one seeded canonical-pattern violation that no validator catches is recorded as a measured gap, and four of the ten falsifiers remain unresolved because they need release, incident, review, or generation data that a seeded example cannot supply. The claim is modest. The reason to publish is that the framework has now been used once on a real artifact and caught real errors, including its own.

---

## 1. Introduction

[DEFINITION] Reduction is often discussed as if it were absolute. A system is described as either reducible to its parts or irreducible as a whole. This binary is too coarse.

A backend system may be difficult to understand from raw source code but tractable when represented through commands, queries, invariants, error taxonomies, operation bindings, and observability contracts. A biological cell may be decomposed into molecular mechanisms, yet remain functionally meaningful only as a bounded regulatory unit. A neural network may be represented as tensors, layers, circuits, behaviors, or product-level capabilities, depending on the task.

[DERIVED from §2.2 and §5] The same system can therefore be reducible in one language and irreducible in another.

[DEFINITION] The framework defines reducibility as relational:

```text
Reducible(S, L, O, R, T)
```

Where:

```text
S = system
L = modeling or representation language
O = observer or modeling agent
R = resource regime
T = task: prediction, control, explanation, compression, validation, generation, audit, or debugging
```

The negation is not simply:

```text
Irreducible(S)
```

but:

```text
Irreducible(S | L, O, R, T)
```

[DEFINITION] A system becomes irreducible relative to a language, observer, resources, and task when decomposition into the primitives of that language is insufficient, too costly, too lossy, or too opaque for that task.

[CONJECTURE] Abstraction is the mechanism by which such pressure is managed. It does not destroy lower-level complexity. It relocates complexity into contracts, validation laws, closure regimes, canonical pattern bases, and observability surfaces. The canonical abstraction cycle is stated once in §7.

---

## 2. Epistemic Status and Notation

### 2.1 Epistemic Status

This document proposes a framework, not an established empirical law.

Claims are marked as follows:

```text
[DEFINITION]  Introduced by construction.
[ASSUMPTION]  Required condition for a claim or mechanism to hold.
[DERIVED]     Follows from stated assumptions or prior definitions.
[LEMMA]       Known result restated for the fragment used here, with citation.
[CONJECTURE]  Plausible but requiring formal proof or empirical validation.
[EMPIRICAL]   Requires measurement in concrete systems.
```

The framework avoids presenting its notation as a complete theorem system. The document contains one lemma, a known decidability result restated for the closure-law fragment it uses (§8.9), and one instantiated falsifier evaluation with measured results (§14.4). The broader framework remains conceptual and operational rather than fully formal.

### 2.2 Notation Index

```text
Reducible(S, L, O, R, T)
```

System `S` is reducible relative to language `L`, observer `O`, resource regime `R`, and task `T` when decomposition into the primitives of `L` is sufficient for `O` to perform `T` under `R`.

```text
Irreducible(S | L, O, R, T)
```

System `S` is irreducible under those conditions when decomposition is insufficient, too costly, too lossy, or too opaque for the task.

```text
EmergencePressure(S, L, O, R, T)
```

A qualitative condition where resource, coordination, state-space, information, or model-language pressure makes lower-level representation inadequate for `T`. No scalar function is specified in this paper. Any scalarization must define units and weights.

```text
A → p' in L'
```

Aggregate `A` becomes primitive `p'` in a higher-level language `L'` when its contract is task-adequate.

```text
ClosureAdequate(L, C, T)
```

Language `L` is closure-adequate for system class `C` and task `T` when its primitives, contracts, closure laws, validators, canonical patterns, and observability surfaces preserve the obligations required for `T`.

```text
ClosureRegime(L) = (Φ_closed, Φ_open, rules_partition)
```

A declaration of where absence counts as invalidity and where absence remains permissible unknown or extensibility.

```text
AbstractionDebt(A, T)
```

Hidden task-relevant obligations not represented in contract, closure laws, canonical patterns, validation, or observability.

```text
RuntimeEscape(A, T)
```

Runtime behavior relevant to `T` that is not represented in the abstraction contract.

```text
ResidualIrreducibility(S, L, T)
```

Irreducibility remaining after known obligations have been mechanized.

---

## 3. Assumptions

The framework depends on explicit assumptions.

### A1 — Language-Task Fit [ASSUMPTION]

The modeling language `L` contains primitives relevant to task `T`.

If `L` lacks task-relevant primitives, irreducibility may be an artifact of poor language choice.

### A2 — Observer Boundedness [ASSUMPTION]

The observer `O` operates under finite computational, cognitive, temporal, instrumental, or economic resources `R`.

The framework is designed for limited observers, not omniscient agents.

### A3 — Contract Interpretability [ASSUMPTION]

The exposed contract of an abstraction can be interpreted by downstream agents, validators, generators, operators, or users.

An uninterpretable contract does not reduce task cost.

### A4 — Closure-Law Satisfiability [ASSUMPTION]

The closure laws attached to an abstraction are mutually satisfiable.

This assumption is nontrivial. In expressive closure languages, satisfiability can be undecidable or computationally intractable. For A4 to be operational, closure laws should be restricted to a decidable fragment, such as Datalog without function symbols, effectively propositional reasoning, decidable description logics, bounded model checking fragments, or other domain-specific decidable subsets.

If the closure language can encode unrestricted first-order logic with arithmetic, then satisfiability checking becomes another instance of irreducibility rather than a solution to it.

### A5 — Boundary Partition Correctness [ASSUMPTION]

The abstraction correctly partitions its regions into closed-world and open-world areas.

Closed-world areas are those where absence counts as invalidity. Open-world areas are those where absence means unknown, extensible, or intentionally unmodeled.

### A6 — Observability Adequacy [ASSUMPTION]

The abstraction preserves enough logs, traces, metrics, events, state access, or inspection hooks for the relevant task.

If observability is insufficient, intentional encapsulation degrades into accidental erasure.

### A7 — Canonical Pattern Adequacy [ASSUMPTION]

When a canonical pattern base is used, it adequately covers the known-valid patterns relevant to the target domain.

If the canonical base is stale or incomplete, the validator may reject correct instances or force systems toward outdated patterns.

### A8 — Residual Complexity Bound [ASSUMPTION]

The complexity introduced by the abstraction language, closure laws, validators, and canonical datasets does not exceed the complexity it relocates.

This must be measured in concrete units for a concrete case.

---

## 4. Motivating Example: Software Systems

Software architecture provides the running example because it exposes abstraction mechanics directly.

A backend implementation is distributed across routes, handlers, database schemas, migrations, validators, auth middleware, event consumers, retry jobs, configuration files, and observability infrastructure. Inspecting these artifacts directly may be possible, but the obligations that matter are non-local: authorization must align with operation bindings; state transitions must align with commands; errors must align with error envelopes; PII classifications must align with logging and retention.

Other domains exhibit the same pattern. In computation, transistors become gates, gates become circuits, circuits become CPUs, and CPUs expose instruction sets. In biology, molecules become cells, cells become tissues, and tissues become organs. In AI systems, tensors, layers, tools, memories, and agents are all possible primitives depending on the task. These examples are not identical; they simply show that reducibility changes with language and task.

---

## 5. Relativized Irreducibility

### 5.1 Reducibility [DEFINITION]

```text
Reducible(S, L, O, R, T)
```

A system `S` is reducible relative to language `L`, observer `O`, resource regime `R`, and task `T` when decomposition into the primitives of `L` is sufficient for `O` to perform `T` under `R`.

### 5.2 Irreducibility [DEFINITION]

```text
Irreducible(S | L, O, R, T)
```

A system is irreducible under those conditions when decomposition is insufficient, too costly, too lossy, or too opaque for the task.

### 5.3 Structural Irreducibility [DEFINITION]

A system is structurally irreducible when its organization cannot be decomposed into independent or near-independent subcomponents without losing relevant relational structure.

Example: a tightly coupled distributed system whose correctness depends on causal ordering, retries, locks, and shared invariants.

### 5.4 Functional Irreducibility [DEFINITION]

A system is functionally irreducible when the behavior of the whole cannot be predicted, controlled, or explained from component descriptions alone within the relevant task and resource bounds.

This corresponds to the practical meaning of “more is different”: a system may be structurally decomposable but functionally irreducible.

### 5.5 Algorithmic Irreducibility [DEFINITION]

A system is algorithmically irreducible when no shorter effective description, simulation, or predictive procedure exists relative to a language and resource regime.

The framework uses this only in an MDL-style operational sense (Rissanen 1978). It does not claim that absolute Kolmogorov complexity is computable or directly available. The algorithmic-information background includes Kolmogorov (1965), Solomonoff (1964), and Chaitin (1966).

---

## 6. Emergence Pressure

### 6.1 Definition [DEFINITION]

Emergence pressure is the accumulation of forces that make direct lower-level modeling increasingly costly, lossy, opaque, or operationally irrelevant for a task.

It is not a claim that higher-level behavior violates lower-level mechanisms. It is a claim about the inadequacy of a lower-level representation under bounded modeling conditions.

### 6.2 Root Pressure Taxonomy [DEFINITION]

Emergence pressure has five root categories:

```text
1. Resource pressure
   Time, compute, memory, token budget, engineer-hours, economic cost.

2. Coordination pressure
   Dependency management, concurrency, causal ordering, synchronization, retries, cross-component consistency.

3. State-space pressure
   Combinatorial explosion, path dependence, configuration growth, transition growth.

4. Information pressure
   Information loss, instrumentation gaps, observability limits, ambiguous absence, hidden semantic obligations.

5. Model-language pressure
   Poor primitive choice, canonical-pattern uncertainty, model mismatch, task-language mismatch.
```

Finer-grained terms are subtypes, not independent root causes.

### 6.3 Operational Cost Criterion [EMPIRICAL]

A common intuition is:

```text
Cost(abstraction) < Cost(lower-level reasoning)
```

The framework states this only with an explicit metric:

```text
Cost_m(L_spec + validators + canonical base + residual failures, T)
<
Cost_m(L_code inspection + manual reasoning + hidden failures, T)
```

Where `m` is a chosen measurement unit, such as:

```text
engineer-hours
median bug-finding time
number of escaped defects
validator runtime
false rejection rate
false acceptance rate
incident count per release
specification token count versus implementation token count
cyclomatic complexity for local code paths
Halstead-style volume for implementation artifacts
```

Without a metric, the inequality is only a design intuition, not a falsifiable claim.

### 6.4 Threshold Framing [CONJECTURE]

Some emergence-pressure dynamics resemble threshold behavior: below a certain level of coupling, opacity, or cost, lower-level decomposition remains useful; above it, higher-level abstraction becomes operationally superior.

The framework does not assert a literal phase transition unless an order parameter and transition regime are specified.

This conjecture is refuted for a given system class if, across a pre-registered set of candidate systems and a pre-declared order parameter, no measurable threshold separates regimes where lower-level decomposition succeeds from regimes where higher-level abstraction improves the chosen metric `m`.

---

## 7. The Abstraction Cycle

When emergence pressure persists in a `(S, L, O, R, T)`-relative modeling situation, components of the system may undergo a recurring ten-step cycle. The cycle is recurring because each completed pass can produce a new primitive in a higher-level language `L'`, and the process can re-enter at step 1 with respect to `L'`.

### 7.1 Primitive Selection [DEFINITION]

A modeling language `L` declares some set `P_L` of distinguished elements as atomic for task `T`.

Atomicity is language-relative, not metaphysical.

Examples:

```text
Software architecture: function, module, service, API
Backend specification: entity, command, query, event, invariant, operation binding
Biology: molecule, cell, tissue, organ
Computation: bit, gate, register, instruction
```

### 7.2 Composition [DEFINITION]

Primitives compose into structures according to the rules of a language.

```text
C = compose(P_L, rules_L)
```

### 7.3 Cross-Interaction [DEFINITION]

Composed structures interact through dependencies, feedback, shared resources, policies, causal ordering, and implicit constraints.

At this level:

```text
Behavior(C) ≠ Combine({Behavior(p_i)})
```

`Combine` is intentionally left uninterpreted. Its meaning depends on the modeling language. The expression states only that interaction behavior need not be recoverable by naïvely aggregating isolated component behaviors.

### 7.4 Emergence Pressure [DEFINITION]

Lower-level representation becomes costly, lossy, opaque, or operationally inadequate for task `T` under resource regime `R`.

### 7.5 Contract Formation [DEFINITION]

An aggregate `A` is hidden behind an interface or contract `I`.

```text
A = encapsulate(C, I)
```

Where:

```text
C = internal composition
I = exposed interface or contract
A = aggregate treated as a unit
```

### 7.6 Closure-Regime Declaration [DEFINITION]

The interface partitions its axes `Φ` into:

```text
Φ_closed = regions where absence is invalidity
Φ_open   = regions where absence is unknown or extensible
```

Failure of this partition is one of the central abstraction failure modes (§14).

### 7.7 Closure-Law Satisfiability [DEFINITION]

The conjunction of constraints imposed by the closure regime must be satisfiable. If the closure laws define an impossible system class, the abstraction is void.

For this step to be operational, closure laws should be restricted to a decidable fragment (§3.A4; §8.9).

### 7.8 Canonical-Pattern Alignment [DEFINITION]

Where a curated pattern base `D_c` exists, known semantic obligations are validated against it.

This separates known obligations, which may be mechanizable, from novel obligations, which remain residual.

### 7.9 Observability Preservation [DEFINITION]

The abstraction preserves sufficient inspection signals for downstream tasks: debugging, audit, control, explanation, and adaptation.

Without this, intentional encapsulation degrades into accidental erasure.

### 7.10 Primitive Promotion [DEFINITION]

When the contract is task-adequate, aggregate `A` is treated as a primitive `p'` in a higher-level language `L'`.

```text
A → p' in L'
```

The recurrence is not idempotent. Applying the cycle to `L` gives `L'`; applying it again can produce `L'' ≠ L'`. Real abstraction towers can realize this recurrence over many turns.

---

## 8. Closure Adequacy

### 8.1 Why Encapsulation Is Not Enough [DERIVED from §7.5–§7.9]

The simple abstraction story says:

```text
hide implementation
expose interface
use aggregate as primitive
```

This is insufficient. Many abstractions fail because they hide implementation but do not expose the obligations necessary to reason about behavior.

An API abstraction that hides error behavior may fail under retries. A database abstraction that hides transaction semantics may fail under concurrency. A service abstraction that hides tenant isolation may fail under security pressure. An AI-agent abstraction that hides tool-use traces may fail under audit or alignment tasks.

This extends classic information hiding: the question is not only what implementation detail is hidden, but which hidden obligations remain checkable, observable, and semantically closed.

### 8.2 Conceptual Layers of Closure Adequacy [DEFINITION]

Closure adequacy has five conceptual layers:

```text
1. Syntactic well-formedness
2. Local semantic validity
3. Global semantic closure
4. Operational adequacy
5. Observability adequacy
```

These are conceptual layers, not necessarily one-to-one validator components.

### 8.3 Syntactic Well-Formedness [DEFINITION]

The artifact conforms to the grammar or schema of the language.

Example: a JSON document validates against its schema.

### 8.4 Local Semantic Validity [DEFINITION]

Individual declarations satisfy constraints attached to them.

Example: a decimal field does not use string-only constraints such as `min_length`.

### 8.5 Global Semantic Closure [DEFINITION]

References, obligations, and relations resolve consistently across the full model.

Representative closure laws can be expressed in Datalog-style notation:

```prolog
invalid(C, undeclared_aggregate) :-
  command(C), target_aggregate(C, A), not aggregate(A).

invalid(Q, undeclared_query_entity) :-
  query(Q), query_target_entity(Q, E), not entity(E).

invalid(T, undeclared_transition_trigger) :-
  transition(T), trigger(T, X), not command(X), not event(X).

invalid(C, undeclared_emitted_event) :-
  command(C), emits(C, E), not event(E).

invalid(O, missing_operation_binding) :-
  operation(O), not internal(O), not operation_binding(O).

invalid(O, undeclared_error) :-
  operation(O), operation_error(O, Err), not error_taxonomy(Err).

invalid(F, missing_pii_redaction) :-
  field(F), classification(F, pii), not log_redaction_rule(F).

invalid(F, missing_pii_retention) :-
  field(F), classification(F, pii), not retention_rule(F).
```

These rules are illustrative, not a complete backend validator. They show that the closure laws need not remain narrative predicates; they can be compiled into a decidable validation fragment when the language is restricted appropriately (§8.9).

### 8.6 Operational Adequacy [DEFINITION]

The abstraction remains sufficient when executed, generated, deployed, monitored, or used.

This includes runtime failure modes, authorization, consistency, topology, migration, and other operational obligations.

### 8.7 Observability Adequacy [DEFINITION]

The abstraction preserves enough signals to inspect, debug, audit, explain, or control the hidden implementation.

### 8.8 Decidability Limit [DERIVED from §3.A4]

Closure adequacy depends on the closure language. If closure laws are expressed in an unrestricted language, checking satisfiability or implication may be undecidable.

Therefore, practical closure-adequate systems should specify:

```text
closure language
allowed fragment
satisfiability procedure
complexity class or timeout policy
fallback behavior when checking is inconclusive
```

A useful abstraction should not hide irreducibility inside an undecidable validator without acknowledging the cost.

### 8.9 Finite Datalog Closure Satisfiability [LEMMA]

**Lemma (known result, restated).** Let `Σ_L` be a finite set of closure laws expressed as function-free Datalog rules over a finite extensional database `D`. If the abstraction’s admissibility condition is expressed as a finite set of required and forbidden derived predicates over the least fixed point of `Σ_L ∪ D`, then closure-law satisfiability is decidable, and for a fixed rule set the check runs in time polynomial in the size of `D`.

**Why it holds.** Function-free Datalog over a finite domain has a finite Herbrand base. The immediate-consequence operator is monotone over the finite lattice of ground atoms, so iterating it reaches the least fixed point in finitely many steps, and each required or forbidden predicate is then checked by finite lookup. This is the standard fixpoint semantics of Datalog (Abiteboul, Hull & Vianu, 1995); the polynomial data complexity of a fixed Datalog program is established in Dantsin, Eiter, Gottlob & Voronkov (2001). Nothing in this subsection is new. The result is restated because assumption A4 depends on it and because it fixes the fragment that the case study's closure-law validator implements. It says nothing about unrestricted closure languages.

**Consequence.** A closure-adequate abstraction language should state the fragment in which closure laws are written. If it uses a more expressive language, it must also state what happens when satisfiability checking is inconclusive.

### 8.10 Abstraction Debt [DEFINITION]

Abstraction debt is the set of task-relevant obligations hidden by an abstraction but not represented in its exposed contract, closure laws, validation procedures, canonical pattern bases, or observability surface.

Examples:

```text
undeclared runtime error
implicit retry policy
unmodeled authorization path
missing tenant isolation rule
state transition absent from the state machine
PII field without redaction or retention policy
```

**Relation to technical debt.** Abstraction debt is related to technical debt but narrower. Technical debt concerns future cost incurred by expedient design or implementation decisions. Abstraction debt concerns a specific kind of debt: obligations hidden by an abstraction boundary that remain unmodeled, unvalidated, or unobservable. Technical debt may exist without abstraction debt; abstraction debt is one mechanism by which technical debt accumulates.

### 8.11 Runtime Escape [DEFINITION]

A runtime escape occurs when behavior emerges from implementation, generation, deployment, or execution that is not represented in the abstraction contract.

Runtime escape is evidence that the abstraction is not closure-adequate for the task.

**Relation to leaky abstractions.** Runtime escape is related to the familiar idea of leaky abstractions. A leaky abstraction exposes lower-level details through the abstraction boundary. Runtime escape is more specific: it names task-relevant behavior that appears outside the declared contract, usually as an undeclared failure mode, observability gap, consistency violation, or unsupported case.

---

## 9. Closure Regimes

### 9.1 Motivation

Not every part of an abstraction should be closed. A useful abstraction must declare which regions are closed-world and which remain open-world.

In a closed-world region, absence is meaningful: if a required operation, error, binding, policy, or state transition is not declared, the specification is invalid.

In an open-world region, absence means unknown, extensible, or intentionally unmodeled.

### 9.2 Closure Regime [DEFINITION]

Let `Φ` be the set of abstraction axes.

```text
Φ = {φ_1, φ_2, ..., φ_n}
```

Let `Φ_closed ⊆ Φ` be the subset governed by closed-world semantics.

```text
ClosureRegime(L) = (Φ_closed, Φ_open, rules_partition)
```

Where:

```text
Φ_closed = axes where absence counts as invalidity
Φ_open   = axes where absence means unknown, extensible, or intentionally unmodeled
rules_partition = justification for why each axis is closed or open
```

### 9.3 Closure-Regime Failure [DERIVED from §9.2 and §3.A5]

If `Φ_closed` is too narrow:

```text
omissions remain hidden
runtime escape increases
abstraction debt accumulates
```

If `Φ_closed` is too broad:

```text
valid extensions are rejected
canonical conservatism increases
innovation is suppressed
```

Thus, primitive promotion requires not only an interface, but absence semantics.

---

## 10. Canonical Pattern Bases and Residual Irreducibility

### 10.1 Canonical Pattern Base [DEFINITION]

A canonical pattern base is a curated, versioned dataset of known-valid patterns for a domain.

```text
D_c = canonical pattern base
```

Examples:

```text
standard API error patterns
OAuth/OIDC authentication flows
HTTP method taxonomies
state-machine topologies
event schema patterns
idempotency patterns
tenant-isolation patterns
retry/backoff patterns
observability conventions
```

### 10.2 Known Versus Novel Semantic Obligations [DEFINITION]

Known semantic obligations are those represented in the abstraction language, closure laws, or canonical pattern base.

Novel semantic obligations are those that require domain-specific reasoning not yet represented mechanically.

Closure adequacy can reduce known-obligation failures. It cannot eliminate novel-obligation failures without extending the language, validator, or canonical pattern base.

### 10.3 Residual Irreducibility [DEFINITION]

Residual irreducibility is the remainder that persists after known structural, semantic, and operational obligations have been mechanically represented.

```text
ResidualIrreducibility(S, L, T)
=
Irreducibility remaining after closure validation, canonical-pattern validation,
and observability-preserving encapsulation.
```

The goal of abstraction is not to pretend this residual disappears. The goal is to localize it.

Residual irreducibility differs from existing complexity measures such as Kolmogorov complexity, MDL, McCabe complexity, or Halstead volume by being defined relative to a **closure-adequate representation**. It is not raw description length, path complexity, operator/operand volume, or graph complexity. It is what remains after all mechanizable obligations in a chosen abstraction language have been validated.

---

## 11. Intentional Encapsulation and Accidental Erasure

### 11.1 Intentional Encapsulation [DEFINITION]

Intentional encapsulation is lossy by design. It hides internal details because exposing them would be unnecessary, unstable, expensive, or harmful for the task.

Examples:

```text
API hides implementation details
CPU instruction hides microarchitectural execution
cell membrane hides biochemical microstate behind regulatory behavior
backend specification hides handler code behind commands and operation bindings
```

### 11.2 Accidental Erasure [DEFINITION]

Accidental erasure is lossy by accident. It occurs when information disappears because it was not captured, modeled, logged, traced, audited, validated, or preserved.

Examples:

```text
dropped logs
missing traces
undocumented architectural decisions
undeclared failure modes
missing audit trails
implicit security assumptions
stale canonical references
```

### 11.3 Difference [DERIVED from §11.1, §11.2, and §8.10]

```text
intentional encapsulation = managed hiding
accidental erasure        = unmanaged hiding
abstraction debt          = hidden obligation not represented in the contract
```

A successful abstraction hides implementation while preserving enough contract, validation, canonical reference, and observability for the task.

---

## 12. Operationalization

### 12.1 Specification Languages as Abstraction Operators [DEFINITION]

A specification language is an abstraction operator.

```text
Φ_L : S → Spec_L(S)
```

Where:

```text
S         = system or implementation domain
L         = specification language
Spec_L(S) = representation of S in language L
```

This mapping is selective. It exposes some structure and hides other structure.

### 12.2 Complexity Relocation [DERIVED from §6.3, §7.5–§7.10, and §8.2]

Abstraction does not eliminate complexity. It relocates complexity into:

```text
schemas
interfaces
contracts
closure laws
closure regimes
validators
generators
canonical pattern bases
observability requirements
error taxonomies
state machines
invariants
non-functional constraints
```

The abstraction is useful when the relocated complexity is easier to validate, reason about, generate from, or control under an explicit metric (§6.3).

### 12.3 Validation Stack as Operational Mapping [DEFINITION]

The five conceptual layers of closure adequacy (§8.2) can be implemented by a more granular validation stack.

| Conceptual layer | Possible operational mechanisms |
|---|---|
| Syntactic well-formedness | Grammar parser, JSON Schema, type checker |
| Local semantic validity | Shape constraints, field constraints, local validators |
| Global semantic closure | Cross-reference resolver, graph queries, invariant checks |
| Operational adequacy | Runtime error taxonomy, auth checks, consistency policy, migration checks, canonical pattern base |
| Observability adequacy | Logging contract, tracing contract, metrics contract, audit checks |

This resolves the apparent mismatch between a five-layer conceptual taxonomy and a six-or-more component validation stack. Validator components may be more granular than the conceptual layer they implement.

### 12.4 Amortization [CONJECTURE]

Closure-adequate abstraction is expensive to design. It may require a schema, closure laws, validation tooling, canonical pattern bases, observability requirements, and deployment checks.

This cost can amortize across repeated use:

```text
one-time cost:
  language + closure laws + validators + canonical pattern base

repeated benefit:
  each generated, validated, or reasoned-about instance becomes cheaper
```

A minimal falsifier is: after `k` repeated uses over a fixed domain, the measured per-instance cost under the abstraction does not decrease relative to direct lower-level reasoning under the chosen metric `m` (§6.3).

### 12.5 Good and Bad Abstractions [DERIVED from §8.2, §9.2, §10.1–§10.3, and §11]

A bad abstraction:

```text
hides implementation
reduces visible detail
does not expose obligations
does not validate cross-relations
does not preserve observability
misclassifies closed/open regions
relies on stale canonical patterns
fails unpredictably at runtime
```

A good abstraction:

```text
hides implementation
exposes task-relevant contract
declares failure modes
preserves observability
defines closure laws
declares closed-world and open-world regions
uses canonical patterns where appropriate
supports validation
makes generation, control, prediction, or explanation cheaper under explicit metrics
```

---

## 13. Case Study: Six-Axis Backend Specification Language

### 13.1 Why Six Axes?

The six-axis decomposition is a design partition, not a theorem of nature.

It is proposed because backend obligations cluster into six categories that are useful for generation and validation:

```text
D = Data model
    What exists? Entities, fields, identifiers, aggregates, references.

O = Operations
    What can happen? Commands, queries, events, subscriptions, sagas.

B = Behavior
    What must remain true? State machines, transitions, invariants, causal ordering.

I = Interface
    How is the system exposed? Transports, wire formats, operation bindings, errors, auth schemes.

X = Cross-cutting concerns
    What policies cut across operations and data? Authorization, tenancy, idempotency, concurrency, audit, PII, observability.

N = Non-functional constraints
    Under what runtime environment? Persistence, topology, scaling, configuration, health checks, backup, regions.
```

The claim is not that six is minimal or complete for all backend systems. The claim is weaker and operational:

```text
For backend specification tasks, these six axes provide a useful partition of obligations.
```

A future version could test this partition empirically by classifying defects or missing requirements against the axes and measuring residual unclassified obligations.

### 13.2 Backend Systems as High-Dimensional Aggregates

Backend systems are difficult to reason about because behavior is distributed across many implementation regions:

```text
routes
handlers
ORM models
SQL migrations
validators
auth middleware
event consumers
background jobs
configuration files
logging setup
tracing setup
retry mechanisms
deployment topology
health checks
rate limits
security policies
```

Correctness depends on non-local relations across these regions.

### 13.3 Worked Minimal Specification

A minimal backend specification can be shown with one entity, one aggregate, one command, one query, one event, one state machine, two operation bindings, one error envelope, and one observability contract. The full specification is 235 lines of YAML. It is not reproduced here. It is the reproducible appendix of this paper and lives in the repository beside it, together with the mutation runner and the recorded results (§14.4.1):

```text
file:     relativized-irreducibility-case-study/case-study.spec.yaml
sha256:   c29846c963c77f85c9d00e0d9169e9311eee515f0ba0927b6e0df5b716a6499f
size:     235 non-empty lines of specification under a three-line header comment
version:  framework_version 1.1.0, spec_version 0.1.0
```

The command that most of the §13.5 mutations target reads, verbatim:

```yaml
    SubmitOrder:
      target_aggregate: OrderAggregate
      effect:
        op: transition
        from_states: [Draft]
        to_state: Submitted
      command_schema:
        - name: order_id
          type: OrderId
          cardinality: "1"
      preconditions:
        - grammar: cel
          expression: "Order.total > 0"
      emits: [OrderSubmitted]
      success_result:
        kind: id_only
      errors: [not_found, stale_version, invalid_state]
      synthetic_errors:
        row_not_found: not_found
        stale_version: stale_version
```

This example is intentionally small. It is not presented as a production-ready specification. Its purpose is to show how the theory becomes operational, and the file rather than the page is what the validators ran on. This revision corrected the file on five points; §14.4.4 lists them.

### 13.4 Closure-Regime Declaration for the Example

The minimal backend example uses a mixed closure regime.

| Region | Regime | Rationale |
|---|---|---|
| `data_model.entities` | Closed | All entities relevant to the generated backend must be declared. |
| `data_model.aggregates` | Closed | Command targets and aggregate boundaries must resolve exactly. |
| `operations.commands` | Closed | Supported commands define the complete write surface. |
| `operations.queries` | Closed | Supported queries define the complete read surface. |
| `operations.events` | Closed | Emitted events must be declared and versioned. |
| `behavior.state_machines` | Closed | Lifecycle states and transitions must be complete for validation; every declared state must be reachable from the initial state. |
| `interface.operation_bindings` | Closed | Non-internal operations must have explicit exposure. |
| `interface.error_taxonomy` | Closed | Any emitted error must resolve to a declared error class. |
| `synthetic_errors` | Closed over known generator failure keys | `row_not_found`, `stale_version`, `dedup_conflict`, and `unsupported` are reserved known failure modes; additional keys require explicit declaration. |
| `cross_cutting.authorization` | Closed for declared operations | Every exposed command/query must have a policy or explicit exemption. |
| `cross_cutting.observability` | Closed for required telemetry fields | Required logs, metrics, and trace context must be declared; the metrics contract must name its naming convention. |
| `interface.auth_schemes.*.accepted_algorithms` | Closed for JWT and OIDC schemes | A bearer or OIDC scheme must pin the signature algorithms it accepts. |
| `cross_cutting.idempotency.key_source`, `dedup_window` | Closed when idempotency is enabled | An enabled idempotency policy must say where the key comes from and how long duplicates are remembered. |
| vendor metadata | Closed in schema 1.1.0 | The previous revision declared this open; the §14.4 run showed that schema 1.1.0 rejects an `x-vendor` object at the document root (`additionalProperties: false`). The declaration is corrected to the enforced regime. |
| plugin extensions | Closed in schema 1.1.0 | The previous revision declared this open; the §14.4 run showed that schema 1.1.0 rejects an `extensions` block at the document root. |
| custom observability exporters | Closed in schema 1.1.0 | The previous revision declared this open; the §14.4 run showed that schema 1.1.0 rejects an `exporters` key under `cross_cutting.observability`. |
| future transports | Open until bound | A transport may be declared without any operation binding; once an operation binding uses it, it becomes a closed obligation. Measured: a declared, unbound `grpc` transport is accepted (§14.4, E4). |

This declaration makes absence semantics explicit. If `SubmitOrder` omits `stale_version`, that is invalid because transition commands are in a closed region for known synthetic concurrency errors. If a vendor annotation is present, schema 1.1.0 rejects it: under this language version the example has no region in which non-semantic metadata can live.

The last four rows were the ones the previous revision declared open. Three of the four were rejected by the schema on the first run (§14.4, row 6). That is this paper's own FD_3 (§14.1): the declaration and the enforced regime had diverged. Falsifier 6 was then passed by shrinking the claim, not by changing the schema. The declaration was narrowed to match what the schema enforces. A falsifier that passes after the claim shrinks is legitimate only when the shrinkage is declared, and this paragraph is that declaration. The alternative, reopening the three regions with an `x-` prefixed pattern property, is a measurable cost that the framework says should be measured before it is paid (§9.3). This revision defers it and says so.

### 13.5 Validation Walkthrough

The §13.3 specification produces zero error-level findings from the three static validators of §14.4. The table shows the eight seeded mutations, the layer intended to catch each one, and the layer that caught it when the mutation was run (protocol in §14.4.1).

| Intended layer | Mutation (M1–M8) | Caught by, measured |
|---|---|---|
| Grammar/schema | M1: `success_status: "OK"`; status must be numeric. | Schema. The catalog engine's L10 evaluator also crashed on the non-integer value. |
| Local semantic validator | M2: `Money.min_length: 3` on a decimal type. | Schema: the primitive-type grammar forbids the key. No separate local-semantic validator was needed. |
| Cross-reference resolver | M3: `SubmitOrder.target_aggregate: MissingAggregate`. | Closure law L3, and catalog rule L3. |
| Closure-law validator | M4: `SubmitOrder` emits `OrderSubmitted`, and the event is not declared. | Closure law L14, and catalog rule L14. |
| Closed-world check | M5: `SubmitOrder`, a transition command, without `stale_version` in `errors`, `synthetic_errors`, and its binding. | Schema: `synthetic_errors.stale_version` is required for transition commands. |
| Canonical pattern base | M6: `invalid_state → 200`, an error class mapped to a success status. | **Nothing.** No validator fired. Recorded as a false acceptance in §14.4.3. |
| Observability contract | M7: `trace_id` removed from `logging.required_fields`. | Catalog rule OBS-001, error severity. |
| Runtime observation | M8: production emits `timeout`, absent from `error_taxonomy`; the specification is unchanged. | Not detectable statically, by construction. Caught by the runtime-observation check: observed error classes minus `error_taxonomy`. |

This walkthrough demonstrates the practical claim: one abstraction contract can be syntactically valid while still failing semantic closure, canonical-pattern alignment, or observability adequacy. It also shows the converse: one seeded canonical-pattern violation passes every static layer the language currently has.

### 13.6 Quantitative Mini-Measurement [EMPIRICAL]

This section reports a small, intentionally limited measurement so that the cost discussion is non-empty. It is not evidence of superiority; it is a worked example of how measurement is reported. The protocol, the fixed thresholds, and the full results are in §14.4.

Using the case-study specification file named in §13.3 as the artifact:

```text
spec lines, non-empty:                              235
seeded invalid mutations (§13.5):                     8
statically detectable by construction:                7
caught by a static validator:                         6 of 7
caught including runtime observation:                 7 of 8
false acceptance rate on seeded invalids:             1 / 8 = 12.5 %
error-level findings on the valid specification:      0  (schema, closure laws, 270-rule catalog)
warning-level findings on the valid specification:   26
```

The previous revision reported a catch rate of 8 / 8 for this table. That number was asserted from the intended layer of each mutation, not measured. The measured number is above.

A coarse equivalent hand-written backend slice for the same obligations would normally require at least the following artifacts:

```text
1 entity/model file
1 migration/schema file
1 command handler
1 query handler
1 route/controller file
1 error taxonomy/envelope module
1 authorization policy file
1 observability/logging middleware configuration
1 state-machine or transition guard module
```

This gives a minimal artifact-count comparison:

```text
six-axis specification artifact count: 1
representative hand-written backend artifact count: 9
artifact ratio: 1 : 9
```

This comparison is deliberately weak. It does not measure effort, maintainability, defect rate, or runtime correctness. It only shows that one explicit metric can be attached to the framework. Stronger empirical work would measure engineer-hours, defect-detection time, validator runtime, false acceptance rate, and false rejection rate across a benchmark set; §14.4 reports the last three for this one example.

### 13.7 Example Cost Metrics

For this backend case, future measurements could include:

```text
M1: minutes to locate an undeclared emitted event
M2: minutes to locate an operation missing an HTTP binding
M3: number of runtime errors absent from error_taxonomy per release
M4: number of closure-law violations per generated specification
M5: validator runtime per specification
M6: false rejection rate against valid hand-written examples
M7: false acceptance rate against seeded invalid examples
```

Three of these were measured for the §13.3 example in this revision (§14.4):

```text
M5: validator runtime per specification
    schema 3–4 ms; closure laws < 0.1 ms; 270-rule catalog ≈ 5 ms of evaluation
    (≈ 60 ms wall clock including interpreter start and catalog load)
M6: false rejection rate
    0 / 1 on the corrected specification, error level;
    3 / 4 on the held-out valid-extension suite
M7: false acceptance rate against seeded invalid examples
    1 / 8
```

A future empirical study could compare:

```text
Group A: engineers inspect implementation artifacts directly.
Group B: engineers inspect six-axis specs plus validator reports.
```

Until such measurements exist, broad claims about cost reduction remain [CONJECTURE].

### 13.8 Lessons from the Case Study

[DERIVED from §13.3–§13.7] The case study supports limited claims:

```text
1. Backend obligations can be relocated into a higher-level specification language.
2. Syntactic schema validity is weaker than closure adequacy.
3. Closed/open-world partitioning is necessary for extensible specifications.
4. Runtime errors must be represented or they become runtime escape.
5. Canonical patterns can reduce known semantic uncertainty.
6. Observability is part of abstraction quality.
7. A closure-regime declaration that is never executed against a validator is
   abstraction debt: the previous revision's example violated its own declaration
   twice and omitted three obligations its validators close (§14.4.4).
```

It does not prove that the six-axis language is complete, minimal, or superior in all contexts.

---

## 14. Failure Modes and Falsifiers

This section merges deterministic failure modes, boundary conditions, and falsification criteria into one place.

### 14.1 Deterministic Abstraction Failure Modes

Some failures are deterministic defects in the abstraction infrastructure itself.

| ID | Failure mode | Consequence | Required check |
|---|---|---|---|
| FD_1 | Contract inconsistency | No valid instance can satisfy the abstraction | Closure-law satisfiability check in a decidable fragment |
| FD_2 | Canonical staleness | Valid modern patterns are falsely rejected | Versioned canonical base + coverage tests |
| FD_3 | Closure-regime misclassification | Too closed rejects valid extensions; too open hides omissions | Explicit closed/open partition map + extension tests |
| FD_4 | Observability collapse | Failures cannot be debugged, audited, or controlled | Observability contract + runtime trace tests |
| FD_5 | Closure-law explosion | Validation system exceeds abstraction benefit | Measure abstraction cost vs direct reasoning cost |
| FD_6 | Runtime escape accumulation | Primitive promotion is premature | Runtime incident classification + contract update loop |

These are design or tooling failures, not stochastic model failures.

### 14.2 Boundary Conditions

The framework is weaker or inapplicable under several conditions.

| Boundary condition | Concrete examples | Effect on framework |
|---|---|---|
| No natural primitive | continuous fields, fluid mechanics, wave systems | Primitive selection becomes artificial or approximate. |
| Non-strict hierarchy | ecosystems, economies, holarchies, platform ecosystems | Abstraction must be represented as a graph, not a ladder. |
| Strong entanglement | quantum entanglement, tightly coupled distributed state, global optimization | Boundaries fail to preserve task-relevant behavior. |
| Open-world domain | plugin ecosystems, open ontologies, user-defined workflows | Omission is hard to distinguish from extensibility. |
| Canonical novelty | new business logic, emerging regulation, creative systems | Known-pattern bases have low coverage. |
| Over-abstraction | excessive schema layers, complex validators, brittle generators | Abstraction cost exceeds managed complexity. |
| Closure-law explosion | rule count grows faster than model size | Validation machinery grows faster than the complexity it manages. |
| Local validatability counterexample | small module with complete local type checks | Lower-level representation remains cheaper and task-complete. |

### 14.3 Conditions for Falsification

| Observation | Operational threshold | What it falsifies |
|---|---|---|
| Lower-level representation remains cheaper and task-complete under chosen metric | `Cost_m(L_spec) ≥ Cost_m(L_code)` across a pre-registered benchmark set | Emergence-pressure justification |
| Higher-level abstraction increases total reasoning or validation cost | Median time-to-diagnosis, validator time, or escaped-defect count worsens by more than agreed tolerance | Complexity-relocation benefit |
| Closure laws are unsatisfiable | Satisfiability procedure returns contradiction or no model in the declared fragment | Closure adequacy |
| Runtime behavior repeatedly escapes the contract | More than `N` undeclared runtime behaviors per release or more than `p%` of incidents unclassified by contract | Primitive promotion |
| Observability gaps prevent debugging, audit, or control | More than `p%` of incidents lack required trace/log/metric fields | Observability adequacy |
| Validation rules reject valid extension cases | False rejection rate exceeds agreed threshold on held-out valid extension suite | Boundary partition correctness |
| Open-world regions hide required obligations | Required obligation discovered post hoc in open-world region more than `N` times per review period | Closure-regime adequacy |
| Canonical pattern base rejects valid modern patterns | False rejection against updated canonical validation set exceeds agreed threshold | Canonical-pattern adequacy |
| Closure-law count grows faster than system complexity | Rule-count or validator-runtime growth exceeds pre-defined relation to spec size | Abstraction usefulness |
| Users or generators cannot interpret the exposed contract | Task completion or valid-generation rate falls below agreed benchmark | Contract interpretability |

The thresholds `N`, `p`, and tolerance bounds are domain parameters. They must be set before evaluation; otherwise the falsifiers remain rhetorical rather than operational. §14.4 sets them once for the six-axis case study and reports the result of each evaluation that the seeded example can support.

### 14.4 Instantiated Falsifiers: Six-Axis Case Study [EMPIRICAL]

§14.3 leaves `N`, `p`, and the tolerance bounds as domain parameters. This section sets them once for the six-axis case study and reports the result of running every falsifier that the §13.3 specification can support. The thresholds were fixed before the first run. Two runs are reported: the first against the previous revision's specification (Rev5 in §19.6), the second against the corrected file named in §13.3.

#### 14.4.1 Protocol

```text
artifact under test:
  case-study.spec.yaml, the file named by hash in §13.3, parsed to JSON

runner:
  run_falsifiers.py beside the specification; M1–M8, E1–E4, and the growth
  series are defined in it; results.json beside it is the recorded run from
  which every number in §13.6 and §14.4 is quoted

validators (the author's backend-specification toolchain, framework 1.1.0):
  V-schema   JSON Schema 2020-12, backend_spec.schema.v1.1.0
  V-closure  closure-law validator: laws L3–L18 evaluated as function-free
             checks over the finite parsed specification (the §8.9 fragment)
  V-catalog  rule catalog 1.1.0: 270 executable rules with error and warning
             severities, run by its rule engine
  V-runtime  runtime-observation check: observed error classes minus the keys
             of interface.error_taxonomy (used for M8 only)

seeded invalid set:
  the eight mutations of §13.5 (M1–M8), each applied to a fresh copy of the
  specification

held-out valid-extension suite (one case per region the previous §13.4 declared open):
  E1  vendor metadata: an x-vendor object at the document root
  E2  plugin extensions: an extensions.plugins list at the document root
  E3  custom observability exporter: cross_cutting.observability.exporters
  E4  future transport: interface.transports.grpc declared, bound to nothing

growth series (row 9):
  k ∈ {1, 2, 4, 8, 16} copies of the Order slice (identifier type, enumeration,
  entity, aggregate, command, query, event, state machine, invariant, bindings,
  policies; every name suffixed per copy); rule-engine wall time is the median
  of 5 runs; interpreter and catalog-load overhead is measured separately
  (median of 5 catalog-load-only runs) and subtracted to give evaluation time

acceptance rule:
  an artifact is rejected when V-schema or V-closure reports any error, or when
  V-catalog reports an error-level finding that the unmutated specification
  does not report
```

#### 14.4.2 Parameters and Results

| # | Falsifier (§14.3) | Parameter fixed for this case | Evaluable here | Measured | Verdict |
|---|---|---|---|---|---|
| 1 | Emergence-pressure justification | `m` = number of artifacts an engineer must open to see all six-axis obligations; falsified if the specification needs at least as many as the hand-written slice | Yes, coarsely | 1 specification artifact against 9 hand-written artifacts (§13.6) | Not falsified; weak metric |
| 2 | Complexity-relocation benefit | Tolerance: median time-to-diagnosis (M1, M2 of §13.7) may not worsen by more than 20 % against direct inspection; validator runtime per specification ≤ 1 000 ms | Runtime only | V-schema 3–4 ms; V-closure < 0.1 ms; V-catalog ≈ 60 ms wall clock, of which ≈ 56 ms is interpreter start and catalog load and ≈ 5 ms is evaluation | Runtime bound holds; diagnosis-time study not run |
| 3 | Closure adequacy | Fragment: L3–L18 as function-free checks over the finite parsed specification; falsified if the intended model (§13.3) fails any law or any error-level catalog rule | Yes | previous specification: 0 closure-law errors, 5 error-level catalog findings; corrected specification: 0 errors from all three validators | Previous example was not a model of its own regime; corrected example is |
| 4 | Primitive promotion | `N` = 0 undeclared runtime error classes per release; `p` = 5 % of incidents unclassified by the contract | Seeded observation only | One observed class, `timeout`, absent from `error_taxonomy` while every static validator accepts the specification | Falsifier is live: one class exceeds `N`; no real release measured |
| 5 | Observability adequacy | `p` = 5 % of incidents lacking any required log field | No; needs incident data | — | Unresolved |
| 6 | Boundary partition correctness | Held-out suite E1–E4; falsified if the false-rejection rate exceeds 0 | Yes | E1, E2, E3 rejected by V-schema (`additionalProperties: false` at every level of schema 1.1.0); E4 accepted with one warning; false-rejection rate 3 / 4 = 75 % | **Falsified.** Passed afterwards by narrowing the declaration to the enforced regime, not by changing the schema; the narrowing is declared in §13.4 |
| 7 | Closure-regime adequacy | `N` = 0 required obligations discovered post hoc in open regions per release | No; needs review history | After correction the only open region is unbound transports | Unresolved |
| 8 | Canonical-pattern adequacy | Falsified if V-catalog reports any error-level finding on the valid specification; warnings tolerated and reported | Yes | previous specification: 5 error-level findings (BEH-005, SEC-002, SEC-005, REL-001, OBS-005); corrected specification: 0 errors, 26 warnings | Fired against the previous specification; cleared after correction |
| 9 | Abstraction usefulness | Rule count must be constant in specification size; evaluation time must satisfy `t(k) ≤ 2·k·t(1)` for `k ≤ 16` | Yes | 270 rules at every `k`; `t(1)` = 4.9 ms, `t(16)` = 11.4 ms against a bound of 157 ms; every cloned specification passes all validators | Not falsified |
| 10 | Contract interpretability | Valid-generation rate ≥ 90 % on a pre-registered generation benchmark | No; needs generation runs | — | Unresolved |

Growth series in full:

```text
k    json lines   schema errs   closure errs   catalog errs   eval ms   eval ms / k
1         386          0             0              0           4.9        4.9
2         592          0             0              0           6.1        3.1
4        1004          0             0              0           5.3        1.3
8        1828          0             0              0           7.3        0.9
16       3476          0             0              0          11.4        0.7
```

Evaluation times this small are noisy: two earlier runs of the same series gave 3.0 ms and 1.9 ms at `k` = 1 and 10.3 ms and 8.4 ms at `k` = 16. The row-9 verdict does not depend on the noise, because the bound is 157 ms and the largest value observed in any run is 11.4 ms.

#### 14.4.3 Seeded-Invalid Results

```text
seeded invalid mutations:                     8
statically detectable by construction:        7   (M8 is runtime-only)
caught by a static validator:                 6 of 7
caught including runtime observation:         7 of 8
false acceptance rate on seeded invalids:     1 / 8 = 12.5 %
```

The one false acceptance is M6: `invalid_state → 200`, an error class mapped to a success status. No rule in catalog 1.1.0 fired, and neither the schema nor the closure laws constrain the status of an error mapping beyond its validity as an HTTP status. The obligation is known, an error class must map to a 4xx or 5xx status, but it is not mechanized. By §8.10 that is abstraction debt inside the validator itself. It is now declared rather than hidden.

Two further observations from the run:

```text
1. M1, a non-integer success_status, crashed the catalog engine's L10 evaluator.
   The engine assumes schema-valid input. Validators must run in layer order,
   schema first, or the closure layer reports crashes instead of findings.

2. M2, a string constraint on a decimal type, and M5, a transition command
   without stale_version, were both caught by the JSON Schema rather than by a
   separate local-semantic or closed-world validator. In framework 1.1.0 those
   two obligations are encoded in the grammar. The conceptual layers of §8.2 do
   not map one-to-one onto validator components (§12.3).
```

#### 14.4.4 What the First Run Found

The previous revision's §13.3 specification was presented as intended to satisfy every validation layer. Run against the validators the case study names, it produced five error-level findings:

```text
BEH-005  behavior.state_machines.order_lifecycle
         state Cancelled declared but unreachable from the initial state
SEC-002  operations.queries.GetOrder
         exposed query with no authorization policy
SEC-005  interface.auth_schemes.Bearer
         JWT scheme without accepted_algorithms
REL-001  cross_cutting.idempotency
         idempotency enabled without key_source and dedup_window
OBS-005  cross_cutting.observability.metrics
         no naming_convention
```

The first two violate regions that the previous §13.4 itself declared closed: state machines complete for validation, and a policy for every exposed command and query. The remaining three are obligations that catalog 1.1.0 closes and §13.4 did not list. All five are corrected in the §13.3 specification of this revision, and §13.4 now declares the three missing obligations.

This is the framework applied to its own worked example. A closure-regime declaration that is never executed against a validator is abstraction debt in the sense of §8.10: the declaration hid two violations of its own stated regime and three obligations it did not state.

#### 14.4.5 Summary

```text
falsifiers with parameters fixed:                     10 of 10
evaluable on the seeded example:                      rows 1, 3, 6, 8, 9; the runtime half of row 2
fired:                                                row 6, boundary partition correctness
fired against the previous specification, cleared:    rows 3 and 8
not falsified:                                        rows 1 and 9
unresolved, parameters stated, data not available:    rows 4, 5, 7, 10; the study half of row 2
```

The bar set in §14.3 was one instantiated falsifier. Five are instantiated and one fired. The four that remain unresolved need release, incident, review, or generation data that a seeded specification cannot supply. Their parameters are fixed here so that the first real release can be scored against them.

### 14.5 Internal Weaknesses of the Framework

The framework has internal weaknesses that should not be hidden:

```text
1. Residual complexity is not bounded in general (§3.A8).
2. Combine({Behavior(p_i)}) is intentionally uninterpreted (§7.3).
3. Amortization is conjectural until repeated-use measurements exist (§12.4).
4. The backend measurement is seeded and illustrative, not externally valid (§13.6, §14.4).
5. Closure-law decidability is only guaranteed in restricted fragments (§8.9).
6. The six-axis backend partition is a design partition, not a completeness theorem (§13.1).
7. Four of the ten falsifiers are unresolved on the seeded example because they
   need release, incident, review, or generation data (§14.4.5).
8. The validators used in §14.4 have at least one known unmechanized obligation,
   an error class mapped to a success status (§14.4.3), and one robustness
   defect, a rule evaluator that crashes on schema-invalid input.
```

These weaknesses define future work rather than invalidating the framework.

---

## 15. Relation to Existing Work

This framework is adjacent to several established traditions.

Simon’s work on near-decomposability explains why hierarchies appear in complex systems. Anderson’s “more is different” supports the distinction between structural decomposition and functional explanation. Algorithmic information theory (Kolmogorov 1965; Solomonoff 1964; Chaitin 1966) and MDL (Rissanen 1978) provide a vocabulary for description length, though this paper uses them operationally rather than claiming computable absolute complexity. Conant and Ashby’s regulator theorem supports the idea that control requires a task-adequate model. Floridi’s Levels of Abstraction supports the observer- and language-relative framing. Bar-Yam’s multiscale complexity supports scale-dependent description. Wimsatt’s work on limited beings and robustness supports modeling under bounded rationality.

The framework should also be read alongside formal-methods and programming-language work. Layered abstraction in software is canonically associated with Dijkstra’s THE multiprogramming system. Parnas’s information-hiding criterion is a direct ancestor of intentional encapsulation. Hoare’s data representation work and Liskov and Zilles’s data abstraction work clarify the relation between representation and abstract behavior. Liskov and Wing’s behavioral subtyping is relevant to operational adequacy because substitutability depends on behavior, not just structure. Reynolds’s work on abstraction and parametricity is relevant to intentional encapsulation and information hiding. Reiter is the direct closed-world-assumption reference; Codd is relevant as the relational database background against which closed-world database reasoning emerged. Type theory, model checking, Alloy/TLA+, SHACL, Datalog, and description logics are relevant to closure-law expressiveness and decidability. Spivak’s category-theoretic treatment of scientific modeling suggests a possible future formalization in which abstraction languages and primitive promotion are treated as structure-preserving mappings.

Cunningham’s technical debt metaphor is adjacent to abstraction debt. The distinction is that abstraction debt names the subset of future cost caused by hidden obligations behind an abstraction boundary. Spolsky’s leaky abstraction essay is adjacent to runtime escape. The distinction is that runtime escape is tied to a declared contract and task-relative failure: behavior has escaped because it matters for a task but is absent from the abstraction’s explicit obligations.

Software complexity metrics such as McCabe cyclomatic complexity and Halstead volume are adjacent to the cost framing in §6.3. They operate primarily at intra-module or implementation-artifact granularity, whereas the present framework focuses on cost across abstraction boundaries, closure laws, contracts, and observability surfaces.

---

## 16. References

Abiteboul, S., Hull, R., & Vianu, V. (1995). *Foundations of Databases*. Addison-Wesley.

Anderson, P. W. (1972). More is different: Broken symmetry and the nature of the hierarchical structure of science. *Science*, 177(4047), 393–396.

Bar-Yam, Y. (2004). *Making Things Work: Solving Complex Problems in a Complex World*. NECSI Knowledge Press.

Chaitin, G. J. (1966). On the length of programs for computing finite binary sequences. *Journal of the ACM*, 13(4), 547–569.

Codd, E. F. (1970). A relational model of data for large shared data banks. *Communications of the ACM*, 13(6), 377–387.

Conant, R. C., & Ashby, W. R. (1970). Every good regulator of a system must be a model of that system. *International Journal of Systems Science*, 1(2), 89–97.

Cunningham, W. (1992). The WyCash portfolio management system. In *Proceedings of OOPSLA 1992*.

Dantsin, E., Eiter, T., Gottlob, G., & Voronkov, A. (2001). Complexity and expressive power of logic programming. *ACM Computing Surveys*, 33(3), 374–425. https://doi.org/10.1145/502807.502810

de Luna e Silva, P. A. (2026a). *Silent Acceptance: LLM Output Error as an Architectural Invariant* (Version 2.0.0). Preprint. https://doi.org/10.5281/zenodo.19401266

de Luna e Silva, P. A. (2026b). *The Harness Gets a Name: How the unit of analysis in AI moved from the model to the model plus its execution layer*. Manuscript in preparation.

Dijkstra, E. W. (1968). The structure of the THE multiprogramming system. *Communications of the ACM*, 11(5), 341–346.

Floridi, L. (2008). The method of levels of abstraction. *Minds and Machines*, 18, 303–329.

Halstead, M. H. (1977). *Elements of Software Science*. Elsevier.

Hoare, C. A. R. (1972). Proof of correctness of data representations. *Acta Informatica*, 1, 271–281.

Kolmogorov, A. N. (1965). Three approaches to the quantitative definition of information. *Problems of Information Transmission*, 1(1), 1–7.

Liskov, B., & Wing, J. M. (1994). A behavioral notion of subtyping. *ACM Transactions on Programming Languages and Systems*, 16(6), 1811–1841.

Liskov, B., & Zilles, S. (1974). Programming with abstract data types. *ACM SIGPLAN Notices*, 9(4), 50–59.

McCabe, T. J. (1976). A complexity measure. *IEEE Transactions on Software Engineering*, SE-2(4), 308–320.

Parnas, D. L. (1972). On the criteria to be used in decomposing systems into modules. *Communications of the ACM*, 15(12), 1053–1058.

Reiter, R. (1978). On closed world data bases. In H. Gallaire & J. Minker (Eds.), *Logic and Data Bases* (pp. 55–76). Plenum Press.

Reynolds, J. C. (1983). Types, abstraction and parametric polymorphism. In *Information Processing 83* (pp. 513–523). North-Holland.

Rissanen, J. (1978). Modeling by shortest data description. *Automatica*, 14(5), 465–471.

Simon, H. A. (1962). The architecture of complexity. *Proceedings of the American Philosophical Society*, 106(6), 467–482.

Solomonoff, R. J. (1964). A formal theory of inductive inference. Part I. *Information and Control*, 7(1), 1–22.

Spivak, D. I. (2014). *Category Theory for the Sciences*. MIT Press.

Spolsky, J. (2002). The law of leaky abstractions. *Joel on Software*.

Wimsatt, W. C. (2007). *Re-Engineering Philosophy for Limited Beings: Piecewise Approximations to Reality*. Harvard University Press.

---

## 17. Implications

### 17.1 Systems Theory [CONJECTURE]

The framework suggests that hierarchies can be interpreted as stabilized abstraction cycles formed under emergence pressure. This is a conceptual claim, not a universal law of hierarchy formation.

### 17.2 Software Architecture [CONJECTURE]

The framework reframes architecture as closure management. Under the present framework, good architecture is not simply decomposition into components; it is also the design of boundaries, contracts, validation laws, closure regimes, observability surfaces, canonical patterns, and failure taxonomies that make components reliable as primitives.

This conjecture is refuted for a given architectural domain if practitioners can identify architectures recognized as good under pre-declared quality criteria that do not depend on closure management, explicit contracts, validation, observability, or controlled failure surfaces.

### 17.3 Artificial Intelligence [CONJECTURE]

AI systems are increasingly layered, agentic, tool-using, and difficult to inspect. The framework suggests that interpretability and control require closure-adequate abstraction languages.

Two documents by the same author instantiate this. An agent harness, the execution layer around a model, is a closure regime for the model in the sense of §9: the responsibilities it declares, verification among them, are its contract surface, and harness tampering, behavior that matters for the task and is absent from those declared obligations, is runtime escape in the sense of §8.11 (de Luna e Silva, 2026b). Silent acceptance, the passing of model output to a consumer with no declared verification boundary, is abstraction debt in the sense of §8.10: the obligation to verify, left undeclared behind the language-model-call primitive (de Luna e Silva, 2026a).

The relevant question is:

```text
Which abstraction language preserves the obligations needed for prediction, control, audit, alignment, or debugging?
```

This conjecture is refuted for a pre-registered class of AI systems if prediction, control, audit, alignment, or debugging performance is not improved by closure-adequate representations compared with lower-level or ad hoc representations under the chosen metric.

### 17.4 Specification and Generation [CONJECTURE]

For generative software systems, the relevant question is not merely whether code can be generated, but whether the input specification is closure-adequate.

A generator operating over an incomplete abstraction will produce hidden runtime escape. A generator operating over a closure-adequate abstraction can produce systems whose obligations are explicit, checkable, observable, and distinguishable from genuinely novel residuals. The verification boundary that de Luna e Silva (2026a) prescribes for any consumer of model output is the closure-regime declaration of §7.6 applied to one primitive: it states where the absence of verification counts as invalidity.

---

## 18. Conclusion

[DEFINITION] A system is not reducible or irreducible in isolation. It is reducible or irreducible relative to a language, observer, resource regime, and task. This shift reframes abstraction. Abstraction is not merely the hiding of detail; it is the relocation of complexity into a form that is more useful for a particular purpose.

[CONJECTURE] Emergence pressure accumulates when lower-level decomposition becomes too costly, lossy, opaque, or operationally irrelevant. Under such pressure, aggregates are encapsulated behind contracts and may become new primitives. But primitive promotion is not justified by encapsulation alone. A reliable primitive requires closure adequacy: explicit obligations, satisfiable laws, resolvable relations, declared failure modes, correct closed/open partitioning, canonical-pattern support where appropriate, validation procedures, and observability surfaces.

[EMPIRICAL] The six-axis backend case study demonstrates how this can be operationalized without overclaiming. It shows a design partition, a worked minimal specification, an explicit closure-regime declaration, a validation walkthrough, a seeded mini-measurement, measurable cost questions, and an instantiated falsifier table whose first run falsified the example's own closure-regime declaration and found five error-level findings in the worked specification (§14.4). It does not prove that the six-axis language is complete or universally superior.

The final claim is therefore:

> A successful abstraction does not eliminate irreducibility; it relocates it into a closure regime whose contracts, validation laws, canonical patterns, and observability surfaces distinguish known obligations from genuinely novel residuals.

[CONJECTURE] This avoids both naive reductionism and vague emergentism. It treats emergence as pressure, abstraction as engineered relocation, and irreducibility as a relation between systems and the languages through which limited observers attempt to understand, control, generate, and validate them.

This meta-positioning claim is weakened or refuted if the framework is shown either to collapse into ordinary reductionism, by making all higher-level descriptions eliminable without task-relative loss, or into vague emergentism, by failing to specify the language, observer, resource, and task conditions under which irreducibility is asserted.

---

## 19. Provenance and Verification Record

This section is the paper's own closure-regime declaration. It states what was checked, by what, what was not, and how the document was produced, so that a reader can decide which claims to rely on without taking any of them on trust.

### 19.1 What Was Verified, and How

| Claim or artifact | Verified by | Result |
|---|---|---|
| The case-study specification (§13.3) is well-formed under framework 1.1.0 | JSON Schema 2020-12, `backend_spec.schema.v1.1.0` | 0 errors |
| The specification satisfies closure laws L3–L18 | Closure-law validator, function-free checks in the §8.9 fragment | 0 errors |
| The specification satisfies every error-level rule of catalog 1.1.0 | Rule engine over the 270-rule catalog | 0 errors, 26 warnings |
| Mutation catch rates (§13.5, §13.6, §14.4.3) | The same three validators plus the runtime-observation check, over M1–M8 | 6 of 7 static; 7 of 8 with runtime observation |
| Boundary partition correctness (§14.4, row 6) | Schema over the extension suite E1–E4 | 3 of 4 rejected; falsified, then passed by a declared narrowing (§13.4) |
| Validator-runtime growth (§14.4, row 9) | Rule engine over `k` = 1 to 16 cloned slices | Bound holds with a wide margin; not falsified |
| Decidability of closure-law satisfiability (§8.9) | Citation: Abiteboul, Hull & Vianu (1995); Dantsin et al. (2001) | Known result restated, not re-proved |
| Reproducible appendix | `case-study.spec.yaml`, `run_falsifiers.py`, `results.json` beside this paper | Specification hash in §13.3; schema and catalog hashes in `results.json` |
| References added in this revision | DOI resolution over the network on 2026-09-04: Dantsin et al. (2001) via the Crossref record for its DOI; de Luna e Silva (2026a) via its Zenodo record | Title, authors, venue, and year matched for both. Abiteboul, Hull & Vianu (1995) is a book and was not resolved online. de Luna e Silva (2026b) is unpublished and has nothing to resolve |
| References carried over from earlier revisions | Not resolved over the network in this revision | Unverified beyond the author's reading |

Every number in §13.6 and §14.4 is quoted from `results.json`; none was estimated. Evaluation times of a few milliseconds vary between runs (§14.4.2); the verdicts do not.

### 19.2 What Remains Unresolved

```text
row 2   complexity-relocation benefit: the diagnosis-time study (Group A/B, §13.7)
        has not been run; only the runtime bound is measured
row 4   primitive promotion: the falsifier fired on a seeded observation only;
        no real release has been measured against N = 0
row 5   observability adequacy: no incident data
row 7   closure-regime adequacy: no review history
row 10  contract interpretability: no generation benchmark has been run
M6      an error class mapped to a success status is caught by no validator in
        catalog 1.1.0; the obligation is known and unmechanized
```

### 19.3 Review Notes

This revision responds to two review passes produced in September 2026 by the same AI-assisted process that drafted it (§19.4), not by an independent reviewer. Their recommendations were evaluated rather than adopted. The reproducible appendix was placed beside the paper rather than in the validators' repository, as one pass proposed, because the validators live in a separate codebase and the artifact that travels with the paper is the one whose hash the paper reports. The list of unresolved falsifiers keeps row 4, which that pass omitted, because a falsifier that has fired only on a seeded observation is not resolved. Peer review by people who did not take part in drafting has not happened.

### 19.4 Generation Disclosure

This document was drafted by the author with AI assistance. Revisions up to Rev5 come from the author's workflow. Rev6 was revised, measured, and tooled with Claude Fable 5.1 via Claude Code on 2026-09-03: it wrote the runner, executed the validators, corrected the specification, and rewrote the sections named in §19.6 under the author's direction. The author is responsible for every claim. The frontmatter disclaimer applies to the whole document.

### 19.5 Publication and Citation

A Zenodo DOI is to be assigned to this revision at publication. Until it exists, cite by title and revision. The two documents cited in §17.3 and §17.4 are expected to cite this paper back once the DOI resolves. That is the intended relation between them: this paper is the general case of which they are instances.

### 19.6 Revision History

```text
Rev4   the framework before the Rev5 corrections
Rev5   added the §13.6 mini-measurement; an explicit falsifier for the threshold
       conjecture (§6.4); source anchors on [DERIVED] claims; closure laws in
       Datalog-style notation (§8.5); expanded references; and the positioning of
       residual irreducibility against adjacent complexity measures (§10.3, §15)
Rev6   fixed the §14.3 falsifier parameters for the case study and ran them (§14.4);
       corrected the specification on five findings and the closure-regime
       declaration on three rows (§13.3, §13.4); replaced the asserted 8 / 8 catch
       rate with the measured one (§13.6); relabeled §8.9 from theorem to cited
       lemma; moved the specification to a reproducible appendix cited by hash;
       linked §17.3 and §17.4 to the silent-acceptance and harness documents;
       moved revision history and generation disclosure into this section;
       removed the revision label from the title and the epistemic tags from
       the abstract
```

