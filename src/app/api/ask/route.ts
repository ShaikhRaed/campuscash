// POST /api/ask: searches the sample documents and returns quotes with their sources.
// It only reads. It has no access to purchases, signing or the purchase policy.

import { answerQuestion } from "@/lib/retrieval/answer";

const MAX_QUESTION_LENGTH = 300;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { question?: unknown } | null;
  const question = body?.question;
  if (typeof question !== "string" || !question.trim() || question.length > MAX_QUESTION_LENGTH) {
    return Response.json(
      { error: `Ask a question of up to ${MAX_QUESTION_LENGTH} characters.` },
      { status: 400 },
    );
  }
  return Response.json(answerQuestion(question));
}
