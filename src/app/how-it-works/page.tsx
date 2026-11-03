// The transparency page: what suggests, what decides, and what has been measured.

import type { Metadata } from "next";
import { Masthead } from "@/components/Masthead";
import { MlResults } from "@/components/MlResults";
import { RetrievalResults } from "@/components/RetrievalResults";
import { SectionHeading } from "@/components/SectionHeading";
import { SiteFooter } from "@/components/SiteFooter";
import { BLOCKED_MERCHANTS, POLICY_VERSION } from "@/lib/policy/purchasePolicy";

export const metadata: Metadata = { title: "How it works · CampusCash" };

const RULES = [
  ["DENY", "Invalid amount, category or merchant name"],
  ["DENY", `Blocked merchant (${BLOCKED_MERCHANTS.join(", ")})`],
  ["DENY", "Above the profile's single-purchase limit"],
  ["DENY", "More than the budget remaining"],
  ["CHALLENGE", "At or above the profile's confirmation amount"],
  ["CHALLENGE", "More than the weekly amount that keeps the plan on track"],
  ["CHALLENGE", "Non-essential while the semester is projected over plan"],
  ["CHALLENGE", "Merchant not in this student's history"],
];

export default function HowItWorksPage() {
  return (
    <>
      <Masthead current="how-it-works" />
      <main className="mx-auto max-w-6xl space-y-14 px-4 pt-10 pb-16 sm:px-6">
        <div>
          <p className="font-mono text-[13px] tracking-wide text-ink-soft uppercase">
            Prototype · synthetic data only
          </p>
          <h1 className="mt-3 font-display text-3xl sm:text-4xl">How it works</h1>
          <p className="mt-3 max-w-2xl text-lg text-ink-soft">
            Models and advisors may suggest. Only deterministic code decides.
          </p>
        </div>

        <section>
          <SectionHeading
            title="Who suggests, who decides"
            description="The advisor can be wrong without changing any outcome."
          />
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="rounded-sm border border-rule bg-surface p-5">
              <h3 className="font-display text-xl">Suggests: advisor and model</h3>
              <p className="mt-2 text-sm">
                The advisor is a simulated template, not a real AI model. It reads the student&rsquo;s
                note and the model score, and it can be talked into things on purpose. Its opinion is
                shown and then discarded.
              </p>
            </div>
            <div className="rounded-sm border-2 border-ink bg-surface p-5">
              <h3 className="font-display text-xl">Decides: policy {POLICY_VERSION}</h3>
              <p className="mt-2 text-sm">
                Plain code that accepts only the merchant, category, amount and budget state. If any
                DENY rule fires the answer is DENY, otherwise any CHALLENGE rule gives CHALLENGE,
                otherwise ALLOW.
              </p>
            </div>
          </div>
          <ul className="mt-6 divide-y divide-rule border-y border-rule text-sm">
            {RULES.map(([outcome, rule]) => (
              <li key={rule} className="flex flex-wrap gap-x-4 py-2">
                <span className="w-24 font-mono text-xs leading-5 font-medium">{outcome}</span>
                <span className="min-w-0 flex-1">{rule}</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <SectionHeading
            title="Authorization prototype"
            description="Not production payment security. No money can move."
          />
          <dl className="mt-6 grid gap-x-8 gap-y-4 text-sm md:grid-cols-2">
            {[
              ["Scoped record", "Names a profile, a simulated week, a merchant and/or category, a maximum amount and an expiry time. All of it is covered by the signature."],
              ["Ed25519 signature", "Proves the record was signed by this server's demo key and has not changed. It does not prove who clicked or that a real person agreed: there is no login."],
              ["Nonce", "A one-time value inside the signed record. Reusing the same authorization for a new attempt is rejected as a replay."],
              ["Idempotency key", "Identifies one attempt. Retrying the same request returns the first answer and adds nothing, which makes network retries safe."],
              ["Uniqueness", "The store refuses a second copy of a key or nonce. It is held in memory, so it covers one server process and is cleared on restart."],
              ["Policy still applies", "A valid signature cannot override a DENY. The server re-runs the rules before recording anything."],
            ].map(([term, detail]) => (
              <div key={term} className="border-t border-rule pt-2">
                <dt className="font-semibold">{term}</dt>
                <dd className="mt-1 text-ink-soft">{detail}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section>
          <SectionHeading
            title="Unusual-transaction experiment"
            description="A logistic regression on synthetic labeled data. Its score is advisory."
          />
          <MlResults />
        </section>

        <section>
          <SectionHeading
            title="Campus question answering"
            description="Keyword and semantic search combined with reciprocal rank fusion. Documents are untrusted."
          />
          <RetrievalResults />
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
