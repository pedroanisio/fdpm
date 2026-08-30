import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, win32 } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const CLI_ROOT = resolve(dirname(SCRIPT_PATH), "..");
const MAX_BUFFER = 64 * 1024 * 1024;
const WINDOWS_INVALID_COMPONENT = /[<>:"\\|?*\u0000-\u001f]/u;
const WINDOWS_RESERVED_COMPONENT =
  /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;

/** Run npm through npm-cli.js so Windows does not need a shell for npm.cmd. */
export function npmInvocation(
  args,
  npmExecPath = process.env["npm_execpath"] ?? "",
  nodePath = process.execPath,
) {
  if (npmExecPath === "") {
    throw new Error(
      "npm_execpath is unavailable; run this smoke test through `npm run smoke:pack`.",
    );
  }
  return { command: nodePath, args: [npmExecPath, ...args] };
}

/** Path to the executable shim npm creates for a package bin. */
export function binShimPath(consumerDir, name, platform = process.platform) {
  const joinPath = platform === "win32" ? win32.join : join;
  return joinPath(
    consumerDir,
    "node_modules",
    ".bin",
    platform === "win32" ? `${name}.cmd` : name,
  );
}

/**
 * Build a spawn invocation for an npm-generated bin shim.
 *
 * POSIX shims are executable files. Windows `.cmd` shims must be launched by
 * cmd.exe; the smoke test uses only fixed, shell-safe arguments.
 */
export function binShimInvocation(
  shimPath,
  args,
  {
    platform = process.platform,
    comspec = process.env["ComSpec"] ?? process.env["COMSPEC"] ?? "cmd.exe",
  } = {},
) {
  if (platform !== "win32") return { command: shimPath, args: [...args] };
  if (shimPath.includes('"') || args.some((arg) => !/^[A-Za-z0-9._:=/-]+$/u.test(arg))) {
    throw new Error("Windows packed-install smoke arguments must be shell-safe.");
  }
  return {
    command: comspec,
    args: ["/d", "/s", "/c", `"${shimPath}" ${args.join(" ")}`],
  };
}

function commandFailure(label, result, expectedStatus) {
  const detail = [
    `${label} exited with ${String(result.status)} (expected ${String(expectedStatus)}).`,
    result.error ? `error: ${result.error.message}` : "",
    result.stdout ? `stdout:\n${result.stdout.trimEnd()}` : "",
    result.stderr ? `stderr:\n${result.stderr.trimEnd()}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return new Error(detail);
}

function runInvocation(label, invocation, options, expectedStatus = 0) {
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    maxBuffer: MAX_BUFFER,
    windowsHide: true,
  });
  if (result.error || result.status !== expectedStatus) {
    throw commandFailure(label, result, expectedStatus);
  }
  return result;
}

function runNpm(label, args, options) {
  return runInvocation(label, npmInvocation(args), options);
}

/**
 * Validate the exact file list npm intends to publish.
 *
 * npm can build and install a package successfully on one host while the
 * tarball still contains a path that another host cannot materialize. Check
 * the strictest common constraints here so every CI runner proves that both
 * workspace tarballs are extractable on default Windows and macOS filesystems.
 */
export function assertPortablePackReport(label, report) {
  const packageReport = Array.isArray(report) ? report[0] : undefined;
  if (!packageReport || typeof packageReport !== "object") {
    throw new Error(`${label} did not report a package.`);
  }
  if (typeof packageReport.filename !== "string" || packageReport.filename === "") {
    throw new Error(`${label} did not report a tarball filename.`);
  }
  if (!Array.isArray(packageReport.files) || packageReport.files.length === 0) {
    throw new Error(`${label} did not report any packaged files.`);
  }

  const portablePaths = new Map();
  for (const file of packageReport.files) {
    const path = file?.path;
    if (typeof path !== "string" || path === "") {
      throw new Error(`${label} reported a packaged file without a path.`);
    }
    if (path.startsWith("/") || path.endsWith("/")) {
      throw new Error(`${label} reported a non-relative packaged path: ${path}`);
    }

    const components = path.split("/");
    for (const component of components) {
      if (component === "" || component === "." || component === "..") {
        throw new Error(`${label} reported a non-canonical packaged path: ${path}`);
      }
      if (
        WINDOWS_INVALID_COMPONENT.test(component) ||
        WINDOWS_RESERVED_COMPONENT.test(component) ||
        /[ .]$/u.test(component)
      ) {
        throw new Error(`${label} reported a Windows-incompatible packaged path: ${path}`);
      }
      if (component.length > 255 || Buffer.byteLength(component, "utf8") > 255) {
        throw new Error(`${label} reported an overlong packaged path component: ${path}`);
      }
    }

    // Default Windows filesystems fold case; default macOS filesystems also
    // fold case and normalize Unicode. NFD catches canonically equivalent
    // composed/decomposed spellings while keeping the check deterministic.
    const portableKey = path.normalize("NFD").toLowerCase();
    const previous = portablePaths.get(portableKey);
    if (previous !== undefined && previous !== path) {
      throw new Error(
        `${label} reported colliding packaged paths on macOS/Windows: ${previous} and ${path}`,
      );
    }
    portablePaths.set(portableKey, path);
  }

  return { filename: packageReport.filename, fileCount: packageReport.files.length };
}

function packedTarball(label, args, options, packDir) {
  const result = runNpm(label, args, options);
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`${label} did not emit valid npm pack JSON.`, { cause: error });
  }
  const { filename } = assertPortablePackReport(label, report);
  return join(packDir, filename);
}

function assertVersionOutput(stdout, expectedVersion) {
  let version;
  try {
    version = JSON.parse(stdout);
  } catch (error) {
    throw new Error("the installed fdpm shim did not emit valid JSON.", { cause: error });
  }
  if (version.host !== "fdpm-cli" || version.host_version !== expectedVersion) {
    throw new Error(
      `the installed fdpm shim reported ${JSON.stringify(version)}; expected fdpm-cli ${expectedVersion}.`,
    );
  }
}

export function runPackedInstallSmoke({ cliRoot = CLI_ROOT } = {}) {
  const tempRoot = mkdtempSync(join(tmpdir(), "fdpm-packed-install-"));
  const packDir = join(tempRoot, "packs");
  const consumerDir = join(tempRoot, "consumer");
  const npmCache = join(tempRoot, "npm-cache");
  const dataDir = join(tempRoot, "fdpm-data");
  const registryPath = join(tempRoot, "fdpm-state", "workspaces.json");
  mkdirSync(packDir, { recursive: true });
  mkdirSync(consumerDir, { recursive: true });
  writeFileSync(
    join(consumerDir, "package.json"),
    `${JSON.stringify({ name: "fdpm-packed-install-smoke", private: true }, null, 2)}\n`,
  );

  const env = {
    ...process.env,
    npm_config_cache: npmCache,
    npm_config_update_notifier: "false",
  };
  const options = { cwd: cliRoot, env };

  try {
    const bridgeTarball = packedTarball(
      "pack @fdpm/zod-bridge",
      [
        "pack",
        "--json",
        "--pack-destination",
        packDir,
        "--workspace",
        "@fdpm/zod-bridge",
      ],
      options,
      packDir,
    );
    const cliTarball = packedTarball(
      "pack @fdpm/cli",
      ["pack", "--json", "--pack-destination", packDir],
      options,
      packDir,
    );

    runNpm(
      "install packed workspaces",
      [
        "install",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--package-lock=false",
        "--prefer-offline",
        bridgeTarball,
        cliTarball,
      ],
      { cwd: consumerDir, env },
    );

    const cliShim = binShimPath(consumerDir, "fdpm");
    const mcpShim = binShimPath(consumerDir, "fdpm-mcp");
    for (const shim of [cliShim, mcpShim]) {
      if (!existsSync(shim)) throw new Error(`npm did not create expected command shim: ${shim}`);
    }

    const runtimeEnv = {
      ...process.env,
      FDPM_DATA_DIR: dataDir,
      FDPM_NO_PLUGINS: "1",
      FDPM_REGISTRY_PATH: registryPath,
    };
    const cliResult = runInvocation(
      "installed fdpm shim",
      binShimInvocation(cliShim, ["version", "--json"]),
      { cwd: consumerDir, env: runtimeEnv },
    );
    const expectedVersion = JSON.parse(
      readFileSync(join(cliRoot, "package.json"), "utf8"),
    ).version;
    assertVersionOutput(cliResult.stdout, expectedVersion);

    const mcpResult = runInvocation(
      "installed fdpm-mcp shim",
      binShimInvocation(mcpShim, ["--http-port=0"]),
      { cwd: consumerDir, env: runtimeEnv },
      2,
    );
    if (!mcpResult.stderr.includes("HTTP transport is not supported")) {
      throw new Error("the installed fdpm-mcp shim did not reach its transport refusal path.");
    }

    return { cliVersion: expectedVersion };
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = runPackedInstallSmoke();
    process.stdout.write(
      `packed-install smoke passed: fdpm ${result.cliVersion}; fdpm-mcp refusal path\n`,
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
