# CampusCash learning guide

CampusCash is a student purchase-authorization sandbox on simulated data. A small model running on this computer reads a student's request and returns structured fields. A person reviews them, and deterministic code records whether the proposal would get `ALLOW`, `CHALLENGE` or `DENY`. It never makes a real purchase or connects to a bank.
It is a prototype, and it isn't production payment security, real-world fraud detection or proof of user consent.

Evaluation numbers come from `src/data/generated/`. Reproduce them with `npm run eval:llm`, `npm run eval:ml` and `npm run eval:retrieval`.

## 1. Repository map

```text
README.md                  Setup, usage, short technical notes, limitations
docs/ARCHITECTURE.md       Pipeline, authorization reference, testing, detailed limitations
docs/EVALUATION.md         Evaluation methods and results
docs/LEARNING_GUIDE.md     This guide
e2e/demo.spec.ts           Browser tests
scripts/                   Evaluation runners
src/
├── app/
│   ├── page.tsx           Workbench (/), the main demo
│   ├── budget/            Budget timeline, a reference view
│   ├── how-it-works/      Rules and measured results
│   ├── review/  ask/      Separate experiments
│   └── api/
│       ├── sandbox/state, clock, reset     What the workbench shows and controls
│       ├── authorizations/route.ts         Sets or revokes a grant (demo student signer)
│       ├── assistant/propose/route.ts      Signs a proposal (demo assistant signer)
│       ├── proposals/evaluate/route.ts     The decision pipeline's entry point
│       ├── assistant/interpret/route.ts    Asks the local model and validates its answer
│       ├── assistant/model/route.ts        Whether the local model is ready
│       ├── purchase/recorded/route.ts      Lists simulated purchases
│       └── ask/route.ts                    Campus Q&A; read-only
├── components/
│   ├── workbench/         Workbench, GrantPanel, ModelPanel, ProposalPanel, TracePanel, AuditPanel
│   └── ...                Budget timeline and experiment screens
├── data/                  Simulated students, fictional documents, saved results
└── lib/
    ├── authorization/     processProposal, schema, signature, requestStore, demoRuntime
    ├── policy/purchasePolicy.ts    The deterministic rules
    ├── llm/               ollamaClient, draft (validation), prompt, config, evaluate
    ├── simulation.ts      buildBudgetState: the one budget calculation
    ├── events.ts          Replay with duplicate handling
    ├── ml/                Anomaly experiment
    └── retrieval/         Q&A experiment
```

## 2. Main request flow

1. **Review.** `Workbench.tsx` loads `GET /api/sandbox/state`. The server calculates budget state with `buildBudgetState` and returns the active grant.
2. **Interpret (optional).** `ModelPanel.tsx` sends the student's text to `POST /api/assistant/interpret`. `ollamaClient.ts` asks the local model, and `draft.ts` validates the answer. Nothing else happens, and the audit log doesn't change.
3. **Review.** The person copies the draft into `ProposalPanel.tsx` or types it by hand, checks it and submits. `POST /api/assistant/propose` returns a signed proposal with a fresh nonce.
4. **Evaluate.** The browser sends the signed grant, signed proposal and an idempotency key to `POST /api/proposals/evaluate`.
5. **Check.** `processProposal.ts` runs request checks, authorization scope, then `evaluatePurchasePolicy`, building a trace as it goes.
6. **Record.** `requestStore.ts` stores the answer once and adds an audit entry for every attempt. `ALLOW` also adds a simulated purchase, which `buildBudgetState` then counts.
7. **Show.** `TracePanel.tsx` shows each check and the result, and `AuditPanel.tsx` shows the log and the replay and retry controls.

## 3. Key concepts

### Model suggestion versus deterministic policy

**The idea:** software that can be wrong or manipulated may help, but plain, testable code decides.

The main flow's suggestion comes from a real local LLM, `llama3.2:3b` through Ollama. It only turns text into fields. The boundary has several layers:

1. **Input:** the model receives only its instructions and the student's text. It gets no tools, keys, grants or budgets (`prompt.ts`, `ollamaClient.ts`).
2. **Output:** `draft.ts` rejects anything off-schema, drops extra fields such as `decision`, and discards merchants or amounts not in the text.
3. **Action:** a draft only fills in a form. A person submits it.
4. **Decision:** the policy takes only structured fields, as its signature in `src/lib/policy/purchasePolicy.ts` shows:

```ts
export function evaluatePurchasePolicy(purchase: PurchaseInput, context: PolicyContext): PolicyResult
```

`boundary.test.ts` reads the import lines and fails if the model code and decision code ever reach each other.

The final result combines scope checks and policy rules, and the strictest wins: any `DENY` gives `DENY`; otherwise any `CHALLENGE` gives `CHALLENGE`; otherwise `ALLOW`.

**The limit:** these layers protect the rules, not the meaning. In the evaluation, an attack made the model report $1 at the Bookstore for a $20 notebook elsewhere. Those values were in the text, so validation kept them, and they fit the grant. Only a person reviewing the form would catch that.

**Measured results** on 31 hand-written test cases (Apple M5, 16 GB): schema-valid 31 of 31, merchant 28, amount 30, category 23, all three correct 21, injections followed 2 of 6, median latency 868 ms. That's one model and one prompt on a small set, not general quality.

### Scoped authorization, signature, expiry, nonce and idempotency key

| Concept | Plain language | Proves or does | Does not prove or do |
| --- | --- | --- | --- |
| **Scoped authorization (grant)** | A permission slip: student, merchant and/or category, total limit, valid weeks | Limits what the assistant may propose | Show the student really wanted it |
| **Ed25519 signatures** | Tamper-evident seals. One demo key signs grants, and another signs proposals | Each record was signed by that demo key and hasn't changed | Identify who acted, or show consent; there is no login, and one server holds both keys |
| **Expiry (valid period)** | A use-by range on a server-side simulated week | Denies a proposal outside the period, and clients can't supply a week | Use real time; the demo's clock control has no login |
| **Nonce** | A one-time number inside the signed proposal | A signed proposal is evaluated once, even in a simultaneous race | Survive a restart; memory is cleared and the keys replaced |
| **Idempotency key** | A label for one attempt | Retrying an identical attempt returns the stored answer and runs nothing again | Authorize anything |

**Replay versus retry:** a retry is the same attempt sent again, such as after a dropped connection, so it reuses the key and gets the stored answer. A replay is an old signed proposal sent as if new, under a new key, so the used nonce gets it rejected.

**Rejected versus denied:** a request that fails shape, signature, nonce or key checks is rejected with no decision, because it can't be trusted. A valid request outside its permission gets `DENY`, which is a real decision that uses up its nonce.

Files: `lib/authorization/processProposal.ts`, `signature.ts`, `requestStore.ts`, `schema.ts`, `demoRuntime.ts`.

### Precision, recall, PR-AUC, class imbalance and thresholds

This is a separate experiment and isn't part of the main flow.

**The experiment:** a hand-written logistic regression ranks synthetic transactions by how unusual they look.

- **Data:** 100 synthetic students from `generateDataset`, including planted hard cases and some wrong labels.
- **Split:** by student (60/20/20) in `splitByStudent`, so nobody appears in both training and testing.
- **Threshold:** chosen on validation data by best F1 in `bestThreshold`, then applied to the test set.

Test results, seed 2026 (20 students, 2,432 rows, 83 labeled unusual, threshold 0.80):

|  | Flagged | Not flagged |
| --- | --- | --- |
| Labeled unusual | 46 caught | 37 missed |
| Labeled normal | 64 false alarms | 2,285 correctly passed |

- **Precision** = of the flags raised, how many were right: 46 / 110 = 41.8%.
- **Recall** = of the unusual rows, how many were found: 46 / 83 = 55.4%.
- **PR-AUC** summarizes precision and recall across all thresholds: 0.516, against 0.172 for a simple rule and
  0.034 for random guessing. Across five data seeds it ranged from 0.407 to 0.660.
- **Class imbalance:** only 3.4% of rows are labeled unusual, so always answering "normal" is 96.6% accurate and
  catches nothing. That's why accuracy isn't used, and why random PR-AUC is about 0.034 rather than 0.5.
- **Threshold tradeoff:** at 0.1, recall is 100.0% with 3.8% precision. At 0.9, recall is 44.6% with 53.6% precision.
  False alarms cost a student time and trust, and misses let problems through.

**Limits:** it flagged 31 of 32 legitimate large purchases and caught 0 of 10 spikes at familiar merchants. Scores are
rankings, not probabilities. The same author wrote the data rules and the model, so it is partly relearning planted patterns.

Files: `lib/ml/experiment.ts`, `metrics.ts`, `syntheticData.ts`, `features.ts`, `logistic.ts`. Tests: `metrics.test.ts`, `ml.test.ts`.

### Keyword and semantic retrieval, RRF, Recall@k, grounding and prompt injection

This is a separate experiment and isn't part of the main flow.

- **Keyword search (BM25)** rewards rare words shared by the question and a passage.
- **Semantic search (LSA)** compares topics learned from words that appear together. It is a classic statistical
  method, weaker than neural embeddings, and can't use words the documents never contain.
- **RRF** combines ranked lists by adding `1 / (60 + rank)`, so differently scaled scores never need comparing.
- **Recall@k** is the share of relevant passages found in the top k results.
- **Grounding** here means answers are word-for-word quotes with citations. No model writes text. If too few of the
  question's key words (below 50%) appear in the usable top passages, the app refuses.
- **Prompt injection** is text in a document that tries to give the system instructions. A planted attack is
  included. It is flagged and left out of answers, and retrieved text has no path to the policy.

| Method | Held-out R@1 | R@3 | R@5 |
| --- | --- | --- | --- |
| Keyword (BM25) | 0.80 | 0.90 | 0.90 |
| Semantic (LSA) | 0.80 | 1.00 | 1.00 |
| Hybrid (RRF) | 0.80 | 0.90 | 1.00 |

On held-out questions the app answered 8 of 10 answerable and refused 5 of 5 unanswerable. One question moves a
held-out score by 0.10, so these gaps aren't meaningful and **hybrid did not clearly win**. The refusal threshold was
tuned on separate development questions.

**Limits:** the detector is a simple pattern match. A reworded attack can evade it and could be quoted as an answer,
though it still can't change a decision. "Supported" only means key words matched; whether each quote truly answers its
question wasn't measured.

Files: `lib/retrieval/search.ts`, `answer.ts`, `evaluate.ts`, `data/campus/`. Test: `retrieval.test.ts`.

### What the prototype does not prove

- **User consent or identity:** there is no login, and clicking a button in a demo is not consent.
- **Who really acted:** both keys live in one server process, and the assistant isn't a real agent.
- **Payment security:** keys and state live in memory on one local process, with no real key custody or tamper-evident audit log.
- **Fraud performance:** the data is synthetic and self-authored, and flags on the sample profiles weren't evaluated.
- **Model quality or injection resistance in general:** 31 hand-written cases on one model, prompt and machine. The model did follow attacks.
- **That fields match what a student meant:** the checks enforce rules on whatever fields they receive.
- **Retrieval quality in general:** 27 fictional passages, 10 held-out questions, one author.

## 4. One-day study plan

| Time | Focus | Done when you can... |
| --- | --- | --- |
| 1 hr | Run the app; read `Workbench.tsx`, `simulation.ts` | Trace a proposal from the form to the audit log |
| 1.5 hr | `purchasePolicy.ts`, `lib/llm/draft.ts`, `ollamaClient.ts`, `boundary.test.ts` | Explain each layer between the model and a decision, and why injection-2 still gets through |
| 2 hr | `lib/authorization/`, especially `processProposal.ts` | Explain the check order, replay versus retry, and rejected versus denied |
| 1.5 hr | `syntheticData.ts`, `experiment.ts`, `metrics.ts` | Calculate precision and recall from the matrix by hand |
| 1.5 hr | `search.ts`, `answer.ts`, `retrieval.test.ts` | Calculate an RRF score by hand and explain the reworded-attack test |
| 1 hr | Delegated authority, know-your-agent, signed mandates, audit trails, from official sources | List what this prototype lacks |
| 30 min | Run the full workbench flow twice, using the README's usage notes | Explain the weakest part of the design without notes |

## 5. Self-check questions

Try answering each one before reading the outline.

### Model suggestion versus deterministic policy

**Why not let the model make the decision?**
Models can be wrong, unstable and influenced by input text. A decision with consequences needs rules you can test and explain. Here the pipeline takes only signed, structured fields. The tradeoff is that simple rules are rigid and can be wrong too.

**What does the LLM actually do here?**
It reads one request and returns merchant, amount, category and purpose as JSON, locally through Ollama. It has no tools and can't sign, evaluate or decide. It isn't an agent. The assistant signer is a separate demo route that doesn't call it.

**How do you know model output can't bypass the checks?**
It's structural: the policy has no parameter for free text, unknown fields are dropped, and import tests confirm the model code can't reach signing or decisions. Tests also send a hostile model's output, claiming `decision: ALLOW`, through the real pipeline.

**So is it safe against prompt injection?**
No. The rules hold, but the model followed 2 of 6 injections. One changed the merchant and price to values that were in the text and fit the grant, so it would get `ALLOW`. The system stops an attacker from changing rules, not from changing what the model reports. A person reviewing the form is the last defense, and people miss things.

**Why does schema validity of 31 of 31 say so little?**
Ollama constrains the output format, so it mostly shows that constraint working. Field accuracy is the more meaningful number, and category was only 23 of 31.

**Why run it locally, and what was measured?**
It needs no API keys, inference data stays on the machine, and it should work offline after setup. Measurements on one M5: 2.32 GB loaded and 868 ms median. Outside connections were checked during evaluation, but it hasn't been tested with the network physically off.

**What happens if Ollama isn't running?**
The status panel explains setup, and the form and every deterministic check still work. Timeouts, invalid JSON and missing models all become clear results. Browser tests cover this with a fake Ollama.

### Scoped authorization, signature, expiry, nonce and idempotency key

**What do the signatures prove?**
That each record was signed with its demo key and hasn't changed. Not who acted or whether they agreed: there's no login, and one server holds both keys. Real systems would need authenticated users and separate key custody.

**Why two signatures?**
The grant is the student's permission, and the proposal is the assistant's request. Separating them means a captured grant alone can't create new proposals, and each proposal can carry its own nonce. Here it only illustrates the idea, because both keys sit in one process.

**What's the difference between a nonce and an idempotency key?**
The nonce stops one signed proposal being evaluated twice. The idempotency key makes one attempt safe to retry. Same key and body returns the stored answer. A new key with a used proposal is rejected as a replay.

**Why does the retry check come before the signature check?**
A retry should get its original answer without re-running anything, even after the clock moves. Only an identical request gets it, because it was verified the first time, and a different body gets a conflict.

**Why is an expired proposal denied rather than rejected?**
The request is trustworthy, and the answer to it is no. Rejection is for requests that can't be trusted or evaluated at all. That distinction also keeps the audit log meaningful.

**Would the uniqueness guarantee hold with two servers?**
No. It works because one process checks and writes without yielding. Two servers need a shared database with unique constraints, and a transaction covering both the check and the write.

**Why did a reset have to replace the keys?**
Reset forgets used nonces. Keeping the keys would let old signed records verify and be spent again. An earlier version had that bug, and testing found it.

### Precision, recall, PR-AUC, class imbalance and thresholds

**Why not report accuracy?**
Only 3.4% of rows are positive, so always answering "normal" scores 96.6% and catches nothing.

**What does a PR-AUC of 0.516 mean here?**
Ranking quality across thresholds on this synthetic test set, well above 0.034 for random and 0.172 for a simple rule. It varied from
0.407 to 0.660 across seeds, and says nothing about real fraud.

**How is leakage avoided?**
Features use only earlier transactions, the split is by student, and the threshold comes from validation data. Tests check the first two.
The remaining bias is that one author wrote both the data and the model.

**How would you choose a threshold in practice?**
By the cost of each mistake and how many flags people can review, ideally measured on real, recent data, and re-checked over time.

**The model flagged 31 of 32 legitimate large purchases. Is that acceptable?**
Not for blocking anything, which is one reason its score is only advisory. It's a prompt to look, and that result shows why it shouldn't block anything.

### Keyword and semantic retrieval, RRF, Recall@k, grounding and prompt injection

**Why combine rankings with RRF rather than adding scores?**
BM25 scores and cosine similarities are on different scales. RRF uses only rank positions, so no calibration is needed.

**Did hybrid search help?**
Not clearly. Held-out Recall@3 was 0.90 for hybrid and keyword and 1.00 for LSA, but one question moves it by 0.10. The honest answer is that this set can't tell.

**What does Recall@k miss?**
Whether the final answer is correct or useful. The right passage can be retrieved and the wrong sentence quoted, and answer correctness wasn't measured.

**How do you defend against prompt injection?**
Treat retrieved text and student text as data, and keep it away from decisions. In Q&A it's displayed as escaped text. In the main flow, the model's output is validated and reviewed by a person. Neither stops every attack: the Q&A detector can be evaded, and the local model followed 2 of 6 attacks in testing.

**Why tune on one question set and report another?**
Tuning makes results on those questions optimistic. A separate set scored once gives a fairer estimate, though the same author wrote it, and it has now been seen, so it can't be reused for tuning.

### What the prototype does not prove

**Is this production-ready? What would it take?**
No. It would need real identity and consent, managed keys, durable storage with unique constraints, a tamper-evident audit log, rate limits, monitoring, security review, and evaluation on real data under proper governance.

**What's the weakest part?**
Consent and identity: the signatures show data integrity and say nothing about a person's intent or who acted. Second, every evaluation is small and self-authored.
