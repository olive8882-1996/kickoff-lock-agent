import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  testMatch: process.env.E2E_TEST_MATCH ?? "app.spec.ts",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173/kickoff-lock-agent/",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
