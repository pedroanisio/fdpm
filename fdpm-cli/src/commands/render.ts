import { Command } from "commander";
import { promises as fs } from "node:fs";
import type { Host } from "../core/host.js";
import { emit, type OutputContext } from "./util.js";
import { FDPMException } from "../core/errors/fdpm-exception.js";
import { EXIT_CODE_FOR_CATEGORY } from "../core/errors/fdpm-exception.js";

/**
 * `fdpm render <project> <target>` — invoke a registered cap:renderer
 * for `target` (MIME type, e.g. text/markdown, text/html, application/pdf)
 * against the project's current state.
 *
 * The host's runRenderer:
 *   1. resolves the renderer (target + optional --renderer-id),
 *   2. runs it inside the per-plugin exception barrier,
 *   3. validates the output through the §6.5 gate (MIME, size, UTF-8).
 *
 * Output:
 *   - With `-o <file>`, bytes are written to disk and a small summary
 *     is emitted (always JSON-friendly).
 *   - Without `-o`, textual outputs (text/*) print to stdout; binary
 *     outputs require `-o` and reject otherwise (printing PDF bytes to
 *     a TTY is hostile).
 */
export function buildRenderCommand(host: Host): Command {
  const cmd = new Command("render");
  cmd
    .description(
      "Invoke a plugin-registered cap:renderer for <target> against <project>",
    )
    .argument("<project>", "project id")
    .argument("<target>", "renderer target (MIME type, e.g. text/markdown)")
    .option(
      "--renderer-id <id>",
      "disambiguate when more than one renderer matches the target",
    )
    .option("-o, --output <path>", "write bytes to file instead of stdout")
    .option("--json", "emit JSON summary instead of bytes")
    .option("--strict", "set a verification exit code when render findings are present")
    .action(
      async (
        projectId: string,
        target: string,
        opts: {
          rendererId?: string;
          output?: string;
          json?: boolean;
          strict?: boolean;
        },
      ) => {
        const ctx: OutputContext = { json: !!opts.json };
        const slice = host.getProject(projectId);
        const profile = host.profiles.getResolved(slice.project.profile_id);
        const result = await host.plugins.runRenderer(
          target,
          {
            projectId,
            primitives: Object.values(slice.primitives),
            relations: Object.values(slice.relations),
            profile,
          },
          opts.rendererId != null ? { rendererId: opts.rendererId } : {},
        );

        const isText = target.startsWith("text/");
        const summary = {
          project_id: projectId,
          target,
          renderer_id: result.rendererId,
          plugin_id: result.pluginId,
          content_type: result.contentType,
          bytes: result.bytes.byteLength,
          findings_count: result.findings?.length ?? 0,
          ...(result.findings && result.findings.length > 0 ? { findings: result.findings } : {}),
          ...(result.filename && { filename: result.filename }),
          ...(opts.output && { output: opts.output }),
        };
        const strictFailure = !!opts.strict && (result.findings?.length ?? 0) > 0;
        const applyStrictExit = () => {
          if (!strictFailure) return;
          process.exitCode = EXIT_CODE_FOR_CATEGORY.verification;
        };

        if (opts.output) {
          await fs.writeFile(opts.output, result.bytes);
          emit(ctx, summary, () =>
            `wrote ${result.bytes.byteLength} bytes (${result.contentType}) to ${opts.output}`,
          );
          applyStrictExit();
          return;
        }

        if (opts.json) {
          // JSON mode without -o: emit the summary; bytes are not
          // embedded (they may be binary and would need base64).
          emit(ctx, summary);
          applyStrictExit();
          return;
        }

        if (isText) {
          // Stream textual bytes straight to stdout.
          process.stdout.write(Buffer.from(result.bytes));
          if (strictFailure) {
            applyStrictExit();
            process.stderr.write(
              `render produced ${result.findings!.length} finding(s); --strict sets exit code ${EXIT_CODE_FOR_CATEGORY.verification}\n`,
            );
          }
          return;
        }

        applyStrictExit();

        throw new FDPMException(
          "verification",
          `binary renderer output (${result.contentType}) requires --output <path>`,
          { evidence: { target, bytes: result.bytes.byteLength } },
        );
      },
    );
  return cmd;
}
