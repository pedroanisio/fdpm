# FDPM - Formal Documentation Primitive Model

## Why We Built This

We believe that knowledge — whether it lives in a formal proof, an architecture document, or a story — deserves better than scattered free-form text.

Today, the assumptions behind a theorem are buried in prose. The traits of a character are described differently every time they appear. The constraints on a software system exist only in one engineer's memory. When knowledge lacks structure, it drifts. Inconsistencies creep in silently. New contributors inherit context through folklore, not through verifiable artifacts. And when AI agents interact with this knowledge, they hallucinate confidently because no one made the ground truth explicit.

The cost is real: documentation that contradicts itself, stories that lose their thread, proofs that hide their weakest links, and systems that no one fully understands — including the people who built them.

---

## How We Approach This

- **Primitives over prose** — Every piece of knowledge is decomposed into typed, atomic units with a single source of truth. Define once, reference everywhere. If it can't be expressed as a primitive with validated fields, it isn't understood yet.

- **Relationships are explicit** — Connections between ideas are not implied by proximity in a document. They are typed, directed edges with cardinality, constraints, and validation. Hidden dependencies surface as first-class structure.

- **Domains are pluggable, not hardcoded** — Software architecture, narrative storytelling, and formal theorem analysis are all vocabularies over the same primitive model. New domains register their own types, relations, and validation rules without changing the framework.

- **Validation at every layer** — Structural integrity, field-level type checking, and domain-specific semantic rules run automatically. Consistency is enforced, not hoped for.

- **Generation from structure, not decoration on top** — Prose, diagrams, and documentation are projections of the underlying graph. Change a primitive, and every output that references it updates. The structure is the source of truth; the rendered output is a view.

- **Honest about limits** — When something is uncomputable, undetermined, or blocked, the system says so explicitly rather than papering over gaps. Confidence is measured, not assumed.

---

## What It Does

### Core Capabilities

- A universal primitive model where any knowledge domain can define its own vocabulary of types, relations, scopes, and validation rules
- A formal methodology for stress-testing theorems and impossibility results through structured decomposition, evaluation, and gap analysis
- NLP-powered compilation of structured narrative schemas into prose, with voice fingerprinting, sentiment analysis, and creative validation
- Multi-format rendering of the same underlying knowledge graph as markdown, JSON, Mermaid diagrams, or tables
- A REST API for all operations: creating primitives, defining relations, validating projects, rendering views, and compiling output

### What This Is Not

This project does **not**:
- Replace writing with automation — it structures the thinking behind writing; humans and LLMs still craft the prose
- Prove theorems — it maps where proofs are strong, where they are weak, and what breakthroughs would look like
- Enforce a single way to document — it provides the primitive model; each domain defines its own vocabulary and rules

---

## Who This Is For

- **Researchers** — Surface hidden assumptions in formal results; map the frontier between what is known and what is blocked
- **Writers** — Define characters, themes, and conflicts once; compile consistent prose through a validated pipeline
- **Architects** — Document software systems as typed, validated knowledge graphs instead of stale wiki pages
- **AI agents** — Operate on structured primitives with explicit constraints instead of inferring intent from ambiguous text
