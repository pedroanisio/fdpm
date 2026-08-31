/**
 * Projection-view and rollback contract.
 *
 * `sliceProject` returns a *view* over live projection state rather than
 * a deep copy, and rollback restores by replaying the workbook's log
 * rather than by pre-copying the workbook before every append. Both
 * changes are load-bearing for write scaling (see
 * `docs/architecture/PERFORMANCE-IO-ANALYSIS.md`), and both have
 * contracts that are easy to break silently:
 *
 *   - a rebuild that forgets `uid_index` cannot replay its own log,
 *     because every create trips the uid-collision guard;
 *   - a rollback that forgets `uid_index` leaks a uid that no live
 *     primitive owns, permanently poisoning that id;
 *   - `takeSnapshot` must keep deep-copying, because a snapshot outlives
 *     the writes that follow it.
 *
 * These tests pin all three.
 */
import { describe, expect, it } from "vitest";
import { newHost, TEST_PROFILE } from "./fixtures.js";
import { Host } from "../src/core/host.js";
import { FDPMException } from "../src/core/errors/fdpm-exception.js";

async function hostWithSections(ids: string[]): Promise<Host> {
  const host = await newHost();
  await host.createProject({ workbook_id: "p", name: "P", profile_id: TEST_PROFILE.id });
  for (const [i, id] of ids.entries()) {
    await host.createPrimitive("p", {
      id,
      type_id: "test:section",
      field_values: { title: `T${i}`, number: i },
    });
  }
  return host;
}

describe("projection rebuild", () => {
  it("replays a workbook's own log without tripping the uid guard", async () => {
    const host = await hostWithSections(["section:a", "section:b"]);
    const uidsBefore = Object.keys(host.store.getRawState().uid_index).sort();

    // Discard and re-derive. A rebuild that leaves uid_index populated
    // throws `uid collision` on the first primitive.create it replays.
    expect(() => host.store.rebuildProject("p")).not.toThrow();

    expect(Object.keys(host.getProject("p").primitives).sort()).toEqual([
      "section:a",
      "section:b",
    ]);
    // The index is rebuilt to exactly what it was — not doubled, not empty.
    expect(Object.keys(host.store.getRawState().uid_index).sort()).toEqual(uidsBefore);
  });

  it("is idempotent across repeated rebuilds", async () => {
    const host = await hostWithSections(["section:a"]);
    host.store.rebuildProject("p");
    host.store.rebuildProject("p");
    host.store.rebuildProject("p");
    expect(Object.keys(host.getProject("p").primitives)).toEqual(["section:a"]);
    expect(Object.keys(host.store.getRawState().uid_index)).toHaveLength(1);
  });
});

describe("rollback releases uid_index entries", () => {
  it("a partially-applied batch leaves no orphaned uid behind", async () => {
    const host = await hostWithSections([]);
    const uidsBefore = Object.keys(host.store.getRawState().uid_index);
    expect(uidsBefore).toHaveLength(0);

    // Entry 1 applies (claiming a uid); entry 2 collides on id and aborts
    // the batch. The rollback must release entry 1's uid.
    expect(() =>
      host.store.appendBatch([
        {
          kind: "primitive.create",
          workbook_id: "p",
          payload: {
            id: "section:dup",
            uid: "01JAAAAAAAAAAAAAAAAAAAAAAA",
            type_id: "test:section",
            field_values: { title: "one", number: 1 },
          },
        },
        {
          kind: "primitive.create",
          workbook_id: "p",
          payload: {
            id: "section:dup",
            uid: "01JBBBBBBBBBBBBBBBBBBBBBBB",
            type_id: "test:section",
            field_values: { title: "two", number: 2 },
          },
        },
      ]),
    ).toThrow(FDPMException);

    expect(Object.keys(host.getProject("p").primitives)).toEqual([]);
    // The leak this pins: without a uid sweep the first entry's uid stays
    // claimed, and re-creating that primitive fails forever after.
    expect(Object.keys(host.store.getRawState().uid_index)).toEqual([]);
    expect(host.store.lookupUid("01JAAAAAAAAAAAAAAAAAAAAAAA")).toBeNull();
  });

  it("the workbook is usable again after a rolled-back batch", async () => {
    const host = await hostWithSections([]);
    try {
      host.store.appendBatch([
        {
          kind: "primitive.create",
          workbook_id: "p",
          payload: {
            id: "section:x",
            uid: "01JCCCCCCCCCCCCCCCCCCCCCCC",
            type_id: "test:section",
            field_values: { title: "one", number: 1 },
          },
        },
        {
          kind: "primitive.create",
          workbook_id: "p",
          payload: {
            id: "section:x",
            uid: "01JDDDDDDDDDDDDDDDDDDDDDDD",
            type_id: "test:section",
            field_values: { title: "two", number: 2 },
          },
        },
      ]);
    } catch {
      /* expected */
    }
    // Same id, through the ordinary API: must succeed.
    const { append } = await host.createPrimitive("p", {
      id: "section:x",
      type_id: "test:section",
      field_values: { title: "retry", number: 9 },
    });
    expect(append.op.kind).toBe("primitive.create");
    expect(Object.keys(host.getProject("p").primitives)).toEqual(["section:x"]);
  });
});

describe("slice semantics", () => {
  it("getProject returns a live view of the workbook", async () => {
    const host = await hostWithSections(["section:a"]);
    const view = host.getProject("p");
    await host.createPrimitive("p", {
      id: "section:b",
      type_id: "test:section",
      field_values: { title: "B", number: 2 },
    });
    // The view tracks the projection; it is not a point-in-time copy.
    expect(Object.keys(view.primitives).sort()).toEqual(["section:a", "section:b"]);
  });

  it("takeSnapshot stays detached from writes that follow it", async () => {
    const host = await hostWithSections(["section:a"]);
    host.store.takeSnapshot("p", host.getProject("p").workbook.revision);
    const snap = host.store.getSnapshots("p")[0]!;

    await host.createPrimitive("p", {
      id: "section:b",
      type_id: "test:section",
      field_values: { title: "B", number: 2 },
    });

    // The snapshot is the reason `sliceProjectIsolated` still exists.
    expect(Object.keys(snap.state.primitives)).toEqual(["section:a"]);
    expect(Object.keys(host.getProject("p").primitives).sort()).toEqual([
      "section:a",
      "section:b",
    ]);
  });
});
