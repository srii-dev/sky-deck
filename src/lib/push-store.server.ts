import type { PushRuleRow, PushSubscriptionRow } from "./push-alerts";

/*
 * Database access for the scheduled push check (Phase 10f), over Supabase's REST API with the service role key.
 * That key bypasses row-level security, so it is used only here, on the server, inside the PushHub object, and is
 * never logged or sent to a browser. Each call is one outside request; the check spends at most three of them on
 * reads and a few on deleting subscriptions a push service said are gone.
 */

export interface PushStoreConfig {
  url: string;
  serviceKey: string;
}

type Fetch = typeof fetch;

const ROW_LIMIT = 2000;

function headers(c: PushStoreConfig): Record<string, string> {
  return { apikey: c.serviceKey, Authorization: `Bearer ${c.serviceKey}` };
}

async function getRows<T>(c: PushStoreConfig, path: string, f: Fetch): Promise<T[]> {
  const res = await f(`${c.url.replace(/\/$/, "")}/rest/v1/${path}`, { headers: headers(c) });
  if (!res.ok) throw new Error(`push store read failed (${res.status})`);
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data as T[]) : [];
}

/** Every saved browser, then the switched-on rules (oldest first, so the caps keep the same rules each time). */
export async function loadPushData(
  c: PushStoreConfig,
  f: Fetch = fetch,
): Promise<{ subs: PushSubscriptionRow[]; rules: PushRuleRow[] }> {
  const subs = await getRows<PushSubscriptionRow>(
    c,
    `push_subscriptions?select=user_id,endpoint,p256dh,auth&order=created_at.asc&limit=${ROW_LIMIT}`,
    f,
  );
  if (subs.length === 0) return { subs, rules: [] };
  const rules = await getRows<PushRuleRow>(
    c,
    `push_rules?select=user_id,rule_id,name,conditions&enabled=eq.true&order=updated_at.asc&limit=${ROW_LIMIT}`,
    f,
  );
  return { subs, rules };
}

/** Remove a browser the push service no longer knows (it answered 404 or 410). */
export async function deletePushSubscription(
  c: PushStoreConfig,
  userId: string,
  endpoint: string,
  f: Fetch = fetch,
): Promise<void> {
  const q = new URLSearchParams({ user_id: `eq.${userId}`, endpoint: `eq.${endpoint}` });
  const res = await f(`${c.url.replace(/\/$/, "")}/rest/v1/push_subscriptions?${q.toString()}`, {
    method: "DELETE",
    headers: headers(c),
  });
  if (!res.ok) throw new Error(`push store delete failed (${res.status})`);
}
