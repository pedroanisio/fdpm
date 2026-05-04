import type { CategoryDef } from "../../src/core/models/meta.js";

/**
 * Categories partition the SPEC primitives by document concern.
 * Mirrors the macro-structure of SPEC-CORE / SPEC-MCP-SERVER.
 */
export const CATEGORIES: CategoryDef[] = [
  {
    id: "cat:spec:document",
    name: "Document",
    description: "Document-scoped primitives: Document, Section, Definition.",
  },
  {
    id: "cat:spec:framing",
    name: "Framing",
    description: "Stakeholders, Concerns, Quality Attributes — the §2/§3 framing.",
  },
  {
    id: "cat:spec:architecture",
    name: "Architecture",
    description: "ADRs, Options, Trade-off Axes, Scenarios — the §14/§15/§16 cluster.",
  },
  {
    id: "cat:spec:requirements",
    name: "Requirements",
    description: "Numbered requirements, acceptance criteria, conformance items.",
  },
  {
    id: "cat:spec:capability",
    name: "Capability",
    description: "Tools, capabilities, endpoints, configuration entries — the tabular surfaces.",
  },
  {
    id: "cat:spec:risk",
    name: "Risk",
    description: "Risks, mitigations, error categories, open questions, future work.",
  },
  {
    id: "cat:spec:provenance",
    name: "Provenance",
    description: "References, revisions, migration steps — the auditability surface.",
  },
];
