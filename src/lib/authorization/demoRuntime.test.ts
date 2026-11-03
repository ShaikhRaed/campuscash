import { beforeEach, describe, expect, it } from "vitest";
import {
  demoStore,
  executeDemoPurchase,
  issueDemoAuthorization,
  resetDemoRuntime,
} from "./demoRuntime";

const purchase = { merchant: "Larkspur Campus Bookstore", category: "books", amountCents: 4_200 };
const issue = (ttlSeconds = 600, week = 10) =>
  issueDemoAuthorization({
    profileId: "maya",
    week,
    scope: { merchant: purchase.merchant, category: purchase.category },
    maxAmountCents: purchase.amountCents,
    ttlSeconds,
    challengeConfirmed: false,
  });
const body = (signedAuthorization: unknown, idempotencyKey = crypto.randomUUID()) => ({
  idempotencyKey,
  purchase,
  signedAuthorization,
});

beforeEach(() => resetDemoRuntime());

describe("the real runtime, with real keys and sample data", () => {
  it("issues an authorization that survives a JSON round trip and is accepted", () => {
    const signed = JSON.parse(JSON.stringify(issue()));
    expect(executeDemoPurchase(body(signed)).body.outcome).toBe("RECORDED");
    expect(demoStore().purchasesFor("maya")).toHaveLength(1);
  });

  it("gives every authorization its own nonce and rejects expired ones", () => {
    expect(issue().authorization.nonce).not.toBe(issue().authorization.nonce);
    expect(executeDemoPurchase(body(issue(-60))).body.outcome).toBe("EXPIRED");
  });

  it("rejects an unknown week", () => {
    const result = executeDemoPurchase(body(issue(600, 99)));
    expect(result.body.outcome).toBe("OUT_OF_SCOPE");
  });

  it("judges the purchase against the signed week", () => {
    executeDemoPurchase(body(issue()));
    expect(demoStore().purchasesFor("maya")[0].week).toBe(10);
  });

  it("does not allow replay after a reset (regression)", () => {
    const signed = issue();
    expect(executeDemoPurchase(body(signed)).body.outcome).toBe("RECORDED");
    resetDemoRuntime();
    expect(executeDemoPurchase(body(signed)).body.outcome).toBe("BAD_SIGNATURE");
    expect(demoStore().purchasesFor("maya")).toHaveLength(0);
  });
});
