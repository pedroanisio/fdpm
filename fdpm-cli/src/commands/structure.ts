import { Command } from "commander";
import type { Host } from "../core/host.js";
import { emit, readInput, type OutputContext } from "./util.js";

export function buildStructureCommand(host: Host): Command {
  const cmd = new Command("structure");
  cmd.description("Structural edits — reorder, reparent (§9.7.7)");

  cmd
    .command("reorder")
    .argument("<project>", "project id")
    .description("Reorder children within a scope (§9.7.7 :reorder)")
    .requiredOption("-f, --file <path>", "JSON body { scope_id, ordering[] }")
    .option("--json", "emit JSON")
    .action(async (project, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const body = (await readInput(opts.file)) as { scope_id: string; ordering: string[] };
      const result = await host.reorder(project, body.scope_id, body.ordering);
      emit(ctx, { op_id: result.op.op_id, project_revision: result.project_revision });
    });

  cmd
    .command("reparent")
    .argument("<project>", "project id")
    .description("Move a primitive between scopes within the same project (§9.7.7 :reparent)")
    .requiredOption("-f, --file <path>", "JSON body { primitive_id, from_scope_id, to_scope_id, position? }")
    .option("--json", "emit JSON")
    .action(async (project, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const body = (await readInput(opts.file)) as {
        primitive_id: string;
        from_scope_id: string;
        to_scope_id: string;
        position?: number;
      };
      const result = await host.reparent(project, body);
      emit(ctx, { op_id: result.op.op_id, project_revision: result.project_revision });
    });

  return cmd;
}
