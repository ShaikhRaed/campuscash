// Amounts are whole cents so sums are exact (0.1 + 0.2 !== 0.3 in floating point).
// Only convert to dollars for display.

const withCents = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const wholeDollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** 176927 becomes "$1,769.27" */
export function formatCents(cents: number): string {
  return withCents.format(cents / 100);
}

/** 176927 becomes "$1,769". Use where exact cents would be false precision. */
export function formatDollars(cents: number): string {
  return wholeDollars.format(cents / 100);
}

/** "42.50" becomes 4250. Returns null unless it is a sensible dollar amount. */
export function dollarsToCents(text: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(text.trim())) return null;
  return Math.round(Number(text) * 100);
}
