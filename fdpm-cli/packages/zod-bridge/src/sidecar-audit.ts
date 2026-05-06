/**
 * AuditLog shape — SPEC-FDPM-BRIDGE §11.5.
 *
 * The bridge's record of every interpretive decision. A reviewer with
 * the sidecar, the source corpus, and this log can reconstruct every
 * artefact the bridge produced.
 */

import type {
  AuditLog as ClassifierAuditLog,
  ClassificationCandidate,
  ClassificationEntry,
} from "./classifier.js";

export interface DivergenceEntry {
  feature: string;
  reason: string;
  evidence?: Record<string, unknown>;
}

export interface OverrideEntry {
  /** Path-like key (e.g. "Order.customerId"). */
  target: string;
  category: "information-addition" | "interpretive-divergence" | "contradiction";
  reason: string;
}

export interface LossEntry {
  feature: string;
  kind: "soundness-loss" | "completeness-loss";
  classification:
    | "sound-but-not-complete"
    | "complete-but-not-sound"
    | "neither-sound-nor-complete";
  reason: string;
}

export interface SidecarAuditLog {
  bridgeRealization: { id: string; version: string };
  generalSpecVersion: string;
  realizationSpecVersion: string;
  sidecarSpecVersion: string;
  generatedAt: string;
  classifications: ClassificationEntry[];
  candidates: ClassificationCandidate[];
  overrides: OverrideEntry[];
  divergences: DivergenceEntry[];
  losses: LossEntry[];
}

export function emptyAudit(args: {
  realizationVersion: string;
  generatedAt: string;
  sidecarSpecVersion: string;
  classifierAudit: ClassifierAuditLog;
}): SidecarAuditLog {
  return {
    bridgeRealization: { id: "zod-bridge", version: args.realizationVersion },
    generalSpecVersion: "0.2",
    realizationSpecVersion: "0.2",
    sidecarSpecVersion: args.sidecarSpecVersion,
    generatedAt: args.generatedAt,
    classifications: args.classifierAudit.classifications,
    candidates: args.classifierAudit.candidatePromotions,
    overrides: [],
    divergences: [],
    losses: [],
  };
}
