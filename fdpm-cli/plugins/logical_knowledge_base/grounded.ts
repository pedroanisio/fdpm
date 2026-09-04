/**
 * Grounded semantics for the argumentation frameworks a workbook declares.
 *
 * An `argumentation_framework` names its member arguments (`argumentRefs`),
 * the attack and support elements that bind them (`relationRefs`), a
 * `semantics`, and optionally the `acceptedArguments` the author believes
 * that semantics yields. Upstream stores the claim and checks nothing: under
 * the open-world reading a knowledge base cannot decide "no argument attacks
 * this one". A workbook is a closed graph, so for `grounded` the question is
 * decidable by iteration — the same move `plugins/re_crt/triage.ts` makes for
 * RE-CRT's blocked/bypassed leaves.
 *
 * Dung (1995): the grounded extension is the least fixpoint of the
 * characteristic function. Computed here as the usual labelling loop —
 * an argument is IN when every attacker is OUT (so unattacked arguments are
 * IN at once), OUT when some attacker is IN, and UNDEC when the loop stops
 * before deciding it (odd cycles, mutual attacks). Support elements do not
 * enter the computation: Dung frameworks have attacks only, and the schema's
 * `support_relation` has no semantics attached that would let it defeat one.
 *
 * Bounded by the member count: each pass labels at least one argument or
 * terminates.
 */
import type { PrimitiveInstance, RelationInstance } from "../../src/core/models/instance.js";
import { REF_RELATION_PREFIX, SOURCE_ID_FIELD, typeIdFor } from "./derive.js";

export type Label = "in" | "out" | "undec";

export interface Attack {
  from: string;
  to: string;
  /** Host id of the attack_relation / rebuttal / undercutter element. */
  via: string;
  kind: "attack_relation" | "rebuttal" | "undercutter";
}

export interface Framework {
  /** Host id of the framework primitive. */
  id: string;
  sourceId: string;
  semantics: string;
  /** Host ids of the member arguments, in `argumentRefs` order. */
  members: string[];
  attacks: Attack[];
  /** Host ids under `acceptedArguments`, when declared. */
  declaredAccepted: string[] | undefined;
}

type Prim = Pick<PrimitiveInstance, "id" | "type_id" | "field_values">;
type Rel = Pick<RelationInstance, "type_id" | "source_id" | "target_id" | "field_values">;

const FRAMEWORK = typeIdFor("argumentation_framework");
const ATTACK = typeIdFor("attack_relation");
const REBUTTAL = typeIdFor("rebuttal");
const UNDERCUTTER = typeIdFor("undercutter");

const ATTACK_ENDPOINTS: Record<string, { kind: Attack["kind"]; from: string; to: string }> = {
  [ATTACK]: { kind: "attack_relation", from: "attacker", to: "attacked" },
  [REBUTTAL]: { kind: "rebuttal", from: "rebuttingClaim", to: "targetClaim" },
  [UNDERCUTTER]: { kind: "undercutter", from: "claim", to: "targetArgument" },
};

const position = (r: Rel): number => {
  const p = r.field_values?.["position"];
  return typeof p === "number" ? p : 0;
};

/** Reference-edge targets of `source` under `field`, in position order. */
function refTargets(relations: readonly Rel[], source: string, field: string): string[] {
  return relations
    .filter((r) => r.source_id === source && r.type_id === `${REF_RELATION_PREFIX}${field}`)
    .sort((a, b) => position(a) - position(b))
    .map((r) => r.target_id);
}

/** Every framework in the slice with its members and the attacks among them. */
export function frameworks(primitives: readonly Prim[], relations: readonly Rel[]): Framework[] {
  const byId = new Map(primitives.map((p) => [p.id, p] as const));
  const out: Framework[] = [];
  for (const p of [...primitives].sort((a, b) => a.id.localeCompare(b.id))) {
    if (p.type_id !== FRAMEWORK) continue;
    const members = refTargets(relations, p.id, "argumentRefs");
    const memberSet = new Set(members);
    const attacks: Attack[] = [];
    for (const relId of refTargets(relations, p.id, "relationRefs")) {
      const element = byId.get(relId);
      const spec = element ? ATTACK_ENDPOINTS[element.type_id] : undefined;
      if (!element || !spec) continue; // support relations and unknown ids carry no attack
      for (const from of refTargets(relations, element.id, spec.from)) {
        for (const to of refTargets(relations, element.id, spec.to)) {
          if (memberSet.has(from) && memberSet.has(to)) attacks.push({ from, to, via: element.id, kind: spec.kind });
        }
      }
    }
    const accepted = refTargets(relations, p.id, "acceptedArguments");
    const semantics = p.field_values?.["semantics"];
    const sid = p.field_values?.[SOURCE_ID_FIELD];
    out.push({
      id: p.id,
      sourceId: typeof sid === "string" ? sid : p.id,
      semantics: typeof semantics === "string" ? semantics : "grounded",
      members,
      attacks,
      declaredAccepted: relations.some((r) => r.source_id === p.id && r.type_id === `${REF_RELATION_PREFIX}acceptedArguments`)
        ? accepted
        : undefined,
    });
  }
  return out;
}

/** The grounded labelling of a framework. */
export function groundedLabelling(members: readonly string[], attacks: readonly Attack[]): Map<string, Label> {
  const memberSet = new Set(members);
  const attackersOf = new Map<string, Set<string>>();
  for (const m of members) attackersOf.set(m, new Set());
  // An attacker outside the framework is not part of it: Dung's F = (A, R) with R ⊆ A × A.
  for (const a of attacks) if (memberSet.has(a.from)) attackersOf.get(a.to)?.add(a.from);
  const label = new Map<string, Label>();
  for (const m of members) label.set(m, "undec");
  let changed = true;
  let passes = 0;
  while (changed && passes <= members.length + 1) {
    changed = false;
    passes += 1;
    for (const m of members) {
      if (label.get(m) !== "undec") continue;
      const attackers = [...(attackersOf.get(m) ?? [])];
      if (attackers.every((a) => label.get(a) === "out")) {
        label.set(m, "in");
        changed = true;
      } else if (attackers.some((a) => label.get(a) === "in")) {
        label.set(m, "out");
        changed = true;
      }
    }
  }
  return label;
}

export interface GroundedResult {
  framework: Framework;
  labels: Map<string, Label>;
  accepted: string[];
  /** Declared-vs-computed difference, when the author declared a set. */
  disagreement: { missing: string[]; extra: string[] } | undefined;
}

/** Grounded results for every framework whose semantics is `grounded`. */
export function groundedResults(primitives: readonly Prim[], relations: readonly Rel[]): GroundedResult[] {
  return frameworks(primitives, relations)
    .filter((f) => f.semantics === "grounded")
    .map((framework) => {
      const labels = groundedLabelling(framework.members, framework.attacks);
      const accepted = framework.members.filter((m) => labels.get(m) === "in");
      let disagreement: GroundedResult["disagreement"];
      if (framework.declaredAccepted !== undefined) {
        const declared = new Set(framework.declaredAccepted);
        const computed = new Set(accepted);
        const missing = accepted.filter((a) => !declared.has(a));
        const extra = framework.declaredAccepted.filter((a) => !computed.has(a));
        if (missing.length > 0 || extra.length > 0) disagreement = { missing, extra };
      }
      return { framework, labels, accepted, disagreement };
    });
}

/** One label per node across all grounded frameworks (a node in two frameworks keeps the stricter: out > undec > in). */
export function labellingByNode(primitives: readonly Prim[], relations: readonly Rel[]): Map<string, Label> {
  const rank: Record<Label, number> = { in: 0, undec: 1, out: 2 };
  const out = new Map<string, Label>();
  for (const r of groundedResults(primitives, relations)) {
    for (const [id, l] of r.labels) {
      const prev = out.get(id);
      if (prev === undefined || rank[l] > rank[prev]) out.set(id, l);
    }
  }
  return out;
}
