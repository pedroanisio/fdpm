/**
 * Evaluate a stage output against its lf:OutputContract and the
 * lf:OutputValidator records attached to it.
 *
 * ARCHITECTURAL REQUIREMENT: LLMs will always produce some form of error.
 * Absence of output verification is a design defect, not a runtime bug.
 * All LLM output must be treated as untrusted and validated explicitly.
 *
 * Order: typed parse (one JSON document, the contract's schema), then every
 * validator in position order, reporting all failures rather than the first.
 * A named validator the registry does not implement throws — it never
 * passes — because the alternative is a receipt that records a check nobody
 * ran.
 */
import { Ajv, type ValidateFunction } from "ajv";
import { failure, type CheckFailure } from "./checks/repo.js";
import { requireValidator, type NamedValidator, type StageContext } from "./named.js";
import { resolvePointer } from "./pointer.js";

export interface ValidatorDef {
  position: number;
  kind: "regex" | "range" | "named";
  path?: string;
  pattern?: string;
  min?: number;
  max?: number;
  validator_name?: string;
  /** Serialized JSON object. */
  args?: string;
}

export interface ContractDef {
  format: "text" | "markdown" | "json";
  json_schema?: string;
  on_invalid: "fail" | "retry";
  max_attempts?: number;
  retry_feedback?: string;
  validators: ValidatorDef[];
}

export interface ContractResult {
  ok: boolean;
  failures: CheckFailure[];
  /** The parsed output when the typed parse succeeded (text formats: the trimmed string). */
  value?: unknown;
}

const ajv = new Ajv({ allErrors: true, strict: false });
const compiled = new WeakMap<ContractDef, ValidateFunction>();

function schemaFor(contract: ContractDef): ValidateFunction | undefined {
  if (contract.json_schema === undefined) return undefined;
  const cached = compiled.get(contract);
  if (cached) return cached;
  const fn = ajv.compile(JSON.parse(contract.json_schema));
  compiled.set(contract, fn);
  return fn;
}

const CHECK = "lf.output_contract";

export function typedParse(text: string, contract: ContractDef): ContractResult {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: false, failures: [failure(CHECK, "ERR_TRUNCATION", "The output is empty.")] };
  if (contract.format !== "json") return { ok: true, failures: [], value: trimmed };

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const truncated = /unexpected end of|unterminated/i.test(message);
    return { ok: false, failures: [failure(CHECK, truncated ? "ERR_TRUNCATION" : "ERR_SCHEMA", `The output is not one JSON document: ${message}`)] };
  }
  const validate = schemaFor(contract);
  if (validate && !validate(parsed)) {
    const detail = (validate.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message ?? "invalid"}`).join("; ");
    const missing = (validate.errors ?? []).some((e) => e.keyword === "required");
    return { ok: false, failures: [failure(CHECK, missing ? "ERR_OMISSION" : "ERR_SCHEMA", `The output does not satisfy the contract schema: ${detail}`)], value: parsed };
  }
  return { ok: true, failures: [], value: parsed };
}

function runRegex(def: ValidatorDef, value: unknown): CheckFailure[] {
  const check = `lf.regex@${def.position}`;
  if (def.path === undefined || def.pattern === undefined) return [failure(check, "ERR_SCHEMA", "regex validator needs path and pattern")];
  const re = new RegExp(def.pattern);
  const found = resolvePointer(value, def.path);
  if (found.length === 0) return [failure(check, "ERR_OMISSION", `Nothing at ${def.path} to match ${def.pattern}.`)];
  return found
    .filter((v) => typeof v !== "string" || !re.test(v))
    .map((v) => failure(check, "ERR_INSTRUCTION", `${def.path} = ${JSON.stringify(v)} does not match ${def.pattern}.`));
}

function runRange(def: ValidatorDef, value: unknown): CheckFailure[] {
  const check = `lf.range@${def.position}`;
  if (def.path === undefined) return [failure(check, "ERR_SCHEMA", "range validator needs path")];
  const found = resolvePointer(value, def.path);
  if (found.length === 0) return [failure(check, "ERR_OMISSION", `Nothing at ${def.path} to bound.`)];
  return found
    .filter((v) => typeof v !== "number" || Number.isNaN(v) || (def.min !== undefined && v < def.min) || (def.max !== undefined && v > def.max))
    .map((v) => failure(check, "ERR_SCHEMA", `${def.path} = ${JSON.stringify(v)} is outside [${def.min ?? "-∞"}, ${def.max ?? "∞"}].`));
}

/**
 * Typed parse, then every validator. The context's `output` is replaced with
 * the parsed value so named validators address the parsed document.
 */
export async function evaluateContract(
  text: string,
  contract: ContractDef,
  ctx: Omit<StageContext, "output">,
  registry?: ReadonlyMap<string, NamedValidator>,
): Promise<ContractResult> {
  const parsed = typedParse(text, contract);
  if (!parsed.ok) return parsed;
  const value = parsed.value;
  const stageCtx: StageContext = { ...ctx, output: value };
  const failures: CheckFailure[] = [];
  for (const def of [...contract.validators].sort((a, b) => a.position - b.position)) {
    if (def.kind === "regex") failures.push(...runRegex(def, value));
    else if (def.kind === "range") failures.push(...runRange(def, value));
    else {
      const name = def.validator_name ?? "";
      const validator = requireValidator(name, registry);
      const args = def.args === undefined ? {} : (JSON.parse(def.args) as Record<string, unknown>);
      // A multi-mode stage attaches validators that only make sense under one
      // mode; `applies_to_mode` scopes them. A validator with no such arg
      // always runs — the default is to check, not to skip.
      const appliesTo = args["applies_to_mode"];
      if (typeof appliesTo === "string" && ctx.mode !== undefined && ctx.mode !== appliesTo) continue;
      failures.push(...(await validator(args, stageCtx)).map((f) => ({ ...f, check: `${name}@${def.position}` })));
    }
  }
  return { ok: failures.length === 0, failures, value };
}
