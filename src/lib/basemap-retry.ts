/*
 * After the map falls back to a plain background (the basemap style could not be fetched), keep checking quietly
 * whether the style is back: after a growing wait, and at once when the browser comes back online. Only a successful
 * fetch of the style counts, so the map is switched back once, and never cleared just to fail again.
 */

/** Waits between checks: 10 s, doubling, at most 5 minutes. */
export const RETRY_FIRST_MS = 10_000;
export const RETRY_MAX_MS = 5 * 60_000;
/** A check that has not answered by then counts as failed, so a hung request cannot stall the watch. */
export const PROBE_TIMEOUT_MS = 10_000;

export function retryDelay(attempt: number): number {
  return Math.min(RETRY_MAX_MS, RETRY_FIRST_MS * 2 ** Math.max(0, attempt));
}

export interface RetryEnv {
  /** True when the style answers with a usable response. */
  probe: (url: string, signal: AbortSignal) => Promise<boolean>;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (id: unknown) => void;
  addOnline: (fn: () => void) => void;
  removeOnline: (fn: () => void) => void;
  isOnline: () => boolean;
}

export function browserRetryEnv(): RetryEnv {
  return {
    probe: async (url, signal) => {
      try {
        const res = await fetch(url, { cache: "no-store", signal });
        return res.ok;
      } catch {
        return false;
      }
    },
    setTimer: (fn, ms) => window.setTimeout(fn, ms),
    clearTimer: (id) => window.clearTimeout(id as number),
    addOnline: (fn) => window.addEventListener("online", fn),
    removeOnline: (fn) => window.removeEventListener("online", fn),
    isOnline: () => navigator.onLine !== false,
  };
}

/**
 * Checks `url` until it answers, then calls `onBack` once. Returns a function that stops the checks (a basemap change,
 * the map going away).
 */
export function watchBasemap(url: string, onBack: () => void, env: RetryEnv): () => void {
  let attempt = 0;
  let timer: unknown;
  let stopped = false;
  let checking: AbortController | null = null;

  const schedule = () => {
    if (stopped) return;
    if (timer !== undefined) env.clearTimer(timer);
    timer = env.setTimer(check, retryDelay(attempt));
  };

  const check = async () => {
    timer = undefined;
    if (stopped || checking) return;
    if (!env.isOnline()) {
      // Wait for the online event, with the timer as a backstop in case it never fires.
      attempt += 1;
      schedule();
      return;
    }
    const controller = new AbortController();
    checking = controller;
    const ok = await new Promise<boolean>((resolve) => {
      const timeout = env.setTimer(() => {
        controller.abort();
        resolve(false);
      }, PROBE_TIMEOUT_MS);
      const settle = (v: boolean) => {
        env.clearTimer(timeout);
        resolve(v);
      };
      env.probe(url, controller.signal).then(settle, () => settle(false));
    });
    if (checking === controller) checking = null;
    if (stopped) return;
    if (ok) {
      stop();
      onBack();
      return;
    }
    attempt += 1;
    schedule();
  };

  const onOnline = () => {
    if (timer !== undefined) env.clearTimer(timer);
    timer = undefined;
    void check();
  };

  const stop = () => {
    stopped = true;
    if (timer !== undefined) env.clearTimer(timer);
    timer = undefined;
    checking?.abort();
    checking = null;
    env.removeOnline(onOnline);
  };

  env.addOnline(onOnline);
  schedule();
  return stop;
}
