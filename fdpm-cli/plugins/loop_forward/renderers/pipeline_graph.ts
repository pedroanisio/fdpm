/**
 * A1 — `image/svg+xml`. The pipeline as a dataflow graph.
 *
 * This is the view the contract's central idea is invisible without. A
 * loop-forward pipeline has two kinds of edge and they obey opposite
 * rules:
 *
 *   - A **forward edge** (`stage_output`) may point only at a strictly
 *     earlier stage. That constraint is what makes one iteration a DAG,
 *     and it is why these are drawn as arcs ABOVE the stage row, always
 *     running right-to-left back to an earlier box.
 *   - A **carry** is the only way a value crosses an iteration boundary.
 *     It captures a stage's output at the end of an iteration and hands
 *     it to the next one. Carries are drawn BELOW the row, returning to
 *     the band's entry point, because that is literally where the value
 *     goes: back to the start, one iteration later.
 *
 * Separating them by side is the whole design. Drawn together they look
 * like one cyclic mess; drawn apart, the reader can see that everything
 * above the row is acyclic and everything below it is the intentional
 * cycle the iteration ceiling bounds.
 *
 * Geometry is exported as `pipelineGraphLayout` and is this renderer's
 * contract: the coordinates are a computed fact about the pipeline, so a
 * test can address a specific box and check the pixel rather than assert
 * on a substring of markup.
 *
 * Fonts are named as generic families only. An SVG that names an
 * installed font renders differently on the next machine, and a diagram
 * that changes shape between viewers is not a diagram.
 */
import type { RendererInput, RendererOutput } from "../../../src/plugin/types.js";
import {
  readStore,
  type CarryView,
  type PipelineView,
  type StageView,
  type StopConditionView,
} from "./_model.js";

const SANS = "ui-sans-serif, system-ui, sans-serif";
const MONO = "ui-monospace, monospace";

const GROUND = "#ffffff";
const INK = "#16181d";
const MUTED = "#6b7280";
const LINE = "#c9cdd6";
const BAND = "#f7f8fa";
const FORWARD = "#2f5fa8";
const CARRY = "#8a5a00";

/** Terminal states, coloured by what they mean for the operator. */
const TERMINAL_FILL: Record<string, string> = {
  success: "#1b7f4b",
  clean_noop: "#1b7f4b",
  blocked: "#b3261e",
  approval_required: "#8a5a00",
  exhausted: "#8a5a00",
  stagnated: "#8a5a00",
  failed: "#b3261e",
};

const MARGIN = 24;
const BOX_W = 210;
const BOX_H = 86;
const BOX_GAP = 72;
const HEADER_H = 74;
/** Vertical room reserved above the row for forward arcs. */
const ARC_LANE = 26;
const CARRY_LANE = 30;
const STOP_ROW_H = 22;

export interface GraphBox {
  stageId: string;
  name: string;
  position: number;
  x: number;
  y: number;
  w: number;
  h: number;
  agentName: string;
  modelId: string;
  format: string;
  guarded: boolean;
  attempts: number;
}

export interface GraphForwardEdge {
  fromStageId: string;
  toStageId: string;
  variableName: string;
  path: string;
  /** Arc lane index; deeper spans sit higher so arcs never overlap. */
  lane: number;
}

export interface GraphCarryEdge {
  name: string;
  fromStageId: string;
  mode: string;
  valueType: string;
  maxChars: number;
  lane: number;
}

export interface GraphStopRow {
  conditionId: string;
  kind: string;
  terminalState: string;
  detail: string;
  observedStageNames: string[];
}

export interface PipelineGraphLayout {
  width: number;
  height: number;
  bandY: number;
  bandH: number;
  boxes: GraphBox[];
  forward: GraphForwardEdge[];
  carries: GraphCarryEdge[];
  stops: GraphStopRow[];
  title: string;
  subtitle: string;
  loopLine: string;
}

function stopDetail(condition: StopConditionView): string {
  switch (condition.kind) {
    case "output_match":
      return `matches ${condition.pattern ?? ""}`;
    case "field_equals":
      return `${condition.path ?? ""} equals a fixed value`;
    case "field_truthy":
      return `${condition.path ?? ""} is truthy`;
    case "score_threshold":
      return `${condition.path ?? ""} ${condition.comparator ?? "gte"} ${condition.threshold ?? 0}`;
    case "unchanged":
      return `unchanged for ${condition.window ?? 2} iterations`;
    default:
      return condition.kind;
  }
}

/**
 * Compute the drawing.
 *
 * Forward arcs are assigned lanes by span length: an edge that jumps two
 * boxes is drawn higher than one that jumps a single box, so two arcs
 * over the same stretch never sit on top of each other. Carries get one
 * lane each for the same reason.
 */
export function pipelineGraphLayout(pipeline: PipelineView): PipelineGraphLayout {
  const stages = pipeline.stages;
  const boxes: GraphBox[] = stages.map((stage, index) => ({
    stageId: stage.id,
    name: stage.name,
    position: stage.position,
    x: MARGIN + index * (BOX_W + BOX_GAP),
    y: 0, // filled once the arc lane count is known
    w: BOX_W,
    h: BOX_H,
    agentName: stage.agent?.name ?? "(unresolved agent)",
    modelId: stage.agent?.modelId ?? "",
    format: stage.contract?.format ?? "(no contract)",
    guarded: isGuarded(stage),
    attempts: stage.attemptsPerIteration,
  }));

  const indexById = new Map(stages.map((stage, index) => [stage.id, index]));

  const forward: GraphForwardEdge[] = [];
  for (const stage of stages) {
    for (const binding of stage.bindings) {
      if (binding.sourceKind !== "stage_output" || binding.readsStage === null) continue;
      const from = indexById.get(binding.readsStage.id);
      const to = indexById.get(stage.id);
      if (from === undefined || to === undefined) continue;
      forward.push({
        fromStageId: binding.readsStage.id,
        toStageId: stage.id,
        variableName: binding.variableName,
        path: binding.sourcePath ?? "",
        lane: Math.max(1, Math.abs(to - from)),
      });
    }
  }
  forward.sort(
    (a, b) => a.lane - b.lane || a.toStageId.localeCompare(b.toStageId) || a.variableName.localeCompare(b.variableName),
  );

  const carries: GraphCarryEdge[] = (pipeline.loop?.carries ?? []).map(
    (carry: CarryView, index: number) => ({
      name: carry.name,
      fromStageId: carry.sourceStage?.id ?? "",
      mode: carry.carryMode,
      valueType: carry.valueType,
      maxChars: carry.maxSerializedChars,
      lane: index + 1,
    }),
  );

  const stops: GraphStopRow[] = (pipeline.loop?.stopConditions ?? []).map((condition) => ({
    conditionId: condition.conditionId,
    kind: condition.kind,
    terminalState: condition.terminalState,
    detail: stopDetail(condition),
    observedStageNames: condition.observedStages.map((stage) => stage.name),
  }));

  const maxForwardLane = forward.reduce((max, edge) => Math.max(max, edge.lane), 0);
  const arcBlock = maxForwardLane * ARC_LANE;
  const bandY = HEADER_H + arcBlock + 12;
  const boxY = bandY + 16;
  for (const box of boxes) box.y = boxY;

  const carryBlock = carries.length * CARRY_LANE;
  const bandH = BOX_H + 32 + carryBlock;
  const stopsTop = bandY + bandH + 26;
  const height = stopsTop + stops.length * STOP_ROW_H + MARGIN;
  const width =
    MARGIN * 2 + Math.max(boxes.length * BOX_W + Math.max(0, boxes.length - 1) * BOX_GAP, 560);

  const loop = pipeline.loop;
  const loopLine = loop
    ? `${loop.maxIterations} iterations max · stop when ${loop.stopWhen} · on exhausted ${loop.onExhausted} · budget ${loop.maxModelCalls} calls / ${loop.maxTotalTokens.toLocaleString("en-US")} tokens`
    : "no loop policy recorded";

  return {
    width,
    height,
    bandY,
    bandH,
    boxes,
    forward,
    carries,
    stops,
    title: pipeline.name,
    subtitle: `v${pipeline.version} · ${pipeline.status} · ${stages.length} stages`,
    loopLine,
  };
}

/**
 * A stage is guarded when something can reject its output.
 *
 * A JSON contract is guarded by its schema alone — the structural parse
 * is a real check. Text and markdown have no structure to parse, so for
 * those the only guard is a declared validator; with none, whatever the
 * model emits flows straight into the next binding.
 */
function isGuarded(stage: StageView): boolean {
  const contract = stage.contract;
  if (!contract) return false;
  if (contract.format === "json") return true;
  return contract.validators.length > 0;
}

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function text(
  x: number,
  y: number,
  content: string,
  opts: { size?: number; fill?: string; family?: string; weight?: number; anchor?: string } = {},
): string {
  const anchor = opts.anchor ? ` text-anchor="${opts.anchor}"` : "";
  const weight = opts.weight ? ` font-weight="${opts.weight}"` : "";
  return (
    `<text x="${x}" y="${y}" font-family="${opts.family ?? SANS}" font-size="${opts.size ?? 11}"` +
    ` fill="${opts.fill ?? INK}"${weight}${anchor}>${esc(content)}</text>`
  );
}

/** Truncate to a character budget, with an ellipsis that fits inside it. */
function clip(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, Math.max(1, max - 1))}…`;
}

function drawBox(box: GraphBox): string {
  const parts: string[] = [
    `<g data-stage="${esc(box.name)}">`,
    `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="5" fill="${GROUND}" stroke="${LINE}"/>`,
    `<rect x="${box.x}" y="${box.y}" width="4" height="${box.h}" rx="2" fill="${box.guarded ? TERMINAL_FILL.success : "#b3261e"}"/>`,
    text(box.x + 14, box.y + 22, `${box.position + 1}. ${clip(box.name, 24)}`, {
      size: 13,
      weight: 700,
    }),
    text(box.x + 14, box.y + 40, clip(box.agentName, 30), { size: 10, fill: MUTED }),
    text(box.x + 14, box.y + 55, clip(box.modelId, 30), { size: 9, fill: MUTED, family: MONO }),
    text(box.x + 14, box.y + 74, `${box.format} · ${box.attempts} attempt${box.attempts === 1 ? "" : "s"}`, {
      size: 10,
      family: MONO,
      fill: box.guarded ? INK : "#b3261e",
    }),
  ];
  if (!box.guarded) {
    parts.push(
      text(box.x + box.w - 12, box.y + 22, "UNGUARDED", {
        size: 9,
        weight: 700,
        fill: "#b3261e",
        anchor: "end",
      }),
    );
  }
  parts.push("</g>");
  return parts.join("");
}

function drawForward(edge: GraphForwardEdge, layout: PipelineGraphLayout, markerId: string): string {
  const from = layout.boxes.find((box) => box.stageId === edge.fromStageId);
  const to = layout.boxes.find((box) => box.stageId === edge.toStageId);
  if (!from || !to) return "";
  const x1 = from.x + from.w / 2;
  const x2 = to.x + to.w / 2;
  const baseY = from.y;
  const apex = baseY - edge.lane * ARC_LANE;
  const label = edge.path === "" ? edge.variableName : `${edge.variableName} ← ${edge.path}`;
  return [
    `<g data-forward="${esc(edge.fromStageId)}->${esc(edge.toStageId)}">`,
    `<path d="M ${x1} ${baseY} C ${x1} ${apex}, ${x2} ${apex}, ${x2} ${baseY}"`,
    ` fill="none" stroke="${FORWARD}" stroke-width="1.4" marker-end="url(#${markerId})"/>`,
    text((x1 + x2) / 2, apex + 10, clip(label, 40), {
      size: 9,
      family: MONO,
      fill: FORWARD,
      anchor: "middle",
    }),
    "</g>",
  ].join("");
}

function drawCarry(edge: GraphCarryEdge, layout: PipelineGraphLayout, markerId: string): string {
  const from = layout.boxes.find((box) => box.stageId === edge.fromStageId);
  if (!from) return "";
  const y = from.y + from.h + 18 + (edge.lane - 1) * CARRY_LANE;
  const startX = from.x + from.w / 2;
  const endX = layout.boxes[0] ? layout.boxes[0].x + 8 : MARGIN;
  const label = `${edge.name} (${edge.valueType}, ${edge.mode}, ≤${edge.maxChars.toLocaleString("en-US")} chars)`;
  return [
    `<g data-carry="${esc(edge.name)}">`,
    `<path d="M ${startX} ${from.y + from.h} L ${startX} ${y} L ${endX} ${y} L ${endX} ${from.y + from.h}"`,
    ` fill="none" stroke="${CARRY}" stroke-width="1.4" stroke-dasharray="5 3" marker-end="url(#${markerId})"/>`,
    text(endX + 10, y - 5, clip(label, 72), { size: 9, family: MONO, fill: CARRY }),
    "</g>",
  ].join("");
}

function drawStop(row: GraphStopRow, x: number, y: number): string {
  const fill = TERMINAL_FILL[row.terminalState] ?? MUTED;
  const observed = row.observedStageNames.length > 0 ? row.observedStageNames.join(", ") : "—";
  return [
    `<g data-stop="${esc(row.conditionId)}">`,
    `<rect x="${x}" y="${y - 11}" width="9" height="9" rx="2" fill="${fill}"/>`,
    text(x + 16, y - 2, clip(row.conditionId, 22), { size: 10, weight: 600 }),
    text(x + 170, y - 2, clip(row.detail, 46), { size: 9, family: MONO, fill: MUTED }),
    text(x + 500, y - 2, clip(observed, 28), { size: 9, fill: MUTED }),
    text(x + 700, y - 2, row.terminalState, { size: 9, weight: 600, fill }),
    "</g>",
  ].join("");
}

interface PipelineDrawing {
  width: number;
  height: number;
  title: string;
  markup: string;
}

function drawingFor(pipeline: PipelineView, index: number): PipelineDrawing {
  const layout = pipelineGraphLayout(pipeline);
  const body: string[] = [];
  const forwardMarkerId = `pipeline-${index}-arrow-forward`;
  const carryMarkerId = `pipeline-${index}-arrow-carry`;

  body.push(
    "<defs>",
    `<marker id="${forwardMarkerId}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 8 4 L 0 8 z" fill="${FORWARD}"/></marker>`,
    `<marker id="${carryMarkerId}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 8 4 L 0 8 z" fill="${CARRY}"/></marker>`,
    "</defs>",
    `<rect x="0" y="0" width="${layout.width}" height="${layout.height}" fill="${GROUND}"/>`,
    text(MARGIN, 28, layout.title, { size: 17, weight: 700 }),
    text(MARGIN, 46, layout.subtitle, { size: 11, fill: MUTED }),
    text(MARGIN, 63, layout.loopLine, { size: 10, family: MONO, fill: MUTED }),
    `<line x1="${MARGIN}" y1="${HEADER_H - 4}" x2="${layout.width - MARGIN}" y2="${HEADER_H - 4}" stroke="${INK}" stroke-width="0.8"/>`,
  );

  body.push(
    `<rect x="${MARGIN - 10}" y="${layout.bandY}" width="${layout.width - (MARGIN - 10) * 2}" height="${layout.bandH}" rx="6" fill="${BAND}" stroke="${LINE}" stroke-dasharray="3 3"/>`,
    text(MARGIN - 2, layout.bandY + layout.bandH - 6, "one iteration", {
      size: 9,
      fill: MUTED,
      family: MONO,
    }),
  );

  for (const edge of layout.forward) body.push(drawForward(edge, layout, forwardMarkerId));
  for (const box of layout.boxes) body.push(drawBox(box));
  for (const edge of layout.carries) body.push(drawCarry(edge, layout, carryMarkerId));

  const stopsTop = layout.bandY + layout.bandH + 26;
  body.push(
    text(MARGIN, stopsTop - 12, "How the loop can end", { size: 11, weight: 700 }),
  );
  layout.stops.forEach((row, index) => {
    body.push(drawStop(row, MARGIN, stopsTop + index * STOP_ROW_H + 12));
  });
  if (layout.stops.length === 0) {
    body.push(
      text(MARGIN, stopsTop + 12, "No stop condition. Only the iteration ceiling ends this loop.", {
        size: 10,
        fill: "#8a5a00",
      }),
    );
  }

  return { width: layout.width, height: layout.height, title: layout.title, markup: body.join("") };
}

/** Renderer entry point. All pipelines are stacked inside one SVG document. */
export function renderPipelineGraph(input: RendererInput): RendererOutput {
  const store = readStore(input);
  const gap = 24;
  const drawings = store.pipelines.map((pipeline, index) => drawingFor(pipeline, index));
  const width = drawings.length === 0 ? 560 : Math.max(...drawings.map((drawing) => drawing.width));
  const height =
    drawings.length === 0
      ? 80
      : drawings.reduce((sum, drawing) => sum + drawing.height, 0) + gap * (drawings.length - 1);
  const title = drawings.length === 0 ? "No pipelines" : `Pipeline dataflow: ${drawings.map((drawing) => drawing.title).join(", ")}`;
  const description =
    drawings.length === 0
      ? "This workbook declares no pipeline."
      : `${drawings.length} pipeline${drawings.length === 1 ? "" : "s"}, stacked in workbook order.`;
  const content: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="pipeline-graph-title pipeline-graph-description">`,
    `<title id="pipeline-graph-title">${esc(title)}</title>`,
    `<desc id="pipeline-graph-description">${esc(description)}</desc>`,
  ];

  if (drawings.length === 0) {
    content.push(
      `<rect x="0" y="0" width="560" height="80" fill="${GROUND}"/>`,
      text(MARGIN, 44, description, { size: 12, fill: MUTED }),
    );
  } else {
    let y = 0;
    for (const drawing of drawings) {
      content.push(`<g transform="translate(0 ${y})">${drawing.markup}</g>`);
      y += drawing.height + gap;
    }
  }
  content.push("</svg>");

  return {
    bytes: new TextEncoder().encode(content.join("")),
    contentType: "image/svg+xml",
    filename: "pipeline-graph.svg",
  };
}
