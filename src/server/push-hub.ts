import { DurableObject } from "cloudflare:workers";

import type { FeedResponse } from "../lib/aircraft";
import {
  PUSH_TTL_S,
  restoreCooldowns,
  runPushCheck,
  serializeCooldowns,
  type PushCheckReport,
} from "../lib/push-alerts";
import { deletePushSubscription, loadPushData } from "../lib/push-store.server";
import { requireConfig } from "../lib/server-config.server";
import { buildPushRequest, type VapidCache } from "../lib/web-push";
import type { RuleState } from "../lib/alert-rules";

/*
 * Closed-page alerts (Phase 10f). One global Durable Object runs the scheduled check, so two overlapping cron runs
 * never send the same alert twice and the per-rule cooldowns are shared. The Worker's cron trigger
 * (src/server/push-cron.ts) calls `check()` every two minutes. Aircraft come from the shared FeedHub, so the check
 * spends the same cache and request budget as the map. Only the cooldowns (rule and aircraft code, time) are saved
 * to storage; which aircraft currently match is kept in memory. Nothing runs until the VAPID keys and the
 * service role key are set. Exported from the Worker entry by exports.cloudflare.ts.
 */

const SEND_TIMEOUT_MS = 10_000;

interface FeedHubNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { load(lat: number, lon: number, radiusNm: number): Promise<FeedResponse> };
}

export class PushHub extends DurableObject<Record<string, unknown>> {
  private state: RuleState = { matching: new Map(), lastAlert: new Map() };
  private running = false;
  private vapidCache: VapidCache = new Map();

  constructor(ctx: ConstructorParameters<typeof DurableObject>[0], env: Record<string, unknown>) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(async () => {
      this.state = restoreCooldowns(await ctx.storage.get("cooldowns"));
    });
  }

  /** Secrets come from the object's own env (globalThis.__env__ is not set inside a Durable Object). */
  private read(): Record<string, string | undefined> {
    const out: Record<string, string | undefined> = {};
    for (const name of [
      "SUPABASE_URL",
      "SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "VAPID_PUBLIC_KEY",
      "VAPID_PRIVATE_KEY",
      "VAPID_SUBJECT",
    ]) {
      const v = this.env[name];
      out[name] = typeof v === "string" ? v : process.env[name];
    }
    return out;
  }

  async check(): Promise<PushCheckReport | "not-configured" | "busy"> {
    if (this.running) return "busy";
    const env = this.read();
    let supabase: ReturnType<typeof requireConfig<"supabase">>;
    let push: ReturnType<typeof requireConfig<"push">>;
    const serviceKey = (env["SUPABASE_SERVICE_ROLE_KEY"] ?? "").trim();
    try {
      supabase = requireConfig("supabase", env);
      push = requireConfig("push", env);
    } catch {
      return "not-configured";
    }
    if (!serviceKey) return "not-configured";
    const feedNs = this.env["FEED_HUB"] as FeedHubNamespace | undefined;
    if (!feedNs || typeof feedNs.idFromName !== "function") return "not-configured";
    const feed = feedNs.get(feedNs.idFromName("global"));
    const store = { url: supabase.SUPABASE_URL, serviceKey };
    const vapid = {
      publicKey: push.VAPID_PUBLIC_KEY,
      privateKey: push.VAPID_PRIVATE_KEY,
      subject: push.VAPID_SUBJECT,
    };

    this.running = true;
    try {
      const { state, report } = await runPushCheck(this.state, {
        loadData: () => loadPushData(store),
        loadFeed: (c) => feed.load(c.lat, c.lon, c.radiusNm),
        send: async (sub, message) => {
          const req = await buildPushRequest(sub, JSON.stringify(message), vapid, {
            ttlS: PUSH_TTL_S,
            urgency: "high",
            cache: this.vapidCache,
          });
          // A push service that hangs must not hold the check (and the next one, which would answer "busy").
          const res = await fetch(req.url, {
            ...req.init,
            signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
          });
          // The body is not needed; drop it so the connection is released.
          await res.body?.cancel();
          return res.status;
        },
        deleteSubscription: (userId, endpoint) => deletePushSubscription(store, userId, endpoint),
        now: () => Date.now(),
      });
      this.state = state;
      await this.ctx.storage.put("cooldowns", serializeCooldowns(state));
      return report;
    } finally {
      this.running = false;
    }
  }
}
