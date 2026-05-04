import type { RendererBinding } from "../../src/core/models/meta.js";

/**
 * Renderer bindings — declare the renderers this profile contributes.
 * Uses the Python-source shape (renderer_id + output_format + output_path)
 * accepted by the meta-model alongside the native (primitive_type_id +
 * target) shape. Plugins ship their renderers via cap:renderer; the
 * binding surfaces them in the profile listing.
 */
export const RENDERER_BINDINGS: RendererBinding[] = [
  {
    renderer_id: "spec:SpecMarkdownRenderer",
    name: "SPEC Markdown Renderer",
    output_format: "text/markdown",
    output_path: "SPEC.md",
    description:
      "Renders a spec:Document and its connected primitives as a complete SPEC-CORE / SPEC-MCP-SERVER house-style Markdown document.",
  },
];
