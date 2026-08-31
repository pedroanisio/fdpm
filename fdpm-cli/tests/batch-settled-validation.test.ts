/**
 * A batch's validation reports describe the workbook the batch produced.
 *
 * `appendBatchWithCausation` interleaves validation with synthesis so that a
 * later entry can reference an earlier one. That is the right call for
 * *rejecting* — "create A then relate to A" has to work — but it made the
 * returned reports describe intermediate states nobody ever sees. An entry
 * validated first was judged against a workbook missing every entry after it,
 * so a cross-entity validator on entry 0 could emit a finding that the same
 * batch immediately falsified.
 *
 * Observed in the field and recorded as a diagnostic in the KC-MCP-001
 * cartridge: a 57-entry `create_batch` returned `ok: true` carrying a warning
 * that L4 held 0 diagnostics — in a batch that created four. The correction it
 * prescribes is exactly this: re-evaluate against the settled projection.
 *
 * Why that matters more than a missing warning: this is not an absence, it is
 * a confident false statement. An agent that trusts it goes and fixes a
 * problem that does not exist, in a workbook the report says is broken and is
 * not.
 *
 * Every entry is re-validated, not only the ones that already carried
 * findings. A finding can *appear* at settle time as well as vanish — entry 0
 * is unique when written and duplicated by entry 5 — and re-checking only the
 * dirty entries would catch the vanishing case while silently keeping the
 * appearing one. When a settled report carries an error the batch rolls back,
 * which is the atomicity contract the in-loop path already keeps.
 */
import { describe, expect, it } from "vitest";
import { Host } from "../src/core/host.js";
import type { DomainProfile } from "../src/core/models/meta.js";
import type { PrimitiveInstance, ValidationFinding } from "../src/core/models/instance.js";
import type { ValidatorFn } from "../src/plugin/types.js";

const PROFILE_ID = "profile:settled-test:1.0";

/** Two types: a header whose validators count siblings, and the siblings. */
const TEST_PROFILE: DomainProfile = {
  id: PROFILE_ID,
  version: "1.0.0",
  name: "Settled validation test",
  extends: [],
  categories: [{ id: "cat:st:all", name: "All", description: "All types." }],
  scopes: [{ id: "scope:st:wb", name: "Workbook", rank: 1, description: "Workbook scope." }],
  primitive_types: [
    {
      id: "st:Header",
      name: "st:Header",
      category_id: "cat:st:all",
      category: "cat:st:all",
      description: "Counts its siblings.",
      scoped: false,
      id_format: { pattern: "^st:header:[a-z0-9-]+$", uniqueness: "global" },
      fields: [{ name: "label", kind: "string", required: true, validations: [] }],
      inline_structs: [],
      constraints: [],
      is_partition_unit: false,
    },
    {
      id: "st:Item",
      name: "st:Item",
      category_id: "cat:st:all",
      category: "cat:st:all",
      description: "A sibling the header counts.",
      scoped: false,
      id_format: { pattern: "^st:item:[a-z0-9-]+$", uniqueness: "global" },
      fields: [{ name: "code", kind: "string", required: true, validations: [] }],
      inline_structs: [],
      constraints: [],
      is_partition_unit: false,
    },
  ],
  relation_types: [],
  validation_rules: [],
  renderer_bindings: [],
  renderers: [],
  inline_structs: [],
  templates: [],
  scope_sets: {},
  default_scope_set: "",
};

const RULE_MINIMUM = "st:val:item-minimum";
const RULE_UNIQUE = "st:val:code-unique";
const RULE_CEILING = "st:val:item-ceiling";

function workbookPrimitives(context: unknown): PrimitiveInstance[] {
  const wb = (context as { workbook?: { primitives?: Record<string, PrimitiveInstance> } } | undefined)
    ?.workbook;
  return wb?.primitives ? Object.values(wb.primitives) : [];
}

/** Cross-entity: the header warns while fewer than three items exist. */
const headerCountsItems: ValidatorFn = (instance, _t, _p, context) => {
  if (instance.type_id !== "st:Header") return [];
  const items = workbookPrimitives(context).filter((p) => p.type_id === "st:Item").length;
  if (items >= 3) return [];
  const finding: ValidationFinding = {
    level: "warning",
    rule_id: RULE_MINIMUM,
    target_id: instance.id,
    field_path: null,
    message: `holds ${items} item(s); 3 required`,
    evidence: { items },
  };
  return [finding];
};

/** Cross-entity the other way: an item errors when its code is duplicated. */
const itemCodeUnique: ValidatorFn = (instance, _t, _p, context) => {
  if (instance.type_id !== "st:Item") return [];
  const mine = (instance as PrimitiveInstance).field_values["code"];
  const clashes = workbookPrimitives(context).filter(
    (p) => p.type_id === "st:Item" && p.id !== instance.id && p.field_values["code"] === mine,
  );
  if (clashes.length === 0) return [];
  const finding: ValidationFinding = {
    level: "error",
    rule_id: RULE_UNIQUE,
    target_id: instance.id,
    field_path: "field_values.code",
    message: `code ${String(mine)} is already used by ${clashes.map((c) => c.id).join(", ")}`,
    evidence: { clashes: clashes.map((c) => c.id) },
  };
  return [finding];
};

/**
 * Asymmetric cross-entity: the header errors above three items while every
 * item stays individually valid. Nothing but the header carries the finding,
 * and the header is validated first against zero items — so re-checking only
 * the entries that already had findings would let this commit.
 */
const headerCeiling: ValidatorFn = (instance, _t, _p, context) => {
  if (instance.type_id !== "st:Header") return [];
  const items = workbookPrimitives(context).filter((p) => p.type_id === "st:Item").length;
  if (items <= 3) return [];
  const finding: ValidationFinding = {
    level: "error",
    rule_id: RULE_CEILING,
    target_id: instance.id,
    field_path: null,
    message: `holds ${items} item(s); at most 3 permitted`,
    evidence: { items },
  };
  return [finding];
};

async function freshHost(opts?: { unique?: boolean; ceiling?: boolean }): Promise<Host> {
  const host = new Host({ dataDir: null, noPlugins: true });
  await host.load();
  host.profiles.register(TEST_PROFILE);
  host.pipeline.registerValidator({
    type_id: "st:Header",
    rule_id: RULE_MINIMUM,
    fn: headerCountsItems,
  });
  if (opts?.unique === true) {
    host.pipeline.registerValidator({
      type_id: "st:Item",
      rule_id: RULE_UNIQUE,
      fn: itemCodeUnique,
    });
  }
  if (opts?.ceiling === true) {
    host.pipeline.registerValidator({
      type_id: "st:Header",
      rule_id: RULE_CEILING,
      fn: headerCeiling,
    });
  }
  await host.createProject({ workbook_id: "sv", name: "SV", profile_id: PROFILE_ID });
  return host;
}

function headerIntent(id: string) {
  return {
    kind: "primitive.create" as const,
    primitive: { id, type_id: "st:Header", field_values: { label: id } },
  };
}
function itemIntent(id: string, code = id) {
  return {
    kind: "primitive.create" as const,
    primitive: { id, type_id: "st:Item", field_values: { code } },
  };
}

// ── The reported failure ─────────────────────────────────────────────

describe("batch reports describe the settled workbook", () => {
  it("does not warn that the header is under-populated by the batch that populates it", async () => {
    const host = await freshHost();
    const { reports } = await host.appendBatchWithCausation("sv", [
      headerIntent("st:header:a"), // validated first, sees zero items
      itemIntent("st:item:1"),
      itemIntent("st:item:2"),
      itemIntent("st:item:3"),
    ]);

    const header = reports[0]!;
    const spurious = header.findings.filter((f) => f.rule_id === RULE_MINIMUM);
    expect(
      spurious,
      "the header was judged against a workbook missing the three items created beside it",
    ).toEqual([]);
    expect(header.accepted).toBe(true);
  });

  it("still warns when the batch genuinely leaves the header under-populated", async () => {
    const host = await freshHost();
    const { reports } = await host.appendBatchWithCausation("sv", [
      headerIntent("st:header:b"),
      itemIntent("st:item:only"),
    ]);
    const findings = reports[0]!.findings.filter((f) => f.rule_id === RULE_MINIMUM);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("holds 1 item(s)");
  });

  it("orders no longer matter: header last gives the same reports as header first", async () => {
    const first = await freshHost();
    const a = await first.appendBatchWithCausation("sv", [
      headerIntent("st:header:c"),
      itemIntent("st:item:x1"),
      itemIntent("st:item:x2"),
      itemIntent("st:item:x3"),
    ]);
    const second = await freshHost();
    const b = await second.appendBatchWithCausation("sv", [
      itemIntent("st:item:x1"),
      itemIntent("st:item:x2"),
      itemIntent("st:item:x3"),
      headerIntent("st:header:c"),
    ]);
    const findingsOf = (reports: typeof a.reports, id: string) =>
      reports.find((r) => r.target_id === id)!.findings.map((f) => f.rule_id);
    expect(findingsOf(a.reports, "st:header:c")).toEqual(findingsOf(b.reports, "st:header:c"));
  });
});

// ── A finding that appears only once the batch settles ───────────────

describe("findings that appear at settle time", () => {
  it("rolls the batch back when a later entry makes an earlier one invalid", async () => {
    // st:item:p is unique when written and duplicated by st:item:q. Checking
    // only the entries that already carried findings would miss this: p's
    // in-loop report was clean.
    const host = await freshHost({ unique: true });
    await expect(
      host.appendBatchWithCausation("sv", [
        itemIntent("st:item:p", "SAME"),
        itemIntent("st:item:q", "SAME"),
      ]),
    ).rejects.toThrow(/validation/i);
  });

  it("leaves nothing behind after that rollback", async () => {
    const host = await freshHost({ unique: true });
    const before = host.getProject("sv").workbook.revision;
    await expect(
      host.appendBatchWithCausation("sv", [
        itemIntent("st:item:p", "SAME"),
        itemIntent("st:item:q", "SAME"),
      ]),
    ).rejects.toThrow();
    const after = host.getProject("sv");
    expect(Object.keys(after.primitives)).toEqual([]);
    expect(after.workbook.revision).toBe(before);
  });

  it("names the offending entry in the rejection findings", async () => {
    const host = await freshHost({ unique: true });
    try {
      await host.appendBatchWithCausation("sv", [
        itemIntent("st:item:p", "SAME"),
        itemIntent("st:item:q", "SAME"),
      ]);
      throw new Error("expected a rejection");
    } catch (err) {
      const findings = (err as { findings?: ValidationFinding[] }).findings ?? [];
      expect(findings.some((f) => f.rule_id === RULE_UNIQUE)).toBe(true);
    }
  });

  it("catches an asymmetric violation that only the first entry carries", async () => {
    // The case that forces re-validating EVERY entry rather than only the
    // dirty ones: the header is clean in loop (zero items), each of the four
    // items is individually valid, and the violation exists only in the
    // workbook the batch produced.
    const host = await freshHost({ ceiling: true });
    await expect(
      host.appendBatchWithCausation("sv", [
        headerIntent("st:header:cap"),
        itemIntent("st:item:c1"),
        itemIntent("st:item:c2"),
        itemIntent("st:item:c3"),
        itemIntent("st:item:c4"),
      ]),
    ).rejects.toThrow(/settles|validation/i);
    expect(Object.keys(host.getProject("sv").primitives)).toEqual([]);
  });

  it("commits the same shape at exactly the ceiling", async () => {
    const host = await freshHost({ ceiling: true });
    const { outputs } = await host.appendBatchWithCausation("sv", [
      headerIntent("st:header:cap2"),
      itemIntent("st:item:d1"),
      itemIntent("st:item:d2"),
      itemIntent("st:item:d3"),
    ]);
    expect(outputs).toHaveLength(4);
  });

  it("commits when the same codes are distinct", async () => {
    const host = await freshHost({ unique: true });
    const { outputs, reports } = await host.appendBatchWithCausation("sv", [
      itemIntent("st:item:p", "ONE"),
      itemIntent("st:item:q", "TWO"),
    ]);
    expect(outputs).toHaveLength(2);
    expect(reports.every((r) => r.accepted)).toBe(true);
  });
});

// ── Shape preserved ──────────────────────────────────────────────────

describe("batch contract is otherwise unchanged", () => {
  it("returns one report per entry, in order", async () => {
    const host = await freshHost();
    const { outputs, reports } = await host.appendBatchWithCausation("sv", [
      headerIntent("st:header:d"),
      itemIntent("st:item:d1"),
      itemIntent("st:item:d2"),
      itemIntent("st:item:d3"),
    ]);
    expect(outputs).toHaveLength(4);
    expect(reports).toHaveLength(4);
    expect(reports.map((r) => r.target_id)).toEqual([
      "st:header:d",
      "st:item:d1",
      "st:item:d2",
      "st:item:d3",
    ]);
  });

  it("still lets a later entry reference an earlier one", async () => {
    // The interleaved pass is what makes this work; the settled pass must
    // not replace it, only correct the reports it produced.
    const host = await freshHost();
    const { outputs } = await host.appendBatchWithCausation("sv", [
      itemIntent("st:item:e1"),
      itemIntent("st:item:e2"),
      itemIntent("st:item:e3"),
      headerIntent("st:header:e"),
    ]);
    expect(outputs).toHaveLength(4);
    expect(Object.keys(host.getProject("sv").primitives)).toHaveLength(4);
  });

  it("returns empty for an empty batch without touching the workbook", async () => {
    const host = await freshHost();
    const { outputs, reports } = await host.appendBatchWithCausation("sv", []);
    expect(outputs).toEqual([]);
    expect(reports).toEqual([]);
  });

  it("still rejects in-loop for an entry that is invalid on its own", async () => {
    const host = await freshHost();
    await expect(
      host.appendBatchWithCausation("sv", [
        { kind: "primitive.create" as const, primitive: { id: "st:item:f", type_id: "st:Item", field_values: {} } },
      ]),
    ).rejects.toThrow(/validation/i);
  });
});
