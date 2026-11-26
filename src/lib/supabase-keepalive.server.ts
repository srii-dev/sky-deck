/*
 * Supabase keep-alive (plan item 18f).
 *
 * A free Supabase project is paused after about a week without database activity. A Worker cron
 * trigger (vite.config.ts, `triggers.crons`) calls this once a day: one tiny REST read as the
 * anonymous role. Row-level security returns no rows, but Postgres still runs the query, which is
 * what counts as activity. Only the URL and the public anon key are used, read through
 * server-config.server.ts; nothing is written, and the log line names the status, never a key.
 */
import { requireConfig } from "./server-config.server";

type Env = Record<string, string | undefined>;
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Once a day at 04:17 UTC (off the hour, to avoid the busiest cron minute). Supabase pauses after 7 idle days. */
export const KEEPALIVE_CRON = "17 4 * * *";

/** The table read by the ping. Any RLS-protected table works; anon sees zero rows. */
export const KEEPALIVE_TABLE = "profiles";
export const KEEPALIVE_TIMEOUT_MS = 10_000;

export type KeepaliveResult =
  | { ok: true; status: number }
  | { ok: false; status?: number; reason: "not-configured" | "http-error" | "network-error" };

export function keepaliveUrl(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/${KEEPALIVE_TABLE}?select=id&limit=1`;
}

/** Runs the one keep-alive query. Never throws; the result says what happened. */
export async function pingSupabase(
  env: Env = process.env,
  fetchImpl: FetchLike = fetch,
): Promise<KeepaliveResult> {
  let config: { SUPABASE_URL: string; SUPABASE_ANON_KEY: string };
  try {
    config = requireConfig("supabase", env);
  } catch {
    return { ok: false, reason: "not-configured" };
  }
  const anon = config.SUPABASE_ANON_KEY;
  try {
    const response = await fetchImpl(keepaliveUrl(config.SUPABASE_URL), {
      headers: { apikey: anon, authorization: `Bearer ${anon}`, accept: "application/json" },
      signal: AbortSignal.timeout(KEEPALIVE_TIMEOUT_MS),
    });
    // Drain the (empty) body so the connection is released.
    await response.text().catch(() => "");
    return response.ok
      ? { ok: true, status: response.status }
      : { ok: false, status: response.status, reason: "http-error" };
  } catch {
    return { ok: false, reason: "network-error" };
  }
}

/** Merges the Worker's string bindings over process.env, so a cron run sees the same secrets as a request. */
export function envFromBindings(bindings: unknown, base: Env = process.env): Env {
  const env: Env = { ...base };
  if (bindings && typeof bindings === "object") {
    for (const [name, value] of Object.entries(bindings as Record<string, unknown>)) {
      if (typeof value === "string") env[name] = value;
    }
  }
  return env;
}

/** The cron job: one ping and one log line (status only). */
export async function runSupabaseKeepalive(bindings?: unknown, fetchImpl?: FetchLike) {
  const result = await pingSupabase(envFromBindings(bindings), fetchImpl);
  if (result.ok) console.log(`[keepalive] supabase ok (${result.status})`);
  else if (result.reason === "not-configured")
    console.log("[keepalive] supabase not configured, skipped");
  else
    console.error(
      `[keepalive] supabase failed: ${result.reason}${result.status ? ` (${result.status})` : ""}`,
    );
  return result;
}
