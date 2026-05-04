import { Command } from "commander";
import type { Host } from "../core/host.js";
import { emit, readInput, type OutputContext } from "./util.js";
import { isValidProjectId } from "../core/identity/id-rules.js";
import { FDPMException } from "../core/errors/fdpm-exception.js";
import { splitProject, cloneProject, rebuildFromLog } from "../core/host-extra.js";

export function buildProjectCommand(host: Host): Command {
  const cmd = new Command("project");
  cmd.description("Project lifecycle — create, list, get, delete, split, clone");

  cmd
    .command("create")
    .description("Create a project (§9.1 POST /projects)")
    .requiredOption("--id <id>", "project id (slug)")
    .requiredOption("--name <name>", "project name")
    .requiredOption("--profile <profile_id>", "registered profile id")
    .option("--description <text>", "project description")
    .option("--json", "emit JSON")
    .action(async (opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      if (!isValidProjectId(opts.id))
        throw new FDPMException("verification", `invalid project id: ${opts.id}`);
      const result = await host.createProject({
        project_id: opts.id,
        name: opts.name,
        profile_id: opts.profile,
        ...(opts.description != null && { description: opts.description }),
      });
      emit(ctx, { project_id: opts.id, revision: result.project_revision, op_id: result.op.op_id }, () =>
        `created ${opts.id} (rev ${result.project_revision})`,
      );
    });

  cmd
    .command("list")
    .description("List projects (§9.1 GET /projects)")
    .option("--json", "emit JSON")
    .action((opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const projects = host.listProjects();
      emit(ctx, { projects }, () =>
        projects.map((p) => `${p.id}\t${p.profile_id}\trev=${p.revision}\t${p.name}`).join("\n"),
      );
    });

  cmd
    .command("get")
    .argument("<id>", "project id")
    .description("Project metadata + embedded primitives/relations (§9.1 GET /projects/{id})")
    .option("--at <revision>", "time-travel: state as of revision N (§9.8.2)")
    .option("--json", "emit JSON")
    .action((id, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const slice = opts.at !== undefined
        ? host.store.getProjectAt(id, parseInt(String(opts.at), 10))
        : host.getProject(id);
      const counts = {
        primitives: Object.keys(slice.primitives).length,
        relations: Object.keys(slice.relations).length,
        templates: Object.keys(slice.templates).length,
        test_suites: Object.keys(slice.test_suites).length,
      };
      emit(ctx, { ...slice, counts }, () =>
        `${slice.project.id}@${slice.project.revision}\t${slice.project.profile_id}\nprimitives=${counts.primitives} relations=${counts.relations} templates=${counts.templates} suites=${counts.test_suites}`,
      );
    });

  cmd
    .command("delete")
    .argument("<id>", "project id")
    .description("Delete a project (§9.1 DELETE /projects/{id})")
    .option("--json", "emit JSON")
    .action(async (id, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const result = await host.deleteProject(id);
      emit(ctx, { project_id: id, op_id: result.op.op_id, deleted: true }, () => `deleted ${id}`);
    });

  cmd
    .command("split")
    .argument("<id>", "source project id")
    .description("Split a project along a Section partition (§5.4.1 :split)")
    .requiredOption("-f, --file <path>", "JSON body file (or - for stdin)")
    .option("--json", "emit JSON")
    .action(async (id, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const body = (await readInput(opts.file)) as Parameters<typeof splitProject>[2];
      const result = await splitProject(host, id, body);
      emit(ctx, result, () =>
        `split ${id} into ${result.project_ids.join(", ")}; dropped ${result.dropped_relations.length} relations`,
      );
    });

  cmd
    .command("clone")
    .argument("<id>", "source project id")
    .description("Deep-copy a project (§5.4.2 :clone)")
    .requiredOption("--name <name>", "target project name")
    .option("--target-id <id>", "target project id")
    .option("--json", "emit JSON")
    .action(async (id, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const result = await cloneProject(host, id, {
        target_project_name: opts.name,
        ...(opts.targetId != null && { target_project_id: opts.targetId }),
      });
      emit(ctx, result, () =>
        `cloned ${id} -> ${result.project_id} (${result.primitives_copied} primitives, ${result.relations_copied} relations)`,
      );
    });

  cmd
    .command("rebuild-from-log")
    .argument("<id>", "project id")
    .description("Operator-only: discard projection, replay from log (§5.5.5, §6.5)")
    .option("--json", "emit JSON")
    .action(async (id, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const result = await rebuildFromLog(host, id);
      emit(ctx, { project_id: id, ...result, rebuilt: true }, () =>
        `rebuilt ${id} from log (rev ${result.revision})`,
      );
    });

  return cmd;
}
