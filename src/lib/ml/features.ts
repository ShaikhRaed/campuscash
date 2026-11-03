// Turns a transaction into numbers a model can use. Every feature looks only at the
// past: using later transactions would be "leakage", which makes results look better
// than anything possible in real use. A test checks this.

export interface MlTransaction {
  /** Days since the start of the semester. */
  day: number;
  merchant: string;
  category: string;
  amountCents: number;
}

export const FEATURE_NAMES = [
  "log_amount",
  "amount_vs_category_median",
  "new_merchant",
  "same_merchant_same_day",
  "same_amount_same_merchant_same_day",
  "log_history_size",
  "essential_category",
] as const;

const ESSENTIAL = new Set(["books", "groceries", "transport"]);

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Features for each transaction, given a list sorted oldest first. */
export function extractFeatures(transactions: readonly MlTransaction[]): number[][] {
  const seenMerchants = new Set<string>();
  const amountsByCategory = new Map<string, number[]>();
  const today = new Map<string, number[]>();

  return transactions.map((t, index) => {
    const prior = amountsByCategory.get(t.category) ?? [];
    const ratio = prior.length === 0 ? 0 : Math.log(t.amountCents / median(prior));
    const dayKey = `${t.day}|${t.merchant}`;
    const sameDay = today.get(dayKey) ?? [];

    const features = [
      Math.log(t.amountCents),
      ratio,
      seenMerchants.has(t.merchant) ? 0 : 1,
      Math.min(sameDay.length, 3),
      sameDay.includes(t.amountCents) ? 1 : 0,
      Math.log(1 + index),
      ESSENTIAL.has(t.category) ? 1 : 0,
    ];

    seenMerchants.add(t.merchant);
    amountsByCategory.set(t.category, [...prior, t.amountCents]);
    today.set(dayKey, [...sameDay, t.amountCents]);
    return features;
  });
}
