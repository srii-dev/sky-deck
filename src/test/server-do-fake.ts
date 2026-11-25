/*
 * A stand-in for the part of the `cloudflare:workers` module the Durable Objects use (see
 * src/server/cloudflare-workers.d.ts), so the hubs can be loaded in tests. vitest.config.ts aliases
 * `cloudflare:workers` to this file; build a hub with `new FeedHub(fakeCtx() as never, env)`.
 * The fake storage keeps every value as a structured clone, as the real one does, and records each write.
 */

export interface FakeCtx {
  storage: {
    get<T = unknown>(key: string): Promise<T | undefined>;
    put(key: string, value: unknown): Promise<void>;
  };
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
  /** What was stored, by key. */
  data: Map<string, unknown>;
  /** Every put, in order. */
  writes: { key: string; value: unknown }[];
  /** Settles when the constructor's blockConcurrencyWhile work is done. */
  ready: Promise<unknown>;
}

export function fakeCtx(initial: Record<string, unknown> = {}): FakeCtx {
  const data = new Map<string, unknown>(
    Object.entries(initial).map(([k, v]) => [k, structuredClone(v)]),
  );
  const ctx: FakeCtx = {
    data,
    writes: [],
    ready: Promise.resolve(),
    storage: {
      async get<T>(key: string) {
        return data.has(key) ? (structuredClone(data.get(key)) as T) : undefined;
      },
      async put(key: string, value: unknown) {
        const copy = structuredClone(value);
        ctx.writes.push({ key, value: copy });
        data.set(key, copy);
      },
    },
    blockConcurrencyWhile<T>(fn: () => Promise<T>) {
      const p = fn();
      ctx.ready = p;
      return p;
    },
  };
  return ctx;
}

export abstract class DurableObject<Env = unknown> {
  protected ctx: FakeCtx;
  protected env: Env;
  constructor(ctx: FakeCtx, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }
}
