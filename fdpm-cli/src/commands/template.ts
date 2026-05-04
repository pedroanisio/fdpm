import { Command } from "commander";
import type { Host } from "../core/host.js";
import { emit, readInput, type OutputContext } from "./util.js";
import { ProjectTemplate } from "../core/models/instance.js";
import { applyTemplate, createTemplate } from "../core/host-extra.js";
import { FDPMException } from "../core/errors/fdpm-exception.js";

export function buildTemplateCommand(host: Host): Command {
  const cmd = new Command("template");
  cmd.description("Project templates (§9.1 /projects/{id}/templates)");

  cmd
    .command("list")
    .argument("<project>", "project id")
    .option("--json", "emit JSON")
    .action((project, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const slice = host.getProject(project);
      const templates = Object.values(slice.templates);
      emit(ctx, { templates });
    });

  cmd
    .command("create")
    .argument("<project>", "project id")
    .requiredOption("-f, --file <path>", "JSON template file")
    .option("--json", "emit JSON")
    .action(async (project, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const raw = await readInput(opts.file);
      const result = ProjectTemplate.safeParse(raw);
      if (!result.success)
        throw new FDPMException("verification", "invalid ProjectTemplate", {
          evidence: { issues: result.error.issues },
        });
      const out = await createTemplate(host, project, result.data);
      emit(ctx, { template_id: result.data.id, op_id: out.op.op_id });
    });

  cmd
    .command("apply")
    .argument("<project>", "project id")
    .argument("<template_id>", "template id")
    .option("--id-prefix <prefix>", "prefix for instance ids when applying")
    .option("--json", "emit JSON")
    .action(async (project, template_id, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const out = await applyTemplate(host, project, template_id, opts.idPrefix);
      emit(ctx, { applied: out.length, op_ids: out.map((o) => o.op.op_id) });
    });

  return cmd;
}
