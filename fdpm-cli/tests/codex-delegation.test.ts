/**
 * Gate for profile:codex-delegation:0.1 and the delegation workbook it hosts.
 *
 * ARCHITECTURAL REQUIREMENT: LLMs will always produce some form of error.
 * Absence of output verification is a design defect, not a runtime bug.
 * All LLM output must be treated as untrusted and validated explicitly.
 *
 * The suite exercises the failure path of every blocking rule, not only the
 * happy path: a rule whose CEL fails to parse degrades to an `info` finding
 * and silently stops blocking, so "the good workbook builds" would pass just
 * as well with all four containment rules disabled. Each rejection test is
 * what distinguishes an enforced constraint from a decorative one.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { Host } from "../src/core/host.js";
import type { ValidationFinding as Finding } from "../src/core/models/instance.js";
import { DomainProfile } from "../src/core/models/meta.js";
import { ERROR_CLASSES } from "../plugins/silent_acceptance/ids.js";
import { buildCodexDelegation } from "../scripts/build-codex-delegation.js";
import {
  CDEL,
  CDEL_R,
  CDEL_RULE,
  PARENT_LOOP_FORWARD,
  PARENT_SILENT_ACCEPTANCE,
  PROFILE,
  PROFILE_ID,
  PROFILE_VERSION,
} from "../scripts/codex-delegation/profile.js";
import {
  CODEX_AGENT_ID,
  CODEX_GRANTS,
  MODES,
  ORCHESTRATOR_GRANTS,
  STAGES,
  WORKBOOK_ID,
  WRAPPER_PATH,
  delegationSeed,
  modeId,
  stageId,
} from "../scripts/codex-delegation/seed.js";
import { checkNoGitMutation, verifyReturn, type GitSnapshot } from "../scripts/codex-delegation/verify-return.js";

const REPO_ROOT = resolve(process.cwd(), "..");

async function freshHost(): Promise<Host> {
  const host = new Host({
    dataDir: null,
    builtinDirs: [resolve(process.cwd(), "plugins")],
    pluginPaths: [],
  });
  await host.load();
  return host;
}

/** A cdel:DelegationMode that satisfies every blocking rule; tests perturb one field. */
const baseMode = (): Record<string, unknown> => ({
  mode_name: "research",
  description: "Read-only investigation.",
  sandbox_tier: "read-only",
  writes_workspace: false,
  network_access: false,
  git_allowed: false,
  requires_git_repo: false,
  return_schema: '{"type":"object"}',
  wrapper_flags: ["--sandbox", "read-only"],
});

describe("profile:codex-delegation:0.1", () => {
  it("is a valid profile that composes exactly loop-forward and silent-acceptance", () => {
    expect(() => DomainProfile.parse(PROFILE)).not.toThrow();
    expect(PROFILE.id).toBe(PROFILE_ID);
    expect(PROFILE.version).toBe(PROFILE_VERSION);
    expect(PROFILE.extends).toEqual([PARENT_LOOP_FORWARD, PARENT_SILENT_ACCEPTANCE]);
  });

  it("contributes only bridges and the delegation mode the parents do not model", () => {
    expect(PROFILE.primitive_types.map((t) => t.id)).toEqual([CDEL.DelegationMode]);
    expect(PROFILE.relation_types.map((t) => t.id).sort()).toEqual(Object.values(CDEL_R).sort());
    for (const type of PROFILE.relation_types) {
      const endpoints = [...type.source_types!, ...type.target_types!];
      expect(endpoints.some((id) => id.startsWith("lf:") || id.startsWith("sa:"))).toBe(true);
    }
  });

  it("registers against a host that already carries both parents", async () => {
    const host = await freshHost();
    await host.registerProfile(PROFILE);
    await host.createProject({ workbook_id: "cdel-registration-probe", name: "probe", profile_id: PROFILE_ID });
    const resolved = host.requireResolvedProfile("cdel-registration-probe");
    expect(resolved.id).toBe(PROFILE_ID);
    // The composed vocabulary has to carry both parents, or none of the
    // bridge relations below have endpoints to attach to.
    const typeIds = new Set(resolved.primitive_types.map((t) => t.id));
    expect(typeIds.has("lf:Stage")).toBe(true);
    expect(typeIds.has("sa:VerificationBoundary")).toBe(true);
    expect(typeIds.has(CDEL.DelegationMode)).toBe(true);
  });
});

describe("the delegation workbook builds clean", () => {
  let host: Host;

  beforeAll(async () => {
    host = await freshHost();
    await buildCodexDelegation(host);
  });

  it("accepts every record with no error or warning findings", () => {
    const report = host.validateProject(WORKBOOK_ID, { minLevel: "warning" });
    const blocking = [...report.primitives, ...report.relations].flatMap((r) =>
      r.findings.map((f) => `${f.level} ${f.rule_id} ${f.target_id}: ${f.message}`),
    );
    expect(blocking).toEqual([]);
    expect(report.summary.errors).toBe(0);
    expect(report.summary.warnings).toBe(0);
  });

  it("guards every stage with a boundary over all nine error classes", () => {
    const relations = Object.values(host.getProject(WORKBOOK_ID).relations);
    const guarded = relations
      .filter((r) => r.type_id === CDEL_R.BoundaryGuardsStage)
      .map((r) => r.target_id)
      .sort();
    expect(guarded).toEqual(STAGES.map((s) => stageId(s.slug)).sort());

    const coverage = relations.filter((r) => r.type_id === "sa:BoundaryDeclaresCoverage");
    expect(coverage).toHaveLength(STAGES.length * ERROR_CLASSES.length);
  });

  it("gives the subordinate agent no write, destructive or git authority", () => {
    const slice = host.getProject(WORKBOOK_ID);
    const relations = Object.values(slice.relations);
    const granted = relations
      .filter((r) => r.type_id === "lf:AgentGrantsTool" && r.source_id === CODEX_AGENT_ID)
      .map((r) => r.target_id);
    expect(granted.length).toBeGreaterThan(0);

    for (const id of granted) {
      const grant = slice.primitives[id];
      expect(grant?.field_values["authority"]).toBe("read");
      expect(String(grant?.field_values["tool_name"])).not.toMatch(/git/);
    }
  });

  it("is re-runnable against a host that already carries the profile", async () => {
    // The guide tells operators to run the build script, and a script that
    // aborts on its second run is a script nobody finishes deploying.
    const second = await freshHost();
    const first = await buildCodexDelegation(second);
    expect(first.profile).toBe("registered");
    await second.deleteProject(WORKBOOK_ID);
    const again = await buildCodexDelegation(second);
    expect(again.profile).toBe("already-present");
    expect(again.workbooks[0]?.primitives).toBe(first.workbooks[0]?.primitives);
  });

  it("declares no retry on the one stage the runtime cannot re-prompt", () => {
    const slice = host.getProject(WORKBOOK_ID);
    // The wrapper reports a failed delegation rather than re-running it, so a
    // retry ceiling on this contract would be an attempt nothing makes — and
    // the budget renderer computes worst-case spend from exactly this field.
    expect(slice.primitives["lf:contract:cdel-delegate"]?.field_values["on_invalid"]).toBe("fail");
    for (const mode of MODES) {
      expect(slice.primitives[`lf:contract:cdel-mode-${mode.mode_name}`]?.field_values["on_invalid"]).toBe("fail");
    }
    // The orchestrator's own stages can be re-prompted, and say so.
    for (const slug of ["order", "review", "apply"]) {
      expect(slice.primitives[`lf:contract:cdel-${slug}`]?.field_values["on_invalid"]).toBe("retry");
    }
  });

  it("binds each mode to the output contract that enforces its return schema", () => {
    const relations = Object.values(host.getProject(WORKBOOK_ID).relations);
    const bound = relations.filter((r) => r.type_id === CDEL_R.ModeReturnsContract).map((r) => r.source_id).sort();
    expect(bound).toEqual(MODES.map((m) => modeId(m.mode_name)).sort());
  });
});

describe("containment rules reject the modes they exist to reject", () => {
  let host: Host;

  beforeAll(async () => {
    host = await freshHost();
    await buildCodexDelegation(host);
  });

  /**
   * A rejected write raises rather than returning a report, so the findings
   * are read off the exception. Returning them uniformly keeps each test
   * asserting on the rule that fired rather than on the throw.
   */
  const attempt = async (id: string, patch: Record<string, unknown>): Promise<Finding[]> => {
    try {
      const result = await host.createPrimitive(WORKBOOK_ID, {
        id,
        type_id: CDEL.DelegationMode,
        field_values: { ...baseMode(), ...patch },
      });
      // Findings are returned whether or not the write was accepted: a
      // warning-level rule does not block, and asserting only on rejections
      // would leave every warning rule in this profile untested.
      return result.report.findings;
    } catch (err) {
      const findings = (err as { findings?: Finding[] }).findings;
      if (findings === undefined) throw err;
      return findings;
    }
  };

  it("rejects a mode with no sandbox", async () => {
    const findings = await attempt("cdel:mode:reject-full-access", {
      sandbox_tier: "danger-full-access",
      writes_workspace: false,
    });
    expect(findings.map((f) => f.rule_id)).toContain(CDEL_RULE.noFullAccess);
  });

  it("rejects a mode whose write scope and sandbox tier disagree", async () => {
    const claimsWrite = await attempt("cdel:mode:reject-write-in-readonly", { writes_workspace: true, requires_git_repo: true });
    expect(claimsWrite.map((f) => f.rule_id)).toContain(CDEL_RULE.writeTierCoherent);

    const hidesWrite = await attempt("cdel:mode:reject-writetier-readonly", { sandbox_tier: "workspace-write" });
    expect(hidesWrite.map((f) => f.rule_id)).toContain(CDEL_RULE.writeTierCoherent);
  });

  it("rejects a mode that holds git authority", async () => {
    const findings = await attempt("cdel:mode:reject-git", { git_allowed: true });
    expect(findings.map((f) => f.rule_id)).toContain(CDEL_RULE.noGitAuthority);
  });

  it("rejects a writing mode that would run outside a git working tree", async () => {
    const findings = await attempt("cdel:mode:reject-write-nogit", {
      sandbox_tier: "workspace-write",
      writes_workspace: true,
      requires_git_repo: false,
    });
    expect(findings.map((f) => f.rule_id)).toContain(CDEL_RULE.writeRequiresGit);
  });

  it("warns on a mode no stage runs, without warning on the stages that run none", async () => {
    const findings = await attempt("cdel:mode:orphan", {});
    expect(findings.map((f) => f.rule_id)).toContain(CDEL_RULE.modeIsRun);
    expect(findings.find((f) => f.rule_id === CDEL_RULE.modeIsRun)?.level).toBe("warning");

    // The three orchestrator-run stages legitimately declare no mode, and the
    // clean-build assertion above is what proves this rule stays quiet on them.
    const report = host.validateProject(WORKBOOK_ID, { minLevel: "warning" });
    const onStages = [...report.primitives]
      .flatMap((r) => r.findings)
      .filter((f) => f.rule_id === CDEL_RULE.modeIsRun && f.target_id.startsWith("lf:stage:"));
    expect(onStages).toEqual([]);
  });

  it("evaluates the rules rather than degrading them to info findings", async () => {
    const findings = await attempt("cdel:mode:reject-degraded", { git_allowed: true });
    const rule = findings.find((f) => f.rule_id === CDEL_RULE.noGitAuthority);
    expect(rule?.level).toBe("error");
    // A rule whose CEL fails to parse is emitted as an `info` finding carrying
    // `evidence.parse_error`, and stops blocking. That degradation is silent,
    // so it is asserted against explicitly.
    expect(rule?.evidence).not.toHaveProperty("parse_error");
  });
});

describe("the wrapper script and the mode records describe the same run", () => {
  const wrapper = readFileSync(resolve(REPO_ROOT, WRAPPER_PATH), "utf8");

  it("never offers a tier the profile rejects", () => {
    expect(wrapper).not.toContain("danger-full-access");
    expect(wrapper).not.toContain("--yolo");
    expect(wrapper).not.toContain("dangerously-bypass");
  });

  it("fails closed on an unknown config key", () => {
    expect(wrapper).toContain("--strict-config");
  });

  it("keeps scratch inside the repository", () => {
    expect(wrapper).not.toMatch(/\/tmp\//);
    expect(wrapper).toContain("_tmp/");
  });

  it("emits the sandbox tier each mode declares", () => {
    for (const mode of MODES) {
      expect(wrapper).toContain(`${mode.mode_name}) sandbox="${mode.sandbox_tier}"`);
    }
  });

  it("routes every return through the verification boundary before printing it", () => {
    expect(wrapper).toContain("codex-delegation/verify-return.ts");
    expect(wrapper.indexOf("codex exec")).toBeLessThan(wrapper.indexOf("verify-return.ts"));
    expect(delegationSeed().primitives.some((p) => p.type === CDEL.DelegationMode)).toBe(true);
  });

  it("forces approval_policy=never only alongside a sandbox tier", () => {
    expect(wrapper).toContain('approval_policy="never"');
    expect(wrapper).toContain('--sandbox "$sandbox"');
  });
});

describe("the verification boundary rejects what it exists to reject", () => {
  const repo = REPO_ROOT;
  const quiet: GitSnapshot = { head: "h", status_digest: "s", stash_list: "t", ref_list: "r" };
  const moved: GitSnapshot = { ...quiet, head: "h2" };

  const research = (over: Record<string, unknown> = {}): string =>
    JSON.stringify({
      answer: "The SDK is a facade over Host.",
      evidence: [{ path: "fdpm-cli/src/sdk.ts", line: 2, quote: " * @fdpm/cli SDK — thin programmatic facade over Host." }],
      confidence: 0.9,
      open_questions: [],
      unverified_claims: [],
      ...over,
    });

  const verify = (returnText: string, mode: "research" | "patch" | "write" = "research", after = quiet) =>
    verifyReturn({ mode, returnText, repoPath: repo, before: quiet, after });

  it("accepts a return whose every path and quote check out", () => {
    const result = verify(research());
    expect(result.failures).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("rejects prose, a code fence, and a truncated document", () => {
    expect(verify("Sure! Here is the answer.").ok).toBe(false);
    expect(verify("```json\n{}\n```").ok).toBe(false);
    const truncated = verify(research().slice(0, -12));
    expect(truncated.ok).toBe(false);
    expect(truncated.failures[0]?.error_class).toBe("ERR_TRUNCATION");
  });

  it("classifies a missing required key as an omission, not a shape error", () => {
    const partial = JSON.parse(research()) as Record<string, unknown>;
    delete partial["confidence"];
    const result = verify(JSON.stringify(partial));
    expect(result.ok).toBe(false);
    expect(result.failures[0]?.error_class).toBe("ERR_OMISSION");
  });

  it("rejects an invented path", () => {
    const result = verify(research({ evidence: [{ path: "fdpm-cli/src/sdk/exports.ts", line: 1, quote: "x" }] }));
    expect(result.ok).toBe(false);
    expect(result.failures.map((f) => f.check)).toContain("cdel.paths_exist");
    expect(result.failures[0]?.error_class).toBe("ERR_HALLUCINATION");
  });

  it("rejects a path that escapes the delegation repository", () => {
    for (const path of ["/etc/passwd", "../../../etc/passwd"]) {
      const result = verify(research({ evidence: [{ path, line: 1, quote: "root" }] }));
      expect(result.ok).toBe(false);
      expect(result.failures.map((f) => f.check)).toContain("cdel.paths_exist");
    }
  });

  it("rejects a quote that is a paraphrase of a real file", () => {
    const result = verify(
      research({ evidence: [{ path: "fdpm-cli/src/sdk.ts", line: 2, quote: "The SDK is a thin facade over the Host class." }] }),
    );
    expect(result.ok).toBe(false);
    expect(result.failures.map((f) => f.check)).toContain("cdel.quotes_match");
  });

  it("rejects a verbatim quote attributed to the wrong line", () => {
    const result = verify(
      research({ evidence: [{ path: "fdpm-cli/src/sdk.ts", line: 900, quote: " * @fdpm/cli SDK — thin programmatic facade over Host." }] }),
    );
    expect(result.ok).toBe(false);
    expect(result.failures.map((f) => f.check)).toContain("cdel.quotes_match");
  });

  it("rejects a diff that does not apply", () => {
    const bad = JSON.stringify({
      diff: "--- a/does/not/exist.ts\n+++ b/does/not/exist.ts\n@@ -1 +1 @@\n-old\n+new\n",
      target_files: ["fdpm-cli/src/sdk.ts"],
      explanation: "rename",
      verification_commands: [],
      applied: false,
    });
    const result = verify(bad, "patch");
    expect(result.ok).toBe(false);
    expect(result.failures.map((f) => f.check)).toContain("cdel.diff_applies");
  });

  it("rejects a run during which git moved, whatever the return claims", () => {
    const result = verifyReturn({ mode: "research", returnText: research(), repoPath: repo, before: quiet, after: moved });
    expect(result.ok).toBe(false);
    const gitFailure = result.failures.find((f) => f.check === "cdel.no_git_mutation");
    expect(gitFailure?.error_class).toBe("ERR_INSTRUCTION");
  });

  it("reports a git mutation even when the return never parsed", () => {
    const result = verifyReturn({ mode: "research", returnText: "not json", repoPath: repo, before: quiet, after: moved });
    expect(result.failures.map((f) => f.check)).toContain("cdel.no_git_mutation");
    expect(result.value).toBeUndefined();
  });

  it("expects the working tree to change in write mode, and only there", () => {
    const dirtied: GitSnapshot = { ...quiet, status_digest: "s2" };
    expect(checkNoGitMutation("write", quiet, dirtied)).toEqual([]);
    expect(checkNoGitMutation("research", quiet, dirtied)).not.toEqual([]);
  });

  it("reports every failure in one pass rather than only the first", () => {
    const result = verifyReturn({
      mode: "research",
      returnText: research({ evidence: [{ path: "nope.ts", line: 1, quote: "x" }] }),
      repoPath: repo,
      before: quiet,
      after: moved,
    });
    expect(result.failures.length).toBeGreaterThan(1);
  });
});

describe("grant sets", () => {
  it("keeps the orchestrator's git authority out of the subordinate's reach", () => {
    expect(ORCHESTRATOR_GRANTS.some((g) => g.tool_name.includes("git"))).toBe(true);
    expect(CODEX_GRANTS.some((g) => g.tool_name.includes("git"))).toBe(false);
    expect(CODEX_GRANTS.every((g) => g.authority === "read")).toBe(true);
  });
});
