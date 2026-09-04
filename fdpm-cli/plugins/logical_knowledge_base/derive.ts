/**
 * The derivation: one FDPM primitive type per node kind of a
 * LogicalKnowledgeBase document, one relation type per reference field, and
 * the recursive expression language kept as validated JSON.
 *
 * WHY A DERIVATION AND NOT A HAND-WRITTEN PROFILE. `schemas/lkb.ts` declares
 * 263 node schemas under 294 `kind` discriminators. The 115 kinds that live in
 * the document's fourteen top-level collections (plus the inference steps
 * nested in proofs and the elements nested in process models) are the graph;
 * the rest — 59 formula kinds, 17 term kinds, types, concepts, literals,
 * distributions, membership functions — is an expression language whose nodes
 * are meaningful only inside the node that owns them. Typing 115 PrimitiveTypeDefs
 * by hand would drift from the schema within a release; walking the schema
 * cannot.
 *
 * WHAT BECOMES WHAT.
 *  - A node kind → `lkb:<PascalCase(kind)>` with the node's scalar, enum,
 *    datetime, struct and list fields. The source `id` becomes the host's
 *    instance id (see `slugForHostId`) and is kept verbatim in `source_id`,
 *    because the source allows URI-shaped identifiers the host id pattern
 *    does not.
 *  - A field typed `Reference` (or `Reference[]`) → a relation type
 *    `lkb:ref.<field>` whose instances carry the reference's `resolution`,
 *    `targetFamily` and `externalUri`. The host then refuses an edge to a node
 *    that does not exist at write time; the schema could only report it after
 *    the whole document was assembled. Target types are open (`*`) because the
 *    schema fixes the family per REFERENCE INSTANCE, not per field; the
 *    `lkb:val:reference-family` validator enforces it the way
 *    `matchesTargetFamily` does upstream.
 *  - `provenance` links → `lkb:provenance` edges to `lkb:ProvenanceRecord`.
 *  - Proof `steps`/`trace` and process `elements` → `lkb:has-step` /
 *    `lkb:has-element` containment edges, so every id-bearing step is
 *    addressable, as the schema's own id index makes it.
 *  - A field typed with one of the recursive roots (`Formula`, `Term`,
 *    `Expression`, `ValueExpression`, `TypeExpression`, `ConceptExpression`,
 *    `VariableBinding`, `JsonValue`) → `kind: "json"` with `format: "lkb:<Root>"`.
 *    `validators.ts` parses each such value with the vendored root schema, so
 *    the expression language is checked exactly as upstream checks it.
 *  - A nested plain object → an inline struct (shared at profile level and
 *    named after the exported schema when there is one); a nested union,
 *    record or tuple → `json`.
 *
 * WHAT DOES NOT COME ACROSS, stated rather than hidden: references nested
 * INSIDE structs and expression trees (a rule's `scope.modules`, a
 * `symbol_reference_term`) stay in the JSON and are checked by the
 * document-level validator, not by the host's edge check; `concurrency.branches`
 * (`Reference[][]`) and `explanation_trace.target` (`Formula | Reference`) are
 * JSON for the same reason.
 *
 * Everything here is machine-read from the schema. Re-vendor `schemas/lkb.ts`,
 * run `scripts/build-profile.ts`, and the profile follows.
 */
import { createHash } from "node:crypto";
import type { z } from "zod";
import type {
  DomainProfile,
  FieldDefT,
  FieldValidation,
  InlineStructDef,
  PrimitiveTypeDef,
  RelationTypeDef,
} from "../../src/core/models/meta.js";
import * as L from "./schemas/lkb.js";

export const VENDOR = "lkb" as const;
export const PLUGIN_ID = "fdpm.logical-knowledge-base" as const;
export const PROFILE_ID = "profile:logical-knowledge-base:1.0" as const;
/** Tracks the schema's own semantic model version. */
export const PROFILE_VERSION: string = L.CURRENT_SEMANTIC_MODEL_VERSION;

export const HEADER_KIND = "logical_knowledge_base" as const;
export const HEADER_TYPE_ID = "lkb:LogicalKnowledgeBase" as const;
export const EXTERNAL_TARGET_TYPE_ID = "lkb:ExternalTarget" as const;
export const PROVENANCE_RELATION_ID = "lkb:provenance" as const;
/**
 * Derived edge: a node's formulas, structs or bindings name a local
 * reference to another node. Not a source field — the importer derives it,
 * `lkb:val:mentions-current` checks it, and the exporter ignores it — but
 * once present it makes "where is P used" a relation query and lets the
 * host's delete refusal protect a declaration that formulas still cite.
 */
export const MENTIONS_RELATION_ID = "lkb:mentions" as const;
export const STEP_RELATION_ID = "lkb:has-step" as const;
export const ELEMENT_RELATION_ID = "lkb:has-element" as const;
export const REF_RELATION_PREFIX = "lkb:ref." as const;
export const SOURCE_ID_FIELD = "source_id" as const;
export const THEORY_RENDERER_ID = "lkb:TheoryRenderer" as const;
export const ARGUMENT_GRAPH_RENDERER_ID = "lkb:ArgumentGraphRenderer" as const;

/** Instance ids: `lkb:<kind-kebab>:<slug>`; the slug charset is the host's own. */
export const INSTANCE_ID_PATTERN = "^lkb:[a-z0-9-]+:[A-Za-z0-9][A-Za-z0-9._-]*$";

/** The fourteen root collections, in the order the schema declares them. */
export const ROOT_COLLECTIONS = [
  "namespaces",
  "imports",
  "modules",
  "declarations",
  "statements",
  "rules",
  "constraints",
  "queries",
  "proofs",
  "argumentation",
  "processes",
  "conflictPolicies",
  "provenanceRecords",
  "interoperabilityMappings",
] as const;
export type RootCollection = (typeof ROOT_COLLECTIONS)[number];

/** The families a `Reference.targetFamily` may name (schema enum). */
export const TARGET_FAMILIES: readonly string[] = (() => {
  const shape = zdef(L.ReferenceSchema).shape!;
  const family = unwrapOptional(shape["targetFamily"]!);
  return enumValues(family);
})();

export const REFERENCE_RESOLUTIONS = ["local", "imported", "external"] as const;

// ── Zod 4 internals, read-only ──────────────────────────────────────────

interface ZDef {
  type: string;
  shape?: Record<string, z.ZodTypeAny>;
  options?: z.ZodTypeAny[];
  getter?: () => z.ZodTypeAny;
  innerType?: z.ZodTypeAny;
  element?: z.ZodTypeAny;
  values?: unknown[];
  entries?: Record<string, unknown>;
  checks?: unknown[];
  discriminator?: string;
  in?: z.ZodTypeAny;
  out?: z.ZodTypeAny;
}
interface ZCheckDef {
  check: string;
  format?: string;
  pattern?: RegExp;
  minimum?: number;
  maximum?: number;
  value?: number;
  inclusive?: boolean;
}

export function zdef(schema: unknown): ZDef {
  const def = (schema as { _zod?: { def?: ZDef } } | undefined)?._zod?.def;
  if (!def) throw new Error("not a Zod 4 schema");
  return def;
}

function checkDefs(schema: unknown): ZCheckDef[] {
  return (zdef(schema).checks ?? []).map((c) => (c as { _zod: { def: ZCheckDef } })._zod.def);
}

/** Unwraps `.optional()` / `.nullable()` and reports whether the field was optional. */
export function unwrapOptional(schema: z.ZodTypeAny): z.ZodTypeAny {
  let cur = schema;
  for (;;) {
    const d = zdef(cur);
    if ((d.type === "optional" || d.type === "nullable") && d.innerType) cur = d.innerType;
    else return cur;
  }
}

function isOptional(schema: z.ZodTypeAny): boolean {
  return zdef(schema).type === "optional";
}

function enumValues(schema: z.ZodTypeAny): string[] {
  const d = zdef(schema);
  if (d.type === "enum") return Object.keys(d.entries ?? {});
  if (d.type === "literal") return (d.values ?? []).map(String);
  throw new Error(`not an enum: ${d.type}`);
}

/** The `ZodObject` arms behind a (possibly lazy, possibly nested) union. */
export function arms(schema: z.ZodTypeAny): z.ZodObject<z.ZodRawShape>[] {
  const d = zdef(schema);
  if (d.type === "lazy" && d.getter) return arms(d.getter());
  if (d.type === "union") return (d.options ?? []).flatMap(arms);
  if (d.type === "pipe" && d.out) return arms(d.out);
  if (d.type === "object") return [schema as z.ZodObject<z.ZodRawShape>];
  throw new Error(`cannot enumerate arms of a ${d.type}`);
}

/** The `kind` literal an arm declares. */
export function kindOf(arm: z.ZodTypeAny): string {
  const kind = zdef(arm).shape?.["kind"];
  if (!kind) throw new Error("arm has no kind");
  const values = zdef(kind).values ?? [];
  if (values.length !== 1) throw new Error("kind is not a single literal");
  return String(values[0]);
}

// ── Names ───────────────────────────────────────────────────────────────

export function kindToLocal(kind: string): string {
  return kind
    .split("_")
    .map((w) => (w.length === 0 ? w : w[0]!.toUpperCase() + w.slice(1)))
    .join("");
}

export function typeIdFor(kind: string): string {
  return `${VENDOR}:${kindToLocal(kind)}`;
}

export function kindToKebab(kind: string): string {
  return kind.replace(/_/g, "-");
}

/**
 * Host instance id for a source node. The source identifier charset
 * (`^[A-Za-z][A-Za-z0-9._~:/#-]*$`) is wider than the host's; characters
 * outside `[A-Za-z0-9._-]` become `-`. The original is kept in `source_id`,
 * so nothing is lost, and the importer resolves the (rare) collision two
 * different source ids can produce by suffixing.
 */
export function slugForHostId(sourceId: string): string {
  const slug = sourceId.replace(/[^A-Za-z0-9._-]/g, "-").replace(/^[^A-Za-z0-9]+/, "");
  return slug.length === 0 ? "node" : slug;
}

/** Instance ids are capped at 256 characters by the host; source ids run to 512. */
export const HOST_ID_MAX = 256;

/** Short, deterministic digest used to keep truncated ids and edge ids unique. */
export function shortDigest(text: string, length = 12): string {
  return createHash("sha256").update(text).digest("hex").slice(0, length);
}

export function hostIdFor(kind: string, sourceId: string): string {
  const prefix = `${VENDOR}:${kindToKebab(kind)}:`;
  const slug = slugForHostId(sourceId);
  const id = prefix + slug;
  if (id.length <= HOST_ID_MAX) return id;
  const digest = shortDigest(sourceId);
  return prefix + slug.slice(0, HOST_ID_MAX - prefix.length - digest.length - 1) + "-" + digest;
}

// ── Root and node arms ──────────────────────────────────────────────────

/** The root object behind `z.preprocess(..., LogicalKnowledgeBaseSemanticSchema)`. */
export function rootObject(): z.ZodObject<z.ZodRawShape> {
  const [root] = arms(L.LogicalKnowledgeBaseSchema);
  if (!root) throw new Error("root schema has no object");
  return root;
}

function processElementSchema(): z.ZodTypeAny {
  const elements = zdef(L.ProcessModelSchema).shape?.["elements"];
  const element = zdef(elements).element;
  if (!element) throw new Error("ProcessModel.elements is not an array");
  return element;
}

export type ArmPlacement = "root" | "step" | "element";

export interface NodeArm {
  kind: string;
  typeId: string;
  /** The root collection the node lives in, or the one its container lives in. */
  collection: RootCollection;
  placement: ArmPlacement;
  schema: z.ZodObject<z.ZodRawShape>;
}

const COLLECTION_SCHEMAS: Record<RootCollection, () => z.ZodTypeAny> = {
  namespaces: () => L.NamespaceDeclarationSchema,
  imports: () => L.ImportDeclarationSchema,
  modules: () => L.ModuleSchema,
  declarations: () => L.DeclarationSchema,
  statements: () => L.StatementSchema,
  rules: () => L.RuleSchema,
  constraints: () => L.ConstraintSchema,
  queries: () => L.QuerySchema,
  proofs: () => L.ProofSchema,
  argumentation: () => L.ArgumentationElementSchema,
  processes: () => L.ProcessModelSchema,
  conflictPolicies: () => L.ConflictPolicySchema,
  provenanceRecords: () => L.ProvenanceRecordSchema,
  interoperabilityMappings: () => L.InteroperabilityMappingSchema,
};

let ARMS_CACHE: NodeArm[] | undefined;

/** Every node kind that becomes a primitive type, in schema order. */
export function nodeArms(): NodeArm[] {
  if (ARMS_CACHE) return ARMS_CACHE;
  const out: NodeArm[] = [];
  const seen = new Set<string>();
  const push = (collection: RootCollection, placement: ArmPlacement, schema: z.ZodTypeAny) => {
    for (const arm of arms(schema)) {
      const kind = kindOf(arm);
      if (seen.has(kind)) throw new Error(`duplicate node kind ${kind}`);
      seen.add(kind);
      out.push({ kind, typeId: typeIdFor(kind), collection, placement, schema: arm });
    }
  };
  for (const collection of ROOT_COLLECTIONS) push(collection, "root", COLLECTION_SCHEMAS[collection]());
  push("proofs", "step", L.InferenceStepSchema);
  push("processes", "element", processElementSchema());
  ARMS_CACHE = out;
  return out;
}

export function armByKind(kind: string): NodeArm | undefined {
  return nodeArms().find((a) => a.kind === kind);
}

export function armByTypeId(typeId: string): NodeArm | undefined {
  return nodeArms().find((a) => a.typeId === typeId);
}

// ── Field mapping ───────────────────────────────────────────────────────

/** A field lifted out of the primitive into a relation type. */
export type Lifted =
  | { lift: "reference"; field: string; many: boolean; required: boolean }
  | { lift: "provenance" }
  | { lift: "steps"; field: string; required: boolean }
  | { lift: "elements"; required: boolean };

interface MappedField {
  field?: FieldDefT;
  lifted?: Lifted;
}

/** Recursive roots recognised by identity; their name is the `format` tag. */
const LAZY_ROOTS: ReadonlyMap<z.ZodTypeAny, string> = new Map<z.ZodTypeAny, string>([
  [L.FormulaSchema, "Formula"],
  [L.TermSchema, "Term"],
  [L.ExpressionSchema, "Expression"],
  [L.ValueExpressionSchema, "ValueExpression"],
  [L.TypeExpressionSchema, "TypeExpression"],
  [L.ConceptExpressionSchema, "ConceptExpression"],
  [L.VariableBindingSchema, "VariableBinding"],
  [L.JsonValueSchema, "JsonValue"],
]);

/** Exported schema objects → their names, for stable struct ids. */
const EXPORTED_NAMES: ReadonlyMap<unknown, string> = new Map(
  Object.entries(L)
    .filter(([, v]) => v !== null && typeof v === "object" && "_zod" in (v as object))
    .map(([k, v]) => [v, k.replace(/Schema$/, "")] as const),
);

const TEXT_THRESHOLD = 1024;

class StructRegistry {
  readonly structs = new Map<string, InlineStructDef>();
  private readonly byIdentity = new Map<unknown, string>();

  idFor(schema: z.ZodTypeAny, fallback: string): string {
    const known = this.byIdentity.get(schema);
    if (known) return known;
    const base = EXPORTED_NAMES.get(schema) ?? fallback;
    let id = base;
    let n = 2;
    while (this.structs.has(id) || [...this.byIdentity.values()].includes(id)) id = `${base}_${n++}`;
    this.byIdentity.set(schema, id);
    return id;
  }

  register(id: string, def: InlineStructDef): void {
    if (!this.structs.has(id)) this.structs.set(id, def);
  }
}

function validation(kind: string, value: number | string): FieldValidation {
  return { kind, value, level: "error" } as FieldValidation;
}

function baseField(name: string, kind: FieldDefT["kind"], required: boolean): FieldDefT {
  return { name, kind, required, validations: [] };
}

/**
 * Maps one schema node to a FieldDef, or reports that it must be lifted.
 * `owner` is the struct/type local name used to build fallback struct ids;
 * `topLevel` is true only for the fields of a node arm itself.
 */
function mapField(
  name: string,
  raw: z.ZodTypeAny,
  owner: string,
  registry: StructRegistry,
  topLevel: boolean,
  processElement: z.ZodTypeAny,
): MappedField {
  const required = !isOptional(raw);
  const schema = unwrapOptional(raw);
  const d = zdef(schema);

  // Lifted shapes (top-level fields of a node only).
  if (topLevel) {
    if (schema === L.ReferenceSchema) return { lifted: { lift: "reference", field: name, many: false, required } };
    if (d.type === "array" && d.element === L.ReferenceSchema) {
      return { lifted: { lift: "reference", field: name, many: true, required } };
    }
    if (name === "provenance" && d.type === "array" && d.element === L.ProvenanceLinkSchema) {
      return { lifted: { lift: "provenance" } };
    }
    if (d.type === "array" && d.element === L.InferenceStepSchema) {
      return { lifted: { lift: "steps", field: name, required } };
    }
    if (d.type === "array" && d.element === processElement) return { lifted: { lift: "elements", required } };
  }

  const lazyRoot = LAZY_ROOTS.get(schema);
  if (lazyRoot !== undefined) {
    return { field: { ...baseField(name, "json", required), format: `lkb:${lazyRoot}` } };
  }

  switch (d.type) {
    case "literal":
    case "enum":
      return { field: { ...baseField(name, "enum", required), enum_values: enumValues(schema) } };
    case "boolean":
      return { field: baseField(name, "boolean", required) };
    case "number": {
      const checks = checkDefs(schema);
      const isInt = checks.some((c) => c.check === "number_format");
      const field = baseField(name, isInt ? "integer" : "number", required);
      for (const c of checks) {
        if (c.check === "greater_than" && c.inclusive && typeof c.value === "number") {
          field.validations.push(validation("min", c.value));
        }
        if (c.check === "less_than" && c.inclusive && typeof c.value === "number") {
          field.validations.push(validation("max", c.value));
        }
      }
      return { field };
    }
    case "string": {
      const checks = checkDefs(schema);
      const fmt = checks.find((c) => c.check === "string_format");
      if (fmt?.format === "datetime") return { field: baseField(name, "datetime", required) };
      const max = checks.find((c) => c.check === "max_length")?.maximum;
      const field = baseField(name, max !== undefined && max > TEXT_THRESHOLD ? "text" : "string", required);
      if (fmt?.format === "regex" && fmt.pattern) field.validations.push(validation("pattern", fmt.pattern.source));
      const min = checks.find((c) => c.check === "min_length")?.minimum;
      if (min !== undefined) field.validations.push(validation("min_length", min));
      if (max !== undefined) field.validations.push(validation("max_length", max));
      if (fmt && fmt.format !== "regex") field.format = fmt.format;
      return { field };
    }
    case "union": {
      // The host's `json` kind holds objects only, so a union of scalars must
      // stay a scalar field: enums and literals merge into one enum, strings
      // stay strings. Object unions (a Formula or a Reference) are json.
      const options = (d.options ?? []).map((o) => unwrapOptional(o));
      const kinds = options.map((o) => zdef(o).type);
      if (options.length > 0 && kinds.every((k) => k === "enum" || k === "literal")) {
        const values = [...new Set(options.flatMap((o) => enumValues(o)))];
        return { field: { ...baseField(name, "enum", required), enum_values: values } };
      }
      if (options.length > 0 && kinds.every((k) => k === "string" || k === "enum" || k === "literal")) {
        return { field: baseField(name, "string", required) };
      }
      return { field: { ...baseField(name, "json", required), format: "json-union" } };
    }
    case "array": {
      const element = d.element;
      if (!element) return { field: { ...baseField(name, "json", required), format: "json-array" } };
      // A nested array (Reference[][]) becomes a list of lists; FieldDef nests item_field.
      const item = mapField("item", element, `${owner}_${name}`, registry, false, processElement);
      if (!item.field) return { field: { ...baseField(name, "json", required), format: "json-array" } };
      return { field: { ...baseField(name, "list", required), item_field: { ...item.field, required: false } } };
    }
    case "object": {
      const structId = registry.idFor(schema, `${owner}_${name}`);
      if (!registry.structs.has(structId)) {
        // Register a placeholder first so a (non-lazy) self-reference cannot recurse.
        registry.register(structId, { id: structId, fields: [] });
        const fields: FieldDefT[] = [];
        for (const [key, child] of Object.entries(d.shape ?? {})) {
          const mapped = mapField(key, child, structId, registry, false, processElement);
          if (mapped.field) fields.push(mapped.field);
        }
        registry.structs.set(structId, {
          id: structId,
          fields: fields.length > 0 ? fields : [baseField("value", "json", false)],
          description: `Struct \`${structId}\` of the LogicalKnowledgeBase schema.`,
        });
      }
      return { field: { ...baseField(name, "struct", required), struct_id: structId } };
    }
    case "lazy":
      return { field: { ...baseField(name, "json", required), format: "json-lazy" } };
    case "record":
      return { field: { ...baseField(name, "json", required), format: "json-record" } };
    case "tuple":
      return { field: { ...baseField(name, "json", required), format: "json-tuple" } };
    default:
      return { field: { ...baseField(name, "json", required), format: `json-${d.type}` } };
  }
}

/** The identifier pattern the schema uses for node ids, read from an arm. */
export function identifierPattern(): string {
  const [first] = nodeArms();
  const id = zdef(first!.schema).shape?.["id"];
  const fmt = checkDefs(id).find((c) => c.check === "string_format");
  if (!fmt?.pattern) throw new Error("node id has no pattern");
  return fmt.pattern.source;
}

function sourceIdField(description: string): FieldDefT {
  return {
    name: SOURCE_ID_FIELD,
    kind: "string",
    required: true,
    description,
    validations: [validation("pattern", identifierPattern()), validation("max_length", 512)],
  };
}

// ── Primitive and relation types ────────────────────────────────────────

export interface DerivedNodeType {
  arm: NodeArm;
  type: PrimitiveTypeDef;
  lifted: Lifted[];
}

export interface Derivation {
  nodeTypes: DerivedNodeType[];
  header: PrimitiveTypeDef;
  externalTarget: PrimitiveTypeDef;
  relationTypes: RelationTypeDef[];
  structs: InlineStructDef[];
}

const ID_FORMAT = { pattern: INSTANCE_ID_PATTERN, pattern_kind: "regex", uniqueness: "workbook" } as const;

function primitiveType(id: string, name: string, description: string, fields: FieldDefT[]): PrimitiveTypeDef {
  return {
    id,
    name,
    description,
    fields,
    id_format: { ...ID_FORMAT },
    inline_structs: [],
    is_partition_unit: false,
    scoped: false,
    constraints: [],
  } as PrimitiveTypeDef;
}

let DERIVATION_CACHE: Derivation | undefined;

export function derive(): Derivation {
  if (DERIVATION_CACHE) return DERIVATION_CACHE;
  const registry = new StructRegistry();
  const processElement = processElementSchema();
  const nodeTypes: DerivedNodeType[] = [];

  for (const arm of nodeArms()) {
    const local = kindToLocal(arm.kind);
    const fields: FieldDefT[] = [
      sourceIdField(`The node's identifier in the source document (\`${arm.kind}.id\`).`),
    ];
    const lifted: Lifted[] = [];
    for (const [name, child] of Object.entries(zdef(arm.schema).shape ?? {})) {
      if (name === "kind" || name === "id") continue;
      const mapped = mapField(name, child, local, registry, true, processElement);
      if (mapped.lifted) lifted.push(mapped.lifted);
      else if (mapped.field) fields.push(mapped.field);
    }
    const where =
      arm.placement === "root"
        ? `an element of the \`${arm.collection}\` collection`
        : arm.placement === "step"
          ? "an inference step nested in a proof (`lkb:has-step`)"
          : "an element nested in a process model (`lkb:has-element`)";
    nodeTypes.push({
      arm,
      lifted,
      type: primitiveType(
        arm.typeId,
        arm.kind,
        `\`${arm.kind}\` — ${where} of a LogicalKnowledgeBase document (schema ${L.CURRENT_SCHEMA_VERSION}).`,
        fields,
      ),
    });
  }

  // Header: the root document minus its collections.
  const headerFields: FieldDefT[] = [
    sourceIdField("The document's identifier (`logical_knowledge_base.id`)."),
  ];
  const collectionNames = new Set<string>(ROOT_COLLECTIONS);
  for (const [name, child] of Object.entries(zdef(rootObject()).shape ?? {})) {
    if (name === "kind" || name === "id" || collectionNames.has(name)) continue;
    const mapped = mapField(name, child, "LogicalKnowledgeBase", registry, false, processElement);
    if (mapped.field) headerFields.push(mapped.field);
  }
  const header = primitiveType(
    HEADER_TYPE_ID,
    HEADER_KIND,
    "The document header: schema and semantic-model versions, default semantics, logic profiles, canonical ordering and migration metadata. Exactly one per workbook; the fourteen collections are the other primitive types.",
    headerFields,
  );

  const externalTarget = primitiveType(
    EXTERNAL_TARGET_TYPE_ID,
    "external_target",
    "A reference target outside this document (`resolution: imported | external`). Created by the importer so a non-local reference can still be an edge; `source_id` is the referenced identifier.",
    [
      sourceIdField("The identifier the non-local reference names."),
      { ...baseField("external_uri", "string", false), description: "`Reference.externalUri`, when the reference is external." },
    ],
  );

  const relationTypes = deriveRelationTypes(nodeTypes);
  DERIVATION_CACHE = {
    nodeTypes,
    header,
    externalTarget,
    relationTypes,
    structs: [...registry.structs.values()],
  };
  return DERIVATION_CACHE;
}

function relationType(
  id: string,
  name: string,
  description: string,
  source_types: readonly string[] | "*",
  target_types: readonly string[] | "*",
  cardinality: RelationTypeDef["cardinality"],
  fields: FieldDefT[],
): RelationTypeDef {
  return {
    id,
    name,
    description,
    source_types: source_types === "*" ? "*" : [...source_types],
    target_types: target_types === "*" ? "*" : [...target_types],
    cardinality,
    fields,
    symmetric: false,
    transitive: false,
  } as RelationTypeDef;
}

const positionField = (required: boolean): FieldDefT => ({
  ...baseField("position", "integer", required),
  description: "Zero-based index in the source array; restores order on export.",
  validations: [validation("min", 0)],
});

export function referenceRelationId(field: string): string {
  return `${REF_RELATION_PREFIX}${field}`;
}

/**
 * Reference fields whose target family upstream names in a refinement —
 * `priorityOver` / `overrides` "must be rules" (RuleSchema's superRefine),
 * `constraint_group.members` "must be constraints". Upstream enforces that
 * only when the reference states a `targetFamily`; the profile makes it
 * unconditional, so these relation types declare their targets. A document
 * that points one of these fields outside the family is therefore refused on
 * import here where upstream would have tolerated it — a deliberate
 * tightening, recorded in the README. Every other field's family is a
 * per-instance choice in the schema and stays `*`.
 */
export const STATIC_TARGET_COLLECTIONS: Readonly<Record<string, RootCollection>> = {
  priorityOver: "rules",
  overrides: "rules",
  members: "constraints",
};

export function deriveRelationTypes(nodeTypes: readonly DerivedNodeType[]): RelationTypeDef[] {
  const refOwners = new Map<string, { sources: Set<string>; many: boolean }>();
  const stepSources = new Set<string>();
  const stepSlots = new Set<string>();
  const elementSources = new Set<string>();
  const provenanceSources = new Set<string>();

  for (const nt of nodeTypes) {
    for (const l of nt.lifted) {
      switch (l.lift) {
        case "reference": {
          const bucket = refOwners.get(l.field) ?? { sources: new Set(), many: false };
          bucket.sources.add(nt.type.id);
          bucket.many = bucket.many || l.many;
          refOwners.set(l.field, bucket);
          break;
        }
        case "provenance":
          provenanceSources.add(nt.type.id);
          break;
        case "steps":
          stepSources.add(nt.type.id);
          stepSlots.add(l.field);
          break;
        case "elements":
          elementSources.add(nt.type.id);
          break;
      }
    }
  }

  const stepTargets = nodeTypes.filter((n) => n.arm.placement === "step").map((n) => n.type.id);
  const elementTargets = nodeTypes.filter((n) => n.arm.placement === "element").map((n) => n.type.id);

  const out: RelationTypeDef[] = [];
  for (const field of [...refOwners.keys()].sort()) {
    const { sources, many } = refOwners.get(field)!;
    const staticCollection = STATIC_TARGET_COLLECTIONS[field];
    const staticTargets = staticCollection
      ? [
          ...nodeTypes.filter((n) => n.arm.placement === "root" && n.arm.collection === staticCollection).map((n) => n.type.id),
          EXTERNAL_TARGET_TYPE_ID,
        ]
      : undefined;
    out.push(
      relationType(
        referenceRelationId(field),
        field,
        staticTargets
          ? `\`${field}\` — a \`Reference\` field lifted into an edge. The schema names its family (\`${staticCollection}\`) in a refinement; the profile declares it as the target types (unconditionally, where upstream checks only a stated targetFamily). An \`${EXTERNAL_TARGET_TYPE_ID}\` remains legal for a non-local reference.`
          : `\`${field}\` — a \`Reference\` field lifted into an edge. \`resolution\` and \`target_family\` are the reference's own; a non-local reference targets an \`${EXTERNAL_TARGET_TYPE_ID}\`. Target types are open because the schema fixes the family per reference instance (\`lkb:val:reference-family\`).`,
        [...sources].sort(),
        staticTargets ?? "*",
        many ? "many-to-many" : "many-to-one",
        [
          { ...baseField("resolution", "enum", true), enum_values: [...REFERENCE_RESOLUTIONS] },
          { ...baseField("target_family", "enum", false), enum_values: [...TARGET_FAMILIES] },
          { ...baseField("external_uri", "string", false), validations: [validation("max_length", 4096)] },
          positionField(false),
        ],
      ),
    );
  }

  const roleValues = enumValues(zdef(L.ProvenanceLinkSchema).shape!["role"]!);
  out.push(
    relationType(
      PROVENANCE_RELATION_ID,
      "provenance",
      "A `ProvenanceLink` from any node to a `provenance_record`: the node was sourced from, derived from, generated by, validated by, reviewed by or asserted by that record.",
      [...provenanceSources].sort(),
      [typeIdFor("provenance_record")],
      "many-to-many",
      [
        { ...baseField("role", "enum", true), enum_values: roleValues },
        { ...baseField("source_fragment", "text", false), validations: [validation("max_length", 4096)] },
        positionField(false),
      ],
    ),
  );

  out.push(
    relationType(
      STEP_RELATION_ID,
      "has step",
      "Containment of an inference step in a proof. `slot` names the source array (`steps`, or `trace` on a counterexample); `position` its index.",
      [...stepSources].sort(),
      stepTargets,
      "one-to-many",
      [{ ...baseField("slot", "enum", true), enum_values: [...stepSlots].sort() }, positionField(true)],
    ),
  );

  out.push(
    relationType(
      ELEMENT_RELATION_ID,
      "has element",
      "Containment of an element (event, action or state instance, transition, trigger, sequence, concurrency, compensation handler) in a process model.",
      [...elementSources].sort(),
      elementTargets,
      "one-to-many",
      [positionField(true)],
    ),
  );

  out.push(
    relationType(
      MENTIONS_RELATION_ID,
      "mentions",
      "Derived: the source node's formulas, structs or bindings hold a local `Reference` to the target (a predicate applied, a constant used, a world named in a scope). Not a document field — the importer derives it and `lkb:val:mentions-current` reports drift — but as an edge it makes usage a relation query and lets the host refuse deleting a node that formulas still cite. `path` is the first occurrence, `count` the number of occurrences.",
      "*",
      "*",
      "many-to-many",
      [
        { ...baseField("path", "string", true), description: "JSON path of the first occurrence inside field_values, e.g. body[0].predicate.", validations: [validation("max_length", 512)] },
        { ...baseField("count", "integer", true), validations: [validation("min", 1)] },
        { ...baseField("target_family", "enum", false), enum_values: [...TARGET_FAMILIES] },
      ],
    ),
  );

  return out.sort((a, b) => a.id.localeCompare(b.id));
}

// ── The profile ─────────────────────────────────────────────────────────

export function deriveProfile(): DomainProfile {
  const d = derive();
  return {
    id: PROFILE_ID,
    version: PROFILE_VERSION,
    name: "logical-knowledge-base",
    label: `Logical Knowledge Base ${PROFILE_VERSION}`,
    description:
      "A logical knowledge base as a typed, event-sourced graph: declarations, statements, rules, constraints, queries, proofs, argumentation, processes, conflict policies, provenance records and interoperability mappings as primitives; every `Reference` field as a typed edge; the formula, term, type and concept languages as JSON validated by the vendored schema.",
    extends: [],
    categories: [],
    scopes: [],
    primitive_types: [d.header, ...d.nodeTypes.map((n) => n.type), d.externalTarget],
    relation_types: d.relationTypes,
    validation_rules: [],
    renderer_bindings: [],
    renderers: [
      {
        renderer_id: THEORY_RENDERER_ID,
        name: "Theory listing",
        output_format: "text/markdown",
        output_path: "theory.md",
        description: "The knowledge base as a document: namespaces, modules, declarations, statements, rules, constraints, queries, proofs, argumentation, processes and provenance, with formulas printed.",
      },
      {
        renderer_id: ARGUMENT_GRAPH_RENDERER_ID,
        name: "Argument graph",
        output_format: "image/svg+xml",
        output_path: "argument-graph.svg",
        description: "Claims and arguments with their support and attack edges, ranked so that what rests on what is visible.",
      },
    ],
    inline_structs: d.structs,
    templates: [],
    scope_sets: {},
    default_scope_set: "",
  } as DomainProfile;
}

/** Counts a reviewer (or a test) can assert the derivation against. */
export function derivationSummary(): {
  nodeKinds: number;
  primitiveTypes: number;
  relationTypes: number;
  referenceFields: number;
  referenceRelationTypes: number;
  astFields: number;
  structs: number;
} {
  const d = derive();
  const profile = deriveProfile();
  const referenceFields = d.nodeTypes.reduce(
    (n, t) => n + t.lifted.filter((l) => l.lift === "reference").length,
    0,
  );
  const astFields = profile.primitive_types.reduce(
    (n, t) =>
      n +
      t.fields.filter(
        (f) =>
          (f.kind === "json" && f.format?.startsWith("lkb:")) ||
          (f.kind === "list" && f.item_field?.kind === "json" && f.item_field.format?.startsWith("lkb:")),
      ).length,
    0,
  );
  return {
    nodeKinds: d.nodeTypes.length,
    primitiveTypes: profile.primitive_types.length,
    relationTypes: profile.relation_types.length,
    referenceFields,
    referenceRelationTypes: d.relationTypes.filter((r) => r.id.startsWith(REF_RELATION_PREFIX)).length,
    astFields,
    structs: d.structs.length,
  };
}

/** Deterministic JSON: keys sorted at every level, arrays in place. */
export function stableStringify(value: unknown, indent = 2): string {
  const norm = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(norm);
    if (v !== null && typeof v === "object") {
      return Object.fromEntries(
        Object.keys(v as object)
          .sort()
          .map((k) => [k, norm((v as Record<string, unknown>)[k])]),
      );
    }
    return v;
  };
  return JSON.stringify(norm(value), null, indent);
}
