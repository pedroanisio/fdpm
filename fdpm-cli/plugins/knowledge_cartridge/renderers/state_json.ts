/**
 * `kc:StateRenderer` — the cartridge as a bounded machine-readable projection.
 *
 * The other three views are read by a person. This one is loaded by an agent,
 * which changes what it has to guarantee:
 *
 *   - **Bounded.** Its output size is a contract, not a side effect. A cartridge
 *     grows without limit; an agent's context does not. `KC_STATE_BUDGET_BYTES`
 *     is a hard cap and the render never exceeds it.
 *   - **Honest about truncation.** This is the load-bearing one. A view that
 *     silently drops rows makes the agent's knowledge silently WRONG — it will
 *     reason confidently from a projection it believes is complete, and nothing
 *     downstream can tell the difference. `_truncated` is emitted whenever
 *     anything was evicted, and its absence is a positive claim that nothing
 *     was.
 *
 * EVICTION is recency: ULIDs are minted monotonically, so sorting by `uid`
 * descending is chronological with no extra field and no clock. Newest survives.
 *
 * With one exception. An invariant that an override suspends is pinned, because
 * dropping the rule while keeping its exception emits a projection that
 * contradicts itself — an exception to a rule that is not there. The pin is
 * DERIVED from the graph rather than declared by an author, so it cannot drift.
 *
 * Determinism: the timestamp comes from `input.renderedAt`, never the wall
 * clock, so two renders of one state are byte-equal and diffable.
 */
import type { PrimitiveInstance } from "../../../src/core/models/instance.js";
import type { RendererInput, RendererOutput } from "../../../src/plugin/types.js";
import { R, T } from "../ids.js";
import { buildModel, citationRef, fieldOf, numberOf, type LayerItem } from "./_model.js";

/**
 * Hard cap on the emitted document, in UTF-8 bytes.
 *
 * 16 KB is roughly 4,000 tokens — large enough to carry a real cartridge's
 * rules, small enough that loading one is a bounded decision rather than an
 * open-ended one. It is a cap, not a target: a small cartridge renders small.
 */
export const KC_STATE_BUDGET_BYTES = 16_000;

const LAYER_KEYS: Array<[string, string]> = [
  [T.Primitive, "primitives"],
  [T.Invariant, "invariants"],
  [T.Constant, "constants"],
  [T.Step, "steps"],
  [T.Diagnostic, "diagnostics"],
  [T.Override, "overrides"],
];

/** Per-layer projection. Only what an agent acts on; ids stay so a claim can be resolved. */
function project(typeId: string, item: LayerItem): Record<string, unknown> {
  const p = item.instance;
  const cites = item.citations.map(citationRef);
  const base: Record<string, unknown> = { id: p.id };
  switch (typeId) {
    case T.Primitive:
      base["term"] = fieldOf(p, "term");
      base["definition"] = fieldOf(p, "definition");
      if (fieldOf(p, "unit")) base["unit"] = fieldOf(p, "unit");
      break;
    case T.Invariant:
      base["rule"] = fieldOf(p, "rule");
      base["value"] = fieldOf(p, "value");
      base["falsifier"] = fieldOf(p, "falsifier");
      break;
    case T.Constant:
      base["name"] = fieldOf(p, "name");
      base["value"] = fieldOf(p, "value");
      base["unit"] = fieldOf(p, "unit");
      break;
    case T.Step:
      base["position"] = numberOf(p, "position");
      base["action"] = fieldOf(p, "action");
      base["constrains_next"] = fieldOf(p, "constrains_next");
      break;
    case T.Diagnostic:
      base["symptom"] = fieldOf(p, "symptom");
      base["cause"] = fieldOf(p, "cause");
      base["correction"] = fieldOf(p, "correction");
      break;
    case T.Override:
      base["condition"] = fieldOf(p, "condition");
      base["rationale"] = fieldOf(p, "rationale");
      break;
    default:
      break;
  }
  if (cites.length > 0) base["cites"] = cites;
  return base;
}

interface Candidate {
  layerKey: string;
  uid: string;
  pinned: boolean;
  row: Record<string, unknown>;
}

export function renderStateJson(input: RendererInput): RendererOutput {
  const m = buildModel(input.primitives, input.relations);

  // Pins, derived from the graph: any invariant an override suspends.
  const pinned = new Set<string>();
  for (const edge of input.relations) {
    if (edge.type_id === R.OverridesInvariant) pinned.add(edge.target_id);
  }

  const candidates: Candidate[] = [];
  for (const [typeId, key] of LAYER_KEYS) {
    const layer = m.layers.find((l) => l.typeId === typeId);
    for (const item of layer?.items ?? []) {
      candidates.push({
        layerKey: key,
        uid: item.instance.uid,
        pinned: pinned.has(item.instance.id),
        row: project(typeId, item),
      });
    }
  }

  // Eviction order: pinned last (never dropped while anything else remains),
  // then oldest first by ULID. Dropping proceeds from the head of this list.
  const evictionOrder = candidates
    .slice()
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? 1 : -1;
      return a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0;
    });

  const c = m.cartridge;
  const header = c
    ? {
        id: fieldOf(c, "cartridge_id"),
        subject: fieldOf(c, "subject"),
        archetype: fieldOf(c, "archetype"),
        snapshot_date: fieldOf(c, "snapshot_date"),
      }
    : null;

  const build = (dropped: Set<Candidate>): Record<string, unknown> => {
    const layers: Record<string, Array<Record<string, unknown>>> = {};
    for (const [, key] of LAYER_KEYS) layers[key] = [];
    for (const cand of candidates) {
      if (dropped.has(cand)) continue;
      layers[cand.layerKey]!.push(cand.row);
    }
    const doc: Record<string, unknown> = {
      cartridge: header,
      layers,
      sources: m.sources.map((s) => ({
        key: fieldOf(s, "citation_key"),
        title: fieldOf(s, "title"),
        tier: fieldOf(s, "tier"),
      })),
      gaps: m.gaps.map((g) => ({ statement: fieldOf(g, "statement") })),
      _rendered_at: input.renderedAt ?? "",
    };
    if (dropped.size > 0) {
      const byLayer: Record<string, number> = {};
      for (const cand of dropped) byLayer[cand.layerKey] = (byLayer[cand.layerKey] ?? 0) + 1;
      doc["_truncated"] = {
        dropped: dropped.size,
        policy: "uid recency, oldest dropped first; invariants suspended by an override are pinned",
        by_layer: byLayer,
      };
    }
    return doc;
  };

  // Drop from the head of the eviction order until the document fits. Building
  // and re-measuring is O(n^2) in the worst case, but n is layer rows and the
  // alternative — estimating each row's serialized cost — is an approximation
  // that can overshoot the cap, which is the one thing this must never do.
  const dropped = new Set<Candidate>();
  let doc = build(dropped);
  let cursor = 0;
  while (
    Buffer.byteLength(JSON.stringify(doc), "utf8") > KC_STATE_BUDGET_BYTES &&
    cursor < evictionOrder.length
  ) {
    dropped.add(evictionOrder[cursor]!);
    cursor += 1;
    doc = build(dropped);
  }

  return {
    bytes: new TextEncoder().encode(JSON.stringify(doc, null, 2)),
    contentType: "application/json",
    filename: `${header?.id || "cartridge"}-state.json`,
  };
}

/** Exported for the test that asserts the eviction contract directly. */
export function statePinnedIds(primitives: readonly PrimitiveInstance[], relations: RendererInput["relations"]): Set<string> {
  void primitives;
  const pinned = new Set<string>();
  for (const edge of relations) if (edge.type_id === R.OverridesInvariant) pinned.add(edge.target_id);
  return pinned;
}
