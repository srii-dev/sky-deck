import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

/** Screenshots go next to Playwright's own output, in one folder that CI uploads as an artifact. */
function screenshotPath(name: string): string {
  const dir = join(process.cwd(), "test-results", "screens");
  mkdirSync(dir, { recursive: true });
  return join(dir, name);
}

/*
 * Screenshot matrix (Phase 21k, 15h): every public page at three widths in both themes. Each case checks that the page
 * has no sideways scroll, throws no uncaught error and shows an h1 (where the page has one), and saves a full-page
 * screenshot under test-results/screens/ for a person to look at.
 *
 * There are deliberately no pixel baselines (toHaveScreenshot): fonts and WebGL render differently on Windows and on
 * the Linux CI machines, so a baseline would never match. The images are for looking at, not for comparing.
 */

const THEME_KEY = "skydeck:theme";
const GUIDE_SEEN_KEY = "skydeck:guide-seen";

const SIZES = [
  { name: "1280", width: 1280, height: 800 },
  { name: "746", width: 746, height: 1024 },
  { name: "375", width: 375, height: 812 },
] as const;

const THEMES = ["dark", "light"] as const;

// The map page and the not-found page have no h1 of their own: the map has a canvas and a toolbar, the not-found page
// shows a big "404" heading that is not an h1 on purpose, so they are checked for visible text instead.
const PAGES: { slug: string; path: string; h1: boolean; status: number }[] = [
  { slug: "about", path: "/about", h1: true, status: 200 },
  { slug: "privacy", path: "/privacy", h1: true, status: 200 },
  { slug: "terms", path: "/terms", h1: true, status: 200 },
  { slug: "disclaimer", path: "/disclaimer", h1: true, status: 200 },
  { slug: "help", path: "/help", h1: true, status: 200 },
  { slug: "whats-new", path: "/whats-new", h1: true, status: 200 },
  { slug: "press", path: "/press", h1: true, status: 200 },
  { slug: "status", path: "/status", h1: true, status: 200 },
  { slug: "inspector", path: "/inspector", h1: false, status: 200 },
  { slug: "not-found", path: "/this-page-does-not-exist", h1: false, status: 404 },
  { slug: "map", path: "/", h1: false, status: 200 },
];

for (const size of SIZES) {
  for (const theme of THEMES) {
    test.describe(`${size.name}px, ${theme}`, () => {
      test.use({ viewport: { width: size.width, height: size.height } });

      for (const p of PAGES) {
        test(`${p.slug}`, async ({ page }, testInfo) => {
          const errors: string[] = [];
          page.on("pageerror", (e) => errors.push(e.message));
          // The first-run guide would cover the map page on a first visit, so it is marked as seen here. One separate
          // test below looks at the guide itself.
          await page.addInitScript(
            ([themeKey, theme, guideKey]) => {
              localStorage.setItem(themeKey, theme);
              localStorage.setItem(guideKey, "1");
            },
            [THEME_KEY, theme, GUIDE_SEEN_KEY],
          );
          // Never depend on live data: the browser only reaches ADS-B through our own server functions.
          await page.route("**/_serverFn/**", (route) => route.abort());

          const response = await page.goto(p.path);
          expect(response?.status()).toBe(p.status);
          // The map page never goes quiet (tiles, polling), so it gets a fixed short wait instead of "networkidle".
          if (p.slug === "map") await page.waitForTimeout(2500);
          else
            await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);

          if (p.h1) await expect(page.locator("h1").first()).toBeVisible();
          else await expect(page.locator("body")).toContainText(/\S/);

          const overflow = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            innerWidth: window.innerWidth,
          }));
          expect(overflow.scrollWidth, "horizontal overflow").toBeLessThanOrEqual(
            overflow.innerWidth,
          );

          const isLight = await page.evaluate(() =>
            document.documentElement.classList.contains("light"),
          );
          expect(isLight).toBe(theme === "light");

          const png = await page.screenshot({
            path: screenshotPath(`${p.slug}-${size.name}-${theme}.png`),
            fullPage: p.slug !== "map",
          });
          await testInfo.attach(`${p.slug}-${size.name}-${theme}`, {
            body: png,
            contentType: "image/png",
          });

          expect(errors).toEqual([]);
        });
      }
    });
  }
}

test("the first-run guide on a first visit (one screenshot)", async ({ page }, testInfo) => {
  await page.route("**/_serverFn/**", (route) => route.abort());
  await page.goto("/");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  const png = await page.screenshot({ path: screenshotPath("first-run-guide-1280-dark.png") });
  await testInfo.attach("first-run-guide", { body: png, contentType: "image/png" });
});
