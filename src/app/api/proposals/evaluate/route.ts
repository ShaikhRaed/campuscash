// POST /api/proposals/evaluate: a thin wrapper. All the rules are in processProposal.ts,
// where tests can reach them without running a web server.

import { evaluateRequest } from "@/lib/authorization/demoRuntime";

export async function POST(request: Request) {
  const result = evaluateRequest(await request.json().catch(() => null));
  return Response.json(result.body, { status: result.status });
}
