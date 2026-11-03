// A "YYYY-MM-DD" string is parsed as midnight UTC. Formatting it in the viewer's
// own time zone would show Aug 23 instead of Aug 24 for anyone in the Americas,
// so every date helper here works in UTC.

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
