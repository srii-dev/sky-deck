import { useCallback, useEffect, useRef, useState } from "react";

import type { AuthStatus } from "@/hooks/use-auth";
import type { AlertRule } from "@/lib/alert-rules";
import {
  clearPushRules,
  currentSubscription,
  deleteSubscription,
  isSubscriptionSaved,
  pushSupported,
  saveSubscription,
  subscribeBrowser,
  syncPushRules,
  unsubscribeBrowser,
} from "@/lib/push-client";
import { getPushConfig } from "@/lib/push.functions";
import { getSupabase } from "@/lib/supabase-client";

/*
 * Closed-page alerts (Phase 10f): the switch in the Alert rules dialog. While it is on, this browser is saved to the
 * signed-in account and the account's push rules follow this browser's rules (those with an area). Nothing is asked
 * of the server until the dialog opens. Signing out unsubscribes this browser, so it stops getting the account's
 * alerts (the server deletes the row after the push service refuses the next push).
 */

export type PushStatus =
  "loading" | "unsupported" | "unavailable" | "signed-out" | "off" | "on" | "working" | "denied";

export interface PushAlertsApi {
  status: PushStatus;
  /** A sentence for the person when something went wrong. */
  error: string | null;
  enable(): Promise<void>;
  disable(): Promise<void>;
}

const SYNC_DELAY_MS = 1500;

export function usePushAlerts(opts: {
  /** Start asking the server only once the dialog has been opened. */
  active: boolean;
  authStatus: AuthStatus;
  userId: string | null;
  rules: readonly AlertRule[];
}): PushAlertsApi {
  const { active, authStatus, userId, rules } = opts;
  const [status, setStatus] = useState<PushStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const rulesRef = useRef(rules);
  rulesRef.current = rules;

  // Work out the state once the dialog has opened and whenever the account changes.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void (async () => {
      if (!pushSupported()) return setStatus("unsupported");
      const config = await getPushConfig().catch(() => null);
      if (cancelled) return;
      if (!config?.configured || !config.publicKey) return setStatus("unavailable");
      setPublicKey(config.publicKey);
      if (authStatus !== "signed-in" || !userId) return setStatus("signed-out");
      if (Notification.permission === "denied") return setStatus("denied");
      const keys = await currentSubscription();
      const sb = await getSupabase();
      if (cancelled) return;
      const saved = keys && sb ? await isSubscriptionSaved(sb, keys.endpoint) : false;
      if (!cancelled) setStatus(saved ? "on" : "off");
    })();
    return () => {
      cancelled = true;
    };
  }, [active, authStatus, userId]);

  // Signed out: this browser must stop receiving the account's alerts.
  const prevAuth = useRef(authStatus);
  useEffect(() => {
    const was = prevAuth.current;
    prevAuth.current = authStatus;
    if (was === "signed-in" && authStatus === "signed-out") void unsubscribeBrowser();
  }, [authStatus]);

  // Keep the account's push rules equal to this browser's rules while closed-page alerts are on.
  useEffect(() => {
    if (status !== "on" || !userId) return;
    const t = setTimeout(() => {
      void getSupabase().then(async (sb) => {
        if (!sb) return;
        const ok = await syncPushRules(sb, userId, rulesRef.current);
        setError(ok ? null : "Could not save your rules for closed-page alerts. Try again later.");
      });
    }, SYNC_DELAY_MS);
    return () => clearTimeout(t);
  }, [status, userId, rules]);

  const enable = useCallback(async () => {
    if (!publicKey || !userId) return;
    setStatus("working");
    setError(null);
    const r = await subscribeBrowser(publicKey);
    if (!r.ok) {
      setStatus(r.reason === "denied" ? "denied" : "off");
      setError(
        r.reason === "denied"
          ? "Notifications are blocked for this site. Allow them in the browser's site settings."
          : r.reason === "no-worker"
            ? "This page has no service worker yet. Reload the page and try again."
            : "This browser could not subscribe to notifications.",
      );
      return;
    }
    const sb = await getSupabase();
    const saved = sb ? await saveSubscription(sb, userId, r.keys) : "failed";
    if (saved !== "saved") {
      await unsubscribeBrowser();
      setStatus("off");
      setError(
        saved === "full"
          ? "Your account already has 5 browsers with closed-page alerts. Switch one off first."
          : "Could not save this browser to your account. Try again later.",
      );
      return;
    }
    setStatus("on");
  }, [publicKey, userId]);

  const disable = useCallback(async () => {
    setStatus("working");
    setError(null);
    const keys = await currentSubscription();
    const sb = await getSupabase();
    if (sb && keys) {
      await deleteSubscription(sb, keys.endpoint);
      // With no browser left the rules have no use on the server. A failed read is not "none left": keep them.
      const { data, error } = await sb.from("push_subscriptions").select("endpoint").limit(1);
      if (!error && (data?.length ?? 0) === 0) await clearPushRules(sb);
    }
    await unsubscribeBrowser();
    setStatus("off");
  }, []);

  return { status, error, enable, disable };
}
