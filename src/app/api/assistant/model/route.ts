// GET /api/assistant/model: whether the local model is ready. Checked from the server, so the
// browser never talks to Ollama directly.

import { getModelStatus } from "@/lib/llm/ollamaClient";

export async function GET() {
  return Response.json(await getModelStatus());
}
