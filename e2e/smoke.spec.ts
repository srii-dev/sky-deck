import { expect, test } from "@playwright/test";

/*
 * Smoke tests: every public page loads, has a title and a heading, and throws no uncaught error.
 * They never depend on live ADS-B data, so they do not flake when a provider is down.
 */

const PAGES = [
  "/about",
  "/privacy",
  "/terms",
  "/disclaimer",
  "/help",
  "/whats-new",
  "/press",
  "/status",
];

for (const path of PAGES) {
  test(`${path} loads with a title and a heading`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(/SkyDeck/);
    await expect(page.locator("h1").first()).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("health endpoint answers ok and is not cached", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(res.headers()["cache-control"]).toContain("no-store");
  expect((await res.json()).status).toBe("ok");
});

test("robots.txt and sitemap.xml are served", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toMatch(/User-agent/i);
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).toContain("<urlset");
});

test("the map page loads without an uncaught error", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Keep the test independent of live data: the browser only reaches ADS-B through our own
  // server functions, so answering them with an error is enough to prove the page copes.
  await page.route("**/_serverFn/**", (route) => route.abort());
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle(/SkyDeck/);
  await expect(page.locator("body")).not.toBeEmpty();
  await page.waitForTimeout(1500);
  expect(errors).toEqual([]);
});

test("an unknown address shows the not-found page", async ({ page }) => {
  const response = await page.goto("/this-page-does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByText(/not found|404/i).first()).toBeVisible();
});
