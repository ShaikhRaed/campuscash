// Talks to a local Ollama server. Every failure becomes a clear result and nothing throws,
// so a missing or misbehaving model can't break the rest of the app. This file only returns
// data: it can't reach signing, grants, nonces or the decision pipeline.

import { isLoopbackUrl, NUM_CTX, NUM_PREDICT, readLlmConfig, type LlmConfig } from "./config";
import { buildDraft, MODEL_OUTPUT_SCHEMA, parseModelOutput, type ModelFields, type ProposalDraft } from "./draft";
import { buildMessages } from "./prompt";

export const MAX_REQUEST_LENGTH = 500;
const MAX_RESPONSE_BYTES = 64_000;

type FailureStatus = "bad_input" | "invalid_output" | "timeout" | "unavailable" | "model_missing" | "misconfigured";

export type InterpretResult =
  | {
      status: "ok";
      model: string;
      latencyMs: number;
      rawOutput: string;
      modelFields: ModelFields;
      draft: ProposalDraft;
      notes: string[];
      /** Fields the model added that aren't in the schema, such as "decision". */
      ignoredFields: string[];
    }
  | {
      status: FailureStatus;
      model: string;
      latencyMs: number;
      message: string;
      rawOutput?: string;
      errors?: string[];
    };

export type ModelStatus =
  | { state: "ready"; baseUrl: string; model: string; sizeBytes: number; quantization: string | null; parameterSize: string | null }
  | { state: "model_missing" | "not_running" | "misconfigured"; baseUrl: string; model: string; message: string };

interface Deps {
  config?: LlmConfig;
  fetchImpl?: typeof fetch;
}

const SETUP_HINT = "The manual proposal form still works without it.";

async function readLimitedText(response: Response): Promise<string> {
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) throw new Error("too large");
  return text;
}

export async function interpretRequest(requestText: unknown, deps: Deps = {}): Promise<InterpretResult> {
  const config = deps.config ?? readLlmConfig();
  const fetchImpl = deps.fetchImpl ?? fetch;
  const started = Date.now();
  const fail = (status: FailureStatus, message: string, extra: { rawOutput?: string; errors?: string[] } = {}): InterpretResult => ({
    status,
    model: config.model,
    latencyMs: Date.now() - started,
    message,
    ...extra,
  });

  if (typeof requestText !== "string" || !requestText.trim() || requestText.length > MAX_REQUEST_LENGTH) {
    return fail("bad_input", `Enter a request of up to ${MAX_REQUEST_LENGTH} characters.`);
  }
  if (!isLoopbackUrl(config.baseUrl)) {
    return fail("misconfigured", "OLLAMA_BASE_URL must point at this computer. Remote inference is not allowed.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetchImpl(`${config.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        stream: false,
        format: MODEL_OUTPUT_SCHEMA,
        options: { temperature: 0, seed: 7, num_ctx: NUM_CTX, num_predict: NUM_PREDICT },
        messages: buildMessages(requestText),
      }),
    });
    const body = await readLimitedText(response);

    if (response.status === 404) {
      return fail("model_missing", `Ollama is running, but the model ${config.model} isn't downloaded. ${SETUP_HINT}`);
    }
    if (!response.ok) {
      return fail("unavailable", `Ollama returned HTTP ${response.status}. ${SETUP_HINT}`);
    }

    let rawOutput: unknown;
    try {
      rawOutput = (JSON.parse(body) as { message?: { content?: unknown } }).message?.content;
    } catch {
      return fail("invalid_output", "Ollama's response could not be read.", { errors: ["The response wasn't valid JSON."] });
    }
    if (typeof rawOutput !== "string") {
      return fail("invalid_output", "Ollama's response had no model output.", { errors: ["Missing message content."] });
    }

    const parsed = parseModelOutput(rawOutput);
    if (!parsed.ok) {
      return fail("invalid_output", "The model's output failed validation, so it was discarded.", { rawOutput, errors: parsed.errors });
    }
    const { draft, notes } = buildDraft(parsed.fields, requestText);
    return {
      status: "ok",
      model: config.model,
      latencyMs: Date.now() - started,
      rawOutput,
      modelFields: parsed.fields,
      draft,
      notes,
      ignoredFields: parsed.ignoredFields,
    };
  } catch (error) {
    if (controller.signal.aborted) {
      return fail("timeout", `The local model didn't answer within ${config.timeoutMs / 1000} seconds. ${SETUP_HINT}`);
    }
    if (error instanceof Error && error.message === "too large") {
      return fail("invalid_output", "The model's response was too large, so it was discarded.");
    }
    return fail("unavailable", `Ollama isn't running at ${config.baseUrl}. ${SETUP_HINT}`);
  } finally {
    clearTimeout(timer);
  }
}

export async function getModelStatus(deps: Deps = {}): Promise<ModelStatus> {
  const config = deps.config ?? readLlmConfig();
  const fetchImpl = deps.fetchImpl ?? fetch;
  const { baseUrl, model } = config;
  if (!isLoopbackUrl(baseUrl)) {
    return { state: "misconfigured", baseUrl, model, message: "OLLAMA_BASE_URL must point at this computer. Remote inference is not allowed." };
  }
  try {
    const response = await fetchImpl(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(2_000) });
    if (!response.ok) throw new Error();
    const { models } = (await response.json()) as {
      models?: { name?: string; size?: number; details?: { quantization_level?: string; parameter_size?: string } }[];
    };
    const found = models?.find((m) => m.name === model);
    if (!found) {
      return { state: "model_missing", baseUrl, model, message: `Ollama is running, but ${model} isn't downloaded. Run: ollama pull ${model}` };
    }
    return {
      state: "ready",
      baseUrl,
      model,
      sizeBytes: found.size ?? 0,
      quantization: found.details?.quantization_level ?? null,
      parameterSize: found.details?.parameter_size ?? null,
    };
  } catch {
    return { state: "not_running", baseUrl, model, message: `Ollama isn't running at ${baseUrl}. Install it and run: ollama serve` };
  }
}
