import { describe, expect, it } from "vitest";
import { findProfile } from "@/data/profiles";
import { semester } from "@/data/sampleStudent";
import type { SimulatedPurchase } from "./authorization/requestStore";
import { addDays } from "./dates";
import { eventsInWeek, toEvents } from "./events";
import { buildBudgetState, buildPolicyContext } from "./simulation";

const maya = findProfile("maya")!;
const allEvents = toEvents(maya.transactions);
const purchase: SimulatedPurchase = {
  id: "sim_1",
  profileId: "maya",
  week: 10,
  merchant: "Larkspur Campus Bookstore",
  category: "books",
  amountCents: 4_200,
};

describe("redelivered events and the timeline", () => {
  const week10 = eventsInWeek(allEvents, semester, 10);

  it("does not leak later-week events when moving back (regression)", () => {
    const state = buildBudgetState(maya, 9, [], week10);
    const lastDay = addDays(semester.startDate, 9 * 7 - 1);
    expect(state.transactions.every((t) => t.date <= lastDay)).toBe(true);
    expect(state.transactions).toEqual(buildBudgetState(maya, 9).transactions);
    expect(state.duplicatesIgnored).toBe(0);
  });

  it("ignores them as duplicates once the timeline reaches them", () => {
    const state = buildBudgetState(maya, 10, [], week10);
    expect(state.duplicatesIgnored).toBe(week10.length);
    expect(state.estimate.spentCents).toBe(176_727);
  });
});

describe("one source of truth for spending", () => {
  it("gives the dashboard and the policy the same spent and pace", () => {
    const dashboard = buildBudgetState(maya, 10, [purchase]).estimate;
    const policy = buildPolicyContext(maya, 10, [purchase]);
    expect(dashboard.spentCents).toBe(176_727 + 4_200);
    expect(policy.spentCents).toBe(dashboard.spentCents);
    expect(policy.paceCents).toBe(dashboard.paceCents);
  });

  it("shows a recorded purchase in the ledger, clearly labeled", () => {
    const { transactions } = buildBudgetState(maya, 10, [purchase]);
    expect(transactions.at(-1)).toMatchObject({ id: "sim_1", account: "Simulated purchase" });
  });

  it("hides a purchase until the timeline reaches its week", () => {
    expect(buildBudgetState(maya, 9, [purchase]).estimate.spentCents).toBe(
      buildBudgetState(maya, 9).estimate.spentCents,
    );
  });

  it("does not count the same purchase twice if it is listed twice", () => {
    const { estimate } = buildBudgetState(maya, 10, [purchase, purchase]);
    expect(estimate.spentCents).toBe(176_727 + 4_200);
  });
});
