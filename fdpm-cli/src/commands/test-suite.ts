import { Command } from "commander";
import type { Host } from "../core/host.js";
import { emit, readInput, type OutputContext } from "./util.js";
import { TestSuite } from "../core/models/instance.js";
import { createTestSuite, runTestSuite } from "../core/host-extra.js";
import {
  type CommandMetadataMap,
  firstPositionalAfter,
  projectFromJsonField,
} from "./metadata.js";
import { FDPMException } from "../core/errors/fdpm-exception.js";

export function buildTestSuiteCommand(host: Host): Command {
  const cmd = new Command("test-suite");
  cmd.description("Test suites (§9.1 /workbooks/{id}/test-suites)");

  cmd
    .command("list")
    .argument("<workbook>", "workbook id")
    .option("--json", "emit JSON")
    .action((workbook, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const slice = host.getProject(workbook);
      emit(ctx, { test_suites: Object.values(slice.test_suites) });
    });

  cmd
    .command("create")
    .argument("<workbook>", "workbook id")
    .requiredOption("-f, --file <path>", "JSON suite file")
    .option("--json", "emit JSON")
    .action(async (workbook, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const raw = await readInput(opts.file);
      const result = TestSuite.safeParse(raw);
      if (!result.success)
        throw new FDPMException("verification", "invalid TestSuite", {
          evidence: { issues: result.error.issues },
        });
      const out = await createTestSuite(host, workbook, result.data);
      emit(ctx, { suite_id: result.data.id, op_id: out.op.op_id });
    });

  cmd
    .command("run")
    .argument("<workbook>", "workbook id")
    .argument("<suite_id>", "suite id")
    .option("--json", "emit JSON")
    .action((workbook, suite_id, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const report = runTestSuite(host, workbook, suite_id);
      emit(ctx, report);
    });

  return cmd;
}

export const commandMetadata: CommandMetadataMap = {
  "test-suite list": {
    readOnly: true,
    projectIdsFromArgv: firstPositionalAfter(2),
    projectIdsFromJson: projectFromJsonField("workbook", "workbook_id"),
  },
  "test-suite create": {
    readOnly: false,
    projectIdsFromArgv: firstPositionalAfter(2),
    projectIdsFromJson: projectFromJsonField("workbook", "workbook_id"),
  },
  "test-suite run": {
    readOnly: true,
    projectIdsFromArgv: firstPositionalAfter(2),
    projectIdsFromJson: projectFromJsonField("workbook", "workbook_id"),
  },
};
