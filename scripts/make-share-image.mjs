// Draws the 1200 x 630 share image (public/og-image.png) from the project's own design: the dark theme colours of
// src/styles.css, the self-hosted fonts in public/fonts, the plane mark (the Lucide "plane" outline the site header
// uses) and the app name and tagline from src/config/brand.ts. No map tiles, no screenshots, no live data, nothing downloaded.
// The picture is deterministic: the same files give the same image.
// Run:  node scripts/make-share-image.mjs     (needs the Playwright Chromium headless shell that e2e already uses)
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { chromium } = createRequire(join(root, "package.json"))("@playwright/test");

const brand = readFileSync(join(root, "src/config/brand.ts"), "utf8");
const pick = (name) => brand.match(new RegExp(`${name}\\s*=\\s*"([^"]+)"`))?.[1];
const APP_NAME = pick("APP_NAME");
const APP_TAGLINE = pick("APP_TAGLINE");
if (!APP_NAME || !APP_TAGLINE) throw new Error("brand.ts: APP_NAME or APP_TAGLINE not found");

const font = (file) =>
  `data:font/woff2;base64,${readFileSync(join(root, "public/fonts", file)).toString("base64")}`;
const PLANE =
  "M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z";

// Altitude colours of the map legend (src/lib/aircraft.ts), low to high.
const ALT = ["#f0643c", "#f5a623", "#c6e046", "#3fd3a5", "#3fb7f0", "#6d84ff"];

// Great-circle-looking arcs: [x0, y0, x1, y1, lift, colour index, plane position 0..1, plane size]. Fixed numbers.
const ARCS = [
  [640, 560, 1160, 330, 150, 4, 0.62, 54],
  [700, 120, 1180, 470, 120, 5, 0.34, 46],
  [690, 430, 1110, 90, 170, 3, 0.74, 50],
  [820, 590, 1190, 560, 70, 1, 0.5, 38],
  [610, 250, 960, 40, 90, 2, 0.4, 40],
];

function arc([x0, y0, x1, y1, lift, ci, t, size]) {
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2 - lift;
  const at = (u) => ({
    x: (1 - u) ** 2 * x0 + 2 * (1 - u) * u * mx + u ** 2 * x1,
    y: (1 - u) ** 2 * y0 + 2 * (1 - u) * u * my + u ** 2 * y1,
  });
  const p = at(t);
  const q = at(t + 0.01);
  const heading = (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI + 45; // the icon points up and to the right
  const s = size / 24;
  return `
    <path d="M${x0} ${y0} Q${mx} ${my} ${x1} ${y1}" fill="none" stroke="${ALT[ci]}" stroke-opacity="0.55" stroke-width="3" stroke-dasharray="2 12" stroke-linecap="round"/>
    <circle cx="${x0}" cy="${y0}" r="5" fill="${ALT[ci]}" fill-opacity="0.8"/>
    <g transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${heading.toFixed(1)}) scale(${s}) translate(-12 -12)">
      <path d="${PLANE}" fill="${ALT[ci]}" stroke="oklch(0.15 0.018 240)" stroke-width="1" stroke-linejoin="round"/>
    </g>`;
}

const grid = Array.from(
  { length: 13 },
  (_, i) => `<line x1="${i * 100}" y1="0" x2="${i * 100}" y2="630" />`,
)
  .concat(
    Array.from(
      { length: 7 },
      (_, i) => `<line x1="0" y1="${i * 105}" x2="1200" y2="${i * 105}" />`,
    ),
  )
  .join("");

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: "Chakra Petch"; font-weight: 700; src: url(${font("chakra-petch-700-latin.woff2")}) format("woff2"); }
@font-face { font-family: "Chakra Petch"; font-weight: 500; src: url(${font("chakra-petch-500-latin.woff2")}) format("woff2"); }
@font-face { font-family: "JetBrains Mono"; font-weight: 400; src: url(${font("jetbrains-mono-400-latin.woff2")}) format("woff2"); }
html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
body { background: oklch(0.15 0.018 240); color: oklch(0.93 0.012 220); position: relative; }
.glow { position: absolute; inset: 0; background:
  radial-gradient(60% 80% at 82% 45%, oklch(0.28 0.05 230 / 0.55), transparent 70%),
  radial-gradient(40% 50% at 12% 100%, oklch(0.3 0.06 75 / 0.25), transparent 70%); }
svg.bg { position: absolute; inset: 0; }
svg.grid line { stroke: oklch(0.32 0.025 235 / 0.35); stroke-width: 1; }
.copy { position: absolute; left: 96px; top: 150px; width: 620px; }
.mark { display: flex; align-items: center; gap: 22px; }
.badge { width: 92px; height: 92px; border-radius: 22px; background: oklch(0.19 0.02 240); border: 2px solid oklch(0.32 0.025 235); display: grid; place-items: center; }
h1 { margin: 0; font: 700 96px/1 "Chakra Petch", sans-serif; letter-spacing: 0.01em; color: oklch(0.82 0.16 75); }
.tag { margin-top: 30px; font: 500 40px/1.15 "Chakra Petch", sans-serif; color: oklch(0.93 0.012 220); }
.sub { margin-top: 26px; font: 400 24px/1.5 "JetBrains Mono", monospace; color: oklch(0.68 0.025 225); }
.legend { position: absolute; left: 96px; bottom: 62px; display: flex; gap: 0; width: 360px; height: 10px; border-radius: 5px; overflow: hidden; }
.legend span { flex: 1; }
.legend-label { position: absolute; left: 96px; bottom: 80px; font: 400 18px "JetBrains Mono", monospace; color: oklch(0.68 0.025 225); letter-spacing: 0.12em; }
</style></head><body>
<div class="glow"></div>
<svg class="bg grid" width="1200" height="630" viewBox="0 0 1200 630">${grid}</svg>
<svg class="bg" width="1200" height="630" viewBox="0 0 1200 630">${ARCS.map(arc).join("")}</svg>
<div class="copy">
  <div class="mark">
    <div class="badge"><svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="oklch(0.82 0.16 75)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${PLANE}"/></svg></div>
    <h1>${APP_NAME}</h1>
  </div>
  <div class="tag">${APP_TAGLINE}</div>
  <div class="sub">Live ADS-B aircraft on a free<br>3D map. Weather, airports, replay.</div>
</div>
<div class="legend-label">ALTITUDE</div>
<div class="legend">${ALT.map((c) => `<span style="background:${c}"></span>`).join("")}</div>
</body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  writeFileSync(join(root, "public/og-image.png"), await page.screenshot({ type: "png" }));
  console.log("wrote public/og-image.png");
} finally {
  await browser.close();
}
