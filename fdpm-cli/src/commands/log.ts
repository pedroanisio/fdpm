import { Command } from "commander";
import type { Host } from "../core/host.js";
import { emit, parseKindCsv, type OutputContext } from "./util.js";
import { undo } from "../core/host-extra.js";
import { buildAuditRecord } from "../core/audit/projection.js";
import {
  type CommandMetadataMap,
  firstPositionalAfter,
  projectFromJsonField,
} from "./metadata.js";

/**
 * Time-travel + undo (§9.8): /log, /at, :undo are surfaced here.
 *
 * The "log" subcommand returns raw operations; "audit" returns the
 * AuditRecord projection (§13.3) with diffs.
 */
export function buildLogCommand(host: Host): Command {
  const cmd = new Command("log");
  cmd.description("Operation log + audit + undo (§5.5, §9.8, §13.3)");

  cmd
    .command("show")
    .argument("<project>", "project id")
    .option("--from <revision>", "from_revision")
    .option("--to <revision>", "to_revision")
    .option("--kind <csv>", "kind filter (comma-separated)")
    .option("--actor <id>", "actor filter")
    .option("--plugin <id>", "plugin_id filter")
    .option("--request-id <id>", "request_id filter")
    .option("--limit <n>", "max records (default 1000)")
    .option("--json", "emit JSON")
    .action((project, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const ops = host.getLog(project, {
        ...(opts.from != null && { from_revision: parseInt(String(opts.from), 10) }),
        ...(opts.to != null && { to_revision: parseInt(String(opts.to), 10) }),
        ...(opts.kind != null && { kind: parseKindCsv(opts.kind)! }),
        ...(opts.actor != null && { actor: String(opts.actor) }),
        ...(opts.plugin != null && { plugin_id: String(opts.plugin) }),
        ...(opts.requestId != null && { request_id: String(opts.requestId) }),
        ...(opts.limit != null && { limit: parseInt(String(opts.limit), 10) }),
      });
      emit(ctx, { operations: ops }, () =>
        ops.map((o) => `${o.revision}\t${o.kind}\t${o.op_id}\t${o.actor}`).join("\n"),
      );
    });

  cmd
    .command("audit")
    .argument("<project>", "project id")
    .description("Audit records — Operation projected as AuditRecord with diff (§13.3)")
    .option("--limit <n>", "max records (default 100)")
    .option("--json", "emit JSON")
    .action((project, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const ops = host.getLog(project, {
        ...(opts.limit != null && { limit: parseInt(String(opts.limit), 10) }),
      });
      const records = ops.map((op) => buildAuditRecord(op, ops));
      emit(ctx, { records });
    });

  cmd
    .command("at")
    .argument("<project>", "project id")
    .argument("<revision>", "revision N")
    .description("Time-travel: project state as of revision N (§9.8.2)")
    .option("--json", "emit JSON")
    .action((project, revision, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const slice = host.store.getProjectAt(project, parseInt(String(revision), 10));
      emit(ctx, slice);
    });

  cmd
    .command("undo")
    .argument("<project>", "project id")
    .description("Append the inverse of the most recent op (or a specific op) (§9.8.3 :undo)")
    .option("--target-op <id>", "target op_id (default: most recent)")
    .option("--json", "emit JSON")
    .action(async (project, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const result = await undo(host, project, opts.targetOp);
      emit(ctx, {
        op_id: result.op.op_id,
        kind: result.op.kind,
        causation_op_id: result.op.causation_op_id,
        project_revision: result.project_revision,
      });
    });

  return cmd;
}

export const commandMetadata: CommandMetadataMap = {
  "log show": {
    readOnly: true,
    projectIdsFromArgv: firstPositionalAfter(2),
    projectIdsFromJson: projectFromJsonField("project", "project_id"),
  },
  "log audit": {
    readOnly: true,
    projectIdsFromArgv: firstPositionalAfter(2),
    projectIdsFromJson: projectFromJsonField("project", "project_id"),
  },
  "log at": {
    readOnly: true,
    projectIdsFromArgv: firstPositionalAfter(2),
    projectIdsFromJson: projectFromJsonField("project", "project_id"),
  },
  "log undo": {
    readOnly: false,
    projectIdsFromArgv: firstPositionalAfter(2),
    projectIdsFromJson: projectFromJsonField("project", "project_id"),
  },
};
