// GET /api/sandbox/state?profileId=maya: everything the workbench displays.

import { sandboxState } from "@/lib/authorization/demoRuntime";

export async function GET(request: Request) {
  const state = sandboxState(new URL(request.url).searchParams.get("profileId") ?? "");
  return state
    ? Response.json(state)
    : Response.json({ error: "Unknown profile." }, { status: 400 });
}
