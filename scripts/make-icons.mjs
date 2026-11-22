// Renders every app icon from public/icon.svg: favicon.ico (16, 32, 48), the PWA icons and the Apple touch icon.
// Run:  node scripts/make-icons.mjs     (needs the Playwright Chromium headless shell that e2e already uses)
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { chromium } = createRequire(join(root, "package.json"))("@playwright/test");
const svg = readFileSync(join(root, "public/icon.svg"), "utf8");

// Platforms that cut their own shape (iOS, Android maskable) get a full square; maskable also keeps the plane
// inside the central safe zone.
const square = svg.replace('rx="112"', 'rx="0"');
const maskable = square.replace("scale(1.12)", "scale(0.86)");

const browser = await chromium.launch();
const page = await browser.newPage();
async function png(source, size) {
  await page.setViewportSize({ width: size, height: size });
  const data = Buffer.from(source).toString("base64");
  await page.setContent(
    `<body style="margin:0;background:transparent"><img width="${size}" height="${size}" src="data:image/svg+xml;base64,${data}"></body>`,
  );
  await page.locator("img").evaluate((img) => img.decode());
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}

const out = (name, buf) => writeFileSync(join(root, "public", name), buf);
out("icons/icon-192.png", await png(svg, 192));
out("icons/icon-512.png", await png(svg, 512));
out("icons/icon-maskable-512.png", await png(maskable, 512));
out("icons/apple-touch-icon.png", await png(square, 180));

// favicon.ico holding PNG images (supported by every current browser).
const sizes = [16, 32, 48];
const images = [];
for (const s of sizes) images.push(await png(svg, s));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((s, i) => {
  const e = 6 + 16 * i;
  header.writeUInt8(s, e);
  header.writeUInt8(s, e + 1);
  header.writeUInt16LE(1, e + 4);
  header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(images[i].length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += images[i].length;
});
out("favicon.ico", Buffer.concat([header, ...images]));

await browser.close();
console.log("icons written");
