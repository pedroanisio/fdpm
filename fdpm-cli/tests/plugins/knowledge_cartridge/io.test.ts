/**
 * `kc-jsonl` — the importer/exporter pair that makes a cartridge portable.
 *
 * This matters more here than for most profiles. A cartridge is sold as a
 * *module*: something you hand to a practitioner who has never read the
 * sources. Without an export path it can only exist inside the workspace that
 * built it, which makes the metaphor false.
 *
 * What is asserted is the round trip, not the byte format: export a seeded
 * cartridge, import it into a fresh workbook, and the graph that comes back has
 * the same primitives and the same edges. The two properties that would quietly
 * break it are tested directly — citation edges must survive (a cartridge whose
 * claims lose their KEY:ordinal is no longer a cartridge), and the discarded
 * harvest arm must survive (or the discard rate silently rises to 100 % on the
 * far side).
 */
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { Host } from "../../../src/core/host.js";
import { exportTransfer } from "../../../src/core/host-extra.js";
import { KC_JSONL_FORMAT } from "../../../plugins/knowledge_cartridge/io.js";
import { PROFILE_ID, R, T } from "../../../plugins/knowledge_cartridge/ids.js";
import { seedCartridge } from "./_fixture.js";

async function freshHost(): Promise<Host> {
  const host = new Host({
    dataDir: null,
    builtinDirs: [join(process.cwd(), "plugins")],
    pluginPaths: [],
  });
  await host.load();
  return host;
}

async function exportedText(workbookId: string): Promise<string> {
  const host = await freshHost();
  await seedCartridge(host, workbookId);
  const transfer = exportTransfer(host, workbookId);
  const bytes = await host.plugins.runExporter(KC_JSONL_FORMAT, transfer);
  return new TextDecoder().decode(bytes);
}

describe("kc-jsonl exporter", () => {
  it("is registered under the vendor-prefixed format name", async () => {
    const host = await freshHost();
    expect(host.plugins.listExporters().map((e) => e.format)).toContain(KC_JSONL_FORMAT);
    expect(host.plugins.listImporters().map((i) => i.format)).toContain(KC_JSONL_FORMAT);
    expect(KC_JSONL_FORMAT).toBe("kc-jsonl");
  });

  it("emits one JSON record per line, each parseable on its own", async () => {
    const text = await exportedText("kc-io1");
    const lines = text.split("\n").filter((l) => l.trim().length > 0);
    expect(lines.length).toBeGreaterThan(20);
    for (const line of lines) {
      const rec = JSON.parse(line) as { kind: string; data: { type_id: string } };
      expect(["primitive", "relation"]).toContain(rec.kind);
      expect(rec.data.type_id.startsWith("kc:")).toBe(true);
    }
  });

  it("carries the discarded harvest arm, not only the retained one", async () => {
    const text = await exportedText("kc-io2");
    const rows = text
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as { data: { type_id: string; field_values?: Record<string, unknown> } })
      .filter((r) => r.data.type_id === T.Harvest);
    expect(rows.filter((r) => r.data.field_values?.["retained"] === false).length).toBeGreaterThan(0);
    expect(rows.filter((r) => r.data.field_values?.["retained"] === true).length).toBeGreaterThan(0);
  });

  it("carries the citation edges", async () => {
    const text = await exportedText("kc-io3");
    expect(text).toContain(R.CitesSource);
  });
});

describe("kc-jsonl importer", () => {
  it("round-trips a cartridge into a fresh workbook with the same graph", async () => {
    const source = await freshHost();
    await seedCartridge(source, "kc-io-src");
    const before = source.getProject("kc-io-src");
    const text = new TextDecoder().decode(
      await source.plugins.runExporter(KC_JSONL_FORMAT, exportTransfer(source, "kc-io-src")),
    );

    const target = await freshHost();
    const transfer = await target.plugins.runImporter(KC_JSONL_FORMAT, text, {
      workbookId: "kc-io-dst",
      projectName: "Imported cartridge",
    });
    expect(transfer.workbook.profile_id).toBe(PROFILE_ID);
    expect(transfer.primitives.length).toBe(Object.keys(before.primitives).length);
    expect(transfer.relations.length).toBe(Object.keys(before.relations).length);

    const idsBefore = Object.keys(before.primitives).sort();
    const idsAfter = transfer.primitives.map((p) => p.id).sort();
    expect(idsAfter).toEqual(idsBefore);
  });

  it("accepts a Uint8Array as well as a string", async () => {
    const text = await exportedText("kc-io4");
    const host = await freshHost();
    const transfer = await host.plugins.runImporter(
      KC_JSONL_FORMAT,
      new TextEncoder().encode(text),
      { workbookId: "kc-io-bytes" },
    );
    expect(transfer.primitives.length).toBeGreaterThan(0);
  });

  it("defaults the workbook id rather than throwing when none is supplied", async () => {
    const text = await exportedText("kc-io5");
    const host = await freshHost();
    const transfer = await host.plugins.runImporter(KC_JSONL_FORMAT, text);
    expect(transfer.workbook.id.length).toBeGreaterThan(0);
    expect(transfer.workbook.profile_id).toBe(PROFILE_ID);
  });

  it("rejects input it cannot decode instead of importing an empty cartridge", async () => {
    const host = await freshHost();
    await expect(host.plugins.runImporter(KC_JSONL_FORMAT, 42 as unknown)).rejects.toThrow(
      /kc-jsonl/,
    );
  });

  it("rejects a malformed line rather than skipping it", async () => {
    // A silently skipped line is a claim that vanishes from a cartridge whose
    // whole contract is that every claim is accounted for.
    const host = await freshHost();
    await expect(
      host.plugins.runImporter(KC_JSONL_FORMAT, '{"kind":"primitive","data":{}}\nnot json\n'),
    ).rejects.toThrow();
  });

  it("ignores blank lines", async () => {
    const text = await exportedText("kc-io6");
    const host = await freshHost();
    const transfer = await host.plugins.runImporter(KC_JSONL_FORMAT, `\n\n${text}\n\n`);
    expect(transfer.primitives.length).toBeGreaterThan(0);
  });
});

describe("kc-jsonl — the imported cartridge still validates", () => {
  it("passes the same Pass-6 gate on the far side of the round trip", async () => {
    const source = await freshHost();
    await seedCartridge(source, "kc-io-v1");
    const text = new TextDecoder().decode(
      await source.plugins.runExporter(KC_JSONL_FORMAT, exportTransfer(source, "kc-io-v1")),
    );

    const target = await freshHost();
    const transfer = await target.plugins.runImporter(KC_JSONL_FORMAT, text, {
      workbookId: "kc-io-v2",
    });

    // Replay the transfer through the real write path so every row is gated.
    await target.createProject({
      workbook_id: "kc-io-v2",
      name: "Imported",
      profile_id: PROFILE_ID,
    });
    for (const p of transfer.primitives.filter((x) => x.type_id !== T.Cartridge)) {
      await target.createPrimitive("kc-io-v2", {
        id: p.id,
        type_id: p.type_id,
        field_values: p.field_values,
      });
    }
    for (const r of transfer.relations) {
      await target.createRelation("kc-io-v2", {
        id: r.id,
        type_id: r.type_id,
        source_id: r.source_id,
        target_id: r.target_id,
        field_values: r.field_values,
      });
    }
    // The header is the Pass-6 gate; it must be writable, which proves every
    // citation edge survived the round trip.
    const header = transfer.primitives.find((x) => x.type_id === T.Cartridge)!;
    const out = await target.createPrimitive("kc-io-v2", {
      id: header.id,
      type_id: header.type_id,
      field_values: header.field_values,
    });
    expect(out.report.accepted, JSON.stringify(out.report.findings)).toBe(true);
  });
});
