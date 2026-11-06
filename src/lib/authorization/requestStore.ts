// In-memory store for the sandbox. In a real system these would be database tables:
// idempotency records (unique key), used nonces (unique nonce) and the audit log.
// commit() is the only place that writes keys and nonces, and it checks both before writing.
// Everything is lost on restart, nothing is ever pruned, and the audit log isn't tamper-evident.

import type { Decision } from "../policy/purchasePolicy";

export interface SimulatedPurchase {
  id: string;
  profileId: string;
  week: number;
  merchant: string;
  category: string;
  amountCents: number;
}

export interface StoredResponse {
  status: number;
  body: Record<string, unknown>;
}

interface IdempotencyRecord {
  fingerprint: string;
  response: StoredResponse;
}

export interface AuditEntry {
  seq: number;
  at: string;
  /** Sandbox week when the request arrived. */
  week: number;
  outcome: string;
  decision: Decision | null;
  reason: string;
  idempotencyKey: string | null;
  nonce: string | null;
  grantId: string | null;
  /** Only verified if the signatures passed. Rejected requests show what they claimed. */
  profileId: string | null;
  merchant: string | null;
  amountCents: number | null;
}

export type CommitResult = { ok: true } | { ok: false; conflict: "key" | "nonce" };

export class RequestStore {
  private byKey = new Map<string, IdempotencyRecord>();
  private usedNonces = new Set<string>();
  private purchases: SimulatedPurchase[] = [];
  private audit: AuditEntry[] = [];

  findByKey(key: string): IdempotencyRecord | undefined {
    return this.byKey.get(key);
  }

  isNonceUsed(nonce: string): boolean {
    return this.usedNonces.has(nonce);
  }

  /** Writes nothing if the key or the nonce is already taken. */
  commit(entry: {
    key: string;
    fingerprint: string;
    nonce: string;
    /** Present only for ALLOW. CHALLENGE and DENY use no budget or allowance. */
    purchase?: SimulatedPurchase;
    response: StoredResponse;
  }): CommitResult {
    if (this.byKey.has(entry.key)) return { ok: false, conflict: "key" };
    if (this.usedNonces.has(entry.nonce)) return { ok: false, conflict: "nonce" };
    this.byKey.set(entry.key, { fingerprint: entry.fingerprint, response: entry.response });
    this.usedNonces.add(entry.nonce);
    if (entry.purchase) this.purchases.push(entry.purchase);
    return { ok: true };
  }

  purchasesFor(profileId: string, throughWeek = Infinity): SimulatedPurchase[] {
    return this.purchases.filter((p) => p.profileId === profileId && p.week <= throughWeek);
  }

  /** ALLOW purchases are stored with the id "<grantId>:<nonce>", so this finds a grant's purchases. */
  allowanceUsed(grantId: string): number {
    return this.purchases
      .filter((p) => p.id.startsWith(`${grantId}:`))
      .reduce((sum, p) => sum + p.amountCents, 0);
  }

  appendAudit(entry: Omit<AuditEntry, "seq">): AuditEntry {
    const stored = { ...entry, seq: this.audit.length + 1 };
    this.audit.push(stored);
    return stored;
  }

  /** Newest first. */
  auditLog(): AuditEntry[] {
    return [...this.audit].reverse();
  }
}
