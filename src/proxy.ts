// Next.js proxy (formerly "middleware"): runs before every /api route.
import { NextResponse, type NextRequest } from "next/server";
import { localRequestProblem } from "@/lib/http/localRequestGuard";

export function proxy(request: NextRequest) {
  const problem = localRequestProblem(request.headers);
  return problem ? NextResponse.json({ error: problem }, { status: 403 }) : NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
