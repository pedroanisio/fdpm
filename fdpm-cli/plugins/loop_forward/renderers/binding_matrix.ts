/**
 * A4 — `text/html`. Stage × task-template variable: where every value
 * comes from, and whether anything supplies it at all.
 *
 * The contract's `checkStoreJoins` already performs this check when a
 * store is parsed — it refuses a document whose stage leaves a required
 * template variable unbound, or binds one from a source of the wrong
 * type. So this page is not re-deriving a verdict; it is displaying one
 * the document had to satisfy to exist.
 *
 * That is exactly why it is worth rendering. The check runs once, at
 * parse time, and reports a path like
 * `pipelines.0.stages.2.bindings` — accurate, and useless for seeing
 * whether the wiring as a whole makes sense. A matrix shows the shape:
 * which stage depends on which earlier stage, which variables come from
 * the caller and never change, and which come round the loop.
 *
 * One honest limit, and the page states it rather than guessing. For a
 * `stage_output` or `literal` source, the value's type lives inside the
 * source stage's JSON Schema, which this profile stores as an opaque
 * payload. The verdict is reported as "unknown", not assumed to pass.
 */
import type { RendererInput, RendererOutput } from "../../../src/plugin/types.js";
import { cell, esc, findings, page, summary, table, type Verdict } from "./_html.js";
import {
  bindingTypeVerdict,
  readStore,
  type BindingView,
  type PipelineView,
  type StageView,
  type VariableView,
} from "./_model.js";

export interface CoverageCell {
  variableName: string;
  required: boolean;
  declaredType: string;
  bound: boolean;
  sourceKind: string | null;
  sourceLabel: string;
  typeVerdict: "ok" | "mismatch" | "unknown" | "unbound";
}

export interface CoverageRow {
  stageName: string;
  position: number;
  templateName: string | null;
  cells: CoverageCell[];
}

function sourceLabel(binding: BindingView): string {
  switch (binding.sourceKind) {
    case "literal":
      return "literal";
    case "pipeline_input":
      return `input ${binding.inputName ?? "?"}`;
    case "stage_output":
      return binding.readsStage === null
        ? "stage (unresolved)"
        : `${binding.readsStage.name}${binding.sourcePath ? ` ${binding.sourcePath}` : ""}`;
    case "carried":
      return `carry ${binding.carryName ?? "?"}`;
    default:
      return binding.sourceKind;
  }
}

/**
 * One row per stage, one cell per variable its task template declares.
 *
 * A stage whose task template is not in the workbook yields a row with
 * no cells — reported as a finding, because "no variables declared" and
 * "the template is missing" are different facts and must not look alike.
 */
export function coverageRows(pipeline: PipelineView): CoverageRow[] {
  const carries = pipeline.loop?.carries ?? [];
  return pipeline.stages.map((stage: StageView) => {
    const template = stage.taskTemplate;
    const variables: VariableView[] = template?.variables ?? [];
    const byName = new Map(stage.bindings.map((binding) => [binding.variableName, binding]));

    const cells: CoverageCell[] = variables.map((variable) => {
      const binding = byName.get(variable.name);
      if (binding === undefined) {
        return {
          variableName: variable.name,
          required: variable.isRequired,
          declaredType: variable.type,
          bound: false,
          sourceKind: null,
          sourceLabel: "—",
          typeVerdict: "unbound",
        };
      }
      return {
        variableName: variable.name,
        required: variable.isRequired,
        declaredType: variable.type,
        bound: true,
        sourceKind: binding.sourceKind,
        sourceLabel: sourceLabel(binding),
        typeVerdict: bindingTypeVerdict(binding, variable, pipeline.inputs, carries),
      };
    });

    return {
      stageName: stage.name,
      position: stage.position,
      templateName: template?.name ?? null,
      cells,
    };
  });
}

/** Bindings that name a variable the task template does not declare. */
export function strayBindings(pipeline: PipelineView): { stage: string; variable: string }[] {
  const stray: { stage: string; variable: string }[] = [];
  for (const stage of pipeline.stages) {
    const declared = new Set((stage.taskTemplate?.variables ?? []).map((v) => v.name));
    if (stage.taskTemplate === null) continue;
    for (const binding of stage.bindings) {
      if (!declared.has(binding.variableName)) {
        stray.push({ stage: stage.name, variable: binding.variableName });
      }
    }
  }
  return stray;
}

function cellMarkup(entry: CoverageCell): string {
  if (!entry.bound) {
    return entry.required
      ? `${cell("bad", "unbound")}<br><span class="muted">required</span>`
      : `${cell("warn", "unbound")}<br><span class="muted">optional</span>`;
  }
  const verdict: Verdict =
    entry.typeVerdict === "ok" ? "ok" : entry.typeVerdict === "mismatch" ? "bad" : "warn";
  const label =
    entry.typeVerdict === "ok"
      ? entry.sourceKind ?? "bound"
      : entry.typeVerdict === "mismatch"
        ? "type mismatch"
        : entry.sourceKind ?? "bound";
  return `${cell(verdict, label.replace(/_/g, " "))}<br><code>${esc(entry.sourceLabel)}</code>`;
}

function pipelineSection(pipeline: PipelineView): string {
  const rows = coverageRows(pipeline);
  const stray = strayBindings(pipeline);

  const allCells = rows.flatMap((row) => row.cells);
  const unbound = allCells.filter((entry) => !entry.bound && entry.required);
  const mismatched = allCells.filter((entry) => entry.typeVerdict === "mismatch");
  const unknown = allCells.filter((entry) => entry.typeVerdict === "unknown");

  const body = table({
    caption:
      "Each cell is one variable of the stage's task template and the source that supplies it. An empty row means the task template is not in this workbook.",
    headers: ["#", "Stage", "Task template", "Variables"],
    rows: rows.map((row) => [
      `<span class="mono">${row.position + 1}</span>`,
      `<strong>${esc(row.stageName)}</strong>`,
      row.templateName === null
        ? cell("bad", "missing")
        : `<code>${esc(row.templateName)}</code>`,
      row.cells.length === 0
        ? `<span class="muted">${row.templateName === null ? "cannot resolve" : "no variables declared"}</span>`
        : `<div class="scroll" tabindex="0" role="region" aria-label="Variables for ${esc(row.stageName)}"><table><thead><tr>${row.cells
            .map((entry) => `<th>${esc(entry.variableName)}<br><code>${esc(entry.declaredType)}</code></th>`)
            .join("")}</tr></thead><tbody><tr>${row.cells
            .map((entry) => `<td>${cellMarkup(entry)}</td>`)
            .join("")}</tr></tbody></table></div>`,
    ]),
  });

  const notes: { verdict: Verdict; text: string }[] = [];
  for (const entry of unbound) {
    notes.push({
      verdict: "bad",
      text: `A required variable "${entry.variableName}" is not bound by any stage source.`,
    });
  }
  for (const entry of mismatched) {
    notes.push({
      verdict: "bad",
      text: `"${entry.variableName}" is bound from ${entry.sourceLabel}, which cannot satisfy its declared type ${entry.declaredType}.`,
    });
  }
  for (const item of stray) {
    notes.push({
      verdict: "bad",
      text: `Stage "${item.stage}" binds "${item.variable}", which its task template does not declare. The value is computed and discarded.`,
    });
  }
  for (const row of rows) {
    if (row.templateName === null) {
      notes.push({
        verdict: "warn",
        text: `Stage "${row.stageName}" names a task template this workbook does not contain, so its coverage cannot be checked.`,
      });
    }
  }
  if (unknown.length > 0) {
    notes.push({
      verdict: "warn",
      text: `${unknown.length} binding${unknown.length === 1 ? "" : "s"} read a stage output or a literal. Their value type lives inside the source stage's JSON Schema, which this profile stores as an opaque payload, so the type is reported as unknown rather than assumed to pass.`,
    });
  }

  return [
    `<h2>${esc(pipeline.name)} <span class="muted">v${esc(pipeline.version)} · ${esc(pipeline.status)}</span></h2>`,
    summary([
      { key: "Stages", value: String(rows.length) },
      { key: "Variables", value: String(allCells.length) },
      { key: "Unbound required", value: String(unbound.length) },
      { key: "Type mismatches", value: String(mismatched.length) },
    ]),
    body,
    "<h3>Findings</h3>",
    findings(notes),
  ].join("\n");
}

export function renderBindingMatrix(input: RendererInput): RendererOutput {
  const store = readStore(input);
  const body =
    store.pipelines.length === 0
      ? '<p class="note muted">This workbook declares no pipeline, so there is no binding coverage to report.</p>'
      : store.pipelines.map(pipelineSection).join("\n");

  const html = page({
    title: "Binding coverage",
    lede:
      "Where every task-template variable gets its value: a caller input, an earlier stage, a carry, or a literal — and whether anything supplies it at all.",
    workbookId: store.workbookId,
    body,
  });

  return {
    bytes: new TextEncoder().encode(html),
    contentType: "text/html",
    filename: "binding-matrix.html",
  };
}
