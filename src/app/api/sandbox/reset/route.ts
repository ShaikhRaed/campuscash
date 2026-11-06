// POST /api/sandbox/reset: clears demo memory, restores default grants, replaces both keys.

import { resetSandbox } from "@/lib/authorization/demoRuntime";

export async function POST() {
  resetSandbox();
  return new Response(null, { status: 204 });
}
