import { defineConfig, devices } from "@playwright/test";

// npm run e2e: the demo flow in the browser, in mock mode (no PayPal account, no AI cost).
// Uses Playwright's own Chromium (`npx playwright install chromium` once), or an installed
// browser with PW_CHANNEL=chrome.
const PORT = 3100;

export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1280, height: 720 },
    channel: process.env.PW_CHANNEL || undefined,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 720 } } }],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    // Process env beats .env.local, so this run never touches PayPal or Gemini.
    env: { PAYPAL_MODE: "mock", AI_MODE: "mock" },
  },
});
