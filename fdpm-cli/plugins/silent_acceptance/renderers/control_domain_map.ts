import type { RendererInput, RendererOutput } from "../../../src/plugin/types.js";
import { buildBoundaryViews, fieldOf } from "./_model.js";

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function box(x: number, y: number, width: number, title: string, detail: string, tone: string): string {
  return `<g><rect x="${x}" y="${y}" width="${width}" height="82" rx="10" fill="${tone}" stroke="#32414b"/><text x="${x + 16}" y="${y + 27}" font-size="14" font-weight="700" fill="#17242d">${esc(title)}</text><text x="${x + 16}" y="${y + 51}" font-size="11" fill="#334b5a">${esc(detail.slice(0, 48))}</text><text x="${x + 16}" y="${y + 68}" font-size="10" fill="#536a77">${esc(detail.slice(48, 96))}</text></g>`;
}

export function renderControlDomainMap(input: RendererInput): RendererOutput {
  const view = buildBoundaryViews(input)[0];
  const width = 940;
  const height = 470;
  const body: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="sa-map-title sa-map-desc" font-family="ui-sans-serif,system-ui,sans-serif">`,
    '<title id="sa-map-title">Silent Acceptance control-domain map</title>',
    `<desc id="sa-map-desc">${view ? "Producer output crosses an independently controlled verification boundary before the consumer, while an outside acceptance authority records verdicts." : "No verification boundary is declared; output has no represented control between producer and consumer."}</desc>`,
    '<defs><marker id="arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0 0L9 4.5L0 9Z" fill="#32414b"/></marker><pattern id="warn" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#fee2e2"/><rect width="3" height="8" fill="#fecaca"/></pattern></defs>',
    `<rect width="${width}" height="${height}" fill="#f8fafc"/>`,
    '<text x="34" y="38" font-size="20" font-weight="750" fill="#17242d">Verification boundary · control domains</text>',
  ];
  if (!view) {
    body.push(
      '<rect x="90" y="120" width="760" height="170" rx="14" fill="url(#warn)" stroke="#b91c1c" stroke-width="2"/>',
      '<text x="470" y="190" text-anchor="middle" font-size="21" font-weight="750" fill="#991b1b">No verification boundary declared</text>',
      '<text x="470" y="225" text-anchor="middle" font-size="14" fill="#7f1d1d">Silent acceptance: S is empty and no consumer-protection path is represented.</text>',
      '</svg>',
    );
  } else {
    const producerDomain = fieldOf(view.configuration, "producer_control_domain") || "producer domain undeclared";
    const authorityDomain = fieldOf(view.authority, "control_domain") || "authority domain undeclared";
    const verifierDomain = view.coverage.flatMap((row) => row.verifiers.map((verifier) => fieldOf(verifier, "control_domain"))).find(Boolean) || "verifier domain undeclared";
    body.push(
      '<path d="M250 151H345" stroke="#32414b" stroke-width="2" marker-end="url(#arrow)"/>',
      '<path d="M595 151H690" stroke="#32414b" stroke-width="2" marker-end="url(#arrow)"/>',
      '<path d="M470 290V205" stroke="#32414b" stroke-width="2" stroke-dasharray="6 5" marker-end="url(#arrow)"/>',
      '<path d="M470 372V338" stroke="#32414b" stroke-width="2" stroke-dasharray="6 5" marker-end="url(#arrow)"/>',
      box(40, 110, 210, "Producer configuration", producerDomain, "#e2e8f0"),
      box(345, 110, 250, "Verification boundary", `${view.declaredClassCount}/9 classes · ${fieldOf(view.instance, "status")}`, view.structurallyComplete ? "#dcfce7" : "url(#warn)"),
      box(690, 110, 210, "Consumer", fieldOf(view.consumer, "name") || "consumer undeclared", "#dbeafe"),
      box(345, 256, 250, "Verifier control domain", verifierDomain, "#fef3c7"),
      box(345, 338, 250, "Acceptance authority", authorityDomain, view.independentControlDomains ? "#ede9fe" : "url(#warn)"),
      `<text x="34" y="450" font-size="11" fill="#536a77">Dashed links are governance/control relationships. Separation shown here is declared metadata, not proof of deployed privileges.</text>`,
      '</svg>',
    );
  }
  return {
    bytes: new TextEncoder().encode(body.join("\n")),
    contentType: "image/svg+xml",
    filename: "silent-acceptance-control-domains.svg",
  };
}
