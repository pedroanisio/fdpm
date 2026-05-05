/**
 * extract-transfer-from-build.ts — Reconstruct a ProjectTransfer JSON from
 * a previously generated build-*.ts script.
 *
 * Usage:
 *   npx tsx scripts/extract-transfer-from-build.ts <build.ts> <out.transfer.json>
 *
 * The inverse of generate-build-from-transfer.ts, with one caveat: this
 * tool can only recover what the original transfer file contributed to
 * the SDK script — workbook id/name/profile, scopes, type ids, ids,
 * source/target ids, field_values. It cannot recover:
 *   - workbook.created_at         (not encoded in the SDK script)
 *   - workbook.revision           (not encoded; generator drops it anyway)
 *   - workbook.description        (not encoded)
 *   - primitive.revision          (generator drops it; SDK reassigns)
 *   - relation.revision           (same)
 *   - relation field_values._metadata envelope and _strength
 *     (generator strips both at generation time; both are noise)
 *
 * Reconstructed transfers carry placeholder values for the unrecoverable
 * fields and are functionally equivalent to the original for purposes
 * of `generate-build-from-transfer.ts` — the generator re-applies the
 * same transformations and drops the same fields, so feeding the
 * reconstructed transfer back through the generator produces an output
 * that is byte-identical to the input build script (modulo intentional
 * generator changes).
 *
 * Implementation: TypeScript AST walk via the compiler API. No eval,
 * no module load — the input script is parsed as text. Object literals
 * are converted to plain JSON values; identifiers and computed
 * expressions cause the extractor to fail loudly.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

interface TransferPrimitive {
  id: string;
  type_id: string;
  scope_id?: string;
  field_values: Record<string, unknown>;
}

interface TransferRelation {
  id: string;
  type_id: string;
  source_id: string;
  target_id: string;
  field_values: Record<string, unknown>;
}

interface Transfer {
  spec_core: string;
  workbook: {
    id: string;
    name: string;
    profile_id: string;
    description?: string;
    created_at: string;
    revision: number;
  };
  primitives: TransferPrimitive[];
  relations: TransferRelation[];
}

class ExtractError extends Error {
  constructor(node: ts.Node, msg: string, src: ts.SourceFile) {
    const { line, character } = src.getLineAndCharacterOfPosition(node.getStart(src));
    super(`${msg} at ${src.fileName}:${line + 1}:${character + 1}`);
  }
}

function literalToValue(node: ts.Node, src: ts.SourceFile): unknown {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken) {
    const inner = literalToValue(node.operand, src);
    if (typeof inner === "number") return -inner;
    throw new ExtractError(node, "unary minus on non-numeric literal", src);
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map((e) => literalToValue(e, src));
  }
  if (ts.isObjectLiteralExpression(node)) {
    const out: Record<string, unknown> = {};
    for (const prop of node.properties) {
      if (!ts.isPropertyAssignment(prop)) {
        throw new ExtractError(prop, "non-PropertyAssignment in object literal (spread/shorthand/method)", src);
      }
      let key: string;
      const name = prop.name;
      if (ts.isIdentifier(name)) key = name.text;
      else if (ts.isStringLiteral(name)) key = name.text;
      else if (ts.isNumericLiteral(name)) key = name.text;
      else throw new ExtractError(name, "computed/unsupported property key", src);
      out[key] = literalToValue(prop.initializer, src);
    }
    return out;
  }
  throw new ExtractError(node, `unsupported expression kind: ${ts.SyntaxKind[node.kind]}`, src);
}

function findVariableInitializer(
  src: ts.SourceFile,
  name: string,
): ts.Expression | undefined {
  for (const stmt of src.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.name.text === name && decl.initializer) {
        return decl.initializer;
      }
    }
  }
  return undefined;
}

function expectStringConst(src: ts.SourceFile, name: string): string {
  const init = findVariableInitializer(src, name);
  if (!init) throw new Error(`expected string constant ${name} in input script`);
  const v = literalToValue(init, src);
  if (typeof v !== "string") throw new Error(`${name} is not a string literal`);
  return v;
}

function expectArrayConst(src: ts.SourceFile, name: string): unknown[] {
  const init = findVariableInitializer(src, name);
  if (!init) throw new Error(`expected array constant ${name} in input script`);
  if (!ts.isArrayLiteralExpression(init)) {
    throw new Error(`${name} initializer is not an array literal`);
  }
  return literalToValue(init, src) as unknown[];
}

interface PrimitiveSpecLiteral {
  id: string;
  type: string;
  fields: Record<string, unknown>;
  scope?: string;
}

interface RelationSpecLiteral {
  id: string;
  type: string;
  from: string;
  to: string;
  fields: Record<string, unknown>;
}

function asPrimitiveSpec(v: unknown, idx: number): PrimitiveSpecLiteral {
  if (!v || typeof v !== "object") throw new Error(`PRIMITIVES[${idx}] is not an object`);
  const o = v as Record<string, unknown>;
  if (typeof o.id !== "string") throw new Error(`PRIMITIVES[${idx}].id is not a string`);
  if (typeof o.type !== "string") throw new Error(`PRIMITIVES[${idx}].type is not a string`);
  if (!o.fields || typeof o.fields !== "object" || Array.isArray(o.fields)) {
    throw new Error(`PRIMITIVES[${idx}].fields is not an object`);
  }
  const out: PrimitiveSpecLiteral = {
    id: o.id,
    type: o.type,
    fields: o.fields as Record<string, unknown>,
  };
  if (o.scope !== undefined) {
    if (typeof o.scope !== "string") throw new Error(`PRIMITIVES[${idx}].scope is not a string`);
    out.scope = o.scope;
  }
  return out;
}

function asRelationSpec(v: unknown, idx: number): RelationSpecLiteral {
  if (!v || typeof v !== "object") throw new Error(`RELATIONS[${idx}] is not an object`);
  const o = v as Record<string, unknown>;
  for (const k of ["id", "type", "from", "to"]) {
    if (typeof o[k] !== "string") throw new Error(`RELATIONS[${idx}].${k} is not a string`);
  }
  if (!o.fields || typeof o.fields !== "object" || Array.isArray(o.fields)) {
    throw new Error(`RELATIONS[${idx}].fields is not an object`);
  }
  return {
    id: o.id as string,
    type: o.type as string,
    from: o.from as string,
    to: o.to as string,
    fields: o.fields as Record<string, unknown>,
  };
}

function extract(scriptPath: string): Transfer {
  const text = readFileSync(scriptPath, "utf8");
  const src = ts.createSourceFile(scriptPath, text, ts.ScriptTarget.Latest, true);

  const projectId = expectStringConst(src, "PROJECT_ID");
  const projectName = expectStringConst(src, "PROJECT_NAME");
  const profileId = expectStringConst(src, "PROFILE_ID");

  const primitivesRaw = expectArrayConst(src, "PRIMITIVES");
  const relationsRaw = expectArrayConst(src, "RELATIONS");

  const primitives: TransferPrimitive[] = primitivesRaw.map((v, i) => {
    const p = asPrimitiveSpec(v, i);
    const t: TransferPrimitive = {
      id: p.id,
      type_id: p.type,
      field_values: p.fields,
    };
    if (p.scope !== undefined) t.scope_id = p.scope;
    return t;
  });

  const relations: TransferRelation[] = relationsRaw.map((v, i) => {
    const r = asRelationSpec(v, i);
    return {
      id: r.id,
      type_id: r.type,
      source_id: r.from,
      target_id: r.to,
      field_values: r.fields,
    };
  });

  // Placeholder values for fields the SDK script does not encode. The
  // generator does not consume created_at/revision/description, so these
  // will not influence the regenerated output.
  return {
    spec_core: "1.1",
    workbook: {
      id: projectId,
      name: projectName,
      profile_id: profileId,
      created_at: "1970-01-01T00:00:00.000Z",
      revision: 0,
    },
    primitives,
    relations,
  };
}

const args = process.argv.slice(2);
if (args.length !== 2) {
  console.error("usage: extract-transfer-from-build.ts <build.ts> <out.transfer.json>");
  process.exit(2);
}
const [inPath, outPath] = args.map((p) => resolve(p)) as [string, string];
const transfer = extract(inPath);
writeFileSync(outPath, JSON.stringify(transfer, null, 2) + "\n");
console.log(`Wrote ${outPath}`);
console.log(`  workbook:    ${transfer.workbook.id} (${transfer.workbook.profile_id})`);
console.log(`  primitives:  ${transfer.primitives.length}`);
console.log(`  relations:   ${transfer.relations.length}`);
