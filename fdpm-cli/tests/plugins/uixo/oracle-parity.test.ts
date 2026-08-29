/**
 * Parity with the source oracle.
 *
 * The plugin vendors `uixo-native.ts`, which exports `validateUixoDocument`
 * — 41 coded checks across four tiers. The plugin did not call it, and
 * diverged from it in two ways that a real document exposed
 * (_ingest_bin/claude-app_uixo.json, 346 entities, `ok: true` per the
 * oracle):
 *
 *   1. ENVELOPE. The source document shape is
 *      `{ schemaVersion, meta?, entities[] }`. Our ingest demanded
 *      `nodes` and, being `.strict()`, rejected `entities` outright —
 *      so a document the oracle accepts could not even be read.
 *   2. REACHABILITY. The source counts an entity reachable through
 *      `extensions.spec` soft links (E212's own remediation says so).
 *      We store `extensions` as an opaque JSON string, so our walk could
 *      not see those links and reported 221 orphans in a document with
 *      none. False positives are worse than missing checks: they teach
 *      the operator to ignore the validator.
 *
 * Parity means the ingest gate accepts exactly what the oracle accepts,
 * and refuses what it refuses, with the source's own E-codes.
 */
import { resolve } from "node:path";
import { describe, expect, it, beforeAll } from "vitest";
import { Host } from "../../../src/core/host.js";
import { FDPMException } from "../../../src/core/errors/fdpm-exception.js";
import { buildUixoWorkbook, parseUixoDocument } from "../../../plugins/uixo/ingest.js";
import { validateUixoDocument } from "../../../plugins/uixo/schemas/uixo-native.js";

async function freshHost(): Promise<Host> {
  const host = new Host({ dataDir: null, builtinDirs: [resolve(process.cwd(), "plugins")] });
  await host.load();
  return host;
}

/**
 * A minimal document in the SOURCE's shape: a root application, a surface
 * reached by a declared edge, and a policy reached only through an
 * `extensions.spec` soft link — the case that produced false orphans.
 */
const doc = () => ({
  schemaVersion: "1.2.0",
  meta: { id: "doc:parity", title: "Parity fixture", revision: 1 },
  entities: [
    {
      id: "app:root",
      type: "uixowb:AssistantWorkbenchApplication",
      label: "Parity App",
      hasSurface: ["app:surface"],
      hasActor: ["app:actor"],
      // The ontology attaches features and policies as soft links, which
      // is exactly the structure our reachability walk could not see.
      extensions: { spec: { features: ["app:feature"], policies: ["app:policy"] } },
    },
    { id: "app:surface", type: "uixo:Surface", label: "Main surface" },
    { id: "app:actor", type: "uixo:HumanActor", label: "User" },
    { id: "app:feature", type: "uixo:Feature", label: "Chat" },
    { id: "app:policy", type: "uixo:Policy", label: "Retention policy" },
  ],
});

describe("the source oracle is the authority", () => {
  it("accepts the fixture, so ingest must too", () => {
    const report = validateUixoDocument(doc());
    expect(report.tiers.structural).toEqual([]);
    expect(report.tiers.referential).toEqual([]);
    expect(report.ok).toBe(true);
  });
});

describe("envelope: the source's `entities` key", () => {
  it("parses a document in the source's own shape", () => {
    expect(() => parseUixoDocument(doc())).not.toThrow();
  });

  it("ingests it into a workbook", async () => {
    const host = await freshHost();
    const report = await buildUixoWorkbook(host, doc(), { workbookId: "uixo-parity" });
    expect(report.primitives).toBe(5);
    expect(host.validateProject("uixo-parity").summary).toEqual({ errors: 0, warnings: 0, info: 0 });
  });
});

describe("reachability counts extensions.spec soft links", () => {
  it("does not report an entity reached only through a soft link as an orphan", async () => {
    const host = await freshHost();
    // app:feature and app:policy are reachable ONLY via extensions.spec.
    await expect(buildUixoWorkbook(host, doc(), { workbookId: "uixo-soft" })).resolves.toBeDefined();
  });

  it("still reports a genuine orphan", async () => {
    const host = await freshHost();
    const orphaned = doc();
    orphaned.entities.push({ id: "app:stray", type: "uixo:Policy", label: "Attached to nothing" } as never);
    try {
      await buildUixoWorkbook(host, orphaned, { workbookId: "uixo-orphan" });
      throw new Error("expected rejection");
    } catch (err) {
      expect(err).toBeInstanceOf(FDPMException);
      expect((err as FDPMException).message).toMatch(/reachab|orphan/i);
    }
  });
});

describe("the gate refuses what the oracle refuses", () => {
  it("surfaces the source's E-code for a document the oracle rejects", async () => {
    const host = await freshHost();
    const noLabel = doc();
    // E201: entity has no display label.
    delete (noLabel.entities[1] as Record<string, unknown>)["label"];
    const oracle = validateUixoDocument(noLabel);
    expect(oracle.ok).toBe(false);
    const codes = Object.values(oracle.tiers).flat().map((i) => (i as { code: string }).code);
    expect(codes).toContain("E201");

    try {
      await buildUixoWorkbook(host, noLabel, { workbookId: "uixo-nolabel" });
      throw new Error("expected rejection");
    } catch (err) {
      expect(err).toBeInstanceOf(FDPMException);
      // The rejection must carry the source's vocabulary, not only ours.
      expect((err as FDPMException).message).toContain("E201");
    }
  });

  it("writes nothing when the oracle rejects", async () => {
    const host = await freshHost();
    const bad = doc();
    delete (bad.entities[1] as Record<string, unknown>)["label"];
    await expect(buildUixoWorkbook(host, bad, { workbookId: "uixo-none" })).rejects.toThrow();
    expect(host.listProjects().some((p) => p.id === "uixo-none")).toBe(false);
  });
});

/**
 * The regression that started this: a 346-entity document the source
 * oracle accepts (`ok: true`, zero issues in all four tiers) which this
 * plugin rejected 221 times over.
 *
 * The fixture is small but carries the same shape as the real one: soft
 * links at the TOP LEVEL of `extensions`, not under `.spec`. The source
 * collects soft links by walking the whole `extensions` object, so
 * anything narrower reports orphans the oracle considers attached —
 * `extensions.appliesVia` was the last such case, one node out of 346.
 */
describe("regression: soft links anywhere in extensions connect", () => {
  const withTopLevelSoftLink = () => ({
    schemaVersion: "1.2.0",
    entities: [
      {
        id: "app:root",
        type: "uixowb:AssistantWorkbenchApplication",
        label: "App",
        hasSurface: ["app:surface"],
        hasActor: ["app:actor"],
        extensions: {
          spec: { features: ["app:feature"], policies: ["app:policy"], settings: ["app:setting"] },
        },
      },
      { id: "app:surface", type: "uixo:Surface", label: "Surface" },
      { id: "app:actor", type: "uixo:HumanActor", label: "User" },
      { id: "app:feature", type: "uixo:Feature", label: "Feature" },
      { id: "app:policy", type: "uixo:Policy", label: "Policy" },
      // Reachable ONLY through a top-level extensions key, exactly as
      // app:adapt-density-compact is in the real document.
      {
        id: "app:setting",
        type: "uixoset:PreferenceSetting",
        label: "Density",
        settingKey: "density",
        // E261: a setting must bind a control or an action.
        settingControl: ["app:control"],
        extensions: { appliesVia: "app:adaptation" },
      },
      { id: "app:control", type: "uixo:Control", label: "Density toggle" },
      { id: "app:adaptation", type: "uixo:Adaptation", label: "Compact density" },
    ],
  });

  it("the oracle accepts it", () => {
    expect(validateUixoDocument(withTopLevelSoftLink()).ok).toBe(true);
  });

  it("and so does ingest — no orphan reported", async () => {
    const host = await freshHost();
    // app:setting itself is reached from the root only if the walk sees
    // soft links; app:adaptation only through the top-level key.
    const doc = withTopLevelSoftLink();
    const report = await buildUixoWorkbook(host, doc, { workbookId: "uixo-softlink" });
    expect(report.primitives).toBe(8);
    expect(host.validateProject("uixo-softlink").summary).toEqual({ errors: 0, warnings: 0, info: 0 });
  });
});
