import { beforeEach, describe, expect, it } from "vitest";
import type { PolicyContext } from "../policy/purchasePolicy";
import { processPurchaseRequest, type ProcessDeps } from "./processPurchase";
import { RequestStore, type SimulatedPurchase } from "./requestStore";
import type { Authorization } from "./schema";
import { canonicalize, generateDemoKeyPair, signRecord } from "./signature";

const NOW = new Date("2026-11-02T12:00:00.000Z");
const keys = generateDemoKeyPair();

const baseContext: PolicyContext = {
  budgetCents: 100_000,
  spentCents: 10_000,
  paceCents: 1_000,
  weeksLeft: 4,
  knownMerchants: ["Campus Bookstore"],
  limits: { challengeAboveCents: 15_000, hardLimitCents: 60_000 },
};

let store: RequestStore;
let counter = 0;

const deps = (): ProcessDeps => ({
  now: () => NOW,
  publicKey: keys.publicKey,
  store,
  getContext: (profileId, _week, earlier: SimulatedPurchase[]) =>
    profileId === "maya"
      ? {
          ...baseContext,
          spentCents:
            baseContext.spentCents + earlier.reduce((s, p) => s + p.amountCents, 0),
        }
      : undefined,
});

function authorization(overrides: Partial<Authorization> = {}): Authorization {
  counter += 1;
  return {
    version: 1,
    authorizationId: `auth_${counter}`,
    profileId: "maya",
    week: 10,
    scope: { merchant: "Campus Bookstore", category: "books" },
    maxAmountCents: 5_000,
    issuedAt: "2026-11-02T11:55:00.000Z",
    expiresAt: "2026-11-02T12:05:00.000Z",
    nonce: `nonce_${counter}`,
    challengeConfirmed: false,
    ...overrides,
  };
}

function request(
  auth: Authorization = authorization(),
  extra: { key?: string; purchase?: object; privateKey?: typeof keys.privateKey } = {},
) {
  return {
    idempotencyKey: extra.key ?? `key_${++counter}_abcdef`,
    purchase: {
      merchant: "Campus Bookstore",
      category: "books",
      amountCents: 4_000,
      ...extra.purchase,
    },
    signedAuthorization: {
      authorization: auth,
      signature: signRecord(auth, extra.privateKey ?? keys.privateKey),
    },
  };
}

const run = (raw: unknown) => processPurchaseRequest(raw, deps());

beforeEach(() => {
  store = new RequestStore();
});

describe("valid requests", () => {
  it("records exactly one simulated purchase", () => {
    const result = run(request());
    expect(result.status).toBe(201);
    expect(result.body.outcome).toBe("RECORDED");
    expect(store.purchasesFor("maya")).toHaveLength(1);
  });

  it("accepts a scope with only a category", () => {
    const auth = authorization({ scope: { category: "books" } });
    expect(run(request(auth)).body.outcome).toBe("RECORDED");
  });
});

describe("expired requests", () => {
  it("rejects an authorization past its expiry", () => {
    const auth = authorization({ expiresAt: "2026-11-02T11:59:59.000Z" });
    expect(run(request(auth)).body.outcome).toBe("EXPIRED");
  });

  it("rejects at the exact expiry instant", () => {
    const auth = authorization({ expiresAt: NOW.toISOString() });
    expect(run(request(auth)).body.outcome).toBe("EXPIRED");
  });
});

describe("out-of-scope requests", () => {
  it.each([
    ["merchant", { merchant: "Other Store" }],
    ["category", { category: "social" }],
    ["amount", { amountCents: 5_001 }],
  ])("rejects a different %s and records nothing", (_name, purchase) => {
    expect(run(request(authorization(), { purchase })).body.outcome).toBe("OUT_OF_SCOPE");
    expect(store.purchasesFor("maya")).toHaveLength(0);
  });

  it("cannot record a disguised blocked merchant, even when signed and confirmed", () => {
    const merchant = "Quick\u200bCash  Advance";
    const auth = authorization({ scope: { merchant }, challengeConfirmed: true });
    const result = run(request(auth, { purchase: { merchant } }));
    expect(result.body.outcome).toBe("POLICY_DENIED");
    expect(store.purchasesFor("maya")).toHaveLength(0);
  });

  it("allows the exact maximum", () => {
    const result = run(request(authorization(), { purchase: { amountCents: 5_000 } }));
    expect(result.body.outcome).toBe("RECORDED");
  });

  it("rejects an unknown profile", () => {
    const auth = authorization({ profileId: "nobody" });
    expect(run(request(auth)).body.outcome).toBe("OUT_OF_SCOPE");
  });
});

describe("signatures", () => {
  it("rejects a record changed after signing", () => {
    const req = request();
    req.signedAuthorization.authorization = {
      ...req.signedAuthorization.authorization,
      maxAmountCents: 999_999,
    };
    expect(run(req).body.outcome).toBe("BAD_SIGNATURE");
  });

  it("rejects a signature from a different key", () => {
    const attacker = generateDemoKeyPair();
    const req = request(authorization(), { privateKey: attacker.privateKey });
    expect(run(req).body.outcome).toBe("BAD_SIGNATURE");
  });

  it("rejects garbage signatures without crashing", () => {
    const req = request();
    req.signedAuthorization.signature = "not-base64-!!!";
    expect(run(req).body.outcome).toBe("BAD_SIGNATURE");
  });

  it("rejects a week changed after signing", () => {
    const req = request();
    req.signedAuthorization.authorization = {
      ...req.signedAuthorization.authorization,
      week: 1,
    };
    expect(run(req).body.outcome).toBe("BAD_SIGNATURE");
  });

  it("signs the same bytes regardless of key order", () => {
    expect(canonicalize({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalize({ a: { c: 3, d: 2 }, b: 1 }));
  });
});

describe("repeated requests", () => {
  it("treats the same key and same body as a safe retry", () => {
    const req = request();
    const first = run(req);
    const second = run(req);
    expect(second.status).toBe(first.status);
    expect(second.body.retried).toBe(true);
    expect(second.body.purchase).toEqual(first.body.purchase);
    expect(store.purchasesFor("maya")).toHaveLength(1);
  });

  it("still answers a retry after the authorization has expired", () => {
    const req = request();
    run(req);
    const later = processPurchaseRequest(req, { ...deps(), now: () => new Date("2027-01-01T00:00:00.000Z") });
    expect(later.body.outcome).toBe("RECORDED");
    expect(later.body.retried).toBe(true);
  });

  it("rejects a used authorization sent with a new key as a replay", () => {
    const auth = authorization();
    run(request(auth));
    const result = run(request(auth));
    expect(result.status).toBe(409);
    expect(result.body.outcome).toBe("REPLAY");
    expect(store.purchasesFor("maya")).toHaveLength(1);
  });

  it("rejects the same key with a different body", () => {
    run(request(authorization(), { key: "shared_key_123" }));
    const result = run(request(authorization(), { key: "shared_key_123", purchase: { amountCents: 100 } }));
    expect(result.body.outcome).toBe("IDEMPOTENCY_CONFLICT");
    expect(store.purchasesFor("maya")).toHaveLength(1);
  });

  it("enforces uniqueness in the store itself", () => {
    const entry = {
      key: "k",
      fingerprint: "f",
      nonce: "n",
      purchase: { id: "a", profileId: "maya", week: 1, merchant: "m", category: "books", amountCents: 1 },
      response: { status: 201, body: {} },
    };
    expect(store.commit(entry).ok).toBe(true);
    expect(store.commit(entry)).toEqual({ ok: false, conflict: "key" });
    expect(store.commit({ ...entry, key: "k2" })).toEqual({ ok: false, conflict: "nonce" });
    expect(store.purchasesFor("maya")).toHaveLength(1);
  });

  it("does not let a failed attempt use up its key or nonce", () => {
    const auth = authorization();
    const bad = run(request(auth, { key: "reusable_key_1", purchase: { merchant: "Other Store" } }));
    expect(bad.body.outcome).toBe("OUT_OF_SCOPE");
    expect(run(request(auth, { key: "reusable_key_1" })).body.outcome).toBe("RECORDED");
  });
});

describe("malformed requests", () => {
  const valid = request();
  const signed = valid.signedAuthorization;
  const withAuth = (changes: object) => ({
    ...valid,
    signedAuthorization: { ...signed, authorization: { ...signed.authorization, ...changes } },
  });

  it.each([
    ["null", null],
    ["a string", "hello"],
    ["an array", []],
    ["an empty object", {}],
    ["a short idempotency key", { ...valid, idempotencyKey: "x" }],
    ["a key with odd characters", { ...valid, idempotencyKey: "bad key with spaces" }],
    ["a text week", withAuth({ week: "10" })],
    ["a negative amount", { ...valid, purchase: { ...valid.purchase, amountCents: -1 } }],
    ["a fractional amount", { ...valid, purchase: { ...valid.purchase, amountCents: 1.5 } }],
    ["a text amount", { ...valid, purchase: { ...valid.purchase, amountCents: "100" } }],
    ["a missing signature", { ...valid, signedAuthorization: { ...signed, signature: "" } }],
    ["a wrong version", withAuth({ version: 2 })],
    ["an empty scope", withAuth({ scope: {} })],
    ["an invalid expiry", withAuth({ expiresAt: "tomorrow" })],
    ["an object as the nonce", withAuth({ nonce: { $ne: null } })],
  ])("rejects %s", (_name, raw) => {
    const result = run(raw);
    expect(result.status).toBe(400);
    expect(result.body.outcome).toBe("MALFORMED");
    expect(store.purchasesFor("maya")).toHaveLength(0);
  });
});

describe("the policy still decides", () => {
  it("denies a blocked merchant despite a valid signature", () => {
    const auth = authorization({ scope: { merchant: "QuickCash Advance" } });
    const result = run(request(auth, { purchase: { merchant: "QuickCash Advance" } }));
    expect(result.body.outcome).toBe("POLICY_DENIED");
    expect(store.isNonceUsed(auth.nonce)).toBe(false);
  });

  it("requires a signed confirmation when the policy challenges", () => {
    const purchase = { merchant: "New Shop", category: "books", amountCents: 1_000 };
    const scope = { merchant: "New Shop" };
    const unconfirmed = authorization({ scope });
    const first = run(request(unconfirmed, { purchase }));
    expect(first.body.outcome).toBe("CHALLENGE_REQUIRED");
    expect(store.isNonceUsed(unconfirmed.nonce)).toBe(false);
    const confirmed = authorization({ scope, challengeConfirmed: true });
    expect(run(request(confirmed, { purchase })).body.outcome).toBe("RECORDED");
  });

  it("counts earlier simulated purchases against the budget", () => {
    const context = { ...baseContext, spentCents: 96_000 };
    const tight = () => ({
      ...deps(),
      getContext: (_p: string, _w: number, earlier: SimulatedPurchase[]) => ({
        ...context,
        spentCents: context.spentCents + earlier.reduce((s, p) => s + p.amountCents, 0),
      }),
    });
    const scoped = { challengeConfirmed: true };
    expect(processPurchaseRequest(request(authorization(scoped)), tight()).body.outcome).toBe("RECORDED");
    expect(processPurchaseRequest(request(authorization(scoped)), tight()).body.outcome).toBe("POLICY_DENIED");
  });
});
