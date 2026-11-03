# CampusCash

A student budget assistant with a safe, **simulated** purchase-decision flow. It shows how an
AI-style suggestion can be kept separate from, and checked by, trusted deterministic code.

This is a portfolio and learning project, not a financial service. Every student, school,
merchant, document and transaction is made up. It never connects to a bank, moves money or makes
purchases. It has no real user accounts. Nothing here is production payment security or fraud
detection or proof of user consent. It is not Experian's system or any other company's product, and it
is not affiliated with one. Names in the sample data are invented; any resemblance to a real person or
business is accidental.

New to the code? Start with the [learning guide](docs/LEARNING_GUIDE.md).

## Setup

You need [Node.js](https://nodejs.org) 22.12 or newer, which includes npm. The first install
and build need internet access to download packages and fonts.

```bash
git clone https://github.com/ShaikhRaed/campuscash.git
cd campuscash
npm install
npm run dev
```

Open <http://localhost:3000>. Press `Ctrl+C` in the terminal to stop the server. The app listens on this
computer only, not on your network.

**No environment variables or API keys are needed**, so there is no `.env` file to create.

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the development server |
| `npm run check` | Runs lint, type check, unit tests and production build |
| `npm run test:e2e` | Builds, then drives the demo in your installed Google Chrome |
| `npm run lint` / `npm run typecheck` / `npm test` | Runs one check |
| `npm run build`, then `npm start` | Builds and serves the production version |
| `npm run eval:ml` | Reruns the ML experiment and rewrites its results file |
| `npm run eval:retrieval` | Reruns the retrieval evaluation and rewrites its results file |

The browser tests use port 3100 and need Google Chrome installed. Everything else needs no browser.

## Five-minute demo script

Restart the server first so demo memory is clean, or press **Reset demo memory** in the authorization panel.
The app's simulated-data banner stays on screen throughout.

| Time | Do this | Say this |
| --- | --- | --- |
| 0:00 | Open the dashboard | "This is a personal learning project on simulated data. It isn't Experian's system or a real payment product. The question is: how do you let AI-style software suggest things without letting it decide?" |
| 0:30 | Press **Next week**, then **Back** ($1,844.99, then $1,767.27). Press **Simulate a double delivery of this week** | "Numbers come from a stream of events. Ten duplicates were ignored, and the total didn't change." |
| 1:15 | Click **Payday lender, with a pushy note**, then **Review purchase** | "The advisor says it looks fine, because I made it gullible on purpose. The policy says DENY, because it never receives that note." |
| 2:00 | Click **Textbook, $42**, **Review purchase**, **Sign demo authorization**, **Send purchase** (total becomes $1,809.27) | "The permission is limited to this student, week, merchant, category and amount, and it expires. The server checks all of that and re-runs the policy." |
| 2:45 | Press **Retry, same key**, **Reuse, new key**, **Tamper with maximum** | "A retry adds nothing, reuse is refused, and tampering breaks the signature." |
| 3:15 | Open **What does the signature prove?** | "It proves the record came from a demo key and hasn't changed. There's no login, so it isn't proof of consent. That's the biggest gap between this and anything real." |
| 3:40 | Open **How it works** and scroll to the experiment | "PR-AUC is 0.516 against 0.172 for a simple rule, on synthetic data I generated myself. It also flagged 31 of 32 legitimate large purchases. This is not real-world fraud detection." |
| 4:20 | Open **Ask**, then click the "Textbook deal alert" example | "This document contains a planted attack. It's flagged and not quoted, and retrieved text has no path to the policy. Hybrid search didn't clearly beat keyword search on my small test set." |
| 4:50 | Stop | "What did I get wrong about how real systems handle this?" |

## Architecture

Suggestions and decisions take separate paths. Only the lower path can change anything.

```text
ADVISORY (can be wrong)
  student's note, model score ──> advisor ──> shown to the student, then discarded

BINDING (deterministic)
  purchase + budget state ──> evaluatePurchasePolicy() ──> ALLOW / CHALLENGE / DENY

RECORDING A SIMULATED PURCHASE
  shape ─> retry check ─> signature ─> expiry ─> scope ─> nonce ─> policy again ─> one row in memory

CAMPUS Q&A (read-only, no path to any of the above)
  question ──> BM25 + LSA ──> RRF ──> quoted answer with citations, or a refusal
```

```text
src/
├── app/                        Pages and API routes
│   ├── page.tsx, review/, ask/, how-it-works/
│   └── api/                    review, authorizations, execute, recorded, ask
├── components/                 Display and interaction
├── data/
│   ├── sampleStudent.ts, profiles.ts    Simulated students and transactions
│   ├── campus/                 Fictional documents and evaluation questions
│   └── generated/              Measured results, written only by the eval scripts
└── lib/
    ├── summary.ts, events.ts       Budget math and event replay
    ├── simulation.ts           One budget calculation shared by dashboard and policy
    ├── policy/purchasePolicy.ts    The deterministic decision-maker, with no imports
    ├── advisor.ts              Simulated, deliberately gullible advisor
    ├── reviewPurchase.ts       Runs advisor and policy side by side
    ├── authorization/          Signatures, schema, store, request pipeline
    ├── ml/                     Synthetic data, features, model, metrics, experiment
    └── retrieval/              BM25, LSA, RRF, Recall@k, quoted answers
scripts/                        Evaluation runners
e2e/demo.spec.ts                Browser tests of the demo walkthrough
```

### Key decisions

- **The policy can't be persuaded.** `evaluatePurchasePolicy` accepts only the purchase and
  trusted budget state. Notes, model scores and documents have no way in.
- **One source of truth.** The dashboard and policy both call `buildBudgetState`, so they can't
  disagree about spending. The server computes its own copy and ignores budget numbers from the browser.
- **Money is whole cents and dates are UTC.** This avoids decimal drift and time-zone shifts.
- **Events are idempotent.** Replaying transaction events ignores duplicates by event ID, handles
  out-of-order delivery, and rejects malformed events.
- **No database.** Prototype state is in memory, so it needs no infrastructure and is easy to reset.

## Authorization prototype

A **scoped authorization record** names a profile, a simulated week, a merchant and/or category, a
maximum amount and an expiry. It is signed with Ed25519, and the server checks it before recording anything.

| Situation | Response |
| --- | --- |
| Valid request | `201 RECORDED` |
| Same idempotency key, same body (a retry) | The first response again, nothing added |
| Same key, different body | `409 IDEMPOTENCY_CONFLICT` |
| Used authorization, new key (a replay) | `409 REPLAY` |
| Changed record or wrong key | `401 BAD_SIGNATURE` |
| Past its expiry | `403 EXPIRED` |
| Wrong merchant or category, or over the maximum | `403 OUT_OF_SCOPE` |
| Policy says `DENY` | `403 POLICY_DENIED` |
| Policy says `CHALLENGE`, no signed confirmation | `403 CHALLENGE_REQUIRED` |
| Missing or invalid fields | `400 MALFORMED` |

| Control | What it does | What it does not do |
| --- | --- | --- |
| **Ed25519 signature** | Shows the fields were signed by the holder of this server's demo key and haven't changed | Identify who clicked, show a real student agreed, or vouch for the merchant |
| **Scope check** | Keeps a purchase within the signed merchant, category and maximum | Decide the purchase is wise: the policy does that |
| **Expiry** | Limits how long a stolen or forgotten authorization is useful | Stop reuse before it expires: the nonce does that |
| **Nonce** | Lets one authorization be spent once | Protect anything after a server restart, when memory and keys are replaced |
| **Idempotency key** | Makes a retry of the same attempt return the first answer, adding nothing | Authorize anything: a key alone grants nothing, and it isn't secret |
| **Policy re-run** | Applies current budget state at recording time, so a signature can't override `DENY` | Act as a real risk engine: it is ten simple rules |

Simple rule of thumb: the nonce stops the same permission being **spent twice**, and the idempotency key
makes the same attempt **safe to retry**.

There is no login, and the same server both signs and verifies, so a signature here can't represent real
consent. A real system would need authenticated users and a private key held on the student's device or
in a secure key service. Resetting demo memory also replaces the key, so earlier authorizations stop working.

## ML experiment

A logistic regression, written from scratch in `src/lib/ml/`, ranks synthetic transactions by how
unusual they look. **The score is advisory.** It can change the advisor's text and the Review list,
never a purchase decision.

Method: 100 synthetic students, with 7 features that look only at the past. The split is by student
(60 train, 20 validation, 20 test). The threshold is chosen on validation data and the data includes
deliberately hard cases and some wrong labels. Results below come from the first run, with no tuning
afterward. Source: `src/data/generated/ml-results.json`.

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

**Reading these:**

- **Precision** asks: of the flags raised, how many were right? **Recall** asks: of the real
  positives, how many were found? **PR-AUC** summarizes the tradeoff across all thresholds.
- **Class imbalance:** always answering "normal" would be 96.6% accurate and catch nothing, which is
  why accuracy isn't used. PR-AUC's random baseline is about the share of positives.
- **Thresholds trade one mistake for another.** Lower finds more and raises more false alarms.
- **False positives are real here:** the model flagged 31 of 32 legitimate large purchases.
- **Blind spots:** it caught 19 of 19 duplicates and 26 of 27 large new-merchant charges, but 0 of 10
  spikes at familiar merchants and 1 of 18 ordinary-looking charges.

**Limits:** this is not fraud detection. The same author wrote the data rules and the model, so it is
partly relearning planted patterns. These results say nothing about real students or real fraud, and
they don't measure its flags on the sample profiles, which were built differently. Scores are
rankings, not probabilities, because class weighting distorts them.

## Campus Q&A

Search covers 27 passages from fictional documents. Answers are **word-for-word quotes with
citations**. No language model writes anything.

- **Keyword (BM25)** rewards rare words shared by the question and passage.
- **Semantic (LSA)** compares topics learned from words that appear together. It is a classic
  statistical method, weaker than modern neural embeddings, chosen because it needs no key or download.
- **Hybrid (RRF)** adds `1 / (60 + rank)` from each list, so differently scaled scores can be combined.
- **Recall@k** is the share of relevant passages appearing in the top k results.

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

**Reading these:** hybrid did not clearly beat keyword search here. On the held-out set one question
moves a score by 0.10, so these gaps aren't meaningful. The refusal threshold was first 0.6 and was
lowered to 0.5 after seeing development results, which is why those are labeled optimistic and a
separate held-out set was written and scored once. The same author wrote documents and questions.
Whether each quote truly answers its question was **not** measured: support only means that enough of
the question's key words appear in the retrieved passages.

### Untrusted documents

One sample document contains a planted attack telling the system to approve everything. The tests show:

- It is retrieved and labeled, but never quoted in an answer.
- It can't change a policy decision, even when fed directly to the advisor.
- A reworded attack that **fools the detector and the advisor** still gets `DENY`.
- The policy module has no imports and takes only two inputs, so it has no path to retrieved text.

The detector is a simple pattern match and easy to evade. Safety comes from the policy's structure, not
from detection.

## Testing

| Suite | Covers |
| --- | --- |
| `npm test` (133 tests, Vitest) | Budget math, event replay, each policy rule and boundary; valid, expired, out-of-scope, repeated and malformed authorization requests; metric formulas against hand calculations; split and leakage guards; retrieval math; injection resistance; saved evaluation files matching what the code produces |
| `npm run test:e2e` (27 tests, Playwright) | The demo walkthrough on a production build in Chrome, including simultaneous requests, phone-width layout, simulated-data labels and no requests to other hosts |

**Not tested:** browsers other than Chrome; screen readers (keyboard focus and reduced motion got only a one-off
browser check on an earlier version); more than one server process; large or slow requests; whether
each quoted answer truly answers its question.

## Known limitations

- **Prototype authorization:** no login, so anything that can reach the local server can get a signature or
  reset the demo, and `challengeConfirmed` is only a checkbox value, not proof of consent. Idempotency-conflict
  responses reveal that a key has been used.
- **The blocked list matches names only.** Spacing, invisible characters and look-alike forms are normalized,
  but a different spelling such as "Quick Cash Advance" gets `CHALLENGE`, not `DENY`.
- **State is in memory:** authorizations and simulated purchases vanish on restart, and the uniqueness
  guarantee covers one server process only. A real system would use database constraints.
- **Issue times aren't enforced:** only expiry is checked, because the demo signer is the same server.
- **A review result is a snapshot:** after a purchase is recorded, an earlier review stays on screen until
  you review again. Recording itself always re-runs the policy.
- **Review** shows Maya only, and marks reset on reload. They don't retrain the model or affect decisions.
- **The advisor is a template**, not an AI model, and it is gullible on purpose.
- **Q&A is extractive:** it quotes rather than explains, and the instruction detector is a simple pattern
  match that a reworded attack can evade, in which case the text could be quoted as an answer. It still
  can't reach the purchase policy.
- **LSA is a weak semantic method** on 27 passages, and the evaluation sets are small and self-authored.
- **Model flags on the sample profiles were not evaluated.** Those students weren't built like the
  training data.
- **`npm audit`** reports 16 moderate warnings in ESLint's dependencies (development only) and 0 in
  production dependencies. They were left in place because the suggested forced fix can break tooling.

## Concepts demonstrated

These are general ideas for systems where software acts for a person. This project is a small teaching
model of them, not an implementation of any standard or product.

| Concept | Here | Missing from this demo |
| --- | --- | --- |
| Separate advice from enforcement | Advisor and model can't reach the policy | A real AI agent |
| Scoped, expiring delegation | Signed authorization record | Real user consent and identity |
| Verifying who is acting | Only "signed by the demo key" | Any agent or user identity verification |
| Replay and retry safety | Nonce, idempotency key, unique store | Durable, multi-server storage |
| Untrusted input boundary | Retrieved text can't reach the policy | Broader defenses and an audit trail |
| Honest evaluation | Held-out data, baselines, stated limits | Real-world data |

## Accurate claims for a resume

**Resume bullet:**

> Built a Next.js/TypeScript prototype of a simulated student purchase-decision flow that separates advisory output from deterministic ALLOW/CHALLENGE/DENY rules, with Ed25519-signed scoped authorizations, replay protection and idempotent retries, verified by 133 unit and 27 browser tests; evaluated a logistic regression on synthetic data (test PR-AUC 0.516 vs. 0.172 rule baseline) and BM25/LSA retrieval with citations (Recall@3 0.90 on 10 held-out questions).

**Do not claim:** that this is Experian's system; production payment security; real-world fraud detection; proof of user
consent; real users or customers; payment processing; that hybrid search improved results; neural embeddings; a real LLM;
or any measured real-world performance.
