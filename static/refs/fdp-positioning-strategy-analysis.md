---
title: Conversation Analysis — FDP Positioning & Strategy
source: current session (with pre-compaction transcript at /mnt/transcripts/2026-05-05-14-35-51-fdp-positioning-strategy.txt)
generated: 2026-05-05
generator: conversation-analysis skill (LLM-produced)
disclaimer: |
  This report is reconstructed from partial context by an LLM. No statement,
  classification, premise, or inference within should be taken for granted.
  Any claim not backed by a real logical definition or verifiable reference
  may be invalid, erroneous, or hallucinated. Verify against the original
  source material and external evidence before acting on any insight or
  follow-up listed here. The Fact-vs-Speculation classification reflects how
  claims appeared **inside the conversation** — it does not validate them
  against the world.
---

# Conversation Analysis — FDP Positioning & Strategy

## 0. Scope and method

- **Source analyzed:** Current session (post-compaction turns) plus the pre-compaction transcript at `/mnt/transcripts/2026-05-05-14-35-51-fdp-positioning-strategy.txt` (1,725 lines / ~510 KB).
- **Coverage:** Partial — the pre-compaction transcript was sampled by spot-check (not read line-by-line) against the in-context compaction summary, which appears comprehensive on cross-check. Risk that some pre-compaction sub-claims are missed is non-zero.
- **Participants:** User (FDP architect, owner of fdpm-cli and the plugin set) + assistant (Claude).
- **Date range / session length:** Single session, May 5, 2026, spanning approximately 9 hours of dialog from MCP-plugins question through plugin-set review.
- **Method note:** Assertions are extracted from the source as stated; classification reflects the form of each claim, not its truth value.

## 1. Topic Map

- **MCP + plugins + game-changer thesis (opening)**
  - MCP three primitives (tools, resources, prompts) plus sampling, roots, elicitation
  - SEP-2076 / SEP-2640 Skills extension status
  - Codex CLI v0.117.0 plugin = skill + MCP server + connector bundle
  - Excel BNF for `workbook.operations(X)` — proposed by user
  - ↦ Transition: assistant pushed back on Excel BNF; recommended CEL + helpers based on existing FDP infrastructure
  - ◆ Decision: drop Excel-BNF-as-third-DSL; use CEL extended with verb-emit helpers
- **Path A (verb extensibility) + Path B (MCP exposure) thread**
  - 48-verb catalog cold-start problem
  - Trust-tier mechanics for community plugins
  - v1→v4 staging with kill-criteria
  - 50-instruction cold-agent eval as falsifiable test
  - ↦ Transition: user shared full plugin codebase
- **Plugin codebase review and recalibration**
  - Eight capability slots already shipping (cap:profile, renderer, validator, expr-helper, transformer, importer, exporter, lifecycle-hook)
  - cap:transformer = verb registry in disguise (signature: input→Op[] envelope)
  - CEL + render-DSL already provide expression layer
  - ◆ Decision: MCP mapping is mostly mechanical; real gaps are op dispatcher + op log + prompt/skill registration + MCP adapter
- **Game-changer assessment**
  - ◆ Verdict: not a game changer as it stands; three contingent paths (PALS-LAW compliance, AI-authored spec category, compound-verb network effect)
  - ◆ Decision: run cold-agent eval before external positioning; pick path within 60 days; commit max 12 months
- **Frame iteration sequence (multi-step)**
  - "Compiler architecture for documents" — proposed by user
  - ↦ Transition: assistant identified frame leaks (compiler misses agent loop and op log)
  - "Typed-graph runtime" — counter-proposal
  - ↦ Transition: user asked if typed-graph-runtime frame was business-as-usual
  - Adjacency test: Sphinx, Pandoc, RDF/SHACL/SPARQL, Datomic/XTDB, TypeDB, Sanity/Contentful, MDX+Contentlayer, event-sourced systems
  - "AI as peer producer of structured artifacts" test sentence
  - Sentence expansion: verify / audit / override as the load-bearing concepts
  - User identified Creation mode + Operation mode share pre-validation property
  - ◆ Decision: fortress frame is the load-bearing insight; AI cannot be wrong inside the system, only outside
- **Business pain reality check**
  - Three live 2026 pains: AI ROI, human-in-the-loop tax, agent governance
  - Fortress frame answers pains 2 + 3, not pain 1
  - ◆ Decision (provisional): recommend Option 2 (vertical wedge with substrate hidden); Option 3 (regulated vertical) as alternate
- **Direction-finding via savings hypotheses**
  - Five savings hypotheses with dollar ranges (regulatory submissions, SEC filings, eng specs, RFPs, clinical protocols)
  - Pattern extrapolation (encodability + consequence + multi-projection + AI-trust gap)
  - Additional candidates: patent prosecution, insurance underwriting, construction permits, aerospace certification, grant applications
- **Taxonomy proposal**
  - User outlined initial axes (information flow A→B→C, paper-vs-system, solo+trust)
  - Assistant proposed 8 axes (encodability, error consequence, multi-projection, cross-reference, lifecycle, authorship configuration, validation locus×latency, provenance demand)
  - ◆ Decision: scoring 5 known processes against the 8 axes is the next operational test
- **250-plugin file review**
  - First pass: cluster analysis (Citation/Evidence dominant)
  - Second pass (after user pushback): schema-validated S-tier count is 63, not 49 markdown narrative claimed
  - ↦ Transition: user said "you did not read the plugins in full"
  - ◆ Correction: drift between markdown narrative and TS instance is itself evidence the FDP validation pattern works; assistant's prior cluster claims were undercounted
- **README/market-analysis review**
  - Veeva, IBM ELM, Palantir AIP, LangGraph, Anthropic Skills as competitive context
  - Greenlight Guru January 2026 pricing event as wedge trigger
  - SR 26-02 (April 17, 2026) rescission of SR 11-7 as governance window
  - ◆ Recommendation surfaced in document: Play B (medtech eQMS) + Play G (AI governance)

◆ **Major decisions reached in conversation:**
- Drop Excel BNF as third DSL; use CEL with verb-emit helpers
- v1 scope = op dispatcher + op log + one prompt + MCP adapter (smaller than originally framed)
- Run cold-agent eval before external positioning
- Use fortress frame as technical north star; translate to vertical-pain language for buyers
- Lead with Creation mode in v1, expand to Operation mode as customers mature
- FDP is substrate, not workflow; web-SaaS surface for most viable workflows; MCP integration is distribution channel, not product
- Anchor on Play B (medtech eQMS) per README recommendation; pursue Play G (AI governance) in parallel rather than sequential

◆ **Decisions explicitly NOT reached:**
- Which specific vertical (Option 2 sub-candidates 2A specs / 2B ADRs / 2C roadmaps / 2D RFPs)
- Whether Option 2 or Option 3 is the right path
- Named first design partner

## 2. Fact vs. Speculation

### 2a. Empirical claims (with evidence)

> **MCP three primitives.** MCP servers expose tools, resources, and prompts as the three primary host-visible primitives, plus sampling, roots, and elicitation as governance/auxiliary capabilities. *(Anchor: assistant turn 1, after web search.)*
> Verification: `verified-in-source`. Web search results from modelcontextprotocol.io and SEP discussions cited inline.

> **SEP-2076 / SEP-2640 Skills extension status.** SEP-2076 ("Agent Skills as a First-Class MCP Primitive") was filed; the working group converged on SEP-2640 (Resources-based Skills Extension). David Soria Parra confirmed at MCP Dev Summit April 2026 that "skills over MCP is shipping as an extension in the next few weeks." *(Anchor: assistant turn 1, citing modelcontextprotocol PR #2076 and blog.modelcontextprotocol.io.)*
> Verification: `verified-in-source`. URLs and PR number quoted in transcript.

> **Codex CLI v0.117.0 plugin model.** Released March 26, 2026. A Codex plugin is one bundle containing SKILL.md + MCP servers (`.mcp.json`) + app connectors (`.app.json`), governed by a single `plugin.json` manifest. *(Anchor: assistant turn 1.)*
> Verification: `verified-in-source` (cited via web search). Specific version number and release date asserted.

> **Snyk ToxicSkills audit.** Published February 2026. 1,467 malicious payloads across 3,984 scanned skills, 36% flaw rate, 76 confirmed malicious skills with active payloads. *(Anchor: assistant turn 1, cited via Obot blog April 28, 2026.)*
> Verification: `verified-in-source`. Numeric claims cited; original Snyk publication not directly read in conversation.

> **MCP SDK downloads.** 110 million SDK downloads per month as of David Soria Parra's April 2026 MCP Dev Summit keynote. *(Anchor: assistant turn 1.)*
> Verification: `verified-in-source` (cited via the Obot blog post).

> **Plugin S-tier count drift.** The markdown narrative `fdpm-250-plugins.md` claims S-tier = 49 entries (line 56 of the markdown). The schema-validated TypeScript instance contains 63 S-tier entries when parsed. *(Anchor: assistant turn after "you did not read the plugins in full"; verified by direct grep of the uploaded `plugins_instance.ts`.)*
> Verification: `verified-in-source`. Counted by parser script run in conversation.

> **Plugin file actual entry count.** Markdown header claims 250 entries; the TS instance reports 267 actual rows across nine sections. The schema flags this discrepancy via `superRefine`. *(Anchor: same turn; verified by file inspection.)*
> Verification: `verified-in-source`. Numbers from the uploaded instance file.

> **Cross-reference integrity defects in markdown.** Several entries in `fdpm-250-plugins.md` carry numeric `#NN` cross-references that point at the wrong target by display number (e.g., `fdpm.cve-triage` references `#158` but `#158` is actually `fdpm.roam-json-import`; the CVE-feed importer is `#174`). The TS instance corrects to semantic intent and flags the discrepancy in `notes` fields. *(Anchor: same turn; verified by reading the instance file.)*
> Verification: `verified-in-source`.

> **`kind` discriminator audit reduction.** A pre-existing 105-entry inventory of `concept-design/schemas` was reduced to 21 plugin entries after applying the `kind` discriminator (utility, barrel, demo, data, plugin), revealing ~80% of original entries were not plugins. The README explicitly states this stopped 846 of 1038 unified entries from being mis-tagged with stub `cap:profile` values. *(Anchor: README lines 100-103.)*
> Verification: `verified-in-source`.

### 2b. Logical inferences

> **Citation/evidence cluster dominance follows from S-tier classification.** Given the schema-validated 63 S-tier entries and the assistant's regex-based clustering, Citation/Evidence/Provenance is the largest single cluster (17 entries / 27%). Combined with adjacent Compliance/Audit (8 entries), the evidence-pattern bundle is 25/63 ≈ 40% of S-tier. *(Anchor: assistant turn after "you did not read the plugins in full".)*
> Verification: `verified-in-source` for the count; the inference that this dominance reflects FDP's deepest architectural fit rather than classifier bias is partly speculative — the assistant flagged "my regex classifier put threat-modeling and compliance-controls into the Citation cluster because they involve 'evidence,' that's not really citation work."
> Note: the inference depends on cluster boundaries being principled rather than fitted to the conclusion. Some entries genuinely span clusters (compliance-controls, threat-modeling) and reasonable alternative classifications would shift the percentages.

> **MCP capability mapping is mechanical, not architectural.** Given that cap:transformer signatures already match Op envelopes, cap:renderer outputs map to MCP Resources, and cap:importer/exporter inputs/outputs are typed, exposing FDP over MCP is wrapping work, not redesign. *(Anchor: codebase review turn.)*
> Verification: `verified-in-source` against the uploaded plugin code.

> **Substrate vs. workflow distinction implies vertical-product wedge.** Premise: substrates are sold to platform buyers or hidden inside workflow products; workflows are sold to functional buyers. Premise: FDP is substrate. Conclusion: end customers buy workflow products built on FDP, not FDP itself. *(Anchor: substrate-vs-workflow turn.)*
> Verification: `plausible-unverified`. The two premises are stated; the inference structure is sound; whether substrates "never" sell directly is an empirical claim with counter-examples (Snowflake, Databricks) that were not discussed.

> **Fortress frame survives the "Cursor with structured outputs" objection.** Premise: Cursor structured outputs validate at the model level. Premise: FDP validates at the system level. Conclusion: FDP catches errors Cursor cannot, regardless of model behavior. *(Anchor: fortress-frame turn.)*
> Verification: `plausible-unverified`. Inference is sound conditional on the system-level validation actually executing on every op (which depends on the unbuilt op dispatcher).

### 2c. Assumptions / hypotheticals

> **Cold-agent eval first-try success rate priors.** Assistant asserted "no eval data, prior probability 15-25% for capability step-change." *(Anchor: game-changer assessment turn.)*
> Verification: `unverifiable-from-source`. Numbers are intuition pumps without methodology.

> **Path probability estimates** (Path 1 ~20-25%, Path 2 ~15-20%, Path 3 ~10-15%; joint probability "40-50% one path lands"). *(Anchor: game-changer turn.)*
> Verification: `unverifiable-from-source`. Stated as estimates with no model behind them.

> **Greenlight Guru pricing event.** README cites "+100% pricing increase reported for 01/2026 (package separation)" via a single OpenRegulatory source. *(Anchor: README, lines 1226 + 1552.)*
> Verification: `unverifiable-from-source`. README explicitly admits single-sourcing in section 9.

> **2026 enterprise AI pain ranking.** Assistant asserted three live pains (AI ROI not delivering / human-in-the-loop tax / ungoverned agent authority) ordered with "AI ROI is the loudest." *(Anchor: business-pain reality check turn.)*
> Verification: `plausible-unverified`. Cites Gartner/McKinsey/BCG indirectly without specific reports.

> **Per-customer savings figures.** $500K-$3M for pharma submissions, $200K-$1M for SEC filings, $300K-$2M for engineering specs at 500-engineer org, $50K-$300K for RFPs, $100K-$500K for clinical protocol amendments. *(Anchor: savings-hypotheses turn.)*
> Verification: `unverifiable-from-source`. Assistant's framing was explicit: "my best estimates assembled from common industry benchmarks. They're directionally right but not precise. Treat them as hypotheses to validate with a customer, not facts."

> **Five additional vertical candidates** (patent prosecution, insurance underwriting, construction permits, aerospace certification, grant applications). *(Anchor: extrapolation turn.)*
> Verification: `unverifiable-from-source`. Pattern-matched against the four-property template; not validated.

### 2d. Opinions / preferences / value judgments

> **"Game changer" is the wrong external framing regardless of path.** *(Anchor: assistant turn.)*
> Note: assistant's view, repeated several times.

> **"Agentic Excel" framing is leakage.** The Excel-as-spreadsheet analogy primes buyers to expect spreadsheet-grade looseness, which is the opposite of FDP's value. *(Anchor: README review turn.)*
> Note: assistant's view; user has not yet weighed in.

> **Open-core distribution is the right initial model.** *(Anchor: README, line 1482.)*
> Note: README author's view.

> **Reading typed instance is more reliable than reading the markdown narrative.** *(Anchor: "you did not read the plugins" correction turn.)*
> Note: assistant's view, supported by the count drift evidence in 2a.

## 3. Unresolved Claims

| # | Claim (paraphrased) | Anchor | Why unresolved | Impact if wrong | Verification path |
|---|---|---|---|---|---|
| 1 | Cold-agent first-try success will improve materially when prompts/skills layer is added (the three-arm differential hypothesis) | Path B/v1 turn; restated multiple times | No eval has run; entire game-changer thesis depends on this lever | **High** — if false, the integrated thesis collapses to "well-built infrastructure with no demonstrated capability step-change," and Paths 1/3 (regulatory + ecosystem) become the only viable outcomes | Run the 50-instruction differential eval (verbs only / + discovery / + prompts) against current shipped capabilities |
| 2 | Greenlight Guru January 2026 pricing event is real and is creating a refugee pool | README line 1226, single OpenRegulatory source | Single-sourced; no direct customer confirmation | **High** — Play B's "concrete trigger event" rationale collapses if the pricing event is exaggerated, mis-dated, or already reversed | Talk to 3 actual Greenlight Guru customers within 30 days |
| 3 | Buyers in the medtech eQMS segment value FDP's pre-validation enough to switch from incumbents | Play B recommendation | Architectural fit established, willingness-to-pay not | **High** — entire wedge sale is contingent on this | Sign one design partner; run the operational test ("could you have caught these errors WITHOUT FDP tooling?") |
| 4 | The fortress frame translates into purchase decisions in Option 2 verticals | Frame iteration sequence | Frame survives technical pressure tests; not yet exposed to a buyer | **High** — controls whether the v1 product can be marketed at all | Pitch the expanded fortress sentence to 5 named buyers in the chosen vertical; observe whether they self-identify |
| 5 | The substrate's defensibility is "thin"; competitors could replicate in ~6 months | Game-changer assessment | Asserted by assistant without competitor-engineering analysis | **Medium** — affects pricing power and how aggressively to invest | Survey: does any competitor publicly claim or demonstrate the integrated stack? Monitor LangGraph, Palantir, Veeva quarterly product updates |
| 6 | SR 26-02 creates a ~6-month window before Databricks/ValidMind close it | README, section 7 | Asserted; no measurement of how fast SR 26-02 toolset is being adopted | **Medium** — sequencing of Play G depends on this | Track Databricks model-risk product cadence, ValidMind enterprise customer additions |
| 7 | Plugin S-tier rate above ~25% is "implausibly inflated" | README line 217 | Author's calibration claim, not derived from a stated principle | **Medium** — affects how much weight to put on plugin density signals | Define operational tier criteria; re-tier two registries blind; compare |
| 8 | The expression-language-calling-verbs problem is solved by extending CEL with verb-emit helpers | Codebase review turn | Asserted as the right path; not implemented; tradeoffs vs. alternatives (jq, JSONata, PowerQuery M) not formally compared | **Medium** — affects v3 estimate; wrong choice means rebuild | Build a 1-day spike: implement `graph.emit_op` in CEL against one verb; assess ergonomics |
| 9 | "Agentic Excel" framing is net-negative for regulated buyers | README review turn | Assistant's opinion; not tested | **Low-Medium** — internal mental model can survive even if external framing is wrong | A/B test landing pages or sales pitches with Excel-framing vs. structural-framing |
| 10 | Per-customer savings figures (e.g., $1.25M-$2M for a $5M pharma submission) | Savings-hypotheses turn | Estimates assembled from benchmarks not cited line-by-line | **Low** — used as comparative ranking only, not as commitment | If a vertical is chosen, validate that segment's specific number with a customer interview |

Order rationale: claims 1-4 are high-impact because the entire wedge strategy collapses if any of them are false. Claims 5-7 are medium because they affect timing and weighting but not the fundamental viability. Claims 8-10 are lower because they affect implementation detail or framing rather than core thesis.

## 4. Knowledge Gaps

### 4a. Explicit unknowns

- Whether any cold-agent eval has been run (assistant repeatedly flagged "no eval data" as a gap; user has not stated whether one is in progress).
- Identity of the first realistic design partner (assistant asked "who specifically would you call this week if you committed to one path?" — never answered in conversation).
- Team size, runway, and risk tolerance (assistant explicitly noted in README review: "I have not done diligence on FDP's own engineering team capacity, founder profile, or capital position").
- Regulated-industry connections of the team (relevant to Option 3 viability; never disclosed).
- Whether the user has any test results from the existing six plugins that would inform the cold-agent thesis empirically.
- Whether the op dispatcher and op log are currently being built or only planned.
- The actual source of the Greenlight Guru pricing claim beyond the OpenRegulatory citation.

### 4b. Contradictions

- **Plugin file count disagreement.** The markdown frontmatter claims "250 entries"; the TS instance reports 267. The README acknowledges the schema flagging this as the design-intended behavior, but the markdown narrative continues to use "250" throughout. Both numbers persist in the source materials. The TS instance prevailed structurally (the schema flagged the markdown); the markdown narrative was not updated to match.
- **S-tier count disagreement.** Markdown narrative line 56 states "S — 49 (19.6%)"; schema-validated parse counts 63 S-tier entries (~24%). README acknowledges "31% S rate at the corpus level is implausibly inflated" without resolving the discrepancy in `fdpm-250-plugins.md` specifically. Unresolved.
- **README tone vs. positioning recommendation.** Lines 300-1160 push "Agentic Excel for governed knowledge artifacts" as the lead frame. Lines 1160-1587 push vertical-deep wedge with regulator-grade governance. The two framings are incompatible (horizontal product vs. vertical product). README does not reconcile. Assistant flagged this in the review turn; user did not respond directly.
- **Sequencing of Play G.** README section 8 puts Play G at "Months 12-18." README section 7 risk register says Play G window may close in 6 months and recommends "move within 6 months." These two statements within the same document are mutually inconsistent; neither prevailed.
- **Markdown cross-references vs. semantically intended targets.** Several markdown entries use `#NN` numbering that points at unrelated entries by display number. The TS instance corrects to semantic intent in `notes`. Both versions persist; neither was updated to fix the markdown.

### 4c. Halt points

- The cold-agent eval question (raised at least four times by assistant; never directly answered by user). If a result existed, every other claim would be re-anchored.
- The "name a real design partner" question (asked at least three times by assistant; consistently un-answered). Without this, Option 2 vs. Option 3 cannot be picked on the right grounds.
- The plugin-version-coupling and op-log-replay-across-versions question (raised by assistant; user did not engage). This is a structural correctness issue for the audit-grade frame and was deferred.
- Whether the cap:verb / cap:prompt slot will be added (raised by assistant; user did not commit). The schema-vs-content gap in the agent-shaped section depends on this.
- The "Agentic Excel framing is leakage" pushback (raised by assistant in README review; user did not respond before pivoting to plugin-level review).

## 5. Actionable Insights

- **Insight.** Run the 50-instruction differential cold-agent eval before any further external positioning work.
- **Why it matters.** Every game-changer claim and most strategy decisions in this conversation reduce to a hypothesis the eval would resolve. Continuing positioning iteration without the number is theoretical churn.
- **Success criterion.** Three eval runs (verbs only / + discovery / + prompts) complete with prespecified pass criteria (terminal state matches goal, log replays cleanly, no out-of-scope destructive ops, verb-sequence ≤ 2× human baseline) and a recorded first-try success rate per arm.
- **Owner.** (unassigned — needs decision; user is the only person with access to fdpm-cli but has not committed).
- **Next step.** Define the 50 instructions in one sitting against the planning + spec_authoring plugins; pick a frontier model; run the three arms; compare differentially.
- **Grounding.** Raised explicitly in Path B turn; reinforced in game-changer turn; flagged again in fortress-frame turn. Assistant treated this as the highest-leverage open action throughout.

- **Insight.** Validate the Greenlight Guru pricing claim before betting Play B on it.
- **Why it matters.** The trigger-event rationale that distinguishes Play B from generic medtech-eQMS opportunity collapses if the pricing event is overstated.
- **Success criterion.** Three Greenlight Guru customers (current or recently-departed) confirm or refute the 01/2026 pricing increase, the package-separation mechanism, and the magnitude.
- **Owner.** (unassigned — needs decision).
- **Next step.** Find three Greenlight Guru customers via LinkedIn, OpenRegulatory community, or warm intros; conduct 20-minute calls; record findings.
- **Grounding.** README section 9 explicitly flags single-sourcing; assistant raised this concern in README review turn.

- **Insight.** Pick a specific vertical from Options 2 and 3 within 60 days of decision-point, driven by realistic 90-day design-partner identification rather than market-analysis ranking.
- **Why it matters.** Without commitment, every framework iteration is academic. The "pick one path" discipline is what turns optionality into outcome.
- **Success criterion.** A named target buyer at a named company has been pitched the vertical-specific framing of the fortress claim and has agreed to a paid pilot or a structured discovery conversation.
- **Owner.** (unassigned — needs decision).
- **Next step.** Make a list of every name you could call this week; if the list has zero, the path is infeasible regardless of market analysis. If it has names, call them.
- **Grounding.** Asked repeatedly by assistant ("who specifically would you call this week"); never answered. Treated as the highest-leverage gating question for Option 2/3 selection.

- **Insight.** Build the op dispatcher + op log as v1, not v2.
- **Why it matters.** Without execution of emitted ops, the verb registry is documentation rather than runtime; the op log is the load-bearing differentiator vs. compiler-only systems; every audit/replay claim depends on this.
- **Success criterion.** `host.runTransformer(input)` actually executes emitted ops, appends an entry per op (`{plugin_id, op_kind, payload, request_id, timestamp}`), and supports replay-from-log producing identical terminal state across runs.
- **Owner.** (unassigned — needs decision; engineering work on fdpm-cli).
- **Next step.** Pick one plugin (planning is the most evolved); design the dispatcher contract; ship against one verb; round-trip the test.
- **Grounding.** Codebase review turn; reinforced in fortress-frame turn ("the agent-side SDK doesn't exist yet — that's v1 work").

- **Insight.** Drop "Agentic Excel" from external positioning; keep "fortress" or "typed-graph runtime" as the technical north star and translate into vertical-pain language for buyers.
- **Why it matters.** Excel framing primes buyers to expect spreadsheet looseness, which contradicts FDP's pre-validation thesis. Internal model can survive; external framing must not telegraph the wrong story.
- **Success criterion.** No marketing material, sales deck, or design-partner pitch leads with "Excel" framing; technical documentation may use the analogy as a learning aid only.
- **Owner.** (unassigned — needs decision; touches whoever owns FDP positioning).
- **Next step.** Audit existing positioning material; remove "Agentic Excel" and variants from any externally-facing surface; replace with the expanded fortress sentence customized to the chosen vertical.
- **Grounding.** README review turn; assistant's analysis of Excel's actual reputation (Reinhart-Rogoff, JPMorgan London Whale, UK COVID contact-tracing) as case studies of untyped errors that hide in plain sight.

- **Insight.** Pursue Play G (AI governance under SR 26-02) in parallel with Play B, not sequentially.
- **Why it matters.** The README's own risk register acknowledges the SR 26-02 window may close in 6 months; the GTM plan starts Play G at Months 12-18. The two are inconsistent.
- **Success criterion.** A Play G design partner is in conversation by Month 6, even if revenue contribution is not expected before Month 18.
- **Owner.** (unassigned — needs decision).
- **Next step.** Identify one bank Chief Risk Officer or Head of Model Risk willing to discuss SR 26-02 readiness; pitch FDP-as-evidence-substrate; explore pilot.
- **Grounding.** README review turn; flagged as internal contradiction between README sections 7 and 8.

- **Insight.** Resolve the cap:validator + CEL `expression` redundancy before more validators ship.
- **Why it matters.** Several rules currently ship both forms; quiet drift is the predictable failure mode; the drift-risk-map skill exists to detect exactly this kind of issue.
- **Success criterion.** One home per rule documented; validators in code OR CEL expressions, never both; existing dual-form rules audited and reduced.
- **Owner.** (unassigned — needs decision; engineering work on fdpm-cli).
- **Next step.** Audit `software_architecture/validation_rules.ts` and the matching `_capabilities.ts`; pick the canonical form for each rule type; remove duplicates.
- **Grounding.** Codebase review turn ("two forms create quiet redundancy that will drift").

- **Insight.** Tighten the plugin set's tier discipline before treating S-tier counts as direction signals.
- **Why it matters.** The README acknowledges 31% corpus-level S-rate is implausibly inflated; assistant's prior cluster-density analyses partially relied on the inflated S-tier; signal weakens until calibrated.
- **Success criterion.** A blind re-tier of `customer-service-250` and `executive-domain-500` produces an S rate ≤ 25% with documented rationale per entry; schema gains a soft warning when registry S share exceeds threshold.
- **Owner.** (unassigned — needs decision).
- **Next step.** Define operational S-tier criteria (concrete, not vibes); re-tier one registry; compare distributions.
- **Grounding.** README lines 217-227 explicitly flag this as known calibration debt; assistant flagged the implication in plugin-set review turn.

## 6. Follow-ups

### 6a. Open threads

- The plugin-version-coupling problem for op-log replay across plugin upgrades. Raised by assistant; not engaged with by user. Will become acute when first plugin upgrade is attempted.
- The schema gap where `cap:verb` / `cap:prompt` are not enumerated as plugin capabilities. The agent-shaped entries in the plugin set use `cap:expr-helper` as a stand-in; this is honest but mis-tagged. Resolution requires either growing the schema or removing the agent-shaped section's plugin-status.
- The conformance test (the README's stated "single highest-leverage action"). Mentioned at the end of the plugin-set review but never specified. Without it, the S-tier remains a subjective bar.
- The "rule-extraction cost" axis added to the taxonomy as a Tier-2 axis. Raised by assistant; not yet incorporated into a scoring exercise.
- The "organizational readiness" axis (process fit vs. commercial fit). Raised by assistant; not engaged.
- The Foundational/architectural cluster (crdt-sync, lock-leases, profile-to-schema, adr-from-decisions, etc.). Flagged in plugin re-read turn as "under-explored as a strategic asset"; not pursued further.

### 6b. Blocked dependencies

- Pick of vertical (Options 2A/2B/2C/2D or Options 3A/3B/3C) is blocked on identifying a realistic 90-day design partner.
- Cold-agent eval design and execution is blocked on whether the team commits the engineering hours; assistant noted this is "the highest-leverage open action" but the user has not committed.
- Op dispatcher work is blocked on prioritization decision (it is currently structural debt; commit to v1 or de-prioritize and accept that the audit-replay claim cannot be made externally).
- README market-analysis recommendations cannot be fully evaluated without the team profile and runway diligence the assistant explicitly flagged as missing.

### 6c. Suggested clarifications

- Who exactly would you call this week if you committed to Play B? Or to Play G? Or to Option 2D (RFPs)?
- Has any cold-agent eval been run, even informally?
- What is the team's realistic runway and risk tolerance — can you wait 4 years for Option 3 returns?
- Does anyone on the team have regulated-industry connections? If yes, which industry?
- Do you have firsthand information on the Greenlight Guru pricing event beyond the OpenRegulatory post?
- Is the op dispatcher being built? If so, what is the timeline?
- Are you committed to the vertical-product wedge approach, or are you still considering substrate-direct sales (Option 1)?
- How do you reconcile the "Agentic Excel" framing in the README with the vertical-deep wedge recommendation in the same document?

## 7. Audit summary

- **What this report is confident about:**
  - The MCP ecosystem facts cited in the conversation (three primitives, SEP-2076/2640, Codex CLI v0.117.0, Snyk audit numbers, 110M downloads/month) are well-sourced via web search and quoted inline.
  - The plugin-set drift findings (267 entries vs. 250 claimed; 63 S-tier vs. 49 claimed; broken cross-references) were verified by direct file inspection during the conversation and are reproducible.
  - The structural reasoning chains (substrate-vs-workflow, fortress-as-pre-validation, Creation+Operation share validation-prior property) follow from stated premises and are auditable.
  - The major decisions reached (drop Excel BNF, fortress as load-bearing frame, vertical-wedge with substrate hidden) and decisions explicitly NOT reached (which vertical, named design partner) are clearly traceable in the source.

- **What this report is least confident about:**
  - All dollar figures in the savings-hypotheses turn ($1.25M-$2M per pharma submission, $200K-$1M per SEC filing, etc.). Assistant was explicit that these are intuition pumps, not measurements. The report carries them through with `unverifiable-from-source`.
  - The "path probability" estimates (Path 1 ~20-25%, Path 2 ~15-20%, Path 3 ~10-15%; joint 40-50%). These are stated as estimates without methodology; they have no logical force beyond rhetorical structure.
  - The cluster-density inferences from S-tier classifications. Assistant's regex classifier was acknowledged as fuzzy; reasonable alternative groupings would shift conclusions. The 27%-of-S-tier-is-citation-evidence finding is roughly right but cluster boundaries are partly fitted.
  - The 2026 enterprise AI pain ranking. Cited Gartner/McKinsey/BCG indirectly without specific reports.
  - Whether the README's market-analysis specific facts (Greenlight Guru pricing, Veeva customer counts, LangChain ARR, SR 26-02 dates) are accurately sourced. The README's section 9 (lines 1549-1556) explicitly disclaims "several specific feature claims may already be stale"; this report inherits that uncertainty.
  - Whether any meaningful claim in the conversation was contradicted by parts of the pre-compaction transcript that the spot-check missed. Risk is non-zero given the transcript was 1,725 lines and not read line-by-line.

- **Most consequential thing to verify externally:**
  Whether the Greenlight Guru January 2026 pricing event actually occurred at the magnitude described, because the entire Play B "concrete trigger event" rationale rests on it. If false or overstated, Play B becomes generic medtech-eQMS competition against Veeva Vault Quality and Greenlight Guru's stable pricing — a much harder fight. Three actual Greenlight Guru customer conversations within 30 days would settle this.

  Second-most-consequential: whether the cold-agent eval, when run, supports or refutes the prompts-add-marginal-capability hypothesis. This would re-anchor every other claim about FDP's potential as an agent substrate.
