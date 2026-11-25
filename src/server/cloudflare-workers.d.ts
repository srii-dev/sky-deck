// The part of the Workers runtime module used here (no @cloudflare/workers-types dependency).
declare module "cloudflare:workers" {
  interface DurableObjectState {
    storage: {
      get<T = unknown>(key: string): Promise<T | undefined>;
      put(key: string, value: unknown): Promise<void>;
      /** Several keys in one atomic write (at most 128). */
      put(entries: Record<string, unknown>): Promise<void>;
    };
    blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
  }
  export abstract class DurableObject<Env = unknown> {
    protected ctx: DurableObjectState;
    protected env: Env;
    constructor(ctx: DurableObjectState, env: Env);
  }
}
