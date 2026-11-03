// In-memory stand-in for a database table with two UNIQUE constraints: one on the
// idempotency key and one on the nonce. commit() checks both, then writes, with no
// "await" in between, so nothing else can run between the check and the write.
// A real system would need a database to get this guarantee across several servers.

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

export type CommitResult = { ok: true } | { ok: false; conflict: "key" | "nonce" };

export class RequestStore {
  private byKey = new Map<string, IdempotencyRecord>();
  private usedNonces = new Set<string>();
  private purchases: SimulatedPurchase[] = [];

  findByKey(key: string): IdempotencyRecord | undefined {
    return this.byKey.get(key);
  }

  isNonceUsed(nonce: string): boolean {
    return this.usedNonces.has(nonce);
  }

  /** All-or-nothing: on a conflict, nothing is written. */
  commit(entry: {
    key: string;
    fingerprint: string;
    nonce: string;
    purchase: SimulatedPurchase;
    response: StoredResponse;
  }): CommitResult {
    if (this.byKey.has(entry.key)) return { ok: false, conflict: "key" };
    if (this.usedNonces.has(entry.nonce)) return { ok: false, conflict: "nonce" };
    this.byKey.set(entry.key, {
      fingerprint: entry.fingerprint,
      response: entry.response,
    });
    this.usedNonces.add(entry.nonce);
    this.purchases.push(entry.purchase);
    return { ok: true };
  }

  purchasesFor(profileId: string, throughWeek = Infinity): SimulatedPurchase[] {
    return this.purchases.filter(
      (p) => p.profileId === profileId && p.week <= throughWeek,
    );
  }

  reset(): void {
    this.byKey.clear();
    this.usedNonces.clear();
    this.purchases = [];
  }
}
