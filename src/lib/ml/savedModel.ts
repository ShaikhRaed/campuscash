// Loads the model produced by `npm run eval:ml` and applies it to sample profiles.
// Everything here is advisory: it only produces scores for people to look at.

import results from "@/data/generated/ml-results.json";
import { semester } from "@/data/sampleStudent";
import type { SimulatedProfile } from "@/data/profiles";
import { daysBetween } from "../dates";
import type { PurchaseInput } from "../policy/purchasePolicy";
import { buildBudgetState } from "../simulation";
import type { SimulatedPurchase } from "../authorization/requestStore";
import type { Transaction } from "../types";
import { extractFeatures, FEATURE_NAMES, type MlTransaction } from "./features";
import { predictScore, type LogisticModel } from "./logistic";

const model: LogisticModel = results.primary.model;
export const MODEL_THRESHOLD: number = results.primary.threshold;

function toMl(t: Transaction): MlTransaction {
  return {
    day: daysBetween(semester.startDate, t.date),
    merchant: t.merchant,
    category: t.category,
    amountCents: t.amountCents,
  };
}

function spendingThrough(
  profile: SimulatedProfile,
  week: number,
  simulated: SimulatedPurchase[] = [],
): Transaction[] {
  return buildBudgetState(profile, week, simulated).transactions.filter(
    (t) => t.direction === "debit",
  );
}

/** How unusual would this purchase look, added to the end of the student's history? */
export function scoreHypothetical(
  profile: SimulatedProfile,
  week: number,
  purchase: PurchaseInput,
  simulated: SimulatedPurchase[] = [],
): number | null {
  if (!Number.isSafeInteger(purchase.amountCents) || purchase.amountCents <= 0) return null;
  const history = spendingThrough(profile, week, simulated).map(toMl);
  const features = extractFeatures([
    ...history,
    { ...purchase, day: week * 7 - 1 },
  ]);
  return predictScore(model, features[features.length - 1]);
}

export interface ReviewItem {
  transaction: Transaction;
  score: number;
  /** Plain-language reasons taken from the feature values. */
  reasons: string[];
}

export interface ReviewQueue {
  items: ReviewItem[];
  scoredCount: number;
  flaggedCount: number;
  threshold: number;
}

const at = (name: (typeof FEATURE_NAMES)[number]) => FEATURE_NAMES.indexOf(name);

/** Transactions at or above the threshold, highest score first. */
export function buildReviewQueue(
  profile: SimulatedProfile,
  week: number,
  limit: number,
): ReviewQueue {
  const spending = spendingThrough(profile, week);
  const features = extractFeatures(spending.map(toMl));

  const flagged = spending
    .map((transaction, i) => {
      const f = features[i];
      const reasons: string[] = [];
      if (f[at("new_merchant")] === 1) reasons.push("First purchase at this merchant.");
      const ratio = Math.exp(f[at("amount_vs_category_median")]);
      if (ratio >= 1.5) reasons.push(`About ${ratio.toFixed(1)}x the usual amount for this category.`);
      if (f[at("same_amount_same_merchant_same_day")] === 1) reasons.push("Same amount, merchant and day as another entry.");
      return { transaction, score: predictScore(model, f), reasons };
    })
    .filter((item) => item.score >= MODEL_THRESHOLD)
    .sort((a, b) => b.score - a.score);

  return {
    items: flagged.slice(0, limit),
    scoredCount: spending.length,
    flaggedCount: flagged.length,
    threshold: MODEL_THRESHOLD,
  };
}
