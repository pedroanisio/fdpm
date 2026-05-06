import { z } from "zod";
import {
  BusinessDeckSchema,
  RefinedBusinessDeckSchema,
  validateBusinessDeck,
  BuiltInPersuasionStrategies,
} from "../schemas/business-deck";

/**
 * FDPM market-pitch deck instance
 *
 * A go-to-market sales deck for FDPM — an agent-driven domain
 * workbench. Targets enterprise platform leaders evaluating how to
 * deploy LLM agents into production-grade workflows without losing
 * audit, replay, or compliance posture.
 *
 * Posture: case
 *   The deck argues for a bounded pilot adoption decision under
 *   "preponderance" burden of proof. Stipulates known risks up
 *   front; binds claims to evidence; declares rebuttal posture for
 *   the predictable buyer objections.
 *
 * Delivery: presented_live
 *   Sales meeting with technical buyer + economic buyer in the
 *   room. Speaker plan + Q&A required. Hybrid follow-up via
 *   shared deck is out of scope here (would require posture-
 *   compatible reader_navigation).
 *
 * Sales context (16.8) exercised:
 *   - buyer_journey_stage: business_case
 *   - account_context: anonymized "Mid-Market SaaS" frame
 *   - audience.segments[].buyer_role: economic / technical / champion
 *   - pain_points[]: 4 pains, two critical
 *   - solution_mapping[]: capability → pain → proof
 *   - commercial_model: pilot pricing frame, value metric, ROI
 *   - decision_frame.options[].kind + differentiation_claim_ids
 *
 * Validation path:
 *   const parsed = RefinedBusinessDeckSchema.parse(fdpmSalesDeckInput);
 *   const report = validateBusinessDeck(parsed);
 */

const getStrategy = (id: string) => {
  const strategy = BuiltInPersuasionStrategies.find((s) => s.id === id);
  if (!strategy) {
    throw new Error(`Missing built-in persuasion strategy: ${id}`);
  }
  return strategy;
};

export const fdpmSalesDeckInput: z.input<typeof BusinessDeckSchema> = {
  deck: {
    id: "deck_fdpm_market_pitch_v1",

    title: "Agent-Driven Operations, Without the Audit Gap",
    subtitle:
      "FDPM: ship LLM agents into production workflows with deterministic replay, plugin-shipped vocabularies, and operation-log compliance",

    description:
      "Sales deck for evaluating FDPM as the agent-runtime substrate for one bounded domain workflow under a 60-day pilot.",

    version: "1.0.0",
    language: "en-US",
    target_duration_minutes: 30,

    presentation_posture: "case",
    delivery_mode: "presented_live",

    buyer_journey_stage: "business_case",

    account_context: {
      industry: "Enterprise software / regulated SaaS",
      account_situation:
        "Existing AI-platform team; multiple LLM-agent prototypes shipped to internal users; production rollout blocked on audit, replay, and compliance review. Tool-catalog size on current MCP stack is degrading agent task success in user testing.",
      known_initiatives: [
        "Internal AI-platform v2",
        "Agent-driven workflow productization for top-3 internal domains",
        "SOC 2 controls extension to cover agent-actuated state changes",
      ],
    },

    objective: {
      primary_intent: "persuade",
      secondary_intents: ["compare", "decide"],
      desired_audience_shift: {
        from: "Agent-driven workflows are exciting but unsafe to ship — every prototype dies at the audit stage; we'll keep waiting for the ecosystem to mature.",
        to: "FDPM's event-sourced, plugin-shipped vocabulary model meets our audit and replay requirements today; a bounded pilot on one domain is a low-cost way to prove fit before broader investment.",
      },
      desired_outcome: "next_step_authorization",
      decision_or_action_requested:
        "Approve a 60-day pilot adopting FDPM as the agent runtime for one bounded internal domain (planning, knowledge ops, or incident response), under first-implementation-partner terms (waived software fee, services at cost-recovery, co-design rights, named-reference attestation).",
      success_definition:
        "The buying committee approves the pilot, names a domain owner, the CISO defines the audit-control envelope the pilot must satisfy before production exposure, and the first-implementation-partner terms are accepted in writing.",
    },

    audience: {
      primary_audience:
        "CTO, VP Engineering / Platform, Head of AI/ML Platform, Engineering Manager (champion), CISO observer",
      audience_type: "mixed",
      prior_knowledge: "high",
      attitude: "skeptical",
      complexity_tolerance: "high",

      concerns: [
        "Agent unpredictability in production",
        "Audit trail and replay for agent-actuated state changes",
        "Compliance posture (SOC 2, internal change-management)",
        "Tool-catalog scaling and agent attention degradation",
        "Integration cost with existing platform",
        "Lock-in to a still-evolving MCP ecosystem",
      ],

      assumptions: [
        "LLM agents need extensive bespoke prompt engineering per domain.",
        "MCP exposes generic CRUD; semantic operation modeling is the consumer's job.",
        "Audit trail for AI-actuated changes is a future problem, not a today problem.",
        "Internal build is the only path to a production-grade agent runtime.",
      ],

      likely_objections: [
        {
          id: "obj_unproven",
          text: "FDPM's architecture is described as a hypothesis. We don't deploy unproven runtimes.",
          severity: "must",
          source_segment_id: "seg_cto",
          counter_argument:
            "The pilot itself is the falsifiable test. The architecture's eval — three-arm differential against a cold-agent test set — is built into the project. The pilot exit criteria include this evaluation.",
        },
        {
          id: "obj_lock_in",
          text: "Adopting FDPM locks us into a specific runtime in an evolving ecosystem.",
          severity: "must",
          source_segment_id: "seg_vpe",
          counter_argument:
            "FDPM commits to MCP as the agent-facing interface. Any plugin-shipped vocabulary remains the consumer's IP and is portable to any MCP-compatible runtime; the operation log is a typed event stream consumable independently.",
        },
        {
          id: "obj_audit",
          text: "Agent-actuated changes don't fit our existing change-management or SOC 2 controls.",
          severity: "must",
          source_segment_id: "seg_ciso",
          counter_argument:
            "FDPM's operation log records every state change as a typed, namespaced op with actor, plugin_id, request_id, and causation chain. Replay is deterministic. The pilot delivers the control mapping required for SOC 2 review.",
        },
        {
          id: "obj_internal_build",
          text: "We can build this ourselves on top of MCP and event-sourcing primitives we already use.",
          severity: "should",
          source_segment_id: "seg_vpe",
          counter_argument:
            "Building it in isolation is plausible but expensive; the pilot tests whether FDPM's plugin model delivers the cold-agent test threshold faster than internal build, on a measurable comparison.",
        },
        {
          id: "obj_attention",
          text: "Our agents already drown in tool catalogs at 50+ MCP tools. How does this not make it worse?",
          severity: "should",
          source_segment_id: "seg_aimlp",
          counter_argument:
            "FDPM's design treats this as the central failure mode. Reads route through resources, not get_*-tools; the verb catalog is summarized at connect with progressive disclosure on demand. Tool-attention degradation is the eval signal we measure first.",
        },
      ],

      decision_power: "approver",

      what_they_need_to_believe: [
        "Agent unpredictability has a real technical answer, not just better prompts.",
        "Audit-trail and replay close the production-deployment gate, not just the demo gate.",
        "A bounded pilot is materially cheaper than internal build to reach the same evidence.",
        "FDPM's design choices around verb/resource/prompt/expression layering are deliberate, not arbitrary.",
      ],

      segments: [
        {
          id: "seg_cto",
          label: "CTO / Chief Architect",
          audience_type: "executive",
          prior_knowledge: "high",
          attitude: "skeptical",
          complexity_tolerance: "high",
          decision_power: "final_decision_maker",
          buyer_role: "economic_buyer",
          priorities: [
            "Production reliability of AI features",
            "Architectural coherence of the platform stack",
            "Vendor risk and ecosystem alignment",
          ],
          fears: [
            "Adopting a hypothesis-stage runtime that doesn't survive its own eval",
            "Architectural fragmentation across AI workflows",
            "Compliance/audit blocker emerging late in production rollout",
          ],
          success_criteria: [
            "Pilot delivers a SOC 2-mappable control envelope",
            "Cold-agent eval shows a measurable improvement over current stack",
            "Internal-build cost-comparison favors FDPM by a defensible margin",
          ],
          what_they_need_to_believe: [
            "FDPM's architectural commitments line up with our platform direction.",
            "The pilot has a defined exit criterion the team can hit in 60 days.",
            "The risk is bounded by pilot scope and reversible by design.",
          ],
          functional_jobs: [
            "Decide whether to authorize a 60-day pilot under defined exit criteria",
            "Verify the architectural commitments are coherent with platform direction",
            "Quantify the cost-comparison against internal build",
          ],
          emotional_jobs: [
            "Feel confident the architectural choice is defensible to the board if it fails",
            "Avoid the embarrassment of adopting a runtime that fails its own eval in production",
          ],
          social_jobs: [
            "Be perceived by peers as a disciplined adopter — neither ecosystem-resistant nor an early-stage gambler",
            "Be the CTO who got AI-platform v2 right by running the test before committing",
          ],
        },
        {
          id: "seg_vpe",
          label: "VP Engineering / Platform",
          audience_type: "executive",
          prior_knowledge: "medium",
          attitude: "skeptical",
          complexity_tolerance: "medium",
          decision_power: "approver",
          buyer_role: "technical_buyer",
          priorities: [
            "Engineering velocity",
            "Integration cost with existing platform",
            "Adoption curve for the team",
          ],
          fears: [
            "Pilot eats engineering capacity that should land Q3 commitments",
            "Lock-in to a specific runtime",
            "Yet another platform to maintain alongside existing event-sourcing infra",
          ],
          success_criteria: [
            "Plugin developer ergonomics are at least on par with current MCP server work",
            "Operation log integrates with existing observability pipeline",
            "Exit-from-pilot path is concrete (operation log is portable)",
          ],
          what_they_need_to_believe: [
            "The pilot scope is genuinely bounded, not Trojan horse for a platform migration.",
            "Plugin authoring is a weekend, not a sprint, for an experienced engineer.",
            "The runtime composes with our existing observability stack.",
          ],
        },
        {
          id: "seg_aimlp",
          label: "Head of AI / ML Platform",
          audience_type: "technical",
          prior_knowledge: "expert",
          attitude: "curious",
          complexity_tolerance: "high",
          decision_power: "recommender",
          buyer_role: "champion",
          priorities: [
            "Agent reliability and eval-driven improvement",
            "Agent attention scaling with tool-catalog growth",
            "Cold-start behavior on new domains",
          ],
          fears: [
            "Yet another agent framework abstracting away the bits we actually need to control",
            "Hidden coupling that makes our prompt engineering brittle",
            "Eval harness that doesn't expose the failure modes we care about",
          ],
          success_criteria: [
            "Cold-agent task success on the pilot domain meets a defined threshold",
            "Tool-attention metric improves vs current stack",
            "Operation-log replay supports our existing eval workflows",
          ],
          what_they_need_to_believe: [
            "The verb/resource/prompt split addresses real attention-degradation modes.",
            "Eval is first-class in the runtime, not bolted on later.",
            "The expression language earns its complexity by reducing tool count.",
          ],
        },
        {
          id: "seg_ciso",
          label: "CISO / Compliance",
          audience_type: "regulatory",
          prior_knowledge: "medium",
          attitude: "hostile",
          complexity_tolerance: "medium",
          decision_power: "approver",
          buyer_role: "security",
          priorities: [
            "Audit trail completeness for AI-actuated state changes",
            "Reversibility of agent operations",
            "Mapping to existing SOC 2 / ISO 27001 controls",
          ],
          fears: [
            "Agent makes a privileged change with no recoverable trace",
            "AI ops fall outside change-management process",
            "Compliance auditor flags the runtime as inadequate at year-end",
          ],
          success_criteria: [
            "Every agent op carries actor, request_id, causation chain",
            "Deterministic replay produces an auditor-acceptable artifact",
            "Pilot includes a written control-envelope before production exposure",
          ],
          what_they_need_to_believe: [
            "The operation log is the audit surface, not an afterthought.",
            "Compensating controls for agent privilege can be defined and tested.",
            "Pilot has explicit security gates before any production-system access.",
          ],
          functional_jobs: [
            "Decide whether the operation-log artifact is reviewable by our auditor",
            "Define the compensating-control envelope before any production exposure",
            "Verify replay produces an artifact the audit firm will accept",
          ],
          emotional_jobs: [
            "Feel that AI ops are inside change-management, not outside it",
            "Avoid being blindsided at year-end audit by an AI runtime nobody reviewed",
          ],
          social_jobs: [
            "Be perceived by the audit firm as a disciplined CISO who got ahead of agent-driven change-management",
            "Be the security voice the platform team listens to early, not last",
          ],
        },
        {
          id: "seg_em_champion",
          label: "Engineering Manager (internal champion)",
          audience_type: "internal_team",
          prior_knowledge: "high",
          attitude: "supportive",
          complexity_tolerance: "high",
          decision_power: "influencer",
          buyer_role: "champion",
          priorities: [
            "Ship a real agent-driven workflow this quarter",
            "Replace the in-house glue layer behind our LLM tooling",
            "Have a defensible answer when the security team asks",
          ],
          fears: [
            "The CTO kills the pilot before it hits its own eval",
            "Pilot scope grows mid-flight",
            "Champion stuck owning two stacks during transition",
          ],
          success_criteria: [
            "Domain owner identified within two weeks",
            "Operation log gives security something concrete to review",
            "Cold-agent eval result lands inside the 60-day window",
          ],
          what_they_need_to_believe: [
            "There is enough CTO/CISO attention here to clear blockers fast.",
            "The pilot has air cover from the platform team for integration help.",
            "Saying yes today doesn't pre-commit to broader migration.",
          ],
        },
      ],
    },

    pain_points: [
      {
        id: "pain_audit_gap",
        description:
          "Agent-actuated state changes lack an auditable, replayable trail; SOC 2 review treats them as uncontrolled.",
        affected_persona_ids: ["seg_ciso", "seg_cto"],
        severity: "critical",
        current_cost_or_impact:
          "Every agent prototype dies at the compliance review stage; ~3-month median delay before any agent-driven workflow ships.",
      },
      {
        id: "pain_tool_attention",
        description:
          "Agent attention degrades as MCP tool catalogs grow; cold-agent task success drops sharply past 30–50 tools.",
        affected_persona_ids: ["seg_aimlp", "seg_em_champion"],
        severity: "critical",
        current_cost_or_impact:
          "Internal evals show task-success regression on multi-domain agent stacks; teams ship narrow, hand-pruned tool sets that don't compose.",
      },
      {
        id: "pain_cold_start_cost",
        description:
          "Each new domain requires bespoke prompt engineering, tool descriptions, and exemplar tuning before an agent is productive.",
        affected_persona_ids: ["seg_aimlp", "seg_vpe"],
        severity: "high",
        current_cost_or_impact:
          "2–6 engineering weeks per new domain to reach baseline agent competence; doesn't scale to the top-3 internal-domain initiative.",
      },
      {
        id: "pain_concurrent_state",
        description:
          "Long-running agents operate against stale catalogs and stale state when humans or other agents edit the workbook concurrently.",
        affected_persona_ids: ["seg_aimlp", "seg_vpe"],
        severity: "medium",
        current_cost_or_impact:
          "Periodic agent-induced regressions in shared workflows; fixed today by hard-resetting agent context, which loses progress.",
      },
    ],

    solution_mapping: [
      {
        capability: "Event-sourced operation log with deterministic replay",
        addresses_pain_point_ids: ["pain_audit_gap"],
        proof_evidence_ids: ["ev_architecture_audit", "ev_compliance_path"],
        limitation_or_caveat:
          "The log captures the runtime's state changes; if a plugin invokes external side effects directly, those remain the plugin author's audit responsibility.",
      },
      {
        capability: "Verb / resource / prompt / expression layering with progressive disclosure",
        addresses_pain_point_ids: [
          "pain_tool_attention",
          "pain_cold_start_cost",
        ],
        proof_evidence_ids: ["ev_attention_design", "ev_cold_agent_eval"],
        limitation_or_caveat:
          "Cold-start gains depend on plugin authors writing competent prompts; the runtime ships the slot, plugins ship the content.",
      },
      {
        capability: "Plugin-shipped domain vocabulary (no per-domain glue code)",
        addresses_pain_point_ids: ["pain_cold_start_cost"],
        proof_evidence_ids: ["ev_plugin_model"],
      },
      {
        capability: "MCP change notifications for concurrent-edit safety",
        addresses_pain_point_ids: ["pain_concurrent_state"],
        proof_evidence_ids: ["ev_mcp_alignment"],
      },
      {
        capability: "Renderer pipeline as the human-review surface",
        addresses_pain_point_ids: ["pain_audit_gap"],
        proof_evidence_ids: ["ev_architecture_audit"],
        limitation_or_caveat:
          "Render targets are plugin-contributed; a domain without a contributed renderer falls back to the generic JSON view.",
      },
    ],

    commercial_model: {
      pricing_frame:
        "FIRST-IMPLEMENTATION PARTNER OFFER (time-bounded, expires when we close customer #2): runtime is OSS; software fee waived for the pilot; professional services billed at cost-recovery only (~50% of standard pilot rate). Includes: direct architectural input to the v2 plugin contract, roadmap priority for the buyer's chosen domain, co-authored case study and eval write-up, named-reference rights. Standard pricing applies from customer #2 onward.",
      value_metric:
        "Time-to-production for agent-driven workflows; secondary metric: cold-agent task-success at constant tool-catalog size.",
      roi_summary:
        "First-implementation terms make the pilot's net cost lower than the buyer's two-week internal-build estimate for an equivalent runtime layer. Break-even modeled against the 2–6-week-per-domain cold-start cost the buyer is already paying internally; full ROI model assembled during the pilot's first two weeks.",
      commercial_risks: [
        "risk_pilot_overrun",
        "risk_internal_build_distraction",
        "risk_first_mover_burden",
      ],
    },

    message_strategy: {
      core_claim: {
        id: "claim_core",
        kind: "core",
        text: "Agent-driven workflows can ship to production today if the runtime treats audit, attention, and cold-start as first-class architectural concerns — and FDPM is built around exactly those three.",
        qualifier:
          "for bounded enterprise workflows under defined compensating controls; not a universal claim across all agent use cases",
      },

      supporting_claims: [
        {
          id: "claim_audit",
          kind: "supporting",
          parent_claim_id: "claim_core",
          text: "An event-sourced operation log with typed, namespaced ops collapses the audit gap that kills most agent prototypes at compliance review.",
          qualifier:
            "for state changes mediated by the runtime; plugin-driven external side effects remain the plugin author's audit responsibility",
        },
        {
          id: "claim_attention",
          kind: "supporting",
          parent_claim_id: "claim_core",
          text: "Reads as resources, writes as named verbs, prompts as orientation, and expressions as composition — together — keep agent attention scaling as the domain grows.",
          qualifier:
            "subject to plugin authors writing competent orientation prompts; runtime ships the slot, plugins ship the content",
        },
        {
          id: "claim_cold_start",
          kind: "supporting",
          parent_claim_id: "claim_core",
          text: "A plugin-shipped vocabulary lets a cold agent become productive on a new domain at MCP-connect time, without per-domain prompt engineering.",
          qualifier:
            "for domains whose vocabulary fits the verb/resource/prompt/expression decomposition; pathological domains may still require bespoke tuning",
        },
        {
          id: "claim_pilot",
          // Pass 5 S4: kind="action" — this claim operates at the
          // recommendation layer, not as a peer architectural pillar.
          // Excluded from Minto's rule-of-three counter.
          kind: "action",
          parent_claim_id: "claim_core",
          text: "A 60-day bounded pilot on one internal domain is the cheapest way to verify FDPM clears the buyer's audit, attention, and cold-start bars before broader investment.",
          qualifier:
            "given the buyer's existing 2–6-week-per-domain cold-start cost; if internal-build cost is materially lower, the pilot's TCO model surfaces it",
        },
      ],

      misconception_to_correct:
        "FDPM is not 'another agent framework'. It is a runtime substrate that exposes domain operations through MCP with audit and replay built in; agent frameworks (LangChain, etc.) sit *above* it as consumers, not alternatives to it.",

      // Star Moment (Duarte): the explicit, engineered, memorable
      // beat the deck wants the audience to retain after the meeting.
      // Anchored on slide 1's framing — "Your agents work in the
      // demo. They die at audit." — and echoed back in the closing
      // arc. Every later slide should ladder back to this beat; if
      // a slide does not earn its place against it, the slide is
      // wrong. (Schema does not currently model star_moment as a
      // first-class field — see Pass-5 backlog.)
      //
      // Architectural note on supporting_claims (Minto rule of three):
      // The deck declares 4 supporting claims, not 3. This is a
      // deliberate structural distinction, not a rule violation:
      //
      //   3 architectural pillars (peers, MECE):
      //     - claim_audit         (audit gap)
      //     - claim_attention     (attention degradation)
      //     - claim_cold_start    (per-domain cold-start cost)
      //
      //   1 action claim (operates at the recommendation layer):
      //     - claim_pilot         ("the bounded pilot is the right
      //                            way to test the architecture")
      //
      // Minto's rule-of-three applies to peer arguments under a
      // single peak. claim_pilot is not a peer of the three pillars;
      // it is the recommended action that follows from accepting
      // them. The schema's supporting_claims slot is the only home
      // for it (decision_frame.recommendation captures the action
      // but not the laddering relationship to claim_core), so it
      // lives here with this comment as the load-bearing rationale.

      framing_angle: "tradeoff",
      tone: "executive",

      non_goals: [
        "Do not claim FDPM solves the LLM hallucination problem.",
        "Do not promise specific quantitative cold-agent benchmark numbers — those are the pilot's deliverable.",
        "Do not market FDPM as a competitor to agent frameworks; it is a substrate, not a framework.",
        "Do not pitch broad migration; the ask is one bounded pilot.",
      ],

      thesis_pressure_test: {
        strongest_counterargument:
          "We can wait for the MCP ecosystem to mature and adopt the eventual standard runtime, avoiding the cost of betting on a v1.",
        response_strategy:
          "Concede the option-value of waiting; show that the cost of a bounded pilot is materially lower than the cost of being late on the audit + attention + cold-start curves the buyer's own roadmap depends on.",
      },

      // Pass 5 S5 — Duarte Sparkline Star Moment. The deck's
      // engineered memorable beat: slide 1's framing of the
      // production gap. Every later slide ladders back to it; the
      // closing arc echoes it.
      star_moment: {
        slide_number: 1,
        message:
          "Your agents work in the demo. They die at audit.",
      },
    },

    narrative_model: {
      // Pattern: context (situation) → problem (complication) →
      // proposal (answer). This maps onto Barbara Minto's SCQA flow
      // (situation / complication / question / answer) which is the
      // standard executive-deck opening structure. The earlier
      // `claim_evidence_decision` value described the visible
      // mid-deck mechanic but mis-described the opening — the deck
      // does not start with the claim, it starts with the situation.
      narrative_pattern: "context_problem_proposal",
      pacing: "balanced",
      opening_strategy: "problem_first",
      closing_strategy: "decision_ask",

      progression: [
        {
          step: 1,
          function: "open",
          message:
            "Open with the production gap: every team in the room has shipped agent prototypes that died at audit, attention, or cold-start.",
          audience_question_answered: "Why does this conversation matter today?",
        },
        {
          step: 2,
          function: "problem",
          message:
            "Name the three failure modes — audit gap, tool-attention degradation, per-domain cold-start cost — and the cost the buyer is already paying for each.",
          audience_question_answered: "What is the actual problem to solve?",
        },
        {
          step: 3,
          function: "definition",
          message:
            "Define FDPM precisely: an agent-driven workbench, MCP-native, plugin-shipped vocabulary, event-sourced operation log. Not an agent framework.",
          audience_question_answered: "What exactly is FDPM?",
        },
        {
          step: 4,
          function: "model",
          message:
            "Walk the four-part vocabulary — verbs, resources, prompts, expressions — and explain how each maps to one of the three failure modes.",
          audience_question_answered: "How does the architecture work?",
        },
        {
          step: 5,
          function: "evidence",
          message:
            "Show the operation log: every state change typed, replayable, attributable; this is the auditable artifact compliance review needs.",
          audience_question_answered: "Where is the proof?",
        },
        {
          step: 6,
          function: "evidence",
          message:
            "Disclose what the project can and cannot show as precedent: no paying reference customer yet; here is what we offer for evaluation in its place — public architecture, runnable runtime, eval harness, plugin model.",
          audience_question_answered:
            "What evidence can we actually inspect before deciding?",
        },
        {
          step: 7,
          function: "tradeoff",
          message:
            "Compare the alternatives: status quo, internal build, agent-framework-only stack, FDPM. Show the explicit dimensions: audit, attention, cold-start, integration cost, exit cost.",
          audience_question_answered: "How does this compare to our other options?",
        },
        {
          step: 8,
          function: "objection",
          message:
            "Take on the four predictable objections: unproven, lock-in, audit fit, internal-build economics. Each gets a rebuttal anchored in the pilot scope.",
          audience_question_answered: "What about the obvious concerns?",
        },
        {
          step: 9,
          function: "risk",
          message:
            "Surface the risks the buyer should weigh: hypothesis-stage architecture, MCP ecosystem volatility, pilot-overrun, first-mover burden. State the mitigations.",
          audience_question_answered: "What could go wrong?",
        },
        {
          step: 10,
          function: "model",
          message:
            "Walk the 60-day implementation timeline: weeks 1–2 setup, weeks 3–6 plugin authoring, weeks 7–8 cold-agent eval, week 9 readout. Named deliverables, not vibes.",
          audience_question_answered: "What does the pilot actually look like?",
        },
        {
          step: 11,
          function: "option",
          message:
            "Present the first-implementation-partner offer: waived software fee, services at cost-recovery, co-design rights, named-reference attestation. Time-bounded; expires when we close customer #2. Trade is explicit — the buyer becomes our first reference, in exchange for reduced cost and roadmap influence.",
          audience_question_answered:
            "What does it cost, and why is it offered on these terms?",
        },
        {
          step: 12,
          function: "recommendation",
          message:
            "Recommend a 60-day pilot scoped to one internal domain under first-implementation-partner terms. Define exit criteria: cold-agent eval threshold, audit-control mapping, total-cost comparison.",
          audience_question_answered: "What should leadership approve?",
        },
        {
          step: 13,
          function: "decision",
          message:
            "Ask for the bounded decision: name a domain owner, approve the pilot scope, set the security gate, accept first-partner terms in writing.",
          audience_question_answered: "What decision is needed today?",
        },
      ],
    },

    conceptual_structure: {
      dominant_model: "system",
      secondary_models: ["decision_tree", "cause_effect"],
      abstraction_level: "strategic",
      central_question:
        "Where does the cost of unpredictable, unauditable, attention-degraded agent runtimes exceed the cost of bounded adoption of a runtime built around those three concerns?",
      organizing_principle:
        "Treat audit, attention, and cold-start as the three architectural axes the buyer's roadmap already depends on; show FDPM as the runtime that makes each first-class.",
      focal_point: "Agent runtime substrate decision",
      peripheral_elements: [
        "Specific LLM model choice",
        "Agent-framework selection",
        "Long-tail tool integrations",
      ],
    },

    information_architecture: {
      entities: [
        {
          id: "ent_agent_runtime",
          label: "Agent runtime substrate",
          role: "system",
          description:
            "The layer between the LLM agent and the buyer's domain — exposes domain operations via MCP, records state changes, mediates concurrent access.",
          importance: "primary",
          confidence: "high",
        },
        {
          id: "ent_audit_log",
          label: "Operation log",
          role: "control",
          description:
            "Event-sourced, typed, namespaced record of every state change. Drives replay, undo, audit, and time-travel.",
          importance: "primary",
          confidence: "high",
        },
        {
          id: "ent_plugin_vocab",
          label: "Plugin-shipped domain vocabulary",
          role: "capability",
          description:
            "Verbs / resources / prompts / expressions packaged per domain. Closes the cold-start gap.",
          importance: "primary",
          confidence: "high",
        },
        {
          id: "ent_tool_attention",
          label: "Agent tool attention",
          role: "metric",
          description:
            "Empirically observed degradation in agent task success as tool catalog grows. The failure mode the architecture exists to address.",
          importance: "primary",
          confidence: "medium",
        },
        {
          id: "ent_compliance_envelope",
          label: "Compensating-control envelope",
          role: "control",
          description:
            "CISO-defined set of controls (isolation, audit thresholds, replay windows) the pilot must satisfy before production exposure.",
          importance: "primary",
          confidence: "medium",
        },
        {
          id: "ent_pilot_decision",
          label: "60-day pilot decision",
          role: "decision",
          description:
            "The bounded yes/no the buying committee is asked to make today.",
          importance: "primary",
          confidence: "high",
        },
      ],

      relationships: [
        {
          from: "ent_agent_runtime",
          to: "ent_audit_log",
          type: "produces",
          directionality: "one_way",
          label: "every state change is an auditable op",
          confidence: "high",
        },
        {
          from: "ent_plugin_vocab",
          to: "ent_tool_attention",
          type: "mitigates",
          directionality: "one_way",
          label: "progressive disclosure stops attention collapse",
          confidence: "medium",
        },
        {
          from: "ent_audit_log",
          to: "ent_compliance_envelope",
          type: "supports",
          directionality: "one_way",
          label: "log is the artifact compliance review consumes",
          confidence: "high",
        },
        {
          from: "ent_compliance_envelope",
          to: "ent_pilot_decision",
          type: "constrains",
          directionality: "one_way",
          label: "pilot conditional on CISO sign-off",
          confidence: "high",
        },
        {
          from: "ent_pilot_decision",
          to: "ent_agent_runtime",
          type: "measures",
          directionality: "one_way",
          label: "pilot is the falsifiable test of the architecture",
          confidence: "high",
        },
      ],

      layers: [
        {
          id: "layer_problem",
          label: "Problem space",
          purpose: "problem",
          order: 1,
          entities: ["ent_tool_attention"],
          is_cross_cutting: false,
        },
        {
          id: "layer_runtime",
          label: "Runtime layer",
          purpose: "system_layer",
          order: 2,
          entities: ["ent_agent_runtime", "ent_audit_log", "ent_plugin_vocab"],
          is_cross_cutting: false,
        },
        {
          id: "layer_control",
          label: "Control layer",
          purpose: "control_layer",
          order: 3,
          entities: ["ent_compliance_envelope"],
          is_cross_cutting: true,
        },
        {
          id: "layer_decision",
          label: "Decision",
          purpose: "decision_layer",
          order: 4,
          entities: ["ent_pilot_decision"],
          is_cross_cutting: false,
        },
      ],

      key_tradeoffs: [
        {
          dimension: "Wait for ecosystem maturity vs. bounded early adoption",
          option_a: "Wait for the MCP ecosystem to settle on a standard runtime",
          option_b: "Adopt FDPM under a bounded pilot now",
          implication:
            "Waiting preserves option-value but compounds the audit/attention/cold-start costs the roadmap is already paying.",
          importance: "primary",
        },
        {
          dimension: "Internal build vs. open-source pilot",
          option_a: "Build the runtime layer internally on top of MCP primitives",
          option_b: "Pilot FDPM as the runtime substrate",
          implication:
            "Internal build is plausible at higher cost; the pilot tests whether the cost gap is real on the buyer's actual workflows.",
          importance: "primary",
        },
        {
          dimension: "Agent reliability vs. catalog growth",
          option_a: "Hand-prune narrow tool catalogs per agent",
          option_b: "Grow domain coverage through progressive-disclosure architecture",
          implication:
            "Hand-pruning works at small scale; the buyer's top-3 internal-domain initiative needs an architectural answer.",
          importance: "secondary",
        },
      ],

      unresolved_questions: [
        "Which internal domain is the right pilot target?",
        "What is the minimum control envelope the CISO will sign off on?",
        "How does FDPM's operation log compose with our existing event-sourcing infrastructure?",
        "What cold-agent eval threshold defines pilot success?",
      ],
    },

    evidence: [
      {
        id: "ev_architecture_audit",
        claims_supported: ["claim_core", "claim_audit"],
        evidence_type: "logical_argument",
        summary:
          "FDPM commits to event sourcing as the architectural foundation: every state change is a typed, namespaced op carrying actor, plugin_id, request_id, and causation_op_id. Replay is deterministic; the log is the source of truth, not a serialized snapshot.",
        source: "PURPOSE.md / README.md (architectural commitments).",
        strength: "high",
        warrant:
          "Compliance review requires a deterministic, replayable, attributable record of every state-changing action. Event sourcing produces exactly this artifact by construction; therefore an event-sourced runtime closes the audit gap that ad-hoc agent stacks cannot.",
      },
      {
        id: "ev_attention_design",
        claims_supported: ["claim_attention", "claim_core"],
        evidence_type: "logical_argument",
        summary:
          "Reads route through MCP resources, not through proliferating get_*-tools. Verbs are summarized at connect with progressive-disclosure expansion on demand. Both choices target the empirically observed agent-attention failure mode head-on.",
        source: "FDPM design rationale; converges on the direction MCP Skills (SEP-2640) is taking.",
        strength: "medium",
        warrant:
          "Agent task success degrades as the tool catalog grows past ~30–50 tools (observed across multiple production stacks). If reads stop adding tools, the catalog growth curve flattens; if verbs are progressively disclosed, the active attention surface stays bounded as domain coverage grows.",
      },
      {
        id: "ev_cold_agent_eval",
        claims_supported: ["claim_core", "claim_cold_start"],
        evidence_type: "experiment",
        summary:
          "FDPM defines its own falsifiable contract: a three-arm differential cold-agent eval against a published task set. The pilot reuses this harness against the buyer's chosen domain.",
        source: "PURPOSE.md — eval design as the project's falsification commitment.",
        strength: "medium",
        warrant:
          "An architecture that ships its own falsifier is structurally different from one that asks the buyer to trust it. The eval is the bridge: it makes the architectural claim ('cold agents become productive at MCP-connect time') a measurable property the pilot can confirm or reject.",
      },
      {
        id: "ev_plugin_model",
        claims_supported: ["claim_cold_start"],
        evidence_type: "technical_analysis",
        summary:
          "Plugins ship the four-part vocabulary as one installable surface. A cold agent connecting to an FDPM workbook with a plugin loaded receives discovery tools, prompt slots, and resource URIs the same way the runtime does — no bespoke prompt-engineering layer required.",
        source: "Plugin runtime documentation.",
        strength: "medium",
      },
      {
        id: "ev_compliance_path",
        claims_supported: ["claim_audit"],
        evidence_type: "scenario_analysis",
        summary:
          "A documented compliance path: operation log → SOC 2 control mapping → CISO-defined envelope → pilot exit criteria. The path is concrete; the deliverable for the pilot's first phase is the mapping itself.",
        source: "Pilot scope template.",
        strength: "medium",
      },
      {
        id: "ev_mcp_alignment",
        claims_supported: ["claim_attention"],
        evidence_type: "technical_analysis",
        summary:
          "MCP change notifications (notifications/tools/list_changed, resources/list_changed, prompts/list_changed) prevent long-running agents from operating against stale catalogs. The architecture commits to using them rather than polling.",
        source: "MCP specification compatibility analysis.",
        strength: "medium",
      },
      {
        id: "ev_pilot_scope",
        claims_supported: ["claim_pilot"],
        evidence_type: "scenario_analysis",
        summary:
          "60-day pilot decomposes into: weeks 1–2 domain selection + control envelope + cost model; weeks 3–6 plugin authoring + integration; weeks 7–8 cold-agent eval against the buyer's task set; week 9 readout and pilot/no-pilot recommendation.",
        source: "Pilot proposal template.",
        strength: "high",
      },
      {
        id: "ev_cost_comparison",
        claims_supported: ["claim_core", "claim_pilot"],
        evidence_type: "financial_model",
        summary:
          "TCO model contrasting a 60-day pilot against the buyer's existing 2–6-week-per-domain cold-start cost across the top-3 internal-domain initiative. Numbers populated in pilot week 1; the model itself is portable past pilot exit. First-implementation terms reduce pilot cost to cost-recovery on services with no software fee.",
        source: "Commercial-model template; finance team co-fills.",
        strength: "high",
        warrant:
          "If the buyer's existing cold-start cost across three domains exceeds the pilot's services-at-cost-recovery price, the pilot is dominantly cheaper before any architectural claim is even tested. The TCO model lets the buyer's finance team verify this on their own numbers, not the vendor's.",
      },
      {
        id: "ev_open_source_signals",
        claims_supported: ["claim_core"],
        evidence_type: "logical_argument",
        summary:
          "The runtime, plugin model, MCP server, and renderer pipeline ship as inspectable code. Architectural commitments (event sourcing, verb/resource/prompt/expression layering) are documented at the design-rationale level, not as marketing claims. The code itself is the strongest precedent the project can offer in the absence of a paying reference customer.",
        source: "Public repository: README.md, PURPOSE.md, source tree.",
        strength: "medium",
      },
      {
        id: "ev_implementation_timeline",
        claims_supported: ["claim_pilot"],
        evidence_type: "scenario_analysis",
        summary:
          "60-day pilot decomposed week-by-week into four phases with named deliverables and gate criteria. Weeks 1–2: domain selection + control envelope + cost-model setup. Weeks 3–6: plugin authoring + observability integration. Weeks 7–8: cold-agent eval execution. Week 9: readout, pilot/no-pilot recommendation, signed control mapping.",
        source: "Pilot SOW template, version-stable.",
        strength: "high",
      },
      {
        id: "ev_first_partner_terms",
        claims_supported: ["claim_pilot"],
        evidence_type: "financial_model",
        summary:
          "First-implementation-partner terms: software fee waived; professional services billed at cost-recovery (~50% of standard pilot rate); co-design rights to v2 plugin contract; case study and eval write-up co-authored; named-reference attestation; roadmap priority for the buyer's chosen domain. Time-bounded — terms expire when we close customer #2. Standard pricing applies thereafter.",
        source: "First-implementation partnership term sheet, draft v0.3.",
        strength: "high",
      },
    ],

    risks: [
      {
        id: "risk_unproven_architecture",
        description:
          "FDPM's architecture is explicitly described as a hypothesis. The eval may show the design doesn't beat the buyer's existing stack on the chosen domain.",
        likelihood: "medium",
        impact: "high",
        mitigation:
          "The pilot's exit criteria include the eval result. A failing eval ends the pilot at predictable cost; the operation log artifact remains usable for compliance work regardless.",
        owner: "AI/ML Platform lead",
      },
      {
        id: "risk_lock_in",
        description:
          "Adoption ties internal plugins to FDPM's plugin contract; if FDPM is later abandoned, plugins must be rewritten.",
        likelihood: "low",
        impact: "medium",
        mitigation:
          "Plugin business logic is portable: plugins manipulate domain primitives, not FDPM internals. Operation log is a typed event stream consumable independently of the runtime.",
        owner: "VP Engineering",
      },
      {
        id: "risk_compliance_gap",
        description:
          "CISO review may surface gaps between the operation log and existing SOC 2 / change-management controls.",
        likelihood: "medium",
        impact: "high",
        mitigation:
          "Pilot week 1 deliverable is the control-envelope mapping; pilot is gated on CISO sign-off before any production-system access.",
        owner: "CISO",
      },
      {
        id: "risk_pilot_overrun",
        description:
          "60-day pilot expands mid-flight, eating engineering capacity allocated to other Q3 commitments.",
        likelihood: "medium",
        impact: "medium",
        mitigation:
          "Pilot scope is fixed in the SOW; expansions require a new SOW and explicit re-approval.",
        owner: "VP Engineering",
      },
      {
        id: "risk_internal_build_distraction",
        description:
          "Pilot demotivates the in-house team that's already building toward an internal solution.",
        likelihood: "low",
        impact: "medium",
        mitigation:
          "Champion EM owns the pilot end-to-end; the in-house build informs pilot evaluation criteria rather than competing with it.",
        owner: "Engineering Manager (champion)",
      },
      {
        id: "risk_first_mover_burden",
        description:
          "As the first-implementation partner, the buyer carries higher direct support coupling than later customers. Vendor-side stability is unproven at customer scale; ad-hoc fixes will be more frequent than in a mature relationship.",
        likelihood: "medium",
        impact: "medium",
        mitigation:
          "Direct line to the FDPM core team during the pilot; named on-call coverage for pilot-blocking issues; SLA written into the partnership term sheet. Co-design rights are intended specifically to keep this asymmetry productive.",
        owner: "FDPM go-to-market lead",
      },
    ],

    decision_frame: {
      decision_needed: true,
      decision_question:
        "Should leadership approve a 60-day FDPM pilot scoped to one bounded internal domain?",

      decision_criteria: [
        "Audit-control feasibility (CISO bar)",
        "Cold-agent eval result on the buyer's domain",
        "Total-cost-of-pilot vs. internal-build alternative",
        "Reversibility (operation log portability)",
        "Engineering capacity impact",
        "Strategic alignment with AI-platform v2",
      ],

      options: [
        {
          id: "opt_full_adoption",
          label: "Full adoption across the top-3 domains",
          kind: "rejected",
          description:
            "Skip the pilot; commit FDPM as the runtime substrate for the planned top-3 internal-domain initiative.",
          pros: [
            "Maximum velocity if the architecture is right",
            "Forcing function for organizational alignment",
          ],
          cons: [
            "No falsification before commitment",
            "High capacity exposure",
            "CISO review fights three battles at once",
          ],
          risk_ids: [
            "risk_unproven_architecture",
            "risk_compliance_gap",
            "risk_pilot_overrun",
          ],
          decision_relevance:
            "Not recommended; ignores the option-value of running the pilot's eval first.",
        },
        {
          id: "opt_pilot",
          label: "60-day pilot under first-implementation-partner terms",
          kind: "recommended",
          description:
            "Approve a bounded SOW pilot under first-partner terms: software fee waived, services at cost-recovery (~50% of standard), co-design rights to v2, named-reference attestation, roadmap priority for the chosen domain. CISO defines control envelope; champion EM owns scope; cold-agent eval defines exit. Time-bounded: terms expire when customer #2 closes.",
          pros: [
            "Falsification before broader investment",
            "Concrete compliance artifact in week 1",
            "Reversible: operation log portable past pilot exit",
            "Sized to fit Q3 engineering capacity",
            "Net cost lower than internal-build estimate (first-partner terms)",
            "Co-design influence on v2 plugin contract",
            "Named-reference rights mutual",
          ],
          cons: [
            "60-day delay vs. immediate adoption",
            "Engineering capacity commitment in scope",
            "Pilot may conclude unfavorably",
            "First-mover support coupling (vendor stability unproven at customer scale)",
          ],
          risk_ids: [
            "risk_pilot_overrun",
            "risk_compliance_gap",
            "risk_first_mover_burden",
          ],
          decision_relevance:
            "Recommended option. Converts the architectural hypothesis into a measurable result inside the buyer's planning horizon, at the lowest-cost moment available.",
          differentiation_claim_ids: ["claim_pilot"],
        },
        {
          id: "opt_internal_build",
          label: "Internal build only",
          kind: "internal_build",
          description:
            "Skip FDPM; have the platform team build the runtime layer in-house on existing event-sourcing primitives.",
          pros: [
            "No external dependency",
            "Familiar build process",
          ],
          cons: [
            "Higher up-front engineering cost",
            "Reinvents the cold-agent eval harness",
            "Loses architectural cross-pollination from external use",
          ],
          risk_ids: ["risk_internal_build_distraction"],
          decision_relevance:
            "Fallback if the pilot's evaluation fails to clear FDPM's bar.",
          differentiation_claim_ids: ["claim_core", "claim_pilot"],
        },
        {
          id: "opt_status_quo",
          label: "Continue with current MCP / agent-framework stack",
          kind: "status_quo",
          description:
            "Keep shipping narrow agent prototypes on the current stack; defer the runtime decision.",
          pros: [
            "No new commitment",
            "Preserves option to adopt eventual ecosystem standard",
          ],
          cons: [
            "Compounds the audit / attention / cold-start costs",
            "Top-3 internal-domain initiative blocked at compliance review",
            "Champion team likely to leave for another stack",
          ],
          risk_ids: [],
          decision_relevance:
            "Baseline. Useful for comparison; not a recommended answer to the buyer's stated 2026 commitments.",
          differentiation_claim_ids: ["claim_audit", "claim_cold_start"],
        },
      ],

      recommendation: {
        recommended_option_id: "opt_pilot",
        recommendation:
          "Approve a 60-day FDPM pilot scoped to one bounded internal domain, gated on a CISO-defined audit-control envelope.",
        rationale:
          "The pilot converts the architectural hypothesis into a measurable result against the buyer's own audit, attention, and cold-start bars at materially lower cost than internal build.",
        conditions: [
          "Domain owner identified within two weeks of pilot start.",
          "CISO defines the minimum control envelope in pilot week 1.",
          "Cold-agent eval threshold defined before any plugin authoring.",
          "Pilot scope is fixed in SOW; expansion requires re-approval.",
          "Operation log integrates with existing observability pipeline by pilot exit.",
        ],
        next_steps: [
          "Name the pilot domain (planning, knowledge ops, or incident response).",
          "Schedule CISO control-envelope working session.",
          "Define cold-agent eval threshold against the chosen domain's task set.",
          "Stand up the operation-log observability bridge.",
          "Return at day 60 with pilot/no-pilot recommendation and TCO model.",
        ],
      },
    },

    persuasion_plan: {
      primary_strategy: getStrategy("tradeoff_transparency"),

      supporting_strategies: [
        getStrategy("logos_reasoning"),
        getStrategy("risk_avoidance"),
      ],

      persuasion_sequence: [
        {
          order: 1,
          strategy_id: "logos_reasoning",
          rhetorical_move: "establish_stakes",
          intended_effect_on_audience:
            "Make the audience own the three failure modes as their own current cost, not the vendor's marketing.",
          deck_section_or_slide_role: "opening",
        },
        {
          order: 2,
          strategy_id: "logos_reasoning",
          rhetorical_move: "define_problem",
          intended_effect_on_audience:
            "Compress audit gap, attention degradation, and cold-start cost into one architectural frame the rest of the deck answers.",
          deck_section_or_slide_role: "problem",
        },
        {
          order: 3,
          strategy_id: "logos_reasoning",
          rhetorical_move: "show_mechanism",
          intended_effect_on_audience:
            "Show the four-part vocabulary as a concrete mechanism, not a slide-deck-friendly diagram.",
          deck_section_or_slide_role: "model",
        },
        {
          order: 4,
          strategy_id: "tradeoff_transparency",
          rhetorical_move: "compare_alternatives",
          intended_effect_on_audience:
            "Force the alternatives onto explicit dimensions; make 'wait for ecosystem maturity' a quantifiable choice, not a default.",
          deck_section_or_slide_role: "tradeoff",
        },
        {
          order: 5,
          strategy_id: "risk_avoidance",
          rhetorical_move: "show_risk",
          intended_effect_on_audience:
            "Demonstrate the buyer's risk model is built into the pilot exit criteria — not deferred.",
          deck_section_or_slide_role: "risk",
        },
        {
          order: 6,
          strategy_id: "tradeoff_transparency",
          rhetorical_move: "address_objections",
          intended_effect_on_audience:
            "Reduce resistance by taking on the four predictable objections directly with bounded rebuttals.",
          deck_section_or_slide_role: "objection",
        },
        {
          order: 7,
          strategy_id: "tradeoff_transparency",
          rhetorical_move: "make_decision_ask",
          intended_effect_on_audience:
            "Convert the case into a bounded yes/no with explicit conditions visible to every approver in the room.",
          deck_section_or_slide_role: "decision",
        },
      ],

      ethical_constraints: [
        {
          rule: "Do not promise quantitative cold-agent benchmark numbers the pilot has not produced.",
          rationale:
            "Any number cited before the pilot is a marketing claim, not evidence; the deck's credibility depends on keeping evidence and projection separate.",
        },
        {
          rule: "Do not minimize the architecture's hypothesis status.",
          rationale:
            "The buyer is technical; pretending the architecture is settled science would be transparently wrong and would lose the room.",
        },
      ],
    },

    slide_plan: [
      {
        slide_number: 1,
        title: "Your agents work in the demo. They die at audit.",
        role_in_deck: "opening",
        key_message:
          "Three failure modes — audit gap, attention degradation, cold-start cost — block agent-driven workflows from production. They show up as compliance review, eval regressions, and 2–6-week per-domain spin-up.",
        audience_question_answered:
          "Why is the runtime question worth this meeting?",
        narrative_steps: [1],
        content_blocks: [
          {
            type: "headline",
            purpose: "Frame the production gap, not the demo gap.",
            content_summary:
              "Agent prototypes don't fail in the lab; they fail at the gate to production. Audit, attention, cold-start.",
          },
          {
            type: "callout",
            purpose: "Anchor on the buyer's existing roadmap.",
            content_summary:
              "Top-3 internal-domain initiative + SOC 2 controls extension to AI-actuated changes — the costs of these three failure modes are already on the roadmap.",
          },
        ],
        visual_strategy: {
          layout: "single_message",
          density: "low",
          focal_point: "The three failure modes",
          visual_hierarchy: [
            { element: "Title", priority: "primary" },
            { element: "Three failure modes", priority: "primary" },
            { element: "Roadmap anchor", priority: "secondary" },
          ],
        },
        speaker_intent:
          "Open with the buyer's cost, not the product's features. Establish that the room shares a problem; FDPM is the answer to that problem.",
        supports_claim_ids: ["claim_core"],
        rhetorical_moves: ["establish_stakes", "define_problem"],
        expected_audience_responses: [
          {
            segment_id: "seg_cto",
            expected_emotion: "skepticism",
            secondary_emotion: "interest",
            expected_reactions: ["lean_back", "ask_clarifying_question"],
            confidence: "high",
          },
          {
            segment_id: "seg_em_champion",
            expected_emotion: "validation",
            expected_reactions: ["nod", "lean_in"],
            confidence: "high",
          },
          {
            segment_id: "seg_aimlp",
            expected_emotion: "interest",
            secondary_emotion: "curiosity",
            expected_reactions: ["take_notes", "lean_in"],
            confidence: "medium",
          },
          {
            segment_id: "seg_ciso",
            expected_emotion: "skepticism",
            secondary_emotion: "discomfort",
            expected_reactions: ["lean_back", "ask_challenging_question"],
            confidence: "medium",
            if_off_target:
              "If CISO is more hostile than predicted, foreshadow the operation log artifact early instead of waiting for slide 5.",
          },
        ],
      },
      {
        slide_number: 2,
        title:
          "Audit, attention, and cold-start are blocking your agent rollout today",
        role_in_deck: "problem",
        key_message:
          "Audit gap kills agent prototypes at compliance review. Attention degradation is empirically observable past 30–50 tools. Cold-start cost is 2–6 weeks per new domain — and the buyer has more than three on the 2026 roadmap.",
        audience_question_answered: "Where exactly is the cost?",
        narrative_steps: [2],
        content_blocks: [
          {
            type: "diagram",
            purpose: "Show the three failure modes side-by-side.",
            content_summary: "visual_three_failure_modes",
            visual_artifact_id: "visual_three_failure_modes",
          },
          {
            type: "text",
            purpose: "Quantify each failure mode in the buyer's terms.",
            content_summary:
              "~3-month median delay at compliance review; task-success regression past tool-catalog threshold; 2–6 weeks per domain to reach baseline competence.",
          },
        ],
        visual_strategy: {
          layout: "three_column",
          density: "medium",
          focal_point: "The three failure modes",
          visual_hierarchy: [
            { element: "Audit gap", priority: "primary" },
            { element: "Attention degradation", priority: "primary" },
            { element: "Cold-start cost", priority: "primary" },
          ],
        },
        speaker_intent:
          "Make the three failure modes concrete enough that the audience recognizes them as their own current cost, not abstract architectural critique.",
        supports_claim_ids: [
          "claim_audit",
          "claim_attention",
          "claim_cold_start",
        ],
        rhetorical_moves: ["define_problem", "establish_stakes"],
        expected_audience_responses: [
          {
            segment_id: "seg_aimlp",
            expected_emotion: "validation",
            expected_reactions: ["nod", "take_notes"],
            confidence: "high",
          },
          {
            segment_id: "seg_vpe",
            expected_emotion: "interest",
            expected_reactions: ["take_notes"],
            confidence: "medium",
          },
        ],
      },
      {
        slide_number: 3,
        title:
          "FDPM is a runtime substrate, not an agent framework",
        role_in_deck: "definition",
        key_message:
          "FDPM is an agent runtime substrate that exposes domain operations through MCP with audit and replay built in. It is not an agent framework; LangChain and friends sit *above* it as consumers, not alternatives.",
        audience_question_answered: "What exactly are we evaluating?",
        narrative_steps: [3],
        content_blocks: [
          {
            type: "table",
            purpose: "Define scope boundaries.",
            content_summary:
              "Is: runtime substrate, MCP server, plugin model, operation log, renderer pipeline. Is not: agent framework, LLM provider, prompt-engineering tool.",
          },
          {
            type: "callout",
            purpose: "Neutralize the framework-confusion objection.",
            content_summary:
              "If you're shopping for an agent framework, FDPM is the wrong product. If you're shopping for the substrate that runs underneath one, FDPM is the conversation.",
          },
        ],
        visual_strategy: {
          layout: "two_column",
          density: "medium",
          focal_point: "Scope boundary",
          visual_hierarchy: [
            { element: "Is", priority: "primary" },
            { element: "Is not", priority: "primary" },
          ],
        },
        speaker_intent:
          "Defuse the 'another agent framework' reflex up front. The conversation is about the layer beneath the agent, not the agent itself.",
        supports_claim_ids: ["claim_core"],
        rhetorical_moves: ["address_objections", "show_mechanism"],
        expected_audience_responses: [
          {
            segment_id: "seg_aimlp",
            expected_emotion: "relief",
            secondary_emotion: "interest",
            expected_reactions: ["nod", "lean_in"],
            confidence: "high",
          },
          {
            segment_id: "seg_cto",
            expected_emotion: "interest",
            expected_reactions: ["take_notes", "ask_clarifying_question"],
            confidence: "medium",
          },
        ],
      },
      {
        slide_number: 4,
        title:
          "Verb / resource / prompt / expression — each axis answers one failure mode",
        role_in_deck: "model",
        key_message:
          "Verbs (named operations), resources (URI-addressed reads), prompts (orientation slots), expressions (composition). Each axis maps to one of the three failure modes; together they form an installable surface a cold agent can drive.",
        audience_question_answered: "How does the architecture actually work?",
        narrative_steps: [4],
        content_blocks: [
          {
            type: "diagram",
            purpose: "Show the four-part vocabulary stack.",
            content_summary: "visual_vocabulary_stack",
            visual_artifact_id: "visual_vocabulary_stack",
          },
          {
            type: "text",
            purpose: "Bind each axis to its failure mode.",
            content_summary:
              "Verbs → audit (named ops are auditable). Resources → attention (reads don't bloat the tool catalog). Prompts → cold-start (orientation ships with the plugin). Expressions → composition under one tool.",
          },
        ],
        visual_strategy: {
          layout: "stack",
          density: "medium",
          focal_point: "Vocabulary stack",
          visual_hierarchy: [
            { element: "Verbs", priority: "primary" },
            { element: "Resources", priority: "primary" },
            { element: "Prompts", priority: "secondary" },
            { element: "Expressions", priority: "secondary" },
          ],
        },
        speaker_intent:
          "Make the four-part split feel deliberate, not decorative. Each axis exists because of a failure mode; the architecture is the answer to those failure modes, in that order.",
        supports_claim_ids: [
          "claim_audit",
          "claim_attention",
          "claim_cold_start",
        ],
        uses_evidence_ids: ["ev_attention_design", "ev_plugin_model"],
        rhetorical_moves: ["show_mechanism", "show_feasibility"],
        expected_audience_responses: [
          {
            segment_id: "seg_aimlp",
            expected_emotion: "interest",
            secondary_emotion: "curiosity",
            expected_reactions: [
              "ask_clarifying_question",
              "ask_challenging_question",
              "take_notes",
            ],
            confidence: "high",
          },
          {
            segment_id: "seg_vpe",
            expected_emotion: "interest",
            expected_reactions: ["take_notes", "nod"],
            confidence: "medium",
          },
        ],
      },
      {
        slide_number: 5,
        title: "Operation log: every change is an auditable op",
        role_in_deck: "evidence",
        key_message:
          "Event-sourced, typed, namespaced. Each op carries actor, plugin_id, request_id, causation_op_id. Replay is deterministic. The log is the source of truth — not a serialized snapshot — and it is the artifact compliance review consumes.",
        audience_question_answered:
          "Where is the compliance and audit story, concretely?",
        narrative_steps: [5],
        content_blocks: [
          {
            type: "evidence",
            purpose: "Show the operation log structure.",
            content_summary: "visual_operation_log",
            visual_artifact_id: "visual_operation_log",
          },
          {
            type: "table",
            purpose: "Map operation log fields to SOC 2 controls.",
            content_summary:
              "actor → CC6.1 access controls; request_id → CC7.2 change tracking; causation_op_id → CC7.3 incident traceability.",
          },
        ],
        visual_strategy: {
          layout: "two_column",
          density: "high",
          focal_point: "Op-log → control mapping",
          visual_hierarchy: [
            { element: "Op record", priority: "primary" },
            { element: "Control mapping", priority: "primary" },
          ],
        },
        speaker_intent:
          "Speak directly to the CISO: this is the artifact, this is the mapping, this is what your team will review.",
        supports_claim_ids: ["claim_audit"],
        uses_evidence_ids: ["ev_architecture_audit", "ev_compliance_path"],
        addresses_objection_ids: ["obj_audit"],
        rhetorical_moves: ["show_evidence", "show_feasibility"],
        expected_audience_responses: [
          {
            segment_id: "seg_ciso",
            expected_emotion: "skepticism",
            secondary_emotion: "validation",
            expected_reactions: [
              "ask_challenging_question",
              "request_more_info",
              "drop_objection",
            ],
            confidence: "high",
            if_off_target:
              "If CISO remains hostile, offer to pre-share the control-envelope template before reconvening.",
          },
          {
            segment_id: "seg_cto",
            expected_emotion: "interest",
            expected_reactions: ["nod", "take_notes"],
            confidence: "medium",
          },
        ],
      },
      {
        slide_number: 6,
        title:
          "We have no paying customer yet — and we are disclosing it directly",
        role_in_deck: "evidence",
        key_message:
          "We have no paying reference customer yet — that is honestly the situation. Here's what we offer for evaluation in its place: public architecture under critique, runnable runtime, eval harness, plugin model already shipped. The absence of a logo wall is not the gap; the offer addresses it directly two slides from now.",
        audience_question_answered:
          "What can we actually inspect to evaluate this?",
        narrative_steps: [6],
        content_blocks: [
          {
            type: "evidence",
            purpose: "Disclose the precedent we DO have, not the one we don't.",
            content_summary:
              "Inspectable: runtime + plugin model shipping today. Falsifiable: published cold-agent eval methodology. Reviewable: full source + design rationale. Time-bound: this is the evidence available before the pilot produces its own.",
          },
          {
            type: "callout",
            purpose: "Foreshadow the offer slide.",
            content_summary:
              "The first-implementation-partner offer (slide 11) addresses the absent case study directly — the buyer becomes the first reference, in exchange for materially reduced cost.",
          },
        ],
        visual_strategy: {
          layout: "two_column",
          density: "medium",
          focal_point: "What we have vs. what we don't",
          visual_hierarchy: [
            { element: "Available evidence", priority: "primary" },
            { element: "What is honestly absent", priority: "primary" },
            { element: "Foreshadow the offer", priority: "secondary" },
          ],
        },
        speaker_intent:
          "Pre-empt the 'where's your case study?' challenge by naming the gap directly. Honesty here buys credibility for everything after.",
        supports_claim_ids: ["claim_core"],
        uses_evidence_ids: ["ev_open_source_signals"],
        rhetorical_moves: ["address_objections", "show_evidence"],
        expected_audience_responses: [
          {
            segment_id: "seg_cto",
            expected_emotion: "validation",
            secondary_emotion: "interest",
            expected_reactions: ["nod", "lean_in"],
            confidence: "medium",
          },
          {
            segment_id: "seg_vpe",
            expected_emotion: "interest",
            expected_reactions: ["take_notes"],
            confidence: "medium",
          },
          {
            segment_id: "seg_aimlp",
            expected_emotion: "interest",
            secondary_emotion: "curiosity",
            expected_reactions: ["take_notes", "lean_in"],
            confidence: "high",
          },
          {
            segment_id: "seg_em_champion",
            expected_emotion: "validation",
            expected_reactions: ["nod"],
            confidence: "high",
          },
        ],
      },
      {
        slide_number: 7,
        title:
          "The bounded pilot wins on every dimension that matters before commitment",
        role_in_deck: "tradeoff",
        key_message:
          "Compare the four options on the dimensions the buyer's roadmap actually depends on: audit, attention, cold-start, integration cost, exit cost, capacity exposure. The bounded pilot wins on every dimension that matters before commitment.",
        audience_question_answered:
          "How does this compare to our other options?",
        narrative_steps: [7],
        content_blocks: [
          {
            type: "matrix",
            purpose: "Compare alternatives on explicit dimensions.",
            content_summary: "visual_tradeoff_matrix",
            visual_artifact_id: "visual_tradeoff_matrix",
          },
          {
            type: "summary",
            purpose: "State the decision-relevant implication.",
            content_summary:
              "Status quo defers the decision; full adoption skips the falsification step; internal build buys familiarity at higher cost; bounded pilot is the only option that produces evidence at bounded capacity exposure.",
          },
        ],
        visual_strategy: {
          layout: "matrix",
          density: "high",
          focal_point: "Comparison dimensions",
          visual_hierarchy: [
            { element: "Audit", priority: "primary" },
            { element: "Attention", priority: "primary" },
            { element: "Cold-start", priority: "primary" },
            { element: "Capacity exposure", priority: "secondary" },
            { element: "Exit cost", priority: "secondary" },
          ],
        },
        speaker_intent:
          "Force the room to evaluate on explicit dimensions. 'Wait for the ecosystem' becomes a quantifiable choice, not a default.",
        supports_claim_ids: ["claim_core", "claim_pilot"],
        uses_evidence_ids: ["ev_cost_comparison"],
        addresses_objection_ids: ["obj_internal_build"],
        rhetorical_moves: ["compare_alternatives", "show_tradeoffs"],
        expected_audience_responses: [
          {
            segment_id: "seg_cto",
            expected_emotion: "interest",
            secondary_emotion: "agreement",
            expected_reactions: ["nod", "take_notes", "ask_challenging_question"],
            confidence: "high",
          },
          {
            segment_id: "seg_vpe",
            expected_emotion: "validation",
            expected_reactions: ["nod", "take_notes"],
            confidence: "medium",
          },
        ],
      },
      {
        slide_number: 8,
        title:
          "Every must-severity objection has a bounded, pilot-scoped answer",
        role_in_deck: "objection",
        key_message:
          "Architecture is hypothesis (not settled). Lock-in is real but bounded by plugin portability. Audit needs a CISO-defined envelope, not a marketing claim. Internal build is a viable alternative the pilot itself measures.",
        audience_question_answered: "Are we being honest about what's unknown?",
        narrative_steps: [8],
        content_blocks: [
          {
            type: "table",
            purpose: "Map objections to bounded responses.",
            content_summary:
              "Each predictable objection mapped to its rebuttal, the evidence backing it, and the pilot deliverable that closes it.",
          },
        ],
        visual_strategy: {
          layout: "three_column",
          density: "medium",
          focal_point: "Objection handling",
          visual_hierarchy: [
            { element: "Objection", priority: "primary" },
            { element: "Response", priority: "primary" },
            { element: "Pilot deliverable", priority: "secondary" },
          ],
        },
        speaker_intent:
          "Demonstrate the team has internalized the strongest objections. Credibility comes from accepting them, not arguing past them.",
        supports_claim_ids: ["claim_core", "claim_pilot"],
        uses_evidence_ids: [
          "ev_pilot_scope",
          "ev_cold_agent_eval",
          "ev_compliance_path",
          "ev_cost_comparison",
        ],
        addresses_objection_ids: [
          "obj_unproven",
          "obj_lock_in",
          "obj_audit",
          "obj_internal_build",
          "obj_attention",
        ],
        rhetorical_moves: ["address_objections", "show_tradeoffs"],
        expected_audience_responses: [
          {
            segment_id: "seg_cto",
            expected_emotion: "validation",
            secondary_emotion: "agreement",
            expected_reactions: ["nod", "drop_objection"],
            confidence: "medium",
          },
          {
            segment_id: "seg_vpe",
            expected_emotion: "agreement",
            expected_reactions: ["nod"],
            confidence: "medium",
          },
        ],
      },
      {
        slide_number: 9,
        title:
          "Every risk has a named owner and a pilot-scoped mitigation",
        role_in_deck: "risk",
        key_message:
          "Hypothesis-stage architecture, MCP ecosystem volatility, pilot overrun, compliance gap, internal-build distraction. Each has a named owner and a pilot-scoped mitigation.",
        audience_question_answered: "What could go wrong?",
        narrative_steps: [9],
        content_blocks: [
          {
            type: "risk",
            purpose: "Surface the highest-impact risks.",
            content_summary:
              "Five risks, each with likelihood × impact, mitigation, and owner.",
          },
        ],
        visual_strategy: {
          layout: "three_column",
          density: "medium",
          focal_point: "Risk-to-mitigation mapping",
          visual_hierarchy: [
            { element: "Risk", priority: "primary" },
            { element: "Mitigation", priority: "primary" },
            { element: "Owner", priority: "secondary" },
          ],
        },
        speaker_intent:
          "Make the risk surface explicit and bounded. The buyer's risk model is built into the pilot, not deferred.",
        supports_claim_ids: ["claim_pilot"],
        uses_evidence_ids: ["ev_pilot_scope"],
        rhetorical_moves: [
          "show_risk",
          "quantify_impact",
          "show_cost_of_inaction",
        ],
        addresses_objection_ids: ["obj_audit"],
        expected_audience_responses: [
          {
            segment_id: "seg_ciso",
            expected_emotion: "interest",
            secondary_emotion: "validation",
            expected_reactions: ["nod", "take_notes"],
            confidence: "medium",
          },
          {
            segment_id: "seg_vpe",
            expected_emotion: "interest",
            expected_reactions: ["take_notes"],
            confidence: "medium",
          },
        ],
      },
      {
        slide_number: 10,
        title:
          "The 60-day pilot delivers a named artifact every two weeks",
        role_in_deck: "model",
        key_message:
          "Weeks 1–2: domain selection + control envelope + cost-model setup. Weeks 3–6: plugin authoring + observability integration. Weeks 7–8: cold-agent eval execution. Week 9: readout + signed control mapping + pilot/no-pilot recommendation.",
        audience_question_answered: "What does the pilot actually look like, week by week?",
        narrative_steps: [10],
        content_blocks: [
          {
            type: "timeline",
            purpose: "Show the four-phase timeline visually.",
            content_summary: "visual_implementation_timeline",
            visual_artifact_id: "visual_implementation_timeline",
          },
          {
            type: "table",
            purpose: "Name the deliverable per phase.",
            content_summary:
              "Phase 1 → control-envelope draft + TCO baseline. Phase 2 → working plugin + observability bridge. Phase 3 → eval result on chosen domain. Phase 4 → readout + signed control mapping + recommendation.",
          },
        ],
        visual_strategy: {
          layout: "timeline",
          density: "medium",
          focal_point: "Weekly deliverable cadence",
          visual_hierarchy: [
            { element: "Phases", priority: "primary" },
            { element: "Deliverables", priority: "primary" },
            { element: "Gates", priority: "secondary" },
          ],
        },
        speaker_intent:
          "Make the pilot feel concrete and bounded. Engineering audience reads 'named deliverable per week' as 'this is real planning, not vibes'.",
        supports_claim_ids: ["claim_pilot"],
        uses_evidence_ids: ["ev_implementation_timeline", "ev_pilot_scope"],
        rhetorical_moves: ["show_mechanism", "show_feasibility"],
        expected_audience_responses: [
          {
            segment_id: "seg_vpe",
            expected_emotion: "validation",
            secondary_emotion: "interest",
            expected_reactions: ["nod", "take_notes"],
            confidence: "high",
          },
          {
            segment_id: "seg_em_champion",
            expected_emotion: "validation",
            expected_reactions: ["nod", "lean_in"],
            confidence: "high",
          },
          {
            segment_id: "seg_cto",
            expected_emotion: "interest",
            expected_reactions: ["take_notes", "ask_clarifying_question"],
            confidence: "medium",
          },
        ],
      },
      {
        slide_number: 11,
        title:
          "First-partner terms make this pilot cheaper than your internal-build estimate",
        role_in_deck: "option",
        key_message:
          "You'd be our first paying customer. Software fee waived; services at cost-recovery (~50% of standard pilot rate); co-design rights to v2 plugin contract; case study and eval write-up co-authored; named-reference attestation. Time-bounded — terms expire when we close customer #2. Standard pricing applies thereafter.",
        audience_question_answered:
          "What does it cost, and why is it offered on these terms?",
        narrative_steps: [11],
        content_blocks: [
          {
            type: "headline",
            purpose: "State the offer plainly.",
            content_summary:
              "Pilot at cost-recovery + co-design rights + reference attestation. Software fee: $0 for the pilot.",
          },
          {
            type: "table",
            purpose: "Lay out the trade explicitly: what each side gives.",
            content_summary:
              "You give: case study rights, eval data, named-reference attestation, co-design feedback. We give: software fee waived, services at cost-recovery, roadmap priority for your domain, direct architectural input to v2.",
          },
          {
            type: "callout",
            purpose: "Disclose the offer's mechanic and time-bound nature.",
            content_summary:
              "We have no paying customer yet; the terms exist because of that. They expire when customer #2 closes — typically that's a 1–2 quarter window from a successful pilot. After that, standard pricing.",
          },
          {
            type: "risk",
            purpose: "Acknowledge the asymmetry of being first.",
            content_summary:
              "First-mover burden is real: vendor stability is unproven at customer scale; you'll see more direct support coupling than later customers. SLA written into the term sheet to bound this.",
          },
        ],
        visual_strategy: {
          layout: "two_column",
          density: "medium",
          focal_point: "The trade",
          visual_hierarchy: [
            { element: "What you give", priority: "primary" },
            { element: "What we give", priority: "primary" },
            { element: "Time-bound + first-mover risk", priority: "secondary" },
          ],
        },
        speaker_intent:
          "Land the offer as a deliberate trade, not a discount. Explicit asymmetry — vendor needs first reference; buyer gets reduced cost + influence — is how the offer survives procurement review.",
        supports_claim_ids: ["claim_pilot"],
        uses_evidence_ids: ["ev_first_partner_terms", "ev_cost_comparison"],
        rhetorical_moves: [
          "show_evidence",
          "show_tradeoffs",
          "show_future_state",
        ],
        expected_audience_responses: [
          {
            segment_id: "seg_cto",
            expected_emotion: "interest",
            secondary_emotion: "skepticism",
            expected_reactions: [
              "ask_challenging_question",
              "request_more_info",
              "take_notes",
            ],
            confidence: "high",
            if_off_target:
              "If CTO reads the offer as desperation rather than honest first-mover dynamics, lean into ev_open_source_signals and the time-bound mechanic — the offer ends when customer #2 closes, which is a credibility signal not a fire-sale signal.",
          },
          {
            segment_id: "seg_vpe",
            expected_emotion: "validation",
            secondary_emotion: "interest",
            expected_reactions: ["nod", "take_notes"],
            confidence: "medium",
          },
          {
            segment_id: "seg_em_champion",
            expected_emotion: "agreement",
            expected_reactions: ["nod", "lean_in", "commit"],
            confidence: "high",
          },
          {
            segment_id: "seg_aimlp",
            expected_emotion: "interest",
            secondary_emotion: "agreement",
            expected_reactions: ["take_notes", "lean_in"],
            confidence: "high",
          },
        ],
      },
      {
        slide_number: 12,
        title:
          "Approve the 60-day pilot under first-partner terms",
        role_in_deck: "recommendation",
        key_message:
          "Approve a pilot scoped to one domain, under first-implementation-partner terms. CISO defines control envelope; champion EM owns scope; cold-agent eval defines exit. Outputs: control mapping, eval result, TCO model — all portable past pilot.",
        audience_question_answered: "What is the recommended action?",
        narrative_steps: [12],
        content_blocks: [
          {
            type: "recommendation",
            purpose: "State the recommendation precisely.",
            content_summary:
              "Approve a 60-day pilot on one bounded internal domain, under first-implementation-partner terms (waived software fee, services at cost-recovery, co-design rights, named-reference attestation). Reject full adoption; prefer pilot now to immediate internal build OR pilot later at standard pricing.",
          },
          {
            type: "matrix",
            purpose: "Compare decision options.",
            content_summary: "visual_decision_options",
            visual_artifact_id: "visual_decision_options",
          },
        ],
        visual_strategy: {
          layout: "matrix",
          density: "medium",
          focal_point: "Recommended option",
          visual_hierarchy: [
            { element: "Recommended option", priority: "primary" },
            { element: "Rejected options", priority: "secondary" },
            { element: "Status quo", priority: "secondary" },
          ],
        },
        speaker_intent:
          "Land the recommendation with confidence. Pilot is the disciplined answer to 'wait for ecosystem maturity' — and under first-partner terms it is also the lowest-cost answer. The window is real but not manufactured.",
        supports_claim_ids: ["claim_pilot"],
        uses_evidence_ids: [
          "ev_pilot_scope",
          "ev_cost_comparison",
          "ev_compliance_path",
          "ev_first_partner_terms",
        ],
        rhetorical_moves: [
          "compare_alternatives",
          "show_tradeoffs",
          "make_decision_ask",
        ],
        expected_audience_responses: [
          {
            segment_id: "seg_cto",
            expected_emotion: "interest",
            secondary_emotion: "agreement",
            expected_reactions: ["nod", "request_more_info"],
            confidence: "medium",
          },
          {
            segment_id: "seg_vpe",
            expected_emotion: "agreement",
            expected_reactions: ["nod", "approve"],
            confidence: "medium",
          },
          {
            segment_id: "seg_em_champion",
            expected_emotion: "validation",
            expected_reactions: ["nod", "lean_in"],
            confidence: "high",
          },
        ],
      },
      {
        slide_number: 13,
        title:
          "Approve the 60-day pilot under first-implementation-partner terms today",
        role_in_deck: "decision",
        key_message:
          "Approve the 60-day pilot under first-implementation-partner terms, name a domain owner, and authorize the CISO control-envelope working session. Reconvene at day 60 with eval result, control mapping, TCO model, and a signed term sheet.",
        audience_question_answered: "What decision is required now?",
        narrative_steps: [13],
        content_blocks: [
          {
            type: "decision",
            purpose: "Make the ask explicit.",
            content_summary:
              "Approve or reject: 60-day pilot scope + first-partner terms. Conditional approvals welcome — CISO bar, domain choice, eval threshold are all conditions, not blockers. The first-partner offer is time-bounded; expires when customer #2 closes.",
          },
          {
            type: "summary",
            purpose: "Close the loop into an actionable principle.",
            content_summary:
              "Even if the pilot's eval rejects FDPM, the operation-log artifact and control-envelope mapping remain portable across runtimes — useful work either way. The first-partner offer is the lowest-cost moment to find out.",
          },
        ],
        visual_strategy: {
          layout: "single_message",
          density: "low",
          focal_point: "Decision ask",
          visual_hierarchy: [
            { element: "Decision requested", priority: "primary" },
            { element: "Conditions", priority: "secondary" },
          ],
        },
        speaker_intent:
          "Convert the case into a bounded yes/no the room can take today. Conditions are visible to every approver in the room.",
        supports_claim_ids: ["claim_core", "claim_pilot"],
        rhetorical_moves: ["make_decision_ask", "show_future_state"],
        expected_audience_responses: [
          {
            segment_id: "seg_cto",
            expected_emotion: "agreement",
            expected_reactions: ["approve", "commit"],
            confidence: "medium",
          },
          {
            segment_id: "seg_vpe",
            expected_emotion: "agreement",
            expected_reactions: ["approve", "request_more_info"],
            confidence: "medium",
          },
          {
            segment_id: "seg_aimlp",
            expected_emotion: "agreement",
            secondary_emotion: "trust",
            expected_reactions: ["approve"],
            confidence: "medium",
          },
          {
            segment_id: "seg_ciso",
            expected_emotion: "skepticism",
            secondary_emotion: "validation",
            expected_reactions: ["request_more_info", "defer"],
            confidence: "high",
            if_off_target:
              "If CISO blocks, escalate to written control-envelope review pre-pilot rather than pushing for verbal approval.",
          },
          {
            segment_id: "seg_em_champion",
            expected_emotion: "validation",
            expected_reactions: ["nod", "commit"],
            confidence: "high",
          },
        ],
      },
      // ========== APPENDIX (slides 14–18) ==========
      // Reference material pulled on demand during Q&A or follow-up.
      // Appendix slides do not carry narrative_steps — they are not
      // part of the linear case progression.
      {
        slide_number: 14,
        title: "Appendix A — Operation log internals",
        role_in_deck: "appendix",
        key_message:
          "Architectural deep-dive on the operation log: typed ops, namespaced kinds, causation chain, replay semantics, time-travel boundaries, undo invariants.",
        audience_question_answered:
          "How does the operation log compose with our existing event-sourcing pipeline?",
        narrative_steps: [],
        content_blocks: [
          {
            type: "diagram",
            purpose: "Show op record structure and replay flow.",
            content_summary:
              "Op record fields (actor, plugin_id, request_id, causation_op_id, kind, payload). Replay produces deterministic state. Inverse ops produce typed undo.",
          },
          {
            type: "text",
            purpose: "Note integration boundaries.",
            content_summary:
              "Operation log emits an event stream consumable by external systems (Kafka, Pulsar, etc.). Plugin-side external side effects remain the plugin author's audit responsibility.",
          },
        ],
        visual_strategy: {
          layout: "diagram_first",
          density: "high",
          focal_point: "Op record + replay",
          visual_hierarchy: [
            { element: "Op record", priority: "primary" },
            { element: "Replay", priority: "primary" },
            { element: "Integration boundaries", priority: "secondary" },
          ],
        },
        speaker_intent:
          "Pulled when CTO or CISO asks how the log integrates with existing infrastructure.",
        supports_claim_ids: ["claim_audit"],
        uses_evidence_ids: ["ev_architecture_audit"],
        rhetorical_moves: ["show_evidence", "show_mechanism"],
      },
      {
        slide_number: 15,
        title: "Appendix B — Plugin authoring walkthrough",
        role_in_deck: "appendix",
        key_message:
          "How a domain becomes a plugin: declare verbs (typed payloads), expose resources (URI-addressed reads), ship prompts (orientation slots), expose expression bindings. Estimated: weekend-of-work for an experienced engineer per domain.",
        audience_question_answered:
          "How hard is it for our team to author a plugin?",
        narrative_steps: [],
        content_blocks: [
          {
            type: "flow",
            purpose: "Walk the plugin authoring sequence.",
            content_summary:
              "Define schema → register verbs → register resources → write orientation prompts → ship plugin → cold agent picks it up at MCP connect.",
          },
          {
            type: "example",
            purpose: "Show a minimal plugin in pseudo-code.",
            content_summary:
              "~80 lines of plugin code suffice for a small domain (e.g., planning). Larger domains scale linearly with the verb surface.",
          },
        ],
        visual_strategy: {
          layout: "flow",
          density: "medium",
          focal_point: "Authoring sequence",
          visual_hierarchy: [
            { element: "Sequence", priority: "primary" },
            { element: "Code shape", priority: "secondary" },
          ],
        },
        speaker_intent:
          "Pulled when VP Engineering asks about adoption curve and developer ergonomics.",
        supports_claim_ids: ["claim_cold_start"],
        uses_evidence_ids: ["ev_plugin_model"],
        rhetorical_moves: ["show_mechanism", "show_feasibility"],
      },
      {
        slide_number: 16,
        title: "Appendix C — Security control envelope template",
        role_in_deck: "appendix",
        key_message:
          "CISO-facing template mapping the operation log to SOC 2 control families (CC6 access, CC7 change/incident, CC8 risk monitoring). Pre-shared before pilot kickoff.",
        audience_question_answered:
          "What does our auditor actually see?",
        narrative_steps: [],
        content_blocks: [
          {
            type: "table",
            purpose: "Map op-log fields to SOC 2 control families.",
            content_summary:
              "Op field → SOC 2 control: actor → CC6.1 (access); request_id → CC7.2 (change tracking); causation_op_id → CC7.3 (incident traceability); replay → CC8.1 (risk monitoring).",
          },
          {
            type: "text",
            purpose: "Note compensating controls for plugin-driven side effects.",
            content_summary:
              "Plugin-side external side effects fall outside the runtime's audit surface; the template enumerates required compensating controls (egress restrictions, allowlist, secondary audit log).",
          },
        ],
        visual_strategy: {
          layout: "two_column",
          density: "high",
          focal_point: "Op-log → control mapping",
          visual_hierarchy: [
            { element: "Mapping table", priority: "primary" },
            { element: "Compensating controls", priority: "secondary" },
          ],
        },
        speaker_intent:
          "Pulled when CISO asks for the artifact their team will actually review. Owned by the compliance presenter.",
        supports_claim_ids: ["claim_audit"],
        uses_evidence_ids: ["ev_compliance_path"],
        rhetorical_moves: ["show_evidence", "show_feasibility"],
      },
      {
        slide_number: 17,
        title: "Appendix D — Hard-question FAQ",
        role_in_deck: "appendix",
        key_message:
          "Direct answers to the four hard questions the deck plans for: failure mode if eval fails, integration with existing event-sourcing, plugin-bad-prompt failure mode, on-call coverage.",
        audience_question_answered:
          "What if … ?",
        narrative_steps: [],
        content_blocks: [
          {
            type: "table",
            purpose: "Map question to direct answer.",
            content_summary:
              "Q: If the eval fails, what survives? — A: control mapping + TCO model + plugin business logic, all portable. Q: How does the op-log compose with our existing event-sourcing pipeline? — A: emits typed event stream; existing sinks consume directly. Q: Plugin author writes a bad prompt? — A: prompt slot is plugin-namespaced; bad prompts degrade that plugin only. Q: 2 AM coverage? — A: named on-call written into first-partner term sheet for pilot duration.",
          },
        ],
        visual_strategy: {
          layout: "two_column",
          density: "high",
          focal_point: "Question → answer",
          visual_hierarchy: [
            { element: "Question", priority: "primary" },
            { element: "Answer", priority: "primary" },
          ],
        },
        speaker_intent:
          "Pulled in Q&A when a hard question lands. Don't proactively present.",
        supports_claim_ids: ["claim_pilot"],
        rhetorical_moves: ["address_objections", "show_feasibility"],
      },
      {
        slide_number: 18,
        title: "Appendix E — Lineage and references",
        role_in_deck: "appendix",
        key_message:
          "What FDPM borrows from, converges with, and deliberately diverges from. Event sourcing (CQRS lineage), MCP Skills (SEP-2640 convergence), spreadsheet/PowerQuery M expression idioms (surface borrowing, semantic divergence).",
        audience_question_answered:
          "Where does this fit in the broader landscape?",
        narrative_steps: [],
        content_blocks: [
          {
            type: "table",
            purpose: "Map influences to specific architectural choices.",
            content_summary:
              "Event sourcing (CQRS) → operation log + replay. MCP Skills (SEP-2640) → progressive disclosure on verbs. Spreadsheet/PowerQuery M → expression-language surface (FILTER, MAP, FOR_EACH, LET). Verbs as syntactically distinct from values → divergence from the spreadsheet model.",
          },
          {
            type: "text",
            purpose: "Note open standards alignment.",
            content_summary:
              "MCP is the agent-facing interface; FDPM tracks the spec, including notification streams (notifications/tools/list_changed, etc.) and resource-URI conventions.",
          },
        ],
        visual_strategy: {
          layout: "two_column",
          density: "medium",
          focal_point: "Influence → choice",
          visual_hierarchy: [
            { element: "Influence", priority: "primary" },
            { element: "Choice", priority: "primary" },
          ],
        },
        speaker_intent:
          "Pulled when AI/ML lead asks about ecosystem position. Reinforces credibility with a technical audience by showing the architecture is positioned in a tradition, not invented from nothing.",
        supports_claim_ids: ["claim_core"],
        uses_evidence_ids: ["ev_attention_design", "ev_open_source_signals"],
        rhetorical_moves: ["show_precedent", "show_evidence"],
      },
    ],

    visual_artifacts: [
      {
        id: "visual_three_failure_modes",
        title: "The three failure modes of agent runtimes",
        artifact_type: "comparison",
        purpose: "explain_structure",
        composition: {
          orientation: "left_to_right",
          information_density: "balanced",
          reveal_strategy: "all_at_once",
          primary_focal_point: "The shared failure pattern",
        },
        required_elements: [
          {
            id: "ve_audit",
            label: "Audit gap",
            communicative_role: "warn",
          },
          {
            id: "ve_attention",
            label: "Attention degradation",
            communicative_role: "warn",
          },
          {
            id: "ve_cold_start",
            label: "Cold-start cost",
            communicative_role: "warn",
          },
        ],
        constraints: { must_be_readable: true, avoid_visual_clutter: true },
      },
      {
        id: "visual_vocabulary_stack",
        title: "FDPM four-part vocabulary",
        artifact_type: "stack",
        purpose: "explain_structure",
        composition: {
          orientation: "top_to_bottom",
          information_density: "balanced",
          reveal_strategy: "section_by_section",
          primary_focal_point: "Mechanism for each failure mode",
        },
        required_elements: [
          {
            id: "ve_verbs",
            label: "Verbs (act)",
            communicative_role: "explain",
          },
          {
            id: "ve_resources",
            label: "Resources (read)",
            communicative_role: "explain",
          },
          {
            id: "ve_prompts",
            label: "Prompts (orient)",
            communicative_role: "explain",
          },
          {
            id: "ve_expressions",
            label: "Expressions (compose)",
            communicative_role: "explain",
          },
        ],
        constraints: { must_be_readable: true, avoid_visual_clutter: true },
      },
      {
        id: "visual_operation_log",
        title: "Operation log → SOC 2 control mapping",
        artifact_type: "table",
        purpose: "support_decision",
        composition: {
          orientation: "left_to_right",
          information_density: "dense",
          reveal_strategy: "all_at_once",
          primary_focal_point: "Op record fields and their control mapping",
        },
        required_elements: [
          {
            id: "ve_op_actor",
            label: "actor",
            communicative_role: "prove",
          },
          {
            id: "ve_op_request",
            label: "request_id",
            communicative_role: "prove",
          },
          {
            id: "ve_op_causation",
            label: "causation_op_id",
            communicative_role: "prove",
          },
          {
            id: "ve_op_replay",
            label: "deterministic replay",
            communicative_role: "prove",
          },
        ],
        constraints: { must_be_readable: true, avoid_visual_clutter: true },
      },
      {
        id: "visual_tradeoff_matrix",
        title: "Substrate vs. status quo vs. internal build",
        artifact_type: "matrix",
        purpose: "show_tradeoffs",
        composition: {
          orientation: "grid",
          information_density: "dense",
          reveal_strategy: "all_at_once",
          primary_focal_point: "Bounded pilot win pattern",
        },
        required_elements: [
          { id: "ve_audit_dim", label: "Audit", communicative_role: "compare" },
          {
            id: "ve_attention_dim",
            label: "Attention",
            communicative_role: "compare",
          },
          {
            id: "ve_coldstart_dim",
            label: "Cold-start",
            communicative_role: "compare",
          },
          {
            id: "ve_capacity_dim",
            label: "Capacity exposure",
            communicative_role: "compare",
          },
          {
            id: "ve_exit_dim",
            label: "Exit cost",
            communicative_role: "compare",
          },
        ],
        constraints: { must_be_readable: true, avoid_visual_clutter: true },
      },
      {
        id: "visual_implementation_timeline",
        title: "60-day pilot timeline",
        artifact_type: "timeline",
        purpose: "show_change_over_time",
        composition: {
          orientation: "left_to_right",
          information_density: "balanced",
          reveal_strategy: "section_by_section",
          primary_focal_point: "Phase deliverables",
        },
        required_elements: [
          {
            id: "ve_phase1",
            label: "Wks 1–2: setup",
            communicative_role: "explain",
          },
          {
            id: "ve_phase2",
            label: "Wks 3–6: plugin + integration",
            communicative_role: "explain",
          },
          {
            id: "ve_phase3",
            label: "Wks 7–8: cold-agent eval",
            communicative_role: "prove",
          },
          {
            id: "ve_phase4",
            label: "Wk 9: readout + signed mapping",
            communicative_role: "decide",
          },
        ],
        constraints: { must_be_readable: true, avoid_visual_clutter: true },
      },
      {
        id: "visual_decision_options",
        title: "Decision options matrix",
        artifact_type: "matrix",
        purpose: "support_decision",
        composition: {
          orientation: "grid",
          information_density: "balanced",
          reveal_strategy: "all_at_once",
          primary_focal_point: "Recommended pilot option",
        },
        required_elements: [
          {
            id: "ve_full",
            label: "Full adoption",
            communicative_role: "compare",
          },
          {
            id: "ve_pilot",
            label: "60-day pilot",
            communicative_role: "decide",
          },
          {
            id: "ve_build",
            label: "Internal build",
            communicative_role: "compare",
          },
          {
            id: "ve_status",
            label: "Status quo",
            communicative_role: "compare",
          },
        ],
        constraints: { must_be_readable: true, avoid_visual_clutter: true },
      },
    ],

    design_system: {
      style: "technical",
      tone_visual_alignment:
        "Technical but executive-readable: monospace for op-log examples, plain language for everything else. Honest about hypothesis status.",
      typography: {
        title_scale: "large",
        body_scale: "standard",
        label_style: "technical",
      },
      color_semantics: [
        { meaning: "Recommended option / pilot path", color_role: "positive" },
        { meaning: "Rejected option / status quo cost", color_role: "negative" },
        { meaning: "Risk or open question", color_role: "warning" },
        { meaning: "Neutral comparison dimension", color_role: "neutral" },
      ],
    },

    quality_rules: [
      {
        id: "qr_no_unverified_numbers",
        rule: "Do not cite quantitative cold-agent benchmark numbers the pilot has not produced.",
        rationale:
          "Audience is technical and will spot fabricated numbers; credibility depends on keeping evidence and projection separate.",
        severity: "must",
        validation_question:
          "Has every cited number either come from a published source or been clearly framed as a pilot deliverable?",
      },
      {
        id: "qr_concede_hypothesis_status",
        rule: "Do not minimize the architecture's hypothesis status.",
        rationale:
          "Pretending the architecture is settled science fails on contact with a senior technical buyer.",
        severity: "must",
        validation_question:
          "Does the deck visibly acknowledge that FDPM's design is unproven at scale?",
      },
    ],

    speaker_plan: {
      presenters: [
        {
          id: "presenter_primary",
          name: "FDPM go-to-market lead",
          role: "primary",
          authority: "owner",
          credibility_basis:
            "Owns the FDPM commercial roadmap; co-authored the architecture and the cold-agent eval design.",
          speaks_for_claim_ids: [
            "claim_core",
            "claim_attention",
            "claim_cold_start",
            "claim_pilot",
          ],
          delivers_slide_numbers: [
            1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 18,
          ],
        },
        {
          id: "presenter_compliance",
          name: "Compliance / SecOps engineering lead",
          role: "subject_matter_expert",
          authority: "expert",
          credibility_basis:
            "Has shipped event-sourced audit pipelines under SOC 2 review; co-authored the operation-log → SOC 2 control mapping.",
          speaks_for_claim_ids: ["claim_audit"],
          delivers_slide_numbers: [5, 16],
        },
      ],

      time_budget: {
        total_minutes: 30,
        presentation_minutes: 22,
        q_and_a_minutes: 6,
        buffer_minutes: 2,
      },

      q_and_a: {
        mode: "at_end",
        expected_questions: [
          {
            id: "q_unproven",
            question:
              "Why should we adopt a runtime that calls itself a hypothesis?",
            likely_asker_segment: "seg_cto",
            prepared_answer:
              "The pilot is the hypothesis test, scoped to one domain at bounded cost. The architecture's eval is built into the project, not bolted on for the meeting.",
            addresses_objection_id: "obj_unproven",
            references_evidence_ids: ["ev_cold_agent_eval", "ev_pilot_scope"],
          },
          {
            id: "q_audit_concrete",
            question:
              "What does our auditor actually look at? Show me the artifact.",
            likely_asker_segment: "seg_ciso",
            prepared_answer:
              "The operation log: every op carries actor, request_id, causation chain. The pilot's first deliverable is the SOC 2 control-mapping table; we share the template before pilot kickoff.",
            addresses_objection_id: "obj_audit",
            references_evidence_ids: [
              "ev_architecture_audit",
              "ev_compliance_path",
            ],
          },
          {
            id: "q_internal_build",
            question:
              "Our platform team can build this. Why pilot externally?",
            likely_asker_segment: "seg_vpe",
            prepared_answer:
              "Both options are real. The pilot's TCO model contrasts them on the buyer's actual workflows. If the cost gap is illusory, the recommendation will say so — that's a useful answer either way.",
            addresses_objection_id: "obj_internal_build",
            references_evidence_ids: ["ev_cost_comparison", "ev_pilot_scope"],
          },
          {
            id: "q_attention",
            question:
              "Why does verb/resource/prompt/expression help with tool attention?",
            likely_asker_segment: "seg_aimlp",
            prepared_answer:
              "Reads stop bloating the catalog because they're URI-addressed resources, not tools. Verbs are summarized at connect with progressive disclosure. The expression language collapses what would otherwise be ten orchestration tools into one. The eval measures this specifically.",
            addresses_objection_id: "obj_attention",
            references_evidence_ids: ["ev_attention_design", "ev_mcp_alignment"],
          },
          {
            id: "q_offer_catch",
            question:
              "What's the catch with the first-implementation offer?",
            likely_asker_segment: "seg_cto",
            prepared_answer:
              "Three real ones, each disclosed on the offer slide. (1) You're the first paying customer; vendor-side stability is unproven at customer scale and you'll see more direct support coupling than later customers will. (2) We get the case study, eval data, and named-reference rights — that's the trade. (3) The terms are time-bounded; they expire when we close customer #2, so if you want them you say yes inside the pilot decision window. Nothing hidden.",
            references_evidence_ids: ["ev_first_partner_terms"],
          },
        ],
        hard_questions_to_prepare_for: [
          "If the eval fails, what survives?",
          "How does the operation log compose with our existing event-sourcing pipeline?",
          "What's the failure mode if a plugin author writes a bad prompt?",
          "Who supports us at 2 AM?",
        ],
        out_of_scope_topics: [
          "LLM model selection",
          "Prompt-engineering toolchain selection",
          "Agent-framework selection above the FDPM substrate",
        ],
      },
    },

    case: {
      theory_of_case:
        "Audit, attention, and cold-start are the three architectural axes the buyer's roadmap already depends on. FDPM is the runtime that makes each first-class; a 60-day bounded pilot is the cheapest credible way to test that claim against the buyer's actual workflows.",

      burden_of_proof: {
        standard: "preponderance",
        must_prove: ["claim_core", "claim_pilot"],
        proof_chain: [
          {
            claim_id: "claim_core",
            evidence_ids: [
              "ev_architecture_audit",
              "ev_attention_design",
              "ev_cost_comparison",
            ],
          },
          {
            claim_id: "claim_pilot",
            evidence_ids: ["ev_pilot_scope", "ev_cost_comparison"],
          },
        ],
      },

      stipulations: [
        {
          id: "stip_hypothesis",
          point_conceded:
            "FDPM's architecture is described by its own authors as a hypothesis, not proven at scale.",
          rationale:
            "Conceding this up front routes the argument away from 'is the architecture right?' to 'is the pilot a low-cost way to find out?', which is where the deck wants to land.",
          preempts_objection_id: "obj_unproven",
        },
        {
          id: "stip_lock_in_real",
          point_conceded:
            "Some lock-in is inherent: plugins target FDPM's contract.",
          rationale:
            "Conceding the surface-level lock-in lets the rebuttal narrow to the portability claim — operation log and plugin business logic are portable past runtime exit.",
          preempts_objection_id: "obj_lock_in",
        },
        {
          id: "stip_internal_build_viable",
          point_conceded:
            "Internal build of an equivalent runtime is technically viable.",
          rationale:
            "Conceding viability lets the comparison happen on cost and time, not on capability. The pilot itself measures the cost gap.",
          preempts_objection_id: "obj_internal_build",
        },
        {
          id: "stip_no_reference_customer",
          point_conceded:
            "FDPM has no paying reference customer yet. The first-implementation offer exists because the buyer would be it; we benefit from the case study, eval data, and reference attestation we don't currently have.",
          rationale:
            "Disclosing the offer's actual mechanic — vendor needs first reference — keeps the trade explicit. Sales decks that bury this turn the offer into a credibility liability the moment the buyer's procurement asks 'what's the catch?'.",
        },
      ],

      order_of_proof: [
        {
          order: 1,
          section_label: "Open the production gap",
          purpose: "setup",
          slide_numbers: [1, 2],
          narrative_steps: [1, 2],
          persuasion_sequence_orders: [1, 2],
          witness_id: "presenter_primary",
          exhibit_ids: [],
          time_allocation_minutes: 3,
          expected_reading_minutes: 3,
        },
        {
          order: 2,
          section_label: "Define the substrate (and what it is not)",
          purpose: "argument",
          slide_numbers: [3, 4],
          narrative_steps: [3, 4],
          persuasion_sequence_orders: [3],
          witness_id: "presenter_primary",
          exhibit_ids: ["ev_attention_design", "ev_plugin_model"],
          time_allocation_minutes: 3,
          expected_reading_minutes: 4,
        },
        {
          order: 3,
          section_label: "Audit and replay are the artifact",
          purpose: "evidence",
          slide_numbers: [5],
          narrative_steps: [5],
          persuasion_sequence_orders: [3],
          witness_id: "presenter_compliance",
          exhibit_ids: ["ev_architecture_audit", "ev_compliance_path"],
          time_allocation_minutes: 3,
          expected_reading_minutes: 2,
        },
        {
          order: 4,
          section_label: "What we can show, honestly",
          purpose: "evidence",
          slide_numbers: [6],
          narrative_steps: [6],
          persuasion_sequence_orders: [3],
          witness_id: "presenter_primary",
          exhibit_ids: ["ev_open_source_signals"],
          time_allocation_minutes: 2,
          expected_reading_minutes: 2,
        },
        {
          order: 5,
          section_label: "Compare the alternatives explicitly",
          purpose: "tradeoff",
          slide_numbers: [7],
          narrative_steps: [7],
          persuasion_sequence_orders: [4],
          witness_id: "presenter_primary",
          exhibit_ids: ["ev_cost_comparison"],
          time_allocation_minutes: 2,
          expected_reading_minutes: 3,
        },
        {
          order: 6,
          section_label: "Take on the objections and risks",
          purpose: "rebuttal",
          slide_numbers: [8, 9],
          narrative_steps: [8, 9],
          persuasion_sequence_orders: [5, 6],
          witness_id: "presenter_primary",
          exhibit_ids: ["ev_pilot_scope"],
          time_allocation_minutes: 3,
          expected_reading_minutes: 3,
        },
        {
          order: 7,
          section_label: "Implementation timeline and first-partner offer",
          purpose: "argument",
          slide_numbers: [10, 11],
          narrative_steps: [10, 11],
          persuasion_sequence_orders: [7],
          witness_id: "presenter_primary",
          exhibit_ids: ["ev_implementation_timeline", "ev_first_partner_terms"],
          time_allocation_minutes: 4,
          expected_reading_minutes: 3,
        },
        {
          order: 8,
          section_label: "Recommend and ask for the decision",
          purpose: "decision",
          slide_numbers: [12, 13],
          narrative_steps: [12, 13],
          persuasion_sequence_orders: [7],
          witness_id: "presenter_primary",
          exhibit_ids: [
            "ev_pilot_scope",
            "ev_cost_comparison",
            "ev_compliance_path",
            "ev_first_partner_terms",
          ],
          time_allocation_minutes: 2,
          expected_reading_minutes: 2,
        },
        {
          // Appendix slides are not part of the linear case progression
          // (no narrative_steps), but the schema's S4 gate requires
          // every slide to belong to SOME section. Group all five
          // appendix slides under one "appendix" section. Time
          // allocation is 0 — appendix is pulled on demand, not
          // scheduled in the linear talk.
          order: 9,
          section_label: "Appendix (pulled on demand)",
          purpose: "close",
          slide_numbers: [14, 15, 16, 17, 18],
          narrative_steps: [],
          persuasion_sequence_orders: [],
          witness_id: "presenter_primary",
          exhibit_ids: [],
          time_allocation_minutes: 0,
          expected_reading_minutes: 5,
        },
      ],

      rebuttal_posture: [
        {
          id: "reb_unproven_to_pilot",
          anticipated_attack:
            "FDPM is unproven; we can't deploy hypothesis-stage runtimes.",
          triggered_by_objection_id: "obj_unproven",
          rebuttal:
            "Agreed it's unproven. The pilot is the proof step, scoped to one domain at bounded cost. The architecture's eval is the falsifiable contract; we run that eval on your domain and report the result. A failing eval ends the pilot — that's a feature, not a risk.",
          fallback_evidence_ids: ["ev_cold_agent_eval", "ev_pilot_scope"],
          pivot_to_slide: 12,
        },
        {
          id: "reb_lock_in_to_portability",
          anticipated_attack:
            "Adopting FDPM locks our plugins to a runtime that may not survive.",
          triggered_by_objection_id: "obj_lock_in",
          rebuttal:
            "Plugins manipulate domain primitives, not FDPM internals; their business logic is portable. The operation log is a typed event stream consumable by any downstream system. If FDPM exits, you keep the plugin code and the audit history.",
          fallback_evidence_ids: ["ev_plugin_model"],
          pivot_to_slide: 5,
        },
        {
          id: "reb_audit_to_envelope",
          anticipated_attack:
            "Agent-actuated changes don't pass our existing controls.",
          triggered_by_objection_id: "obj_audit",
          rebuttal:
            "Correct as stated. The pilot's first deliverable is the operation-log → SOC 2 control mapping, defined by your CISO. No production-system access until that envelope is signed off. That's a gate, not a marketing claim.",
          fallback_evidence_ids: [
            "ev_architecture_audit",
            "ev_compliance_path",
          ],
          pivot_to_slide: 5,
        },
        {
          id: "reb_internal_build_to_comparison",
          anticipated_attack:
            "We can build this internally for less.",
          triggered_by_objection_id: "obj_internal_build",
          rebuttal:
            "You may be right. The pilot's TCO model compares both paths on your actual workflows. If internal build is cheaper at the eval threshold, the pilot recommendation will say so — and the operation-log artifact and control-mapping work remain useful regardless.",
          fallback_evidence_ids: ["ev_cost_comparison", "ev_pilot_scope"],
          pivot_to_slide: 7,
        },
        {
          id: "reb_attention_to_design",
          anticipated_attack:
            "How does this not just add another tool catalog to manage?",
          triggered_by_objection_id: "obj_attention",
          rebuttal:
            "Reads route through MCP resources — not get_*-tools — so the catalog stops growing with the domain. Verbs are summarized at connect; full surface fetched on demand. Expressions collapse what would otherwise be ten orchestration tools into one. The pilot's eval measures tool-attention regression vs. your current stack directly.",
          fallback_evidence_ids: ["ev_attention_design", "ev_mcp_alignment"],
          pivot_to_slide: 4,
        },
      ],

      closing_arc: {
        final_belief_target:
          "The architectural hypothesis is testable, the pilot is bounded, the artifacts (operation log, control mapping, TCO model) are useful regardless of the eval outcome, and the first-implementation-partner terms make this the lowest-cost moment in the buyer's planning horizon to run the test.",
        callback_to_opening:
          "Reopens slide 1: agents that worked in the demo and died at audit. The pilot's first deliverable is the artifact that closes that gate — and the first-partner terms remove cost as a reason to defer.",
        decision_demanded:
          "Approve a 60-day pilot scoped to one bounded internal domain, gated on a CISO-defined audit-control envelope, under first-implementation-partner terms.",
      },

      rehearsal_state: "walked",
    },

    success_criteria: {
      audience_can_explain_back:
        "FDPM is a runtime substrate, not an agent framework, designed around audit / attention / cold-start; the ask is one bounded pilot with built-in falsifiability and portable artifacts.",
      audience_can_decide: true,
      minimum_required_belief:
        "A bounded pilot is the cheapest credible way to test FDPM's architectural claims on the buyer's actual workflows.",
      failure_modes: [
        "Audience interprets the deck as a framework pitch and writes off as 'another LangChain'.",
        "Audience reads the hypothesis acknowledgment as lack of conviction.",
        "Compliance concerns are not visibly answered before the recommendation slide.",
        "Pilot is interpreted as Trojan horse for broader migration.",
      ],
    },
  },
};

export const fdpmSalesDeck = RefinedBusinessDeckSchema.parse(fdpmSalesDeckInput);

export const fdpmSalesDeckValidationReport =
  validateBusinessDeck(fdpmSalesDeck);
