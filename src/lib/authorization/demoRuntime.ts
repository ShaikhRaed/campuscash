// Server-only state for the prototype: one key pair and one store per server process.
// The key is created fresh at startup and never saved or sent anywhere, so restarting
// the server invalidates old authorizations and clears the store. A demo reset does the
// same: forgetting used nonces while keeping the key would let old authorizations be
// replayed. It lives on globalThis so routes share it and hot reloads don't replace it.

import { randomBytes, randomUUID } from "node:crypto";
import { findProfile } from "@/data/profiles";
import { semester } from "@/data/sampleStudent";
import { buildPolicyContext } from "../simulation";
import { processPurchaseRequest } from "./processPurchase";
import { RequestStore } from "./requestStore";
import type { Authorization, AuthorizationScope, SignedAuthorization } from "./schema";
import { generateDemoKeyPair, signRecord, type DemoKeyPair } from "./signature";

interface Runtime {
  keys: DemoKeyPair;
  store: RequestStore;
}

const holder = globalThis as typeof globalThis & { __campusCashDemo?: Runtime };

function runtime(): Runtime {
  holder.__campusCashDemo ??= {
    keys: generateDemoKeyPair(),
    store: new RequestStore(),
  };
  return holder.__campusCashDemo;
}

export const demoStore = () => runtime().store;

/** Clears demo memory and replaces the key, so earlier authorizations stop working. */
export function resetDemoRuntime(): void {
  holder.__campusCashDemo = undefined;
}

export function issueDemoAuthorization(input: {
  profileId: string;
  week: number;
  scope: AuthorizationScope;
  maxAmountCents: number;
  ttlSeconds: number;
  challengeConfirmed: boolean;
}): SignedAuthorization {
  const { keys } = runtime();
  const now = Date.now();
  const authorization: Authorization = {
    version: 1,
    authorizationId: randomUUID(),
    profileId: input.profileId,
    week: input.week,
    scope: input.scope,
    maxAmountCents: input.maxAmountCents,
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + input.ttlSeconds * 1000).toISOString(),
    nonce: randomBytes(16).toString("hex"),
    challengeConfirmed: input.challengeConfirmed,
  };
  return { authorization, signature: signRecord(authorization, keys.privateKey) };
}

export function executeDemoPurchase(raw: unknown) {
  const { keys, store } = runtime();
  return processPurchaseRequest(raw, {
    now: () => new Date(),
    publicKey: keys.publicKey,
    store,
    getContext: (profileId, week, earlier) => {
      const profile = findProfile(profileId);
      if (!profile || week < 1 || week > semester.totalWeeks) return undefined;
      return buildPolicyContext(profile, week, earlier);
    },
  });
}
