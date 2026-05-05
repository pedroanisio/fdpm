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
    .option("--json", "emit JSON")
    .action((opts) => {
      const ctx: OutputContext = { json: !!opts.json };
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
