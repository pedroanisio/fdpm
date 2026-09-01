/**
 * §4.9 open-leaf triage: the grounded labelling, computed.
 *
 * The source ontology defines this classification in OWL, through
 * `recrt:UndefeatedActiveBarrier` — an `owl:complementOf`. "No bypass defeats
 * this barrier" is not provable under the open-world assumption, so on open
 * data the triage derives nothing: a leaf reaches the helper class
 * `recrt:BlockedOpen` and stops there. The ontology's own note that
 * `BlockedNoBypass` is a "positive branch [that] derives without closure" is
 * wrong for that reason — the outer quantifier is positive but its filler is
 * a complement, and the expression inherits the closure requirement.
 *
 * A workbook is a closed graph. The same question is therefore decidable by
 * iteration, with no reasoner, no closure axioms and no open-world caveat.
 * That is the whole argument for computing it here instead.
 *
 * The semantics are Dung's grounded labelling of the induced argumentation
 * framework (Dung 1995, doi:10.1016/0004-3702(94)00041-X; Caminada 2006,
 * doi:10.1007/11853886_11): barriers attack the open leaves they explain,
 * bypasses attack barriers, and a leaf is reinstated only when EVERY barrier
 * explaining it is defeated. Reinstatement is universal, not existential —
 * the existential reading (RE-CRT 5.0) called a leaf bypassed when one of its
 * two barriers was defeated, which sends a reader at a leaf that is still
 * firmly blocked.
 *
 * Pure by design: no Host, no I/O. The whole contract is testable from
 * literals, which is what lets the argumentation semantics be checked
 * independently of the workbook plumbing that feeds it.
 */

/** Obstruction node types, as the profile's `obstruction_type` enum spells them. */
export type ObstructionType = "barrier" | "conditional_barrier" | "bypass" | "open_bypass";

/** The §4.9 statuses, plus the documented failure mode. */
export type OpenLeafStatus =
  | "unblocked"
  | "blocked_but_bypassed"
  | "blocked_no_bypass"
  | "undecided";

export interface TriageInput {
  openLeaves: readonly { id: string; kind: "open" }[];
  obstructions: readonly { id: string; obstructionType: ObstructionType }[];
  /** δ: open leaf → the barriers explaining why it is open. */
  explainedByBarrier: readonly { leaf: string; barrier: string }[];
  /** The attack relation: bypass → the barrier it defeats. */
  bypassDefeatsBarrier: readonly { bypass: string; barrier: string }[];
}

/** Barrier kinds. Only these block; a bypass pointed at by δ is a data error. */
const ACTIVE: ReadonlySet<ObstructionType> = new Set(["barrier", "conditional_barrier"]);
/**
 * Only a VALIDATED bypass attacks.
 *
 * `open_bypass` records a POTENTIAL defeat — the obstruction-side analogue of
 * an open leaf — and the ontology is explicit that only validated bypasses
 * count in `recrt:DefeatedBarrier`. Treating one as an attacker would reinstate
 * a leaf on the strength of a bypass nobody has validated.
 */
const DEFEATER: ReadonlySet<ObstructionType> = new Set(["bypass"]);

type Label = "in" | "out" | "undec";

/**
 * Classify every open leaf.
 *
 * Returns a status for each leaf in `openLeaves`; the map is total, so a
 * caller never has to decide what an absent entry meant.
 */
export function classifyOpenLeaves(input: TriageInput): Map<string, OpenLeafStatus> {
  const typeOf = new Map(input.obstructions.map((o) => [o.id, o.obstructionType]));

  /* The attack relation, restricted only by ATTACKER kind. The target kind is
     deliberately not filtered: RE-CRT 6.1 forbids non-bipartite defeat as a
     DATA constraint (enforced here by the defeat-bipartite validator), and
     silently dropping such an edge would hide the very divergence that rule
     exists to prevent. Computing the real grounded labelling instead gives the
     correct answer on a bipartite graph and an honest `undecided` on one that
     is not. */
  const attackers = new Map<string, string[]>();
  for (const { bypass, barrier } of input.bypassDefeatsBarrier) {
    const attacker = typeOf.get(bypass);
    if (attacker === undefined || !DEFEATER.has(attacker)) continue;
    if (!typeOf.has(barrier)) continue;
    attackers.set(barrier, [...(attackers.get(barrier) ?? []), bypass]);
  }

  const label = groundedLabelling([...typeOf.keys()], attackers);

  const barriersOf = new Map<string, string[]>();
  for (const { leaf, barrier } of input.explainedByBarrier) {
    barriersOf.set(leaf, [...(barriersOf.get(leaf) ?? []), barrier]);
  }

  const out = new Map<string, OpenLeafStatus>();
  for (const leaf of input.openLeaves) {
    // A δ edge that does not point at an active barrier does not block.
    const active = (barriersOf.get(leaf.id) ?? []).filter((b) => {
      const t = typeOf.get(b);
      return t !== undefined && ACTIVE.has(t);
    });

    if (active.length === 0) {
      out.set(leaf.id, "unblocked");
    } else if (active.some((b) => label.get(b) === "in")) {
      // At least one barrier survives: the leaf is blocked, whatever else holds.
      out.set(leaf.id, "blocked_no_bypass");
    } else if (active.every((b) => label.get(b) === "out")) {
      // Universal reinstatement — every explaining barrier is defeated.
      out.set(leaf.id, "blocked_but_bypassed");
    } else {
      // Some barrier is `undec`: its defeat depends on a cycle.
      out.set(leaf.id, "undecided");
    }
  }
  return out;
}

/**
 * Dung's grounded labelling, computed to a fixpoint.
 *
 * `in` when every attacker is `out`; `out` when some attacker is `in`;
 * whatever the fixpoint cannot decide stays `undec`, which is precisely the
 * case a defeat cycle produces. The loop is bounded by the argument count, so
 * a cyclic graph terminates instead of spinning.
 */
function groundedLabelling(
  args: readonly string[],
  attackers: ReadonlyMap<string, readonly string[]>,
): Map<string, Label> {
  const label = new Map<string, Label>(args.map((a) => [a, "undec"]));
  for (let round = 0; round <= args.length; round += 1) {
    let changed = false;
    for (const a of args) {
      if (label.get(a) !== "undec") continue;
      const atk = attackers.get(a) ?? [];
      if (atk.every((x) => label.get(x) === "out")) {
        label.set(a, "in");
        changed = true;
      } else if (atk.some((x) => label.get(x) === "in")) {
        label.set(a, "out");
        changed = true;
      }
    }
    if (!changed) break;
  }
  return label;
}
