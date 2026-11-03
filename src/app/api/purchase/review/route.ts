// POST /api/purchase/review: runs the advisor and the policy on the server and
// returns them as two separate results. Nothing is recorded by this route.

import { semester } from "@/data/sampleStudent";
import { findProfile } from "@/data/profiles";
import { demoStore } from "@/lib/authorization/demoRuntime";
import { MODEL_THRESHOLD, scoreHypothetical } from "@/lib/ml/savedModel";
import { reviewPurchase } from "@/lib/reviewPurchase";
import { buildPolicyContext } from "@/lib/simulation";

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null) {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const { profileId, week, merchant, category, amountCents, note } =
    body as Record<string, unknown>;

  const profile = findProfile(String(profileId));
  if (!profile) {
    return Response.json({ error: "Unknown profile." }, { status: 400 });
  }
  if (!Number.isInteger(week) || (week as number) < 1 || (week as number) > semester.totalWeeks) {
    return Response.json({ error: "Week is out of range." }, { status: 400 });
  }

  const purchase = {
    merchant: typeof merchant === "string" ? merchant : "",
    category: typeof category === "string" ? category : "",
    amountCents: typeof amountCents === "number" ? amountCents : Number.NaN,
  };
  const simulated = demoStore().purchasesFor(profile.id, week as number);
  const context = buildPolicyContext(profile, week as number, simulated);

  return Response.json(
    reviewPurchase(purchase, context, {
      note: typeof note === "string" ? note : "",
      modelScore: scoreHypothetical(profile, week as number, purchase, simulated),
      modelThreshold: MODEL_THRESHOLD,
    }),
  );
}
