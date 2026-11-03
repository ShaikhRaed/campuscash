"use client";

// Each flagged item can be marked expected or suspicious. Marks live only in this page's
// memory, so they disappear on reload. They are not used to retrain the model or to
// change any purchase decision.

import { useState } from "react";
import { formatShortDate } from "@/lib/dates";
import type { ReviewItem } from "@/lib/ml/savedModel";
import { formatCents } from "@/lib/money";
import { CATEGORY_LABELS } from "@/lib/summary";

type Mark = "expected" | "suspicious";

const OPTIONS: { mark: Mark; label: string; active: string }[] = [
  { mark: "expected", label: "Expected", active: "bg-forest text-paper border-forest" },
  { mark: "suspicious", label: "Suspicious", active: "bg-pennant text-paper border-pennant" },
];

export function ReviewList({ items }: { items: ReviewItem[] }) {
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const reviewed = Object.keys(marks).length;

  return (
    <>
      <p aria-live="polite" className="mt-6 text-sm text-ink-soft">
        <span className="font-mono tabular-nums">{reviewed}</span> of{" "}
        <span className="font-mono tabular-nums">{items.length}</span> shown items reviewed.
      </p>
      <ul className="mt-3 space-y-3">
        {items.map(({ transaction: t, score, reasons }) => (
          <li key={t.id} className="rounded-sm border border-rule bg-surface p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <h2 className="font-display text-xl">{t.merchant}</h2>
              <p className="font-mono text-[15px] tabular-nums">{formatCents(t.amountCents)}</p>
            </div>
            <p className="mt-1 text-sm text-ink-soft">
              {formatShortDate(t.date)} · {CATEGORY_LABELS[t.category]} · model score{" "}
              <span className="font-mono">{score.toFixed(2)}</span>
            </p>
            {reasons.length > 0 && (
              <ul className="mt-3 list-disc pl-5 text-sm">
                {reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
            <div
              role="group"
              aria-label={`Mark ${t.merchant} on ${formatShortDate(t.date)}`}
              className="mt-4 flex gap-2"
            >
              {OPTIONS.map(({ mark, label, active }) => {
                const isOn = marks[t.id] === mark;
                return (
                  <button
                    key={mark}
                    type="button"
                    aria-pressed={isOn}
                    onClick={() => setMarks((all) => ({ ...all, [t.id]: mark }))}
                    className={`rounded-sm border px-3 py-1.5 text-sm font-medium transition-colors ${isOn ? active : "border-ink hover:bg-forest-soft"}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
