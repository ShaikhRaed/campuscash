# CampusCash learning guide

CampusCash is a portfolio prototype that uses simulated data only. It is not Experian's system, production
payment security, real-world fraud detection, or proof of user consent. No money moves, and it has no real
bank connection, payments or user accounts.

Numbers here come from `src/data/generated/`. Reproduce them with `npm run eval:ml` and `npm run eval:retrieval`.

## 1. Repository map

```text
README.md                  Setup, architecture, results, limitations, demo script
docs/LEARNING_GUIDE.md     This guide
e2e/demo.spec.ts           Browser tests of the demo
scripts/                   Evaluation runners
src/
├── app/                   Pages and API routes
│   ├── page.tsx           Dashboard (/)
│   ├── review/  ask/  how-it-works/
│   └── api/
│       ├── purchase/review/route.ts     Advisor and policy results; records nothing
│       ├── authorizations/route.ts      Demo signer (no login)
│       ├── purchase/execute/route.ts    Checks and records a simulated purchase
│       ├── purchase/recorded/route.ts   Lists purchases; resets the demo
│       └── ask/route.ts                 Campus Q&A; read-only
├── components/            Screens: Dashboard, PurchaseSimulator, AuthorizationPanel, AskPanel, ...
├── data/
│   ├── sampleStudent.ts, profiles.ts    Simulated students and transactions
│   ├── campus/            Fictional documents and evaluation questions
│   └── generated/         Saved evaluation results (written by scripts, never by hand)
└── lib/
    ├── simulation.ts      buildBudgetState: the one budget calculation
    ├── events.ts          Replay with duplicate handling
    ├── advisor.ts         Simulated advisor (a template, not an AI model)
    ├── reviewPurchase.ts  Runs advisor and policy side by side
    ├── policy/purchasePolicy.ts    The deterministic decision-maker
    ├── authorization/     signature, schema, requestStore, processPurchase, demoRuntime
    ├── ml/                syntheticData, features, logistic, metrics, experiment, savedModel
    └── retrieval/         search (BM25, LSA, RRF, Recall@k), answer, evaluate
```

## 2. Main request flow

**Reviewing a purchase** (nothing is recorded):

1. `PurchaseSimulator.tsx` turns dollars into whole cents and sends `POST /api/purchase/review`.
2. `api/purchase/review/route.ts` checks the profile and week, and ignores any budget numbers sent by the browser.
3. `simulation.ts` calculates budget state on the server with `buildBudgetState`.
4. `savedModel.ts` scores how unusual the purchase looks. This score only goes to the advisor.
5. `reviewPurchase.ts` runs both paths: `suggestPurchase` (advice) and `evaluatePurchasePolicy` (the decision).

**Recording a simulated purchase:**

1. `AuthorizationPanel.tsx` asks `POST /api/authorizations` for a signed record.
2. It sends that record to `POST /api/purchase/execute`.
3. `processPurchase.ts` runs these checks in order: shape, retry, signature, expiry, scope, nonce, policy, commit.
4. `requestStore.ts` adds one row to an in-memory list.
5. `Dashboard.tsx` fetches the list and recalculates with the same `buildBudgetState`.

## 3. Key concepts

### Model suggestion versus deterministic policy

**The idea:** software that can be wrong or manipulated may advise, but plain, testable code decides.

The "suggestion" has two parts: a logistic regression score and a template advisor. Neither is a language
model. The boundary is this function signature in `src/lib/policy/purchasePolicy.ts`:

```ts
export function evaluatePurchasePolicy(purchase: PurchaseInput, context: PolicyContext): PolicyResult
```

It accepts no note, score or document, and the module has no imports. Any `DENY` rule gives `DENY`; otherwise any
`CHALLENGE` rule gives `CHALLENGE`; otherwise `ALLOW`. The advisor can say "Looks fine" while the policy says `DENY`.

**The limit:** the separation protects the decision from these inputs. It doesn't make the ten rules good ones.

### Scoped authorization, signature, expiry, nonce and idempotency key

| Concept | Plain language | Proves or does | Does not prove or do |
| --- | --- | --- | --- |
| **Scoped authorization** | A permission slip with limits: student, week, merchant and/or category, maximum, expiry | Limits what a purchase may be | Show the student really wanted it |
| **Ed25519 signature** | A tamper-evident seal from a private key | The fields were signed by this server's demo key and haven't changed | Identify who clicked, or show consent; the same server signs and verifies, with no login |
| **Expiry** | A use-by time | Rejects the record at or after its expiry | Stop reuse before then |
| **Nonce** | A one-time number inside the signed record | The same authorization records once, even in a simultaneous race | Survive a restart; memory is cleared and the key replaced |
| **Idempotency key** | A label for one attempt | Retrying the same attempt returns the first answer and adds nothing | Authorize anything |

Failed attempts use up neither key nor nonce. A demo reset also replaces the signing key, because forgetting used
nonces while keeping the key would let old authorizations be replayed.

Files: `lib/authorization/processPurchase.ts`, `signature.ts`, `requestStore.ts`, `schema.ts`, `demoRuntime.ts`.

### Precision, recall, PR-AUC, class imbalance and thresholds

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

- **User consent or identity:** there is no login, and a checkbox value is not consent.
- **Payment security:** keys and state live in memory on one local process, with no audit trail or real key custody.
- **Fraud performance:** the data is synthetic and self-authored, and flags on the sample profiles weren't evaluated.
- **Retrieval quality in general:** 27 fictional passages, 10 held-out questions, one author.
- **Injection safety in general:** there is no real language model here, so this shows only one structural boundary.
- **Experian's approach:** this is an independent learning project and says nothing about how any company's system works.

## 4. One-day study plan

| Time | Focus | Done when you can... |
| --- | --- | --- |
| 1 hr | Run the demo; read `simulation.ts`, `events.ts` | Explain why one shared calculation fixed two bugs |
| 1.5 hr | `purchasePolicy.ts`, `advisor.ts`, `reviewPurchase.ts` | Add a rule on paper and name the test it needs |
| 2 hr | `lib/authorization/`, especially `processPurchase.ts` | Explain the check order and why a retry skips expiry |
| 1.5 hr | `syntheticData.ts`, `experiment.ts`, `metrics.ts` | Calculate precision and recall from the matrix by hand |
| 1.5 hr | `search.ts`, `answer.ts`, `retrieval.test.ts` | Calculate an RRF score by hand and explain the reworded-attack test |
| 1 hr | Delegated authority, know-your-agent, signed mandates, audit trails, from official sources | List what this prototype lacks |
| 30 min | Rehearse the README demo script twice | Answer "what's the weakest part?" without notes |

## 5. Interview practice

Try answering aloud before reading each outline.

### Model suggestion versus deterministic policy

**Why not let the model make the decision?**
Models can be wrong, unstable and influenced by input text. A decision with consequences needs rules you can test and
explain. Here the policy takes only structured fields. The tradeoff is that simple rules are rigid and can be wrong too.

**How do you know a note can't change the decision?**
It's structural: the function has no parameter for it and the module has no imports. Tests pass hostile text and extreme
scores and check the result is unchanged. The tests back this up, but the signature is the stronger guarantee.

**What's the weakness of this boundary?**
It protects only the decision. The advisor can still mislead a student, and bad rules stay bad.

### Scoped authorization, signature, expiry, nonce and idempotency key

**What does your signature prove?**
That the fields were signed with the demo key and haven't changed. Not who acted or whether they agreed: there's no login, and
one server signs and verifies. Real systems would need authenticated users and separated key custody.

**What's the difference between a nonce and an idempotency key?**
The nonce stops one permission being spent twice. The idempotency key makes one attempt safe to retry. Same key and body returns the
first answer. A new key with a used authorization is a `REPLAY`.

**Why does the retry check come before the expiry check?**
A client whose connection dropped should still learn the original outcome, even after expiry. Only equivalent requests that
already succeeded get this answer, and a different body gets a conflict.

**Would your uniqueness guarantee hold with two servers?**
No. It works because one process checks and writes without yielding. Two servers need a shared database with unique constraints, and
the transaction would need to cover both the check and the write.

**Why did a reset have to replace the key?**
Reset forgot used nonces. Keeping the key meant old authorizations still verified and could be spent again. That was a real bug found by testing.

### Precision, recall, PR-AUC, class imbalance and thresholds

**Why not report accuracy?**
Only 3.4% of rows are positive, so always answering "normal" scores 96.6% and catches nothing.

**What does a PR-AUC of 0.516 mean here?**
Ranking quality across thresholds on this synthetic test set, well above 0.034 for random and 0.172 for a simple rule. It varied from
0.407 to 0.660 across seeds, and says nothing about real fraud.

**How did you avoid leakage?**
Features use only earlier transactions, the split is by student, and the threshold comes from validation data. Tests check the first two.
The remaining bias is that one author wrote both the data and the model.

**How would you choose a threshold in practice?**
By the cost of each mistake and how many flags people can review, ideally measured on real, recent data, and re-checked over time.

**The model flagged 31 of 32 legitimate large purchases. Is that acceptable?**
Not for blocking anything, which is one reason its score is only advisory. It's a prompt to look, and that result is itself a reason not to overclaim.

### Keyword and semantic retrieval, RRF, Recall@k, grounding and prompt injection

**Why combine rankings with RRF rather than adding scores?**
BM25 scores and cosine similarities are on different scales. RRF uses only rank positions, so no calibration is needed.

**Did hybrid search help?**
Not clearly. Held-out Recall@3 was 0.90 for hybrid and keyword and 1.00 for LSA, but one question moves it by 0.10. The honest answer is that this set can't tell.

**What does Recall@k miss?**
Whether the final answer is correct or useful. The right passage can be retrieved and the wrong sentence quoted, and I did not measure answer correctness.

**How do you defend against prompt injection?**
Treat retrieved text as data. Here it is displayed as escaped text and has no path to purchase logic. The detector is a weak extra layer that a reworded attack can evade. There is no language
model to hijack, so a system with one would need much more, such as limited tool permissions.

**Why did you tune on one question set and report another?**
Tuning makes results on those questions optimistic. A separate set scored once gives a fairer estimate, though I wrote it too, and I've now seen it, so it can't be reused for tuning.

### What the prototype does not prove

**Is this production-ready? What would it take?**
No. It would need real identity and consent, managed keys, durable storage with unique constraints, audit logs, rate limits, monitoring, security review, and
evaluation on real data under proper governance.

**Is this how Experian does it?**
No. It's my independent learning project using general ideas. I can't speak to how any company's system works.

**What's the weakest part?**
Consent: the signature shows data integrity and nothing about a person's intent. Second is that every evaluation is small and self-authored.
