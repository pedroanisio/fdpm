import { ulid, decodeTime, factory } from "ulid";
import { createHash } from "node:crypto";

export const UID_LENGTH = 26;

// Crockford base32 (excluding I, L, O, U)
export const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/**
 * Mint a fresh, time-sortable globally unique identifier (ULID).
 */
export function mintUid(): string {
  return ulid();
}

/**
 * Mint a deterministic UID keyed on an existing string seed.
 *
 * Used by upcasters to ensure existing operations receive the same
 * UID on every replay across all hosts. The entropy comes from the
 * SHA-256 hash of the seed, replacing the random component of the ULID.
 * The timestamp component is preserved if the seed is a ULID.
 * 
 * @param seed Any high-entropy string (typically an existing op_id).
 */
export function mintUidFromSeed(seed: string): string {
  // If the seed happens to be a valid ULID itself (like an op_id),
  // extract its timestamp to preserve temporal locality.
  // Otherwise, use epoch 0.
  let time = 0;
  if (isValidUid(seed)) {
    time = uidCreatedAt(seed).getTime();
  }

  const hash = createHash("sha256").update(seed).digest();
  
  // The PRNG function for ulid() takes no args and returns a number between 0 and 1.
  // We need 10 bytes (80 bits) of randomness for a ULID.
  let hashIndex = 0;
  const deterministicPrng = () => {
    if (hashIndex >= hash.length) {
      hashIndex = 0;
    }
    return hash[hashIndex++]! / 256;
  };

  const seededUlid = factory(deterministicPrng);
  return seededUlid(time);
}

/**
 * Check if a string is a structurally valid UID.
 */
export function isValidUid(s: string): boolean {
  return s.length === UID_LENGTH && ULID_PATTERN.test(s);
}

/**
 * Extract the creation timestamp from a UID.
 */
export function uidCreatedAt(uid: string): Date {
  return new Date(decodeTime(uid));
}
