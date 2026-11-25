import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSheetInset } from "@/hooks/use-sheet-inset";

/** Design QA 15h: phone bottom sheets lift the map's bottom-right controls by their height. */

let resize: (() => void) | null = null;

function setup(phone: boolean, height: number, innerHeight = 812) {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(cb: () => void) {
        resize = cb;
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: phone,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal("innerHeight", innerHeight);
  const el = document.createElement("section");
  el.getBoundingClientRect = () => ({ height }) as DOMRect;
  return { current: el };
}

afterEach(() => {
  vi.unstubAllGlobals();
  resize = null;
});

describe("useSheetInset", () => {
  it("publishes the sheet height on phones and clears it on unmount", () => {
    const ref = setup(true, 260);
    const { unmount } = renderHook(() => useSheetInset(ref));
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--sheet-h")).toBe("260px");
    expect(root.hasAttribute("data-sheet-tall")).toBe(false);
    unmount();
    expect(root.style.getPropertyValue("--sheet-h")).toBe("");
  });

  it("marks a sheet pulled up too far as tall", () => {
    const ref = setup(true, 260);
    renderHook(() => useSheetInset(ref));
    ref.current.getBoundingClientRect = () => ({ height: 568 }) as DOMRect;
    resize?.();
    expect(document.documentElement.hasAttribute("data-sheet-tall")).toBe(true);
  });

  it("measures the room left against the published top bar height", () => {
    // 812 - 120 - 200 = 492: a 500 px sheet is tall under a 120 px top bar, but not under the 60 px one.
    const ref = setup(true, 500);
    ref.current.style.setProperty("--hud-h", "120px");
    renderHook(() => useSheetInset(ref));
    expect(document.documentElement.hasAttribute("data-sheet-tall")).toBe(true);
    ref.current.style.setProperty("--hud-h", "60px");
    resize?.();
    expect(document.documentElement.hasAttribute("data-sheet-tall")).toBe(false);
  });

  it("counts as 0 from the md breakpoint up, where the panel is a side panel", () => {
    const ref = setup(false, 500);
    renderHook(() => useSheetInset(ref));
    expect(document.documentElement.style.getPropertyValue("--sheet-h")).toBe("0px");
    expect(document.documentElement.hasAttribute("data-sheet-tall")).toBe(false);
  });
});
