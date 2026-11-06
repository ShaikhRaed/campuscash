// POST /api/assistant/propose: stands in for the hypothetical assistant. It signs the
// proposal it is asked to make and returns it. It decides nothing. The signed proposal
// must then go to /api/proposals/evaluate, where the trusted checks happen.

import { signProposal } from "@/lib/authorization/demoRuntime";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const text = (v: unknown, max: number) =>
    typeof v === "string" && v.trim().length > 0 && v.length <= max;
  if (
    !body ||
    !text(body.grantId, 200) ||
    !text(body.merchant, 200) ||
    !text(body.category, 40) ||
    !Number.isSafeInteger(body.amountCents) ||
    (body.amountCents as number) <= 0
  ) {
    return Response.json(
      { error: "A grant, a merchant, a category and a positive whole number of cents are required." },
      { status: 400 },
    );
  }
  return Response.json(
    signProposal({
      grantId: body.grantId as string,
      merchant: body.merchant as string,
      category: body.category as string,
      amountCents: body.amountCents as number,
    }),
    { status: 201 },
  );
}
