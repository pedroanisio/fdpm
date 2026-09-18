#!/usr/bin/env node
/**
 * Build the runtime image from this checkout, export its filesystem listing,
 * and evaluate it against the image allowlist in check-public-readiness.mjs.
 *
 *   node scripts/check-image-contents.mjs            # builds fdpm-mcp:check
 *   node scripts/check-image-contents.mjs <image>    # inspects an existing image
 *
 * Docker is required; the release workflow runs this on Linux.
 */
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateImageListing, formatFinding } from "./check-public-readiness.mjs";

const CLI_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const image = process.argv[2] ?? "fdpm-mcp:check";

function docker(args, options = {}) {
  return execFileSync("docker", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "inherit"], ...options });
}

if (process.argv[2] === undefined) {
  docker(["build", "-q", "-f", "Dockerfile", "-t", image, "."], { cwd: CLI_ROOT });
}
const container = docker(["create", image]).trim();
let listing;
try {
  const tar = execFileSync("sh", ["-c", `docker export ${container} | tar -t`], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  listing = tar.split("\n").map((line) => line.trim()).filter(Boolean);
} finally {
  docker(["rm", "-f", container]);
}
const findings = evaluateImageListing(listing).map(formatFinding);
if (findings.length > 0) {
  process.stderr.write(`Image-content check failed (${findings.length} finding(s)):\n`);
  for (const finding of findings) process.stderr.write(`- ${finding}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Image-content check passed (${listing.length} entries).\n`);
}
