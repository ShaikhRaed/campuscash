// Money is stored as whole cents because decimals drift in JavaScript:
// 0.1 + 0.2 === 0.30000000000000004. Integers add up exactly, so we only
// convert to dollars at the last moment, when displaying a value.

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
