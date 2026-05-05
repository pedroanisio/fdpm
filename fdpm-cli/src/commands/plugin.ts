import { Command } from "commander";
import type { Host } from "../core/host.js";
import { emit, renderTable, type OutputContext } from "./util.js";
import { FDPMException } from "../core/errors/fdpm-exception.js";
import {
  type CommandMetadataMap,
  ALL_PROJECTS_ARGV,
  ALL_PROJECTS_JSON,
  NO_PROJECT_ARGV,
  NO_PROJECT_JSON,
} from "./metadata.js";

/**
 * §6.6 Admin API surface — exposed as CLI subcommands instead of HTTP
 * endpoints (the CLI has no HTTP server).
 *
 *   GET  /plugins                     → fdpm plugin list
 *   GET  /plugins/{id}                → fdpm plugin get <id>
 *   GET  /plugins/{id}/manifest       → fdpm plugin manifest <id>
 *   POST /plugins/{id}:enable         → fdpm plugin enable <id>
 *   POST /plugins/{id}:disable        → fdpm plugin disable <id>
 *   POST /plugins/{id}:reload         → fdpm plugin reload <id>
 *   POST /plugins/{id}:quarantine-clear → fdpm plugin quarantine-clear <id>
 *   GET  /plugins/{id}/capabilities   → fdpm plugin capabilities <id>
 */
export function buildPluginCommand(host: Host): Command {
  const cmd = new Command("plugin");
  cmd.description("Plugin runtime admin (§6.6 admin API)");

  cmd
    .command("list")
    .description("List discovered plugins")
    .option("--json", "emit JSON")
    .action((opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const records = host.plugins.list().map((r) => ({
        id: r.id,
        version: r.version,
        kind: r.manifest.kind,
        state: r.state,
        trust: r.trust,
        capabilities: r.manifest.capabilities.length,
        error: r.errorMessage,
      }));
      emit(ctx, { plugins: records }, () =>
        renderTable(records, [
          { header: "PLUGIN", value: (r) => r.id },
          { header: "VERSION", value: (r) => r.version },
          { header: "STATE", value: (r) => r.state },
          { header: "TRUST", value: (r) => r.trust },
          { header: "CAPS", value: (r) => r.capabilities, align: "right" },
          { header: "ERROR", value: (r) => r.error ?? "" },
        ], { empty: "(no plugins)" }),
      );
    });

  cmd
    .command("get")
    .argument("<id>", "plugin id")
    .description("Plugin record")
    .option("--json", "emit JSON")
    .action((id, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const r = host.plugins.get(id);
      if (!r) throw new FDPMException("not_found", `plugin not found: ${id}`);
      emit(ctx, {
        id: r.id,
        version: r.version,
        state: r.state,
        trust: r.trust,
        kind: r.manifest.kind,
        permissions: r.manifest.permissions,
        capabilities: r.manifest.capabilities,
        contributions: {
          profiles: r.contributions.profileIds,
          validators: r.contributions.validators.length,
          renderers: r.contributions.renderers.length,
          transformers: r.contributions.transformers.length,
          importers: r.contributions.importers.length,
          exporters: r.contributions.exporters.length,
        },
        source: r.source,
        error: r.errorMessage,
      });
    });

  cmd
    .command("manifest")
    .argument("<id>", "plugin id")
    .description("Raw manifest")
    .option("--json", "emit JSON")
    .action((id, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const r = host.plugins.get(id);
      if (!r) throw new FDPMException("not_found", `plugin not found: ${id}`);
      emit(ctx, r.manifest);
    });

  cmd
    .command("capabilities")
    .argument("<id>", "plugin id")
    .description("Capability instances declared by the plugin")
    .option("--json", "emit JSON")
    .action((id, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const r = host.plugins.get(id);
      if (!r) throw new FDPMException("not_found", `plugin not found: ${id}`);
      const caps = r.manifest.capabilities.map((c) => ({
        capability_instance_id: `${r.id}:${c.capability_id}:${c.local_name}`,
        capability_id: c.capability_id,
        local_name: c.local_name,
        entry: c.entry,
      }));
      emit(ctx, { capabilities: caps });
    });

  cmd
    .command("enable")
    .argument("<id>", "plugin id")
    .option("--json", "emit JSON")
    .action(async (id, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      await host.plugins.enable(id);
      const r = host.plugins.get(id)!;
      emit(ctx, { id, state: r.state }, () => `${id} → ${r.state}`);
    });

  cmd
    .command("disable")
    .argument("<id>", "plugin id")
    .option("--json", "emit JSON")
    .action(async (id, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      await host.plugins.disable(id);
      const r = host.plugins.get(id)!;
      emit(ctx, { id, state: r.state }, () => `${id} → ${r.state}`);
    });

  cmd
    .command("reload")
    .argument("<id>", "plugin id")
    .option("--json", "emit JSON")
    .action(async (id, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      await host.plugins.reload(id);
      const r = host.plugins.get(id);
      emit(ctx, { id, state: r?.state ?? "absent" }, () => `${id} reloaded`);
    });

  cmd
    .command("quarantine-clear")
    .argument("<id>", "plugin id")
    .description("Force quarantined → disabled (admin-only, audit-logged)")
    .option("--json", "emit JSON")
    .action((id, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      host.plugins.quarantineClear(id);
      const r = host.plugins.get(id)!;
      emit(ctx, { id, state: r.state }, () => `${id} → ${r.state}`);
    });

  return cmd;
}

const PLUGIN_GLOBAL_RO = {
  readOnly: true,
  projectIdsFromArgv: NO_PROJECT_ARGV,
  projectIdsFromJson: NO_PROJECT_JSON,
};
const PLUGIN_GLOBAL_WRITE = {
  readOnly: false,
  projectIdsFromArgv: NO_PROJECT_ARGV,
  projectIdsFromJson: NO_PROJECT_JSON,
};

export const commandMetadata: CommandMetadataMap = {
  "plugin list":              PLUGIN_GLOBAL_RO,
  "plugin get":               PLUGIN_GLOBAL_RO,
  "plugin manifest":          PLUGIN_GLOBAL_RO,
  "plugin capabilities":      PLUGIN_GLOBAL_RO,
  "plugin enable":            PLUGIN_GLOBAL_WRITE,
  "plugin disable":           PLUGIN_GLOBAL_WRITE,
  // `plugin reload` re-runs discovery and activation; profile/type
  // registries change which can affect every workbook's renderers and
  // validators. Mark as touching every workbook so the freshness gate
  // re-stats them after the reload completes.
  "plugin reload": {
    readOnly: false,
    projectIdsFromArgv: ALL_PROJECTS_ARGV,
    projectIdsFromJson: ALL_PROJECTS_JSON,
  },
  "plugin quarantine-clear":  PLUGIN_GLOBAL_WRITE,
};
