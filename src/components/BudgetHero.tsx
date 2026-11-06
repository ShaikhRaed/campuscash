import { formatCents, formatDollars } from "@/lib/money";
import type { BudgetEstimate } from "@/lib/summary";
import type { Semester, StudentProfile } from "@/lib/types";

interface BudgetHeroProps {
  student: StudentProfile;
  semester: Semester;
  currentWeek: number;
  estimate: BudgetEstimate;
}

function Meter({
  label,
  fraction,
  fillClass,
}: {
  label: string;
  fraction: number;
  fillClass: string;
}) {
  const percent = Math.round(fraction * 100);
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-mono tabular-nums">{percent}%</span>
      </div>
      <div className="mt-1.5 h-2 rounded-full bg-forest-soft">
        <div
          className={`h-full rounded-full ${fillClass}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  );
}

export function BudgetHero({
  student,
  semester,
  currentWeek,
  estimate,
}: BudgetHeroProps) {
  const difference = estimate.projectedDifferenceCents;
  const firstName = student.name.split(" ")[0];
  const aheadOfCalendar =
    estimate.fractionOfBudgetUsed > estimate.fractionOfSemesterElapsed;

  return (
    <section className="grid gap-8 lg:grid-cols-12 lg:gap-10">
      <div className="lg:col-span-7">
        <p className="font-mono text-[13px] tracking-wide text-ink-soft uppercase">
          {semester.name} · Week {currentWeek} of {semester.totalWeeks}
        </p>
        <h1 className="mt-3 font-display text-3xl sm:text-4xl">
          {firstName}&rsquo;s semester so far
        </h1>

        <p data-testid="spent-total" className="mt-3 font-mono text-4xl font-medium">
          {formatCents(estimate.spentCents)}
        </p>
        <p className="mt-2 text-lg text-ink-soft">
          spent of a {formatDollars(estimate.budgetCents)} semester plan
        </p>

        <div className="mt-7 max-w-lg space-y-3">
          <Meter
            label="Plan used"
            fraction={estimate.fractionOfBudgetUsed}
            fillClass="bg-pennant"
          />
          <Meter
            label="Semester elapsed"
            fraction={estimate.fractionOfSemesterElapsed}
            fillClass="bg-forest"
          />
          <p className="pt-1 text-sm text-ink-soft">
            {aheadOfCalendar
              ? "Spending is running ahead of the calendar."
              : "Spending is at or behind the calendar."}
          </p>
        </div>
      </div>

      <aside className="rounded-sm bg-forest-deep p-6 text-white sm:p-8 lg:col-span-5">
        <h2 className="font-display text-2xl">Budget estimate</h2>

        <p className="mt-5 text-sm text-forest-soft">If recent weeks continue</p>
        <p className="mt-1 font-mono text-3xl font-medium">
          {formatDollars(estimate.projectedCents)}
        </p>
        <p className="mt-2 text-white">
          {difference > 0
            ? `by semester's end, about ${formatDollars(difference)} over plan`
            : difference < 0
              ? `by semester's end, about ${formatDollars(-difference)} under plan`
              : "by semester's end, right on plan"}
        </p>

        <dl className="mt-6 divide-y divide-paper/20 border-y border-paper/20 text-sm">
          <div className="flex items-baseline justify-between gap-4 py-2.5">
            <dt className="text-forest-soft">
              Pace, last {estimate.paceWindowWeeks}{" "}
              {estimate.paceWindowWeeks === 1 ? "week" : "weeks"}
            </dt>
            <dd className="font-mono tabular-nums">
              {formatCents(estimate.paceCents)}/wk
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 py-2.5">
            <dt className="text-forest-soft">
              {estimate.weeksLeft === 0
                ? "Semester complete"
                : `To finish on plan, ${estimate.weeksLeft} ${estimate.weeksLeft === 1 ? "week" : "weeks"} left`}
            </dt>
            <dd className="font-mono tabular-nums">
              {estimate.weeksLeft === 0
                ? "Final"
                : `${formatCents(estimate.perWeekToStayOnPlanCents)}/wk`}
            </dd>
          </div>
        </dl>

        <p className="mt-4 text-[13px] leading-relaxed text-forest-soft">
          How it&rsquo;s calculated: {formatCents(estimate.spentCents)} spent +{" "}
          {estimate.weeksLeft} {estimate.weeksLeft === 1 ? "week" : "weeks"} ×{" "}
          {formatCents(estimate.paceCents)}. A
          simple projection, so it can&rsquo;t foresee one-off costs.
        </p>
      </aside>
    </section>
  );
}
