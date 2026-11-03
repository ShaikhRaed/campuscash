// The trusted pipeline: every hypothetical purchase proposal passes through here.
//
// REQUEST CHECKS: can this request be evaluated at all? Failure means REJECTED, no decision.
//   1. Shape           is it a valid request?
//   2. Idempotency     have we already answered this exact attempt? Repeat the answer.
//   3. Grant signature did the demo student key sign this grant, unchanged?
//   4. Proposal sig.   did the demo assistant key sign this proposal, unchanged?
//   5. Grant link      is the proposal made under this grant?
//   6. Nonce           has this signed proposal already been evaluated?
//
// AUTHORIZATION CHECKS: is it within what the student permitted? Failure means DENY.
//   active grant, profile, period, merchant, category, remaining allowance
//
// POLICY RULES: evaluatePurchasePolicy, which can give ALLOW, CHALLENGE or DENY.
//
// The result is the strictest of the last two. It is stored once and audited every time.
// Nothing here receives free text, raw model output, model scores or retrieved documents.
// "Recording" adds a row to an in-memory list. No money moves and nothing is bought.

import type { KeyObject } from "node:crypto";
import {
  evaluatePurchasePolicy,
  normalizeMerchant,
  POLICY_RULES,
  type Decision,
  type PolicyContext,
} from "../policy/purchasePolicy";
import { parseEvaluationRequest } from "./schema";
import type { RequestStore, SimulatedPurchase } from "./requestStore";
import { fingerprint, verifyRecord } from "./signature";

export type Outcome =
  | "EVALUATED"
  | "RETRY_RETURNED_STORED"
  | "REJECTED_MALFORMED"
  | "REJECTED_IDEMPOTENCY_CONFLICT"
  | "REJECTED_BAD_SIGNATURE"
  | "REJECTED_GRANT_MISMATCH"
  | "REJECTED_REPLAY";

export type TraceLayer = "request" | "authorization" | "policy";
export type TraceStatus = "PASS" | "FAIL" | "CHALLENGE" | "NOT_RUN";

export interface TraceStep {
  layer: TraceLayer;
  check: string;
  status: TraceStatus;
  detail: string;
}

export interface ProcessResult {
  status: number;
  body: {
    outcome: Outcome;
    /** Null when the request was rejected before any decision. */
    decision: Decision | null;
    reason: string;
    trace: TraceStep[];
    /** True when this is a retry answered from the stored first response. */
    retried?: boolean;
    purchase?: SimulatedPurchase;
  };
}

export interface ProcessDeps {
  now: () => Date;
  /** The server's simulated clock. Clients cannot set it through a request. */
  currentWeek: () => number;
  studentPublicKey: KeyObject;
  assistantPublicKey: KeyObject;
  store: RequestStore;
  activeGrantId: (profileId: string) => string | null;
  /** Returns undefined for an unknown profile. */
  getContext: (profileId: string, week: number, earlier: SimulatedPurchase[]) => PolicyContext | undefined;
}

const same = (a: string, b: string) => normalizeMerchant(a) === normalizeMerchant(b);
const dollars = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

/** Best-effort details for auditing a request that failed validation. */
function claimed(raw: unknown) {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" ? v.slice(0, 128) : null);
  const key = text(r.idempotencyKey);
  return { idempotencyKey: key };
}

export function processProposal(raw: unknown, deps: ProcessDeps): ProcessResult {
  const { store } = deps;
  const week = deps.currentWeek();
  const trace: TraceStep[] = [];
  const step = (layer: TraceLayer, check: string, status: TraceStatus, detail: string) =>
    trace.push({ layer, check, status, detail });

  const audit = (
    result: ProcessResult,
    fields: Partial<Parameters<RequestStore["appendAudit"]>[0]> = {},
  ) => {
    store.appendAudit({
      at: deps.now().toISOString(),
      week,
      outcome: result.body.outcome,
      decision: result.body.decision,
      reason: result.body.reason,
      idempotencyKey: null,
      nonce: null,
      grantId: null,
      profileId: null,
      merchant: null,
      amountCents: null,
      ...fields,
    });
    return result;
  };

  const request = parseEvaluationRequest(raw);
  if (!request) {
    const reason = "The request is missing required fields or has invalid values.";
    step("request", "Shape", "FAIL", reason);
    return audit(
      { status: 400, body: { outcome: "REJECTED_MALFORMED", decision: null, reason, trace } },
      claimed(raw),
    );
  }
  step("request", "Shape", "PASS", "All required fields are present and valid.");

  const { idempotencyKey, signedGrant, signedProposal } = request;
  const { grant } = signedGrant;
  const { proposal } = signedProposal;
  const auditFields = {
    idempotencyKey,
    nonce: proposal.nonce,
    grantId: grant.grantId,
    profileId: grant.profileId,
    merchant: proposal.merchant,
    amountCents: proposal.amountCents,
  };
  const reject = (status: number, outcome: Outcome, check: string, reason: string) => {
    step("request", check, "FAIL", reason);
    return audit({ status, body: { outcome, decision: null, reason, trace } }, auditFields);
  };

  const requestFingerprint = fingerprint({ signedGrant, signedProposal });
  const earlier = store.findByKey(idempotencyKey);
  if (earlier) {
    if (earlier.fingerprint !== requestFingerprint) {
      return reject(
        409,
        "REJECTED_IDEMPOTENCY_CONFLICT",
        "Idempotency key",
        "This idempotency key was already used for a different request.",
      );
    }
    const original = earlier.response.body as ProcessResult["body"];
    const reason = `Safe retry: returned the stored ${original.decision} decision. Nothing was evaluated or added again.`;
    step("request", "Idempotency key", "PASS", "Seen before with an identical request, so the stored answer is returned.");
    return audit(
      {
        status: earlier.response.status,
        body: {
          ...original,
          outcome: "RETRY_RETURNED_STORED",
          retried: true,
          reason,
          // This attempt's own trace: the later checks did not run again.
          trace,
        },
      },
      auditFields,
    );
  }
  step("request", "Idempotency key", "PASS", "First time this key has been seen.");

  if (!verifyRecord(grant, signedGrant.signature, deps.studentPublicKey)) {
    return reject(401, "REJECTED_BAD_SIGNATURE", "Grant signature", "The grant was changed, or not signed by the demo student key.");
  }
  step("request", "Grant signature", "PASS", "Signed by the demo student key and unchanged.");

  if (!verifyRecord(proposal, signedProposal.signature, deps.assistantPublicKey)) {
    return reject(401, "REJECTED_BAD_SIGNATURE", "Proposal signature", "The proposal was changed, or not signed by the demo assistant key.");
  }
  step("request", "Proposal signature", "PASS", "Signed by the demo assistant key and unchanged.");

  if (proposal.grantId !== grant.grantId) {
    return reject(400, "REJECTED_GRANT_MISMATCH", "Grant link", "This proposal was made under a different grant.");
  }
  step("request", "Grant link", "PASS", "The proposal names this grant.");

  if (store.isNonceUsed(proposal.nonce)) {
    return reject(409, "REJECTED_REPLAY", "Nonce", "This signed proposal was already evaluated. Each one works only once.");
  }
  step("request", "Nonce", "PASS", "This nonce has not been used.");

  // Authorization checks. These all run, so the trace shows every problem at once.
  const denials: string[] = [];
  const authCheck = (check: string, passed: boolean, passDetail: string, failDetail: string) => {
    step("authorization", check, passed ? "PASS" : "FAIL", passed ? passDetail : failDetail);
    if (!passed) denials.push(failDetail);
  };

  authCheck(
    "Grant is active",
    deps.activeGrantId(grant.profileId) === grant.grantId,
    "This is the student's current grant.",
    "This grant was revoked or replaced.",
  );
  const { validFromWeek: from, validThroughWeek: through } = grant;
  authCheck(
    "Within valid period",
    week >= from && week <= through,
    `Week ${week} is within weeks ${from}-${through}.`,
    week < from
      ? `Week ${week} is before the grant starts in week ${from}.`
      : `Expired: week ${week} is after the grant ended in week ${through}.`,
  );
  if (grant.scope.merchant !== undefined) {
    authCheck(
      "Merchant in scope",
      same(grant.scope.merchant, proposal.merchant),
      `Matches ${grant.scope.merchant}.`,
      `The grant only covers ${grant.scope.merchant}.`,
    );
  }
  if (grant.scope.category !== undefined) {
    authCheck(
      "Category in scope",
      same(grant.scope.category, proposal.category),
      `Matches ${grant.scope.category}.`,
      `The grant only covers the ${grant.scope.category} category, not ${proposal.category}.`,
    );
  }
  const used = store.allowanceUsed(grant.grantId);
  const left = grant.limitCents - used;
  authCheck(
    "Within remaining allowance",
    proposal.amountCents <= left,
    `${dollars(proposal.amountCents)} of ${dollars(left)} remaining.`,
    `${dollars(proposal.amountCents)} is more than the ${dollars(left)} remaining on this grant.`,
  );

  // Policy rules. Only structured fields go in.
  const purchase = {
    merchant: proposal.merchant,
    category: proposal.category,
    amountCents: proposal.amountCents,
  };
  const context = deps.getContext(grant.profileId, week, store.purchasesFor(grant.profileId, week));
  if (!context) {
    authCheck("Known profile", false, "", "This grant names an unknown profile.");
    for (const rule of POLICY_RULES) step("policy", rule.label, "NOT_RUN", "No budget state for this profile.");
  }
  const policy = context ? evaluatePurchasePolicy(purchase, context) : null;
  if (policy) {
    for (const rule of POLICY_RULES) {
      const fired = policy.reasons.find((r) => r.ruleId === rule.ruleId);
      step(
        "policy",
        rule.label,
        !fired ? "PASS" : fired.outcome === "DENY" ? "FAIL" : "CHALLENGE",
        fired ? fired.message : "Passed.",
      );
    }
  }

  const policyDenials = policy?.reasons.filter((r) => r.outcome === "DENY").map((r) => r.message) ?? [];
  const challenges = policy?.reasons.filter((r) => r.outcome === "CHALLENGE").map((r) => r.message) ?? [];
  const allDenials = [...denials, ...policyDenials];

  const decision: Decision = allDenials.length > 0 ? "DENY" : challenges.length > 0 ? "CHALLENGE" : "ALLOW";
  const reason = {
    ALLOW: "Within the grant and passed every policy rule. Recorded as a simulated purchase. No money moved.",
    CHALLENGE: `Would need the student's confirmation. The sandbox stops here and records nothing as spent. ${challenges.join(" ")}`,
    DENY: allDenials.join(" "),
  }[decision];

  const recorded: SimulatedPurchase | undefined =
    decision === "ALLOW"
      ? {
          id: `${grant.grantId}:${proposal.nonce}`,
          profileId: grant.profileId,
          week,
          ...purchase,
        }
      : undefined;

  const response: ProcessResult = {
    status: 200,
    body: { outcome: "EVALUATED", decision, reason, trace, ...(recorded && { purchase: recorded }) },
  };
  const commit = store.commit({
    key: idempotencyKey,
    fingerprint: requestFingerprint,
    nonce: proposal.nonce,
    purchase: recorded,
    response,
  });
  if (!commit.ok) {
    return commit.conflict === "nonce"
      ? reject(409, "REJECTED_REPLAY", "Nonce", "This signed proposal was already evaluated.")
      : reject(409, "REJECTED_IDEMPOTENCY_CONFLICT", "Idempotency key", "This idempotency key was already used.");
  }
  return audit(response, auditFields);
}
