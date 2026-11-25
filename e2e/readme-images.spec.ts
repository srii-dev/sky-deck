import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect as baseExpect, test, type Page } from "@playwright/test";

/*
 * README screenshots and banner (dev-plan 15f). Not a test: it only runs when README_IMAGES=1, through
 * `node scripts/make-readme-images.mjs`, and writes PNG files to .github/images/ for the README.
 *
 * The aircraft come from the stub provider (e2e/stub-upstream.mjs): invented callsigns such as SKD303, never live data.
 * The map tiles are the real free basemaps (OpenFreeMap, Esri, AWS terrain), so the machine running this needs to reach
 * them; without them the map is blank.
 *
 * .github/images/banner.png is 1280 x 640, the size GitHub asks for, so it can also be uploaded as the repository's social
 * preview image (Settings, General, Social preview).
 */
const STUB = process.env["E2E_STUB_URL"];
test.skip(
  process.env["README_IMAGES"] !== "1" || !STUB,
  "only runs from scripts/make-readme-images.mjs",
);

const expect = baseExpect.configure({ timeout: 30_000 });
test.describe.configure({ mode: "serial", timeout: 120_000 });

const OUT = join(process.cwd(), ".github", "images");
mkdirSync(OUT, { recursive: true });
const out = (name: string) => join(OUT, name);

/** Map tiles keep loading for a while after the page answers; there is no state to wait for, so this waits a set time. */
const TILE_SETTLE_MS = 6000;

async function openMap(page: Page, theme: "dark" | "light", basemap: string) {
  await page.addInitScript(
    ([theme, basemap]) => {
      localStorage.setItem("skydeck:guide-seen", "1");
      localStorage.setItem("skydeck:theme", theme);
      localStorage.setItem("skydeck:basemap", basemap);
    },
    [theme, basemap],
  );
  await page.goto("/");
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
}

async function select(page: Page, callsign: string) {
  await page.getByRole("combobox", { name: "Search flights and airports" }).fill(callsign);
  await page.getByRole("option", { name: new RegExp("^" + callsign) }).click();
  // Moves focus off the search box so no caret or open list shows in the picture.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

test("map, desktop, dark, an aircraft open", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openMap(page, "dark", "dark");
  await select(page, "SKD303");
  await expect(
    page.getByRole("complementary", { name: "Aircraft details" }).getByRole("heading", {
      name: "SKD303",
    }),
  ).toBeVisible();
  await page.waitForTimeout(TILE_SETTLE_MS);
  await page.screenshot({ path: out("map-desktop.png") });
});

test("map, desktop, light theme, satellite", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openMap(page, "light", "satellite");
  await select(page, "SKD202");
  await expect(
    page.getByRole("complementary", { name: "Aircraft details" }).getByRole("heading", {
      name: "SKD202",
    }),
  ).toBeVisible();
  await page.waitForTimeout(TILE_SETTLE_MS);
  await page.screenshot({ path: out("map-satellite-light.png") });
});

test("map, phone, details sheet", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
    hasTouch: true,
  });
  const page = await context.newPage();
  await openMap(page, "dark", "dark");
  await select(page, "SKD303");
  const sheet = page.getByRole("region", { name: "Aircraft details" });
  // The sheet stays at its first, short height so the map shows above it.
  await expect(sheet.getByRole("heading", { name: "SKD303" })).toBeVisible();
  await page.waitForTimeout(TILE_SETTLE_MS);
  await page.screenshot({ path: out("map-phone.png") });
  await context.close();
});

/** The banner: the app's name and tagline in its own fonts and colours, next to the desktop screenshot taken above. */
test("banner", async ({ page }) => {
  const root = process.cwd();
  const brand = readFileSync(join(root, "src/config/brand.ts"), "utf8");
  const pick = (name: string) => brand.match(new RegExp(`${name}\\s*=\\s*"([^"]+)"`))?.[1] ?? "";
  const font = (file: string) =>
    `data:font/woff2;base64,${readFileSync(join(root, "public/fonts", file)).toString("base64")}`;
  const shot = `data:image/png;base64,${readFileSync(out("map-desktop.png")).toString("base64")}`;
  // The Lucide "plane" outline the site header uses (same path as scripts/make-share-image.mjs).
  const PLANE =
    "M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z";
  // Altitude colours of the map legend, low to high.
  const ALT = ["#f0643c", "#f5a623", "#c6e046", "#3fd3a5", "#3fb7f0", "#6d84ff"];

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: "Chakra Petch"; font-weight: 700; src: url(${font("chakra-petch-700-latin.woff2")}) format("woff2"); }
@font-face { font-family: "Chakra Petch"; font-weight: 500; src: url(${font("chakra-petch-500-latin.woff2")}) format("woff2"); }
@font-face { font-family: "JetBrains Mono"; font-weight: 400; src: url(${font("jetbrains-mono-400-latin.woff2")}) format("woff2"); }
html, body { margin: 0; width: 1280px; height: 640px; overflow: hidden; }
body { background: oklch(0.15 0.018 240); color: oklch(0.93 0.012 220); position: relative; }
.glow { position: absolute; inset: 0; background:
  radial-gradient(55% 75% at 78% 50%, oklch(0.3 0.06 230 / 0.6), transparent 70%),
  radial-gradient(40% 50% at 8% 100%, oklch(0.3 0.06 75 / 0.25), transparent 70%); }
.grid { position: absolute; inset: 0; background-image:
  linear-gradient(oklch(0.32 0.025 235 / 0.3) 1px, transparent 1px),
  linear-gradient(90deg, oklch(0.32 0.025 235 / 0.3) 1px, transparent 1px);
  background-size: 80px 80px; }
.copy { position: absolute; left: 72px; top: 170px; width: 470px; }
.mark { display: flex; align-items: center; gap: 18px; }
.badge { width: 76px; height: 76px; border-radius: 18px; background: oklch(0.19 0.02 240); border: 2px solid oklch(0.32 0.025 235); display: grid; place-items: center; }
h1 { margin: 0; font: 700 80px/1 "Chakra Petch", sans-serif; letter-spacing: 0.01em; color: oklch(0.82 0.16 75); }
.tag { margin-top: 26px; font: 500 36px/1.15 "Chakra Petch", sans-serif; }
.sub { margin-top: 22px; font: 400 20px/1.55 "JetBrains Mono", monospace; color: oklch(0.68 0.025 225); }
.legend-label { position: absolute; left: 72px; bottom: 78px; font: 400 16px "JetBrains Mono", monospace; color: oklch(0.68 0.025 225); letter-spacing: 0.12em; }
.legend { position: absolute; left: 72px; bottom: 60px; display: flex; width: 300px; height: 10px; border-radius: 5px; overflow: hidden; }
.legend span { flex: 1; }
.window { position: absolute; left: 600px; top: 70px; width: 800px; height: 500px; border-radius: 14px; overflow: hidden;
  border: 2px solid oklch(0.32 0.025 235); box-shadow: 0 30px 80px oklch(0.05 0.01 240 / 0.7); background: oklch(0.19 0.02 240); }
.window img { display: block; width: 800px; height: 500px; }
</style></head><body>
<div class="glow"></div><div class="grid"></div>
<div class="window"><img src="${shot}" alt=""></div>
<div class="copy">
  <div class="mark">
    <div class="badge"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="oklch(0.82 0.16 75)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${PLANE}"/></svg></div>
    <h1>${pick("APP_NAME")}</h1>
  </div>
  <div class="tag">${pick("APP_TAGLINE")}</div>
  <div class="sub">Live ADS-B aircraft on a free<br>3D map. Weather, airports,<br>alerts and replay.</div>
</div>
<div class="legend-label">ALTITUDE</div>
<div class="legend">${ALT.map((c) => `<span style="background:${c}"></span>`).join("")}</div>
</body></html>`;

  await page.setViewportSize({ width: 1280, height: 640 });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  writeFileSync(out("banner.png"), await page.screenshot({ type: "png" }));
});
