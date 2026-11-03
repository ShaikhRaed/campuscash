// Ranked bars show where the money went. Every bar is one color because length
// already carries the meaning, and each row prints its exact value as text.

import { formatCents } from "@/lib/money";
import type { CategoryTotal } from "@/lib/summary";
import { SectionHeading } from "./SectionHeading";

export function CategoryBreakdown({
  categories,
}: {
  categories: CategoryTotal[];
}) {
  const largest = categories[0]?.cents ?? 0;

  return (
    <section>
      <SectionHeading
        title="Where it went"
        description="Spending by category so far. Income isn't counted."
      />

      <ul className="mt-6 space-y-4">
        {categories.map((c) => (
          <li key={c.category}>
            <div className="flex items-baseline justify-between gap-4 text-[15px]">
              <span>{c.label}</span>
              <span className="whitespace-nowrap">
                <span className="font-mono tabular-nums">
                  {formatCents(c.cents)}
                </span>
                <span className="ml-2 inline-block w-9 text-right font-mono text-xs text-ink-soft tabular-nums">
                  {Math.round(c.share * 100)}%
                </span>
              </span>
            </div>
            <div className="mt-1.5 h-2.5">
              <div
                className="h-full rounded-r bg-forest"
                style={{ width: `${(c.cents / largest) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
