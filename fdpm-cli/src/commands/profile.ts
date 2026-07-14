import { Command } from "commander";
import type { Host } from "../core/host.js";
import { DomainProfile } from "../core/models/meta.js";
import { emit, readInput, renderTable, type OutputContext } from "./util.js";
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
  cmd.description("Profile registry — list, get, register profiles");

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
};
