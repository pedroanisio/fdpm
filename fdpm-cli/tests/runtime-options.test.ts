import { describe, expect, it } from "vitest";
import { FDPMException } from "../src/core/errors/fdpm-exception.js";
import { resolveOneShotCliRuntimeOptions } from "../src/bin/runtime-options.js";

describe("resolveOneShotCliRuntimeOptions", () => {
  it("defaults one-shot CLI invocations to warn when no env or flags are set", () => {
    const out = resolveOneShotCliRuntimeOptions(["workbook", "list"], {});
    expect(out.logLevelOverride).toBe("warn");
  });

  it("does not override an explicit FDPM_LOG_LEVEL from the environment", () => {
    const out = resolveOneShotCliRuntimeOptions(["workbook", "list"], {
      FDPM_LOG_LEVEL: "info",
    });
    expect(out.logLevelOverride).toBeUndefined();
  });

  it("maps --quiet to silent", () => {
    const out = resolveOneShotCliRuntimeOptions(["--quiet", "workbook", "list"], {});
    expect(out.logLevelOverride).toBe("silent");
  });

  it("maps --verbose to info", () => {
    const out = resolveOneShotCliRuntimeOptions(["--verbose", "workbook", "list"], {});
    expect(out.logLevelOverride).toBe("info");
  });

  it("lets --log-level override the environment", () => {
    const out = resolveOneShotCliRuntimeOptions(
      ["--log-level", "error", "workbook", "list"],
      { FDPM_LOG_LEVEL: "debug" },
    );
    expect(out.logLevelOverride).toBe("error");
  });

  it("rejects invalid --log-level values", () => {
    expect(() =>
      resolveOneShotCliRuntimeOptions(["--log-level", "loud", "workbook", "list"], {}),
    ).toThrowError(FDPMException);
  });

  it("rejects conflicting quiet and verbose flags", () => {
    expect(() =>
      resolveOneShotCliRuntimeOptions(["--quiet", "--verbose", "workbook", "list"], {}),
    ).toThrowError("--quiet conflicts with --verbose");
  });
});
