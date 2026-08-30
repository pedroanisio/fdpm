/**
 * SPEC-WORKSPACE §13 backup writer.
 *
 * Walks a LocalWorkspace's data directory, computes sha256 per file,
 * and emits a `.fdpmbak` zip whose first entry is `backup-manifest.json`
 * (manifest-at-offset-0 contract — operators can `unzip -p bundle
 * backup-manifest.json` without extracting the whole archive).
 *
 * Compression policy follows §13: text/json/jsonl/yaml/svg are
 * deflated; pre-compressed types (pdf/png/jpeg) are stored.
 */
import { ZipArchive } from "archiver";
import { createHash } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  promises as fs,
  statSync,
} from "node:fs";
import { dirname, join, posix, relative, sep } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { FDPMException } from "../errors/fdpm-exception.js";
import { HOST_VERSION, SPEC_CORE_VERSION } from "../version/spec.js";
import type { WorkspaceIdentity } from "./types.js";

export const SPEC_BACKUP_VERSION = "1.0" as const;

export interface BackupManifestFileEntry {
  path: string;
  sha256: string;
  bytes: number;
  content_type: string;
}

export interface BackupManifest {
  spec_backup: typeof SPEC_BACKUP_VERSION;
  fdpm_host_version: string;
  spec_core_version: string;
  created_at: string;
  workspace: {
    id: string;
    name: string;
    created_at: string;
    created_by_host_version: string;
  };
  files: BackupManifestFileEntry[];
  workbooks: { id: string; log_size: number; log_sha256: string }[];
  profiles: { id: string; sha256: string }[];
  warnings: string[];
  exit_status: "ok" | "warn";
}

export interface BackupOptions {
  /** Output path for the bundle. Use `"-"` to write to stdout. */
  output: string;
  /** Refuse to overwrite an existing output file unless true. */
  force?: boolean;
  /** Deflate level 0-9 (default 6). */
  compressionLevel?: number;
}

export interface BackupResult {
  output: string;
  bytes: number;
  manifest: BackupManifest;
}

const COMPRESSED_EXTENSIONS = new Set([
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".zip",
  ".gz",
  ".tar",
  ".tgz",
  ".bz2",
  ".xz",
  ".7z",
  ".woff",
  ".woff2",
]);

function inferContentType(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".jsonl")) return "application/jsonl";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".md")) return "text/markdown";
  if (lower.endsWith(".yml") || lower.endsWith(".yaml")) return "application/x-yaml";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".txt")) return "text/plain";
  return "application/octet-stream";
}

function shouldStore(path: string): boolean {
  const dot = path.lastIndexOf(".");
  if (dot < 0) return false;
  return COMPRESSED_EXTENSIONS.has(path.slice(dot).toLowerCase());
}

async function sha256OfFile(path: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

async function walkFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function visit(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile()) out.push(full);
    }
  }
  if (existsSync(root)) await visit(root);
  return out;
}

/** Convert a host-OS path under `root` into a forward-slash relative path. */
function toBundleRel(root: string, path: string): string {
  return relative(root, path).split(sep).join(posix.sep);
}

/**
 * Plan the bundle: walk the data dir, compute per-file sha256 and
 * content_type, classify into workbooks/profiles/other for the
 * manifest tables. Skips `workspace.json` from the workbooks/profiles
 * tables (it is its own top-level file).
 */
async function planBundle(
  dataDir: string,
  identity: WorkspaceIdentity,
): Promise<BackupManifest> {
  const files = await walkFiles(dataDir);
  files.sort();

  const fileEntries: BackupManifestFileEntry[] = [];
  const projectIndex = new Map<string, { log_size: number; log_sha256: string }>();
  const profileEntries: { id: string; sha256: string }[] = [];

  for (const abs of files) {
    const rel = `data/${toBundleRel(dataDir, abs)}`;
    const sha = await sha256OfFile(abs);
    const bytes = statSync(abs).size;
    const contentType = inferContentType(abs);
    fileEntries.push({ path: rel, sha256: sha, bytes, content_type: contentType });

    const relForCategorize = toBundleRel(dataDir, abs);
    const segs = relForCategorize.split(posix.sep);
    if (segs[0] === "workbooks" && segs.length === 3 && segs[2] === "log.jsonl") {
      projectIndex.set(segs[1]!, { log_size: bytes, log_sha256: sha });
    } else if (segs[0] === "profiles" && segs.length === 2 && segs[1]!.endsWith(".json")) {
      profileEntries.push({ id: segs[1]!.replace(/\.json$/, ""), sha256: sha });
    }
  }

  const workbooks = [...projectIndex.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, info]) => ({ id, ...info }));
  profileEntries.sort((a, b) => a.id.localeCompare(b.id));

  return {
    spec_backup: SPEC_BACKUP_VERSION,
    fdpm_host_version: HOST_VERSION,
    spec_core_version: SPEC_CORE_VERSION,
    created_at: new Date().toISOString(),
    workspace: {
      id: identity.id,
      name: identity.name,
      created_at: identity.created_at,
      created_by_host_version: identity.created_by_host_version,
    },
    files: fileEntries,
    workbooks,
    profiles: profileEntries,
    warnings: [],
    exit_status: "ok",
  };
}

/**
 * Stream-write the bundle. The manifest is appended FIRST so it lands
 * at the lowest offset in the central directory — operator tooling can
 * then `unzip -p bundle backup-manifest.json` without scanning all
 * entries.
 */
export async function backupWorkspace(
  dataDir: string,
  identity: WorkspaceIdentity,
  opts: BackupOptions,
): Promise<BackupResult> {
  if (opts.output !== "-" && existsSync(opts.output) && !opts.force) {
    throw new FDPMException(
      "permission",
      `backup output exists: ${opts.output}`,
      { evidence: { output: opts.output, advice: "pass --force to overwrite" } },
    );
  }

  const manifest = await planBundle(dataDir, identity);

  const out =
    opts.output === "-"
      ? process.stdout
      : createWriteStream(opts.output, { flags: "w" });
  if (opts.output !== "-") {
    const dir = dirname(opts.output);
    if (!existsSync(dir)) await fs.mkdir(dir, { recursive: true });
  }

  const archive = new ZipArchive({
    zlib: { level: opts.compressionLevel ?? 6 },
  });

  let bytes = 0;
  archive.on("data", (chunk: Buffer) => {
    bytes += chunk.length;
  });

  const archiveDone = new Promise<void>((resolve, reject) => {
    archive.on("error", reject);
    out.on("error", reject);
    out.on("finish", resolve);
    if (opts.output === "-") {
      // process.stdout has no 'finish' event under most conditions; use 'end' on the archive.
      archive.on("end", resolve);
    }
  });

  archive.pipe(out);

  // 1. Manifest first — store, no compression, so the offset is small
  // and stable.
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + "\n", "utf8");
  archive.append(manifestBytes, { name: "backup-manifest.json", store: true });

  // 2. All data files. Stream each one — never load into memory.
  for (const entry of manifest.files) {
    const rel = entry.path.slice("data/".length);
    const abs = join(dataDir, rel.split(posix.sep).join(sep));
    archive.append(createReadStream(abs), {
      name: entry.path,
      store: shouldStore(entry.path),
    });
  }

  await archive.finalize();
  await archiveDone;

  return {
    output: opts.output,
    bytes,
    manifest,
  };
}

/** Re-export utilities used by restore.ts so the two modules stay paired. */
export { sha256OfFile, walkFiles, toBundleRel };
/** Internal helper kept for stream-friendly composition. */
export const _internal = { Readable };
