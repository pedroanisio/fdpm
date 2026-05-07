---
title: "FDPM — Product Briefing"
date: 2026-05-06
status: "Working prototype. Core implemented and tested; agent runtime layer (operation dispatcher and operation log) still in build. No production customers yet."
audience: "Enterprise buyers"
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Opus 4.7 via Claude Code"
  date: "2026-05-06"
---

# FDPM

FDPM is the document workbench that lets enterprise AI agents draft, revise, and ship regulated artifacts without removing audit, override, or rollback. It is for compliance, quality, and engineering leaders who currently buy a tradeoff every time they buy AI: speed in exchange for control. The August 2, 2026 EU AI Act deadline and the April 2026 rescission of the U.S. model risk framework SR 11-7 have made that tradeoff visible, regulated, and unaffordable.

---

## The Problem

A medical device company drafts a 510(k) submission. A bank documents a new credit risk model. A regulated software vendor writes the technical file an EU notified body will review. The artifact has to be right — wrong puts a product off the market, a model out of production, a deal off the table. So the work goes to senior people, takes weeks, and gets reviewed by hand.

Then the AI tools arrive. Microsoft Copilot crossed 20 million paid seats in early 2026. Notion AI is in every knowledge worker's editor. They can draft these documents in minutes. The catch is in the contract: the audit trail is bolt-on, the output is unverified prose, and when something is wrong — a fabricated citation, a missing required clause, a section that contradicts the section above it — there is no system that catches it before it ships. The recent Microsoft Copilot fabrication that named a soccer match that never occurred is the office version of a problem that, in regulated documents, ends careers.

So enterprises do what they have always done with risky tools. They put a human in the loop. Senior reviewers read every AI-drafted page. The promised productivity gain disappears into the verification step. McKinsey reports that only 25% of enterprise AI initiatives deliver expected ROI; only 16% reach enterprise scale. Gartner estimates over 40% of agentic AI projects are at risk of cancellation by 2027. Eighty percent of organizations deploying agents do so without a mature governance model. Sixty-seven percent of executives believe their company has already had a data leak from an unsanctioned AI tool. Thirty-five percent admit they could not pull the plug on a rogue agent if they had to.

The status quo is two unacceptable choices: keep the AI out of regulated work and forfeit the productivity, or let it in and forfeit the controls regulators now require. The August 2, 2026 EU AI Act deadline for high-risk system providers makes the second choice illegal across Europe. SR 26-2, issued by U.S. banking regulators on April 17, 2026, deliberately excluded agentic AI from its scope — leaving the largest banks to build governance frameworks the regulator did not specify. The window for choosing has closed.

---

## What It Does

FDPM treats a regulated document not as a Word file but as a structured object an AI agent can edit safely. Five capabilities:

**Typed authoring.** Every section, claim, and reference in a document has a declared type — what it is, what it must contain, what it cannot say. An agent that writes a clinical study protocol cannot insert a marketing claim where a safety endpoint belongs. Microsoft Word and Notion accept any prose; FDPM accepts only the prose that fits the document's contract.

**Pre-validation.** Before any change is committed, FDPM checks the document against the rules of its type. If the agent skipped a required section, contradicted a previous claim, or cited a reference that does not exist, the change is rejected at the source — not flagged after a human review. The system, not the reviewer, catches the error.

**Replayable history.** Every change is logged as a structured operation. The history is the artifact. A reviewer or regulator asks "why does this document say X" and gets the exact sequence of agent actions, prompts, and decisions that produced it. There is no "the AI just wrote it." There is a traced authoring trajectory.

**Multiple views from one source.** The same document renders as a regulator-ready PDF, a navigable web page, a structured data export, or an audit log — all from the same underlying source. Teams stop maintaining four parallel versions that drift apart.

**Plugins that define the document type.** A plugin is not a renderer or a macro. It declares what a particular document — a 510(k) submission, an Architecture Decision Record, a model risk documentation package — actually is: the sections, the validators, the rendering targets. A medical device team that ships its plugin once gets every downstream agent and every downstream tool conforming to it automatically.

What changes for the buyer: the verification layer is in the system, not in the senior reviewer's calendar. The audit trail is the work, not a separate compliance artifact. The agent cannot ship a document that violates the document's own contract. The kill switch — pull a plugin, freeze a document, replay history to the last safe state — is built in.

---

## How It's Different

The market has four kinds of tools and none of them does this.

| Category | Example | What it does well | What it cannot do |
|---|---|---|---|
| Office AI assistant | Microsoft Copilot, Notion AI | Drafts fast, integrates with email and documents | No type system, no pre-validation, audit is a usage log not a content trail |
| Enterprise quality system | Veeva Vault Quality, Greenlight Guru | Workflow, approvals, e-signatures, change control | The content inside the workflow is unstructured Word and PDF; AI is a feature, not a substrate |
| Requirements management | IBM Engineering Lifecycle Management, DOORS | Strong typed structure, regulated-industry track record | Decades-old tooling; not designed for AI agents as authors; high cost of change |
| Agent framework | LangGraph, Claude Agent SDK, Palantir AIP | Builds the agent that drafts the document | Treats the document as a string output; governance is observability bolted on top |

The single thing FDPM does that no other category does: **the document itself is a typed, validated object the agent operates on, and every operation is captured, replayable, and reversible.** Agent frameworks govern the agent. Quality systems govern the workflow. FDPM governs the artifact.

That distinction matters at audit time. An agent framework can prove an agent followed a policy. A quality system can prove a document went through a review step. Only FDPM can prove the document, as it stands today, is structurally consistent with its own contract and identical to a deterministic replay of its own history.

A reasonable concern: a major cloud provider, Veeva, or Microsoft could build this. They could. The bet is that they will not build it for the structurally rejecting consumer — the regulator, the notified body, the model risk officer — because that buyer does not exist on their roadmap. FDPM is built for the audience that rejects on structural grounds, not stylistic grounds, and that audience is the one writing the rules in 2026.

---

## Market Context

The numbers that exist in 2026 are these.

The medical device quality management software market reached $1.21 billion in 2025, projected to $1.33 billion in 2026 and $2.45 billion by 2032 at a 10.6% compound annual growth rate. Including pharma, the eQMS market reaches $1.58 billion in 2025 with 12.2% projected growth through 2035. The AI model risk management market is $7.17 billion in 2025, growing to $8.33 billion in 2026 — a $1.16 billion year-over-year expansion at 16.2% CAGR. The broader AI governance market is forecast to grow from $0.89 billion in 2024 to $5.78 billion by 2029 at 45.3% CAGR.

The pricing window is the wedge. Veeva Vault Quality runs $50 to $200 per user per month, with median enterprise contracts around $200,000 per year and enterprise deals reaching $500,000 to $5 million per year. Greenlight Guru, the price-accessible alternative for medical device companies, raised prices in January 2026 — the change communicated as "package separation" — with reported customer impact of up to 100% increases without new features. Customers are migrating away as of April 2026.

Three forcing functions concentrate buyer attention in the next twelve months:

The EU AI Act becomes binding for high-risk AI system providers on August 2, 2026. Conformity assessments, technical documentation, CE marking, and EU database registration must be complete by that date. An attempt to delay the deadline through the Digital Omnibus failed in trilogue on April 28, 2026. Affected providers have approximately three months from the date of this briefing.

SR 26-2, issued by the U.S. Federal Reserve, OCC, and FDIC on April 17, 2026, replaced SR 11-7 — the model risk framework that governed banks for fifteen years. The new guidance is risk-based, scoped to banks above $30 billion in assets, and explicitly excludes generative and agentic AI from its scope. Banks deploying agents now operate in a governance gap the regulator declined to fill.

Snyk's ToxicSkills audit, published February 5, 2026, scanned 3,984 AI agent skills and found 1,467 malicious payloads, prompt injection in 36% of skills tested, and 76 confirmed malicious skills with active payloads. Daily skill submissions to public registries increased from under 50 in mid-January to over 500 by early February, a tenfold rise in three weeks. Trust in the agent supply chain became a buying criterion that quarter.

The Model Context Protocol — the standard FDPM uses to expose its capabilities to agents — reached 110 million SDK downloads per month by April 2026, sixteen months after launch. OpenAI, LangChain, and Pydantic AI all consume it as a dependency. Distribution is no longer a question.

---

## Business Model

The planned model is two-layer: an open-core substrate licensed permissively, and commercial vertical workflows built on it. Customers do not buy the substrate; they buy a workflow product — initially a regulated document workbench targeting medical device quality and EU AI Act conformity assessment teams. Pricing benchmarks against the existing market: Greenlight Guru's pre-2026 range of $25,000 to $35,000 per year sets a floor, Veeva's $200,000 median enterprise contract sets a near-term ceiling, and large pharma contracts at $1 million and above set the long-term ceiling.

The Model Context Protocol provides a distribution channel rather than a revenue channel. Agents inside enterprise buyers' existing AI tools — Codex, Claude, Copilot extensions, Gemini — discover and use FDPM capabilities directly, removing the integration cost that has kept previous regulated-document tools confined to specialist seats.

Revenue model details — per-seat versus per-document, deployment versus SaaS, support tiers — are not yet committed. The first design partner conversation will set them.

---

## Current Status and Roadmap

**Today (May 2026).** The core platform is implemented and tested. The schema engine, validation pipeline, replayable operation log architecture, plugin system, and rendering pipeline are working code with 986 passing tests. Two reference plugins — for pitch deck planning and for business deck planning — have been built end-to-end as proof that the plugin-defines-document-type pattern works. The bridge that converts existing schemas into FDPM plugins is at version 0.4.

**Not yet built.** The piece that makes FDPM usable by AI agents — the operation dispatcher, the live operation log that captures agent actions, and the agent-facing protocol surface — is the immediate next milestone. Until it ships, FDPM is a working document substrate, not an agent runtime. This is the v1 work.

**Next 90 days.** Operation dispatcher and log. One end-to-end agent workflow against the medical device quality plugin. The first design partner — most likely a Greenlight Guru migration candidate caught in the January pricing event — engaged.

**Months 3 to 9.** A second plugin for EU AI Act technical documentation, targeting providers facing the August 2 deadline. Three to five paid pilots in this segment is the year-one commercial goal.

**Months 9 to 18.** A third plugin for AI model risk documentation under the gap left by SR 26-2. Banks above $30 billion in assets needing to document agentic AI deployments without regulatory cover are the target.

The window for establishing a typed-authoring substrate before incumbents retrofit theirs is approximately twelve months. Microsoft will add governance to Copilot. Veeva will add AI to Vault. Neither will rebuild their underlying document model around typed objects in that timeframe — the architectural gap is too large. The window is real and is closing.

---

## Risks

**Regulatory shift.** The EU AI Act deadline could be extended despite the April 28 trilogue failure, or SR 26-2 could be amended to cover agentic AI directly. Either softens the urgency. Mitigation: the medical device track is regulated under EU MDR and FDA QSR, neither of which depends on AI Act timing.

**Incumbent retrofit.** Veeva, Microsoft, or a hyperscaler decides to rebuild the document layer around typed objects. They have the capital and the customer relationships. Mitigation: the product is a vertical workflow, not a horizontal substrate; vertical customer relationships are harder to commoditize than infrastructure.

**Single-source market signal.** The Greenlight Guru pricing event, the wedge that distinguishes the medical device play from a generic eQMS market entry, is currently single-sourced through OpenRegulatory. If the magnitude is overstated or has been reversed by the time of go-to-market, the wedge weakens. Mitigation: validate with three current or recently-departed Greenlight Guru customers before committing the medical device track. This is the highest-leverage open due-diligence item.

**Capability not yet proven.** The claim that agents working through a typed substrate ship better artifacts than agents working in unstructured prose has not been measured. A 50-instruction differential test against the existing plugins is the unrun experiment that would settle it. Without that result, every capability claim in this briefing is theoretically grounded but empirically untested. Mitigation: the test will run before paid pilots begin.

**Adoption friction.** Plugin authoring is more demanding than writing a Word template. The first design partner has to invest in defining their document type before they get value. Mitigation: ship two reference plugins (medical device quality, EU AI Act technical documentation) and offer plugin co-development for the first three customers.

**Supply chain.** The agent skill ecosystem is, per the Snyk audit, contaminated with malicious payloads at a 36% rate. Distributing FDPM plugins through the same channels carries reputational risk. Mitigation: signed plugin distribution and a curated registry from day one; community-contributed plugins gated behind explicit review.

**Team and capital.** The team profile, runway, and prior regulated-industry connections are not disclosed in this briefing's source material and are not assumed. The capital required to land the first three design partners and ship v1 is not estimated here.

---

## What to do next

Two questions decide whether FDPM is on your shortlist:

If you are a medical device quality leader, a model risk officer, or an EU AI Act compliance owner: schedule a 30-minute call. The product is not generally available, but the first design partner conversations are happening now. The cost is one hour of your team's time; the gain is shaping the plugin that will define how your category's documents are validated for the next decade.

If you are evaluating governance for AI agents drafting any regulated artifact: ask whichever vendor you are currently considering whether their audit trail is the document or a log next to it, and whether their system can reject a malformed change at the source or only flag it in review. The answers tell you whether you have a verification layer or a usage log. FDPM is the only product as of May 2026 designed to answer the first question with "the document."

---

## Appendix: Provenance Map (Internal Use Only)

```json
{
  "hook": [
    "static/refs/fdp-rationale-reconstruction.md#load-bearing-claim-8-verify-audit-override",
    "static/refs/fdp-positioning-strategy-analysis.md#major-decisions-fortress-frame",
    "web/federal-reserve-sr-26-2-april-2026",
    "web/holland-knight-eu-ai-act-august-2026"
  ],
  "the_problem": [
    "static/refs/fdp-positioning-strategy-analysis.md#section-2c-2026-pain-ranking",
    "web/microsoft-copilot-20m-paid-seats",
    "web/microsoft-copilot-hallucination-maccabi",
    "web/mckinsey-25-percent-roi",
    "web/gartner-40-percent-projects-cancellation",
    "web/governance-maturity-1-in-5",
    "web/exec-data-leak-67-percent",
    "web/cant-pull-plug-35-percent",
    "web/holland-knight-eu-ai-act-august-2026",
    "web/federal-reserve-sr-26-2-agentic-out-of-scope"
  ],
  "what_it_does": [
    "static/refs/fdp-rationale-reconstruction.md#load-bearing-claim-1-five-layer-integration",
    "static/refs/fdp-rationale-reconstruction.md#load-bearing-claim-2-plugin-as-schema-author",
    "static/refs/fdp-rationale-reconstruction.md#load-bearing-claim-3-op-log-as-artifact",
    "fdpm-cli/src/core",
    "fdpm-cli/src/mcp",
    "PURPOSE.md"
  ],
  "how_its_different": [
    "static/refs/fdp-positioning-strategy-analysis.md#readme-market-analysis-review",
    "static/refs/fdp-rationale-reconstruction.md#load-bearing-claim-7-substrate-not-workflow",
    "web/veeva-vault-pricing-2026",
    "web/ibm-elm-overview",
    "web/palantir-aip-overview",
    "web/langgraph-claude-agent-sdk-2026"
  ],
  "market_context": [
    "web/360iresearch-medical-device-qms-2026",
    "web/insightace-eqms-pharma-medtech",
    "web/globenewswire-ai-mrm-market-2026",
    "web/marketsandmarkets-ai-governance",
    "web/intuitionlabs-veeva-pricing-2026",
    "web/openregulatory-greenlight-guru-pricing-jan-2026",
    "web/holland-knight-eu-ai-act-august-2026",
    "web/digital-omnibus-trilogue-failure-april-2026",
    "web/federal-reserve-sr-26-2-april-2026",
    "web/snyk-toxicskills-feb-2026",
    "web/mcp-110m-downloads-monthly"
  ],
  "business_model": [
    "static/refs/fdp-rationale-reconstruction.md#decisions-substrate-position",
    "static/refs/fdp-positioning-strategy-analysis.md#major-decisions-web-saas-mcp-distribution",
    "web/openregulatory-greenlight-guru-pricing-jan-2026",
    "web/intuitionlabs-veeva-pricing-2026",
    "web/mcp-110m-downloads-monthly"
  ],
  "current_status_and_roadmap": [
    "fdpm-cli/package.json",
    "fdpm-cli/tests",
    "static/refs/fdp-rationale-reconstruction.md#decisions-v1-v2-v3-scope",
    "static/refs/fdp-rationale-reconstruction.md#section-5-deferred",
    "static/refs/fdp-positioning-strategy-analysis.md#actionable-insight-op-dispatcher-v1",
    "web/openregulatory-greenlight-guru-pricing-jan-2026",
    "web/holland-knight-eu-ai-act-august-2026",
    "web/federal-reserve-sr-26-2-april-2026"
  ],
  "risks": [
    "static/refs/fdp-positioning-strategy-analysis.md#section-3-unresolved-claims",
    "static/refs/fdp-positioning-strategy-analysis.md#unresolved-claim-2-greenlight-guru-single-sourced",
    "static/refs/fdp-positioning-strategy-analysis.md#unresolved-claim-1-cold-agent-eval-not-run",
    "static/refs/fdp-positioning-strategy-analysis.md#section-4a-explicit-unknowns-team-runway",
    "web/snyk-toxicskills-feb-2026",
    "web/digital-omnibus-trilogue-failure-april-2026",
    "web/federal-reserve-sr-26-2-april-2026"
  ],
  "what_to_do_next": [
    "static/refs/fdp-positioning-strategy-analysis.md#actionable-insight-pick-vertical-60-days",
    "static/refs/fdp-positioning-strategy-analysis.md#actionable-insight-design-partner",
    "static/refs/fdp-rationale-reconstruction.md#open-question-5-design-partner"
  ],
  "competitor_coverage_check": {
    "named_in_corpus": [
      "Veeva Vault Quality",
      "IBM Engineering Lifecycle Management",
      "Palantir AIP",
      "LangGraph",
      "Anthropic Claude Agent SDK",
      "Notion AI",
      "Microsoft Copilot",
      "Greenlight Guru"
    ],
    "all_named_in_briefing": true
  },
  "maturity_classification": {
    "source_label": "prototype with passing tests; agent runtime layer unbuilt; cold-agent eval not run",
    "briefing_label": "Working prototype. Core implemented and tested; agent runtime layer (operation dispatcher and operation log) still in build. No production customers yet.",
    "match": true
  }
}
```
