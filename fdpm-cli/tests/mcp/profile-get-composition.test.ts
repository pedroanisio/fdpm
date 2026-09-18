/**
 * `fdpm.profile.get` over a composition profile.
 *
 * The defect this guards against, measured on the operator's own tree:
 * `profile:formal-specification-dnis:0.1` declares no types of its own and
 * inherits 34 primitive and 32 relation types through `extends`. The tool
 * read the RAW profile, so `view: "types"` answered
 *
 *     { "primitive_types": [], "relation_types": [], "_view": "types" }
 *
 * in 206 B, with `ok: true`. A well-formed, schema-valid, entirely useless
 * answer — the failure mode the result ceiling exists to prevent, one layer
 * up: the caller cannot tell "this profile has no types" from "this view
 * cannot see them", and nothing in the response says which it is.
 *
 * `fdpm.profile.type_info` has always read the RESOLVED profile, so the
 * inconsistency was internal to one tool family: `type_ids` would omit a
 * type id that `type_info` then answered for.
 *
 * The contract asserted here: the vocabulary views (`summary`, `type_ids`,
 * `types`) project the resolved profile; `view: "full"` keeps returning the
 * raw stored document, because that is the profile as registered and the
 * `extends` chain is a derivation of it.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Host } from "../../src/core/host.js";
import { TEST_PROFILE } from "../fixtures.js";
import { createDispatcher } from "../../src/mcp/dispatch.js";
import { createSession } from "../../src/mcp/session.js";
import type { DispatchCtx } from "../../src/mcp/types.js";

let dataDir: string;
beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "fdpm-mcp-comp-"));
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

/**
 * A parent carrying the whole vocabulary and a child that declares none of
 * its own — the shape of every `*-dnis` composition in the tree.
 */
async function bootstrap(): Promise<{ host: Host; ctx: DispatchCtx }> {
  const host = new Host({ dataDir, noPlugins: true });
  await host.load();
  await host.registerProfile(TEST_PROFILE);

  const child = {
    ...structuredClone(TEST_PROFILE),
    id: "test:composed",
    version: "0.1.0",
    label: "Composed",
    extends: ["test:demo@1.0.0"],
    categories: [],
    scopes: [],
    primitive_types: [],
    relation_types: [],
    validation_rules: [],
  };
  await host.registerProfile(child as never);

  const ctx: DispatchCtx = {
    session: createSession({ maxPerMinute: 600 }),
    enableDestructive: false,
    enabledPlugins: new Set(),
    auditFullArgs: false,
    hostOptions: { dataDir, noPlugins: true },
  };
  return { host, ctx };
}

/** The inherited vocabulary, read straight from the registry. */
function inheritedCounts(host: Host): { primitives: number; relations: number } {
  const resolved = host.profiles.getResolved("test:composed");
  return {
    primitives: resolved.primitive_types.length,
    relations: resolved.relation_types.length,
  };
}

describe("fdpm.profile.get — composition profiles", () => {
  it("view: types names the inherited types instead of two empty arrays", async () => {
    const { host, ctx } = await bootstrap();
    const expected = inheritedCounts(host);
    expect(expected.primitives).toBeGreaterThan(0);

    const d = createDispatcher(host, ctx, null);
    const res = await d.call("fdpm.profile.get", {
      profile_id: "test:composed",
      view: "types",
    });

    expect(res.isError).toBe(false);
    const body = res.structuredContent as {
      _view: string;
      primitive_types: { id: string }[];
      relation_types: { id: string }[];
    };
    expect(body._view).toBe("types");
    expect(body.primitive_types).toHaveLength(expected.primitives);
    expect(body.relation_types).toHaveLength(expected.relations);
  });

  it("view: type_ids lists exactly the ids fdpm.profile.type_info answers for", async () => {
    const { host, ctx } = await bootstrap();
    const d = createDispatcher(host, ctx, null);

    const res = await d.call("fdpm.profile.get", {
      profile_id: "test:composed",
      view: "type_ids",
    });
    expect(res.isError).toBe(false);
    const ids = (res.structuredContent as { primitive_type_ids: string[] })
      .primitive_type_ids;
    expect(ids.length).toBe(inheritedCounts(host).primitives);

    // The ladder has to terminate: every id this view hands back must be one
    // `type_info` accepts. A type_ids/type_info disagreement is the bug.
    for (const id of ids) {
      const info = await d.call("fdpm.profile.type_info", {
        profile_id: "test:composed",
        type_id: id,
      });
      expect(info.isError, `type_info rejected ${id}`).toBe(false);
    }
  });

  it("view: summary counts the vocabulary a caller can actually use", async () => {
    const { host, ctx } = await bootstrap();
    const expected = inheritedCounts(host);
    const d = createDispatcher(host, ctx, null);

    const res = await d.call("fdpm.profile.get", {
      profile_id: "test:composed",
      view: "summary",
    });
    expect(res.isError).toBe(false);
    const body = res.structuredContent as {
      primitive_type_count: number;
      relation_type_count: number;
    };
    expect(body.primitive_type_count).toBe(expected.primitives);
    expect(body.relation_type_count).toBe(expected.relations);
  });

  it("view: full still returns the raw stored document, extends chain unmerged", async () => {
    const { host, ctx } = await bootstrap();
    const d = createDispatcher(host, ctx, null);

    const res = await d.call("fdpm.profile.get", { profile_id: "test:composed" });
    expect(res.isError).toBe(false);
    const body = res.structuredContent as {
      primitive_types: unknown[];
      extends: string[];
    };
    expect(body.primitive_types).toHaveLength(0);
    expect(body.extends).toEqual(["test:demo@1.0.0"]);
  });

  it("leaves a non-composition profile's views identical to its raw vocabulary", async () => {
    const { host, ctx } = await bootstrap();
    const d = createDispatcher(host, ctx, null);

    const res = await d.call("fdpm.profile.get", {
      profile_id: "test:demo",
      view: "types",
    });
    expect(res.isError).toBe(false);
    const body = res.structuredContent as { primitive_types: { id: string }[] };
    expect(body.primitive_types).toHaveLength(TEST_PROFILE.primitive_types.length);
  });
});
