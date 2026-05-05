import { describe, it, expect } from "vitest";
import { newHost } from "./fixtures.js";
import { splitProject } from "../src/core/host-extra.js";
import {
  FDPMException,
  EXIT_CODE_FOR_CATEGORY,
} from "../src/core/errors/fdpm-exception.js";

/**
 * Issue-C regression tests.
 *
 * `splitProject` had two adjacent throws on consecutive lines:
 *
 *   - body.partition.length < 2                 → was `validation`
 *   - body.cross_partition_relations !== "drop" →     `verification`
 *
 * Both checks fail BEFORE any workbook state is touched and BEFORE any
 * profile rule runs — they're pure request-shape contract checks (PALS
 * gate level). Splitting them between two categories meant the operator
 * got two different exit codes (2 vs 3) for "your split request is
 * malformed" depending on which field was wrong.
 *
 * Post-fix: both throw `verification` (exit 3). This file pins:
 *   1. category=verification on partition.length<2,
 *   2. category=verification on cross_partition_relations!=drop,
 *   3. structured evidence on partition.length<2,
 *   4. exit codes are aligned (no operator-visible split between the two),
 *   5. genuine profile-rule failures (e.g. is_partition_unit missing)
 *      keep category=validation — the fix is targeted, not a blanket
 *      reclassification.
 */

async function projectWithSection(workbookId = "p1") {
  const host = await newHost();
  await host.createProject({
    workbook_id: workbookId,
    name: "P",
    profile_id: "test:demo",
  });
  await host.createPrimitive(workbookId, {
    id: "section:a",
    type_id: "test:section",
    field_values: { title: "A", number: 1 },
  });
  return host;
}

describe("Issue-C — splitProject request-shape errors are `verification`", () => {
  it("partition.length < 2 throws FDPMException(verification)", async () => {
    const host = await projectWithSection();
    let caught: unknown;
    try {
      await splitProject(host, "p1", {
        partition: [{ target_workbook_name: "Solo", sections: ["section:a"] }],
        cross_partition_relations: "drop",
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(FDPMException);
    const fdpm = caught as FDPMException;
    expect(fdpm.category).toBe("verification");
    expect(EXIT_CODE_FOR_CATEGORY[fdpm.category]).toBe(3);
    expect(fdpm.message).toMatch(/partition must have >= 2 entries/);
  });

  it("partition.length < 2 attaches structured evidence (observed, minimum)", async () => {
    const host = await projectWithSection();
    let caught: unknown;
    try {
      await splitProject(host, "p1", {
        partition: [], // observed = 0
        cross_partition_relations: "drop",
      });
    } catch (err) {
      caught = err;
    }
    const fdpm = caught as FDPMException;
    expect(fdpm.evidence).toEqual({ observed: 0, minimum: 2 });
  });

  it("partition.length === 1 also surfaces (boundary)", async () => {
    const host = await projectWithSection();
    let caught: unknown;
    try {
      await splitProject(host, "p1", {
        partition: [{ target_workbook_name: "Solo", sections: ["section:a"] }],
        cross_partition_relations: "drop",
      });
    } catch (err) {
      caught = err;
    }
    expect((caught as FDPMException).evidence).toEqual({
      observed: 1,
      minimum: 2,
    });
  });

  it("cross_partition_relations != 'drop' also throws verification (unchanged behavior pinned)", async () => {
    const host = await projectWithSection();
    let caught: unknown;
    try {
      await splitProject(host, "p1", {
        partition: [
          { target_workbook_name: "X", sections: ["section:a"] },
          { target_workbook_name: "Y", sections: ["section:b"] },
        ],
        // @ts-expect-error — exercising the runtime check on a malformed value
        cross_partition_relations: "keep",
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(FDPMException);
    expect((caught as FDPMException).category).toBe("verification");
  });

  it("the two adjacent request-shape checks share an exit code (the original gripe)", async () => {
    const host = await projectWithSection();

    const captureCategory = async (
      body: Parameters<typeof splitProject>[2],
    ): Promise<FDPMException["category"]> => {
      try {
        await splitProject(host, "p1", body);
      } catch (err) {
        return (err as FDPMException).category;
      }
      throw new Error("expected splitProject to throw");
    };

    const tooFew = await captureCategory({
      partition: [{ target_workbook_name: "Solo", sections: ["section:a"] }],
      cross_partition_relations: "drop",
    });
    const wrongStrategy = await captureCategory({
      partition: [
        { target_workbook_name: "X", sections: ["section:a"] },
        { target_workbook_name: "Y", sections: ["section:b"] },
      ],
      // @ts-expect-error — runtime check
      cross_partition_relations: "keep",
    });

    expect(tooFew).toBe(wrongStrategy);
    expect(EXIT_CODE_FOR_CATEGORY[tooFew]).toBe(EXIT_CODE_FOR_CATEGORY[wrongStrategy]);
  });
});

describe("Issue-C — fix scope is targeted: profile-rule throws keep `validation`", () => {
  it("'profile has no is_partition_unit=true type' is still validation, not verification", async () => {
    const host = await newHost();
    // core:empty has no partition-unit type, so the partition_unit check
    // at host-extra.ts L86 fires AFTER the request-shape checks pass.
    await host.createProject({
      workbook_id: "p1",
      name: "P1",
      profile_id: "core:empty",
    });
    let caught: unknown;
    try {
      await splitProject(host, "p1", {
        partition: [
          { target_workbook_name: "X", sections: ["section:a"] },
          { target_workbook_name: "Y", sections: ["section:b"] },
        ],
        cross_partition_relations: "drop",
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(FDPMException);
    const fdpm = caught as FDPMException;
    // This one is a profile-rule precondition failure, not a request-shape
    // failure — keeping it as `validation` preserves the verification ↔
    // validation taxonomy boundary.
    expect(fdpm.category).toBe("validation");
    expect(EXIT_CODE_FOR_CATEGORY[fdpm.category]).toBe(2);
    expect(fdpm.message).toMatch(/is_partition_unit/);
  });
});
