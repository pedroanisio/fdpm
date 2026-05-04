import { describe, it, expect } from "vitest";
import { parseManifest } from "../src/plugin/manifest.js";
import { Host } from "../src/core/host.js";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DomainProfile, PrimitiveTypeDef } from "../src/core/models/meta.js";
import type { PrimitiveInstance } from "../src/core/models/instance.js";
import { importTransfer } from "../src/core/host-extra.js";
import { newHost } from "./fixtures.js";

function tmpPluginDir(): string {
  return mkdtempSync(join(tmpdir(), "fdpm-expr-helper-test-"));
}

function writePlugin(
  parent: string,
  id: string,
  manifest: Record<string, unknown>,
  entry: string,
): string {
  const dir = join(parent, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "fdpm-plugin.json"), JSON.stringify(manifest, null, 2));
  writeFileSync(join(dir, "index.ts"), entry);
  return dir;
}

const TYPE: PrimitiveTypeDef = {
  id: "test:section",
  fields: [{ name: "title", kind: "string", required: false, validations: [] }],
  id_format: { pattern: "^.*$", uniqueness: "project" },
  inline_structs: [],
  is_partition_unit: false,
};

const PROFILE: DomainProfile = {
  id: "test:expr-helper",
  version: "1.0.0",
  label: "Expression Helper Test",
  extends: [],
  categories: [],
  scopes: [],
  primitive_types: [TYPE],
  relation_types: [],
  validation_rules: [],
  renderer_bindings: [],
  inline_structs: [],
};

const INSTANCE: PrimitiveInstance = {
  id: "section:a",
  type_id: "test:section",
  field_values: { title: "A B" },
  revision: 0,
};

async function seedProject(host: Host, projectId: string, primitives: any[], relations: any[] = []) {
  await importTransfer(host, {
    spec_core: "1.1",
    project: {
      id: projectId,
      name: "Imported",
      profile_id: "test:demo",
      created_at: new Date().toISOString(),
      revision: 0,
    },
    primitives: primitives.map((p) => ({ ...p, revision: 0 })),
    relations: relations.map((r) => ({ ...r, revision: 0 })),
    templates: [],
    test_suites: [],
    operation_log: [],
  });
}

describe("expression runtime manifest support", () => {
  it("accepts expr-helper capability, helper-set pin, and required-helper declarations", () => {
    expect(() =>
      parseManifest(
        {
          id: "test.expr-helper",
          version: "1.0.0",
          spec_version: "1.1.0",
          kind: "server",
          host_compatibility: {
            fdpm: ">=1.0,<2",
            expr_helper_set: ">=1.0.0,<2",
          },
          capabilities: [
            { capability_id: "cap:expr-helper", local_name: "helpers" },
          ],
          permissions: ["read:vcs", "read:os-info"],
          requires_helpers: ["fn.other-plugin.slugify"],
        },
        "inline:test",
      ),
    ).not.toThrow();
  });
});

describe("expression runtime helper-set compatibility", () => {
  it("rejects a plugin whose expr_helper_set range excludes the host helper set", async () => {
    const pluginDir = tmpPluginDir();
    try {
      writePlugin(
        pluginDir,
        "incompatible-helper-set",
        {
          id: "test.incompatible-helper-set",
          version: "1.0.0",
          spec_version: "1.1.0",
          kind: "server",
          host_compatibility: {
            fdpm: ">=1.0,<2",
            expr_helper_set: ">=2.0.0,<3",
          },
          capabilities: [
            { capability_id: "cap:expr-helper", local_name: "helpers" },
          ],
        },
        "export default { manifest: {}, activate: () => {} };",
      );
      const host = new Host({ dataDir: null, builtinDirs: [], pluginPaths: [pluginDir] });
      await host.load();
      const record = host.plugins.get("test.incompatible-helper-set");
      expect(record?.state).toBe("rejected");
      expect(record?.errorMessage).toContain("helper-set");
    } finally {
      rmSync(pluginDir, { recursive: true, force: true });
    }
  });

  it("registers and tears down plugin expr helpers through the host-owned runtime", async () => {
    const pluginDir = tmpPluginDir();
    try {
      writePlugin(
        pluginDir,
        "helper-owner",
        {
          id: "test.helper-owner",
          version: "1.0.0",
          spec_version: "1.1.0",
          kind: "server",
          host_compatibility: {
            fdpm: ">=1.0,<2",
            expr_helper_set: ">=1.0.0,<2",
          },
          capabilities: [
            { capability_id: "cap:expr-helper", local_name: "helpers" },
          ],
        },
        `
const manifest = ${JSON.stringify({
  id: "test.helper-owner",
  version: "1.0.0",
  spec_version: "1.1.0",
  kind: "server",
  host_compatibility: { fdpm: ">=1.0,<2", expr_helper_set: ">=1.0.0,<2" },
  capabilities: [{ capability_id: "cap:expr-helper", local_name: "helpers" }],
})};
export default {
  manifest,
  activate: (ctx) => {
    ctx.registerExprHelper({
      helperId: "fn.test.helper-owner.slugify",
      arity: 1,
      fn: (value) => String(value).toLowerCase().replace(/\\s+/g, "-"),
    });
  },
};
`,
      );
      const host = new Host({ dataDir: null, builtinDirs: [], pluginPaths: [pluginDir] });
      await host.load();
      await host.plugins.enable("test.helper-owner");
      expect(host.expr.hasHelper("fn.test.helper-owner.slugify")).toBe(true);
      expect(
        host.expr.evaluateValidationCEL(
          'fn.test.helper-owner.slugify(instance.field_values.title) == "a-b"',
          INSTANCE,
          TYPE,
          PROFILE,
          [],
          "rule:helper-call",
        ),
      ).toBe(true);
      await host.plugins.disable("test.helper-owner");
      expect(host.expr.hasHelper("fn.test.helper-owner.slugify")).toBe(false);
    } finally {
      rmSync(pluginDir, { recursive: true, force: true });
    }
  });

  it("refuses to enable a plugin whose required helper is unavailable", async () => {
    const pluginDir = tmpPluginDir();
    try {
      writePlugin(
        pluginDir,
        "helper-consumer",
        {
          id: "test.helper-consumer",
          version: "1.0.0",
          spec_version: "1.1.0",
          kind: "server",
          host_compatibility: {
            fdpm: ">=1.0,<2",
            expr_helper_set: ">=1.0.0,<2",
          },
          capabilities: [
            { capability_id: "cap:validator", local_name: "demo" },
          ],
          requires_helpers: ["fn.test.helper-owner.slugify"],
        },
        `
const manifest = ${JSON.stringify({
  id: "test.helper-consumer",
  version: "1.0.0",
  spec_version: "1.1.0",
  kind: "server",
  host_compatibility: { fdpm: ">=1.0,<2", expr_helper_set: ">=1.0.0,<2" },
  capabilities: [{ capability_id: "cap:validator", local_name: "demo" }],
  requires_helpers: ["fn.test.helper-owner.slugify"],
})};
export default { manifest, activate: () => {} };
`,
      );
      const host = new Host({ dataDir: null, builtinDirs: [], pluginPaths: [pluginDir] });
      await host.load();
      await expect(host.plugins.enable("test.helper-consumer")).rejects.toThrow(
        /required helpers not available/i,
      );
      expect(host.plugins.get("test.helper-consumer")?.state).toBe("disabled");
    } finally {
      rmSync(pluginDir, { recursive: true, force: true });
    }
  });
});

describe("expression runtime Tier-A and Tier-B surface", () => {
  it("evaluates doc/project/env/host bindings and standard helpers through the validation pipeline", async () => {
    const host = await newHost();
    const profile = host.profiles.getRaw("test:demo");

    profile.validation_rules.push({
      id: "test:expr:tier-a",
      name: "Tier A activation",
      targets: ["test:section"],
      level: "error",
      expression:
        'doc.type_id == "test:section" && ' +
        'project.id == "p" && ' +
        'project.profile_id == "test:demo" && ' +
        'host.helper_set_version == "1.1.0" && ' +
        'fn.upper(doc.fields.title) == "BAD" && ' +
        'fn.count("test:section") == 2 && ' +
        'fn.date.short(env.NOW).size() == 10',
      message: "Tier-A runtime mismatch",
    });

    await seedProject(host, "p", [
      { id: "section:bad", type_id: "test:section", field_values: { title: "bad", number: 1 } },
      { id: "section:good", type_id: "test:section", field_values: { title: "good", number: 2 } },
    ]);

    const report = host.validateProject("p");
    const bad = report.primitives.find((entry) => entry.target_id === "section:bad");
    const good = report.primitives.find((entry) => entry.target_id === "section:good");

    expect(bad).toBeUndefined();
    expect(good?.findings.some((finding) => finding.rule_id === "test:expr:tier-a")).toBe(true);
  });

  it("returns permission-denied when a Tier-B binding is used without permission", () => {
    expect(() =>
      new Host({ dataDir: null, noPlugins: true }).expr.evaluateValidationCEL(
        "env.GIT_SHA == null",
        INSTANCE,
        TYPE,
        PROFILE,
        [],
        "rule:tier-b-denied",
      ),
    ).toThrow(/permission-denied/i);
  });

  it("returns null for unavailable Tier-B bindings when permission is present", () => {
    const host = new Host({ dataDir: null, noPlugins: true });
    expect(
      host.expr.evaluateValidationCEL(
        "env.GIT_SHA == null && env.GIT_BRANCH == null && env.GIT_DIRTY == null",
        INSTANCE,
        TYPE,
        PROFILE,
        [],
        "rule:tier-b-null",
        {
          permissions: new Set(["read:vcs"]),
          git: { sha: null, branch: null, dirty: null },
        },
      ),
    ).toBe(true);
  });

  it("auto-probes Tier-B git bindings from the host cwd when permission is present", () => {
    const host = new Host({ dataDir: null, noPlugins: true, cwd: "/tmp/fake-git-root" });
    expect(
      host.expr.evaluateValidationCEL(
        "env.GIT_SHA != null && env.GIT_BRANCH != null && env.GIT_DIRTY == false",
        INSTANCE,
        TYPE,
        PROFILE,
        [],
        "rule:tier-b-probe",
        {
          permissions: new Set(["read:vcs"]),
          gitProbeDir: "/tmp/fake-git-root",
          gitProbe: () => ({ sha: "abc123", branch: "main", dirty: false }),
        },
      ),
    ).toBe(true);
  });

  it("supports full fn.sortBy key expressions, not just path lookups", async () => {
    const host = await newHost();
    await seedProject(host, "sort-project", [
      { id: "section:b", type_id: "test:section", field_values: { title: "Zulu" } },
      { id: "section:a", type_id: "test:section", field_values: { title: "alpha" } },
    ]);
    expect(
      host.expr.evaluateValidationCEL(
        'fn.sortBy(project.primitives, item, fn.lower(item.fields.title))[0].id == "section:a"',
        INSTANCE,
        TYPE,
        PROFILE,
        [],
        "rule:sort-by",
        {
          project: host.store.getProject("sort-project"),
          projectFingerprint: "fp:test",
        },
      ),
    ).toBe(true);
  });
});
