import type { TemplateDef } from "../../src/core/models/meta.js";

/**
 * Templates — the rendering presets for SPEC documents.
 * Each template targets the spec:SpecMarkdownRenderer (text/markdown).
 */
export const TEMPLATES: TemplateDef[] = [
  {
    id: "spec:tpl:full",
    name: "Full SPEC",
    description:
      "The full SPEC-CORE / SPEC-MCP-SERVER house style: frontmatter + PALS banner + disclaimer + numbered sections + ADR + trade-off matrix + revision history + references.",
    rendering_rules: {
      voice: "active",
      tense: "present",
      person: "third",
      max_section_depth: 4,
      include_metadata: true,
      language: "en",
    },
    target_renderer: "markdown",
  },
  {
    id: "spec:tpl:adr-only",
    name: "ADRs Only",
    description:
      "Renders only the ADR cluster — Decision Summary, ADRs, Trade-off Matrix, Open Questions. Useful for excerpting decisions for a design review.",
    rendering_rules: {
      voice: "active",
      tense: "present",
      person: "third",
      max_section_depth: 3,
      include_metadata: false,
      language: "en",
    },
    target_renderer: "markdown",
  },
  {
    id: "spec:tpl:rfc-light",
    name: "RFC Light",
    description:
      "Minimal SPEC: frontmatter + Purpose + Definitions + Requirements + Open Questions + References. For one-page proposals before a full SPEC is justified.",
    rendering_rules: {
      voice: "active",
      tense: "present",
      person: "third",
      max_section_depth: 3,
      include_metadata: false,
      language: "en",
    },
    target_renderer: "markdown",
  },
];
