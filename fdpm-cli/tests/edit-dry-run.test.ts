import { describe, it, expect } from "vitest";
import { newHost } from "./fixtures.js";
import { batchEdit } from "../src/core/host-extra.js";

/**
 * #5 — `batchEdit` dry-run mode.
 *
 * Validates schema gate without mutating state. Catches malformed
 * payloads up front so the operator doesn't apply a 100-op batch to
 * discover op #87 was wrong.
 */
describe("batchEdit dry-run", () => {
  it("returns would-* outcomes without changing revision", async () => {
    const host = await newHost();
    await host.createProject({ project_id: "p", name: "P", profile_id: "test:demo" });
    const before = host.getProject("p").project.revision;
    const result = await batchEdit(
      host,
      "p",
      [
        {
          kind: "primitive.create",
          payload: {
            id: "section:a",
            type_id: "test:section",
            field_values: { title: "A", number: 1 },
          },
        },
        {
          kind: "primitive.patch",
          payload: { id: "section:a", field_values: { title: "B" } },
        },
      ],
      undefined,
      { dryRun: true },
    );
    expect(result.dry_run).toBe(true);
    expect(result.results.map((r) => r.outcome)).toEqual([
      "would-created",
      "would-patched",
    ]);
    const after = host.getProject("p").project.revision;
    expect(after).toBe(before);
    expect(host.getProject("p").primitives["section:a"]).toBeUndefined();
  });

  it("rejects malformed payload before applying anything", async () => {
    const host = await newHost();
    await host.createProject({ project_id: "p", name: "P", profile_id: "test:demo" });
    const before = host.getProject("p").project.revision;
    await expect(
      batchEdit(
        host,
        "p",
        [
          {
            kind: "primitive.create",
            payload: {
              id: "section:a",
              type_id: "test:section",
              field_values: { title: "A", number: 1 },
            },
          },
          {
            // Missing id — payload schema violation.
            kind: "primitive.patch",
            payload: { field_values: { title: "broken" } },
          },
        ],
        undefined,
        { dryRun: true },
      ),
    ).rejects.toThrow(/payload schema violation/);
    expect(host.getProject("p").project.revision).toBe(before);
  });

  it("mutating mode still works end-to-end (no regression)", async () => {
    const host = await newHost();
    await host.createProject({ project_id: "p", name: "P", profile_id: "test:demo" });
    const result = await batchEdit(host, "p", [
      {
        kind: "primitive.create",
        payload: {
          id: "section:a",
          type_id: "test:section",
          field_values: { title: "A", number: 1 },
        },
      },
    ]);
    expect(result.dry_run).toBeUndefined();
    expect(result.results[0]?.outcome).toBe("created");
    expect(host.getProject("p").primitives["section:a"]).toBeDefined();
  });
});
