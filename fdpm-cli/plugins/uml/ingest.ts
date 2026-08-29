/**
 * Ingest a UML model — in the source library's own shape — into an FDPM
 * workbook on profile:uml:2.5.
 *
 * ⚠ ARCHITECTURAL CONTRACT (PALS's LAW) — the model is untrusted input
 * regardless of who produced it (a modelling tool, an XMI converter, or
 * an LLM asked to draft a design). Step 1 parses it against
 * `UmlModelInput`, which rejects unknown fields; step 2 asserts what the
 * schema cannot — id uniqueness, referential validity of every `type` /
 * `general` / `memberEnd` / `annotatedElement` / `constrainedElement`
 * pointer, and that an association has at least two ends. A rejected
 * model writes nothing and throws a `verification` FDPMException whose
 * findings name each offending path. Every write after that still runs
 * the host's §7 pipeline, which re-validates each primitive against the
 * generated Zod validator.
 *
 * This function is also where the three normalisations documented in
 * schemas/uml-foundation.ts actually happen: camelCase and `xmi:id`
 * become snake_case and `xmi_id`; `"*"` upper bounds become `UNLIMITED`;
 * a raw default value becomes a ValueSpecification struct. Containment
 * arrays (`packagedElement`, `ownedAttribute`, `ownedOperation`,
 * `ownedParameter`, `ownedLiteral`, `ownedEnd`) are lifted into their
 * own primitives joined by relations, so a Property addressed by
 * `Association::memberEnd` is the same primitive the owning class
 * declares — not a second copy of it.
 */

import { z } from "zod";
import type { Host } from "../../src/core/host.js";
import { FDPMException } from "../../src/core/errors/fdpm-exception.js";
import { defineProject, type PrimitiveSpec, type RelationSpec } from "../../src/sdk.js";
import {
  PROFILE_ID,
  REL,
  VENDOR,
  primitiveId,
  type EntityName,
} from "./sidecar.js";
import {
  AggregationKind,
  CallConcurrencyKind,
  DependencyKind,
  ParameterDirectionKind,
  ParameterEffectKind,
  UNLIMITED,
  UmlId,
  ValueSpecificationKind,
  VisibilityKind,
} from "./schemas/uml-foundation.js";

// ── Input surface (the source library's shape, XMI naming) ─────────────

/** `"*"` is UML's unlimited; the profile stores it as -1. */
const UpperBound = z.union([z.number().int().nonnegative(), z.literal("*")]);

const RawValue = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.object({
    kind: ValueSpecificationKind.optional(),
    body: z.string().max(4000).optional(),
    language: z.string().max(80).optional(),
  }),
]);

type PropertyInput = z.infer<typeof PropertyIn>;
type OperationInput = z.infer<typeof OperationIn>;
type ParameterInput = z.infer<typeof ParameterIn>;

const base = {
  "xmi:id": UmlId,
  name: z.string().min(1).max(200).optional(),
  visibility: VisibilityKind.optional(),
} as const;

const multiplicity = {
  isOrdered: z.boolean().optional(),
  isUnique: z.boolean().optional(),
  lower: z.number().int().nonnegative().optional(),
  upper: UpperBound.optional(),
} as const;

const ParameterIn = z
  .object({
    ...base,
    ...multiplicity,
    "xmi:type": z.literal("uml:Parameter").optional(),
    type: UmlId.optional(),
    direction: ParameterDirectionKind.optional(),
    effect: ParameterEffectKind.optional(),
    isException: z.boolean().optional(),
    isStream: z.boolean().optional(),
    defaultValue: RawValue.optional(),
  })
  .strict();

const PropertyIn = z
  .object({
    ...base,
    ...multiplicity,
    "xmi:type": z.literal("uml:Property").optional(),
    type: UmlId.optional(),
    aggregation: AggregationKind.optional(),
    isReadOnly: z.boolean().optional(),
    isDerived: z.boolean().optional(),
    isDerivedUnion: z.boolean().optional(),
    isStatic: z.boolean().optional(),
    isID: z.boolean().optional(),
    isNavigable: z.boolean().optional(),
    defaultValue: RawValue.optional(),
  })
  .strict();

const OperationIn = z
  .object({
    ...base,
    ...multiplicity,
    "xmi:type": z.literal("uml:Operation").optional(),
    type: UmlId.optional(),
    isAbstract: z.boolean().optional(),
    isStatic: z.boolean().optional(),
    isQuery: z.boolean().optional(),
    concurrency: CallConcurrencyKind.optional(),
    ownedParameter: z.array(ParameterIn).optional(),
  })
  .strict();

const GeneralizationIn = z
  .object({
    general: UmlId,
    isSubstitutable: z.boolean().optional(),
  })
  .strict();

const LiteralIn = z.object({ ...base, "xmi:type": z.literal("uml:EnumerationLiteral").optional() }).strict();

const CLASSIFIER_KINDS = [
  "uml:Class",
  "uml:Interface",
  "uml:DataType",
  "uml:PrimitiveType",
  "uml:Enumeration",
  "uml:Association",
] as const;

/**
 * Explicit shape for the recursive packagedElement tree: TypeScript
 * cannot infer a type that references itself through z.lazy.
 */
export interface PackagedElementInput {
  "xmi:id": string;
  "xmi:type": (typeof CLASSIFIER_KINDS)[number] | "uml:Package" | "uml:Constraint";
  name?: string;
  visibility?: z.infer<typeof VisibilityKind>;
  uri?: string;
  isAbstract?: boolean;
  isActive?: boolean;
  isLeaf?: boolean;
  isFinalSpecialization?: boolean;
  isDerived?: boolean;
  specification?: z.infer<typeof RawValue>;
  constrainedElement?: string[];
  ownedAttribute?: PropertyInput[];
  ownedOperation?: OperationInput[];
  ownedLiteral?: Array<z.infer<typeof LiteralIn>>;
  ownedEnd?: PropertyInput[];
  memberEnd?: string[];
  generalization?: Array<z.infer<typeof GeneralizationIn>>;
  interfaceRealization?: Array<{ contract: string }>;
  clientDependency?: Array<{ supplier: string; kind?: z.infer<typeof DependencyKind> }>;
  packagedElement?: PackagedElementInput[];
}

const PackagedElementIn: z.ZodType<PackagedElementInput> = z
  .object({
    ...base,
    "xmi:type": z.enum([...CLASSIFIER_KINDS, "uml:Package", "uml:Constraint"]),
    uri: z.string().max(2000).optional(),
    isAbstract: z.boolean().optional(),
    isActive: z.boolean().optional(),
    isLeaf: z.boolean().optional(),
    isFinalSpecialization: z.boolean().optional(),
    isDerived: z.boolean().optional(),
    specification: RawValue.optional(),
    constrainedElement: z.array(UmlId).optional(),
    ownedAttribute: z.array(PropertyIn).optional(),
    ownedOperation: z.array(OperationIn).optional(),
    ownedLiteral: z.array(LiteralIn).optional(),
    ownedEnd: z.array(PropertyIn).optional(),
    memberEnd: z.array(UmlId).optional(),
    generalization: z.array(GeneralizationIn).optional(),
    interfaceRealization: z.array(z.object({ contract: UmlId }).strict()).optional(),
    clientDependency: z
      .array(z.object({ supplier: UmlId, kind: DependencyKind.optional() }).strict())
      .optional(),
    packagedElement: z.array(z.lazy(() => PackagedElementIn)).optional(),
  })
  .strict() as unknown as z.ZodType<PackagedElementInput>;

const CommentIn = z
  .object({
    "xmi:id": UmlId,
    body: z.string().min(1).max(8000),
    annotatedElement: z.array(UmlId).default([]),
  })
  .strict();

export const UmlModelInput = z
  .object({
    "xmi:id": UmlId,
    "xmi:type": z.literal("uml:Model").optional(),
    name: z.string().min(1).max(200),
    visibility: VisibilityKind.optional(),
    viewpoint: z.string().max(200).optional(),
    packagedElement: z.array(PackagedElementIn).default([]),
    ownedComment: z.array(CommentIn).default([]),
  })
  .strict();

export type UmlModelInputType = z.infer<typeof UmlModelInput>;
type PackagedElement = PackagedElementInput;

export interface IngestOptions {
  workbookId: string;
  workbookName?: string;
  description?: string;
}

export interface IngestReport {
  workbookId: string;
  profileId: string;
  modelId: string;
  primitives: number;
  relations: number;
  /** Metaclass → count, so a caller can assert what landed. */
  byType: Record<string, number>;
}

// ── Normalisation helpers (the three documented transformations) ───────

/** `"*"` → UNLIMITED (-1); anything else passes through. */
export function normalizeUpper(upper: number | "*" | undefined): number | undefined {
  if (upper === undefined) return undefined;
  return upper === "*" ? UNLIMITED : upper;
}

/** A raw JSON value → the closed ValueSpecification struct (§8.3). */
export function toValueSpecification(
  raw: z.infer<typeof RawValue> | undefined,
): { kind: string; body: string; language?: string } | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return { kind: "literal_null", body: "" };
  if (typeof raw === "boolean") return { kind: "literal_boolean", body: String(raw) };
  if (typeof raw === "number") {
    return Number.isInteger(raw)
      ? { kind: "literal_integer", body: String(raw) }
      : { kind: "literal_real", body: String(raw) };
  }
  if (typeof raw === "string") return { kind: "literal_string", body: raw };
  const kind = raw.kind ?? (raw.language ? "opaque_expression" : "literal_string");
  return {
    kind,
    body: raw.body ?? "",
    ...(raw.language !== undefined ? { language: raw.language } : {}),
  };
}

function drop<T extends Record<string, unknown>>(o: T): T {
  return JSON.parse(JSON.stringify(o)) as T;
}

function multiplicityFields(el: { isOrdered?: boolean; isUnique?: boolean; lower?: number; upper?: number | "*" }) {
  return drop({
    ...(el.isOrdered !== undefined ? { is_ordered: el.isOrdered } : {}),
    ...(el.isUnique !== undefined ? { is_unique: el.isUnique } : {}),
    ...(el.lower !== undefined ? { lower: el.lower } : {}),
    ...(normalizeUpper(el.upper) !== undefined ? { upper: normalizeUpper(el.upper) } : {}),
  });
}

function namedFields(el: { name?: string; visibility?: string }, qualified?: string) {
  return drop({
    ...(el.name !== undefined ? { name: el.name } : {}),
    ...(qualified !== undefined ? { qualified_name: qualified } : {}),
    ...(el.visibility !== undefined ? { visibility: el.visibility } : {}),
  });
}

/** `uml:Class` → `Class`, the EntityName the profile uses. */
function entityOf(xmiType: string): EntityName {
  return (xmiType.split(":").pop() ?? "Class") as EntityName;
}

// ── Semantic validation (what the schema cannot express) ───────────────

interface Finding {
  path: string;
  message: string;
}

/**
 * Parse and check a model. Returns the typed model or throws a
 * `verification` FDPMException carrying every finding.
 */
export function parseUmlModel(input: unknown): UmlModelInputType {
  const parsed = UmlModelInput.safeParse(input);
  if (!parsed.success) {
    throw new FDPMException(
      "verification",
      `UML model rejected by UmlModelInput (${parsed.error.issues.length} issue(s)); first: ${parsed.error.issues[0]?.path.join(".") || "<root>"}: ${parsed.error.issues[0]?.message ?? ""}`,
      { findings: parsed.error.issues, evidence: { issue_count: parsed.error.issues.length } },
    );
  }
  const model = parsed.data;

  const seen = new Map<string, string>();
  const findings: Finding[] = [];
  const declare = (id: string, path: string, kind: string): void => {
    if (seen.has(id)) findings.push({ path, message: `duplicate xmi:id "${id}" (already declared as ${seen.get(id)})` });
    else seen.set(id, kind);
  };
  const classifiers = new Set<string>();

  declare(model["xmi:id"], "xmi:id", "uml:Model");
  for (const c of model.ownedComment) declare(c["xmi:id"], `ownedComment.${c["xmi:id"]}`, "uml:Comment");

  const walk = (el: PackagedElement, path: string): void => {
    declare(el["xmi:id"], `${path}.xmi:id`, el["xmi:type"]);
    if ((CLASSIFIER_KINDS as readonly string[]).includes(el["xmi:type"])) classifiers.add(el["xmi:id"]);
    for (const [i, p] of (el.ownedAttribute ?? []).entries()) declare(p["xmi:id"], `${path}.ownedAttribute[${i}]`, "uml:Property");
    for (const [i, p] of (el.ownedEnd ?? []).entries()) declare(p["xmi:id"], `${path}.ownedEnd[${i}]`, "uml:Property");
    for (const [i, l] of (el.ownedLiteral ?? []).entries()) declare(l["xmi:id"], `${path}.ownedLiteral[${i}]`, "uml:EnumerationLiteral");
    for (const [i, o] of (el.ownedOperation ?? []).entries()) {
      declare(o["xmi:id"], `${path}.ownedOperation[${i}]`, "uml:Operation");
      for (const [j, prm] of (o.ownedParameter ?? []).entries()) {
        declare(prm["xmi:id"], `${path}.ownedOperation[${i}].ownedParameter[${j}]`, "uml:Parameter");
      }
    }
    if (el["xmi:type"] === "uml:Association") {
      const ends = (el.ownedEnd?.length ?? 0) + (el.memberEnd?.length ?? 0);
      if (ends < 2) {
        findings.push({
          path: `${path}.memberEnd`,
          message: `association "${el.name ?? el["xmi:id"]}" has ${ends} end(s); UML 2.5.1 §11.5.3 requires at least 2`,
        });
      }
    }
    for (const [i, child] of (el.packagedElement ?? []).entries()) walk(child, `${path}.packagedElement[${i}]`);
  };
  for (const [i, el] of model.packagedElement.entries()) walk(el, `packagedElement[${i}]`);

  // Referential pass — every pointer must name an element declared above.
  const ref = (id: string, path: string, mustBeClassifier = false): void => {
    if (!seen.has(id)) findings.push({ path, message: `unresolved reference "${id}"` });
    else if (mustBeClassifier && !classifiers.has(id)) {
      findings.push({ path, message: `"${id}" is a ${seen.get(id)}, not a classifier` });
    }
  };
  const checkRefs = (el: PackagedElement, path: string): void => {
    for (const [i, g] of (el.generalization ?? []).entries()) ref(g.general, `${path}.generalization[${i}].general`, true);
    for (const [i, r] of (el.interfaceRealization ?? []).entries()) ref(r.contract, `${path}.interfaceRealization[${i}].contract`, true);
    for (const [i, d] of (el.clientDependency ?? []).entries()) ref(d.supplier, `${path}.clientDependency[${i}].supplier`);
    for (const [i, m] of (el.memberEnd ?? []).entries()) ref(m, `${path}.memberEnd[${i}]`);
    for (const [i, c] of (el.constrainedElement ?? []).entries()) ref(c, `${path}.constrainedElement[${i}]`);
    for (const [i, p] of (el.ownedAttribute ?? []).entries()) {
      if (p.type) ref(p.type, `${path}.ownedAttribute[${i}].type`, true);
    }
    for (const [i, p] of (el.ownedEnd ?? []).entries()) {
      if (p.type) ref(p.type, `${path}.ownedEnd[${i}].type`, true);
    }
    for (const [i, o] of (el.ownedOperation ?? []).entries()) {
      if (o.type) ref(o.type, `${path}.ownedOperation[${i}].type`, true);
      for (const [j, prm] of (o.ownedParameter ?? []).entries()) {
        if (prm.type) ref(prm.type, `${path}.ownedOperation[${i}].ownedParameter[${j}].type`, true);
      }
    }
    for (const [i, child] of (el.packagedElement ?? []).entries()) checkRefs(child, `${path}.packagedElement[${i}]`);
  };
  for (const [i, el] of model.packagedElement.entries()) checkRefs(el, `packagedElement[${i}]`);
  for (const c of model.ownedComment) {
    for (const [i, a] of c.annotatedElement.entries()) ref(a, `ownedComment[${c["xmi:id"]}].annotatedElement[${i}]`);
  }

  if (findings.length > 0) {
    throw new FDPMException(
      "verification",
      `UML model failed semantic validation (${findings.length} finding(s)); first: ${findings[0]!.path}: ${findings[0]!.message}`,
      { findings, evidence: { finding_count: findings.length } },
    );
  }
  return model;
}

// ── Ingest ─────────────────────────────────────────────────────────────

export async function buildUmlWorkbook(
  host: Host,
  input: unknown,
  opts: IngestOptions,
): Promise<IngestReport> {
  const model = parseUmlModel(input);

  const primitives: PrimitiveSpec[] = [];
  const relations: RelationSpec[] = [];
  const byType: Record<string, number> = {};
  /** xmi:id → the primitive id it became, so references resolve. */
  const idOf = new Map<string, string>();

  const add = (entity: EntityName, xmiId: string, fields: Record<string, unknown>): string => {
    const id = primitiveId(entity, xmiId);
    primitives.push({ id, type: `${VENDOR}:${entity}`, fields: drop({ xmi_id: xmiId, ...fields }) });
    idOf.set(xmiId, id);
    const t = `${VENDOR}:${entity}`;
    byType[t] = (byType[t] ?? 0) + 1;
    return id;
  };
  const rel = (
    type: string,
    from: string,
    to: string,
    fields?: Record<string, unknown>,
  ): void => {
    const suffix = `${from.split(":").pop()}-${to.split(":").pop()}`;
    relations.push({
      id: `${VENDOR}:${type.split(":").pop()!.toLowerCase()}:${suffix}`,
      type,
      from,
      to,
      ...(fields && Object.keys(fields).length > 0 ? { fields: drop(fields) } : {}),
    });
  };

  const modelPrim = add("Model", model["xmi:id"], {
    ...namedFields(model, model.name),
    ...(model.viewpoint !== undefined ? { viewpoint: model.viewpoint } : {}),
  });

  /** Deferred because a `type` may point forward to a classifier declared later. */
  const typeEdges: Array<{ from: string; toXmi: string }> = [];
  const otherEdges: Array<() => void> = [];

  const addProperty = (p: PropertyInput, qualifiedPrefix: string): string => {
    const id = add("Property", p["xmi:id"], {
      ...namedFields(p, p.name ? `${qualifiedPrefix}::${p.name}` : undefined),
      ...multiplicityFields(p),
      ...(p.aggregation !== undefined ? { aggregation: p.aggregation } : {}),
      ...(p.isReadOnly !== undefined ? { is_read_only: p.isReadOnly } : {}),
      ...(p.isDerived !== undefined ? { is_derived: p.isDerived } : {}),
      ...(p.isDerivedUnion !== undefined ? { is_derived_union: p.isDerivedUnion } : {}),
      ...(p.isStatic !== undefined ? { is_static: p.isStatic } : {}),
      ...(p.isID !== undefined ? { is_id: p.isID } : {}),
      ...(toValueSpecification(p.defaultValue) !== undefined
        ? { default_value: toValueSpecification(p.defaultValue) }
        : {}),
    });
    return id;
  };

  const addOperation = (o: OperationInput, qualifiedPrefix: string): string => {
    const id = add("Operation", o["xmi:id"], {
      ...namedFields(o, o.name ? `${qualifiedPrefix}::${o.name}` : undefined),
      ...multiplicityFields(o),
      ...(o.isAbstract !== undefined ? { is_abstract: o.isAbstract } : {}),
      ...(o.isStatic !== undefined ? { is_static: o.isStatic } : {}),
      ...(o.isQuery !== undefined ? { is_query: o.isQuery } : {}),
      ...(o.concurrency !== undefined ? { concurrency: o.concurrency } : {}),
    });
    (o.ownedParameter ?? []).forEach((prm: ParameterInput, i) => {
      const pid = add("Parameter", prm["xmi:id"], {
        ...namedFields(prm, prm.name ? `${qualifiedPrefix}::${o.name ?? ""}::${prm.name}` : undefined),
        ...multiplicityFields(prm),
        ...(prm.direction !== undefined ? { direction: prm.direction } : {}),
        ...(prm.effect !== undefined ? { effect: prm.effect } : {}),
        ...(prm.isException !== undefined ? { is_exception: prm.isException } : {}),
        ...(prm.isStream !== undefined ? { is_stream: prm.isStream } : {}),
        ...(toValueSpecification(prm.defaultValue) !== undefined
          ? { default_value: toValueSpecification(prm.defaultValue) }
          : {}),
      });
      rel(REL.OwnsParameter, id, pid, { position: i });
      if (prm.type) typeEdges.push({ from: pid, toXmi: prm.type });
    });
    return id;
  };

  const walk = (el: PackagedElement, ownerId: string, qualifiedPrefix: string): void => {
    const entity = entityOf(el["xmi:type"]);
    const qualified = el.name ? (qualifiedPrefix ? `${qualifiedPrefix}::${el.name}` : el.name) : undefined;
    const fields: Record<string, unknown> = {
      ...namedFields(el, qualified),
      ...(el.uri !== undefined ? { uri: el.uri } : {}),
      ...(el.isAbstract !== undefined ? { is_abstract: el.isAbstract } : {}),
      ...(el.isActive !== undefined ? { is_active: el.isActive } : {}),
      ...(el.isLeaf !== undefined ? { is_leaf: el.isLeaf } : {}),
      ...(el.isFinalSpecialization !== undefined ? { is_final_specialization: el.isFinalSpecialization } : {}),
      ...(el.isDerived !== undefined && entity === "Association" ? { is_derived: el.isDerived } : {}),
      ...(entity === "Constraint"
        ? { specification: toValueSpecification(el.specification) ?? { kind: "literal_string", body: "" } }
        : {}),
    };
    const id = add(entity, el["xmi:id"], fields);
    rel(REL.Owns, ownerId, id);

    (el.ownedAttribute ?? []).forEach((p, i) => {
      const pid = addProperty(p, qualified ?? "");
      rel(REL.OwnsAttribute, id, pid, { position: i });
      if (p.type) typeEdges.push({ from: pid, toXmi: p.type });
    });
    (el.ownedEnd ?? []).forEach((p, i) => {
      const pid = addProperty(p, qualified ?? "");
      rel(REL.OwnsAttribute, id, pid, { position: i });
      rel(REL.MemberEnd, id, pid, { position: i, ...(p.isNavigable !== undefined ? { is_navigable: p.isNavigable } : {}) });
      if (p.type) typeEdges.push({ from: pid, toXmi: p.type });
    });
    (el.ownedOperation ?? []).forEach((o, i) => {
      const oid = addOperation(o, qualified ?? "");
      rel(REL.OwnsOperation, id, oid, { position: i });
      if (o.type) typeEdges.push({ from: oid, toXmi: o.type });
    });
    (el.ownedLiteral ?? []).forEach((l, i) => {
      const lid = add("EnumerationLiteral", l["xmi:id"], {
        ...namedFields(l, l.name && qualified ? `${qualified}::${l.name}` : undefined),
      });
      rel(REL.OwnsLiteral, id, lid, { position: i });
    });

    otherEdges.push(() => {
      for (const g of el.generalization ?? []) {
        rel(REL.Specializes, id, idOf.get(g.general)!, {
          ...(g.isSubstitutable !== undefined ? { is_substitutable: g.isSubstitutable } : {}),
        });
      }
      for (const r of el.interfaceRealization ?? []) rel(REL.Realizes, id, idOf.get(r.contract)!);
      for (const d of el.clientDependency ?? []) {
        rel(REL.DependsOn, id, idOf.get(d.supplier)!, { kind: d.kind ?? "dependency" });
      }
      (el.memberEnd ?? []).forEach((m, i) => {
        rel(REL.MemberEnd, id, idOf.get(m)!, { position: (el.ownedEnd?.length ?? 0) + i });
      });
      (el.constrainedElement ?? []).forEach((c) => rel(REL.Constrains, id, idOf.get(c)!));
    });

    for (const child of el.packagedElement ?? []) walk(child, id, qualified ?? "");
  };

  for (const el of model.packagedElement) walk(el, modelPrim, model.name);

  for (const c of model.ownedComment) {
    const cid = add("Comment", c["xmi:id"], { body: c.body });
    otherEdges.push(() => {
      for (const a of c.annotatedElement) rel(REL.Annotates, cid, idOf.get(a)!);
    });
  }

  for (const edge of typeEdges) rel(REL.TypedBy, edge.from, idOf.get(edge.toXmi)!);
  for (const emit of otherEdges) emit();

  await defineProject(host, {
    id: opts.workbookId,
    name: opts.workbookName ?? model.name,
    profile: PROFILE_ID,
    description: opts.description ?? `UML 2.5.1 model "${model.name}" (Foundation subset).`,
  })
    .primitives(primitives)
    .relations(relations)
    .commit();

  const slice = host.getProject(opts.workbookId);
  return {
    workbookId: opts.workbookId,
    profileId: PROFILE_ID,
    modelId: modelPrim,
    primitives: Object.keys(slice.primitives).length,
    relations: Object.keys(slice.relations).length,
    byType,
  };
}
