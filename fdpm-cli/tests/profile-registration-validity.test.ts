/**
 * Every registered profile must satisfy the schema that governs profiles.
 *
 * `DomainProfile` is the contract: `fdpm profile register`, the MCP
 * `fdpm.profile.register` tool and the loader that reads persisted
 * profiles from disk all parse against it. `registerPluginProfile` did
 * not, so plugin-contributed profiles could carry shapes the schema
 * forbids — and 11 of 17 did. Two classes of defect hid there:
 *
 *   - three profiles with no `version` at all, which `fdpm profile list`
 *     rendered as the literal string "undefined" (operator report,
 *     2026-08-29). `version` is REQUIRED by the schema.
 *   - array `item_field` names minted as `<field>Item` by the bridge —
 *     camelCase, which violates `FieldDef.name`'s ^[a-z][a-z0-9_]*$, the
 *     very rule the host enforces on every hand-written profile.
 *
 * A profile the operator could not register, and that the host would
 * refuse to reload from disk, must not be registrable by a plugin
 * either. This suite is the invariant; it fails until every plugin's
 * profile is one the whole system agrees is legal.
 */
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { Host } from "../src/core/host.js";
import { DomainProfile } from "../src/core/models/meta.js";

let host: Host;
beforeAll(async () => {
  host = new Host({ dataDir: null, builtinDirs: [resolve(process.cwd(), "plugins")] });
  await host.load();
});

/** The bridge writes these alongside the profile; they are not part of it. */
function coreOf(raw: Record<string, unknown>): Record<string, unknown> {
  const { enum_defs, constraints, validation_rules, ...core } = raw;
  return core;
}

describe("every registered profile satisfies DomainProfile", () => {
  it("parses cleanly, naming any profile that does not", () => {
    const failures: string[] = [];
    for (const raw of host.profiles.listRaw() as unknown as Record<string, unknown>[]) {
      const parsed = DomainProfile.safeParse(coreOf(raw));
      if (!parsed.success) {
        failures.push(
          `${String(raw["id"])}: ${parsed.error.issues
            .slice(0, 3)
            .map((i) => `${i.path.join(".")} — ${i.message}`)
            .join("; ")}`,
        );
      }
    }
    expect(failures).toEqual([]);
  });

  it("declares a semantic version, so `fdpm profile list` never prints undefined", () => {
    const missing = (host.profiles.listRaw() as unknown as Record<string, unknown>[])
      .filter((p) => typeof p["version"] !== "string" || !/^\d+\.\d+\.\d+$/.test(p["version"] as string))
      .map((p) => `${String(p["id"])}: ${String(p["version"])}`);
    expect(missing).toEqual([]);
  });

  it("needs no exemptions at all", () => {
    // There was briefly a legacy exemption list for three camelCase
    // domains. The pattern that rejected them turned out to be a house
    // style with no grounding in SPEC-CORE — contradicted by the host's
    // own compiler and by the bridge — so the rule was corrected and the
    // list deleted. Every registered profile parses, unconditionally.
    const failures = (host.profiles.listRaw() as unknown as Record<string, unknown>[])
      .filter((raw) => !DomainProfile.safeParse(coreOf(raw)).success)
      .map((raw) => String(raw["id"]));
    expect(failures).toEqual([]);
  });

  it("declares a human label distinct from the bare id", () => {
    const unlabelled = (host.profiles.listRaw() as unknown as Record<string, unknown>[])
      .filter((p) => p["id"] !== "core:empty")
      .filter((p) => typeof p["label"] !== "string" || p["label"] === p["id"])
      .map((p) => String(p["id"]));
    expect(unlabelled).toEqual([]);
  });

  it("uses addressable field names everywhere, including array item fields", () => {
    // The property that matters is that `field_values.<name>` is an
    // unambiguous path — findings report field_path that way. Case is
    // the domain's business: `epistemicMethod` and `hasSeverity` are the
    // names those literatures use.
    const ADDRESSABLE = /^[A-Za-z_][A-Za-z0-9_]*$/;
    const offenders: string[] = [];
    const checkField = (f: Record<string, unknown>, where: string): void => {
      if (typeof f["name"] === "string" && !ADDRESSABLE.test(f["name"])) {
        offenders.push(`${where}.${String(f["name"])}`);
      }
      const item = f["item_field"] as Record<string, unknown> | undefined;
      if (item) checkField(item, where);
    };
    for (const raw of host.profiles.listRaw() as unknown as Record<string, unknown>[]) {
      for (const t of (raw["primitive_types"] ?? []) as Record<string, unknown>[]) {
        for (const f of (t["fields"] ?? []) as Record<string, unknown>[]) checkField(f, String(t["id"]));
        for (const st of (t["inline_structs"] ?? []) as Record<string, unknown>[]) {
          for (const f of (st["fields"] ?? []) as Record<string, unknown>[]) {
            checkField(f, `${String(t["id"])}/${String(st["id"])}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps field names unique within each type, as SPEC-CORE requires", () => {
    const dupes: string[] = [];
    for (const raw of host.profiles.listRaw() as unknown as Record<string, unknown>[]) {
      for (const t of (raw["primitive_types"] ?? []) as Record<string, unknown>[]) {
        const seen = new Set<string>();
        for (const f of (t["fields"] ?? []) as Record<string, unknown>[]) {
          const n = String(f["name"]);
          if (seen.has(n)) dupes.push(`${String(raw["id"])} ${String(t["id"])}.${n}`);
          seen.add(n);
        }
      }
    }
    expect(dupes).toEqual([]);
  });
});

describe("the plugin path validates like every other entry point", () => {
  it("refuses a plugin profile the operator could not register", () => {
    // `version` is required; this is precisely what slipped through.
    expect(() =>
      host.registerPluginProfile({
        id: "profile:invalid-test:0.1",
        primitive_types: [],
        relation_types: [],
      } as never),
    ).toThrow();
    expect(host.profiles.has("profile:invalid-test:0.1")).toBe(false);
  });

  it("accepts a well-formed one", () => {
    const ok = {
      id: "profile:valid-test:0.1",
      version: "0.1.0",
      label: "Valid test",
      primitive_types: [
        {
          id: "vt:Thing",
          name: "Thing",
          id_format: { pattern: "^vt:Thing:[a-z0-9-]+$" },
          fields: [{ name: "title", kind: "string", required: true, validations: [] }],
        },
      ],
      relation_types: [],
    };
    expect(() => host.registerPluginProfile(ok as never)).not.toThrow();
    expect(host.profiles.has("profile:valid-test:0.1")).toBe(true);
  });
});
