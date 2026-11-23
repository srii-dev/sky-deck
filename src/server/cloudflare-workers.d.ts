// The part of the Workers runtime module used here (no @cloudflare/workers-types dependency).
declare module "cloudflare:workers" {
  export abstract class DurableObject<Env = unknown> {
    protected ctx: unknown;
    protected env: Env;
    constructor(ctx: unknown, env: Env);
  }
}
