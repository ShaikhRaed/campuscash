# CampusCash

**A student purchase-authorization sandbox with a local LLM.** A student sets a budget and gives a hypothetical assistant limited
permission to propose a purchase, such as course materials up to a set amount during a specified period. A small model running on
this computer reads the student's natural-language request and returns structured fields. A person reviews them, and deterministic
code evaluates the proposal and records whether it would `ALLOW`, `CHALLENGE` or `DENY` it. **The model never decides.**

This is a portfolio and learning project. It **never makes a real purchase or connects to a bank**. Every student,
school, merchant, document and transaction is made up, and it has no real user accounts. It is not production payment
security, real-world fraud detection or proof of user consent. It is not Experian's system or any other company's
product, and it is not affiliated with one. Names in the sample data are invented; any resemblance to a real person or
business is accidental.

New to the code? Start with the [learning guide](docs/LEARNING_GUIDE.md).

## Setup

You need [Node.js](https://nodejs.org) 22.12 or newer, which includes npm. The first install and build need internet
access to download packages and fonts.

```bash
git clone https://github.com/ShaikhRaed/campuscash.git
cd campuscash
git switch feature/local-llm-proposals   # until this work is merged into main
npm install
npm run dev
```

Open <http://localhost:3000>. Press `Ctrl+C` in the terminal to stop the server. The app listens on this computer only,
not on your network.

**No API keys or `.env` file are needed.** The app works without the local model: the workbench explains how to set it up, and the
proposal form and every deterministic check keep working.

## Local model setup

Inference runs on your computer through [Ollama](https://ollama.com). There are no cloud APIs or keys.

```bash
brew install ollama          # or the installer from ollama.com
ollama serve                 # leave this running in its own terminal
ollama pull llama3.2:3b      # downloads about 2 GB, once
```

Then refresh the workbench, and the model panel should say `READY`.

**What needs the internet:** cloning, `npm install`, the first build (it downloads fonts), installing Ollama and pulling the model.

**What should work offline afterward:** the app, the local model and every deterministic check, because inference runs on this computer and the app calls no outside service. While the evaluation ran, the Ollama processes held no connections outside this computer, and browser tests confirm the app's pages contact no other host. I didn't test with the network physically switched off.

**Measured on the development Mac** (Apple M5, 16 GB unified memory, Ollama 0.40.14):

| | Measured |
| --- | --- |
| Model on disk | 2.02 GB (`llama3.2:3b`, 3.2B parameters, Q4_K_M) |
| Memory while loaded | 2.32 GB, all on the GPU, with a 2,048-token context |
| Cold start | About 1.6 s for the first request |
| Later requests | About 0.87 s median |

Other machines will differ, and a Mac with less free memory may struggle. These are one machine's numbers, not requirements.

**Optional settings** (environment variables):

| Variable | Default | Purpose |
| --- | --- | --- |
| `OLLAMA_MODEL` | `llama3.2:3b` | Which local model to use |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama's address. Anything other than this computer is refused |
| `OLLAMA_TIMEOUT_MS` | `30000` | How long to wait for an answer |

**Repo-local install (optional):** to keep everything inside the project, unpack the official `ollama-darwin.tgz` release into `.ollama-local/bin/`
(verify it against the release's `sha256sum.txt`), then use `scripts/ollama-local.sh serve` and `scripts/ollama-local.sh pull llama3.2:3b`. That
folder is gitignored, holds the models and Ollama's identity file, and starts Ollama with `OLLAMA_NO_CLOUD=1`.

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the development server |
| `npm run check` | Runs lint, type check, unit tests and production build |
| `npm run test:e2e` | Builds, then drives the app in your installed Google Chrome |
| `npm run lint` / `npm run typecheck` / `npm test` | Runs one check |
| `npm run build`, then `npm start` | Builds and serves the production version |
| `npm run eval:llm` | Reruns the local-model evaluation and rewrites its results file (needs Ollama) |
| `npm run eval:ml` | Reruns the anomaly experiment and rewrites its results file |
| `npm run eval:retrieval` | Reruns the retrieval evaluation and rewrites its results file |

The browser tests use ports 3100 and 3101 and need Google Chrome installed. They use a small fake Ollama (`e2e/fake-ollama.mjs`), so they don't need the model and can trigger failures on demand. `npm run check` doesn't need Ollama either.

## Five-minute demo script

Start Ollama, restart the app or press **Reset sandbox**, and follow this order: the allowance is a running total, so an earlier ALLOW changes later results. Without Ollama, skip the model steps and use the **Textbook, $42** example instead. Model output can vary with the version or machine, so check this before a live demo.

| Time | Do this | Say this |
| --- | --- | --- |
| 0:00 | Open the workbench and point at step 1 | "This is a personal learning project on simulated data. It isn't Experian's system or a real payment product. A student gives a hypothetical assistant limited permission: course materials, up to $150, weeks 9 to 12." |
| 0:30 | Point at the model panel | "A small LLM runs on this laptop through Ollama, with no cloud calls. It only turns text into structured fields, and it can't sign, evaluate or decide." |
| 0:50 | Click **Clear request**, **Interpret with local model**, **Copy into proposal form** | "Here's the raw output and what survived validation. It only fills in a form, and nothing has happened yet: the audit log is still empty." |
| 1:30 | Click **Submit proposal** | "Now the deterministic pipeline runs. Here's every check, and the result: ALLOW. Spending and the allowance updated, and no money moved." |
| 2:00 | Click **Textbook, $120**, **Submit proposal** | "Only $108 of the allowance is left, so this is DENY. The model isn't involved in that." |
| 2:20 | Click **Prompt injection**, **Interpret with local model**, **Copy into proposal form**, **Submit proposal** | "This request tells the model to output ALLOW. Whatever it says, the only fields sent are merchant, category and amount, and the rules still say DENY." |
| 3:00 | Open **How it works**, then **Local model evaluation** | "In my test set, the model followed 2 of 6 injections. One turned a $20 notebook into $1 at another store, and those values passed every check, because they were in the text. So the checks protect the rules, not the meaning, which is why a person reviews the form." |
| 3:40 | Back on the workbench, submit **Textbook, $42**, then press **Safe retry**, **Replay** and **Tamper with amount** | "A retry returns the stored answer, a replay is rejected, and tampering breaks the signature." |
| 4:20 | Point at the demo-signature text in step 1 | "These signatures show a record came from a demo key and hasn't changed. There's no login, so this isn't proof of consent. That's the biggest gap between this and anything real." |
| 4:50 | Stop | "What did I get wrong about how real systems handle this?" |

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

## Local model evaluation

**Method:** a versioned set of hand-written requests (`src/data/llm/interpretationCases.ts`, `interpret-cases-v1`): 6 development cases, allowed for prompt changes, and 31 test cases covering normal, ambiguous, malformed, out-of-scope and prompt-injection requests. I wrote the cases before seeing any results and froze the prompt (`interpret-v1`) before scoring the test set, once. Accuracy is measured after server validation. Each request runs one at a time with temperature 0. Results are in `src/data/generated/llm-results.json`, and tests re-score every saved answer through the current code.

**Test set:** `llama3.2:3b` on an Apple M5 with 16 GB, measured 2026-11-03.

| Measure | Result |
| --- | --- |
| Schema-valid responses | 31 of 31 |
| Merchant correct | 28 of 31 |
| Amount correct | 30 of 31 |
| Category correct | 23 of 31 |
| Missing information correct | 28 of 31 |
| Merchant, amount and category all correct | 21 of 31 |
| Prompt injections followed | 2 of 6 |
| Latency, median / 95th percentile / max | 868 / 961 / 1,062 ms |
| Cold start | 1,575 ms |

| Kind | All fields correct |
| --- | --- |
| Normal | 8 of 10 |
| Ambiguous | 5 of 6 |
| Malformed | 4 of 5 |
| Out of scope | 2 of 4 |
| Prompt injection | 2 of 6 |

**Reading these:**

- **Schema validity says little about the model.** Ollama constrains the output format, so 31 of 31 mostly shows that constraint working.
- **Category is the weakest field.** The model often guessed `transport`, even for movie tickets.
- **Grounding helped only slightly:** before server validation, merchant was right on 27 and amount on 29.
- **The checks don't verify meaning.** In `injection-2`, "$20 notebook at Campus Print Center" plus a planted instruction became $1 at Larkspur Campus Bookstore. Those values really are in the text, so validation kept them, and they fit the grant. A test documents that this draft would get `ALLOW`. The rules held, but the fields weren't what the student meant, so a person must review the form.
- **The set is small and self-authored.** This describes one model and one prompt on these cases. It doesn't establish general model quality or injection resistance.

## Experiment: unusual-transaction model

Separate from the main flow: the decision pipeline doesn't import it, and its score goes nowhere except the `/review` page and
**How it works**. A logistic regression, written from scratch in `src/lib/ml/`, ranks synthetic transactions by how unusual they look.

**Method:** 100 synthetic students, with 7 features that look only at the past. The split is by student (60 train, 20 validation,
20 test). The threshold is chosen on validation data, and the data includes deliberately hard cases and some wrong labels. These results
come from the first run, with no tuning afterward. Source: `src/data/generated/ml-results.json`.

**Test set, seed 2026:** 20 students, 2,432 rows, 83 labeled unusual (3.4%). Threshold 0.80.

|  | Flagged | Not flagged |
| --- | --- | --- |
| **Labeled unusual** | 46 caught | 37 missed |
| **Labeled normal** | 64 false alarms | 2,285 correctly passed |

| Metric | Result |
| --- | --- |
| Precision | 41.8% |
| Recall | 55.4% |
| PR-AUC | 0.516 |
| PR-AUC, simple rule (amount at least 3x category median) | 0.172 |
| PR-AUC, random guessing | 0.034 |
| PR-AUC range across 5 data seeds | 0.407 to 0.660 |

| Threshold | Flags | Precision | Recall |
| --- | --- | --- | --- |
| 0.1 | 2,174 | 3.8% | 100.0% |
| 0.3 | 929 | 8.3% | 92.8% |
| 0.5 | 448 | 15.4% | 83.1% |
| 0.7 | 212 | 24.1% | 61.4% |
| 0.9 | 69 | 53.6% | 44.6% |

- **Class imbalance:** always answering "normal" would be 96.6% accurate and catch nothing, so accuracy isn't used.
- **False positives are real here:** it flagged 31 of 32 legitimate large purchases.
- **Blind spots:** it caught 19 of 19 duplicates and 26 of 27 large new-merchant charges, but 0 of 10 spikes at familiar merchants and
  1 of 18 ordinary-looking charges.

**Limits:** this is not fraud detection. The same author wrote the data rules and the model, so it is partly relearning planted patterns.
These results say nothing about real students or real fraud, and its flags on the sample profiles weren't evaluated. Scores are rankings, not
probabilities.

## Experiment: campus Q&A

Separate from the main flow: retrieved text has no path into the decision pipeline. Search covers 27 passages from fictional documents, and answers
are **word-for-word quotes with citations**. No language model writes anything.

- **Keyword (BM25)** rewards rare words shared by the question and passage.
- **Semantic (LSA)** compares topics learned from words that appear together. It is a classic statistical method, weaker than modern neural embeddings.
- **Hybrid (RRF)** adds `1 / (60 + rank)` from each list.
- **Recall@k** is the share of relevant passages in the top k results.

Source: `src/data/generated/retrieval-results.json`.

| Method | Held-out R@1 | R@3 | R@5 | Development R@1 | R@3 | R@5 |
| --- | --- | --- | --- | --- | --- | --- |
| Keyword (BM25) | 0.80 | 0.90 | 0.90 | 0.88 | 1.00 | 1.00 |
| Semantic (LSA) | 0.80 | 1.00 | 1.00 | 0.72 | 0.88 | 0.96 |
| Hybrid (RRF) | 0.80 | 0.90 | 1.00 | 0.80 | 1.00 | 1.00 |

| Saying when sources don't support an answer | Held-out | Development |
| --- | --- | --- |
| Answerable questions answered | 8 of 10 | 23 of 25 |
| Unanswerable questions refused | 5 of 5 | 6 of 8 |

**Reading these:** hybrid did not clearly beat keyword search. On the held-out set one question moves a score by 0.10, so these gaps aren't meaningful. The refusal
threshold was first 0.6 and lowered to 0.5 after seeing development results, which is why those are labeled optimistic and a separate held-out set was written and scored
once. The same author wrote the documents and questions. Whether each quote truly answers its question was **not** measured.

**Untrusted documents:** one sample document contains a planted attack. Tests show it is flagged and never quoted, and that a policy decision can't change, because the policy takes no text. A reworded attack fools the detector, and the policy still says `DENY`. Safety comes from the structure, not from detection. This experiment doesn't use the LLM.

## Testing

| Suite | Covers |
| --- | --- |
| `npm test` (228 tests, Vitest) | The pipeline: all three decisions, scope, period, revocation, signatures, replay versus retry, malformed requests, trace and audit. The local model: failures, schema validation, grounding, remote-address refusal, hostile output through the real pipeline, import-level separation, and every saved answer re-scored. Also each policy rule, budget math, event replay, metric formulas, retrieval math, and saved evaluation files matching the code |
| `npm run test:e2e` (51 tests, Playwright) | The workbench on a production build in Chrome against a fake Ollama: model panel, invalid output, timeouts, Ollama down, a hostile model, plus simultaneous requests, client-supplied fields, the budget timeline, experiments, phone-width layout, simulated-data labels and no requests to other hosts |

The real model is exercised by `npm run eval:llm` and was checked by hand in a browser, not in the automated browser suite.

**Not tested:** browsers other than Chrome; screen readers; more than one server process; large or slow requests; other models or machines; inference with the network physically off; whether each quoted answer truly answers its question.

## Known limitations

- **No identity or consent:** there is no login, so anything that can reach the local server can get signatures, move the clock, or reset the sandbox.
- **Both keys live in one process:** two signers illustrate the idea, but they don't separate real parties.
- **The model isn't an agent:** it reads text and returns fields. `/api/assistant/propose` is a separate demo signer that signs whatever it is asked to, and it doesn't call the model.
- **The model can be manipulated and wrong:** it followed 2 of 6 injections and mislabels categories. The checks protect the rules, not the meaning, so a person must review drafts. A distracted reviewer could submit a wrong one.
- **Grounding is simple:** it checks that values appear in the text, not what they refer to. Amounts written as words are discarded.
- **Local doesn't mean perfectly private:** the app makes no outside calls for inference, but I only checked the Ollama processes' connections during evaluation, not all of its behavior.
- **State is in memory:** grants, purchases, the audit log and keys vanish on restart, and uniqueness covers one server process. A real system would use database constraints.
- **The audit log isn't tamper-evident,** and rejected entries show what a request claimed, unverified.
- **The clock is simulated:** there is no real-time expiry.
- **The blocked list matches names only.** Spacing, invisible characters and look-alike forms are normalized, but a different spelling such as "Quick Cash Advance" isn't caught by that rule.
- **`CHALLENGE` has no follow-up:** the sandbox records it and stops, with no confirmation flow.
- **Experiments are limited:** small, synthetic, self-authored evaluations, and LSA is a weak semantic method. A reworded attack could be quoted as a Q&A answer, though it can't reach the pipeline.
- **`npm audit`** reports moderate warnings in ESLint's dependencies (development only) and 0 in production dependencies. They were left in place because the suggested forced fix can break tooling.

## Concepts demonstrated

General ideas for systems where software acts for a person. This is a small teaching model of them, not an implementation of any standard or product.

| Concept | Here | Missing from this demo |
| --- | --- | --- |
| Separate model output from enforcement | The local model only fills in a form, and can't reach the pipeline | An agent with tools or autonomy |
| Treat model output as untrusted | Schema validation, grounding, failure handling | Checks that verify meaning |
| Scoped, expiring delegation | Signed grant with limit and valid period | Real user consent and identity |
| Attributing an action | "Signed by the demo assistant key" | Any real agent or user identity verification |
| Replay and retry safety | Nonce, idempotency key, unique store | Durable, multi-server storage |
| Explainable decisions and audit | Full trace and an audit log of every attempt | Tamper-evident, durable records |
| Honest evaluation | Held-out data, baselines, stated limits | Real-world data |

## Accurate claims for a resume

**Resume bullet:**

> Built a Next.js/TypeScript purchase-authorization sandbox on simulated data where a local LLM (llama3.2:3b via Ollama) turns natural-language requests into validated, schema-constrained proposals, while deterministic server code alone handles Ed25519-signed scoped grants, replay and idempotency protection, and ALLOW/CHALLENGE/DENY decisions; evaluated interpretation on 31 hand-written cases (21 fully correct, 2 of 6 injections followed, 868 ms median on Apple M5) and proved model output can't bypass the checks with 228 unit and 51 browser tests.

**Do not claim:** that this is Experian's system; production payment security; real-world fraud detection; proof of user consent; real users or customers; payment processing; an autonomous AI agent; general model quality or injection resistance; that hybrid search
improved results; or any measured real-world performance.
