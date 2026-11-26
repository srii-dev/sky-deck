/*
 * Nitro runtime plugin (registered in vite.config.ts): the Worker's cron trigger runs the closed-page alert check
 * (Phase 10f) in the global PushHub Durable Object. Without the binding (dev server, tests) it does nothing.
 * The log line holds counts only, never ids, addresses or flights.
 */

interface PushHubNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { check(): Promise<unknown> };
}

/** Every two minutes. Read by vite.config.ts for the Worker's cron triggers. */
export const PUSH_CRON = "*/2 * * * *";

interface ScheduledEvent {
  controller?: { cron?: string } | undefined;
  env?: { PUSH_HUB?: PushHubNamespace; VAPID_PRIVATE_KEY?: unknown } | undefined;
}

interface Hooks {
  hook(name: "cloudflare:scheduled", fn: (e: ScheduledEvent) => Promise<void>): void;
}

export async function runScheduledPushCheck(e: ScheduledEvent): Promise<void> {
  // Other cron triggers (the daily Supabase keep-alive) are not this check.
  if (e.controller?.cron !== PUSH_CRON) return;
  const ns = e.env?.PUSH_HUB;
  if (!ns || typeof ns.idFromName !== "function") return;
  // Not set up yet: skip the call to the object (it would only answer "not-configured").
  if (typeof e.env?.VAPID_PRIVATE_KEY !== "string" || !e.env.VAPID_PRIVATE_KEY.trim()) return;
  try {
    const report = await ns.get(ns.idFromName("global")).check();
    if (typeof report === "object" && report !== null)
      console.log("[push-check]", JSON.stringify(report));
  } catch (err) {
    console.error("[push-check] failed:", err instanceof Error ? err.message : "unknown error");
  }
}

export default function pushCron(nitro: { hooks: Hooks }): void {
  nitro.hooks.hook("cloudflare:scheduled", runScheduledPushCheck);
}
