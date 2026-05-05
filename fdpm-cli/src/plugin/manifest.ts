import { z } from "zod";
import { PluginError } from "./errors.js";

/**
 * §5.1 FDPMPluginManifest — Zod port of the SPEC's JSON Schema.
 *
 * `spec_version` is a major-pinned pattern ^1\.\d+\.\d+$ so a v1.0
 * manifest loads on a v1.1 host (§5.1 rationale). The runtime's
 * supported-set check is performed in code at discovery time and may
 * be stricter than the schema (§12).
 */
export const Capability = z
  .object({
    capability_id: z.enum([
      "cap:profile",
      "cap:validator",
      "cap:renderer",
      "cap:expr-helper",
      "cap:route",
      "cap:transformer",
      "cap:importer",
      "cap:exporter",
      "cap:lifecycle-hook",
      "cap:ui:primitive-form",
      "cap:ui:primitive-card",
      "cap:ui:explorer-panel",
      "cap:ui:renderer-preview",
      "cap:ui:menu-action",
      "cap:ui:route",
      "cap:ui:theme",
      "cap:ui:i18n",
    ]),
    local_name: z.string().regex(/^[a-z0-9-]+$/),
    entry: z.string().optional(),
    config_schema: z.record(z.unknown()).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();
export type Capability = z.infer<typeof Capability>;

export const Permission = z.enum([
  "read:workbooks",
  "write:workbooks",
  "read:primitives",
  "write:primitives",
  "read:relations",
  "write:relations",
  "read:audit",
  "render:server",
  "render:client",
  "import:workbook",
  "export:workbook",
  "menu:contribute",
  "network:outbound",
  "filesystem:read",
  "filesystem:write",
  "read:vcs",
  "read:os-info",
]);
export type Permission = z.infer<typeof Permission>;

export const PluginDependency = z
  .object({
    id: z.string(),
    version: z.string(),
  })
  .strict();
export type PluginDependency = z.infer<typeof PluginDependency>;

export const PluginManifest = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(\.[a-z0-9-]+)+$/),
    version: z.string().regex(/^\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?$/),
    spec_version: z
      .string()
      .regex(/^1\.\d+\.\d+$/, {
        message: "spec_version must match ^1\\.\\d+\\.\\d+$",
      }),
    kind: z.enum(["server", "frontend", "fullstack"]),
    name: z.string().max(80).optional(),
    description: z.string().max(500).optional(),
    authors: z.array(z.string()).min(1).optional(),
    license: z.string().optional(),
    homepage: z.string().url().optional(),
    host_compatibility: z
      .object({
        fdpm: z.string(),
        frontend: z.string().optional(),
        expr_helper_set: z.string().optional(),
      })
      .strict(),
    capabilities: z.array(Capability).min(1),
    permissions: z.array(Permission).default([]),
    requires_helpers: z
      .array(z.string().regex(/^fn\.[a-z0-9-]+(?:\.[a-z0-9-]+)+$/))
      .optional(),
    trust: z
      .object({
        signed_by: z.string().optional(),
        signature: z.string().optional(),
        supply_chain_sbom: z.string().optional(),
      })
      .optional(),
    dependencies: z
      .object({
        plugins: z.array(PluginDependency).optional(),
      })
      .optional(),
  })
  .strict()
  .superRefine((m, ctx) => {
    // Within-plugin uniqueness on (capability_id, local_name).
    const seen = new Set<string>();
    for (const cap of m.capabilities) {
      const key = `${cap.capability_id}::${cap.local_name}`;
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate capability (${cap.capability_id}, ${cap.local_name})`,
        });
      }
      seen.add(key);
      // local_name for cap:lifecycle-hook MUST be a known event (§4.4).
      if (cap.capability_id === "cap:lifecycle-hook") {
        const valid = ["on-install", "on-enable", "on-disable", "on-uninstall"];
        if (!valid.includes(cap.local_name)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `cap:lifecycle-hook local_name must be one of ${valid.join(", ")}`,
          });
        }
      }
    }
  });
export type PluginManifest = z.infer<typeof PluginManifest>;

export function parseManifest(raw: unknown, source: string): PluginManifest {
  const result = PluginManifest.safeParse(raw);
  if (!result.success) {
    throw new PluginError("manifest", `invalid manifest at ${source}`, {
      evidence: { issues: result.error.issues },
    });
  }
  return result.data;
}

/**
 * §12.3 host_compatibility check — the host refuses plugins whose
 * declared range excludes the running host version. The check is
 * intentionally simple: a plugin's `fdpm` field is a comma-separated
 * list of comparators (`>=1.0,<2`) over semver-major.minor.
 */
export function isHostCompatible(
  manifestRange: string,
  hostMajor: number,
  hostMinor: number,
): boolean {
  const parts = manifestRange.split(",").map((s) => s.trim()).filter(Boolean);
  for (const p of parts) {
    const m = /^(>=|<=|>|<|==|=)?(\d+)(?:\.(\d+))?(?:\.\d+)?$/.exec(p);
    if (!m) return false;
    const op = (m[1] ?? "==") as "==" | "=" | ">=" | "<=" | ">" | "<";
    const major = parseInt(m[2]!, 10);
    const minor = m[3] != null ? parseInt(m[3], 10) : 0;
    const cmp = compare(hostMajor, hostMinor, major, minor);
    if (op === "==" || op === "=") {
      if (cmp !== 0) return false;
    } else if (op === ">=") {
      if (cmp < 0) return false;
    } else if (op === "<=") {
      if (cmp > 0) return false;
    } else if (op === ">") {
      if (cmp <= 0) return false;
    } else if (op === "<") {
      if (cmp >= 0) return false;
    }
  }
  return true;
}

export function isSemverCompatible(manifestRange: string, version: string): boolean {
  const parsed = parseSemver(version);
  if (!parsed) return false;
  return isVersionRangeCompatible(manifestRange, parsed[0], parsed[1], parsed[2]);
}

function isVersionRangeCompatible(
  manifestRange: string,
  hostMajor: number,
  hostMinor: number,
  hostPatch: number,
): boolean {
  const parts = manifestRange.split(",").map((s) => s.trim()).filter(Boolean);
  for (const p of parts) {
    const m = /^(>=|<=|>|<|==|=)?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(p);
    if (!m) return false;
    const op = (m[1] ?? "==") as "==" | "=" | ">=" | "<=" | ">" | "<";
    const major = parseInt(m[2]!, 10);
    const minor = m[3] != null ? parseInt(m[3], 10) : 0;
    const patch = m[4] != null ? parseInt(m[4], 10) : 0;
    const cmp = compareVersion(hostMajor, hostMinor, hostPatch, major, minor, patch);
    if (op === "==" || op === "=") {
      if (cmp !== 0) return false;
    } else if (op === ">=") {
      if (cmp < 0) return false;
    } else if (op === "<=") {
      if (cmp > 0) return false;
    } else if (op === ">") {
      if (cmp <= 0) return false;
    } else if (op === "<") {
      if (cmp >= 0) return false;
    }
  }
  return true;
}

function compare(aMaj: number, aMin: number, bMaj: number, bMin: number): number {
  if (aMaj !== bMaj) return aMaj - bMaj;
  return aMin - bMin;
}

function compareVersion(
  aMaj: number,
  aMin: number,
  aPatch: number,
  bMaj: number,
  bMin: number,
  bPatch: number,
): number {
  if (aMaj !== bMaj) return aMaj - bMaj;
  if (aMin !== bMin) return aMin - bMin;
  return aPatch - bPatch;
}

function parseSemver(version: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-[A-Za-z0-9.-]+)?$/.exec(version);
  if (!match) return null;
  return [parseInt(match[1]!, 10), parseInt(match[2]!, 10), parseInt(match[3]!, 10)];
}
