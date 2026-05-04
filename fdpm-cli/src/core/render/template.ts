import type { DomainProfile, PrimitiveTypeDef } from "../models/meta.js";
import type {
  PrimitiveInstance,
  Project,
  ProjectTemplate,
  RelationInstance,
} from "../models/instance.js";
import type { ProjectStateSlice } from "../store/state.js";
import type { ExpressionRuntime, ValidationEvaluationOptions } from "../expr/runtime.js";
import { FDPMException } from "../errors/fdpm-exception.js";

export interface RenderFinding {
  kind: "render-error";
  templateId: string;
  line: number;
  column: number;
  expression: string;
  message: string;
  expr_code?: string;
}

export interface RenderTemplateResult {
  text: string;
  findings: RenderFinding[];
}

export interface RenderDslFacade {
  renderTemplate(
    template: string,
    opts: {
      templateId: string;
      docId?: string;
      includes?: Readonly<Record<string, string>>;
      permissions?: ReadonlySet<string>;
    },
  ): RenderTemplateResult;
}

const INCLUDE_DEPTH_LIMIT = 5;

interface RenderContext {
  readonly slice: ProjectStateSlice;
  readonly profile: DomainProfile;
  readonly defaultDoc?: PrimitiveInstance | undefined;
}

type TemplateNode =
  | { kind: "text"; value: string }
  | { kind: "expr"; expression: string; line: number; column: number }
  | { kind: "include"; templateRef: string; line: number; column: number }
  | {
      kind: "if";
      expression: string;
      line: number;
      column: number;
      body: TemplateNode[];
    };

export class RenderDslEngine {
  constructor(private readonly expr: ExpressionRuntime) {}

  createFacade(ctx: RenderContext): RenderDslFacade {
    return {
      renderTemplate: (template, opts) =>
        this.renderTemplateWithContext(ctx, template, opts, new Set<string>()),
    };
  }

  private renderTemplateWithContext(
    ctx: RenderContext,
    template: string,
    opts: {
      templateId: string;
      docId?: string;
      includes?: Readonly<Record<string, string>>;
      permissions?: ReadonlySet<string>;
    },
    includeStack: Set<string>,
  ): RenderTemplateResult {
    const findings: RenderFinding[] = [];
    const parsed = parseTemplate(template, opts.templateId, findings);
    const doc = resolveRenderDoc(ctx, opts.docId);
    const renderCtx: InternalRenderContext = {
      expr: this.expr,
      slice: ctx.slice,
      profile: ctx.profile,
      doc,
      templateId: opts.templateId,
      includes: opts.includes ?? {},
      includeStack,
      findings,
      permissions: opts.permissions,
    };
    const text = renderNodes(parsed, renderCtx);
    return { text, findings };
  }
}

interface InternalRenderContext {
  readonly expr: ExpressionRuntime;
  readonly slice: ProjectStateSlice;
  readonly profile: DomainProfile;
  readonly doc: PrimitiveInstance;
  readonly templateId: string;
  readonly includes: Readonly<Record<string, string>>;
  readonly includeStack: Set<string>;
  readonly findings: RenderFinding[];
  readonly permissions?: ReadonlySet<string>;
}

function renderNodes(nodes: readonly TemplateNode[], ctx: InternalRenderContext): string {
  let out = "";
  for (const node of nodes) {
    switch (node.kind) {
      case "text":
        out += node.value;
        break;
      case "expr":
        out += renderExpression(node, ctx);
        break;
      case "if":
        out += renderIf(node, ctx);
        break;
      case "include":
        out += renderInclude(node, ctx);
        break;
      default:
        assertNever(node);
    }
  }
  return out;
}

function renderExpression(
  node: Extract<TemplateNode, { kind: "expr" }>,
  ctx: InternalRenderContext,
): string {
  try {
    const value = evaluateRenderExpression(node.expression, ctx);
    return stringifyRenderValue(value);
  } catch (err) {
    pushFinding(ctx.findings, {
      templateId: ctx.templateId,
      line: node.line,
      column: node.column,
      expression: node.expression,
      message: err instanceof Error ? err.message : String(err),
      expr_code: exprCode(err),
    });
    return inlineMarker(node.expression, err instanceof Error ? err.message : String(err));
  }
}

function renderIf(
  node: Extract<TemplateNode, { kind: "if" }>,
  ctx: InternalRenderContext,
): string {
  try {
    const value = evaluateRenderExpression(node.expression, ctx);
    return truthy(value) ? renderNodes(node.body, ctx) : "";
  } catch (err) {
    pushFinding(ctx.findings, {
      templateId: ctx.templateId,
      line: node.line,
      column: node.column,
      expression: node.expression,
      message: err instanceof Error ? err.message : String(err),
      expr_code: exprCode(err),
    });
    return inlineMarker(node.expression, err instanceof Error ? err.message : String(err));
  }
}

function renderInclude(
  node: Extract<TemplateNode, { kind: "include" }>,
  ctx: InternalRenderContext,
): string {
  const included = ctx.includes[node.templateRef];
  if (included === undefined) {
    const message = `include target not found: ${node.templateRef}`;
    pushFinding(ctx.findings, {
      templateId: ctx.templateId,
      line: node.line,
      column: node.column,
      expression: `include:${node.templateRef}`,
      message,
    });
    return inlineMarker(`include:${node.templateRef}`, message);
  }
  if (ctx.includeStack.has(node.templateRef)) {
    const message = `include cycle detected: ${[...ctx.includeStack, node.templateRef].join(" -> ")}`;
    pushFinding(ctx.findings, {
      templateId: ctx.templateId,
      line: node.line,
      column: node.column,
      expression: `include:${node.templateRef}`,
      message,
    });
    return inlineMarker(`include:${node.templateRef}`, message);
  }
  if (ctx.includeStack.size >= INCLUDE_DEPTH_LIMIT) {
    const message = `include depth limit ${INCLUDE_DEPTH_LIMIT} exceeded at ${node.templateRef}`;
    pushFinding(ctx.findings, {
      templateId: ctx.templateId,
      line: node.line,
      column: node.column,
      expression: `include:${node.templateRef}`,
      message,
    });
    return inlineMarker(`include:${node.templateRef}`, message);
  }
  ctx.includeStack.add(node.templateRef);
  try {
    const parsed = parseTemplate(included, node.templateRef, ctx.findings);
    return renderNodes(parsed, {
      ...ctx,
      templateId: node.templateRef,
    });
  } finally {
    ctx.includeStack.delete(node.templateRef);
  }
}

function evaluateRenderExpression(expression: string, ctx: InternalRenderContext): unknown {
  const docType = requirePrimitiveType(ctx.profile, ctx.doc.type_id);
  const options: ValidationEvaluationOptions = {
    project: ctx.slice,
    projectFingerprint: `${ctx.slice.project.id}@${ctx.slice.project.revision}`,
    permissions: ctx.permissions,
  };
  return ctx.expr.evaluateValueCEL(
    expression,
    ctx.doc,
    docType,
    ctx.profile,
    Object.values(ctx.slice.relations),
    ctx.templateId,
    options,
  );
}

function requirePrimitiveType(profile: DomainProfile, typeId: string): PrimitiveTypeDef {
  const type = profile.primitive_types.find((candidate) => candidate.id === typeId);
  if (!type) {
    throw new FDPMException("verification", `primitive type not found in profile: ${typeId}`);
  }
  return type;
}

function resolveRenderDoc(ctx: RenderContext, docId?: string): PrimitiveInstance {
  if (docId) {
    const doc = ctx.slice.primitives[docId];
    if (!doc) throw new FDPMException("not_found", `render doc not found: ${docId}`);
    return doc;
  }
  if (ctx.defaultDoc) return ctx.defaultDoc;
  const docs = Object.values(ctx.slice.primitives)
    .filter((primitive) => primitive.type_id === "spec:Document")
    .sort((left, right) => left.id.localeCompare(right.id));
  if (docs[0]) return docs[0];
  const first = Object.values(ctx.slice.primitives).sort((left, right) => left.id.localeCompare(right.id))[0];
  if (first) return first;
  throw new FDPMException("verification", "render DSL requires at least one primitive in context");
}

function parseTemplate(
  source: string,
  templateId: string,
  findings: RenderFinding[],
): TemplateNode[] {
  const parsed = parseSegments(source, 0, templateId, findings, false);
  return parsed.nodes;
}

function parseSegments(
  source: string,
  startIndex: number,
  templateId: string,
  findings: RenderFinding[],
  stopAtEndif: boolean,
): { nodes: TemplateNode[]; nextIndex: number; closedByEndif: boolean } {
  const nodes: TemplateNode[] = [];
  let index = startIndex;
  while (index < source.length) {
    const open = source.indexOf("${", index);
    if (open === -1) {
      nodes.push({ kind: "text", value: source.slice(index) });
      return { nodes, nextIndex: source.length, closedByEndif: false };
    }
    if (open > index) {
      nodes.push({ kind: "text", value: source.slice(index, open) });
    }
    const close = source.indexOf("}", open + 2);
    if (close === -1) {
      const { line, column } = lineColumnFor(source, open);
      pushFinding(findings, {
        templateId,
        line,
        column,
        expression: source.slice(open),
        message: "unterminated placeholder",
      });
      nodes.push({
        kind: "text",
        value: inlineMarker(source.slice(open), "unterminated placeholder"),
      });
      return { nodes, nextIndex: source.length, closedByEndif: false };
    }
    const raw = source.slice(open + 2, close);
    const trimmed = raw.trim();
    const { line, column } = lineColumnFor(source, open);
    if (trimmed === "endif") {
      if (stopAtEndif) {
        return { nodes, nextIndex: close + 1, closedByEndif: true };
      }
      pushFinding(findings, {
        templateId,
        line,
        column,
        expression: trimmed,
        message: "unexpected endif",
      });
      nodes.push({ kind: "text", value: inlineMarker(trimmed, "unexpected endif") });
      index = close + 1;
      continue;
    }
    if (trimmed.startsWith("if:")) {
      const expression = trimmed.slice(3).trim();
      const inner = parseSegments(source, close + 1, templateId, findings, true);
      if (!inner.closedByEndif) {
        pushFinding(findings, {
          templateId,
          line,
          column,
          expression,
          message: "unclosed if block",
        });
        nodes.push({ kind: "text", value: inlineMarker(expression, "unclosed if block") });
        return { nodes, nextIndex: source.length, closedByEndif: false };
      }
      nodes.push({ kind: "if", expression, line, column, body: inner.nodes });
      index = inner.nextIndex;
      continue;
    }
    if (trimmed.startsWith("include:")) {
      nodes.push({
        kind: "include",
        templateRef: trimmed.slice("include:".length).trim(),
        line,
        column,
      });
      index = close + 1;
      continue;
    }
    nodes.push({ kind: "expr", expression: trimmed, line, column });
    index = close + 1;
  }
  return { nodes, nextIndex: index, closedByEndif: false };
}

function lineColumnFor(source: string, index: number): { line: number; column: number } {
  let line = 1;
  let lastLineStart = 0;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (source.charCodeAt(cursor) === 10) {
      line += 1;
      lastLineStart = cursor + 1;
    }
  }
  return {
    line,
    column: index - lastLineStart + 1,
  };
}

function pushFinding(findings: RenderFinding[], finding: Omit<RenderFinding, "kind">): void {
  findings.push({
    kind: "render-error",
    ...finding,
  });
}

function inlineMarker(expression: string, message: string): string {
  return `[[render-error: ${expression} :: ${message}]]`;
}

function stringifyRenderValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => stringifyRenderValue(item)).join("");
  }
  return JSON.stringify(value);
}

function truthy(value: unknown): boolean {
  return !!value;
}

function exprCode(err: unknown): string | undefined {
  if (
    err &&
    typeof err === "object" &&
    "expr_code" in err &&
    typeof (err as { expr_code?: unknown }).expr_code === "string"
  ) {
    return (err as { expr_code: string }).expr_code;
  }
  return undefined;
}

function assertNever(_value: never): never {
  throw new Error("unreachable");
}

export type { Project, ProjectTemplate };
