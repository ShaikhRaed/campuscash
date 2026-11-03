"use client";

// Step 2: the structured proposal that goes to the deterministic pipeline. It works with or
// without the local model: fill it in by hand, use an example, or copy a validated draft.

import { useState, type FormEvent } from "react";
import { dollarsToCents } from "@/lib/money";
import { BLOCKED_MERCHANTS, PURCHASE_CATEGORIES } from "@/lib/policy/purchasePolicy";
import { CATEGORY_LABELS } from "@/lib/summary";
import { buttonClass, fieldClass, Panel, primaryButtonClass } from "./shared";

export interface ProposalInput {
  merchant: string;
  category: string;
  amountCents: number;
}

export interface ProposalPrefill {
  merchant?: string;
  category?: string;
  amount?: string;
}

const PRESETS = [
  { label: "Textbook, $42", merchant: "Larkspur Campus Bookstore", category: "books", amount: "42.00" },
  { label: "Textbook, $120", merchant: "Larkspur Campus Bookstore", category: "books", amount: "120.00" },
  { label: "Textbook, $200", merchant: "Larkspur Campus Bookstore", category: "books", amount: "200.00" },
  { label: "Movie tickets, $30", merchant: "Bijou Cinema", category: "social", amount: "30.00" },
  { label: "Payday lender, $50", merchant: "QuickCash Advance", category: "books", amount: "50.00" },
];

const MERCHANTS = ["Larkspur Campus Bookstore", "Campus Print Center", "Bijou Cinema", ...BLOCKED_MERCHANTS];

interface ProposalPanelProps {
  hasGrant: boolean;
  busy: boolean;
  prefill: ProposalPrefill | null;
  onSubmit: (input: ProposalInput) => void;
}

export function ProposalPanel({ hasGrant, busy, prefill, onSubmit }: ProposalPanelProps) {
  const [merchant, setMerchant] = useState(prefill?.merchant ?? (prefill ? "" : PRESETS[0].merchant));
  const [category, setCategory] = useState(prefill?.category ?? PRESETS[0].category);
  const [amount, setAmount] = useState(prefill?.amount ?? (prefill ? "" : PRESETS[0].amount));
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const amountCents = dollarsToCents(amount);
    if (amountCents === null) return setError("Enter an amount in dollars, such as 42.00.");
    setError(null);
    onSubmit({ merchant, category, amountCents });
  }

  return (
    <Panel step={2} title="Submit a hypothetical proposal" note="Nothing is bought · works without the model">
      <div role="group" aria-label="Example proposals" className="flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className={buttonClass}
            onClick={() => {
              setMerchant(preset.merchant);
              setCategory(preset.category);
              setAmount(preset.amount);
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {prefill && (
        <p className="mt-2 text-sm font-medium" data-testid="prefill-note">
          Filled from the model&rsquo;s draft. Check it before submitting.
        </p>
      )}

      <form onSubmit={submit} className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <label className="col-span-2">
          Merchant
          <input required list="merchant-options" value={merchant} onChange={(e) => setMerchant(e.target.value)} className={fieldClass} />
          <datalist id="merchant-options">
            {MERCHANTS.map((m) => <option key={m} value={m} />)}
          </datalist>
        </label>
        <label>
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={fieldClass}>
            {PURCHASE_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
        </label>
        <label>
          Amount ($)
          <input required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${fieldClass} font-mono`} />
        </label>
        <div className="col-span-2">
          {error && <p role="alert" className="mb-1 font-medium text-pennant">{error}</p>}
          {!hasGrant && <p className="mb-1 font-medium">Set an authorization in step 1 first.</p>}
          <button type="submit" disabled={busy || !hasGrant} className={primaryButtonClass}>
            Submit proposal
          </button>
        </div>
      </form>
      <p className="mt-3 border-t border-rule pt-2 text-xs text-ink-soft">
        Only these three fields are signed and sent. The student&rsquo;s text, the purpose and the raw model output are not.
      </p>
    </Panel>
  );
}
