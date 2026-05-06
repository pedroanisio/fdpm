/**
 * testcase:bridge-validator-equivalence for acme.pitch-deck.
 *
 * property:validator-zod-equivalence — for every input, the bridge's
 * derived validator emits exactly one finding per Zod issue produced
 * by schema.safeParse, with rule_ids deterministically derived from
 * (issue.code, issue.path).
 *
 * Plugin-scope check: feed the schemas a corpus of passing/failing
 * inputs and assert finding count == issue count for each.
 */

import { describe, expect, it } from "vitest";
import { zodSchemaToValidator } from "@fdpm/zod-bridge";
import { Schemas } from "../../../plugins/acme_pitch_deck/schemas/pitch-deck.schema.v2.js";

const PLUGIN_ID = "acme.pitch-deck";

describe("acme.pitch-deck — validator-zod equivalence", () => {
  it("returns zero findings for a valid Audience", () => {
    const { validator } = zodSchemaToValidator(Schemas.Audience, {
      pluginId: PLUGIN_ID,
      typeName: "audience",
    });
    const findings = validator({
      id: "acme:Audience:cfo",
      type_id: "acme:Audience",
      field_values: {
        id: "cfo",
        label: "Chief Financial Officer",
        primaryQuestion: "What is the financial impact?",
        evaluationCriteria: ["roi", "tco", "payback-period"],
        failureMode: "audience-uninterested",
      },
    });
    expect(findings).toEqual([]);
  });

  it("returns finding count == Zod issue count for a missing-required-field input", () => {
    const { validator } = zodSchemaToValidator(Schemas.Audience, {
      pluginId: PLUGIN_ID,
      typeName: "audience",
    });
    const safe = Schemas.Audience.safeParse({});
    expect(safe.success).toBe(false);
    const issuesCount = safe.success ? 0 : safe.error.issues.length;
    const findings = validator({
      id: "acme:Audience:bad",
      type_id: "acme:Audience",
      field_values: {},
    });
    expect(findings.length).toBe(issuesCount);
  });

  it("emits rule_ids namespaced as <pluginId>:zod.<typeName>.<code>[.<path>]", () => {
    const { validator } = zodSchemaToValidator(Schemas.Audience, {
      pluginId: PLUGIN_ID,
      typeName: "audience",
    });
    const findings = validator({
      id: "acme:Audience:bad",
      type_id: "acme:Audience",
      field_values: { id: 123 } as never,
    });
    expect(findings.length).toBeGreaterThan(0);
    const pattern = /^acme\.pitch-deck:zod\.audience\.[a-z_]+(\.[a-zA-Z0-9_]+)*$/;
    for (const f of findings) {
      expect(f.rule_id).toMatch(pattern);
    }
  });

  it("differs from safeParse only in rule_id namespacing (count + paths preserved)", () => {
    const { validator } = zodSchemaToValidator(Schemas.Source, {
      pluginId: PLUGIN_ID,
      typeName: "source",
    });
    // type=external-report missing required url field; lastVerifiedDate missing
    const broken = {
      id: "src-1",
      type: "external-report",
      title: "T",
      // url missing
    };
    const safe = Schemas.Source.safeParse(broken);
    expect(safe.success).toBe(false);
    const findings = validator({
      id: "acme:Source:src-1",
      type_id: "acme:Source",
      field_values: broken,
    });
    if (!safe.success) {
      expect(findings.length).toBe(safe.error.issues.length);
      const issuePaths = safe.error.issues.map((i) => i.path.join("."));
      // Bridge prepends "field_values" — strip it for the comparison.
      const findingPaths = findings.map((f) =>
        (f.path ?? []).filter((seg) => seg !== "field_values").join("."),
      );
      // Bag equality on the path set.
      expect(findingPaths.sort()).toEqual(issuePaths.sort());
    }
  });
});
