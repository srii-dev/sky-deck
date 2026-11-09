import { createServerFn } from "@tanstack/react-start";

/*
 * Tells the browser which Supabase project to talk to (Phase 18d). The project URL and the anon (publishable)
 * key are public by design: they are sent to every browser, and row-level security in the database protects the
 * data. They are read from server variables and handed over here, so no VITE_ variable is needed. The service
 * role key is a different thing: it bypasses row-level security, is never read here and must never be sent.
 * When Supabase is not configured the answer is `configured: false` and the app simply has no accounts.
 */

export interface AuthConfig {
  configured: boolean;
  url: string | null;
  anonKey: string | null;
}

export const getAuthConfig = createServerFn({ method: "GET" }).handler(
  async (): Promise<AuthConfig> => {
    const { requireConfig } = await import("./server-config.server");
    try {
      const c = requireConfig("supabase");
      return { configured: true, url: c.SUPABASE_URL, anonKey: c.SUPABASE_ANON_KEY };
    } catch {
      return { configured: false, url: null, anonKey: null };
    }
  },
);
