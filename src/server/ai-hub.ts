import { DurableObject } from "cloudflare:workers";

import type { AcarsAiInput } from "../lib/acars-ai";
import type { AiRequest } from "../lib/ai-service";
import { aiWork, asWorkersAiBinding, buildAiService, settle } from "../lib/ai.server";

/*
 * The shared AI service (decision 2026-11-23). One global Durable Object runs the AI service, so its daily budgets,
 * per-minute pacing, answer cache and per-message headline cache are the same for every visitor and Worker
 * instance. Workers reach it through getAiService (src/lib/ai.server.ts). Nothing is written to the object's
 * storage: ACARS text and AI answers stay in memory only. Exported from the Worker entry by exports.cloudflare.ts.
 */
export class AiHub extends DurableObject<Record<string, unknown>> {
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
    return w ? settle(() => w.generate(req)) : null;
  }

  async acarsBriefs(messages: AcarsAiInput[]) {
    const w = this.work();
    return w ? settle(() => w.acarsBriefs(messages)) : null;
  }
}
