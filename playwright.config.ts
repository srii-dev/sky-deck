import { defineConfig, devices } from "@playwright/test";

/*
 * End-to-end tests (Phase 16f). Three ways to run them:
 *  - default: against the dev server (`vite dev`), port E2E_PORT (default 4173);
 *  - E2E_TARGET=worker: against the production build (`bun run build` first) in Cloudflare's local runtime, through
 *    `wrangler dev` on E2E_PORT (default 4174) and the next port for its inspector. Use `bun run test:e2e:worker`;
 *  - E2E_BASE_URL=<address>: against a site that is already running (the live site); no web server is started.
 *    Set E2E_PRODUCTION=1 as well when that site is a production build, to include e2e/production.spec.ts.
 * Only Chromium (the headless shell) is installed; other browsers are not covered yet.
 *
 * The first two also start a stub ADS-B provider (e2e/stub-upstream.mjs) on E2E_PORT + 3 and point the app at it with
 * ADSB_UPSTREAM_OVERRIDE, so the flow tests (e2e/flows.spec.ts) see invented aircraft and never live data. The flow
 * tests read the stub's address from E2E_STUB_URL and are skipped when it is empty (E2E_BASE_URL runs).
 */
const worker = process.env.E2E_TARGET === "worker";
const port = Number(process.env.E2E_PORT ?? (worker ? 4174 : 4173));
const externalBase = process.env.E2E_BASE_URL;
const stubUrl = `http://127.0.0.1:${port + 3}`;
// Read by the test workers, which inherit this process's environment.
process.env["E2E_STUB_URL"] = externalBase ? "" : stubUrl;

const flows = "**/flows.spec.ts";
const desktop = { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } };

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 2,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  globalSetup: externalBase || worker ? undefined : "./e2e/warm-up.ts",
  use: {
    baseURL: externalBase ?? `http://${worker ? "127.0.0.1" : "localhost"}:${port}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      // The screenshot and accessibility specs measure layout and markup, which the production build shares with the
      // dev server; running them once (dev target) keeps the worker job short.
      testIgnore: worker ? [flows, "**/screens.spec.ts", "**/a11y.spec.ts"] : [flows],
    },
    { name: "flows", use: desktop, testMatch: flows, grepInvert: /@phone|@failure/ },
    {
      name: "phone",
      use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 }, hasTouch: true },
      testMatch: flows,
      grep: /@phone/,
    },
    // Switching the stub to fail would disturb the other flows (the app's provider back-off is shared by every page),
    // so this one runs on its own after them.
    {
      name: "provider-failure",
      use: desktop,
      testMatch: flows,
      grep: /@failure/,
      dependencies: ["flows", "phone"],
    },
  ],
  webServer: externalBase
    ? undefined
    : [
        {
          command: `node e2e/stub-upstream.mjs ${port + 3}`,
          url: `${stubUrl}/__stub/health`,
          reuseExistingServer: !process.env.CI,
          timeout: 10_000,
        },
        {
          command: worker
            ? // The compatibility date is pinned because the installed workerd can be older than the date the build writes.
              `npx wrangler dev --cwd .output --name skydeck --ip 127.0.0.1 --port ${port} --inspector-port ${port + 1} --compatibility-date 2026-11-01 --var ADSB_UPSTREAM_OVERRIDE:${stubUrl}`
            : `npx vite dev --port ${port} --strictPort`,
          // For the dev server; the Worker gets the variable through --var above.
          env: { ADSB_UPSTREAM_OVERRIDE: stubUrl },
          url: `http://${worker ? "127.0.0.1" : "localhost"}:${port}/api/health`,
          // Never reuse: a server started elsewhere would lack ADSB_UPSTREAM_OVERRIDE and the flows would hit live data.
          // A busy port now fails the run instead.
          reuseExistingServer: false,
          timeout: 60_000,
          gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
        },
      ],
});
