import { defineConfig } from "@playwright/test";

// End-to-end tests drive a real production build in your installed Chrome.
// One worker, because the demo server keeps its state in shared memory.
const PORT = 3100;
// The tests talk to a fake Ollama, so they don't need a model and can trigger every failure.
const FAKE_OLLAMA_PORT = 3101;

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: "chrome",
    viewport: { width: 1360, height: 900 },
  },
  webServer: [
    {
      command: `node e2e/fake-ollama.mjs ${FAKE_OLLAMA_PORT}`,
      url: `http://127.0.0.1:${FAKE_OLLAMA_PORT}/api/version`,
      reuseExistingServer: false,
    },
    {
      command: `npm run build && npx next start -H 127.0.0.1 -p ${PORT}`,
      url: `http://127.0.0.1:${PORT}`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        OLLAMA_BASE_URL: `http://127.0.0.1:${FAKE_OLLAMA_PORT}`,
        OLLAMA_MODEL: "fake-model:1b",
        OLLAMA_TIMEOUT_MS: "1500",
      },
    },
  ],
});
