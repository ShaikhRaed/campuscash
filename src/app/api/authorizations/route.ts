// POST /api/authorizations: the demo's stand-in for "the student signs". Anyone who
// can reach this route can get a signature, because there is no login. That is the
// biggest reason this is a prototype and not real authorization.

import { findProfile } from "@/data/profiles";
import { semester } from "@/data/sampleStudent";
import { issueDemoAuthorization } from "@/lib/authorization/demoRuntime";

const DEFAULT_TTL_SECONDS = 600;
const EXPIRED_DEMO_TTL_SECONDS = -60;

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null) {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const { profileId, week, merchant, category, maxAmountCents, challengeConfirmed, demoExpired } =
    body as Record<string, unknown>;

  const validText = (v: unknown) => typeof v === "string" && v.trim().length > 0 && v.length <= 200;
  if (
    !findProfile(String(profileId)) ||
    !Number.isInteger(week) ||
    (week as number) < 1 ||
    (week as number) > semester.totalWeeks ||
    !(validText(merchant) || validText(category)) ||
    !Number.isSafeInteger(maxAmountCents) ||
    (maxAmountCents as number) <= 0
  ) {
    return Response.json(
      { error: "A known profile, a valid week, a merchant or category, and a positive maximum are required." },
      { status: 400 },
    );
  }

  return Response.json(
    issueDemoAuthorization({
      profileId: String(profileId),
      week: week as number,
      scope: {
        ...(validText(merchant) && { merchant: merchant as string }),
        ...(validText(category) && { category: category as string }),
      },
      maxAmountCents: maxAmountCents as number,
      ttlSeconds: demoExpired === true ? EXPIRED_DEMO_TTL_SECONDS : DEFAULT_TTL_SECONDS,
      challengeConfirmed: challengeConfirmed === true,
    }),
    { status: 201 },
  );
}
