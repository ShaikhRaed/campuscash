// The single source of truth for "what does this student's budget look like at week N?"
// The dashboard (in the browser) and the policy (on the server) both call this, so
// they cannot disagree about how much has been spent.

import { semester } from "@/data/sampleStudent";
import type { SimulatedProfile } from "@/data/profiles";
import type { SimulatedPurchase } from "./authorization/requestStore";
import { addDays } from "./dates";
import {
  eventsThroughWeek,
  replayEvents,
  toEvents,
  type TransactionEvent,
} from "./events";
import type { PolicyContext } from "./policy/purchasePolicy";
import { estimateBudget, spendingByWeek } from "./summary";
import type { Transaction, TransactionCategory } from "./types";

/** A recorded demo purchase, dated to the last day of the week it was made in. */
function simulatedToTransaction(purchase: SimulatedPurchase): Transaction {
  return {
    id: purchase.id,
    date: addDays(semester.startDate, purchase.week * 7 - 1),
    merchant: purchase.merchant,
    category: purchase.category as TransactionCategory,
    amountCents: purchase.amountCents,
    direction: "debit",
    account: "Simulated purchase",
  };
}

export function buildBudgetState(
  profile: SimulatedProfile,
  week: number,
  simulatedPurchases: SimulatedPurchase[] = [],
  redelivered: TransactionEvent[] = [],
) {
  // Everything passes through the same week filter. Filtering only the original events
  // is the bug this prevents: redelivered events from later weeks would leak backward.
  const replay = replayEvents(
    eventsThroughWeek(
      [
        ...toEvents(profile.transactions),
        ...redelivered,
        ...toEvents(simulatedPurchases.map(simulatedToTransaction)),
      ],
      semester,
      week,
    ),
  );
  const weeks = spendingByWeek(replay.transactions, semester, week);
  const estimate = estimateBudget(weeks, profile.student.semesterBudgetCents, week);
  return { ...replay, weeks, estimate };
}

export function buildPolicyContext(
  profile: SimulatedProfile,
  week: number,
  simulatedPurchases: SimulatedPurchase[] = [],
): PolicyContext {
  const { transactions, estimate } = buildBudgetState(profile, week, simulatedPurchases);
  return {
    budgetCents: profile.student.semesterBudgetCents,
    spentCents: estimate.spentCents,
    paceCents: estimate.paceCents,
    weeksLeft: estimate.weeksLeft,
    knownMerchants: [
      ...new Set(
        transactions.filter((t) => t.direction === "debit").map((t) => t.merchant),
      ),
    ],
    limits: profile.limits,
  };
}
