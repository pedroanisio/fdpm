/**
 * Build the SPEC for "Document Node Identity Specification (DNIS)"
 * using the `fdpm.spec-authoring` plugin profile.
 *
 * 1:1 migration of the standalone DNIS draft (dnis-spec.md) to a typed
 * graph: every Defined Term, Design Principle, ID-format rule, Position
 * requirement, Operation contract, Idempotency clause, Concurrency
 * level, Reference-resolution rule, Conformance level, Test Vector,
 * Reference, Open Question, and the Appendix B change log is
 * materialised as typed primitives joined by typed relations.
 *
 * Where the source carries dense formal content that the spec_authoring
 * profile's typed primitives don't capture (the §5 TypeScript data
 * model declarations, the §7 per-operation pre/post/identity contracts,
 * the §13/§14 security and privacy prose), the body_md of the
 * corresponding spec:Section preserves the source verbatim.
 *
 * Run with:
 *   rm -rf /tmp/fdpm-spec-dnis
 *   FDPM_DATA_DIR=/tmp/fdpm-spec-dnis npx tsx fdpm-cli/scripts/build-spec-dnis.ts
 *
 * Render with:
 *   FDPM_DATA_DIR=/tmp/fdpm-spec-dnis npx tsx fdpm-cli/src/bin/fdpm.ts \
 *     render spec-dnis text/markdown \
 *     --renderer-id spec:SpecMarkdownRenderer \
 *     -o docs/specs/SPEC-DNIS.md
 *
 * Validation runs on commit (§7 pipeline of the SPEC-CORE host). Any
 * rule violation surfaces as a finding — including PALS-LAW rules.
 */

import {
  openHost,
  defineProject,
  type PrimitiveSpec,
  type RelationSpec,
} from "../src/sdk.js";
import { PROFILE_ID } from "../plugins/spec_authoring/index.js";

const PROJECT_ID = "spec-dnis";

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ── Document root ──────────────────────────────────────────────────────────

const documentSpec: PrimitiveSpec = {
  id: "spec:doc:dnis",
  type: "spec:Document",
  fields: {
    title: "Document Node Identity Specification (DNIS) v0.1.5",
    subtitle:
      "Stable node identity for documents edited by LLM agents and human collaborators.",
    spec_id: "spec:dnis:0.1.5",
    version: "0.1.5",
    status: "Proposal",
    audience:
      "Implementers of document stores and editing pipelines that host LLM agents, human collaborators, and audit-bearing references.",
    required_reads: [
      "CLAUDE.md",
      "PURPOSE.md",
      "DISCLAIMER.md",
      "dnis-spec.md",
      "docs/specs/SPEC-CORE.md",
      "docs/specs/SPEC-UID.md",
    ],
    peer_spec: "docs/specs/SPEC-UID.md",
    disclaimer_path: "../../DISCLAIMER.md",
    pals_banner: true,
    pals_extension:
      "DNIS is a proposal that has been refined across five iterative passes (v0.1.0 → v0.1.5) but has not been reviewed by an external standards body, has no implementations beyond the §15 reference example (which itself is unverified — see §15 and the `cannot_verify` entry in §17), and has not been tested at scale. " +
      "No claim, requirement, or guarantee within this document should be taken as ground truth without independent verification. " +
      "Any statement not backed by a real reference, mathematical derivation, or executable implementation may be invalid, erroneous, or hallucinated.",
    date: "2026-05-04",
    generated_by: "Claude Opus 4.7 (1M context) via Claude Code (fdpm.spec-authoring)",
    revision_note:
      "0.1.5 (pass 6) — status promoted Draft → Proposal; spec_id and version drop the `-draft` suffix accordingly; §1.2 prose, PALS-LAW banner, and §5.2 schemaVersion example brought into line with the proposal status. No normative changes to §3–§16. See Appendix B.",
    source_script: "fdpm-cli/scripts/build-spec-dnis.ts",
    regeneration_command: [
      "rm -rf /tmp/fdpm-spec-dnis",
      "FDPM_DATA_DIR=/tmp/fdpm-spec-dnis npx tsx fdpm-cli/scripts/build-spec-dnis.ts",
      "FDPM_DATA_DIR=/tmp/fdpm-spec-dnis npx tsx fdpm-cli/src/bin/fdpm.ts \\",
      "  render spec-dnis text/markdown \\",
      "  --renderer-id spec:SpecMarkdownRenderer \\",
      "  -o docs/specs/SPEC-DNIS.md",
    ].join("\n"),
  },
};

// ── §2.1 Defined Terms ─────────────────────────────────────────────────────

const terms: Array<[string, string, string?]> = [
  [
    "Document",
    "A collection of Nodes plus metadata, identified by a Document Identifier.",
  ],
  [
    "Node",
    "A unit of identity within a Document. Holds content and participates in a tree or list ordering.",
  ],
  [
    "Node Identifier",
    "A stable, opaque, globally unique string identifying a Node for the duration of the Node's lifetime.",
    "NID",
  ],
  [
    "Document Identifier",
    "A stable, opaque, globally unique string identifying a Document.",
    "DID",
  ],
  [
    "Operation",
    "A described mutation of the Document, applied atomically.",
  ],
  [
    "Operation Identifier",
    "A stable, opaque, globally unique string identifying an Operation, used for idempotency.",
    "OID",
  ],
  [
    "Agent Identifier",
    "An identifier of the actor (human user, software agent, automation) that authored an Operation.",
    "AID",
  ],
  [
    "Position",
    "An opaque, totally ordered string used for sibling ordering within a parent.",
  ],
  [
    "Content Hash",
    "A deterministic digest of a Node's canonicalized content.",
  ],
  ["Lineage", "The set of Nodes from which a Node was derived."],
  [
    "Revision",
    "A monotonic per-Node integer incremented on every accepted mutation of that Node.",
  ],
  [
    "Retired Node",
    "A Node that has been removed from the active Document but retained for lineage and reference resolution.",
  ],
];
const termSpecs: PrimitiveSpec[] = terms.map(([term, definition, synonyms]) => ({
  id: `spec:term:${slug(term)}`,
  type: "spec:Term",
  fields: synonyms ? { term, definition, synonyms } : { term, definition },
}));

// ── §3 Design Principles (the 6 stated invariants) ─────────────────────────

const principles: Array<{
  id: string;
  ordinal: number;
  title: string;
  statement: string;
  strength: string;
}> = [
  {
    id: "spec:prin:identity-independent-of-content",
    ordinal: 1,
    title: "Identity is independent of content.",
    statement:
      "A Node's NID MUST NOT change as a consequence of any edit to that Node's content.",
    strength: "MUST",
  },
  {
    id: "spec:prin:identity-independent-of-position",
    ordinal: 2,
    title: "Identity is independent of position.",
    statement:
      "A Node's NID MUST NOT change as a consequence of any move, reorder, or reparenting.",
    strength: "MUST",
  },
  {
    id: "spec:prin:new-nodes-are-new-identities",
    ordinal: 3,
    title: "New nodes are new identities.",
    statement:
      "A split, merge, or content regeneration that produces a Node not equal to any existing Node MUST produce a new NID, with lineage recorded.",
    strength: "MUST",
  },
  {
    id: "spec:prin:operations-idempotent-under-retry",
    ordinal: 4,
    title: "Operations are idempotent under retry.",
    statement:
      "Re-applying the same Operation (same OID) MUST NOT produce additional state changes.",
    strength: "MUST",
  },
  {
    id: "spec:prin:references-resolve-through-retirement",
    ordinal: 5,
    title: "References resolve to a defined outcome.",
    statement:
      "A reference to a NID MUST resolve to exactly one of the five §11.2 outcomes — active, retired, evolved-via-lineage, purged, or not-found — and MUST NOT be silently dropped.",
    strength: "MUST",
  },
  {
    id: "spec:prin:position-change-is-local",
    ordinal: 6,
    title: "Position change is local.",
    statement:
      "Reordering a single Node MUST NOT require updating the Position field of any other Node.",
    strength: "MUST",
  },
];
const principleSpecs: PrimitiveSpec[] = principles.map((p) => ({
  id: p.id,
  type: "spec:Principle",
  fields: {
    ordinal: p.ordinal,
    title: p.title,
    statement: p.statement,
    strength: p.strength,
  },
}));

// ── Stakeholders (implicit; derived from the abstract + §13 + §14) ─────────

const stakeholders: PrimitiveSpec[] = [
  {
    id: "spec:stk:llm-agent",
    type: "spec:Stakeholder",
    fields: {
      role: "LLM agent (autonomous/semi-autonomous editor)",
      primary_concern:
        "Submit edits and retries with stable Operation IDs; have references to nodes I previously cited continue to resolve after my own subsequent edits.",
      category: "agent",
    },
  },
  {
    id: "spec:stk:human-collaborator",
    type: "spec:Stakeholder",
    fields: {
      role: "Human collaborator",
      primary_concern:
        "Trust that comments, citations, and audit links survive arbitrary content rewriting and structural reorganization performed by other actors.",
      category: "human",
    },
  },
  {
    id: "spec:stk:audit-consumer",
    type: "spec:Stakeholder",
    fields: {
      role: "Audit / compliance consumer",
      primary_concern:
        "Reconstruct the lineage of any node, attribute every Operation to an Agent, and detect when retired content has been hard-purged for regulatory reasons.",
      category: "regulatory",
    },
  },
  {
    id: "spec:stk:store-implementer",
    type: "spec:Stakeholder",
    fields: {
      role: "Store implementer",
      primary_concern:
        "Have an unambiguous list of MUST/SHOULD/MAY clauses, structured pre/postconditions per Operation, and Test Vectors that confirm invariants are upheld.",
      category: "external_team",
    },
  },
];

// ── Quality Attributes (in tension; derived from §3 + §10 + §13) ───────────

const qas: PrimitiveSpec[] = [
  {
    id: "spec:qa:identity-stability",
    type: "spec:QualityAttribute",
    fields: {
      attribute: "Identity stability",
      pressure:
        "NIDs MUST survive any content edit, any move, any retry, and (via lineage) any retirement. Identity drift would invalidate every reference held by external consumers.",
      priority: "primary",
    },
  },
  {
    id: "spec:qa:idempotency",
    type: "spec:QualityAttribute",
    fields: {
      attribute: "Idempotency under retry",
      pressure:
        "An LLM agent's transport layer may retry indefinitely. The store MUST detect and short-circuit retries by OID; recording the original OperationResult is the only correct semantics.",
      priority: "primary",
    },
  },
  {
    id: "spec:qa:lineage-completeness",
    type: "spec:QualityAttribute",
    fields: {
      attribute: "Lineage completeness",
      pressure:
        "References to retired nodes MUST resolve through derivedFrom transitively. Dropping lineage on retirement breaks every reference that pre-dated the retirement.",
      priority: "primary",
    },
  },
  {
    id: "spec:qa:locality",
    type: "spec:QualityAttribute",
    fields: {
      attribute: "Operation locality",
      pressure:
        "A move or insert MUST modify exactly one Node's Position. Bulk renumbering would defeat the per-Node revision invariant and turn every reorder into a fan-out write.",
      priority: "secondary",
    },
  },
  {
    id: "spec:qa:auditability",
    type: "spec:QualityAttribute",
    fields: {
      attribute: "Auditability",
      pressure:
        "Every state change MUST be attributable to an AID and recoverable from the OperationResult log. This is the audit substrate consumers depend on.",
      priority: "primary",
    },
  },
  {
    id: "spec:qa:privacy",
    type: "spec:QualityAttribute",
    fields: {
      attribute: "Privacy",
      pressure:
        "Lineage retention is in tension with regulatory right-to-erasure. Time-sortable IDs leak creation cadence. Both must be addressable without violating §3 invariants.",
      priority: "secondary",
    },
  },
];

// ── Invariants (the structural ones beyond §3 principles) ──────────────────

const invariants: PrimitiveSpec[] = [
  {
    id: "spec:inv:nid-once-and-only-once",
    type: "spec:Invariant",
    fields: {
      label: "NIDs are assigned once and never reused",
      statement:
        "A NID MUST be assigned exactly once at Node creation and MUST NOT be reassigned, mutated, or reused across Nodes for any reason.",
      enforcement: "runtime_check",
      scope_ref: "§4.1",
    },
  },
  {
    id: "spec:inv:operation-result-atomicity",
    type: "spec:Invariant",
    fields: {
      label: "OperationResult atomicity",
      statement:
        "The recording of an OperationResult MUST be atomic with the state changes the Operation produced. The store MUST NOT apply state changes without recording the result, nor record a result without applying state changes.",
      enforcement: "runtime_check",
      scope_ref: "§8.2",
    },
  },
  {
    id: "spec:inv:retired-node-resolvable",
    type: "spec:Invariant",
    fields: {
      label: "Retired nodes remain resolvable",
      statement:
        "A retired Node MUST remain resolvable by its NID for the purposes of lineage and reference resolution. The Node MUST NOT be deleted from storage; it MUST be marked retired.",
      enforcement: "runtime_check",
      scope_ref: "§7.6",
    },
  },
  {
    id: "spec:inv:lineage-acyclic",
    type: "spec:Invariant",
    fields: {
      label: "Lineage is acyclic",
      statement:
        "The derivedFrom graph MUST be acyclic. Cycles are impossible under correct application of the spec because derivedFrom always points backward in time to NIDs that already exist at creation, but defensive checks are recommended.",
      enforcement: "review",
      scope_ref: "§11.3",
    },
  },
  {
    id: "spec:inv:position-total-order",
    type: "spec:Invariant",
    fields: {
      label: "Positions form a total order",
      statement:
        "Position values MUST be totally ordered by lexicographic comparison over their byte representation under a single, document-wide collation. UTF-8 byte order is RECOMMENDED.",
      enforcement: "runtime_check",
      scope_ref: "§6.1",
    },
  },
  {
    id: "spec:inv:insertion-property",
    type: "spec:Invariant",
    fields: {
      label: "Insertion Property",
      statement:
        "For any two existing Positions a and b with a < b, an implementation MUST be able to compute a new Position c such that a < c < b, without modifying a or b.",
      enforcement: "runtime_check",
      scope_ref: "§6.2",
    },
  },
  {
    id: "spec:inv:operation-atomicity",
    type: "spec:Invariant",
    fields: {
      label: "Operations are atomic",
      statement:
        "All Operations MUST be applied atomically: either all postconditions hold or no state change is persisted.",
      enforcement: "runtime_check",
      scope_ref: "§7",
    },
  },
];

// ── Requirements (RFC 2119 normative clauses) ──────────────────────────────

const requirements: PrimitiveSpec[] = [
  req(
    "spec:req:nid-format",
    "NID format",
    "A NID MUST be one of: a ULID per [ULID]; or a UUID Version 7 per [RFC9562] §5.7. A NID MUST be 128 bits in total length and MUST carry at least 74 bits of randomness (the lower bound permitted by either format). A NID MUST NOT be derived from the Node's content. As a privacy carve-out, a Document MAY use UUIDv4 [RFC9562] §5.4 or NanoID for its NIDs to avoid leaking creation timestamps; in that case the Document MUST declare `Document.metadata.nidFormat` (one of \"ulid\", \"uuidv7\", \"uuidv4\", \"nanoid\") and forfeits the time-sortability properties §16 may otherwise rely on.",
    "MUST",
    "test",
    "TV-1, TV-3, TV-4 (any test that asserts NID stability also exercises format).",
  ),
  req(
    "spec:req:nid-immutability",
    "NID immutability",
    "A NID MUST be assigned exactly once at the moment of Node creation. A NID MUST NOT be reassigned, mutated, or reused.",
    "MUST",
    "test",
    "TV-1 + a unit test that attempts to mutate `n.id` and asserts rejection.",
  ),
  req(
    "spec:req:did-format",
    "DID format",
    "A DID MUST follow the same constraints as a NID. A DID MUST be assigned exactly once at Document creation and MUST NOT be reassigned.",
    "MUST",
    "test",
    "Document-creation test asserting DID format and immutability.",
  ),
  req(
    "spec:req:oid-agent-generated",
    "OID is Agent-generated",
    "An OID MUST be generated by the originating Agent BEFORE the Operation is submitted to the store. The same OID MUST be used on retries of the same logical Operation.",
    "MUST",
    "test",
    "TV-2 (idempotency under retry).",
  ),
  req(
    "spec:req:aid-unique",
    "AID uniqueness",
    "An AID MUST be a string that uniquely identifies the originating Agent within the deployment. Implementations SHOULD distinguish between human Agents and software Agents in the AID structure.",
    "MUST",
    "review",
    "Code review of the AID minting / authentication path.",
  ),
  req(
    "spec:req:branded-types",
    "Branded identifier types",
    "Implementations in languages other than TypeScript MUST preserve the field names, types, semantics, and optionality declared in §5. Branded ID types in TypeScript are normative.",
    "MUST",
    "review",
    "Schema diff against §5 declarations.",
  ),
  req(
    "spec:req:position-non-empty",
    "Position is non-empty string",
    "A Position MUST be a non-empty string.",
    "MUST",
    "runtime_assertion",
    "Pre-write validator on every create/move payload.",
  ),
  req(
    "spec:req:position-locality",
    "Position locality",
    "A move or insert of a single Node MUST modify only that Node's Position field. Bulk renumbering of siblings is NOT permitted as a result of any single Operation.",
    "MUST",
    "test",
    "TV-4.",
  ),
  req(
    "spec:req:atomic-operations",
    "Atomic operation application",
    "All Operations MUST be applied atomically: either all postconditions hold or no state change is persisted.",
    "MUST",
    "test",
    "Failure-injection test on each Operation kind.",
  ),
  req(
    "spec:req:idempotency-map",
    "Idempotency via OperationResult map",
    "A store MUST maintain a persistent map from OperationId to OperationResult. On receipt of an Operation whose id is already present, the store MUST return the recorded result, MUST NOT re-execute, and MUST NOT modify any Node state.",
    "MUST",
    "test",
    "TV-2.",
  ),
  req(
    "spec:req:idempotency-payload-mismatch",
    "Payload mismatch on retry",
    "If a retried Operation has the same id but different payload than the recorded one, the store MUST still return the original result and MUST NOT apply the new payload. Implementations SHOULD log such mismatches.",
    "MUST",
    "test",
    "Adversarial-retry test in §8.4.",
  ),
  req(
    "spec:req:hash-sha256",
    "SHA-256 support",
    "The contentHash field MUST be the digest of the Node's canonicalized content under SHA-256 [FIPS 180-4]. BLAKE3 support is OPTIONAL.",
    "MUST",
    "test",
    "Hash round-trip test against a known canonicalization fixture.",
  ),
  req(
    "spec:req:hash-canonicalization",
    "Content canonicalization",
    "Content MUST be canonicalized before hashing such that two equivalent contents produce identical hashes. For JSON content, implementations MUST use [RFC 8785] (JSON Canonicalization Scheme) or document an alternative satisfying determinism properties.",
    "MUST",
    "test",
    "Round-trip canonicalization test on permuted-key JSON.",
  ),
  req(
    "spec:req:hash-not-identity",
    "contentHash is not identity",
    "contentHash MUST NOT be used as the Node's identity.",
    "MUST",
    "review",
    "Code review of identity-resolution paths.",
  ),
  req(
    "spec:req:expected-revision",
    "Optimistic concurrency via expectedRevision",
    "All single-target mutating Operations on existing Nodes (edit, move, split, retire) MUST support an expectedRevision field. The merge Operation MUST support per-target revision checks under §10.1.2 Mode A; Level 2 conformance REQUIRES Mode A. The compact Operation (§7.8) is structural maintenance and is EXEMPT from revision-bump and expectedRevision semantics. When provided, the store MUST reject the Operation if the relevant target revision(s) do not match.",
    "MUST",
    "test",
    "TV-5.",
  ),
  req(
    "spec:req:reference-resolution",
    "Reference resolution outcomes",
    "When resolving a reference to NID n, an implementation MUST distinguish among five outcomes: (1) active Node, (2) retired Node with `retired: true`, (3) evolved-via-lineage descendants (ordered by Position), (4) purged tombstone (content irretrievable; structural metadata retained per §14.2), (5) not-found.",
    "MUST",
    "test",
    "Resolution-matrix test covering all five cases.",
  ),
  req(
    "spec:req:lineage-walk-transitive",
    "Lineage walk is transitive",
    "Lineage MUST be walked transitively. If Node A was derived from B which was derived from C, a reference to C resolves to A via two hops through derivedFrom.",
    "MUST",
    "test",
    "Multi-hop lineage resolution test.",
  ),
  req(
    "spec:req:compact-no-revision-bump",
    "Compact does not bump revision",
    "The compact Operation (§7.8) MUST update only the `position` field of each target Node. It MUST NOT increment `revision`, MUST NOT update `lastEditedBy`, `lastEditedAt`, or `lastOperationId`. The OperationResult log (§8) is the sole audit trail for compact Operations. This preserves the read-merge-retry contract for clients holding revision-based optimistic-concurrency tokens.",
    "MUST",
    "test",
    "TV-6.",
  ),
  req(
    "spec:req:nid-not-secret",
    "NID is not a secret",
    "NIDs are public, opaque identifiers. They MUST NOT be used as authentication or authorization secrets. An implementation MUST authenticate the originating Agent of every Operation independently.",
    "MUST",
    "review",
    "Security review of the auth boundary.",
  ),
];

function req(
  id: string,
  label: string,
  statement: string,
  strength: string,
  verifiability: string,
  verifier_ref: string,
): PrimitiveSpec {
  return {
    id,
    type: "spec:Requirement",
    fields: { label, statement, strength, verifiability, verifier_ref },
  };
}

// ── §16 Test Vectors as Acceptance Criteria ────────────────────────────────

const acceptances: PrimitiveSpec[] = [
  ac(
    1,
    "tv-1-identity-preservation-under-edit",
    "**TV-1 — Identity Preservation Under Edit.** Given a Node n with NID id_n and content c1, applying an `edit` Operation with content c2: n.id after the Operation MUST equal id_n; n.content MUST equal c2; n.contentHash MUST equal hash(canonicalize(c2)); n.revision MUST be one greater than before; all references to id_n MUST still resolve to n.",
    "open",
  ),
  ac(
    2,
    "tv-2-idempotency-under-retry",
    "**TV-2 — Idempotency Under Retry.** Given an Operation op with OID oid_op applied successfully and recorded as OperationResult R, any subsequent Operation submitted with OID oid_op (including with a different payload) MUST NOT modify any Node state and MUST return R verbatim — including the original `appliedAt` server timestamp. The snapshot semantics are normative in §8.5.",
    "open",
  ),
  ac(
    3,
    "tv-3-lineage-after-split",
    "**TV-3 — Lineage After Split.** Given a Node n with NID id_n, applying a `split` Operation producing parts p1, p2: n MUST be retired; p1.id and p2.id MUST be freshly generated NIDs; p1.derivedFrom MUST equal [id_n]; p2.derivedFrom MUST equal [id_n]; a reference resolution against id_n MUST return n with retired: true and a descendant set {p1, p2}.",
    "open",
  ),
  ac(
    4,
    "tv-4-position-locality",
    "**TV-4 — Position Locality.** Given a Node n and applying a `move` Operation: only n.parentNodeId, n.position, n.revision, and n.lastEdited* fields MAY change. No other Node in the Document MAY have any field modified by this Operation.",
    "open",
  ),
  ac(
    5,
    "tv-5-stale-write-rejection",
    "**TV-5 — Stale Write Rejection.** Given a Node n at revision r, an `edit` Operation with expectedRevision = r - 1: MUST be rejected; MUST NOT modify any Node state; MUST record no OperationResult.",
    "open",
  ),
  ac(
    6,
    "tv-6-compact-preserves-revision",
    "**TV-6 — Compact Preserves Revision and Identity.** Given Nodes n1..nk in a Document at revisions r1..rk, applying a `compact` Operation (§7.8) repositioning all of them: each ni.id MUST equal its pre-Operation value; each ni.revision MUST equal ri (unchanged); ni.lastEditedBy, ni.lastEditedAt, ni.lastOperationId MUST equal their pre-Operation values; only ni.position MAY change. The OperationResult MUST be recorded in the §8 idempotency map but MUST NOT appear in any per-Node audit field.",
    "open",
  ),
];

function ac(
  ord: number,
  id: string,
  criterion: string,
  status: string,
): PrimitiveSpec {
  return {
    id: `spec:ac:${id}`,
    type: "spec:AcceptanceCriterion",
    fields: { ordinal: ord, criterion, status },
  };
}

// ── §12 Conformance Levels ────────────────────────────────────────────────

const conformance: PrimitiveSpec[] = [
  {
    id: "spec:conf:level-1-sequential",
    type: "spec:ConformanceItem",
    fields: {
      ordinal: 1,
      name: "Level 1 — Sequential",
      procedure:
        "Implement single-Agent or fully sequential multi-Agent editing. Cover all sections of the specification except §10.3 (CRDT layer).",
      expected:
        "Sufficient for: single-user AI editing sessions, server-mediated agent pipelines, batch editing. Conformance test suite: TV-1 through TV-5 against a single-process reference.",
    },
  },
  {
    id: "spec:conf:level-2-optimistic-concurrent",
    type: "spec:ConformanceItem",
    fields: {
      ordinal: 2,
      name: "Level 2 — Optimistic Concurrent",
      procedure:
        "Implement Level 1, plus enforcement of expectedRevision on all single-target mutating Operations (edit, move, split, retire), plus support for merge under §10.1.2 Mode A (per-target revision check via `expectedRevisions`). Mode B is NOT permitted at Level 2.",
      expected:
        "Sufficient for: multiple Agents editing the same Document with read-merge-retry semantics on conflict. TV-5 is the load-bearing addition. Mode B implementations claim Level 1 only.",
    },
  },
  {
    id: "spec:conf:level-3-convergent",
    type: "spec:ConformanceItem",
    fields: {
      ordinal: 3,
      name: "Level 3 — Convergent (Reserved)",
      procedure:
        "Implement Level 2, plus a CRDT or equivalent convergent layer beneath the Operation interface, satisfying the constraints of §10.3.",
      expected:
        "Reserved for a future revision. Implementations MAY claim Level 3 only when §10.3 is normatively defined.",
    },
  },
];

// ── §13/§14 Risks + Mitigations ────────────────────────────────────────────

const risks: PrimitiveSpec[] = [
  risk(
    "spec:risk:identity-forgery",
    "Identity forgery via NID misuse",
    "NIDs are public; if an implementation uses them as auth or authz secrets, an adversary in possession of a NID gains write access. Risk surfaces wherever NIDs are accepted as bearer tokens.",
    "low",
    "high",
  ),
  risk(
    "spec:risk:replay",
    "Replay of valid Operations",
    "An adversary in possession of a valid Operation can replay it; idempotency ensures the store treats the replay as a no-op. The risk is that retransmission via stolen credentials submits a NEW Operation, not a replayed one — out of scope for this spec but real.",
    "medium",
    "medium",
  ),
  risk(
    "spec:risk:lineage-exposure",
    "Lineage exposure of sensitive content",
    "derivedFrom reveals editing history. For Documents containing sensitive content, unauthorized callers reading lineage may reconstruct redacted prior states.",
    "medium",
    "high",
  ),
  risk(
    "spec:risk:hash-collision",
    "Hash collision",
    "SHA-256 provides 128-bit collision resistance, adequate for integrity-check and dedup. Risk surfaces only if contentHash is mistakenly used as a cryptographic commitment to authorship.",
    "low",
    "low",
  ),
  risk(
    "spec:risk:timestamp-manipulation",
    "Timestamp manipulation by Agents",
    "createdAt and lastEditedAt are advisory and Agent-set. A malicious Agent can backdate or post-date its edits.",
    "medium",
    "low",
  ),
  risk(
    "spec:risk:id-time-leakage",
    "Embedded timestamps in IDs leak creation time",
    "Both ULID and UUIDv7 embed millisecond-precision creation timestamps. For Documents where this leakage is a concern (e.g. sealed-bid auctions, sensitive editorial workflows), the time-sortability becomes a side channel.",
    "medium",
    "medium",
  ),
  risk(
    "spec:risk:lineage-vs-erasure",
    "Lineage vs right-to-erasure",
    "The lineage invariant (§7.7) tensions with regulatory requirements such as GDPR Article 17. A naive implementation cannot delete content while preserving the reference-resolution guarantees.",
    "high",
    "high",
  ),
  risk(
    "spec:risk:position-string-growth",
    "Position string growth under repeated insertion",
    "Repeated insertions between adjacent positions cause Position strings to grow without bound. Without rebalancing, write amplification eventually pushes Position bytes past sane storage limits.",
    "medium",
    "low",
  ),
  risk(
    "spec:risk:idempotency-gc-window",
    "Idempotency map GC window",
    "After OperationResult records are garbage-collected, a retried Operation from a slow client will be treated as new — breaking the idempotency guarantee. The retention window must exceed the maximum retry latency in the deployment.",
    "medium",
    "medium",
  ),
];

function risk(
  id: string,
  label: string,
  description: string,
  likelihood: string,
  impact: string,
): PrimitiveSpec {
  return {
    id,
    type: "spec:Risk",
    fields: { label, description, likelihood, impact },
  };
}

const mitigations: PrimitiveSpec[] = [
  mit(
    "spec:mit:authenticate-agent-independently",
    "An implementation MUST authenticate the originating Agent of every Operation independently of any NID/DID/OID material on the wire. NIDs are never bearer tokens. (§13.1)",
    "planned",
  ),
  mit(
    "spec:mit:transport-auth-required",
    "Replay protection for credential theft is out of scope; transport authentication (mTLS, signed sessions, etc.) is required separately. The spec documents the boundary so implementers know to layer authn underneath. (§13.2)",
    "planned",
  ),
  mit(
    "spec:mit:lineage-authz-filter",
    "Implementations SHOULD provide an authorization mechanism that filters retired Nodes and lineage from unauthorized callers. (§13.3)",
    "planned",
  ),
  mit(
    "spec:mit:sign-content-separately",
    "For commitment-to-authorship semantics, sign the canonicalized content separately with a key bound to the Agent. contentHash is integrity, not authorship. (§13.4)",
    "planned",
  ),
  mit(
    "spec:mit:server-side-applied-at",
    "Implementations SHOULD record a server-side timestamp in OperationResult.appliedAt and prefer it for audit purposes; Agent-set createdAt/lastEditedAt are advisory. (§13.5)",
    "planned",
  ),
  mit(
    "spec:mit:non-time-sortable-ids",
    "For Documents where time-sortability is a side-channel, implementations MAY use UUIDv4 [RFC9562 §5.4] or NanoID for NIDs as a privacy carve-out. The Document MUST declare `Document.metadata.nidFormat` (one of \"ulid\", \"uuidv7\", \"uuidv4\", \"nanoid\") and MUST satisfy all other requirements of this specification. Time-sortability properties §16 may otherwise rely on are forfeited. (§4.1, §14.1)",
    "planned",
  ),
  mit(
    "spec:mit:purge-path-with-tombstone",
    "Implementations operating in jurisdictions with right-to-erasure obligations MUST provide a documented purge path that removes content while preserving sufficient structure to detect broken references gracefully (returning \"purged\" rather than \"missing\"). (§14.2, §7.7)",
    "planned",
  ),
  mit(
    "spec:mit:position-rebalance-as-moves",
    "Implementations MAY periodically rebalance Positions in a maintenance Operation; rebalancing MUST be expressed as a sequence of `move` Operations so that lineage and idempotency properties are preserved. (§6.4)",
    "planned",
  ),
  mit(
    "spec:mit:idempotency-retention-policy",
    "The OperationId → OperationResult map SHOULD be retained for at least 7 days. Implementations operating Agents with retry windows or transport latencies likely to exceed this floor SHOULD scale retention accordingly. Implementations MUST document the chosen retention period. (§8.3)",
    "planned",
  ),
];

function mit(id: string, strategy: string, status: string): PrimitiveSpec {
  return {
    id,
    type: "spec:Mitigation",
    fields: { strategy, status },
  };
}

// ── Appendix A — Open Questions ────────────────────────────────────────────

// SPEC-AUTHORING note: prior pass-3 marked the cross-document-references
// question as `is_blocking: "yes"`, but the spec already chooses a default
// ("reject mismatches, defer to a profile") — so the question is
// resolved-via-deferral, identical in shape to Q2..Q5. The blocking flag
// is removed in pass 5; if a future revision genuinely blocks on it, the
// flag can be reinstated.
const openQuestions: PrimitiveSpec[] = [
  {
    id: "spec:q:cross-document-references",
    type: "spec:OpenQuestion",
    fields: {
      ordinal: 1,
      question:
        "Cross-document references. This specification scopes NIDs to a Document via documentId redundancy on every Node. A formal cross-document reference type with resolution semantics is not yet defined.",
      default_choice:
        "Treat cross-document references as out of scope for the v0.1.x line; current implementations MUST reject references whose documentId differs from the resolving Document.",
      is_blocking: "no",
      owner: "Spec author",
    },
  },
  {
    id: "spec:q:schema-migration",
    type: "spec:OpenQuestion",
    fields: {
      ordinal: 2,
      question:
        "How does a Document created under a 0.1.x `schemaVersion` interoperate with a store implementing a future 0.2.x or 1.0 revision? A profile of forward/backward compatibility rules is needed.",
      default_choice:
        "Defer to a profile spec; current behaviour is undefined and implementations SHOULD reject mixed-version interactions until rules are written. The `schemaVersion` field is `readonly` (§5.2) so an in-place rewrite is not a legal migration path.",
      is_blocking: "no",
    },
  },
  {
    id: "spec:q:bulk-operations",
    type: "spec:OpenQuestion",
    fields: {
      ordinal: 3,
      question:
        "Bulk Operations. Operations affecting many Nodes (e.g., reflowing a list, applying a style across a section) currently require N independent Operations. A bulk Operation primitive may be needed for performance without violating locality.",
      default_choice:
        "Defer; locality (§3 invariant 6) is primary, performance is secondary. Add only if measured contention shows fan-out is the bottleneck.",
      is_blocking: "no",
    },
  },
  {
    id: "spec:q:agent-provenance",
    type: "spec:OpenQuestion",
    fields: {
      ordinal: 4,
      question:
        "Agent provenance beyond AID. For LLM Agents, recording the model identifier, prompt hash, and decoding parameters at the Operation level may be required for reproducibility audits.",
      default_choice:
        "Defer to a profile; AID is sufficient for the v0.1.x line. A profile spec can extend Operation with provenance fields without breaking the data model.",
      is_blocking: "no",
    },
  },
  {
    id: "spec:q:retirement-ttl",
    type: "spec:OpenQuestion",
    fields: {
      ordinal: 5,
      question:
        "Retirement TTL. When, if ever, may retired Nodes be hard-deleted? Tied to the privacy considerations in §14.2.",
      default_choice:
        "Never automatically; only via the documented purge path mandated by §14.2 and §7.7. TTL semantics are operator-controlled, not spec-controlled.",
      is_blocking: "no",
    },
  },
];

// ── §17 References ────────────────────────────────────────────────────────

const references: PrimitiveSpec[] = [
  {
    id: "spec:ref:bcp-14",
    type: "spec:Reference",
    fields: {
      kind: "rfc",
      citation:
        "Bradner, S., \"Key words for use in RFCs to Indicate Requirement Levels\", BCP 14, RFC 2119, March 1997. Leiba, B., \"Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words\", BCP 14, RFC 8174, May 2017.",
      locator: "https://datatracker.ietf.org/doc/bcp14/",
      verification: "verified",
      verification_note:
        "Both RFCs read at SPEC-authoring time; the keyword interpretation rules used throughout this document follow them.",
    },
  },
  {
    id: "spec:ref:rfc9562",
    type: "spec:Reference",
    fields: {
      kind: "rfc",
      citation:
        "Davis, K., Peabody, B., Leach, P., \"Universally Unique IDentifiers (UUIDs)\", RFC 9562, May 2024.",
      locator: "https://datatracker.ietf.org/doc/rfc9562/",
      verification: "verified",
      verification_note:
        "§5.7 (UUIDv7) is load-bearing for §4.1 NID format options.",
    },
  },
  {
    id: "spec:ref:ulid",
    type: "spec:Reference",
    fields: {
      kind: "spec",
      citation:
        "Feerasta, A., \"ULID — Universally Unique Lexicographically Sortable Identifier\", 2016.",
      locator: "https://github.com/ulid/spec",
      verification: "verified",
      verification_note:
        "26-char Crockford-base32 encoding + 48-bit timestamp + 80-bit randomness layout cited in §4.1.",
    },
  },
  {
    id: "spec:ref:rfc8785",
    type: "spec:Reference",
    fields: {
      kind: "rfc",
      citation:
        "Rundgren, A., Jordan, B., Erdtman, S., \"JSON Canonicalization Scheme (JCS)\", RFC 8785, June 2020.",
      locator: "https://datatracker.ietf.org/doc/rfc8785/",
      verification: "verified",
      verification_note:
        "Canonicalization algorithm referenced verbatim in §9.2 for JSON content hashing.",
    },
  },
  {
    id: "spec:ref:fips-180-4",
    type: "spec:Reference",
    fields: {
      kind: "iso_standard",
      citation: "NIST, \"Secure Hash Standard (SHS)\", FIPS PUB 180-4, August 2015.",
      locator: "https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf",
      verification: "verified",
      verification_note:
        "SHA-256 specification cited as REQUIRED hash algorithm in §9.1.",
    },
  },
  {
    id: "spec:ref:blake3",
    type: "spec:Reference",
    fields: {
      kind: "spec",
      citation:
        "Aumasson, J.-P., Neves, S., Wilcox-O'Hearn, Z., O'Connor, J., \"BLAKE3 one function, fast everywhere\", 2020.",
      locator: "https://github.com/BLAKE3-team/BLAKE3-specs",
      verification: "unverified",
      verification_note:
        "Cited as OPTIONAL alternative to SHA-256 in §9.1; reader should verify the spec revision before adoption.",
    },
  },
  {
    id: "spec:ref:multihash",
    type: "spec:Reference",
    fields: {
      kind: "spec",
      citation:
        "Multiformats, \"Multihash — Self-describing hashes\".",
      locator: "https://github.com/multiformats/multihash",
      verification: "unverified",
      verification_note:
        "Format prefix convention cited as RECOMMENDED in §9.1; reader should verify codec assignments before adoption.",
    },
  },
  {
    id: "spec:ref:greenspan",
    type: "spec:Reference",
    fields: {
      kind: "url",
      citation:
        "Greenspan, D., \"Implementing Fractional Indexing\".",
      locator:
        "https://observablehq.com/@dgreensp/implementing-fractional-indexing",
      verification: "unverified",
      verification_note:
        "Cited as the canonical informal reference for fractional indexing (§6.2). Reader should consult primary sources for production implementations.",
    },
  },
  {
    id: "spec:ref:yjs",
    type: "spec:Reference",
    fields: {
      kind: "url",
      citation:
        "Jahns, K., \"Yjs — A CRDT framework with a powerful abstraction of shared data\".",
      locator: "https://github.com/yjs/yjs",
      verification: "unverified",
      verification_note:
        "Cited in §10.3 as a candidate CRDT for the future Level 3 profile; not yet integrated.",
    },
  },
  {
    id: "spec:ref:automerge",
    type: "spec:Reference",
    fields: {
      kind: "url",
      citation:
        "Automerge — A library of data structures for building collaborative applications.",
      locator: "https://automerge.org/",
      verification: "unverified",
      verification_note:
        "Cited in §10.3 alongside Yjs as a Level 3 candidate.",
    },
  },
  {
    id: "spec:ref:crdt-shapiro",
    type: "spec:Reference",
    fields: {
      kind: "paper",
      citation:
        "Shapiro, M., Preguiça, N., Baquero, C., Zawirski, M., \"A comprehensive study of Convergent and Commutative Replicated Data Types\", INRIA Research Report, 2011.",
      locator: "https://hal.inria.fr/inria-00609399",
      verification: "unverified",
      verification_note:
        "Foundational CRDT paper informing §10.3; reader should verify the paper revision before citing it as authority.",
    },
  },
  {
    id: "spec:ref:helland-idempotence",
    type: "spec:Reference",
    fields: {
      kind: "paper",
      citation:
        "Helland, P., \"Idempotence Is Not a Medical Condition\", ACM Queue, 2012.",
      locator: "https://queue.acm.org/detail.cfm?id=2187821",
      verification: "unverified",
      verification_note:
        "Informative reference for §8 idempotency reasoning; reader should consult the original article for context.",
    },
  },
  {
    id: "spec:ref:document-store-mjs",
    type: "spec:Reference",
    fields: {
      kind: "repo_file",
      citation:
        "document-store.mjs — non-normative reference implementation referenced by §15 of the source DNIS draft.",
      locator: "(not present in this repository)",
      verification: "cannot_verify",
      verification_note:
        "The source DNIS draft (dnis-spec.md §15) names a `document-store.mjs` reference implementation in \"the companion materials to this specification\". No such file exists at any path within this repository as of this revision. The reference is preserved for fidelity to the source draft, but its claimed properties (Level 1 conformance, ULID identifiers, SHA-256 hashing, in-memory single-process store) cannot be independently verified. PALS-LAW: an unverifiable implementation cannot be cited as evidence of conformance.",
    },
  },
  {
    id: "spec:ref:spec-core",
    type: "spec:Reference",
    fields: {
      kind: "repo_file",
      citation: "FDPM SPEC-CORE — primitive store, operation log, replay determinism.",
      locator: "docs/specs/SPEC-CORE.md",
      verification: "verified",
      verification_note:
        "Cited in §1.3 as the host on which DNIS implementations MAY layer. The op_id / parent_op_id / causation_op_id audit-trail fields informed DNIS Operation modelling.",
    },
  },
  {
    id: "spec:ref:spec-uid",
    type: "spec:Reference",
    fields: {
      kind: "repo_file",
      citation:
        "FDPM SPEC-UID v0.2 — dual-ID model (slug + ULID) for FDPM primitives and relations.",
      locator: "docs/specs/SPEC-UID.md",
      verification: "verified",
      verification_note:
        "Cited in §1.3. SPEC-UID's mintUidFromSeed deterministic-mint pattern (fdpm-cli/src/core/identity/uid.ts) is directly applicable to DNIS implementations migrating legacy logs.",
    },
  },
  {
    id: "spec:ref:claude-md",
    type: "spec:Reference",
    fields: {
      kind: "repo_file",
      citation: "CLAUDE.md — Project Guidelines for FDPM agent collaboration.",
      locator: "CLAUDE.md",
      verification: "verified",
      verification_note:
        "PALS-LAW (architectural-requirement clause) is the source of the disclaimer posture used throughout this document — most directly in §15's refusal to cite an unverifiable reference implementation as authority.",
    },
  },
  {
    id: "spec:ref:purpose-md",
    type: "spec:Reference",
    fields: {
      kind: "repo_file",
      citation: "PURPOSE.md — FDPM mission (knowledge-graph framing).",
      locator: "PURPOSE.md",
      verification: "verified",
      verification_note:
        "DNIS's separation of identity / content / position / lineage is the document-grain analogue of PURPOSE.md's primitive-graph framing.",
    },
  },
];

// ── Appendix B — Change Log ───────────────────────────────────────────────

const revisions: PrimitiveSpec[] = [
  {
    id: "spec:rev:0-1-5",
    type: "spec:Revision",
    fields: {
      version: "0.1.5",
      date: "2026-05-04",
      title:
        "Status promoted Draft → Proposal. Spec_id and version drop the `-draft` suffix to match. No normative changes to §3–§16; documentation alignment only.",
      notes: [
        "Document `status` field updated from `Draft` to `Proposal`, the closest valid value in the spec_authoring profile's Document.status enum (Draft | Proposal | Stable | Deprecated | Superseded).",
        "",
        "spec_id changed from `spec:dnis:0.1.4` to `spec:dnis:0.1.5` and version from `0.1.4` to `0.1.5`. Neither carries the `-draft` suffix; the suffix has been intentionally dropped since v0.1.4 and is now consistent with the Proposal lifecycle status.",
        "",
        "§1.2 Status prose rewritten: `\"This is a draft specification\"` → `\"This is a proposal\"`, with a sentence noting that v0.1.x will continue to refine pre-1.0 ergonomics in response to implementation reports. The §0 Document Status table remains the canonical version statement.",
        "",
        "§5.2 schemaVersion TS-comment example updated from `\"0.1.2-draft\"` (two versions stale) to `\"0.1.5\"`.",
        "",
        "PALS-LAW banner extension reworded: `\"DNIS is a draft produced in a single session\"` → `\"DNIS is a proposal that has been refined across five iterative passes (v0.1.0 → v0.1.5)\"`. The substantive caveats (no external review, no working impl, untested at scale) are unchanged.",
        "",
        "Title field updated `(DNIS) v0.1.4-draft` → `(DNIS) v0.1.5`.",
        "",
        "Out of scope for this revision: no §3 invariant added or removed; no §7 operation contract changed; no §10 conformance level redefined; no §16 test vector touched. Future v0.1.6+ revisions are expected to re-engage the normative surface.",
      ].join("\n"),
      affected_sections: ["0", "1", "5"],
      kind: "patch",
    },
  },
  {
    id: "spec:rev:0-1-4-draft",
    type: "spec:Revision",
    fields: {
      version: "0.1.4",
      date: "2026-05-04",
      title:
        "Pass-5 review-driven fixes: 3 blockers, 6 material defects, 4 editorial — applied to source build script, not to rendered output.",
      notes: [
        "B1 (§14.1 vs §4.1 contradiction on NID format). The v0.1.3 §14.1 said implementations MAY use UUIDv4 or NanoID for privacy, but §4.1 closed the NID format list to ULID/UUIDv7. Resolved by adding a §4.1 'privacy carve-out' clause that admits UUIDv4 and NanoID conditionally, requires the Document to declare `Document.metadata.nidFormat`, and notes the forfeit of time-sortability properties. §14.1 now references the carve-out explicitly. spec:req:nid-format and spec:mit:non-time-sortable-ids updated to match.",
        "",
        "B2 (§10.1.2 Mode B vs §12 Level 2 contradiction). The v0.1.3 §12 said L2 enforced expectedRevision on 'all mutating Operations' but §10.1.2 Mode B let merge skip the check — internally inconsistent. Resolved by making Mode A REQUIRED for L2; Mode B is L1-only. §10.1.2, spec:conf:level-2-optimistic-concurrent, and spec:req:expected-revision aligned.",
        "",
        "B3 (§1.2 stale 'version 0.1.2-draft' string). Mechanical defect: §1.2 body_md hard-coded the version literal rather than referencing §0. Removed the literal entirely; §0's status table is the canonical version statement.",
        "",
        "M1 (§14.2 introduced 'purged' outcome not in §11.2's enumeration). The v0.1.3 §11.2 enumerated four outcomes (active/retired/evolved/not-found) but §14.2 referred to a fifth ('purged'). Resolved by formally adding `purged` as outcome 5 in §11.2, naming all five outcomes (`active`, `retired`, `evolved-via-lineage`, `purged`, `not-found`), and propagating the count to P5 and spec:req:reference-resolution.",
        "",
        "M2 (§6.4 compaction-via-move bumped revision on every touched Node, breaking optimistic-concurrency clients). Resolved by adding a new `compact` Operation (§7.8) that updates only `position`, leaves revision/lastEdited* fields unchanged, and is recorded only in the §8 OperationResult log. §6.4 now redirects to §7.8; the move-based approach is deprecated. New requirement spec:req:compact-no-revision-bump and acceptance criterion TV-6 added.",
        "",
        "M3 + M4 (§5.4 Operation as a flat interface with optional target fields and `payload: unknown` was structurally unsound). Resolved by replacing with a discriminated union over `OperationType`, with per-variant payload types and target-field constraints encoded at the type level. `compact` was added as a seventh variant in the same change.",
        "",
        "M5 (§8.3 retention rule was unmeasurable: 'max retry window plus 1σ network latency'). Resolved by replacing with an operable 7-day floor + scaling guidance + MUST-document the chosen retention.",
        "",
        "M6 (§7.5 merge of non-contiguous targets had undefined semantics). Resolved by adding a contiguity precondition: merge targets MUST be contiguous siblings. Non-contiguous combines must be expressed as moves followed by a contiguous merge.",
        "",
        "M7 (Appendix A Q1 framed as 'blocking' but the spec already chose a default). Demoted Q1 from `is_blocking: yes` to `is_blocking: no`; the renderer's lead-with-blocking paragraph will no longer appear.",
        "",
        "Editorial: spec_id format normalized to drop the `-draft` suffix (status is carried by `Status: Draft`); §2.3 'synonyms / primary term' framing replaced with neutral 'expansions / abbreviations'; §10.3 added explicit cross-reference to the optional `Node.vectorClock` field declared in §5.3 (E4); §16 added a status-legend note explaining `[ ]` / *(open)* per PALS-LAW.",
        "",
        "Source-script convention: spec_id and Revision IDs from this version onward drop the `-draft` suffix (e.g. `spec:rev:0-1-4-draft` is the legacy form retained only for relation back-compat in this entry; future revisions use `spec:rev:0-1-5`). Existing v0.1.0..v0.1.3 IDs are NOT renamed to avoid relation breakage.",
      ].join("\n"),
      affected_sections: ["1", "2", "4", "5", "6", "7", "8", "10", "11", "12", "14", "16", "A", "B"],
      kind: "minor",
    },
  },
  {
    id: "spec:rev:0-1-3-draft",
    type: "spec:Revision",
    fields: {
      version: "0.1.3",
      date: "2026-05-04",
      title:
        "Pass-4 refinement on v0.1.2 — fixes 8 readability and structural defects surfaced by re-reading the rendered v0.1.2 output. No new normative requirements; existing requirements clarified or relocated.",
      notes: [
        "P2-1 (§2 duplicate term table). The v0.1.2 §2 had §2.1 'Requirement Keywords' + §2.2 'Out of Scope' inline, then the renderer auto-emitted the term table at section end with no heading — reading as an unnumbered third block. Restructured: body_md ends with a `### 2.3 Defined Terms` heading + one-line intro, anchoring the auto-emitted table under §2.3.",
        "",
        "P2-3 (§3 Principle 5 verbosity). The v0.1.2 P5 was three sentences (~80 words) while every other principle in §3 is one sentence. Tightened to a single MUST clause; the redundant lineage/retirement implications are already stated in §7.6, §11.2, §11.3.",
        "",
        "P2-4 (§7.5 merge concurrency mid-Operation). The v0.1.2 §7.5 inserted a 130-word `expectedRevision` discussion between Preconditions and Postconditions, breaking the per-Operation rhythm of §7.1–§7.6. Moved into a new §10.1.2 sub-clause; §7.5 now points there. §10.1 was simultaneously split into §10.1.1 (single-target) and §10.1.2 (merge) so the canonical home for revision-check semantics is one section.",
        "",
        "P2-5 (TV-2 verbosity). The v0.1.2 TV-2 was 110 words — three paragraphs of conformance-level guidance crammed into a one-sentence test-vector slot. Extracted the snapshot semantics into a new §8.5 'Result Snapshot Semantics' sub-clause (normative). TV-2 is now a single MUST sentence cross-referencing §8.5.",
        "",
        "P2-6 (Q2 self-reference). The v0.1.2 Q2 asked how 'a Document with schemaVersion 0.1.2-draft interoperates with a store implementing 0.2.0' — using the current version as both ends of the comparison. Restated to 'a Document created under a 0.1.x schemaVersion vs a future 0.2.x or 1.0 store.'",
        "",
        "P2-7 (§9.1 hash prefix non-determinism). The v0.1.2 §9.1 said implementations 'MUST pick one of two prefix forms per Document and SHOULD document the choice in metadata' — leaving cross-implementation hash equality undefined when no metadata note exists. Pinned the on-disk `contentHash` field to `algo:hex` (single normative form); multihash relegated to optional sidecar in `Node.metadata` for cross-spec interop.",
        "",
        "P2-8 (§13.5 'MUST prefer' is not RFC 2119). 'Prefer' is not an RFC 2119 keyword and is unenforceable. Restated as: audit consumers MUST treat `OperationResult.appliedAt` as authoritative; Agent-supplied timestamps MAY be consulted as chronicle context but MUST NOT override the audit decision.",
        "",
        "P2-10 (§1.3 missing today-guidance). The v0.1.2 §1.3 said DNIS MAY layer on SPEC-CORE but does NOT define integration semantics. Added a SHOULD clause for implementers wanting to use SPEC-CORE today: treat DNIS Operations as opaque payloads inside `primitive.create`/`primitive.replace` ops, carry `derivedFrom` in `field_values`, treat cross-graph integration as profile-defined.",
        "",
        "Editorial: revision_note shortened to fit the 300-char field cap (Appendix B carries the full story); spec_id and version bumped 0.1.2-draft → 0.1.3-draft; new §1.3 implementer-bridge sentence added; §8.5 added as normative; §10.1 restructured into §10.1.1/§10.1.2.",
      ].join("\n"),
      affected_sections: ["1", "2", "3", "7", "8", "9", "10", "13", "16", "A"],
      kind: "editorial",
    },
  },
  {
    id: "spec:rev:0-1-2-draft",
    type: "spec:Revision",
    fields: {
      version: "0.1.2",
      date: "2026-05-04",
      title:
        "Pass-3 defect-fix against the v0.1.1 self-assessment. Closes three normative defects (D1/D2/D3) and seven editorial issues.",
      notes: [
        "(D1) §3 Principle 5 was a logical contradiction with §11.2 case 4: the principle said references MUST 'continue to resolve,' but §11.2 admits a 'not-found' outcome. Restated as 'MUST resolve to one of the four §11.2 outcomes.'",
        "",
        "(D2) §7.5 merge `expectedRevision` semantics were 'MAY require an array OR MAY require none' with no documentation requirement, making two conforming implementations reject and accept the same client request. The spec now requires (a) the implementation document its mode in conformance, (b) the rejection signal carry the per-target current revisions when applicable, and (c) the array form name an `expectedRevisions` payload field explicitly.",
        "",
        "(D3) §16 TV-2 did not pin whether the returned `OperationResult` was the original snapshot or a refreshed view. The snapshot semantic is the only correct one (a retried op returns what it returned at first apply; downstream uses of `affectedNodeIds` MUST go through §11 reference resolution). TV-2 now states this explicitly.",
        "",
        "Editorial: §1.2 stale 'version 0.1.0' fixed; new §1.3 'Relation to SPEC-CORE and SPEC-UID' positioning section added; §2 numbering hole closed (§2.1 Requirement Keywords now exists); §4.1 entropy claim restated to '128 bits total, ≥74 bits of randomness' to match the actual ULID/UUIDv7 specs; §5.2 `schemaVersion` marked `readonly` and `hashAlgorithm` added as a Document-wide invariant; §9.1 hash-form non-determinism closed by binding hash algorithm + prefix form per Document; §13.5 timestamp recording promoted SHOULD → MUST to match §5.5 OperationResult.appliedAt being REQUIRED; §15 phantom-implementation bullets removed (the §17 cannot_verify reference is sufficient evidence).",
        "",
        "Open-question ordinals renumbered Q1..Q5 contiguously: the blocking question (cross-document references) is now ordinal 1 so the renderer's lead-with-blocking treatment doesn't leave a hole in the 'Other open questions' list (the v0.1.1 rendered output emitted Q1, Q3, Q4, Q5).",
        "",
        "Required reads expanded to include CLAUDE.md, PURPOSE.md, DISCLAIMER.md, SPEC-CORE.md, and SPEC-UID.md — matching the project's documentation conventions and the new §1.3 cross-spec positioning.",
        "",
        "References added: spec-core, spec-uid, claude-md, purpose-md (all `verified`).",
      ].join("\n"),
      affected_sections: ["1", "2", "3", "4", "5", "7", "9", "13", "15", "16", "17", "A"],
      kind: "editorial",
    },
  },
  {
    id: "spec:rev:0-1-1-draft",
    type: "spec:Revision",
    fields: {
      version: "0.1.1",
      date: "2026-05-04",
      title: "Pass-2 refinement (editorial, no normative changes).",
      notes:
        "Editorial pass. (1) Fixed §0 collision: the rendered output had two §0 sections — the renderer-emitted Document Status table and an explicit Abstract. The Abstract is now §1.1 and the Status moves to §1.2; the document-status table occupies §0 alone, matching the spec_authoring house style. (2) Restored stable TV-N labels (TV-1 through TV-5) on every Test Vector; the renderer emits ordinals only, so the labels are now embedded in the criterion text. (3) Flagged §15 Reference Implementation as unverified: no `document-store.mjs` file exists in this repository; the reference is preserved for fidelity to the source draft but a `cannot_verify` reference (`spec:ref:document-store-mjs`) is added to make the gap auditable. (4) Acknowledged in this revision_note that the Stakeholder and QualityAttribute primitives were inferred from the source's framing, not present in dnis-spec.md as explicit tables.",
      affected_sections: ["0", "1", "15", "16", "17"],
      kind: "editorial",
    },
  },
  {
    id: "spec:rev:0-1-0-draft",
    type: "spec:Revision",
    fields: {
      version: "0.1.0",
      date: "2026-05-04",
      title: "Initial draft.",
      notes:
        "Initial draft of DNIS. Defines the data model, six design-principle invariants, six operation contracts (create / edit / move / split / merge / retire), idempotency, content hashing, optimistic concurrency, reference resolution through retirement, three conformance levels, security and privacy considerations, five test vectors, and five open questions deferred to future revisions.",
      affected_sections: ["all"],
      kind: "minor",
    },
  },
];

// ── §0..§N Sections (the document tree) ────────────────────────────────────

const sections: PrimitiveSpec[] = [
  {
    id: "spec:sec:1",
    type: "spec:Section",
    fields: {
      number: "1",
      title: "Status of This Document",
      kind: "prose",
      body_md: [
        "### 1.1 Abstract",
        "",
        "This specification defines a data model and operation semantics for documents whose internal nodes (paragraphs, sections, list items, blocks of any kind) must retain a stable identity across edits performed by autonomous or semi-autonomous software agents (including Large Language Model agents) and human collaborators.",
        "",
        "The specification separates four concerns that are commonly conflated: **identity**, **content**, **position**, and **lineage**. Each is given an independent representation, with normative rules for what may and may not change under each defined operation. The result is a system in which external references — comments, citations, audit trails, agent tool inputs — survive arbitrary content rewriting, structural reorganization, and operation retries without loss.",
        "",
        "This document does not define a wire protocol, a storage format, or a user interface. It defines the invariants any conforming implementation must hold.",
        "",
        "### 1.2 Status",
        "",
        "This is a **proposal**: a candidate specification offered for review and implementation feedback. It has not been ratified by any standards body. It is provided as a complete enough design that implementers can start building against it; the v0.1.x line will continue to refine pre-1.0 ergonomics in response to implementation reports. The canonical version is recorded in the §0 Document Status table; do not duplicate it inline.",
        "",
        "Feedback, corrections, and implementation reports are explicitly invited. Per the disclaimer in the front matter, no part of this document should be treated as authoritative without independent verification.",
        "",
        "### 1.3 Relation to SPEC-CORE and SPEC-UID",
        "",
        "DNIS sits alongside two existing FDPM specifications that solve overlapping problems and which a reader is likely to encounter first. The relationship is **complementary**, not redundant:",
        "",
        "- **SPEC-CORE** defines an event-sourced operation log for typed primitives and relations within a single FDPM project. Its `op_id`, `parent_op_id`, and `causation_op_id` fields form an audit-trail layer comparable to DNIS Operations and lineage. SPEC-CORE's primitive store is **not** a document model — it has no built-in concept of paragraph-grain identity or fractional positions. DNIS layers a document-grain identity story on top of (or alongside) such a store.",
        "- **SPEC-UID** introduces a dual-ID model (slug + ULID) for SPEC-CORE primitives and relations. The ULID-as-stable-identity insight is the same as DNIS §4.1, and SPEC-UID's `mintUidFromSeed` upcaster pattern (deterministic mint from `op_id`) is directly applicable to DNIS implementations that need to migrate v1.1-shaped logs.",
        "",
        "DNIS conforming implementations **MAY** be built on top of a SPEC-CORE host (treating each Node as a SPEC-CORE primitive and each Operation as a SPEC-CORE op), but this specification does not require it. DNIS does **NOT** define how its `derivedFrom` lineage graph integrates with SPEC-CORE's `parent_op_id` chain — that integration is left to a future profile.",
        "",
        "Implementers wishing to use SPEC-CORE as the persistence layer today **SHOULD** treat DNIS Operations as opaque payloads inside SPEC-CORE `primitive.create` / `primitive.replace` operations, with `derivedFrom` carried verbatim in `field_values`. Cross-graph integration (mapping `parent_op_id` ↔ `derivedFrom`, mapping the OperationResult idempotency map onto the SPEC-CORE op log, etc.) is profile-defined and **MUST NOT** be assumed.",
      ].join("\n"),
    },
  },
  {
    id: "spec:sec:2",
    type: "spec:Section",
    fields: {
      number: "2",
      title: "Conventions and Terminology",
      // The `definitions` kind makes the renderer emit the spec:Term
      // table at the end of body_md. We anchor that table under §2.3
      // by ending body_md with the §2.3 heading and intro; the table
      // follows immediately. (Pass-2: removes the rendered "duplicate
      // table appears unnumbered after §2.2" defect from v0.1.2.)
      kind: "definitions",
      body_md: [
        "### 2.1 Requirement Keywords",
        "",
        "The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**, **SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **MAY**, and **OPTIONAL** in this document are to be interpreted as described in [BCP 14] (RFC 2119, RFC 8174) when, and only when, they appear in all capitals.",
        "",
        "### 2.2 Out of Scope",
        "",
        "The following are explicitly out of scope for this version:",
        "",
        "- Wire protocols and transport encoding.",
        "- Storage backends and indexing strategies.",
        "- User interface concerns.",
        "- Authentication and authorization (only Agent identification is in scope).",
        "- Concurrent multi-writer conflict resolution beyond optimistic concurrency (see §10 for guidance on CRDT integration as a future extension).",
        "",
        "### 2.3 Defined Terms",
        "",
        "The following terms are used throughout this specification with the meanings given. Many terms have a full form and a short abbreviation (e.g. *Node Identifier* / **NID**). Both forms are normative and may appear interchangeably in this document; the abbreviations are the more common form in section bodies, the full forms in headings and definitions.",
      ].join("\n"),
    },
  },
  {
    id: "spec:sec:3",
    type: "spec:Section",
    fields: {
      number: "3",
      title: "Design Principles",
      kind: "principles",
      body_md:
        "A conforming implementation MUST hold the following invariants. They are restated and made precise in subsequent sections; they are listed here for orientation. The renderer enumerates them in declared order.",
    },
  },
  {
    id: "spec:sec:4",
    type: "spec:Section",
    fields: {
      number: "4",
      title: "Identifier Formats",
      kind: "prose",
      body_md: [
        "### 4.1 Node Identifier (NID)",
        "",
        "A NID **MUST** be one of:",
        "",
        "- A ULID, as specified by [ULID].",
        "- A UUID Version 7, as specified by [RFC9562] §5.7.",
        "",
        "A NID **MUST** be 128 bits in total length and **MUST** carry at least 74 bits of randomness — the lower bound permitted by both ULID (80 bits of randomness, 48-bit timestamp) and UUIDv7 (74+ bits of randomness, 48-bit timestamp, 4-bit version, 2-bit variant). A NID **MUST NOT** be derived from the Node's content. A NID **MUST** be assigned exactly once, at the moment of Node creation. A NID **MUST NOT** be reassigned, mutated, or reused.",
        "",
        "Implementations **SHOULD** use the same identifier format consistently within a Document. Implementations **MAY** mix formats across Documents.",
        "",
        "**Privacy carve-out (§14.1).** A Document where embedded creation timestamps are a side-channel concern **MAY** use UUIDv4 [RFC9562 §5.4] or NanoID instead. In that case the Document **MUST** declare `Document.metadata.nidFormat ∈ {\"ulid\", \"uuidv7\", \"uuidv4\", \"nanoid\"}` so consumers can detect the choice. Documents using UUIDv4 or NanoID forfeit time-sortability properties §16 may otherwise rely on, and any test vector that asserts ordering by NID **MUST** be skipped or adapted. All other requirements of this specification continue to apply.",
        "",
        "### 4.2 Document Identifier (DID)",
        "",
        "A DID **MUST** follow the same constraints as a NID. A DID **MUST** be assigned exactly once at Document creation and **MUST NOT** be reassigned.",
        "",
        "### 4.3 Operation Identifier (OID)",
        "",
        "An OID **MUST** be one of the formats permitted for NID. An OID **MUST** be generated by the originating Agent **before** the Operation is submitted to the store. The same OID **MUST** be used on retries of the same logical Operation.",
        "",
        "### 4.4 Agent Identifier (AID)",
        "",
        "An AID **MUST** be a string that uniquely identifies the originating Agent within the deployment. The internal structure of an AID is implementation-defined. Implementations **SHOULD** distinguish between human Agents and software Agents in the AID structure to facilitate audit (for example, by prefixing with `human:`, `ai:`, `service:`).",
      ].join("\n"),
    },
  },
  {
    id: "spec:sec:5",
    type: "spec:Section",
    fields: {
      number: "5",
      title: "Data Model",
      kind: "schema",
      body_md: [
        "The following TypeScript declarations are normative. Implementations in other languages **MUST** preserve the field names, types, semantics, and optionality.",
        "",
        "### 5.1 Branded Identifier Types",
        "",
        "```typescript",
        "type DocumentId  = string & { readonly __brand: \"DocumentId\"  };",
        "type NodeId      = string & { readonly __brand: \"NodeId\"      };",
        "type OperationId = string & { readonly __brand: \"OperationId\" };",
        "type AgentId     = string & { readonly __brand: \"AgentId\"     };",
        "type ContentHash = string & { readonly __brand: \"ContentHash\" };",
        "type Position    = string & { readonly __brand: \"Position\"    };",
        "```",
        "",
        "### 5.2 Document",
        "",
        "```typescript",
        "interface Document {",
        "  readonly id: DocumentId;          // immutable",
        "  readonly createdAt: string;       // ISO 8601",
        "  readonly createdBy: AgentId;",
        "  readonly schemaVersion: string;   // immutable; the DNIS revision",
        "                                    // this Document was created under,",
        "                                    // e.g. \"0.1.5\"",
        "  readonly hashAlgorithm: string;   // immutable; one of \"sha256\",",
        "                                    // \"blake3\". Document-wide; chosen",
        "                                    // at creation. See §9.1.",
        "  metadata: Record<string, unknown>;",
        "}",
        "```",
        "",
        "`schemaVersion` is `readonly` so a Document cannot quietly migrate forward by an in-place field rewrite — version migration MUST go through a documented forward/backward-compatibility profile (see Q1 in Appendix A).",
        "",
        "`hashAlgorithm` is `readonly` and Document-wide. Two implementations exchanging Documents agree on hash form (see §9.1) by reading this field; mixing hash forms within a single Document is forbidden.",
        "",
        "### 5.3 Node",
        "",
        "```typescript",
        "interface Node {",
        "  // --- IDENTITY (immutable for the Node's lifetime) ---",
        "  readonly id: NodeId;",
        "  readonly documentId: DocumentId;",
        "",
        "  // --- CLASSIFICATION ---",
        "  kind: string;                     // application-defined, e.g. \"paragraph\"",
        "",
        "  // --- CONTENT (mutable) ---",
        "  content: unknown;                 // shape determined by `kind`",
        "  contentHash: ContentHash;",
        "",
        "  // --- STRUCTURE (mutable) ---",
        "  parentNodeId: NodeId | null;      // null for root-level nodes",
        "  position: Position;",
        "",
        "  // --- LINEAGE (immutable; set at creation) ---",
        "  readonly derivedFrom: ReadonlyArray<NodeId>;",
        "  readonly createdBy: AgentId;",
        "  readonly createdAt: string;       // ISO 8601",
        "",
        "  // --- REVISION (mutable, monotonically increasing) ---",
        "  revision: number;                 // starts at 0",
        "  lastEditedBy: AgentId;",
        "  lastEditedAt: string;             // ISO 8601",
        "  lastOperationId: OperationId;",
        "",
        "  // --- RETIREMENT (set when retired) ---",
        "  retiredAt?: string;               // ISO 8601; absence means active",
        "  retiredBy?: AgentId;",
        "",
        "  // --- CONCURRENCY (optional, see §10) ---",
        "  vectorClock?: Record<AgentId, number>;",
        "}",
        "```",
        "",
        "The fields marked `readonly` **MUST NOT** be mutated after Node creation. A conforming implementation **SHOULD** enforce immutability at the storage layer, not only by convention.",
        "",
        "### 5.4 Operation",
        "",
        "Operations are modeled as a discriminated union over `OperationType`. The discriminant is the `type` field; each variant pins which target field(s) are present and which payload shape is required. This eliminates the ambiguity of an Operation declaring both `targetNodeId` and `targetNodeIds`, or neither.",
        "",
        "```typescript",
        "type OperationType =",
        "  | \"create\"",
        "  | \"edit\"",
        "  | \"move\"",
        "  | \"split\"",
        "  | \"merge\"",
        "  | \"retire\"",
        "  | \"compact\";",
        "",
        "interface OperationCommon {",
        "  readonly id: OperationId;",
        "  readonly documentId: DocumentId;",
        "  readonly agentId: AgentId;",
        "  readonly issuedAt: string;        // ISO 8601 (Agent's clock)",
        "}",
        "",
        "interface CreatePayload  { kind: string; content: unknown; parentNodeId: NodeId | null; position: Position; }",
        "interface EditPayload    { content: unknown; }",
        "interface MovePayload    { newParentNodeId?: NodeId | null; newPosition: Position; }",
        "interface SplitPayload   { parts: ReadonlyArray<{ content: unknown }>; }  // length >= 2",
        "interface MergePayload   { content: unknown; expectedRevisions?: ReadonlyArray<number>; }",
        "interface RetirePayload  { reason?: string; }",
        "interface CompactPayload { repositions: ReadonlyArray<{ nodeId: NodeId; newPosition: Position }>; }",
        "",
        "type Operation =",
        "  | (OperationCommon & { readonly type: \"create\";  payload: CreatePayload })",
        "  | (OperationCommon & { readonly type: \"edit\";    targetNodeId: NodeId;  expectedRevision?: number; payload: EditPayload })",
        "  | (OperationCommon & { readonly type: \"move\";    targetNodeId: NodeId;  expectedRevision?: number; payload: MovePayload })",
        "  | (OperationCommon & { readonly type: \"split\";   targetNodeId: NodeId;  expectedRevision?: number; payload: SplitPayload })",
        "  | (OperationCommon & { readonly type: \"merge\";   targetNodeIds: ReadonlyArray<NodeId>;             payload: MergePayload })",
        "  | (OperationCommon & { readonly type: \"retire\";  targetNodeId: NodeId;  expectedRevision?: number; payload: RetirePayload })",
        "  | (OperationCommon & { readonly type: \"compact\"; targetNodeIds: ReadonlyArray<NodeId>;             payload: CompactPayload });",
        "```",
        "",
        "**Constraint (encoded by the union):** `create` carries no target. `edit`, `move`, `split`, `retire` each carry exactly one `targetNodeId`. `merge` and `compact` each carry `targetNodeIds`. `expectedRevision` is permitted only on the four single-target mutating variants; merge uses `payload.expectedRevisions` per §10.1.2; compact has no concurrency check (it does not bump revision per §7.8 / §6.4).",
        "",
        "### 5.5 Operation Result",
        "",
        "```typescript",
        "interface OperationResult {",
        "  readonly operationId: OperationId;",
        "  readonly appliedAt: string;       // ISO 8601 (server clock)",
        "  readonly affectedNodeIds: ReadonlyArray<NodeId>;",
        "  readonly newRevisions: Record<NodeId, number>;",
        "}",
        "```",
        "",
        "The store **MUST** persist `OperationResult` records and key them by `operationId` for the idempotency guarantee defined in §8.",
      ].join("\n"),
    },
  },
  {
    id: "spec:sec:6",
    type: "spec:Section",
    fields: {
      number: "6",
      title: "Position Encoding",
      kind: "prose",
      body_md: [
        "### 6.1 Requirements",
        "",
        "A `Position` **MUST** be a non-empty string. Position values **MUST** be totally ordered by lexicographic comparison over their byte representation under a single, document-wide collation. Implementations **MUST** document and consistently apply the chosen collation; UTF-8 byte order is **RECOMMENDED**.",
        "",
        "### 6.2 Insertion Property",
        "",
        "For any two existing Positions `a` and `b` with `a < b`, an implementation **MUST** be able to compute a new Position `c` such that `a < c < b`, without modifying `a` or `b`. For insertion at either end, `null` **MAY** be passed in place of the absent neighbor.",
        "",
        "This is the **Insertion Property**. Implementations satisfying this property are commonly called *fractional indexes* [GREENSPAN].",
        "",
        "### 6.3 Locality",
        "",
        "A move or insert of a single Node **MUST** modify only that Node's Position field. Bulk renumbering of siblings is **NOT permitted** as a result of any single mutating Operation. The `compact` Operation (§7.8) is structural maintenance and is exempt from this restriction; see §6.4.",
        "",
        "### 6.4 Compaction",
        "",
        "Repeated insertions between adjacent positions cause Position strings to grow. Implementations **MAY** periodically rebalance Positions via the `compact` Operation (§7.8). Compaction **MUST NOT** increment any Node's `revision` and **MUST NOT** be expressed as a sequence of `move` Operations (which would defeat the read-merge-retry contract for clients holding revision tokens). The OperationResult log (§8) is the sole audit trail for compactions.",
        "",
        "Earlier drafts (≤ v0.1.3) specified rebalance-as-moves; this is **deprecated** in favour of `compact`.",
      ].join("\n"),
    },
  },
  {
    id: "spec:sec:7",
    type: "spec:Section",
    fields: {
      number: "7",
      title: "Operations",
      kind: "prose",
      body_md: [
        "Each Operation is defined below in terms of: **Preconditions** (what must hold before the Operation is applied), **Postconditions** (what must hold after a successful application), and **Identity rule** (what happens to NIDs).",
        "",
        "All Operations **MUST** be applied atomically: either all postconditions hold or no state change is persisted.",
        "",
        "### 7.1 `create`",
        "",
        "**Payload:**",
        "",
        "```typescript",
        "interface CreatePayload {",
        "  kind: string;",
        "  content: unknown;",
        "  parentNodeId: NodeId | null;",
        "  position: Position;",
        "}",
        "```",
        "",
        "**Preconditions:** `position` MUST satisfy the Insertion Property relative to existing siblings under `parentNodeId`. `parentNodeId`, if non-null, MUST reference an active (non-retired) Node.",
        "",
        "**Postconditions:** A new Node exists with a freshly generated NID. `derivedFrom` is the empty array. `revision` is `0`. `contentHash` equals the canonical hash of `content` (see §9).",
        "",
        "**Identity rule:** A new NID is generated.",
        "",
        "### 7.2 `edit`",
        "",
        "**Payload:** `{ content: unknown }`.",
        "",
        "**Preconditions:** `targetNodeId` MUST reference an active Node. If `expectedRevision` is provided, it MUST equal the target's current `revision`. Otherwise the Operation MUST be rejected as a stale write.",
        "",
        "**Postconditions:** `content` is replaced. `contentHash` is recomputed. `revision` is incremented by 1. `lastEditedBy`, `lastEditedAt`, `lastOperationId` are updated.",
        "",
        "**Identity rule:** The NID MUST NOT change. `derivedFrom`, `createdBy`, and `createdAt` MUST NOT change.",
        "",
        "### 7.3 `move`",
        "",
        "**Payload:** `{ newParentNodeId?: NodeId | null; newPosition: Position }`. (Omitting `newParentNodeId` means \"unchanged\".)",
        "",
        "**Preconditions:** `targetNodeId` MUST reference an active Node. The new parent MUST NOT be a descendant of the target Node (no cycles). `newPosition` MUST satisfy the Insertion Property under the new parent. `expectedRevision` semantics as in §7.2.",
        "",
        "**Postconditions:** `parentNodeId` is updated if provided. `position` is updated. `revision` is incremented by 1. No other Node is modified.",
        "",
        "**Identity rule:** The NID MUST NOT change.",
        "",
        "### 7.4 `split`",
        "",
        "**Payload:** `{ parts: ReadonlyArray<{ content: unknown }> }` with `parts.length >= 2`.",
        "",
        "**Preconditions:** `targetNodeId` MUST reference an active Node. `parts.length` MUST be at least 2. `expectedRevision` semantics as in §7.2.",
        "",
        "**Postconditions:** The target Node is retired (see §7.6). `parts.length` new Nodes are created, each with: a freshly generated NID; `derivedFrom` containing exactly the original target NID; `kind`, `parentNodeId` inherited from the target; `position` values that preserve the target's position relative to its siblings, ordered as in `parts` (the first new Node SHOULD retain the original Position; subsequent Positions MUST satisfy the Insertion Property between the previous part and the original next sibling); `revision` of `0`.",
        "",
        "**Identity rule:** The original NID is retired. Each part receives a new NID. Lineage to the original is recorded in `derivedFrom`.",
        "",
        "### 7.5 `merge`",
        "",
        "**Payload:** `{ content: unknown; expectedRevisions?: ReadonlyArray<number> }` — the merged content; the optional revision-check array under §10.1.2 Mode A.",
        "",
        "**Preconditions:** `targetNodeIds` MUST be provided with at least 2 Node references. All targets MUST be active and share the same `parentNodeId`. Targets **MUST** be contiguous siblings — i.e. there MUST NOT exist any active sibling under the same `parentNodeId` whose `position` is strictly between the smallest and largest target positions. (Non-contiguous merges have surprising semantics for non-target siblings; if the application needs a non-contiguous combine, do it as `move`s followed by a contiguous `merge`.) Concurrency-check semantics for `merge` are defined in §10.1.2.",
        "",
        "**Postconditions:** All target Nodes are retired. One new Node is created with: a freshly generated NID; `derivedFrom` containing all target NIDs in order; `kind`, `parentNodeId` inherited from the targets; `position` set to the smallest position among the targets; `revision` of `0`.",
        "",
        "**Identity rule:** All target NIDs are retired. A new NID is generated. Lineage to all targets is recorded.",
        "",
        "### 7.6 `retire`",
        "",
        "**Payload:** `{ reason?: string }`.",
        "",
        "**Preconditions:** `targetNodeId` MUST reference an active Node.",
        "",
        "**Postconditions:** `retiredAt` is set to the current server timestamp. `retiredBy` is set to the operation's `agentId`. The Node is no longer returned by queries that filter for active Nodes. The Node MUST remain resolvable by its NID for the purposes of lineage and reference resolution (§11).",
        "",
        "**Identity rule:** The NID MUST NOT change. The Node MUST NOT be deleted from storage; it MUST be marked retired.",
        "",
        "### 7.7 Operations Not Defined",
        "",
        "Hard deletion is intentionally not specified. Implementations MAY provide a separate, administratively gated purge mechanism for compliance-driven removal (e.g., GDPR right-to-erasure). Such purges MUST be documented as breaking the lineage invariant and SHOULD record a tombstone preserving the NID and retirement metadata even when content is removed.",
        "",
        "### 7.8 `compact` (structural maintenance)",
        "",
        "**Payload:** `{ repositions: ReadonlyArray<{ nodeId: NodeId; newPosition: Position }> }`.",
        "",
        "**Preconditions:** Every `nodeId` in `repositions` MUST reference an active (non-retired) Node within the same Document. The set of new positions MUST preserve the **relative ordering** of the targeted Nodes (i.e. the lexicographic ordering of `newPosition` values across the repositions list MUST equal the lexicographic ordering of those Nodes' current positions). `expectedRevision` does NOT apply.",
        "",
        "**Postconditions:** For each entry, the target Node's `position` field is set to `newPosition`. **No other field of any Node is modified.** Specifically: `revision` is **NOT** incremented; `lastEditedBy`, `lastEditedAt`, `lastOperationId` are **NOT** updated; `id`, `parentNodeId`, `content`, `contentHash`, `derivedFrom`, `createdBy`, `createdAt` are unchanged.",
        "",
        "**Identity rule:** All NIDs unchanged.",
        "",
        "**Audit:** The Operation MUST be recorded in the §8 OperationResult log. The OperationResult log is the **sole** audit trail for compactions; per-Node audit fields remain at their pre-compaction values. This preserves the read-merge-retry contract for clients holding revision-based optimistic-concurrency tokens.",
        "",
        "**Rationale:** Repeated insertions cause Position strings to grow; periodic rebalancing is necessary. Expressing rebalancing as `move` Operations (the v0.1.3 approach) bumped revision on every touched Node, breaking optimistic-concurrency clients. The `compact` Operation is the surgical fix: clients see no revision change, but storage compaction proceeds normally.",
      ].join("\n"),
    },
  },
  {
    id: "spec:sec:8",
    type: "spec:Section",
    fields: {
      number: "8",
      title: "Idempotency",
      kind: "prose",
      body_md: [
        "### 8.1 Requirement",
        "",
        "A store **MUST** maintain a persistent map from `OperationId` to `OperationResult`. On receipt of an Operation whose `id` is already present in this map, the store **MUST**: 1) Return the recorded `OperationResult`; 2) NOT re-execute the Operation; 3) NOT modify any Node state.",
        "",
        "### 8.2 Atomicity",
        "",
        "The recording of an `OperationResult` **MUST** be atomic with the state changes the Operation produced. A conforming implementation **MUST NOT** apply state changes without recording the result, nor record a result without applying state changes.",
        "",
        "### 8.3 Retention",
        "",
        "The `OperationId → OperationResult` map **SHOULD** be retained for at least **7 days**. Implementations operating Agents with retry windows or transport latencies likely to exceed this floor **SHOULD** scale retention accordingly. Implementations **MUST** document the chosen retention period. Implementations **MAY** garbage-collect older entries; after GC, a retried Operation will be treated as new, breaking the idempotency guarantee for that Operation.",
        "",
        "### 8.4 Payload Mismatch",
        "",
        "If a retried Operation has the same `id` but different payload than the recorded one, the store **MUST** still return the original result and **MUST NOT** apply the new payload. Implementations **SHOULD** log such mismatches as they may indicate Agent bugs.",
        "",
        "### 8.5 Result Snapshot Semantics",
        "",
        "An `OperationResult` is a **snapshot** taken at the moment of original apply. Its `affectedNodeIds`, `newRevisions`, and `appliedAt` fields **MUST** reflect the state at first apply, NOT the current state. The store **MUST NOT** refresh these fields on retry, even if the affected Nodes have since been edited, retired, or had their revision incremented by subsequent Operations.",
        "",
        "A caller dereferencing `affectedNodeIds` from a retried `OperationResult` **MUST** treat them as historical references and **MUST** route them through §11 reference resolution to obtain the current state of those Nodes (which may include the `retired` or `evolved-via-lineage` outcomes).",
      ].join("\n"),
    },
  },
  {
    id: "spec:sec:9",
    type: "spec:Section",
    fields: {
      number: "9",
      title: "Content Hashing",
      kind: "prose",
      body_md: [
        "### 9.1 Algorithm",
        "",
        "The `contentHash` field **MUST** be the digest of the Node's canonicalized content under exactly one of: SHA-256 [FIPS 180-4] (REQUIRED support); BLAKE3 [BLAKE3] (OPTIONAL support).",
        "",
        "The chosen algorithm **MUST** be recorded once per Document, in the `Document.hashAlgorithm` field (§5.2). All Nodes within a Document **MUST** use that algorithm; mixing hash algorithms within a single Document is **forbidden**.",
        "",
        "Every `contentHash` string **MUST** use the `algo:hex` prefix form (e.g., `sha256:a1b2c3…`). The `algo` segment **MUST** match `Document.hashAlgorithm`; the `hex` segment is the lowercase hexadecimal digest. The `:` separator is normative; alternative encodings (uppercase hex, base64, multihash binary) are **NOT** permitted in the `contentHash` field.",
        "",
        "Implementations exchanging Documents with consumers that require [multihash] format **MAY** add a `multihashFormat: true` flag in `Document.metadata` and emit a parallel multihash representation outside the `contentHash` field (e.g., as a sidecar in `Node.metadata`). The on-disk `contentHash` field itself remains `algo:hex`. This pins cross-implementation hash comparison to a single, deterministic form.",
        "",
        "### 9.2 Canonicalization",
        "",
        "Content **MUST** be canonicalized before hashing such that two equivalent contents produce identical hashes. For JSON content, implementations **MUST** use [RFC 8785] (JSON Canonicalization Scheme, JCS) or document an alternative that satisfies: deterministic ordering of object keys; deterministic numeric representation; deterministic Unicode normalization; deterministic whitespace handling.",
        "",
        "### 9.3 Use",
        "",
        "`contentHash` is informational and used for: cheap inequality checks (\"did this Node's content actually change?\"); deduplication; tamper detection.",
        "",
        "`contentHash` **MUST NOT** be used as the Node's identity.",
      ].join("\n"),
    },
  },
  {
    id: "spec:sec:10",
    type: "spec:Section",
    fields: {
      number: "10",
      title: "Concurrency",
      kind: "prose",
      body_md: [
        "### 10.1 Optimistic Concurrency (REQUIRED)",
        "",
        "#### 10.1.1 Single-target Operations",
        "",
        "All single-target mutating Operations on existing Nodes (`edit`, `move`, `split`, `retire`) **MUST** support an `expectedRevision: number` field. When provided, the store **MUST** reject the Operation if the target's current `revision` does not match. The rejection **MUST** be distinguishable from other failures (e.g., a dedicated error category or status code), and **MUST** carry the target's current `revision` as evidence so a client can read-merge-retry.",
        "",
        "The `compact` Operation (§7.8) does NOT bump revision and is therefore EXEMPT from `expectedRevision` semantics; compact is structural maintenance, not a mutation in this sense.",
        "",
        "#### 10.1.2 The `merge` Operation",
        "",
        "Because `merge` (§7.5) targets multiple Nodes simultaneously, the single-`expectedRevision` field above does not apply. Two modes are defined:",
        "",
        "- **Mode A (per-target check) — REQUIRED for Level 2 conformance.** The payload carries `expectedRevisions: ReadonlyArray<number>`, one element per target in the same order as `targetNodeIds`. The store **MUST** reject the Operation if any element disagrees with its corresponding target's current `revision`.",
        "- **Mode B (no check) — Level 1 only.** No revision check is performed. `merge` is treated as a higher-conflict-tolerance Operation; callers accept that intervening edits to any target may be silently absorbed into the merged content. **Mode B implementations MUST NOT claim Level 2 conformance.**",
        "",
        "Implementations **MUST** document which mode they implement in their conformance declaration. Whichever mode is implemented, the rejection signal **MUST** follow §10.1.1's shape, with `evidence` carrying the per-target current revisions in the order corresponding to `targetNodeIds`.",
        "",
        "### 10.2 Pessimistic Locking (NOT REQUIRED)",
        "",
        "This specification does not define locking. Implementations **MAY** add advisory locks but **MUST NOT** make them required for correctness.",
        "",
        "### 10.3 CRDT Layer (FUTURE)",
        "",
        "Concurrent multi-writer editing where conflict-free convergence is required is out of scope for this version. A future revision is expected to define a profile in which Node positions and content are backed by a CRDT (e.g., [YJS], [AUTOMERGE]) while preserving the identity, lineage, and idempotency rules of this specification at the application layer.",
        "",
        "Implementations integrating a CRDT today **SHOULD**: keep the application-level NID stable (this specification's rules); use the CRDT for position and content state only; treat CRDT operations as the underlying storage for `edit` and `move` Operations defined here.",
        "",
        "The optional `Node.vectorClock` field declared in §5.3 is **reserved** for use by Level 3 implementations and a future CRDT profile. Its semantics — including merge behavior, cross-Agent comparison, and persistence — are **not defined** in this specification and Level 1/2 implementations **MUST NOT** rely on its contents.",
      ].join("\n"),
    },
  },
  {
    id: "spec:sec:11",
    type: "spec:Section",
    fields: {
      number: "11",
      title: "Reference Resolution",
      kind: "prose",
      body_md: [
        "### 11.1 Definition",
        "",
        "A *reference* is any external pointer to a NID — for example, a comment anchor, a citation, an audit-log entry, an Agent tool input, or a link from another Document.",
        "",
        "### 11.2 Resolution Order",
        "",
        "When resolving a reference to NID `n`, an implementation **MUST** distinguish among the following five named outcomes and return exactly one:",
        "",
        "1. **`active`** — `n` exists and is not retired. Return that Node.",
        "2. **`retired`** — `n` exists, is retired (§7.6), and is not yet purged. Return that Node with a `retired: true` flag.",
        "3. **`evolved-via-lineage`** — `n` does not directly resolve, but appears as an ancestor in some active Node's `derivedFrom` (transitively per §11.3). Return the **ordered list** of descendant Nodes (sorted by `position` in document order), so that a caller can deterministically pick the canonical successor.",
        "4. **`purged`** — `n` was hard-deleted under a §14.2 purge path. Structural metadata (NID, retirement record, lineage placeholder) is retained but content is irretrievable. Return a tombstone with `purged: true` and any retained metadata.",
        "5. **`not-found`** — `n` was never assigned within the scope of this Document, or its Document scoping disagrees (cross-document references are out of scope per Q1).",
        "",
        "Implementations **MUST** distinguish among these five outcomes in their API. Reference-resolution callers can then choose to treat \"retired\", \"evolved-via-lineage\", or \"purged\" references differently from \"not-found\" ones.",
        "",
        "### 11.3 Lineage Walk",
        "",
        "Lineage **MUST** be walked transitively. If Node A was derived from B which was derived from C, a reference to C resolves to A via two hops through `derivedFrom`.",
        "",
        "Implementations **SHOULD** detect and refuse to construct lineage cycles. The semantics of `derivedFrom` (always pointing backward in time to NIDs that already exist at creation) make cycles impossible under correct application of this specification, but defensive checks are recommended.",
      ].join("\n"),
    },
  },
  {
    id: "spec:sec:12",
    type: "spec:Section",
    fields: {
      number: "12",
      title: "Conformance Levels",
      kind: "conformance",
      body_md:
        "A conforming implementation **MUST** declare which level it implements. Three levels are defined: Level 1 (Sequential), Level 2 (Optimistic Concurrent), and Level 3 (Convergent — Reserved). Level 3 implementations **MAY** claim conformance only when §10.3 is normatively defined.",
    },
  },
  {
    id: "spec:sec:13",
    type: "spec:Section",
    fields: {
      number: "13",
      title: "Security Considerations",
      kind: "prose",
      body_md: [
        "### 13.1 Identity Forgery",
        "",
        "NIDs are public, opaque identifiers. They **MUST NOT** be used as authentication or authorization secrets. An implementation **MUST** authenticate the originating Agent of every Operation independently.",
        "",
        "### 13.2 Replay",
        "",
        "Operation idempotency (§8) is a correctness property, not a security property. An adversary in possession of a valid Operation can replay it and the store **MUST** treat the replay as a no-op. However, an adversary submitting a *new* Operation with stolen credentials is a problem this specification does not address; transport authentication is required separately.",
        "",
        "### 13.3 Lineage Exposure",
        "",
        "`derivedFrom` reveals the editing history of the Document. For Documents containing sensitive content, implementations **SHOULD** provide an authorization mechanism that filters retired Nodes and lineage from unauthorized callers.",
        "",
        "### 13.4 Hash Collision",
        "",
        "The use of SHA-256 for `contentHash` provides 128-bit collision resistance, which is adequate for the purposes defined here (integrity check, deduplication signal). The `contentHash` is **NOT** a cryptographic commitment to authorship; for that purpose, sign the canonicalized content separately with a key bound to the Agent.",
        "",
        "### 13.5 Timestamp Manipulation",
        "",
        "`Operation.issuedAt`, `Node.createdAt`, and `Node.lastEditedAt` are advisory and may be set by the Agent. Per §5.5, every `OperationResult` carries a REQUIRED `appliedAt` field set by the server clock. Implementations **MUST** populate `OperationResult.appliedAt` from the server clock at apply time. Audit consumers **MUST** treat `OperationResult.appliedAt` as authoritative; an Agent-supplied timestamp **MAY** be consulted as informational chronicle context but **MUST NOT** override the audit decision when the two disagree.",
      ].join("\n"),
    },
  },
  {
    id: "spec:sec:14",
    type: "spec:Section",
    fields: {
      number: "14",
      title: "Privacy Considerations",
      kind: "prose",
      body_md: [
        "### 14.1 Embedded Timestamps in Identifiers",
        "",
        "Both ULID and UUIDv7 embed millisecond-precision creation timestamps. This is **intentional** for sortability but leaks Document creation time and Node creation rate. For Documents where this leakage is a concern (e.g., sealed-bid auctions, sensitive editorial workflows), implementations **MAY** invoke the §4.1 privacy carve-out and use UUIDv4 [RFC9562 §5.4] or NanoID for NIDs, declaring `Document.metadata.nidFormat` accordingly. Time-sortability properties §16 may otherwise rely on are forfeited; all other requirements continue to apply.",
        "",
        "### 14.2 Right to Erasure",
        "",
        "The lineage invariant (§7.7) is in tension with regulatory requirements such as GDPR Article 17. Implementations operating in such jurisdictions **MUST** provide a documented purge path that removes content while preserving sufficient structure for reference resolution to return the **`purged`** outcome (§11.2 case 4) rather than `not-found`. This means: the NID, retirement record, and lineage placeholder are retained; only the content (and optionally `derivedFrom` if it itself is sensitive) is erased.",
      ].join("\n"),
    },
  },
  {
    id: "spec:sec:15",
    type: "spec:Section",
    fields: {
      number: "15",
      title: "Reference Implementation",
      kind: "prose",
      body_md: [
        "The source DNIS draft (dnis-spec.md §15) names a non-normative reference implementation, `document-store.mjs`, said to live in \"the companion materials to this specification.\"",
        "",
        "**As of this revision, no such file is present in this repository.** No file at any path matches that name. The §17 reference entry `spec:ref:document-store-mjs` is correspondingly marked `cannot_verify` and **MUST NOT** be cited as evidence of conformance.",
        "",
        "Conformance to this specification is defined against the requirements (§4–§14), the test vectors (§16), and the conformance levels (§12) — never against an implementation whose existence cannot be verified. PALS-LAW: an unverifiable implementation is not authority.",
        "",
        "Promotion of this SPEC past Draft status SHOULD either (a) land an actual reference implementation in this repository and re-cite it from §17, or (b) delete this section in favour of conformance-by-test-vector alone.",
      ].join("\n"),
    },
  },
  {
    id: "spec:sec:16",
    type: "spec:Section",
    fields: {
      number: "16",
      title: "Test Vectors",
      kind: "acceptance_criteria",
      body_md: [
        "A conforming implementation **SHOULD** pass the following scenarios. These are stated as invariants; concrete inputs and outputs depend on the chosen identifier format and timestamps.",
        "",
        "**Status legend.** `[ ]` / *(open)* indicates the test vector has no demonstrated passing implementation in this repository (PALS-LAW: an unverified assertion is `unverified`, never `passing`). `[x]` / *(verified)* would indicate a CI-passing test against a checked-in implementation. As of this revision, all test vectors are *(open)* because no reference implementation has been landed; see §15.",
      ].join("\n"),
    },
  },
  {
    id: "spec:sec:17",
    type: "spec:Section",
    fields: {
      number: "17",
      title: "References",
      kind: "references",
      body_md: "",
    },
  },
  {
    id: "spec:sec:appendix-a",
    type: "spec:Section",
    fields: {
      number: "A",
      title: "Appendix A — Open Questions",
      kind: "open_questions",
      body_md:
        "The following are deliberately left unresolved in this draft and **SHOULD** be addressed before promotion from draft status. Each question records the deferral; resolving any of them is a candidate for a follow-up profile or revision.",
    },
  },
  {
    id: "spec:sec:appendix-b",
    type: "spec:Section",
    fields: {
      number: "B",
      title: "Appendix B — Change Log",
      kind: "revision_history",
      body_md: "",
    },
  },
];

// ── Relations ──────────────────────────────────────────────────────────────

const relations: RelationSpec[] = [
  // Sections under the document
  ...sections.map((s, i) => ({
    id: `rel:doc-has-sec-${i + 1}`,
    type: "spec:HasSection",
    from: documentSpec.id,
    to: s.id,
  })),

  // Document defines each Term
  ...termSpecs.map((t, i) => ({
    id: `rel:doc-defines-${i + 1}`,
    type: "spec:Defines",
    from: documentSpec.id,
    to: t.id,
  })),

  // Mitigations cover risks
  rel("rel:mit-forgery", "spec:Mitigates", "spec:mit:authenticate-agent-independently", "spec:risk:identity-forgery"),
  rel("rel:mit-replay", "spec:Mitigates", "spec:mit:transport-auth-required", "spec:risk:replay"),
  rel("rel:mit-lineage-exposure", "spec:Mitigates", "spec:mit:lineage-authz-filter", "spec:risk:lineage-exposure"),
  rel("rel:mit-hash-collision", "spec:Mitigates", "spec:mit:sign-content-separately", "spec:risk:hash-collision"),
  rel("rel:mit-timestamp", "spec:Mitigates", "spec:mit:server-side-applied-at", "spec:risk:timestamp-manipulation"),
  rel("rel:mit-id-time-leakage", "spec:Mitigates", "spec:mit:non-time-sortable-ids", "spec:risk:id-time-leakage"),
  rel("rel:mit-erasure", "spec:Mitigates", "spec:mit:purge-path-with-tombstone", "spec:risk:lineage-vs-erasure"),
  rel("rel:mit-position-growth", "spec:Mitigates", "spec:mit:position-rebalance-as-moves", "spec:risk:position-string-growth"),
  rel("rel:mit-idempotency-gc", "spec:Mitigates", "spec:mit:idempotency-retention-policy", "spec:risk:idempotency-gc-window"),

  // Acceptance criteria verify requirements / invariants
  // (spec:Verifies endpoint constraint: target must be Requirement or Invariant)
  rel("rel:tv1-verifies-nid-immutability", "spec:Verifies", "spec:ac:tv-1-identity-preservation-under-edit", "spec:req:nid-immutability"),
  rel("rel:tv2-verifies-idempotency", "spec:Verifies", "spec:ac:tv-2-idempotency-under-retry", "spec:req:idempotency-map"),
  rel("rel:tv2-verifies-payload-mismatch", "spec:Verifies", "spec:ac:tv-2-idempotency-under-retry", "spec:req:idempotency-payload-mismatch"),
  rel("rel:tv3-verifies-retired-resolvable", "spec:Verifies", "spec:ac:tv-3-lineage-after-split", "spec:inv:retired-node-resolvable"),
  rel("rel:tv3-verifies-lineage-walk", "spec:Verifies", "spec:ac:tv-3-lineage-after-split", "spec:req:lineage-walk-transitive"),
  rel("rel:tv4-verifies-locality", "spec:Verifies", "spec:ac:tv-4-position-locality", "spec:req:position-locality"),
  rel("rel:tv5-verifies-expected-revision", "spec:Verifies", "spec:ac:tv-5-stale-write-rejection", "spec:req:expected-revision"),
  rel("rel:tv6-verifies-compact-no-revision-bump", "spec:Verifies", "spec:ac:tv-6-compact-preserves-revision", "spec:req:compact-no-revision-bump"),

  // Citations from the document
  rel("rel:doc-cites-bcp14", "spec:Cites", documentSpec.id, "spec:ref:bcp-14"),
  rel("rel:doc-cites-rfc9562", "spec:Cites", documentSpec.id, "spec:ref:rfc9562"),
  rel("rel:doc-cites-ulid", "spec:Cites", documentSpec.id, "spec:ref:ulid"),
  rel("rel:doc-cites-rfc8785", "spec:Cites", documentSpec.id, "spec:ref:rfc8785"),
  rel("rel:doc-cites-fips180-4", "spec:Cites", documentSpec.id, "spec:ref:fips-180-4"),
  rel("rel:doc-cites-blake3", "spec:Cites", documentSpec.id, "spec:ref:blake3"),
  rel("rel:doc-cites-multihash", "spec:Cites", documentSpec.id, "spec:ref:multihash"),
  rel("rel:doc-cites-greenspan", "spec:Cites", documentSpec.id, "spec:ref:greenspan"),
  rel("rel:doc-cites-yjs", "spec:Cites", documentSpec.id, "spec:ref:yjs"),
  rel("rel:doc-cites-automerge", "spec:Cites", documentSpec.id, "spec:ref:automerge"),
  rel("rel:doc-cites-crdt", "spec:Cites", documentSpec.id, "spec:ref:crdt-shapiro"),
  rel("rel:doc-cites-helland", "spec:Cites", documentSpec.id, "spec:ref:helland-idempotence"),
  rel("rel:doc-cites-document-store-mjs", "spec:Cites", documentSpec.id, "spec:ref:document-store-mjs"),
  rel("rel:doc-cites-spec-core", "spec:Cites", documentSpec.id, "spec:ref:spec-core"),
  rel("rel:doc-cites-spec-uid", "spec:Cites", documentSpec.id, "spec:ref:spec-uid"),
  rel("rel:doc-cites-claude-md", "spec:Cites", documentSpec.id, "spec:ref:claude-md"),
  rel("rel:doc-cites-purpose-md", "spec:Cites", documentSpec.id, "spec:ref:purpose-md"),

  // Required reads on the document
  rel("rel:doc-req-claude", "spec:RequiredRead", documentSpec.id, "spec:ref:claude-md"),
  rel("rel:doc-req-purpose", "spec:RequiredRead", documentSpec.id, "spec:ref:purpose-md"),
  rel("rel:doc-req-spec-core", "spec:RequiredRead", documentSpec.id, "spec:ref:spec-core"),
  rel("rel:doc-req-spec-uid", "spec:RequiredRead", documentSpec.id, "spec:ref:spec-uid"),

  // Document was introduced in revision 0.1.0-draft, refined in 0.1.1-draft,
  // defect-fixed in 0.1.2-draft, refined again in 0.1.3-draft,
  // review-fixed in 0.1.4-draft (pass 5), and promoted Draft → Proposal
  // in 0.1.5 (pass 6, no-suffix from this revision onward).
  rel("rel:doc-revised-0-1-5", "spec:RevisedIn", documentSpec.id, "spec:rev:0-1-5"),
  rel("rel:doc-revised-0-1-4", "spec:RevisedIn", documentSpec.id, "spec:rev:0-1-4-draft"),
  rel("rel:doc-revised-0-1-3", "spec:RevisedIn", documentSpec.id, "spec:rev:0-1-3-draft"),
  rel("rel:doc-revised-0-1-2", "spec:RevisedIn", documentSpec.id, "spec:rev:0-1-2-draft"),
  rel("rel:doc-revised-0-1-1", "spec:RevisedIn", documentSpec.id, "spec:rev:0-1-1-draft"),
  rel("rel:doc-revised-0-1-0", "spec:RevisedIn", documentSpec.id, "spec:rev:0-1-0-draft"),
];

function rel(id: string, type: string, from: string, to: string): RelationSpec {
  return { id, type, from, to };
}

// ── Commit ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const host = await openHost();

  const result = await defineProject(host, {
    id: PROJECT_ID,
    name: "DNIS — Document Node Identity Specification",
    profile: PROFILE_ID,
    description:
      "1:1 migration of dnis-spec.md to a typed graph using the fdpm.spec-authoring profile. Materialises every Defined Term, Design Principle, ID-format rule, Position requirement, Operation contract, Idempotency clause, Concurrency level, Reference-resolution rule, Conformance level, Test Vector, Reference, Open Question, and the Appendix B change log as typed primitives joined by typed relations.",
  })
    .primitives([
      documentSpec,
      ...termSpecs,
      ...principleSpecs,
      ...stakeholders,
      ...qas,
      ...invariants,
      ...requirements,
      ...acceptances,
      ...conformance,
      ...risks,
      ...mitigations,
      ...openQuestions,
      ...references,
      ...revisions,
      ...sections,
    ])
    .relations(relations)
    .commit();

  console.log("Built project:", result.project_id);
  console.log("  primitives:", result.primitives_created);
  console.log("  relations: ", result.relations_created);
  console.log("  revision:  ", result.revision);
  console.log("");
  console.log("Render with:");
  console.log(
    `  FDPM_DATA_DIR=${process.env["FDPM_DATA_DIR"] ?? "~/.fdpm-cli"} \\`,
  );
  console.log("    npx tsx fdpm-cli/src/bin/fdpm.ts \\");
  console.log("    render spec-dnis text/markdown \\");
  console.log("    --renderer-id spec:SpecMarkdownRenderer \\");
  console.log("    -o docs/specs/SPEC-DNIS.md");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
