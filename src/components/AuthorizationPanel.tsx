"use client";

// Step two of the simulator: sign a narrow, short-lived permission, send it, then try
// to break it. Every attempt goes to the server, and the log shows its real response.

import { useRef, useState } from "react";
import type { SimulatedPurchase } from "@/lib/authorization/requestStore";
import type { SignedAuthorization } from "@/lib/authorization/schema";
import type { Decision } from "@/lib/policy/purchasePolicy";
import { formatCents } from "@/lib/money";

interface Purchase {
  merchant: string;
  category: string;
  amountCents: number;
}

interface AuthorizationPanelProps {
  profileId: string;
  week: number;
  purchase: Purchase;
  decision: Decision;
  recorded: SimulatedPurchase[];
  onRecordedChange: () => Promise<void>;
}

interface LogEntry {
  id: number;
  label: string;
  status: number;
  outcome: string;
  message: string;
}

const postJson = (url: string, body: unknown) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const labButton =
  "rounded-sm border border-ink px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:border-rule disabled:text-ink-soft disabled:hover:bg-transparent";

export function AuthorizationPanel({
  profileId,
  week,
  purchase,
  decision,
  recorded,
  onRecordedChange,
}: AuthorizationPanelProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [signed, setSigned] = useState<SignedAuthorization | null>(null);
  const [lastKey, setLastKey] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const nextLogId = useRef(0);

  const recordedCents = recorded.reduce((sum, p) => sum + p.amountCents, 0);

  async function issue(demoExpired = false): Promise<SignedAuthorization | null> {
    const response = await postJson("/api/authorizations", {
      profileId,
      week,
      merchant: purchase.merchant,
      category: purchase.category,
      maxAmountCents: purchase.amountCents,
      challengeConfirmed: confirmed,
      demoExpired,
    });
    return response.ok ? ((await response.json()) as SignedAuthorization) : null;
  }

  async function run(action: () => Promise<void>) {
    setIsBusy(true);
    setError(null);
    try {
      await action();
    } catch {
      setError("The server could not be reached. Please try again.");
    } finally {
      setIsBusy(false);
    }
  }

  async function send(label: string, body: unknown) {
    const response = await postJson("/api/purchase/execute", body);
    const result = (await response.json()) as { outcome: string; message: string; retried?: boolean };
    nextLogId.current += 1;
    const entry: LogEntry = {
      id: nextLogId.current,
      label,
      status: response.status,
      outcome: result.retried ? `${result.outcome} (retry)` : result.outcome,
      message: result.message,
    };
    setLog((entries) => [entry, ...entries]);
    await onRecordedChange();
  }

  const requestBody = (key: string, overrides: Partial<Purchase> = {}) => ({
    idempotencyKey: key,
    purchase: { ...purchase, ...overrides },
    signedAuthorization: signed,
  });
  const newKey = () => crypto.randomUUID();

  if (decision === "DENY") {
    return (
      <p className="rounded-sm border border-rule bg-surface p-5 text-sm">
        <span className="font-medium">No authorization offered.</span> A signature
        can&rsquo;t override a denial: the server re-runs the same rules when a purchase is sent.
      </p>
    );
  }

  return (
    <article className="rounded-sm border border-rule bg-surface p-5">
      <p className="font-mono text-xs tracking-wide text-ink-soft uppercase">
        Prototype · not production payment security
      </p>
      <h3 className="mt-2 font-display text-xl">Authorize this simulated purchase</h3>

      {decision === "CHALLENGE" && (
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-1 accent-forest"
          />
          I confirm this purchase, as the rules above ask.
        </label>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={isBusy}
          className={labButton}
          onClick={() =>
            run(async () => {
              setSigned(await issue());
              setLastKey(null);
            })
          }
        >
          {signed ? "Sign a new authorization" : "Sign demo authorization"}
        </button>
        <button
          type="button"
          disabled={isBusy || !signed}
          className={labButton}
          onClick={() =>
            run(async () => {
              const key = newKey();
              setLastKey(key);
              await send("Send purchase", requestBody(key));
            })
          }
        >
          Send purchase
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-pennant">
          {error}
        </p>
      )}

      {signed && (
        <dl className="mt-4 grid gap-x-4 gap-y-1 border-t border-rule pt-3 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-ink-soft">Scope</dt>
          <dd>
            {signed.authorization.scope.merchant}, {signed.authorization.scope.category}
          </dd>
          <dt className="text-ink-soft">Week</dt>
          <dd className="font-mono">{signed.authorization.week}</dd>
          <dt className="text-ink-soft">Maximum</dt>
          <dd className="font-mono">{formatCents(signed.authorization.maxAmountCents)}</dd>
          <dt className="text-ink-soft">Expires</dt>
          <dd className="font-mono break-all">{signed.authorization.expiresAt}</dd>
          <dt className="text-ink-soft">Confirmed</dt>
          <dd>{signed.authorization.challengeConfirmed ? "Yes" : "No"}</dd>
          <dt className="text-ink-soft">Nonce</dt>
          <dd className="font-mono break-all">{signed.authorization.nonce}</dd>
          <dt className="text-ink-soft">Signature</dt>
          <dd className="font-mono break-all">{signed.signature.slice(0, 32)}…</dd>
        </dl>
      )}

      {signed && (
        <div className="mt-4 border-t border-rule pt-3">
          <h4 className="text-sm font-semibold">Try to break it</h4>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isBusy || !lastKey}
              className={labButton}
              onClick={() => run(() => send("Retry, same key", requestBody(lastKey as string)))}
            >
              Retry, same key
            </button>
            <button
              type="button"
              disabled={isBusy}
              className={labButton}
              onClick={() => run(() => send("Reuse, new key", requestBody(newKey())))}
            >
              Reuse, new key
            </button>
            <button
              type="button"
              disabled={isBusy}
              className={labButton}
              onClick={() =>
                run(() =>
                  send("Different merchant", requestBody(newKey(), { merchant: "Some Other Store" })),
                )
              }
            >
              Different merchant
            </button>
            <button
              type="button"
              disabled={isBusy}
              className={labButton}
              onClick={() =>
                run(() =>
                  send("Tamper with maximum", {
                    ...requestBody(newKey()),
                    signedAuthorization: {
                      ...signed,
                      authorization: {
                        ...signed.authorization,
                        maxAmountCents: signed.authorization.maxAmountCents + 100_000,
                      },
                    },
                  }),
                )
              }
            >
              Tamper with maximum
            </button>
            <button
              type="button"
              disabled={isBusy}
              className={labButton}
              onClick={() =>
                run(async () => {
                  const expired = await issue(true);
                  await send("Expired authorization", {
                    ...requestBody(newKey()),
                    signedAuthorization: expired,
                  });
                })
              }
            >
              Expired authorization
            </button>
            <button
              type="button"
              disabled={isBusy}
              className={labButton}
              onClick={() => run(() => send("Malformed request", { idempotencyKey: "x" }))}
            >
              Malformed request
            </button>
          </div>
        </div>
      )}

      {log.length > 0 && (
        <ol aria-live="polite" className="mt-4 space-y-2 border-t border-rule pt-3 text-sm">
          {log.map((entry) => (
            <li key={entry.id}>
              <span className="font-medium">{entry.label}</span>{" "}
              <span className="font-mono text-xs">
                HTTP {entry.status} · {entry.outcome}
              </span>
              <span className="block text-ink-soft">{entry.message}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-rule pt-3 text-sm">
        <p>
          Simulated purchases recorded for this student:{" "}
          <span className="font-mono tabular-nums">
            {recorded.length} · {formatCents(recordedCents)}
          </span>
        </p>
        <button
          type="button"
          disabled={isBusy}
          className="font-medium underline underline-offset-4"
          onClick={() =>
            run(async () => {
              await fetch("/api/purchase/recorded", { method: "DELETE" });
              setLog([]);
              setSigned(null);
              setLastKey(null);
              await onRecordedChange();
            })
          }
        >
          Reset demo memory
        </button>
      </div>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-medium">What does the signature prove?</summary>
        <p className="mt-2">
          <span className="font-medium">It proves</span> these fields were signed by the
          holder of this server&rsquo;s demo private key and have not changed since.
        </p>
        <p className="mt-2">
          <span className="font-medium">It does not prove</span> who clicked the button,
          that a real student agreed, or that the merchant is legitimate. There is no login,
          and this server both signs and verifies. A real system would keep the private key
          on the student&rsquo;s own device or in a secure key service.
        </p>
        <p className="mt-2">
          Resetting demo memory clears purchases for every student and replaces the signing key, so
          earlier authorizations stop working.
        </p>
      </details>
    </article>
  );
}
