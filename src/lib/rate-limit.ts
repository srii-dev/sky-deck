/*
 * Per-visitor rate limiting (Phase 18e). Every write endpoint asks `allow(visitorKey)` before doing work.
 * The counters live in memory of one server instance, like the provider pacing: a shared limit across
 * instances needs the shared store of Phase 18f / 19h. This is the first line of defence, not the last.
 * Pure and clock-injected so it can be tested.
 */

export interface LimitResult {
  ok: boolean;
  /** When not ok: how long until the visitor may try again, ms. */
  retryAfterMs: number;
}

export interface KeyedLimiterOptions {
  /** Requests allowed per window per visitor. */
  max: number;
  windowMs: number;
  /** Most visitors remembered at once; the oldest are forgotten first, so memory stays bounded. */
  maxKeys?: number;
}

export function createKeyedLimiter(opts: KeyedLimiterOptions) {
  const maxKeys = opts.maxKeys ?? 5000;
  const hits = new Map<string, number[]>();

  function prune(now: number) {
    for (const [key, times] of hits) {
      const recent = times.filter((t) => now - t < opts.windowMs);
      if (recent.length === 0) hits.delete(key);
      else hits.set(key, recent);
    }
    // Still too many visitors: forget the ones that were seen first.
    while (hits.size > maxKeys) {
      const first = hits.keys().next().value;
      if (first === undefined) break;
      hits.delete(first);
    }
  }

  return {
    allow(key: string, now: number): LimitResult {
      if (hits.size >= maxKeys && !hits.has(key)) {
        prune(now);
        // Make room for the new visitor by forgetting the one seen first.
        while (hits.size >= maxKeys) {
          const first = hits.keys().next().value;
          if (first === undefined) break;
          hits.delete(first);
        }
      }
      const recent = (hits.get(key) ?? []).filter((t) => now - t < opts.windowMs);
      if (recent.length >= opts.max) {
        hits.set(key, recent);
        const oldest = recent[0] ?? now;
        return { ok: false, retryAfterMs: Math.max(0, opts.windowMs - (now - oldest)) };
      }
      recent.push(now);
      hits.set(key, recent);
      return { ok: true, retryAfterMs: 0 };
    },
    size(): number {
      return hits.size;
    },
    reset() {
      hits.clear();
    },
  };
}

type HeaderGetter = (name: string) => string | undefined | null;

/**
 * A key for "this visitor" from request headers: the connecting address given by the hosting platform
 * (Cloudflare sets cf-connecting-ip), else the first address of x-forwarded-for. The address is used only as an
 * in-memory counter key: it is never logged or stored. Visitors we cannot tell apart share the key "unknown".
 */
export function visitorKey(get: HeaderGetter): string {
  const cf = get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const fwd = get("x-forwarded-for");
  const first = fwd?.split(",")[0]?.trim();
  if (first) return first;
  const real = get("x-real-ip")?.trim();
  return real || "unknown";
}
