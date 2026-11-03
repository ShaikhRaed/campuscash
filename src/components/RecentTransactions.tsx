// The latest entries, laid out like a ledger. A real <table> gives screen readers
// the rows and columns for free. Money in is marked with a "+" as well as color.

import { formatShortDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { CATEGORY_LABELS } from "@/lib/summary";
import type { Transaction } from "@/lib/types";
import { SectionHeading } from "./SectionHeading";

interface RecentTransactionsProps {
  transactions: Transaction[];
  totalCount: number;
}

export function RecentTransactions({
  transactions,
  totalCount,
}: RecentTransactionsProps) {
  return (
    <section>
      <SectionHeading
        title="Recent transactions"
        description={`The latest ${transactions.length} of ${totalCount} simulated entries so far.`}
      />

      <table className="mt-3 w-full border-collapse text-left">
        <thead className="sr-only">
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Merchant</th>
            <th scope="col">Amount</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => {
            const isCredit = t.direction === "credit";
            return (
              <tr key={t.id} className="border-b border-rule">
                <td className="w-16 py-2.5 pr-3 align-baseline font-mono text-xs whitespace-nowrap text-ink-soft sm:w-20">
                  {formatShortDate(t.date)}
                </td>
                <td className="py-2.5 pr-3 align-baseline">
                  <span className="block text-[15px] font-medium">
                    {t.merchant}
                  </span>
                  <span className="block text-[13px] text-ink-soft">
                    {CATEGORY_LABELS[t.category]} · {t.account}
                  </span>
                </td>
                <td
                  className={`py-2.5 text-right align-baseline font-mono text-[15px] whitespace-nowrap tabular-nums ${isCredit ? "font-medium text-forest" : ""}`}
                >
                  {isCredit ? "+" : ""}
                  {formatCents(t.amountCents)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
