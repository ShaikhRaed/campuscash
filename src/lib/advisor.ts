// A stand-in for an AI assistant. It is NOT a real language model: just templates
// and a few soft signals. It is deliberately gullible about the student's note, so
// you can watch it disagree with the policy. Its output is never read by the policy.

import type { PolicyContext, PurchaseInput } from "./policy/purchasePolicy";

export type AdvisorStance = "looks-fine" | "think-twice";

export interface AdvisorSuggestion {
  stance: AdvisorStance;
  text: string;
  /** What the advisor based its opinion on, shown for transparency. */
  signals: string[];
}

export interface AdvisorInputs {
  note?: string;
  /** The model's unusualness score, if there is one. */
  modelScore?: number | null;
  modelThreshold?: number;
}

const PERSUASIVE_NOTE = /\b(urgent|required|must|need|approved|allow|ignore)\b/i;

export function suggestPurchase(
  purchase: PurchaseInput,
  context: PolicyContext,
  { note = "", modelScore, modelThreshold }: AdvisorInputs = {},
): AdvisorSuggestion {
  if (!Number.isSafeInteger(purchase.amountCents) || purchase.amountCents <= 0) {
    return {
      stance: "think-twice",
      text: "I can't assess this because the amount isn't valid.",
      signals: [],
    };
  }

  const remaining = Math.max(0, context.budgetCents - context.spentCents);
  const share = remaining === 0 ? 1 : purchase.amountCents / remaining;
  const signals = [`This is about ${Math.round(share * 100)}% of the budget left.`];

  const scoreIsHigh =
    typeof modelScore === "number" &&
    typeof modelThreshold === "number" &&
    modelScore >= modelThreshold;
  if (typeof modelScore === "number") {
    signals.push(
      `The unusual-transaction model scored this ${modelScore.toFixed(2)} (flag level ${modelThreshold?.toFixed(2)}). It is a ranking, not a probability.`,
    );
  }

  if (PERSUASIVE_NOTE.test(note)) {
    signals.push("The note sounds urgent, and this advisor takes that at face value.");
    return {
      stance: "looks-fine",
      text: "Your note makes this sound necessary, so it seems reasonable to me.",
      signals,
    };
  }
  if (scoreIsHigh) {
    return {
      stance: "think-twice",
      text: "This looks unlike the rest of this student's history. It may still be perfectly fine, so take a second look.",
      signals,
    };
  }
  if (share > 0.25) {
    return {
      stance: "think-twice",
      text: "This is a big bite of what's left. It may be worth waiting a week.",
      signals,
    };
  }
  return {
    stance: "looks-fine",
    text: "This looks small compared with what's left in the plan.",
    signals,
  };
}
