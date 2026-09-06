/**
 * The Codex wrapper driver: what a stage is handed from a wrapper envelope,
 * what is refused, and how a boundary refusal reaches the executor as the
 * wrapper's own verdict rather than as a JSON parse error over its banner.
 *
 * ARCHITECTURAL REQUIREMENT: LLMs will always produce some form of error.
 * Absence of output verification is a design defect, not a runtime bug.
 * All LLM output must be treated as untrusted and validated explicitly.
 */
import type { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterAll, describe, expect, it } from "vitest";
import { CodexWrapperDriver, parseWrapperRefusal, unwrapWrapperEnvelope, type StageRun } from "../../src/loop/drivers.js";
import type { StageModel } from "../../src/loop/pipeline.js";

const scratch = mkdtempSync(join(tmpdir(), "fdpm-loop-drivers-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe("unwrapWrapperEnvelope", () => {
  const envelope = JSON.stringify({ mode: "attempt", validated: true, return: { status: "computed", claims: [] } });

  it("hands over the envelope by default and the payload when asked, keeping the verdict as evidence", () => {
    const kept = unwrapWrapperEnvelope(envelope, false);
    expect(kept.error).toBeUndefined();
    expect(JSON.parse(kept.outputText)).toHaveProperty("validated", true);
    expect(kept.evidence["wrapper_mode"]).toBe("attempt");

    const unwrapped = unwrapWrapperEnvelope(envelope, true);
    expect(JSON.parse(unwrapped.outputText)).toEqual({ status: "computed", claims: [] });
    expect(unwrapped.evidence["wrapper_validated"]).toBe(true);
    expect(unwrapped.evidence["envelope_digest"]).toMatch(/^[a-f0-9]{64}$/);
  });

  it("refuses anything that is not a validated envelope, as a driver error rather than output", () => {
    expect(unwrapWrapperEnvelope("OpenAI Codex v0.153.2\n{...}", true).error).toContain("not JSON");
    expect(unwrapWrapperEnvelope(JSON.stringify({ mode: "attempt", validated: false, return: {} }), true).error).toContain("validated:true");
    expect(unwrapWrapperEnvelope(JSON.stringify({ status: "computed" }), true).error).toContain("lacks");
  });
});

// What codex exec prints before the wrapper's own lines: the executor must never mistake this for output.
const BANNER = ["OpenAI Codex v0.153.4", "--------", "workdir: /repo", "model: gpt-6-astra", "--------", "user", "DOMAIN: mathematics", ""].join("\n");
const VERDICT = {
  ok: false,
  failures: [{ check: "fpl.reference_resolves", error_class: "ERR_HALLUCINATION", message: 'Reference https://example.org/p resolves to "X", not to the cited "X | Site".' }],
  value: { status: "partial", artifact_kind: "prose", artifact: "1. …", claims: [] },
};
const REFUSAL = `${BANNER}\n{"status":"partial"}\ntokens used\n1,234\ndelegation rejected at the verification boundary; the return was NOT accepted:\n${JSON.stringify(VERDICT, null, 2)}\nraw return kept for review at /repo/_tmp/codex-delegate/x.return.json\n`;
const NO_RETURN = `${BANNER}\ncodex exec exited 1; no return to verify\n`;

describe("parseWrapperRefusal", () => {
  it("reads the wrapper's verdict, the refused return and the raw-return path out of its stderr", () => {
    const parsed = parseWrapperRefusal(REFUSAL);
    expect(parsed?.failures).toEqual(VERDICT.failures);
    expect(parsed?.value).toEqual(VERDICT.value);
    expect(parsed?.raw_path).toBe("/repo/_tmp/codex-delegate/x.return.json");
  });

  it("yields nothing for stderr without a boundary verdict, or with one that is not a well-formed failure list", () => {
    expect(parseWrapperRefusal(NO_RETURN)).toBeUndefined();
    expect(parseWrapperRefusal("delegation rejected at the verification boundary; the return was NOT accepted:\nnot json\n")).toBeUndefined();
    expect(parseWrapperRefusal(`delegation rejected at the verification boundary; the return was NOT accepted:\n${JSON.stringify({ ok: false, failures: "nope" })}\n`)).toBeUndefined();
    expect(parseWrapperRefusal(`delegation rejected at the verification boundary; the return was NOT accepted:\n${JSON.stringify({ ok: false, failures: [{ check: "x" }] })}\n`)).toBeUndefined();
  });
});

/** A child process that prints to stderr and exits, without running anything. */
function fakeSpawn(exitCode: number, stderrText: string): typeof spawn {
  return ((): unknown => {
    const child = new EventEmitter() as EventEmitter & { stdout: PassThrough; stderr: PassThrough; kill: () => void };
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => {};
    setImmediate(() => {
      child.stderr.write(stderrText);
      child.stdout.end();
      child.stderr.end();
      setImmediate(() => child.emit("close", exitCode));
    });
    return child;
  }) as unknown as typeof spawn;
}

const stageRun = (): StageRun => ({ stage: { name: "attempt" } as unknown as StageModel, iteration: 1, attempt: 1, systemPrompt: "", taskPrompt: "do the step", bindings: {}, deadlineAt: Date.now() + 60_000 });
const driverWith = (spawnImpl: typeof spawn): CodexWrapperDriver =>
  new CodexWrapperDriver({ wrapperPath: "/nonexistent/codex-delegate.sh", scratchDir: join(scratch, "codex"), fixedRepo: scratch, fixedMode: "attempt", unwrapEnvelope: true, spawn: spawnImpl });

describe("CodexWrapperDriver on a non-zero wrapper exit", () => {
  it("hands the executor the wrapper's boundary failures and the refused return, not its banner", async () => {
    const result = await driverWith(fakeSpawn(1, REFUSAL)).run(stageRun());
    expect(result.error).toMatch(/verification boundary/);
    expect(result.failures).toEqual(VERDICT.failures);
    expect(JSON.parse(result.outputText)).toMatchObject({ status: "partial" });
    expect(result.evidence["wrapper_exit_code"]).toBe(1);
    expect(result.evidence["wrapper_failures"]).toEqual(VERDICT.failures);
    expect(result.evidence["wrapper_raw_return_path"]).toBe("/repo/_tmp/codex-delegate/x.return.json");
    expect(result.modelCalls).toBe(1);
  });

  it("reports the wrapper's last line when it exited without a verdict, with no output to judge", async () => {
    const result = await driverWith(fakeSpawn(1, NO_RETURN)).run(stageRun());
    expect(result.error).toBe("wrapper exited 1: codex exec exited 1; no return to verify");
    expect(result.outputText).toBe("");
    expect(result.failures).toBeUndefined();
  });
});
