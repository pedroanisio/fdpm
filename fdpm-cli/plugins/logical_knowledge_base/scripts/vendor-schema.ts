/**
 * Vendors `LogicalKnowledgeBase.ts` into `schemas/lkb.ts`.
 *
 * A vendored file must be reproducible from its upstream, so every change the
 * plugin needs is applied HERE, by a program, and never by hand in the copy:
 *
 *  1. `migrateFrom090`: `document.migration` is `JsonValue | undefined` under
 *     this repository's `noUncheckedIndexedAccess`; the value is read into a
 *     local and guarded with `!== undefined` before the upstream type guard.
 *     Same predicate, now typeable.
 *  2. The discriminated unions listed in `SPLIT_UNIONS` are split: each arm
 *     becomes a named `const`, the union's output type becomes a union of the
 *     arms' inferred types, and the union constant is annotated
 *     `z.ZodType<T>`. Without this, `tsc --declaration` (which the package
 *     build runs) refuses to serialize the inferred type of `RuleSchema`,
 *     `QuerySchema` and the root schema (TS7056). Runtime behaviour is
 *     identical: the same arm schemas, in the same order, in the same
 *     `z.discriminatedUnion("kind", …)` call, with the same refinements.
 *  3. `LogicalKnowledgeBaseSchema` is annotated `z.ZodType<LogicalKnowledgeBase, unknown>`
 *     with the type read from the semantic schema it wraps, and
 *     `safeParseLogicalKnowledgeBase` gains an explicit return type, for the
 *     same reason.
 *
 * The header written into the copy records the upstream sha256 so a reviewer
 * can diff the copy against the upstream at that hash and see exactly these
 * three transformations.
 *
 *   npx tsx plugins/logical_knowledge_base/scripts/vendor-schema.ts [<upstream path>]
 *   npx tsx plugins/logical_knowledge_base/scripts/vendor-schema.ts --check
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = resolve(__dirname, "..");
const OUT_PATH = resolve(PLUGIN_DIR, "schemas/lkb.ts");
const DEFAULT_UPSTREAM = resolve(PLUGIN_DIR, "../../../_ingest_bin/LogicalKnowledgeBase.ts");

/** Unions whose arms are split (transformation 2). Order is irrelevant. */
export const SPLIT_UNIONS = [
  "DeclarationSchema",
  "StatementSchema",
  "RuleSchema",
  "ConstraintSchema",
  "QuerySchema",
  "ProofSchema",
  "ArgumentationElementSchema",
  "InferenceStepSchema",
  "EffectSchema",
  "ConflictResolutionStrategySchema",
  "ProcessElementSchema",
] as const;

interface Edit {
  start: number;
  end: number;
  text: string;
}

const MIGRATION_OLD =
  "  const existingMigration = isJsonObject(document.migration) ? document.migration : undefined;";
const MIGRATION_NEW = `  const migrationValue = document.migration;
  const existingMigration =
    migrationValue !== undefined && isJsonObject(migrationValue) ? migrationValue : undefined;`;

const SAFE_PARSE_OLD = "export function safeParseLogicalKnowledgeBase(input: unknown) {";
const SAFE_PARSE_NEW =
  "export function safeParseLogicalKnowledgeBase(input: unknown): z.ZodSafeParseResult<LogicalKnowledgeBase> {";

function replaceOnce(source: string, from: string, to: string, what: string): string {
  const first = source.indexOf(from);
  if (first < 0 || source.indexOf(from, first + 1) >= 0) {
    throw new Error(`vendor-schema: expected exactly one occurrence of ${what}`);
  }
  return source.slice(0, first) + to + source.slice(first + from.length);
}

function findUnionCall(node: ts.Node): ts.CallExpression | undefined {
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === "discriminatedUnion" &&
    node.arguments.length === 2 &&
    ts.isStringLiteral(node.arguments[0]!) &&
    node.arguments[0].text === "kind" &&
    ts.isArrayLiteralExpression(node.arguments[1]!)
  ) {
    return node;
  }
  return ts.forEachChild(node, findUnionCall);
}

function isExported(stmt: ts.Statement): boolean {
  return (ts.getModifiers(stmt as ts.HasModifiers) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

/** Applies transformations 2 and 3 with the TypeScript parser. */
export function transform(source: string): string {
  const sf = ts.createSourceFile("lkb.ts", source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const edits: Edit[] = [];
  const splitNames = new Set<string>(SPLIT_UNIONS);
  const typeNameOf = (schemaName: string) => schemaName.replace(/Schema$/, "");
  const handled = new Set<string>();

  for (const stmt of sf.statements) {
    // 2. Split unions.
    if (ts.isVariableStatement(stmt) && stmt.declarationList.declarations.length === 1) {
      const decl = stmt.declarationList.declarations[0]!;
      const name = ts.isIdentifier(decl.name) ? decl.name.text : "";
      if (splitNames.has(name) && decl.initializer) {
        const call = findUnionCall(decl.initializer);
        if (!call) throw new Error(`vendor-schema: ${name} has no discriminatedUnion("kind", [...]) call`);
        const arr = call.arguments[1] as ts.ArrayLiteralExpression;
        const typeName = typeNameOf(name);
        const armNames: string[] = [];
        const armDecls: string[] = [];
        arr.elements.forEach((el, i) => {
          const text = el.getText(sf);
          const kind = /kind:\s*z\.literal\("([a-z0-9_]+)"\)/.exec(text)?.[1] ?? `arm${i}`;
          const armName = `${typeName}Arm_${kind}`;
          armNames.push(armName);
          armDecls.push(`const ${armName} = ${text};`);
        });
        const stmtStart = stmt.getStart(sf);
        const stmtText = stmt.getText(sf);
        const arrStart = arr.getStart(sf) - stmtStart;
        const arrEnd = arr.getEnd() - stmtStart;
        const nameEnd = decl.name.getEnd() - stmtStart;
        const rewritten =
          stmtText.slice(0, nameEnd) +
          `: z.ZodType<${typeName}>` +
          stmtText.slice(nameEnd, arrStart) +
          `[${armNames.join(", ")}]` +
          stmtText.slice(arrEnd);
        const exportKw = isExported(stmt) ? "export " : "";
        const alias =
          `/** Output type of ${name}, spelled as a union of its arms so each emitted declaration stays serializable (vendor-schema.ts). */\n` +
          `${exportKw}type ${typeName} =\n  | ${armNames.map((a) => `z.infer<typeof ${a}>`).join("\n  | ")};`;
        edits.push({ start: stmtStart, end: stmt.getEnd(), text: `${armDecls.join("\n")}\n\n${alias}\n\n${rewritten}` });
        handled.add(name);
      }
      // 3. Root schema annotation.
      if (name === "LogicalKnowledgeBaseSchema") {
        const nameEnd = decl.name.getEnd();
        edits.push({ start: nameEnd, end: nameEnd, text: ": z.ZodType<LogicalKnowledgeBase, unknown>" });
        handled.add(name);
      }
    }
    // Replace the upstream `export type X = z.infer<typeof XSchema>;` aliases the split provides.
    if (ts.isTypeAliasDeclaration(stmt)) {
      const typeText = stmt.type.getText(sf);
      const m = /^z\.infer<typeof ([A-Za-z]+Schema)>$/.exec(typeText);
      if (m && splitNames.has(m[1]!) && stmt.name.text === typeNameOf(m[1]!)) {
        edits.push({
          start: stmt.getStart(sf),
          end: stmt.getEnd(),
          text: `// ${stmt.name.text} is declared beside ${m[1]} (vendor-schema.ts).`,
        });
      }
      if (stmt.name.text === "LogicalKnowledgeBase" && typeText === "z.infer<typeof LogicalKnowledgeBaseSchema>") {
        edits.push({
          start: stmt.type.getStart(sf),
          end: stmt.type.getEnd(),
          text: "z.infer<typeof LogicalKnowledgeBaseSemanticSchema>",
        });
        handled.add("LogicalKnowledgeBase");
      }
    }
  }

  const missing = [...splitNames, "LogicalKnowledgeBaseSchema", "LogicalKnowledgeBase"].filter((n) => !handled.has(n));
  if (missing.length > 0) throw new Error(`vendor-schema: upstream no longer declares ${missing.join(", ")}`);

  edits.sort((a, b) => b.start - a.start);
  let out = source;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}

export function vendor(upstreamSource: string): string {
  const sha = createHash("sha256").update(upstreamSource).digest("hex");
  let body = replaceOnce(upstreamSource, MIGRATION_OLD, MIGRATION_NEW, "the migrateFrom090 guard");
  body = replaceOnce(body, SAFE_PARSE_OLD, SAFE_PARSE_NEW, "safeParseLogicalKnowledgeBase");
  body = transform(body);
  const header = `/**
 * LogicalKnowledgeBase schema — VENDORED for the fdpm.logical-knowledge-base plugin.
 *
 * PROVENANCE. Generated by scripts/vendor-schema.ts from
 * \`_ingest_bin/LogicalKnowledgeBase.ts\` at upstream sha256
 * ${sha}. \`_ingest_bin/\` is git-ignored, so this
 * copy — not the upstream path — is what a clean checkout builds from;
 * generated/schema-hash.json pins the hash of THIS file plus derive.ts.
 *
 * DO NOT EDIT. Three transformations are applied by the vendoring script and
 * documented there: (1) the \`migrateFrom090\` undefined guard, (2) split
 * discriminated-union arms with explicit union types so \`tsc --declaration\`
 * can serialize them, (3) explicit types on the root schema and its safe
 * parser. Behaviour is unchanged. Re-vendor with:
 *
 *   npx tsx plugins/logical_knowledge_base/scripts/vendor-schema.ts [<upstream path>]
 */
export const LKB_UPSTREAM_SHA256 = "${sha}" as const;

`;
  return header + body;
}

function main(): void {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const upstreamArg = args.find((a) => !a.startsWith("--"));
  const upstream = resolve(upstreamArg ?? DEFAULT_UPSTREAM);
  if (!existsSync(upstream)) {
    process.stderr.write(`vendor-schema: upstream not found at ${upstream}\n`);
    process.exit(2);
  }
  const produced = vendor(readFileSync(upstream, "utf8"));
  if (check) {
    const current = existsSync(OUT_PATH) ? readFileSync(OUT_PATH, "utf8") : "";
    if (current !== produced) {
      process.stderr.write("vendor-schema: schemas/lkb.ts differs from the vendoring of the upstream\n");
      process.exit(1);
    }
    process.stdout.write("vendor-schema: schemas/lkb.ts is current\n");
    return;
  }
  writeFileSync(OUT_PATH, produced);
  process.stdout.write(`wrote ${OUT_PATH} (${produced.split("\n").length} lines)\n`);
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
