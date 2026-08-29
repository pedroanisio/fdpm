/**
 * A2 — `text/html`. The verification surface, stage by stage.
 *
 * ARCHITECTURAL REQUIREMENT: LLMs will always produce some form of error.
 * Absence of output verification is a design defect, not a runtime bug.
 * All LLM output must be treated as untrusted and validated explicitly.
 *
 * This page is that requirement made checkable. `CLAUDE.md` names five
 * controls every consumer of model output must have, and a loop-forward
 * stage is exactly such a consumer — so each control is a column and each
 * stage is a row:
 *
 *   1. Typed parse         — a JSON contract whose schema rejects unknown
 *                            fields. Text and markdown have no structure
 *                            to parse, so they cannot satisfy this one.
 *   2. Semantic validation — declared validators beyond the parse.
 *   3. Failure path        — `on_invalid`: fail, or retry to a ceiling.
 *   4. Failure-path test   — an adversarial example aimed at THIS stage.
 *   5. Deterministic bound — attempts and iterations owned by the loop
 *                            config, not by the model.
 *
 * The defect it exists to surface is a stage whose format is text or
 * markdown with no validator at all: nothing can reject that output, and
 * whatever the model emits flows straight into the next binding. The
 * contract permits it. This page names it.
 */
import type { RendererInput, RendererOutput } from "../../../src/plugin/types.js";
import { cell, esc, findings, page, summary, table, type Verdict } from "./_html.js";
import { readStore, type PipelineView, type StageView } from "./_model.js";

/** One stage's standing against the five controls. */
export interface ControlRow {
  stageName: string;
  position: number;
  format: string;
  typedParse: boolean;
  validatorCount: number;
  failurePath: string;
  adversarialCount: number;
  boundedAttempts: boolean;
  /** True when nothing in the pipeline can reject this stage's output. */
  unguarded: boolean;
}

export function controlRows(pipeline: PipelineView): ControlRow[] {
  const adversarialByStage = new Map<string, number>();
  for (const example of pipeline.examples) {
    if (example.kind !== "adversarial" || example.stageId === null) continue;
    adversarialByStage.set(example.stageId, (adversarialByStage.get(example.stageId) ?? 0) + 1);
  }

  return pipeline.stages.map((stage: StageView) => {
    const contract = stage.contract;
    const typedParse = contract?.format === "json" && contract.hasJsonSchema;
    const validatorCount = contract?.validators.length ?? 0;
    const failurePath =
      contract === null || contract === undefined
        ? "none"
        : contract.onInvalid === "retry"
          ? `retry ×${contract.maxAttempts ?? "?"}`
          : "fail";
    return {
      stageName: stage.name,
      position: stage.position,
      format: contract?.format ?? "(no contract)",
      typedParse,
      validatorCount,
      failurePath,
      adversarialCount: adversarialByStage.get(stage.id) ?? 0,
      // The bound is deterministic when a retry declares its ceiling, and
      // trivially so when there is no retry at all.
      boundedAttempts:
        contract === null || contract === undefined
          ? false
          : contract.onInvalid === "fail" || contract.maxAttempts !== null,
      unguarded: !typedParse && validatorCount === 0,
    };
  });
}

function verdictCell(pass: boolean, passLabel: string, failLabel: string, soft = false): string {
  if (pass) return cell("ok", passLabel);
  return cell(soft ? "warn" : "bad", failLabel);
}

function pipelineSection(pipeline: PipelineView): string {
  const rows = controlRows(pipeline);
  const loop = pipeline.loop;
  const unguarded = rows.filter((row) => row.unguarded);
  const untested = rows.filter((row) => row.adversarialCount === 0);

  const body = table({
    caption:
      "One row per stage. A control that cannot fail is not a control, so each column reports what the document actually declares.",
    headers: [
      "#",
      "Stage",
      "Format",
      "1 · Typed parse",
      "2 · Semantic validation",
      "3 · Failure path",
      "4 · Failure-path test",
      "5 · Deterministic bound",
    ],
    rows: rows.map((row) => [
      `<span class="mono">${row.position + 1}</span>`,
      `<strong>${esc(row.stageName)}</strong>`,
      `<code>${esc(row.format)}</code>`,
      verdictCell(row.typedParse, "schema", row.format === "json" ? "no schema" : "no structure"),
      verdictCell(
        row.validatorCount > 0,
        `${row.validatorCount} validator${row.validatorCount === 1 ? "" : "s"}`,
        "none",
        row.typedParse,
      ),
      row.failurePath === "none"
        ? cell("bad", "none")
        : cell("ok", row.failurePath),
      verdictCell(
        row.adversarialCount > 0,
        `${row.adversarialCount} adversarial`,
        "none",
        true,
      ),
      verdictCell(row.boundedAttempts, "bounded", "unbounded"),
    ]),
  });

  const notes: { verdict: Verdict; text: string }[] = [];
  for (const row of unguarded) {
    notes.push({
      verdict: "bad",
      text: `Stage "${row.stageName}" emits ${row.format} with no declared validator. Nothing in this pipeline can reject its output, and every binding that reads it consumes the model's text verbatim.`,
    });
  }
  for (const row of untested) {
    notes.push({
      verdict: "warn",
      text: `Stage "${row.stageName}" has no adversarial example. Its failure path is declared but never exercised, so a verification layer that stopped working would not be noticed.`,
    });
  }
  if (loop && loop.stopConditions.length === 0) {
    notes.push({
      verdict: "warn",
      text: "No stop condition is declared. Only the iteration ceiling ends this loop, so a run cannot report success — it can only run out.",
    });
  }
  if (pipeline.status === "active" && pipeline.evaluation === null) {
    notes.push({
      verdict: "bad",
      text: "An active pipeline with no evaluation policy: there is no recorded evidence behind its promotion.",
    });
  }

  return [
    `<h2>${esc(pipeline.name)} <span class="muted">v${esc(pipeline.version)} · ${esc(pipeline.status)}</span></h2>`,
    summary([
      { key: "Stages", value: String(rows.length) },
      { key: "Unguarded", value: String(unguarded.length) },
      { key: "Without adversarial test", value: String(untested.length) },
      { key: "Iteration ceiling", value: loop ? String(loop.maxIterations) : "—" },
    ]),
    body,
    "<h3>Findings</h3>",
    findings(notes),
  ].join("\n");
}

export function renderVerificationSurface(input: RendererInput): RendererOutput {
  const store = readStore(input);
  const body =
    store.pipelines.length === 0
      ? '<p class="note muted">This workbook declares no pipeline, so there is no verification surface to report.</p>'
      : store.pipelines.map(pipelineSection).join("\n");

  const html = page({
    title: "Verification surface",
    lede:
      "Every stage is a consumer of model output. These are the five controls such a consumer must have, and what each stage actually declares.",
    workbookId: store.workbookId,
    body,
  });

  return {
    bytes: new TextEncoder().encode(html),
    contentType: "text/html",
    filename: "verification-surface.html",
  };
}
