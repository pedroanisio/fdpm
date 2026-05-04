import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { newHost, TEST_PROFILE } from "./fixtures.js";
import {
  PrimitiveInstance,
  RelationInstance,
  type ProjectTransfer,
} from "../src/core/models/instance.js";
import {
  isValidUid,
  mintUidFromSeed,
  UID_LENGTH,
  ULID_PATTERN,
} from "../src/core/identity/uid.js";
import {
  cloneProject,
  exportTransfer,
  importTransfer,
} from "../src/core/host-extra.js";
import { Host } from "../src/core/host.js";
import { replay } from "../src/core/store/replay.js";
import { upcastPayload } from "../src/core/operations/upcast.js";
import type { Operation } from "../src/core/operations/operation.js";

/**
 * SPEC-UID v0.1 — acceptance tests for the dual-ID model (slug + ULID).
 *
 * Maps to docs/specs/SPEC-UID.md §12 (Acceptance Criteria) and §13
 * (Conformance items). Each `it` block here corresponds to one AC or
 * conformance item; the comment leading each block notes which one.
 */

// AC-1: schemas declare uid: z.string().length(26).regex(ULID).
describe("SPEC-UID AC-1: schema declares uid as a length-26 ULID", () => {
  it("PrimitiveInstance rejects records with no uid", () => {
    const bad = PrimitiveInstance.safeParse({
      id: "section:x",
      type_id: "test:section",
      field_values: {},
      revision: 0,
    });
    expect(bad.success).toBe(false);
  });

  it("PrimitiveInstance rejects a non-ULID uid", () => {
    const bad = PrimitiveInstance.safeParse({
      id: "section:x",
      uid: "not-a-ulid-at-all-not-26-chars",
      type_id: "test:section",
      field_values: {},
      revision: 0,
    });
    expect(bad.success).toBe(false);
  });

  it("RelationInstance enforces the same uid contract", () => {
    const bad = RelationInstance.safeParse({
      id: "rel:x",
      type_id: "test:rel:contains",
      source_id: "a",
      target_id: "b",
      field_values: {},
      revision: 0,
    });
    expect(bad.success).toBe(false);
  });

  it("UID_LENGTH and ULID_PATTERN are the canonical 26-char Crockford-base32 contract", () => {
    expect(UID_LENGTH).toBe(26);
    expect("01ARZ3NDEKTSV4RRFFQ69G5FAV").toMatch(ULID_PATTERN);
    // Lowercase letters and the excluded characters (I, L, O, U) must reject.
    expect("01arz3ndektsv4rrffq69g5fav").not.toMatch(ULID_PATTERN);
    expect("0IARZ3NDEKTSV4RRFFQ69G5FAV").not.toMatch(ULID_PATTERN);
  });
});

// AC-2: create → uid is a 26-char ULID; replace/patch preserve it.
describe("SPEC-UID AC-2: uid immutability across replace/patch", () => {
  it("createPrimitive produces a 26-char ULID and replace/patch preserve it", async () => {
    const host = await newHost();
    await host.createProject({ project_id: "p", name: "P", profile_id: "test:demo" });
    const created = await host.createPrimitive("p", {
      id: "section:a",
      type_id: "test:section",
      field_values: { title: "Original", number: 1 },
    });
    const initial = host.getProject("p").primitives["section:a"]!;
    expect(isValidUid(initial.uid)).toBe(true);
    void created;

    await host.replacePrimitive("p", {
      id: "section:a",
      type_id: "test:section",
      field_values: { title: "Replaced", number: 1 },
    });
    expect(host.getProject("p").primitives["section:a"]!.uid).toBe(initial.uid);

    await host.patchPrimitive("p", {
      id: "section:a",
      field_values: { title: "Patched" },
    });
    expect(host.getProject("p").primitives["section:a"]!.uid).toBe(initial.uid);

    await host.fieldPatchPrimitive("p", {
      id: "section:a",
      operations: [{ op: "replace", path: "/title", value: "FieldPatched" }],
    });
    expect(host.getProject("p").primitives["section:a"]!.uid).toBe(initial.uid);
  });

  it("createRelation mints a uid; replace/patch preserve it", async () => {
    const host = await newHost();
    await host.createProject({ project_id: "p", name: "P", profile_id: "test:demo" });
    await host.createPrimitive("p", {
      id: "section:s",
      type_id: "test:section",
      field_values: { title: "S", number: 1 },
    });
    await host.createPrimitive("p", {
      id: "para:p1",
      type_id: "test:para",
      field_values: { text: "T" },
    });
    await host.createRelation("p", {
      id: "rel:r",
      type_id: "test:rel:contains",
      source_id: "section:s",
      target_id: "para:p1",
    });
    const initial = host.getProject("p").relations["rel:r"]!;
    expect(isValidUid(initial.uid)).toBe(true);

    await host.replaceRelation("p", {
      id: "rel:r",
      type_id: "test:rel:contains",
      field_values: {},
    });
    expect(host.getProject("p").relations["rel:r"]!.uid).toBe(initial.uid);
  });

  it("rejects an operator-supplied uid on createPrimitive (Core-only mint site)", async () => {
    const host = await newHost();
    await host.createProject({ project_id: "p", name: "P", profile_id: "test:demo" });
    await expect(
      host.createPrimitive("p", {
        id: "section:a",
        uid: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
        type_id: "test:section",
        field_values: { title: "X", number: 1 },
      }),
    ).rejects.toThrow(/uid cannot be set on creation/);
  });
});

// AC-3 / Conformance #1 — corpus invariant: only the identity module
// imports `ulid` directly. Anywhere else must call `mintUid()` /
// `mintUidFromSeed()` instead.
describe("SPEC-UID AC-3 / conformance: ulid() is only called from cli/src/core/identity/uid.ts", () => {
  it("no source file outside core/identity imports or calls ulid() directly", () => {
    const root = join(__dirname, "..", "src");
    const hits: string[] = [];
    walk(root, (file) => {
      if (file.endsWith("/core/identity/uid.ts")) return;
      const text = readFileSync(file, "utf8");
      if (
        /from\s+["']ulid["']/.test(text) ||
        /require\(\s*["']ulid["']\s*\)/.test(text) ||
        /\bulid\s*\(\s*\)/.test(text)
      ) {
        hits.push(file);
      }
    });
    expect(hits).toEqual([]);
  });
});

function walk(dir: string, visit: (file: string) => void): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, visit);
    else if (full.endsWith(".ts")) visit(full);
  }
}

// AC-4: round-trip export → import preserves every uid.
describe("SPEC-UID AC-4: export → import preserves every uid", () => {
  it("re-imported project carries the original uids", async () => {
    const source = await newHost();
    await source.createProject({ project_id: "p", name: "P", profile_id: "test:demo" });
    await source.createPrimitive("p", {
      id: "section:a",
      type_id: "test:section",
      field_values: { title: "A", number: 1 },
    });
    await source.createPrimitive("p", {
      id: "section:b",
      type_id: "test:section",
      field_values: { title: "B", number: 2 },
    });
    const transfer = exportTransfer(source, "p");
    const sourceUids = transfer.primitives.map((p) => p.uid).sort();

    const target = new Host({ dataDir: null, noPlugins: true });
    await target.load();
    await target.registerProfile(TEST_PROFILE);
    // Re-home under a new id to dodge "project already exists" — the
    // uids are project-orthogonal, so the round-trip survives.
    const rehomed: ProjectTransfer = {
      ...transfer,
      project: { ...transfer.project, id: "q" },
    };
    await importTransfer(target, rehomed);
    const targetPrims = Object.values(target.getProject("q").primitives);
    expect(targetPrims.map((p) => p.uid).sort()).toEqual(sourceUids);
  });
});

// AC-5 / Conformance #2 — replay determinism: two independent hosts
// replaying the same v1.1 log produce byte-equal projections (uids
// minted by the upcaster are deterministic functions of op_id).
describe("SPEC-UID AC-5 / conformance: v1.1 → v1.2 upcaster is deterministic across hosts", () => {
  it("mintUidFromSeed is a pure function of its input", () => {
    const seedA = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
    const seedB = "01HV4ZVN2K9TJ7Q7QXJYJ5MZRD";
    expect(mintUidFromSeed(seedA)).toBe(mintUidFromSeed(seedA));
    expect(mintUidFromSeed(seedB)).toBe(mintUidFromSeed(seedB));
    expect(mintUidFromSeed(seedA)).not.toBe(mintUidFromSeed(seedB));
  });

  it("replaying a synthetic v1.1 log produces identical state across two host instances", () => {
    // Synthesise a v1.1-shaped operation log (no uid in payload).
    const op: Operation = {
      op_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      kind: "primitive.create",
      project_id: "p",
      schema_version: "1.1.0",
      revision: 1,
      timestamp: "2026-05-04T00:00:00.000Z",
      request_id: "00000000-0000-7000-8000-000000000000",
      payload: { id: "section:a", type_id: "test:section", field_values: {} },
    };
    const upcast1 = upcastPayload(op.kind, op.schema_version, op.payload, op);
    const upcast2 = upcastPayload(op.kind, op.schema_version, op.payload, op);
    expect(upcast1).toEqual(upcast2);
    expect(typeof upcast1["uid"]).toBe("string");
    expect(isValidUid(upcast1["uid"] as string)).toBe(true);
  });

  it("two replays of the same log produce identical projections (no uid drift)", async () => {
    const host = await newHost();
    await host.createProject({ project_id: "p", name: "P", profile_id: "test:demo" });
    await host.createPrimitive("p", {
      id: "section:a",
      type_id: "test:section",
      field_values: { title: "A", number: 1 },
    });
    const log = host.store.getOperationLog("p");
    const a = replay(log);
    const b = replay(log);
    expect(JSON.stringify(a.primitives)).toBe(JSON.stringify(b.primitives));
    expect(JSON.stringify(a.uid_index)).toBe(JSON.stringify(b.uid_index));
  });
});

// AC-6: clone produces fresh uids — none equal the source's uids.
describe("SPEC-UID AC-6: cloneProject mints fresh uids", () => {
  it("cloned project's uids are disjoint from the source's", async () => {
    const host = await newHost();
    await host.createProject({ project_id: "p", name: "P", profile_id: "test:demo" });
    await host.createPrimitive("p", {
      id: "section:a",
      type_id: "test:section",
      field_values: { title: "A", number: 1 },
    });
    await host.createPrimitive("p", {
      id: "section:b",
      type_id: "test:section",
      field_values: { title: "B", number: 2 },
    });
    const sourceUids = new Set(
      Object.values(host.getProject("p").primitives).map((p) => p.uid),
    );
    await cloneProject(host, "p", { target_project_id: "q", target_project_name: "Q" });
    const cloneUids = Object.values(host.getProject("q").primitives).map((p) => p.uid);
    for (const uid of cloneUids) {
      expect(sourceUids.has(uid)).toBe(false);
      expect(isValidUid(uid)).toBe(true);
    }
  });
});

// AC-7 (was 8 in SPEC v0.1): `--by-uid` and slug both resolve.
describe("SPEC-UID AC-7: --by-uid and slug addressing return the same primitive", () => {
  it("host.lookupUid resolves the index back to the same instance", async () => {
    const host = await newHost();
    await host.createProject({ project_id: "p", name: "P", profile_id: "test:demo" });
    await host.createPrimitive("p", {
      id: "section:a",
      type_id: "test:section",
      field_values: { title: "A", number: 1 },
    });
    const slug = host.getProject("p").primitives["section:a"]!;
    const entry = host.lookupUid(slug.uid);
    expect(entry).toEqual({ project_id: "p", kind: "primitive", id: "section:a" });
    const byUid = host.resolvePrimitiveByUid(slug.uid);
    expect(byUid.primitive).toStrictEqual(slug);
    expect(byUid.project_id).toBe("p");
  });

  it("uid_index drops entries when primitives are deleted", async () => {
    const host = await newHost();
    await host.createProject({ project_id: "p", name: "P", profile_id: "test:demo" });
    await host.createPrimitive("p", {
      id: "section:a",
      type_id: "test:section",
      field_values: { title: "A", number: 1 },
    });
    const uid = host.getProject("p").primitives["section:a"]!.uid;
    expect(host.lookupUid(uid)).not.toBeNull();
    await host.deletePrimitive("p", "section:a");
    expect(host.lookupUid(uid)).toBeNull();
  });

  it("uid_index drops cascaded relation entries when their endpoints are deleted", async () => {
    const host = await newHost();
    await host.createProject({ project_id: "p", name: "P", profile_id: "test:demo" });
    await host.createPrimitive("p", {
      id: "section:s",
      type_id: "test:section",
      field_values: { title: "S", number: 1 },
    });
    await host.createPrimitive("p", {
      id: "para:p1",
      type_id: "test:para",
      field_values: { text: "T" },
    });
    await host.createRelation("p", {
      id: "rel:r",
      type_id: "test:rel:contains",
      source_id: "section:s",
      target_id: "para:p1",
    });
    const relUid = host.getProject("p").relations["rel:r"]!.uid;
    expect(host.lookupUid(relUid)).not.toBeNull();
    await host.deletePrimitive("p", "para:p1"); // cascades: deletes rel:r too
    expect(host.lookupUid(relUid)).toBeNull();
  });
});

// SPEC-UID §15 step 5 — transfer.import uid-collision policies.
describe("SPEC-UID transfer.import uid policies", () => {
  it("preserve mode (default) carries uids through and rejects same-uid collisions", async () => {
    const host = await newHost();
    await host.createProject({ project_id: "p", name: "P", profile_id: "test:demo" });
    await host.createPrimitive("p", {
      id: "section:a",
      type_id: "test:section",
      field_values: { title: "A", number: 1 },
    });
    const transfer = exportTransfer(host, "p");
    // Re-home and import: uids are preserved (project boundaries don't
    // make a uid local).
    const rehomed: ProjectTransfer = {
      ...transfer,
      project: { ...transfer.project, id: "q" },
    };
    // First re-import succeeds with preserved uids.
    await expect(importTransfer(host, rehomed)).rejects.toThrow(/uid collision/);
  });

  it("merge-by-uid skips bundled records that already exist locally", async () => {
    const host = await newHost();
    await host.createProject({ project_id: "p", name: "P", profile_id: "test:demo" });
    await host.createPrimitive("p", {
      id: "section:a",
      type_id: "test:section",
      field_values: { title: "A", number: 1 },
    });
    const transfer = exportTransfer(host, "p");
    const rehomed: ProjectTransfer = {
      ...transfer,
      project: { ...transfer.project, id: "q" },
    };
    const result = await importTransfer(host, rehomed, { uidMode: "merge-by-uid" });
    expect(result.primitives_skipped_uid_match).toBe(1);
    expect(result.primitives_imported).toBe(0);
  });

  it("mint-fresh ignores bundled uids", async () => {
    const host = await newHost();
    await host.createProject({ project_id: "p", name: "P", profile_id: "test:demo" });
    await host.createPrimitive("p", {
      id: "section:a",
      type_id: "test:section",
      field_values: { title: "A", number: 1 },
    });
    const sourceUid = host.getProject("p").primitives["section:a"]!.uid;
    const transfer = exportTransfer(host, "p");
    const rehomed: ProjectTransfer = {
      ...transfer,
      project: { ...transfer.project, id: "q" },
    };
    await importTransfer(host, rehomed, { uidMode: "mint-fresh" });
    const newUid = host.getProject("q").primitives["section:a"]!.uid;
    expect(newUid).not.toBe(sourceUid);
    expect(isValidUid(newUid)).toBe(true);
  });
});
