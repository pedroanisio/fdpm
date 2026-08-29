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
import { concreteAlternativesFor, isAbstractMetaclass } from "./abstract.js";
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
  ConnectorKind,
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

const PortIn = z
  .object({
    ...base,
    ...multiplicity,
    "xmi:type": z.literal("uml:Port").optional(),
    type: UmlId.optional(),
    aggregation: AggregationKind.optional(),
    isReadOnly: z.boolean().optional(),
    isDerived: z.boolean().optional(),
    isStatic: z.boolean().optional(),
    isBehavior: z.boolean().optional(),
    isConjugated: z.boolean().optional(),
    isService: z.boolean().optional(),
    defaultValue: RawValue.optional(),
    provided: z.array(UmlId).optional(),
    required: z.array(UmlId).optional(),
  })
  .strict();

const ConnectorEndIn = z
  .object({
    "xmi:id": UmlId,
    ...multiplicity,
    "xmi:type": z.literal("uml:ConnectorEnd").optional(),
    role: UmlId.optional(),
    partWithPort: UmlId.optional(),
  })
  .strict();

const ConnectorIn = z
  .object({
    ...base,
    "xmi:type": z.literal("uml:Connector").optional(),
    kind: ConnectorKind.optional(),
    isStatic: z.boolean().optional(),
    type: UmlId.optional(),
    end: z.array(ConnectorEndIn).optional(),
  })
  .strict();

const ComponentRealizationIn = z
  .object({
    "xmi:id": UmlId,
    "xmi:type": z.literal("uml:ComponentRealization").optional(),
    realizingClassifier: UmlId,
  })
  .strict();

const ReceptionIn = z
  .object({
    ...base,
    "xmi:type": z.literal("uml:Reception").optional(),
    signal: UmlId.optional(),
    isStatic: z.boolean().optional(),
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
  "uml:AssociationClass",
  "uml:Signal",
  "uml:Component",
  "uml:Artifact",
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
  ownedReception?: Array<z.infer<typeof ReceptionIn>>;
  ownedPort?: Array<z.infer<typeof PortIn>>;
  ownedConnector?: Array<z.infer<typeof ConnectorIn>>;
  realization?: Array<z.infer<typeof ComponentRealizationIn>>;
  provided?: string[];
  required?: string[];
  isIndirectlyInstantiated?: boolean;
  fileName?: string;
  nestedArtifact?: string[];
  manifestation?: string[];
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
    ownedReception: z.array(ReceptionIn).optional(),
    ownedPort: z.array(PortIn).optional(),
    ownedConnector: z.array(ConnectorIn).optional(),
    realization: z.array(ComponentRealizationIn).optional(),
    provided: z.array(UmlId).optional(),
    required: z.array(UmlId).optional(),
    isIndirectlyInstantiated: z.boolean().optional(),
    fileName: z.string().max(1000).optional(),
    nestedArtifact: z.array(UmlId).optional(),
    manifestation: z.array(UmlId).optional(),
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
  // An abstract metaclass would otherwise fail as a generic enum
  // mismatch, which tells the author nothing. Name the rule and the
  // concrete alternatives instead (UML 2.5.1; see ./abstract.ts).
  const abstractUses: Array<{ path: string; metaclass: string }> = [];
  const scanAbstract = (node: unknown, path: string): void => {
    if (Array.isArray(node)) {
      node.forEach((n, i) => scanAbstract(n, `${path}[${i}]`));
      return;
    }
    if (typeof node !== "object" || node === null) return;
    const rec = node as Record<string, unknown>;
    const xmiType = rec["xmi:type"];
    if (typeof xmiType === "string" && isAbstractMetaclass(xmiType.split(":").pop() ?? "")) {
      abstractUses.push({ path: `${path}.xmi:type`, metaclass: xmiType });
    }
    for (const [k, v] of Object.entries(rec)) {
      if (k !== "xmi:type") scanAbstract(v, path === "" ? k : `${path}.${k}`);
    }
  };
  scanAbstract(input, "");
  if (abstractUses.length > 0) {
    const first = abstractUses[0]!;
    const bare = first.metaclass.split(":").pop() ?? first.metaclass;
    throw new FDPMException(
      "verification",
      `UML model uses ${abstractUses.length} abstract metaclass(es); first: ${first.path}: "${first.metaclass}" is abstract in UML 2.5.1 and has no instances — use ${concreteAlternativesFor(bare)}.`,
      {
        findings: abstractUses.map((u) => ({
          path: u.path,
          message: `"${u.metaclass}" is abstract in UML 2.5.1 — use ${concreteAlternativesFor(u.metaclass.split(":").pop() ?? u.metaclass)}.`,
        })),
        evidence: { abstract_metaclasses: abstractUses.map((u) => u.metaclass) },
      },
    );
  }

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
  const signals = new Set<string>();
  const ports = new Set<string>();
  const interfaces = new Set<string>();
  const properties = new Set<string>();

  declare(model["xmi:id"], "xmi:id", "uml:Model");
  for (const c of model.ownedComment) declare(c["xmi:id"], `ownedComment.${c["xmi:id"]}`, "uml:Comment");

  const walk = (el: PackagedElement, path: string): void => {
    declare(el["xmi:id"], `${path}.xmi:id`, el["xmi:type"]);
    if ((CLASSIFIER_KINDS as readonly string[]).includes(el["xmi:type"])) classifiers.add(el["xmi:id"]);
    if (el["xmi:type"] === "uml:Signal") signals.add(el["xmi:id"]);
    if (el["xmi:type"] === "uml:Interface") interfaces.add(el["xmi:id"]);
    for (const pr of [...(el.ownedAttribute ?? []), ...(el.ownedEnd ?? [])]) properties.add(pr["xmi:id"]);
    for (const [i, p] of (el.ownedAttribute ?? []).entries()) declare(p["xmi:id"], `${path}.ownedAttribute[${i}]`, "uml:Property");
    for (const [i, p] of (el.ownedEnd ?? []).entries()) declare(p["xmi:id"], `${path}.ownedEnd[${i}]`, "uml:Property");
    for (const [i, l] of (el.ownedLiteral ?? []).entries()) declare(l["xmi:id"], `${path}.ownedLiteral[${i}]`, "uml:EnumerationLiteral");
    for (const [i, r] of (el.ownedReception ?? []).entries()) declare(r["xmi:id"], `${path}.ownedReception[${i}]`, "uml:Reception");
    for (const [i, pt] of (el.ownedPort ?? []).entries()) {
      declare(pt["xmi:id"], `${path}.ownedPort[${i}]`, "uml:Port");
      ports.add(pt["xmi:id"]);
    }
    for (const [i, c] of (el.ownedConnector ?? []).entries()) {
      declare(c["xmi:id"], `${path}.ownedConnector[${i}]`, "uml:Connector");
      for (const [j, e] of (c.end ?? []).entries()) {
        declare(e["xmi:id"], `${path}.ownedConnector[${i}].end[${j}]`, "uml:ConnectorEnd");
      }
      // UML 2.5.1 §11.2: a connector joins at least two ends.
      if ((c.end?.length ?? 0) < 2) {
        findings.push({
          path: `${path}.ownedConnector[${i}].end`,
          message: `connector "${c.name ?? c["xmi:id"]}" has ${c.end?.length ?? 0} end(s); UML 2.5.1 §11.2 requires at least 2`,
        });
      }
    }
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
  const refInterface = (id: string, path: string): void => {
    if (!seen.has(id)) findings.push({ path, message: `unresolved reference "${id}"` });
    else if (!interfaces.has(id)) {
      findings.push({
        path,
        message: `"${id}" is a ${seen.get(id)}, not an interface — provided/required name a uml:Interface (UML 2.5.1 §11.3)`,
      });
    }
  };
  const checkRefs = (el: PackagedElement, path: string): void => {
    for (const [i, g] of (el.generalization ?? []).entries()) ref(g.general, `${path}.generalization[${i}].general`, true);
    for (const [i, r] of (el.interfaceRealization ?? []).entries()) ref(r.contract, `${path}.interfaceRealization[${i}].contract`, true);
    for (const [i, d] of (el.clientDependency ?? []).entries()) ref(d.supplier, `${path}.clientDependency[${i}].supplier`);
    for (const [i, m] of (el.memberEnd ?? []).entries()) ref(m, `${path}.memberEnd[${i}]`);
    for (const [i, pt] of (el.ownedPort ?? []).entries()) {
      if (pt.type) ref(pt.type, `${path}.ownedPort[${i}].type`, true);
      for (const [j, iface] of (pt.provided ?? []).entries()) {
        refInterface(iface, `${path}.ownedPort[${i}].provided[${j}]`);
      }
      for (const [j, iface] of (pt.required ?? []).entries()) {
        refInterface(iface, `${path}.ownedPort[${i}].required[${j}]`);
      }
    }
    for (const [j, iface] of (el.provided ?? []).entries()) refInterface(iface, `${path}.provided[${j}]`);
    for (const [j, iface] of (el.required ?? []).entries()) refInterface(iface, `${path}.required[${j}]`);
    for (const [i, c] of (el.ownedConnector ?? []).entries()) {
      if (c.type) ref(c.type, `${path}.ownedConnector[${i}].type`, true);
      for (const [j, e] of (c.end ?? []).entries()) {
        const at = `${path}.ownedConnector[${i}].end[${j}]`;
        if (e.role !== undefined) {
          if (!seen.has(e.role)) findings.push({ path: `${at}.role`, message: `unresolved reference "${e.role}"` });
          else if (!properties.has(e.role) && !ports.has(e.role)) {
            findings.push({
              path: `${at}.role`,
              message: `"${e.role}" is a ${seen.get(e.role)}, not a role — a connector end attaches to a uml:Property or a uml:Port (UML 2.5.1 §11.2)`,
            });
          }
        }
        if (e.partWithPort !== undefined) {
          if (!seen.has(e.partWithPort)) {
            findings.push({ path: `${at}.partWithPort`, message: `unresolved reference "${e.partWithPort}"` });
          } else if (!properties.has(e.partWithPort)) {
            findings.push({
              path: `${at}.partWithPort`,
              message: `"${e.partWithPort}" is a ${seen.get(e.partWithPort)}, not a part — partWithPort names the containing uml:Property (§11.2)`,
            });
          }
        }
      }
    }
    for (const [i, r] of (el.realization ?? []).entries()) {
      ref(r.realizingClassifier, `${path}.realization[${i}].realizingClassifier`, true);
    }
    for (const [i, m] of (el.manifestation ?? []).entries()) ref(m, `${path}.manifestation[${i}]`);
    for (const [i, n] of (el.nestedArtifact ?? []).entries()) ref(n, `${path}.nestedArtifact[${i}]`);
    for (const [i, r] of (el.ownedReception ?? []).entries()) {
      if (r.signal === undefined) continue;
      const at = `${path}.ownedReception[${i}].signal`;
      if (!seen.has(r.signal)) findings.push({ path: at, message: `unresolved reference "${r.signal}"` });
      else if (!signals.has(r.signal)) {
        findings.push({ path: at, message: `"${r.signal}" is a ${seen.get(r.signal)}, not a signal — a reception reacts to a uml:Signal (UML 2.5.1 §11.4)` });
      }
    }
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
  /** Same, for Reception::signal. */
  const receptionSignals: Array<{ from: string; toXmi: string }> = [];
  /** Deferred edges whose target may be declared later in the tree. */
  const deferred: Array<{ type: string; from: string; toXmi: string }> = [];
  const later = (type: string, from: string, toXmi: string): void => {
    deferred.push({ type, from, toXmi });
  };
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
      ...(el.isDerived !== undefined && (entity === "Association" || entity === "AssociationClass")
        ? { is_derived: el.isDerived }
        : {}),
      ...(el.isIndirectlyInstantiated !== undefined
        ? { is_indirectly_instantiated: el.isIndirectlyInstantiated }
        : {}),
      ...(el.fileName !== undefined ? { file_name: el.fileName } : {}),
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
    (el.ownedPort ?? []).forEach((pt, i) => {
      const pid = add("Port", pt["xmi:id"], {
        ...namedFields(pt, pt.name && qualified ? `${qualified}::${pt.name}` : undefined),
        ...multiplicityFields(pt),
        ...(pt.aggregation !== undefined ? { aggregation: pt.aggregation } : {}),
        ...(pt.isReadOnly !== undefined ? { is_read_only: pt.isReadOnly } : {}),
        ...(pt.isDerived !== undefined ? { is_derived: pt.isDerived } : {}),
        ...(pt.isStatic !== undefined ? { is_static: pt.isStatic } : {}),
        ...(pt.isBehavior !== undefined ? { is_behavior: pt.isBehavior } : {}),
        ...(pt.isConjugated !== undefined ? { is_conjugated: pt.isConjugated } : {}),
        ...(pt.isService !== undefined ? { is_service: pt.isService } : {}),
        ...(toValueSpecification(pt.defaultValue) !== undefined
          ? { default_value: toValueSpecification(pt.defaultValue) }
          : {}),
      });
      rel(REL.OwnsPort, id, pid, { position: i });
      if (pt.type) typeEdges.push({ from: pid, toXmi: pt.type });
      for (const iface of pt.provided ?? []) later(REL.Provides, pid, iface);
      for (const iface of pt.required ?? []) later(REL.Requires, pid, iface);
    });
    (el.ownedConnector ?? []).forEach((c, i) => {
      const cid = add("Connector", c["xmi:id"], {
        ...namedFields(c, c.name && qualified ? `${qualified}::${c.name}` : undefined),
        ...(c.kind !== undefined ? { kind: c.kind } : {}),
        ...(c.isStatic !== undefined ? { is_static: c.isStatic } : {}),
      });
      rel(REL.OwnsConnector, id, cid, { position: i });
      if (c.type) typeEdges.push({ from: cid, toXmi: c.type });
      (c.end ?? []).forEach((e, j) => {
        const eid = add("ConnectorEnd", e["xmi:id"], { ...multiplicityFields(e) });
        rel(REL.OwnsConnectorEnd, cid, eid, { position: j });
        if (e.role) later(REL.ConnectorRole, eid, e.role);
        if (e.partWithPort) later(REL.PartWithPort, eid, e.partWithPort);
      });
    });
    for (const iface of el.provided ?? []) later(REL.Provides, id, iface);
    for (const iface of el.required ?? []) later(REL.Requires, id, iface);
    for (const r of el.realization ?? []) later(REL.RealizesComponent, r.realizingClassifier, el["xmi:id"]);
    for (const m of el.manifestation ?? []) later(REL.Manifests, id, m);
    for (const n of el.nestedArtifact ?? []) later(REL.NestsArtifact, id, n);
    (el.ownedReception ?? []).forEach((r, i) => {
      const rid = add("Reception", r["xmi:id"], {
        ...namedFields(r, r.name && qualified ? `${qualified}::${r.name}` : undefined),
        ...(r.isStatic !== undefined ? { is_static: r.isStatic } : {}),
      });
      rel(REL.OwnsReception, id, rid, { position: i });
      if (r.signal) receptionSignals.push({ from: rid, toXmi: r.signal });
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
  for (const edge of receptionSignals) rel(REL.Signals, edge.from, idOf.get(edge.toXmi)!);
  for (const edge of deferred) {
    // uml:RealizesComponent runs classifier → component, so its source is
    // the realizing classifier's xmi:id rather than a primitive id.
    const from = edge.type === REL.RealizesComponent ? idOf.get(edge.from)! : edge.from;
    rel(edge.type, from, idOf.get(edge.toXmi)!);
  }
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
