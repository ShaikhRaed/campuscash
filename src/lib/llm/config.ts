// Local-model settings. All are optional, and the app works without them. The server refuses
// any address outside this computer, so inference can't quietly move to a remote service.

export const DEFAULT_OLLAMA_MODEL = "llama3.2:3b";
export const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434";
export const DEFAULT_TIMEOUT_MS = 30_000;
/** Capping the context keeps memory use down, and one short request needs little. */
export const NUM_CTX = 2048;
/** The JSON answer is short, so this also stops a runaway response. */
export const NUM_PREDICT = 200;

export interface LlmConfig {
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);

export function isLoopbackUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && LOOPBACK.has(url.hostname);
  } catch {
    return false;
  }
}

export function readLlmConfig(env: Record<string, string | undefined> = process.env): LlmConfig {
  const timeout = Number(env.OLLAMA_TIMEOUT_MS);
  return {
    baseUrl: (env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_URL).replace(/\/+$/, ""),
    model: env.OLLAMA_MODEL || DEFAULT_OLLAMA_MODEL,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS,
  };
}
