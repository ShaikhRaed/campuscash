// Rules, pipeline and saved evaluation results.

import type { Metadata } from "next";
import { LlmResults } from "@/components/LlmResults";
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

const PIPELINE = [
  ["Request checks", "Rejected, with no decision", "Shape, idempotency key, grant signature, proposal signature, grant link, nonce"],
  ["Authorization scope", "DENY", "Grant is active, within the valid period, merchant and category in scope, within remaining allowance"],
  ["Policy rules", "ALLOW, CHALLENGE or DENY", "The deterministic rules below, using server-side budget state"],
];

export default function HowItWorksPage() {
  return (
    <>
      <Masthead current="how-it-works" />
      <main className="mx-auto max-w-6xl space-y-10 px-4 pt-6 pb-12 sm:px-6">
        <div>
          <p className="font-mono text-[13px] tracking-wide text-ink-soft uppercase">
            Prototype · simulated data only
          </p>
          <h1 className="mt-2 font-display text-3xl">How the sandbox works</h1>
          <p className="mt-2 max-w-3xl text-ink-soft">
            A student gives a hypothetical assistant limited permission to propose purchases. The sandbox evaluates
            each proposal and records what it would do. Nothing is ever bought, and there is no bank connection.
          </p>
        </div>

        <section>
          <SectionHeading
            title="The decision pipeline"
            description="Every proposal passes through these layers on the server, in order."
          />
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="text-xs text-ink-soft">
                <tr>
                  <th scope="col" className="py-1.5 pr-4 font-medium">Layer</th>
                  <th scope="col" className="py-1.5 pr-4 font-medium">A failure means</th>
                  <th scope="col" className="py-1.5 font-medium">Checks</th>
                </tr>
              </thead>
              <tbody>
                {PIPELINE.map(([layer, failure, checks]) => (
                  <tr key={layer} className="border-t border-rule align-baseline">
                    <td className="py-1.5 pr-4 font-medium">{layer}</td>
                    <td className="py-1.5 pr-4 font-mono text-xs">{failure}</td>
                    <td className="py-1.5">{checks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm">
            The strictest result wins. ALLOW records a simulated purchase and uses allowance. CHALLENGE means it would
            need the student&rsquo;s confirmation, so the sandbox stops there. Every attempt is written to the audit log.
          </p>
        </section>

        <section>
          <SectionHeading
            title="Local model versus decision"
            description="The model can be wrong or manipulated without changing what the checks do."
          />
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-sm border border-rule bg-surface p-4">
              <h3 className="font-display">Interprets: a local LLM through Ollama</h3>
              <p className="mt-1 text-sm">
                Reads the student&rsquo;s text and returns structured fields. It runs on this computer, receives only that
                text, and has no tools. The server validates its output and discards values not in the text. The result
                only fills in a form that a person reviews.
              </p>
            </div>
            <div className="rounded-sm border-2 border-ink bg-surface p-4">
              <h3 className="font-display">Decides: policy {POLICY_VERSION} and scope checks</h3>
              <p className="mt-1 text-sm">
                Plain code that accepts only signed, structured fields and server-side state. Extra fields in a request
                are dropped before any check runs.
              </p>
            </div>
          </div>
          <ul className="mt-4 divide-y divide-rule border-y border-rule text-sm">
            {RULES.map(([outcome, rule]) => (
              <li key={rule} className="flex flex-wrap gap-x-4 py-1.5">
                <span className="w-24 font-mono text-xs leading-5 font-medium">{outcome}</span>
                <span className="min-w-0 flex-1">{rule}</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <SectionHeading
            title="Local model evaluation"
            description="How well the model reads requests. This measures interpretation, not the decision checks."
          />
          <LlmResults />
        </section>

        <section>
          <SectionHeading
            title="Authorization prototype"
            description="Not production payment security or proof of consent. No money can move."
          />
          <dl className="mt-4 grid gap-x-8 gap-y-3 text-sm md:grid-cols-2">
            {[
              ["Scoped grant", "Names a student, a merchant and/or category, a total limit and a valid week range. Signed with a demo student key."],
              ["Signed proposal", "One purchase the hypothetical assistant would make, with a nonce. Signed with a separate demo assistant key."],
              ["What the signatures prove", "Each record was signed by that demo key and hasn't changed. Not who clicked, and not that a real person agreed: there is no login, and one server holds both keys."],
              ["Simulated clock", "The valid period is checked against a server-side week. Requests can't supply their own week, though the demo's clock control has no login."],
              ["Nonce", "A signed proposal can be evaluated once. Sending it again under a new key is a replay, which is rejected."],
              ["Idempotency key", "Identifies one attempt. Retrying an identical request returns the stored answer and evaluates nothing again."],
              ["Audit log", "Records every attempt, including rejections. It is held in memory and is not tamper-evident."],
              ["Uniqueness", "The store refuses a second copy of a key or nonce. It covers one server process and is cleared on restart."],
            ].map(([term, detail]) => (
              <div key={term} className="border-t border-rule pt-1.5">
                <dt className="font-semibold">{term}</dt>
                <dd className="mt-0.5 text-ink-soft">{detail}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section>
          <SectionHeading
            title="Experiment: unusual-transaction model"
            description="Separate from the decision pipeline. A logistic regression on synthetic labeled data."
          />
          <MlResults />
        </section>

        <section>
          <SectionHeading
            title="Experiment: campus Q&A"
            description="Separate from the decision pipeline. Keyword and semantic search combined with RRF. Documents are untrusted."
          />
          <RetrievalResults />
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
