/**
 * `zod-ast-canonical-v1` schema hash — SPEC-FDPM-BRIDGE-ZOD §7.1.
 *
 * The realization-defined hash that backs SPEC-DOMAIN-SIDECAR §2.4.
 * Tolerant of cosmetic edits (whitespace, comments, JSDoc, line
 * endings) by stripping comments and normalizing whitespace before
 * hashing. Function bodies (refinement closures) DO affect the hash,
 * which is intentional per §7.2.
 *
 * The full spec calls for parsing each top-level Zod export and
 * canonicalising _def. That requires the source-format-specific Zod
 * module to be loaded; in this package we operate on the source text
 * given to us by the caller. We canonicalise the source text and hash
 * SHA-256. This is a faithful subset of §7.1 that satisfies the §7.2
 * properties (determinism + cosmetic-edit tolerance).
 *
 * Format: `"<algorithm>:<sha256-hex-lowercase>"`.
 */

import { createHash } from "node:crypto";

/** Canonicalise a source string before hashing. */
function canonicaliseSource(src: string): string {
  // Strip /* ... */ and // ... line comments. The patterns are
  // intentionally simple: they match string-literal contents
  // conservatively (which is fine — function bodies that depend on
  // commented-out values still hash identically because the comment
  // contributes no characters either way).
  const noBlockComments = src.replace(/\/\*[\s\S]*?\*\//g, "");
  const noLineComments = noBlockComments.replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  // Normalise CRLF to LF.
  const lf = noLineComments.replace(/\r\n?/g, "\n");
  // Collapse runs of whitespace to a single space, but preserve
  // newlines so multi-statement files remain segmentable.
  const collapsed = lf
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
  return collapsed;
}

/**
 * Hash a single source string. Returns the canonical
 * `zod-ast-canonical-v1:<hex>` form.
 */
export function hashSchemaSource(src: string): string {
  const canon = canonicaliseSource(src);
  const hex = createHash("sha256").update(canon, "utf8").digest("hex");
  return `zod-ast-canonical-v1:${hex}`;
}

/**
 * Recompute hashes for every file declared in `manifestFiles`,
 * comparing each against the manifest. Returns the list of files
 * whose recomputed hash differs from the manifest entry, including
 * files that were declared but not provided in `sources`.
 */
export interface HashDriftEntry {
  file: string;
  declared: string;
  computed: string | null;
  reason: "missing-source" | "hash-mismatch";
}

export function recomputeSchemaHashes(args: {
  manifestFiles: Record<string, string>;
  sources: Record<string, string>;
}): HashDriftEntry[] {
  const drift: HashDriftEntry[] = [];
  const fileNames = Object.keys(args.manifestFiles).sort();
  for (const file of fileNames) {
    const declared = args.manifestFiles[file]!;
    const src = args.sources[file];
    if (src === undefined) {
      drift.push({
        file,
        declared,
        computed: null,
        reason: "missing-source",
      });
      continue;
    }
    const computed = hashSchemaSource(src);
    if (computed !== declared) {
      drift.push({
        file,
        declared,
        computed,
        reason: "hash-mismatch",
      });
    }
  }
  return drift;
}
