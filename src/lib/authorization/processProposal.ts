// Checks one signed purchase proposal and records the result.
//
// Order:
//   1. request shape
//   2. idempotency key (an identical retry gets the stored answer)
//   3. grant signature, proposal signature, proposal points at this grant
//   4. nonce
//   5. scope: grant active, valid week, merchant, category, remaining allowance
//   6. purchase policy
//   7. commit: store the decision, use up the nonce, record a purchase if ALLOW
//
// A failure in 1-4 is REJECTED: no decision, nothing stored, so the key and nonce stay unused.
// Steps 5-6 always produce ALLOW, CHALLENGE or DENY. Every attempt goes in the audit log.
//
// Nothing in here sees the student's free text or the raw model output, only the signed
// fields. Those fields can still come from a model that was manipulated, and a wrong but
// in-scope value will pass (see the injection results in docs/EVALUATION.md).

import type { KeyObject } from "node:crypto";
import { formatCents } from "../money";
import {
  evaluatePurchasePolicy,
  normalizeMerchant,
  POLICY_RULES,
  type Decision,
  type PolicyContext,
  type PolicyResult,
} from "../policy/purchasePolicy";
import type { AuditEntry, RequestStore, SimulatedPurchase } from "./requestStore";
import { parseEvaluationRequest } from "./schema";
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
    /** True when this answer came from the stored first response. */
    retried?: boolean;
    purchase?: SimulatedPurchase;
  };
}

export interface ProcessDeps {
  now: () => Date;
  /** The server's simulated clock. A request can't set it. */
  currentWeek: () => number;
  studentPublicKey: KeyObject;
  assistantPublicKey: KeyObject;
  store: RequestStore;
  activeGrantId: (profileId: string) => string | null;
  /** Returns undefined for an unknown profile. */
  getContext: (profileId: string, week: number, earlier: SimulatedPurchase[]) => PolicyContext | undefined;
}

/** The request details saved with each audit entry. */
type AuditDetails = Pick<AuditEntry, "idempotencyKey" | "nonce" | "grantId" | "profileId" | "merchant" | "amountCents">;

function sameName(a: string, b: string): boolean {
  return normalizeMerchant(a) === normalizeMerchant(b);
}

/** A request that couldn't be parsed only gets its claimed key (if any) in the audit log. */
function detailsFromUnparsedRequest(raw: unknown): AuditDetails {
  let idempotencyKey: string | null = null;
  if (typeof raw === "object" && raw !== null) {
    const claimed = (raw as { idempotencyKey?: unknown }).idempotencyKey;
    if (typeof claimed === "string") idempotencyKey = claimed.slice(0, 128);
  }
  return { idempotencyKey, nonce: null, grantId: null, profileId: null, merchant: null, amountCents: null };
}

export function processProposal(raw: unknown, deps: ProcessDeps): ProcessResult {
  const { store } = deps;
  const week = deps.currentWeek();
  const trace: TraceStep[] = [];

  function step(layer: TraceLayer, check: string, status: TraceStatus, detail: string) {
    trace.push({ layer, check, status, detail });
  }

  function audit(result: ProcessResult, details: AuditDetails): ProcessResult {
    store.appendAudit({
      at: deps.now().toISOString(),
      week,
      outcome: result.body.outcome,
      decision: result.body.decision,
      reason: result.body.reason,
      ...details,
    });
    return result;
  }

  // 1. Shape. The parser only copies known fields, so extras like a note, a model score or a
  // "decision" field are gone before anything below runs.
  const request = parseEvaluationRequest(raw);
  if (!request) {
    const reason = "The request is missing required fields or has invalid values.";
    step("request", "Shape", "FAIL", reason);
    return audit(
      { status: 400, body: { outcome: "REJECTED_MALFORMED", decision: null, reason, trace } },
      detailsFromUnparsedRequest(raw),
    );
  }
  step("request", "Shape", "PASS", "All required fields are present and valid.");

  const { idempotencyKey, signedGrant, signedProposal } = request;
  const { grant } = signedGrant;
  const { proposal } = signedProposal;
  const details: AuditDetails = {
    idempotencyKey,
    nonce: proposal.nonce,
    grantId: grant.grantId,
    profileId: grant.profileId,
    merchant: proposal.merchant,
    amountCents: proposal.amountCents,
  };

  // Failures in steps 2-4 store nothing, so they don't use up the key or the nonce. That way
  // a forged or broken request can't block the real one that uses the same values.
  function reject(status: number, outcome: Outcome, check: string, reason: string): ProcessResult {
    step("request", check, "FAIL", reason);
    return audit({ status, body: { outcome, decision: null, reason, trace } }, details);
  }

  // 2. Idempotency key. This runs before signature verification on purpose. A stored answer
  // only exists for a request that already passed every check, and it's only returned when
  // the new request has the same fingerprint: both signed records, signatures included (not
  // the key itself). So skipping verification here only hands back an answer to someone
  // sending that exact request again, and a retry still gets its answer after the clock moves.
  // It does reveal one thing: a 409 tells the caller the key is already in use.
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
    step("request", "Idempotency key", "PASS", "Seen before with an identical request, so the stored answer is returned.");
    return audit(
      {
        status: earlier.response.status,
        body: {
          ...original,
          outcome: "RETRY_RETURNED_STORED",
          retried: true,
          reason: `Safe retry: returned the stored ${original.decision} decision. Nothing was evaluated or added again.`,
          // This attempt's own trace, which shows nothing after this step ran again.
          trace,
        },
      },
      details,
    );
  }
  step("request", "Idempotency key", "PASS", "First time this key has been seen.");

  // 3. Signatures. They show each record was signed by the demo key and not changed since.
  // They don't show who clicked anything: both keys live in this server process.
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

  // 4. Nonce. An early check for a clear error. commit() checks it again when it writes.
  if (store.isNonceUsed(proposal.nonce)) {
    return reject(409, "REJECTED_REPLAY", "Nonce", "This signed proposal was already evaluated. Each one works only once.");
  }
  step("request", "Nonce", "PASS", "This nonce has not been used.");

  // 5. Scope. A failure here is a DENY rather than a rejection: the request is genuine and
  // the answer is no. Every check runs so the trace shows all the problems at once.
  const denials: string[] = [];
  function scopeCheck(check: string, passed: boolean, passDetail: string, failDetail: string) {
    step("authorization", check, passed ? "PASS" : "FAIL", passed ? passDetail : failDetail);
    if (!passed) denials.push(failDetail);
  }

  scopeCheck(
    "Grant is active",
    deps.activeGrantId(grant.profileId) === grant.grantId,
    "This is the student's current grant.",
    "This grant was revoked or replaced.",
  );

  const from = grant.validFromWeek;
  const through = grant.validThroughWeek;
  let periodProblem = `Expired: week ${week} is after the grant ended in week ${through}.`;
  if (week < from) periodProblem = `Week ${week} is before the grant starts in week ${from}.`;
  scopeCheck("Within valid period", week >= from && week <= through, `Week ${week} is within weeks ${from}-${through}.`, periodProblem);

  if (grant.scope.merchant !== undefined) {
    scopeCheck(
      "Merchant in scope",
      sameName(grant.scope.merchant, proposal.merchant),
      `Matches ${grant.scope.merchant}.`,
      `The grant only covers ${grant.scope.merchant}.`,
    );
  }
  // The category can come from the model's guess, which isn't checked against the student's
  // text. A relabeled category passes this check.
  if (grant.scope.category !== undefined) {
    scopeCheck(
      "Category in scope",
      sameName(grant.scope.category, proposal.category),
      `Matches ${grant.scope.category}.`,
      `The grant only covers the ${grant.scope.category} category, not ${proposal.category}.`,
    );
  }

  const remaining = grant.limitCents - store.allowanceUsed(grant.grantId);
  scopeCheck(
    "Within remaining allowance",
    proposal.amountCents <= remaining,
    `${formatCents(proposal.amountCents)} of ${formatCents(remaining)} remaining.`,
    `${formatCents(proposal.amountCents)} is more than the ${formatCents(remaining)} remaining on this grant.`,
  );

  // 6. Policy. It only gets the three structured fields and server-side budget state.
  const purchase = {
    merchant: proposal.merchant,
    category: proposal.category,
    amountCents: proposal.amountCents,
  };
  const context = deps.getContext(grant.profileId, week, store.purchasesFor(grant.profileId, week));
  let policy: PolicyResult | null = null;
  if (!context) {
    scopeCheck("Known profile", false, "", "This grant names an unknown profile.");
    for (const rule of POLICY_RULES) step("policy", rule.label, "NOT_RUN", "No budget state for this profile.");
  } else {
    policy = evaluatePurchasePolicy(purchase, context);
    for (const rule of POLICY_RULES) {
      const fired = policy.reasons.find((r) => r.ruleId === rule.ruleId);
      if (!fired) step("policy", rule.label, "PASS", "Passed.");
      else if (fired.outcome === "DENY") step("policy", rule.label, "FAIL", fired.message);
      else step("policy", rule.label, "CHALLENGE", fired.message);
    }
  }

  // Strictest result wins: any DENY, then any CHALLENGE, otherwise ALLOW.
  const policyReasons = policy?.reasons ?? [];
  const allDenials = [...denials, ...policyReasons.filter((r) => r.outcome === "DENY").map((r) => r.message)];
  const challenges = policyReasons.filter((r) => r.outcome === "CHALLENGE").map((r) => r.message);

  let decision: Decision;
  let reason: string;
  if (allDenials.length > 0) {
    decision = "DENY";
    reason = allDenials.join(" ");
  } else if (challenges.length > 0) {
    decision = "CHALLENGE";
    reason = `Would need the student's confirmation. The sandbox stops here and records nothing as spent. ${challenges.join(" ")}`;
  } else {
    decision = "ALLOW";
    reason = "Within the grant and passed every policy rule. Recorded as a simulated purchase. No money moved.";
  }

  // 7. Commit. Only ALLOW records a purchase, which is what uses budget and allowance.
  // CHALLENGE records nothing: there's no confirmation step to finish it.
  // Every decision, DENY and CHALLENGE included, is stored under the key and uses up the nonce.
  // Otherwise the same signed proposal could be sent again later, after the clock or the
  // budget changed, to try for a different answer.
  let recorded: SimulatedPurchase | undefined;
  if (decision === "ALLOW") {
    recorded = { id: `${grant.grantId}:${proposal.nonce}`, profileId: grant.profileId, week, ...purchase };
  }
  const response: ProcessResult = {
    status: 200,
    body: { outcome: "EVALUATED", decision, reason, trace, ...(recorded && { purchase: recorded }) },
  };

  // commit() re-checks the key and the nonce and writes both in one step. Nothing in this
  // function awaits, so within one Node process no other request can run in between. The
  // re-check is what actually guarantees uniqueness; the early checks are for clear errors.
  const commit = store.commit({
    key: idempotencyKey,
    fingerprint: requestFingerprint,
    nonce: proposal.nonce,
    purchase: recorded,
    response,
  });
  if (!commit.ok) {
    if (commit.conflict === "nonce") {
      return reject(409, "REJECTED_REPLAY", "Nonce", "This signed proposal was already evaluated.");
    }
    return reject(409, "REJECTED_IDEMPOTENCY_CONFLICT", "Idempotency key", "This idempotency key was already used.");
  }
  return audit(response, details);
}
