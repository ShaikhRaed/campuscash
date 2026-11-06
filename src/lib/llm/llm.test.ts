import { describe, expect, it } from "vitest";
import { PURCHASE_CATEGORIES } from "../policy/purchasePolicy";
import { isLoopbackUrl, readLlmConfig, type LlmConfig } from "./config";
import { buildDraft, DRAFT_CATEGORIES, parseModelOutput, type ModelFields } from "./draft";
import { getModelStatus, interpretRequest, MAX_REQUEST_LENGTH } from "./ollamaClient";
import { buildMessages, SYSTEM_PROMPT } from "./prompt";

const config: LlmConfig = { baseUrl: "http://127.0.0.1:11434", model: "test-model", timeoutMs: 50 };
const TEXT = "Buy a $42 textbook at Larkspur Campus Bookstore";
const fields = (overrides: Record<string, unknown> = {}): ModelFields & Record<string, unknown> => ({
  merchant: "Larkspur Campus Bookstore",
  amount_dollars: 42,
  category: "books",
  purpose: "textbook",
  missing_information: [],
  ...overrides,
});

/** A fake Ollama that answers with the given model output. */
const answering = (output: unknown, status = 200) =>
  (async () =>
    new Response(JSON.stringify({ message: { content: typeof output === "string" ? output : JSON.stringify(output) } }), { status })) as unknown as typeof fetch;

describe("configuration", () => {
  it("has working defaults and needs no environment variables", () => {
    expect(readLlmConfig({})).toMatchObject({ baseUrl: "http://127.0.0.1:11434", model: "llama3.2:3b", timeoutMs: 30_000 });
  });

  it("lets the model and timeout be configured", () => {
    expect(readLlmConfig({ OLLAMA_MODEL: "other:1b", OLLAMA_TIMEOUT_MS: "900" })).toMatchObject({ model: "other:1b", timeoutMs: 900 });
    expect(readLlmConfig({ OLLAMA_TIMEOUT_MS: "soon" }).timeoutMs).toBe(30_000);
  });

  it.each([
    ["http://127.0.0.1:11434", true],
    ["http://localhost:11434", true],
    ["http://[::1]:11434", true],
    ["https://api.example.com", false],
    ["http://192.168.1.5:11434", false],
    ["http://127.0.0.1.example.com", false],
    ["http://localhost.example.com:11434", false],
    ["file:///etc/passwd", false],
    ["not a url", false],
  ])("treats %s as local: %s", (url, expected) => {
    expect(isLoopbackUrl(url)).toBe(expected);
  });

  it("refuses to send a request to a remote address", async () => {
    let called = false;
    const spy = (async () => {
      called = true;
      return new Response("{}");
    }) as unknown as typeof fetch;
    const remote = { ...config, baseUrl: "https://api.example.com" };
    expect((await interpretRequest(TEXT, { config: remote, fetchImpl: spy })).status).toBe("misconfigured");
    expect((await getModelStatus({ config: remote, fetchImpl: spy })).state).toBe("misconfigured");
    expect(called).toBe(false);
  });
});

describe("what the model receives", () => {
  it("is only the instructions and the student's text, with no tools", async () => {
    let sent: Record<string, unknown> = {};
    const spy = (async (_url: string, init: RequestInit) => {
      sent = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ message: { content: JSON.stringify(fields()) } }));
    }) as unknown as typeof fetch;
    await interpretRequest(TEXT, { config, fetchImpl: spy });
    expect(Object.keys(sent).sort()).toEqual(["format", "messages", "model", "options", "stream"]);
    expect(sent.tools).toBeUndefined();
    const text = JSON.stringify(sent.messages);
    expect(text).toContain(TEXT);
    for (const secret of ["privateKey", "signature", "grantId", "nonce", "budgetCents", "BEGIN"]) {
      expect(text).not.toContain(secret);
    }
  });

  it("marks the student's text as data and says the model decides nothing", () => {
    expect(buildMessages("hello")[1].content).toContain("<message>\nhello\n</message>");
    expect(SYSTEM_PROMPT).toMatch(/untrusted data/);
    expect(SYSTEM_PROMPT).toMatch(/don't approve or deny/);
  });

  it("uses the same categories as the policy", () => {
    expect([...DRAFT_CATEGORIES]).toEqual([...PURCHASE_CATEGORIES]);
  });
});

describe("failures become clear results", () => {
  const run = (fetchImpl: typeof fetch, text: unknown = TEXT) => interpretRequest(text, { config, fetchImpl });

  it.each([[""], ["   "], [null], [42], ["x".repeat(MAX_REQUEST_LENGTH + 1)]])("rejects bad input %j without calling the model", async (text) => {
    let called = false;
    const spy = (async () => {
      called = true;
      return new Response("{}");
    }) as unknown as typeof fetch;
    expect((await run(spy, text)).status).toBe("bad_input");
    expect(called).toBe(false);
  });

  it("reports Ollama not running", async () => {
    const refused = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const result = await run(refused);
    expect(result.status).toBe("unavailable");
    expect(result.status !== "ok" && result.message).toMatch(/isn't running/);
  });

  it("reports a model that isn't downloaded", async () => {
    expect((await run(answering({ error: "not found" }, 404))).status).toBe("model_missing");
  });

  it("reports a server error", async () => {
    expect((await run(answering({}, 500))).status).toBe("unavailable");
  });

  it("gives up after the timeout", async () => {
    const hanging = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      })) as unknown as typeof fetch;
    const result = await run(hanging);
    expect(result.status).toBe("timeout");
    expect(result.latencyMs).toBeGreaterThanOrEqual(40);
  });

  it.each([
    ["plain text", "Sure! The merchant is the bookstore."],
    ["truncated JSON", '{"merchant": "Larkspur'],
    ["a JSON list", "[1, 2]"],
    ["JSON null", "null"],
    ["an empty string", ""],
  ])("rejects %s from the model", async (_name, output) => {
    const result = await run(answering(output));
    expect(result.status).toBe("invalid_output");
  });

  it("rejects an Ollama response it can't read", async () => {
    const garbage = (async () => new Response("<html>")) as unknown as typeof fetch;
    expect((await run(garbage)).status).toBe("invalid_output");
    const empty = (async () => new Response("{}")) as unknown as typeof fetch;
    expect((await run(empty)).status).toBe("invalid_output");
  });

  it("rejects an oversized response", async () => {
    const huge = (async () => new Response("x".repeat(70_000))) as unknown as typeof fetch;
    expect((await run(huge)).status).toBe("invalid_output");
  });
});

describe("schema validation", () => {
  it("accepts the expected shape", () => {
    expect(parseModelOutput(JSON.stringify(fields())).ok).toBe(true);
    expect(parseModelOutput(JSON.stringify(fields({ merchant: null, amount_dollars: null, category: null, purpose: null }))).ok).toBe(true);
  });

  it.each([
    ["a missing field", Object.fromEntries(Object.entries(fields()).filter(([k]) => k !== "merchant")), /Missing field: merchant/],
    ["a text amount", fields({ amount_dollars: "42" }), /amount_dollars/],
    ["an unknown category", fields({ category: "income" }), /category/],
    ["a numeric merchant", fields({ merchant: 7 }), /merchant/],
    ["a non-list", fields({ missing_information: "merchant" }), /missing_information/],
    ["a mixed list", fields({ missing_information: [1] }), /missing_information/],
  ])("rejects %s", (_name, value, pattern) => {
    const result = parseModelOutput(JSON.stringify(value));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.join(" ")).toMatch(pattern);
  });

  it("drops and reports extra fields", () => {
    const result = parseModelOutput(JSON.stringify(fields({ decision: "ALLOW", signature: "abc", approved: true })));
    expect(result.ok && result.ignoredFields.sort()).toEqual(["approved", "decision", "signature"]);
    expect(result.ok && Object.keys(result.fields)).not.toContain("decision");
  });
});

describe("grounding in the student's text", () => {
  it("keeps fields the text supports, in cents", () => {
    const { draft, notes } = buildDraft(fields(), TEXT);
    expect(draft).toMatchObject({ merchant: "Larkspur Campus Bookstore", amountCents: 4_200, category: "books", readyForProposal: true });
    expect(draft.missingInformation).toEqual([]);
    expect(notes).toEqual([]);
  });

  it("matches merchants ignoring case and spacing", () => {
    expect(buildDraft(fields({ merchant: "larkspur  campus bookstore" }), TEXT).draft.merchant).toBe("larkspur  campus bookstore");
  });

  it("discards an invented merchant", () => {
    const { draft, notes } = buildDraft(fields({ merchant: "Trusted Store" }), TEXT);
    expect(draft.merchant).toBeNull();
    expect(draft.missingInformation).toContain("merchant");
    expect(draft.readyForProposal).toBe(false);
    expect(notes.join(" ")).toMatch(/isn't in the student's text/);
  });

  it("discards an invented amount, so a model can't lower or raise the price", () => {
    expect(buildDraft(fields({ amount_dollars: 0.01 }), TEXT).draft.amountCents).toBeNull();
    expect(buildDraft(fields({ amount_dollars: 4_200 }), TEXT).draft.amountCents).toBeNull();
  });

  it.each([-5, 0, 1.234, 1e21])("discards the nonsense amount %s", (amount_dollars) => {
    expect(buildDraft(fields({ amount_dollars }), `${TEXT} ${amount_dollars}`).draft.amountCents).toBeNull();
  });

  it("reads amounts with cents and commas", () => {
    expect(buildDraft(fields({ amount_dollars: 12.5 }), "$12.50 at Larkspur Campus Bookstore").draft.amountCents).toBe(1_250);
    expect(buildDraft(fields({ amount_dollars: 1200 }), "$1,200 at Larkspur Campus Bookstore").draft.amountCents).toBe(120_000);
  });

  it("recalculates missing information and ignores the model's claim", () => {
    const { draft } = buildDraft(fields({ merchant: null, missing_information: [] }), TEXT);
    expect(draft.missingInformation).toEqual(["merchant"]);
    const wrong = buildDraft(fields({ missing_information: ["merchant", "amount"] }), TEXT).draft;
    expect(wrong.missingInformation).toEqual([]);
  });

  it("limits the length of purpose text", () => {
    expect(buildDraft(fields({ purpose: "x".repeat(500) }), TEXT).draft.purpose).toHaveLength(200);
  });
});

describe("model status", () => {
  const tags = (names: string[]) =>
    (async () => new Response(JSON.stringify({ models: names.map((name) => ({ name, size: 2_000, details: { quantization_level: "Q4", parameter_size: "3B" } })) }))) as unknown as typeof fetch;

  it("is ready when the configured model exists", async () => {
    expect(await getModelStatus({ config, fetchImpl: tags(["test-model"]) })).toMatchObject({ state: "ready", sizeBytes: 2_000, quantization: "Q4" });
  });

  it("says when the model isn't downloaded", async () => {
    const status = await getModelStatus({ config, fetchImpl: tags(["other"]) });
    expect(status.state).toBe("model_missing");
    expect(status.state !== "ready" && status.message).toContain("ollama pull test-model");
  });

  it("says when Ollama isn't running", async () => {
    const refused = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    expect((await getModelStatus({ config, fetchImpl: refused })).state).toBe("not_running");
  });
});
