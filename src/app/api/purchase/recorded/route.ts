// GET lists the simulated purchases ALLOW decisions recorded for a profile. /budget uses it.

import { sandboxStore } from "@/lib/authorization/demoRuntime";

export async function GET(request: Request) {
  const profileId = new URL(request.url).searchParams.get("profileId") ?? "";
  return Response.json({ purchases: sandboxStore().purchasesFor(profileId) });
}
