/**
 * SPEC-WORKSPACE §14 restore pipeline.
 *
 * Five steps, each with an explicit failure category and a documented
 * `evidence.reason`:
 *
 *   1. Read backup-manifest.json (random-access via central directory).
 *   2. Identity-collision check against the registry.
 *   3. Verify all sha256s — STREAMING; no bytes written to the target
 *      until every entry passes.
 *   4. Write to `${target}.tmp/` then atomic rename to `${target}`.
 *      Cross-filesystem rename detected and refused.
 *   5. Host.load() round-trip — proves the bundle is replayable on
 *      this host. Optional via `--skip-verify`.
 */
import { createHash, randomBytes } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  promises as fs,
  mkdirSync,
} from "node:fs";
import { dirname, join, posix, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { ZodError } from "zod";
import yauzl from "yauzl";
import { FDPMException } from "../errors/fdpm-exception.js";
import { mintUid } from "../identity/uid.js";
import { HOST_VERSION, SPEC_CORE_VERSION } from "../version/spec.js";
import {
  defaultRegistryPath,
  findById,
  readRegistry,
  uniqueName,
  upsertEntry,
  writeRegistry,
} from "./registry.js";
import { SPEC_WORKSPACE_VERSION, WorkspaceIdentity } from "./types.js";
import { type BackupManifest, SPEC_BACKUP_VERSION } from "./backup.js";

export interface RestoreOptions {
  bundlePath: string;
  /** Target dataDir for the restored workspace. Required. */
  dataDir: string;
  /** Replace any existing workspace_id collision on disk + registry. */
  forceOverwrite?: boolean;
  /** Mint a fresh workspace_id and rename, side-stepping collisions. */
  rename?: string;
  /** Skip step 5 (Host.load round-trip). Use with caution. */
  skipVerify?: boolean;
  /** Override registry path; tests inject this. */
  registryPath?: string;
}

export interface RestoreResult {
  dataDir: string;
  manifest: BackupManifest;
  identity: WorkspaceIdentity;
  /** True iff `--name` minted a fresh id rather than reusing the bundle's. */
  reidentified: boolean;
}

interface ZipEntryHandle {
  entry: yauzl.Entry;
  zip: yauzl.ZipFile;
}

function openZip(path: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true, autoClose: false }, (err, zip) => {
      if (err || !zip) reject(err ?? new Error("yauzl returned no zip"));
      else resolve(zip);
    });
  });
}

function readEntryStream(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<NodeJS.ReadableStream> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (err, stream) => {
      if (err || !stream) reject(err ?? new Error("openReadStream returned no stream"));
      else resolve(stream);
    });
  });
}

async function listEntries(zip: yauzl.ZipFile): Promise<yauzl.Entry[]> {
  return new Promise((resolve, reject) => {
    const out: yauzl.Entry[] = [];
    zip.on("entry", (e: yauzl.Entry) => {
      out.push(e);
      zip.readEntry();
    });
    zip.on("end", () => resolve(out));
    zip.on("error", reject);
    zip.readEntry();
  });
}

async function readEntryToBuffer(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<Buffer> {
  const stream = await readEntryStream(zip, entry);
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

async function readManifest(zip: yauzl.ZipFile, entries: yauzl.Entry[]): Promise<BackupManifest> {
  const manifestEntry = entries.find((e) => e.fileName === "backup-manifest.json");
  if (!manifestEntry) {
    throw new FDPMException(
      "verification",
      "bundle missing backup-manifest.json",
      { evidence: { reason: "manifest_invalid", missing: "backup-manifest.json" } },
    );
  }
  const buf = await readEntryToBuffer(zip, manifestEntry);
  let parsed: unknown;
  try {
    parsed = JSON.parse(buf.toString("utf8"));
  } catch (err) {
    throw new FDPMException(
      "verification",
      "backup-manifest.json is not valid JSON",
      {
        evidence: {
          reason: "manifest_invalid",
          parse_error: (err as Error).message,
        },
      },
    );
  }
  // Lightweight shape check; the manifest is operator-supplied so we
  // refuse rather than coerce.
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as { spec_backup?: unknown }).spec_backup !== SPEC_BACKUP_VERSION
  ) {
    throw new FDPMException(
      "verification",
      "backup-manifest.json failed shape validation",
      {
        evidence: {
          reason: "manifest_invalid",
          expected_spec_backup: SPEC_BACKUP_VERSION,
        },
      },
    );
  }
  return parsed as BackupManifest;
}

async function sha256OfStream(stream: NodeJS.ReadableStream): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(stream, hash);
  return hash.digest("hex");
}

/**
 * Step 3 — verify every manifest entry's sha256 by re-streaming it
 * from the zip. No bytes touch the target dir during this step.
 */
async function verifyAll(
  zip: yauzl.ZipFile,
  entries: yauzl.Entry[],
  manifest: BackupManifest,
): Promise<void> {
  const entryByName = new Map(entries.map((e) => [e.fileName, e]));
  for (const file of manifest.files) {
    const e = entryByName.get(file.path);
    if (!e) {
      throw new FDPMException(
        "verification",
        `bundle entry missing: ${file.path}`,
        { evidence: { reason: "missing_entry", path: file.path } },
      );
    }
    const stream = await readEntryStream(zip, e);
    const actual = await sha256OfStream(stream);
    if (actual !== file.sha256) {
      throw new FDPMException(
        "verification",
        `sha256 mismatch: ${file.path}`,
        {
          evidence: {
            reason: "sha256_mismatch",
            path: file.path,
            expected: file.sha256,
            actual,
          },
        },
      );
    }
  }
}

/**
 * Step 4 — write all bundle entries to a temp dir, then atomic rename
 * to the target. Cross-filesystem rename refused before any write.
 */
async function writeAndAtomicRename(
  zip: yauzl.ZipFile,
  entries: yauzl.Entry[],
  manifest: BackupManifest,
  target: string,
  overrideIdentity?: WorkspaceIdentity,
): Promise<void> {
  // Cross-fs detection: temp dir is a sibling of the target so the
  // atomic rename is guaranteed to be on the same filesystem.
  const targetParent = dirname(target);
  if (!existsSync(targetParent)) mkdirSync(targetParent, { recursive: true });
  const tmp = `${target}.tmp.${process.pid}.${randomBytes(4).toString("hex")}`;
  if (existsSync(tmp)) await fs.rm(tmp, { recursive: true, force: true });
  await fs.mkdir(tmp, { recursive: true });

  const entryByName = new Map(entries.map((e) => [e.fileName, e]));

  for (const file of manifest.files) {
    const e = entryByName.get(file.path);
    if (!e) continue; // verified in step 3; defensive
    const rel = file.path.slice("data/".length);
    const abs = join(tmp, rel.split(posix.sep).join(sep));
    await fs.mkdir(dirname(abs), { recursive: true });
    const stream = await readEntryStream(zip, e);
    await pipeline(stream, createWriteStream(abs));
  }

  // If --name minted a fresh identity, overwrite workspace.json AFTER
  // the bundle entries land so the override is the canonical version.
  if (overrideIdentity) {
    const wsPath = join(tmp, "workspace.json");
    await fs.writeFile(wsPath, JSON.stringify(overrideIdentity, null, 2) + "\n", "utf8");
  }

  // Atomic rename. Cross-fs = EXDEV.
  try {
    if (existsSync(target)) {
      // Force-overwrite path. Move the existing dir aside; operator
      // can rm it after success.
      const aside = `${target}.replaced-${Date.now()}`;
      await fs.rename(target, aside);
    }
    await fs.rename(tmp, target);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EXDEV") {
      // Surface the SPEC-prescribed diagnosis. Leave the temp dir for
      // the operator to inspect.
      throw new FDPMException(
        "verification",
        `cross-filesystem rename refused: ${target}`,
        {
          evidence: {
            reason: "cross_fs_rename",
            target,
            tmp,
            advice: "set --data-dir to a path on the same filesystem as the temp dir",
          },
        },
      );
    }
    throw err;
  }
}

/**
 * Identity-collision policy. Returns the identity to use (possibly
 * mutated for `--name`) plus a `reidentified` flag.
 */
async function applyCollisionPolicy(
  manifest: BackupManifest,
  opts: RestoreOptions,
): Promise<{ identity: WorkspaceIdentity; reidentified: boolean }> {
  const registry = await readRegistry(opts.registryPath);
  const collision = findById(registry, manifest.workspace.id);

  // --name: always mint fresh, never collide.
  if (opts.rename) {
    const safeName = uniqueName(registry, opts.rename);
    const fresh: WorkspaceIdentity = {
      spec_workspace: SPEC_WORKSPACE_VERSION,
      id: mintUid(),
      name: safeName,
      created_at: new Date().toISOString(),
      created_by_host_version: HOST_VERSION,
      spec_core_version: SPEC_CORE_VERSION,
      description: `Restored from bundle of workspace "${manifest.workspace.name}" (${manifest.workspace.id}).`,
    };
    return { identity: fresh, reidentified: true };
  }

  if (collision && !opts.forceOverwrite) {
    throw new FDPMException(
      "conflict",
      `workspace_id already in registry: ${manifest.workspace.id}`,
      {
        evidence: {
          reason: "workspace_id_collision",
          workspace_id: manifest.workspace.id,
          existing_workspace: { name: collision.name, path: collision.path },
          advice:
            "pass --force-overwrite to replace, or --name <new> to clone with a fresh id",
        },
      },
    );
  }

  // Reuse the bundle's identity. We re-derive it strictly from the
  // bundle's workspace.json on disk inside the temp dir — but we also
  // synthesize one here for upsert callers when the bundle's
  // workspace.json is absent (defensive; the manifest carries the same
  // facts).
  const identity: WorkspaceIdentity = {
    spec_workspace: SPEC_WORKSPACE_VERSION,
    id: manifest.workspace.id,
    name: manifest.workspace.name,
    created_at: manifest.workspace.created_at,
    created_by_host_version: manifest.workspace.created_by_host_version,
    spec_core_version: SPEC_CORE_VERSION,
  };
  return { identity, reidentified: false };
}

/**
 * Step 5 — Host.load() round-trip. Imported lazily because Host
 * imports LocalWorkspace which imports this file (circular avoidance).
 */
async function hostLoadRoundTrip(target: string): Promise<void> {
  const { Host } = await import("../host.js");
  const probe = new Host({ dataDir: target, noPlugins: true });
  try {
    await probe.load();
  } catch (err) {
    if (err instanceof FDPMException) {
      throw new FDPMException(
        "host_compat",
        `restored workspace failed Host.load(): ${err.message}`,
        {
          evidence: {
            reason: "version_skew",
            host_version: HOST_VERSION,
            target,
            inner_category: err.category,
            inner_evidence: err.evidence,
          },
          cause: err,
        },
      );
    }
    throw err;
  }
}

/**
 * Read workspace.json out of the freshly-restored target, validate
 * against the schema, and upsert the registry. Identity collision was
 * already cleared in step 2; this is the post-success bookkeeping.
 */
async function readAndRegister(
  target: string,
  opts: RestoreOptions,
  fallbackIdentity: WorkspaceIdentity,
): Promise<WorkspaceIdentity> {
  const wsPath = join(target, "workspace.json");
  let identity: WorkspaceIdentity = fallbackIdentity;
  if (existsSync(wsPath)) {
    const buf = await fs.readFile(wsPath, "utf8");
    try {
      identity = WorkspaceIdentity.parse(JSON.parse(buf));
    } catch (err) {
      if (err instanceof ZodError) {
        throw new FDPMException(
          "verification",
          `restored workspace.json failed schema validation: ${target}`,
          {
            evidence: {
              reason: "workspace_json_invalid",
              path: wsPath,
              issues: err.issues,
            },
          },
        );
      }
      throw err;
    }
  }
  const registry = await readRegistry(opts.registryPath);
  const next = upsertEntry(registry, {
    id: identity.id,
    name: identity.name,
    path: target,
  });
  await writeRegistry(next, opts.registryPath ?? defaultRegistryPath());
  return identity;
}

export async function restoreWorkspace(opts: RestoreOptions): Promise<RestoreResult> {
  const zip = await openZip(opts.bundlePath);
  let result: RestoreResult;
  try {
    const entries = await listEntries(zip);
    const manifest = await readManifest(zip, entries);

    const { identity: policyIdentity, reidentified } = await applyCollisionPolicy(
      manifest,
      opts,
    );

    await verifyAll(zip, entries, manifest);

    await writeAndAtomicRename(
      zip,
      entries,
      manifest,
      opts.dataDir,
      reidentified ? policyIdentity : undefined,
    );

    if (!opts.skipVerify) {
      await hostLoadRoundTrip(opts.dataDir);
    }

    const identity = await readAndRegister(opts.dataDir, opts, policyIdentity);

    result = {
      dataDir: opts.dataDir,
      manifest,
      identity,
      reidentified,
    };
  } finally {
    zip.close();
  }
  return result;
}
