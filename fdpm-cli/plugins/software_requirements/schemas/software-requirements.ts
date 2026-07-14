/**
 * schema.ts — Software Requirements: a complete Zod schema, corpus-led.
 *
 * GROUNDING. Every design decision below is anchored in the Doc·Ray corpus,
 * cited as (SOURCE, sN) where N is the corpus sentence ordinal:
 *   MRK  = Managing Requirements Knowledge (6,954 sentences)
 *   OOSE = Object-Oriented Software Engineering (15,506 sentences)
 *   SE   = Software Engineering (12,746 sentences)
 *
 * Key anchors:
 *  - A requirement is "a statement of what the system must …" per the IEEE
 *    standard glossary of software engineering terminology       (MRK, s93)
 *  - Requirements engineering is the branch of systems engineering concerned
 *    with the desired properties and constraints of software     (MRK, s94)
 *  - "Requirements are classified into functional and non-functional
 *    requirements."                                              (MRK, s138)
 *  - Functional requirements are written as shall-statements: "the user shall
 *    be able to send and receive SMS…"                           (MRK, s140)
 *  - "Change requests are often used to refer to changes on requirements."
 *                                                                (MRK, s117)
 *  - RE success depends on "(1) controlling requirements and changes in them,
 *    (2) managing requirement attributes …"                      (MRK, s5021)
 *  - Requirements carry trace relations, e.g. "trace relations of type
 *    RelatedTo other requirements"                               (MRK, s3133)
 *  - "The dependency types enable the definition of the relationships between
 *    requirements and also to reason about different properties" (MRK, s357)
 *  - Stakeholders hold tacit knowledge that elicitation must surface
 *                                                                (MRK, s683)
 *  - Rationale: identifying and externalizing tacit knowledge about
 *    requirements                                                (MRK, s29)
 *  - Requirements and constraints "are stated in a document, called the
 *    software requirements specification (SRS)"                 (OOSE, s2068)
 *  - SRS opens with Introduction / 1.1 Purpose / intended audience
 *                                                               (OOSE, s2519)
 *  - Acceptance criteria appear alongside test planning         (OOSE, s2079)
 *  - Baselines anchor agreement over time                        (MRK, s23)
 *  - Specifications are checked to be internally "consistent and complete"
 *                                                                 (SE, s3207)
 *
 * HONESTY NOTES (unverified-by-corpus parts are labeled, not hidden):
 *  [STD-1] The NFR category list follows ISO/IEC 25010 quality characteristics
 *          — the corpus discusses quality attributes but the API failed before
 *          a verbatim taxonomy could be extracted.
 *  [STD-2] Priority scale (MoSCoW) is standard practice; the corpus mentions
 *          priorities as managed annotations (MRK, s205) without fixing a scale.
 *  [STD-3] Verification methods (test/inspection/analysis/demonstration) are
 *          standard V&V practice; corpus anchors verifiability only generally.
 *  [STD-4] Trace types beyond the verbatim `RelatedTo` (MRK, s3133) extend the
 *          corpus's "dependency types" (MRK, s357) with standard RE relations.
 */
import { z } from "zod";

/* ---------------------------------- ids ---------------------------------- */

export const RequirementId = z
  .string()
  .regex(/^REQ-[A-Z0-9]+-\d{3,}$/, "e.g. REQ-CORE-001")
  .describe("Stable requirement identifier; identity is what changes are controlled against (MRK, s5021)");

export const PersonName = z.string().min(1).max(200);
const ISODate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "ISO date YYYY-MM-DD");

/* ------------------------------ stakeholders ----------------------------- */

export const Stakeholder = z
  .object({
    id: z.string().regex(/^STK-\d{2,}$/),
    name: PersonName,
    role: z.string().min(1).describe("e.g. customer, end user, developer, regulator"),
    concerns: z.array(z.string().min(1)).default([])
      .describe("What this stakeholder cares about; elicitation must surface knowledge 'stakeholders immersed in their problem domain often fail' to share (MRK, s683)"),
    tacitKnowledgeNotes: z.string().optional()
      .describe("Externalized tacit knowledge captured during elicitation (MRK, s29, s683)"),
  })
  .describe("A party holding requirements knowledge (MRK, s683)");

/* ----------------------------- classification ---------------------------- */

/** "Requirements are classified into functional and non-functional requirements."
 *  (MRK, s138) — plus constraints, per RE's concern with "desired properties
 *  and constraints" (MRK, s94). */
export const RequirementKind = z.enum(["functional", "non-functional", "constraint"]);

/** [STD-1] ISO/IEC 25010-style categories; corpus names the class ("quality
 *  attributes") but the taxonomy below is standard, not corpus-verbatim. */
export const NfrCategory = z.enum([
  "performance", "reliability", "availability", "security", "usability",
  "maintainability", "portability", "scalability", "compatibility", "safety",
]);

/** [STD-2] MoSCoW; corpus fixes only that priorities are managed annotations (MRK, s205). */
export const Priority = z.enum(["must", "should", "could", "wont"]);

/** Lifecycle: proposal → analysis → public agreement ("the agreement to a
 *  requirement is public", MRK s3626) → baseline (MRK, s23) → realization.
 *  State names beyond those anchors are conventional. */
export const RequirementStatus = z.enum([
  "proposed", "analyzed", "agreed", "baselined", "implemented", "verified", "rejected",
]);

/** [STD-3] standard V&V methods. */
export const VerificationMethod = z.enum(["test", "inspection", "analysis", "demonstration"]);

/**
 * First-class provenance ranking for requirement origin.
 *
 * Operator-origin requirements are primary evidence because they are captured
 * from the accountable operator's explicit statement. AI-generated and derived
 * requirements are secondary: useful, but lower-provenance until the operator
 * promotes or agrees them through the normal lifecycle.
 */
export const RequirementOriginClass = z.enum(["operator", "ai_generated", "derived"]);
export const ProvenanceRank = z.enum(["primary", "secondary"]);

/* ------------------------------ traceability ----------------------------- */

/** `RelatedTo` is corpus-verbatim (MRK, s3133); the rest extend the corpus's
 *  "dependency types … between requirements" (MRK, s357). [STD-4] */
export const TraceType = z.enum([
  "RelatedTo",        // verbatim (MRK, s3133)
  "DependsOn", "DerivedFrom", "Refines", "ConflictsWith", "Duplicates", "Satisfies",
]);

export const TraceLink = z
  .object({
    type: TraceType,
    target: RequirementId,
    note: z.string().optional(),
  })
  .describe("Trace relation enabling reuse checks and reasoning over relationships (MRK, s3133, s357)");

/* ----------------------------- change control ---------------------------- */

export const ChangeRequest = z
  .object({
    id: z.string().regex(/^CR-\d{3,}$/),
    date: ISODate,
    author: PersonName,
    description: z.string().min(1),
    impact: z.string().optional().describe("Analyzed impact on related requirements (via trace links)"),
    resolution: z.enum(["pending", "accepted", "rejected"]).default("pending"),
  })
  .describe("'Change requests are often used to refer to changes on requirements.' (MRK, s117)");

/* ------------------------------- agreement -------------------------------- */

/** "The agreement to a requirement is public and made when programmers are
 *  looking into the eyes of the customer." (MRK, s3626). Agreement is an EVENT
 *  with parties — not just a status value. */
export const Agreement = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    parties: z.array(z.string().regex(/^STK-\d{2,}$/)).min(2)
      .describe("Public agreement requires at least the customer side and the builder side (MRK, s3626)"),
    note: z.string().optional(),
  })
  .describe("The public agreement event behind status 'agreed' (MRK, s3626)");

/* ------------------------------ provenance ------------------------------- */

export const RequirementSource = z
  .object({
    stakeholder: z.string().regex(/^STK-\d{2,}$/).optional(),
    elicitation: z.enum(["interview", "workshop", "observation", "document-analysis", "prototype", "other"])
      .optional()
      .describe("How the knowledge was surfaced; elicitation confronts unshared expertise (MRK, s683)"),
    reference: z.string().optional().describe("Originating document / regulation / ticket"),
    reusedFrom: z.string().optional()
      .describe("Identifier of the requirement this one was reused from; reused requirements carry their trace relations with them (MRK, s3133)"),
  })
  .describe("Where the requirement came from — provenance is requirements knowledge (MRK, part I)");

/* ------------------------------ requirement ------------------------------ */

export const Requirement = z
  .object({
    id: RequirementId,
    title: z.string().min(3).max(200),

    /** The requirement proper: "a statement of what the system must …"
     *  (IEEE glossary, quoted at MRK s93). Functional statements conventionally
     *  use "shall" (MRK, s140 example). */
    statement: z.string().min(10)
      .describe("A statement of what the system must do/be (MRK, s93); prefer shall-form (MRK, s140)"),

    kind: RequirementKind,                                   // (MRK, s138)
    nfrCategory: NfrCategory.optional()
      .describe("Required when kind = non-functional [STD-1]"),

    rationale: z.string().min(1)
      .describe("Why this requirement exists — externalized tacit knowledge (MRK, s29). Mandatory: unexplained requirements are unmanaged knowledge."),

    source: RequirementSource,
    priority: Priority,                                      // [STD-2]
    status: RequirementStatus.default("proposed"),

    originClass: RequirementOriginClass
      .describe("First-class requirement origin: operator is primary evidence; ai_generated and derived are secondary provenance."),
    provenanceRank: ProvenanceRank
      .describe("Provenance weight assigned from originClass: operator -> primary; ai_generated/derived -> secondary."),
    originNote: z.string().optional()
      .describe("Human-readable provenance note, including capture date, prompt/source, or derivation context."),

    acceptanceCriteria: z.array(z.string().min(5)).min(1)
      .describe("Concrete criteria enabling acceptance (OOSE, s2079); at least one — an unverifiable requirement cannot reach 'verified'"),
    verification: VerificationMethod.default("test"),        // [STD-3]

    traces: z.array(TraceLink).default([])                   // (MRK, s3133, s357)
      .describe("Relations to other requirements"),

    /** "managing requirement attributes" (MRK, s5021): open, controlled
     *  extension point for project-specific attributes. */
    attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
      .default({})
      .describe("Managed requirement attributes (MRK, s5021)"),

    agreement: Agreement.optional()                          // (MRK, s3626)
      .describe("Required once status reaches 'agreed'"),

    /** "you'd run out of ink" — specification is never exhaustively unambiguous
     *  (MRK, s674). Ambiguity is MANAGED, not denied: record what is unresolved. */
    openIssues: z.array(z.string().min(5)).default([])
      .describe("Acknowledged ambiguities / unresolved questions (MRK, s674)"),

    /** "informal notes and personal comments typically annotating artefacts such
     *  as models, requirements, or plans might include [knowledge]" (MRK, s205). */
    notes: z.array(z.string()).default([])
      .describe("Informal annotations — first-class knowledge carriers (MRK, s205)"),

    version: z.number().int().min(1).default(1),
    changeHistory: z.array(ChangeRequest).default([])        // (MRK, s117)
  })
  .superRefine((r, ctx) => {
    // non-functional ⇒ category (classification must be complete, MRK s138)
    if (r.kind === "non-functional" && !r.nfrCategory)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["nfrCategory"],
        message: "non-functional requirements need an nfrCategory (MRK s138 classification + [STD-1])" });
    if (r.kind !== "non-functional" && r.nfrCategory)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["nfrCategory"],
        message: "nfrCategory is only meaningful for non-functional requirements" });
    if (r.originClass === "operator" && r.provenanceRank !== "primary")
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["provenanceRank"],
        message: "operator-origin requirements must carry primary provenance" });
    if ((r.originClass === "ai_generated" || r.originClass === "derived") && r.provenanceRank !== "secondary")
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["provenanceRank"],
        message: "AI-generated and derived requirements must carry secondary provenance until operator-promoted" });
    // a requirement cannot be 'verified' with no acceptance criteria met-path
    if (r.status === "verified" && r.acceptanceCriteria.length === 0)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["status"],
        message: "cannot be verified without acceptance criteria (OOSE, s2079)" });
    // agreement discipline: agreed-or-beyond states need the public agreement event (MRK, s3626)
    const agreedStates = ["agreed", "baselined", "implemented", "verified"];
    if (agreedStates.includes(r.status) && !r.agreement)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["agreement"],
        message: `status '${r.status}' requires a recorded public agreement (MRK, s3626)` });
    // ambiguity discipline: cannot freeze or verify with open issues (MRK, s674 managed, not denied)
    if (["baselined", "verified"].includes(r.status) && r.openIssues.length > 0)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["openIssues"],
        message: "resolve or descope open issues before baselining/verifying (MRK, s674 + s23)" });
    // change control: accepted changes must be reflected in the version (MRK, s5021 — operationalization)
    const accepted = r.changeHistory.filter(c => c.resolution === "accepted").length;
    if (accepted > 0 && r.version < accepted + 1)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["version"],
        message: `version ${r.version} < 1 + ${accepted} accepted change(s) (change control, MRK s5021/s117)` });
    // self-traces are meaningless
    if (r.traces.some(t => t.target === r.id))
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["traces"],
        message: "a requirement cannot trace to itself" });
  });

/* ------------------------------- glossary -------------------------------- */

export const GlossaryEntry = z
  .object({ term: z.string().min(1), definition: z.string().min(1) })
  .describe("Shared vocabulary; the corpus itself grounds 'requirement' in the IEEE standard glossary (MRK, s93)");

/* ------------------------------- baseline -------------------------------- */

export const Baseline = z
  .object({
    name: z.string().min(1),
    date: ISODate,
    requirementIds: z.array(RequirementId).min(1),
    note: z.string().optional(),
  })
  .describe("A frozen, agreed set of requirements (baseline as community anchor, MRK s23; agreement is public, MRK s3626)");

/* ----------------------- the SRS document (root) ------------------------- */

/** "…constraints are stated in a document, called the software requirements
 *  specification (SRS)." (OOSE, s2068). Section skeleton follows the template
 *  quoted at OOSE s2519 (Introduction → Purpose → intended audience …). */
export const SoftwareRequirementsSpecification = z
  .object({
    meta: z.object({
      project: z.string().min(1),
      version: z.string().min(1),
      date: ISODate,
      authors: z.array(PersonName).min(1),
    }),

    introduction: z.object({
      purpose: z.string().min(10)
        .describe("'1.1 Purpose — Specify the purpose of the SRS and the intended audience' (OOSE, s2519)"),
      intendedAudience: z.array(z.string().min(1)).min(1),   // (OOSE, s2519)
      scope: z.string().min(10),
      overview: z.string().optional(),
      references: z.array(z.string()).default([]),
    }),

    stakeholders: z.array(Stakeholder).min(1),               // (MRK, s683)

    assumptions: z.array(z.string().min(5)).default([])
      .describe("Assumed properties outside the system's control (RE covers desired properties AND constraints, MRK s94)"),

    requirements: z.array(Requirement).min(1),               // (MRK, s93, s138)

    glossary: z.array(GlossaryEntry).default([]),            // (MRK, s93)
    baselines: z.array(Baseline).default([]),                // (MRK, s23)
    changeRequests: z.array(ChangeRequest).default([]),      // (MRK, s117)
  })
  .superRefine((doc, ctx) => {
    // internal consistency & completeness of the specification (SE, s3207)
    const ids = doc.requirements.map(r => r.id);
    const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
    if (dup.length)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["requirements"],
        message: `duplicate requirement ids: ${[...new Set(dup)].join(", ")} (identity is the unit of change control, MRK s5021)` });

    const idset = new Set(ids);
    doc.requirements.forEach((r, i) =>
      r.traces.forEach((t, j) => {
        if (!idset.has(t.target))
          ctx.addIssue({ code: z.ZodIssueCode.custom,
            path: ["requirements", i, "traces", j, "target"],
            message: `trace target ${t.target} does not exist — dangling relation (traceability, MRK s3133/s357; consistency, SE s3207)` });
      }));

    const stkIds = new Set(doc.stakeholders.map(s => s.id));
    doc.requirements.forEach((r, i) => {
      r.agreement?.parties.forEach((p, j) => {
        if (!stkIds.has(p))
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["requirements", i, "agreement", "parties", j],
            message: `agreement party ${p} is not a declared stakeholder (public agreement, MRK s3626)` });
      });
      if (r.source.stakeholder && !stkIds.has(r.source.stakeholder))
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["requirements", i, "source", "stakeholder"],
          message: `unknown stakeholder ${r.source.stakeholder}` });
    });

    doc.baselines.forEach((b, i) =>
      b.requirementIds.forEach((rid, j) => {
        if (!idset.has(rid))
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["baselines", i, "requirementIds", j],
            message: `baseline references unknown requirement ${rid} (MRK, s23)` });
      }));
  });

/* -------------------------------- types ---------------------------------- */

export type TRequirement = z.infer<typeof Requirement>;
export type TSRS = z.infer<typeof SoftwareRequirementsSpecification>;
export type TSRSInput = z.input<typeof SoftwareRequirementsSpecification>;
export type TStakeholder = z.infer<typeof Stakeholder>;
export type TTraceLink = z.infer<typeof TraceLink>;
export type TChangeRequest = z.infer<typeof ChangeRequest>;
export type TBaseline = z.infer<typeof Baseline>;
