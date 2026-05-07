---
title: "FDP Conversation — Rationale Reconstruction"
date: 2026-05-05
status: synthesis
disclaimer: |
  No information within this document should be taken for granted. Any statement
  or premise not backed by a real logical definition or verifiable reference may
  be invalid, erroneous, or a hallucination. This is a reconstruction of a
  multi-turn conversation; it inherits the conversation's uncertainties — no
  cold-agent eval has been run, no design partner has been named, no market data
  is cited beyond public references already given in the original turns. Treat
  as analytical scaffolding, not ground truth.
---

# FDP Conversation — Rationale Reconstruction

The interaction moved through six phases. Each phase was driven by a different question, and each tightened or replaced a frame inherited from the previous phase. The thread is internally consistent: technical scoping forced architectural recalibration, which forced strategic positioning, which forced framing iteration, which forced product-form clarification, which set up the single unanswered question at the end (market-impact hypotheses).

## 1. The thread of reasoning

| Phase | Driving question | Going in | Coming out |
|---|---|---|---|
| 1. Protocol scoping | What can plugins expose over MCP? | "MCP exposes tools" | MCP exposes a wider primitive set — tools, resources, prompts as the primary surface, plus sampling, roots, elicitation. Skills-over-MCP is an active SEP carried via Resources. The real thesis is **plugins as agent-shaped vocabulary across all primitives**, not just tools. |
| 2. Architectural recalibration | Does the codebase support the thesis? | Path B verb registry needs to be designed from scratch | `cap:transformer` **is** the verb registry, half-built. CEL is already the validator and renderer language in production. The work is dispatcher + op log + MCP adapter — most other "missing" pieces are mechanical wrappers around things that exist. |
| 3. Strategic positioning | Game changer or business-as-usual? | "Game changer" framing | Neither. Sound infrastructure with optionality across three contingent paths (regulated-AI compliance, AI-authored specs, compound plugin network effect). Decision cliff at ~60 days; decision driven by a cold-agent eval that has not yet been run. |
| 4. Framing iteration | Is "compiler architecture for documents" the right frame? | "Compiler architecture for documents" | No. "Compiler" suppresses the agent feedback loop, the multi-projection model, and the op log. Reframe to "typed-graph runtime for documents." |
| 5. Chasm-breaking | Does the new frame defeat business-as-usual? | "Typed-graph runtime" | Almost. The frame still allows misclassification into the Sphinx-Sanity-MDX neighborhood. Load-bearing claim — *integration of five layers in one runtime, with plugins authoring the schema* — must lead, not be buried. The "without losing verify / audit / override" sentence emerged as the buyer-side wedge. |
| 6. Product form | Is FDP a workflow? An app? Who buys it? | Ambiguous between substrate and product | FDP is **substrate**. No end customer buys substrate. The product is one workflow built on FDP, with the substrate invisible to the buyer. Dentists / solo professionals are not the buyer; their vertical SaaS vendor might be. |

## 2. Load-bearing claims (accepted, survived pushback)

The rest of the strategy depends on these. If any breaks, the strategy breaks.

1. **The integration of five layers is the differentiator**, not any single layer. Typed vocabulary (Sanity, MDX), declarative validators (RDF/SHACL), multi-target rendering (Pandoc), stable cross-doc references (RDF), replayable op log (Datomic). The combination, plus **plugin-as-schema-author**, has no clean adjacency in document tooling.

2. **Plugin-as-schema-author is structurally different from plugin-as-rendering-extension.** Sphinx/Pandoc/MDX plugins extend rendering. FDP plugins define the type system the rendering enforces. Closer to "library defining a vocabulary in a programming language" than to "extension hooking a render pass."

3. **The op log treats the authoring trajectory as the artifact, of which the document is one projection.** Event-sourcing applied to authoring rather than state. None of the document-tooling adjacencies do this.

4. **CEL is already in production for read-side composition.** Excel-shaped BNF is rejected — it would create a third coexisting expression system alongside CEL and the render-DSL. The correct move is CEL extended with verb-emit helpers.

5. **`cap:transformer` is the verb registry pattern, half-implemented.** Dispatcher + op log are the v1 work. The MCP adapter is mostly mechanical wrapping: transformers → tools, renderers → resources, profiles → resources.

6. **Creation and Operation are the same machinery but different markets.** Creation buyers shop for productivity (time-to-draft); Operation buyers shop for governance (audit, drift, override). Lead with Creation in v1, expand to Operation as customers accumulate artifacts.

7. **FDP is substrate; the product sold is one workflow.** Non-negotiable for go-to-market. AWS started as one service inside Amazon retail, Stripe as payments-for-developers, Notion as a wiki. General capability earns the right to be visible only after one focused product wins.

8. **"Without losing verify / audit / override" is the strongest negative-space framing.** Existing AI integrations (Notion AI, Word copilots) force buyers to give up these three capabilities. FDP claims to keep them. If a design partner validates this pain, it is the wedge.

## 3. Refuted or refined claims

| Walked back | Replaced with | Why |
|---|---|---|
| "Game changer" | "Sound infrastructure with three contingent paths, contingent on focused execution against one" | No eval, no design partner, thin defensibility. Architecture supports the claim eventually, not now. |
| "Compiler architecture for documents" | "Typed-graph runtime for documents" | "Compiler" miscategorizes the agent feedback loop, suppresses the op log dimension, and primes batch-execution expectations. |
| "Excel-like BNF for `workbook.operations(X)`" | "CEL extended with verb-emit helpers" | Excel grammar is value-expression DSL; FDP needs transactionality, async, error channels. Three coexisting expression systems is worse than extending the one already in production. |
| "Plugins cannot emit operations or contribute MCP tools" | "Seven capability slots already exist; three map directly to MCP tools, two to MCP resources" | Reading the codebase. The protocol-exposure gap is mostly wrapping, not new design. |
| "v1 ships substrate + per-verb tools + one prompt + Skills layer + change notifications" | "v1 ships dispatcher + op log + one prompt (gate closed for community plugins) + MCP adapter" | Original scope overscoped against actual codebase. v2 absorbs discovery + Skills layer + notifications. |
| "Validators *prove* conformance" | "Validators *check / enforce* conformance" | "Prove" implies formal proofs (not shipping); CEL predicates check. The Snyk 36% flaw-rate baseline punishes overclaim. |
| "Capability protocol determines projections before rendering" | "Renderers consume documented primitive subsets and surface excluded primitives as findings" | The protocol is aspirational; the defensive filtering is what ships. |
| "Solo professionals (dentists) are buyers" | "Individuals buy domain-specific SaaS; FDP could power their vendor's product, invisibly" | Substrate is not sold to solo buyers. Buyer profile mismatch on every axis (evaluation cycle, pricing model, value-realization timeline). |
| "MCP server is the product" | "MCP server is a distribution channel; the product is web SaaS" | MCP-as-distribution ≠ MCP-as-business-model. Shipping just an MCP server reproduces the substrate-without-distribution failure. |
| "Prompt signing is post-v1, probably overkill" | "Either community-trust plugins cannot ship prompts in v1, or signing ships in v1 — pick one" | Render-to-user assumes users read prompt text, which empirically they don't. Worst combination is deferring signing while allowing community prompts. |
| "v1 defers prompts to v2" | "v1 ships one prompt and the prompt-registration API, so the cold-agent eval can run on v1" | If prompts close the cold-start gap and the cold-start gap is the lever, the lever cannot be deferred to v2. |

## 4. Open questions (load-bearing, undated)

These determine whether the strategy works. None has been answered yet.

1. **The cold-agent eval result.** Three-arm differential design (verbs only / verbs + discovery / verbs + discovery + prompts), 50 instructions in one domain plugin, prespecified pass criteria (terminal state matches goal, log replays cleanly, no out-of-scope destructive ops, verb-sequence within 2× human baseline). **Single highest-leverage measurement; not yet run.** Determines which contingent path is even viable.

2. **Which contingent path to commit to.** Path 1 (regulated-AI compliance), Path 2 (AI-authored specs), Path 3 (plugin network effect). Decision cliff at ~60 days. Decision drivers: design partner availability, team energy, survivable failure mode.

3. **Which vertical/process to wedge into.** Specs, ADRs, roadmaps, contracts, RFPs, regulatory submissions, clinical protocols, etc. The unanswered final question of the conversation. Driver: where the math works (artifact authoring/maintenance cost × error cost × audit need × buyer budget × tractable plugin scope).

4. **The plugin-version migration contract.** Op-kind versioning, replay across plugin upgrades, migration matrix. Operational hazard, not a v1 blocker, currently unsolved.

5. **The design partner.** None named in the conversation. Validating "verify / audit / override" against a real buyer pain is the highest-leverage non-engineering step, and it precedes further architectural commitment.

## 5. Decisions made vs decisions deferred

**Made:**
- Substrate position; product is one workflow.
- Lead with Creation buyer pain in v1; expand to Operation later.
- v1 scope: dispatcher + op log + one prompt (community-prompt gate closed) + MCP adapter exposing transformers as tools, renderers as resources, profiles as resources.
- v2 scope: discovery tools (`list_verbs`, `describe_verb`, `applicable_operations`) + Skills-shaped progressive-disclosure layer + change notifications + remaining transformers wrapped.
- v3 scope: CEL extended with verb-emit helpers (no new DSL); ship source functions + FILTER + LET; defer MAP, FOR_EACH, LAMBDA.
- Drop "game changer" and "compiler" framings externally.
- Web SaaS as primary product surface; MCP integration as distribution; editor integrations realistic for developer-focused workflows; skill marketplaces as marketing surface.

**Deferred:**
- Plugin signing infrastructure (v2, contingent on opening community-prompt gate).
- Plugin-version migration contract.
- Skills-over-MCP migration to SEP-2640 (design v2 to be one metadata change away).
- Compound-orchestration prompts (Path 3, lower probability).
- Vertical commitment.
- Design partner outreach.
- Cold-agent eval execution.

## 6. The unanswered question — market-impact hypotheses

The final turn asked: *which processes / markets would gain the most concrete dollar impact from adopting FDP, and can we extrapolate?* The prior phases set this up but did not resolve it. The framework follows from the load-bearing claims:

A process is a strong adoption candidate iff it scores high on **all five** dimensions:

| Dimension | What to look for |
|---|---|
| Authoring / maintenance cost | High-effort, high-frequency artifacts. Senior labor, multi-week cycles. |
| Error cost (fluency hazard) | Fluent-but-wrong outputs cause material downstream harm — rework, regulatory penalty, contract dispute, safety incident. |
| Audit / replay / override need | A reviewer or regulator needs to reconstruct *why* a claim is in the artifact, not just *that* it is. Existing tools don't serve this. |
| Buyer budget | A budget line exists for this work today (legal-tech, GRC, regulatory affairs, technical writing, product ops). |
| Plugin tractability | Domain has a closed-enough vocabulary that one plugin (~50 primitive types, ~100 validators) covers 80% of cases. |

**Candidate verticals to score** (none yet evaluated against the framework):

- Regulatory submissions (FDA 510(k), EMA dossiers, EU AI Act conformity assessments, SEC filings, ESG disclosures)
- Clinical study protocols and case report forms
- ADR / architecture spec systems for engineering organisations
- API specifications (OpenAPI, AsyncAPI) where the spec drives implementation, SDKs, and docs
- Product requirement docs in regulated software (medical devices, defense, finance)
- Contract families where defined-term consistency matters (loan docs, M&A, procurement)
- RFP responses where compliance-matrix accuracy is graded
- Standards-body specifications (IETF RFCs, W3C, IEEE)
- Audit work papers
- Patent applications

**Extrapolation rule (hypothesis):** the highest-impact verticals are those where (a) the artifact is high-stakes enough that human authoring is already expensive and slow, and (b) the consumer of the artifact (regulator, counterparty, downstream system) can reject it on **structural** grounds, not just stylistic ones. The structural-rejection property is what makes "validators caught the error before it shipped" worth real money — it is also the property that disqualifies most prose-heavy work (blogs, marketing) from the FDP value claim.

**The next concrete step** to actually answer the question: score each candidate vertical on the five dimensions, identify ≤ 3 verticals scoring high on all five, and for each, estimate one specific process where adopting FDP would change a measurable cost (cycle time, rework rate, regulatory finding rate, dispute rate). Those estimates feed the design-partner conversation. Without them, the path commitment in Section 4 is decided on energy and availability rather than expected value — which is the failure mode the conversation has been trying to avoid throughout.

This scoring is the work that should precede further architectural commitments.

## Appendix — observations about the conversation itself

Three patterns worth noting because they affect how to use this reconstruction:

1. **Each phase walked back the previous phase's frame.** "Tools" → "all primitives" → "verb registry exists" → "not game changer" → "not compiler" → "substrate not workflow." This is the right direction (frames tighten), but it means earlier framings still circulate in any prior documents and need to be retired explicitly when the architecture spec is updated.

2. **The codebase reading was the most consequential turn.** It collapsed an estimated several months of design work and exposed that "Excel BNF" was solving a problem CEL+helper-set already solved. The lesson: speculative architecture should be tested against the existing codebase before scope is committed.

3. **The chasm has not been broken — it has been mapped.** The conversation produced a sharper frame, a tighter v1 plan, and a cleaner buyer-side sentence. None of those is a chasm crossing. The chasm is crossed by (a) the cold-agent eval producing a number that justifies the integration claim, and (b) a design partner saying "this is my problem" against the verify/audit/override sentence. Both are external validations the conversation cannot supply.
