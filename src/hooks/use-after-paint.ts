import { useEffect, useState } from "react";

/**
 * False on the first render, true once the browser has painted the page after hydration (the next frame, then the
 * next task, plus `extraDelayMs()` if given). Heavy client-only work that should not delay the first paint, such as
 * loading the map library and building the map, waits for it, so the page chrome shows first on a slow phone.
 * `extraDelayMs` is read once, after hydration, so it may use browser storage.
 */
export function useAfterPaint(extraDelayMs?: () => number): boolean {
  const [painted, setPainted] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const delay = extraDelayMs?.() ?? 0;
    const raf = requestAnimationFrame(() => {
      timer = setTimeout(() => setPainted(true), delay);
    });
    return () => {
      cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
    };
    // Read once on mount, like the rest of the first-load decisions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return painted;
}
