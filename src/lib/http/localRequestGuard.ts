// Every /api request passes through this check (see src/proxy.ts). The sandbox has no login,
// so without it any web page open in the same browser could send blind POSTs to the local
// server, for example resetting the sandbox or replacing the student's grant. That was
// reproduced in Chrome from another local origin before this check existed.
//
// The check doesn't identify users. It only makes sure a request is meant for this computer
// and, when it comes from a browser, was sent by this app's own pages:
//   1. Host must be a loopback name. This stops DNS-rebinding pages, which would otherwise
//      look same-origin.
//   2. Sec-Fetch-Site, which browsers set, must be "same-origin" or "none".
//   3. Origin, if present, must match Host.
// Tools like curl send neither header, so they still work. Anything already running on this
// computer is outside what this check can stop.

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

interface HeaderReader {
  get(name: string): string | null;
}

/** Returns why a request should be refused, or null if it's fine. */
export function localRequestProblem(headers: HeaderReader): string | null {
  const host = headers.get("host");
  if (!host) return "Missing Host header.";
  let hostname: string;
  try {
    hostname = new URL(`http://${host}`).hostname;
  } catch {
    return "Invalid Host header.";
  }
  if (!LOOPBACK_HOSTNAMES.has(hostname)) {
    return "This sandbox only accepts requests addressed to this computer.";
  }

  const site = headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin" && site !== "none") {
    return "Cross-site requests are not allowed.";
  }

  const origin = headers.get("origin");
  if (origin !== null) {
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      return "Invalid Origin header.";
    }
    if (originHost !== host) return "Cross-origin requests are not allowed.";
  }
  return null;
}
