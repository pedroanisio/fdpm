import type { ScopeDef } from "../../src/core/models/meta.js";

/**
 * Scopes — mirrors the `scopes=[...]` block of
 * src/fdpm/plugins/software_architecture.py:73-109.
 */
export const SCOPES: ScopeDef[] = [
  {
    id: "scope:sw:domain",
    name: "Domain",
    rank: 1,
    description: "Business rules, ubiquitous language, domain invariants.",
  },
  {
    id: "scope:sw:runtime",
    name: "Runtime",
    rank: 2,
    description: "Operational behavior under load, latency, throughput.",
  },
  {
    id: "scope:sw:deployment",
    name: "Deployment",
    rank: 3,
    description: "Infrastructure, topology, regions, environments.",
  },
  {
    id: "scope:sw:organizational",
    name: "Organizational",
    rank: 4,
    description: "Teams, ownership, process, governance.",
  },
];

/**
 * The Python source (src/fdpm/plugins/software_architecture.py) does
 * not declare scope_sets — the DomainProfile defaults apply (empty
 * map, empty default). Mirrored verbatim for byte-faithful parity:
 * adding a synthetic "default" scope_set here would diverge from the
 * source dump.
 */
export const SCOPE_SETS: Record<string, string[]> = {};

export const DEFAULT_SCOPE_SET = "";
