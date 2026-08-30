// The agent-memory contract: the typed parse for stored memory instances, the semantic rules a
// per-field schema cannot express, the bounded merge operator that applies a model-proposed patch,
// and the capability bus an agent reads before it writes.
//
// ARCHITECTURAL REQUIREMENT: LLMs will always produce some form of error.
// Absence of output verification is a design defect, not a runtime bug.
// All LLM output must be treated as untrusted and validated explicitly.

import { z } from "zod";
import type { Issue, ParseResult } from "./_contract-types.js";

export type { Issue, ParseResult };

// -- Identity -----------------------------------------------------------------------------------

/** The instance kinds a memory store may hold. */
export const MEMORY_KINDS = ["episode", "fact", "hypothesis", "artifact", "action", "decision"] as const;

export type MemoryKind = (typeof MEMORY_KINDS)[number];

/**
 * The relation types a memory store may hold.
 *
 * `superseded_by` runs from the stale fact to the fact that replaced it, so an edge reads in its
 * own direction: `source` is superseded by `target`. The inverse spelling would make the advertised
 * surface assert the opposite of what the contract enforces.
 */
export const RELATION_TYPES = ["superseded_by", "supports", "refutes", "produced", "derived_from"] as const;

export type RelationType = (typeof RELATION_TYPES)[number];

/**
 * Every instance id is its own kind followed by eight hex digits, so an id names the type of the
 * thing it addresses. A patch that points at the wrong kind is refused on the id alone.
 */
export function idPatternFor(kind: MemoryKind): string {
  return `^${kind}-[0-9a-f]{8}$`;
}

const instanceId = z.string().regex(/^(?:episode|fact|hypothesis|artifact|action|decision)-[0-9a-f]{8}$/u);
const relationId = z.string().regex(/^rel-[0-9a-f]{8}$/u);
const step = z.number().int().nonnegative();
const nonEmpty = z.string().min(1);

// -- Instances ----------------------------------------------------------------------------------

const episode = z.strictObject({
  id: instanceId,
  kind: z.literal("episode"),
  skill_id: nonEmpty,
  objective: nonEmpty,
  status: z.enum(["active", "complete", "failed", "abandoned"]),
  started_at: z.string().datetime(),
  horizon_step: step,
});

const fact = z.strictObject({
  id: instanceId,
  kind: z.literal("fact"),
  episode_id: instanceId,
  claim: nonEmpty,
  source: z.enum(["observation", "inference", "user"]),
  observed_at_step: step,
  superseded: z.boolean(),
});

const hypothesis = z.strictObject({
  id: instanceId,
  kind: z.literal("hypothesis"),
  episode_id: instanceId,
  statement: nonEmpty,
  status: z.enum(["open", "confirmed", "refuted"]),
  tested_at_step: step.optional(),
});

const artifact = z.strictObject({
  id: instanceId,
  kind: z.literal("artifact"),
  episode_id: instanceId,
  path: nonEmpty,
  role: z.enum(["input", "output", "reference"]),
  last_seen_step: step,
});

const action = z.strictObject({
  id: instanceId,
  kind: z.literal("action"),
  episode_id: instanceId,
  command: nonEmpty,
  outcome: z.enum(["success", "failure", "error"]),
  step,
  summary: nonEmpty.optional(),
});

const decision = z.strictObject({
  id: instanceId,
  kind: z.literal("decision"),
  episode_id: instanceId,
  choice: nonEmpty,
  rationale: nonEmpty.optional(),
  step,
});

const shapes = { episode, fact, hypothesis, artifact, action, decision } as const;

const memoryInstance = z.discriminatedUnion("kind", [episode, fact, hypothesis, artifact, action, decision]);

export type MemoryInstance = z.infer<typeof memoryInstance>;
export type Episode = z.infer<typeof episode>;
export type Fact = z.infer<typeof fact>;
export type Hypothesis = z.infer<typeof hypothesis>;

// -- Relations ----------------------------------------------------------------------------------

/** The endpoint kinds and per-source bound of each relation type. */
export const RELATION_SPECS: Readonly<
  Record<RelationType, { readonly source: MemoryKind; readonly target: MemoryKind; readonly maxPerSource: number | null }>
> = {
  superseded_by: { source: "fact", target: "fact", maxPerSource: 1 },
  supports: { source: "fact", target: "hypothesis", maxPerSource: null },
  refutes: { source: "fact", target: "hypothesis", maxPerSource: null },
  produced: { source: "action", target: "fact", maxPerSource: null },
  derived_from: { source: "decision", target: "fact", maxPerSource: null },
};

const memoryRelation = z.strictObject({
  id: relationId,
  type: z.enum(RELATION_TYPES),
  source: instanceId,
  target: instanceId,
});

export type MemoryRelation = z.infer<typeof memoryRelation>;

// -- Store --------------------------------------------------------------------------------------

const memoryStore = z.strictObject({
  schema_version: z.string().regex(/^\d+\.\d+\.\d+$/u),
  instances: z.array(memoryInstance).readonly(),
  relations: z.array(memoryRelation).readonly(),
});

export type MemoryStore = z.infer<typeof memoryStore>;

/** The version this module parses. A store declaring another major version is refused. */
export const SCHEMA_VERSION = "2.0.0";

// -- Semantic rules -----------------------------------------------------------------------------

function kindOf(id: string): MemoryKind | undefined {
  const prefix = id.split("-")[0];
  return MEMORY_KINDS.find((kind) => kind === prefix);
}

/**
 * The constraints the per-field schema cannot express: identity agreement, partition integrity,
 * referential validity, cardinality, and the evidence rules that keep a conclusion attached to
 * live facts rather than superseded ones.
 */
function semanticIssues(value: MemoryStore): Issue[] {
  const issues: Issue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });

  const byId = new Map<string, MemoryInstance>();
  value.instances.forEach((instance, index) => {
    if (byId.has(instance.id)) add(`instances/${index}/id`, `${instance.id} is declared more than once`);
    byId.set(instance.id, instance);
  });

  value.instances.forEach((instance, index) => {
    const at = `instances/${index}`;
    if (kindOf(instance.id) !== instance.kind) {
      add(`${at}/id`, `id ${instance.id} does not name a ${instance.kind}`);
    }
    if (instance.kind === "episode") return;

    const owner = byId.get(instance.episode_id);
    if (owner === undefined) {
      add(`${at}/episode_id`, `episode ${instance.episode_id} does not exist`);
    } else if (owner.kind !== "episode") {
      add(`${at}/episode_id`, `${instance.episode_id} is not an episode`);
    }
  });

  const episodeOf = (id: string): string | undefined => {
    const instance = byId.get(id);
    if (instance === undefined) return undefined;
    return instance.kind === "episode" ? instance.id : instance.episode_id;
  };

  const replacementsOf = new Map<string, string[]>();
  const seenRelationIds = new Set<string>();

  value.relations.forEach((relation, index) => {
    const at = `relations/${index}`;
    if (seenRelationIds.has(relation.id)) add(`${at}/id`, `${relation.id} is declared more than once`);
    seenRelationIds.add(relation.id);

    const spec = RELATION_SPECS[relation.type];
    const source = byId.get(relation.source);
    const target = byId.get(relation.target);

    if (source === undefined) {
      add(`${at}/source`, `${relation.source} does not exist`);
    } else if (source.kind !== spec.source) {
      add(`${at}/source`, `${relation.type} starts at a ${spec.source}, not a ${source.kind}`);
    }

    if (target === undefined) {
      add(`${at}/target`, `${relation.target} does not exist`);
    } else if (target.kind !== spec.target) {
      add(`${at}/target`, `${relation.type} ends at a ${spec.target}, not a ${target.kind}`);
    }

    if (source !== undefined && target !== undefined) {
      const sourceEpisode = episodeOf(relation.source);
      const targetEpisode = episodeOf(relation.target);
      if (sourceEpisode !== undefined && targetEpisode !== undefined && sourceEpisode !== targetEpisode) {
        add(`${at}`, `a relation may not cross episodes`);
      }
    }

    if (relation.type === "superseded_by") {
      if (relation.source === relation.target) add(`${at}/target`, `a fact may not be superseded by itself`);
      // A chain is a history only if it runs forward. Without this a reading from step 3 could
      // replace one from step 9, and the order in which claims changed would be unrecoverable.
      if (source?.kind === "fact" && target?.kind === "fact" && target.observed_at_step <= source.observed_at_step) {
        add(`${at}/target`, `a replacement must be observed after the fact it replaces`);
      }
      const existing = replacementsOf.get(relation.source) ?? [];
      existing.push(relation.target);
      replacementsOf.set(relation.source, existing);
    }
  });

  for (const [source, targets] of replacementsOf) {
    const bound = RELATION_SPECS.superseded_by.maxPerSource;
    if (bound !== null && targets.length > bound) {
      add(`relations`, `fact ${source} names ${targets.length} replacements, above the bound of ${bound}`);
    }
  }

  // A supersession chain records which fact replaced which. A cycle would make "current" undefined.
  for (const start of replacementsOf.keys()) {
    const seen = new Set<string>([start]);
    let cursor: string | undefined = replacementsOf.get(start)?.[0];
    while (cursor !== undefined) {
      if (seen.has(cursor)) {
        add(`relations`, `supersession chain through ${start} is cyclic`);
        break;
      }
      seen.add(cursor);
      cursor = replacementsOf.get(cursor)?.[0];
    }
  }

  value.instances.forEach((instance, index) => {
    const at = `instances/${index}`;
    if (instance.kind === "fact") {
      const outgoing = replacementsOf.get(instance.id)?.length ?? 0;
      if (instance.superseded && outgoing === 0) {
        add(`${at}/superseded`, `a superseded fact must name the fact that replaced it`);
      }
      if (!instance.superseded && outgoing > 0) {
        add(`${at}/superseded`, `a fact that names its replacement must be marked superseded`);
      }
    }
  });

  const edges = (type: RelationType, target: string): readonly MemoryRelation[] =>
    value.relations.filter((relation) => relation.type === type && relation.target === target);

  value.instances.forEach((instance, index) => {
    if (instance.kind !== "hypothesis") return;
    const at = `instances/${index}/status`;
    if (instance.status === "confirmed") {
      const supporting = edges("supports", instance.id);
      if (supporting.length === 0) add(at, `a confirmed hypothesis requires at least one supporting fact`);
      const live = supporting.filter((relation) => {
        const source = byId.get(relation.source);
        return source !== undefined && source.kind === "fact" && !source.superseded;
      });
      if (supporting.length > 0 && live.length === 0) {
        add(at, `a confirmed hypothesis rests only on superseded facts`);
      }
    }
    if (instance.status === "refuted" && edges("refutes", instance.id).length === 0) {
      add(at, `a refuted hypothesis requires at least one refuting fact`);
    }
    if (instance.status !== "open" && instance.tested_at_step === undefined) {
      add(`instances/${index}/tested_at_step`, `a ${instance.status} hypothesis must record when it was tested`);
    }
  });

  return issues;
}

/** Parse an untrusted value into a memory store, or report every reason it was refused. */
export function parseMemoryStore(value: unknown): ParseResult<MemoryStore> {
  const parsed = memoryStore.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("/"), message: issue.message })),
      },
    };
  }
  const major = (version: string) => version.split(".")[0];
  if (major(parsed.data.schema_version) !== major(SCHEMA_VERSION)) {
    return {
      ok: false,
      error: {
        issues: [
          {
            path: "schema_version",
            message: `${parsed.data.schema_version} is not readable by ${SCHEMA_VERSION}`,
          },
        ],
      },
    };
  }
  const issues = semanticIssues(parsed.data);
  if (issues.length > 0) return { ok: false, error: { issues } };
  return { ok: true, value: parsed.data };
}

/** An empty store at the current schema version. */
export function emptyStore(): MemoryStore {
  return { schema_version: SCHEMA_VERSION, instances: [], relations: [] };
}

// -- Bounded merge operator ---------------------------------------------------------------------

/**
 * The ceiling on one patch. The bound belongs to this code, not to the model: a proposal that asks
 * to write more than this in a single step is refused whatever it claims about needing to.
 */
export const MAX_OPS_PER_PATCH = 64;

const patchOp = z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("create"), instance: memoryInstance }),
  z.strictObject({
    op: z.literal("field_patch"),
    id: instanceId,
    fields: z.record(z.string(), z.unknown()),
  }),
  z.strictObject({ op: z.literal("relate"), relation: memoryRelation }),
  z.strictObject({
    op: z.literal("supersede"),
    relation_id: relationId,
    stale_id: instanceId,
    fresh_id: instanceId,
  }),
]);

export type MemoryPatchOp = z.infer<typeof patchOp>;

const patch = z.array(patchOp);

/** Fields that name a thing rather than describe it. A patch may never rewrite these. */
const IMMUTABLE_FIELDS: ReadonlySet<string> = new Set(["id", "kind", "episode_id"]);

interface Draft {
  schema_version: string;
  instances: Record<string, unknown>[];
  relations: Record<string, unknown>[];
}

/**
 * Apply a model-proposed patch to a store.
 *
 * `field_patch` merges: fields the patch does not name survive untouched, so a proposal cannot
 * drop state by omission. A `null` value deletes an optional field; deleting a required one is
 * refused. The whole patch is all-or-nothing — on any issue the argument store is returned to the
 * caller unchanged and the issues describe every rejection, which is the retry the caller feeds
 * back to the model.
 */
export function applyPatch(store: MemoryStore, ops: unknown): ParseResult<MemoryStore> {
  const parsedOps = patch.safeParse(ops);
  if (!parsedOps.success) {
    return {
      ok: false,
      error: {
        issues: parsedOps.error.issues.map((issue) => ({ path: issue.path.join("/"), message: issue.message })),
      },
    };
  }

  const list = parsedOps.data;
  if (list.length === 0) {
    return { ok: false, error: { issues: [{ path: "", message: `a patch must contain at least one operation` }] } };
  }
  if (list.length > MAX_OPS_PER_PATCH) {
    return {
      ok: false,
      error: {
        issues: [{ path: "", message: `${list.length} operations is above the bound of ${MAX_OPS_PER_PATCH}` }],
      },
    };
  }

  const draft = structuredClone(store) as unknown as Draft;
  const issues: Issue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });

  const findInstance = (id: string): Record<string, unknown> | undefined =>
    draft.instances.find((instance) => instance["id"] === id);
  const findRelation = (id: string): Record<string, unknown> | undefined =>
    draft.relations.find((relation) => relation["id"] === id);

  const owningEpisode = (id: string): Record<string, unknown> | undefined => {
    const instance = findInstance(id);
    if (instance === undefined) return undefined;
    if (instance["kind"] === "episode") return instance;
    const owner = instance["episode_id"];
    return typeof owner === "string" ? findInstance(owner) : undefined;
  };

  /**
   * The gate `capabilitiesFor` advertises, enforced here.
   *
   * A settled episode accepts no writes, and the refusal is the same sentence the bus prints, so
   * the surface an agent reads and the contract that judges its write cannot disagree. Closing an
   * active episode is still a write into an active episode, so it passes; reopening a settled one
   * does not.
   */
  const refusesWrites = (path: string, id: string): boolean => {
    const owner = owningEpisode(id);
    if (owner === undefined || owner["status"] === "active") return false;
    add(path, `episode ${String(owner["id"])} is ${String(owner["status"])} and accepts no writes`);
    return true;
  };

  const requiredOf = (kind: MemoryKind): ReadonlySet<string> => new Set(requiredFieldsOf(kind));

  list.forEach((op, index) => {
    const at = `${index}`;
    switch (op.op) {
      case "create": {
        if (findInstance(op.instance.id) !== undefined) {
          add(`${at}/instance/id`, `${op.instance.id} already exists`);
          return;
        }
        if (op.instance.kind !== "episode" && refusesWrites(`${at}/instance/episode_id`, op.instance.episode_id)) {
          return;
        }
        draft.instances.push({ ...op.instance });
        return;
      }
      case "field_patch": {
        const target = findInstance(op.id);
        if (target === undefined) {
          add(`${at}/id`, `${op.id} does not exist`);
          return;
        }
        if (refusesWrites(`${at}/id`, op.id)) return;
        const kind = target["kind"];
        if (typeof kind !== "string" || !MEMORY_KINDS.includes(kind as MemoryKind)) {
          add(`${at}/id`, `${op.id} has no readable kind`);
          return;
        }
        const required = requiredOf(kind as MemoryKind);
        for (const [name, next] of Object.entries(op.fields)) {
          if (IMMUTABLE_FIELDS.has(name)) {
            add(`${at}/fields/${name}`, `${name} names the instance and cannot be patched`);
            continue;
          }
          if (next === null) {
            if (required.has(name)) {
              add(`${at}/fields/${name}`, `${name} is required and cannot be deleted`);
              continue;
            }
            delete target[name];
            continue;
          }
          target[name] = next;
        }
        return;
      }
      case "relate": {
        if (findRelation(op.relation.id) !== undefined) {
          add(`${at}/relation/id`, `${op.relation.id} already exists`);
          return;
        }
        if (
          refusesWrites(`${at}/relation/source`, op.relation.source) ||
          refusesWrites(`${at}/relation/target`, op.relation.target)
        ) {
          return;
        }
        draft.relations.push({ ...op.relation });
        return;
      }
      case "supersede": {
        const stale = findInstance(op.stale_id);
        const fresh = findInstance(op.fresh_id);
        if (stale === undefined) {
          add(`${at}/stale_id`, `${op.stale_id} does not exist`);
          return;
        }
        if (fresh === undefined) {
          add(`${at}/fresh_id`, `${op.fresh_id} does not exist`);
          return;
        }
        if (findRelation(op.relation_id) !== undefined) {
          add(`${at}/relation_id`, `${op.relation_id} already exists`);
          return;
        }
        if (refusesWrites(`${at}/stale_id`, op.stale_id) || refusesWrites(`${at}/fresh_id`, op.fresh_id)) {
          return;
        }
        stale["superseded"] = true;
        draft.relations.push({
          id: op.relation_id,
          type: "superseded_by",
          source: op.stale_id,
          target: op.fresh_id,
        });
        return;
      }
    }
  });

  if (issues.length > 0) return { ok: false, error: { issues } };
  return parseMemoryStore(draft);
}

// -- Capability bus -----------------------------------------------------------------------------

/**
 * The field names a kind requires, read off the schema itself. The capability an agent is told
 * about and the contract that judges its write are therefore the same object: they cannot drift.
 */
export function requiredFieldsOf(kind: MemoryKind): readonly string[] {
  const shape = shapes[kind].shape as Readonly<Record<string, z.ZodTypeAny>>;
  return Object.keys(shape).filter((name) => {
    const field = shape[name];
    return field !== undefined && !field.safeParse(undefined).success;
  });
}

/** The field names a kind accepts but does not require. */
export function optionalFieldsOf(kind: MemoryKind): readonly string[] {
  const shape = shapes[kind].shape as Readonly<Record<string, z.ZodTypeAny>>;
  const required = new Set(requiredFieldsOf(kind));
  return Object.keys(shape).filter((name) => !required.has(name));
}

/** One primitive an agent may create, and what it must supply to do so. */
export interface PrimitiveCapability {
  readonly kind: MemoryKind;
  readonly id_pattern: string;
  readonly required_fields: readonly string[];
  readonly optional_fields: readonly string[];
}

/** One edge an agent may create, and the bound on how many may leave a single source. */
export interface RelationCapability {
  readonly type: RelationType;
  readonly source_kind: MemoryKind;
  readonly target_kind: MemoryKind;
  readonly max_per_source: number | null;
}

/** One write operation, and whether taking it can lose state. */
export interface OpCapability {
  readonly op: MemoryPatchOp["op"];
  readonly destructive: boolean;
  readonly note: string;
}

/** Everything an agent is permitted to do to one episode, at the moment it is asked. */
export interface CapabilityBus {
  readonly episode_id: string;
  readonly writable: boolean;
  readonly primitives: readonly PrimitiveCapability[];
  readonly relations: readonly RelationCapability[];
  readonly ops: readonly OpCapability[];
  readonly prohibitions: readonly string[];
  readonly max_ops_per_patch: number;
}

const OPS: readonly OpCapability[] = [
  { op: "create", destructive: false, note: "adds a new instance; the id must be unused" },
  { op: "field_patch", destructive: false, note: "merges named fields; unnamed fields survive; null deletes an optional field" },
  { op: "relate", destructive: false, note: "adds an edge between two existing instances in this episode" },
  { op: "supersede", destructive: false, note: "marks a fact stale and records the fact that replaced it; nothing is deleted" },
];

const PROHIBITIONS: readonly string[] = [
  "id, kind and episode_id name the instance and cannot be patched",
  "a required field cannot be deleted",
  "a relation may not cross episodes",
  "a fact may not be superseded by itself, and a supersession chain may not be cyclic",
  "a replacement must be observed after the fact it replaces",
  "a confirmed hypothesis requires at least one supporting fact that is not superseded",
  "a refuted hypothesis requires at least one refuting fact",
  "a hypothesis that is not open must record when it was tested",
];

/**
 * The capability surface for one episode.
 *
 * The surface is type-level by construction: it names kinds, edges and bounds, never instances. Its
 * size is therefore fixed by the schema and independent of how much the store already holds, which
 * is what lets it sit in a prompt beside a growing memory without growing with it.
 */
export function capabilitiesFor(store: MemoryStore, episodeId: string): ParseResult<CapabilityBus> {
  const episodeInstance = store.instances.find((instance) => instance.id === episodeId);
  if (episodeInstance === undefined) {
    return { ok: false, error: { issues: [{ path: "episode_id", message: `${episodeId} does not exist` }] } };
  }
  if (episodeInstance.kind !== "episode") {
    return { ok: false, error: { issues: [{ path: "episode_id", message: `${episodeId} is not an episode` }] } };
  }

  const writable = episodeInstance.status === "active";
  return {
    ok: true,
    value: {
      episode_id: episodeId,
      writable,
      primitives: MEMORY_KINDS.filter((kind) => kind !== "episode").map((kind) => ({
        kind,
        id_pattern: idPatternFor(kind),
        required_fields: requiredFieldsOf(kind),
        optional_fields: optionalFieldsOf(kind),
      })),
      relations: RELATION_TYPES.map((type) => ({
        type,
        source_kind: RELATION_SPECS[type].source,
        target_kind: RELATION_SPECS[type].target,
        max_per_source: RELATION_SPECS[type].maxPerSource,
      })),
      ops: writable ? OPS : [],
      prohibitions: writable ? PROHIBITIONS : [`episode ${episodeId} is ${episodeInstance.status} and accepts no writes`],
      max_ops_per_patch: writable ? MAX_OPS_PER_PATCH : 0,
    },
  };
}

/** Render a capability bus as the block an agent reads before proposing a patch. */
export function renderCapabilities(bus: CapabilityBus): string {
  const lines: string[] = [`## Capabilities — episode ${bus.episode_id}`, ""];

  if (!bus.writable) {
    lines.push(...bus.prohibitions, "");
    return lines.join("\n");
  }

  lines.push("### Instances you may create");
  for (const primitive of bus.primitives) {
    lines.push(`${primitive.kind.padEnd(11)} ${primitive.id_pattern}`);
    lines.push(`${" ".repeat(12)}required ${primitive.required_fields.join(", ")}`);
    if (primitive.optional_fields.length > 0) {
      lines.push(`${" ".repeat(12)}optional ${primitive.optional_fields.join(", ")}`);
    }
  }

  lines.push("", "### Edges you may create");
  for (const relation of bus.relations) {
    const bound = relation.max_per_source === null ? "unbounded" : `max ${relation.max_per_source} per source`;
    lines.push(`${relation.type.padEnd(13)} ${relation.source_kind} -> ${relation.target_kind}  (${bound})`);
  }

  lines.push("", "### Write operations");
  for (const op of bus.ops) {
    const flag = op.destructive ? "DESTRUCTIVE " : "";
    lines.push(`${op.op.padEnd(13)} ${flag}${op.note}`);
  }
  lines.push(`${"".padEnd(13)} at most ${bus.max_ops_per_patch} operations per patch`);

  lines.push("", "### Rejections you will receive");
  for (const prohibition of bus.prohibitions) lines.push(`- ${prohibition}`);
  lines.push("");

  return lines.join("\n");
}
