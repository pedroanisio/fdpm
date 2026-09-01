/**
 * The ceiling on what one `tools/call` may return.
 *
 * `read-guard.ts` has capped `resources/read` since it landed; the tool path
 * had no equivalent, and the asymmetry was not academic. Measured against the
 * profiles this tree loads, `fdpm.profile.get` with its default `view: "full"`
 * serves 5,409,966 B for `profile:uixo:1.2`, 113,888 B for
 * `profile:academic-paper:0.4.1` and 79,789 B for
 * `profile:formal-specification:3.0`. A client refused a 61,233-character
 * result outright — and the audit log recorded that call, and the fifty-nine
 * before it, as `ok: true`, because nothing on the tool path measured the
 * response. A server whose telemetry cannot see its own worst failure mode is
 * not instrumented for it.
 *
 * WHY REFUSAL RATHER THAN TRUNCATION. A truncated result is a partial answer
 * the model cannot distinguish from a complete one, and it will reason from
 * the fragment. Refusal costs one round trip and names the smaller call.
 *
 * WHY THIS APPLIES TO READS ONLY. `dispatch.ts` calls this on Tier-1 results.
 * A read has no side effect, so refusing it and asking again is free. A write
 * has already appended by the time its response is measured; answering `quota`
 * there would hand the caller an envelope indistinguishable from a refused
 * write, and the obvious recovery — retry — would duplicate the operation.
 * Bounding write echoes needs compaction (keep `ok`, the operation ids and the
 * findings; drop the echo of the submitted payload), which is a different
 * mechanism and a separate change.
 *
 * THE CEILING IS MEASURED ON WHAT IS SERVED. The dispatcher puts the same JSON
 * in `content[0].text` and in `structuredContent`, so the frame carries the
 * payload twice; the measurement is of one serialisation, which is the
 * quantity a caller's own limit is expressed in.
 */
import { FDPMException } from "../core/errors/fdpm-exception.js";

/** Operator override for the tool-result ceiling. */
export const MAX_RESULT_BYTES_ENV = "FDPM_MCP_MAX_RESULT_BYTES";

/**
 * 32 KiB.
 *
 * Chosen against two measurements rather than a round number. The only
 * observed client ceiling in this tree refused a 61,233-character result, so a
 * default above that would not have prevented the failure it exists to
 * prevent. Below it, 32 KiB is the smallest power of two that still admits the
 * `types` view of every profile this tree loads except `profile:uixo:1.2`
 * (whose 712 primitive types put even the stripped view at 1,835,052 B and
 * which is what `view: "type_ids"` exists for). So: no `full` view of a real
 * profile fits, and every practical `types` view does.
 *
 * Operators whose clients budget more raise it with `FDPM_MCP_MAX_RESULT_BYTES`.
 */
export const DEFAULT_MAX_RESULT_BYTES = 32_768;

/**
 * Resolve the ceiling from the environment.
 *
 * A malformed value throws rather than falling back to the default, for the
 * reason `resolveMaxResourceBytes` and `resolveCatalogBudget` throw: silently
 * ignoring `FDPM_MCP_MAX_RESULT_BYTES=32KB` leaves an operator believing a
 * limit is in force that is not, which is the failure a size cap exists to
 * prevent.
 */
export function resolveMaxResultBytes(
  env: Readonly<Record<string, string | undefined>>,
): number {
  const raw = env[MAX_RESULT_BYTES_ENV];
  if (raw === undefined || raw.trim() === "") return DEFAULT_MAX_RESULT_BYTES;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new FDPMException(
      "verification",
      `${MAX_RESULT_BYTES_ENV} must be a positive integer number of bytes, got ${JSON.stringify(raw)}`,
      { evidence: { env: MAX_RESULT_BYTES_ENV, value: raw } },
    );
  }
  return parsed;
}

/** A result serialised once, with the size of that serialisation. */
export interface SerialisedResult {
  readonly text: string;
  readonly bytes: number;
}

/**
 * Serialise a result once and measure it.
 *
 * One pass, not two: the dispatcher needs the JSON for `content[0].text`
 * anyway, and a separate `JSON.stringify` for the measurement would double the
 * serialisation cost of every read — worst on exactly the 5 MB payloads this
 * module exists to catch.
 *
 * Measured in bytes, not characters: a profile of Portuguese labels costs more
 * on the wire than its character count suggests, and the transport moves bytes.
 */
export function serialiseResult(result: unknown): SerialisedResult {
  // `JSON.stringify` returns undefined for undefined; the transport carries
  // JSON null for it, so measure what will actually be sent.
  const text = JSON.stringify(result) ?? "null";
  return { text, bytes: Buffer.byteLength(text, "utf8") };
}

/** The UTF-8 bytes the serialised result would occupy. */
export function measureResultBytes(result: unknown): number {
  return serialiseResult(result).bytes;
}

/**
 * The refusal.
 *
 * `narrowing` is the tool's own list of levers — `fdpm.profile.get` names its
 * views, a search names `limit`. A refusal that does not say what smaller call
 * to make is a dead end, so the levers are declared next to each tool's schema
 * (`McpToolEntry.narrowing`) rather than guessed here from the tool name.
 */
export function resultTooLargeException(args: {
  tool: string;
  bytes: number;
  cap: number;
  narrowing?: readonly string[];
}): FDPMException {
  const { tool, bytes, cap, narrowing } = args;
  const advice =
    narrowing !== undefined && narrowing.length > 0
      ? ` Narrow the call with: ${narrowing.join("; ")}.`
      : "";
  return new FDPMException(
    "quota",
    `${tool} produced a ${bytes} B result, over the ${cap} B ceiling; nothing was returned.${advice}`,
    {
      evidence: {
        reason: "result_too_large",
        tool,
        bytes,
        cap,
        env: MAX_RESULT_BYTES_ENV,
        ...(narrowing !== undefined && narrowing.length > 0 ? { narrowing } : {}),
      },
    },
  );
}
