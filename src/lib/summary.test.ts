import { describe, expect, it } from "vitest";
import { semester, student, transactions } from "@/data/sampleStudent";
import {
  estimateBudget,
  recentTransactions,
  spendingByCategory,
  spendingByWeek,
} from "./summary";
import { formatCents } from "./money";
import { formatShortDate } from "./dates";

const CURRENT_WEEK = 10;
const visible = transactions.filter((t) => t.date <= "2026-11-01");

describe("dashboard summaries at week 10", () => {
  const weeks = spendingByWeek(visible, semester, CURRENT_WEEK);
  const estimate = estimateBudget(
    weeks,
    student.semesterBudgetCents,
    CURRENT_WEEK,
  );

  it("adds up to the documented total and ignores income", () => {
    expect(estimate.spentCents).toBe(176_727);
    expect(
      spendingByCategory(visible).reduce((sum, c) => sum + c.cents, 0),
    ).toBe(176_727);
  });

  it("projects spent + pace x weeks left", () => {
    expect(estimate.paceCents).toBe(13_291);
    expect(estimate.projectedCents).toBe(176_727 + 13_291 * 6);
  });

  it("orders recent transactions newest first", () => {
    expect(recentTransactions(visible, 1)[0].merchant).toBe("Family transfer");
  });
});

describe("edge cases", () => {
  it("does not divide by zero with no transactions or no weeks left", () => {
    const weeks = spendingByWeek([], semester, 16);
    const estimate = estimateBudget(weeks, 0, 16);
    expect(estimate.perWeekToStayOnPlanCents).toBe(0);
    expect(estimate.fractionOfBudgetUsed).toBe(0);
    expect(spendingByCategory([])).toEqual([]);
  });

  it("keeps remaining at zero when over budget", () => {
    const weeks = spendingByWeek(visible, semester, CURRENT_WEEK);
    expect(estimateBudget(weeks, 100, CURRENT_WEEK).remainingCents).toBe(0);
  });

  it("formats money and dates without time-zone drift", () => {
    expect(formatCents(176_727)).toBe("$1,767.27");
    expect(formatShortDate("2026-08-24")).toBe("Aug 24");
  });
});
