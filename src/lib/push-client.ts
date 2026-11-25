import type { SupabaseClient } from "@supabase/supabase-js";

import { isPushEligible, type AlertRule } from "./alert-rules";

/*
 * The browser side of closed-page alerts (Phase 10f). A signed-in visitor switches them on in the Alert rules
 * dialog: the browser asks for notification permission, subscribes with our VAPID public key, and saves the
 * subscription (push service address and the browser's two public keys) and copies of the rules that have an area
 * to their account. Row-level security limits every call to the visitor's own rows. Every function returns a
 * result instead of throwing; a failure leaves the in-page alerts working as before.
 */

export interface PushKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushRuleRow {
  rule_id: string;
  name: string;
  conditions: AlertRule["conditions"];
  enabled: boolean;
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function subscriptionKeys(sub: PushSubscription | null): PushKeys | null {
  if (!sub) return null;
  const j = sub.toJSON();
  const p256dh = j.keys?.["p256dh"];
  const auth = j.keys?.["auth"];
  if (!j.endpoint || !p256dh || !auth) return null;
  return { endpoint: j.endpoint, p256dh, auth };
}

/** The service worker's registration, or null when there is none (the dev server does not register one). */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  try {
    return (await navigator.serviceWorker.getRegistration()) ?? null;
  } catch {
    return null;
  }
}

/** This browser's current push subscription, if any. */
export async function currentSubscription(): Promise<PushKeys | null> {
  if (!pushSupported()) return null;
  const reg = await registration();
  if (!reg) return null;
  try {
    return subscriptionKeys(await reg.pushManager.getSubscription());
  } catch {
    return null;
  }
}

export type SubscribeResult =
  | { ok: true; keys: PushKeys }
  | { ok: false; reason: "unsupported" | "denied" | "no-worker" | "failed" };

/** Ask for permission (only from a click) and subscribe this browser. */
export async function subscribeBrowser(publicKey: string): Promise<SubscribeResult> {
  if (!pushSupported()) return { ok: false, reason: "unsupported" };
  const reg = await registration();
  if (!reg) return { ok: false, reason: "no-worker" };
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return { ok: false, reason: "denied" };
    const existing = await reg.pushManager.getSubscription();
    const sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(publicKey),
      }));
    const keys = subscriptionKeys(sub);
    return keys ? { ok: true, keys } : { ok: false, reason: "failed" };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/** Drop this browser's subscription; the push service then refuses pushes to it and the server deletes the row. */
export async function unsubscribeBrowser(): Promise<void> {
  const reg = pushSupported() ? await registration() : null;
  try {
    await (await reg?.pushManager.getSubscription())?.unsubscribe();
  } catch {
    /* nothing more to do */
  }
}

/** Whether the account has this browser saved. */
export async function isSubscriptionSaved(sb: SupabaseClient, endpoint: string): Promise<boolean> {
  try {
    const { data, error } = await sb
      .from("push_subscriptions")
      .select("endpoint")
      .eq("endpoint", endpoint)
      .limit(1);
    return !error && (data?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function saveSubscription(
  sb: SupabaseClient,
  userId: string,
  keys: PushKeys,
): Promise<"saved" | "full" | "failed"> {
  try {
    if (await isSubscriptionSaved(sb, keys.endpoint)) {
      // The keys can change when the browser renews the subscription under the same address.
      const { error } = await sb
        .from("push_subscriptions")
        .update({ p256dh: keys.p256dh, auth: keys.auth })
        .eq("endpoint", keys.endpoint);
      return error ? "failed" : "saved";
    }
    const { error } = await sb.from("push_subscriptions").insert({
      user_id: userId,
      endpoint: keys.endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    });
    // Row-level security refuses the sixth browser (code 42501).
    if (error) return error.code === "42501" ? "full" : "failed";
    return "saved";
  } catch {
    return "failed";
  }
}

export async function deleteSubscription(sb: SupabaseClient, endpoint: string): Promise<boolean> {
  try {
    const { error } = await sb.from("push_subscriptions").delete().eq("endpoint", endpoint);
    return !error;
  } catch {
    return false;
  }
}

/** The rows to keep for a set of rules: only rules with an area the closed-page check can watch. */
export function pushRuleRows(rules: readonly AlertRule[]): PushRuleRow[] {
  return rules
    .filter((r) => isPushEligible(r.conditions))
    .map((r) => ({ rule_id: r.id, name: r.name, conditions: r.conditions, enabled: r.enabled }));
}

/**
 * Make the account's push rules equal to this browser's eligible rules: delete the ones that are gone, update the
 * ones that exist, insert new ones. (An upsert would hit the 20-row insert limit even for existing rows.)
 */
export async function syncPushRules(
  sb: SupabaseClient,
  userId: string,
  rules: readonly AlertRule[],
): Promise<boolean> {
  try {
    const want = pushRuleRows(rules);
    const { data, error } = await sb.from("push_rules").select("rule_id");
    if (error) return false;
    const have = new Set((data ?? []).map((r: { rule_id: string }) => r.rule_id));
    const wantIds = new Set(want.map((r) => r.rule_id));
    const gone = [...have].filter((id) => !wantIds.has(id));
    if (gone.length > 0) {
      const d = await sb.from("push_rules").delete().in("rule_id", gone);
      if (d.error) return false;
    }
    const now = new Date().toISOString();
    for (const row of want.filter((r) => have.has(r.rule_id))) {
      const u = await sb
        .from("push_rules")
        .update({
          name: row.name,
          conditions: row.conditions,
          enabled: row.enabled,
          updated_at: now,
        })
        .eq("rule_id", row.rule_id);
      if (u.error) return false;
    }
    const fresh = want.filter((r) => !have.has(r.rule_id));
    if (fresh.length > 0) {
      const i = await sb.from("push_rules").insert(fresh.map((r) => ({ ...r, user_id: userId })));
      if (i.error) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Remove every push rule of the account (when the last browser switches closed-page alerts off). */
export async function clearPushRules(sb: SupabaseClient): Promise<boolean> {
  try {
    const { data, error } = await sb.from("push_rules").select("rule_id");
    if (error) return false;
    const ids = (data ?? []).map((r: { rule_id: string }) => r.rule_id);
    if (ids.length === 0) return true;
    const d = await sb.from("push_rules").delete().in("rule_id", ids);
    return !d.error;
  } catch {
    return false;
  }
}
