// The two signed records in the sandbox, and strict parsing of everything that arrives
// over the network. Parsers copy known fields only, so unexpected extras (a note, a model
// score, "approved: true") are dropped before any check runs.

export interface GrantScope {
  /** At least one of these must be present. */
  merchant?: string;
  category?: string;
}

/** The student's standing permission for the hypothetical assistant. */
export interface Grant {
  version: 2;
  grantId: string;
  profileId: string;
  scope: GrantScope;
  /** The most the assistant may propose in total under this grant. */
  limitCents: number;
  /** Inclusive range on the sandbox's simulated week clock. */
  validFromWeek: number;
  validThroughWeek: number;
  issuedAt: string;
}

/** One purchase the hypothetical assistant would like to make. */
export interface Proposal {
  version: 2;
  grantId: string;
  /** One-time value. A signed proposal can be evaluated only once. */
  nonce: string;
  merchant: string;
  category: string;
  amountCents: number;
}

export interface SignedGrant {
  grant: Grant;
  signature: string;
}

export interface SignedProposal {
  proposal: Proposal;
  signature: string;
}

export interface EvaluationRequest {
  /** Chosen per attempt. A retry reuses the same key. */
  idempotencyKey: string;
  signedGrant: SignedGrant;
  signedProposal: SignedProposal;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v: unknown, max = 200): v is string =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max;
const isPositiveCents = (v: unknown): v is number =>
  Number.isSafeInteger(v) && (v as number) > 0;
const isIsoDate = (v: unknown): v is string =>
  typeof v === "string" && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString() === v;

export function parseScope(v: unknown): GrantScope | null {
  if (!isRecord(v)) return null;
  const { merchant, category } = v;
  if (merchant === undefined && category === undefined) return null;
  if (merchant !== undefined && !isText(merchant)) return null;
  if (category !== undefined && !isText(category, 40)) return null;
  return {
    ...(merchant !== undefined && { merchant: merchant as string }),
    ...(category !== undefined && { category: category as string }),
  };
}

function parseGrant(v: unknown): Grant | null {
  if (!isRecord(v)) return null;
  const scope = parseScope(v.scope);
  if (
    !scope ||
    v.version !== 2 ||
    !isText(v.grantId) ||
    !isText(v.profileId) ||
    !isPositiveCents(v.limitCents) ||
    !Number.isInteger(v.validFromWeek) ||
    !Number.isInteger(v.validThroughWeek) ||
    !isIsoDate(v.issuedAt)
  ) {
    return null;
  }
  return {
    version: 2,
    grantId: v.grantId,
    profileId: v.profileId,
    scope,
    limitCents: v.limitCents,
    validFromWeek: v.validFromWeek as number,
    validThroughWeek: v.validThroughWeek as number,
    issuedAt: v.issuedAt,
  };
}

function parseProposal(v: unknown): Proposal | null {
  if (
    !isRecord(v) ||
    v.version !== 2 ||
    !isText(v.grantId) ||
    !isText(v.nonce) ||
    !isText(v.merchant) ||
    !isText(v.category, 40) ||
    !isPositiveCents(v.amountCents)
  ) {
    return null;
  }
  return {
    version: 2,
    grantId: v.grantId,
    nonce: v.nonce,
    merchant: v.merchant,
    category: v.category,
    amountCents: v.amountCents,
  };
}

/** Returns a clean request, or null if anything is missing or the wrong type. */
export function parseEvaluationRequest(raw: unknown): EvaluationRequest | null {
  if (!isRecord(raw) || !isRecord(raw.signedGrant) || !isRecord(raw.signedProposal)) return null;
  const { idempotencyKey, signedGrant, signedProposal } = raw;
  if (
    typeof idempotencyKey !== "string" ||
    !/^[A-Za-z0-9_-]{8,128}$/.test(idempotencyKey) ||
    !isText(signedGrant.signature, 200) ||
    !isText(signedProposal.signature, 200)
  ) {
    return null;
  }
  const grant = parseGrant(signedGrant.grant);
  const proposal = parseProposal(signedProposal.proposal);
  if (!grant || !proposal) return null;
  return {
    idempotencyKey,
    signedGrant: { grant, signature: signedGrant.signature },
    signedProposal: { proposal, signature: signedProposal.signature },
  };
}
