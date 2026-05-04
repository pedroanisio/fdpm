import type { RendererBinding } from "../../src/core/models/meta.js";

/**
 * Renderer bindings — mirrors src/fdpm/plugins/software_architecture.py
 * lines 1498-1519. The plugin declares these as catalogue entries; no
 * renderer implementations are bundled (port parity with the Python
 * source, which also only declares the bindings).
 */
export const RENDERER_BINDINGS: RendererBinding[] = [
  {
    renderer_id: "sw:OpenAPIRenderer",
    name: "OpenAPI Specification",
    output_format: "application/x-yaml",
    output_path: "openapi.yaml",
    description: "Generates OpenAPI 3.x spec from interface primitives.",
  },
  {
    renderer_id: "sw:ADRRenderer",
    name: "ADR Documents",
    output_format: "text/markdown",
    output_path: "decisions.md",
    description: "Generates a single ADR markdown bundle.",
  },
];
