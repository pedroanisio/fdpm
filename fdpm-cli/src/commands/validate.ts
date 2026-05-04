import { Command } from "commander";
import type { Host } from "../core/host.js";
import { emit, type OutputContext } from "./util.js";
import { FDPMException } from "../core/errors/fdpm-exception.js";

/**
 * `fdpm validate <project>` — read-only project-wide validation.
 *
 * Runs the same `runPrimitive` / `runRelation` validators that gate
 * writes, against the *current* projection. No state changes. Useful for:
 *   - Pre-flight on imported third-party data (surfaces violations the
 *     importer accepted but later edits would trip on).
 *   - CI integration (exit non-zero on errors; warnings are informational).
 *   - Discovering schema drift (extra fields, missing required) without
 *     having to attempt a write to find out.
 *
 * Exit code follows §8 error-category convention: `validation` (= 4) when
 * any `error`-level finding is present, 0 otherwise. `--strict` escalates
 * warnings to errors for the exit-code calculation.
 */
export function buildValidateCommand(host: Host): Command {
  const cmd = new Command("validate");
  cmd
    .description("Run profile validation across an entire project (read-only)")
    .argument("<project>", "project id")
    .option("--target <id...>", "restrict to specific primitive/relation ids")
    .option("--rule <rule_id...>", "restrict to specific rule_id(s)")
    .option(
      "--min-level <level>",
      "drop findings below this severity: info | warning | error",
      "info",
    )
    .option("--strict", "treat warnings as errors for the exit code")
    .option("--json", "emit JSON")
    .action(
      (
        projectId: string,
        opts: {
          target?: string[];
          rule?: string[];
          minLevel: "info" | "warning" | "error";
          strict?: boolean;
          json?: boolean;
        },
      ) => {
        if (!["info", "warning", "error"].includes(opts.minLevel)) {
          throw new FDPMException(
            "verification",
            `--min-level must be info|warning|error (got ${opts.minLevel})`,
          );
        }
        const ctx: OutputContext = { json: !!opts.json };
        const result = host.validateProject(projectId, {
          ...(opts.target && { targetIds: new Set(opts.target) }),
          ...(opts.rule && { ruleIds: new Set(opts.rule) }),
          minLevel: opts.minLevel,
        });

        emit(ctx, result, () => {
          const lines: string[] = [];
          lines.push(
            `${result.project_id}@${result.revision}\terrors=${result.summary.errors}\twarnings=${result.summary.warnings}\tinfo=${result.summary.info}`,
          );
          for (const r of [...result.primitives, ...result.relations]) {
            for (const f of r.findings) {
              const path = f.field_path ? `\t${f.field_path}` : "";
              lines.push(`  [${f.level}] ${r.target_id}\t${f.rule_id}${path}\t${f.message}`);
            }
          }
          return lines.join("\n");
        });

        const failing =
          result.summary.errors > 0 ||
          (!!opts.strict && result.summary.warnings > 0);
        if (failing) {
          // Surface as validation category so handleError exits 4 (§8).
          throw new FDPMException(
            "validation",
            `${result.summary.errors} error(s)${opts.strict ? `, ${result.summary.warnings} warning(s)` : ""} in ${projectId}`,
          );
        }
      },
    );
  return cmd;
}
