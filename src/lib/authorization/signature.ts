// PROTOTYPE signing, for teaching. Not production payment security.
//
// Ed25519 uses a key pair. The private key creates signatures and the public key
// checks them, so code that can verify cannot forge. A valid signature proves the
// record was signed by whoever holds the private key and has not changed since.
// It does NOT prove a real person approved it. See docs/ARCHITECTURE.md for the full limits.

import {
  generateKeyPairSync,
  sign,
  verify,
  createHash,
  type KeyObject,
} from "node:crypto";

/**
 * The same data must always become the same bytes, or signatures would break when
 * JSON keys arrive in a different order. Sorting object keys makes it stable.
 */
export function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

export function fingerprint(value: unknown): string {
  return createHash("sha256").update(canonicalize(value)).digest("hex");
}

export interface DemoKeyPair {
  privateKey: KeyObject;
  publicKey: KeyObject;
}

export function generateDemoKeyPair(): DemoKeyPair {
  return generateKeyPairSync("ed25519");
}

export function signRecord(record: unknown, privateKey: KeyObject): string {
  return sign(null, Buffer.from(canonicalize(record)), privateKey).toString("base64");
}

/** Never throws. Damaged input simply fails verification. */
export function verifyRecord(
  record: unknown,
  signature: string,
  publicKey: KeyObject,
): boolean {
  try {
    return verify(
      null,
      Buffer.from(canonicalize(record)),
      publicKey,
      Buffer.from(signature, "base64"),
    );
  } catch {
    return false;
  }
}
