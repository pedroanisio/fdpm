import { describe, it, expect } from "vitest";
import { newHost } from "./fixtures.js";
import { buildAuditRecord } from "../src/core/audit/projection.js";
import {
  HOST_VERSION,
  SPEC_CORE_REVISION,
  SPEC_CORE_VERSION,
} from "../src/core/version/spec.js";

describe("§13 observability and audit", () => {
  it("core-observability-002: large audit diff is truncated and marked", async () => {
    const host = await newHost();
    await host.createProject({ workbook_id: "p1", name: "P1", profile_id: "test:demo" });
    // Create a primitive whose field_values blob is large (within the
    // verification gate's per-field max but pushing the audit diff over
    // FDPM_AUDIT_DIFF_MAX_BYTES default 32 KiB).
    const big = "x".repeat(64 * 1024); // 64 KiB
    await host.createPrimitive("p1", {
      id: "section:big",
      type_id: "test:section",
      field_values: { title: "big", number: 1, status: "draft", "_blob": big },
    });
    const log = host.store.getOperationLog("p1");
    const op = log[log.length - 1]!;
    const record = buildAuditRecord(op, log);
    expect(record.diff["_audit_truncated"]).toBe(true);
  });

  it("audit record has all required fields per §13.3", async () => {
    const host = await newHost();
    await host.createProject({ workbook_id: "p1", name: "P1", profile_id: "test:demo" });
    const log = host.store.getOperationLog("p1");
    const record = buildAuditRecord(log[0]!, log);
    expect(record.id).toBe(record.op_id);
    expect(record.action).toBe("workbook.create");
    expect(record.actor).toBeTruthy();
    expect(record.request_id).toBeTruthy();
  });
});

describe("§12.2 versioning", () => {
  it("core-versioning-001: spec_core is major.minor; spec_core_revision is the doc revision", () => {
    // SPEC-CORE 1.3 (this revision) bumps the minor for the
    // `workbook.update` operation kind — §5.5.1's kind set is closed, so
    // adding to it is a minor bump by construction.
    expect(SPEC_CORE_VERSION).toBe("1.3");
    expect(SPEC_CORE_REVISION).toMatch(/^1\.3\.\d+$/);
    expect(HOST_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
