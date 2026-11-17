import { expect, test } from "@playwright/test";

import { isProduction } from "./target";

/*
 * Checks that only make sense on the production build: the headers the Worker adds, the installable app and its
 * offline page, and that no source maps are published. Skipped on the dev server.
 */
test.skip(
  !isProduction,
  "needs a production build (E2E_TARGET=worker, or E2E_BASE_URL with E2E_PRODUCTION=1)",
);

test("pages, the API and static files carry the security headers", async ({ request }) => {
  for (const path of ["/about", "/api/health", "/manifest.webmanifest", "/icons/icon-192.png"]) {
    const h = (await request.get(path)).headers();
    expect(h["x-content-type-options"], path).toBe("nosniff");
    expect(h["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
    expect(h["permissions-policy"], path).toContain("geolocation=(self)");
  }
});

test("the report-only policy is on pages, never enforcing, and not on data", async ({
  request,
}) => {
  const page = (await request.get("/about")).headers();
  expect(page["content-security-policy-report-only"]).toContain("default-src 'self'");
  expect(page["content-security-policy"]).toBeUndefined();
  expect(
    (await request.get("/api/health")).headers()["content-security-policy-report-only"],
  ).toBeUndefined();
});

test("the service worker and the manifest are not cached, the health check is not stored", async ({
  request,
}) => {
  expect((await request.get("/sw.js")).headers()["cache-control"]).toContain("no-cache");
  expect((await request.get("/manifest.webmanifest")).headers()["cache-control"]).toContain(
    "no-cache",
  );
  expect((await request.get("/api/health")).headers()["cache-control"]).toContain("no-store");
});

test("the manifest is valid and its icons load", async ({ request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.name).toMatch(/SkyDeck/);
  expect(manifest.start_url).toBeTruthy();
  expect(manifest.icons.length).toBeGreaterThan(0);
  for (const icon of manifest.icons as { src: string; type?: string }[]) {
    const res = await request.get(icon.src);
    expect(res.status(), icon.src).toBe(200);
    expect(res.headers()["content-type"], icon.src).toMatch(/^image\//);
  }
});

test("no source maps are published for the app's scripts", async ({ page, request }) => {
  await page.goto("/about");
  const script = await page.locator('script[src$=".js"]').first().getAttribute("src");
  expect(script).toBeTruthy();
  const res = await request.get(script! + ".map");
  expect(res.status() === 404 || !(res.headers()["content-type"] ?? "").includes("json")).toBe(
    true,
  );
});

test("an unknown address is a real 404 on the production build too", async ({ request }) => {
  expect((await request.get("/no-such-page")).status()).toBe(404);
});

test("the service worker takes over and keeps the offline page ready", async ({ page }) => {
  await page.goto("/about");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  // Going offline is not driven here: Playwright's offline switch does not reach the service worker, so a real offline
  // visit stays a manual check (RELEASE.md). What can be proven is that the offline page is stored for that day.
  const stored = await page.evaluate(async () => {
    const res = await caches.match("/offline.html");
    return res ? (await res.text()).includes("You are offline") : false;
  });
  expect(stored).toBe(true);
});
