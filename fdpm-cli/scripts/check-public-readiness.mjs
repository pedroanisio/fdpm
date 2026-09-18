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

/** The one repository every manifest, README and link must name. */
export const CANONICAL_REPOSITORY = "pedroanisio/fdpm";
const CANONICAL_GIT_URL = `git+https://github.com/${CANONICAL_REPOSITORY}.git`;
const CANONICAL_ISSUES_URL = `https://github.com/${CANONICAL_REPOSITORY}/issues`;

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
    manifest.repository?.url !== CANONICAL_GIT_URL
  ) {
    findings.push(`${label} repository.url must be ${CANONICAL_GIT_URL}`);
  }
  if (manifest.bugs?.url !== CANONICAL_ISSUES_URL) {
    findings.push(`${label} bugs.url must be ${CANONICAL_ISSUES_URL}`);
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

// ── Information discipline ───────────────────────────────────────────────────
//
// The release tree carries production assets and professional documentation
// only. Working material — plans, prompts, agent instructions, findings,
// execution logs, session narrative — lives outside the repository and must
// not be cited from it. These evaluators are deterministic; a paragraph that
// narrates a session in neutral words is caught by review, not here.

/** Directories whose contents are working material by definition. */
const WORKING_PATH_PATTERN =
  /^(?:\.agent-tasks|_tmp|_ingest_bin|fdpm-cli\/_tmp|fdpm-cli\/research|docs\/hygiene\/(?:doc-hygiene-report|quarantine)|docs\/(?:goal-|journals\/|reviews\/|drafts\/)|static\/refs\/|static\/proofs\/)/;

/** Files that define the scratch policy and therefore name the directories. */
const POLICY_FILES = new Set([
  ".gitignore",
  ".dockerignore",
  "fdpm-cli/.dockerignore",
  "CLAUDE.md",
  "CONTRIBUTING.md",
  "fdpm-cli/.information-discipline.allow",
]);

/** The checker and its tests carry every forbidden shape as a fixture. */
const SELF_FILES = new Set([
  "fdpm-cli/scripts/check-public-readiness.mjs",
  "fdpm-cli/tests/_meta/public-readiness.test.mjs",
  "fdpm-cli/scripts/git-hooks/pre-commit",
  "fdpm-cli/scripts/git-hooks/commit-msg",
]);

/** Home directories that are synthetic by convention; fixtures and examples use them. */
const NEUTRAL_USERS = new Set(["alice", "bob", "ada", "example", "user", "operator"]);

const ABSOLUTE_PATH_PATTERN =
  /(?:^|[^A-Za-z0-9_])(?:\/home\/([a-z][a-z0-9_-]*)|\/Users\/([A-Za-z][A-Za-z0-9_-]*)|[A-Za-z]:\\+Users\\+([A-Za-z][A-Za-z0-9_-]*)|(\/mnt\/transcripts)|(\/tmp\/claude))/g;
const SCRATCH_CITATION_PATTERN = /(?:^|[^A-Za-z0-9_./])(?:_tmp\/|fdpm-cli\/research\/)/;
/** A command that WRITES scratch (`-o _tmp/x`, `FDPM_DATA_DIR=_tmp/x`, `rm -rf _tmp/x`) is an instruction, not a citation. */
const SCRATCH_WRITE_PATTERN = /(?:^|\s)(?:-o|--output|--out|FDPM_DATA_DIR=|rm -rf|mkdir -p)\s*_tmp\//;
const COORDINATION_PATTERN = /task-1[0-9]{12}-[0-9a-f]{4}|agent-(?:claude|codex|root)-[a-z0-9]|\.agent-tasks/;
const NARRATIVE_PATTERN =
  /\b(?:this|prior|previous|next) session's\b|\b(?:prior|previous|next) session\b|\bin this conversation\b|\bhandoff summary\b|\bprevious agent\b|\blessons learned\b|\/mnt\/transcripts/i;
/** Shapes of the private memory store and private infrastructure that must never be cited. */
const PRIVATE_ENDPOINT_PATTERN = /sslip\.io|repo-work|registry\.digitalocean\.com\//;
const COMMENT_LINE_PATTERN = /^\s*(?:\/\/|\/\*|\*|#(?!!))/;
const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown"]);

function markdownBodyStart(lines) {
  if (lines[0]?.trim() !== "---") return 0;
  for (let index = 1; index < Math.min(lines.length, 60); index += 1) {
    if (lines[index].trim() === "---") return index + 1;
  }
  return 0;
}

function neutral(match) {
  const user = match[1] ?? match[2] ?? match[3];
  return typeof user === "string" && NEUTRAL_USERS.has(user.toLowerCase());
}

function allowed(entries, ruleId, path, line) {
  return entries.some(
    (entry) => entry.rule === ruleId && entry.path === path && (entry.line === null || entry.line === line),
  );
}

/**
 * Parse `.information-discipline.allow`: one exception per line,
 * `<rule-id> <path>[:<line>] <expires YYYY-MM-DD|never> <reason>`.
 * An expired entry is an error, not a silent pass; so is one with no reason.
 */
export function parseAllowlist(text, today) {
  const entries = [];
  const errors = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) return;
    const parts = line.split(/\s+/);
    const [rule, target, expires, ...reason] = parts;
    if (parts.length < 4 || !/^id\.[a-z-]+$/.test(rule ?? "")) {
      errors.push(`.information-discipline.allow:${index + 1}: expected "<rule-id> <path>[:<line>] <expires|never> <reason>"`);
      return;
    }
    if (expires !== "never" && !/^\d{4}-\d{2}-\d{2}$/.test(expires)) {
      errors.push(`.information-discipline.allow:${index + 1}: expiry must be YYYY-MM-DD or never`);
      return;
    }
    if (expires !== "never" && expires < today) {
      errors.push(`.information-discipline.allow:${index + 1}: exception for ${target} expired on ${expires}`);
      return;
    }
    const lineMatch = /^(.*):(\d+)$/.exec(target);
    entries.push({
      rule,
      path: lineMatch ? lineMatch[1] : target,
      line: lineMatch ? Number(lineMatch[2]) : null,
      expires,
      reason: reason.join(" "),
    });
  });
  return { entries, errors };
}

/** Tracked paths that are working material by location. */
export function evaluateWorkingPaths(entries) {
  return entries
    .filter((entry) => WORKING_PATH_PATTERN.test(entry.path))
    .map((entry) => ({
      rule: "id.tracked-working-dir",
      path: entry.path,
      line: null,
      excerpt: "",
      fix: "relocate to the local work directory; the release tree carries no plans, prompts, session records or run logs",
    }));
}

/**
 * Line-level rules over one text file. Which rules apply depends on the file
 * class: absolute paths, coordination identifiers and private endpoints are
 * checked on every line; scratch citations on prose and on source comments;
 * session narrative on Markdown bodies only, because "session" is an
 * ordinary noun in an MCP server.
 */
export function evaluateTextDiscipline(path, text, allowEntries = []) {
  if (SELF_FILES.has(path)) return [];
  const findings = [];
  const isMarkdown = MARKDOWN_EXTENSIONS.has(extname(path).toLowerCase());
  const isPolicy = POLICY_FILES.has(path);
  const lines = text.split(/\r?\n/);
  const bodyStart = isMarkdown ? markdownBodyStart(lines) : 0;
  const push = (ruleId, line, excerpt, fix) => {
    if (allowed(allowEntries, ruleId, path, line)) return;
    findings.push({ rule: ruleId, path, line, excerpt: excerpt.trim().slice(0, 80), fix });
  };

  lines.forEach((content, index) => {
    const line = index + 1;
    for (const match of content.matchAll(ABSOLUTE_PATH_PATTERN)) {
      if (neutral(match)) continue;
      push("id.absolute-local-path", line, content, "use a repository-relative path, a URL, or a neutral home such as /home/alice");
      break;
    }
    if (!isPolicy && COORDINATION_PATTERN.test(content)) {
      push("id.coordination-identifier", line, content, "coordination state belongs to the local work directory; describe the fact, not the task");
    }
    if (PRIVATE_ENDPOINT_PATTERN.test(content)) {
      push("id.private-endpoint", line, content, "never cite the private memory store or private infrastructure; state the fact it established");
    }
    if (!isPolicy && (isMarkdown || COMMENT_LINE_PATTERN.test(content)) && SCRATCH_CITATION_PATTERN.test(content) && !SCRATCH_WRITE_PATTERN.test(content)) {
      push("id.scratch-citation", line, content, "a reader cannot open _tmp/ or research/; name a tracked path, a data-dir path, or state the fact");
    }
    if (!isPolicy && isMarkdown && index >= bodyStart && NARRATIVE_PATTERN.test(content)) {
      push("id.session-narrative", line, content, "distil the session into a fact, a decision or a gotcha; drop the narrative");
    }
  });
  return findings;
}

/** Everything `npm pack` may ship. */
const PACKED_ALLOW = [
  /^(?:package\.json|README\.md|LICENSE)$/,
  /^dist\/src\/(?!eval\/).+\.(?:js|js\.map|d\.ts|d\.ts\.map)$/,
  /^dist\/plugins\/(?!.*\/tests?\/)[^/]+\/.+\.(?:js|js\.map|d\.ts|d\.ts\.map|json)$/,
  /^dist\/plugins\/[^/]+\/(?:README|GENERATOR|EDUCATION)\.md$/,
];

export function evaluatePackedFiles(paths) {
  return paths
    .filter((path) => !PACKED_ALLOW.some((pattern) => pattern.test(path)))
    .map((path) => ({
      rule: "id.package-file-allowlist",
      path,
      line: null,
      excerpt: "",
      fix: "exclude it from the tarball (package.json files) or move it out of the plugin directory",
    }));
}

/** Paths that must not exist in the runtime image (as `tar -t` prints them, with or without a leading ./). */
const IMAGE_DENY =
  /^(?:\.\/)?app\/(?:research\/|coverage\/|_tmp\/|\.git\/|\.env(?:\.|$)|dist\/src\/eval\/|plugins\/[^/]+\/SCHEMA-SCORECARD\.md$|plugins\/[^/]+\/(?:tests?|scripts)\/)/;

export function evaluateImageListing(paths) {
  return paths
    .filter((path) => IMAGE_DENY.test(path))
    .map((path) => ({
      rule: "id.image-file-allowlist",
      path,
      line: null,
      excerpt: "",
      fix: "extend .dockerignore or remove the file after the build stage",
    }));
}

/** README and the manifests name one repository. */
export function evaluateIdentityConsistency({ readme, manifests }) {
  const findings = [];
  const canonicalLink = `https://github.com/${CANONICAL_REPOSITORY}`;
  if (!readme.includes(canonicalLink) || /pedroanisio\/fdpm-cli\b/.test(readme)) {
    findings.push({ rule: "id.identity-consistent", path: "README.md", line: null, excerpt: "", fix: `link the repository as ${canonicalLink}` });
  }
  for (const [path, manifest] of Object.entries(manifests)) {
    if (manifest?.repository?.url !== CANONICAL_GIT_URL || manifest?.bugs?.url !== CANONICAL_ISSUES_URL) {
      findings.push({ rule: "id.identity-consistent", path, line: null, excerpt: "", fix: `repository.url ${CANONICAL_GIT_URL}, bugs.url ${CANONICAL_ISSUES_URL}` });
    }
  }
  return findings;
}

/** A commit message is a tracked document too. */
export function evaluateCommitMessage(message) {
  const findings = [];
  // One finding per line: the first rule that matches names the defect.
  message.split(/\r?\n/).forEach((content, index) => {
    const local = [...content.matchAll(ABSOLUTE_PATH_PATTERN)].some((match) => !neutral(match));
    if (local) {
      findings.push({ rule: "id.absolute-local-path", path: "commit message", line: index + 1, excerpt: content.trim().slice(0, 80), fix: "describe the change, not where the working material lives" });
    } else if (COORDINATION_PATTERN.test(content) || PRIVATE_ENDPOINT_PATTERN.test(content) || /(?:^|[^A-Za-z0-9_./])_tmp\//.test(content)) {
      findings.push({ rule: "id.coordination-identifier", path: "commit message", line: index + 1, excerpt: content.trim().slice(0, 80), fix: "no task ids, agent ids, scratch paths or private endpoints in commit messages" });
    }
  });
  return findings;
}

export function formatFinding(finding) {
  const where = finding.line === null ? finding.path : `${finding.path}:${finding.line}`;
  const excerpt = finding.excerpt ? ` — ${finding.excerpt}` : "";
  return `${finding.rule} ${where}${excerpt} — fix: ${finding.fix}`;
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

  findings.push(...checkInformationDiscipline(repoRoot, { paths: filesToScan(repoRoot) }));

  return [...new Set(findings)].sort();
}

const today = () => new Date().toISOString().slice(0, 10);

function loadAllowlist(repoRoot) {
  const path = join(repoRoot, "fdpm-cli", ".information-discipline.allow");
  if (!existsSync(path)) return { entries: [], errors: [] };
  const parsed = parseAllowlist(readFileSync(path, "utf8"), today());
  for (const entry of parsed.entries) {
    if (!existsSync(join(repoRoot, entry.path))) parsed.errors.push(`.information-discipline.allow: ${entry.path} no longer exists; remove the entry`);
  }
  return parsed;
}

/**
 * The deterministic half of information discipline over a set of paths
 * (every tracked text file by default; the staged files from the pre-commit
 * hook). Returns formatted findings.
 */
export function checkInformationDiscipline(repoRoot, { paths, tarball = true }) {
  const out = [];
  const allow = loadAllowlist(repoRoot);
  out.push(...allow.errors);
  out.push(...evaluateWorkingPaths(paths.map((path) => ({ path }))).map(formatFinding));
  for (const path of paths) {
    if (BINARY_EXTENSIONS.has(extname(path).toLowerCase())) continue;
    const absolutePath = join(repoRoot, path);
    if (!existsSync(absolutePath)) continue;
    const stat = lstatSync(absolutePath);
    if (!stat.isFile() || stat.size > 1024 * 1024) continue;
    const buffer = readFileSync(absolutePath);
    if (buffer.includes(0)) continue;
    out.push(...evaluateTextDiscipline(path, buffer.toString("utf8"), allow.entries).map(formatFinding));
  }
  const readmePath = join(repoRoot, "README.md");
  if (existsSync(readmePath)) {
    const manifests = {};
    for (const manifestPath of PACKAGE_MANIFESTS) {
      const absolutePath = join(repoRoot, manifestPath);
      if (existsSync(absolutePath)) manifests[manifestPath] = JSON.parse(readFileSync(absolutePath, "utf8"));
    }
    out.push(...evaluateIdentityConsistency({ readme: readFileSync(readmePath, "utf8"), manifests }).map(formatFinding));
  }
  if (tarball) out.push(...checkPackedTarball(repoRoot));
  return out;
}

/** What `npm pack` would ship from the current dist/, against the allowlist. */
export function checkPackedTarball(repoRoot) {
  const cliRoot = join(repoRoot, "fdpm-cli");
  if (!existsSync(join(cliRoot, "dist"))) return ["fdpm-cli/dist is missing: run npm run build before the package check"];
  const raw = execFileSync("npm", ["pack", "--dry-run", "--ignore-scripts", "--json"], {
    cwd: cliRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
    shell: process.platform === "win32",
  });
  const listing = JSON.parse(raw)[0]?.files?.map((file) => file.path) ?? [];
  return evaluatePackedFiles(listing).map(formatFinding);
}

function report(label, findings) {
  if (findings.length > 0) {
    process.stderr.write(`${label} failed (${findings.length} finding(s)):\n`);
    for (const finding of findings) process.stderr.write(`- ${finding}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`${label} passed.\n`);
}

function readListing(argument) {
  const text = argument === "-" ? readFileSync(0, "utf8") : readFileSync(argument, "utf8");
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

/**
 *   check-public-readiness.mjs                 the whole repository (release gate)
 *   check-public-readiness.mjs --staged        staged files only (pre-commit hook)
 *   check-public-readiness.mjs --commit-msg F  the commit message in F (commit-msg hook)
 *   check-public-readiness.mjs --image-listing F|-   an exported image's `tar -t` listing
 */
function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === "--staged") {
    const staged = git(DEFAULT_REPO_ROOT, ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]).split("\0").filter(Boolean);
    report("Information-discipline check (staged files)", checkInformationDiscipline(DEFAULT_REPO_ROOT, { paths: staged, tarball: false }));
    return;
  }
  if (argv[0] === "--commit-msg") {
    report("Commit-message check", evaluateCommitMessage(readFileSync(argv[1], "utf8")).map(formatFinding));
    return;
  }
  if (argv[0] === "--image-listing") {
    report("Image-content check", evaluateImageListing(readListing(argv[1])).map(formatFinding));
    return;
  }
  report("Public-readiness check", checkRepository());
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
