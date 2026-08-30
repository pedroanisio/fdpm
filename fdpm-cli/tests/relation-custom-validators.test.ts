import { describe, it, expect } from "vitest";
import { ValidationPipeline } from "../src/core/validation/pipeline.js";
import type { PrimitiveInstance, RelationInstance } from "../src/core/models/instance.js";
import type { DomainProfile, PrimitiveTypeDef, RelationTypeDef } from "../src/core/models/meta.js";

/**
 * Regression test — custom validators on a relation type were never
 * dispatched.
 *
 * BUG (Aug 2026): `cap:validator` accepts a relation type id, the plugin
 * context registers the validator against it, and `ValidationPipeline`
 * then never called it: `runRelation` ran the core checks (type
 * resolution, endpoint existence, endpoint kind, field shape) and
 * returned, with no Step 6. `runPrimitive` had one; the relation path
 * did not. It also took no `CustomValidatorContext`, so even once
 * dispatched a relation validator could not see the workbook's other
 * relations or primitives.
 *
 * Nothing in-tree registered a relation validator, so no test failed —
 * the capability could be declared and could not fire. The gap was
 * silent by construction.
 *
 * Discovery surface: an agent-memory profile registering four
 * relation-level rules (partition boundary, episode writability,
 * supersession shape) saw every one of them accept a graph the rule
 * forbids.
 *
 * Fix: `runRelation` gained the Step-6 dispatch behind the same
 * exception barrier and the same profile scoping the primitive path
 * uses, plus an optional context that `Host` now supplies at every
 * relation call site.
 *
 * Failure mode (pre-fix): both assertions below see zero findings.
 */

const NODE: PrimitiveTypeDef = {
  id: "t:Node",
  name: "t:Node",
  fields: [{ name: "weight", kind: "integer", required: true, validations: [] }],
  id_format: { pattern: "^t:Node:[a-z0-9-]+$", uniqueness: "global" },
  inline_structs: [],
};

const LINK: RelationTypeDef = {
  id: "t:Link",
  name: "t:Link",
  source_types: ["t:Node"],
  target_types: ["t:Node"],
  cardinality: "many-to-many",
  fields: [],
  symmetric: false,
  transitive: false,
};

const PROFILE: DomainProfile = {
  id: "profile:relvalidator:1.0",
  version: "1.0.0",
  name: "Relation validator probe",
  primitive_types: [NODE],
  relation_types: [LINK],
  categories: [],
  scopes: [],
  validation_rules: [],
  inline_structs: [],
  templates: [],
} as unknown as DomainProfile;

const node = (id: string, weight: number): PrimitiveInstance => ({
  id,
  uid: `01ARZ3NDEKTSV4RRFFQ69G5${id.slice(-3)}`,
  type_id: "t:Node",
  field_values: { weight },
  revision: 0,
});

const link = (id: string, source: string, target: string): RelationInstance => ({
  id,
  uid: `01ARZ3NDEKTSV4RRFFQ69G6${id.slice(-3)}`,
  type_id: "t:Link",
  source_id: source,
  target_id: target,
  field_values: {},
  revision: 0,
});

const A = "t:Node:aaa";
const B = "t:Node:bbb";
const primitives = new Map([
  [A, node(A, 5)],
  [B, node(B, 1)],
]);

describe("custom validators on a relation type", () => {
  it("test_a_validator_registered_against_a_relation_type_is_dispatched", () => {
    const pipeline = new ValidationPipeline();
    pipeline.registerValidator({
      type_id: "t:Link",
      rule_id: "t:val:no-self-link",
      fn: (instance) => {
        const edge = instance as RelationInstance;
        return edge.source_id === edge.target_id
          ? [
              {
                level: "error" as const,
                rule_id: "t:val:no-self-link",
                target_id: edge.id,
                field_path: null,
                message: "a node may not link to itself",
              },
            ]
          : [];
      },
    });

    const selfLink = link("t:Link:self", A, A);
    const report = pipeline.runRelation(selfLink, PROFILE, primitives);
    expect(report.findings.map((f) => f.message)).toContain("a node may not link to itself");
    expect(report.accepted).toBe(false);
  });

  it("test_the_validator_receives_the_context_it_needs_to_read_a_sibling_primitive", () => {
    // The half of the fix that matters for cross-record rules: without a
    // context, a relation validator can only inspect the edge itself.
    const pipeline = new ValidationPipeline();
    pipeline.registerValidator({
      type_id: "t:Link",
      rule_id: "t:val:downhill",
      fn: (instance, _type, _profile, context) => {
        const edge = instance as RelationInstance;
        const source = context?.workbook?.primitives[edge.source_id];
        const target = context?.workbook?.primitives[edge.target_id];
        if (source === undefined || target === undefined) {
          return [
            {
              level: "error" as const,
              rule_id: "t:val:downhill",
              target_id: edge.id,
              field_path: null,
              message: "the workbook slice was not supplied, so the rule could not be evaluated",
            },
          ];
        }
        const from = source.field_values["weight"] as number;
        const to = target.field_values["weight"] as number;
        return to < from
          ? []
          : [
              {
                level: "error" as const,
                rule_id: "t:val:downhill",
                target_id: edge.id,
                field_path: null,
                message: `a link must run downhill: ${to} is not below ${from}`,
              },
            ];
      },
    });

    const uphill = link("t:Link:up", B, A);
    const context = {
      relations: [uphill],
      workbook: {
        primitives: Object.fromEntries(primitives),
        relations: { [uphill.id]: uphill },
      },
    };
    const report = pipeline.runRelation(uphill, PROFILE, primitives, context);
    expect(report.findings.map((f) => f.message)).toContain("a link must run downhill: 5 is not below 1");

    // And the absent-context branch is reachable, so a rule that needs
    // the slice can refuse rather than silently pass.
    const blind = pipeline.runRelation(uphill, PROFILE, primitives);
    expect(blind.findings.map((f) => f.message)).toContain(
      "the workbook slice was not supplied, so the rule could not be evaluated",
    );
  });

  it("test_a_raising_relation_validator_is_contained_by_the_exception_barrier", () => {
    const pipeline = new ValidationPipeline();
    pipeline.registerValidator({
      type_id: "t:Link",
      rule_id: "t:val:boom",
      fn: () => {
        throw new Error("kaboom");
      },
    });
    const report = pipeline.runRelation(link("t:Link:ok", A, B), PROFILE, primitives);
    expect(report.accepted).toBe(false);
    expect(report.findings.map((f) => f.rule_id)).toContain("plugin-validator-raised:t:val:boom");
  });
});
