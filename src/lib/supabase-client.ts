import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getAuthConfig } from "./auth-config.functions";

/*
 * The browser's Supabase client (Phase 18d), created on first use. It uses the public anon key from the server
 * and keeps the session in this browser's local storage (the library's default), so a visitor stays signed in
 * after a reload. Nothing here touches the service role key.
 * Returns null when the site has no Supabase configuration or on a server render.
 */

let client: Promise<SupabaseClient | null> | null = null;

/**
 * True when this browser holds a saved Supabase session (the library stores it under a key that starts with
 * "sb-" and ends with "-auth-token"). Used to decide whether to contact Supabase at page load: visitors without
 * a saved session cost nothing.
 */
export function hasStoredSession(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("sb-") && k.endsWith("-auth-token")) return true;
    }
  } catch {
    /* storage blocked */
  }
  return false;
}

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
