import { expect, test, type Page } from "@playwright/test";

import { contrastFailures, hoverContrastFailures, smallTargets } from "./a11y-checks";

/*
 * Structure, keyboard and contrast checks (Phase 5f, 15h) written with Playwright alone: there is no axe-core and no new
 * dependency is allowed. They measure the real pages, so a failing check is either a real defect to fix or a rule to
 * state more carefully; never loosen one silently. Known defects found by these checks are listed next to the test that
 * would catch them, with `test.fixme`.
 */

const THEME_KEY = "skydeck:theme";
const GUIDE_SEEN_KEY = "skydeck:guide-seen";

const TEXT_PAGES = [
  "/about",
  "/privacy",
  "/terms",
  "/disclaimer",
  "/help",
  "/whats-new",
  "/press",
  "/status",
  "/inspector",
];
const ALL_PAGES = [...TEXT_PAGES, "/this-page-does-not-exist", "/"];

async function open(page: Page, path: string, theme: "dark" | "light" = "dark") {
  await page.addInitScript(
    ([themeKey, theme, guideKey]) => {
      localStorage.setItem(themeKey, theme);
      localStorage.setItem(guideKey, "1");
    },
    [THEME_KEY, theme, GUIDE_SEEN_KEY],
  );
  // Never depend on live data: the browser only reaches ADS-B through our own server functions.
  await page.route("**/_serverFn/**", (route) => route.abort());
  await page.goto(path);
  // The map canvas exists only after hydration (the map is client-only), so keys pressed after it reach React.
  if (path === "/") {
    await page.locator("canvas.maplibregl-canvas").waitFor({ timeout: 30_000 });
  } else await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
}

// ---------------------------------------------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------------------------------------------

for (const path of ALL_PAGES) {
  test(`structure: ${path}`, async ({ page }) => {
    await open(page, path);
    const problems = await page.evaluate(() => {
      const out: string[] = [];
      const visible = (el: Element) => {
        const s = getComputedStyle(el);
        if (s.display === "none" || s.visibility === "hidden") return false;
        if (el.closest("[aria-hidden='true'], [hidden], [inert]")) return false;
        return (el as HTMLElement).getClientRects().length > 0;
      };
      const label = (el: Element): string => {
        const byIds = (el.getAttribute("aria-labelledby") ?? "")
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? "")
          .join(" ");
        const imgAlt = [...el.querySelectorAll("img[alt]")]
          .map((i) => i.getAttribute("alt"))
          .join(" ");
        return (
          (el.getAttribute("aria-label") ?? "") +
          byIds +
          ((el as HTMLElement).innerText ?? "") +
          imgAlt +
          (el.getAttribute("title") ?? "")
        ).trim();
      };
      const describe = (el: Element) =>
        el.tagName.toLowerCase() +
        (el.id ? `#${el.id}` : "") +
        (el.className && typeof el.className === "string"
          ? `.${el.className.split(/\s+/)[0]}`
          : "");

      if (!document.documentElement.lang) out.push("html has no lang");

      const interactive = document.querySelectorAll(
        "a[href], button, [role=button], [role=switch], [role=tab], [role=menuitem], [role=combobox], select, input:not([type=hidden])",
      );
      for (const el of interactive) {
        if (!visible(el)) continue;
        if (el.tagName === "INPUT" || el.tagName === "SELECT") {
          const id = el.id;
          const hasLabel =
            el.getAttribute("aria-label") ||
            el.getAttribute("aria-labelledby") ||
            el.closest("label") ||
            (id && document.querySelector(`label[for="${CSS.escape(id)}"]`));
          if (!hasLabel) out.push(`field without a label: ${describe(el)}`);
        } else if (!label(el)) out.push(`no accessible name: ${describe(el)}`);
      }
      for (const img of document.querySelectorAll("img")) {
        if (visible(img) && !img.hasAttribute("alt"))
          out.push(`image without alt: ${img.getAttribute("src")}`);
      }
      const seen = new Set<string>();
      for (const el of document.querySelectorAll("[id]")) {
        if (seen.has(el.id)) out.push(`duplicate id: ${el.id}`);
        seen.add(el.id);
      }
      for (const el of document.querySelectorAll("[tabindex]")) {
        if (Number(el.getAttribute("tabindex")) > 0) out.push(`positive tabindex: ${describe(el)}`);
      }
      // Landmarks and headings: one main region and one top heading, and each navigation region named apart.
      const mains = document.querySelectorAll("main, [role=main]").length;
      if (mains !== 1) out.push(`${mains} main landmarks`);
      const h1s = [...document.querySelectorAll("h1")].filter(visible).length;
      if (h1s !== 1) out.push(`${h1s} visible h1 headings`);
      const navs = [...document.querySelectorAll("nav, [role=navigation]")].map(
        (n) => n.getAttribute("aria-label") ?? "",
      );
      if (navs.length > 1 && new Set(navs).size !== navs.length)
        out.push(`navigation regions without distinct names: ${navs.join(", ")}`);
      return out;
    });
    expect(problems).toEqual([]);
    if (path === "/this-page-does-not-exist") await expect(page).toHaveTitle(/^Page not found/);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Keyboard pass on the text pages
// ---------------------------------------------------------------------------------------------------------------

for (const path of TEXT_PAGES) {
  test(`keyboard: Tab through ${path}`, async ({ page }) => {
    await open(page, path);
    const stops: { desc: string; visibleFocus: boolean; inViewport: boolean }[] = [];
    let previous = "";
    let repeats = 0;
    for (let i = 0; i < 80; i++) {
      await page.keyboard.press("Tab");
      const stop = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const outline = s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0;
        const ring = s.boxShadow !== "none";
        return {
          desc: `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}:${(el.getAttribute("aria-label") || el.innerText || "").trim().slice(0, 30)}`,
          visibleFocus: outline || ring,
          inViewport:
            r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth,
        };
      });
      if (!stop) break; // focus left the document (back to the browser's own controls): the whole page was walked
      if (stop.desc === previous) {
        repeats += 1;
        expect(repeats, `focus stuck on ${stop.desc}`).toBeLessThan(2);
      } else repeats = 0;
      previous = stop.desc;
      stops.push(stop);
    }
    expect(stops.length, "the page has something to tab to").toBeGreaterThan(2);
    expect(
      stops.filter((s) => !s.visibleFocus).map((s) => s.desc),
      "stops without a visible focus style",
    ).toEqual([]);
    expect(
      stops.filter((s) => !s.inViewport).map((s) => s.desc),
      "stops outside the viewport",
    ).toEqual([]);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Dialogs and popovers on the map page
// ---------------------------------------------------------------------------------------------------------------

const OPENERS = ["Filters", "Map layers", "Saved views", "Watchlist", "Collection", "Settings"];

/** Waits until the page answers quickly three times in a row: the map has finished its heavy first tile and terrain work. */
async function waitUntilResponsive(page: Page) {
  let quick = 0;
  for (let i = 0; i < 120 && quick < 3; i++) {
    const t0 = Date.now();
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
    quick = Date.now() - t0 < 150 ? quick + 1 : 0;
    await page.waitForTimeout(250);
  }
}

// One map page for all six: loading the 3D map is the expensive part, and on CI it renders in software, so six maps at
// once kept the page too busy to answer. Each dialog is opened and closed in turn on the same page.
test.describe("map page dialogs", () => {
  test.describe.configure({ mode: "serial" });
  let page: Page;
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    page = await browser.newPage();
    await open(page, "/");
    await waitUntilResponsive(page);
  });
  test.afterAll(async () => {
    await page?.close();
  });

  for (const name of OPENERS) {
    test(`"${name}" opens with the keyboard, closes with Escape and gives focus back`, async () => {
      test.setTimeout(60_000);
      // A handle, not a role locator: an open modal hides the rest of the page from the accessibility tree, so the
      // button cannot be found by role again until the dialog closes.
      const opener = (await page
        .getByRole("button", { name, exact: true })
        .first()
        .elementHandle())!;
      await opener.focus();
      await page.keyboard.press("Enter");

      // The opened surface is the element the button points at (Radix sets aria-controls), else the newest dialog.
      const controls = await opener.getAttribute("aria-controls");
      const surface = controls
        ? page.locator(`[id="${controls}"]`)
        : page.getByRole("dialog").last();
      await expect(surface).toBeVisible();
      await expect
        .poll(() => surface.evaluate((s) => s.contains(document.activeElement)), {
          timeout: 15_000,
        })
        .toBe(true);

      // A modal dialog must keep focus inside. A popover (non-modal) may let Tab move on, which is the expected pattern.
      const modal = await surface.evaluate(
        (s) => s.getAttribute("aria-modal") === "true" || s.closest("[aria-modal='true']") !== null,
      );
      if (modal) {
        for (let i = 0; i < 8; i++) {
          await page.keyboard.press("Tab");
          expect(
            await surface.evaluate((s) => s.contains(document.activeElement)),
            `focus left the "${name}" dialog after ${i + 1} Tab presses`,
          ).toBe(true);
        }
      }

      await page.keyboard.press("Escape");
      await expect(surface).toBeHidden();
      // By name, not by element: a re-render may replace the button, and focus must then land on the new one.
      await expect
        .poll(
          () =>
            page.evaluate(() => {
              const a = document.activeElement;
              return a?.getAttribute("aria-label") ?? a?.textContent?.trim() ?? a?.tagName ?? "";
            }),
          { message: "focus returns to the button", timeout: 15_000 },
        )
        .toBe(name);
    });
  }

  test("map controls are at least 24 by 24 px", async () => {
    expect(await smallTargets(page), "controls under 24 x 24 px").toEqual([]);
  });

  // Each dialog and popover in both themes: text contrast at rest and while each of its controls is hovered, and the
  // size of its controls. The theme is switched in place (the light class), so the one map page serves both.
  for (const theme of ["dark", "light"] as const) {
    test(`dialogs and popovers: contrast and target size (${theme})`, async () => {
      test.setTimeout(120_000);
      await page.evaluate((light) => {
        document.documentElement.classList.toggle("light", light);
        document.documentElement.style.colorScheme = light ? "light" : "dark";
      }, theme === "light");
      const problems: string[] = [];
      for (const name of OPENERS) {
        const opener = page.getByRole("button", { name, exact: true }).first();
        const controls = await opener.getAttribute("aria-controls");
        await opener.click();
        const surface = controls
          ? page.locator(`[id="${controls}"]`)
          : page.getByRole("dialog").last();
        await expect(surface).toBeVisible();
        // Let the opening animation finish: half-faded text would measure low.
        await page.waitForTimeout(400);
        for (const f of await contrastFailures(page, surface)) problems.push(`${name}: ${f}`);
        for (const f of await smallTargets(page, surface)) problems.push(`${name}: small ${f}`);
        for (const f of await hoverContrastFailures(page, surface)) problems.push(`${name}: ${f}`);
        await page.keyboard.press("Escape");
        await expect(surface).toBeHidden();
      }
      await page.evaluate(() => {
        document.documentElement.classList.remove("light");
        document.documentElement.style.colorScheme = "dark";
      });
      expect(problems).toEqual([]);
    });
  }

  // Live regions: the feed state and the search suggestions are announced without moving focus.
  test("the feed state and the search suggestions are live regions", async () => {
    await expect(page.getByRole("status").filter({ hasText: /^Feed: / })).toHaveCount(1);
    const search = page.getByRole("combobox", { name: "Search flights and airports" });
    await search.fill("heathrow");
    await expect(page.getByRole("status").filter({ hasText: /^\d+ suggestions?, / })).toHaveCount(
      1,
    );
    await search.fill("");
    await page.keyboard.press("Escape");
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Reduced motion
// ---------------------------------------------------------------------------------------------------------------

for (const reduce of [true, false]) {
  test(`reduced motion ${reduce ? "stops" : "keeps"} animations and transitions`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: reduce ? "reduce" : "no-preference" });
    await open(page, "/about");
    // Probes with the app's own animation and transition classes, so the rule is checked against the real stylesheet.
    const timing = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.className = "animate-pulse transition-colors live-dot";
      document.body.append(probe);
      const s = getComputedStyle(probe);
      const after = getComputedStyle(probe, "::after");
      const seconds = (v: string) => Math.max(...v.split(",").map((x) => parseFloat(x)));
      const out = {
        animation: seconds(s.animationDuration),
        transition: seconds(s.transitionDuration),
        dot: seconds(after.animationDuration),
        repeats: s.animationIterationCount,
      };
      probe.remove();
      return out;
    });
    if (reduce) {
      expect(timing.animation).toBeLessThan(0.001);
      expect(timing.transition).toBeLessThan(0.001);
      expect(timing.dot).toBeLessThan(0.001);
      expect(timing.repeats).toBe("1");
    } else {
      expect(timing.animation).toBeGreaterThan(0.1);
      expect(timing.transition).toBeGreaterThan(0.1);
      expect(timing.dot).toBeGreaterThan(0.1);
    }
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Contrast, measured on the real pages
// ---------------------------------------------------------------------------------------------------------------

for (const theme of ["dark", "light"] as const) {
  for (const path of TEXT_PAGES.filter((p) => p !== "/status")) {
    test(`contrast: ${path} (${theme})`, async ({ page }) => {
      await open(page, path, theme);
      const failures = await contrastFailures(page);
      expect(failures, "text under the WCAG AA contrast ratio").toEqual([]);
    });
  }
}
