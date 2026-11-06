// POST /api/assistant/interpret: asks the local model to read a request, validates the
// answer, and returns it. That's all. This route can't sign, evaluate or record anything.

import { interpretRequest } from "@/lib/llm/ollamaClient";

const HTTP_STATUS = {
  ok: 200,
  bad_input: 400,
  invalid_output: 422,
  model_missing: 503,
  unavailable: 503,
  misconfigured: 503,
  timeout: 504,
} as const;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { request?: unknown } | null;
  const result = await interpretRequest(body?.request);
  return Response.json(result, { status: HTTP_STATUS[result.status] });
}
