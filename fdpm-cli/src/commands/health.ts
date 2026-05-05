import { Command } from "commander";
import type { Host } from "../core/host.js";
import { emit, type OutputContext } from "./util.js";
import {
  HOST_NAME,
  HOST_VERSION,
  SPEC_CORE_REVISION,
  SPEC_CORE_VERSION,
} from "../core/version/spec.js";
import {
  type CommandMetadataMap,
  NO_PROJECT_ARGV,
  NO_PROJECT_JSON,
} from "./metadata.js";

export function buildVersionCommand(): Command {
  const cmd = new Command("version");
  cmd
    .description("Core SPEC version, host version (§9.1 GET /version)")
    .option("--json", "emit JSON")
    .action((opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      emit(
        ctx,
        {
          spec_core: SPEC_CORE_VERSION,
          spec_core_revision: SPEC_CORE_REVISION,
          host: HOST_NAME,
          host_version: HOST_VERSION,
        },
        () =>
          `host=${HOST_NAME}@${HOST_VERSION}\nspec_core=${SPEC_CORE_VERSION}\nspec_core_revision=${SPEC_CORE_REVISION}`,
      );
    });
  return cmd;
}

export function buildHealthCommand(host: Host): Command {
  const cmd = new Command("health");
  cmd.description("Health probes (§9.1 /healthz, /readyz)");

  cmd
    .command("liveness")
    .alias("healthz")
    .description("Liveness probe — process is alive")
    .option("--json", "emit JSON")
    .action((opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      emit(ctx, { status: "ok" }, () => "ok");
    });

  cmd
    .command("readiness")
    .alias("readyz")
    .description("Readiness probe — registry + verification ready")
    .option("--json", "emit JSON")
    .action((opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const profileCount = host.profiles.listRaw().length;
      const ready = profileCount > 0;
      emit(
        ctx,
        { status: ready ? "ready" : "not-ready", profiles: profileCount },
        () => `${ready ? "ready" : "not-ready"} profiles=${profileCount}`,
      );
    });

  return cmd;
}

export const commandMetadata: CommandMetadataMap = {
  version: {
    readOnly: true,
    projectIdsFromArgv: NO_PROJECT_ARGV,
    projectIdsFromJson: NO_PROJECT_JSON,
  },
  "health liveness": {
    readOnly: true,
    projectIdsFromArgv: NO_PROJECT_ARGV,
    projectIdsFromJson: NO_PROJECT_JSON,
  },
  "health readiness": {
    readOnly: true,
    projectIdsFromArgv: NO_PROJECT_ARGV,
    projectIdsFromJson: NO_PROJECT_JSON,
  },
};
