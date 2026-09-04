import { Command } from "commander";
import type { Host } from "../core/host.js";
import { DomainProfile } from "../core/models/meta.js";
import { emit, readInput, renderTable, type OutputContext } from "./util.js";
import { parseProfileRef } from "../core/profile/version.js";
import { promoteProfile } from "../core/profile/promote.js";
import { FDPMException } from "../core/errors/fdpm-exception.js";
import {
  type CommandMetadataMap,
  NO_PROJECT_ARGV,
  NO_PROJECT_JSON,
} from "./metadata.js";

/**
 * Text rendering for `profile list --resolved`: one block per profile showing
 * the type hierarchy (category → primitive types) plus the extends chain and
 * relation types. The JSON form carries the full profiles; this is the
 * human-readable projection of the same data.
 */
function renderProfileHierarchy(profiles: readonly DomainProfile[]): string {
  if (profiles.length === 0) return "(no profiles)";

  const blocks = profiles.map((p) => {
    const label = p.label ?? p.name;
    const lines: string[] = [`${p.id}@${p.version}${label ? `  ${label}` : ""}`];

    const ext = p.extends ?? [];
    if (ext.length > 0) lines.push(`  extends: ${ext.join(", ")}`);

    const categoryName = new Map<string, string>();
    for (const c of p.categories ?? []) {
      categoryName.set(c.id, c.label ?? c.name ?? c.id);
    }

    const byCategory = new Map<string, string[]>();
    for (const t of p.primitive_types ?? []) {
      const cid = t.category_id ?? t.category ?? "(uncategorized)";
      (byCategory.get(cid) ?? byCategory.set(cid, []).get(cid)!).push(t.id);
    }

    if (byCategory.size === 0) {
      lines.push("  (no primitive types)");
    } else {
      for (const [cid, ids] of byCategory) {
        const name = categoryName.get(cid);
        lines.push(`  ${cid}${name && name !== cid ? `  ${name}` : ""}`);
        for (const id of ids) lines.push(`    ${id}`);
      }
    }

    const relations = (p.relation_types ?? []).map((r) => r.id);
    lines.push(`  relations: ${relations.length > 0 ? relations.join(", ") : "(none)"}`);
    return lines.join("\n");
  });

  return blocks.join("\n\n");
}

/**
 * Profile commands — §9.1 GET /profiles, /profiles/{id}, /profiles/{id}/raw.
 *
 * Plus a `register` command (CLI-only convenience: takes a JSON profile
 * file from disk or stdin and adds it to the registry for the lifetime
 * of the host instance — equivalent to a plugin's `activate()` call).
 */
export function buildProfileCommand(host: Host): Command {
  const cmd = new Command("profile");
  cmd.description("Profile registry — list, get, register, retire, promote profiles");

  cmd
    .command("list")
    .description("List registered profiles (§9.1 GET /profiles)")
    .option(
      "--resolved",
      "emit every profile fully resolved (types, relations, fields) instead of summaries — the 'get all' form",
    )
    .option("--raw", "with --resolved: return raw (unresolved) profiles")
    .option("--json", "emit JSON")
    .action((opts) => {
      const ctx: OutputContext = { json: !!opts.json };

      if (opts.resolved) {
        const ids = host.profiles.listRaw().map((p) => p.id);
        const profiles = ids.map((id) =>
          opts.raw ? host.profiles.getRaw(id) : host.profiles.getResolved(id),
        );
        emit(ctx, { profiles }, () => renderProfileHierarchy(profiles));
        return;
      }

      const profiles = host.profiles.listRaw().map((p) => ({
        id: p.id,
        version: p.version,
        label: p.label,
        primitive_type_count: p.primitive_types.length,
        relation_type_count: p.relation_types.length,
      }));
      emit(ctx, { profiles }, () =>
        renderTable(profiles, [
          { header: "PROFILE", value: (p) => p.id },
          { header: "VERSION", value: (p) => p.version },
          { header: "PRIMITIVES", value: (p) => p.primitive_type_count, align: "right" },
          { header: "RELATIONS", value: (p) => p.relation_type_count, align: "right" },
          { header: "LABEL", value: (p) => p.label ?? "" },
        ], { empty: "(no profiles)" }),
      );
    });

  cmd
    .command("get")
    .argument("<id>", "profile id")
    .description("Resolved profile (§9.1 GET /profiles/{id})")
    .option("--raw", "return raw (unresolved) profile")
    .option("--json", "emit JSON")
    .action((id, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const profile = opts.raw ? host.profiles.getRaw(id) : host.profiles.getResolved(id);
      emit(ctx, profile, () => `${profile.id}@${profile.version}\n${profile.label}`);
    });

  cmd
    .command("register")
    .description("Register a DomainProfile from a JSON file (or stdin)")
    .option("-f, --file <path>", "profile JSON file (default: stdin)")
    .option("--json", "emit JSON")
    .action(async (opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const raw = await readInput(opts.file);
      const result = DomainProfile.safeParse(raw);
      if (!result.success) {
        throw new FDPMException("verification", "invalid DomainProfile", {
          evidence: { issues: result.error.issues },
        });
      }
      await host.registerProfile(result.data);
      emit(ctx, { id: result.data.id, registered: true }, () =>
        `registered ${result.data.id}@${result.data.version}`,
      );
    });

  cmd
    .command("retire")
    .description("Retire one profile revision (registry entry + persisted file)")
    .argument("<ref>", "profile ref: id@version, or a bare id for the newest revision")
    .option("--dry-run", "report what would block the retire; remove nothing")
    .option("--json", "emit JSON")
    .action(async (ref: string, opts: { dryRun?: boolean; json?: boolean }) => {
      const ctx: OutputContext = { json: !!opts.json };
      const parsed = parseProfileRef(ref);
      const version = parsed.version ?? host.profiles.latestVersion(parsed.id);
      if (!version) {
        throw new FDPMException("not_found", `profile not found: ${ref}`, {
          evidence: {
            profile_id: parsed.id,
            registered_versions: host.profiles.versionsOf(parsed.id),
          },
        });
      }
      if (opts.dryRun) {
        const blockers = host.profileRetireBlockers(parsed.id, version);
        emit(ctx, { profile_id: parsed.id, version, would_affect: blockers }, () =>
          [
            `${parsed.id}@${version}`,
            `  workbooks:  ${blockers.workbooks.join(", ") || "(none)"}`,
            `  dependents: ${blockers.dependents.join(", ") || "(none)"}`,
          ].join("\n"),
        );
        return;
      }
      const retired = await host.retireProfile(ref);
      const remaining = host.profiles.versionsOf(retired.profile_id);
      emit(ctx, { ...retired, remaining_versions: remaining }, () =>
        `retired ${retired.profile_id}@${retired.version}; remaining: ${
          remaining.join(", ") || "(none)"
        }`,
      );
    });

  cmd
    .command("promote")
    .description("Emit a reviewable plugin skeleton from a registered profile")
    .argument("<ref>", "profile ref: id@version, or a bare id for the newest revision")
    .option("-o, --out <dir>", "directory to create the plugin directory inside", ".")
    .option("--plugin-id <id>", "plugin id override (default: promoted.<profile-slug>)")
    .option("--force", "overwrite an existing plugin directory")
    .option("--json", "emit JSON")
    .action(
      async (
        ref: string,
        opts: { out: string; pluginId?: string; force?: boolean; json?: boolean },
      ) => {
        const ctx: OutputContext = { json: !!opts.json };
        const result = await promoteProfile(host, ref, {
          outDir: opts.out,
          ...(opts.pluginId != null && { pluginId: opts.pluginId }),
          ...(opts.force === true && { force: true }),
        });
        emit(ctx, result, () =>
          [
            `promoted ${result.profile_ref} -> ${result.plugin_id}`,
            `  ${result.dir}`,
            ...result.files.map((f) => `    ${f.slice(result.dir.length + 1)}`),
            "",
            "Not installed and not active: copy it into a plugin path after review,",
            `then 'fdpm plugin enable ${result.plugin_id}'.`,
          ].join("\n"),
        );
      },
    );

  return cmd;
}

export const commandMetadata: CommandMetadataMap = {
  "profile list": {
    readOnly: true,
    projectIdsFromArgv: NO_PROJECT_ARGV,
    projectIdsFromJson: NO_PROJECT_JSON,
  },
  "profile get": {
    readOnly: true,
    projectIdsFromArgv: NO_PROJECT_ARGV,
    projectIdsFromJson: NO_PROJECT_JSON,
  },
  "profile register": {
    readOnly: false,
    projectIdsFromArgv: NO_PROJECT_ARGV,
    projectIdsFromJson: NO_PROJECT_JSON,
  },
  "profile retire": {
    readOnly: false,
    projectIdsFromArgv: NO_PROJECT_ARGV,
    projectIdsFromJson: NO_PROJECT_JSON,
  },
  "profile promote": {
    readOnly: true,
    projectIdsFromArgv: NO_PROJECT_ARGV,
    projectIdsFromJson: NO_PROJECT_JSON,
  },
};
