import { describe, expect, it } from "vitest";
import { isValidProjectId } from "../src/core/identity/id-rules.js";
import { Operation } from "../src/core/operations/operation.js";
import {
  ProjectClonePayload,
  ProjectCreatePayload,
  ProjectDeletePayload,
  ProjectSplitPayload,
} from "../src/core/operations/payloads.js";

const WINDOWS_DEVICE_NAMES = [
  "con",
  "prn",
  "aux",
  "nul",
  ...Array.from({ length: 9 }, (_, index) => `com${index + 1}`),
  ...Array.from({ length: 9 }, (_, index) => `lpt${index + 1}`),
];

function operation(workbookId: string) {
  return {
    op_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    kind: "workbook.create",
    workbook_id: workbookId,
    payload: {},
    actor: "test",
    timestamp: "2026-08-30T12:00:00.000Z",
    revision: 1,
    request_id: "0198f520-0479-7000-8000-000000000000",
    schema_version: "1.0.0",
  };
}

describe("portable workbook identifiers", () => {
  it.each(WINDOWS_DEVICE_NAMES)(
    "rejects the Windows device name %s before it becomes a directory",
    (workbookId) => {
      expect(isValidProjectId(workbookId)).toBe(false);
      expect(Operation.safeParse(operation(workbookId)).success).toBe(false);
      expect(
        ProjectCreatePayload.safeParse({
          workbook_id: workbookId,
          name: "Portable workbook",
          profile_id: "test:profile",
        }).success,
      ).toBe(false);
      expect(
        ProjectDeletePayload.safeParse({ workbook_id: workbookId }).success,
      ).toBe(false);
      expect(
        ProjectClonePayload.safeParse({
          target_workbook_id: workbookId,
          target_workbook_name: "Portable workbook",
        }).success,
      ).toBe(false);
      expect(
        ProjectSplitPayload.safeParse({
          partition: [
            {
              target_workbook_id: workbookId,
              target_workbook_name: "First",
              sections: ["section:one"],
            },
            {
              target_workbook_id: "portable-two",
              target_workbook_name: "Second",
              sections: ["section:two"],
            },
          ],
          cross_partition_relations: "drop",
        }).success,
      ).toBe(false);
    },
  );

  it("enforces the 128-character limit in helpers and schemas", () => {
    const oversized = "a".repeat(129);

    expect(isValidProjectId(oversized)).toBe(false);
    expect(Operation.safeParse(operation(oversized)).success).toBe(false);
    expect(
      ProjectDeletePayload.safeParse({ workbook_id: oversized }).success,
    ).toBe(false);
  });

  it.each(["workbook-1", "console", "com10", "lpt1-data"])(
    "accepts the portable workbook id %s",
    (workbookId) => {
      expect(isValidProjectId(workbookId)).toBe(true);
      expect(Operation.safeParse(operation(workbookId)).success).toBe(true);
      expect(
        ProjectDeletePayload.safeParse({ workbook_id: workbookId }).success,
      ).toBe(true);
    },
  );
});
