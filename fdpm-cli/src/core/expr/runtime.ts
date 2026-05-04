import { cpus } from "node:os";
import { serialize } from "@marcbachmann/cel-js";
import type {
  PrimitiveInstance,
  RelationInstance,
} from "../models/instance.js";
import type { PrimitiveTypeDef, DomainProfile } from "../models/meta.js";
import type { ProjectStateSlice } from "../store/state.js";
import { SPEC_CORE_VERSION } from "../version/spec.js";
import { createBaseEnvironment, createValidationActivationContext } from "./activation.js";
import {
  CELValidationError,
  CELParseError,
  CELRuntimeError,
} from "./errors.js";
import {
  assertHelperOutputStringCap,
  count,
  dateIso,
  dateLong,
  dateShort,
  hashValue,
  len,
  lower,
  plural,
  replace,
  slice,
  sortBy,
  title,
  trim,
  type ExprRuntimeHelperContext,
  upper,
} from "./helpers.js";
import {
  EXPR_CEL_REVISION,
  EXPR_HELPER_SET_VERSION,
  STANDARD_HELPER_IDS,
  type StandardHelperId,
} from "./std.js";
import { makeProjectValue, mapRelationToCEL, type ExprProjectValue } from "./types.js";

export interface ExprHelperRegistration {
  helperId: string;
  arity: number;
  fn: (...args: unknown[]) => unknown;
}

export interface ValidationEvaluationOptions {
  project?: ProjectStateSlice;
  projectFingerprint?: string;
  permissions?: ReadonlySet<string>;
  locale?: string;
  gitProbeDir?: string;
  gitProbe?: () => {
    sha: string | null;
    branch: string | null;
    dirty: boolean | null;
  };
  git?: {
    sha: string | null;
    branch: string | null;
    dirty: boolean | null;
  };
  osInfo?: {
    os: string | null;
    cpuCount: number | null;
  };
}

interface RegisteredExprHelper extends ExprHelperRegistration {
  pluginId: string;
  internalName: string;
}

interface CachedExpressionProgram {
  readonly program: ReturnType<ExpressionRuntime["env"]["parse"]>;
  readonly rewrittenExpression: string;
}

const HELPER_ID_RE = /^fn\.[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;
const SORT_BY_INTERNAL_NAME = "fdpm_expr_fn_sortBy";
const ITERATION_METHODS = new Set(["all", "exists", "exists_one", "map", "filter"]);
const EXPR_LIST_ITERATION_CAP = 1000;
const EXPR_OUTPUT_STRING_CAP = 65_536;

export class ExpressionRuntime {
  readonly helperSetVersion = EXPR_HELPER_SET_VERSION;
  readonly celRevision = EXPR_CEL_REVISION;

  private readonly env = createBaseEnvironment();
  private readonly envNow = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  private readonly defaultLocale = "en-US";
  private readonly programCache = new Map<string, CachedExpressionProgram>();
  private readonly standardHelpers = new Set<string>(STANDARD_HELPER_IDS);
  private readonly pluginHelpers = new Map<string, RegisteredExprHelper>();
  private currentHelperContext: ExprRuntimeHelperContext | null = null;

  constructor() {
    this.registerStandardHelpers();
  }

  evaluateValidationCEL(
    expression: string,
    instance: PrimitiveInstance,
    type: PrimitiveTypeDef,
    profile: DomainProfile,
    relations: readonly RelationInstance[],
    rule_id?: string,
    options?: ValidationEvaluationOptions,
  ): boolean {
    return !!this.evaluateValueCEL(
      expression,
      instance,
      type,
      profile,
      relations,
      rule_id,
      options,
    );
  }

  evaluateValueCEL(
    expression: string,
    instance: PrimitiveInstance,
    type: PrimitiveTypeDef,
    profile: DomainProfile,
    relations: readonly RelationInstance[],
    rule_id?: string,
    options?: ValidationEvaluationOptions,
  ): unknown {
    const cached = this.getOrCompileProgram(expression, rule_id);
    const context = this.createActivationContext(
      instance,
      type,
      profile,
      relations,
      rule_id,
      options,
    );
    try {
      this.assertIterationBounds(cached.program.ast, context.bindings, context.helperContext);
      const result = this.withHelperContext(context.helperContext, () =>
        cached.program(context.bindings),
      );
      return this.assertOutputBounds(result);
    } catch (err: any) {
      if (err instanceof CELParseError || err instanceof CELRuntimeError) throw err;
      throw this.classifyRuntimeFailure(err, rule_id);
    }
  }

  registerHelper(pluginId: string, reg: ExprHelperRegistration): void {
    if (!HELPER_ID_RE.test(reg.helperId)) {
      throw new Error(`invalid expr helper id: ${reg.helperId}`);
    }
    if (!reg.helperId.startsWith(`fn.${pluginId}.`)) {
      throw new Error(
        `expr helper ${reg.helperId} must be namespaced under fn.${pluginId}.*`,
      );
    }
    if (this.standardHelpers.has(reg.helperId) || this.pluginHelpers.has(reg.helperId)) {
      throw new Error(`expr helper already registered: ${reg.helperId}`);
    }
    const internalName = this.internalFunctionName(reg.helperId);
    this.env.registerFunction(this.signatureFor(internalName, reg.arity), reg.fn);
    this.pluginHelpers.set(reg.helperId, { ...reg, pluginId, internalName });
    this.programCache.clear();
  }

  unregisterPluginHelpers(pluginId: string): void {
    let changed = false;
    for (const [helperId, reg] of this.pluginHelpers.entries()) {
      if (reg.pluginId !== pluginId) continue;
      this.pluginHelpers.delete(helperId);
      changed = true;
    }
    if (changed) this.programCache.clear();
  }

  hasHelper(helperId: string): boolean {
    return this.standardHelpers.has(helperId) || this.pluginHelpers.has(helperId);
  }

  listHelperIds(): string[] {
    return [...this.standardHelpers, ...this.pluginHelpers.keys()].sort();
  }

  private rewriteExpression(expression: string): string {
    let rewritten = this.rewriteSortBy(expression);
    const helperIds = this.listHelperIds().sort((a, b) => b.length - a.length);
    for (const helperId of helperIds) {
      const internalName = this.standardHelpers.has(helperId)
        ? this.internalFunctionName(helperId)
        : this.pluginHelpers.get(helperId)?.internalName;
      if (!internalName) continue;
      const pattern = new RegExp(`${escapeRegExp(helperId)}(?=\\s*\\()`, "g");
      rewritten = rewritten.replace(pattern, internalName);
    }
    return rewritten;
  }

  private signatureFor(internalName: string, arity: number): string {
    const args = Array.from({ length: arity }, () => "dyn").join(", ");
    return `${internalName}(${args}): dyn`;
  }

  private internalFunctionName(helperId: string): string {
    return `fdpm_expr_${helperId.replace(/[^a-zA-Z0-9]/g, "_")}`;
  }

  private registerStandardHelpers(): void {
    this.registerStandardHelper("fn.upper", 1, (value) =>
      assertHelperOutputStringCap(upper(value), "fn.upper", this.requireHelperContext("fn.upper")),
    );
    this.registerStandardHelper("fn.lower", 1, (value) =>
      assertHelperOutputStringCap(lower(value), "fn.lower", this.requireHelperContext("fn.lower")),
    );
    this.registerStandardHelper("fn.title", 1, (value) =>
      assertHelperOutputStringCap(title(value), "fn.title", this.requireHelperContext("fn.title")),
    );
    this.registerStandardHelper("fn.trim", 1, (value) =>
      assertHelperOutputStringCap(trim(value), "fn.trim", this.requireHelperContext("fn.trim")),
    );
    this.registerStandardHelper("fn.slice", 2, (value, start) =>
      assertHelperOutputStringCap(
        slice(value, start),
        "fn.slice",
        this.requireHelperContext("fn.slice"),
      ),
    );
    this.registerStandardHelper("fn.slice", 3, (value, start, end) =>
      assertHelperOutputStringCap(
        slice(value, start, end),
        "fn.slice",
        this.requireHelperContext("fn.slice"),
      ),
    );
    this.registerStandardHelper("fn.replace", 3, (value, find, replacement) =>
      assertHelperOutputStringCap(
        replace(value, find, replacement),
        "fn.replace",
        this.requireHelperContext("fn.replace"),
      ),
    );
    this.registerStandardHelper("fn.len", 1, (value) => len(value));
    this.registerStandardHelper("fn.count", 1, (typeId) =>
      count(typeId, this.requireHelperContext("fn.count")),
    );
    this.registerStandardHelper("fn.sortBy", 3, (value, iterVar, keyExpr) =>
      sortBy(value, iterVar, keyExpr, this.requireHelperContext("fn.sortBy")),
    );
    this.registerStandardHelper("fn.plural", 2, (countValue, singular) =>
      assertHelperOutputStringCap(
        plural(countValue, singular),
        "fn.plural",
        this.requireHelperContext("fn.plural"),
      ),
    );
    this.registerStandardHelper("fn.plural", 3, (countValue, singular, pluralForm) =>
      assertHelperOutputStringCap(
        plural(countValue, singular, pluralForm),
        "fn.plural",
        this.requireHelperContext("fn.plural"),
      ),
    );
    this.registerStandardHelper("fn.date.short", 1, (value) =>
      assertHelperOutputStringCap(
        dateShort(value),
        "fn.date.short",
        this.requireHelperContext("fn.date.short"),
      ),
    );
    this.registerStandardHelper("fn.date.long", 1, (value) =>
      assertHelperOutputStringCap(
        dateLong(value, this.requireHelperContext("fn.date.long")),
        "fn.date.long",
        this.requireHelperContext("fn.date.long"),
      ),
    );
    this.registerStandardHelper("fn.date.iso", 1, (value) =>
      assertHelperOutputStringCap(
        dateIso(value),
        "fn.date.iso",
        this.requireHelperContext("fn.date.iso"),
      ),
    );
    this.registerStandardHelper("fn.hash", 1, (value) =>
      assertHelperOutputStringCap(
        hashValue(value),
        "fn.hash",
        this.requireHelperContext("fn.hash"),
      ),
    );
  }

  private registerStandardHelper(
    helperId: StandardHelperId,
    arity: number,
    fn: (...args: unknown[]) => unknown,
  ): void {
    this.env.registerFunction(this.signatureFor(this.internalFunctionName(helperId), arity), fn);
  }

  private createActivationContext(
    instance: PrimitiveInstance,
    type: PrimitiveTypeDef,
    profile: DomainProfile,
    relations: readonly RelationInstance[],
    rule_id?: string,
    options?: ValidationEvaluationOptions,
  ): {
    bindings: ReturnType<typeof createValidationActivationContext>;
    helperContext: ExprRuntimeHelperContext;
  } {
    const project = options?.project
      ? makeProjectValue(options.project, options.projectFingerprint ?? "")
      : this.defaultProject(profile, relations);
    const bindings = createValidationActivationContext(instance, type, profile, relations, {
      project,
      host: {
        fdpmVersion: SPEC_CORE_VERSION,
        helperSetVersion: this.helperSetVersion,
        celRevision: this.celRevision,
      },
      env: {
        now: this.envNow,
        locale: options?.locale ?? this.defaultLocale,
      },
      permissions: options?.permissions,
      git: options?.git,
      gitProbeDir: options?.gitProbeDir,
      gitProbe: options?.gitProbe,
      osInfo: options?.osInfo ?? {
        os: process.platform,
        cpuCount: cpus().length,
      },
    });
    const helperContext: ExprRuntimeHelperContext = {
      projectPrimitiveCountByType: primitiveCountByType(project),
      locale: options?.locale ?? this.defaultLocale,
      listIterationCap: EXPR_LIST_ITERATION_CAP,
      outputStringCap: EXPR_OUTPUT_STRING_CAP,
      evaluateSortByKey: (iterVar, keyExpr, item) =>
        this.evaluateSortByKeyExpression(iterVar, keyExpr, item, bindings, rule_id),
    };
    return {
      helperContext,
      bindings,
    };
  }

  private defaultProject(
    profile: DomainProfile,
    relations: readonly RelationInstance[],
  ): ExprProjectValue {
    return {
      id: "",
      profile_id: profile.id,
      revision: 0,
      fingerprint: "",
      primitives: [],
      relations: relations.map((relation) => mapRelationToCEL(relation)),
    };
  }

  private withHelperContext<T>(helperContext: ExprRuntimeHelperContext, fn: () => T): T {
    const previous = this.currentHelperContext;
    this.currentHelperContext = helperContext;
    try {
      return fn();
    } finally {
      this.currentHelperContext = previous;
    }
  }

  private requireHelperContext(helperId: string): ExprRuntimeHelperContext {
    if (!this.currentHelperContext) {
      throw new Error(`runtime-error: ${helperId} called without evaluation context`);
    }
    return this.currentHelperContext;
  }

  private getOrCompileProgram(expression: string, rule_id?: string): CachedExpressionProgram {
    this.assertHelperReferences(expression, rule_id);
    const rewrittenExpression = this.rewriteExpression(expression);
    const cached = this.programCache.get(rewrittenExpression);
    if (cached) return cached;

    try {
      const program = this.env.parse(rewrittenExpression);
      const checkResult = program.check();
      if (!checkResult.valid) {
        throw this.classifyCheckFailure(checkResult.error, expression, rule_id);
      }
      const compiled = { program, rewrittenExpression };
      this.programCache.set(rewrittenExpression, compiled);
      return compiled;
    } catch (err: any) {
      if (err instanceof CELParseError || err instanceof CELRuntimeError) throw err;
      throw this.classifyParseFailure(err, rule_id);
    }
  }

  private assertHelperReferences(expression: string, rule_id?: string): void {
    for (const helperId of extractHelperIds(expression)) {
      if (!this.hasHelper(helperId)) {
        throw new CELRuntimeError(
          "unknown-helper",
          `unknown helper: ${helperId}`,
          rule_id,
        );
      }
    }
  }

  private classifyParseFailure(err: any, rule_id?: string): CELValidationError {
    const message = normalizeErrorMessage(err);
    if (message.includes("maxDepth") || message.includes("max depth")) {
      return new CELRuntimeError("bound-exceeded", message, rule_id);
    }
    if (message.includes("maxCallArguments") || message.includes("max call arguments")) {
      return new CELRuntimeError("bound-exceeded", message, rule_id);
    }
    if (message.startsWith("bound-exceeded:")) {
      return new CELRuntimeError("bound-exceeded", message, rule_id);
    }
    return new CELParseError(message, rule_id, "parse-error");
  }

  private classifyCheckFailure(
    err: any,
    expression: string,
    rule_id?: string,
  ): CELValidationError {
    const message = normalizeErrorMessage(err);
    const code = err?.code as string | undefined;
    if (code === "unknown_variable") {
      const unknown = unknownVariableFromMessage(message);
      if (unknown === "fn" || unknown?.startsWith("fdpm_expr_")) {
        const helperId = firstHelperId(expression);
        return new CELRuntimeError(
          "unknown-helper",
          helperId ? `unknown helper: ${helperId}` : message,
          rule_id,
        );
      }
      return new CELRuntimeError("unknown-name", message, rule_id);
    }
    if (code === "no_matching_overload") {
      return new CELRuntimeError("arity-error", message, rule_id);
    }
    if (code === "no_such_overload" || code === "field_type_mismatch") {
      return new CELRuntimeError("type-error", message, rule_id);
    }
    return new CELRuntimeError("runtime-error", message, rule_id);
  }

  private classifyRuntimeFailure(err: any, rule_id?: string): CELRuntimeError {
    const message = normalizeErrorMessage(err);
    if (message.startsWith("permission-denied:")) {
      return new CELRuntimeError("permission-denied", message, rule_id);
    }
    if (message.startsWith("bound-exceeded:")) {
      return new CELRuntimeError("bound-exceeded", message, rule_id);
    }
    if (message.startsWith("type-error:")) {
      return new CELRuntimeError("type-error", message, rule_id);
    }
    return new CELRuntimeError("runtime-error", message, rule_id);
  }

  private evaluateSortByKeyExpression(
    iterVar: string,
    keyExpr: string,
    item: unknown,
    bindings: ReturnType<typeof createValidationActivationContext>,
    rule_id?: string,
  ): unknown {
    this.assertHelperReferences(keyExpr, rule_id);
    const rewrittenExpression = this.rewriteExpression(keyExpr);
    const scopedEnv = this.env.clone();
    scopedEnv.registerVariable(iterVar, "dyn");
    let program: ReturnType<typeof scopedEnv.parse>;
    try {
      program = scopedEnv.parse(rewrittenExpression);
      const checkResult = program.check();
      if (!checkResult.valid) {
        throw this.classifyCheckFailure(checkResult.error, keyExpr, rule_id);
      }
    } catch (err: any) {
      if (err instanceof CELParseError || err instanceof CELRuntimeError) throw err;
      throw this.classifyParseFailure(err, rule_id);
    }
    return this.withHelperContext(this.requireHelperContext("fn.sortBy"), () =>
      program({ ...bindings, [iterVar]: item }),
    );
  }

  private assertIterationBounds(
    ast: any,
    bindings: ReturnType<typeof createValidationActivationContext>,
    helperContext: ExprRuntimeHelperContext,
  ): void {
    walkAst(ast, (node) => {
      if (node.op === "rcall" && ITERATION_METHODS.has(node.args[0])) {
        const receiver = node.args[1];
        const items = this.evaluateSubexpression(receiver, bindings, helperContext);
        const size = collectionSize(items);
        if (size > EXPR_LIST_ITERATION_CAP) {
          throw new Error(
            `bound-exceeded: ${node.args[0]} iteration cap ${EXPR_LIST_ITERATION_CAP} exceeded (${size})`,
          );
        }
      }
      if (node.op === "call" && node.args[0] === SORT_BY_INTERNAL_NAME) {
        const items = this.evaluateSubexpression(node.args[1][0], bindings, helperContext);
        const size = collectionSize(items);
        if (size > EXPR_LIST_ITERATION_CAP) {
          throw new Error(
            `bound-exceeded: fn.sortBy iteration cap ${EXPR_LIST_ITERATION_CAP} exceeded (${size})`,
          );
        }
      }
    });
  }

  private evaluateSubexpression(
    ast: any,
    bindings: ReturnType<typeof createValidationActivationContext>,
    helperContext: ExprRuntimeHelperContext,
  ): unknown {
    this.assertIterationBounds(ast, bindings, helperContext);
    const program = this.getOrCompileProgram(serialize(ast)).program;
    return this.withHelperContext(helperContext, () => program(bindings));
  }

  private assertOutputBounds(value: unknown): unknown {
    if (typeof value !== "string") return value;
    if (Array.from(value).length <= EXPR_OUTPUT_STRING_CAP) return value;
    throw new Error(
      `bound-exceeded: expression output string cap ${EXPR_OUTPUT_STRING_CAP} exceeded`,
    );
  }

  private rewriteSortBy(expression: string): string {
    let rewritten = expression;
    const needle = "fn.sortBy(";
    let start = rewritten.indexOf(needle);
    while (start !== -1) {
      const open = start + needle.length - 1;
      const close = findClosingParen(rewritten, open);
      if (close === -1) break;
      const args = splitArgs(rewritten.slice(open + 1, close));
      if (args.length === 3 && args[1] && args[2] && isIdentifier(args[1])) {
        const replacement =
          `fn.sortBy(${args[0]!}, ${JSON.stringify(args[1].trim())}, ${JSON.stringify(args[2].trim())})`;
        rewritten = `${rewritten.slice(0, start)}${replacement}${rewritten.slice(close + 1)}`;
        start = rewritten.indexOf(needle, start + replacement.length);
        continue;
      }
      start = rewritten.indexOf(needle, close + 1);
    }
    return rewritten;
  }
}

export const defaultExpressionRuntime = new ExpressionRuntime();

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function primitiveCountByType(project: ExprProjectValue): Map<string, number> {
  const out = new Map<string, number>();
  for (const primitive of project.primitives) {
    out.set(primitive.type_id, (out.get(primitive.type_id) ?? 0) + 1);
  }
  return out;
}

function findClosingParen(source: string, openIndex: number): number {
  let depth = 0;
  let inString: "'" | '"' | null = null;
  let escaped = false;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index]!;
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === inString) inString = null;
      continue;
    }
    if (char === "'" || char === '"') {
      inString = char;
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function splitArgs(source: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let inString: "'" | '"' | null = null;
  let escaped = false;
  let current = "";
  for (const char of source) {
    if (inString) {
      current += char;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === inString) inString = null;
      continue;
    }
    if (char === "'" || char === '"') {
      inString = char;
      current += char;
      continue;
    }
    if (char === "(" || char === "[" || char === "{") depth += 1;
    if (char === ")" || char === "]" || char === "}") depth -= 1;
    if (char === "," && depth === 0) {
      args.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim().length > 0) args.push(current.trim());
  return args;
}

function isIdentifier(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value.trim());
}

function normalizeErrorMessage(err: any): string {
  if (err instanceof Error && typeof err.message === "string") return err.message;
  return String(err);
}

function extractHelperIds(expression: string): string[] {
  const matches = expression.match(/\bfn\.[a-z0-9-]+(?:\.[a-z0-9-]+)+(?=\s*\()/g);
  return matches ? [...new Set(matches)] : [];
}

function firstHelperId(expression: string): string | null {
  return extractHelperIds(expression)[0] ?? null;
}

function unknownVariableFromMessage(message: string): string | null {
  const match = message.match(/Unknown variable:\s+([A-Za-z0-9_]+)/);
  return match?.[1] ?? null;
}

function walkAst(ast: any, visit: (node: any) => void): void {
  visit(ast);
  switch (ast?.op) {
    case ".":
    case ".?":
      walkAst(ast.args[0], visit);
      return;
    case "[]":
    case "[?]":
    case "&&":
    case "||":
    case "==":
    case "!=":
    case "in":
    case "+":
    case "-":
    case "*":
    case "/":
    case "%":
    case "<":
    case "<=":
    case ">":
    case ">=":
      walkAst(ast.args[0], visit);
      walkAst(ast.args[1], visit);
      return;
    case "!_":
    case "-_":
      walkAst(ast.args, visit);
      return;
    case "?:":
      walkAst(ast.args[0], visit);
      walkAst(ast.args[1], visit);
      walkAst(ast.args[2], visit);
      return;
    case "call":
      for (const arg of ast.args[1]) walkAst(arg, visit);
      return;
    case "rcall":
      walkAst(ast.args[1], visit);
      for (const arg of ast.args[2]) walkAst(arg, visit);
      return;
    case "list":
      for (const arg of ast.args) walkAst(arg, visit);
      return;
    case "map":
      for (const [key, value] of ast.args) {
        walkAst(key, visit);
        walkAst(value, visit);
      }
      return;
  }
}

function collectionSize(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value instanceof Set || value instanceof Map) return value.size;
  return 0;
}
