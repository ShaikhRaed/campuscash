// Builds the ledger from transaction events. Events can arrive twice, out of order or
// broken, so duplicates (same eventId) are ignored, bad events are skipped, and the
// result is sorted by date. Replaying the same events always gives the same ledger.

import { addDays } from "./dates";
import { weekOfSemester } from "./summary";
import type { Semester, Transaction } from "./types";

export interface TransactionEvent {
  /** Unique per event. A redelivery carries the same id. */
  eventId: string;
  transaction: Transaction;
}

export interface ReplayResult {
  /** The clean ledger, oldest first, regardless of delivery order. */
  transactions: Transaction[];
  duplicatesIgnored: number;
  /** Events refused because their contents could not be trusted. */
  rejected: { eventId: string; reason: string }[];
}

/** Returns a reason the event is unusable, or null if it is fine. */
function findProblem(event: TransactionEvent): string | null {
  const t = event.transaction;
  if (!event.eventId) return "missing event id";
  if (!Number.isInteger(t?.amountCents) || t.amountCents <= 0) {
    return "amount must be a positive whole number of cents";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date) || Number.isNaN(Date.parse(t.date))) {
    return "date must look like YYYY-MM-DD";
  }
  return null;
}

/** Pure function: the same events always give the same result. */
export function replayEvents(events: TransactionEvent[]): ReplayResult {
  const seen = new Set<string>();
  const accepted: { t: Transaction; order: number }[] = [];
  const rejected: ReplayResult["rejected"] = [];
  let duplicatesIgnored = 0;

  events.forEach((event, order) => {
    if (seen.has(event.eventId)) {
      duplicatesIgnored += 1;
      return;
    }
    const problem = findProblem(event);
    if (problem) {
      rejected.push({ eventId: event.eventId, reason: problem });
      return;
    }
    seen.add(event.eventId);
    accepted.push({ t: event.transaction, order });
  });

  const transactions = accepted
    .sort((a, b) => a.t.date.localeCompare(b.t.date) || a.order - b.order)
    .map(({ t }) => t);

  return { transactions, duplicatesIgnored, rejected };
}

export function toEvents(transactions: Transaction[]): TransactionEvent[] {
  return transactions.map((transaction) => ({
    eventId: `evt_${transaction.id}`,
    transaction,
  }));
}

/** Events whose date falls in or before `week`. */
export function eventsThroughWeek(
  events: TransactionEvent[],
  semester: Semester,
  week: number,
): TransactionEvent[] {
  const lastDay = addDays(semester.startDate, week * 7 - 1);
  return events.filter((e) => e.transaction.date <= lastDay);
}

export function eventsInWeek(
  events: TransactionEvent[],
  semester: Semester,
  week: number,
): TransactionEvent[] {
  return events.filter(
    (e) => weekOfSemester(e.transaction.date, semester) === week,
  );
}
