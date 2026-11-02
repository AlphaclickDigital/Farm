import { defineConfig, devices } from "@playwright/test"

/**
 * Browser end-to-end tests. Expects the app to be running already
 * (`npm run dev` on :3000) plus an API instance for the browser to talk to.
 * Browser API calls to NEXT_PUBLIC_BACKEND_URL are rerouted to E2E_API_URL
 * (default :3101, an instance started with RESEND_API_KEY unset) so test
 * checkouts never send real emails. Uses Stripe TEST mode only.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  // Override E2E_OUTPUT_DIR when runs may overlap: concurrent runs sharing an
  // output folder delete each other's trace files.
  reporter: [["list"], ["html", { open: "never", outputFolder: `${process.env.E2E_OUTPUT_DIR ?? "e2e-results"}-report` }]],
  outputDir: process.env.E2E_OUTPUT_DIR ?? "e2e-results",
  use: {
    baseURL: process.env.E2E_WEB_URL ?? "http://localhost:3000",
    navigationTimeout: 90_000,
    actionTimeout: 20_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  // Full Chromium in new-headless mode (no separate headless-shell download needed).
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: "chromium" } }],
})
