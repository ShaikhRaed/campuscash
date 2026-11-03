"use client";

// The main sandbox screen. It holds only what the user is doing. Every number and decision
// comes from the server, because the point is that the browser isn't trusted to decide.

import { useEffect, useState } from "react";
import { DEFAULT_PROFILE_ID, profiles } from "@/data/profiles";
import type { SignedGrant, SignedProposal } from "@/lib/authorization/schema";
import type { ProposalDraft } from "@/lib/llm/draft";
import { formatCents } from "@/lib/money";
import { Masthead } from "../Masthead";
import { AuditPanel, type TestControl } from "./AuditPanel";
import { GrantPanel } from "./GrantPanel";
import { ModelPanel } from "./ModelPanel";
import { ProposalPanel, type ProposalInput, type ProposalPrefill } from "./ProposalPanel";
import { buttonClass, FieldTable, Panel, type Attempt, type EvaluationResult, type SandboxState } from "./shared";
import { TracePanel } from "./TracePanel";

interface EvaluationRequestBody {
  idempotencyKey: string;
  signedGrant: SignedGrant;
  signedProposal: SignedProposal;
}

const postJson = (url: string, body?: unknown) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

export function Workbench() {
  const [profileId, setProfileId] = useState(DEFAULT_PROFILE_ID);
  const [state, setState] = useState<SandboxState | null>(null);
  const [prefill, setPrefill] = useState<{ id: number; values: ProposalPrefill } | null>(null);
  const [lastRequest, setLastRequest] = useState<EvaluationRequestBody | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchState(id: string): Promise<SandboxState> {
    const response = await fetch(`/api/sandbox/state?profileId=${id}`);
    if (!response.ok) throw new Error("The sandbox server could not be reached.");
    return response.json();
  }

  // If the student changes while this is loading, the older answer is ignored.
  useEffect(() => {
    let isCurrent = true;
    fetchState(profileId)
      .then((next) => {
        if (isCurrent) setState(next);
      })
      .catch((e: Error) => {
        if (isCurrent) setError(e.message);
      });
    return () => {
      isCurrent = false;
    };
  }, [profileId]);

  /** Runs an action, then refreshes from the server so the screen shows its truth. */
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setState(await fetchState(profileId));
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "The request could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  function clearResult() {
    setAttempt(null);
    setPrefill(null);
    setLastRequest(null);
  }

  async function evaluate(label: string, body: unknown) {
    const response = await postJson("/api/proposals/evaluate", body);
    setAttempt({ label, status: response.status, result: (await response.json()) as EvaluationResult });
  }

  async function propose(input: ProposalInput, grantId: string): Promise<SignedProposal> {
    const response = await postJson("/api/assistant/propose", { grantId, ...input });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    return result;
  }

  function submitProposal(input: ProposalInput) {
    const signedGrant = state?.grant?.signedGrant;
    if (!signedGrant) return;
    void run(async () => {
      const body: EvaluationRequestBody = {
        idempotencyKey: crypto.randomUUID(),
        signedGrant,
        signedProposal: await propose(input, signedGrant.grant.grantId),
      };
      setLastRequest(body);
      await evaluate("Submitted proposal", body);
    });
  }

  /** The model's only effect on the app: filling in a form that a person then reviews. */
  function useDraft(draft: ProposalDraft) {
    setPrefill((current) => ({
      id: (current?.id ?? 0) + 1,
      values: {
        ...(draft.merchant && { merchant: draft.merchant }),
        ...(draft.category && { category: draft.category }),
        ...(draft.amountCents !== null && { amount: (draft.amountCents / 100).toFixed(2) }),
      },
    }));
  }

  function runControl(control: TestControl) {
    const request = lastRequest;
    if (!request) return;
    void run(async () => {
      const { proposal } = request.signedProposal;
      const { grant } = request.signedGrant;
      switch (control) {
        case "retry":
          return evaluate("Safe retry", request);
        case "replay":
          return evaluate("Replay", { ...request, idempotencyKey: crypto.randomUUID() });
        case "conflict":
          return evaluate("Key reuse", {
            ...request,
            signedProposal: await propose(
              { merchant: proposal.merchant, category: proposal.category, amountCents: proposal.amountCents + 100 },
              grant.grantId,
            ),
          });
        case "tamperProposal":
          return evaluate("Tamper with amount", {
            idempotencyKey: crypto.randomUUID(),
            signedGrant: request.signedGrant,
            signedProposal: { ...request.signedProposal, proposal: { ...proposal, amountCents: 1 } },
          });
        case "tamperGrant":
          return evaluate("Tamper with limit", {
            idempotencyKey: crypto.randomUUID(),
            signedProposal: request.signedProposal,
            signedGrant: { ...request.signedGrant, grant: { ...grant, limitCents: grant.limitCents + 100_000 } },
          });
        case "malformed":
          return evaluate("Malformed request", { idempotencyKey: "x" });
      }
    });
  }

  const budget = state?.budget;

  return (
    <>
      <Masthead student={state?.student} current="workbench" />

      <main className="mx-auto max-w-7xl space-y-3 px-4 py-4 sm:px-6">
        <section aria-label="Sandbox controls" className="flex flex-wrap items-end gap-x-5 gap-y-2 rounded-sm border border-rule bg-surface px-3 py-2 text-sm">
          <label>
            Simulated student
            <select
              value={profileId}
              onChange={(e) => {
                setProfileId(e.target.value);
                clearResult();
              }}
              className="ml-2 rounded-sm border border-ink-soft bg-surface px-1.5 py-1"
            >
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.student.name}</option>)}
            </select>
          </label>
          <div className="flex items-center gap-1.5">
            <span>Simulated clock:</span>
            <button type="button" className={buttonClass} disabled={busy || !state || state.week <= 1} onClick={() => void run(async () => { await postJson("/api/sandbox/clock", { week: (state?.week ?? 2) - 1 }); })}>
              Previous week
            </button>
            <span data-testid="clock" className="px-1 font-mono font-medium">
              Week {state?.week ?? "–"} of {state?.totalWeeks ?? 16}
            </span>
            <button type="button" className={buttonClass} disabled={busy || !state || state.week >= state.totalWeeks} onClick={() => void run(async () => { await postJson("/api/sandbox/clock", { week: (state?.week ?? 0) + 1 }); })}>
              Next week
            </button>
          </div>
          <button
            type="button"
            className={`${buttonClass} ml-auto`}
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await postJson("/api/sandbox/reset");
                clearResult();
              })
            }
          >
            Reset sandbox
          </button>
        </section>

        {error && <p role="alert" className="rounded-sm border border-pennant bg-surface px-3 py-2 text-sm font-medium text-pennant">{error}</p>}

        {!state || !budget ? (
          <p className="text-sm text-ink-soft">Loading the sandbox…</p>
        ) : (
          <>
            <Panel step={1} title="Simulated budget and active authorization" note="Calculated by the server">
              <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
                <div>
                  <h3 className="text-sm font-semibold">Simulated budget</h3>
                  <div className="mt-1">
                    <FieldTable
                      rows={[
                        ["Student", state.student.name],
                        ["Semester plan", formatCents(budget.budgetCents)],
                        ["Spent", <span key="s" data-testid="spent">{formatCents(budget.spentCents)}</span>],
                        ["Remaining", formatCents(budget.remainingCents)],
                        ["Weekly pace", formatCents(budget.paceCents)],
                        ["Projected end", formatCents(budget.projectedCents)],
                        ["Weeks left", String(budget.weeksLeft)],
                      ]}
                    />
                  </div>
                </div>
                <GrantPanel
                  key={profileId}
                  state={state}
                  busy={busy}
                  onSet={(grant) =>
                    void run(async () => {
                      const response = await postJson("/api/authorizations", { profileId, ...grant });
                      if (!response.ok) throw new Error((await response.json()).error);
                      clearResult();
                    })
                  }
                  onRevoke={() =>
                    void run(async () => {
                      await fetch(`/api/authorizations?profileId=${profileId}`, { method: "DELETE" });
                    })
                  }
                />
              </div>
            </Panel>

            <div className="grid gap-3 lg:grid-cols-2">
              <ModelPanel onUseDraft={useDraft} />
              <ProposalPanel
                key={prefill?.id ?? 0}
                hasGrant={Boolean(state.grant)}
                busy={busy}
                prefill={prefill?.values ?? null}
                onSubmit={submitProposal}
              />
            </div>
            <TracePanel attempt={attempt} />
            <AuditPanel state={state} busy={busy} lastRequest={lastRequest} onControl={runControl} />
          </>
        )}
      </main>
    </>
  );
}
