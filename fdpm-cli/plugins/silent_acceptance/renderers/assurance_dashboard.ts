import type { RendererInput, RendererOutput } from "../../../src/plugin/types.js";
import { escapeDocumentHtml, renderStandaloneDocument } from "../../../src/core/render/document.js";
import { ERROR_CLASSES } from "../ids.js";
import { UNCHECKED_ASSURANCE_CLAIMS, buildBoundaryViews, fieldOf, percentage } from "./_model.js";

const esc = escapeDocumentHtml;

function badge(ok: boolean, yes: string, no: string): string {
  return `<span class="sa-badge ${ok ? "ok" : "bad"}">${esc(ok ? yes : no)}</span>`;
}

export function renderAssuranceDashboard(input: RendererInput): RendererOutput {
  const boundaries = buildBoundaryViews(input);
  let body = `<main class="sa-page"><header><p class="sa-kicker">Silent Acceptance · protocol 2.1.0</p><h1>Verification-boundary assurance</h1><p>Reviewable state for scope, mechanisms, calibration, failure behaviour, oracle evidence, residual risk, and authority separation.</p></header>`;
  if (boundaries.length === 0) {
    body += `<section class="sa-empty"><h2>No verification boundary is declared</h2><p>This workbook exhibits silent acceptance: no covered error class stands between producer output and a consumer.</p></section>`;
  }
  for (const view of boundaries) {
    body += `<article class="sa-boundary"><div class="sa-title"><div><p class="sa-kicker">${esc(view.instance.id)}</p><h2>${esc(fieldOf(view.instance, "boundary_name"))}</h2></div>${badge(view.structurallyComplete, "complete", "incomplete")}</div>`;
    body += `<div class="sa-metrics"><div aria-label="${view.declaredClassCount} / ${ERROR_CLASSES.length} classes declared"><strong>${view.declaredClassCount} / ${ERROR_CLASSES.length}</strong><span>classes declared</span></div><div><strong>${view.coveredCount}</strong><span>covered</span></div><div><strong>${view.acceptedRiskCount}</strong><span>accepted risk</span></div><div><strong>${percentage(view.toleratedFailureRate)}</strong><span>consumer tau</span></div><div><strong>${view.aggregateResidualRisk.toFixed(4)}</strong><span>weighted residual</span></div></div>`;
    body += `<dl class="sa-declaration"><div><dt>SOLVER_CONFIGURATION_ID</dt><dd>${esc(fieldOf(view.configuration, "solver_configuration_id") || "—")}</dd></div><div><dt>Consumer</dt><dd>${esc(fieldOf(view.consumer, "name") || "—")}</dd></div><div><dt>Verifier location</dt><dd>${esc(fieldOf(view.instance, "verifier_location") || "—")}</dd></div><div><dt>Owner / calibrated</dt><dd>${esc(fieldOf(view.instance, "owner") || "—")} · ${esc(fieldOf(view.instance, "calibrated_on") || "—")}</dd></div><div><dt>Producer control domain</dt><dd>${esc(fieldOf(view.configuration, "producer_control_domain") || "—")}</dd></div><div><dt>Acceptance authority</dt><dd>${esc(fieldOf(view.authority, "name") || "—")} · ${esc(fieldOf(view.authority, "control_domain") || "—")}</dd></div></dl>`;
    body += `<div class="sa-table-wrap"><table><thead><tr><th>Class</th><th>Disposition</th><th>Mechanism / mitigation</th><th>Recall</th><th>False +</th><th>On reject</th><th>Residual</th></tr></thead><tbody>`;
    for (const row of view.coverage) {
      const mechanism = row.verifiers.map((verifier) => fieldOf(verifier, "mechanism")).join("; ") || row.acceptedRisks.map((risk) => fieldOf(risk, "mitigation_note")).join("; ") || "—";
      body += `<tr><th>${esc(row.errorClass)}</th><td>${esc(row.disposition)}</td><td>${esc(mechanism)}</td><td>${esc(percentage(row.recall))}</td><td>${esc(percentage(row.falsePositiveRate))}</td><td>${esc(row.failureAction || "—")}</td><td>${row.residualRisk.toFixed(6)}</td></tr>`;
    }
    body += `</tbody></table></div><p class="sa-risk-note">Weighted residual risk and consumer tau are distinct declared quantities; this artifact does not compare their numeric values.</p><div class="sa-gates"><p>${badge(view.independentControlDomains, "control domains separated", "control-domain defect")}</p><p>${badge(view.calibrationMatchesPin && view.calibratedCoverageCount === ERROR_CLASSES.length, "calibration matches pin", "calibration incomplete")}</p><p>${badge(view.coverage.length === ERROR_CLASSES.length, "risk quantified", "risk incomplete")}</p></div></article>`;
  }
  body += `<aside class="sa-caveats"><h2>Unchecked assurance claims</h2><p>The profile records these claims but does not self-certify them.</p><ul>${UNCHECKED_ASSURANCE_CLAIMS.map((claim) => `<li>${esc(claim)}</li>`).join("")}</ul></aside></main>`;

  const html = renderStandaloneDocument({
    title: "Silent Acceptance verification-boundary assurance",
    body,
    accent: "crimson",
    bodyClass: "silent-acceptance-document",
    styles: `
.sa-page{width:min(92rem,calc(100% - 2rem));margin:0 auto;padding:clamp(2rem,5vw,5rem) 0 6rem}.sa-page header{max-width:72ch;margin-bottom:2rem}.sa-kicker{text-transform:uppercase;letter-spacing:.12em;font:700 .74rem/1.3 var(--fdpm-code-font);color:var(--fdpm-accent)}h1,h2{font-family:var(--fdpm-reading-font);line-height:1.08}.sa-boundary,.sa-empty,.sa-caveats{background:var(--fdpm-surface);border:1px solid var(--fdpm-rule);border-radius:.8rem;padding:clamp(1rem,3vw,2rem);margin:1rem 0;box-shadow:var(--fdpm-shadow)}.sa-title{display:flex;gap:1rem;justify-content:space-between;align-items:flex-start}.sa-title h2{margin:.15rem 0 1rem}.sa-badge{display:inline-block;border:1px solid currentColor;border-radius:999px;padding:.22rem .55rem;font:700 .72rem/1 var(--fdpm-code-font);text-transform:uppercase;letter-spacing:.04em}.sa-badge.ok{color:var(--fdpm-ok)}.sa-badge.bad{color:var(--fdpm-bad)}.sa-metrics{display:grid;grid-template-columns:repeat(5,minmax(8rem,1fr));gap:.7rem;margin:1rem 0}.sa-metrics div{padding:.8rem;border:1px solid var(--fdpm-rule);border-radius:.5rem;background:var(--fdpm-accent-soft)}.sa-metrics strong,.sa-metrics span{display:block}.sa-metrics strong{font:750 1.35rem/1.1 var(--fdpm-code-font)}.sa-metrics span{font-size:.78rem;color:var(--fdpm-muted);margin-top:.35rem}.sa-declaration{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.2rem 1.2rem}.sa-declaration div{padding:.65rem 0;border-bottom:1px solid var(--fdpm-rule)}dt{font:700 .72rem/1.3 var(--fdpm-code-font);color:var(--fdpm-muted)}dd{margin:.25rem 0 0}.sa-table-wrap{overflow-x:auto;margin:1.5rem 0}table{width:100%;border-collapse:collapse;font-size:.82rem}th,td{text-align:left;vertical-align:top;border-bottom:1px solid var(--fdpm-rule);padding:.65rem}.sa-risk-note{color:var(--fdpm-muted);font-size:.82rem}.sa-gates{display:flex;flex-wrap:wrap;gap:.5rem}.sa-gates p{margin:0}.sa-caveats{border-left:5px solid var(--fdpm-warn)}@media(max-width:55rem){.sa-metrics{grid-template-columns:repeat(2,1fr)}.sa-declaration{grid-template-columns:1fr}}@media(max-width:32rem){.sa-page{width:min(100% - 1rem,92rem)}.sa-metrics{grid-template-columns:1fr}.sa-title{display:block}.sa-title>.sa-badge{margin-bottom:1rem}}
    `,
  });
  return {
    bytes: new TextEncoder().encode(html),
    contentType: "text/html",
    filename: "silent-acceptance-assurance.html",
  };
}
