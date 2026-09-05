/**
 * Named validators: the `kind: "named"` arm of lf:OutputValidator, resolved
 * by `validator_name` at run time.
 *
 * ARCHITECTURAL REQUIREMENT: LLMs will always produce some form of error.
 * Absence of output verification is a design defect, not a runtime bug.
 * All LLM output must be treated as untrusted and validated explicitly.
 *
 * A pipeline record that names a validator this registry does not know is a
 * hard error at contract time, never a pass: a check that cannot run has not
 * run, and an output it did not inspect has not crossed the boundary.
 *
 * Two families live here. `fpl.*` are the frontier-proof loop's verifiers —
 * artifact execution, reference resolution, workbook read-backs, the producer
 * status guard, the evidence-bundle manifest. `cdel.*` are the Codex
 * delegation checks, re-run by the executor over the wrapper's envelope so a
 * receipt records what the executor observed, not what the wrapper claimed.
 */
import { Ajv, type ValidateFunction } from "ajv";
import type { Host } from "../core/host.js";
import { runArtifact, type ArtifactKind, type RunOptions, type RunResult, type Runners } from "./checks/artifact.js";
import { manifestRoot } from "./checks/manifest.js";
import { checkReference, httpFetcher, type Fetcher } from "./checks/reference.js";
import {
  diffApplies,
  failure,
  noGitMutation,
  pathsExist,
  quotesMatch,
  resolveInsideRepo,
  type CheckFailure,
  type GitSnapshot,
  type Quote,
} from "./checks/repo.js";
import { pointerValue, resolvePointer } from "./pointer.js";

/** Side-effect boundaries a validator may cross, injected so tests stay deterministic. */
export interface ValidatorIO {
  fetch: Fetcher;
  runArtifact: (opts: RunOptions) => Promise<RunResult>;
  /** The lake project root that supplies mathlib to `lake env lean`. */
  leanProjectDir?: string;
  /** Where artifact files are written for execution; defaults to the OS temp dir. */
  artifactScratchDir?: string;
  artifactTimeoutMs: number;
}

export function productionIO(overrides: Partial<ValidatorIO> = {}): ValidatorIO {
  return { fetch: httpFetcher(), runArtifact, artifactTimeoutMs: 300_000, ...overrides };
}

export interface StageContext {
  /** The parsed stage output under validation. */
  output: unknown;
  /** Outputs of earlier stages this iteration, by stage name. */
  stageOutputs: ReadonlyMap<string, unknown>;
  /** Pipeline inputs by variable name. */
  inputs: Readonly<Record<string, unknown>>;
  /** The workbook the pipeline lives in; validators that read pipeline records use it. */
  workbookId: string;
  host: Host;
  /** Repository root for path checks. */
  repoRoot: string;
  /** Facts the stage driver captured around the run (git snapshots, wrapper verdicts). */
  evidence: Readonly<Record<string, unknown>>;
  /** For validators that apply to one mode of a multi-mode stage. */
  mode?: string;
  io: ValidatorIO;
}

export type NamedValidator = (args: Readonly<Record<string, unknown>>, ctx: StageContext) => Promise<CheckFailure[]>;

export class UnknownValidatorError extends Error {
  constructor(readonly validatorName: string) {
    super(`no implementation is registered for named validator ${JSON.stringify(validatorName)}; an output it did not inspect has not crossed the boundary`);
    this.name = "UnknownValidatorError";
  }
}

// ── arg helpers ────────────────────────────────────────────────────────────

class ArgError extends Error {
  constructor(validator: string, message: string) {
    super(`${validator}: ${message}`);
    this.name = "ArgError";
  }
}

const str = (v: string, args: Readonly<Record<string, unknown>>, key: string): string => {
  const value = args[key];
  if (typeof value !== "string" || value === "") throw new ArgError(v, `args.${key} must be a non-empty string`);
  return value;
};
const strOpt = (args: Readonly<Record<string, unknown>>, key: string): string | undefined => (typeof args[key] === "string" ? (args[key] as string) : undefined);
const strList = (v: string, args: Readonly<Record<string, unknown>>, key: string): string[] => {
  const value = args[key];
  if (!Array.isArray(value) || !value.every((x) => typeof x === "string")) throw new ArgError(v, `args.${key} must be a list of strings`);
  return value as string[];
};
const strings = (values: unknown[]): string[] => values.filter((x): x is string => typeof x === "string");
const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

function projectOrFailure(check: string, host: Host, workbookId: string): { slice?: ReturnType<Host["getProject"]>; failures: CheckFailure[] } {
  try {
    return { slice: host.getProject(workbookId), failures: [] };
  } catch {
    return { failures: [failure(check, "ERR_HALLUCINATION", `Workbook ${JSON.stringify(workbookId)} does not exist.`)] };
  }
}

// ── fpl.* ──────────────────────────────────────────────────────────────────

const nodeExistsInWorkbook: NamedValidator = async (args, ctx) => {
  const v = "fpl.node_exists_in_workbook";
  const workbookId = String(ctx.inputs[str(v, args, "workbook_input")] ?? "");
  const typeId = str(v, args, "type_id");
  const id = pointerValue(ctx.output, str(v, args, "path"));
  if (typeof id !== "string") return [failure(v, "ERR_SCHEMA", `No string at ${String(args["path"])}.`)];
  const { slice, failures } = projectOrFailure(v, ctx.host, workbookId);
  if (!slice) return failures;
  const node = slice.primitives[id];
  if (!node) return [failure(v, "ERR_HALLUCINATION", `${id} does not exist in workbook ${workbookId}.`)];
  if (node.type_id !== typeId) return [failure(v, "ERR_HALLUCINATION", `${id} is a ${node.type_id}, not a ${typeId}.`)];
  return [];
};

const RUN_CLEAN_STATUSES = new Set(["proved", "computed", "refuted"]);

export function parseRunners(v: string, raw: unknown): Partial<Runners> {
  const map = record(raw);
  if (!map) return {};
  const out: Partial<Runners> = {};
  for (const [kind, cmd] of Object.entries(map)) {
    if (kind !== "lean4" && kind !== "cas" && kind !== "python") continue;
    const argv = typeof cmd === "string" ? cmd.trim().split(/\s+/) : Array.isArray(cmd) ? strings(cmd) : [];
    if (argv.length === 0) throw new ArgError(v, `runners.${kind} is empty`);
    if (!argv[0]!.startsWith("/") && kind === "cas") {
      // `gp` is aliased to `git push` in this repository's interactive shell.
      // A relative runner name is exactly how that alias would be inherited.
      throw new ArgError(v, `runners.cas must be an absolute path, got ${JSON.stringify(argv[0])}`);
    }
    out[kind] = argv;
  }
  return out;
}

export interface ArtifactClaim {
  kind: unknown;
  artifact: unknown;
  status: unknown;
}

/**
 * The verdict on a formal artifact: shared by the fpl.formal_artifact_check
 * validator and the delegation wrapper, so the two cannot disagree about what
 * "computed" requires.
 */
export async function artifactVerdict(
  claim: ArtifactClaim,
  io: ValidatorIO,
  repoRoot: string,
  proseAllowed: readonly string[],
  runners: Partial<Runners> = {},
  check = "fpl.formal_artifact_check",
): Promise<CheckFailure[]> {
  const { kind, artifact, status } = claim;
  if (typeof kind !== "string" || typeof artifact !== "string" || typeof status !== "string") {
    return [failure(check, "ERR_SCHEMA", "artifact_kind, artifact and status must all be strings.")];
  }
  if (kind === "prose") {
    return proseAllowed.includes(status)
      ? []
      : [failure(check, "ERR_INSTRUCTION", `artifact_kind "prose" is allowed only with status ${proseAllowed.join("|")}; a ${status} step needs an artifact a machine can check.`)];
  }
  if (kind !== "lean4" && kind !== "cas" && kind !== "python") {
    return [failure(check, "ERR_SCHEMA", `Unknown artifact_kind ${JSON.stringify(kind)}.`)];
  }
  const cwd = kind === "lean4" ? io.leanProjectDir : repoRoot;
  if (cwd === undefined) return [failure(check, "ERR_SEMANTIC", "No Lean project is configured, so a lean4 artifact cannot be checked; it is not established.")];
  const result = await io.runArtifact({ kind: kind as Exclude<ArtifactKind, "prose">, artifact, cwd, timeoutMs: io.artifactTimeoutMs, runners, ...(io.artifactScratchDir ? { scratchDir: io.artifactScratchDir } : {}) });
  const tail = (s: string): string => (s.length > 400 ? `…${s.slice(-400)}` : s);
  if (result.timed_out) {
    return RUN_CLEAN_STATUSES.has(status)
      ? [failure(check, "ERR_SEMANTIC", `The artifact did not finish within ${io.artifactTimeoutMs} ms; a ${status} status is not established by a run that was cut off.`)]
      : [];
  }
  if (!RUN_CLEAN_STATUSES.has(status)) return [];
  if (result.exit_code !== 0) {
    return [failure(check, "ERR_HALLUCINATION", `status is ${status} but the ${kind} artifact exited ${result.exit_code}: ${tail(result.stderr || result.stdout)}`)];
  }
  const runtimeError = runtimeErrorIn(kind, result);
  if (runtimeError !== undefined) {
    return [failure(check, "ERR_HALLUCINATION", `status is ${status} but the ${kind} runner reported an error and exit 0 does not establish the claim: ${runtimeError}`)];
  }
  return [];
}

/**
 * Some runners exit 0 after an error. PARI/GP prints `  ***` diagnostics,
 * skips the rest of the file, and still exits 0 at `quit`, so a script whose
 * every check errored can print a stale `1` and pass an exit-code test. The
 * exit status is necessary, not sufficient; the runner's own error markers
 * are checked as well.
 */
export function runtimeErrorIn(kind: string, result: RunResult): string | undefined {
  const text = `${result.stderr}\n${result.stdout}`;
  if (kind === "cas") {
    const line = text.split("\n").find((l) => /^\s*\*\*\*/.test(l) || /skipping file/.test(l));
    if (line !== undefined) return line.trim();
  }
  if (kind === "lean4") {
    const line = text.split("\n").find((l) => /:\d+:\d+: error:/.test(l));
    if (line !== undefined) return line.trim();
  }
  return undefined;
}

/** The verdict on a list of references, shared with the delegation wrapper. */
export async function referencesVerdict(refs: unknown, locatorField: string, titleField: string, fetch: Fetcher, check = "fpl.reference_resolves"): Promise<CheckFailure[]> {
  if (refs === undefined) return [];
  if (!Array.isArray(refs)) return [failure(check, "ERR_SCHEMA", "references is not a list.")];
  const failures: CheckFailure[] = [];
  for (const ref of refs) {
    const row = record(ref);
    const locator = row?.[locatorField];
    const title = row?.[titleField];
    if (typeof locator !== "string" || typeof title !== "string") {
      failures.push(failure(check, "ERR_SCHEMA", "A reference must carry a string locator and a string title."));
      continue;
    }
    const verdict = await checkReference({ locator, title }, fetch);
    if (!verdict.ok) failures.push(failure(check, "ERR_HALLUCINATION", `Reference does not resolve: ${locator} (${verdict.reason ?? "unknown"}).`));
    else if (!verdict.matches) failures.push(failure(check, "ERR_HALLUCINATION", `Reference ${locator} resolves to ${JSON.stringify(verdict.found_title)}, not to the cited ${JSON.stringify(title)}.`));
  }
  return failures;
}

const formalArtifactCheck: NamedValidator = async (args, ctx) => {
  const v = "fpl.formal_artifact_check";
  return artifactVerdict(
    { kind: pointerValue(ctx.output, str(v, args, "kind_path")), artifact: pointerValue(ctx.output, str(v, args, "artifact_path")), status: pointerValue(ctx.output, str(v, args, "status_path")) },
    ctx.io,
    ctx.repoRoot,
    strList(v, args, "prose_allowed_for"),
    parseRunners(v, args["runners"]),
    v,
  );
};

const referenceResolves: NamedValidator = async (args, ctx) => {
  const v = "fpl.reference_resolves";
  return referencesVerdict(pointerValue(ctx.output, str(v, args, "path")), str(v, args, "locator_field"), str(v, args, "title_field"), ctx.io.fetch, v);
};

const errorClassVocabulary: NamedValidator = async (args, ctx) => {
  const v = "fpl.error_class_vocabulary";
  const field = str(v, args, "field");
  const allowed = new Set(strList(v, args, "allowed"));
  const items = pointerValue(ctx.output, str(v, args, "path"));
  if (items === undefined) return [];
  if (!Array.isArray(items)) return [failure(v, "ERR_SCHEMA", `${String(args["path"])} is not a list.`)];
  return items
    .map((item) => record(item)?.[field])
    .filter((cls) => typeof cls !== "string" || !allowed.has(cls))
    .map((cls) => failure(v, "ERR_INSTRUCTION", `${JSON.stringify(cls)} is not one of the declared error classes.`));
};

interface WrittenRecord {
  workbook_id: string;
  id: string;
  type_id: string;
}
function writtenRecords(v: string, ctx: StageContext, path: string): { rows: WrittenRecord[]; failures: CheckFailure[] } {
  const raw = pointerValue(ctx.output, path);
  if (raw === undefined) return { rows: [], failures: [] };
  if (!Array.isArray(raw)) return { rows: [], failures: [failure(v, "ERR_SCHEMA", `${path} is not a list.`)] };
  const rows: WrittenRecord[] = [];
  const failures: CheckFailure[] = [];
  for (const item of raw) {
    const r = record(item);
    if (r && typeof r["workbook_id"] === "string" && typeof r["id"] === "string" && typeof r["type_id"] === "string") {
      rows.push({ workbook_id: r["workbook_id"], id: r["id"], type_id: r["type_id"] });
    } else {
      failures.push(failure(v, "ERR_SCHEMA", "Each written entry needs workbook_id, id and type_id."));
    }
  }
  return { rows, failures };
}

const writtenIdsExist: NamedValidator = async (args, ctx) => {
  const v = "fpl.written_ids_exist";
  const { rows, failures } = writtenRecords(v, ctx, str(v, args, "path"));
  for (const row of rows) {
    const project = projectOrFailure(v, ctx.host, row.workbook_id);
    if (!project.slice) {
      failures.push(...project.failures);
      continue;
    }
    const prim = project.slice.primitives[row.id];
    if (!prim) failures.push(failure(v, "ERR_HALLUCINATION", `${row.id} was reported written but does not exist in ${row.workbook_id}.`));
    else if (prim.type_id !== row.type_id) failures.push(failure(v, "ERR_HALLUCINATION", `${row.id} is a ${prim.type_id}, reported as ${row.type_id}.`));
  }
  const when = record(args["require_nonempty_when"]);
  if (when && typeof when["stage"] === "string" && typeof when["path"] === "string") {
    const upstream = ctx.stageOutputs.get(when["stage"]);
    if (upstream !== undefined && pointerValue(upstream, when["path"]) === when["equals"] && rows.length === 0) {
      failures.push(failure(v, "ERR_OMISSION", `The ${when["stage"]} stage said ${JSON.stringify(when["equals"])} but nothing was written.`));
    }
  }
  return failures;
};

const producerStatusGuard: NamedValidator = async (args, ctx) => {
  const v = "fpl.producer_status_guard";
  const { rows, failures } = writtenRecords(v, ctx, str(v, args, "path"));
  const forbidden = record(args["forbidden"]) ?? {};
  const forbiddenTypes = new Set(Array.isArray(args["forbidden_types"]) ? strings(args["forbidden_types"] as unknown[]) : []);
  for (const row of rows) {
    if (forbiddenTypes.has(row.type_id)) {
      failures.push(failure(v, "ERR_INSTRUCTION", `A producer wrote a ${row.type_id} (${row.id}); that type is reserved for the acceptance authority.`));
      continue;
    }
    const project = projectOrFailure(v, ctx.host, row.workbook_id);
    const prim = project.slice?.primitives[row.id];
    if (!prim) continue; // reported by fpl.written_ids_exist
    const rules = record(forbidden[prim.type_id]);
    if (!rules) continue;
    for (const [field, values] of Object.entries(rules)) {
      const banned = Array.isArray(values) ? strings(values) : [];
      const actual = prim.field_values[field];
      if (typeof actual === "string" && banned.includes(actual)) {
        failures.push(failure(v, "ERR_INSTRUCTION", `${row.id} carries ${field}=${actual}, a verdict only the acceptance authority may write.`));
      }
    }
  }
  return failures;
};

const evidenceBundleManifest: NamedValidator = async (args, ctx) => {
  const v = "fpl.evidence_bundle_manifest";
  const bundle = pointerValue(ctx.output, str(v, args, "path"));
  if (bundle === null || bundle === undefined) return [];
  const row = record(bundle);
  if (!row || typeof row["manifest_root"] !== "string" || typeof row["bundle_path"] !== "string") {
    return [failure(v, "ERR_SCHEMA", "evidence_bundle must be null or {manifest_root, bundle_path}.")];
  }
  const dir = resolveInsideRepo(ctx.repoRoot, row["bundle_path"]);
  if (dir === null) return [failure(v, "ERR_HALLUCINATION", `bundle_path escapes the repository: ${row["bundle_path"]}`)];
  let actual: string;
  try {
    actual = manifestRoot(dir);
  } catch {
    return [failure(v, "ERR_HALLUCINATION", `bundle_path does not exist: ${row["bundle_path"]}`)];
  }
  return actual === row["manifest_root"]
    ? []
    : [failure(v, "ERR_HALLUCINATION", `manifest_root ${row["manifest_root"]} does not recompute from the files under ${row["bundle_path"]} (got ${actual}).`)];
};

// ── cdel.* ─────────────────────────────────────────────────────────────────

const ajv = new Ajv({ allErrors: true, strict: false });
const compiledSchemas = new Map<string, ValidateFunction>();

const jsonContract: NamedValidator = async (args, ctx) => {
  const v = "cdel.json_contract";
  const oneOf = strList(v, args, "one_of");
  const selectorStage = str(v, args, "selector_stage");
  const selectorPath = str(v, args, "selector_path");
  const upstream = ctx.stageOutputs.get(selectorStage);
  const mode = upstream === undefined ? ctx.mode : pointerValue(upstream, selectorPath);
  if (typeof mode !== "string") return [failure(v, "ERR_SCHEMA", `No mode selected at ${selectorStage}${selectorPath}.`)];
  const contractId = oneOf.find((id) => id.endsWith(`-${mode}`));
  if (!contractId) return [failure(v, "ERR_INSTRUCTION", `Mode ${JSON.stringify(mode)} has no contract among ${oneOf.join(", ")}.`)];
  const { slice, failures } = projectOrFailure(v, ctx.host, ctx.workbookId);
  if (!slice) return failures;
  const contract = slice.primitives[contractId];
  const schemaText = contract?.field_values["json_schema"];
  if (typeof schemaText !== "string") return [failure(v, "ERR_SCHEMA", `${contractId} has no json_schema.`)];
  const cached = compiledSchemas.get(contractId);
  const validate: ValidateFunction = cached ?? ajv.compile(JSON.parse(schemaText));
  if (!cached) compiledSchemas.set(contractId, validate);
  const payload = pointerValue(ctx.output, "/return");
  if (validate(payload)) return [];
  const detail = (validate.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message ?? "invalid"}`).join("; ");
  const missing = (validate.errors ?? []).some((e) => e.keyword === "required");
  return [failure(v, missing ? "ERR_OMISSION" : "ERR_SCHEMA", `The ${mode} return does not satisfy ${contractId}: ${detail}`)];
};

const repoRootFrom = (v: string, args: Readonly<Record<string, unknown>>, ctx: StageContext): string => {
  const input = strOpt(args, "root_input");
  const fromInput = input === undefined ? undefined : ctx.inputs[input];
  return typeof fromInput === "string" && fromInput !== "" ? fromInput : ctx.repoRoot;
};

const cdelPathsExist: NamedValidator = async (args, ctx) => {
  const v = "cdel.paths_exist";
  const pointers = Array.isArray(args["paths"]) ? strings(args["paths"] as unknown[]) : [str(v, args, "path")];
  const cited = pointers.flatMap((p) => strings(resolvePointer(ctx.output, p)));
  const found = pathsExist(v, repoRootFrom(v, args, ctx), cited);
  return args["allow_missing"] === true ? [] : found;
};

const cdelQuotesMatch: NamedValidator = async (args, ctx) => {
  const v = "cdel.quotes_match";
  const rows = resolvePointer(ctx.output, `${str(v, args, "path")}/*`);
  const pathField = str(v, args, "path_field");
  const lineField = str(v, args, "line_field");
  const quoteField = str(v, args, "quote_field");
  const quotes: Quote[] = [];
  for (const row of rows) {
    const r = record(row);
    if (r && typeof r[pathField] === "string" && typeof r[quoteField] === "string") {
      quotes.push({ path: r[pathField] as string, line: typeof r[lineField] === "number" ? (r[lineField] as number) : 0, quote: r[quoteField] as string });
    }
  }
  return quotesMatch(v, repoRootFrom(v, args, ctx), quotes);
};

const cdelDiffApplies: NamedValidator = async (args, ctx) => {
  const v = "cdel.diff_applies";
  const appliesTo = strOpt(args, "applies_to_mode");
  if (appliesTo !== undefined && ctx.mode !== appliesTo) return [];
  const diff = pointerValue(ctx.output, str(v, args, "path"));
  if (typeof diff !== "string") return [failure(v, "ERR_SCHEMA", `No diff at ${String(args["path"])}.`)];
  return diffApplies(v, repoRootFrom(v, args, ctx), diff);
};

const isSnapshot = (x: unknown): x is GitSnapshot => {
  const r = record(x);
  return !!r && ["head", "status_digest", "stash_list", "ref_list"].every((k) => typeof r[k] === "string");
};

const cdelNoGitMutation: NamedValidator = async (_args, ctx) => {
  const v = "cdel.no_git_mutation";
  const before = ctx.evidence["git_before"];
  const after = ctx.evidence["git_after"];
  if (!isSnapshot(before) || !isSnapshot(after)) {
    // A control that could not run has not passed.
    return [failure(v, "ERR_INSTRUCTION", "The stage driver captured no git snapshots, so git mutation cannot be excluded.")];
  }
  return noGitMutation(v, before, after, ctx.mode === "write");
};

// ── registry ───────────────────────────────────────────────────────────────

export const NAMED_VALIDATORS: ReadonlyMap<string, NamedValidator> = new Map<string, NamedValidator>([
  ["fpl.node_exists_in_workbook", nodeExistsInWorkbook],
  ["fpl.formal_artifact_check", formalArtifactCheck],
  ["fpl.reference_resolves", referenceResolves],
  ["fpl.error_class_vocabulary", errorClassVocabulary],
  ["fpl.written_ids_exist", writtenIdsExist],
  ["fpl.producer_status_guard", producerStatusGuard],
  ["fpl.evidence_bundle_manifest", evidenceBundleManifest],
  ["cdel.json_contract", jsonContract],
  ["cdel.paths_exist", cdelPathsExist],
  ["cdel.quotes_match", cdelQuotesMatch],
  ["cdel.diff_applies", cdelDiffApplies],
  ["cdel.no_git_mutation", cdelNoGitMutation],
]);

export function requireValidator(name: string, registry: ReadonlyMap<string, NamedValidator> = NAMED_VALIDATORS): NamedValidator {
  const found = registry.get(name);
  if (!found) throw new UnknownValidatorError(name);
  return found;
}
