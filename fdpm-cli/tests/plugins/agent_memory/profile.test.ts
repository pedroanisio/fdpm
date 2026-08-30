/**
 * The profile, and the five rules that carry what the host's type checks
 * cannot.
 *
 * Every rule below is fed the malformed graph it exists to reject, not
 * only a well-formed one: a verification layer with no failing-input
 * test is unverified. The last block writes through a real Host, because
 * a validator that only ever runs from a unit test has never been shown
 * to be reachable.
 */
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PrimitiveTypeDef, RelationTypeDef } from "../../../src/core/models/meta.js";
import { Host } from "../../../src/core/host.js";
import {
  ALL_PRIMITIVES,
  ENTITY_VALIDATORS,
  PROFILE,
  PROFILE_ID,
  R,
  RELATIONS,
  RULE,
  T,
  episodePartition,
  episodeWritable,
  evidence,
  manifest,
  supersedeShape,
} from "../../../plugins/agent_memory/index.js";
import {
  ACTION,
  EP,
  FACT_LIVE,
  FACT_STALE,
  HYP,
  contextFrom,
  episode,
  fact,
  hypothesis,
  primitive,
  relation,
  validGraph,
} from "./_fixture.js";

const messages = (findings: readonly { message: string }[]): string =>
  findings.map((f) => f.message).join(" | ");

const run = (
  fn: typeof supersedeShape,
  instance: Parameters<typeof supersedeShape>[0],
  graph: Parameters<typeof contextFrom>[0],
) => fn(instance, undefined, undefined, contextFrom(graph)) as ReturnType<typeof supersedeShape> & object[];

describe("profile shape", () => {
  it("test_every_primitive_type_parses_against_the_host_meta_model", () => {
    for (const type of ALL_PRIMITIVES) {
      const result = PrimitiveTypeDef.safeParse(type);
      if (!result.success) throw new Error(`${type.id}: ${JSON.stringify(result.error.issues, null, 2)}`);
    }
    expect(ALL_PRIMITIVES).toHaveLength(6);
  });

  it("test_every_relation_type_parses_and_names_types_the_profile_declares", () => {
    const known = new Set(ALL_PRIMITIVES.map((type) => type.id));
    for (const rel of RELATIONS) {
      const result = RelationTypeDef.safeParse(rel);
      if (!result.success) throw new Error(`${rel.id}: ${JSON.stringify(result.error.issues, null, 2)}`);
      for (const endpoint of [...(rel.source_types ?? []), ...(rel.target_types ?? [])]) {
        expect(known.has(endpoint as string), `${rel.id} -> ${endpoint}`).toBe(true);
      }
    }
    expect(RELATIONS).toHaveLength(6);
  });

  it("test_the_episode_is_the_partition_unit_and_nothing_else_is", () => {
    // The claim is load-bearing: host-extra splits a workbook along this
    // type, and no relation may cross an episode, so a split cannot
    // sever an edge.
    const partitions = ALL_PRIMITIVES.filter((type) => type.is_partition_unit);
    expect(partitions.map((type) => type.id)).toEqual([T.Episode]);
  });

  it("test_the_superseded_boolean_is_not_carried_as_a_field", () => {
    // primitives.ts RULE 3. Liveness is the edge; storing it twice would
    // need policing that no write order can satisfy.
    const factType = ALL_PRIMITIVES.find((type) => type.id === T.Fact)!;
    expect(factType.fields.map((field) => field.name)).not.toContain("superseded");
  });

  it("test_manifest_declares_exactly_what_activate_registers", () => {
    // Manifest-runtime parity, checked rather than remembered.
    const declared = manifest.capabilities
      .filter((cap) => cap.capability_id === "cap:validator")
      .map((cap) => `${String(cap.metadata?.["type_id"])}/${String(cap.metadata?.["rule_id"])}`)
      .sort();
    const registered = ENTITY_VALIDATORS.map((reg) => `${reg.type_id}/${reg.rule_id}`).sort();
    expect(declared).toEqual(registered);
    expect(manifest.capabilities.filter((cap) => cap.capability_id === "cap:profile")).toHaveLength(1);
  });

  it("test_the_valid_graph_draws_no_finding_from_any_rule", () => {
    const graph = validGraph();
    const all = [
      ...graph.relations.flatMap((rel) => [
        ...run(supersedeShape, rel, graph),
        ...run(episodePartition, rel, graph),
        ...run(episodeWritable, rel, graph),
      ]),
      ...graph.primitives.flatMap((p) => [...run(evidence, p, graph), ...run(episodeWritable, p, graph)]),
    ];
    expect(messages(all)).toBe("");
  });
});

describe("am:val:supersede-shape", () => {
  it("test_rejects_a_fact_superseded_by_itself", () => {
    const graph = validGraph();
    const self = relation("am:rel:self", R.SupersededBy, FACT_STALE, FACT_STALE);
    const findings = run(supersedeShape, self, graph);
    expect(messages(findings)).toContain("may not be superseded by itself");
  });

  it("test_rejects_a_second_replacement_leaving_the_same_fact", () => {
    const graph = validGraph();
    graph.primitives.push(fact("am:fact:shelf12-c", 11));
    graph.relations.push(relation("am:rel:holds-5", R.EpisodeHolds, EP, "am:fact:shelf12-c"));
    const second = relation("am:rel:superseded-2", R.SupersededBy, FACT_STALE, "am:fact:shelf12-c");
    const findings = run(supersedeShape, second, { ...graph, relations: [...graph.relations, second] });
    expect(messages(findings)).toContain("above the bound of 1");
  });

  it("test_rejects_a_cyclic_chain", () => {
    const graph = validGraph();
    const back = relation("am:rel:back", R.SupersededBy, FACT_LIVE, FACT_STALE);
    const findings = run(supersedeShape, back, { ...graph, relations: [...graph.relations, back] });
    expect(messages(findings)).toContain("is cyclic");
  });

  it("test_rejects_a_replacement_observed_no_later_than_what_it_replaces", () => {
    // The rule that makes the chain a history rather than a set of
    // pointers. Both the strictly-earlier and the equal case.
    const graph = validGraph();
    for (const staleStep of [9, 3]) {
      const stale = fact("am:fact:backwards", staleStep === 9 ? 9 : 3);
      const fresh = fact("am:fact:earlier", staleStep === 9 ? 3 : 3);
      const edge = relation("am:rel:backwards", R.SupersededBy, stale.id, fresh.id);
      const findings = run(supersedeShape, edge, {
        primitives: [...graph.primitives, stale, fresh],
        relations: [...graph.relations, edge],
      });
      expect(messages(findings)).toContain("must be observed after the fact it replaces");
    }
  });

  it("test_refuses_rather_than_skips_when_the_workbook_slice_is_absent", () => {
    // A control that stands down when its input is missing is not a
    // control. The pipeline can be driven with no workbook.
    const graph = validGraph();
    const edge = graph.relations.find((rel) => rel.type_id === R.SupersededBy)!;
    const findings = supersedeShape(edge, undefined, undefined, { relations: graph.relations }) as {
      message: string;
      rule_id: string;
    }[];
    expect(messages(findings)).toContain("could not be evaluated");
    expect(findings.every((f) => f.rule_id === RULE.supersedeShape)).toBe(true);
  });
});

describe("am:val:evidence", () => {
  it("test_rejects_a_confirmed_hypothesis_with_no_supporting_fact", () => {
    const graph = validGraph();
    graph.relations = graph.relations.filter((rel) => rel.type_id !== R.Supports);
    const findings = run(evidence, hypothesis("confirmed", 9), graph);
    expect(messages(findings)).toContain("requires at least one supporting fact");
  });

  it("test_rejects_a_confirmed_hypothesis_resting_only_on_superseded_facts", () => {
    // Liveness comes off the graph: the supporting fact has an outgoing
    // am:SupersededBy edge, so it is stale.
    const graph = validGraph();
    graph.relations = [
      ...graph.relations.filter((rel) => rel.type_id !== R.Supports),
      relation("am:rel:supports-stale", R.Supports, FACT_STALE, HYP),
    ];
    const findings = run(evidence, hypothesis("confirmed", 9), graph);
    expect(messages(findings)).toContain("rests only on superseded facts");
  });

  it("test_rejects_a_refuted_hypothesis_with_no_refuting_fact", () => {
    const findings = run(evidence, hypothesis("refuted", 9), validGraph());
    expect(messages(findings)).toContain("requires at least one refuting fact");
  });

  it("test_rejects_a_settled_hypothesis_that_does_not_record_when_it_was_tested", () => {
    const findings = run(evidence, hypothesis("confirmed"), validGraph());
    expect(messages(findings)).toContain("must record the step it was tested at");
  });

  it("test_accepts_an_open_hypothesis_with_no_evidence_at_all", () => {
    const graph = validGraph();
    graph.relations = graph.relations.filter((rel) => rel.type_id !== R.Supports);
    expect(messages(run(evidence, hypothesis("open"), graph))).toBe("");
  });
});

describe("am:val:episode-partition", () => {
  it("test_rejects_an_instance_held_by_two_episodes", () => {
    const graph = validGraph();
    const other = primitive("am:episode:audit-02", T.Episode, {
      skill_id: "skill.audit",
      objective: "a different run",
      status: "active",
      started_at: "2026-08-30T11:00:00Z",
      horizon_step: 5,
    });
    const second = relation("am:rel:holds-dup", R.EpisodeHolds, other.id, FACT_LIVE);
    const findings = run(episodePartition, second, {
      primitives: [...graph.primitives, other],
      relations: [...graph.relations, second],
    });
    expect(messages(findings)).toContain("is held by 2 episodes");
  });

  it("test_rejects_a_relation_that_crosses_episodes", () => {
    const graph = validGraph();
    const other = primitive("am:episode:audit-02", T.Episode, {
      skill_id: "skill.audit",
      objective: "a different run",
      status: "active",
      started_at: "2026-08-30T11:00:00Z",
      horizon_step: 5,
    });
    const foreign = fact("am:fact:elsewhere", 2);
    const cross = relation("am:rel:cross", R.Supports, foreign.id, HYP);
    const findings = run(episodePartition, cross, {
      primitives: [...graph.primitives, other, foreign],
      relations: [
        ...graph.relations,
        relation("am:rel:holds-other", R.EpisodeHolds, other.id, foreign.id),
        cross,
      ],
    });
    expect(messages(findings)).toContain("may not cross episodes");
  });

  it("test_rejects_an_edge_drawn_before_its_endpoints_are_attached", () => {
    const graph = validGraph();
    const loose = fact("am:fact:unattached", 12);
    const edge = relation("am:rel:early", R.Supports, loose.id, HYP);
    const findings = run(episodePartition, edge, {
      primitives: [...graph.primitives, loose],
      relations: [...graph.relations, edge],
    });
    expect(messages(findings)).toContain("is not held by any episode");
  });
});

describe("am:val:episode-writable", () => {
  it("test_refuses_every_write_into_an_episode_that_is_not_active", () => {
    for (const status of ["complete", "failed", "abandoned"]) {
      const graph = validGraph();
      graph.primitives[0] = episode(status);

      const held = graph.primitives.find((p) => p.id === FACT_LIVE)!;
      expect(messages(run(episodeWritable, held, graph))).toContain(
        `is ${status} and accepts no writes`,
      );

      const attach = relation("am:rel:holds-new", R.EpisodeHolds, EP, "am:fact:new");
      expect(messages(run(episodeWritable, attach, graph))).toContain(
        `is ${status} and accepts no writes`,
      );

      const edge = graph.relations.find((rel) => rel.type_id === R.Supports)!;
      expect(messages(run(episodeWritable, edge, graph))).toContain(
        `is ${status} and accepts no writes`,
      );
    }
  });

  it("test_does_not_fire_on_an_instance_that_has_no_holder_yet", () => {
    // Creating a primitive precedes attaching it. Refusing here would
    // make it impossible to create anything; the gap closes at attach.
    const graph = validGraph();
    graph.primitives[0] = episode("complete");
    const loose = fact("am:fact:fresh", 1);
    expect(messages(run(episodeWritable, loose, graph))).toBe("");
  });

  it("test_refuses_rather_than_skips_when_the_workbook_slice_is_absent", () => {
    const graph = validGraph();
    const held = graph.primitives.find((p) => p.id === FACT_LIVE)!;
    const findings = episodeWritable(held, undefined, undefined, {
      relations: graph.relations,
    }) as { message: string }[];
    expect(messages(findings)).toContain("could not be evaluated");
  });
});

describe("live host", () => {
  async function freshHost(): Promise<Host> {
    const host = new Host({ dataDir: null, builtinDirs: [resolve(process.cwd(), "plugins")] });
    await host.load();
    return host;
  }

  it("test_the_plugin_activates_and_the_profile_resolves_through_the_host", async () => {
    const host = await freshHost();
    const profile = host.profiles.getResolved(PROFILE_ID);
    expect(profile.id).toBe(PROFILE.id);
    expect(profile.primitive_types).toHaveLength(6);
    expect(profile.relation_types).toHaveLength(6);
  });

  it("test_the_host_enforces_endpoint_kind_so_the_profile_need_not", async () => {
    // The contract spent a rule on "this relation starts at a fact, not
    // an action". Here it is the RelationTypeDef, checked per write.
    const host = await freshHost();
    await host.createProject({ workbook_id: "wb-am", name: "AM", profile_id: PROFILE_ID });
    await host.createPrimitive("wb-am", { id: EP, type_id: T.Episode, field_values: episode().field_values });
    await host.createPrimitive("wb-am", { id: FACT_LIVE, type_id: T.Fact, field_values: fact(FACT_LIVE, 9).field_values });
    await host.createPrimitive("wb-am", {
      id: ACTION,
      type_id: T.Action,
      field_values: { command: "count shelf 12", outcome: "success", step: 9 },
    });
    await host.createRelation("wb-am", {
      id: "am:rel:holds-a",
      type_id: R.EpisodeHolds,
      source_id: EP,
      target_id: FACT_LIVE,
    });

    await expect(
      host.createRelation("wb-am", {
        id: "am:rel:bad",
        type_id: R.SupersededBy,
        source_id: ACTION,
        target_id: FACT_LIVE,
      }),
    ).rejects.toThrow(/source type am:Action not in/u);
  });

  it("test_a_write_into_a_settled_episode_is_refused_through_the_real_pipeline", async () => {
    // The rule that needed ValidatorContext.workbook. If the host stops
    // supplying the slice, this test fails rather than the rule quietly
    // passing.
    const host = await freshHost();
    await host.createProject({ workbook_id: "wb-am2", name: "AM2", profile_id: PROFILE_ID });
    await host.createPrimitive("wb-am2", {
      id: EP,
      type_id: T.Episode,
      field_values: episode("complete").field_values,
    });
    await host.createPrimitive("wb-am2", {
      id: FACT_STALE,
      type_id: T.Fact,
      field_values: fact(FACT_STALE, 3).field_values,
    });

    await expect(
      host.createRelation("wb-am2", {
        id: "am:rel:holds-late",
        type_id: R.EpisodeHolds,
        source_id: EP,
        target_id: FACT_STALE,
      }),
    ).rejects.toThrow(/is complete and accepts no writes/u);
  });
});
