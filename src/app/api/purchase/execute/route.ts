// POST /api/purchase/execute: a thin wrapper. All the rules are in processPurchase.ts,
// where tests can reach them without running a web server.

import { executeDemoPurchase } from "@/lib/authorization/demoRuntime";

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const result = executeDemoPurchase(body);
  return Response.json(result.body, { status: result.status });
}
