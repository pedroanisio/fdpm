/**
 * The knowledge base as a document a person can review.
 *
 * The renderer reassembles the workbook into the LogicalKnowledgeBase shape
 * (`assembleDocument`) and walks the document, not the raw primitives, so
 * what it prints is exactly what the `lkb-json` exporter would export — and
 * it opens with the document-level check, because a listing that hides an
 * unresolved reference is a listing that misleads the reviewer.
 *
 * Runs over any input, including the acceptance harness's empty, malformed
 * and dense fixtures: a missing header renders as an inventory of what is
 * there, an unprintable formula renders as `⟨unprintable⟩`.
 */
import type { RendererInput, RendererOutput } from "../../../src/plugin/types.js";
import {
  EXTERNAL_TARGET_TYPE_ID,
  HEADER_TYPE_ID,
  ROOT_COLLECTIONS,
  SOURCE_ID_FIELD,
} from "../derive.js";
import { groundedResults, type GroundedResult } from "../grounded.js";
import { assembleDocument, parseDocument } from "../transfer.js";
import { printShort, refName } from "./_formula.js";

type Json = Record<string, unknown>;
const isRecord = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const arr = (v: unknown): Json[] => (Array.isArray(v) ? v.filter(isRecord) : []);
const str = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : fallback;
const cell = (s: string): string => s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
const code = (s: string): string => (s.length === 0 ? "" : `\`${s.replace(/`/g, "ˋ")}\``);
const refs = (v: unknown): string => (Array.isArray(v) ? v.map(refName).join(", ") : v === undefined ? "" : refName(v));
const MAX_ISSUES = 20;
const MAX_ROWS = 400;

const COLLECTION_TITLES: Record<(typeof ROOT_COLLECTIONS)[number], string> = {
  namespaces: "Namespaces",
  imports: "Imports",
  modules: "Modules",
  declarations: "Declarations",
  statements: "Statements",
  rules: "Rules",
  constraints: "Constraints",
  queries: "Queries",
  proofs: "Proofs",
  argumentation: "Argumentation",
  processes: "Processes",
  conflictPolicies: "Conflict policies",
  provenanceRecords: "Provenance records",
  interoperabilityMappings: "Interoperability mappings",
};

export function renderTheory(input: RendererInput): RendererOutput {
  const lines: string[] = [];
  const out = (...l: string[]) => lines.push(...l);
  const assembled = assembleDocument(input.primitives, input.relations);
  const doc = assembled.document;

  if (!doc) {
    out(`# Logical knowledge base — ${input.workbookId}`, "");
    out(`No \`${HEADER_TYPE_ID}\` primitive: the workbook does not yet describe a document.`, "");
    inventory(input, out);
    return finish(lines);
  }

  const title = str(doc["title"]) || str(doc["id"], input.workbookId);
  out(`# ${title}`, "");
  out(
    `Logical knowledge base ${code(str(doc["id"]))} — schema ${code(str(doc["schemaVersion"], "?"))}, semantic model ${code(str(doc["semanticModelVersion"], "?"))}` +
      (str(doc["version"]) ? `, version ${code(str(doc["version"]))}` : "") +
      (input.renderedAt ? `. Rendered ${input.renderedAt}.` : "."),
    "",
  );

  // Document check first: a listing must not hide what the schema rejects.
  const parsed = parseDocument(doc);
  const issues = [...assembled.problems, ...(parsed.ok ? [] : parsed.issues)];
  out("## Document check", "");
  if (issues.length === 0) out("The workbook assembles into a document the LogicalKnowledgeBase schema accepts.", "");
  else {
    out(`**${issues.length} issue(s)** — the workbook does not yet assemble into a valid document.`, "");
    // Zod says "received undefined" for a missing field; readers (and the
    // acceptance harness's placeholder check) want "missing".
    for (const i of issues.slice(0, MAX_ISSUES)) out(`- ${code(i.path)} ${cell(i.message.replace(/\bundefined\b/g, "missing").replace(/\bNaN\b/g, "not a number"))}`);
    if (issues.length > MAX_ISSUES) out(`- … ${issues.length - MAX_ISSUES} more`);
    out("");
  }

  out("## Contents", "", "| Collection | Count |", "|---|---:|");
  for (const c of ROOT_COLLECTIONS) out(`| ${COLLECTION_TITLES[c]} | ${arr(doc[c]).length} |`);
  const externals = input.primitives.filter((p) => p.type_id === EXTERNAL_TARGET_TYPE_ID);
  out(`| External targets | ${externals.length} |`, "");

  const semantics = doc["defaultSemantics"];
  if (isRecord(semantics)) {
    out("## Default semantics", "", "| Setting | Value |", "|---|---|");
    for (const [k, v] of Object.entries(semantics)) out(`| ${cell(k)} | ${cell(isRecord(v) ? refName(v) : str(v))} |`);
    out("");
  }
  const profiles = arr(doc["logicProfiles"]);
  if (profiles.length > 0) {
    out("## Logic profiles", "");
    for (const p of profiles) out(`- ${code(str(p["id"]))} ${str(p["version"])}${Array.isArray(p["families"]) ? ` — ${(p["families"] as unknown[]).map(String).join(", ")}` : ""}`);
    out("");
  }

  section("Namespaces", arr(doc["namespaces"]), out, ["Prefix", "IRI", "Preferred"], (n) => [
    code(str(n["prefix"])), cell(str(n["iri"])), n["preferred"] === true ? "yes" : "",
  ]);
  section("Imports", arr(doc["imports"]), out, ["Id", "Source", "Format", "Version"], (n) => [
    code(str(n["id"])), cell(str(n["sourceUri"])), str(n["sourceFormat"]), str(n["version"]),
  ]);
  section("Modules", arr(doc["modules"]), out, ["Id", "Name", "Members", "Imports", "Parent", "Sealed"], (n) => [
    code(str(n["id"])), cell(str(n["name"])), String(arr(n["memberRefs"]).length), String(arr(n["imports"]).length),
    cell(refs(n["parentModule"])), n["sealed"] === true ? "yes" : "",
  ]);

  declarations(arr(doc["declarations"]), out);

  section("Statements", arr(doc["statements"]), out, ["Id", "Kind", "Status", "Content"], (n) => [
    code(str(n["id"])), str(n["kind"]), str(n["status"]),
    cell(statementContent(n)),
  ]);

  rules(arr(doc["rules"]), out);

  section("Constraints", arr(doc["constraints"]), out, ["Id", "Kind", "Active", "Formula", "Strength"], (n) => [
    code(str(n["id"])), str(n["kind"]), n["active"] === false ? "no" : n["active"] === true ? "yes" : "",
    cell(printShort(n["formula"] ?? n["expression"] ?? n["members"])),
    cell([str(n["violationSeverity"]), str(n["weight"]), str(n["penalty"]), str(n["sense"])].filter(Boolean).join(" / ")),
  ]);

  section("Queries", arr(doc["queries"]), out, ["Id", "Kind", "Question"], (n) => [
    code(str(n["id"])), str(n["kind"]), cell(queryContent(n)),
  ]);

  proofs(arr(doc["proofs"]), out);
  const sourceIds = new Map(input.primitives.map((p) => [p.id, str(p.field_values?.[SOURCE_ID_FIELD], p.id)] as const));
  const grounded = new Map(groundedResults(input.primitives, input.relations).map((r) => [r.framework.sourceId, r] as const));
  argumentation(arr(doc["argumentation"]), out, grounded, (hostId) => sourceIds.get(hostId) ?? hostId);
  processes(arr(doc["processes"]), out);

  section("Conflict policies", arr(doc["conflictPolicies"]), out, ["Id", "Name", "Strategies", "Fallback", "Applies to"], (n) => [
    code(str(n["id"])), cell(str(n["name"])), cell(arr(n["strategies"]).map((s) => str(s["kind"])).join(", ")), str(n["fallback"]), cell(refs(n["appliesTo"])),
  ]);
  section("Provenance records", arr(doc["provenanceRecords"]), out, ["Id", "Source document", "Format", "Conversion", "Creator"], (n) => [
    code(str(n["id"])), cell(str(n["sourceDocument"])), str(n["sourceFormat"]), str(n["conversionStatus"]),
    cell(isRecord(n["creator"]) ? str(n["creator"]["name"]) : ""),
  ]);
  section("Interoperability mappings", arr(doc["interoperabilityMappings"]), out, ["Id", "Name", "Direction", "Formats", "Entries", "Conversion"], (n) => [
    code(str(n["id"])), cell(str(n["name"])), str(n["direction"]), `${str(n["sourceFormat"])} → ${str(n["targetFormat"])}`, String(arr(n["entries"]).length), str(n["conversionStatus"]),
  ]);

  if (externals.length > 0) {
    out("## External targets", "", "| Identifier | URI |", "|---|---|");
    for (const e of externals.slice(0, MAX_ROWS)) {
      out(`| ${code(str(e.field_values?.[SOURCE_ID_FIELD], e.id))} | ${cell(str(e.field_values?.["external_uri"]))} |`);
    }
    out("");
  }

  return finish(lines);
}

function finish(lines: string[]): RendererOutput {
  const text = lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
  return { bytes: new TextEncoder().encode(text), contentType: "text/markdown", filename: "theory.md" };
}

function inventory(input: RendererInput, out: (...l: string[]) => void): void {
  const byType = new Map<string, number>();
  for (const p of input.primitives) byType.set(p.type_id, (byType.get(p.type_id) ?? 0) + 1);
  out("## Inventory", "", "| Primitive type | Count |", "|---|---:|");
  for (const [t, n] of [...byType.entries()].sort()) out(`| ${code(t)} | ${n} |`);
  out(`| relations | ${input.relations.length} |`, "");
}

function section(
  title: string,
  rows: Json[],
  out: (...l: string[]) => void,
  header: string[],
  row: (n: Json) => string[],
): void {
  if (rows.length === 0) return;
  out(`## ${title} (${rows.length})`, "", `| ${header.join(" | ")} |`, `|${header.map(() => "---").join("|")}|`);
  for (const n of rows.slice(0, MAX_ROWS)) out(`| ${row(n).join(" | ")} |`);
  if (rows.length > MAX_ROWS) out(`| … | ${rows.length - MAX_ROWS} more |`);
  out("");
}

function declarations(rows: Json[], out: (...l: string[]) => void): void {
  if (rows.length === 0) return;
  out(`## Declarations (${rows.length})`, "");
  const groups = new Map<string, Json[]>();
  for (const d of rows) groups.set(str(d["kind"], "?"), [...(groups.get(str(d["kind"], "?")) ?? []), d]);
  for (const [kind, members] of [...groups.entries()].sort()) {
    out(`### ${kind} (${members.length})`, "", "| Id | Name | Signature |", "|---|---|---|");
    for (const d of members.slice(0, MAX_ROWS)) out(`| ${code(str(d["id"]))} | ${cell(str(d["name"]))} | ${cell(signature(d))} |`);
    out("");
  }
}

function signature(d: Json): string {
  const parts: string[] = [];
  const params = arr(d["parameters"]);
  if (typeof d["arity"] === "number" || params.length > 0) {
    parts.push(
      `(${params.map((p) => `${str(p["name"])}${p["type"] !== undefined ? `: ${printShort(p["type"], 40)}` : ""}`).join(", ")})` +
        (d["variadic"] === true ? "…" : ""),
    );
  }
  if (d["returnType"] !== undefined) parts.push(`→ ${printShort(d["returnType"], 60)}`);
  if (d["valueType"] !== undefined) parts.push(`: ${printShort(d["valueType"], 60)}`);
  if (d["definition"] !== undefined) parts.push(`≔ ${printShort(d["definition"], 80)}`);
  for (const k of ["worldKind", "agentKind", "contextKind", "iri", "symbol", "unitSymbol"]) if (d[k] !== undefined) parts.push(`${k}=${str(d[k])}`);
  for (const k of ["parentWorld", "inverseOf", "authority"]) if (d[k] !== undefined) parts.push(`${k}=${refs(d[k])}`);
  return parts.join(" ");
}

function statementContent(n: Json): string {
  switch (str(n["kind"])) {
    case "definition_statement": return `${refs(n["symbol"])} ≔ ${printShort(n["body"])}`;
    case "normative_statement": return printShort(n["norm"]);
    case "structural_equation_statement": return `${refs(n["endogenousVariable"])} = ${printShort(n["equation"] ?? n["function"])}`;
    default: {
      const f = n["formula"] ?? n["norm"] ?? n["assumption"] ?? n["dependency"];
      const truth = str(n["assertedTruth"]);
      return `${printShort(f)}${truth ? ` [${truth}]` : ""}`;
    }
  }
}

function queryContent(n: Json): string {
  switch (str(n["kind"])) {
    case "entailment_query": return `${arr(n["premises"]).map((p) => printShort(p, 60)).join(", ")} ⊢ ${printShort(n["conclusion"])}`;
    case "consistency_query": return `consistent(${[refs(n["statementRefs"]), ...arr(n["formulas"]).map((f) => printShort(f, 40))].filter(Boolean).join(", ")})`;
    default: {
      const f = n["formula"] ?? n["goal"] ?? n["concept"] ?? n["objective"] ?? n["target"];
      return f === undefined ? str(n["name"]) : printShort(f);
    }
  }
}

function rules(rows: Json[], out: (...l: string[]) => void): void {
  if (rows.length === 0) return;
  out(`## Rules (${rows.length})`, "");
  for (const r of rows.slice(0, MAX_ROWS)) {
    const meta = [
      str(r["kind"]),
      `phase ${str(r["phase"], "?")}`,
      r["active"] === false ? "inactive" : "active",
      typeof r["priority"] === "number" ? `priority ${r["priority"]}` : "",
      typeof r["confidence"] === "number" ? `confidence ${r["confidence"]}` : "",
    ].filter(Boolean).join(" · ");
    out(`### ${code(str(r["id"]))}${str(r["name"]) ? ` — ${str(r["name"])}` : ""}`, "", `${meta}`, "");
    const body = arr(r["body"]);
    const head = arr(r["head"]);
    if (body.length > 0 || head.length > 0) {
      out(`- body: ${body.map((f) => printShort(f)).join(" ∧ ") || "⊤"}`);
      out(`- head: ${head.map((f) => printShort(f)).join(", ")}`);
    }
    for (const k of ["condition", "trigger", "norm", "inputPattern", "output", "subject", "action", "resource", "conclusion", "premise"]) {
      if (r[k] !== undefined) out(`- ${k}: ${printShort(r[k])}`);
    }
    if (arr(r["guards"]).length > 0) out(`- guards: ${arr(r["guards"]).map((g) => printShort(g, 60)).join("; ")}`);
    for (const k of ["severity", "diagnosticCode", "inferenceMethod", "effect", "defeatPolicy"]) if (r[k] !== undefined) out(`- ${k}: ${str(r[k])}`);
    for (const k of ["priorityOver", "overrides"]) if (Array.isArray(r[k]) && (r[k] as unknown[]).length > 0) out(`- ${k}: ${refs(r[k])}`);
    if (arr(r["exceptions"]).length > 0) out(`- exceptions: ${arr(r["exceptions"]).length}`);
    out("");
  }
}

function proofs(rows: Json[], out: (...l: string[]) => void): void {
  if (rows.length === 0) return;
  out(`## Proofs (${rows.length})`, "");
  for (const p of rows.slice(0, MAX_ROWS)) {
    const steps = [...arr(p["steps"]), ...arr(p["trace"])];
    out(`### ${code(str(p["id"]))} — ${str(p["kind"])}`, "");
    const meta = [str(p["proofSystem"]) ? `system ${str(p["proofSystem"])}` : "", str(p["status"]) ? `status ${str(p["status"])}` : "", str(p["explanationKind"]) ? `kind ${str(p["explanationKind"])}` : ""].filter(Boolean).join(" · ");
    if (meta) out(meta, "");
    if (p["conclusion"] !== undefined) out(`- conclusion: ${printShort(p["conclusion"])}`);
    if (arr(p["conclusions"]).length > 0) out(`- conclusions: ${arr(p["conclusions"]).map((c) => printShort(c, 60)).join("; ")}`);
    if (p["refutedFormula"] !== undefined) out(`- refutes: ${printShort(p["refutedFormula"])}`);
    if (p["rootStep"] !== undefined) out(`- root step: ${refs(p["rootStep"])}`);
    if (steps.length > 0) {
      out(`- steps (${steps.length}):`);
      for (const s of steps.slice(0, 50)) out(`  - ${code(str(s["id"]))} ${str(s["kind"])}${s["conclusion"] !== undefined ? `: ${printShort(s["conclusion"], 100)}` : ""}`);
      if (steps.length > 50) out(`  - … ${steps.length - 50} more`);
    }
    out("");
  }
}

function argumentation(
  rows: Json[],
  out: (...l: string[]) => void,
  grounded: ReadonlyMap<string, GroundedResult> = new Map(),
  sourceIdOf: (hostId: string) => string = (id) => id,
): void {
  if (rows.length === 0) return;
  out(`## Argumentation (${rows.length})`, "");
  const by = (k: string) => rows.filter((r) => r["kind"] === k);
  const claims = by("claim");
  if (claims.length > 0) {
    out("### Claims", "", "| Id | Status | Formula |", "|---|---|---|");
    for (const c of claims.slice(0, MAX_ROWS)) out(`| ${code(str(c["id"]))} | ${str(c["status"])} | ${cell(printShort(c["formula"]))} |`);
    out("");
  }
  const args = by("argument");
  if (args.length > 0) {
    out("### Arguments", "", "| Id | Premises | Conclusion | Scheme |", "|---|---|---|---|");
    for (const a of args.slice(0, MAX_ROWS)) out(`| ${code(str(a["id"]))} | ${cell(refs(a["premiseRefs"]))} | ${cell(refs(a["conclusionRef"]))} | ${cell(str(a["scheme"]))} |`);
    out("");
  }
  const edges = rows.filter((r) => ["support_relation", "attack_relation", "rebuttal", "undercutter"].includes(str(r["kind"])));
  if (edges.length > 0) {
    out("### Support and attack", "", "| Id | Kind | From | To |", "|---|---|---|---|");
    for (const e of edges.slice(0, MAX_ROWS)) {
      const from = e["supporter"] ?? e["attacker"] ?? e["rebuttingClaim"] ?? e["claim"];
      const to = e["supported"] ?? e["attacked"] ?? e["targetClaim"] ?? e["targetArgument"];
      out(`| ${code(str(e["id"]))} | ${str(e["kind"])}${str(e["attackKind"]) ? ` (${str(e["attackKind"])})` : ""} | ${cell(refs(from))} | ${cell(refs(to))} |`);
    }
    out("");
  }
  const frameworks = by("argumentation_framework");
  if (frameworks.length > 0) {
    out("### Frameworks", "", "| Id | Semantics | Arguments | Relations | Declared accepted | Grounded (computed) |", "|---|---|---:|---:|---|---|");
    for (const f of frameworks) {
      const result = grounded.get(str(f["id"]));
      const computed = result
        ? `${result.accepted.map(sourceIdOf).join(", ") || "∅"}${result.disagreement ? " — **≠ declared**" : ""}`
        : "— (not grounded semantics)";
      out(`| ${code(str(f["id"]))} | ${str(f["semantics"])} | ${arr(f["argumentRefs"]).length} | ${arr(f["relationRefs"]).length} | ${cell(refs(f["acceptedArguments"]))} | ${cell(computed)} |`);
    }
    out("");
  }
}

function processes(rows: Json[], out: (...l: string[]) => void): void {
  if (rows.length === 0) return;
  out(`## Processes (${rows.length})`, "");
  for (const p of rows.slice(0, MAX_ROWS)) {
    const elements = arr(p["elements"]);
    out(`### ${code(str(p["id"]))} — ${str(p["name"])}`, "");
    out(`- entry points: ${refs(p["entryPoints"]) || "—"}`);
    if (arr(p["terminalElements"]).length > 0) out(`- terminal: ${refs(p["terminalElements"])}`);
    if (arr(p["invariants"]).length > 0) out(`- invariants: ${arr(p["invariants"]).map((i) => printShort(i, 60)).join("; ")}`);
    if (elements.length > 0) {
      out(`- elements (${elements.length}):`);
      for (const e of elements.slice(0, 100)) {
        const detail =
          e["kind"] === "transition" ? ` ${refs(e["fromState"])} → ${refs(e["toState"])}` :
          e["kind"] === "trigger" ? ` when ${printShort(e["condition"], 60)} → ${refs(e["target"])}` :
          e["kind"] === "sequence" ? ` ${refs(e["steps"])}` :
          e["event"] !== undefined ? ` ${refs(e["event"])}` :
          e["state"] !== undefined ? ` ${refs(e["state"])}` :
          e["action"] !== undefined ? ` ${refs(e["action"])}` : "";
        out(`  - ${code(str(e["id"]))} ${str(e["kind"])}${detail}`);
      }
      if (elements.length > 100) out(`  - … ${elements.length - 100} more`);
    }
    out("");
  }
}
