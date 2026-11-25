import type { Locator, Page } from "@playwright/test";

/*
 * Measurements shared by e2e/a11y.spec.ts and the accessibility flow in e2e/flows.spec.ts (Phase 5f). Each one runs
 * inside the page; the functions are passed to `evaluate`, so they must not use anything from outside their own body.
 */

/**
 * Text under the WCAG AA contrast ratio (4.5:1, or 3:1 for large text) inside `root` (default the whole body).
 * The background is found by walking up to the first opaque one and mixing the translucent layers on the way, so text
 * on a translucent panel over the map is measured as if the map were the page background (an approximation; the map is
 * a canvas). Text over an image or gradient is skipped.
 */
function measureContrast(root: Element | null): string[] {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const rgba = (css: string): [number, number, number, number] => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0]!, d[1]!, d[2]!, d[3]! / 255];
  };
  const lum = ([r, g, b]: number[]) => {
    const f = (v: number) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
  };
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
    const top = rgba(getComputedStyle(document.documentElement).backgroundColor);
    const body = rgba(getComputedStyle(document.body).backgroundColor);
    if (top[3] > 0) base = top.slice(0, 3);
    else if (body[3] > 0) base = body.slice(0, 3);
    for (const c of layers.reverse()) base = base.map((b, i) => c[i]! * c[3] + b * (1 - c[3]));
    return base;
  };
  const out: string[] = [];
  const seen = new Set<string>();
  const walker = document.createTreeWalker(root ?? document.body, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const text = (t.textContent ?? "").trim();
    const el = t.parentElement;
    if (!text || !el || el.closest("script, style, noscript, canvas, svg")) continue;
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || parseFloat(s.opacity) === 0) continue;
    if (el.getClientRects().length === 0) continue;
    if (el.closest("[aria-hidden='true']")) continue;
    // Disabled controls are exempt from the contrast rule.
    if (el.closest(":disabled, [aria-disabled='true']")) continue;
    const bg = background(el);
    if (!bg) continue;
    const fg = rgba(s.color);
    const fgMixed = fg.slice(0, 3).map((c, i) => c * fg[3] + bg[i]! * (1 - fg[3]));
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
}

/**
 * Controls smaller than 24 by 24 CSS px (WCAG 2.2 target size, minimum) inside `root`. A control may reach the size
 * through an absolutely placed ::after or ::before (the switches and slider thumbs do). Links inside running text are
 * exempt, as WCAG allows.
 */
function measureTargets(root: Element | null): string[] {
  const out: string[] = [];
  const scope = root ?? document.body;
  const controls = scope.querySelectorAll(
    "a[href], button, [role=button], [role=switch], [role=checkbox], [role=radio], [role=tab], [role=slider], [role=option], [role=menuitem], input:not([type=hidden]), select",
  );
  const px = (v: string) => (v === "auto" ? null : parseFloat(v));
  for (const el of controls) {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden") continue;
    if (el.closest("[aria-hidden='true'], [hidden], [inert]")) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (s.display === "inline") continue;
    let w = r.width;
    let h = r.height;
    for (const pseudo of ["::after", "::before"]) {
      const p = getComputedStyle(el, pseudo);
      if (p.content === "none" || p.content === "normal" || p.position !== "absolute") continue;
      const [top, right, bottom, left] = [p.top, p.right, p.bottom, p.left].map(px);
      const he = el as HTMLElement;
      if (left != null && right != null) w = Math.max(w, he.clientWidth - left - right);
      if (top != null && bottom != null) h = Math.max(h, he.clientHeight - top - bottom);
    }
    if (w < 23.5 || h < 23.5) {
      const name = (el.getAttribute("aria-label") || (el as HTMLElement).innerText || "")
        .trim()
        .slice(0, 30);
      out.push(
        `${Math.round(w)}x${Math.round(h)} ${el.tagName.toLowerCase()}[${el.getAttribute("role") ?? ""}] "${name}"`,
      );
    }
  }
  return out;
}

export const contrastFailures = (page: Page, root?: Locator) =>
  root ? root.evaluate(measureContrast) : page.evaluate(measureContrast, null);

export const smallTargets = (page: Page, root?: Locator) =>
  root ? root.evaluate(measureTargets) : page.evaluate(measureTargets, null);

/**
 * Hovers each control inside `root` in turn and measures the text inside it: a hover colour must not make its own
 * text unreadable (a hover background once left light text on a light row). At most `limit` controls.
 */
export async function hoverContrastFailures(page: Page, root: Locator, limit = 30) {
  const controls = root.locator("button:visible, a[href]:visible, [role=option]:visible");
  const n = Math.min(await controls.count(), limit);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const c = controls.nth(i);
    if (!(await c.isEnabled().catch(() => false))) continue;
    // A control that cannot be hovered quickly (scrolled away, covered, collapsed) is skipped: waiting for each one
    // made the aircraft panel flow run past its time limit on CI.
    const hovered = await c
      .hover({ timeout: 500 })
      .then(() => true)
      .catch(() => false);
    if (!hovered) continue;
    // Colour transitions are 150 ms; wait them out so the hover colours are the ones measured.
    await page.waitForTimeout(200);
    for (const f of await c.evaluate(measureContrast).catch(() => [] as string[]))
      out.push(`on hover: ${f}`);
  }
  await page.mouse.move(0, 0);
  return out;
}
