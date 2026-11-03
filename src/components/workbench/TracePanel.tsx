// Steps 3 and 4: every check that ran, then the final result and why.

import { DecisionBadge, Panel, type Attempt } from "./shared";

const STATUS_CLASS: Record<string, string> = {
  PASS: "text-forest",
  FAIL: "font-medium text-pennant",
  CHALLENGE: "font-medium text-amber-700",
  NOT_RUN: "text-ink-soft",
};

const LAYERS = [
  ["request", "Request checks"],
  ["authorization", "Authorization scope"],
  ["policy", "Deterministic policy rules"],
] as const;

export function TracePanel({ attempt }: { attempt: Attempt | null }) {
  return (
    <div className="grid gap-3 lg:grid-cols-12">
      <div className="lg:col-span-8">
        <Panel step={3} title="Authorization checks and policy rules" note={attempt ? `Trace for: ${attempt.label}` : undefined}>
          {!attempt ? (
            <p className="text-sm text-ink-soft">Submit a proposal to see every check that runs.</p>
          ) : (
            <div className="space-y-3">
              {LAYERS.map(([layer, title]) => {
                const steps = attempt.result.trace.filter((s) => s.layer === layer);
                return (
                  <div key={layer} className="overflow-x-auto">
                    <table className="w-full text-left text-sm" aria-label={title}>
                      <caption className="pb-0.5 text-left text-xs font-semibold tracking-wide text-ink-soft uppercase">{title}</caption>
                      <tbody>
                        {steps.length === 0 ? (
                          <tr className="border-t border-rule">
                            <td className="py-0.5 text-ink-soft">Did not run for this request.</td>
                          </tr>
                        ) : (
                          steps.map((s) => (
                            <tr key={s.check} className="border-t border-rule align-baseline">
                              <td className={`w-20 py-0.5 pr-2 font-mono text-xs ${STATUS_CLASS[s.status]}`}>{s.status}</td>
                              <td className="w-2/5 py-0.5 pr-3">{s.check}</td>
                              <td className="py-0.5 text-ink-soft">{s.detail}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      <div className="lg:col-span-4">
        <Panel step={4} title="Final result" id="result">
          {!attempt ? (
            <p className="text-sm text-ink-soft">No result yet.</p>
          ) : (
            <div aria-live="polite">
              <DecisionBadge decision={attempt.result.decision} large />
              <p className="mt-2 text-sm" data-testid="reason">{attempt.result.reason}</p>
              <p className="mt-2 font-mono text-xs text-ink-soft">
                HTTP {attempt.status} · {attempt.result.outcome}
              </p>
              <p className="mt-2 border-t border-rule pt-2 text-xs text-ink-soft">
                A sandbox result: what the rules would do. No real purchase was made.
              </p>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
