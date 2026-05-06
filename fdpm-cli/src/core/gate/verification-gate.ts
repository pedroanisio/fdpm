import type { z } from "zod";
import { FDPMException } from "../errors/fdpm-exception.js";
import type { Operation } from "../operations/operation.js";
import { PAYLOAD_SCHEMAS } from "../operations/payloads.js";
import { isCoreReserved } from "../identity/id-rules.js";

/**
 * §8 Verification Gate — enforces PALS's LAW at every external boundary.
 *
 * The gate is non-bypassable (§8.3): every Core writer MUST pass through
 * `verifyOperationPayload` before append.
 */

export function verifyOperationPayload(op: Pick<Operation, "kind" | "payload">): void {
  const schema = PAYLOAD_SCHEMAS[op.kind] as z.ZodTypeAny | undefined;
  if (!schema) {
    throw new FDPMException("verification", `unknown operation kind: ${op.kind}`);
  }
  const result = schema.safeParse(op.payload);
  if (!result.success) {
    // Compose a short, human-readable summary so the error message itself
    // tells the operator *what* is wrong without forcing them to dig into
    // the JSON envelope or grep the source for the Zod schema. The full
    // issues array is still attached as evidence.
    const summary = summarizeZodIssues(result.error.issues);
    throw new FDPMException(
      "verification",
      `payload schema violation for ${op.kind}: ${summary}`,
      { evidence: { kind: op.kind, issues: result.error.issues } },
    );
  }
}

/**
 * Render up to three Zod issues into a compact "path: message" list so
 * the headline error message is actionable. The full issues array remains
 * accessible via `error.evidence.issues` for tooling that wants the
 * structured form.
 */
function summarizeZodIssues(
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string; code: string }>,
): string {
  const max = 3;
  const parts = issues.slice(0, max).map((i) => {
    const path =
      i.path.length > 0
        ? i.path.map((seg) => String(seg)).join(".")
        : "<root>";
    return `${path}: ${i.message}`;
  });
  if (issues.length > max) parts.push(`(+${issues.length - max} more)`);
  return parts.join("; ");
}

/**
 * §11.3 Reserved namespaces — Core symbols that plugins (or unprivileged
 * input) must not redefine. The gate is consulted at profile registration
 * time and at any external import.
 */
export function verifyNonReservedId(id: string, kind: string): void {
  if (isCoreReserved(id) && id !== "core:empty") {
    // core:empty is Core content, registered by Core itself.
    if (kind !== "internal-core")
      throw new FDPMException("verification", `id reserved for Core: ${id}`);
  }
}

/**
 * §8.1 inbound body size cap. Used by the CLI when reading JSON from
 * stdin or files.
 */
export function verifyMaxRequestBytes(bytes: number, max: number): void {
  if (bytes > max)
    throw new FDPMException("quota", `request size ${bytes} exceeds cap ${max}`, {
      evidence: { observed: bytes, cap: max, unit: "bytes" },
    });
}
