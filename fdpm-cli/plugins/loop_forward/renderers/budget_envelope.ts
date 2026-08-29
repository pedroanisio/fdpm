/**
 * A5 — `text/markdown`. What this pipeline can cost in the worst case,
 * against what it is allowed to spend.
 *
 * The contract exports `maxModelCalls(pipeline)`: iterations × the sum of
 * each stage's attempt ceiling. That number is a structural fact — it
 * falls out of the document with no execution and no estimate — and the
 * declared budget sits right next to it in `loop.budget`. Nothing
 * compares them.
 *
 * The comparison is worth making because of what it can prove. If the
 * structural bound exceeds `max_model_calls`, the budget is reached
 * before the stages are, so every run of that pipeline ends `exhausted`
 * no matter what the model produces — the stop conditions are
 * unreachable. That is a defect in the document, it is decidable without
 * running anything, and the contract does not check it.
 *
 * The token envelope is the same shape with one honest caveat, stated on
 * the page: `max_output_tokens` bounds a call's OUTPUT only. Input tokens
 * depend on the rendered prompt and on how far an `append` carry has
 * grown, neither of which the document fixes. So the token figure is a
 * floor on the worst case, and is labelled as one rather than presented
 * as the answer.
 */
import type { RendererInput, RendererOutput } from "../../../src/plugin/types.js";
import { readStore, type PipelineView } from "./_model.js";

export interface BudgetEnvelope {
  pipelineName: string;
  version: string;
  status: string;
  maxIterations: number;
  attemptsPerIteration: number;
  /** iterations × attempts-per-iteration — the contract's maxModelCalls. */
  structuralCalls: number;
  declaredCalls: number;
  /** Σ(stage max_output_tokens × its attempts) × iterations. */
  outputTokenFloor: number;
  declaredTokens: number;
  declaredWallClockMs: number;
  declaredCostUsd: number | null;
  /** Worst-case serialized growth of append-mode carries, in characters. */
  appendCarryChars: number;
  callsExceeded: boolean;
  tokensExceeded: boolean;
}

export function budgetEnvelope(pipeline: PipelineView): BudgetEnvelope | null {
  const loop = pipeline.loop;
  if (loop === null) return null;

  const attemptsPerIteration = pipeline.stages.reduce(
    (sum, stage) => sum + stage.attemptsPerIteration,
    0,
  );
  const structuralCalls = loop.maxIterations * attemptsPerIteration;

  const perIterationOutputTokens = pipeline.stages.reduce(
    (sum, stage) => sum + (stage.agent?.maxOutputTokens ?? 0) * stage.attemptsPerIteration,
    0,
  );
  const outputTokenFloor = perIterationOutputTokens * loop.maxIterations;

  const appendCarryChars = loop.carries
    .filter((carry) => carry.carryMode === "append")
    .reduce((sum, carry) => sum + carry.maxSerializedChars, 0);

  return {
    pipelineName: pipeline.name,
    version: pipeline.version,
    status: pipeline.status,
    maxIterations: loop.maxIterations,
    attemptsPerIteration,
    structuralCalls,
    declaredCalls: loop.maxModelCalls,
    outputTokenFloor,
    declaredTokens: loop.maxTotalTokens,
    declaredWallClockMs: loop.maxWallClockMs,
    declaredCostUsd: loop.maxCostUsd,
    appendCarryChars,
    callsExceeded: structuralCalls > loop.maxModelCalls,
    tokensExceeded: outputTokenFloor > loop.maxTotalTokens,
  };
}

const n = (value: number): string => value.toLocaleString("en-US");

function envelopeSection(pipeline: PipelineView): string {
  const envelope = budgetEnvelope(pipeline);
  const lines: string[] = [];
  lines.push(`## ${pipeline.name}`);
  lines.push("");
  lines.push(`\`v${pipeline.version}\` · ${pipeline.status} · ${pipeline.stages.length} stages`);
  lines.push("");

  if (envelope === null) {
    lines.push("This pipeline records no loop policy, so it declares no budget to check.");
    lines.push("");
    return lines.join("\n");
  }

  lines.push("| Quantity | Structural worst case | Declared budget | Verdict |");
  lines.push("| --- | ---: | ---: | --- |");
  lines.push(
    `| Model calls | ${n(envelope.structuralCalls)} | ${n(envelope.declaredCalls)} | ${
      envelope.callsExceeded ? "**budget reached first**" : "within budget"
    } |`,
  );
  lines.push(
    `| Output tokens (floor) | ${n(envelope.outputTokenFloor)} | ${n(envelope.declaredTokens)} | ${
      envelope.tokensExceeded ? "**budget reached first**" : "within budget"
    } |`,
  );
  lines.push(
    `| Wall clock | — | ${n(envelope.declaredWallClockMs)} ms | declared |`,
  );
  lines.push(
    `| Cost | — | ${envelope.declaredCostUsd === null ? "not declared" : `$${envelope.declaredCostUsd}`} | ${
      envelope.declaredCostUsd === null ? "unbounded" : "declared"
    } |`,
  );
  lines.push("");
  lines.push(
    `The structural bound is ${envelope.maxIterations} iterations × ${envelope.attemptsPerIteration} attempts per iteration. ` +
      "Attempts per iteration is the sum over stages of each stage's retry ceiling, or 1 where the stage fails outright.",
  );
  lines.push("");

  lines.push("### Per-stage attempt budget");
  lines.push("");
  lines.push("| # | Stage | Attempts | Max output tokens | Per-iteration tokens |");
  lines.push("| ---: | --- | ---: | ---: | ---: |");
  for (const stage of pipeline.stages) {
    const perCall = stage.agent?.maxOutputTokens ?? 0;
    lines.push(
      `| ${stage.position + 1} | ${stage.name} | ${stage.attemptsPerIteration} | ${
        stage.agent === null ? "unresolved" : n(perCall)
      } | ${n(perCall * stage.attemptsPerIteration)} |`,
    );
  }
  lines.push("");

  const findings: string[] = [];
  if (envelope.callsExceeded) {
    findings.push(
      `**Every run of this pipeline ends \`exhausted\`.** The structural bound of ${n(envelope.structuralCalls)} model calls exceeds the declared ceiling of ${n(envelope.declaredCalls)}, so the budget is reached before the stages are and no stop condition can fire. This is decidable from the document alone, and the contract does not check it.`,
    );
  }
  if (envelope.tokensExceeded) {
    findings.push(
      `The output-token floor of ${n(envelope.outputTokenFloor)} already exceeds the ${n(envelope.declaredTokens)} token budget before any input token is counted.`,
    );
  }
  if (envelope.appendCarryChars > 0) {
    findings.push(
      `Append-mode carries can grow to ${n(envelope.appendCarryChars)} characters. That text is re-sent as input on every later iteration, so the real token consumption rises with iteration count in a way \`max_output_tokens\` does not bound.`,
    );
  }
  const unresolved = pipeline.stages.filter((stage) => stage.agent === null);
  if (unresolved.length > 0) {
    findings.push(
      `${unresolved.length} stage${unresolved.length === 1 ? "" : "s"} name an agent this workbook does not contain, so the token figures above are a lower bound.`,
    );
  }

  lines.push("### Findings");
  lines.push("");
  if (findings.length === 0) {
    lines.push("The declared budget accommodates the structural worst case.");
  } else {
    for (const finding of findings) lines.push(`- ${finding}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function renderBudgetEnvelope(input: RendererInput): RendererOutput {
  const store = readStore(input);
  const lines: string[] = [
    "# Budget envelope",
    "",
    `Workbook \`${store.workbookId}\`.`,
    "",
    "What each pipeline can consume in the worst case, against what it is allowed to spend. Every figure is structural — read from the document, with nothing executed and nothing estimated.",
    "",
    "> Output tokens are a **floor**. `max_output_tokens` bounds a call's output only; input tokens depend on the rendered prompt and on how far an append-mode carry has grown, neither of which the document fixes.",
    "",
  ];

  if (store.pipelines.length === 0) {
    lines.push("This workbook declares no pipeline.");
    lines.push("");
  } else {
    for (const pipeline of store.pipelines) lines.push(envelopeSection(pipeline));
  }

  return {
    bytes: new TextEncoder().encode(lines.join("\n")),
    contentType: "text/markdown",
    filename: "budget-envelope.md",
  };
}
