/*
 * Small helpers for the server-side ADS-B fetching: request coalescing and cache pruning.
 * Plain data only: nothing here holds a Response, stream or other request-bound object,
 * because on Cloudflare Workers those cannot be used from a different request.
 * State lives in module memory, so it is shared only inside one server instance (isolate).
 */

export type CacheEntry<T> = { at: number; value: T };

/** Drop expired entries once the map reaches `max`, then trim the oldest. */
export function prune<T>(
  cache: Map<string, CacheEntry<T>>,
  ttl: number,
  max: number,
  now = Date.now(),
) {
  if (cache.size < max) return;
  for (const [k, v] of cache) if (now - v.at > ttl) cache.delete(k);
  while (cache.size > max) {
    const first = cache.keys().next().value;
    if (first === undefined) break;
    cache.delete(first);
  }
}

/** Requests currently running, by cache key. Each entry is removed when its promise settles. */
const inflight = new Map<string, Promise<unknown>>();

export function resetInflight() {
  inflight.clear();
}

/**
 * Run `start` once per key at a time. A caller that arrives while the same key is running
 * waits for that same promise instead of starting another request.
 *
 * - The entry is removed when the shared promise resolves or rejects.
 * - Every caller also has its own safety timer (`maxMs`). If the shared promise never settles
 *   (for example the runtime cancelled the request that started it), the caller gets
 *   `onTimeout()` and the stuck entry is removed so the next caller starts fresh.
 * - A caller giving up never cancels the shared request or the other waiters.
 */
export function coalesce<T>(
  key: string,
  start: () => Promise<T>,
  opts: { maxMs: number; onTimeout: () => T },
): Promise<T> {
  let shared = inflight.get(key) as Promise<T> | undefined;
  if (!shared) {
    const created = start();
    shared = created;
    inflight.set(key, created);
    const clear = () => {
      if (inflight.get(key) === created) inflight.delete(key);
    };
    created.then(clear, clear);
  }
  const waitOn = shared;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (inflight.get(key) === waitOn) inflight.delete(key);
      resolve(opts.onTimeout());
    }, opts.maxMs);
    waitOn.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
