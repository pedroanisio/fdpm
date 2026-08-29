/**
 * The UML roadmap seed must satisfy the planning profile before anyone
 * runs it against a live data dir.
 *
 * Every constraint asserted here was a real failure of the first run:
 * `summary` overflowed the 280-character field, and a task created
 * before its `plan:Contains` edge tripped plan:val:non-root-task-has-deps
 * because the rule evaluates the post-state of that single write. A
 * seed script that only fails halfway through leaves a partial workbook
 * behind, so these are checked statically.
 */
import { resolve } from "node:path";
import { describe, expect, it, beforeAll } from "vitest";
import { Host } from "../../../src/core/host.js";
import { PHASES } from "../../../scripts/build-uml-roadmap.js";

const PLANNING = "profile:planning:0.1";
let host: Host;
let fieldMax: Record<string, number>;

beforeAll(async () => {
  host = new Host({ dataDir: null, builtinDirs: [resolve(process.cwd(), "plugins")] });
  await host.load();
  const task = host.profiles
    .getResolved(PLANNING)
    .primitive_types.find((t) => t.id === "plan:Task")!;
  fieldMax = Object.fromEntries(
    (task.fields ?? []).map((f) => [
      f.name,
      (f.validations ?? []).find((v) => v.kind === "max_length")?.value as number,
    ]),
  );
});

describe("the seed fits the planning profile's fields", () => {
  it("keeps every summary inside plan:Task.summary", () => {
    const cap = fieldMax["summary"];
    expect(cap).toBeGreaterThan(0);
    const over = PHASES.filter((p) => p.summary.length > cap!).map((p) => `${p.slug}: ${p.summary.length}`);
    expect(over).toEqual([]);
  });

  it("keeps every acceptance criterion inside its field", () => {
    const ac = host.profiles
      .getResolved(PLANNING)
      .primitive_types.find((t) => t.id === "plan:AcceptanceCriterion")!;
    const cap = (ac.fields ?? []).find((f) => f.name === "criterion")?.validations
      ?.find((v) => v.kind === "max_length")?.value as number | undefined;
    if (cap === undefined) return; // no cap declared; nothing to assert
    expect(PHASES.filter((p) => p.criterion.length > cap).map((p) => p.slug)).toEqual([]);
  });

  it("uses only values the profile's enums declare", () => {
    const task = host.profiles.getResolved(PLANNING).primitive_types.find((t) => t.id === "plan:Task")!;
    const enumOf = (name: string) =>
      new Set(((task.fields ?? []).find((f) => f.name === name)?.enum_values ?? []) as string[]);
    for (const p of PHASES) {
      expect(enumOf("status").has(p.status), `${p.slug} status`).toBe(true);
      expect(enumOf("priority").has(p.priority), `${p.slug} priority`).toBe(true);
      expect(enumOf("kind").has(p.kind), `${p.slug} kind`).toBe(true);
    }
  });
});

describe("the dependency graph is sound", () => {
  it("every dependency names a phase that exists", () => {
    const slugs = new Set(PHASES.map((p) => p.slug));
    const dangling = PHASES.flatMap((p) => (p.dependsOn ?? []).filter((d) => !slugs.has(d)).map((d) => `${p.slug} -> ${d}`));
    expect(dangling).toEqual([]);
  });

  it("has no cycles — plan:val:no-circular-deps would reject them", () => {
    const edges = new Map(PHASES.map((p) => [p.slug, p.dependsOn ?? []]));
    const state = new Map<string, "open" | "closed">();
    const walk = (n: string, path: string[]): void => {
      if (state.get(n) === "closed") return;
      if (state.get(n) === "open") throw new Error(`cycle: ${[...path, n].join(" -> ")}`);
      state.set(n, "open");
      for (const d of edges.get(n) ?? []) walk(d, [...path, n]);
      state.set(n, "closed");
    };
    expect(() => PHASES.forEach((p) => walk(p.slug, []))).not.toThrow();
  });

  it("a phase marked Done depends only on phases that are Done", () => {
    const status = new Map(PHASES.map((p) => [p.slug, p.status]));
    const violations = PHASES.filter((p) => p.status === "Done")
      .flatMap((p) => (p.dependsOn ?? []).filter((d) => status.get(d) !== "Done").map((d) => `${p.slug} -> ${d}`));
    expect(violations).toEqual([]);
  });

  /**
   * The delivered set is pinned rather than derived: marking a phase
   * Done is a claim about shipped behaviour, so it should take a
   * deliberate edit here and not follow silently from the data.
   */
  it("records exactly the delivered phases, and the rest as outstanding", () => {
    const done = PHASES.filter((p) => p.status === "Done").map((p) => p.slug);
    expect(done).toEqual([
      "uml-phase-0-foundation",
      "uml-phase-1-abstract-policy",
      "uml-phase-2-components",
    ]);
    expect(PHASES).toHaveLength(12);
    // A delivered phase's criterion is met; an outstanding one's is open.
    for (const p of PHASES) {
      expect(p.criterionStatus, p.slug).toBe(p.status === "Done" ? "met" : "open");
    }
  });
});
