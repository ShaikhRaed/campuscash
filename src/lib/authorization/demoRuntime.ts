// The sandbox's server-side state: two demo key pairs, the simulated clock, each student's
// active grant and the store. Kept on globalThis so all routes share one copy and dev hot
// reloads don't replace it. Keys are generated in memory at startup and never saved.
// Both keys live in this one process and the routes that use them have no login, so a
// signature can't show who actually acted.

import { randomBytes, randomUUID } from "node:crypto";
import { findProfile, profiles, DEFAULT_WEEK } from "@/data/profiles";
import { semester } from "@/data/sampleStudent";
import { buildBudgetState, buildPolicyContext } from "../simulation";
import { processProposal } from "./processProposal";
import { RequestStore } from "./requestStore";
import type { Grant, GrantScope, Proposal, SignedGrant, SignedProposal } from "./schema";
import { generateDemoKeyPair, signRecord, type DemoKeyPair } from "./signature";

interface Runtime {
  student: DemoKeyPair;
  assistant: DemoKeyPair;
  store: RequestStore;
  week: number;
  activeGrants: Map<string, SignedGrant>;
}

const holder = globalThis as typeof globalThis & { __campusCashSandbox?: Runtime };

/** The grant each simulated student starts with. */
const DEFAULT_GRANTS: Record<string, { limitCents: number }> = {
  maya: { limitCents: 15_000 },
  theo: { limitCents: 10_000 },
};

function signGrant(
  student: DemoKeyPair,
  input: { profileId: string; scope: GrantScope; limitCents: number; validFromWeek: number; validThroughWeek: number },
): SignedGrant {
  const grant: Grant = {
    version: 2,
    grantId: `grant_${randomUUID()}`,
    issuedAt: new Date().toISOString(),
    ...input,
  };
  return { grant, signature: signRecord(grant, student.privateKey) };
}

function runtime(): Runtime {
  if (!holder.__campusCashSandbox) {
    const student = generateDemoKeyPair();
    const activeGrants = new Map<string, SignedGrant>();
    for (const { id } of profiles) {
      activeGrants.set(
        id,
        signGrant(student, {
          profileId: id,
          scope: { category: "books" },
          limitCents: DEFAULT_GRANTS[id]?.limitCents ?? 10_000,
          validFromWeek: 9,
          validThroughWeek: 12,
        }),
      );
    }
    holder.__campusCashSandbox = {
      student,
      assistant: generateDemoKeyPair(),
      store: new RequestStore(),
      week: DEFAULT_WEEK,
      activeGrants,
    };
  }
  return holder.__campusCashSandbox;
}

export const sandboxStore = () => runtime().store;

/** Clears everything and replaces the keys, so earlier signed records stop working. */
export function resetSandbox(): void {
  holder.__campusCashSandbox = undefined;
}

export function setSandboxWeek(week: number): boolean {
  if (!Number.isInteger(week) || week < 1 || week > semester.totalWeeks) return false;
  runtime().week = week;
  return true;
}

/** Stands in for the student setting a permission. Replaces any earlier grant. */
export function issueGrant(input: {
  profileId: string;
  scope: GrantScope;
  limitCents: number;
  validFromWeek: number;
  validThroughWeek: number;
}): SignedGrant {
  const { student, activeGrants } = runtime();
  const signed = signGrant(student, input);
  activeGrants.set(input.profileId, signed);
  return signed;
}

export function revokeGrant(profileId: string): void {
  runtime().activeGrants.delete(profileId);
}

/** Stand-in for the assistant. It signs whatever it's asked to, so the signature only shows the proposal came through here. */
export function signProposal(input: {
  grantId: string;
  merchant: string;
  category: string;
  amountCents: number;
}): SignedProposal {
  const proposal: Proposal = { version: 2, nonce: randomBytes(16).toString("hex"), ...input };
  return { proposal, signature: signRecord(proposal, runtime().assistant.privateKey) };
}

export function evaluateRequest(raw: unknown) {
  const { student, assistant, store, activeGrants } = runtime();
  return processProposal(raw, {
    now: () => new Date(),
    currentWeek: () => runtime().week,
    studentPublicKey: student.publicKey,
    assistantPublicKey: assistant.publicKey,
    store,
    activeGrantId: (profileId) => activeGrants.get(profileId)?.grant.grantId ?? null,
    getContext: (profileId, week, earlier) => {
      const profile = findProfile(profileId);
      return profile ? buildPolicyContext(profile, week, earlier) : undefined;
    },
  });
}

export type GrantStatus = "ACTIVE" | "NOT_STARTED" | "EXPIRED";

/** Everything the workbench displays, calculated by the server. */
export function sandboxState(profileId: string) {
  const profile = findProfile(profileId);
  if (!profile) return null;
  const { store, week, activeGrants } = runtime();
  const purchases = store.purchasesFor(profile.id);
  const { estimate } = buildBudgetState(profile, week, store.purchasesFor(profile.id, week));
  const signedGrant = activeGrants.get(profile.id) ?? null;

  let grantState = null;
  if (signedGrant) {
    const { grant } = signedGrant;
    const usedCents = store.allowanceUsed(grant.grantId);
    const status: GrantStatus =
      week < grant.validFromWeek ? "NOT_STARTED" : week > grant.validThroughWeek ? "EXPIRED" : "ACTIVE";
    grantState = { signedGrant, usedCents, remainingCents: grant.limitCents - usedCents, status };
  }

  return {
    week,
    totalWeeks: semester.totalWeeks,
    student: profile.student,
    limits: profile.limits,
    budget: {
      budgetCents: estimate.budgetCents,
      spentCents: estimate.spentCents,
      remainingCents: estimate.remainingCents,
      paceCents: estimate.paceCents,
      weeksLeft: estimate.weeksLeft,
      projectedCents: estimate.projectedCents,
    },
    grant: grantState,
    purchases,
    audit: store.auditLog(),
  };
}
