import { DurableObject } from "cloudflare:workers";

import type { AcarsAiInput } from "../lib/acars-ai";
import type { AiRequest } from "../lib/ai-service";
import {
  aiWork,
  asWorkersAiBinding,
  buildAiService,
  pacingSnapshot,
  restorePacing,
  settle,
  type AiPacingState,
} from "../lib/ai.server";

/*
 * The shared AI service (decision 2026-11-23). One global Durable Object runs the AI service, so its daily budgets,
 * per-minute pacing, answer cache and per-message headline cache are the same for every visitor and Worker
 * instance. Workers reach it through getAiService (src/lib/ai.server.ts). Only the pacing counters (calls per
 * provider and day, provider pauses) are written to the object's storage, so the daily limits survive the object
 * being unloaded; ACARS text and AI answers stay in memory only. Exported from the Worker entry by
 * exports.cloudflare.ts.
 */
export class AiHub extends DurableObject<Record<string, unknown>> {
  private saved = "";

  constructor(ctx: ConstructorParameters<typeof DurableObject>[0], env: Record<string, unknown>) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(async () => {
      const state = await ctx.storage.get<AiPacingState>("pacing");
      if (state) restorePacing(state);
      this.saved = JSON.stringify(pacingSnapshot());
    });
  }

  /** Written only when a count or a pause changed, not on cache hits. */
  private async save() {
    const state = pacingSnapshot();
    const json = JSON.stringify(state);
    if (json === this.saved) return;
    this.saved = json;
    await this.ctx.storage.put("pacing", state);
  }

  private async run<T>(fn: () => Promise<T>) {
    const r = await settle(fn);
    await this.save();
    return r;
  }

  private work() {
    // globalThis.__env__ is not set here: bindings and secrets come from the object's own env.
    const read = (name: string) => {
      const v = this.env[name];
      return typeof v === "string" ? v : process.env[name];
    };
    const s = buildAiService(asWorkersAiBinding(this.env["AI"]), read);
    return s ? aiWork(s) : null;
  }

  async generate(req: AiRequest) {
    const w = this.work();
    return w ? this.run(() => w.generate(req)) : null;
  }

  async acarsBriefs(messages: AcarsAiInput[]) {
    const w = this.work();
    return w ? this.run(() => w.acarsBriefs(messages)) : null;
  }
}
