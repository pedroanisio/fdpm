/**
 * The registries the spec keeps as data, plus the v6.2 evidence receipt.
 *
 * Claims and theorems are recorded, never proved: the ontology is explicit
 * that the nine theorems are metatheory. The EvidenceBundle is the one that
 * does work — it is what makes a "verified" status rechecked rather than
 * merely asserted.
 */
import { datetime, enumOf, int, pattern, primitive, str, text } from "../_common.js";
import { CLAIM_STATUSES, CONFIDENCES } from "../enums.js";

export const CLAIM = primitive("recrt:Claim", "Claim", "A claim from the §9 falsifiability table.", [
  str("id", "Stable identifier.", { required: true }),
  int("claim_number", "Its row in the §9 table.", { required: true }),
  str("statement", "What is claimed.", { required: true }),
  enumOf("claim_status", CLAIM_STATUSES, "How far the claim has been carried.", { required: true }),
  enumOf("confidence", CONFIDENCES, "Confidence in the claim.", { required: true }),
  text(
    "falsifier",
    "What would refute it. A claim with no falsifier is not a claim; the §9 table exists to keep this column populated.",
    { required: true },
  ),
]);

export const THEOREM = primitive("recrt:Theorem", "Theorem", "A theorem (§6), recorded as data.", [
  str("id", "Stable identifier.", { required: true }),
  str("name", "Theorem name.", { required: true }),
  text("statement", "The statement, verbatim from the source spec."),
  text("falsifier", "What would refute it."),
]);

/**
 * The receipt behind a verified node (v6.2).
 *
 * Identity is `manifest_root`: a Merkle root over FILE CONTENTS — sorted
 * "sha256  path" lines, hashed — and NOT a digest of an archive. tar embeds
 * mtimes, uids and traversal order, so an untouched-content repack changes an
 * archive digest, and a check that fires on nothing gets switched off. The
 * optional `bundle_digest` covers transport only.
 *
 * SCOPE, because it is easy to overread: this establishes INTEGRITY (the
 * evidence has not changed since the claim) and COMPLETENESS (the claim names
 * what it depended on). It does NOT establish CORRECTNESS — a bundle hashes
 * perfectly around a wrong solver — and a self-reported hash beside its own
 * bundle deters drift and accident, not a forger, who would recompute it.
 */
export const EVIDENCE_BUNDLE = primitive(
  "recrt:EvidenceBundle",
  "Evidence bundle",
  "A content-addressed bundle of the code and data behind a verified node (v6.2).",
  [
    str("id", "Stable identifier.", { required: true }),
    pattern(
      "manifest_root",
      "^[0-9a-f]{64}$",
      "IDENTITY. Lowercase hex sha256 over sorted 'sha256  path' lines. Invariant to archive format and filesystem metadata.",
      { required: true },
    ),
    enumOf("hash_algorithm", ["sha256"], "Named so the scheme can outlive sha256.", {
      required: true,
    }),
    str("bundle_path", "Repo-relative location of the archive. A retrieval hint, not the identity.", {
      required: true,
    }),
    pattern(
      "bundle_digest",
      "^[0-9a-f]{64}$",
      "TRANSPORT ONLY. sha256 of the archive bytes; detects a corrupted copy.",
    ),
    int("bundle_file_count", "How many files the manifest covers."),
    datetime("captured_at", "When the bundle was taken."),
  ],
);
