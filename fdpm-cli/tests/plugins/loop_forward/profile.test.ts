/**
 * The profile itself, and the verification layer that closes the
 * flattening loss.
 *
 * `primitives.ts` flattens six discriminated unions so the graph becomes
 * addressable, which lets the PROFILE accept records the CONTRACT would
 * reject. `validators.ts` exists to close that gap, and a verification
 * layer with no failing-input test is unverified — so every rule below
 * is fed the malformed record it exists to catch, not just a good one.
 *
 * The last block activates the plugin in a real Host and renders through
 * it, because a renderer that only ever runs from a unit test has never
 * been shown to be reachable.
 */
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PrimitiveTypeDef, RelationTypeDef } from "../../../src/core/models/meta.js";
import type { PrimitiveInstance } from "../../../src/core/models/instance.js";
import { Host } from "../../../src/core/host.js";
import {
  ALL_PRIMITIVES,
  AUTHORITY_MATRIX_RENDERER_ID,
  BINDING_MATRIX_RENDERER_ID,
  BUDGET_ENVELOPE_RENDERER_ID,
  PIPELINE_GRAPH_RENDERER_ID,
  PROFILE,
  PROFILE_ID,
  RELATIONS,
  VERIFICATION_SURFACE_RENDERER_ID,
  renderBudgetEnvelope,
  validateInstanceAgainstContract,
} from "../../../plugins/loop_forward/index.js";
import { T } from "../../../plugins/loop_forward/ids.js";
import { ingestLoopForwardStore } from "../../../plugins/loop_forward/ingest.js";
import { validStore } from "./_fixture.js";

function instance(typeId: string, fieldValues: Record<string, unknown>): PrimitiveInstance {
  return {
    id: `${typeId}:probe`,
    uid: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    type_id: typeId,
    field_values: fieldValues,
    revision: 0,
  };
}

const messages = (findings: readonly { message: string }[]): string =>
  findings.map((finding) => finding.message).join(" | ");

describe("profile shape", () => {
  it("test_every_primitive_type_parses_against_the_host_meta_model", () => {
    for (const type of ALL_PRIMITIVES) {
      const result = PrimitiveTypeDef.safeParse(type);
      if (!result.success) {
        throw new Error(`${type.id}: ${JSON.stringify(result.error.issues, null, 2)}`);
      }
    }
    expect(ALL_PRIMITIVES).toHaveLength(15);
  });

  it("test_every_relation_type_parses_and_names_types_the_profile_declares", () => {
    const known = new Set(ALL_PRIMITIVES.map((type) => type.id));
    for (const relation of RELATIONS) {
      const result = RelationTypeDef.safeParse(relation);
      if (!result.success) {
        throw new Error(`${relation.id}: ${JSON.stringify(result.error.issues, null, 2)}`);
      }
      for (const endpoint of [...(relation.source_types ?? []), ...(relation.target_types ?? [])]) {
        if (endpoint === "*") continue;
        expect(known.has(endpoint as string), `${relation.id} -> ${endpoint}`).toBe(true);
      }
    }
    expect(RELATIONS).toHaveLength(22);
  });

  it("test_type_and_relation_ids_are_unique", () => {
    const typeIds = ALL_PRIMITIVES.map((t) => t.id);
    expect(new Set(typeIds).size).toBe(typeIds.length);
    const relationIds = RELATIONS.map((r) => r.id);
    expect(new Set(relationIds).size).toBe(relationIds.length);
  });

  it("test_every_ingested_instance_has_a_declared_type", () => {
    const declared = new Set(ALL_PRIMITIVES.map((t) => t.id));
    const { primitives, relations } = ingestLoopForwardStore(validStore());
    for (const primitive of primitives) expect(declared.has(primitive.type_id)).toBe(true);
    const declaredRelations = new Set(RELATIONS.map((r) => r.id));
    for (const relation of relations) expect(declaredRelations.has(relation.type_id)).toBe(true);
  });

  it("test_every_relation_endpoint_resolves_to_an_ingested_primitive", () => {
    const { primitives, relations } = ingestLoopForwardStore(validStore());
    const ids = new Set(primitives.map((p) => p.id));
    for (const relation of relations) {
      expect(ids.has(relation.source_id), `${relation.id} source`).toBe(true);
      expect(ids.has(relation.target_id), `${relation.id} target`).toBe(true);
    }
  });
});

describe("verification layer — the fixture is clean", () => {
  it("test_no_instance_from_a_valid_document_produces_a_finding", () => {
    const { primitives } = ingestLoopForwardStore(validStore());
    const findings = primitives.flatMap(validateInstanceAgainstContract);
    expect(messages(findings)).toBe("");
  });
});

describe("verification layer — malformed records are rejected", () => {
  it("test_binding_carrying_a_field_from_another_arm_is_rejected", () => {
    const findings = validateInstanceAgainstContract(
      instance(T.VariableBinding, {
        variable_name: "x",
        source_kind: "carried",
        carry_name: "history",
        source_path: "/draft",
      }),
    );
    expect(findings).toHaveLength(1);
    expect(messages(findings)).toContain("belongs to another source_kind arm");
  });

  it("test_binding_missing_its_own_arm_field_is_rejected", () => {
    const findings = validateInstanceAgainstContract(
      instance(T.VariableBinding, { variable_name: "x", source_kind: "pipeline_input" }),
    );
    expect(messages(findings)).toContain('requires "input_name"');
  });

  it("test_text_contract_carrying_a_json_schema_is_rejected", () => {
    const findings = validateInstanceAgainstContract(
      instance(T.OutputContract, {
        format: "text",
        on_invalid: "fail",
        json_schema: '{"type":"object"}',
      }),
    );
    expect(messages(findings)).toContain("belongs to another format arm");
  });

  it("test_open_json_schema_is_rejected", () => {
    const findings = validateInstanceAgainstContract(
      instance(T.OutputContract, {
        format: "json",
        on_invalid: "fail",
        json_schema: JSON.stringify({ type: "object", properties: { a: { type: "string" } } }),
      }),
    );
    expect(messages(findings)).toContain("additionalProperties to false");
  });

  it("test_json_schema_with_no_properties_is_rejected", () => {
    const findings = validateInstanceAgainstContract(
      instance(T.OutputContract, {
        format: "json",
        on_invalid: "fail",
        json_schema: JSON.stringify({ type: "object", additionalProperties: false, properties: {} }),
      }),
    );
    expect(messages(findings)).toContain("at least one property");
  });

  it("test_unparseable_json_schema_is_reported_not_ignored", () => {
    const findings = validateInstanceAgainstContract(
      instance(T.OutputContract, { format: "json", on_invalid: "fail", json_schema: "{not json" }),
    );
    expect(messages(findings)).toContain("not parseable JSON");
  });

  it("test_retry_without_an_attempt_ceiling_is_rejected", () => {
    const findings = validateInstanceAgainstContract(
      instance(T.OutputContract, { format: "markdown", on_invalid: "retry" }),
    );
    expect(messages(findings)).toContain("must declare max_attempts");
  });

  it("test_fail_policy_carrying_retry_fields_is_rejected", () => {
    const findings = validateInstanceAgainstContract(
      instance(T.OutputContract, { format: "markdown", on_invalid: "fail", max_attempts: 3 }),
    );
    expect(messages(findings)).toContain("applies only to a retry policy");
  });

  it("test_uncompilable_regex_validator_is_rejected", () => {
    const findings = validateInstanceAgainstContract(
      instance(T.OutputValidator, { position: 0, kind: "regex", pattern: "([unclosed" }),
    );
    expect(messages(findings)).toContain("can never run");
  });

  it("test_range_validator_with_inverted_bounds_is_rejected", () => {
    const findings = validateInstanceAgainstContract(
      instance(T.OutputValidator, { position: 0, kind: "range", path: "/score", min: 1, max: 0 }),
    );
    expect(messages(findings)).toContain("min exceeds max");
  });

  it("test_range_validator_with_no_bound_is_rejected", () => {
    const findings = validateInstanceAgainstContract(
      instance(T.OutputValidator, { position: 0, kind: "range", path: "/score" }),
    );
    expect(messages(findings)).toContain("requires min or max");
  });

  it("test_unchanged_condition_not_recording_stagnated_is_rejected", () => {
    const findings = validateInstanceAgainstContract(
      instance(T.StopCondition, {
        condition_id: "c",
        kind: "unchanged",
        terminal_state: "success",
        window: 2,
      }),
    );
    expect(messages(findings)).toContain('must record terminal_state "stagnated"');
  });

  it("test_non_unchanged_condition_claiming_stagnated_is_rejected", () => {
    const findings = validateInstanceAgainstContract(
      instance(T.StopCondition, {
        condition_id: "c",
        kind: "field_truthy",
        terminal_state: "stagnated",
        path: "/done",
      }),
    );
    expect(messages(findings)).toContain('Only an "unchanged" condition');
  });

  it("test_runtime_only_terminal_state_is_rejected_as_a_declared_stop", () => {
    const findings = validateInstanceAgainstContract(
      instance(T.StopCondition, {
        condition_id: "c",
        kind: "field_truthy",
        terminal_state: "exhausted",
        path: "/done",
      }),
    );
    expect(messages(findings)).toContain("runtime outcome, not a declarable stop condition");
  });

  it("test_append_carry_of_a_non_string_type_is_rejected", () => {
    const findings = validateInstanceAgainstContract(
      instance(T.Carry, {
        carry_name: "score",
        source_path: "/score",
        value_type: "number",
        initial_value: "0",
        carry_mode: "append",
        max_serialized_chars: 100,
      }),
    );
    expect(messages(findings)).toContain("value_type must be string");
  });

  it("test_enum_carry_without_values_is_rejected", () => {
    const findings = validateInstanceAgainstContract(
      instance(T.Carry, {
        carry_name: "verdict",
        source_path: "/v",
        value_type: "enum",
        initial_value: '"a"',
        carry_mode: "replace",
        max_serialized_chars: 100,
      }),
    );
    expect(messages(findings)).toContain("enum carry requires enum_values");
  });

  it("test_required_variable_with_a_default_is_rejected", () => {
    const findings = validateInstanceAgainstContract(
      instance(T.VariableSpec, {
        variable_name: "topic",
        type: "string",
        description: "d",
        is_required: true,
        default_value: '"x"',
        sensitivity: "internal",
      }),
    );
    expect(messages(findings)).toContain("must set is_required to false");
  });

  it("test_write_authority_without_approval_is_rejected_by_the_contracts_own_schema", () => {
    const findings = validateInstanceAgainstContract(
      instance(T.ToolGrant, {
        tool_name: "document.write",
        authority: "write",
        approval: "none",
      }),
    );
    expect(messages(findings)).toContain("per_run or per_action");
  });

  it("test_elevated_authority_without_per_action_approval_is_rejected", () => {
    const findings = validateInstanceAgainstContract(
      instance(T.ToolGrant, {
        tool_name: "payments.charge",
        authority: "financial",
        approval: "per_run",
      }),
    );
    expect(messages(findings)).toContain("requires per_action approval");
  });

  it("test_invalid_example_without_a_reason_is_rejected", () => {
    const findings = validateInstanceAgainstContract(
      instance(T.PipelineExample, {
        example_id: "adv",
        kind: "adversarial",
        outcome: "invalid",
        stage_id: "lf:stage:x",
        input: "{}",
        expected_output: "{}",
      }),
    );
    expect(messages(findings)).toContain("must say why");
  });

  it("test_a_record_with_no_arm_violation_produces_no_finding", () => {
    const findings = validateInstanceAgainstContract(
      instance(T.VariableBinding, {
        variable_name: "x",
        source_kind: "carried",
        carry_name: "history",
      }),
    );
    expect(findings).toEqual([]);
  });
});

describe("live host", () => {
  it("test_plugin_activates_and_its_five_renderers_are_reachable_through_the_host", async () => {
    const host = new Host({ dataDir: null, builtinDirs: [resolve(process.cwd(), "plugins")] });
    await host.load();

    const profile = host.profiles.getResolved(PROFILE_ID);
    expect(profile.id).toBe(PROFILE.id);
    expect(profile.primitive_types).toHaveLength(15);
    expect(profile.relation_types).toHaveLength(22);

    // Reachable by id, which is the only way a caller can ask for THIS
    // text/html renderer when three plugins register that target.
    for (const rendererId of [
      PIPELINE_GRAPH_RENDERER_ID,
      VERIFICATION_SURFACE_RENDERER_ID,
      AUTHORITY_MATRIX_RENDERER_ID,
      BINDING_MATRIX_RENDERER_ID,
      BUDGET_ENVELOPE_RENDERER_ID,
    ]) {
      const found = host.plugins
        .listRenderers()
        .find((registration) => registration.rendererId === rendererId);
      expect(found, rendererId).toBeDefined();
      expect(found!.pluginId).toBe("fdpm.loop-forward");
    }
  });

  it("test_a_render_through_the_host_produces_the_same_bytes_as_a_direct_call", async () => {
    const host = new Host({ dataDir: null, builtinDirs: [resolve(process.cwd(), "plugins")] });
    await host.load();

    const registration = host.plugins.findRenderer("text/markdown", BUDGET_ENVELOPE_RENDERER_ID);
    expect(registration).toBeDefined();

    const { primitives, relations } = ingestLoopForwardStore(validStore());
    const input = {
      workbookId: "wb-loop-forward",
      primitives,
      relations,
      profile: host.profiles.getResolved(PROFILE_ID),
    };
    const viaHost = await registration!.fn(input);
    const direct = renderBudgetEnvelope(input);
    expect(new TextDecoder().decode(viaHost.bytes)).toBe(
      new TextDecoder().decode(direct.bytes),
    );
    expect(viaHost.contentType).toBe("text/markdown");
  });
});
