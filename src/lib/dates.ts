// Dates are "YYYY-MM-DD" strings, which JavaScript parses as midnight UTC. Formatting in
// local time would show the previous day west of UTC, so everything here uses UTC.

const MS_PER_DAY = 86_400_000;

const shortDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** "2026-08-24" becomes "Aug 24" */
export function formatShortDate(date: string): string {
  return shortDate.format(new Date(date));
}

/** Whole days from `from` to `to`. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / MS_PER_DAY);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(date) + days * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}
