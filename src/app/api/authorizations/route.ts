// POST sets a student's grant, replacing any earlier one. DELETE revokes it. This stands
// in for the student acting, but there is no login, so a signature here is not consent.

import { findProfile } from "@/data/profiles";
import { semester } from "@/data/sampleStudent";
import { issueGrant, revokeGrant } from "@/lib/authorization/demoRuntime";
import { parseScope } from "@/lib/authorization/schema";

const validWeek = (w: unknown) =>
  Number.isInteger(w) && (w as number) >= 1 && (w as number) <= semester.totalWeeks;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const scope = parseScope(body?.scope);
  if (
    !body ||
    !scope ||
    !findProfile(String(body.profileId)) ||
    !Number.isSafeInteger(body.limitCents) ||
    (body.limitCents as number) <= 0 ||
    !validWeek(body.validFromWeek) ||
    !validWeek(body.validThroughWeek) ||
    (body.validFromWeek as number) > (body.validThroughWeek as number)
  ) {
    return Response.json(
      { error: "A known profile, a merchant or category, a positive limit and a valid week range are required." },
      { status: 400 },
    );
  }
  return Response.json(
    issueGrant({
      profileId: String(body.profileId),
      scope,
      limitCents: body.limitCents as number,
      validFromWeek: body.validFromWeek as number,
      validThroughWeek: body.validThroughWeek as number,
    }),
    { status: 201 },
  );
}

export async function DELETE(request: Request) {
  const profileId = new URL(request.url).searchParams.get("profileId") ?? "";
  if (!findProfile(profileId)) {
    return Response.json({ error: "Unknown profile." }, { status: 400 });
  }
  revokeGrant(profileId);
  return new Response(null, { status: 204 });
}
