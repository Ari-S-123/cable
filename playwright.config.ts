import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for synthetic end-to-end and accessibility tests.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 14"], browserName: "chromium" },
    },
  ],
  webServer: {
    command: "bun run dev",
    url: "http://127.0.0.1:3000/en-US/demo",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      INTEGRATION_MODE: "deterministic",
      DEMO_MODE: "true",
      EXTERNAL_ACTIONS_ENABLED: "false",
    },
  },
});
