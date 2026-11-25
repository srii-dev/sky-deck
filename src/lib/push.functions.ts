import { createServerFn } from "@tanstack/react-start";

/*
 * Tells the browser whether closed-page alerts (web push, Phase 10f) are set up, and the VAPID public key it needs
 * to subscribe. The public key is public by design (every subscribing browser receives it); the private key never
 * leaves the server. Without the keys or the service role key the answer is `configured: false` and the page does
 * not offer the switch.
 */

export interface PushConfig {
  configured: boolean;
  publicKey: string | null;
}

export const getPushConfig = createServerFn({ method: "GET" }).handler(
  async (): Promise<PushConfig> => {
    const { requireConfig } = await import("./server-config.server");
    try {
      requireConfig("supabase");
      const c = requireConfig("push");
      if (!(process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "").trim())
        throw new Error("no service key");
      return { configured: true, publicKey: c.VAPID_PUBLIC_KEY };
    } catch {
      return { configured: false, publicKey: null };
    }
  },
);
