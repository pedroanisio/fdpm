import { Command } from "commander";
import type { Host } from "../core/host.js";
import { emit, parseKindCsv, renderTable, type OutputContext } from "./util.js";
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
    .argument("<workbook>", "workbook id")
    .option("--from <revision>", "from_revision")
    .option("--to <revision>", "to_revision")
    .option("--kind <csv>", "kind filter (comma-separated)")
    .option("--actor <id>", "actor filter")
    .option("--plugin <id>", "plugin_id filter")
    .option("--request-id <id>", "request_id filter")
    .option("--limit <n>", "max records (default 1000)")
    .option("--json", "emit JSON")
    .action((workbook, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const ops = host.getLog(workbook, {
        ...(opts.from != null && { from_revision: parseInt(String(opts.from), 10) }),
        ...(opts.to != null && { to_revision: parseInt(String(opts.to), 10) }),
        ...(opts.kind != null && { kind: parseKindCsv(opts.kind)! }),
        ...(opts.actor != null && { actor: String(opts.actor) }),
        ...(opts.plugin != null && { plugin_id: String(opts.plugin) }),
        ...(opts.requestId != null && { request_id: String(opts.requestId) }),
        ...(opts.limit != null && { limit: parseInt(String(opts.limit), 10) }),
      });
      emit(ctx, { operations: ops }, () =>
        renderTable(ops, [
          { header: "REV", value: (o) => o.revision, align: "right" },
          { header: "KIND", value: (o) => o.kind },
          { header: "OP ID", value: (o) => o.op_id },
          { header: "ACTOR", value: (o) => o.actor },
        ], { empty: "(no operations)" }),
      );
    });

  cmd
    .command("audit")
    .argument("<workbook>", "workbook id")
    .description("Audit records — Operation projected as AuditRecord with diff (§13.3)")
    .option("--limit <n>", "max records (default 100)")
    .option("--json", "emit JSON")
    .action((workbook, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const ops = host.getLog(workbook, {
        ...(opts.limit != null && { limit: parseInt(String(opts.limit), 10) }),
      });
      const records = ops.map((op) => buildAuditRecord(op, ops));
      emit(ctx, { records });
    });

  cmd
    .command("at")
    .argument("<workbook>", "workbook id")
    .argument("<revision>", "revision N")
    .description("Time-travel: workbook state as of revision N (§9.8.2)")
    .option("--json", "emit JSON")
    .action((workbook, revision, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const slice = host.store.getProjectAt(workbook, parseInt(String(revision), 10));
      emit(ctx, slice);
    });

  cmd
    .command("undo")
    .argument("<workbook>", "workbook id")
    .description("Append the inverse of the most recent op (or a specific op) (§9.8.3 :undo)")
    .option("--target-op <id>", "target op_id (default: most recent)")
    .option("--json", "emit JSON")
    .action(async (workbook, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const result = await undo(host, workbook, opts.targetOp);
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
    projectIdsFromJson: projectFromJsonField("workbook", "workbook_id"),
  },
  "log audit": {
    readOnly: true,
    projectIdsFromArgv: firstPositionalAfter(2),
    projectIdsFromJson: projectFromJsonField("workbook", "workbook_id"),
  },
  "log at": {
    readOnly: true,
    projectIdsFromArgv: firstPositionalAfter(2),
    projectIdsFromJson: projectFromJsonField("workbook", "workbook_id"),
  },
  "log undo": {
    readOnly: false,
    projectIdsFromArgv: firstPositionalAfter(2),
    projectIdsFromJson: projectFromJsonField("workbook", "workbook_id"),
  },
};
