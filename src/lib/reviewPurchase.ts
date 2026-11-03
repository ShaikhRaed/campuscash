// Puts the advisory and binding pieces side by side. The important line is the call to
// evaluatePurchasePolicy: it receives only the purchase and the trusted context. Notes,
// model scores and retrieved documents can reach the advisor, never the policy.

import { suggestPurchase, type AdvisorInputs } from "./advisor";
import {
  evaluatePurchasePolicy,
  type PolicyContext,
  type PurchaseInput,
} from "./policy/purchasePolicy";

export function reviewPurchase(
  purchase: PurchaseInput,
  context: PolicyContext,
  advisorInputs: AdvisorInputs,
) {
  return {
    suggestion: suggestPurchase(purchase, context, advisorInputs),
    policy: evaluatePurchasePolicy(purchase, context),
  };
}
