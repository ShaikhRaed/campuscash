# campuscash

small local llm project for simulated student purchases

- llama 3.2 3b through ollama
- model reads a request and pulls out merchant, amount and category
- server validates that output before it's used
- you review the fields and submit
- server checks the proposal against a signed grant
- grant is scoped by merchant/category, total amount and valid weeks
- nonce for replay protection
- idempotency key for retries
- allow / challenge / deny decided in code, not by the model
- no real payments or bank connection

## how it works

- next.js 16 + typescript, api routes in `src/app/api/`
- model only gets the prompt and the student's text. no keys, grants or budget
- output has to match a json schema. extra fields get dropped, a merchant or amount that isn't in the text gets thrown out
- category isn't checked against the text, it's whatever the model picked
- grant and proposal are signed with ed25519 demo keys
- `src/lib/authorization/processProposal.ts` checks: shape, idempotency key, signatures, grant link, nonce, scope, policy rules
- bad shape / bad signature / used nonce / reused key = rejected, nothing stored
- anything else gets a decision, stored under the key, nonce used up (deny too)
- same key + same request returns the stored answer
- only allow records a purchase. challenge just stops, there's no confirm step
- every attempt goes in an audit log
- `src/proxy.ts` blocks /api requests from other sites or not addressed to localhost
- everything is in memory

`/review` (anomaly model) and `/ask` (campus q&a) are side experiments, not connected to decisions.

more detail: `docs/ARCHITECTURE.md`

## testing

- `npm test`: 245 unit tests, no model needed
- `npm run test:e2e`: 54 browser tests in chrome against a mock ollama. tests the ui and error handling, not the model
- `npm run eval:llm`: real model on 37 hand-written cases (6 used while writing the prompt, 31 held out)
- on the 31: all three fields right on 21, category right on 23
- prompt injection: 6 held-out cases, 3 plant specific values, model used them in 2

numbers and method: `docs/EVALUATION.md`

## limitations

- the model can produce wrong fields that still pass every check. both injections it followed would get allow if submitted: a $20 notebook became $1 at a different store, and concert tickets got labeled books
- the checks enforce rules on whatever fields come in. they can't tell if those fields are what the student meant. reviewing the form is the only thing that catches that
- no login. signatures only show a record wasn't changed after a demo key signed it, not who did it or that they agreed
- both demo keys are in the same server process
- state is lost on restart, never pruned, single process only
- audit log isn't tamper-evident
- valid weeks use a simulated clock anyone local can move
- small self-written evals
- only tested in chrome

## summary

local web app where a small model fills in a purchase form, you check it, and server code decides allow / challenge / deny against a signed grant. nothing real gets bought.

## running it

needs node 22.12+ and git

```bash
git clone https://github.com/ShaikhRaed/campuscash.git
cd campuscash
npm install
npm run dev
```

open http://localhost:3000

ollama (optional, ~2 GB download, ~2.3 GB memory while loaded):

```bash
brew install ollama        # or the installer from ollama.com
ollama serve
ollama pull llama3.2:3b
```

without ollama everything except the model panel still works.

optional env vars: `OLLAMA_MODEL`, `OLLAMA_BASE_URL` (must be local), `OLLAMA_TIMEOUT_MS`

tests:

```bash
npm run check      # lint, typecheck, unit tests, build
npm run test:e2e   # needs chrome, uses ports 3100 and 3101
```

evals (each one overwrites its file in `src/data/generated/`):

```bash
npm run eval:llm         # needs ollama running
npm run eval:ml
npm run eval:retrieval
```
