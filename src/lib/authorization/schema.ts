// Everything arriving over the network is untrusted, so we check its shape first.
// These parsers copy only the known fields, so unexpected extras are dropped.

export interface AuthorizationScope {
  /** At least one of these must be present. */
  merchant?: string;
  category?: string;
}

export interface Authorization {
  version: 1;
  authorizationId: string;
  profileId: string;
  /** The simulated week being judged. Signed, so a client can't choose a kinder one. */
  week: number;
  scope: AuthorizationScope;
  maxAmountCents: number;
  issuedAt: string;
  expiresAt: string;
  /** One-time value. Once used, this authorization can never be used again. */
  nonce: string;
  /** True if the student confirmed the purchase when asked. */
  challengeConfirmed: boolean;
}

export interface SignedAuthorization {
  authorization: Authorization;
  signature: string;
}

export interface ExecuteRequest {
  /** Chosen by the client per attempt. A retry reuses the same key. */
  idempotencyKey: string;
  purchase: { merchant: string; category: string; amountCents: number };
  signedAuthorization: SignedAuthorization;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v: unknown, max = 200): v is string =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max;
const isPositiveCents = (v: unknown): v is number =>
  Number.isSafeInteger(v) && (v as number) > 0;
const isIsoDate = (v: unknown): v is string =>
  typeof v === "string" &&
  !Number.isNaN(Date.parse(v)) &&
  new Date(v).toISOString() === v;

function parseAuthorization(v: unknown): Authorization | null {
  if (!isRecord(v) || !isRecord(v.scope)) return null;
  const { merchant, category } = v.scope;
  if (merchant === undefined && category === undefined) return null;
  if (merchant !== undefined && !isText(merchant)) return null;
  if (category !== undefined && !isText(category)) return null;
  if (
    v.version !== 1 ||
    !isText(v.authorizationId) ||
    !isText(v.profileId) ||
    !Number.isInteger(v.week) ||
    !isPositiveCents(v.maxAmountCents) ||
    !isIsoDate(v.issuedAt) ||
    !isIsoDate(v.expiresAt) ||
    !isText(v.nonce) ||
    typeof v.challengeConfirmed !== "boolean"
  ) {
    return null;
  }
  return {
    version: 1,
    authorizationId: v.authorizationId,
    profileId: v.profileId,
    week: v.week as number,
    scope: {
      ...(merchant !== undefined && { merchant: merchant as string }),
      ...(category !== undefined && { category: category as string }),
    },
    maxAmountCents: v.maxAmountCents,
    issuedAt: v.issuedAt,
    expiresAt: v.expiresAt,
    nonce: v.nonce,
    challengeConfirmed: v.challengeConfirmed,
  };
}

/** Returns a clean request, or null if anything is missing or the wrong type. */
export function parseExecuteRequest(raw: unknown): ExecuteRequest | null {
  if (!isRecord(raw) || !isRecord(raw.purchase) || !isRecord(raw.signedAuthorization)) {
    return null;
  }
  const { idempotencyKey, purchase, signedAuthorization } = raw;
  if (
    typeof idempotencyKey !== "string" ||
    !/^[A-Za-z0-9_-]{8,128}$/.test(idempotencyKey) ||
    !isText(purchase.merchant) ||
    !isText(purchase.category, 40) ||
    !isPositiveCents(purchase.amountCents) ||
    !isText(signedAuthorization.signature, 200)
  ) {
    return null;
  }
  const authorization = parseAuthorization(signedAuthorization.authorization);
  if (!authorization) return null;

  return {
    idempotencyKey,
    purchase: {
      merchant: purchase.merchant,
      category: purchase.category,
      amountCents: purchase.amountCents,
    },
    signedAuthorization: {
      authorization,
      signature: signedAuthorization.signature,
    },
  };
}
