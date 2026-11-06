// Budget calculations. Pure functions, no React.

import { addDays, daysBetween } from "./dates";
import type {
  Semester,
  SpendingCategory,
  Transaction,
  TransactionCategory,
} from "./types";

export const CATEGORY_LABELS: Record<TransactionCategory, string> = {
  dining: "Dining",
  groceries: "Groceries",
  books: "Books & supplies",
  transport: "Transport",
  subscriptions: "Subscriptions",
  social: "Social & fun",
  personal: "Personal",
  income: "Income",
};

/** Number of recent weeks used for the "current pace" in the budget estimate. */
const PACE_WINDOW_WEEKS = 4;

/** Which week of the semester a date falls in. Week 1 is the first week. */
export function weekOfSemester(date: string, semester: Semester): number {
  return Math.floor(daysBetween(semester.startDate, date) / 7) + 1;
}

/** Money going out. Income is not spending, so it must not count here. */
function spendingOnly(transactions: Transaction[]): Transaction[] {
  return transactions.filter((t) => t.direction === "debit");
}

function sumCents(transactions: Transaction[]): number {
  return transactions.reduce((total, t) => total + t.amountCents, 0);
}

export interface CategoryTotal {
  category: SpendingCategory;
  label: string;
  cents: number;
  /** Fraction of all spending, from 0 to 1. */
  share: number;
}

/** Spending per category, largest first. Empty categories are left out. */
export function spendingByCategory(
  transactions: Transaction[],
): CategoryTotal[] {
  const spending = spendingOnly(transactions);
  const total = sumCents(spending);
  const totals = new Map<SpendingCategory, number>();

  for (const t of spending) {
    const category = t.category as SpendingCategory;
    totals.set(category, (totals.get(category) ?? 0) + t.amountCents);
  }

  return [...totals.entries()]
    .map(([category, cents]) => ({
      category,
      label: CATEGORY_LABELS[category],
      cents,
      share: total === 0 ? 0 : cents / total,
    }))
    .sort((a, b) => b.cents - a.cents);
}

export interface WeekTotal {
  week: number;
  startDate: string;
  endDate: string;
  cents: number;
  isFuture: boolean;
}

/** One entry for every week of the semester, including weeks not reached yet. */
export function spendingByWeek(
  transactions: Transaction[],
  semester: Semester,
  currentWeek: number,
): WeekTotal[] {
  const weeks: WeekTotal[] = [];

  for (let week = 1; week <= semester.totalWeeks; week++) {
    const startDate = addDays(semester.startDate, (week - 1) * 7);
    weeks.push({
      week,
      startDate,
      endDate: addDays(startDate, 6),
      cents: 0,
      isFuture: week > currentWeek,
    });
  }

  for (const t of spendingOnly(transactions)) {
    const entry = weeks[weekOfSemester(t.date, semester) - 1];
    if (entry) entry.cents += t.amountCents;
  }

  return weeks;
}

export interface BudgetEstimate {
  budgetCents: number;
  spentCents: number;
  /** Budget left to spend. Zero or more, even when already over budget. */
  remainingCents: number;
  /** Average weekly spending over the last few weeks. */
  paceCents: number;
  paceWindowWeeks: number;
  weeksLeft: number;
  /** spent + (pace x weeks left) */
  projectedCents: number;
  /** projected - budget. Positive means over plan. */
  projectedDifferenceCents: number;
  /** Weekly amount that would land exactly on the plan. */
  perWeekToStayOnPlanCents: number;
  /** Fraction of the budget used, from 0 up (can pass 1). */
  fractionOfBudgetUsed: number;
  /** Fraction of the semester's weeks completed, from 0 to 1. */
  fractionOfSemesterElapsed: number;
}

/**
 * A deliberately simple forecast: assume the next weeks look like the last four.
 * It is easy to explain and check by hand, but it will not anticipate one-off
 * costs, and an expensive recent week will pull it upward.
 */
export function estimateBudget(
  weeks: WeekTotal[],
  budgetCents: number,
  currentWeek: number,
): BudgetEstimate {
  const elapsed = weeks.filter((w) => !w.isFuture);
  const spentCents = elapsed.reduce((total, w) => total + w.cents, 0);

  const recent = elapsed.slice(-PACE_WINDOW_WEEKS);
  const recentTotal = recent.reduce((total, w) => total + w.cents, 0);
  const paceCents =
    recent.length === 0 ? 0 : Math.round(recentTotal / recent.length);

  const weeksLeft = weeks.length - currentWeek;
  const projectedCents = spentCents + paceCents * weeksLeft;
  const remainingCents = Math.max(0, budgetCents - spentCents);

  return {
    budgetCents,
    spentCents,
    remainingCents,
    paceCents,
    paceWindowWeeks: recent.length,
    weeksLeft,
    projectedCents,
    projectedDifferenceCents: projectedCents - budgetCents,
    perWeekToStayOnPlanCents:
      weeksLeft === 0 ? 0 : Math.floor(remainingCents / weeksLeft),
    fractionOfBudgetUsed: budgetCents === 0 ? 0 : spentCents / budgetCents,
    fractionOfSemesterElapsed: currentWeek / weeks.length,
  };
}

/** The newest transactions first. Same-day entries: last recorded comes first. */
export function recentTransactions(
  transactions: Transaction[],
  count: number,
): Transaction[] {
  return transactions
    .map((t, index) => ({ t, index }))
    .sort((a, b) => b.t.date.localeCompare(a.t.date) || b.index - a.index)
    .slice(0, count)
    .map(({ t }) => t);
}
