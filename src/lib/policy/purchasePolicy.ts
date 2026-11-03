// The trusted decision-maker. Same inputs, same answer, every time.
//
// Look at what this function does NOT accept: the student's free-text note, the
// advisor's opinion, model scores and retrieved documents. Text that never
// reaches the function cannot persuade it. That is the safety design here.

export const POLICY_VERSION = "2026-11-v1";

export const PURCHASE_CATEGORIES = [
  "books",
  "groceries",
  "transport",
  "dining",
  "personal",
  "social",
  "subscriptions",
] as const;
export type PurchaseCategory = (typeof PURCHASE_CATEGORIES)[number];

const ESSENTIAL: readonly string[] = ["books", "groceries", "transport"];

/** Fictional merchant types the demo refuses outright. */
export const BLOCKED_MERCHANTS = [
  "QuickCash Advance",
  "LuckyBet Campus",
  "EssayMill Pro",
] as const;

export type Decision = "ALLOW" | "CHALLENGE" | "DENY";

export interface PolicyLimits {
  /** At or above this amount, the student must confirm. */
  challengeAboveCents: number;
  /** Above this amount, the purchase is refused. */
  hardLimitCents: number;
}

export interface PurchaseInput {
  merchant: string;
  category: string;
  amountCents: number;
}

export interface PolicyContext {
  budgetCents: number;
  /** Spending so far, including earlier simulated purchases. */
  spentCents: number;
  /** Recent average weekly spending. */
  paceCents: number;
  weeksLeft: number;
  knownMerchants: readonly string[];
  limits: PolicyLimits;
}

export interface PolicyReason {
  ruleId: string;
  outcome: Exclude<Decision, "ALLOW">;
  message: string;
}

export interface PolicyResult {
  decision: Decision;
  /** One plain-language sentence summarizing the outcome. */
  explanation: string;
  /** Every rule that fired, not only the first. */
  reasons: PolicyReason[];
  policyVersion: string;
}

const dollars = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );

/**
 * Makes merchant names comparable, so extra spaces, invisible characters or look-alike
 * Unicode forms can't dodge the blocked list. It compares names only: a truly different
 * spelling like "Quick Cash Advance" is not caught.
 */
export function normalizeMerchant(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/\p{Cf}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function evaluatePurchasePolicy(
  purchase: PurchaseInput,
  context: PolicyContext,
): PolicyResult {
  const reasons: PolicyReason[] = [];
  const deny = (ruleId: string, message: string) =>
    reasons.push({ ruleId, outcome: "DENY", message });
  const challenge = (ruleId: string, message: string) =>
    reasons.push({ ruleId, outcome: "CHALLENGE", message });

  const { amountCents, category, merchant } = purchase;
  const { limits } = context;
  const amountIsValid = Number.isSafeInteger(amountCents) && amountCents > 0;
  const remaining = Math.max(0, context.budgetCents - context.spentCents);

  if (!amountIsValid) {
    deny("invalid_amount", "The amount must be more than $0.00.");
  }
  if (!(PURCHASE_CATEGORIES as readonly string[]).includes(category)) {
    deny("invalid_category", "That is not a category this simulator supports.");
  }
  if (typeof merchant !== "string" || !merchant.trim()) {
    deny("missing_merchant", "A merchant name is required.");
  } else if (BLOCKED_MERCHANTS.some((m) => normalizeMerchant(m) === normalizeMerchant(merchant))) {
    deny("blocked_merchant", `${merchant.trim()} is on the demo's blocked list.`);
  }

  if (amountIsValid) {
    if (amountCents > limits.hardLimitCents) {
      deny(
        "over_hard_limit",
        `${dollars(amountCents)} is above this profile's ${dollars(limits.hardLimitCents)} limit for one purchase.`,
      );
    }
    if (amountCents > remaining) {
      deny(
        "over_remaining_budget",
        `${dollars(amountCents)} is more than the ${dollars(remaining)} left in the semester plan.`,
      );
    }

    if (amountCents >= limits.challengeAboveCents) {
      challenge(
        "large_purchase",
        `Purchases of ${dollars(limits.challengeAboveCents)} or more need confirmation.`,
      );
    }
    if (
      context.weeksLeft > 0 &&
      amountCents > Math.floor(remaining / context.weeksLeft)
    ) {
      challenge(
        "over_weekly_room",
        `It is more than the ${dollars(Math.floor(remaining / context.weeksLeft))} per week that would keep the plan on track.`,
      );
    }
    const projected =
      context.spentCents + amountCents + context.paceCents * context.weeksLeft;
    if (!ESSENTIAL.includes(category) && projected > context.budgetCents) {
      challenge(
        "nonessential_over_projection",
        `This is non-essential and the semester is projected to reach ${dollars(projected)} against a ${dollars(context.budgetCents)} plan.`,
      );
    }
  }

  if (
    typeof merchant === "string" &&
    merchant.trim() &&
    !context.knownMerchants.some((m) => normalizeMerchant(m) === normalizeMerchant(merchant))
  ) {
    challenge(
      "unknown_merchant",
      `${merchant.trim()} does not appear in this student's history.`,
    );
  }

  const decision: Decision = reasons.some((r) => r.outcome === "DENY")
    ? "DENY"
    : reasons.length > 0
      ? "CHALLENGE"
      : "ALLOW";

  const explanation = {
    ALLOW: "Allowed: this purchase passed every rule.",
    CHALLENGE:
      "Confirmation needed: nothing forbids this, but the student should confirm it first.",
    DENY: "Denied: at least one rule forbids this purchase, and confirming cannot override it.",
  }[decision];

  return { decision, explanation, reasons, policyVersion: POLICY_VERSION };
}
