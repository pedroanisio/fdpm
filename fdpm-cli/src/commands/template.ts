import { Command } from "commander";
import type { Host } from "../core/host.js";
import { emit, readInput, type OutputContext } from "./util.js";
import { ProjectTemplate } from "../core/models/instance.js";
import { applyTemplate, createTemplate } from "../core/host-extra.js";
import {
  type CommandMetadataMap,
  firstPositionalAfter,
  projectFromJsonField,
} from "./metadata.js";
import { FDPMException } from "../core/errors/fdpm-exception.js";

export function buildTemplateCommand(host: Host): Command {
  const cmd = new Command("template");
  cmd.description("Workbook templates (§9.1 /workbooks/{id}/templates)");

  cmd
    .command("list")
    .argument("<workbook>", "workbook id")
    .option("--json", "emit JSON")
    .action((workbook, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const slice = host.getProject(workbook);
      const templates = Object.values(slice.templates);
      emit(ctx, { templates });
    });

  cmd
    .command("create")
    .argument("<workbook>", "workbook id")
    .requiredOption("-f, --file <path>", "JSON template file")
    .option("--json", "emit JSON")
    .action(async (workbook, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const raw = await readInput(opts.file);
      const result = ProjectTemplate.safeParse(raw);
      if (!result.success)
        throw new FDPMException("verification", "invalid ProjectTemplate", {
          evidence: { issues: result.error.issues },
        });
      const out = await createTemplate(host, workbook, result.data);
      emit(ctx, { template_id: result.data.id, op_id: out.op.op_id });
    });

  cmd
    .command("apply")
    .argument("<workbook>", "workbook id")
    .argument("<template_id>", "template id")
    .option("--id-prefix <prefix>", "prefix for instance ids when applying")
    .option("--json", "emit JSON")
    .action(async (workbook, template_id, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const out = await applyTemplate(host, workbook, template_id, opts.idPrefix);
      emit(ctx, { applied: out.length, op_ids: out.map((o) => o.op.op_id) });
    });

  return cmd;
}

export const commandMetadata: CommandMetadataMap = {
  "template list": {
    readOnly: true,
    projectIdsFromArgv: firstPositionalAfter(2),
    projectIdsFromJson: projectFromJsonField("workbook", "workbook_id"),
  },
  "template create": {
    readOnly: false,
    projectIdsFromArgv: firstPositionalAfter(2),
    projectIdsFromJson: projectFromJsonField("workbook", "workbook_id"),
  },
  "template apply": {
    readOnly: false,
    projectIdsFromArgv: firstPositionalAfter(2),
    projectIdsFromJson: projectFromJsonField("workbook", "workbook_id"),
  },
};
