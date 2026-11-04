# CampusCash

Sandbox for simulated student purchases. A local LLM reads a request and fills in purchase details. Server rules then decide `ALLOW`, `CHALLENGE` or `DENY`.

Everything is simulated. No bank connection, real payments or user accounts.

## Run

Needs Node 22.12+. No API keys or `.env` file.

```bash
git clone https://github.com/ShaikhRaed/campuscash.git
cd campuscash
git switch feature/local-llm-proposals   # until this is merged into main
npm install
npm run dev
```

Open <http://localhost:3000>. The server only listens on this computer.

Install, the first build (fonts) and the model download need internet.

## Local model

Runs through [Ollama](https://ollama.com). Default model is `llama3.2:3b` (about 2 GB).

```bash
brew install ollama        # or the installer from ollama.com
ollama serve               # leave running
ollama pull llama3.2:3b
```

The model panel should then say `READY`.

Without Ollama, the panel shows setup steps. The proposal form, example buttons and all server checks still work.

Should work offline after the downloads, but that hasn't been tested with the network off.

Optional environment variables:

- `OLLAMA_MODEL`: model name. Default `llama3.2:3b`.
- `OLLAMA_BASE_URL`: default `http://127.0.0.1:11434`. Addresses outside this computer are refused.
- `OLLAMA_TIMEOUT_MS`: default `30000`.

To keep Ollama inside the repo, unpack the official `ollama-darwin.tgz` into `.ollama-local/bin/` (gitignored), then use `scripts/ollama-local.sh serve` and `scripts/ollama-local.sh pull llama3.2:3b`.

## Usage

On the workbench at `/`:

- Enter a request in the model panel and click **Interpret with local model**.
- Inspect the raw model output and the validated fields.
- Click **Copy into proposal form**, check the fields, then **Submit proposal**. Or fill in the form by hand.
- Inspect each check, the final decision and the audit log.
- Try **Safe retry**, **Replay** and the tamper controls on the last request.
- Use **Next week** to get past the grant's period. **Reset sandbox** clears everything.

The grant's limit is a running total, so an earlier `ALLOW` changes later results.

Other pages:

- `/budget`: simulated semester timeline.
- `/how-it-works`: rules and saved evaluation results.
- `/review`, `/ask`: separate experiments (anomaly model, campus Q&A). Not part of the decision flow.

## How it works

- Model gets only the student's text. No tools, keys, grants or budgets.
- Server validates its output: schema check, extra fields dropped, merchant or amount not in the text discarded.
- Validated fields only fill in a form. A person submits it.
- Grant: signed with a demo student key (Ed25519). Sets scope, total limit and valid weeks.
- Proposal: signed with a demo assistant key. Carries merchant, category, amount and a nonce.
- Request checks run first: shape, idempotency key, both signatures, grant link, nonce. A failure is `REJECTED`, with no decision.
- Scope checks: active grant, valid period on the server's simulated clock, merchant, category, remaining allowance. A failure is `DENY`.
- Policy rules: ten deterministic rules against server-side budget state. Strictest result wins.
- `ALLOW` records a simulated purchase. `CHALLENGE` means it would need student confirmation, and the flow stops there.
- Retry: same idempotency key and body returns the stored answer. Nothing runs again.
- Replay: same signed proposal under a new key is rejected, because the nonce is used.
- Every attempt goes in the audit log.

Main code: `src/lib/llm/`, `src/lib/authorization/processProposal.ts`, `src/lib/policy/purchasePolicy.ts`.

More detail:

- [Architecture and authorization reference](docs/ARCHITECTURE.md)
- [Evaluation methods and results](docs/EVALUATION.md)
- [Learning guide](docs/LEARNING_GUIDE.md)

## Tests

```bash
npm run check      # lint, type check, unit tests, production build
npm test           # unit tests only
npm run test:e2e   # browser tests; needs Google Chrome, uses ports 3100 and 3101
```

- Unit tests: pipeline, policy rules, output validation, hostile model output, budget math, retrieval math. No model needed.
- Browser tests: production build in Chrome against a mock Ollama (`e2e/fake-ollama.mjs`). They cover the UI and failure handling, not model quality.

Real-model evaluation is separate:

```bash
npm run eval:llm         # needs Ollama running
npm run eval:ml          # anomaly experiment
npm run eval:retrieval   # Q&A experiment
```

Each one overwrites its results file in `src/data/generated/`. Unit tests check those saved files against the code.

## Limitations

- Model can be wrong or manipulated. On 31 hand-written test cases: 21 fully correct, 2 of 6 prompt injections followed. Small set, one model.
- Checks protect the rules, not the meaning. One followed injection produced a wrong merchant and price that would still get `ALLOW`, so a person has to review the form.
- Validation only checks that values appear in the text, not what they refer to.
- No login, so signatures aren't proof of identity or consent. Both demo keys live in one server process.
- State lives in memory and resets when the server restarts. Uniqueness only holds for one process.
- Audit log isn't tamper-evident.
- Expiry uses a simulated clock, which any local client can move.
- Blocked merchants match by name, so a different spelling gets through that rule.
- `CHALLENGE` has no confirmation flow.
- Experiments are small and synthetic or self-authored. Not evidence of real fraud detection, and hybrid search didn't clearly beat keyword search.
- Browser tests only run in Chrome.
