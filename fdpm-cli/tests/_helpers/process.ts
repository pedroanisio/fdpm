import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/**
 * Invoke tsx through the current Node executable. This avoids `.bin/tsx`
 * shebangs on POSIX and `.cmd` shim lookup on Windows.
 */
export const NODE_COMMAND = process.execPath;
export const TSX_CLI = require.resolve("tsx/cli");

export function tsxArgs(args: readonly string[]): string[] {
  return [TSX_CLI, ...args];
}
