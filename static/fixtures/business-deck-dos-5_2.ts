import { z } from "zod";
import {
  BusinessDeckSchema,
  RefinedBusinessDeckSchema,
  validateBusinessDeck,
  BuiltInPersuasionStrategies,
} from "../schemas/business-deck";

/**
 * DOS 5.2 rollback deck instance
 *
 * Intended validation path:
 *
 * const parsed = RefinedBusinessDeckSchema.parse(dos52RollbackDeckInput);
 * const report = validateBusinessDeck(parsed);
 */

const getStrategy = (id: string) => {
  const strategy = BuiltInPersuasionStrategies.find((s) => s.id === id);
  if (!strategy) {
    throw new Error(`Missing built-in persuasion strategy: ${id}`);
  }
  return strategy;
};

export const dos52RollbackDeckInput: z.input<typeof BusinessDeckSchema> = {
  deck: {
    id: "deck_dos52_rollback_pitch_v1",

    title: "Reconsidering Endpoint Complexity",
    subtitle: "A provocative case for evaluating a DOS 5.2 rollback model",

    description:
      "A strategic provocation deck arguing that extreme endpoint simplification should be evaluated seriously for narrowly bounded enterprise roles, using DOS 5.2 as the intentionally extreme reference model.",

    version: "1.0.0",
    language: "en-US",
    target_duration_minutes: 30,

    presentation_posture: "case",
    delivery_mode: "presented_live",

    objective: {
      primary_intent: "persuade",
      secondary_intents: ["provoke", "compare", "decide"],
      desired_audience_shift: {
        from: "Rolling back endpoints to DOS 5.2 is obviously absurd and not worth discussion.",
        to: "A universal rollback is not credible, but a constrained DOS-like endpoint model may reveal useful simplification, control, and cost-reduction opportunities worth assessing.",
      },
      desired_outcome: "next_step_authorization",
      decision_or_action_requested:
        "Approve a 60-day feasibility assessment for constrained DOS-like endpoint roles, not a universal rollback.",
      success_definition:
        "The audience rejects the simplistic full-rollback idea but authorizes a disciplined pilot assessment of ultra-constrained endpoints and DOS-like operating principles.",
    },

    audience: {
      primary_audience:
        "CIO, CFO, COO, CISO, infrastructure leadership, endpoint engineering leadership",
      audience_type: "executive",
      prior_knowledge: "medium",
      attitude: "skeptical",
      complexity_tolerance: "medium",

      concerns: [
        "Business continuity",
        "Application compatibility",
        "Security and compliance",
        "User productivity",
        "Support cost",
        "Operational feasibility",
        "Reputational risk of appearing unserious",
      ],

      assumptions: [
        "Modern operating systems are required for nearly all enterprise work.",
        "Older operating systems are automatically less secure.",
        "Endpoint complexity is unavoidable because business software is complex.",
        "Cost reduction must preserve the current user-computing model.",
      ],

      likely_objections: [
        {
          id: "obj_absurdity",
          text: "The proposal sounds unserious because DOS 5.2 is obsolete.",
          severity: "must",
          source_segment_id: "seg_cio_infra",
          counter_argument:
            "The deck does not recommend universal DOS adoption; DOS 5.2 is used as an extreme reference model to expose where endpoint complexity is unnecessary.",
        },
        {
          id: "obj_compatibility",
          text: "Modern enterprise work depends on browsers, SaaS, collaboration tools, and modern file formats.",
          severity: "must",
          source_segment_id: "seg_coo",
          counter_argument:
            "The proposal explicitly excludes general knowledge work and focuses only on tightly bounded endpoint roles.",
        },
        {
          id: "obj_security",
          text: "DOS lacks modern security primitives and vendor support.",
          severity: "must",
          source_segment_id: "seg_ciso",
          counter_argument:
            "The model is only viable with isolation, allowlisting, physical controls, restricted network access, and compensating controls.",
        },
        {
          id: "obj_supportability",
          text: "Supporting DOS would create a custom operational burden.",
          severity: "should",
          source_segment_id: "seg_cio_infra",
          counter_argument:
            "That burden is part of the feasibility assessment; the hypothesis is that low endpoint variance may offset part of the custom support cost in narrow roles.",
        },
        {
          id: "obj_total_cost",
          text: "Bespoke support and integration may erase any hardware or licensing savings.",
          severity: "should",
          source_segment_id: "seg_cfo",
          counter_argument:
            "The assessment requires a total-cost model that includes support customness, integration, and reversibility before any pilot is approved.",
        },
      ],

      decision_power: "final_decision_maker",

      what_they_need_to_believe: [
        "The deck is a serious decision exercise, not nostalgia.",
        "Endpoint complexity has real cost and risk.",
        "A universal rollback is not the recommended action.",
        "A constrained endpoint simplification assessment is low-cost enough to justify exploration.",
      ],

      segments: [
        {
          id: "seg_cio_infra",
          label: "CIO and infrastructure leadership",
          audience_type: "executive",
          prior_knowledge: "high",
          attitude: "skeptical",
          complexity_tolerance: "medium",
          decision_power: "approver",
          what_they_need_to_believe: [
            "The proposal does not jeopardize current operational stability.",
            "Endpoint variance is a measurable, addressable cost driver.",
            "A bounded assessment will produce concrete role-suitability evidence, not theory.",
          ],
        },
        {
          id: "seg_cfo",
          label: "CFO and finance leadership",
          audience_type: "executive",
          prior_knowledge: "low",
          attitude: "skeptical",
          complexity_tolerance: "low",
          decision_power: "approver",
          what_they_need_to_believe: [
            "Total cost of endpoint ownership is meaningfully higher than line-item licensing suggests.",
            "The 60-day assessment is itself low-cost and reversible.",
            "Any pilot must include exit criteria before commitment.",
          ],
        },
        {
          id: "seg_ciso",
          label: "CISO and security leadership",
          audience_type: "executive",
          prior_knowledge: "high",
          attitude: "hostile",
          complexity_tolerance: "high",
          decision_power: "approver",
          what_they_need_to_believe: [
            "Security viability of a DOS-like endpoint depends on compensating controls, not the OS.",
            "Compliance and audit posture can be preserved through isolation and allowlisting.",
            "No pilot will be authorized without an explicit security-control model.",
          ],
        },
        {
          id: "seg_coo",
          label: "COO and business operations",
          audience_type: "executive",
          prior_knowledge: "medium",
          attitude: "skeptical",
          complexity_tolerance: "medium",
          decision_power: "final_decision_maker",
          what_they_need_to_believe: [
            "Knowledge work and collaboration roles are explicitly out of scope.",
            "The assessment targets only fixed-function workflows the business already runs in narrow form.",
            "Productivity loss is a gating risk, not an afterthought.",
          ],
        },
      ],
    },

    message_strategy: {
      core_claim: {
        id: "claim_core",
        kind: "core",
        text: "A universal rollback to DOS 5.2 is not a credible enterprise endpoint strategy, but the extreme model exposes a serious opportunity: some endpoint roles may benefit from radical simplification, reduced variability, and tighter operational control.",
      },

      supporting_claims: [
        {
          id: "claim_complexity_cost",
          kind: "supporting",
          parent_claim_id: "claim_core",
          text: "Modern general-purpose endpoints impose hidden cost through patching, background services, hardware churn, licensing, support variance, and security surface area.",
        },
        {
          id: "claim_constrained_fit",
          kind: "supporting",
          parent_claim_id: "claim_core",
          text: "A DOS-like model is only plausible for tightly constrained workflows such as fixed-function stations, kiosks, terminal-driven tasks, or controlled legacy data-entry environments.",
        },
        {
          id: "claim_security_tradeoff",
          kind: "supporting",
          parent_claim_id: "claim_core",
          text: "The security value of a DOS-like endpoint does not come from DOS itself; it comes from isolation, allowlisting, reduced runtime variability, and compensating controls.",
        },
        {
          id: "claim_pilot",
          kind: "action",
          parent_claim_id: "claim_core",
          text: "The appropriate decision is not full rollback, but a feasibility assessment and pilot design for constrained endpoint roles.",
        },
      ],

      misconception_to_correct:
        "The proposal is not that every employee should use DOS for all work; the proposal is to use DOS 5.2 as an extreme reference point for evaluating endpoint simplification.",

      framing_angle: "tradeoff",
      tone: "provocative",

      non_goals: [
        "Do not recommend replacing all modern endpoints with DOS 5.2.",
        "Do not claim DOS is generally more secure than modern operating systems.",
        "Do not ignore compatibility, compliance, or productivity losses.",
        "Do not present nostalgia as evidence.",
      ],

      thesis_pressure_test: {
        strongest_counterargument:
          "Modern work is inseparable from modern operating systems, browsers, cloud collaboration, endpoint security, and managed-device ecosystems.",
        response_strategy:
          "Concede this for general knowledge work, then narrow the decision to fixed-function roles where modern endpoint breadth may be unnecessary.",
      },
    },

    narrative_model: {
      narrative_pattern: "provocation_resolution",
      pacing: "balanced",
      opening_strategy: "provocation",
      closing_strategy: "decision_ask",

      progression: [
        {
          step: 1,
          function: "open",
          message:
            "Introduce the provocative thesis: endpoint complexity should be challenged, even through an extreme DOS 5.2 thought experiment.",
          audience_question_answered:
            "Why are we even discussing something this extreme?",
        },
        {
          step: 2,
          function: "tension",
          message:
            "Show that the current endpoint model carries hidden cost, risk, and operational drag.",
          audience_question_answered:
            "What problem justifies the provocation?",
        },
        {
          step: 3,
          function: "definition",
          message:
            "Define the proposal precisely as a constrained endpoint model assessment, not a universal rollback.",
          audience_question_answered:
            "What exactly is being proposed?",
        },
        {
          step: 4,
          function: "model",
          message:
            "Describe the target operating model: narrow task, fixed hardware profile, approved executable set, restricted interfaces, and central support.",
          audience_question_answered:
            "How would such a model actually work?",
        },
        {
          step: 5,
          function: "tradeoff",
          message:
            "Compare modern OS endpoints against a DOS-like constrained endpoint model across explicit dimensions.",
          audience_question_answered:
            "Where does the idea win and where does it fail?",
        },
        {
          step: 6,
          function: "risk",
          message:
            "Surface the major security, compliance, compatibility, and operational risks.",
          audience_question_answered:
            "What could go wrong?",
        },
        {
          step: 7,
          function: "objection",
          message:
            "Address predictable executive objections directly and separate valid objections from scope misunderstandings.",
          audience_question_answered:
            "Are we being honest about why this sounds unreasonable?",
        },
        {
          step: 8,
          function: "evidence",
          message:
            "Show the evidence path: logical argument, scenario analysis, compatibility inventory, and financial model required for a real decision.",
          audience_question_answered:
            "What proof would be needed before acting?",
        },
        {
          step: 9,
          function: "recommendation",
          message:
            "Recommend a feasibility assessment and reject universal rollback.",
          audience_question_answered:
            "What should leadership approve?",
        },
        {
          step: 10,
          function: "decision",
          message:
            "Ask for a bounded decision: approve or reject a 60-day assessment.",
          audience_question_answered:
            "What decision is needed today?",
        },
        {
          step: 11,
          function: "implication",
          message:
            "Even if DOS is rejected, the organization can adopt DOS-like simplification principles.",
          audience_question_answered:
            "What insight survives if the extreme proposal is rejected?",
        },
        {
          step: 12,
          function: "close",
          message:
            "Close by reframing the provocation as a discipline: reduce endpoint complexity where general-purpose computing is unnecessary.",
          audience_question_answered:
            "What should the audience remember?",
        },
      ],
    },

    conceptual_structure: {
      dominant_model: "comparison",
      secondary_models: ["system", "decision_tree", "cause_effect"],
      abstraction_level: "strategic",
      central_question:
        "Where does modern endpoint complexity create more cost and risk than business value?",
      organizing_principle:
        "Treat DOS 5.2 as an extreme simplification reference model, then evaluate which endpoint roles, if any, justify a constrained operating model.",
      focal_point: "Endpoint operating model",
      peripheral_elements: [
        "Historical nostalgia",
        "Universal employee workstation replacement",
        "Consumer computing experience",
      ],
    },

    information_architecture: {
      entities: [
        {
          id: "ent_modern_endpoint",
          label: "Modern OS endpoint model",
          role: "system",
          description:
            "General-purpose enterprise workstation running a modern managed operating system.",
          importance: "primary",
          confidence: "high",
        },
        {
          id: "ent_dos_endpoint",
          label: "DOS 5.2 constrained endpoint model",
          role: "system",
          description:
            "Extreme constrained endpoint reference model built around minimal runtime, fixed tasks, and low variability.",
          importance: "primary",
          confidence: "medium",
        },
        {
          id: "ent_endpoint_complexity",
          label: "Endpoint complexity",
          role: "risk",
          description:
            "Accumulated administrative, security, compatibility, and support burden of modern general-purpose endpoints.",
          importance: "primary",
          confidence: "high",
        },
        {
          id: "ent_operational_determinism",
          label: "Operational determinism",
          role: "capability",
          description:
            "Ability to keep endpoint behavior predictable by reducing variability.",
          importance: "secondary",
          confidence: "medium",
        },
        {
          id: "ent_compatibility",
          label: "Application compatibility",
          role: "constraint",
          description:
            "Ability of business workflows and applications to run in the proposed endpoint model.",
          importance: "primary",
          confidence: "high",
        },
        {
          id: "ent_security_controls",
          label: "Compensating security controls",
          role: "control",
          description:
            "Isolation, allowlisting, physical control, network restriction, and procedural governance.",
          importance: "primary",
          confidence: "medium",
        },
        {
          id: "ent_pilot_decision",
          label: "60-day feasibility assessment decision",
          role: "decision",
          description:
            "Leadership decision to approve or reject a bounded assessment.",
          importance: "primary",
          confidence: "high",
        },
      ],

      relationships: [
        {
          from: "ent_modern_endpoint",
          to: "ent_endpoint_complexity",
          type: "amplifies",
          directionality: "one_way",
          label: "general-purpose breadth increases operational surface",
          confidence: "medium",
        },
        {
          from: "ent_dos_endpoint",
          to: "ent_operational_determinism",
          type: "enables",
          directionality: "one_way",
          label: "minimal runtime can reduce behavioral variance",
          confidence: "medium",
        },
        {
          from: "ent_compatibility",
          to: "ent_dos_endpoint",
          type: "constrains",
          directionality: "one_way",
          label: "workflow compatibility determines feasibility",
          confidence: "high",
        },
        {
          from: "ent_security_controls",
          to: "ent_dos_endpoint",
          type: "mitigates",
          directionality: "one_way",
          label: "controls compensate for missing modern primitives",
          confidence: "medium",
        },
        {
          from: "ent_pilot_decision",
          to: "ent_dos_endpoint",
          type: "measures",
          directionality: "one_way",
          label: "assessment tests fit before adoption",
          confidence: "high",
        },
      ],

      layers: [
        {
          id: "layer_context",
          label: "Business context",
          purpose: "context",
          order: 1,
          entities: ["ent_modern_endpoint", "ent_endpoint_complexity"],
          is_cross_cutting: false,
        },
        {
          id: "layer_operating_model",
          label: "Operating model",
          purpose: "system_layer",
          order: 2,
          entities: ["ent_dos_endpoint", "ent_operational_determinism"],
          is_cross_cutting: false,
        },
        {
          id: "layer_constraints",
          label: "Constraints and controls",
          purpose: "control_layer",
          order: 3,
          entities: ["ent_compatibility", "ent_security_controls"],
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
          dimension: "Operational simplicity vs application compatibility",
          option_a: "DOS-like constrained endpoint",
          option_b: "Modern general-purpose endpoint",
          implication:
            "The constrained endpoint may reduce operational variance but only works if the task portfolio is extremely narrow.",
          importance: "primary",
        },
        {
          dimension: "Reduced runtime surface vs missing modern security primitives",
          option_a: "Minimal DOS-like runtime",
          option_b: "Modern managed OS with native security stack",
          implication:
            "Security depends less on the OS and more on isolation, allowlisting, access control, and operational governance.",
          importance: "primary",
        },
        {
          dimension: "Hardware longevity vs support customness",
          option_a: "Extend life of low-spec hardware",
          option_b: "Maintain standardized modern hardware refresh",
          implication:
            "Endpoint hardware savings may be offset by specialized support and integration costs.",
          importance: "secondary",
        },
      ],

      unresolved_questions: [
        "Which endpoint roles are narrow enough to qualify?",
        "Which business applications can run or be replaced in a DOS-like model?",
        "What compensating controls satisfy security and compliance requirements?",
        "Does total cost decrease after accounting for custom support and integration?",
      ],
    },

    evidence: [
      {
        id: "ev_logical_complexity",
        claims_supported: ["claim_complexity_cost"],
        evidence_type: "logical_argument",
        summary:
          "A general-purpose endpoint necessarily carries more services, dependencies, update paths, user freedoms, and administrative variance than a fixed-function endpoint.",
        source: "Deck reasoning model; to be validated by endpoint telemetry and support-ticket analysis.",
        strength: "medium",
      },
      {
        id: "ev_comparison_matrix",
        claims_supported: ["claim_constrained_fit"],
        evidence_type: "comparison_matrix",
        summary:
          "A matrix comparing modern OS endpoints with DOS-like constrained endpoints identifies where the model wins, loses, and requires compensating controls.",
        source: "Proposed slide 5 comparison framework.",
        strength: "medium",
      },
      {
        id: "ev_risk_analysis",
        claims_supported: ["claim_security_tradeoff"],
        evidence_type: "risk_analysis",
        summary:
          "Security viability depends on controls outside DOS itself: isolation, allowlisting, restricted I/O, restricted network paths, and procedural governance.",
        source: "Proposed security risk model.",
        strength: "medium",
      },
      {
        id: "ev_pilot_logic",
        claims_supported: ["claim_pilot"],
        evidence_type: "scenario_analysis",
        summary:
          "A bounded feasibility assessment limits downside while producing a role-suitability map, cost model, compatibility inventory, and security-control model.",
        source: "Proposed decision frame.",
        strength: "high",
      },
      {
        id: "ev_total_cost_model",
        claims_supported: ["claim_core", "claim_complexity_cost"],
        evidence_type: "financial_model",
        summary:
          "A total-cost-of-ownership model for general-purpose endpoints, broken down by hardware refresh, OS licensing, endpoint protection, patch management, helpdesk, and lost-productivity events, used to size the share of cost attributable to general-purpose breadth versus task-essential capability.",
        source: "TCO model template to be populated from finance and IT-ops data during the feasibility assessment.",
        strength: "high",
      },
      {
        id: "ev_case_study_kiosk",
        claims_supported: ["claim_constrained_fit"],
        evidence_type: "case_study",
        summary:
          "Documented examples of fixed-function endpoint deployments (kiosks, point-of-sale terminals, manufacturing-line stations) where minimal-runtime systems delivered measurably lower variance and support cost than general-purpose alternatives.",
        source: "Industry case studies; concrete references to be assembled during the feasibility assessment.",
        strength: "medium",
      },
      {
        id: "ev_benchmark_endpoint_variance",
        claims_supported: ["claim_complexity_cost", "claim_core"],
        evidence_type: "benchmark",
        summary:
          "Internal endpoint telemetry benchmark comparing patch volume, support-ticket rate, and configuration drift between general-purpose endpoints and existing fixed-function devices already in the estate.",
        source: "Endpoint management telemetry; ticketing system; baseline to be extracted before the assessment.",
        strength: "medium",
      },
    ],

    risks: [
      {
        id: "risk_compatibility_failure",
        description:
          "Critical workflows may depend on browsers, SaaS applications, collaboration tools, modern authentication, or file formats that cannot run in a DOS-like model.",
        likelihood: "high",
        impact: "high",
        mitigation:
          "Limit assessment to fixed-function roles and require a workflow compatibility inventory before any pilot.",
        owner: "Endpoint engineering / business operations",
      },
      {
        id: "risk_security_gap",
        description:
          "DOS lacks modern native security, identity, encryption, endpoint protection, and patch-management primitives.",
        likelihood: "high",
        impact: "high",
        mitigation:
          "Require network isolation, executable allowlisting, physical control, no general internet access, restricted removable media, and compensating audit controls.",
        owner: "CISO",
      },
      {
        id: "risk_support_burden",
        description:
          "A DOS-like model may create bespoke support, integration, training, and compliance burden.",
        likelihood: "medium",
        impact: "medium",
        mitigation:
          "Include total-cost modeling, support-process design, and pilot exit criteria.",
        owner: "IT operations",
      },
      {
        id: "risk_user_productivity",
        description:
          "Users assigned to incompatible workflows would lose productivity or be unable to work.",
        likelihood: "medium",
        impact: "high",
        mitigation:
          "Exclude knowledge workers and collaboration-heavy roles from scope.",
        owner: "COO / business operations",
      },
    ],

    decision_frame: {
      decision_needed: true,
      decision_question:
        "Should leadership approve a 60-day feasibility assessment for constrained DOS-like endpoint roles?",

      decision_criteria: [
        "Role suitability",
        "Security-control feasibility",
        "Compatibility with required workflows",
        "Total cost after support and integration",
        "Reversibility",
        "Business-disruption risk",
      ],

      options: [
        {
          id: "opt_full_rollback",
          label: "Full DOS 5.2 rollback",
          description:
            "Replace all modern endpoints with DOS 5.2 or a strict DOS-like endpoint model.",
          pros: [
            "Maximum simplicity in theory",
            "Strong provocation against endpoint complexity",
          ],
          cons: [
            "Breaks most modern work",
            "Creates severe security and compliance challenges",
            "Operationally implausible at enterprise scale",
          ],
          risk_ids: [
            "risk_compatibility_failure",
            "risk_security_gap",
            "risk_user_productivity",
          ],
          decision_relevance:
            "Useful only as a thought experiment; not recommended.",
        },
        {
          id: "opt_constrained_assessment",
          label: "60-day constrained endpoint feasibility assessment",
          description:
            "Assess whether any narrow endpoint roles could benefit from a DOS-like constrained operating model.",
          pros: [
            "Low-commitment next step",
            "Produces evidence before adoption",
            "Preserves the strategic insight without forcing premature migration",
          ],
          cons: [
            "Requires focused analysis effort",
            "May conclude no viable roles exist",
          ],
          risk_ids: ["risk_support_burden"],
          decision_relevance:
            "Recommended option because it converts the provocation into disciplined evaluation.",
        },
        {
          id: "opt_dos_like_principles_only",
          label: "Adopt DOS-like simplification principles only",
          description:
            "Keep modern operating systems but reduce endpoint variance, background complexity, unnecessary privileges, and general-purpose breadth where possible.",
          pros: [
            "Lower implementation risk",
            "Applicable to many endpoint classes",
            "Can improve security and supportability without legacy OS adoption",
          ],
          cons: [
            "Less radical cost reduction",
            "May not force deep enough simplification",
          ],
          risk_ids: ["risk_support_burden"],
          decision_relevance:
            "Fallback option if leadership rejects the feasibility assessment.",
        },
        {
          id: "opt_reject",
          label: "Reject and maintain current model",
          description:
            "Reject the rollback and endpoint simplification assessment.",
          pros: [
            "No disruption",
            "No additional assessment cost",
          ],
          cons: [
            "Leaves endpoint complexity assumptions unchallenged",
            "Misses possible simplification opportunities",
          ],
          risk_ids: [],
          decision_relevance:
            "Baseline option for comparison.",
        },
      ],

      recommendation: {
        recommended_option_id: "opt_constrained_assessment",
        recommendation:
          "Approve a 60-day feasibility assessment for constrained endpoint roles; reject universal DOS rollback.",
        rationale:
          "This preserves the value of the provocation while avoiding the unacceptable risk of universal rollback.",
        conditions: [
          "Assessment scope excludes general knowledge work.",
          "CISO defines minimum compensating controls before any pilot.",
          "Business owners nominate candidate fixed-function workflows.",
          "Any pilot must include exit criteria and rollback plan.",
        ],
        next_steps: [
          "Identify candidate endpoint roles.",
          "Build compatibility inventory.",
          "Define security-control model.",
          "Estimate total cost and support burden.",
          "Return with pilot/no-pilot recommendation.",
        ],
      },
    },

    persuasion_plan: {
      primary_strategy: getStrategy("provocation"),

      supporting_strategies: [
        getStrategy("tradeoff_transparency"),
        getStrategy("risk_avoidance"),
      ],

      persuasion_sequence: [
        {
          order: 1,
          strategy_id: "provocation",
          rhetorical_move: "establish_stakes",
          intended_effect_on_audience:
            "Make the audience willing to entertain an extreme idea long enough to inspect the underlying endpoint-complexity problem.",
          deck_section_or_slide_role: "opening",
        },
        {
          order: 2,
          strategy_id: "provocation",
          rhetorical_move: "state_claim",
          intended_effect_on_audience:
            "Separate the literal DOS rollback from the strategic simplification thesis.",
          deck_section_or_slide_role: "claim",
        },
        {
          order: 3,
          strategy_id: "tradeoff_transparency",
          rhetorical_move: "compare_alternatives",
          intended_effect_on_audience:
            "Show that the proposal is being evaluated through explicit tradeoffs, not nostalgia.",
          deck_section_or_slide_role: "tradeoff",
        },
        {
          order: 4,
          strategy_id: "risk_avoidance",
          rhetorical_move: "show_risk",
          intended_effect_on_audience:
            "Demonstrate that compatibility, security, and operational risks are acknowledged.",
          deck_section_or_slide_role: "risk",
        },
        {
          order: 5,
          strategy_id: "tradeoff_transparency",
          rhetorical_move: "address_objections",
          intended_effect_on_audience:
            "Reduce resistance by addressing the predictable objections directly.",
          deck_section_or_slide_role: "objection",
        },
        {
          order: 6,
          strategy_id: "tradeoff_transparency",
          rhetorical_move: "show_tradeoffs",
          intended_effect_on_audience:
            "Make the decision criteria explicit.",
          deck_section_or_slide_role: "recommendation",
        },
        {
          order: 7,
          strategy_id: "provocation",
          rhetorical_move: "make_decision_ask",
          intended_effect_on_audience:
            "Convert the provocation into a bounded executive decision.",
          deck_section_or_slide_role: "decision",
        },
        {
          order: 8,
          strategy_id: "tradeoff_transparency",
          rhetorical_move: "show_future_state",
          intended_effect_on_audience:
            "Anchor the principle that survives rejection: simplification is the durable lesson, regardless of whether DOS itself is approved.",
          deck_section_or_slide_role: "closing",
        },
      ],

      ethical_constraints: [
        {
          rule: "Do not hide the impracticality of universal DOS rollback.",
          rationale:
            "The deck should use provocation to clarify thinking, not to manipulate the audience into an unrealistic decision.",
        },
        {
          rule: "Separate factual evidence from hypotheses requiring assessment.",
          rationale:
            "The proposal depends on feasibility analysis; unsupported certainty would be misleading.",
        },
      ],
    },

    slide_plan: [
      {
        slide_number: 1,
        title: "DOS 5.2 is a deliberate provocation, not a serious rollback proposal",
        role_in_deck: "opening",
        key_message:
          "The DOS 5.2 rollback idea is intentionally extreme; its value is to challenge whether every endpoint really needs modern general-purpose complexity.",
        audience_question_answered:
          "Why should we discuss something this provocative?",
        narrative_steps: [1],
        content_blocks: [
          {
            type: "headline",
            purpose: "Open with a provocative but bounded thesis.",
            content_summary:
              "Reconsidering Endpoint Complexity: A case for evaluating a DOS 5.2 rollback model.",
          },
          {
            type: "callout",
            purpose: "Clarify that the deck is a strategic provocation.",
            content_summary:
              "This is not nostalgia; it is a stress test of endpoint assumptions.",
          },
        ],
        visual_strategy: {
          layout: "single_message",
          density: "low",
          focal_point: "Provocative thesis",
          visual_hierarchy: [
            { element: "Title", priority: "primary" },
            { element: "Scope clarification", priority: "secondary" },
          ],
        },
        speaker_intent:
          "Signal seriousness while acknowledging that the idea sounds extreme.",
        supports_claim_ids: ["claim_core"],
        rhetorical_moves: ["establish_stakes", "state_claim"],
        expected_audience_responses: [
          {
            segment_id: "seg_cio_infra",
            expected_emotion: "skepticism",
            secondary_emotion: "curiosity",
            expected_reactions: ["lean_back", "ask_clarifying_question"],
            confidence: "high",
          },
          {
            segment_id: "seg_cfo",
            expected_emotion: "skepticism",
            expected_reactions: ["lean_back", "take_notes"],
            confidence: "medium",
          },
          {
            segment_id: "seg_ciso",
            expected_emotion: "discomfort",
            secondary_emotion: "skepticism",
            expected_reactions: ["push_back", "ask_challenging_question"],
            if_off_target:
              "If CISO is more hostile than predicted, foreshadow the security-control envelope earlier than slide 6.",
            confidence: "medium",
          },
          {
            segment_id: "seg_coo",
            expected_emotion: "curiosity",
            expected_reactions: ["lean_in", "take_notes"],
            confidence: "medium",
          },
        ],
      },
      {
        slide_number: 2,
        title: "Modern endpoints carry hidden complexity cost",
        role_in_deck: "problem",
        key_message:
          "The current endpoint model embeds cost and risk through general-purpose breadth, constant change, and operational variance.",
        audience_question_answered:
          "What problem makes the provocation worth examining?",
        narrative_steps: [2],
        content_blocks: [
          {
            type: "diagram",
            purpose: "Show complexity as a stacked burden.",
            content_summary: "visual_complexity_stack",
            visual_artifact_id: "visual_complexity_stack",
          },
          {
            type: "text",
            purpose: "Name the hidden cost categories.",
            content_summary:
              "Patching, background services, hardware churn, licensing, support variance, and security surface area.",
          },
        ],
        visual_strategy: {
          layout: "diagram_first",
          density: "medium",
          focal_point: "Endpoint complexity stack",
          visual_hierarchy: [
            { element: "Complexity stack", priority: "primary" },
            { element: "Cost categories", priority: "secondary" },
          ],
        },
        speaker_intent:
          "Make the hidden cost of general-purpose endpoints concrete enough that the audience accepts the question is worth asking.",
        supports_claim_ids: ["claim_complexity_cost"],
        uses_evidence_ids: [
          "ev_logical_complexity",
          "ev_benchmark_endpoint_variance",
        ],
        rhetorical_moves: ["define_problem", "establish_stakes"],
      },
      {
        slide_number: 3,
        title: "What the proposal is — and is not",
        role_in_deck: "definition",
        key_message:
          "The proposal is a bounded feasibility assessment of constrained endpoint roles, not a universal employee workstation rollback.",
        audience_question_answered:
          "What exactly are we proposing?",
        narrative_steps: [3],
        content_blocks: [
          {
            type: "diagram",
            purpose: "Render the scope boundary as a two-region scope diagram with explicit pilot preconditions.",
            content_summary: "visual_dos_scope_boundary",
            visual_artifact_id: "visual_dos_scope_boundary",
          },
          {
            type: "table",
            purpose: "Enumerate scope inclusions and exclusions next to the diagram for the read-track audience.",
            content_summary:
              "Included: fixed-function stations, terminal workflows, controlled data entry. Excluded: knowledge work, collaboration-heavy work, browser-centric work.",
          },
          {
            type: "callout",
            purpose: "Neutralize the absurdity objection by anchoring the proposal to the diagram's boundary line.",
            content_summary:
              "Universal rollback is not recommended; constrained assessment is the decision.",
          },
        ],
        visual_strategy: {
          layout: "two_column",
          density: "medium",
          focal_point: "Scope boundary",
          visual_hierarchy: [
            { element: "Included scope", priority: "primary" },
            { element: "Excluded scope", priority: "primary" },
            { element: "Pilot preconditions", priority: "secondary" },
            { element: "Clarifying callout", priority: "secondary" },
          ],
        },
        speaker_intent:
          "Defuse the absurdity reflex up front by drawing the in-scope / out-of-scope line before any further argument; the diagram makes the boundary unmistakable to both live and read tracks.",
        supports_claim_ids: ["claim_core", "claim_constrained_fit"],
        addresses_objection_ids: ["obj_absurdity", "obj_compatibility"],
        rhetorical_moves: ["address_objections", "show_mechanism"],
      },
      {
        slide_number: 4,
        title: "The constrained model reduces endpoint variability through five concrete control layers",
        role_in_deck: "model",
        key_message:
          "The model is not old software for its own sake; it is extreme reduction of endpoint variability.",
        audience_question_answered:
          "How would a constrained endpoint model work?",
        narrative_steps: [4],
        content_blocks: [
          {
            type: "diagram",
            purpose: "Show the constrained operating model as layers.",
            content_summary: "visual_operating_model",
            visual_artifact_id: "visual_operating_model",
          },
          {
            type: "text",
            purpose: "Describe the operating model components.",
            content_summary:
              "User task layer, approved executable set, DOS-like runtime, fixed hardware profile, restricted interfaces, compensating controls, central support.",
          },
        ],
        visual_strategy: {
          layout: "stack",
          density: "medium",
          focal_point: "Endpoint operating model",
          visual_hierarchy: [
            { element: "Operating model stack", priority: "primary" },
            { element: "Controls", priority: "secondary" },
          ],
        },
        speaker_intent:
          "Show that the constrained model is operationally describable, not abstract — every layer has a concrete owner and control surface.",
        supports_claim_ids: ["claim_constrained_fit", "claim_security_tradeoff"],
        uses_evidence_ids: ["ev_pilot_logic", "ev_case_study_kiosk"],
        rhetorical_moves: ["show_mechanism", "show_feasibility"],
      },
      {
        slide_number: 5,
        title: "The DOS-like model wins on narrow dimensions and loses on modern work",
        role_in_deck: "tradeoff",
        key_message:
          "The DOS-like model wins only on narrow dimensions; it loses badly when business work requires modern general-purpose capability.",
        audience_question_answered:
          "Where does this idea win, lose, or require controls?",
        narrative_steps: [5],
        content_blocks: [
          {
            type: "matrix",
            purpose: "Compare alternatives across explicit dimensions.",
            content_summary: "visual_tradeoff_matrix",
            visual_artifact_id: "visual_tradeoff_matrix",
          },
          {
            type: "summary",
            purpose: "State the decision-relevant implication.",
            content_summary:
              "The constrained model is not a replacement for modern workstations; it may be relevant only for narrow endpoint roles.",
          },
        ],
        visual_strategy: {
          layout: "comparison",
          density: "high",
          focal_point: "Comparison dimensions",
          visual_hierarchy: [
            { element: "Compatibility", priority: "primary" },
            { element: "Security", priority: "primary" },
            { element: "Operational simplicity", priority: "secondary" },
          ],
        },
        speaker_intent:
          "Force the audience to compare on explicit dimensions instead of vibes — the layout should make 'where it loses' as visible as 'where it wins'.",
        supports_claim_ids: [
          "claim_core",
          "claim_constrained_fit",
          "claim_security_tradeoff",
        ],
        uses_evidence_ids: ["ev_comparison_matrix"],
        addresses_objection_ids: ["obj_compatibility"],
        rhetorical_moves: ["compare_alternatives", "show_tradeoffs"],
      },
      {
        slide_number: 6,
        title: "Security and compliance are the gating risks",
        role_in_deck: "risk",
        key_message:
          "DOS itself is not the security answer; only a tightly controlled environment could make the model defensible.",
        audience_question_answered:
          "What could go wrong from a security and compliance standpoint?",
        narrative_steps: [6],
        content_blocks: [
          {
            type: "risk",
            purpose: "Present the highest-impact risks.",
            content_summary:
              "Security gap, compatibility failure, support burden, productivity loss.",
          },
          {
            type: "table",
            purpose: "Map risks to compensating controls.",
            content_summary:
              "Isolation, allowlisting, restricted network paths, physical controls, no removable media, audit procedures.",
          },
        ],
        visual_strategy: {
          layout: "two_column",
          density: "medium",
          focal_point: "Risk-to-control mapping",
          visual_hierarchy: [
            { element: "Security gap", priority: "primary" },
            { element: "Compensating controls", priority: "primary" },
          ],
        },
        speaker_intent:
          "Concede the security objection at face value, then show that the only path to viability runs through compensating controls — not OS choice.",
        supports_claim_ids: ["claim_security_tradeoff"],
        uses_evidence_ids: ["ev_risk_analysis"],
        addresses_objection_ids: ["obj_security"],
        rhetorical_moves: [
          "show_risk",
          "quantify_impact",
          "show_cost_of_inaction",
        ],
        expected_audience_responses: [
          {
            // CISO is the source of obj_security; the slide should
            // *reduce* hostility into something workable. Predicting
            // hostility/resistance here would trip W9 — that's the
            // signal the rebuttal isn't landing.
            segment_id: "seg_ciso",
            expected_emotion: "skepticism",
            secondary_emotion: "validation",
            expected_reactions: [
              "ask_challenging_question",
              "request_more_info",
              "drop_objection",
            ],
            if_off_target:
              "If CISO remains hostile, defer the recommendation slide and offer to draft the control envelope offline before reconvening.",
            confidence: "high",
          },
          {
            segment_id: "seg_cio_infra",
            expected_emotion: "interest",
            expected_reactions: ["take_notes", "nod"],
            confidence: "medium",
          },
        ],
      },
      {
        slide_number: 7,
        title: "Objections we should accept, not dismiss",
        role_in_deck: "objection",
        key_message:
          "The strongest objections are valid against universal rollback; they define the boundaries of a feasible assessment.",
        audience_question_answered:
          "Are we being honest about why this may fail?",
        narrative_steps: [7],
        content_blocks: [
          {
            type: "table",
            purpose: "Map objections to responses and scope controls.",
            content_summary:
              "Absurdity, compatibility, security, supportability, and productivity objections mapped to counter-arguments and boundaries.",
          },
        ],
        visual_strategy: {
          layout: "three_column",
          density: "medium",
          focal_point: "Objection handling",
          visual_hierarchy: [
            { element: "Objection", priority: "primary" },
            { element: "Response", priority: "primary" },
            { element: "Scope boundary", priority: "secondary" },
          ],
        },
        speaker_intent:
          "Demonstrate that the team has internalized the strongest objections — credibility comes from accepting them, not arguing past them.",
        supports_claim_ids: ["claim_core", "claim_pilot"],
        addresses_objection_ids: [
          "obj_absurdity",
          "obj_compatibility",
          "obj_security",
          "obj_supportability",
          "obj_total_cost",
        ],
        rhetorical_moves: ["address_objections", "show_tradeoffs"],
      },
      {
        slide_number: 8,
        title: "Approving this requires four evidence artifacts before any pilot starts",
        role_in_deck: "evidence",
        key_message:
          "A real decision requires compatibility inventory, cost model, risk model, and role-suitability map.",
        audience_question_answered:
          "What proof would be needed before approving a pilot?",
        narrative_steps: [8],
        content_blocks: [
          {
            type: "evidence",
            purpose: "Show the proof path.",
            content_summary:
              "Endpoint telemetry, support-ticket analysis, workflow compatibility inventory, security-control assessment, total-cost model.",
          },
          {
            type: "flow",
            purpose: "Show evidence-to-decision path.",
            content_summary:
              "Candidate roles → compatibility screen → security controls → cost model → pilot/no-pilot decision.",
          },
        ],
        visual_strategy: {
          layout: "flow",
          density: "medium",
          focal_point: "Evidence path",
          visual_hierarchy: [
            { element: "Compatibility inventory", priority: "primary" },
            { element: "Security controls", priority: "primary" },
            { element: "Cost model", priority: "secondary" },
          ],
        },
        speaker_intent:
          "Frame the assessment as evidence-bounded: nothing in this deck is a commitment without the artifacts on the next 60 days' worklist.",
        supports_claim_ids: ["claim_pilot"],
        uses_evidence_ids: [
          "ev_logical_complexity",
          "ev_risk_analysis",
          "ev_pilot_logic",
          "ev_total_cost_model",
          "ev_benchmark_endpoint_variance",
        ],
        rhetorical_moves: [
          "show_evidence",
          "show_feasibility",
          "quantify_impact",
        ],
      },
      {
        slide_number: 9,
        title: "Recommendation: assess, do not roll back",
        role_in_deck: "recommendation",
        key_message:
          "Reject universal rollback and approve a bounded feasibility assessment for constrained endpoint roles.",
        audience_question_answered:
          "What is the recommended action?",
        narrative_steps: [9],
        content_blocks: [
          {
            type: "recommendation",
            purpose: "State the recommendation.",
            content_summary:
              "Approve a 60-day constrained endpoint feasibility assessment; reject universal DOS rollback.",
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
            { element: "Rejected option", priority: "secondary" },
            { element: "Fallback option", priority: "secondary" },
          ],
        },
        speaker_intent:
          "Land the recommendation with confidence; the rejection of universal rollback is itself a strong signal of intellectual honesty.",
        supports_claim_ids: ["claim_pilot"],
        uses_evidence_ids: [
          "ev_pilot_logic",
          "ev_comparison_matrix",
          "ev_total_cost_model",
        ],
        rhetorical_moves: [
          "compare_alternatives",
          "show_tradeoffs",
          "make_decision_ask",
        ],
        expected_audience_responses: [
          {
            segment_id: "seg_coo",
            expected_emotion: "validation",
            secondary_emotion: "agreement",
            expected_reactions: ["nod", "request_more_info"],
            confidence: "medium",
          },
          {
            segment_id: "seg_cfo",
            expected_emotion: "interest",
            expected_reactions: ["take_notes", "request_more_info"],
            confidence: "medium",
          },
          {
            segment_id: "seg_cio_infra",
            expected_emotion: "agreement",
            expected_reactions: ["nod", "approve"],
            confidence: "medium",
          },
        ],
      },
      {
        slide_number: 10,
        title: "Approve a 60-day feasibility assessment, or reject and close the question",
        role_in_deck: "decision",
        key_message:
          "Approve a 60-day assessment with strict scope, security gates, and pilot/no-pilot exit criteria.",
        audience_question_answered:
          "What decision is required now?",
        narrative_steps: [10],
        content_blocks: [
          {
            type: "decision",
            purpose: "Make the ask explicit.",
            content_summary:
              "Approve or reject the 60-day feasibility assessment for constrained endpoint roles.",
          },
        ],
        visual_strategy: {
          layout: "single_message",
          density: "low",
          focal_point: "Decision ask",
          visual_hierarchy: [
            { element: "Decision requested", priority: "primary" },
            { element: "Assessment conditions", priority: "secondary" },
          ],
        },
        speaker_intent:
          "Convert the provocation into a bounded yes/no decision the room can take today, with conditions visible to every approver in the room.",
        supports_claim_ids: ["claim_core", "claim_pilot"],
        rhetorical_moves: ["make_decision_ask", "show_future_state"],
        expected_audience_responses: [
          {
            // COO is final_decision_maker — must produce a decision-class
            // reaction here (W8/W10 bind on this segment specifically).
            segment_id: "seg_coo",
            expected_emotion: "agreement",
            expected_reactions: ["approve", "commit"],
            confidence: "medium",
          },
          {
            segment_id: "seg_cfo",
            expected_emotion: "interest",
            secondary_emotion: "trust",
            expected_reactions: ["approve", "request_more_info"],
            confidence: "medium",
          },
          {
            segment_id: "seg_cio_infra",
            expected_emotion: "agreement",
            expected_reactions: ["approve"],
            confidence: "medium",
          },
          {
            segment_id: "seg_ciso",
            expected_emotion: "skepticism",
            secondary_emotion: "validation",
            expected_reactions: ["request_more_info", "defer"],
            if_off_target:
              "If CISO blocks rather than defers, escalate to written control-envelope review before any pilot scoping.",
            confidence: "high",
          },
        ],
      },
      {
        slide_number: 11,
        title: "Even if DOS is rejected, the simplification discipline survives the no",
        role_in_deck: "closing",
        key_message:
          "The durable lesson is the discipline of asking where general-purpose endpoint complexity is unnecessary; that question is worth carrying forward whatever the decision on the assessment.",
        audience_question_answered:
          "What insight survives if the extreme proposal is rejected?",
        narrative_steps: [11],
        content_blocks: [
          {
            type: "summary",
            purpose: "Separate the decision from the underlying principle.",
            content_summary:
              "The principle that survives any decision: simplify endpoint footprints where general-purpose breadth is unnecessary; do not buy capability you will not use.",
          },
          {
            type: "callout",
            purpose: "Name the durable next step regardless of outcome.",
            content_summary:
              "Whether the assessment is approved or rejected, the organization should map which endpoint roles are over-provisioned today.",
          },
        ],
        visual_strategy: {
          layout: "single_message",
          density: "low",
          focal_point: "Principle that survives rejection",
          visual_hierarchy: [
            { element: "Surviving principle", priority: "primary" },
            { element: "Decoupled next step", priority: "secondary" },
          ],
        },
        speaker_intent:
          "Decouple the case-level recommendation from the durable organizational lesson, so the audience leaves with usable framing even if they reject the assessment.",
        supports_claim_ids: ["claim_core", "claim_complexity_cost"],
        rhetorical_moves: ["show_future_state", "connect_to_values"],
        expected_audience_responses: [
          {
            segment_id: "seg_coo",
            expected_emotion: "agreement",
            expected_reactions: ["accept_framing", "nod"],
            confidence: "medium",
          },
          {
            segment_id: "seg_cfo",
            expected_emotion: "interest",
            expected_reactions: ["accept_framing", "take_notes"],
            confidence: "medium",
          },
          {
            segment_id: "seg_ciso",
            expected_emotion: "trust",
            expected_reactions: ["accept_framing"],
            confidence: "low",
          },
        ],
      },
      {
        slide_number: 12,
        title: "Reduce endpoint complexity where general-purpose computing is unnecessary",
        role_in_deck: "closing",
        key_message:
          "Close by reframing the provocation as a discipline: not 'should we use DOS?' but 'where is general-purpose endpoint complexity unnecessary?'",
        audience_question_answered:
          "What should the audience remember after this deck?",
        narrative_steps: [12],
        content_blocks: [
          {
            type: "callout",
            purpose: "Restate the closing question as the audience's takeaway.",
            content_summary:
              "Not 'should we use DOS?' but 'where is general-purpose endpoint complexity unnecessary?' — the question leadership owns from this point forward.",
          },
          {
            type: "headline",
            purpose: "Anchor the closing line that callbacks the opening provocation.",
            content_summary:
              "DOS 5.2 was the provocation. Endpoint discipline is the lesson.",
          },
        ],
        visual_strategy: {
          layout: "title_only",
          density: "low",
          focal_point: "Closing reframe",
          visual_hierarchy: [
            { element: "Closing question", priority: "primary" },
            { element: "Callback line", priority: "secondary" },
          ],
        },
        speaker_intent:
          "Land the deck on a question the room can carry, not a directive — the provocation closes back into a leadership question, exactly where slide 1 opened.",
        supports_claim_ids: ["claim_core"],
        rhetorical_moves: ["connect_to_values", "show_future_state"],
        expected_audience_responses: [
          {
            segment_id: "seg_coo",
            expected_emotion: "agreement",
            expected_reactions: ["accept_framing", "nod"],
            confidence: "medium",
          },
          {
            segment_id: "seg_cio_infra",
            expected_emotion: "validation",
            expected_reactions: ["accept_framing"],
            confidence: "low",
          },
        ],
      },
    ],

    visual_artifacts: [
      {
        // Mirrors the full-render FrameGraph at
        // static/refs/framegraph_dos_scope_boundary.yml (scene.id =
        // dos_scope_boundary). The deck-level artifact captures the
        // intent and required elements; the FrameGraph file carries
        // the canvas/layers/ports/connectors that render this slide.
        id: "visual_dos_scope_boundary",
        title: "DOS scope boundary — included vs excluded endpoint roles",
        artifact_type: "diagram",
        purpose: "explain_structure",
        composition: {
          orientation: "left_to_right",
          information_density: "balanced",
          reveal_strategy: "section_by_section",
          primary_focal_point: "Scope boundary line between in-scope and out-of-scope endpoint roles",
        },
        required_elements: [
          {
            id: "ve_preconditions",
            label: "Pilot preconditions (governance gate)",
            communicative_role: "contextualize",
          },
          {
            id: "ve_in_scope_fixed_function",
            label: "Fixed-function stations",
            communicative_role: "differentiate",
          },
          {
            id: "ve_in_scope_terminal",
            label: "Terminal-driven workflows",
            communicative_role: "differentiate",
          },
          {
            id: "ve_in_scope_controlled_entry",
            label: "Controlled data entry",
            communicative_role: "differentiate",
          },
          {
            id: "ve_out_of_scope_knowledge_work",
            label: "Knowledge work (excluded)",
            communicative_role: "warn",
          },
          {
            id: "ve_out_of_scope_collaboration",
            label: "Collaboration-heavy work (excluded)",
            communicative_role: "warn",
          },
          {
            id: "ve_out_of_scope_browser",
            label: "Browser-centric work (excluded)",
            communicative_role: "warn",
          },
          {
            id: "ve_boundary_line",
            label: "Scope boundary line",
            communicative_role: "summarize",
          },
          {
            id: "ve_proposal_callout",
            label: "Proposal restated as anchor to the boundary",
            communicative_role: "summarize",
          },
        ],
        constraints: {
          must_be_readable: true,
          avoid_visual_clutter: true,
        },
      },
      {
        id: "visual_complexity_stack",
        title: "Modern endpoint complexity stack",
        artifact_type: "stack",
        purpose: "explain_structure",
        composition: {
          orientation: "top_to_bottom",
          information_density: "balanced",
          reveal_strategy: "all_at_once",
          primary_focal_point: "Accumulated endpoint complexity",
        },
        required_elements: [
          {
            id: "ve_patch",
            label: "Patching",
            communicative_role: "contextualize",
          },
          {
            id: "ve_services",
            label: "Background services",
            communicative_role: "explain",
          },
          {
            id: "ve_security_surface",
            label: "Security surface",
            communicative_role: "warn",
          },
          {
            id: "ve_support_variance",
            label: "Support variance",
            communicative_role: "explain",
          },
        ],
        constraints: {
          must_be_readable: true,
          avoid_visual_clutter: true,
        },
      },
      {
        id: "visual_operating_model",
        title: "DOS-like constrained endpoint operating model",
        artifact_type: "diagram",
        purpose: "explain_structure",
        composition: {
          orientation: "top_to_bottom",
          information_density: "balanced",
          reveal_strategy: "section_by_section",
          primary_focal_point: "Endpoint operating model",
        },
        required_elements: [
          {
            id: "ve_task",
            label: "Narrow user task",
            communicative_role: "explain",
          },
          {
            id: "ve_exec",
            label: "Approved executable set",
            communicative_role: "explain",
          },
          {
            id: "ve_runtime",
            label: "Minimal runtime",
            communicative_role: "differentiate",
          },
          {
            id: "ve_controls",
            label: "Compensating controls",
            communicative_role: "warn",
          },
        ],
        constraints: {
          must_be_readable: true,
          avoid_visual_clutter: true,
        },
      },
      {
        id: "visual_tradeoff_matrix",
        title: "Modern OS vs DOS-like endpoint tradeoff matrix",
        artifact_type: "matrix",
        purpose: "show_tradeoffs",
        composition: {
          orientation: "grid",
          information_density: "dense",
          reveal_strategy: "all_at_once",
          primary_focal_point: "Explicit tradeoff dimensions",
        },
        required_elements: [
          {
            id: "ve_complexity",
            label: "Complexity",
            communicative_role: "compare",
          },
          {
            id: "ve_compatibility",
            label: "Compatibility",
            communicative_role: "compare",
          },
          {
            id: "ve_security",
            label: "Security",
            communicative_role: "compare",
          },
          {
            id: "ve_support",
            label: "Supportability",
            communicative_role: "compare",
          },
        ],
        constraints: {
          must_be_readable: true,
          avoid_visual_clutter: true,
        },
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
          primary_focal_point: "Recommended option",
        },
        required_elements: [
          {
            id: "ve_full_rollback",
            label: "Full rollback",
            communicative_role: "compare",
          },
          {
            id: "ve_assessment",
            label: "Feasibility assessment",
            communicative_role: "decide",
          },
          {
            id: "ve_principles",
            label: "DOS-like principles only",
            communicative_role: "compare",
          },
          {
            id: "ve_reject",
            label: "Reject",
            communicative_role: "compare",
          },
        ],
        constraints: {
          must_be_readable: true,
          avoid_visual_clutter: true,
        },
      },
    ],

    design_system: {
      style: "strategic",
      tone_visual_alignment:
        "Use a sober executive visual style to counterbalance the provocative nature of the DOS 5.2 premise.",
      typography: {
        title_scale: "large",
        body_scale: "standard",
        label_style: "plain_language",
      },
      color_semantics: [
        {
          meaning: "Recommended option",
          color_role: "positive",
        },
        {
          meaning: "Rejected or high-risk option",
          color_role: "negative",
        },
        {
          meaning: "Risk or unresolved constraint",
          color_role: "warning",
        },
        {
          meaning: "Neutral comparison dimension",
          color_role: "neutral",
        },
      ],
    },

    quality_rules: [
      {
        id: "qr_no_nostalgia",
        rule: "Do not use nostalgia as evidence.",
        rationale:
          "The audience is skeptical; credibility depends on business logic, tradeoffs, and explicit risk handling.",
        severity: "must",
        validation_question:
          "Would the argument still stand if the audience has no emotional attachment to DOS?",
      },
      {
        id: "qr_scope_first",
        rule: "Define scope before making the proposal sound operational.",
        rationale:
          "Without scope boundaries, the audience will reject the idea as universally impossible.",
        severity: "must",
        validation_question:
          "Does the deck clearly separate universal rollback from constrained assessment?",
      },
    ],

    speaker_plan: {
      presenters: [
        {
          id: "presenter_primary",
          name: "Pedro Anisio Silva",
          role: "primary",
          authority: "facilitator",
          credibility_basis:
            "Frames the proposal as a strategic simplification exercise and decision provocation.",
          speaks_for_claim_ids: [
            "claim_core",
            "claim_complexity_cost",
            "claim_constrained_fit",
            "claim_pilot",
          ],
          delivers_slide_numbers: [1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12],
        },
        {
          id: "presenter_security",
          name: "Security representative",
          role: "subject_matter_expert",
          authority: "expert",
          credibility_basis:
            "Validates or challenges compensating controls required for constrained endpoint feasibility.",
          speaks_for_claim_ids: ["claim_security_tradeoff"],
          delivers_slide_numbers: [6],
        },
      ],

      time_budget: {
        total_minutes: 30,
        presentation_minutes: 20,
        q_and_a_minutes: 8,
        buffer_minutes: 2,
      },

      q_and_a: {
        mode: "at_end",
        expected_questions: [
          {
            id: "q_absurd",
            question:
              "Are we seriously proposing that employees should use DOS?",
            likely_asker_segment: "seg_cio_infra",
            prepared_answer:
              "No. The recommendation rejects universal rollback and asks only for a bounded feasibility assessment of constrained roles.",
            addresses_objection_id: "obj_absurdity",
            references_evidence_ids: ["ev_pilot_logic"],
          },
          {
            id: "q_security",
            question:
              "How can this be secure without modern endpoint protection?",
            likely_asker_segment: "seg_ciso",
            prepared_answer:
              "It cannot be treated as secure by default. Viability depends on compensating controls, isolation, allowlisting, and restricted interfaces.",
            addresses_objection_id: "obj_security",
            references_evidence_ids: ["ev_risk_analysis"],
          },
          {
            id: "q_compatibility",
            question:
              "What happens to SaaS, browser workflows, collaboration tools, and modern files?",
            likely_asker_segment: "seg_coo",
            prepared_answer:
              "Those workflows are out of scope. The assessment only considers roles where required work is narrow and compatibility can be proven.",
            addresses_objection_id: "obj_compatibility",
            references_evidence_ids: ["ev_comparison_matrix"],
          },
          {
            id: "q_total_cost",
            question:
              "After custom support and integration, do we actually save money?",
            likely_asker_segment: "seg_cfo",
            prepared_answer:
              "That is the central output of the assessment. The TCO model includes support customness, integration, training, and reversibility — if the model does not pencil out, the answer is no pilot.",
            addresses_objection_id: "obj_total_cost",
            references_evidence_ids: [
              "ev_total_cost_model",
              "ev_benchmark_endpoint_variance",
            ],
          },
        ],
        hard_questions_to_prepare_for: [
          "What would make this fail immediately?",
          "Could we achieve 80% of the simplification benefit on modern OS instead?",
          "How would compliance auditors react?",
          "Who owns support if the pilot finds viable roles?",
        ],
        out_of_scope_topics: [
          "Replacing all knowledge-worker laptops",
          "General internet browsing on DOS",
          "Rebuilding modern SaaS tools for DOS",
        ],
      },
    },

    variants: [
      {
        id: "var_security_track",
        label: "CISO security-track variant",
        segment_ids: ["seg_ciso"],
        slide_overrides: [
          {
            slide_number: 6,
            segment_id: "seg_ciso",
            key_message:
              "DOS itself buys nothing; the question is whether the compensating-control envelope can be made auditable, and that envelope is the only thing your sign-off should depend on.",
            speaker_intent:
              "Speak directly to the CISO: every approval condition routes through the security-control model, not the OS choice.",
          },
          {
            slide_number: 7,
            segment_id: "seg_ciso",
            key_message:
              "Security is the gating objection class — concede it on its own terms and define the bar the assessment must clear.",
          },
        ],
        objective_override: {
          primary_intent: "persuade",
          secondary_intents: ["compare", "decide"],
          desired_audience_shift: {
            from: "Any DOS-like endpoint is automatically non-compliant and must be rejected.",
            to: "A DOS-like endpoint can only be considered if a defined compensating-control envelope is signed off in advance — and that envelope is what we will assess.",
          },
          desired_outcome: "next_step_authorization",
          decision_or_action_requested:
            "Approve a 60-day assessment conditional on a CISO-defined minimum-control envelope before any pilot.",
          success_definition:
            "The CISO authorizes the assessment with a written control envelope that any pilot must satisfy before activation.",
        },
      },
      {
        id: "var_finance_track",
        label: "CFO and CIO finance-track variant",
        segment_ids: ["seg_cfo", "seg_cio_infra"],
        slide_overrides: [
          {
            slide_number: 9,
            segment_id: "seg_cfo",
            key_message:
              "Approve a low-cost, time-boxed assessment whose deliverables are a TCO model and a role-suitability map — both reversible if the answer is no pilot.",
            speaker_intent:
              "Frame the assessment as cheaper than the cost of unexamined endpoint variance; emphasize reversibility.",
          },
          {
            slide_number: 10,
            segment_id: "seg_cfo",
            key_message:
              "The decision today is funding a 60-day analysis with explicit exit criteria. No pilot or migration is being requested.",
          },
          {
            slide_number: 4,
            segment_id: "seg_cio_infra",
            key_message:
              "Treat the operating model as a control surface: low variance is the deliverable, and the runtime choice is downstream of that goal.",
          },
        ],
      },
    ],

    localization: {
      source_locale: {
        bcp47: "en-US",
        display_name: "English (United States)",
        text_direction: "ltr",
        number_format: {
          decimal_separator: ".",
          thousands_separator: ",",
        },
        date_format: "MM/DD/YYYY",
        currency_code: "USD",
      },
      target_locales: [
        {
          locale: {
            bcp47: "pt-BR",
            display_name: "Portuguese (Brazil)",
            text_direction: "ltr",
            number_format: {
              decimal_separator: ",",
              thousands_separator: ".",
            },
            date_format: "DD/MM/YYYY",
            currency_code: "BRL",
          },
          fields: [
            {
              field_path: "deck.title",
              source_text: "Reconsidering Endpoint Complexity",
              translated_text: "Reconsiderando a Complexidade dos Endpoints",
              status: "machine",
              translator: "in-house MT pipeline",
              last_updated: "2026-05-06T00:00:00Z",
            },
            {
              field_path: "deck.subtitle",
              source_text:
                "A provocative case for evaluating a DOS 5.2 rollback model",
              translated_text:
                "Um caso provocativo para avaliar um modelo de rollback ao DOS 5.2",
              status: "reviewed",
              translator: "in-house MT pipeline",
              reviewed_by: "Pedro Anisio Silva",
              last_updated: "2026-05-06T00:00:00Z",
            },
            {
              field_path: "deck.message_strategy.core_claim.text",
              source_text:
                "A universal rollback to DOS 5.2 is not a credible enterprise endpoint strategy, but the extreme model exposes a serious opportunity: some endpoint roles may benefit from radical simplification, reduced variability, and tighter operational control.",
              status: "pending",
            },
            {
              field_path: "deck.slide_plan.0.key_message",
              source_text:
                "The DOS 5.2 rollback idea is intentionally extreme; its value is to challenge whether every endpoint really needs modern general-purpose complexity.",
              status: "pending",
            },
            {
              field_path: "deck.decision_frame.decision_question",
              source_text:
                "Should leadership approve a 60-day feasibility assessment for constrained DOS-like endpoint roles?",
              status: "source",
            },
          ],
        },
      ],
    },

    case: {
      theory_of_case:
        "Endpoint complexity is an unexamined cost-and-risk surface; using DOS 5.2 as an extreme reference model exposes which fixed-function roles, if any, justify a constrained operating model under explicit compensating controls.",

      burden_of_proof: {
        standard: "preponderance",
        must_prove: ["claim_core", "claim_pilot"],
        proof_chain: [
          {
            claim_id: "claim_core",
            evidence_ids: [
              "ev_total_cost_model",
              "ev_benchmark_endpoint_variance",
              "ev_comparison_matrix",
            ],
          },
          {
            claim_id: "claim_pilot",
            evidence_ids: ["ev_pilot_logic", "ev_total_cost_model"],
          },
        ],
      },

      stipulations: [
        {
          id: "stip_no_universal_rollback",
          point_conceded:
            "A universal rollback to DOS 5.2 is not a credible enterprise endpoint strategy and is not being requested.",
          rationale:
            "Conceding the literal absurdity up front lets the audience evaluate the actual proposal — bounded feasibility assessment — on its merits.",
          preempts_objection_id: "obj_absurdity",
        },
        {
          id: "stip_dos_not_secure_by_default",
          point_conceded:
            "DOS lacks modern native security primitives; nothing about the OS itself is secure-by-default by current enterprise standards.",
          rationale:
            "Conceding this routes the security argument away from OS choice and toward compensating controls, where the actual decision lives.",
          preempts_objection_id: "obj_security",
        },
        {
          id: "stip_knowledge_work_out_of_scope",
          point_conceded:
            "General knowledge work, browser-centric workflows, and modern collaboration tools are out of scope for any DOS-like model.",
          rationale:
            "Conceding scope up front removes the COO's strongest objection and lets the assessment focus on candidate roles only.",
          preempts_objection_id: "obj_compatibility",
        },
      ],

      order_of_proof: [
        {
          order: 1,
          section_label: "Open the provocation, define the scope",
          purpose: "setup",
          slide_numbers: [1, 3],
          narrative_steps: [1, 3],
          persuasion_sequence_orders: [1, 2],
          witness_id: "presenter_primary",
          exhibit_ids: [],
          time_allocation_minutes: 4,
          expected_reading_minutes: 3,
        },
        {
          order: 2,
          section_label: "Establish the cost-and-risk problem",
          purpose: "argument",
          slide_numbers: [2],
          narrative_steps: [2],
          persuasion_sequence_orders: [3],
          witness_id: "presenter_primary",
          exhibit_ids: [
            "ev_logical_complexity",
            "ev_benchmark_endpoint_variance",
          ],
          time_allocation_minutes: 3,
          expected_reading_minutes: 3,
        },
        {
          order: 3,
          section_label: "Describe the operating model and tradeoffs",
          purpose: "evidence",
          slide_numbers: [4, 5],
          narrative_steps: [4, 5],
          persuasion_sequence_orders: [3],
          witness_id: "presenter_primary",
          exhibit_ids: ["ev_comparison_matrix", "ev_case_study_kiosk"],
          time_allocation_minutes: 4,
          expected_reading_minutes: 4,
        },
        {
          order: 4,
          section_label: "Concede security as the gating risk",
          purpose: "rebuttal",
          slide_numbers: [6],
          narrative_steps: [6],
          persuasion_sequence_orders: [4],
          witness_id: "presenter_security",
          exhibit_ids: ["ev_risk_analysis"],
          time_allocation_minutes: 3,
          expected_reading_minutes: 3,
        },
        {
          order: 5,
          section_label: "Address objections and show evidence path",
          purpose: "tradeoff",
          slide_numbers: [7, 8],
          narrative_steps: [7, 8],
          persuasion_sequence_orders: [5, 6],
          witness_id: "presenter_primary",
          exhibit_ids: [
            "ev_total_cost_model",
            "ev_pilot_logic",
          ],
          time_allocation_minutes: 2,
          expected_reading_minutes: 3,
        },
        {
          order: 6,
          section_label: "Recommend and ask for the decision",
          purpose: "decision",
          slide_numbers: [9, 10],
          narrative_steps: [9, 10],
          persuasion_sequence_orders: [7],
          witness_id: "presenter_primary",
          exhibit_ids: ["ev_pilot_logic", "ev_total_cost_model"],
          time_allocation_minutes: 3,
          expected_reading_minutes: 2,
        },
        {
          order: 7,
          section_label: "Close into the surviving discipline and callback the opening",
          purpose: "close",
          slide_numbers: [11, 12],
          narrative_steps: [11, 12],
          persuasion_sequence_orders: [8],
          witness_id: "presenter_primary",
          exhibit_ids: [],
          time_allocation_minutes: 1,
          expected_reading_minutes: 1,
        },
      ],

      rebuttal_posture: [
        {
          id: "reb_absurdity_to_bounded",
          anticipated_attack:
            "This is unserious — DOS is decades obsolete; we should not be discussing it.",
          triggered_by_objection_id: "obj_absurdity",
          rebuttal:
            "We agree literal universal rollback is unserious — that is why it is explicitly out of scope. The proposal is a bounded feasibility assessment of *constrained endpoint roles*, not a rollback. The DOS reference is a stress test of endpoint assumptions, not a target architecture.",
          fallback_evidence_ids: ["ev_pilot_logic"],
          pivot_to_slide: 3,
        },
        {
          id: "reb_security_to_controls",
          anticipated_attack:
            "DOS has no modern security primitives — this fails compliance and audit on day one.",
          triggered_by_objection_id: "obj_security",
          rebuttal:
            "Correct on the OS, irrelevant to the proposal. Security viability of any constrained endpoint depends on isolation, allowlisting, restricted network paths, physical controls, and audit procedures — not on the OS choice. No pilot will be authorized without a CISO-defined minimum-control envelope.",
          fallback_evidence_ids: ["ev_risk_analysis"],
          pivot_to_slide: 6,
        },
        {
          id: "reb_compatibility_to_scope",
          anticipated_attack:
            "Modern work depends on browsers, SaaS, collaboration tools — none of which run on DOS.",
          triggered_by_objection_id: "obj_compatibility",
          rebuttal:
            "All of that is explicitly excluded from scope. The assessment targets only fixed-function workflows where required work is narrow and compatibility can be proven before any pilot.",
          fallback_evidence_ids: ["ev_comparison_matrix"],
          pivot_to_slide: 3,
        },
        {
          id: "reb_total_cost_to_model",
          anticipated_attack:
            "Bespoke support and integration will erase any savings — this is a false economy.",
          triggered_by_objection_id: "obj_total_cost",
          rebuttal:
            "That is the central question the assessment is built to answer. The TCO model includes support customness, integration, training, and reversibility. If the model does not pencil out, the answer is no pilot — that is itself a useful outcome.",
          fallback_evidence_ids: [
            "ev_total_cost_model",
            "ev_benchmark_endpoint_variance",
          ],
          pivot_to_slide: 8,
        },
      ],

      closing_arc: {
        final_belief_target:
          "Endpoint complexity is excessive for some roles, the question is worth a bounded assessment, and the discipline of asking it survives even if DOS is rejected.",
        callback_to_opening:
          "Reopens the provocation from slide 1: not 'should we use DOS?' but 'where is general-purpose endpoint complexity unnecessary?' — closes the loop into a question leadership owns.",
        decision_demanded:
          "Approve a 60-day feasibility assessment for constrained endpoint roles, with strict scope, security gates, and pilot/no-pilot exit criteria.",
        anchored_in_slide_number: 12,
      },

      rehearsal_state: "walked",
    },

    success_criteria: {
      audience_can_explain_back:
        "The audience can explain that the deck does not recommend full DOS rollback; it recommends evaluating constrained endpoint simplification opportunities.",
      audience_can_decide: true,
      minimum_required_belief:
        "Endpoint complexity may be excessive for some roles, and a bounded feasibility assessment is reasonable.",
      failure_modes: [
        "Audience interprets the deck as literal nostalgia.",
        "Audience believes universal rollback is the recommendation.",
        "Security risks are perceived as minimized or hidden.",
        "Compatibility concerns are not visibly addressed.",
      ],
    },
  },
};

export const dos52RollbackDeck =
  RefinedBusinessDeckSchema.parse(dos52RollbackDeckInput);

export const dos52RollbackDeckValidationReport =
  validateBusinessDeck(dos52RollbackDeck);