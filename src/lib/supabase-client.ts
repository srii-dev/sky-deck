import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getAuthConfig } from "./auth-config.functions";

/*
 * The browser's Supabase client (Phase 18d), created on first use. It uses the public anon key from the server
 * and keeps the session in this browser's local storage (the library's default), so a visitor stays signed in
 * after a reload. Nothing here touches the service role key.
 * Returns null when the site has no Supabase configuration or on a server render.
 */

let client: Promise<SupabaseClient | null> | null = null;

export function getSupabase(): Promise<SupabaseClient | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  client ??= getAuthConfig()
    .then((c) => {
      if (!c.configured || !c.url || !c.anonKey) return null;
      return createClient(c.url, c.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
    })
    .catch(() => {
      // A failed lookup can be retried by the next call.
      client = null;
      return null;
    });
  return client;
}
