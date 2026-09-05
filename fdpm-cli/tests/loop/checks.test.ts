/**
 * The executor's building blocks, each on its failure path.
 *
 * ARCHITECTURAL REQUIREMENT: LLMs will always produce some form of error.
 * Absence of output verification is a design defect, not a runtime bug.
 * All LLM output must be treated as untrusted and validated explicitly.
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { Host } from "../../src/core/host.js";
import { BWRAP, runArtifact, sandboxCommand, type RunResult } from "../../src/loop/checks/artifact.js";
import { manifestRoot } from "../../src/loop/checks/manifest.js";
import { checkReference, classifyLocator, normalizeTitle, type Fetcher } from "../../src/loop/checks/reference.js";
import { gitSnapshot } from "../../src/loop/checks/repo.js";
import { evaluateContract, typedParse, type ContractDef } from "../../src/loop/contract.js";
import { NAMED_VALIDATORS, UnknownValidatorError, requireValidator, runtimeErrorIn, type StageContext, type ValidatorIO } from "../../src/loop/named.js";
import { parsePointer, pointerValue, resolvePointer } from "../../src/loop/pointer.js";
import { TemplateError, renderTemplate, templateVariables } from "../../src/loop/template.js";

const REPO_ROOT = resolve(process.cwd(), "..");
const scratch = mkdtempSync(join(tmpdir(), "fdpm-loop-checks-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

async function freshHost(): Promise<Host> {
  const host = new Host({ dataDir: null, builtinDirs: [resolve(process.cwd(), "plugins")], pluginPaths: [] });
  await host.load();
  return host;
}

const fakeRun =
  (result: Partial<RunResult>) =>
  async (): Promise<RunResult> => ({ exit_code: 0, stdout: "", stderr: "", timed_out: false, sandboxed: true, command: [], duration_ms: 1, ...result });

const noFetch: Fetcher = async () => {
  throw new Error("network is not available in this test");
};

function ctx(host: Host, output: unknown, over: Partial<StageContext> = {}): StageContext {
  const io: ValidatorIO = { fetch: noFetch, runArtifact: fakeRun({}), artifactTimeoutMs: 1_000 };
  return { output, stageOutputs: new Map(), inputs: {}, workbookId: "wb", host, repoRoot: REPO_ROOT, evidence: {}, io, ...over };
}

describe("pointer", () => {
  it("resolves plain paths, indexes and wildcards, and yields nothing for the absent", () => {
    const doc = { a: { b: [{ p: "x" }, { p: "y" }, { q: 1 }] }, "k/ey": 2 };
    expect(parsePointer("/a/b/0/p")).toEqual(["a", "b", "0", "p"]);
    expect(pointerValue(doc, "/a/b/1/p")).toBe("y");
    expect(resolvePointer(doc, "/a/b/*/p")).toEqual(["x", "y"]);
    expect(resolvePointer(doc, "/nope/*")).toEqual([]);
    expect(pointerValue(doc, "/k~1ey")).toBe(2);
    expect(() => parsePointer("a/b")).toThrow(/must start/);
    expect(() => pointerValue(doc, "/a/*")).toThrow(/wildcards/);
  });
});

describe("template", () => {
  it("renders, serialises non-strings as JSON, and refuses mismatched bindings in both directions", () => {
    expect(templateVariables("x {{a}} y {{ b }} {{a}}")).toEqual(["a", "b"]);
    expect(renderTemplate("step: {{step}}", { step: { k: 1 } })).toBe('step: {"k":1}');
    expect(() => renderTemplate("{{a}}", {})).toThrow(TemplateError);
    expect(() => renderTemplate("{{a}}", { a: 1, extra: 2 })).toThrow(/unused \["extra"\]/);
    expect(renderTemplate("{{a}}", { a: 1, repo_path: "/x" }, { driverConsumed: ["repo_path"] })).toBe("1");
  });
});

describe("typed parse and contract evaluation", () => {
  const contract: ContractDef = {
    format: "json",
    json_schema: JSON.stringify({ type: "object", additionalProperties: false, required: ["verdict", "score"], properties: { verdict: { type: "string" }, score: { type: "number" } } }),
    on_invalid: "fail",
    validators: [
      { position: 0, kind: "regex", path: "/verdict", pattern: "^(go|stop)$" },
      { position: 1, kind: "range", path: "/score", min: 0, max: 1 },
    ],
  };

  it("classifies empty, truncated, prose, missing-key and extra-key outputs", () => {
    expect(typedParse("", contract).failures[0]?.error_class).toBe("ERR_TRUNCATION");
    expect(typedParse('{"verdict":"go","sco', contract).failures[0]?.error_class).toBe("ERR_TRUNCATION");
    expect(typedParse("Sure, here you go", contract).failures[0]?.error_class).toBe("ERR_SCHEMA");
    expect(typedParse('{"verdict":"go"}', contract).failures[0]?.error_class).toBe("ERR_OMISSION");
    expect(typedParse('{"verdict":"go","score":1,"x":1}', contract).failures[0]?.error_class).toBe("ERR_SCHEMA");
    expect(typedParse('{"verdict":"go","score":1}', contract).ok).toBe(true);
  });

  it("runs regex and range validators and reports every failure at once", async () => {
    const host = await freshHost();
    const bad = await evaluateContract('{"verdict":"maybe","score":7}', contract, ctx(host, undefined));
    expect(bad.ok).toBe(false);
    expect(bad.failures.map((f) => f.check).sort()).toEqual(["lf.range@1", "lf.regex@0"]);
    const good = await evaluateContract('{"verdict":"go","score":0.5}', contract, ctx(host, undefined));
    expect(good.ok).toBe(true);
  });

  it("throws, never passes, on a validator the registry does not implement", async () => {
    const host = await freshHost();
    const withUnknown: ContractDef = { ...contract, validators: [{ position: 0, kind: "named", validator_name: "nope.unknown", args: "{}" }] };
    await expect(evaluateContract('{"verdict":"go","score":0.5}', withUnknown, ctx(host, undefined))).rejects.toBeInstanceOf(UnknownValidatorError);
    expect(() => requireValidator("nope.unknown")).toThrow(UnknownValidatorError);
    expect(NAMED_VALIDATORS.size).toBe(12);
  });
});

describe("fpl.formal_artifact_check", () => {
  const args = { artifact_path: "/artifact", kind_path: "/artifact_kind", command_path: "/reproduction_command", status_path: "/status", runners: { cas: "/usr/bin/gp -q -f", python: "/usr/bin/python3 -I" }, prose_allowed_for: ["partial", "failed"] };
  const v = requireValidator("fpl.formal_artifact_check");
  const out = (status: string, kind: string) => ({ status, artifact_kind: kind, artifact: "print(1)", reproduction_command: "x" });

  it("accepts a computed claim whose artifact exits 0 and rejects one that does not", async () => {
    const host = await freshHost();
    expect(await v(args, ctx(host, out("computed", "python"), { io: { fetch: noFetch, runArtifact: fakeRun({ exit_code: 0 }), artifactTimeoutMs: 1 } }))).toEqual([]);
    const failed = await v(args, ctx(host, out("computed", "python"), { io: { fetch: noFetch, runArtifact: fakeRun({ exit_code: 1, stderr: "boom" }), artifactTimeoutMs: 1 } }));
    expect(failed[0]?.error_class).toBe("ERR_HALLUCINATION");
    expect(failed[0]?.message).toContain("boom");
  });

  it("lets a failed step carry a failing artifact, refuses prose for a proved step, and does not establish a timed-out claim", async () => {
    const host = await freshHost();
    expect(await v(args, ctx(host, out("failed", "python"), { io: { fetch: noFetch, runArtifact: fakeRun({ exit_code: 1 }), artifactTimeoutMs: 1 } }))).toEqual([]);
    expect((await v(args, ctx(host, out("proved", "prose"))))[0]?.error_class).toBe("ERR_INSTRUCTION");
    expect(await v(args, ctx(host, out("partial", "prose")))).toEqual([]);
    const timedOut = await v(args, ctx(host, out("computed", "cas"), { io: { fetch: noFetch, runArtifact: fakeRun({ timed_out: true }), artifactTimeoutMs: 1 } }));
    expect(timedOut[0]?.error_class).toBe("ERR_SEMANTIC");
  });

  it("does not let a PARI/GP error that exits 0 establish a computed claim", async () => {
    const host = await freshHost();
    const errored = fakeRun({ exit_code: 0, stdout: "  ***   at top-level: x=1/0\n  *** _/_: impossible inverse in gdiv: 0.\n... skipping file 'artifact.gp'\n1\n" });
    const found = await v(args, ctx(host, out("computed", "cas"), { io: { fetch: noFetch, runArtifact: errored, artifactTimeoutMs: 1 } }));
    expect(found[0]?.error_class).toBe("ERR_HALLUCINATION");
    expect(found[0]?.message).toContain("exit 0 does not establish");
    expect(runtimeErrorIn("cas", { exit_code: 0, stdout: "1\n", stderr: "", timed_out: false, sandboxed: true, command: [], duration_ms: 1 })).toBeUndefined();
    expect(runtimeErrorIn("lean4", { exit_code: 0, stdout: "", stderr: "artifact.lean:3:2: error: unknown identifier", timed_out: false, sandboxed: true, command: [], duration_ms: 1 })).toContain("error");
  });

  it.runIf(existsSync(BWRAP))("catches the real thing: gp prints an error, skips the file, prints 1 and exits 0", async () => {
    const host = await freshHost();
    const io: ValidatorIO = { fetch: noFetch, runArtifact, artifactTimeoutMs: 20_000 };
    const found = await v(args, ctx(host, { status: "computed", artifact_kind: "cas", artifact: "x=1/0;\nprint(1);\nquit;\n", reproduction_command: "gp" }, { io }));
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toMatch(/\*\*\*.*x=1\/0/);
  }, 30_000);

  it("refuses a relative CAS runner, because this shell aliases gp to git push", async () => {
    const host = await freshHost();
    await expect(v({ ...args, runners: { cas: "gp -q" } }, ctx(host, out("computed", "cas")))).rejects.toThrow(/absolute path/);
  });
});

describe("artifact runner", () => {
  it("builds a sandbox with the host read-only, private tmp and every namespace unshared", () => {
    const cmd = sandboxCommand(["/usr/bin/python3", "-I", "/x/a.py"], "/work", "/x");
    expect(cmd[0]).toBe(BWRAP);
    expect(cmd).toContain("--unshare-all");
    expect(cmd.slice(1, 4)).toEqual(["--ro-bind", "/", "/"]);
    expect(cmd.slice(-3)).toEqual(["/usr/bin/python3", "-I", "/x/a.py"]);
    // The private /tmp must be mounted before the artifact bind, or an artifact under /tmp is hidden by it.
    expect(cmd.indexOf("--tmpfs")).toBeLessThan(cmd.indexOf("--bind"));
  });

  const hasBwrap = existsSync(BWRAP);
  it.runIf(hasBwrap)("executes python and PARI/GP artifacts under bubblewrap, honours exit codes and the timeout", async () => {
    const py = await runArtifact({ kind: "python", artifact: "print(pow(3,5,7))", cwd: REPO_ROOT, timeoutMs: 20_000 });
    expect(py.sandboxed).toBe(true);
    expect(py.exit_code).toBe(0);
    expect(py.stdout.trim()).toBe("5");
    const bad = await runArtifact({ kind: "python", artifact: "import sys; sys.exit(3)", cwd: REPO_ROOT, timeoutMs: 20_000 });
    expect(bad.exit_code).toBe(3);
    const gp = await runArtifact({ kind: "cas", artifact: "print(isprime(2^61-1))", cwd: REPO_ROOT, timeoutMs: 20_000 });
    expect(gp.exit_code).toBe(0);
    expect(gp.stdout.trim()).toBe("1");
    const slow = await runArtifact({ kind: "python", artifact: "while True: pass", cwd: REPO_ROOT, timeoutMs: 800 });
    expect(slow.timed_out).toBe(true);
  }, 90_000);

  it.runIf(hasBwrap)("blocks the network inside the sandbox", async () => {
    const net = await runArtifact({
      kind: "python",
      artifact: 'import socket\ntry:\n  socket.create_connection(("1.1.1.1",53),timeout=2); print("open")\nexcept Exception:\n  print("blocked")',
      cwd: REPO_ROOT,
      timeoutMs: 20_000,
    });
    expect(net.stdout.trim()).toBe("blocked");
  }, 30_000);
});

describe("fpl.reference_resolves", () => {
  const v = requireValidator("fpl.reference_resolves");
  const args = { path: "/references", locator_field: "locator", title_field: "title", resolvers: ["doi.org", "arxiv.org", "https"], title_match: "normalized-exact" };
  const csl = (title: string): string => JSON.stringify({ title });
  const atom = (title: string): string => `<?xml version="1.0"?><feed><title>query</title><entry><id>x</id><title>${title}</title></entry></feed>`;
  const fetcher: Fetcher = async (url) => {
    if (url.startsWith("https://doi.org/10.1234/good")) return { status: 200, text: csl("Silent Acceptance: A Protocol"), finalUrl: url };
    if (url.startsWith("https://doi.org/10.1234/gone")) return { status: 404, text: "", finalUrl: url };
    if (url.includes("id_list=2608.26218")) return { status: 200, text: atom("Context Policies &amp; Harnesses"), finalUrl: url };
    if (url.includes("id_list=")) return { status: 200, text: "<feed><title>query</title></feed>", finalUrl: url };
    return { status: 500, text: "", finalUrl: url };
  };

  it("classifies locators", () => {
    expect(classifyLocator("doi:10.5281/zenodo.19401266").scheme).toBe("doi");
    expect(classifyLocator("https://doi.org/10.5281/zenodo.19401266").id).toBe("10.5281/zenodo.19401266");
    expect(classifyLocator("arXiv:2608.26218v2")).toEqual({ scheme: "arxiv", id: "2608.26218v2" });
    expect(classifyLocator("https://arxiv.org/abs/2608.26218").scheme).toBe("arxiv");
    expect(classifyLocator("https://example.org/p").scheme).toBe("https");
    expect(classifyLocator("Smith 2021").scheme).toBe("unknown");
    expect(normalizeTitle("Silent Acceptance: A Protocol!")).toBe("silent acceptance a protocol");
  });

  it("accepts a resolving, title-matching reference and rejects fabricated, mismatched and unresolvable ones", async () => {
    const host = await freshHost();
    const io: ValidatorIO = { fetch: fetcher, runArtifact: fakeRun({}), artifactTimeoutMs: 1 };
    const run = (references: unknown[]) => v(args, ctx(host, { references }, { io }));
    expect(await run([{ locator: "doi:10.1234/good", title: "Silent acceptance — a protocol" }])).toEqual([]);
    expect(await run([{ locator: "arXiv:2608.26218", title: "Context Policies & Harnesses" }])).toEqual([]);
    expect(await run([])).toEqual([]);
    const mismatch = await run([{ locator: "doi:10.1234/good", title: "A Different Paper" }]);
    expect(mismatch[0]?.error_class).toBe("ERR_HALLUCINATION");
    expect(mismatch[0]?.message).toContain("resolves to");
    expect((await run([{ locator: "doi:10.1234/gone", title: "x" }]))[0]?.message).toContain("HTTP 404");
    expect((await run([{ locator: "arXiv:0000.00000", title: "x" }]))[0]?.message).toContain("no entry");
    expect((await run([{ locator: "Smith 2021", title: "x" }]))[0]?.message).toContain("not a DOI");
    const verdict = await checkReference({ locator: "doi:10.1234/good", title: "nope" }, fetcher);
    expect(verdict.ok).toBe(true);
    expect(verdict.matches).toBe(false);
  });
});

describe("workbook read-back validators", () => {
  async function seeded(): Promise<{ host: Host; wb: string }> {
    const host = await freshHost();
    const wb = "fpl-probe-proofs";
    await host.createProject({ workbook_id: wb, name: "probe", profile_id: "profile:re-crt:6.2" });
    const node = async (slug: string, verification_status: string) => {
      const r = await host.createPrimitive(wb, { id: `recrt:proof-node:${slug}`, type_id: "recrt:ProofNode", field_values: { id: slug, node_type: "open", payload: "p", verification_status } });
      if (!r.report.accepted) throw new Error(JSON.stringify(r.report.findings));
    };
    await node("goal", "unverified");
    return { host, wb };
  }

  it("fpl.node_exists_in_workbook: real node passes; missing, mistyped and missing-workbook fail", async () => {
    const { host, wb } = await seeded();
    const v = requireValidator("fpl.node_exists_in_workbook");
    const args = { workbook_input: "proofs_workbook_id", path: "/target_node_id", type_id: "recrt:ProofNode", lookup: "fdpm.primitive.get" };
    const inputs = { proofs_workbook_id: wb };
    expect(await v(args, ctx(host, { target_node_id: "recrt:proof-node:goal" }, { inputs }))).toEqual([]);
    expect((await v(args, ctx(host, { target_node_id: "recrt:proof-node:invented" }, { inputs })))[0]?.error_class).toBe("ERR_HALLUCINATION");
    expect((await v({ ...args, type_id: "recrt:Claim" }, ctx(host, { target_node_id: "recrt:proof-node:goal" }, { inputs })))[0]?.message).toContain("not a recrt:Claim");
    expect((await v(args, ctx(host, { target_node_id: "recrt:proof-node:goal" }, { inputs: { proofs_workbook_id: "no-such-wb" } })))[0]?.message).toContain("does not exist");
  });

  it("fpl.written_ids_exist and fpl.producer_status_guard read the store, not the report", async () => {
    const { host, wb } = await seeded();
    const exists = requireValidator("fpl.written_ids_exist");
    const guard = requireValidator("fpl.producer_status_guard");
    const written = (id: string, type_id = "recrt:ProofNode") => ({ written: [{ workbook_id: wb, id, type_id }] });
    const existsArgs = { path: "/written", lookup: "fdpm.primitive.get", require_nonempty_when: { stage: "audit", path: "/verdict", equals: "register" } };
    expect(await exists(existsArgs, ctx(host, written("recrt:proof-node:goal")))).toEqual([]);
    expect((await exists(existsArgs, ctx(host, written("recrt:proof-node:ghost"))))[0]?.error_class).toBe("ERR_HALLUCINATION");
    const audited = new Map([["audit", { verdict: "register" }]]);
    expect((await exists(existsArgs, ctx(host, { written: [] }, { stageOutputs: audited })))[0]?.error_class).toBe("ERR_OMISSION");
    expect(await exists(existsArgs, ctx(host, { written: [] }, { stageOutputs: new Map([["audit", { verdict: "reject" }]]) }))).toEqual([]);

    const guardArgs = { path: "/written", lookup: "fdpm.primitive.get", forbidden: { "recrt:ProofNode": { verification_status: ["cas_checked", "proof_witnessed", "axiom"] } }, forbidden_types: ["recrt:EvidenceBundle"] };
    expect(await guard(guardArgs, ctx(host, written("recrt:proof-node:goal")))).toEqual([]);
    // A node the producer marked witnessed in the store is caught even though the report says nothing about it.
    const r = await host.createPrimitive(wb, { id: "recrt:proof-node:sneaky", type_id: "recrt:ProofNode", field_values: { id: "sneaky", node_type: "open", payload: "p", verification_status: "proof_witnessed" } });
    if (!r.report.accepted) throw new Error(JSON.stringify(r.report.findings));
    expect((await guard(guardArgs, ctx(host, written("recrt:proof-node:sneaky"))))[0]?.error_class).toBe("ERR_INSTRUCTION");
    expect((await guard(guardArgs, ctx(host, written("recrt:evidence-bundle:x", "recrt:EvidenceBundle"))))[0]?.message).toContain("reserved for the acceptance authority");
  });

  it("fpl.error_class_vocabulary rejects a class outside the nine", async () => {
    const host = await freshHost();
    const v = requireValidator("fpl.error_class_vocabulary");
    const args = { path: "/findings", field: "error_class", allowed: ["ERR_HALLUCINATION", "ERR_OMISSION"] };
    expect(await v(args, ctx(host, { findings: [{ error_class: "ERR_OMISSION" }] }))).toEqual([]);
    expect((await v(args, ctx(host, { findings: [{ error_class: "ERR_VIBES" }] })))[0]?.error_class).toBe("ERR_INSTRUCTION");
  });
});

describe("fpl.evidence_bundle_manifest", () => {
  it("recomputes the root from the files and rejects a root that does not recompute", async () => {
    const host = await freshHost();
    const v = requireValidator("fpl.evidence_bundle_manifest");
    const bundle = join(scratch, "bundle");
    mkdirSync(join(bundle, "sub"), { recursive: true });
    writeFileSync(join(bundle, "a.txt"), "alpha");
    writeFileSync(join(bundle, "sub", "b.txt"), "beta");
    const root = manifestRoot(bundle);
    expect(root).toMatch(/^[a-f0-9]{64}$/);
    expect(manifestRoot(bundle)).toBe(root);
    const args = { path: "/evidence_bundle", hash_algorithm: "sha256", line_format: "sha256  path", root: "sha256 over the sorted lines" };
    const c = (bundlePath: string, manifest_root: string) => ctx(host, { evidence_bundle: { manifest_root, bundle_path: bundlePath } }, { repoRoot: scratch });
    expect(await v(args, c("bundle", root))).toEqual([]);
    expect((await v(args, c("bundle", "0".repeat(64))))[0]?.error_class).toBe("ERR_HALLUCINATION");
    expect((await v(args, c("../outside", root)))[0]?.message).toContain("escapes");
    expect(await v(args, ctx(host, { evidence_bundle: null }))).toEqual([]);
    writeFileSync(join(bundle, "a.txt"), "tampered");
    expect(manifestRoot(bundle)).not.toBe(root);
  });
});

describe("cdel.* over the wrapper envelope", () => {
  const quiet = { head: "h", status_digest: "s", stash_list: "t", ref_list: "r" };
  it("cdel.no_git_mutation fails closed when the driver captured no snapshots, and reads the snapshots it has", async () => {
    const host = await freshHost();
    const v = requireValidator("cdel.no_git_mutation");
    expect((await v({}, ctx(host, {})))[0]?.message).toContain("captured no git snapshots");
    expect(await v({}, ctx(host, {}, { evidence: { git_before: quiet, git_after: quiet } }))).toEqual([]);
    expect((await v({}, ctx(host, {}, { evidence: { git_before: quiet, git_after: { ...quiet, head: "h2" } } })))[0]?.error_class).toBe("ERR_INSTRUCTION");
    expect(await v({}, ctx(host, {}, { mode: "write", evidence: { git_before: quiet, git_after: { ...quiet, status_digest: "dirty" } } }))).toEqual([]);
  });

  it("cdel.paths_exist and cdel.quotes_match address the envelope's return", async () => {
    const host = await freshHost();
    const paths = requireValidator("cdel.paths_exist");
    const quotes = requireValidator("cdel.quotes_match");
    const envelope = (path: string, line: number, quote: string) => ({ mode: "research", validated: true, return: { evidence: [{ path, line, quote }] } });
    const pathArgs = { paths: ["/return/evidence/*/path", "/return/target_files/*"], root_input: "repo_path", allow_missing: false };
    const quoteArgs = { path: "/return/evidence", path_field: "path", line_field: "line", quote_field: "quote", root_input: "repo_path" };
    const inputs = { repo_path: REPO_ROOT };
    const good = envelope("fdpm-cli/src/sdk.ts", 2, " * @fdpm/cli SDK — thin programmatic facade over Host.");
    expect(await paths(pathArgs, ctx(host, good, { inputs }))).toEqual([]);
    expect(await quotes(quoteArgs, ctx(host, good, { inputs }))).toEqual([]);
    expect((await paths(pathArgs, ctx(host, envelope("fdpm-cli/src/nope.ts", 1, "x"), { inputs })))[0]?.error_class).toBe("ERR_HALLUCINATION");
    expect((await quotes(quoteArgs, ctx(host, envelope("fdpm-cli/src/sdk.ts", 2, "a paraphrase"), { inputs })))[0]?.message).toContain("not verbatim");
  });

  it("gitSnapshot reads a real repository and a sentinel outside one", () => {
    const inside = gitSnapshot(REPO_ROOT);
    expect(inside.head).toMatch(/^[a-f0-9]{40}$/);
    expect(gitSnapshot(scratch).head).toBe("not-a-git-repo");
  });
});
