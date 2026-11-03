import { describe, expect, it } from "vitest";
import { findProfile } from "@/data/profiles";
import { buildReviewQueue, scoreHypothetical } from "./ml/savedModel";
import type { PolicyContext } from "./policy/purchasePolicy";
import { reviewPurchase } from "./reviewPurchase";

const context: PolicyContext = {
  budgetCents: 100_000,
  spentCents: 40_000,
  paceCents: 3_000,
  weeksLeft: 6,
  knownMerchants: ["Campus Bookstore"],
  limits: { challengeAboveCents: 15_000, hardLimitCents: 40_000 },
};
const purchase = { merchant: "Campus Bookstore", category: "books", amountCents: 4_000 };
const maya = findProfile("maya")!;

describe("model scores are advisory", () => {
  it.each([0, 0.5, 0.99999, 1])("score %s leaves the policy result unchanged", (modelScore) => {
    const baseline = reviewPurchase(purchase, context, {});
    const scored = reviewPurchase(purchase, context, { modelScore, modelThreshold: 0.5 });
    expect(scored.policy).toEqual(baseline.policy);
  });

  it("changes the advisor but not the decision", () => {
    const high = reviewPurchase(purchase, context, { modelScore: 0.99, modelThreshold: 0.5 });
    expect(high.suggestion.stance).toBe("think-twice");
    expect(high.policy.decision).toBe("ALLOW");
  });

  it("cannot rescue a denied purchase with a low score", () => {
    const denied = { ...purchase, merchant: "QuickCash Advance" };
    const low = reviewPurchase(denied, context, { modelScore: 0, modelThreshold: 0.5 });
    expect(low.suggestion.stance).toBe("looks-fine");
    expect(low.policy.decision).toBe("DENY");
  });
});

describe("invalid input to the advisor", () => {
  it.each([Number.NaN, 0, -100])("gives a clear message for amount %s, not NaN", (amountCents) => {
    const { suggestion, policy } = reviewPurchase({ ...purchase, amountCents }, context, {});
    expect(suggestion.text).toMatch(/isn't valid/);
    expect(JSON.stringify(suggestion)).not.toMatch(/NaN/);
    expect(policy.decision).toBe("DENY");
  });
});

describe("saved model on sample profiles", () => {
  it("scores between 0 and 1 and refuses malformed amounts", () => {
    const score = scoreHypothetical(maya, 10, purchase)!;
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
    expect(scoreHypothetical(maya, 10, { ...purchase, amountCents: Number.NaN })).toBeNull();
    expect(scoreHypothetical(maya, 10, { ...purchase, amountCents: -1 })).toBeNull();
  });

  it("builds a queue limited in size, sorted, and with no income or future rows", () => {
    const queue = buildReviewQueue(maya, 10, 5);
    expect(queue.items.length).toBeLessThanOrEqual(5);
    const scores = queue.items.map((i) => i.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    for (const item of queue.items) {
      expect(item.transaction.direction).toBe("debit");
      expect(item.transaction.date <= "2026-11-01").toBe(true);
    }
  });
});
