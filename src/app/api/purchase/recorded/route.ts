// GET lists simulated purchases for a profile. DELETE clears the demo's memory.

import { demoStore, resetDemoRuntime } from "@/lib/authorization/demoRuntime";

export async function GET(request: Request) {
  const profileId = new URL(request.url).searchParams.get("profileId") ?? "";
  return Response.json({ purchases: demoStore().purchasesFor(profileId) });
}

export async function DELETE() {
  resetDemoRuntime();
  return new Response(null, { status: 204 });
}
