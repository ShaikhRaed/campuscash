"use client";

// Step 1, the right half: the active authorization and the form that replaces it.

import { useState, type FormEvent } from "react";
import { dollarsToCents, formatCents } from "@/lib/money";
import { PURCHASE_CATEGORIES } from "@/lib/policy/purchasePolicy";
import { CATEGORY_LABELS } from "@/lib/summary";
import { buttonClass, fieldClass, FieldTable, shorten, type SandboxState } from "./shared";

interface GrantPanelProps {
  state: SandboxState;
  busy: boolean;
  onSet: (grant: {
    scope: { merchant?: string; category?: string };
    limitCents: number;
    validFromWeek: number;
    validThroughWeek: number;
  }) => void;
  onRevoke: () => void;
}

export function GrantPanel({ state, busy, onSet, onRevoke }: GrantPanelProps) {
  const [category, setCategory] = useState("books");
  const [merchant, setMerchant] = useState("");
  const [limit, setLimit] = useState("150.00");
  const [from, setFrom] = useState("9");
  const [through, setThrough] = useState("12");
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const limitCents = dollarsToCents(limit);
    const validFromWeek = Number(from);
    const validThroughWeek = Number(through);
    if (!limitCents) return setError("Enter a limit above $0, such as 150.00.");
    if (!category && !merchant.trim()) return setError("Choose a category or a merchant.");
    if (!(validFromWeek >= 1 && validThroughWeek <= state.totalWeeks && validFromWeek <= validThroughWeek)) {
      return setError(`Enter a week range from 1 to ${state.totalWeeks}.`);
    }
    setError(null);
    onSet({
      scope: {
        ...(category && { category }),
        ...(merchant.trim() && { merchant: merchant.trim() }),
      },
      limitCents,
      validFromWeek,
      validThroughWeek,
    });
  }

  const current = state.grant;
  const grant = current?.signedGrant.grant;

  return (
    <div>
      <h3 className="text-sm font-semibold">Active authorization</h3>
      {current && grant ? (
        <div className="mt-1">
          <FieldTable
            rows={[
              ["Status", <span key="s" data-testid="grant-status">{current.status}</span>],
              ["Delegate", "Hypothetical assistant"],
              ["Category", grant.scope.category ?? "any"],
              ["Merchant", grant.scope.merchant ?? "any"],
              ["Limit (total)", formatCents(grant.limitCents)],
              ["Used", formatCents(current.usedCents)],
              ["Remaining", <span key="r" data-testid="grant-remaining">{formatCents(current.remainingCents)}</span>],
              ["Valid period", `weeks ${grant.validFromWeek}-${grant.validThroughWeek} (simulated clock)`],
              ["Grant ID", shorten(grant.grantId, 18)],
              ["Signature", `${shorten(current.signedGrant.signature, 24)} (demo student key)`],
            ]}
          />
          <button type="button" className={`${buttonClass} mt-2`} disabled={busy} onClick={onRevoke}>
            Revoke authorization
          </button>
        </div>
      ) : (
        <p className="mt-1 text-sm font-medium" data-testid="grant-status">
          None. The assistant has no permission, so set one below.
        </p>
      )}

      <details className="mt-3 border-t border-rule pt-2 text-sm">
        <summary className="cursor-pointer font-medium">Set a new authorization</summary>
        <form onSubmit={submit} className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <label className="col-span-2 sm:col-span-1">
            Category
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={fieldClass}>
              <option value="">Any</option>
              {PURCHASE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </label>
          <label className="col-span-2 sm:col-span-1">
            Merchant
            <input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Any" className={fieldClass} />
          </label>
          <label className="col-span-2 sm:col-span-1">
            Limit ($)
            <input inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} className={`${fieldClass} font-mono`} />
          </label>
          <label>
            From week
            <input inputMode="numeric" value={from} onChange={(e) => setFrom(e.target.value)} className={`${fieldClass} font-mono`} />
          </label>
          <label>
            Through week
            <input inputMode="numeric" value={through} onChange={(e) => setThrough(e.target.value)} className={`${fieldClass} font-mono`} />
          </label>
          <div className="col-span-2 sm:col-span-5">
            {error && <p role="alert" className="mb-1 font-medium text-pennant">{error}</p>}
            <button type="submit" disabled={busy} className={buttonClass}>Sign and activate</button>
            <span className="ml-2 text-xs text-ink-soft">
              Replaces the current authorization. A demo signature, not proof of consent.
            </span>
          </div>
        </form>
      </details>
    </div>
  );
}
