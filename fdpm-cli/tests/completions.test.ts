import { describe, it, expect } from "vitest";
import {
  buildCompletionsCommand,
  renderRootAfterHelp,
  renderRootOnboarding,
} from "../src/commands/completions.js";

describe("root onboarding", () => {
  it("shows concise next-step guidance and examples", () => {
    const text = renderRootOnboarding();
    expect(text).toContain("FDPM — typed project graph CLI");
    expect(text).toContain("fdpm project list");
    expect(text).toContain("fdpm validate <project>");
    expect(text).toContain("fdpm completions <bash|zsh|fish|powershell>");
  });

  it("appends example-led help text for full help", () => {
    const text = renderRootAfterHelp();
    expect(text).toContain("Examples:");
    expect(text).toContain("fdpm render spec-render-dsl text/markdown --renderer-id spec:SpecMarkdownRenderer");
    expect(text).toContain("fdpm completions bash");
  });
});

describe("completions command", () => {
  it("renders a bash completion script with top-level commands", async () => {
    const cmd = buildCompletionsCommand();
    let stdout = "";
    const write = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
      return true;
    }) as typeof process.stdout.write;
    try {
      await cmd.parseAsync(["bash"], { from: "user" });
    } finally {
      process.stdout.write = write;
    }
    expect(stdout).toContain("complete -F _fdpm_completions fdpm");
    expect(stdout).toContain("project");
    expect(stdout).toContain("primitive");
    expect(stdout).toContain("--data-dir");
  });

  it("rejects unsupported shells", async () => {
    const cmd = buildCompletionsCommand();
    await expect(
      cmd.parseAsync(["tcsh"], { from: "user" }),
    ).rejects.toThrow(/unsupported shell/);
  });
});
