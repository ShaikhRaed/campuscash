# Architecture

Technical reference. For setup and usage, see the [README](../README.md). Measured results are in [EVALUATION.md](EVALUATION.md).

## Architecture

```text
LOCAL MODEL (POST /api/assistant/interpret), advisory
  student's text ──> Ollama on this computer ──> JSON constrained to a schema
                 ──> server validation: schema, drop extra fields, discard values not in the text
                 ──> a draft that only fills in a form a person reviews
  The model gets only the text. It has no tools, keys, grants, budgets or endpoints.

THE DECISION PIPELINE (POST /api/proposals/evaluate → processProposal)

  signed grant ──┐   (demo student key: scope, total limit, valid weeks)
  signed proposal┤   (demo assistant key: merchant, category, amount, nonce)
  idempotency key┘
        │
        ▼
  REQUEST CHECKS        shape → retry? → grant signature → proposal signature → grant link → nonce
        │               failure: REJECTED, no decision
        ▼
  AUTHORIZATION SCOPE   active → valid period → merchant → category → remaining allowance
        │               failure: DENY
        ▼
  POLICY RULES          evaluatePurchasePolicy(purchase, budget state)
        │               ALLOW, CHALLENGE or DENY
        ▼
  strictest result ──> stored once ──> audit log (every attempt)
                         └─ ALLOW only: one simulated row, which uses budget and allowance

SEPARATE EXPERIMENTS (no path into the pipeline)
  /review  anomaly model on synthetic data        /ask  campus Q&A with citations
```

```text
src/
├── app/                        Pages and API routes
│   ├── page.tsx                Workbench (/)
│   ├── budget/                 Budget timeline, a reference view
│   ├── how-it-works/           Rules and measured results
│   ├── review/, ask/           Separate experiments
│   └── api/                    sandbox/{state,clock,reset}, authorizations, assistant/propose,
│                               proposals/evaluate, assistant/{interpret,model}, purchase/recorded, ask
├── components/
│   ├── workbench/              The five-step sandbox screen
│   └── ...                     Budget timeline and experiment screens
├── data/
│   ├── sampleStudent.ts, profiles.ts    Simulated students and transactions
│   ├── campus/                 Fictional documents and evaluation questions
│   ├── llm/                    Versioned test set for request interpretation
│   └── generated/              Measured results, written only by the eval scripts
└── lib/
    ├── authorization/
    │   ├── processProposal.ts  The decision pipeline
    │   ├── schema.ts           Signed records and strict parsing
    │   ├── signature.ts        Ed25519 signing and verification
    │   ├── requestStore.ts     Unique keys and nonces, and the audit log
    │   └── demoRuntime.ts      Demo keys, simulated clock, active grants
    ├── policy/purchasePolicy.ts    The deterministic rules, with no imports
    ├── llm/                    Ollama client, output validation, prompt, evaluation
    ├── simulation.ts           One budget calculation, used everywhere
    ├── summary.ts, events.ts   Budget math and event replay
    ├── ml/                     Anomaly experiment
    └── retrieval/              Q&A experiment
scripts/                        Evaluation runners and the repo-local Ollama helper
e2e/                            Browser tests and a fake Ollama
```

### Key decisions

- **The model can't reach the decision.** It receives only the student's text and has no tools. Its output is validated, and it only fills in a form. The pipeline drops unknown fields, `evaluatePurchasePolicy` takes only structured fields, and tests read the import lines to confirm the model code and decision code can't reach each other.
- **Model output is untrusted.** Invalid JSON, missing fields, timeouts and an absent Ollama all become clear results. Merchants and amounts not in the student's text are discarded. Missing information is recalculated by the server.
- **Inference stays local.** The server refuses any Ollama address outside this computer, and the browser never talks to Ollama.
- **Rejected versus denied.** A bad signature or replay is `REJECTED` with no decision, because the request can't be
  trusted. A valid request outside its permission gets `DENY`, because that's a real answer about a real request.
- **The strictest result wins.** Scope checks and policy rules both run, so the trace shows every problem at once.
- **The server owns the clock and budget.** Requests can't supply a week, budget or decision.
- **One source of truth.** The workbench, policy and budget timeline all use `buildBudgetState`.
- **`CHALLENGE` is the end of the flow.** A confirmation step would imply consent this sandbox can't establish.
- **Money is whole cents and dates are UTC.** This avoids decimal drift and time-zone shifts.
- **No database.** Sandbox state is in memory, so it needs no infrastructure and resets easily.

## Authorization prototype

| Situation | Response |
| --- | --- |
| Valid request, within scope and rules | `200`, `ALLOW` |
| Valid request, a policy rule asks for confirmation | `200`, `CHALLENGE` |
| Outside scope, expired, revoked, over allowance, or a policy rule forbids it | `200`, `DENY` with reasons |
| Same idempotency key, identical request (a retry) | The stored answer, marked `RETRY_RETURNED_STORED`; nothing runs again |
| Same signed proposal, new key (a replay) | `409 REJECTED_REPLAY` |
| Same key, different request | `409 REJECTED_IDEMPOTENCY_CONFLICT` |
| Changed record or wrong signer | `401 REJECTED_BAD_SIGNATURE` |
| Proposal names a different grant | `400 REJECTED_GRANT_MISMATCH` |
| Missing or invalid fields | `400 REJECTED_MALFORMED` |

A decision uses up its nonce whatever the result, so a `DENY` can't be replayed either. A forged or malformed request uses
up nothing.

| Control | What it does | What it does not do |
| --- | --- | --- |
| **Grant signature** | Shows the grant was signed by the demo student key and hasn't changed | Show a real student agreed, or identify who clicked |
| **Proposal signature** | Shows the proposal was signed by the demo assistant key and hasn't changed | Identify a real agent, or show the proposal is wise |
| **Scope checks** | Keep a proposal within the merchant, category and total limit | Decide it is sensible: the policy rules do that |
| **Valid period** | Rejects proposals outside the weeks on the simulated clock | Use real time; the demo's clock control has no login |
| **Revocation** | Makes earlier grants stop working | Reach anything beyond this one process |
| **Nonce** | Lets a signed proposal be evaluated once, even in a simultaneous race | Survive a restart, when memory and keys are replaced |
| **Idempotency key** | Makes a retry of the same attempt return the first answer | Authorize anything: a key alone grants nothing |
| **Audit log** | Records every attempt, including rejections | Resist tampering: it is in memory, with no hash chain |
| **Policy rules** | Apply ten simple rules to server-side budget state | Act as a real risk engine |

There is no login, and one server holds both keys and signs and verifies everything, so **neither signature shows who really
acted**. A real system would need authenticated users, keys held by each party, and durable storage.

## Testing

| Suite | Covers |
| --- | --- |
| `npm test` (228 tests, Vitest) | The pipeline: all three decisions, scope, period, revocation, signatures, replay versus retry, malformed requests, trace and audit. The local model: failures, schema validation, grounding, remote-address refusal, hostile output through the real pipeline, import-level separation, and every saved answer re-scored. Also each policy rule, budget math, event replay, metric formulas, retrieval math, and saved evaluation files matching the code |
| `npm run test:e2e` (51 tests, Playwright) | The workbench on a production build in Chrome against a fake Ollama: model panel, invalid output, timeouts, Ollama down, a hostile model, plus simultaneous requests, client-supplied fields, the budget timeline, experiments, phone-width layout, simulated-data labels and no requests to other hosts |

The real model is exercised by `npm run eval:llm` and was checked by hand in a browser, not in the automated browser suite.

**Not tested:** browsers other than Chrome; screen readers; more than one server process; large or slow requests; other models or machines; inference with the network physically off; whether each quoted answer truly answers its question.

## Limitations in detail

- **No identity or consent:** there is no login, so anything that can reach the local server can get signatures, move the clock, or reset the sandbox.
- **Both keys live in one process:** two signers illustrate the idea, but they don't separate real parties.
- **The model isn't an agent:** it reads text and returns fields. `/api/assistant/propose` is a separate demo signer that signs whatever it is asked to, and it doesn't call the model.
- **The model can be manipulated and wrong:** it followed 2 of 6 injections and mislabels categories. The checks protect the rules, not the meaning, so a person must review drafts. A distracted reviewer could submit a wrong one.
- **Grounding is simple:** it checks that values appear in the text, not what they refer to. Amounts written as words are discarded.
- **Local doesn't mean perfectly private:** the app makes no outside calls for inference, but only the Ollama processes' connections during evaluation were checked, not all of its behavior.
- **State is in memory:** grants, purchases, the audit log and keys vanish on restart, and uniqueness covers one server process. A real system would use database constraints.
- **The audit log isn't tamper-evident,** and rejected entries show what a request claimed, unverified.
- **The clock is simulated:** there is no real-time expiry.
- **The blocked list matches names only.** Spacing, invisible characters and look-alike forms are normalized, but a different spelling such as "Quick Cash Advance" isn't caught by that rule.
- **`CHALLENGE` has no follow-up:** the sandbox records it and stops, with no confirmation flow.
- **Experiments are limited:** small, synthetic, self-authored evaluations, and LSA is a weak semantic method. A reworded attack could be quoted as a Q&A answer, though it can't reach the pipeline.
- **`npm audit`** reports moderate warnings in ESLint's dependencies (development only) and 0 in production dependencies. They were left in place because the suggested forced fix can break tooling.
