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

// Invented values, so that accounts and web push look set up. The push flow answers every Supabase request in the
// browser (e2e/flows.spec.ts); .test never resolves, and these also win over a developer's own .env.
const accountEnv = {
  SUPABASE_URL: "https://stub.supabase.test",
  SUPABASE_ANON_KEY: "e2e-anon",
  SUPABASE_SERVICE_ROLE_KEY: "e2e-service",
  VAPID_PUBLIC_KEY: "ZTJlLXB1YmxpYy1rZXk",
  VAPID_PRIVATE_KEY: "e2e-private",
  VAPID_SUBJECT: "mailto:e2e@example.test",
};
const workerVars = Object.entries(accountEnv)
  .map(([name, value]) => `--var ${name}:${value}`)
  .join(" ");

const flows = "**/flows.spec.ts";
// On CI the flows run only against the production build (the worker job). Against the dev server on a CI machine they are
// flaky in ways that do not show on the production build or on a developer machine: Vite compiles lazily, so a page
// can take much longer to hydrate, and a second navigation inside one test then races it. They still run against the
// dev server on a developer machine, where they pass every time.
const flowsIgnore = !worker && process.env.CI ? [flows] : undefined;
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
    {
      name: "flows",
      use: desktop,
      testMatch: flows,
      testIgnore: flowsIgnore,
      grepInvert: /@phone|@failure/,
    },
    {
      name: "phone",
      use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 }, hasTouch: true },
      testMatch: flows,
      testIgnore: flowsIgnore,
      grep: /@phone/,
    },
    // Switching the stub to fail would disturb the other flows (the app's provider back-off is shared by every page),
    // so this one runs on its own after them.
    {
      name: "provider-failure",
      use: desktop,
      testMatch: flows,
      testIgnore: flowsIgnore,
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
              `npx wrangler dev --cwd .output --name skydeck --ip 127.0.0.1 --port ${port} --inspector-port ${port + 1} --compatibility-date 2026-11-01 --var ADSB_UPSTREAM_OVERRIDE:${stubUrl} ${workerVars}`
            : `npx vite dev --port ${port} --strictPort`,
          // For the dev server; the Worker gets the variables through --var above.
          env: { ADSB_UPSTREAM_OVERRIDE: stubUrl, ...accountEnv },
          url: `http://${worker ? "127.0.0.1" : "localhost"}:${port}/api/health`,
          // Never reuse: a server started elsewhere would lack ADSB_UPSTREAM_OVERRIDE and the flows would hit live data.
          // A busy port now fails the run instead.
          reuseExistingServer: false,
          timeout: 60_000,
          gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
        },
      ],
});
