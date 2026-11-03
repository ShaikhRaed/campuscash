// Step 5: replay and retry controls, the request that was sent, and the audit log.

import { formatCents } from "@/lib/money";
import { buttonClass, DecisionBadge, Panel, shorten, type SandboxState } from "./shared";

export const TEST_CONTROLS = [
  ["retry", "Safe retry", "Same idempotency key, same request"],
  ["replay", "Replay", "Same signed proposal, new idempotency key"],
  ["conflict", "Key reuse", "Same idempotency key, different proposal"],
  ["tamperProposal", "Tamper with amount", "Changes the signed proposal"],
  ["tamperGrant", "Tamper with limit", "Changes the signed grant"],
  ["malformed", "Malformed request", "Missing required fields"],
] as const;

export type TestControl = (typeof TEST_CONTROLS)[number][0];

interface AuditPanelProps {
  state: SandboxState;
  busy: boolean;
  lastRequest: unknown;
  onControl: (control: TestControl) => void;
}

/** Shortens signatures for reading. The server received the full values. */
function displayRequest(request: unknown) {
  return JSON.stringify(
    request,
    (key, value) => (key === "signature" && typeof value === "string" ? `${value.slice(0, 16)}…` : value),
    2,
  );
}

export function AuditPanel({ state, busy, lastRequest, onControl }: AuditPanelProps) {
  const headers = ["Seq", "Week", "Outcome", "Decision", "Student", "Merchant", "Amount", "Idempotency key", "Nonce", "Reason"];
  return (
    <div className="space-y-3">
      <Panel step={5} title="Replay and retry controls" note="Each one really calls the server, using the last request">
        <div role="group" aria-label="Test controls" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {TEST_CONTROLS.map(([id, label, detail]) => (
            <div key={id} className="text-xs text-ink-soft">
              <button type="button" className={`${buttonClass} w-full text-ink`} disabled={busy || !lastRequest} onClick={() => onControl(id)}>
                {label}
              </button>
              <p className="mt-0.5">{detail}</p>
            </div>
          ))}
        </div>
        {lastRequest ? (
          <details className="mt-3 border-t border-rule pt-2 text-sm">
            <summary className="cursor-pointer font-medium">Last request sent to /api/proposals/evaluate</summary>
            <pre data-testid="request-json" className="mt-1 max-h-72 overflow-auto bg-paper p-2 font-mono text-xs">
              {displayRequest(lastRequest)}
            </pre>
          </details>
        ) : (
          <p className="mt-2 text-sm text-ink-soft">Submit a proposal first.</p>
        )}
      </Panel>

      <Panel
        title="Audit log"
        note={`${state.audit.length} ${state.audit.length === 1 ? "entry" : "entries"}, newest first · in memory, not tamper-evident`}
      >
        {state.audit.length === 0 ? (
          <p className="text-sm text-ink-soft">No requests yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[60rem] text-left text-xs" aria-label="Audit log">
              <thead className="text-ink-soft">
                <tr>
                  {headers.map((h) => <th key={h} scope="col" className="py-1 pr-3 font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody className="font-mono">
                {state.audit.map((entry) => (
                  <tr key={entry.seq} className="border-t border-rule align-baseline">
                    <td className="py-1 pr-3">{entry.seq}</td>
                    <td className="py-1 pr-3">{entry.week}</td>
                    <td className="py-1 pr-3 whitespace-nowrap">{entry.outcome}</td>
                    <td className="py-1 pr-3"><DecisionBadge decision={entry.decision} /></td>
                    <td className="py-1 pr-3">{entry.profileId ?? "–"}</td>
                    <td className="py-1 pr-3">{entry.merchant ?? "–"}</td>
                    <td className="py-1 pr-3">{entry.amountCents === null ? "–" : formatCents(entry.amountCents)}</td>
                    <td className="py-1 pr-3">{shorten(entry.idempotencyKey, 10)}</td>
                    <td className="py-1 pr-3">{shorten(entry.nonce, 8)}</td>
                    <td className="py-1 font-sans">{entry.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
