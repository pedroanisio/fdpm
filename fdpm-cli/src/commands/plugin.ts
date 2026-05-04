import { Command } from "commander";
import type { Host } from "../core/host.js";
import { emit, type OutputContext } from "./util.js";
import { FDPMException } from "../core/errors/fdpm-exception.js";

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
        records
          .map(
            (r) =>
              `${r.id}@${r.version}\t${r.state}\ttrust=${r.trust}\tcaps=${r.capabilities}` +
              (r.error ? `\terror=${r.error}` : ""),
          )
          .join("\n") || "(no plugins)",
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
