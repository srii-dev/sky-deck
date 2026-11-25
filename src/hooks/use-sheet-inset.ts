import { useEffect, type RefObject } from "react";

/**
 * Phone bottom sheets (aircraft and airport panels) cover the bottom of the map, where MapLibre keeps the zoom and
 * compass buttons, the scale and the map credit. While a sheet is shown, this publishes its height as `--sheet-h` on
 * the root element; styles.css lifts the bottom-right map controls by that much on phones, and hides them while
 * `data-sheet-tall` says the open sheet leaves no room above it (design QA 15h).
 *
 * From the md breakpoint up the panels are side panels that leave the controls alone, so the height counts as 0 there.
 */
export function useSheetInset(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const phone = window.matchMedia("(max-width: 767.98px)");
    const update = () => {
      const h = phone.matches ? el.getBoundingClientRect().height : 0;
      root.style.setProperty("--sheet-h", `${Math.round(h)}px`);
      // The controls need about 200 px above the sheet and below the top bar.
      root.toggleAttribute("data-sheet-tall", h > 0 && h > window.innerHeight - 360);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    phone.addEventListener("change", update);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      phone.removeEventListener("change", update);
      window.removeEventListener("resize", update);
      root.style.removeProperty("--sheet-h");
      root.removeAttribute("data-sheet-tall");
    };
  }, [ref]);
}
