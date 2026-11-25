import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAfterPaint } from "@/hooks/use-after-paint";
import { useFlag } from "@/hooks/use-flag";
import { useFlagPref } from "@/hooks/use-flag-pref";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNotifyPrefs } from "@/hooks/use-notify-prefs";
import { useShortcuts } from "@/hooks/use-shortcuts";
import type { useTheme as UseTheme } from "@/hooks/use-theme";
import { FLAGS_STORAGE_KEY } from "@/lib/flags";
import { DEFAULT_NOTIFY, NOTIFY_KEY } from "@/lib/notify-prefs";
import { THEME_KEY } from "@/lib/theme";

/* The small browser-state hooks: theme, shortcuts, breakpoints, stored preferences, flags and the after-paint gate. */

const realMatchMedia = window.matchMedia;

/** A matchMedia whose answer can be flipped, firing "change" like a browser. */
function controllableMatchMedia(initial: boolean) {
  const listeners = new Set<(e: { matches: boolean }) => void>();
  const state = { matches: initial };
  window.matchMedia = ((query: string) => ({
    get matches() {
      return state.matches;
    },
    media: query,
    addEventListener: (_: string, l: (e: { matches: boolean }) => void) => listeners.add(l),
    removeEventListener: (_: string, l: (e: { matches: boolean }) => void) => listeners.delete(l),
  })) as unknown as typeof window.matchMedia;
  return {
    listeners,
    set(m: boolean) {
      state.matches = m;
      for (const l of [...listeners]) l({ matches: m });
    },
  };
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  window.matchMedia = realMatchMedia;
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  document.documentElement.className = "";
  document.documentElement.style.colorScheme = "";
});

describe("useTheme", () => {
  // The store lives at module level and starts once, so every test gets a fresh copy of the module.
  async function freshTheme(): Promise<typeof UseTheme> {
    vi.resetModules();
    return (await import("@/hooks/use-theme")).useTheme;
  }

  it("defaults to dark and puts it on the page", async () => {
    controllableMatchMedia(false);
    const useTheme = await freshTheme();
    const { result } = renderHook(() => useTheme());
    expect(result.current).toMatchObject({ pref: "dark", resolved: "dark" });
    expect(document.documentElement.classList.contains("light")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("reads the saved choice and ignores an unknown value", async () => {
    controllableMatchMedia(true);
    localStorage.setItem(THEME_KEY, "light");
    let useTheme = await freshTheme();
    expect(renderHook(() => useTheme()).result.current.resolved).toBe("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);

    localStorage.setItem(THEME_KEY, "neon");
    useTheme = await freshTheme();
    expect(renderHook(() => useTheme()).result.current.pref).toBe("dark");
  });

  it("follows the system setting live when set to system", async () => {
    const mq = controllableMatchMedia(true);
    const useTheme = await freshTheme();
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setPref("system"));
    expect(result.current.resolved).toBe("dark");
    expect(localStorage.getItem(THEME_KEY)).toBe("system");
    act(() => mq.set(false));
    expect(result.current.resolved).toBe("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);
  });

  it("shares one store between components", async () => {
    controllableMatchMedia(false);
    const useTheme = await freshTheme();
    const a = renderHook(() => useTheme());
    const b = renderHook(() => useTheme());
    act(() => a.result.current.setPref("light"));
    expect(b.result.current.pref).toBe("light");
  });

  it("keeps the choice for this visit when storage is blocked", async () => {
    controllableMatchMedia(false);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const useTheme = await freshTheme();
    const { result } = renderHook(() => useTheme());
    expect(result.current.pref).toBe("dark");
    act(() => result.current.setPref("light"));
    expect(result.current.resolved).toBe("light");
  });
});

describe("useShortcuts", () => {
  function press(key: string, target: EventTarget = window, init: KeyboardEventInit = {}) {
    const e = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(e);
    return e;
  }

  it("hands the action to the handler and drops the browser default only when it was used", () => {
    const handler = vi.fn((a: string) => a === "search");
    renderHook(() => useShortcuts(true, handler));
    expect(press("/").defaultPrevented).toBe(true);
    expect(press("N").defaultPrevented).toBe(false);
    expect(handler.mock.calls.map((c) => c[0])).toEqual(["search", "next"]);
  });

  it("leaves unknown keys, modified keys and repeats alone", () => {
    const handler = vi.fn(() => true);
    renderHook(() => useShortcuts(true, handler));
    press("x");
    press("n", window, { ctrlKey: true });
    press("n", window, { metaKey: true });
    press("n", window, { repeat: true });
    expect(handler).not.toHaveBeenCalled();
  });

  it("stays out of text fields and open overlays", () => {
    const handler = vi.fn(() => true);
    renderHook(() => useShortcuts(true, handler));
    const input = document.createElement("input");
    document.body.append(input);
    press("n", input);
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    const inner = document.createElement("span");
    editable.append(inner);
    document.body.append(editable);
    press("n", inner);
    expect(handler).not.toHaveBeenCalled();

    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("data-state", "open");
    document.body.append(dialog);
    press("n");
    expect(handler).not.toHaveBeenCalled();
    dialog.setAttribute("data-state", "closed");
    press("n");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("uses the latest handler, and stops listening when switched off or unmounted", () => {
    const first = vi.fn(() => false);
    const second = vi.fn(() => false);
    const { rerender, unmount } = renderHook(
      ({ on, h }: { on: boolean; h: () => boolean }) => useShortcuts(on, h),
      { initialProps: { on: true, h: first } },
    );
    rerender({ on: true, h: second });
    press("t");
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith("terrain");
    rerender({ on: false, h: second });
    press("t");
    expect(second).toHaveBeenCalledTimes(1);
    rerender({ on: true, h: second });
    unmount();
    press("t");
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe("useIsMobile", () => {
  it("is false on the first render's answer for wide windows and follows resizes", () => {
    const mq = controllableMatchMedia(false);
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(1024);
    const { result, unmount } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(500);
    act(() => mq.set(true));
    expect(result.current).toBe(true);
    unmount();
    expect(mq.listeners.size).toBe(0);
  });

  it("is true right after mount on a narrow window", () => {
    controllableMatchMedia(true);
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(767);
    expect(renderHook(() => useIsMobile()).result.current).toBe(true);
  });
});

describe("useNotifyPrefs", () => {
  it("starts with everything on and reads the saved choices", () => {
    localStorage.setItem(NOTIFY_KEY, JSON.stringify({ stages: false, junk: 1 }));
    const { result } = renderHook(() => useNotifyPrefs());
    expect(result.current.prefs).toEqual({ ...DEFAULT_NOTIFY, stages: false });
  });

  it("changes one choice and stores all of them", () => {
    const { result } = renderHook(() => useNotifyPrefs());
    act(() => result.current.set("rules", false));
    act(() => result.current.set("watch", false));
    expect(result.current.prefs).toEqual({ ...DEFAULT_NOTIFY, rules: false, watch: false });
    expect(JSON.parse(localStorage.getItem(NOTIFY_KEY)!)).toEqual(result.current.prefs);
  });
});

describe("useFlagPref", () => {
  it("uses the stored value, falls back otherwise, and stores changes as 1 or 0", () => {
    localStorage.setItem("k-on", "1");
    expect(renderHook(() => useFlagPref("k-on", false)).result.current[0]).toBe(true);
    localStorage.setItem("k-bad", "yes");
    expect(renderHook(() => useFlagPref("k-bad", true)).result.current[0]).toBe(true);

    const { result } = renderHook(() => useFlagPref("k-new", true));
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
    expect(localStorage.getItem("k-new")).toBe("0");
  });

  it("rereads when the key changes", () => {
    localStorage.setItem("a", "0");
    localStorage.setItem("b", "1");
    const { result, rerender } = renderHook(({ k }: { k: string }) => useFlagPref(k, false), {
      initialProps: { k: "a" },
    });
    expect(result.current[0]).toBe(false);
    rerender({ k: "b" });
    expect(result.current[0]).toBe(true);
  });
});

describe("useFlag", () => {
  it("applies a tester's stored flag and follows changes from other tabs", () => {
    const { result } = renderHook(() => useFlag("labs"));
    expect(result.current).toBe(false);
    localStorage.setItem(FLAGS_STORAGE_KEY, "labs");
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: FLAGS_STORAGE_KEY }));
    });
    expect(result.current).toBe(true);
  });

  it("lets a stored list switch a build flag off", () => {
    localStorage.setItem(FLAGS_STORAGE_KEY, "-acars");
    expect(renderHook(() => useFlag("acars")).result.current).toBe(false);
  });
});

describe("useAfterPaint", () => {
  it("turns true one frame and one task after mount, plus the extra delay", () => {
    vi.useFakeTimers();
    const extra = vi.fn(() => 300);
    const { result, rerender } = renderHook(() => useAfterPaint(extra));
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(16)); // the frame
    act(() => vi.advanceTimersByTime(250));
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(100));
    expect(result.current).toBe(true);
    rerender();
    expect(extra).toHaveBeenCalledTimes(1);
  });

  it("does nothing after unmount", () => {
    vi.useFakeTimers();
    const raf = vi.spyOn(window, "cancelAnimationFrame");
    const { result, unmount } = renderHook(() => useAfterPaint());
    unmount();
    expect(raf).toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe(false);
  });
});
