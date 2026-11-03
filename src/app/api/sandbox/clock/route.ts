// POST /api/sandbox/clock: moves the simulated week. It is a demo control with no login.
// Evaluation requests can't carry a week: the pipeline only reads this server-side clock.

import { setSandboxWeek } from "@/lib/authorization/demoRuntime";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { week?: unknown } | null;
  return setSandboxWeek(body?.week as number)
    ? Response.json({ week: body?.week })
    : Response.json({ error: "Week is out of range." }, { status: 400 });
}
