/**
 * `fdpm planning` subcommands — operator surface for the
 * `fdpm.planning` plugin's strict-by-default SDK helpers.
 *
 * Phase 1: single-op state transitions only (no required user input
 * beyond workbook + task id). The composite helpers (markBlocked,
 * unblock, claimTask with holder, createAITask, createDoneTask) ship
 * in phase 2 — they need richer flag sets and dialog-shaped UX.
 *
 * Wired verbs (all read-write, all delegate to plugins/planning/sdk.ts):
 *   - planning mark-ready
 *   - planning mark-in-progress
 *   - planning mark-in-review
 *   - planning mark-done
 *   - planning mark-cancelled
 *   - planning release-claim
 *
 * Each subcommand takes positional <workbook> <task-id>, supports
 * --json for machine output, and propagates the SDK helper's exception
 * verbatim (so a `done-task-has-ac` violation surfaces with the rule
 * id intact).
 */
import { Command } from "commander";
import type { Host } from "../core/host.js";
import {
  markCancelled,
  markDone,
  markInProgress,
  markInReview,
  markReady,
  releaseClaim,
} from "../../plugins/planning/sdk.js";
import {
  type CommandMetadataMap,
  firstPositionalAfter,
  projectFromJsonField,
} from "./metadata.js";
import { emit, type OutputContext } from "./util.js";

interface SimpleVerb {
  name: string;
  description: string;
  run: (host: Host, workbook: string, taskId: string) => Promise<void>;
}

const VERBS: SimpleVerb[] = [
  {
    name: "mark-ready",
    description: "Set task status to Ready",
    run: (host, workbook, taskId) => markReady(host, { workbook, taskId }),
  },
  {
    name: "mark-in-progress",
    description: "Set task status to In_progress",
    run: (host, workbook, taskId) => markInProgress(host, { workbook, taskId }),
  },
  {
    name: "mark-in-review",
    description: "Set task status to In_review",
    run: (host, workbook, taskId) => markInReview(host, { workbook, taskId }),
  },
  {
    name: "mark-done",
    description:
      "Set task status to Done. Strict — fails if no plan:Verifies edge to an AcceptanceCriterion exists.",
    run: (host, workbook, taskId) => markDone(host, { workbook, taskId }),
  },
  {
    name: "mark-cancelled",
    description: "Set task status to Cancelled (terminal, no AC required)",
    run: (host, workbook, taskId) => markCancelled(host, { workbook, taskId }),
  },
  {
    name: "release-claim",
    description: "Clear claim_holder_id and claim_until on the task",
    run: (host, workbook, taskId) => releaseClaim(host, { workbook, taskId }),
  },
];

export function buildPlanningCommand(host: Host): Command {
  const cmd = new Command("planning");
  cmd.description(
    "fdpm.planning plugin operator helpers (strict-by-default state transitions)",
  );

  for (const verb of VERBS) {
    cmd
      .command(verb.name)
      .description(verb.description)
      .argument("<workbook>", "workbook id")
      .argument("<task-id>", "primitive id of the plan:Task")
      .option("--json", "emit JSON")
      .action(async (workbook: string, taskId: string, opts: { json?: boolean }) => {
        const ctx: OutputContext = { json: !!opts.json };
        await verb.run(host, workbook, taskId);
        // Re-read the task post-op so the operator sees the new state.
        const slice = host.getProject(workbook);
        const task = slice.primitives[taskId];
        emit(
          ctx,
          {
            ok: true,
            workbook,
            task_id: taskId,
            verb: verb.name,
            status: task?.field_values.status,
            revision: task?.revision,
          },
          () =>
            `${verb.name}\tworkbook=${workbook}\ttask=${taskId}\tstatus=${task?.field_values.status ?? "?"}`,
        );
      });
  }

  return cmd;
}

export const commandMetadata: CommandMetadataMap = Object.fromEntries(
  VERBS.map((v) => [
    `planning ${v.name}`,
    {
      readOnly: false,
      projectIdsFromArgv: firstPositionalAfter(2),
      projectIdsFromJson: projectFromJsonField("workbook", "workbook_id"),
    },
  ]),
);
