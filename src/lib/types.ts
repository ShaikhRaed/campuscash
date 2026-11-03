// The shared vocabulary of the app. TypeScript checks every other file against
// these shapes, so a typo like category: "dinning" fails before the app runs.

export type SpendingCategory =
  | "dining"
  | "groceries"
  | "books"
  | "transport"
  | "subscriptions"
  | "social"
  | "personal";

export type TransactionCategory = SpendingCategory | "income";

export interface Transaction {
  /** Stable identifier. Later milestones use this to detect duplicate events. */
  id: string;
  /** Calendar date as "YYYY-MM-DD". */
  date: string;
  merchant: string;
  category: TransactionCategory;
  /** Always a positive whole number of cents. `direction` carries the sign. */
  amountCents: number;
  /** "debit" is money out, "credit" is money in. */
  direction: "debit" | "credit";
  account: "Debit card" | "Campus card" | "Simulated purchase";
}

export interface SemesterEvent {
  week: number;
  label: string;
}

export interface Semester {
  name: string;
  /** The Monday that begins week 1. */
  startDate: string;
  totalWeeks: number;
  events: SemesterEvent[];
}

export interface StudentProfile {
  name: string;
  year: string;
  major: string;
  housing: string;
  school: string;
  /** Spending plan for the whole semester, in cents. */
  semesterBudgetCents: number;
}
