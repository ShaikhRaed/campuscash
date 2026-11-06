import { beforeEach, describe, expect, it } from "vitest";
import {
  evaluateRequest,
  issueGrant,
  resetSandbox,
  revokeGrant,
  sandboxState,
  sandboxStore,
  setSandboxWeek,
  signProposal,
} from "./demoRuntime";
import type { SignedGrant } from "./schema";

const BOOKSTORE = { merchant: "Larkspur Campus Bookstore", category: "books" };
const activeGrant = () => sandboxState("maya")!.grant!.signedGrant;
const body = (signedGrant: SignedGrant, amountCents = 4_200, purchase = BOOKSTORE, idempotencyKey = crypto.randomUUID()) => ({
  idempotencyKey,
  signedGrant,
  signedProposal: signProposal({ grantId: signedGrant.grant.grantId, ...purchase, amountCents }),
});

beforeEach(() => resetSandbox());

describe("the real runtime, with real keys and sample data", () => {
  it("opens at week 10 with an active course-materials grant", () => {
    const state = sandboxState("maya")!;
    expect(state.week).toBe(10);
    expect(state.budget.spentCents).toBe(176_727);
    expect(state.grant).toMatchObject({ status: "ACTIVE", remainingCents: 15_000, usedCents: 0 });
    expect(state.grant!.signedGrant.grant).toMatchObject({
      scope: { category: "books" },
      validFromWeek: 9,
      validThroughWeek: 12,
    });
  });

  it("survives a JSON round trip and gives the demo's three decisions", () => {
    const grant = JSON.parse(JSON.stringify(activeGrant()));
    expect(evaluateRequest(JSON.parse(JSON.stringify(body(grant)))).body.decision).toBe("ALLOW");
    resetSandbox();
    expect(evaluateRequest(body(activeGrant(), 12_000)).body.decision).toBe("CHALLENGE");
    expect(evaluateRequest(body(activeGrant(), 20_000)).body.decision).toBe("DENY");
  });

  it("keeps the budget and allowance consistent after an ALLOW", () => {
    evaluateRequest(body(activeGrant()));
    const state = sandboxState("maya")!;
    expect(state.budget.spentCents).toBe(176_727 + 4_200);
    expect(state.grant).toMatchObject({ usedCents: 4_200, remainingCents: 10_800 });
    expect(state.purchases).toHaveLength(1);
  });

  it("uses the server's clock for the period", () => {
    expect(setSandboxWeek(13)).toBe(true);
    expect(sandboxState("maya")!.grant!.status).toBe("EXPIRED");
    expect(evaluateRequest({ ...body(activeGrant()), week: 10 }).body.reason).toMatch(/Expired/);
    expect(setSandboxWeek(8)).toBe(true);
    expect(sandboxState("maya")!.grant!.status).toBe("NOT_STARTED");
  });

  it.each([0, 17, 1.5, "10", null])("refuses the clock value %j", (week) => {
    expect(setSandboxWeek(week as number)).toBe(false);
    expect(sandboxState("maya")!.week).toBe(10);
  });

  it("gives every proposal its own nonce", () => {
    const a = signProposal({ grantId: "g", ...BOOKSTORE, amountCents: 1 });
    const b = signProposal({ grantId: "g", ...BOOKSTORE, amountCents: 1 });
    expect(a.proposal.nonce).not.toBe(b.proposal.nonce);
  });

  it("makes a new grant replace the old one", () => {
    const old = activeGrant();
    issueGrant({ profileId: "maya", scope: { category: "books" }, limitCents: 5_000, validFromWeek: 9, validThroughWeek: 12 });
    expect(evaluateRequest(body(old)).body.reason).toMatch(/revoked or replaced/);
    expect(evaluateRequest(body(activeGrant())).body.decision).toBe("ALLOW");
  });

  it("denies after revocation and shows no active grant", () => {
    const old = activeGrant();
    revokeGrant("maya");
    expect(sandboxState("maya")!.grant).toBeNull();
    expect(evaluateRequest(body(old)).body.decision).toBe("DENY");
  });

  it("keeps each student's grant to that student", () => {
    const theo = sandboxState("theo")!.grant!.signedGrant;
    evaluateRequest(body(theo));
    expect(sandboxState("maya")!.purchases).toHaveLength(0);
    expect(sandboxState("theo")!.purchases).toHaveLength(1);
  });

  it("does not allow reuse of signed records after a reset (regression)", () => {
    const request = body(activeGrant());
    expect(evaluateRequest(request).body.decision).toBe("ALLOW");
    resetSandbox();
    expect(evaluateRequest(request).body.outcome).toBe("REJECTED_BAD_SIGNATURE");
    expect(sandboxStore().purchasesFor("maya")).toHaveLength(0);
    expect(sandboxState("maya")!.budget.spentCents).toBe(176_727);
  });

  it("returns null for an unknown profile", () => {
    expect(sandboxState("nobody")).toBeNull();
  });
});
