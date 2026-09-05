/**
 * Execute a formal artifact a model produced — Lean 4, PARI/GP or Python —
 * and report what the runner did, so a verifier can compare the observed
 * exit status with the status the model claimed.
 *
 * ARCHITECTURAL REQUIREMENT: LLMs will always produce some form of error.
 * Absence of output verification is a design defect, not a runtime bug.
 * All LLM output must be treated as untrusted and validated explicitly.
 *
 * The artifact is model-generated code, which means it is untrusted code.
 * When bubblewrap is available the runner is executed with the whole
 * filesystem read-only, a private /tmp, no network and no other namespaces
 * shared with the host, and it is killed at the timeout. Without bubblewrap
 * the run is refused unless the caller opts into `unsandboxed: true`; that
 * opt-in is recorded in the result so a receipt never shows a sandboxed run
 * that was not one.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const ARTIFACT_KINDS = ["lean4", "cas", "python", "prose"] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

/** How each kind is executed. The command receives the artifact file path as its last argument. */
export interface Runners {
  lean4: string[];
  cas: string[];
  python: string[];
}

export const DEFAULT_RUNNERS: Runners = {
  // `lake env lean` resolves mathlib from the project the caller sets as cwd.
  lean4: ["lake", "env", "lean"],
  // The absolute path matters: an interactive shell in this repository
  // aliases `gp` to `git push`, and a runner that inherited that alias would
  // push instead of compute.
  cas: ["/usr/bin/gp", "-q", "-f"],
  python: ["/usr/bin/python3", "-I"],
};

const FILE_SUFFIX: Record<Exclude<ArtifactKind, "prose">, string> = { lean4: ".lean", cas: ".gp", python: ".py" };

export interface RunOptions {
  kind: Exclude<ArtifactKind, "prose">;
  artifact: string;
  /** Working directory for the runner; for lean4 this must be the lake project root. */
  cwd: string;
  timeoutMs: number;
  runners?: Partial<Runners>;
  /** Explicit consent to execute without bubblewrap. Recorded in the result. */
  unsandboxed?: boolean;
  /** Extra read-only binds the sandbox needs (e.g. the elan toolchain dir). */
  extraReadOnly?: string[];
  /** Where the artifact file is written for the run; defaults to the OS temp dir. */
  scratchDir?: string;
}

export interface RunResult {
  exit_code: number | null;
  stdout: string;
  stderr: string;
  timed_out: boolean;
  sandboxed: boolean;
  command: string[];
  duration_ms: number;
}

export const BWRAP = "/usr/bin/bwrap";

/**
 * Build the bubblewrap command line. Pure, so the containment can be asserted
 * in a test without spawning anything: the host filesystem is read-only, the
 * only writable places are the private /tmp and the artifact directory, and
 * every namespace is unshared.
 *
 * Mount order matters: the private /tmp goes on before the artifact bind, so
 * an artifact directory that lives under the host's /tmp is bound on top of
 * the tmpfs rather than hidden beneath it.
 */
export function sandboxCommand(inner: string[], cwd: string, artifactDir: string, extraReadOnly: string[] = []): string[] {
  const binds = extraReadOnly.flatMap((p) => ["--ro-bind", p, p]);
  return [
    BWRAP,
    "--ro-bind", "/", "/",
    ...binds,
    "--dev", "/dev",
    "--proc", "/proc",
    "--tmpfs", "/tmp",
    "--bind", artifactDir, artifactDir,
    "--unshare-all",
    "--die-with-parent",
    "--new-session",
    "--chdir", cwd,
    "--",
    ...inner,
  ];
}

function collect(stream: NodeJS.ReadableStream | null, cap: number): Promise<string> {
  return new Promise((resolveText) => {
    if (!stream) return resolveText("");
    let text = "";
    stream.on("data", (chunk: Buffer | string) => {
      if (text.length < cap) text += chunk.toString();
    });
    stream.on("end", () => resolveText(text.length > cap ? `${text.slice(0, cap)}… [truncated]` : text));
    stream.on("error", () => resolveText(text));
  });
}

const OUTPUT_CAP = 64_000;

/**
 * Write the artifact to a private directory, run it under the sandbox with a
 * hard timeout, and return what happened. The caller decides what the exit
 * status means; this function only reports it.
 */
export async function runArtifact(opts: RunOptions): Promise<RunResult> {
  const runners: Runners = { ...DEFAULT_RUNNERS, ...opts.runners };
  const sandboxAvailable = existsSync(BWRAP);
  if (!sandboxAvailable && !opts.unsandboxed) {
    throw new Error(`${BWRAP} is not installed and unsandboxed execution was not requested; refusing to run model-generated ${opts.kind} code on the host`);
  }
  if (opts.scratchDir !== undefined) mkdirSync(opts.scratchDir, { recursive: true });
  const dir = mkdtempSync(join(opts.scratchDir ?? tmpdir(), "fdpm-artifact-"));
  const file = join(dir, `artifact${FILE_SUFFIX[opts.kind]}`);
  writeFileSync(file, opts.artifact, "utf8");
  const inner = [...runners[opts.kind], file];
  const command = sandboxAvailable ? sandboxCommand(inner, opts.cwd, dir, opts.extraReadOnly) : inner;
  const started = Date.now();

  try {
    return await new Promise<RunResult>((resolveResult) => {
      const child = spawn(command[0]!, command.slice(1), { cwd: opts.cwd, stdio: ["ignore", "pipe", "pipe"] });
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, opts.timeoutMs);
      const out = collect(child.stdout, OUTPUT_CAP);
      const err = collect(child.stderr, OUTPUT_CAP);
      child.on("error", (e) => {
        clearTimeout(timer);
        resolveResult({ exit_code: null, stdout: "", stderr: e.message, timed_out: false, sandboxed: sandboxAvailable, command, duration_ms: Date.now() - started });
      });
      child.on("close", async (code) => {
        clearTimeout(timer);
        resolveResult({ exit_code: code, stdout: await out, stderr: await err, timed_out: timedOut, sandboxed: sandboxAvailable, command, duration_ms: Date.now() - started });
      });
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
