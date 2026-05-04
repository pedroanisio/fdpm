import { CURRENT_PAYLOAD_SCHEMA_VERSION } from "./payloads.js";
import { FDPMException } from "../errors/fdpm-exception.js";
import type { OperationKind } from "./kinds.js";
import type { Operation } from "./operation.js";
import { mintUidFromSeed } from "../identity/uid.js";

/**
 * §5.5.6 Upcasting — pure function (oldPayload, op) → newPayload, run at
 * replay time before the operation is applied.
 *
 * The upcaster receives the full Operation so it can derive deterministic
 * fields from immutable provenance (op_id, request_id) — required for
 * SPEC-CORE §5.5.3 byte-equal replay across hosts.
 */
type Upcaster = (
  payload: Record<string, unknown>,
  op: Operation,
) => Record<string, unknown>;
type Key = `${OperationKind}@${string}`; // kind@from_version

const upcasters = new Map<Key, { to: string; fn: Upcaster }>();

export function registerUpcaster(
  kind: OperationKind,
  fromVersion: string,
  toVersion: string,
  fn: Upcaster,
): void {
  upcasters.set(`${kind}@${fromVersion}`, { to: toVersion, fn });
}

export function upcastPayload(
  kind: OperationKind,
  fromVersion: string,
  payload: Record<string, unknown>,
  op: Operation,
): Record<string, unknown> {
  let current = payload;
  let version = fromVersion;
  // Bound the chain to avoid infinite loops on malformed registrations.
  for (let hop = 0; hop < 32; hop++) {
    if (version === CURRENT_PAYLOAD_SCHEMA_VERSION) return current;
    const next = upcasters.get(`${kind}@${version}`);
    if (!next) {
      // The log was written by a host that ships `kind@version` but this
      // host has no upcaster registered to reach the current schema. That
      // is a host-compatibility failure, not an internal bug — the
      // operator's recourse is to pin the writing host's version or wait
      // for an upgrade that ships the missing upcaster.
      throw new FDPMException(
        "host_compat",
        `no upcaster chain for ${kind}@${fromVersion} -> ${CURRENT_PAYLOAD_SCHEMA_VERSION}`,
        {
          evidence: {
            kind,
            from_version: fromVersion,
            target_version: CURRENT_PAYLOAD_SCHEMA_VERSION,
            stuck_at: version,
          },
        },
      );
    }
    current = next.fn(current, op);
    version = next.to;
  }
  // Reaching here means the registered upcasters form a cycle — the host
  // is misconfigured and the operator cannot fix it. Stay `internal`.
  throw new FDPMException("internal", "upcaster chain depth exceeded", {
    evidence: { kind, from_version: fromVersion, last_version: version },
  });
}

// -- v1.1.0 → v1.2.0 -------------------------------------------------
//
// SPEC-UID §15 step 2: legacy primitive.create / relation.create ops
// have no `uid` field. Mint a deterministic uid from the operation's
// op_id (itself a ULID — high entropy, immutable, time-stamped). Same
// log → same uids on every host, every replay (SPEC-UID §13 conf 2).
registerUpcaster("primitive.create", "1.1.0", "1.2.0", (payload, op) => ({
  ...payload,
  uid: mintUidFromSeed(op.op_id),
}));
registerUpcaster("relation.create", "1.1.0", "1.2.0", (payload, op) => ({
  ...payload,
  uid: mintUidFromSeed(op.op_id),
}));
