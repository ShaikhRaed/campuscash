import { describe, expect, it } from "vitest";
import { findProfile } from "@/data/profiles";
import { buildPolicyContext } from "../simulation";
import {
  evaluatePurchasePolicy,
  type PolicyContext,
  type PurchaseInput,
} from "./purchasePolicy";

const context: PolicyContext = {
  budgetCents: 100_000,
  spentCents: 40_000,
  paceCents: 3_000,
  weeksLeft: 6,
  knownMerchants: ["Campus Bookstore"],
  limits: { challengeAboveCents: 15_000, hardLimitCents: 40_000 },
};
const textbook: PurchaseInput = {
  merchant: "Campus Bookstore",
  category: "books",
  amountCents: 4_000,
};
const ruleIds = (p: PurchaseInput, c = context) =>
  evaluatePurchasePolicy(p, c).reasons.map((r) => r.ruleId);

describe("purchase policy", () => {
  it("allows a small essential purchase from a known merchant", () => {
    expect(evaluatePurchasePolicy(textbook, context).decision).toBe("ALLOW");
  });

  it("challenges an unknown merchant", () => {
    const result = evaluatePurchasePolicy({ ...textbook, merchant: "New Shop" }, context);
    expect(result.decision).toBe("CHALLENGE");
    expect(ruleIds({ ...textbook, merchant: "New Shop" })).toContain("unknown_merchant");
  });

  it("challenges exactly at the confirmation threshold", () => {
    expect(ruleIds({ ...textbook, amountCents: 15_000 })).toContain("large_purchase");
    expect(ruleIds({ ...textbook, amountCents: 9_999 })).not.toContain("large_purchase");
  });

  it("challenges non-essentials only when the projection is over plan", () => {
    const fun = { ...textbook, category: "social" };
    expect(ruleIds(fun)).not.toContain("nonessential_over_projection");
    expect(ruleIds(fun, { ...context, paceCents: 20_000 })).toContain(
      "nonessential_over_projection",
    );
    expect(ruleIds(textbook, { ...context, paceCents: 20_000 })).not.toContain(
      "nonessential_over_projection",
    );
  });

  it("denies a blocked merchant, ignoring case and spaces", () => {
    const result = evaluatePurchasePolicy(
      { ...textbook, merchant: "  quickcash ADVANCE " },
      context,
    );
    expect(result.decision).toBe("DENY");
  });

  it.each([
    "QuickCash  Advance",
    "quickcash\tadvance",
    "Quick\u200bCash Advance",
    "\uFF31uickCash Advance",
    "\nQUICKCASH\u00A0ADVANCE ",
  ])("denies the disguised blocked merchant %j (regression)", (merchant) => {
    const result = evaluatePurchasePolicy({ ...textbook, merchant }, context);
    expect(result.decision).toBe("DENY");
    expect(result.reasons.map((r) => r.ruleId)).toContain("blocked_merchant");
  });

  it("treats a differently spelled name as unknown, a documented limit", () => {
    const result = evaluatePurchasePolicy({ ...textbook, merchant: "Quick Cash Advance" }, context);
    expect(result.decision).toBe("CHALLENGE");
  });

  it("denies amounts over the hard limit or the remaining budget", () => {
    expect(ruleIds({ ...textbook, amountCents: 40_001 })).toContain("over_hard_limit");
    expect(ruleIds({ ...textbook, amountCents: 1 }, { ...context, spentCents: 100_000 })).toContain(
      "over_remaining_budget",
    );
  });

  it.each([0, -500, 12.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "denies the malformed amount %s",
    (amountCents) => {
      expect(evaluatePurchasePolicy({ ...textbook, amountCents }, context).decision).toBe("DENY");
    },
  );

  it("denies an empty merchant and an unsupported category", () => {
    expect(ruleIds({ ...textbook, merchant: "  " })).toContain("missing_merchant");
    expect(ruleIds({ ...textbook, category: "income" })).toContain("invalid_category");
  });

  it("lets DENY outrank CHALLENGE and reports both", () => {
    const result = evaluatePurchasePolicy(
      { merchant: "New Shop", category: "books", amountCents: 50_000 },
      context,
    );
    expect(result.decision).toBe("DENY");
    expect(result.reasons.map((r) => r.ruleId)).toEqual(
      expect.arrayContaining(["over_hard_limit", "unknown_merchant"]),
    );
  });

  it("is deterministic", () => {
    expect(evaluatePurchasePolicy(textbook, context)).toEqual(
      evaluatePurchasePolicy(textbook, context),
    );
  });
});

describe("policy against real sample profiles", () => {
  const maya = findProfile("maya")!;

  it("gives the demo walkthrough's outcomes for Maya at week 10", () => {
    const week10 = buildPolicyContext(maya, 10);
    expect(
      evaluatePurchasePolicy(
        { merchant: "Larkspur Campus Bookstore", category: "books", amountCents: 4_200 },
        week10,
      ).decision,
    ).toBe("ALLOW");
    expect(
      evaluatePurchasePolicy(
        { merchant: "Larkspur Campus Bookstore", category: "books", amountCents: 12_000 },
        week10,
      ).decision,
    ).toBe("CHALLENGE");
    expect(
      evaluatePurchasePolicy(
        { merchant: "Northgate Electronics", category: "personal", amountCents: 70_000 },
        week10,
      ).decision,
    ).toBe("DENY");
  });

  it("derives budget state from the week, so later weeks have spent more", () => {
    expect(buildPolicyContext(maya, 12).spentCents).toBeGreaterThan(
      buildPolicyContext(maya, 10).spentCents,
    );
  });
});
