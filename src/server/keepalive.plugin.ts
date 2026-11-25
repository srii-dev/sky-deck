// Nitro runtime plugin: runs the Supabase keep-alive when the Worker's cron trigger fires
// (vite.config.ts, `triggers.crons`). See src/lib/supabase-keepalive.server.ts.
import { definePlugin } from "nitro";
import { KEEPALIVE_CRON, runSupabaseKeepalive } from "../lib/supabase-keepalive.server";

export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook("cloudflare:scheduled", async ({ controller, env }) => {
    if (controller.cron !== KEEPALIVE_CRON) return;
    await runSupabaseKeepalive(env);
  });
});
