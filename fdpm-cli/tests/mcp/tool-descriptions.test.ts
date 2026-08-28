/**
 * Tool-description teaching contract (v0.1.1).
 *
 * Tool descriptions are the only LLM-facing teaching surface short of
 * MCP `prompts`. Real-session evidence (rust-cli-greet, sw-arch-rust-
 * cli-greet) showed LLMs hitting `core:id-format` rejection rounds
 * because the descriptions said only "what" the tool did, not "how to
 * use it correctly". The v0.1.1 description pass added pre-call hints,
 * failure-mode contracts, and references to fdpm.profile.type_info.
 *
 * This test guards against silent regression of those properties. It
 * does NOT lint prose — it asserts substance (length, references,
 * envelope-semantics keywords) so a careless edit that returns to the
 * one-sentence form will fail the build.
 */

import { describe, it, expect } from "vitest";
import { MANIFEST } from "../../src/mcp/manifest.js";

const MIN_LEN_TIER_2 = 200;
const MIN_LEN_TIER_3 = 80;
const MIN_LEN_READ_PROJECTED = 120;

const TIER_2_TOOLS = MANIFEST.filter((t) => t.tier === "validating_write");
const TIER_3_TOOLS = MANIFEST.filter((t) => t.tier === "destructive");

const PROJECTION_TOOLS = ["fdpm.profile.get", "fdpm.workbook.get", "fdpm.primitive.get"];

const CREATE_TOOLS_THAT_NEED_TYPE_INFO_HINT = [
  "fdpm.primitive.create",
  "fdpm.relation.create",
];

describe("tool descriptions — teaching contract (v0.1.1)", () => {
  it("every tool has a non-empty description", () => {
    for (const t of MANIFEST) {
      expect(t.description, `${t.name} has empty description`).toBeTruthy();
      expect(t.description.length, `${t.name} description is too short`).toBeGreaterThan(40);
    }
  });

  it("Tier-2 tools have substantial descriptions (>= 200 chars)", () => {
    for (const t of TIER_2_TOOLS) {
      expect(
        t.description.length,
        `${t.name} Tier-2 description is too terse (got ${t.description.length}, need >= ${MIN_LEN_TIER_2})`,
      ).toBeGreaterThanOrEqual(MIN_LEN_TIER_2);
    }
  });

  it("Tier-3 destructive tools document gating semantics", () => {
    for (const t of TIER_3_TOOLS) {
      expect(t.description.length).toBeGreaterThanOrEqual(MIN_LEN_TIER_3);
    }
  });

  it("create tools that take a type_id hint at fdpm.profile.type_info", () => {
    for (const name of CREATE_TOOLS_THAT_NEED_TYPE_INFO_HINT) {
      const t = MANIFEST.find((m) => m.name === name);
      expect(t, `${name} not in manifest`).toBeDefined();
      expect(
        t!.description,
        `${name} description must reference fdpm.profile.type_info`,
      ).toMatch(/fdpm\.profile\.type_info/);
      expect(
        t!.description,
        `${name} description must mention id_pattern`,
      ).toMatch(/id_pattern/);
    }
  });

  it("Tier-2 descriptions document the validation_report envelope semantics", () => {
    for (const t of TIER_2_TOOLS) {
      expect(
        t.description.toLowerCase(),
        `${t.name} should mention rejection / validation_report semantics`,
      ).toMatch(/(reject|validation_report|isError)/);
    }
  });

  it("projection-enabled read tools mention fields argument", () => {
    for (const name of PROJECTION_TOOLS) {
      const t = MANIFEST.find((m) => m.name === name);
      expect(t, `${name} not in manifest`).toBeDefined();
      expect(t!.description.length).toBeGreaterThanOrEqual(MIN_LEN_READ_PROJECTED);
      expect(t!.description).toMatch(/fields/);
    }
  });

  it("descriptions mention prefer-batch hint where a batch alternative exists", () => {
    const create = MANIFEST.find((m) => m.name === "fdpm.primitive.create");
    expect(create!.description).toMatch(/create_batch|batch/);
    const relCreate = MANIFEST.find((m) => m.name === "fdpm.relation.create");
    expect(relCreate!.description).toMatch(/create_batch|batch/);
  });
});

describe("tool descriptions — schema-by-resource contract (SPEC-MCP-SERVER §8.5)", () => {
  it("fdpm.profile.register points the agent at fdpm://schema/profile instead of inlining the schema", () => {
    const t = MANIFEST.find((m) => m.name === "fdpm.profile.register");
    expect(t).toBeDefined();
    expect(t!.description).toMatch(/fdpm:\/\/schema\/profile/);
    expect(t!.description).toMatch(/resources\/read/);
    expect(t!.description).toMatch(/core:profile-schema/);
  });
});
