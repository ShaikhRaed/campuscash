import { defineConfig } from "@playwright/test";

// End-to-end tests drive a real production build in your installed Chrome.
// One worker, because the demo server keeps its state in shared memory.
const PORT = 3100;

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
  webServer: {
    command: `npm run build && npx next start -H 127.0.0.1 -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
