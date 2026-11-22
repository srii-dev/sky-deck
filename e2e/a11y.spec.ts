import { expect, test, type Page } from "@playwright/test";

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
  if (path === "/") await page.locator("canvas.maplibregl-canvas").waitFor({ timeout: 30_000 });
  else await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
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
      return out;
    });
    expect(problems).toEqual([]);
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

for (const name of OPENERS) {
  test(`map page: "${name}" opens with the keyboard, closes with Escape and gives focus back`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await open(page, "/");
    // A handle, not a role locator: an open modal hides the rest of the page from the accessibility tree, so the
    // button cannot be found by role again until the dialog closes.
    const opener = (await page.getByRole("button", { name, exact: true }).first().elementHandle())!;
    await opener.focus();
    await page.keyboard.press("Enter");

    // The opened surface is the element the button points at (Radix sets aria-controls), else the newest dialog.
    const controls = await opener.getAttribute("aria-controls");
    const surface = controls ? page.locator(`[id="${controls}"]`) : page.getByRole("dialog").last();
    await expect(surface).toBeVisible();
    await expect.poll(() => surface.evaluate((s) => s.contains(document.activeElement))).toBe(true);

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
        "focus returns to the button",
      )
      .toBe(name);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Contrast, measured on the real pages
// ---------------------------------------------------------------------------------------------------------------

for (const theme of ["dark", "light"] as const) {
  for (const path of TEXT_PAGES.filter((p) => p !== "/status")) {
    test(`contrast: ${path} (${theme})`, async ({ page }) => {
      await open(page, path, theme);
      const failures = await page.evaluate(() => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        const rgba = (css: string): [number, number, number, number] => {
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = "#000";
          ctx.fillStyle = css;
          ctx.fillRect(0, 0, 1, 1);
          const d = ctx.getImageData(0, 0, 1, 1).data;
          return [d[0], d[1], d[2], d[3] / 255];
        };
        const lum = ([r, g, b]: number[]) => {
          const f = (v: number) => {
            const c = v / 255;
            return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
          };
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        // Walk up to the first fully opaque background, mixing the translucent ones on the way. Give up (null) over an
        // image or gradient: the real background cannot be read from computed colours.
        const background = (el: Element): number[] | null => {
          const layers: [number, number, number, number][] = [];
          for (let n: Element | null = el; n; n = n.parentElement) {
            const s = getComputedStyle(n);
            if (s.backgroundImage !== "none") return null;
            const c = rgba(s.backgroundColor);
            if (c[3] > 0) layers.push(c);
            if (c[3] >= 0.99) break;
          }
          let base = [0, 0, 0];
          const root = rgba(getComputedStyle(document.documentElement).backgroundColor);
          if (root[3] > 0) base = root.slice(0, 3);
          for (const c of layers.reverse()) base = base.map((b, i) => c[i] * c[3] + b * (1 - c[3]));
          return base;
        };
        const out: string[] = [];
        const seen = new Set<string>();
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let t = walker.nextNode(); t; t = walker.nextNode()) {
          const text = (t.textContent ?? "").trim();
          const el = t.parentElement;
          if (!text || !el || el.closest("script, style, noscript, canvas, svg")) continue;
          const s = getComputedStyle(el);
          if (s.display === "none" || s.visibility === "hidden" || parseFloat(s.opacity) === 0)
            continue;
          if (el.getClientRects().length === 0) continue;
          if (el.closest("[aria-hidden='true']")) continue;
          const bg = background(el);
          if (!bg) continue;
          const fg = rgba(s.color);
          const fgMixed = fg.slice(0, 3).map((c, i) => c * fg[3] + bg[i] * (1 - fg[3]));
          const [l1, l2] = [lum(fgMixed), lum(bg)];
          const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
          const size = parseFloat(s.fontSize);
          const bold = parseInt(s.fontWeight, 10) >= 700;
          const large = size >= 24 || (size >= 18.66 && bold);
          const need = large ? 3 : 4.5;
          if (ratio < need) {
            const key = `${el.tagName.toLowerCase()}.${String(el.className).split(/\s+/)[0]}|${s.color}|${s.backgroundColor}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(`${ratio.toFixed(2)}:1 (needs ${need}) "${text.slice(0, 30)}" in ${key}`);
          }
        }
        return out;
      });
      expect(failures, "text under the WCAG AA contrast ratio").toEqual([]);
    });
  }
}
