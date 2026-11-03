import { describe, expect, it } from "vitest";
import { profiles } from "@/data/profiles";
import { semester } from "@/data/sampleStudent";
import { eventsInWeek, eventsThroughWeek, replayEvents, toEvents } from "./events";
import { spendingByWeek } from "./summary";

const maya = toEvents(profiles[0].transactions);

describe("event replay", () => {
  it("ignores redelivered events", () => {
    const week3 = eventsInWeek(maya, semester, 3);
    const once = replayEvents(week3);
    const twice = replayEvents([...week3, ...week3]);
    expect(twice.transactions).toEqual(once.transactions);
    expect(twice.duplicatesIgnored).toBe(week3.length);
  });

  it("builds the same ledger from out-of-order delivery", () => {
    expect(replayEvents([...maya].reverse()).transactions.map((t) => t.id).sort()).toEqual(
      replayEvents(maya).transactions.map((t) => t.id).sort(),
    );
    const dates = replayEvents([...maya].reverse()).transactions.map((t) => t.date);
    expect(dates).toEqual([...dates].sort());
  });

  it("rejects malformed events without stopping the rest", () => {
    const good = maya[0];
    const bad = {
      eventId: "evt_bad",
      transaction: { ...good.transaction, amountCents: -5 },
    };
    const worse = {
      eventId: "evt_worse",
      transaction: { ...good.transaction, date: "soon" },
    };
    const result = replayEvents([bad, good, worse]);
    expect(result.transactions).toHaveLength(1);
    expect(result.rejected.map((r) => r.eventId)).toEqual(["evt_bad", "evt_worse"]);
  });

  it("reveals only the weeks reached so far", () => {
    const visible = replayEvents(eventsThroughWeek(maya, semester, 10)).transactions;
    const total = spendingByWeek(visible, semester, 10).reduce((s, w) => s + w.cents, 0);
    expect(total).toBe(176_727);
    expect(visible.every((t) => t.date <= "2026-11-01")).toBe(true);
  });

  it("has every generated transaction inside the semester, for every profile", () => {
    for (const profile of profiles) {
      const ids = new Set(profile.transactions.map((t) => t.id));
      expect(ids.size).toBe(profile.transactions.length);
      const weeks = spendingByWeek(profile.transactions, semester, 16);
      const inChart = weeks.reduce((s, w) => s + w.cents, 0);
      const all = profile.transactions
        .filter((t) => t.direction === "debit")
        .reduce((s, t) => s + t.amountCents, 0);
      expect(inChart).toBe(all);
    }
  });
});
