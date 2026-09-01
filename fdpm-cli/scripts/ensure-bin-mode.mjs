import { chmodSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const CLI_BINARIES = [
  "dist/src/bin/fdpm.js",
  "dist/src/bin/fdpm-mcp.js",
  "dist/src/bin/fdpm-mcp-http.js",
];

/**
 * npm creates `.cmd` and PowerShell shims for package bins on Windows, where
 * POSIX executable mode bits do not exist. Unix package archives still need
 * the compiled entry points marked executable for direct invocation.
 */
export function ensureBinMode(paths = CLI_BINARIES) {
  for (const path of paths) chmodSync(path, 0o755);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href &&
  process.platform !== "win32"
) {
  ensureBinMode();
}
