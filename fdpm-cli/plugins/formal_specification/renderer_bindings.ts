import type { RendererBinding } from "../../src/core/models/meta.js";

/**
 * Renderer bindings — mirrors src/fdpm/plugins/formal_specification.py
 * but constrained to the three renderer ids the TypeScript plugin
 * actually registers and exposes in its manifest.
 *
 * The Python `RendererBinding` shape is preserved by the legacy meta
 * extension (renderer_id/name/output_format/output_path/description).
 */
export const RENDERER_BINDINGS: RendererBinding[] = [
  {
    renderer_id: "fs:SpecRenderer",
    name: "Specification Documents",
    output_format: "text/markdown",
    output_path: "spec.md",
    description: "Generates the full specification as markdown.",
  },
  {
    renderer_id: "fs:SpecHtmlRenderer",
    name: "Specification HTML",
    output_format: "text/html",
    output_path: "spec.html",
    description: "Generates a self-contained HTML specification document.",
  },
  {
    renderer_id: "fs:SpecPdfRenderer",
    name: "Specification PDF",
    output_format: "application/pdf",
    output_path: "spec.pdf",
    description: "Generates an A4 PDF specification document.",
  },
];
