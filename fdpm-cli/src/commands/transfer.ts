import { Command } from "commander";
import type { Host } from "../core/host.js";
import { emit, readInput, type OutputContext } from "./util.js";
import { ProjectTransfer } from "../core/models/instance.js";
import { exportTransfer, importTransfer, type ImportUidMode } from "../core/host-extra.js";
import { FDPMException } from "../core/errors/fdpm-exception.js";

export function buildTransferCommand(host: Host): Command {
  const cmd = new Command("transfer");
  cmd.description("Project import/export (§9.1 /transfer/import, /transfer/export)");

  cmd
    .command("export")
    .argument("<project>", "project id")
    .option("--json", "emit JSON (default)")
    .action((project, opts) => {
      const ctx: OutputContext = { json: opts.json !== false };
      const transfer = exportTransfer(host, project);
      emit(ctx, transfer);
    });

  cmd
    .command("import")
    .description("Import a ProjectTransfer (§9.1 POST /transfer/import)")
    .requiredOption("-f, --file <path>", "transfer JSON file")
    .option(
      "--project-id <id>",
      "override the transfer file's project.id (re-home a snapshot under a new id)",
    )
    .option(
      "--project-name <name>",
      "override the transfer file's project.name",
    )
    .option(
      "--project-description <text>",
      "override the transfer file's project.description",
    )
    .option(
      "--merge-by-uid",
      "skip bundled records whose uid is already present locally (deduplicate redundant re-imports)",
    )
    .option(
      "--mint-fresh-uids",
      "ignore bundled uids and mint fresh ones (use when bundling content as a new logical artifact)",
    )
    .option("--json", "emit JSON")
    .action(async (opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      if (opts.mergeByUid && opts.mintFreshUids)
        throw new FDPMException(
          "verification",
          "--merge-by-uid and --mint-fresh-uids are mutually exclusive",
        );
      const uidMode: ImportUidMode = opts.mergeByUid
        ? "merge-by-uid"
        : opts.mintFreshUids
          ? "mint-fresh"
          : "preserve";
      const raw = await readInput(opts.file);
      const result = ProjectTransfer.safeParse(raw);
      if (!result.success)
        throw new FDPMException("verification", "invalid ProjectTransfer", {
          evidence: { issues: result.error.issues },
        });
      // Apply optional overrides BEFORE handing to importTransfer. The
      // transfer file's `project.id` is the default; the caller may
      // re-home the snapshot under a different id by passing
      // --project-id, which is the routine ergonomic when the original
      // id already exists in the target data dir.
      const transfer = result.data;
      if (opts.projectId != null) {
        transfer.project = { ...transfer.project, id: opts.projectId };
      }
      if (opts.projectName != null) {
        transfer.project = { ...transfer.project, name: opts.projectName };
      }
      if (opts.projectDescription != null) {
        transfer.project = {
          ...transfer.project,
          description: opts.projectDescription,
        };
      }
      const out = await importTransfer(host, transfer, { uidMode });
      emit(ctx, out);
    });

  cmd
    .command("import-as")
    .description(
      "Import via a plugin-registered cap:importer. Runs the importer for <format>, validates the resulting ProjectTransfer, then imports it.",
    )
    .argument("<format>", "importer format id (e.g. fs-v3)")
    .requiredOption("-f, --file <path>", "raw input file")
    .requiredOption("--project-id <id>", "target project id")
    .requiredOption("--project-name <name>", "target project display name")
    .option("--project-description <text>", "optional project description")
    .option(
      "--extra-profile-id <id>",
      "override the importer's profile_id selection (forwarded as options.extra.profileId)",
    )
    .option(
      "--extra <key=value>",
      "additional importer-specific options forwarded as options.extra (repeatable)",
      collectKeyValue,
      {} as Record<string, string>,
    )
    .option("--json", "emit JSON")
    .action(async (format: string, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const raw = await readInput(opts.file);
      const extra: Record<string, unknown> = { ...(opts.extra ?? {}) };
      if (opts.extraProfileId != null) extra["profileId"] = opts.extraProfileId;
      const transfer = await host.plugins.runImporter(format, raw, {
        projectId: opts.projectId,
        projectName: opts.projectName,
        ...(opts.projectDescription != null && {
          projectDescription: opts.projectDescription,
        }),
        ...(Object.keys(extra).length > 0 && { extra }),
      });
      // Re-validate the importer's output through the canonical schema —
      // §6.5 "Importer/exporter verification" property: the host gates
      // plugin output rather than trusting it.
      const parsed = ProjectTransfer.safeParse(transfer);
      if (!parsed.success)
        throw new FDPMException(
          "verification",
          `importer ${format} produced an invalid ProjectTransfer`,
          { evidence: { issues: parsed.error.issues } },
        );
      const out = await importTransfer(host, parsed.data);
      emit(ctx, out);
    });

  return cmd;
}

/**
 * commander option collector for repeatable `--extra key=value` flags.
 * Values are kept as strings; importers that need typed values parse
 * them themselves (or define a typed manifest config_schema).
 */
function collectKeyValue(
  raw: string,
  acc: Record<string, string>,
): Record<string, string> {
  const eq = raw.indexOf("=");
  if (eq < 0)
    throw new FDPMException(
      "verification",
      `--extra expects key=value; got "${raw}"`,
    );
  const key = raw.slice(0, eq);
  const value = raw.slice(eq + 1);
  if (key.length === 0)
    throw new FDPMException("verification", `--extra key must be non-empty`);
  return { ...acc, [key]: value };
}
