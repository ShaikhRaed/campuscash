"use client";

// The interactive dashboard. "use client" means this code also runs in the browser,
// which it needs for buttons and timers. It keeps a small amount of state (who, which
// week, playing or not), and every number on screen is recalculated from that.

import { useEffect, useState } from "react";
import { DEFAULT_PROFILE_ID, DEFAULT_WEEK, profiles } from "@/data/profiles";
import { semester } from "@/data/sampleStudent";
import type { SimulatedPurchase } from "@/lib/authorization/requestStore";
import { eventsInWeek, toEvents, type TransactionEvent } from "@/lib/events";
import { buildBudgetState } from "@/lib/simulation";
import { recentTransactions, spendingByCategory } from "@/lib/summary";
import { BudgetHero } from "./BudgetHero";
import { CategoryBreakdown } from "./CategoryBreakdown";
import { Masthead } from "./Masthead";
import { PurchaseSimulator } from "./PurchaseSimulator";
import { RecentTransactions } from "./RecentTransactions";
import { SemesterRuler } from "./SemesterRuler";
import { TimelineControls } from "./TimelineControls";

const RECENT_COUNT = 8;
const PLAY_INTERVAL_MS = 900;

async function fetchRecorded(profileId: string): Promise<SimulatedPurchase[]> {
  const response = await fetch(`/api/purchase/recorded?profileId=${profileId}`);
  if (!response.ok) throw new Error("Could not load simulated purchases.");
  return ((await response.json()) as { purchases: SimulatedPurchase[] }).purchases;
}

export function Dashboard() {
  const [profileId, setProfileId] = useState(DEFAULT_PROFILE_ID);
  const [week, setWeek] = useState(DEFAULT_WEEK);
  const [wantsToPlay, setWantsToPlay] = useState(false);
  const [redelivered, setRedelivered] = useState<TransactionEvent[]>([]);
  const [recorded, setRecorded] = useState<SimulatedPurchase[]>([]);

  const profile = profiles.find((p) => p.id === profileId) ?? profiles[0];
  const visibleRecorded = recorded.filter((p) => p.week <= week);

  // The same function the server's policy uses, so the two can't disagree.
  const state = buildBudgetState(profile, week, visibleRecorded, redelivered);
  const { transactions } = state;
  const merchantOptions = [
    ...new Set(
      transactions.filter((t) => t.direction === "debit").map((t) => t.merchant),
    ),
  ];

  // Playing stops by itself at the end, because this becomes false.
  const isPlaying = wantsToPlay && week < semester.totalWeeks;

  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      setWeek((current) => Math.min(current + 1, semester.totalWeeks));
    }, PLAY_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isPlaying]);

  // Simulated purchases live on the server, so ask for them when the student changes.
  useEffect(() => {
    let isCurrent = true;
    fetchRecorded(profile.id)
      .then((purchases) => {
        if (isCurrent) setRecorded(purchases);
      })
      .catch(() => {});
    return () => {
      isCurrent = false;
    };
  }, [profile.id]);

  async function refreshRecorded() {
    setRecorded(await fetchRecorded(profile.id));
  }

  function changeProfile(id: string) {
    setProfileId(id);
    setRedelivered([]);
    setRecorded([]);
  }

  function replayFromStart() {
    setWeek(1);
    setRedelivered([]);
    setWantsToPlay(true);
  }

  return (
    <>
      <Masthead student={profile.student} current="dashboard" />

      <main className="mx-auto max-w-6xl space-y-14 px-4 pt-6 pb-16 sm:px-6">
        <TimelineControls
          profiles={profiles}
          profileId={profile.id}
          week={week}
          totalWeeks={semester.totalWeeks}
          isPlaying={isPlaying}
          eventCount={transactions.length}
          duplicatesIgnored={state.duplicatesIgnored}
          onProfileChange={changeProfile}
          onWeekChange={(next) => {
            setWantsToPlay(false);
            setWeek(next);
          }}
          onTogglePlay={() => setWantsToPlay(!isPlaying)}
          onReplay={replayFromStart}
          onRedeliver={() =>
            setRedelivered((list) => [
              ...list,
              ...eventsInWeek(toEvents(profile.transactions), semester, week),
            ])
          }
        />

        <BudgetHero
          student={profile.student}
          semester={semester}
          currentWeek={week}
          estimate={state.estimate}
        />

        <SemesterRuler
          weeks={state.weeks}
          events={semester.events}
          currentWeek={week}
          budgetCents={profile.student.semesterBudgetCents}
        />

        <PurchaseSimulator
          profileId={profile.id}
          week={week}
          merchantOptions={merchantOptions}
          recorded={recorded}
          onRecordedChange={refreshRecorded}
        />

        <div className="grid gap-14 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-5">
            <CategoryBreakdown categories={spendingByCategory(transactions)} />
          </div>
          <div className="lg:col-span-7">
            <RecentTransactions
              transactions={recentTransactions(transactions, RECENT_COUNT)}
              totalCount={transactions.length}
            />
          </div>
        </div>
      </main>
    </>
  );
}
