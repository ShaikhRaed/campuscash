// The gatekeeper for simulated purchases. The order of the checks matters:
//
//   1. Shape         is this even a valid request?
//   2. Idempotency   have we already handled this exact attempt? Then repeat the answer.
//   3. Signature     was this authorization signed, and is it unchanged?
//   4. Expiry        is it still within its time window?
//   5. Scope         does this purchase fit what was authorized?
//   6. Nonce         has this authorization been used already?
//   7. Policy        do the deterministic purchase rules agree?
//   8. Commit        record it exactly once.
//
// Only a success is remembered. A failed attempt uses up neither its key nor its nonce.
// "Recording" means adding a row to an in-memory demo list. No money ever moves.

import type { KeyObject } from "node:crypto";
import {
  evaluatePurchasePolicy,
  normalizeMerchant,
  type PolicyContext,
  type PolicyResult,
} from "../policy/purchasePolicy";
import { parseExecuteRequest } from "./schema";
import type { RequestStore, SimulatedPurchase } from "./requestStore";
import { fingerprint, verifyRecord } from "./signature";

export type Outcome =
  | "RECORDED"
  | "MALFORMED"
  | "IDEMPOTENCY_CONFLICT"
  | "BAD_SIGNATURE"
  | "EXPIRED"
  | "OUT_OF_SCOPE"
  | "REPLAY"
  | "POLICY_DENIED"
  | "CHALLENGE_REQUIRED";

export interface ProcessResult {
  status: number;
  body: {
    outcome: Outcome;
    message: string;
    /** True when this is a retry answered from the stored first response. */
    retried?: boolean;
    purchase?: SimulatedPurchase;
    policy?: PolicyResult;
  };
}

export interface ProcessDeps {
  now: () => Date;
  publicKey: KeyObject;
  store: RequestStore;
  /** Returns undefined for an unknown profile or week. */
  getContext: (
    profileId: string,
    week: number,
    earlier: SimulatedPurchase[],
  ) => PolicyContext | undefined;
}

const fail = (
  status: number,
  outcome: Outcome,
  message: string,
  policy?: PolicyResult,
): ProcessResult => ({
  status,
  body: { outcome, message, ...(policy && { policy }) },
});

const same = (a: string, b: string) => normalizeMerchant(a) === normalizeMerchant(b);

export function processPurchaseRequest(raw: unknown, deps: ProcessDeps): ProcessResult {
  const { store, publicKey } = deps;

  const request = parseExecuteRequest(raw);
  if (!request) {
    return fail(400, "MALFORMED", "The request is missing required fields or has invalid values.");
  }
  const { idempotencyKey, purchase, signedAuthorization } = request;
  const { authorization, signature } = signedAuthorization;

  const requestFingerprint = fingerprint({ purchase, signedAuthorization });
  const earlier = store.findByKey(idempotencyKey);
  if (earlier) {
    if (earlier.fingerprint !== requestFingerprint) {
      return fail(409, "IDEMPOTENCY_CONFLICT", "This idempotency key was already used for a different request.");
    }
    return {
      status: earlier.response.status,
      body: {
        ...(earlier.response.body as ProcessResult["body"]),
        retried: true,
        message: "Safe retry: this attempt was already recorded, so nothing was added.",
      },
    };
  }

  if (!verifyRecord(authorization, signature, publicKey)) {
    return fail(401, "BAD_SIGNATURE", "The signature does not match this authorization, so it was changed or not signed by the demo key.");
  }

  const nowMs = deps.now().getTime();
  if (Date.parse(authorization.expiresAt) <= nowMs) {
    return fail(403, "EXPIRED", "This authorization has expired.");
  }

  const { scope, maxAmountCents, profileId, week } = authorization;
  if (scope.merchant !== undefined && !same(scope.merchant, purchase.merchant)) {
    return fail(403, "OUT_OF_SCOPE", `This authorization only covers ${scope.merchant}.`);
  }
  if (scope.category !== undefined && !same(scope.category, purchase.category)) {
    return fail(403, "OUT_OF_SCOPE", `This authorization only covers the ${scope.category} category.`);
  }
  if (purchase.amountCents > maxAmountCents) {
    return fail(403, "OUT_OF_SCOPE", "The amount is above this authorization's maximum.");
  }

  if (store.isNonceUsed(authorization.nonce)) {
    return fail(409, "REPLAY", "This authorization was already used, and each one works only once.");
  }

  const context = deps.getContext(profileId, week, store.purchasesFor(profileId, week));
  if (!context) {
    return fail(403, "OUT_OF_SCOPE", "This authorization's profile or week is not valid.");
  }
  const policy = evaluatePurchasePolicy(purchase, context);
  if (policy.decision === "DENY") {
    return fail(403, "POLICY_DENIED", policy.explanation, policy);
  }
  if (policy.decision === "CHALLENGE" && !authorization.challengeConfirmed) {
    return fail(403, "CHALLENGE_REQUIRED", "This purchase needs confirmation, and the signed authorization does not include it.", policy);
  }

  const recorded: SimulatedPurchase = {
    id: `sim_${authorization.authorizationId}`,
    profileId,
    week,
    ...purchase,
  };
  const response: ProcessResult = {
    status: 201,
    body: {
      outcome: "RECORDED",
      message: "Simulated purchase recorded in the demo list. No money moved.",
      purchase: recorded,
      policy,
    },
  };
  const commit = store.commit({
    key: idempotencyKey,
    fingerprint: requestFingerprint,
    nonce: authorization.nonce,
    purchase: recorded,
    response,
  });
  if (!commit.ok) {
    return commit.conflict === "nonce"
      ? fail(409, "REPLAY", "This authorization was already used, and each one works only once.")
      : fail(409, "IDEMPOTENCY_CONFLICT", "This idempotency key was already used.");
  }
  return response;
}
