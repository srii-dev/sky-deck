import { defineConfig, devices } from "@playwright/test";

/*
 * End-to-end tests (Phase 16f). Three ways to run them:
 *  - default: against the dev server (`vite dev`), port E2E_PORT (default 4173);
 *  - E2E_TARGET=worker: against the production build (`bun run build` first) in Cloudflare's local runtime, through
 *    `wrangler dev` on E2E_PORT (default 4174) and the next port for its inspector. Use `bun run test:e2e:worker`;
 *  - E2E_BASE_URL=<address>: against a site that is already running (the live site); no web server is started.
 *    Set E2E_PRODUCTION=1 as well when that site is a production build, to include e2e/production.spec.ts.
 * Only Chromium (the headless shell) is installed; other browsers are not covered yet.
 */
const worker = process.env.E2E_TARGET === "worker";
const port = Number(process.env.E2E_PORT ?? (worker ? 4174 : 4173));
const externalBase = process.env.E2E_BASE_URL;

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
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: externalBase
    ? undefined
    : {
        command: worker
          ? // The compatibility date is pinned because the installed workerd can be older than the date the build writes.
            `npx wrangler dev --cwd .output --name skydeck --ip 127.0.0.1 --port ${port} --inspector-port ${port + 1} --compatibility-date 2026-11-01`
          : `npx vite dev --port ${port} --strictPort`,
        url: `http://${worker ? "127.0.0.1" : "localhost"}:${port}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
        gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
      },
});
