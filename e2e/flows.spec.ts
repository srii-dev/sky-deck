import { readFile } from "node:fs/promises";
import { expect as baseExpect, test, type Page } from "@playwright/test";

/*
 * Flows through the map (Phase 16f), against the stub ADS-B provider (e2e/stub-upstream.mjs) and its invented aircraft.
 * Aircraft are drawn on a WebGL canvas, so they are chosen through the search box or the N and P shortcuts, never by
 * clicking pixels. Every wait is for a state on the page, not for a time.
 * Projects (playwright.config.ts): "flows" at 1280x800, "phone" (@phone) at 375x812, "provider-failure" (@failure)
 * alone after the others, because it switches the shared stub to fail.
 */
const STUB = process.env["E2E_STUB_URL"];
test.skip(!STUB, "needs the stub provider, which E2E_BASE_URL runs do not start");

// The map polls the feed every few seconds and the dev server is shared by two workers, so a state can take longer than
// Playwright's default 5 s to show and a whole flow longer than 30 s. Waits stay waits for a state, just longer.
const expect = baseExpect.configure({ timeout: 15_000 });
test.describe.configure({ timeout: 90_000 });

// When a flow fails, print what the page held (stored keys and the first lines of text) into the log: a CI failure
// cannot be looked at, and a missing stored list and a slow page look the same from the assertion alone.
test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) return;
  for (const [i, p] of page.context().pages().entries()) {
    const state = await p
      .evaluate(() => ({
        url: location.href,
        watchlist: localStorage.getItem("skydeck:watchlist"),
        watchButtons: [...document.querySelectorAll("button")]
          .map((b) => b.getAttribute("aria-label") ?? "")
          .filter((l) => /watch|panel|details/i.test(l)),
        regions: [
          ...document.querySelectorAll("[role=complementary],[role=region],[role=dialog]"),
        ].map((e) => e.getAttribute("aria-label") ?? e.tagName),
        headings: [...document.querySelectorAll("h1,h2,h3")].map((h) => h.textContent).slice(0, 6),
      }))
      .catch((e: unknown) => ({ error: String(e) }));
    console.log(
      `[flow-debug] ${testInfo.title} (retry ${testInfo.retry}) page ${i}: ${JSON.stringify(state)}`,
    );
  }
});

/** Aircraft the stub places around the default view (SKD999, far away, is only found by a search). */
const COUNT = 12;
const GROUND_HEX = "A5C110";
const ALL_HEX = [
  "A5C101",
  "A5C202",
  "A5C303",
  "A5C404",
  "A5C505",
  "A5C606",
  "A5C707",
  "A5C808",
  "A5C912",
  "AE0909",
  GROUND_HEX,
  "A5C711",
];

async function openMap(page: Page, path = "/") {
  // Mark the first-run guide as seen; one test below looks at the guide itself.
  await page.addInitScript(() => localStorage.setItem("skydeck:guide-seen", "1"));
  await page.goto(path);
  // Wait for the first stub answer: before it the page may not be hydrated yet, and typed text or a click can be lost.
  await expect(page.getByText("Live", { exact: true })).toBeVisible({ timeout: 30_000 });
}

const count = (page: Page, text: string) => page.getByText(text, { exact: true });
const searchBox = (page: Page) =>
  page.getByRole("combobox", { name: "Search flights and airports" });
const panel = (page: Page) => page.getByRole("complementary", { name: "Aircraft details" });
const heading = (page: Page, name: string) => panel(page).getByRole("heading", { name });

/** Types into the search box and chooses the result whose label starts with `label`. */
async function pick(page: Page, query: string, label: string) {
  await searchBox(page).fill(query);
  await page.getByRole("option", { name: new RegExp("^" + label) }).click();
  await expect(heading(page, label)).toBeVisible();
}

test("the map loads and the status chip counts the stub's aircraft", async ({ page }) => {
  await openMap(page);
  await expect(count(page, `${COUNT} ac`)).toBeVisible();
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
});

test("search by callsign, registration and hex opens the panel with the stub's values", async ({
  page,
}) => {
  await openMap(page);
  await expect(count(page, `${COUNT} ac`)).toBeVisible();

  await pick(page, "SKD303", "SKD303");
  const p = panel(page);
  for (const value of ["35,000 ft", "480 kt", "N303SD", "B77W", "A5C303", "Heavy jet"])
    await expect(p.getByText(value, { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(p).toBeHidden();

  await pick(page, "N202SD", "SKD202");
  await expect(p.getByText("24,000 ft", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(p).toBeHidden();

  await pick(page, "a5c707", "N707SD");
  await expect(p.getByText("Helicopter", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(p).toBeHidden();

  // Not in the view: Enter asks the server, which asks the stub's search endpoints.
  await searchBox(page).fill("SKD999");
  await searchBox(page).press("Enter");
  await expect(heading(page, "SKD999")).toBeVisible();
  await expect(p.getByText("A5C999", { exact: true })).toBeVisible();
});

test("the route comes from the stub's route lookup", async ({ page }) => {
  await openMap(page);
  await pick(page, "SKD101", "SKD101");
  // The airport codes also appear in the terrain profile under the route, so take the first of each.
  await expect(panel(page).getByText("JFK", { exact: true }).first()).toBeVisible();
  await expect(panel(page).getByText("BOS", { exact: true }).first()).toBeVisible();
});

test("the ruler starts at the selected aircraft and a map click finishes the measurement", async ({
  page,
}) => {
  await openMap(page);
  // Wait for the stub's 7700 aircraft: the emergency banner shares the ruler bar's row and used to cover its buttons.
  await expect(page.getByRole("alert").filter({ hasText: "Emergency squawk" })).toBeVisible({
    timeout: 30_000,
  });
  const ruler = page.getByRole("button", { name: "Measure distance" });
  const startAtAircraft = page.getByRole("button", { name: "Start at the selected aircraft" });

  // With nothing selected the ruler only asks for a start point.
  await ruler.click();
  await expect(page.getByText("Click a start point", { exact: true })).toBeVisible();
  await expect(startAtAircraft).toHaveCount(0);

  await pick(page, "SKD303", "SKD303");
  await startAtAircraft.click();
  await expect(page.getByText("Click a second point", { exact: true })).toBeVisible();
  await expect(startAtAircraft).toHaveCount(0);

  // The second point is an ordinary map click; the readout then shows distance and bearing.
  const map = page.locator("canvas.maplibregl-canvas");
  const box = await map.boundingBox();
  if (!box) throw new Error("map canvas has no size");
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.7);
  await expect(page.getByRole("status").getByText(/ · \d{3}° [NESW]{1,3}$/)).toBeVisible();

  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByText("Click a start point", { exact: true })).toBeVisible();
  await expect(startAtAircraft).toBeVisible();
});

test("N and P step through the aircraft in callsign order", async ({ page }) => {
  await openMap(page);
  await expect(count(page, `${COUNT} ac`)).toBeVisible();
  // Sorted: KNGT91, N505SD, N606SD, N707SD, N808SD, N912SD, SKD101, SKD110, SKD202, SKD303, SKD404, SKD711.
  for (const [key, name] of [
    ["n", "KNGT91"],
    ["n", "N505SD"],
    ["p", "KNGT91"],
    ["p", "SKD711"],
  ] as const) {
    await page.keyboard.press(key);
    await expect(heading(page, name)).toBeVisible();
  }
});

test("filters reduce the count and the CSV holds the aircraft shown", async ({ page }) => {
  await openMap(page);
  await expect(count(page, `${COUNT} ac`)).toBeVisible();
  await page.getByRole("button", { name: "Filters" }).click();

  await page.getByRole("switch", { name: "Hide ground traffic" }).click();
  await expect(count(page, `${COUNT - 1}/${COUNT} ac`)).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: `Download the ${COUNT - 1} aircraft shown (CSV)` }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^skydeck-aircraft-.*\.csv$/);
  const lines = (await readFile(await download.path(), "utf8"))
    .trim()
    .split("\n")
    .filter((l) => !l.startsWith("#"));
  expect(lines[0]).toBe(
    "icao_hex,callsign,registration,type,category,operator,latitude,longitude,altitude_ft,ground_speed_kt,track_deg,vertical_rate_fpm,squawk,on_ground",
  );
  const hexes = lines.slice(1).map((l) => l.split(",")[0]);
  expect(hexes.sort()).toEqual(ALL_HEX.filter((h) => h !== GROUND_HEX).sort());
  expect(lines.find((l) => l.startsWith("A5C303,"))).toContain(",SKD303,N303SD,B77W,");

  await page.getByRole("switch", { name: /^Emergency squawks only/ }).click();
  await expect(count(page, `1/${COUNT} ac`)).toBeVisible();
});

test("changing the units in Settings changes the panel's altitude and speed", async ({ page }) => {
  await openMap(page);
  await pick(page, "SKD303", "SKD303");
  const p = panel(page);
  await expect(p.getByText("35,000 ft", { exact: true })).toBeVisible();
  await expect(p.getByText("480 kt", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByRole("radio", { name: "Metric" }).click();
  await page.keyboard.press("Escape");
  await expect(settings).toBeHidden();
  await expect(p.getByText("10,668 m", { exact: true })).toBeVisible();
  await expect(p.getByText("889 km/h", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await settings.getByRole("radio", { name: "Imperial" }).click();
  await page.keyboard.press("Escape");
  await expect(p.getByText("35,000 ft", { exact: true })).toBeVisible();
  await expect(p.getByText("552 mph", { exact: true })).toBeVisible();
});

test("watchlist: watch, survive a reload, remove; recently viewed lists what was opened", async ({
  page,
}) => {
  await openMap(page);
  await pick(page, "SKD202", "SKD202");
  await panel(page).getByRole("button", { name: "Watch this aircraft" }).click();
  await expect(panel(page).getByRole("button", { name: "Watching this aircraft" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("Escape");

  const dialog = page.getByRole("dialog", { name: "Watchlist" });
  const watched = dialog.getByRole("region", { name: "Watched items" });
  const item = watched.getByRole("button", { name: "Show Aircraft N202SD" });
  await page.getByRole("button", { name: "Watchlist, 1 items" }).click();
  await expect(item).toBeVisible();
  await expect(dialog.getByRole("region", { name: "Recently viewed flights" })).toContainText(
    "SKD202",
  );

  await page.reload();
  await expect(page.getByText("Live", { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Watchlist, 1 items" }).click();
  await expect(item).toBeVisible();
  await expect(dialog.getByRole("region", { name: "Recently viewed flights" })).toContainText(
    "SKD202",
  );
  await watched.getByRole("button", { name: "Stop watching N202SD" }).click();
  await expect(item).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Watchlist", exact: true })).toBeVisible();
});

test("saved views: save, go to and delete", async ({ page }) => {
  const latLon = () => {
    const p = new URL(page.url()).searchParams;
    return [Number(p.get("lat")), Number(p.get("lon"))];
  };
  await openMap(page, "/?lat=40.72&lon=-73.95&z=9");
  await expect(count(page, `${COUNT} ac`)).toBeVisible();
  await page.getByRole("button", { name: "Saved views" }).click();
  await page.getByRole("textbox", { name: "Name for the saved view" }).fill("Harbour");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Harbour", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/?lat=42.36&lon=-71.01&z=8");
  await expect(page.getByText("Live", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect.poll(latLon).toEqual([42.36, -71.01]);
  await page.getByRole("button", { name: "Saved views" }).click();
  await page.getByRole("button", { name: "Harbour", exact: true }).click();
  // Back at the saved view (40.72, -73.95), within the rounding the address uses.
  await expect
    .poll(
      () => {
        const [lat, lon] = latLon();
        return Math.abs(lat - 40.72) < 0.02 && Math.abs(lon + 73.95) < 0.02;
      },
      { timeout: 15_000 },
    )
    .toBe(true);

  await page.getByRole("button", { name: "Saved views" }).click();
  await page.getByRole("button", { name: "Delete saved view Harbour" }).click();
  await expect(page.getByRole("button", { name: "Harbour", exact: true })).toHaveCount(0);
  await expect(page.getByText(/^Saved views stay in this browser/)).toBeVisible();
});

test("the address carries the selected aircraft and reopening it selects it again", async ({
  page,
  context,
}) => {
  await openMap(page);
  await pick(page, "SKD101", "SKD101");
  await expect.poll(() => new URL(page.url()).searchParams.get("hex")).toBe("a5c101");

  const second = await context.newPage();
  // A slow device: the shared selection used to be lost when the heavy first render kept being interrupted.
  const cdp = await context.newCDPSession(second);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
  await second.goto(page.url());
  await expect(second.getByText("Live", { exact: true })).toBeVisible({ timeout: 30_000 });
  // Passes alone every time; with two workers on one dev server the panel can take more than one feed cycle to show.
  await expect(heading(second, "SKD101")).toBeVisible({ timeout: 30_000 });
});

test("alert rules: plain English and the form both make rules that fit the stub data", async ({
  page,
}) => {
  await openMap(page);
  await expect(count(page, `${COUNT} ac`)).toBeVisible();
  await page.getByRole("button", { name: "Watchlist", exact: true }).click();
  await page.getByRole("button", { name: /^Alert rules/ }).click();
  const rules = page.getByRole("dialog", { name: "Alert rules" });
  const conditions = rules.getByRole("region", { name: "Rule conditions" });
  const yours = rules.getByRole("region", { name: "Your rules" });

  await rules.getByLabel("Describe it in plain English").fill("helicopter below 3,000 ft");
  await rules.getByRole("button", { name: "Understand" }).click();
  await expect(conditions.getByRole("checkbox", { name: "Helicopter" })).toBeChecked();
  await expect(conditions.getByLabel("Below (ft)")).toHaveValue("3000");
  // Only N707SD (a helicopter at 1,200 ft).
  await expect(conditions).toContainText("1 aircraft match this right now.");
  await rules.getByRole("button", { name: "Create rule" }).click();
  await expect(yours.getByRole("listitem")).toHaveCount(1);
  await expect(yours.getByRole("listitem").first()).toContainText("1 matching now");

  await conditions.getByRole("checkbox", { name: "Heavy jet" }).check();
  await conditions.getByLabel("Above (ft)").fill("30000");
  // Only SKD303 (a heavy jet at 35,000 ft).
  await expect(conditions).toContainText("1 aircraft match this right now.");
  await rules.getByRole("button", { name: "Create rule" }).click();
  await expect(yours.getByRole("listitem")).toHaveCount(2);
  await expect(yours.getByRole("listitem").nth(1)).toContainText("1 matching now");
});

test("opening aircraft adds their types to the collection", async ({ page }) => {
  await openMap(page);
  await pick(page, "SKD303", "SKD303");
  await pick(page, "N707SD", "N707SD");
  await page.getByRole("button", { name: "Collection", exact: true }).click();
  const types = page
    .getByRole("dialog", { name: "Collection" })
    .getByRole("region", { name: "Types collected" });
  await expect(types).toContainText("B77W");
  await expect(types).toContainText("EC35");
});

test("the emergency banner appears for the 7700 aircraft and opens it", async ({ page }) => {
  await openMap(page);
  // An emergency code is shown once it was seen in two updates at least 5 s apart.
  const banner = page.getByRole("alert").filter({ hasText: "Emergency squawk" });
  await expect(banner).toBeVisible({ timeout: 30_000 });
  await banner.getByRole("button", { name: /^SKD711 · 7700/ }).click();
  await expect(heading(page, "SKD711")).toBeVisible();
});

test("clean view (K) hides the tools, Escape brings them back, ? lists the shortcuts", async ({
  page,
}) => {
  await openMap(page);
  await expect(count(page, `${COUNT} ac`)).toBeVisible();
  const settings = page.getByRole("button", { name: "Settings", exact: true });

  await page.keyboard.press("k");
  await expect(settings).toBeHidden();
  await expect(searchBox(page)).toBeHidden();
  await expect(page.getByRole("button", { name: "Exit clean view (K or Esc)" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(settings).toBeVisible();
  await expect(searchBox(page)).toBeVisible();

  await page.keyboard.press("?");
  const help = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(help).toBeVisible();
  await expect(help).toContainText("Select the next aircraft");
});

test("the first-run guide shows once, can be skipped and does not come back", async ({ page }) => {
  await page.goto("/");
  const guide = page.getByRole("dialog", { name: "The live map" });
  await expect(guide).toBeVisible();
  await expect(guide).toContainText("Quick guide · 1 of 5");
  await guide.getByRole("button", { name: "Skip" }).click();
  await expect(guide).toBeHidden();

  await page.reload();
  await expect(count(page, `${COUNT} ac`)).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("the replay bar opens from History and Back to live returns", async ({ page }) => {
  test.setTimeout(90_000);
  await openMap(page);
  const history = page.getByRole("button", { name: "Replay the last minutes" });
  // Replay needs about 20 s of recording.
  await expect(history).toBeEnabled({ timeout: 60_000 });
  await history.click();
  const bar = page.getByRole("region", { name: "Replay" });
  await expect(bar).toBeVisible();
  await expect(page.getByText("Replay", { exact: true }).first()).toBeVisible();
  await bar.getByRole("button", { name: "Back to live" }).click();
  await expect(bar).toBeHidden();
  await expect(history).toBeVisible();
});

test(
  "provider failure shows the busy notice and recovers",
  { tag: "@failure" },
  async ({ page, request }) => {
    test.setTimeout(120_000);
    await openMap(page);
    await expect(count(page, `${COUNT} ac`)).toBeVisible();
    const notice = page.getByText("Live data is busy. Retrying…", { exact: true });
    try {
      expect((await request.get(`${STUB}/__stub/fail?status=500`)).ok()).toBe(true);
      await expect(notice).toBeVisible({ timeout: 45_000 });
      await expect(page.getByText("Delayed", { exact: true })).toBeVisible();
      expect((await request.get(`${STUB}/__stub/fail?status=0`)).ok()).toBe(true);
      // The page backs off after a failure, so the next try can be up to 14 s away.
      await expect(notice).toBeHidden({ timeout: 60_000 });
      await expect(page.getByText("Live", { exact: true })).toBeVisible();
    } finally {
      await request.get(`${STUB}/__stub/fail?status=0`);
    }
  },
);

test(
  "phone: choosing an aircraft opens the bottom sheet, the handle opens and closes it",
  { tag: "@phone" },
  async ({ page }) => {
    await openMap(page);
    await searchBox(page).fill("SKD303");
    await page.getByRole("option", { name: /^SKD303/ }).click();
    const sheet = page.getByRole("region", { name: "Aircraft details" });
    await expect(sheet.getByRole("heading", { name: "SKD303" })).toBeVisible();
    await expect(panel(page)).toBeHidden();

    const handle = sheet.getByRole("button", { name: "Toggle details" });
    await expect(handle).toHaveAttribute("aria-expanded", "false");
    await expect(sheet.getByText("35,000 ft", { exact: true })).toBeVisible();
    await handle.click();
    await expect(handle).toHaveAttribute("aria-expanded", "true");
    // "Ground speed" is both a summary label and a row label in the open sheet; the first is enough.
    await expect(sheet.getByText("Ground speed", { exact: true }).first()).toBeVisible();
    await handle.click();
    await expect(handle).toHaveAttribute("aria-expanded", "false");
    await expect(sheet.getByText("Ground speed", { exact: true }).first()).toBeHidden();
  },
);
