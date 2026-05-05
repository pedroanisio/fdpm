import { describe, it, expect } from "vitest";
import { newHost } from "./fixtures.js";
import { FDPMException } from "../src/core/errors/fdpm-exception.js";
import { verifyOperationPayload } from "../src/core/gate/verification-gate.js";

describe("§7 validation pipeline", () => {
  it("core-validation-001: rejects missing required field", async () => {
    const host = await newHost();
    await host.createProject({ workbook_id: "p1", name: "P1", profile_id: "test:demo" });
    await expect(
      host.createPrimitive("p1", {
        id: "section:a",
        type_id: "test:section",
        field_values: { title: "X" }, // missing 'number'
      }),
    ).rejects.toThrow(FDPMException);
  });

  it("core-validation-001: rejects bad ID format", async () => {
    const host = await newHost();
    await host.createProject({ workbook_id: "p1", name: "P1", profile_id: "test:demo" });
    try {
      await host.createPrimitive("p1", {
        id: "Bad-ID",
        type_id: "test:section",
        field_values: { title: "X", number: 1 },
      });
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(FDPMException);
      expect((e as FDPMException).category).toBe("validation");
      const findings = (e as FDPMException).findings as Array<{ rule_id: string }>;
      expect(findings.some((f) => f.rule_id === "core:id-format")).toBe(true);
    }
  });

  it("rejects field-validation max_length violation", async () => {
    const host = await newHost();
    await host.createProject({ workbook_id: "p1", name: "P1", profile_id: "test:demo" });
    await expect(
      host.createPrimitive("p1", {
        id: "section:a",
        type_id: "test:section",
        field_values: { title: "x".repeat(500), number: 1 },
      }),
    ).rejects.toThrow(/validation/);
  });

  it("rejects unknown enum value", async () => {
    const host = await newHost();
    await host.createProject({ workbook_id: "p1", name: "P1", profile_id: "test:demo" });
    await expect(
      host.createPrimitive("p1", {
        id: "section:a",
        type_id: "test:section",
        field_values: { title: "X", number: 1, status: "bogus" },
      }),
    ).rejects.toThrow(/validation/);
  });

  it("relation: rejects when source/target type mismatches RelationTypeDef", async () => {
    const host = await newHost();
    await host.createProject({ workbook_id: "p1", name: "P1", profile_id: "test:demo" });
    await host.createPrimitive("p1", {
      id: "section:a",
      type_id: "test:section",
      field_values: { title: "S", number: 1 },
    });
    // Try to create a contains relation with wrong target type (section -> section).
    await host.createPrimitive("p1", {
      id: "section:b",
      type_id: "test:section",
      field_values: { title: "T", number: 2 },
    });
    await expect(
      host.createRelation("p1", {
        id: "rel:a-b",
        type_id: "test:rel:contains",
        source_id: "section:a",
        target_id: "section:b",
      }),
    ).rejects.toThrow(/validation/);
  });
});

describe("§8 verification gate", () => {
  it("core-gate-001: rejects payload that violates kind schema", () => {
    expect(() =>
      verifyOperationPayload({
        kind: "primitive.create",
        payload: { id: "x" }, // missing type_id, field_values
      }),
    ).toThrow(/payload schema violation/);
  });

  it("core-gate-001: rejects unknown operation kind", () => {
    expect(() =>
      // @ts-expect-error testing runtime rejection of unknown kind
      verifyOperationPayload({ kind: "primitive.tickle", payload: {} }),
    ).toThrow();
  });
});
