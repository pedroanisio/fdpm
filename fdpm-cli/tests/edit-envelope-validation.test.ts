import { describe, it, expect } from "vitest";
import { Command } from "commander";
import { newHost } from "./fixtures.js";
import { buildEditCommand } from "../src/commands/edit.js";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FDPMException } from "../src/core/errors/fdpm-exception.js";

/**
 * #3 (pass-2) — `fdpm edit` rejects malformed envelope shapes up front
 * with a typed FDPMException, before any per-op work.
 *
 * Without this, a missing `operations` array surfaced as a TypeError
 * deep in the batch loop.
 */

async function writeJson(value: unknown): Promise<string> {
  const path = join(tmpdir(), `fdpm-edit-test-${process.hrtime.bigint()}.json`);
  await fs.writeFile(path, JSON.stringify(value), "utf8");
  return path;
}

async function runEdit(host: Awaited<ReturnType<typeof newHost>>, project: string, body: unknown) {
  const path = await writeJson(body);
  const program = new Command().exitOverride();
  program.addCommand(buildEditCommand(host));
  // Suppress commander's stderr noise during the test.
  program.configureOutput({ writeOut: () => {}, writeErr: () => {} });
  await program.parseAsync(["node", "fdpm", "edit", project, "-f", path]);
}

describe("fdpm edit envelope validation (pass-2)", () => {
  it("rejects body that is not an object", async () => {
    const host = await newHost();
    await host.createProject({ project_id: "p", name: "P", profile_id: "test:demo" });
    await expect(runEdit(host, "p", [{}])).rejects.toThrow(FDPMException);
  });

  it("rejects body missing operations[]", async () => {
    const host = await newHost();
    await host.createProject({ project_id: "p", name: "P", profile_id: "test:demo" });
    await expect(runEdit(host, "p", { expected_project_revision: 0 })).rejects.toThrow(
      /missing.*operations/i,
    );
  });

  it("rejects op missing kind", async () => {
    const host = await newHost();
    await host.createProject({ project_id: "p", name: "P", profile_id: "test:demo" });
    await expect(
      runEdit(host, "p", { operations: [{ payload: { id: "x" } }] }),
    ).rejects.toThrow(/kind.*non-empty string/i);
  });

  it("rejects op with non-batch-editable kind", async () => {
    const host = await newHost();
    await host.createProject({ project_id: "p", name: "P", profile_id: "test:demo" });
    await expect(
      runEdit(host, "p", {
        operations: [
          { kind: "project.create", payload: { id: "x", name: "X", profile_id: "p" } },
        ],
      }),
    ).rejects.toThrow(/not batch-editable/i);
  });

  it("rejects op with missing payload", async () => {
    const host = await newHost();
    await host.createProject({ project_id: "p", name: "P", profile_id: "test:demo" });
    await expect(
      runEdit(host, "p", { operations: [{ kind: "primitive.delete" }] }),
    ).rejects.toThrow(/payload.*must be an object/i);
  });

  it("rejects non-integer expected_project_revision", async () => {
    const host = await newHost();
    await host.createProject({ project_id: "p", name: "P", profile_id: "test:demo" });
    await expect(
      runEdit(host, "p", {
        expected_project_revision: "not a number",
        operations: [],
      }),
    ).rejects.toThrow(/expected_project_revision/);
  });

  it("accepts a well-formed envelope", async () => {
    const host = await newHost();
    await host.createProject({ project_id: "p", name: "P", profile_id: "test:demo" });
    await runEdit(host, "p", {
      operations: [
        {
          kind: "primitive.create",
          payload: {
            id: "section:a",
            type_id: "test:section",
            field_values: { title: "A", number: 1 },
          },
        },
      ],
    });
    expect(host.getProject("p").primitives["section:a"]).toBeDefined();
  });
});
