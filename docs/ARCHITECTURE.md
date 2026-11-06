# Architecture

How a request moves through the app. Setup is in the [README](../README.md), numbers in [EVALUATION.md](EVALUATION.md).

## Request flow

1. The student types a request in the model panel (`src/components/workbench/ModelPanel.tsx`).
2. `POST /api/assistant/interpret` calls `interpretRequest` in `src/lib/llm/ollamaClient.ts`. The model gets the prompt (`src/lib/llm/prompt.ts`) and the student's text, nothing else. Output is constrained to a JSON schema.
3. `src/lib/llm/draft.ts` validates the answer: exact field types, unknown fields dropped, merchant and amount must appear in the text. Category isn't checked against the text.
4. The draft fills in the proposal form. Nothing has been signed or recorded yet.
5. The student checks the form and submits. `POST /api/assistant/propose` signs the proposal with the demo assistant key and a fresh nonce (`signProposal` in `src/lib/authorization/demoRuntime.ts`).
6. The browser sends the signed grant, the signed proposal and a new idempotency key to `POST /api/proposals/evaluate`.
7. `processProposal` in `src/lib/authorization/processProposal.ts` runs the checks in order: shape, idempotency key, both signatures, grant link, nonce, scope, then `evaluatePurchasePolicy` (`src/lib/policy/purchasePolicy.ts`).
8. `RequestStore.commit` (`src/lib/authorization/requestStore.ts`) stores the answer under the key, marks the nonce used, and records a purchase if the decision is `ALLOW`. Every attempt is added to the audit log.

Every `/api` request first goes through `src/proxy.ts`, which refuses requests whose `Host` isn't a loopback name, and browser requests that come from another site or origin (`src/lib/http/localRequestGuard.ts`). Without it, a page on another site could reset the sandbox or replace a grant with blind POSTs; that was reproduced before the guard existed. It doesn't stop other programs on the same computer.

## Outcomes

| Situation | Response | Key and nonce used up? |
| --- | --- | --- |
| Passes scope and policy | `200 ALLOW`, purchase recorded | yes |
| A policy rule asks for confirmation | `200 CHALLENGE`, nothing recorded | yes |
| Out of scope, expired, revoked, over allowance, or a rule forbids it | `200 DENY` with reasons | yes |
| Same key, identical request | stored answer, `RETRY_RETURNED_STORED` | already used |
| Same signed proposal, new key | `409 REJECTED_REPLAY` | no |
| Same key, different request | `409 REJECTED_IDEMPOTENCY_CONFLICT` | no |
| Changed record or wrong signer | `401 REJECTED_BAD_SIGNATURE` | no |
| Proposal names a different grant | `400 REJECTED_GRANT_MISMATCH` | no |
| Missing or invalid fields | `400 REJECTED_MALFORMED` | no |

- Rejections store nothing, so a forged or broken request can't use up a key or nonce that a real request needs.
- Decisions are stored and use up the nonce, so a `DENY` or `CHALLENGE` can't be resent later to try for a different answer.
- The idempotency check runs before signature verification. A stored answer only comes back for a request with the same fingerprint (both signed records, signatures included), and it was verified the first time. A 409 does reveal that a key is in use.
- `CHALLENGE` ends the flow. There's no confirmation step.

## Signatures

- Ed25519 over canonical JSON (object keys sorted), in `src/lib/authorization/signature.ts`.
- The grant is signed with a demo student key, the proposal with a demo assistant key. Both keys are generated in memory when the server starts and replaced on reset.
- A valid signature means the record was signed by that key and not changed since. It doesn't identify who clicked anything, and it isn't consent: there's no login, both keys live in the same process, and the signing routes are open to anything running locally.

## State

- Everything is in memory on `globalThis`: keys, active grants, the simulated clock, idempotency records, used nonces, purchases and the audit log.
- `processProposal` has no `await`, so within one Node process no other request runs between the checks and the commit. Across several processes or after a restart there's no guarantee; that would need a database with unique constraints.
- Nothing is ever pruned. The audit log isn't tamper-evident.

## Tests

- `npm test`: 245 Vitest tests. Pipeline order and outcomes, signatures, replay and retry, malformed input, policy rules, model output validation, hostile model output run through the real pipeline, import boundaries, the request guard, budget math, and saved eval results re-checked against the code.
- `npm run test:e2e`: 54 Playwright tests on a production build in Chrome, against a mock Ollama (`e2e/fake-ollama.mjs`). UI flows, model failures, simultaneous requests, cross-site and DNS-rebinding requests, phone layout.
- The real model is only exercised by `npm run eval:llm`.
- Not tested: other browsers, screen readers, more than one server process, other models or machines, running with the network off.
