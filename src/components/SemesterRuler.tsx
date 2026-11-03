// A column chart laid over a 16-week ruler. It is built from plain HTML and CSS,
// so it needs no chart library and no browser JavaScript; hover and keyboard
// tooltips are handled by CSS. Later, the timeline playback will build on this.

import { formatShortDate } from "@/lib/dates";
import { formatCents, formatDollars } from "@/lib/money";
import type { WeekTotal } from "@/lib/summary";
import type { SemesterEvent } from "@/lib/types";
import { SectionHeading } from "./SectionHeading";

const TICK_STEP_CENTS = 20_000; // A gridline every $200.
const SCALE_ROUNDING_CENTS = 10_000; // Round the top of the chart up to $100s.

interface SemesterRulerProps {
  weeks: WeekTotal[];
  events: SemesterEvent[];
  currentWeek: number;
  budgetCents: number;
}

/** Tooltips near the edges align inward so they never run off the screen. */
function tooltipPosition(index: number, total: number): string {
  if (index < 3) return "left-0";
  if (index > total - 4) return "right-0";
  return "left-1/2 -translate-x-1/2";
}

export function SemesterRuler({
  weeks,
  events,
  currentWeek,
  budgetCents,
}: SemesterRulerProps) {
  const weeklyPlanCents = Math.round(budgetCents / weeks.length);
  const elapsed = weeks.filter((w) => !w.isFuture);
  const peak = Math.max(...elapsed.map((w) => w.cents), weeklyPlanCents);
  const scaleCents =
    Math.ceil(peak / SCALE_ROUNDING_CENTS) * SCALE_ROUNDING_CENTS;
  const toPercent = (cents: number) => (cents / scaleCents) * 100;

  const ticks: number[] = [];
  for (let c = 0; c <= scaleCents; c += TICK_STEP_CENTS) ticks.push(c);

  const eventsByWeek = new Map(events.map((e) => [e.week, e.label]));
  const weeksLeft = weeks.length - currentWeek;
  const gridStyle = {
    gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))`,
  };

  return (
    <section className="">
      <SectionHeading
        title="The semester, week by week"
        description={`Total spending per week, against an even ${formatDollars(weeklyPlanCents)} weekly share of the plan.`}
      />

      <div className="mt-8 pl-10">
        {/* Plot area */}
        <div className="relative h-60">
          {ticks.map((c) => (
            <div
              key={c}
              className="absolute inset-x-0 border-t border-rule"
              style={{ bottom: `${toPercent(c)}%` }}
            >
              <span className="absolute -top-2 -left-10 w-8 text-right font-mono text-[11px] text-ink-soft tabular-nums">
                {formatDollars(c)}
              </span>
            </div>
          ))}

          {/* The part of the semester that has not happened yet */}
          {weeksLeft > 0 && (
            <div
              className="absolute inset-y-0 right-0 bg-rule/30"
              style={{ width: `${(weeksLeft / weeks.length) * 100}%` }}
            >
              <p className="p-2 text-right text-xs text-ink-soft">
                {weeksLeft} {weeksLeft === 1 ? "week" : "weeks"} to go
              </p>
            </div>
          )}

          {/* Plan reference line, labeled in the empty future area */}
          <div
            className="absolute inset-x-0 border-t border-pennant"
            style={{ bottom: `${toPercent(weeklyPlanCents)}%` }}
          >
            <span className="absolute right-1 bottom-0.5 text-xs font-medium">
              Plan {formatDollars(weeklyPlanCents)}/wk
            </span>
          </div>

          {/* One full-height column per week: the whole column is the hover target */}
          <div className="absolute inset-0 grid gap-0.5" style={gridStyle}>
            {weeks.map((w, index) => {
              if (w.isFuture) return <div key={w.week} />;

              const isLabeled = w.cents === peak || w.week === currentWeek;
              const dates = `${formatShortDate(w.startDate)} to ${formatShortDate(w.endDate)}`;
              const event = eventsByWeek.get(w.week);

              return (
                <div
                  key={w.week}
                  tabIndex={0}
                  role="img"
                  aria-label={`Week ${w.week}, ${dates}: ${formatCents(w.cents)}${event ? `, ${event}` : ""}`}
                  className="group relative rounded-sm outline-offset-2 outline-forest hover:z-20 focus-visible:z-20 focus-visible:outline-2"
                >
                  <div
                    className="absolute inset-x-0 bottom-0 mx-auto max-w-6 rounded-t bg-forest group-hover:bg-forest-deep"
                    style={{
                      height: `${toPercent(w.cents)}%`,
                    }}
                  />
                  {isLabeled && (
                    <span
                      className="absolute left-1/2 -translate-x-1/2 pb-0.5 font-mono text-[11px] font-medium"
                      style={{ bottom: `${toPercent(w.cents)}%` }}
                    >
                      {formatDollars(w.cents)}
                    </span>
                  )}
                  <div
                    className={`pointer-events-none absolute top-0 w-36 rounded-sm bg-ink px-3 py-2 text-xs text-paper opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 ${tooltipPosition(index, weeks.length)}`}
                  >
                    <p className="font-semibold">Week {w.week}</p>
                    <p className="text-paper/80">{dates}</p>
                    <p className="mt-1 font-mono text-sm">
                      {formatCents(w.cents)}
                    </p>
                    {event && <p className="mt-1 text-paper/80">{event}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* The ruler: a tick and number for each week, with event markers */}
        <div className="grid border-t-2 border-ink" style={gridStyle}>
          {weeks.map((w) => {
            const isCurrent = w.week === currentWeek;
            const isMajor = (w.week - 1) % 4 === 0;
            return (
              <div key={w.week} className="flex flex-col items-center">
                <span className="flex h-2.5 items-start">
                  <span
                    className={`w-px bg-ink ${isMajor || isCurrent ? "h-2.5" : "h-1.5"}`}
                  />
                </span>
                <span
                  className={`mt-1 flex h-5 min-w-5 items-center justify-center rounded-full font-mono text-[11px] tabular-nums ${isCurrent ? "bg-ink font-medium text-paper" : "text-ink-soft"}`}
                >
                  {w.week}
                </span>
                {eventsByWeek.has(w.week) && (
                  <span
                    aria-hidden="true"
                    className="mt-1 h-1.5 w-1.5 rounded-full bg-marigold ring-1 ring-ink"
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 space-y-3 pl-10 text-sm">
        <ul className="flex flex-wrap gap-x-5 gap-y-1">
          {events.map((e) => (
            <li key={e.week} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full bg-marigold ring-1 ring-ink"
              />
              <span className="font-mono text-xs text-ink-soft">
                Wk {e.week}
              </span>
              {e.label}
            </li>
          ))}
        </ul>

        <details className="w-full">
          <summary className="cursor-pointer text-sm font-medium underline underline-offset-4">
            View as table
          </summary>
          <table className="mt-3 w-full text-left text-sm">
            <thead className="text-xs text-ink-soft">
              <tr className="border-b border-rule">
                <th scope="col" className="py-1.5 pr-4 font-medium">
                  Week
                </th>
                <th scope="col" className="py-1.5 pr-4 font-medium">
                  Dates
                </th>
                <th scope="col" className="py-1.5 text-right font-medium">
                  Spent
                </th>
              </tr>
            </thead>
            <tbody>
              {elapsed.map((w) => (
                <tr key={w.week} className="border-b border-rule">
                  <td className="py-1.5 pr-4 font-mono tabular-nums">
                    {w.week}
                  </td>
                  <td className="py-1.5 pr-4">
                    {formatShortDate(w.startDate)} to{" "}
                    {formatShortDate(w.endDate)}
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums">
                    {formatCents(w.cents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>
    </section>
  );
}
