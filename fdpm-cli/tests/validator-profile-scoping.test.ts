import { describe, it, expect } from "vitest";
import { ValidationPipeline } from "../src/core/validation/pipeline.js";
import type { PrimitiveInstance } from "../src/core/models/instance.js";
import type {
  DomainProfile,
  PrimitiveTypeDef,
} from "../src/core/models/meta.js";

/**
 * Regression test — cross-plugin validator leakage.
 *
 * BUG (May 2026): two plugins (acme.pitch-deck, acme.business-deck) both
 * declared a primitive type `acme:Risk` with INCOMPATIBLE Zod-bridge
 * schemas (different `likelihood` enums, different `severity` enums,
 * different required fields). Both plugins registered cap:validator
 * capabilities targeting `acme:Risk`. The dispatcher in
 * `ValidationPipeline` filtered validators by type_id alone — so both
 * plugins' validators ran on every `acme:Risk` write, regardless of
 * which profile the workbook was actually built on.
 *
 * Discovery surface: creating an `acme:Risk` in a workbook on
 * profile:acme-business-deck:0.1 was rejected by the pitch-deck
 * Zod-bridge validator (`acme.pitch-deck:zod.risk.invalid_value.severity`,
 * `…likelihood`, `…category`) — fields the business-deck schema does
 * not even declare.
 *
 * Fix: validators carry an `originating_profile_ids` getter (set by the
 * plugin context from `contributions.profileIds`); dispatch filters
 * validators by checking whether the workbook profile's id is in the
 * registering plugin's contributed-profile set, or in the workbook
 * profile's `extends` chain.
 *
 * This test reproduces the exact collision shape:
 *   - Two profiles, both declaring `acme:Risk`.
 *   - Two validators, each contributed by one plugin, with
 *     mutually-exclusive fail conditions.
 *   - A write against profile A must fire ONLY plugin-A's validator.
 *
 * Failure mode (pre-fix): both validators fire and the write is
 * doubly-rejected.
 */

const RISK_TYPE: PrimitiveTypeDef = {
  id: "acme:Risk",
  name: "acme:Risk",
  fields: [
    { name: "id", kind: "string", required: true, validations: [] },
    { name: "description", kind: "string", required: true, validations: [] },
    {
      name: "likelihood",
      kind: "enum",
      required: true,
      validations: [],
      enum_values: ["low", "medium", "high", "unknown"],
    },
  ],
  id_format: { pattern: "^acme:Risk:[a-z0-9-]+$", uniqueness: "global" },
  inline_structs: [],
};

function profileWithRiskType(id: string): DomainProfile {
  return {
    id,
    version: "0.1.0",
    label: id,
    extends: [],
    categories: [],
    scopes: [],
    primitive_types: [RISK_TYPE],
    relation_types: [],
    validation_rules: [],
    renderer_bindings: [],
    inline_structs: [],
  };
}

const RISK_INSTANCE: PrimitiveInstance = {
  id: "acme:Risk:test-risk",
  type_id: "acme:Risk",
  field_values: {
    id: "acme:Risk:test-risk",
    description: "shape probe",
    likelihood: "high",
  },
  revision: 0,
};

describe("Validator profile-scoping (regression: cross-plugin leakage)", () => {
  it("plugin-A's validator fires on profile A; does NOT fire on profile B", () => {
    const profileA = profileWithRiskType("plugin-a:profile:0.1");
    const profileB = profileWithRiskType("plugin-b:profile:0.1");

    const pipeline = new ValidationPipeline();

    // Plugin A's validator: ALWAYS rejects (so we can detect it firing).
    pipeline.registerValidator({
      type_id: "acme:Risk",
      rule_id: "plugin-a:always-reject",
      originating_profile_ids: () => ["plugin-a:profile:0.1"],
      fn: (instance) => [
        {
          level: "error",
          rule_id: "plugin-a:always-reject",
          target_id: instance.id,
          field_path: null,
          message: "plugin-a fired",
        },
      ],
    });

    // Plugin B's validator: ALSO always rejects (same shape; different scope).
    pipeline.registerValidator({
      type_id: "acme:Risk",
      rule_id: "plugin-b:always-reject",
      originating_profile_ids: () => ["plugin-b:profile:0.1"],
      fn: (instance) => [
        {
          level: "error",
          rule_id: "plugin-b:always-reject",
          target_id: instance.id,
          field_path: null,
          message: "plugin-b fired",
        },
      ],
    });

    // Write against profile A — only plugin-A should fire.
    const reportA = pipeline.runPrimitive(RISK_INSTANCE, profileA);
    const aFiredOnA = reportA.findings.some(
      (f) => f.rule_id === "plugin-a:always-reject",
    );
    const bFiredOnA = reportA.findings.some(
      (f) => f.rule_id === "plugin-b:always-reject",
    );
    expect(aFiredOnA).toBe(true);
    expect(bFiredOnA).toBe(false); // BUG, pre-fix: was true.

    // Write against profile B — only plugin-B should fire.
    const reportB = pipeline.runPrimitive(RISK_INSTANCE, profileB);
    const aFiredOnB = reportB.findings.some(
      (f) => f.rule_id === "plugin-a:always-reject",
    );
    const bFiredOnB = reportB.findings.some(
      (f) => f.rule_id === "plugin-b:always-reject",
    );
    expect(aFiredOnB).toBe(false); // BUG, pre-fix: was true.
    expect(bFiredOnB).toBe(true);
  });

  it("validators with no originating_profile_ids fire on every profile (back-compat)", () => {
    // Core/host registrations and pre-fix plugin registrations leave
    // originating_profile_ids unset. They must still fire — only
    // PROFILE-SCOPED validators are filtered.
    const profileA = profileWithRiskType("plugin-a:profile:0.1");
    const profileB = profileWithRiskType("plugin-b:profile:0.1");

    const pipeline = new ValidationPipeline();
    pipeline.registerValidator({
      type_id: "acme:Risk",
      rule_id: "core:always-reject",
      // no originating_profile_ids — unscoped
      fn: (instance) => [
        {
          level: "error",
          rule_id: "core:always-reject",
          target_id: instance.id,
          field_path: null,
          message: "core fired",
        },
      ],
    });

    expect(
      pipeline
        .runPrimitive(RISK_INSTANCE, profileA)
        .findings.some((f) => f.rule_id === "core:always-reject"),
    ).toBe(true);
    expect(
      pipeline
        .runPrimitive(RISK_INSTANCE, profileB)
        .findings.some((f) => f.rule_id === "core:always-reject"),
    ).toBe(true);
  });

  it("validator fires on a profile that EXTENDS the registering plugin's profile", () => {
    // A composition profile (e.g. profile:acme-pitch-deck-dnis) extends
    // the base profile. A validator scoped to the BASE profile must
    // still fire on writes against the EXTENSION profile, because the
    // extension inherits the type definitions from the base.
    const basePluginProfile = profileWithRiskType("plugin-base:profile:0.1");
    const extensionProfile: DomainProfile = {
      ...profileWithRiskType("plugin-base-extension:0.1"),
      extends: ["plugin-base:profile:0.1"],
    };

    const pipeline = new ValidationPipeline();
    pipeline.registerValidator({
      type_id: "acme:Risk",
      rule_id: "plugin-base:always-reject",
      originating_profile_ids: () => ["plugin-base:profile:0.1"],
      fn: (instance) => [
        {
          level: "error",
          rule_id: "plugin-base:always-reject",
          target_id: instance.id,
          field_path: null,
          message: "base fired",
        },
      ],
    });

    const onBase = pipeline.runPrimitive(RISK_INSTANCE, basePluginProfile);
    const onExtension = pipeline.runPrimitive(RISK_INSTANCE, extensionProfile);
    expect(
      onBase.findings.some((f) => f.rule_id === "plugin-base:always-reject"),
    ).toBe(true);
    expect(
      onExtension.findings.some(
        (f) => f.rule_id === "plugin-base:always-reject",
      ),
    ).toBe(true);
  });

  it("originating_profile_ids is resolved lazily (handles register-validator-before-register-profile)", () => {
    // Plugins activate by calling registerValidator() and registerProfile()
    // in arbitrary order. At the moment registerValidator() runs, the
    // plugin's contributions.profileIds may still be empty. The lazy
    // getter must see the populated list at DISPATCH time, not at
    // registration time.
    const profileA = profileWithRiskType("plugin-a:profile:0.1");
    const pluginAProfileIds: string[] = []; // mutated AFTER registration

    const pipeline = new ValidationPipeline();
    pipeline.registerValidator({
      type_id: "acme:Risk",
      rule_id: "plugin-a:always-reject",
      originating_profile_ids: () => pluginAProfileIds,
      fn: (instance) => [
        {
          level: "error",
          rule_id: "plugin-a:always-reject",
          target_id: instance.id,
          field_path: null,
          message: "plugin-a fired (lazy)",
        },
      ],
    });

    // Pre-population: validator filtered out (empty originating set means
    // no profile matches; behaves as scoped, not unscoped — see contract
    // in pipeline.ts validatorAppliesToProfile).
    // Note: an EMPTY array is treated as "unscoped" by the predicate to
    // preserve back-compat, so this case fires even before profileIds
    // is populated. Document and assert that.
    const before = pipeline.runPrimitive(RISK_INSTANCE, profileA);
    expect(
      before.findings.some((f) => f.rule_id === "plugin-a:always-reject"),
    ).toBe(true);

    // Post-population: still fires on profile A; does not fire on others.
    pluginAProfileIds.push("plugin-a:profile:0.1");
    const after = pipeline.runPrimitive(RISK_INSTANCE, profileA);
    expect(
      after.findings.some((f) => f.rule_id === "plugin-a:always-reject"),
    ).toBe(true);

    const profileB = profileWithRiskType("plugin-b:profile:0.1");
    const onB = pipeline.runPrimitive(RISK_INSTANCE, profileB);
    expect(
      onB.findings.some((f) => f.rule_id === "plugin-a:always-reject"),
    ).toBe(false);
  });
});
