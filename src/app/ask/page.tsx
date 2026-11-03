import type { Metadata } from "next";
import { AskPanel } from "@/components/AskPanel";
import { Masthead } from "@/components/Masthead";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = { title: "Ask · CampusCash" };

export default function AskPage() {
  return (
    <>
      <Masthead current="ask" />
      <main className="mx-auto max-w-3xl px-4 pt-10 pb-16 sm:px-6">
        <p className="font-mono text-[13px] tracking-wide text-ink-soft uppercase">
          Separate experiment · search over sample documents · no language model
        </p>
        <h1 className="mt-3 font-display text-3xl sm:text-4xl">Campus Q&amp;A experiment</h1>
        <p className="mt-3 text-lg text-ink-soft">
          Answers are direct quotes from fictional campus documents, with sources. If the sources
          don&rsquo;t cover a question, the app says so. This isn&rsquo;t part of the authorization flow, and retrieved
          text has no path to the decision pipeline.
        </p>
        <AskPanel />
      </main>
      <SiteFooter />
    </>
  );
}
