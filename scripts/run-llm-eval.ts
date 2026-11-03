// Run with: npm run eval:llm
// Needs Ollama running with the model downloaded. Reports on this machine, on this run.
//   --dev   Runs only the development cases and prints them. Writes nothing.
// Otherwise it runs everything and writes src/data/generated/llm-results.json.

import { writeFileSync } from "node:fs";
import os from "node:os";
import { CASE_SET_VERSION, INTERPRETATION_CASES } from "../src/data/llm/interpretationCases";
import { readLlmConfig } from "../src/lib/llm/config";
import { scoreCase, summarize } from "../src/lib/llm/evaluate";
import { getModelStatus, interpretRequest } from "../src/lib/llm/ollamaClient";
import { PROMPT_VERSION } from "../src/lib/llm/prompt";

const EVAL_TIMEOUT_MS = 120_000;
const devOnly = process.argv.includes("--dev");
const config = { ...readLlmConfig(), timeoutMs: EVAL_TIMEOUT_MS };

async function main() {
  const status = await getModelStatus({ config });
  if (status.state !== "ready") {
    console.error(`The local model isn't ready: ${status.message}`);
    process.exit(1);
  }

  // Unload the model, so the first call measures a real cold start.
  await fetch(`${config.baseUrl}/api/generate`, {
    method: "POST",
    body: JSON.stringify({ model: config.model, keep_alive: 0 }),
  });
  const cold = await interpretRequest("Buy a $1 pencil at Campus Print Center", { config });

  const cases = INTERPRETATION_CASES.filter((c) => !devOnly || c.split === "dev");
  const records = [];
  for (const testCase of cases) {
    const result = await interpretRequest(testCase.text, { config });
    const record = scoreCase(testCase, result);
    records.push(record);
    const { scores: s } = record;
    console.log(
      `${testCase.id.padEnd(12)} ${record.status.padEnd(15)} ${String(record.latencyMs).padStart(6)}ms  m:${+s.merchant} a:${+s.amount} c:${+s.category} miss:${+s.missing}${s.injectionFollowed ? " INJECTED" : ""}  ${record.rawOutput?.replace(/\s+/g, " ").slice(0, 110) ?? ""}`,
    );
  }

  const psResponse = await fetch(`${config.baseUrl}/api/ps`);
  const { models } = (await psResponse.json()) as { models: { name: string; size: number; size_vram: number; context_length: number; digest: string }[] };
  const loaded = models.find((m) => m.name === config.model);
  const versionResponse = await fetch(`${config.baseUrl}/api/version`);

  const summary = {
    dev: summarize(records.filter((r) => r.split === "dev")),
    ...(devOnly ? {} : { test: summarize(records.filter((r) => r.split === "test")) }),
  };
  console.log(JSON.stringify(summary, null, 2));
  if (devOnly) return;

  writeFileSync(
    "src/data/generated/llm-results.json",
    `${JSON.stringify(
      {
        caseSetVersion: CASE_SET_VERSION,
        promptVersion: PROMPT_VERSION,
        runDate: new Date().toISOString().slice(0, 10),
        model: {
          name: config.model,
          digest: loaded?.digest.slice(0, 12) ?? null,
          sizeBytes: status.sizeBytes,
          parameterSize: status.parameterSize,
          quantization: status.quantization,
          loadedBytes: loaded?.size ?? null,
          loadedGpuBytes: loaded?.size_vram ?? null,
          contextLength: loaded?.context_length ?? null,
        },
        runtime: { ollamaVersion: ((await versionResponse.json()) as { version: string }).version },
        machine: { cpu: os.cpus()[0]?.model ?? "unknown", memoryGb: Math.round(os.totalmem() / 1024 ** 3), platform: `${os.platform()} ${os.arch()}` },
        coldStartMs: cold.latencyMs,
        summary,
        records,
      },
      null,
      2,
    )}\n`,
  );
  console.log("Wrote src/data/generated/llm-results.json");
}

main();
