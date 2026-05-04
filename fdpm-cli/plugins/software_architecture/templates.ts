import type { TemplateDef } from "../../src/core/models/meta.js";

/**
 * Templates — mirrors src/fdpm/plugins/software_architecture.py
 * lines 1522-1565. Three templates.
 */
export const TEMPLATES: TemplateDef[] = [
  {
    id: "sw:tpl:architecture-overview",
    name: "Architecture Overview",
    description:
      "Narrative document covering entities, decisions, constraints.",
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
    id: "sw:tpl:api-reference",
    name: "API Reference",
    description: "Endpoint catalog with schemas and contracts.",
    rendering_rules: {
      voice: "active",
      tense: "present",
      person: "second",
      max_section_depth: 3,
      include_metadata: false,
      language: "en",
    },
    target_renderer: "markdown",
  },
  {
    id: "sw:tpl:failure-catalog",
    name: "Failure Catalog",
    description:
      "Table of known failure modes with detection and mitigation.",
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
  // gap-pass-2 #15 — bind to the executable renderers shipped by this
  // plugin so the template catalogue and the renderer catalogue stay in
  // sync. The renderer ids match RENDERER_BINDINGS exactly.
  {
    id: "sw:tpl:decision-log",
    name: "Decision Log",
    description: "ADR-style log of every sw:Decision with supersedes / evidence chains.",
    rendering_rules: {
      voice: "active",
      tense: "present",
      person: "third",
      max_section_depth: 3,
      include_metadata: false,
      language: "en",
    },
    target_renderer: "sw:ADRRenderer",
  },
  {
    id: "sw:tpl:openapi-spec",
    name: "OpenAPI Specification",
    description: "OpenAPI 3.1 spec generated from sw:Endpoint / sw:Schema / sw:Contract.",
    rendering_rules: {
      voice: "active",
      tense: "present",
      person: "third",
      max_section_depth: 3,
      include_metadata: false,
      language: "en",
    },
    target_renderer: "sw:OpenAPIRenderer",
  },
];
