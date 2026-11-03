// Server component: the model runs on the server and only the results go to the browser.

import type { Metadata } from "next";
import { Masthead } from "@/components/Masthead";
import { ReviewList } from "@/components/ReviewList";
import { SiteFooter } from "@/components/SiteFooter";
import { DEFAULT_WEEK, profiles } from "@/data/profiles";
import { buildReviewQueue } from "@/lib/ml/savedModel";

export const metadata: Metadata = { title: "Review · CampusCash" };

const SHOWN = 5;

export default function ReviewPage() {
  const profile = profiles[0];
  const queue = buildReviewQueue(profile, DEFAULT_WEEK, SHOWN);

  return (
    <>
      <Masthead student={profile.student} current="review" />
      <main className="mx-auto max-w-3xl px-4 pt-10 pb-16 sm:px-6">
        <p className="font-mono text-[13px] tracking-wide text-ink-soft uppercase">
          Separate experiment · synthetic training data · through week {DEFAULT_WEEK}
        </p>
        <h1 className="mt-3 font-display text-3xl sm:text-4xl">Anomaly model experiment</h1>
        <p className="mt-3 text-lg text-ink-soft">
          The model flagged {queue.flaggedCount} of {queue.scoredCount} simulated purchases at
          its {queue.threshold.toFixed(2)} flag level. These are the top {queue.items.length}.
        </p>
        <p className="mt-3 text-sm">
          This isn&rsquo;t part of the authorization flow, and the decision pipeline doesn&rsquo;t read it. A flag
          is only a prompt to look. It doesn&rsquo;t block anything, doesn&rsquo;t mean fraud, and often points at
          something normal. Your marks reset on reload.
        </p>
        <ReviewList items={queue.items} />
      </main>
      <SiteFooter />
    </>
  );
}
