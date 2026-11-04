# Evaluation

Methods and results for the local model and the two separate experiments. All three use small, self-authored or synthetic data, so these numbers describe these sets and don't establish general quality.

To reproduce them: `npm run eval:llm` (needs Ollama), `npm run eval:ml` and `npm run eval:retrieval`. Each one rewrites its results file in `src/data/generated/`. Back that file up first if you want to compare runs.

## Local model evaluation

**Method:** a versioned set of hand-written requests (`src/data/llm/interpretationCases.ts`, `interpret-cases-v1`): 6 development cases, allowed for prompt changes, and 31 test cases covering normal, ambiguous, malformed, out-of-scope and prompt-injection requests. The cases were written before any results were seen, and the prompt (`interpret-v1`) was frozen before the test set was scored, once. Accuracy is measured after server validation. Each request runs one at a time with temperature 0. Results are in `src/data/generated/llm-results.json`, and tests re-score every saved answer through the current code.

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

## Local model resource use

**Measured on the development Mac** (Apple M5, 16 GB unified memory, Ollama 0.40.14):

| | Measured |
| --- | --- |
| Model on disk | 2.02 GB (`llama3.2:3b`, 3.2B parameters, Q4_K_M) |
| Memory while loaded | 2.32 GB, all on the GPU, with a 2,048-token context |
| Cold start | About 1.6 s for the first request |
| Later requests | About 0.87 s median |

Other machines will differ, and a Mac with less free memory may struggle. These are one machine's numbers, not requirements.

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
