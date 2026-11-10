import { defineConfig, devices } from "@playwright/test";

/*
 * End-to-end tests (Phase 16f). They run against the dev server (`vite dev`): the production build targets Cloudflare, which needs wrangler to
 * preview (not installed). Set E2E_BASE_URL to test an already running site.
 * Only Chromium (the headless shell) is installed; other browsers are not covered yet.
 */
const port = 4173;
const externalBase = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 2,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: externalBase ?? `http://localhost:${port}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: externalBase
    ? undefined
    : {
        command: `npx vite dev --port ${port} --strictPort`,
        url: `http://localhost:${port}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
