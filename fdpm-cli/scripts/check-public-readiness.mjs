#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readlinkSync,
} from "node:fs";
import { dirname, extname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = resolve(SCRIPT_DIR, "..", "..");

const REQUIRED_PUBLIC_FILES = [
  "README.md",
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  "SECURITY.md",
  "SUPPORT.md",
  "GOVERNANCE.md",
  "RELEASING.md",
  "LICENSE",
  ".github/PULL_REQUEST_TEMPLATE.md",
  ".github/ISSUE_TEMPLATE/bug.yml",
  ".github/ISSUE_TEMPLATE/feature.yml",
  ".github/ISSUE_TEMPLATE/config.yml",
  ".github/workflows/ci.yml",
  ".github/workflows/codeql.yml",
  ".github/workflows/release.yml",
  ".github/dependabot.yml",
  "fdpm-cli/README.md",
  "fdpm-cli/LICENSE",
  "fdpm-cli/packages/zod-bridge/README.md",
  "fdpm-cli/packages/zod-bridge/LICENSE",
];

const PACKAGE_MANIFESTS = [
  "fdpm-cli/package.json",
  "fdpm-cli/packages/zod-bridge/package.json",
];

const BINARY_EXTENSIONS = new Set([
  ".avif",
  ".bmp",
  ".gif",
  ".gz",
  ".ico",
  ".jpeg",
  ".jpg",
  ".pdf",
  ".png",
  ".ttf",
  ".webp",
  ".woff",
  ".woff2",
  ".zip",
]);

const SECRET_PATTERNS = [
  ["AWS access key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/],
  ["npm token", /\bnpm_[A-Za-z0-9]{20,}\b/],
  ["OpenAI API key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/],
  ["Anthropic API key", /\bsk-ant-[A-Za-z0-9_-]{20,}\b/],
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["npm auth token", /_authToken\s*=\s*(?!\$\{|your-|example|replace-me|<)[^\s#]+/i],
];

const PLACEHOLDER_PATTERN = /(?:your[-_ ]|example|placeholder|replace[-_ ]me|<[^>]+>|\$\{[^}]+\})/i;

/**
 * Validate the metadata that npm and a package consumer see.
 *
 * The checker deliberately rejects local protocols even when npm accepts the
 * manifest: `file:` can produce a superficially successful install with an
 * invalid, empty dependency directory when the referenced workspace is not in
 * the tarball.
 */
export function evaluatePackageManifest(packagePath, manifest) {
  const findings = [];
  const label = `${packagePath}:`;

  for (const field of ["name", "version", "description", "author", "homepage"]) {
    if (typeof manifest[field] !== "string" || manifest[field].trim() === "") {
      findings.push(`${label} missing public metadata field ${field}`);
    }
  }

  const license = manifest.license;
  if (
    typeof license !== "string" ||
    license.trim() === "" ||
    /^(?:UNLICENSED|Proprietary|SEE LICENSE IN)/i.test(license)
  ) {
    findings.push(`${label} missing an open-source SPDX license expression`);
  }

  if (
    manifest.private === true ||
    manifest.publishConfig?.access !== "public"
  ) {
    findings.push(`${label} scoped package is not configured for public publication`);
  }
  if (manifest.publishConfig?.provenance !== true) {
    findings.push(`${label} publishConfig.provenance must be true`);
  }
  if (
    manifest.repository?.type !== "git" ||
    typeof manifest.repository?.url !== "string" ||
    !manifest.repository.url.includes("github.com/pedroanisio/fdpm-cli")
  ) {
    findings.push(`${label} repository metadata does not identify the canonical GitHub repository`);
  }
  if (
    typeof manifest.bugs?.url !== "string" ||
    !manifest.bugs.url.endsWith("/pedroanisio/fdpm-cli/issues")
  ) {
    findings.push(`${label} bugs.url does not identify the public issue tracker`);
  }
  if (typeof manifest.engines?.node !== "string") {
    findings.push(`${label} engines.node is missing`);
  }
  if (!Array.isArray(manifest.keywords) || manifest.keywords.length < 3) {
    findings.push(`${label} needs at least three discovery keywords`);
  }

  const shippedFiles = new Set(Array.isArray(manifest.files) ? manifest.files : []);
  for (const required of ["dist", "README.md", "LICENSE"]) {
    if (!shippedFiles.has(required)) {
      findings.push(`${label} files does not include ${required}`);
    }
  }

  for (const group of [
    ["dependencies", manifest.dependencies],
    ["optionalDependencies", manifest.optionalDependencies],
    ["peerDependencies", manifest.peerDependencies],
  ]) {
    const [groupName, dependencies] = group;
    if (!dependencies || typeof dependencies !== "object") continue;
    for (const [name, range] of Object.entries(dependencies)) {
      if (typeof range === "string" && /^(?:file|link|workspace):/.test(range)) {
        findings.push(`${label} ${groupName}.${name} uses local-only dependency ${range}`);
      }
    }
  }

  return findings;
}

/** Validate paths and symlinks that Git will publish. */
export function evaluateTrackedEntries(entries) {
  const findings = [];
  for (const entry of entries) {
    if (
      /(^|\/)(?:node_modules|_tmp|__pycache__|\.playwright-mcp)(\/|$)/.test(entry.path) ||
      /(^|\/)\.DS_Store$/.test(entry.path) ||
      /\.(?:pyc|pyo)$/.test(entry.path) ||
      entry.path.endsWith("/.claude/settings.local.json") ||
      entry.path === ".claude/settings.local.json"
    ) {
      findings.push(`tracked local artifact: ${entry.path}`);
    }

    if (
      entry.path.includes("/.github/workflows/") &&
      !entry.path.startsWith(".github/workflows/")
    ) {
      findings.push(`GitHub workflow must live at the repository root: ${entry.path}`);
    }

    if (
      entry.mode === "120000" &&
      typeof entry.symlinkTarget === "string" &&
      (isAbsolute(entry.symlinkTarget) || /^[A-Za-z]:[\\/]/.test(entry.symlinkTarget))
    ) {
      findings.push(`tracked absolute symlink: ${entry.path} -> ${entry.symlinkTarget}`);
    }
  }
  return findings;
}

/** Return credential-shaped lines for a UTF-8 text file. */
export function findSecretCandidates(path, text) {
  const findings = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (PLACEHOLDER_PATTERN.test(line)) continue;
    for (const [kind, pattern] of SECRET_PATTERNS) {
      if (pattern.test(line)) {
        findings.push({ path, line: index + 1, kind });
      }
    }
  }
  return findings;
}

/** Keep the npm package version and the runtime's advertised host version one value. */
export function evaluateVersionAlignment(manifest, versionSource) {
  const match = /export const HOST_VERSION = "([^"]+)"/.exec(versionSource);
  if (!match) return ["fdpm-cli/src/core/version/spec.ts: HOST_VERSION could not be read"];
  if (manifest.version !== match[1]) {
    return [
      `fdpm-cli/package.json version ${String(manifest.version)} does not match HOST_VERSION ${match[1]}`,
    ];
  }
  return [];
}

/** Ensure checks rebuild the package before conformance tests execute dist bins. */
export function evaluateCheckScript(manifest) {
  const check = manifest.scripts?.check;
  if (typeof check !== "string") {
    return ["fdpm-cli/package.json scripts.check is missing"];
  }

  const steps = check.split("&&").map((step) => step.trim());
  const buildIndex = steps.indexOf("npm run build");
  const testIndex = steps.indexOf("npm test");
  if (buildIndex === -1 || testIndex === -1 || buildIndex > testIndex) {
    return ["fdpm-cli/package.json scripts.check must build before npm test"];
  }
  return [];
}

function git(repoRoot, args, options = {}) {
  return execFileSync("git", ["-C", repoRoot, ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
}

function trackedEntries(repoRoot) {
  const records = git(repoRoot, ["ls-files", "-s", "-z"])
    .split("\0")
    .filter(Boolean);

  return records.map((record) => {
    const match = /^(\d+) ([0-9a-f]+) \d+\t([\s\S]+)$/.exec(record);
    if (!match) throw new Error(`cannot parse git index entry: ${record}`);
    const [, mode, , path] = match;
    const absolutePath = join(repoRoot, path);
    try {
      lstatSync(absolutePath);
    } catch {
      // A tracked path deleted in the working tree is not part of the
      // candidate release. CI runs this check from a clean checkout, so this
      // accommodation only makes the local pre-commit gate describe the tree
      // the operator is preparing to stage.
      return null;
    }
    const entry = { mode, path };
    if (mode === "120000") {
      entry.symlinkTarget = readlinkSync(absolutePath);
    }
    return entry;
  }).filter(Boolean);
}

function filesToScan(repoRoot) {
  return git(repoRoot, ["ls-files", "-co", "--exclude-standard", "-z"])
    .split("\0")
    .filter(Boolean)
    .sort();
}

function scanRepositorySecrets(repoRoot) {
  const findings = [];
  for (const path of filesToScan(repoRoot)) {
    if (BINARY_EXTENSIONS.has(extname(path).toLowerCase())) continue;
    const absolutePath = join(repoRoot, path);
    if (!existsSync(absolutePath)) continue;
    const stat = lstatSync(absolutePath);
    if (!stat.isFile() || stat.size > 1024 * 1024) continue;
    const buffer = readFileSync(absolutePath);
    if (buffer.includes(0)) continue;
    findings.push(...findSecretCandidates(path, buffer.toString("utf8")));
  }
  return findings;
}

export function checkRepository(repoRoot = DEFAULT_REPO_ROOT) {
  const findings = [];

  for (const path of REQUIRED_PUBLIC_FILES) {
    if (!existsSync(join(repoRoot, path))) findings.push(`missing required public file: ${path}`);
  }

  for (const packagePath of PACKAGE_MANIFESTS) {
    const absolutePath = join(repoRoot, packagePath);
    if (!existsSync(absolutePath)) {
      findings.push(`missing package manifest: ${packagePath}`);
      continue;
    }
    const manifest = JSON.parse(readFileSync(absolutePath, "utf8"));
    findings.push(...evaluatePackageManifest(packagePath, manifest));
  }

  const cliPackage = JSON.parse(readFileSync(join(repoRoot, "fdpm-cli/package.json"), "utf8"));
  findings.push(
    ...evaluateVersionAlignment(
      cliPackage,
      readFileSync(join(repoRoot, "fdpm-cli/src/core/version/spec.ts"), "utf8"),
    ),
  );
  findings.push(...evaluateCheckScript(cliPackage));
  if (!Array.isArray(cliPackage.workspaces) || !cliPackage.workspaces.includes("packages/zod-bridge")) {
    findings.push("fdpm-cli/package.json: packages/zod-bridge is not declared as an npm workspace");
  }
  if (existsSync(join(repoRoot, "fdpm-cli/pnpm-lock.yaml"))) {
    findings.push("fdpm-cli/pnpm-lock.yaml: remove the stale secondary lockfile; npm/package-lock.json is canonical");
  }

  findings.push(...evaluateTrackedEntries(trackedEntries(repoRoot)));

  const licensePaths = [
    "LICENSE",
    "fdpm-cli/LICENSE",
    "fdpm-cli/packages/zod-bridge/LICENSE",
  ];
  if (licensePaths.every((path) => existsSync(join(repoRoot, path)))) {
    const [canonical, ...copies] = licensePaths.map((path) => readFileSync(join(repoRoot, path), "utf8"));
    for (let index = 0; index < copies.length; index += 1) {
      if (copies[index] !== canonical) {
        findings.push(`${licensePaths[index + 1]} differs from the root LICENSE`);
      }
    }
  }

  for (const candidate of scanRepositorySecrets(repoRoot)) {
    findings.push(`possible ${candidate.kind}: ${candidate.path}:${candidate.line}`);
  }

  return [...new Set(findings)].sort();
}

function main() {
  const findings = checkRepository();
  if (findings.length > 0) {
    process.stderr.write(`Public-readiness check failed (${findings.length} finding(s)):\n`);
    for (const finding of findings) process.stderr.write(`- ${finding}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write("Public-readiness check passed.\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
