/**
 * testcase:bridge-validator-equivalence for acme.business-deck.
 * For every input, finding count == Zod issue count, modulo rule_id namespacing.
 */

import { describe, expect, it } from "vitest";
import { zodSchemaToValidator } from "@fdpm/zod-bridge";
import {
  ClaimSchema,
  EvidenceSchema,
} from "../../../plugins/acme_business_deck/schemas/business-deck.js";

const PLUGIN_ID = "acme.business-deck";

describe("acme.business-deck — validator-zod equivalence", () => {
  it("returns zero findings for a valid Claim", () => {
    const { validator } = zodSchemaToValidator(ClaimSchema, {
      pluginId: PLUGIN_ID,
      typeName: "claim",
    });
    const findings = validator({
      id: "acme:Claim:c1",
      type_id: "acme:Claim",
      field_values: {
        id: "c1",
        kind: "core",
        text: "We win when audit-grade evidence is required.",
      },
    });
    expect(findings).toEqual([]);
  });

  it("finding count == Zod issue count for missing-required-field input", () => {
    const { validator } = zodSchemaToValidator(ClaimSchema, {
      pluginId: PLUGIN_ID,
      typeName: "claim",
    });
    const safe = ClaimSchema.safeParse({});
    expect(safe.success).toBe(false);
    const issuesCount = safe.success ? 0 : safe.error.issues.length;
    const findings = validator({
      id: "acme:Claim:bad",
      type_id: "acme:Claim",
      field_values: {},
    });
    expect(findings.length).toBe(issuesCount);
  });

  it("emits rule_ids namespaced as <pluginId>:zod.<typeName>.<code>[.<path>]", () => {
    const { validator } = zodSchemaToValidator(ClaimSchema, {
      pluginId: PLUGIN_ID,
      typeName: "claim",
    });
    const findings = validator({
      id: "acme:Claim:bad",
      type_id: "acme:Claim",
      field_values: { id: 123 } as never,
    });
    expect(findings.length).toBeGreaterThan(0);
    const pattern = /^acme\.business-deck:zod\.claim\.[a-z_]+(\.[a-zA-Z0-9_]+)*$/;
    for (const f of findings) {
      expect(f.rule_id).toMatch(pattern);
    }
  });

  it("differs from safeParse only in rule_id namespacing (path bag preserved)", () => {
    const { validator } = zodSchemaToValidator(EvidenceSchema, {
      pluginId: PLUGIN_ID,
      typeName: "evidence",
    });
    const broken = {
      id: "ev-1",
      claims_supported: [], // .min(1) — must fail
      evidence_type: "internal-data",
      summary: "x",
    };
    const safe = EvidenceSchema.safeParse(broken);
    expect(safe.success).toBe(false);
    const findings = validator({
      id: "acme:Evidence:ev-1",
      type_id: "acme:Evidence",
      field_values: broken,
    });
    if (!safe.success) {
      expect(findings.length).toBe(safe.error.issues.length);
      const issuePaths = safe.error.issues.map((i) => i.path.join("."));
      const findingPaths = findings.map((f) =>
        (f.path ?? []).filter((seg) => seg !== "field_values").join("."),
      );
      expect(findingPaths.sort()).toEqual(issuePaths.sort());
    }
  });
});
