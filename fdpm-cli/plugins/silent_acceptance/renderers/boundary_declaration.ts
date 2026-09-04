import type { RendererInput, RendererOutput } from "../../../src/plugin/types.js";
import { ERROR_CLASSES } from "../ids.js";
import {
  UNCHECKED_ASSURANCE_CLAIMS,
  buildBoundaryViews,
  fieldOf,
  percentage,
} from "./_model.js";

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
}

function table(headers: string[], rows: string[][]): string[] {
  return [
    `| ${headers.join(" | ")} |`,
    `|${headers.map(() => "---").join("|")}|`,
    ...rows.map((row) => `| ${row.map(escapeCell).join(" | ")} |`),
    "",
  ];
}

export function renderBoundaryDeclaration(input: RendererInput): RendererOutput {
  const boundaries = buildBoundaryViews(input);
  const lines: string[] = ["# Silent Acceptance v2.1 verification-boundary declaration", ""];
  if (boundaries.length === 0) {
    lines.push(
      "> **No verification boundary is declared. This workbook exhibits silent acceptance.**",
      "",
      `Required intrinsic classes: ${ERROR_CLASSES.join(", ")}.`,
      "",
    );
  }

  for (const [index, view] of boundaries.entries()) {
    if (boundaries.length > 1) lines.push(`## ${index + 1}. ${escapeCell(fieldOf(view.instance, "boundary_name") || view.instance.id)}`, "");
    lines.push(
      `**Status:** ${fieldOf(view.instance, "status") || "undeclared"} · ` +
        `**Structural verdict:** ${view.structurallyComplete ? "COMPLETE" : "INCOMPLETE"}`,
      "",
      ...table(
        ["Declaration field", "Value"],
        [
          ["SILENT_ACCEPTANCE_VERSION", fieldOf(view.instance, "protocol_version") || "—"],
          ["SOLVER_CONFIGURATION_ID", fieldOf(view.configuration, "solver_configuration_id") || "—"],
          ["Consumer", fieldOf(view.consumer, "name") || "—"],
          ["Consequence", fieldOf(view.consumer, "consequence_statement") || "—"],
          ["Scope", fieldOf(view.instance, "scope_statement") || "—"],
          ["Distribution", fieldOf(view.instance, "distribution_ref") || "—"],
          ["Verifier location", fieldOf(view.instance, "verifier_location") || "—"],
          ["TOLERATED_FAILURE_RATE", percentage(view.toleratedFailureRate)],
          ["OWNER", fieldOf(view.instance, "owner") || "—"],
          ["CALIBRATED_ON", fieldOf(view.instance, "calibrated_on") || "—"],
          ["Acceptance authority", fieldOf(view.authority, "name") || "—"],
          ["Acceptance control domain", fieldOf(view.authority, "control_domain") || "—"],
          ["Verdict store", fieldOf(view.authority, "verdict_store_location") || "—"],
        ],
      ),
      "## Error-class scope, mechanisms, and measured risk",
      "",
      ...table(
        ["Class", "Disposition", "Mechanism", "Recall", "False positive", "Failure behaviour", "Oracle", "Severity", "Residual risk"],
        view.coverage.map((row) => [
          row.errorClass,
          row.disposition,
          row.verifiers.map((verifier) => fieldOf(verifier, "mechanism")).join("; ") || row.acceptedRisks.map((risk) => fieldOf(risk, "mitigation_note")).join("; ") || "—",
          percentage(row.recall),
          percentage(row.falsePositiveRate),
          row.failureAction || "—",
          row.oracles.map((oracle) => fieldOf(oracle, "evidence_source")).join("; ") || "—",
          row.severityWeight === null ? "—" : String(row.severityWeight),
          row.residualRisk.toFixed(6),
        ]),
      ),
      `**Coverage:** ${view.declaredClassCount} / ${ERROR_CLASSES.length} classes declared; ${view.coveredCount} covered; ${view.acceptedRiskCount} accepted risk.`,
      "",
      `**Severity-weighted residual risk:** ${view.aggregateResidualRisk.toFixed(6)}. **Consumer failure-rate tau:** ${view.toleratedFailureRate?.toFixed(6) ?? "—"}. These are separately declared quantities and are not directly compared.`,
      "",
      `**Control-domain declaration:** ${view.independentControlDomains ? "producer, verifier, and acceptance authority are recorded as separate" : "NOT independent or incomplete"}.`,
      "",
      `**Calibration:** ${fieldOf(view.calibration, "calibration_id") || "none"}; pin ${view.calibrationMatchesPin ? "matches" : "does not match"}; ${view.calibratedCoverageCount} / ${ERROR_CLASSES.length} classes measured.`,
      "",
    );
  }

  lines.push("## Checks this artifact cannot prove", "");
  for (const caveat of UNCHECKED_ASSURANCE_CLAIMS) lines.push(`- **UNCHECKED:** ${caveat}`);
  lines.push("", "Source: Silent Acceptance v2.1.0, normative §§3.1, 5, 9.1, 9.6, and 9.7.", "");

  return {
    bytes: new TextEncoder().encode(lines.join("\n")),
    contentType: "text/markdown",
    filename: "silent-acceptance-boundary.md",
  };
}
