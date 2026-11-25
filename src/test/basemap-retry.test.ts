import { describe, expect, it, vi } from "vitest";

import {
  retryDelay,
  RETRY_FIRST_MS,
  RETRY_MAX_MS,
  watchBasemap,
  type RetryEnv,
} from "@/lib/basemap-retry";

/** A fake environment: timers run only when `tick` is called, the probe answers from `answers`. */
function fakeEnv(answers: boolean[]) {
  let now = 0;
  const timers: { at: number; fn: () => void; id: number }[] = [];
  const online = new Set<() => void>();
  let nextId = 1;
  const probes: number[] = [];
  let isOnline = true;
  const env: RetryEnv = {
    probe: vi.fn(async () => {
      probes.push(now);
      return answers.shift() ?? false;
    }),
    setTimer: (fn, ms) => {
      const id = nextId++;
      timers.push({ at: now + ms, fn, id });
      return id;
    },
    clearTimer: (id) => {
      const i = timers.findIndex((t) => t.id === id);
      if (i >= 0) timers.splice(i, 1);
    },
    addOnline: (fn) => online.add(fn),
    removeOnline: (fn) => online.delete(fn),
    isOnline: () => isOnline,
  };
  const tick = async (ms: number) => {
    const end = now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const t = timers[0];
      if (!t || t.at > end) break;
      timers.shift();
      now = t.at;
      t.fn();
      await Promise.resolve();
      await Promise.resolve();
    }
    now = end;
  };
  return {
    env,
    tick,
    probes,
    online,
    pending: () => timers.length,
    setOnline: (v: boolean) => (isOnline = v),
    fireOnline: async () => {
      for (const fn of [...online]) fn();
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

describe("basemap retry", () => {
  it("waits 10 s, doubling, up to 5 minutes", () => {
    expect(retryDelay(0)).toBe(RETRY_FIRST_MS);
    expect(retryDelay(1)).toBe(20_000);
    expect(retryDelay(3)).toBe(80_000);
    expect(retryDelay(20)).toBe(RETRY_MAX_MS);
  });

  it("checks with growing waits and switches back once, when the style answers", async () => {
    const f = fakeEnv([false, false, true]);
    const onBack = vi.fn();
    watchBasemap("https://example.test/style", onBack, f.env);
    await f.tick(9_999);
    expect(f.probes).toEqual([]);
    await f.tick(1);
    expect(f.probes).toEqual([10_000]);
    await f.tick(20_000);
    expect(f.probes).toEqual([10_000, 30_000]);
    expect(onBack).not.toHaveBeenCalled();
    await f.tick(40_000);
    expect(f.probes).toEqual([10_000, 30_000, 70_000]);
    expect(onBack).toHaveBeenCalledTimes(1);
    // Stopped: no more timers or listeners.
    expect(f.pending()).toBe(0);
    expect(f.online.size).toBe(0);
  });

  it("checks at once when the browser comes back online", async () => {
    const f = fakeEnv([true]);
    const onBack = vi.fn();
    watchBasemap("https://example.test/style", onBack, f.env);
    await f.fireOnline();
    expect(f.probes).toEqual([0]);
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(f.pending()).toBe(0);
  });

  it("does not probe while offline", async () => {
    const f = fakeEnv([true]);
    f.setOnline(false);
    const onBack = vi.fn();
    watchBasemap("https://example.test/style", onBack, f.env);
    await f.tick(10_000);
    expect(f.probes).toEqual([]);
    f.setOnline(true);
    await f.fireOnline();
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("stops for good when told to", async () => {
    const f = fakeEnv([true]);
    const onBack = vi.fn();
    const stop = watchBasemap("https://example.test/style", onBack, f.env);
    stop();
    await f.tick(RETRY_MAX_MS * 3);
    await f.fireOnline();
    expect(f.probes).toEqual([]);
    expect(onBack).not.toHaveBeenCalled();
  });
});
