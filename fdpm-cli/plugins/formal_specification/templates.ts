import type { TemplateDef } from "../../src/core/models/meta.js";

/**
 * Templates — mirrors src/fdpm/plugins/formal_specification.py
 * lines 3195-3229. Three templates.
 */
export const TEMPLATES: TemplateDef[] = [
  {
    id: "fs:tpl:full-specification",
    name: "Full Specification",
    description: "Complete ordered spec document.",
    rendering_rules: {
      voice: "passive",
      tense: "present",
      person: "third",
      max_section_depth: 3,
      include_metadata: false,
      language: "en",
    },
    target_renderer: "markdown",
  },
  {
    id: "fs:tpl:type-catalog",
    name: "Type Catalog",
    description: "Type definitions reference document.",
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
    id: "fs:tpl:phase-walkthrough",
    name: "Phase Walkthrough",
    description: "Phase-by-phase guide to the method.",
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
];
