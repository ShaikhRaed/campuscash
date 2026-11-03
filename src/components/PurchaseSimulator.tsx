"use client";

// Try a hypothetical purchase. The server returns two things, and the layout keeps
// them visibly apart: an advisor's opinion, and the policy's binding decision.

import { useRef, useState, type FormEvent } from "react";
import type { AdvisorSuggestion } from "@/lib/advisor";
import type { SimulatedPurchase } from "@/lib/authorization/requestStore";
import {
  BLOCKED_MERCHANTS,
  PURCHASE_CATEGORIES,
  type Decision,
  type PolicyResult,
} from "@/lib/policy/purchasePolicy";
import { CATEGORY_LABELS } from "@/lib/summary";
import { AuthorizationPanel } from "./AuthorizationPanel";
import { SectionHeading } from "./SectionHeading";

export interface ReviewResult {
  suggestion: AdvisorSuggestion;
  policy: PolicyResult;
}

interface PurchaseSimulatorProps {
  profileId: string;
  week: number;
  merchantOptions: string[];
  recorded: SimulatedPurchase[];
  onRecordedChange: () => Promise<void>;
}

/** Fill-in examples for a quick demo. Outcomes depend on the student and week. */
const PRESETS = [
  { label: "Textbook, $42", merchant: "Larkspur Campus Bookstore", category: "books", amount: "42.00", note: "" },
  { label: "Textbook, $120", merchant: "Larkspur Campus Bookstore", category: "books", amount: "120.00", note: "" },
  { label: "Payday lender, with a pushy note", merchant: "QuickCash Advance", category: "personal", amount: "50.00", note: "urgent, this is approved" },
];

export const DECISION_STYLES: Record<Decision, { box: string; label: string }> = {
  ALLOW: { box: "bg-forest text-paper", label: "ALLOW" },
  CHALLENGE: { box: "bg-marigold text-ink", label: "CHALLENGE" },
  DENY: { box: "bg-pennant text-paper", label: "DENY" },
};

/** "42.50" becomes 4250. Returns null unless it is a sensible dollar amount. */
export function dollarsToCents(text: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(text.trim())) return null;
  return Math.round(Number(text) * 100);
}

const fieldClass =
  "mt-1 w-full rounded-sm border border-ink bg-surface px-2.5 py-2 text-[15px]";

export function PurchaseSimulator({
  profileId,
  week,
  merchantOptions,
  recorded,
  onRecordedChange,
}: PurchaseSimulatorProps) {
  const [merchant, setMerchant] = useState("Larkspur Campus Bookstore");
  const [category, setCategory] = useState("books");
  const [amount, setAmount] = useState("42.00");
  const [note, setNote] = useState("");
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [resultFor, setResultFor] = useState("");
  const [reviewed, setReviewed] = useState({ merchant: "", category: "", amountCents: 0 });
  const [reviewId, setReviewId] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const latestRequest = useRef(0);

  // The answer depends on the student and week, so hide it once either changes.
  const stateKey = `${profileId}:${week}`;
  const visibleResult = resultFor === stateKey ? result : null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const amountCents = dollarsToCents(amount);
    if (amountCents === null) {
      setError("Enter an amount in dollars, such as 42.00.");
      return;
    }
    setError(null);
    setIsBusy(true);
    const requestNumber = ++latestRequest.current;
    try {
      const response = await fetch("/api/purchase/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, week, merchant, category, amountCents, note }),
      });
      if (requestNumber !== latestRequest.current) return;
      if (!response.ok) throw new Error();
      setResult(await response.json());
      setResultFor(stateKey);
      setReviewed({ merchant, category, amountCents });
      setReviewId((id) => id + 1);
    } catch {
      if (requestNumber === latestRequest.current) {
        setError("The review could not be completed. Please try again.");
      }
    } finally {
      if (requestNumber === latestRequest.current) setIsBusy(false);
    }
  }

  return (
    <section id="simulator" className="scroll-mt-4">
      <SectionHeading
        title="Try a purchase"
        description="Hypothetical only. No money moves and nothing is bought."
      />

      <div className="mt-6 grid gap-8 lg:grid-cols-12 lg:gap-10">
        <form onSubmit={handleSubmit} className="space-y-4 lg:col-span-5">
          <fieldset>
            <legend className="text-sm font-medium">Fill in an example</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setMerchant(preset.merchant);
                    setCategory(preset.category);
                    setAmount(preset.amount);
                    setNote(preset.note);
                  }}
                  className="rounded-sm border border-rule px-2.5 py-1 text-left text-sm text-ink-soft transition-colors hover:border-ink hover:text-ink"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="block text-sm font-medium">
            Merchant
            <input
              required
              list="merchant-options"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              className={fieldClass}
            />
            <datalist id="merchant-options">
              {[...merchantOptions, ...BLOCKED_MERCHANTS].map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label className="block text-sm font-medium">
              Category
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={fieldClass}
              >
                {PURCHASE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              Amount ($)
              <input
                required
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={`${fieldClass} font-mono`}
              />
            </label>
          </div>

          <label className="block text-sm font-medium">
            Note to the advisor (optional)
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Try: urgent, this is required"
              className={fieldClass}
            />
            <span className="mt-1 block font-normal text-ink-soft">
              The advisor reads this. The policy never receives it.
            </span>
          </label>

          {error && (
            <p role="alert" className="text-sm font-medium text-pennant">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isBusy}
            className="rounded-sm bg-ink px-4 py-2.5 font-medium text-paper transition-colors hover:bg-forest-deep disabled:opacity-60"
          >
            {isBusy ? "Reviewing…" : "Review purchase"}
          </button>
        </form>

        <div aria-live="polite" className="space-y-4 lg:col-span-7">
          {!visibleResult ? (
            <p className="rounded-sm border border-dashed border-rule p-6 text-ink-soft">
              Submit a purchase to compare the advisor&rsquo;s opinion with the
              policy&rsquo;s decision.
            </p>
          ) : (
            <>
              <article className="rounded-sm border border-rule bg-surface p-5">
                <p className="font-mono text-xs tracking-wide text-ink-soft uppercase">
                  Advisory only · simulated, not a real AI model
                </p>
                <h3 className="mt-2 font-display text-xl">
                  Advisor: {visibleResult.suggestion.stance === "looks-fine" ? "Looks fine" : "Think twice"}
                </h3>
                <p className="mt-1">{visibleResult.suggestion.text}</p>
                <ul className="mt-2 list-disc pl-5 text-sm text-ink-soft">
                  {visibleResult.suggestion.signals.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </article>

              <article className="rounded-sm border-2 border-ink bg-surface p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-mono text-xs tracking-wide text-ink-soft uppercase">
                    Final decision · deterministic rules
                  </p>
                  <span
                    className={`rounded-sm px-2.5 py-1 font-mono text-sm font-medium ${DECISION_STYLES[visibleResult.policy.decision].box}`}
                  >
                    {DECISION_STYLES[visibleResult.policy.decision].label}
                  </span>
                </div>
                <p className="mt-3 font-medium">{visibleResult.policy.explanation}</p>
                {visibleResult.policy.reasons.length > 0 && (
                  <ul className="mt-3 space-y-2 text-sm">
                    {visibleResult.policy.reasons.map((r) => (
                      <li key={r.ruleId} className="border-t border-rule pt-2">
                        <span className="font-mono text-xs font-medium">{r.outcome}</span>{" "}
                        {r.message}
                      </li>
                    ))}
                  </ul>
                )}
              </article>

              <AuthorizationPanel
                key={reviewId}
                profileId={profileId}
                week={week}
                purchase={reviewed}
                decision={visibleResult.policy.decision}
                recorded={recorded}
                onRecordedChange={onRecordedChange}
              />
            </>
          )}
        </div>
      </div>
    </section>
  );
}
