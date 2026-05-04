import { describe, it, expect } from "vitest";
import { ValidationPipeline } from "../src/core/validation/pipeline.js";
import type {
  PrimitiveInstance,
} from "../src/core/models/instance.js";
import type { DomainProfile } from "../src/core/models/meta.js";

/**
 * Issue-D regression tests.
 *
 * When a profile-declared CEL predicate parses cleanly but throws at
 * runtime (e.g. `1 / 0`, deep null deref), Step-5 of the validation
 * pipeline catches the exception and converts it to a finding via the
 * §7.1 exception barrier.
 *
 * Pre-fix, that finding had two problems:
 *
 *   1. `rule_id` was synthesized as `plugin-validator-raised:${rule.id}`,
 *      which (a) mutates the rule_id namespace and (b) pretends the
 *      finding came from a plugin validator when it actually came from
 *      a profile-declared predicate.
 *   2. The "this was a runtime failure" signal was buried in the
 *      synthetic rule_id, not in `evidence` where machine consumers
 *      look.
 *
 * Post-fix:
 *   - `rule_id` is preserved as the rule's own ID — so consumers can
 *     filter findings by rule without parsing prefixes.
 *   - `evidence.failure_kind = "predicate-runtime-error"` carries the
 *     "what kind of failure" signal in the structured channel.
 *   - The error message and predicate string remain in `evidence` for
 *     human debugging.
 *
 * The fix lives in the same file as the CEL pipeline integration
 * ([pipeline.ts:404-417](src/core/validation/pipeline.ts#L404)).
 */

const TYPE = {
  id: "test:section",
  fields: [
    { name: "title", kind: "string" as const, required: false, validations: [] },
  ],
  id_format: { pattern: "^.*$", uniqueness: "project" as const },
  inline_structs: [],
  is_partition_unit: false,
};

function profileWithRule(rule: {
  id: string;
  expression: string;
  level: "error" | "warning" | "info";
  message?: string;
}): DomainProfile {
  return {
    id: "test:cel-runtime",
    version: "1.0.0",
    label: "CEL Runtime Error Test",
    extends: [],
    categories: [],
    scopes: [],
    primitive_types: [TYPE],
    relation_types: [],
    validation_rules: [
      {
        id: rule.id,
        name: rule.id,
        level: rule.level,
        targets: ["test:section"],
        applies_to: ["test:section"],
        expression: rule.expression,
        ...(rule.message !== undefined && { message: rule.message }),
      },
    ],
    renderer_bindings: [],
    inline_structs: [],
  };
}

const INSTANCE: PrimitiveInstance = {
  id: "section:a",
  type_id: "test:section",
  field_values: { title: "hello" },
  revision: 0,
};

describe("Issue-D — CEL runtime-error finding shape", () => {
  it("preserves the rule's own rule_id (not a synthetic prefix)", () => {
    // `1 / 0` parses but raises at evaluation time.
    const profile = profileWithRule({
      id: "rule:divzero",
      expression: "1 / 0 == 0",
      level: "error",
    });
    const pipeline = new ValidationPipeline();
    const report = pipeline.runPrimitive(INSTANCE, profile);

    const runtime = report.findings.find(
      (f) => f.evidence?.["failure_kind"] === "predicate-runtime-error",
    );
    expect(runtime).toBeDefined();
    // The rule_id is the rule's own ID — not `plugin-validator-raised:rule:divzero`.
    expect(runtime!.rule_id).toBe("rule:divzero");
    // And it certainly does not carry the legacy synthetic prefix.
    expect(runtime!.rule_id).not.toMatch(/^plugin-validator-raised:/);
  });

  it("attaches `failure_kind: 'predicate-runtime-error'` in evidence", () => {
    const profile = profileWithRule({
      id: "rule:nullderef",
      expression: "instance.x.y.z == 1",
      level: "error",
    });
    const pipeline = new ValidationPipeline();
    const report = pipeline.runPrimitive(INSTANCE, profile);

    const runtime = report.findings.find(
      (f) => f.rule_id === "rule:nullderef",
    );
    expect(runtime).toBeDefined();
    expect(runtime!.evidence).toMatchObject({
      failure_kind: "predicate-runtime-error",
      predicate: "instance.x.y.z == 1",
    });
    expect(typeof runtime!.evidence!["error"]).toBe("string");
  });

  it("emits the runtime finding at level=error regardless of the rule's declared level", () => {
    // The rule itself is declared `info`, but a runtime failure is
    // surfaced as `error` because the profile's predicate is broken —
    // the operator can't make a correctness call without first fixing
    // the rule.
    const profile = profileWithRule({
      id: "rule:info-but-broken",
      expression: "1 / 0 == 0",
      level: "info",
    });
    const pipeline = new ValidationPipeline();
    const report = pipeline.runPrimitive(INSTANCE, profile);

    const runtime = report.findings.find(
      (f) => f.evidence?.["failure_kind"] === "predicate-runtime-error",
    );
    expect(runtime).toBeDefined();
    expect(runtime!.level).toBe("error");
  });

  it("`failure_kind` differentiates runtime errors from satisfied/violated rules", () => {
    // A predicate that simply returns false should produce a normal
    // violation finding — NO `failure_kind`. The runtime-error case
    // should be the only one with the failure_kind tag.
    const profile = profileWithRule({
      id: "rule:false",
      expression: "1 == 2",
      level: "error",
      message: "always false",
    });
    const pipeline = new ValidationPipeline();
    const report = pipeline.runPrimitive(INSTANCE, profile);

    const violation = report.findings.find((f) => f.rule_id === "rule:false");
    expect(violation).toBeDefined();
    expect(violation!.evidence?.["failure_kind"]).toBeUndefined();
  });

  it("`failure_kind` differentiates runtime errors from parse fallbacks", () => {
    // A predicate that doesn't parse falls into the §4.3 fallback path
    // and emits an info-level finding with `parse_error` in evidence —
    // NOT `failure_kind`. The two paths must be distinguishable.
    const profile = profileWithRule({
      id: "rule:bad-syntax",
      expression: "((((((( not valid CEL",
      level: "warning",
    });
    const pipeline = new ValidationPipeline();
    const report = pipeline.runPrimitive(INSTANCE, profile);

    const fallback = report.findings.find((f) => f.rule_id === "rule:bad-syntax");
    expect(fallback).toBeDefined();
    expect(fallback!.level).toBe("info");
    expect(fallback!.evidence).toHaveProperty("parse_error");
    expect(fallback!.evidence?.["failure_kind"]).toBeUndefined();
  });

  it("findings stay attributable: the rule_id matches the source rule", () => {
    // Multiple runtime-erroring rules: each finding must carry its own
    // rule_id so consumers can attribute them. This was impossible with
    // the synthetic-prefix scheme without splitting on a literal `:`.
    const expression = "1 / 0 == 0";
    const profile: DomainProfile = {
      id: "test:cel-runtime-multi",
      version: "1.0.0",
      label: "Multi",
      extends: [],
      categories: [],
      scopes: [],
      primitive_types: [TYPE],
      relation_types: [],
      validation_rules: [
        {
          id: "rule:alpha",
          name: "rule:alpha",
          level: "error",
          targets: ["test:section"],
          applies_to: ["test:section"],
          expression,
        },
        {
          id: "rule:beta",
          name: "rule:beta",
          level: "warning",
          targets: ["test:section"],
          applies_to: ["test:section"],
          expression,
        },
      ],
      renderer_bindings: [],
      inline_structs: [],
    };
    const pipeline = new ValidationPipeline();
    const report = pipeline.runPrimitive(INSTANCE, profile);

    const ids = report.findings
      .filter((f) => f.evidence?.["failure_kind"] === "predicate-runtime-error")
      .map((f) => f.rule_id)
      .sort();
    expect(ids).toEqual(["rule:alpha", "rule:beta"]);
  });
});
