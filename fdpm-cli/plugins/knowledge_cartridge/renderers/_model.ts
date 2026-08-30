/**
 * The one graph walk all three renderers share.
 *
 * Built once per render from the flat primitive and relation lists the host
 * hands a renderer, because each of the three views needs the same four joins
 * — item to its citations, citation to its source, override to the invariant
 * it suspends, gap to its envelope item — and doing them three times invites
 * three subtly different answers to "is this claim cited".
 *
 * Ordering is fixed here rather than left to insertion order. Relation and
 * primitive collections are sets; nothing in the host promises a stable order,
 * and a renderer whose output moves between runs cannot be byte-compared in a
 * determinism test.
 */
import type { PrimitiveInstance, RelationInstance } from "../../../src/core/models/instance.js";
import { R, T } from "../ids.js";
import { LAYER_TYPE_IDS, NORMATIVE_TYPE_IDS } from "../primitives.js";

export interface Citation {
  sourceId: string;
  citationKey: string;
  sourceTitle: string;
  ordinal: number;
  locator: string | undefined;
}

export interface LayerItem {
  instance: PrimitiveInstance;
  citations: Citation[];
}

export interface CartridgeModel {
  cartridge: PrimitiveInstance | undefined;
  covered: PrimitiveInstance[];
  excluded: PrimitiveInstance[];
  sources: PrimitiveInstance[];
  defects: PrimitiveInstance[];
  gaps: PrimitiveInstance[];
  conflicts: PrimitiveInstance[];
  /** Layer items in layer order, each with its resolved citations. */
  layers: Array<{ typeId: string; label: string; items: LayerItem[] }>;
  /** Override id → the invariant ids it suspends. */
  overrideTargets: Map<string, string[]>;
  harvest: { total: number; retained: number; discarded: number; discardRate: number | null };
  /** Normative items carrying no citation. Empty in a cartridge that passed the gate. */
  uncited: PrimitiveInstance[];
}

export const LAYER_LABELS: Record<string, string> = {
  [T.Primitive]: "L0 · Primitives",
  [T.Invariant]: "L1 · Invariants",
  [T.Constant]: "L2 · Constants",
  [T.Step]: "L3 · Procedures",
  [T.Diagnostic]: "L4 · Diagnostics",
  [T.Override]: "L5 · Judgement",
};

function byId(a: PrimitiveInstance, b: PrimitiveInstance): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export function buildModel(
  primitives: readonly PrimitiveInstance[],
  relations: readonly RelationInstance[],
): CartridgeModel {
  const ofType = (typeId: string): PrimitiveInstance[] =>
    primitives.filter((p) => p.type_id === typeId).slice().sort(byId);

  const sources = ofType(T.Source);
  const sourceById = new Map(sources.map((s) => [s.id, s]));

  const citationEdges = relations
    .filter((r) => r.type_id === R.CitesSource)
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const citationsBySource = new Map<string, Citation[]>();
  for (const edge of citationEdges) {
    const src = sourceById.get(edge.target_id);
    const list = citationsBySource.get(edge.source_id) ?? [];
    list.push({
      sourceId: edge.target_id,
      citationKey: src ? str(src.field_values["citation_key"]) : edge.target_id,
      sourceTitle: src ? str(src.field_values["title"]) : "(unknown source)",
      ordinal: num(edge.field_values["ordinal"]),
      locator: typeof edge.field_values["locator"] === "string" ? edge.field_values["locator"] : undefined,
    });
    citationsBySource.set(edge.source_id, list);
  }
  for (const list of citationsBySource.values()) {
    list.sort((a, b) => a.citationKey.localeCompare(b.citationKey) || a.ordinal - b.ordinal);
  }

  const layers = LAYER_TYPE_IDS.map((typeId) => ({
    typeId,
    label: LAYER_LABELS[typeId] ?? typeId,
    items: ofType(typeId).map((instance) => ({
      instance,
      citations: citationsBySource.get(instance.id) ?? [],
    })),
  }));

  const overrideTargets = new Map<string, string[]>();
  for (const edge of relations.filter((r) => r.type_id === R.OverridesInvariant)) {
    const list = overrideTargets.get(edge.source_id) ?? [];
    list.push(edge.target_id);
    overrideTargets.set(edge.source_id, list);
  }
  for (const list of overrideTargets.values()) list.sort();

  const harvestRows = ofType(T.Harvest);
  const discarded = harvestRows.filter((h) => h.field_values["retained"] === false).length;
  const retained = harvestRows.length - discarded;

  const normative = new Set<string>(NORMATIVE_TYPE_IDS);
  const uncited = primitives
    .filter((p) => normative.has(p.type_id) && (citationsBySource.get(p.id) ?? []).length === 0)
    .slice()
    .sort(byId);

  const envelope = ofType(T.EnvelopeItem);

  return {
    cartridge: ofType(T.Cartridge)[0],
    covered: envelope.filter((e) => e.field_values["disposition"] === "covered"),
    excluded: envelope.filter((e) => e.field_values["disposition"] === "excluded"),
    sources,
    defects: ofType(T.CorpusDefect),
    gaps: ofType(T.Gap),
    conflicts: ofType(T.Conflict),
    layers,
    overrideTargets,
    harvest: {
      total: harvestRows.length,
      retained,
      discarded,
      discardRate: harvestRows.length === 0 ? null : discarded / harvestRows.length,
    },
    uncited,
  };
}

/** `KEY:ordinal`, the citation form the generator protocol mandates. */
export function citationRef(c: Citation): string {
  return c.locator ? `${c.citationKey}:${c.ordinal} (${c.locator})` : `${c.citationKey}:${c.ordinal}`;
}

export function fieldOf(p: PrimitiveInstance, name: string): string {
  return str(p.field_values[name]);
}

export function numberOf(p: PrimitiveInstance, name: string): number {
  return num(p.field_values[name]);
}
